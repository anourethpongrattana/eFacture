import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { Party } from "../../domain/value-objects/party.js";
import type { RenderContext } from "../../domain/ports/index.js";
import type { VatBreakdownLine } from "../../domain/value-objects/vat-breakdown.js";
import type { ZugferdInvoiceData } from "./zugferd-invoicer.js";

/** ICD SIRENE (identifiant légal des entreprises françaises). */
const ICD_SIRENE = "0002";

/**
 * Traduit l'agrégat de domaine en objet de données node-zugferd (profil EN 16931).
 * Aucune logique de calcul ici : on consomme `ctx.totals` tel quel.
 */
export function mapInvoiceToZugferd(ctx: RenderContext): ZugferdInvoiceData {
  const { invoice, totals } = ctx;
  const currency = invoice.currency;

  const notes = invoice.codedNotes();
  if (invoice.precedingInvoiceReference) {
    notes.push({
      subjectCode: "AAI",
      content:
        `Avoir se rapportant à la facture ${invoice.precedingInvoiceReference.number}` +
        (invoice.precedingInvoiceReference.issueDate
          ? ` du ${invoice.precedingInvoiceReference.issueDate.toLocaleDateString("fr-FR")}`
          : ""),
    });
  }

  const data = {
    number: invoice.number,
    typeCode: invoice.type,
    issueDate: invoice.issueDate,
    ...(notes.length > 0
      ? {
          includedNote: notes.map((n) => ({
            content: n.content,
            subjectCode: n.subjectCode,
          })),
        }
      : {}),
    transaction: {
      line: invoice.lines.map((line) => mapLine(line)),
      tradeAgreement: {
        ...(invoice.buyerReference ? { buyerReference: invoice.buyerReference } : {}),
        seller: mapSeller(invoice.seller),
        buyer: mapBuyer(invoice.buyer),
        ...(invoice.purchaseOrderReference
          ? { associatedOrder: { purchaseOrderReference: invoice.purchaseOrderReference } }
          : {}),
        ...(invoice.contractReference
          ? { associatedContract: { reference: invoice.contractReference } }
          : {}),
        ...(invoice.projectReference
          ? {
              project: {
                reference: invoice.projectReference,
                name: invoice.projectReference,
              },
            }
          : {}),
      },
      ...(invoice.deliveryDate
        ? { tradeDelivery: { information: { deliveryDate: invoice.deliveryDate } } }
        : {}),
      tradeSettlement: {
        currencyCode: currency,
        ...mapPaymentInstruction(invoice),
        vatBreakdown: totals.vatBreakdown.map((v) => mapVatBreakdown(v)),
        ...mapDocumentCharges(invoice),
        paymentTerms: {
          description: invoice.paymentTerms.toLegalText(),
          ...(invoice.paymentTerms.dueDate
            ? { dueDate: invoice.paymentTerms.dueDate }
            : {}),
        },
        monetarySummation: {
          lineTotalAmount: totals.lineTotal.toXmlString(),
          ...(totals.chargeTotal.isZero()
            ? {}
            : { chargeTotalAmount: totals.chargeTotal.toXmlString() }),
          ...(totals.allowanceTotal.isZero()
            ? {}
            : { allowanceTotalAmount: totals.allowanceTotal.toXmlString() }),
          taxBasisTotalAmount: totals.taxBasisTotal.toXmlString(),
          taxTotal: {
            currencyCode: currency,
            amount: totals.taxTotal.toXmlString(),
          },
          grandTotalAmount: totals.grandTotal.toXmlString(),
          ...(totals.paidAmount.isZero()
            ? {}
            : { paidAmount: totals.paidAmount.toXmlString() }),
          duePayableAmount: totals.duePayable.toXmlString(),
        },
        ...(invoice.precedingInvoiceReference
          ? {
              precendingInvoices: [
                {
                  reference: invoice.precedingInvoiceReference.number,
                  ...(invoice.precedingInvoiceReference.issueDate
                    ? { issueDate: invoice.precedingInvoiceReference.issueDate }
                    : {}),
                },
              ],
            }
          : {}),
      },
    },
  };

  return data as unknown as ZugferdInvoiceData;
}

function mapLine(line: InvoiceLine) {
  const isTaxable = line.taxCategory.rate > 0;
  return {
    identifier: line.id,
    tradeProduct: {
      name: line.description,
      ...(line.details ? { description: line.details } : {}),
      ...(line.sellerAssignedId ? { sellerAssignedID: line.sellerAssignedId } : {}),
    },
    tradeAgreement: {
      netTradePrice: {
        chargeAmount: line.unitPrice.toXmlString(),
        basisQuantity: { amount: "1", unitMeasureCode: line.unitCode },
      },
    },
    tradeDelivery: {
      billedQuantity: {
        amount: String(line.quantity),
        unitMeasureCode: line.unitCode,
      },
    },
    tradeSettlement: {
      tradeTax: {
        typeCode: "VAT",
        categoryCode: line.taxCategory.code,
        rateApplicablePercent: isTaxable ? String(line.taxCategory.rate) : "0",
      },
      // NB : on n'émet pas BG-27 (remise ligne) en tant que
      // SpecifiedTradeAllowanceCharge : node-zugferd@0.1.0 omet le xpath du
      // champ additionalXml "chargeIndicator" pour ce groupe (bug amont), ce
      // qui produit un fragment XML invalide au sens du XSD. La remise reste
      // pleinement reflétée dans lineTotalAmount (BT-131), seul champ dont
      // dépendent les totaux et la ventilation de TVA.
      monetarySummation: { lineTotalAmount: line.netAmount.toXmlString() },
    },
  };
}

function mapSeller(seller: Party) {
  return {
    name: seller.name,
    ...(seller.legalInfo ? { description: seller.legalInfo } : {}),
    ...(seller.siren
      ? {
          organization: {
            registrationIdentifier: {
              value: seller.siren,
              schemeIdentifier: ICD_SIRENE,
            },
            ...(seller.tradingName ? { tradingName: seller.tradingName } : {}),
          },
        }
      : {}),
    ...(seller.contact
      ? {
          tradeContact: {
            ...(seller.contact.name ? { name: seller.contact.name } : {}),
            ...(seller.contact.phone ? { phoneNumber: seller.contact.phone } : {}),
            ...(seller.contact.email ? { emailAddress: seller.contact.email } : {}),
          },
        }
      : {}),
    postalAddress: mapAddress(seller),
    ...(seller.electronicAddress
      ? {
          electronicAddress: {
            value: seller.electronicAddress.value,
            schemeIdentifier: seller.electronicAddress.scheme,
          },
        }
      : {}),
    ...(seller.vatNumber
      ? { taxRegistration: { vatIdentifier: seller.vatNumber } }
      : {}),
  };
}

function mapBuyer(buyer: Party) {
  return {
    ...(buyer.siret || buyer.siren
      ? { identifier: buyer.siret ?? buyer.siren }
      : {}),
    name: buyer.name,
    ...(buyer.siren
      ? {
          organization: {
            registrationIdentifier: {
              value: buyer.siren,
              schemeIdentifier: ICD_SIRENE,
            },
            ...(buyer.tradingName ? { tradingName: buyer.tradingName } : {}),
          },
        }
      : {}),
    ...(buyer.contact
      ? {
          tradeContact: {
            ...(buyer.contact.name ? { name: buyer.contact.name } : {}),
            ...(buyer.contact.phone ? { phoneNumber: buyer.contact.phone } : {}),
            ...(buyer.contact.email ? { emailAddress: buyer.contact.email } : {}),
          },
        }
      : {}),
    postalAddress: mapAddress(buyer),
    ...(buyer.electronicAddress
      ? {
          electronicAddress: {
            value: buyer.electronicAddress.value,
            schemeIdentifier: buyer.electronicAddress.scheme,
          },
        }
      : {}),
    ...(buyer.vatNumber
      ? { taxRegistration: { vatIdentifier: buyer.vatNumber } }
      : {}),
  };
}

function mapAddress(party: Party) {
  const a = party.address;
  return {
    postCode: a.postalCode,
    line1: a.line1,
    ...(a.line2 ? { line2: a.line2 } : {}),
    city: a.city,
    countryCode: a.countryCode,
    ...(a.countrySubdivision ? { countrySubdivision: a.countrySubdivision } : {}),
  };
}

function mapVatBreakdown(v: VatBreakdownLine) {
  const taxable = v.rate > 0;
  return {
    calculatedAmount: v.taxAmount.toXmlString(),
    typeCode: "VAT",
    basisAmount: v.taxableAmount.toXmlString(),
    categoryCode: v.categoryCode,
    rateApplicablePercent: taxable ? String(v.rate) : "0",
    ...(v.exemptionReason ? { exemptionReasonText: v.exemptionReason } : {}),
    ...(v.exemptionCode ? { exemptionReasonCode: v.exemptionCode } : {}),
  };
}

function mapDocumentCharges(invoice: Invoice) {
  const allowances = invoice.documentCharges
    .filter((c) => !c.isCharge)
    .map((c) => ({
      chargeIndicator: false,
      actualAmount: c.amount.toXmlString(),
      reason: c.reason,
      ...(c.reasonCode ? { reasonCode: c.reasonCode } : {}),
      categoryTradeTax: {
        typeCode: "VAT",
        categoryCode: c.taxCategory.code,
        vatRate: c.taxCategory.rate > 0 ? String(c.taxCategory.rate) : "0",
      },
    }));
  const charges = invoice.documentCharges
    .filter((c) => c.isCharge)
    .map((c) => ({
      chargeIndicator: true,
      actualAmount: c.amount.toXmlString(),
      reason: c.reason,
      ...(c.reasonCode ? { reasonCode: c.reasonCode } : {}),
      categoryTradeTax: {
        typeCode: "VAT",
        categoryCode: c.taxCategory.code,
        vatRate: c.taxCategory.rate > 0 ? String(c.taxCategory.rate) : "0",
      },
    }));
  return {
    ...(allowances.length > 0 ? { allowances } : {}),
    ...(charges.length > 0 ? { charges } : {}),
  };
}

function mapPaymentInstruction(invoice: Invoice) {
  const pt = invoice.paymentTerms;
  return {
    paymentInstruction: {
      typeCode: pt.meansCode,
      ...(pt.iban
        ? {
            transfers: [
              {
                paymentAccountIdentifier: pt.iban,
                ...(pt.accountHolder ? { accountName: pt.accountHolder } : {}),
              },
            ],
          }
        : {}),
    },
  };
}
