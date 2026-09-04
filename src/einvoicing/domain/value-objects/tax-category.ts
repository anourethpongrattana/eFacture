import { DomainError } from "../errors.js";

/**
 * Catégorie de TVA (BT-118 / BT-151), codes UNTDID 5305.
 * On expose un alias métier lisible en plus du code EN 16931.
 */
export type TaxCategoryCode =
  | "S" // Taux standard (couvre aussi les taux réduits/intermédiaires FR : le
  //       code EN 16931/UNTDID 5305 ne distingue pas les paliers de taux —
  //       seul `rate` varie (20 / 10 / 5.5 / 2.1). "AA" n'existe pas dans
  //       cette liste de codes (erreur fréquente à ne pas reproduire).
  | "Z" // Taux zéro
  | "E" // Exonéré de TVA
  | "AE" // Autoliquidation (reverse charge)
  | "K" // Livraison intracommunautaire de biens (exo art. 262 ter I)
  | "G" // Exportation hors UE (exo)
  | "O"; // Hors champ d'application de la TVA

export const TAX_CATEGORY_LABELS: Record<TaxCategoryCode, string> = {
  S: "TVA (taux normal ou réduit)",
  Z: "TVA au taux zéro",
  E: "Exonération de TVA",
  AE: "Autoliquidation",
  K: "Livraison intracommunautaire",
  G: "Exportation hors UE",
  O: "Hors champ de la TVA",
};

/**
 * Une catégorie de TVA appliquée à un taux donné. Immuable.
 * Sert de clé de regroupement pour la ventilation de TVA (BG-23).
 */
export class TaxCategory {
  readonly code: TaxCategoryCode;
  readonly rate: number;
  /** Motif d'exonération (obligatoire si le code implique une exo). */
  readonly exemptionReason?: string;
  /** Code de motif d'exonération (liste VATEX), optionnel. */
  readonly exemptionCode?: string;

  constructor(params: {
    code: TaxCategoryCode;
    rate: number;
    exemptionReason?: string;
    exemptionCode?: string;
  }) {
    if (params.rate < 0 || params.rate > 100)
      throw new DomainError(`Taux de TVA hors bornes: ${params.rate}`);

    const zeroRateExpected = params.code !== "S";
    if (zeroRateExpected && params.rate !== 0)
      throw new DomainError(
        `La catégorie ${params.code} impose un taux de 0 (reçu: ${params.rate})`,
      );
    if (!zeroRateExpected && params.rate === 0)
      throw new DomainError(
        `La catégorie ${params.code} impose un taux strictement positif`,
      );

    const needsReason =
      params.code === "E" ||
      params.code === "AE" ||
      params.code === "K" ||
      params.code === "G" ||
      params.code === "O";
    if (needsReason && !params.exemptionReason?.trim())
      throw new DomainError(
        `Motif d'exonération obligatoire pour la catégorie ${params.code}`,
      );

    this.code = params.code;
    this.rate = params.rate;
    this.exemptionReason = params.exemptionReason?.trim() || undefined;
    this.exemptionCode = params.exemptionCode?.trim() || undefined;
  }

  /** Clé de regroupement pour la ventilation TVA. */
  get key(): string {
    return `${this.code}:${this.rate}`;
  }

  get label(): string {
    return TAX_CATEGORY_LABELS[this.code];
  }
}
