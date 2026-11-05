import { z } from "zod";

import { calculateTotals } from "../../domain/services/invoice-calculator.js";
import { InvoiceValidationError } from "../../domain/errors.js";
import type {
  EInvoiceFormat,
  EInvoiceValidator,
  EInvoiceXmlSerializer,
  FacturxAssembler,
  InvoicePdfRenderer,
  RenderContext,
  ValidationReport,
} from "../../domain/ports/index.js";
import {
  generateEInvoiceInputSchema,
  type GenerateEInvoiceInput,
} from "../dto/generate-einvoice-input.js";
import { mapInputToInvoice } from "../mappers/input-to-invoice.mapper.js";

export interface GenerateEInvoiceOptions {
  format?: EInvoiceFormat;
  /** Force la validation XSD + Schematron du livrable produit. */
  validate?: boolean;
}

export interface GenerateEInvoiceResult {
  format: EInvoiceFormat;
  fileName: string;
  contentType: string;
  content: Uint8Array;
  /** Numéro de facture, pour information. */
  invoiceNumber: string;
  validation?: ValidationReport;
}

export interface GenerateEInvoiceDeps {
  ciiSerializer: EInvoiceXmlSerializer;
  ublSerializer: EInvoiceXmlSerializer;
  pdfRenderer: InvoicePdfRenderer;
  facturxAssembler: FacturxAssembler;
  validator: EInvoiceValidator;
  defaults?: { validate?: boolean };
}

const utf8 = new TextEncoder();

/**
 * Cas d'usage central : « un JSON entre, une facture électronique sort ».
 * Orchestration : validation d'entrée → domaine → calcul → sérialisation → (validation).
 */
export class GenerateEInvoiceUseCase {
  constructor(private readonly deps: GenerateEInvoiceDeps) {}

  async execute(
    rawInput: unknown,
    options: GenerateEInvoiceOptions = {},
  ): Promise<GenerateEInvoiceResult> {
    const format = options.format ?? "facturx";
    const shouldValidate = options.validate ?? this.deps.defaults?.validate ?? false;

    const input = this.parseInput(rawInput);
    const invoice = mapInputToInvoice(input);
    invoice.assertFrenchComplianceOrThrow();

    const totals = calculateTotals(invoice);
    this.assertTotalsConsistency(totals);
    const ctx: RenderContext = { invoice, totals };

    const slug = invoice.number.replace(/[^A-Za-z0-9._-]+/g, "_");

    switch (format) {
      case "cii": {
        const xml = await this.deps.ciiSerializer.serialize(ctx);
        return this.finish(
          format,
          `${slug}.cii.xml`,
          "application/xml",
          utf8.encode(xml),
          invoice.number,
          shouldValidate ? await this.deps.validator.validateCiiXml(xml) : undefined,
        );
      }
      case "ubl": {
        const xml = await this.deps.ublSerializer.serialize(ctx);
        return this.finish(
          format,
          `${slug}.ubl.xml`,
          "application/xml",
          utf8.encode(xml),
          invoice.number,
          shouldValidate ? await this.deps.validator.validateUblXml(xml) : undefined,
        );
      }
      case "facturx": {
        const pdf = await this.deps.pdfRenderer.render(ctx);
        const facturx = await this.deps.facturxAssembler.assemble({ pdf, ctx });
        return this.finish(
          format,
          `${slug}.pdf`,
          "application/pdf",
          facturx,
          invoice.number,
          shouldValidate
            ? await this.deps.validator.validateFacturxPdf(facturx)
            : undefined,
        );
      }
      default: {
        const _exhaustive: never = format;
        throw new Error(`Format non supporté: ${_exhaustive as string}`);
      }
    }
  }

  private parseInput(raw: unknown): GenerateEInvoiceInput {
    const parsed = generateEInvoiceInputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvoiceValidationError(
        parsed.error.issues.map((i: z.ZodIssue) => ({
          path: i.path.join("."),
          code: "SCHEMA",
          message: i.message,
        })),
        "JSON d'entrée invalide",
      );
    }
    return parsed.data;
  }

  /** Garde-fou : cohérence interne des totaux avant sérialisation (BR-CO-*). */
  private assertTotalsConsistency(totals: ReturnType<typeof calculateTotals>): void {
    const recomputedBasis = totals.vatBreakdown.reduce(
      (s, v) => s + v.taxableAmount.amount,
      0,
    );
    if (Math.abs(recomputedBasis - totals.taxBasisTotal.amount) > 0.01) {
      throw new InvoiceValidationError(
        [
          {
            code: "BR-CO-13",
            message: `Incohérence base HT: ${recomputedBasis} ≠ ${totals.taxBasisTotal.amount}`,
          },
        ],
        "Calcul des totaux incohérent",
      );
    }
  }

  private finish(
    format: EInvoiceFormat,
    fileName: string,
    contentType: string,
    content: Uint8Array,
    invoiceNumber: string,
    validation?: ValidationReport,
  ): GenerateEInvoiceResult {
    return { format, fileName, contentType, content, invoiceNumber, validation };
  }
}
