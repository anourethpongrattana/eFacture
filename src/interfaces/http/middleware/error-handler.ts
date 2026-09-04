import type { NextFunction, Request, Response } from "express";

import {
  DomainError,
  InvoiceValidationError,
} from "../../../einvoicing/index.js";

/** Convertit les erreurs métier en réponses HTTP propres. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof InvoiceValidationError) {
    res.status(422).json({
      error: "invoice_validation_error",
      message: "La facture fournie n'est pas conforme",
      issues: err.issues,
    });
    return;
  }
  if (err instanceof DomainError) {
    res.status(400).json({ error: "domain_error", message: err.message });
    return;
  }

  // eslint-disable-next-line no-console
  console.error("[einvoicing] erreur non gérée:", err);
  res.status(500).json({
    error: "internal_error",
    message: err instanceof Error ? err.message : "Erreur interne",
  });
}
