import type { Invoice } from "../entities/invoice.js";
import type { InvoiceTotals } from "../value-objects/vat-breakdown.js";

/** Syntaxe XML structurée cible. */
export type EInvoiceSyntax = "CII" | "UBL";

/** Format de sortie livrable. */
export type EInvoiceFormat = "facturx" | "cii" | "ubl";

export interface RenderContext {
  invoice: Invoice;
  totals: InvoiceTotals;
}

/** Sérialise une facture en XML structuré (CII ou UBL). */
export interface EInvoiceXmlSerializer {
  readonly syntax: EInvoiceSyntax;
  serialize(ctx: RenderContext): Promise<string>;
}

/** Produit un PDF lisible par un humain à partir de la facture. */
export interface InvoicePdfRenderer {
  render(ctx: RenderContext): Promise<Uint8Array>;
}

/**
 * Assemble un Factur-X : PDF lisible + XML CII embarqué → PDF/A-3b conforme.
 */
export interface FacturxAssembler {
  assemble(params: {
    pdf: Uint8Array;
    ctx: RenderContext;
  }): Promise<Uint8Array>;
}

export interface ValidationIssueReport {
  rule?: string;
  message: string;
  location?: string;
  severity: "fatal" | "error" | "warning";
}

export interface ValidationReport {
  valid: boolean;
  /** Syntaxe / profil détecté (ex. "facturx:en16931"). */
  profile?: string;
  xsdValid: boolean;
  schematronValid?: boolean;
  errors: ValidationIssueReport[];
  /** Renseigné quand la validation n'a pas pu être exécutée. */
  skippedReason?: string;
}

/** Valide un livrable e-invoice (XSD + règles métier EN 16931). */
export interface EInvoiceValidator {
  validateCiiXml(xml: string): Promise<ValidationReport>;
  validateFacturxPdf(pdf: Uint8Array): Promise<ValidationReport>;
  validateUblXml(xml: string): Promise<ValidationReport>;
}
