import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { generateEInvoiceInputSchema } from "../../src/einvoicing/application/dto/generate-einvoice-input.js";
import { mapInputToInvoice } from "../../src/einvoicing/application/mappers/input-to-invoice.mapper.js";
import { calculateTotals } from "../../src/einvoicing/domain/services/invoice-calculator.js";

async function loadExample(name: string) {
  const raw = await readFile(
    resolve(process.cwd(), "examples", name),
    "utf-8",
  );
  return generateEInvoiceInputSchema.parse(JSON.parse(raw));
}

describe("mapInputToInvoice", () => {
  it("mappe l'exemple minimal en agrégat de domaine valide", async () => {
    const input = await loadExample("invoice.minimal.json");
    const invoice = mapInputToInvoice(input);

    expect(invoice.number).toBe("F-2026-0007");
    expect(invoice.seller.siret).toBe("90123456700018");
    expect(invoice.seller.siren).toBe("901234567");
    expect(invoice.lines).toHaveLength(1);
    expect(() => invoice.assertFrenchComplianceOrThrow()).not.toThrow();

    const totals = calculateTotals(invoice);
    expect(totals.grandTotal.amount).toBe(2880); // 2400 + 20%
  });

  it("mappe l'exemple complet (multi-taux, remise, exonération, acompte)", async () => {
    const input = await loadExample("invoice.full.json");
    const invoice = mapInputToInvoice(input);

    expect(invoice.lines).toHaveLength(3);
    expect(invoice.documentCharges).toHaveLength(2);
    expect(() => invoice.assertFrenchComplianceOrThrow()).not.toThrow();

    const totals = calculateTotals(invoice);
    // Ligne 1: 40j × 950 - 2000 remise = 36000 HT (taux 20)
    // Ligne 2: 5 × 320 = 1600 HT (taux 10)
    // Ligne 3: 1800 HT (taux 0, export)
    // + remise doc 500 (taux 20) - frais doc 150 (taux 20)... remise réduit, frais augmente
    const std = totals.vatBreakdown.find((v) => v.rate === 20);
    const reduced = totals.vatBreakdown.find((v) => v.rate === 10);
    const zero = totals.vatBreakdown.find((v) => v.rate === 0);

    expect(std?.taxableAmount.amount).toBe(36000 - 500 + 150);
    expect(reduced?.taxableAmount.amount).toBe(1600);
    expect(zero?.taxableAmount.amount).toBe(1800);
    expect(totals.duePayable.amount).toBe(
      Math.round((totals.grandTotal.amount - 5000) * 100) / 100,
    );
  });

  it("rejette un JSON qui ne respecte pas le schéma", () => {
    const result = generateEInvoiceInputSchema.safeParse({ invoiceNumber: "X" });
    expect(result.success).toBe(false);
  });
});
