import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GenerateEInvoiceUseCase } from "../../src/einvoicing/application/use-cases/generate-einvoice.use-case.js";
import { InvoiceValidationError } from "../../src/einvoicing/domain/errors.js";
import type {
  EInvoiceValidator,
  EInvoiceXmlSerializer,
  FacturxAssembler,
  InvoicePdfRenderer,
  RenderContext,
  ValidationReport,
} from "../../src/einvoicing/domain/ports/index.js";

const fakeXml: EInvoiceXmlSerializer = {
  syntax: "CII",
  async serialize(ctx: RenderContext) {
    return `<Invoice number="${ctx.invoice.number}"/>`;
  },
};

const fakeUbl: EInvoiceXmlSerializer = { ...fakeXml, syntax: "UBL" };

const fakePdf: InvoicePdfRenderer = {
  async render() {
    return new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
  },
};

const fakeAssembler: FacturxAssembler = {
  async assemble({ pdf }) {
    return pdf;
  },
};

function makeValidator(report: ValidationReport): EInvoiceValidator {
  return {
    async validateCiiXml() {
      return report;
    },
    async validateFacturxPdf() {
      return report;
    },
  };
}

const okReport: ValidationReport = { valid: true, xsdValid: true, errors: [] };

async function loadExample(name: string) {
  const raw = await readFile(resolve(process.cwd(), "examples", name), "utf-8");
  return JSON.parse(raw);
}

describe("GenerateEInvoiceUseCase", () => {
  it("génère un Factur-X (PDF) par défaut", async () => {
    const useCase = new GenerateEInvoiceUseCase({
      ciiSerializer: fakeXml,
      ublSerializer: fakeUbl,
      pdfRenderer: fakePdf,
      facturxAssembler: fakeAssembler,
      validator: makeValidator(okReport),
    });

    const input = await loadExample("invoice.minimal.json");
    const result = await useCase.execute(input);

    expect(result.format).toBe("facturx");
    expect(result.contentType).toBe("application/pdf");
    expect(result.fileName).toMatch(/\.pdf$/);
    expect(result.invoiceNumber).toBe("F-2026-0007");
    expect(result.validation).toBeUndefined();
  });

  it("génère du CII et déclenche la validation si demandé", async () => {
    const useCase = new GenerateEInvoiceUseCase({
      ciiSerializer: fakeXml,
      ublSerializer: fakeUbl,
      pdfRenderer: fakePdf,
      facturxAssembler: fakeAssembler,
      validator: makeValidator(okReport),
    });

    const input = await loadExample("invoice.minimal.json");
    const result = await useCase.execute(input, { format: "cii", validate: true });

    expect(result.contentType).toBe("application/xml");
    expect(result.validation?.valid).toBe(true);
  });

  it("rejette un JSON non conforme au schéma d'entrée", async () => {
    const useCase = new GenerateEInvoiceUseCase({
      ciiSerializer: fakeXml,
      ublSerializer: fakeUbl,
      pdfRenderer: fakePdf,
      facturxAssembler: fakeAssembler,
      validator: makeValidator(okReport),
    });

    await expect(useCase.execute({ invoiceNumber: "X" })).rejects.toBeInstanceOf(
      InvoiceValidationError,
    );
  });

  it("rejette une facture qui viole les mentions obligatoires FR (pas de date de livraison)", async () => {
    const useCase = new GenerateEInvoiceUseCase({
      ciiSerializer: fakeXml,
      ublSerializer: fakeUbl,
      pdfRenderer: fakePdf,
      facturxAssembler: fakeAssembler,
      validator: makeValidator(okReport),
    });

    const input = await loadExample("invoice.minimal.json");
    delete input.deliveryDate;

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(InvoiceValidationError);
  });
});
