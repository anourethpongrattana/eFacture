/**
 * API publique du module e-invoicing.
 *
 * Intégration dans un projet existant :
 *   import { createEInvoicingModule } from "./einvoicing";
 *   const einvoicing = createEInvoicingModule({ validateByDefault: false });
 *   const { content, fileName } = await einvoicing.generateEInvoice(payloadJson, { format: "facturx" });
 *
 * Ou monter le routeur Express prêt à l'emploi :
 *   import { createEInvoicingRouter } from "./interfaces/http/routes/einvoicing.routes";
 *   app.use("/api/v1/einvoices", createEInvoicingRouter(einvoicing));
 */

export {
  createEInvoicingModule,
  type EInvoicingConfig,
  type EInvoicingModule,
} from "./config/container.js";

export {
  generateEInvoiceInputSchema,
  type GenerateEInvoiceInput,
  type GenerateEInvoiceInputRaw,
} from "./application/dto/generate-einvoice-input.js";

export type {
  GenerateEInvoiceOptions,
  GenerateEInvoiceResult,
} from "./application/use-cases/generate-einvoice.use-case.js";
export type { ValidateEInvoiceInput } from "./application/use-cases/validate-einvoice.use-case.js";

export type {
  EInvoiceFormat,
  EInvoiceSyntax,
  ValidationReport,
  ValidationIssueReport,
} from "./domain/ports/index.js";

export {
  DomainError,
  InvoiceValidationError,
  type ValidationIssue,
} from "./domain/errors.js";
