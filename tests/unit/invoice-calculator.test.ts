import { describe, expect, it } from "vitest";

import { InvoiceLine } from "../../src/einvoicing/domain/entities/invoice-line.js";
import { Invoice } from "../../src/einvoicing/domain/entities/invoice.js";
import { calculateTotals } from "../../src/einvoicing/domain/services/invoice-calculator.js";
import { Address } from "../../src/einvoicing/domain/value-objects/address.js";
import { Money } from "../../src/einvoicing/domain/value-objects/money.js";
import { Party } from "../../src/einvoicing/domain/value-objects/party.js";
import { PaymentTerms } from "../../src/einvoicing/domain/value-objects/payment-terms.js";
import { TaxCategory } from "../../src/einvoicing/domain/value-objects/tax-category.js";

function buildParty(name: string): Party {
  return new Party({
    name,
    siret: "90123456700018",
    vatNumber: "FR32901234567",
    address: new Address({
      line1: "1 rue Test",
      city: "Paris",
      postalCode: "75001",
      countryCode: "FR",
    }),
  });
}

function buildInvoice(lines: InvoiceLine[], extra: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    number: "F-1",
    issueDate: new Date("2026-09-04T00:00:00.000Z"),
    currency: "EUR",
    seller: buildParty("Vendeur"),
    buyer: buildParty("Acheteur"),
    lines,
    deliveryDate: new Date("2026-09-01T00:00:00.000Z"),
    paymentTerms: new PaymentTerms({
      meansCode: "58",
      dueDate: new Date("2026-10-01T00:00:00.000Z"),
      latePenaltyRate: 12,
      recoveryIndemnity: 40,
    }),
    ...extra,
  });
}

describe("calculateTotals", () => {
  it("calcule un total simple à taux unique", () => {
    const line = new InvoiceLine({
      id: "1",
      description: "Prestation",
      quantity: 3,
      unitCode: "C62",
      unitPrice: Money.of(100, "EUR"),
      taxCategory: new TaxCategory({ code: "S", rate: 20 }),
    });
    const invoice = buildInvoice([line]);
    const totals = calculateTotals(invoice);

    expect(totals.lineTotal.amount).toBe(300);
    expect(totals.taxBasisTotal.amount).toBe(300);
    expect(totals.taxTotal.amount).toBe(60);
    expect(totals.grandTotal.amount).toBe(360);
    expect(totals.duePayable.amount).toBe(360);
    expect(totals.vatBreakdown).toHaveLength(1);
    expect(totals.vatBreakdown[0]?.categoryCode).toBe("S");
  });

  it("ventile la TVA par taux et regroupe les mêmes catégories", () => {
    const l1 = new InvoiceLine({
      id: "1",
      description: "A",
      quantity: 1,
      unitCode: "C62",
      unitPrice: Money.of(1000, "EUR"),
      taxCategory: new TaxCategory({ code: "S", rate: 20 }),
    });
    const l2 = new InvoiceLine({
      id: "2",
      description: "B",
      quantity: 2,
      unitCode: "C62",
      unitPrice: Money.of(100, "EUR"),
      taxCategory: new TaxCategory({ code: "S", rate: 20 }),
    });
    const l3 = new InvoiceLine({
      id: "3",
      description: "C (taux réduit)",
      quantity: 1,
      unitCode: "C62",
      unitPrice: Money.of(500, "EUR"),
      taxCategory: new TaxCategory({ code: "S", rate: 10 }),
    });
    const totals = calculateTotals(buildInvoice([l1, l2, l3]));

    expect(totals.vatBreakdown).toHaveLength(2);
    const std = totals.vatBreakdown.find((v) => v.rate === 20);
    const reduced = totals.vatBreakdown.find((v) => v.rate === 10);
    expect(std?.taxableAmount.amount).toBe(1200); // 1000 + 2×100
    expect(std?.taxAmount.amount).toBe(240);
    expect(reduced?.taxableAmount.amount).toBe(500);
    expect(reduced?.taxAmount.amount).toBe(50);
    expect(totals.taxBasisTotal.amount).toBe(1700);
    expect(totals.taxTotal.amount).toBe(290);
    expect(totals.grandTotal.amount).toBe(1990);
  });

  it("applique remises et frais au niveau document dans la base imposable", () => {
    const line = new InvoiceLine({
      id: "1",
      description: "Prestation",
      quantity: 1,
      unitCode: "C62",
      unitPrice: Money.of(1000, "EUR"),
      taxCategory: new TaxCategory({ code: "S", rate: 20 }),
    });
    const totals = calculateTotals(
      buildInvoice([line], {
        documentCharges: [
          {
            isCharge: false,
            amount: Money.of(100, "EUR"),
            reason: "Remise",
            taxCategory: new TaxCategory({ code: "S", rate: 20 }),
          },
          {
            isCharge: true,
            amount: Money.of(50, "EUR"),
            reason: "Frais",
            taxCategory: new TaxCategory({ code: "S", rate: 20 }),
          },
        ],
      }),
    );

    // base = 1000 (ligne) - 100 (remise) + 50 (frais) = 950
    expect(totals.taxBasisTotal.amount).toBe(950);
    expect(totals.taxTotal.amount).toBe(190);
    expect(totals.allowanceTotal.amount).toBe(100);
    expect(totals.chargeTotal.amount).toBe(50);
  });

  it("gère les lignes exonérées (taux zéro)", () => {
    const line = new InvoiceLine({
      id: "1",
      description: "Export",
      quantity: 1,
      unitCode: "C62",
      unitPrice: Money.of(1000, "EUR"),
      taxCategory: new TaxCategory({
        code: "G",
        rate: 0,
        exemptionReason: "Export hors UE — art. 262 I du CGI",
      }),
    });
    const totals = calculateTotals(buildInvoice([line]));

    expect(totals.taxTotal.amount).toBe(0);
    expect(totals.grandTotal.amount).toBe(1000);
    expect(totals.vatBreakdown[0]?.exemptionReason).toContain("Export");
  });

  it("déduit l'acompte du net à payer", () => {
    const line = new InvoiceLine({
      id: "1",
      description: "Prestation",
      quantity: 1,
      unitCode: "C62",
      unitPrice: Money.of(1000, "EUR"),
      taxCategory: new TaxCategory({ code: "S", rate: 20 }),
    });
    const totals = calculateTotals(
      buildInvoice([line], { prepaidAmount: Money.of(500, "EUR") }),
    );
    expect(totals.grandTotal.amount).toBe(1200);
    expect(totals.paidAmount.amount).toBe(500);
    expect(totals.duePayable.amount).toBe(700);
  });
});
