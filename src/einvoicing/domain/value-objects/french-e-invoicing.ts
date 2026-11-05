/**
 * Codes du profil français CIUS-FR (XP Z12-012 / règles BR-FR).
 * Le CustomizationID UBL reste `urn:cen.eu:en16931:2017` : c'est l'identifiant
 * officiel du profil EN 16931 « CIUS pour la France ».
 */

/** Cadre de facturation (BT-23), obligatoire en CIUS-FR. */
export const BILLING_FRAMEWORKS = [
  "B1",
  "S1",
  "M1",
  "B2",
  "S2",
  "M2",
  "S3",
  "B4",
  "S4",
  "M4",
  "S5",
  "S6",
  "B7",
  "S7",
  "B8",
  "S8",
  "M8",
  "B9",
  "S9",
  "M9",
] as const;

export type BillingFramework = (typeof BILLING_FRAMEWORKS)[number];

/** Traitement attendu (note BAR, BT-21/BT-22). */
export const BAR_TREATMENTS = [
  "B2B",
  "B2BINT",
  "B2C",
  "B2CINT",
  "OUTOFSCOPE",
  "ARCHIVEONLY",
] as const;

export type BarTreatment = (typeof BAR_TREATMENTS)[number];

/** Note de facture avec code sujet (BG-1 / BT-21). */
export interface CodedNote {
  subjectCode: string;
  content: string;
}

/** EAS SIREN — adresse électronique de routage PA (BT-34 / BT-49). */
export const EAS_SIREN = "0225";
/** ICD SIRENE — identifiant légal (BT-30 / BT-47). */
export const ICD_SIRENE = "0002";
/** ICD SIRET établissement (BT-29 / BT-46). */
export const ICD_SIRET = "0009";

export const CIUS_FR_CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017";

/** BR-FR-01 / BR-FR-02 : 1–35 caractères, A-Z a-z 0-9 - + _ / */
export const FR_INVOICE_NUMBER_RE = /^[A-Za-z0-9+\-_/]{1,35}$/;

export const DEFAULT_BILLING_FRAMEWORK: BillingFramework = "S1";
export const DEFAULT_BAR_TREATMENT: BarTreatment = "B2B";
