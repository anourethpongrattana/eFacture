/** Erreur métier générique (règle du domaine violée). */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export interface ValidationIssue {
  /** Chemin logique du champ concerné (ex. "lines[2].vatRate"). */
  path?: string;
  /** Code stable (ex. "BR-FR-01", règle EN 16931, ou code interne). */
  code?: string;
  message: string;
}

/**
 * Le document fourni n'est pas une facture valide : liste des non-conformités
 * détectées avant même toute sérialisation (contrôles métier / mentions FR).
 */
export class InvoiceValidationError extends DomainError {
  constructor(
    public readonly issues: ValidationIssue[],
    message = "Facture non conforme",
  ) {
    super(`${message}: ${issues.map((i) => i.message).join("; ")}`);
    this.name = "InvoiceValidationError";
  }
}
