import {
  GenerateEInvoiceUseCase,
  type GenerateEInvoiceOptions,
  type GenerateEInvoiceResult,
} from "../application/use-cases/generate-einvoice.use-case.js";
import {
  ValidateEInvoiceUseCase,
  type ValidateEInvoiceInput,
} from "../application/use-cases/validate-einvoice.use-case.js";
import type { ValidationReport } from "../domain/ports/index.js";
import { PdfKitInvoiceRenderer } from "../infrastructure/pdf/pdfkit-invoice.renderer.js";
import { ZugferdCiiSerializer } from "../infrastructure/serializers/zugferd-cii.serializer.js";
import { UblSerializer } from "../infrastructure/serializers/ubl.serializer.js";
import { ZugferdFacturxAssembler } from "../infrastructure/facturx/zugferd-facturx.assembler.js";
import { FacturxValidator } from "../infrastructure/validation/facturx.validator.js";

export interface EInvoicingConfig {
  /** Valider systématiquement le livrable produit (XSD + Schematron EN 16931). */
  validateByDefault?: boolean;
}

export interface EInvoicingModule {
  generateEInvoice(
    input: unknown,
    options?: GenerateEInvoiceOptions,
  ): Promise<GenerateEInvoiceResult>;
  validateEInvoice(input: ValidateEInvoiceInput): Promise<ValidationReport>;
}

/**
 * Composition root du module e-invoicing : instancie les adaptateurs et les
 * injecte dans les cas d'usage. C'est le seul endroit qui connaît les libs
 * concrètes (node-zugferd, pdfkit, @stafyniaksacha/facturx).
 */
export function createEInvoicingModule(
  config: EInvoicingConfig = {},
): EInvoicingModule {
  const validator = new FacturxValidator();

  const generate = new GenerateEInvoiceUseCase({
    ciiSerializer: new ZugferdCiiSerializer(),
    ublSerializer: new UblSerializer(),
    pdfRenderer: new PdfKitInvoiceRenderer(),
    facturxAssembler: new ZugferdFacturxAssembler(),
    validator,
    defaults: { validate: config.validateByDefault ?? false },
  });

  const validate = new ValidateEInvoiceUseCase(validator);

  return {
    generateEInvoice: (input, options) => generate.execute(input, options),
    validateEInvoice: (input) => validate.execute(input),
  };
}
