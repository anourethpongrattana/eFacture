import type { Invoice } from "../entities/invoice.js";
import { Money } from "../value-objects/money.js";
import type {
  InvoiceTotals,
  VatBreakdownLine,
} from "../value-objects/vat-breakdown.js";

/**
 * Calcule la ventilation de TVA et les totaux d'une facture selon les règles
 * EN 16931 (BR-CO-*). C'est le **point de calcul unique** : le XML et le PDF
 * doivent tous deux s'appuyer sur ce résultat.
 *
 * Règle d'arrondi : la TVA est calculée sur la base totale par catégorie/taux
 * (et non par ligne), puis arrondie à 2 décimales (BR-CO-17).
 */
export function calculateTotals(invoice: Invoice): InvoiceTotals {
  const currency = invoice.currency;
  const zero = Money.zero(currency);

  // 1. Total des lignes (BT-106).
  const lineTotal = invoice.lines.reduce((sum, l) => sum.add(l.netAmount), zero);

  // 2. Remises / frais au niveau document (BT-107 / BT-108).
  let allowanceTotal = zero;
  let chargeTotal = zero;
  for (const c of invoice.documentCharges) {
    if (c.isCharge) chargeTotal = chargeTotal.add(c.amount);
    else allowanceTotal = allowanceTotal.add(c.amount);
  }

  // 3. Base par catégorie/taux : lignes + frais − remises.
  const basisByKey = new Map<string, { line: VatBreakdownLine; base: number }>();
  const ensure = (key: string, seed: () => VatBreakdownLine) => {
    let entry = basisByKey.get(key);
    if (!entry) {
      entry = { line: seed(), base: 0 };
      basisByKey.set(key, entry);
    }
    return entry;
  };

  for (const l of invoice.lines) {
    const tc = l.taxCategory;
    const entry = ensure(tc.key, () => ({
      categoryCode: tc.code,
      rate: tc.rate,
      taxableAmount: zero,
      taxAmount: zero,
      exemptionReason: tc.exemptionReason,
      exemptionCode: tc.exemptionCode,
    }));
    entry.base += l.netAmount.amount;
  }
  for (const c of invoice.documentCharges) {
    const tc = c.taxCategory;
    const entry = ensure(tc.key, () => ({
      categoryCode: tc.code,
      rate: tc.rate,
      taxableAmount: zero,
      taxAmount: zero,
      exemptionReason: tc.exemptionReason,
      exemptionCode: tc.exemptionCode,
    }));
    entry.base += c.isCharge ? c.amount.amount : -c.amount.amount;
  }

  // 4. Finalise chaque ligne de ventilation (BG-23).
  const vatBreakdown: VatBreakdownLine[] = [...basisByKey.values()]
    .map(({ line, base }) => {
      const taxableAmount = Money.of(base, currency);
      return {
        ...line,
        taxableAmount,
        taxAmount: taxableAmount.percentage(line.rate),
      };
    })
    .sort((a, b) => b.rate - a.rate || a.categoryCode.localeCompare(b.categoryCode));

  // 5. Totaux (BT-109/110/112/115).
  const taxBasisTotal = vatBreakdown.reduce((s, v) => s.add(v.taxableAmount), zero);
  const taxTotal = vatBreakdown.reduce((s, v) => s.add(v.taxAmount), zero);
  const grandTotal = taxBasisTotal.add(taxTotal);
  const paidAmount = invoice.prepaidAmount;
  const duePayable = grandTotal.subtract(paidAmount);

  return {
    lineTotal,
    allowanceTotal,
    chargeTotal,
    taxBasisTotal,
    taxTotal,
    grandTotal,
    paidAmount,
    duePayable,
    vatBreakdown,
  };
}
