import type { Money } from "./money.js";
import type { TaxCategoryCode } from "./tax-category.js";

/** Une ligne de la ventilation de TVA (BG-23). */
export interface VatBreakdownLine {
  categoryCode: TaxCategoryCode;
  /** Taux en % (BT-119). */
  rate: number;
  /** Base d'imposition pour cette catégorie/taux (BT-116). */
  taxableAmount: Money;
  /** Montant de TVA correspondant (BT-117). */
  taxAmount: Money;
  /** Motif d'exonération (BT-120), si applicable. */
  exemptionReason?: string;
  /** Code de motif d'exonération (BT-121), si applicable. */
  exemptionCode?: string;
}

/** Totaux de la facture (BG-22). */
export interface InvoiceTotals {
  /** Somme des montants nets de lignes (BT-106). */
  lineTotal: Money;
  /** Total des remises au niveau document (BT-107). */
  allowanceTotal: Money;
  /** Total des frais au niveau document (BT-108). */
  chargeTotal: Money;
  /** Total HT = lignes − remises + frais (BT-109). */
  taxBasisTotal: Money;
  /** Total de la TVA (BT-110). */
  taxTotal: Money;
  /** Total TTC (BT-112). */
  grandTotal: Money;
  /** Acompte déjà versé (BT-113). */
  paidAmount: Money;
  /** Net à payer (BT-115). */
  duePayable: Money;
  /** Ventilation de TVA par catégorie/taux. */
  vatBreakdown: VatBreakdownLine[];
}
