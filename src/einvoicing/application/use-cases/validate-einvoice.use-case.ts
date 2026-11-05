import type {
  EInvoiceFormat,
  EInvoiceValidator,
  ValidationReport,
} from "../../domain/ports/index.js";

export interface ValidateEInvoiceInput {
  format: EInvoiceFormat;
  content: Uint8Array;
}

/** Valide un livrable e-invoice déjà produit (CII, UBL ou PDF Factur-X). */
export class ValidateEInvoiceUseCase {
  constructor(private readonly validator: EInvoiceValidator) {}

  async execute(input: ValidateEInvoiceInput): Promise<ValidationReport> {
    switch (input.format) {
      case "cii":
        return this.validator.validateCiiXml(
          new TextDecoder("utf-8").decode(input.content),
        );
      case "facturx":
        return this.validator.validateFacturxPdf(input.content);
      case "ubl":
        return this.validator.validateUblXml(
          new TextDecoder("utf-8").decode(input.content),
        );
      default: {
        const _exhaustive: never = input.format;
        throw new Error(`Format non supporté: ${_exhaustive as string}`);
      }
    }
  }
}
