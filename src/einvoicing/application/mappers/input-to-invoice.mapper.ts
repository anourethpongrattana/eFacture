import { Invoice, type DocumentCharge } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { Address } from "../../domain/value-objects/address.js";
import { Money } from "../../domain/value-objects/money.js";
import { Party, type PartyProps } from "../../domain/value-objects/party.js";
import { PaymentTerms } from "../../domain/value-objects/payment-terms.js";
import { TaxCategory } from "../../domain/value-objects/tax-category.js";
import type { GenerateEInvoiceInput } from "../dto/generate-einvoice-input.js";

/** Convertit le JSON validé en agrégat de domaine. */
export function mapInputToInvoice(input: GenerateEInvoiceInput): Invoice {
  const currency = input.currency;
  const money = (n: number) => Money.of(n, currency);

  const seller = mapParty(input.seller);
  const buyer = mapParty(input.buyer);

  const lines = input.lines.map(
    (l, idx) =>
      new InvoiceLine({
        id: l.id?.trim() || String(idx + 1),
        description: l.description,
        details: l.details,
        quantity: l.quantity,
        unitCode: l.unit,
        unitPrice: money(l.unitPrice),
        taxCategory: mapTax(l.tax),
        discountAmount:
          l.discount && l.discount > 0 ? money(l.discount) : undefined,
        sellerAssignedId: l.sellerAssignedId,
      }),
  );

  const documentCharges: DocumentCharge[] = (input.documentCharges ?? []).map(
    (c) => ({
      isCharge: c.type === "charge",
      amount: money(c.amount),
      reason: c.reason,
      reasonCode: c.reasonCode,
      taxCategory: mapTax(c.tax),
    }),
  );

  const paymentTerms = new PaymentTerms({
    meansCode: input.payment.means,
    iban: input.payment.iban,
    bic: input.payment.bic,
    accountHolder: input.payment.accountHolder ?? input.seller.name,
    dueDate: parseDate(input.dueDate),
    latePenaltyRate: input.payment.latePenaltyRate,
    recoveryIndemnity: input.payment.recoveryIndemnity,
    discountTerms: input.payment.discountTerms,
    note: input.payment.note,
  });

  return new Invoice({
    number: input.invoiceNumber,
    type: input.type,
    issueDate: parseDate(input.issueDate)!,
    currency,
    seller,
    buyer,
    buyerReference: input.buyerReference,
    lines,
    paymentTerms,
    deliveryDate: parseDate(input.deliveryDate),
    shipToName: input.shipToName,
    purchaseOrderReference: input.purchaseOrderReference,
    contractReference: input.contractReference,
    projectReference: input.projectReference,
    precedingInvoiceReference: input.precedingInvoice
      ? {
          number: input.precedingInvoice.number,
          issueDate: parseDate(input.precedingInvoice.issueDate),
        }
      : undefined,
    prepaidAmount:
      input.prepaidAmount && input.prepaidAmount > 0
        ? money(input.prepaidAmount)
        : undefined,
    documentCharges,
    notes: input.notes,
  });
}

function mapParty(p: GenerateEInvoiceInput["seller"]): Party {
  const props: PartyProps = {
    name: p.name,
    tradingName: p.tradingName,
    legalInfo: p.legalInfo,
    address: new Address(p.address),
    siren: p.siren,
    siret: p.siret,
    vatNumber: p.vatNumber,
    contact: p.contact,
    electronicAddress: p.electronicAddress,
  };
  return new Party(props);
}

function mapTax(t: GenerateEInvoiceInput["lines"][number]["tax"]): TaxCategory {
  return new TaxCategory({
    code: t.category,
    rate: t.rate,
    exemptionReason: t.exemptionReason,
    exemptionCode: t.exemptionCode,
  });
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  // Force minuit UTC pour éviter les décalages de fuseau sur une date pure.
  const iso = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
