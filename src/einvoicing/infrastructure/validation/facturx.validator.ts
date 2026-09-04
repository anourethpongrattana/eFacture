import { Buffer } from "node:buffer";

import { check, extract } from "@stafyniaksacha/facturx";

import type {
  EInvoiceValidator,
  ValidationIssueReport,
  ValidationReport,
} from "../../domain/ports/index.js";

/**
 * Validation via `@stafyniaksacha/facturx` : XSD (structure) + Schematron
 * (règles métier EN 16931 BR-*). 100 % WebAssembly — aucune JVM requise.
 */
export class FacturxValidator implements EInvoiceValidator {
  async validateCiiXml(xml: string): Promise<ValidationReport> {
    return this.runCheck(xml);
  }

  async validateFacturxPdf(pdf: Uint8Array): Promise<ValidationReport> {
    let xml: string;
    try {
      const extracted = await extract({ pdf: Buffer.from(pdf) });
      xml = extracted.xml;
    } catch (err) {
      return {
        valid: false,
        xsdValid: false,
        errors: [
          {
            severity: "fatal",
            message: `Impossible d'extraire le XML du PDF Factur-X: ${asMessage(err)}`,
          },
        ],
      };
    }
    return this.runCheck(xml);
  }

  private async runCheck(xml: string): Promise<ValidationReport> {
    try {
      const result = await check({ xml, flavor: "facturx", schematron: true });
      const errors: ValidationIssueReport[] = [
        ...(result.errors ?? []).map((e: unknown) => ({
          severity: "error" as const,
          message: asMessage(e),
        })),
        ...(result.schematronErrors ?? []).map((e) => ({
          severity: (e.flag === "warning" ? "warning" : "error") as
            | "warning"
            | "error",
          rule: e.id,
          message: e.message,
          location: e.location,
        })),
      ];
      return {
        valid: result.valid && result.schematronValid !== false,
        profile: `${result.flavor}:${result.level}`,
        xsdValid: result.valid,
        schematronValid: result.schematronValid,
        errors,
      };
    } catch (err) {
      return {
        valid: false,
        xsdValid: false,
        errors: [{ severity: "fatal", message: asMessage(err) }],
      };
    }
  }
}

function asMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return JSON.stringify(err);
}
