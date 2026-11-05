import { DomainError } from "../errors.js";

/** Moyen de paiement (BT-81), codes UNTDID 4461. */
export type PaymentMeansCode =
  | "10" // Espèces
  | "20" // Chèque
  | "30" // Virement
  | "42" // Virement bancaire (compte à compte)
  | "48" // Carte bancaire
  | "58" // Virement SEPA
  | "59" // Prélèvement SEPA
  | "97"; // Compensation / netting

export const PAYMENT_MEANS_LABELS: Record<PaymentMeansCode, string> = {
  "10": "Espèces",
  "20": "Chèque",
  "30": "Virement",
  "42": "Virement bancaire",
  "48": "Carte bancaire",
  "58": "Virement SEPA",
  "59": "Prélèvement SEPA",
  "97": "Compensation",
};

export interface PaymentTermsProps {
  meansCode: PaymentMeansCode;
  /** IBAN du bénéficiaire (pour un virement). */
  iban?: string;
  bic?: string;
  /** Titulaire du compte. */
  accountHolder?: string;
  dueDate?: Date;
  /**
   * Taux des pénalités de retard (mention obligatoire, art. L441-10 C. com.).
   * En % annuel. Par défaut : 3× le taux d'intérêt légal.
   */
  latePenaltyRate: number;
  /**
   * Indemnité forfaitaire pour frais de recouvrement (art. D441-5 C. com.).
   * Montant légal : 40 €.
   */
  recoveryIndemnity: number;
  /** Conditions d'escompte (mention obligatoire, même si "néant"). */
  discountTerms?: string;
  /** Texte libre additionnel sur les conditions de règlement. */
  note?: string;
}

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;

/** Conditions de règlement + mentions légales françaises associées (BT-20). */
export class PaymentTerms {
  readonly meansCode: PaymentMeansCode;
  readonly iban?: string;
  readonly bic?: string;
  readonly accountHolder?: string;
  readonly dueDate?: Date;
  readonly latePenaltyRate: number;
  readonly recoveryIndemnity: number;
  readonly discountTerms: string;
  readonly note?: string;

  constructor(props: PaymentTermsProps) {
    if (props.iban && !IBAN_RE.test(props.iban.replace(/\s/g, "")))
      throw new DomainError(`IBAN invalide: ${props.iban}`);
    if (props.latePenaltyRate < 0)
      throw new DomainError("Taux de pénalités de retard négatif");
    if (props.recoveryIndemnity < 0)
      throw new DomainError("Indemnité de recouvrement négative");

    this.meansCode = props.meansCode;
    this.iban = props.iban?.replace(/\s/g, "");
    this.bic = props.bic;
    this.accountHolder = props.accountHolder?.trim() || undefined;
    this.dueDate = props.dueDate;
    this.latePenaltyRate = props.latePenaltyRate;
    this.recoveryIndemnity = props.recoveryIndemnity;
    this.discountTerms =
      props.discountTerms?.trim() ||
      "Escompte pour paiement anticipé : néant.";
    this.note = props.note?.trim() || undefined;
  }

  get meansLabel(): string {
    return PAYMENT_MEANS_LABELS[this.meansCode];
  }

  /** Mention pénalités de retard (note PMD, BR-FR-05). */
  latePenaltyNote(): string {
    return `En cas de retard de paiement : pénalités au taux de ${formatRate(
      this.latePenaltyRate,
    )} % par an (art. L441-10 du Code de commerce).`;
  }

  /** Mention indemnité forfaitaire de recouvrement (note PMT, BR-FR-05). */
  recoveryIndemnityNote(): string {
    return `Indemnité forfaitaire pour frais de recouvrement de ${this.recoveryIndemnity.toFixed(
      2,
    )} € (art. D441-5 du Code de commerce).`;
  }

  /** Mention escompte ou néant (note AAB, BR-FR-05). */
  discountNote(): string {
    return this.discountTerms;
  }

  /**
   * Bloc de texte des conditions de règlement, destiné à BT-20 et au PDF.
   * Regroupe les mentions légales obligatoires côté vendeur français.
   */
  toLegalText(locale = "fr-FR"): string {
    const parts: string[] = [];
    if (this.dueDate) {
      parts.push(
        `Paiement à réception, échéance le ${this.dueDate.toLocaleDateString(locale)}.`,
      );
    }
    parts.push(
      `En cas de retard de paiement : pénalités au taux de ${formatRate(
        this.latePenaltyRate,
      )} % par an et indemnité forfaitaire pour frais de recouvrement de ${this.recoveryIndemnity.toFixed(
        2,
      )} € (art. L441-10 et D441-5 du Code de commerce).`,
    );
    parts.push(this.discountTerms);
    if (this.note) parts.push(this.note);
    return parts.join(" ");
  }
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
}
