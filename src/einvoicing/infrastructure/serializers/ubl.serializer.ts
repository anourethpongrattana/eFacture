import type {
  EInvoiceXmlSerializer,
  RenderContext,
} from "../../domain/ports/index.js";
import type { Party } from "../../domain/value-objects/party.js";
import type { VatBreakdownLine } from "../../domain/value-objects/vat-breakdown.js";

/**
 * Sérialiseur UBL 2.1 (OASIS) — sous-ensemble EN 16931.
 *
 * node-zugferd n'émet que du CII ; cet adaptateur construit à la main un
 * document UBL `Invoice` couvrant les BT/BG essentiels. Périmètre POC :
 * génération uniquement (pas de validation schematron UBL embarquée).
 */
export class UblSerializer implements EInvoiceXmlSerializer {
  readonly syntax = "UBL" as const;

  async serialize(ctx: RenderContext): Promise<string> {
    const { invoice, totals } = ctx;
    const cur = invoice.currency;
    const amount = (n: string, c = cur) =>
      `currencyID="${c}">${n}`;

    const lines = invoice.lines
      .map((line) => {
        const net = line.netAmount.toXmlString();
        return `  <cac:InvoiceLine>
    <cbc:ID>${esc(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(line.unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount ${amount(net)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(line.description)}</cbc:Name>${
        line.details ? `\n      <cbc:Description>${esc(line.details)}</cbc:Description>` : ""
      }
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${line.taxCategory.code}</cbc:ID>
        <cbc:Percent>${line.taxCategory.rate}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount ${amount(line.unitPrice.toXmlString())}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
      })
      .join("\n");

    const taxSubtotals = totals.vatBreakdown
      .map(
        (v: VatBreakdownLine) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount ${amount(v.taxableAmount.toXmlString())}</cbc:TaxableAmount>
      <cbc:TaxAmount ${amount(v.taxAmount.toXmlString())}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${v.categoryCode}</cbc:ID>
        <cbc:Percent>${v.rate}</cbc:Percent>${
          v.exemptionReason
            ? `\n        <cbc:TaxExemptionReason>${esc(v.exemptionReason)}</cbc:TaxExemptionReason>`
            : ""
        }
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(invoice.number)}</cbc:ID>
  <cbc:IssueDate>${isoDate(invoice.issueDate)}</cbc:IssueDate>${
    invoice.paymentTerms.dueDate
      ? `\n  <cbc:DueDate>${isoDate(invoice.paymentTerms.dueDate)}</cbc:DueDate>`
      : ""
  }
  <cbc:InvoiceTypeCode>${invoice.type}</cbc:InvoiceTypeCode>${
    invoice.notes.map((n) => `\n  <cbc:Note>${esc(n)}</cbc:Note>`).join("")
  }
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>${
    invoice.buyerReference
      ? `\n  <cbc:BuyerReference>${esc(invoice.buyerReference)}</cbc:BuyerReference>`
      : ""
  }${
    invoice.purchaseOrderReference
      ? `\n  <cac:OrderReference><cbc:ID>${esc(invoice.purchaseOrderReference)}</cbc:ID></cac:OrderReference>`
      : ""
  }${
    invoice.deliveryDate
      ? `\n  <cac:Delivery><cbc:ActualDeliveryDate>${isoDate(invoice.deliveryDate)}</cbc:ActualDeliveryDate></cac:Delivery>`
      : ""
  }
  <cac:AccountingSupplierParty>${party(invoice.seller)}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${party(invoice.buyer)}</cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${invoice.paymentTerms.meansCode}</cbc:PaymentMeansCode>${
      invoice.paymentTerms.iban
        ? `\n    <cac:PayeeFinancialAccount><cbc:ID>${esc(invoice.paymentTerms.iban)}</cbc:ID></cac:PayeeFinancialAccount>`
        : ""
    }
  </cac:PaymentMeans>
  <cac:PaymentTerms><cbc:Note>${esc(invoice.paymentTerms.toLegalText())}</cbc:Note></cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount ${amount(totals.taxTotal.toXmlString())}</cbc:TaxAmount>
${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount ${amount(totals.lineTotal.toXmlString())}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount ${amount(totals.taxBasisTotal.toXmlString())}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount ${amount(totals.grandTotal.toXmlString())}</cbc:TaxInclusiveAmount>${
      totals.allowanceTotal.isZero()
        ? ""
        : `\n    <cbc:AllowanceTotalAmount ${amount(totals.allowanceTotal.toXmlString())}</cbc:AllowanceTotalAmount>`
    }${
      totals.chargeTotal.isZero()
        ? ""
        : `\n    <cbc:ChargeTotalAmount ${amount(totals.chargeTotal.toXmlString())}</cbc:ChargeTotalAmount>`
    }${
      totals.paidAmount.isZero()
        ? ""
        : `\n    <cbc:PrepaidAmount ${amount(totals.paidAmount.toXmlString())}</cbc:PrepaidAmount>`
    }
    <cbc:PayableAmount ${amount(totals.duePayable.toXmlString())}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>
`;
  }
}

function party(p: Party): string {
  const a = p.address;
  return `
    <cac:Party>${
      p.electronicAddress
        ? `\n      <cbc:EndpointID schemeID="${esc(p.electronicAddress.scheme)}">${esc(
            p.electronicAddress.value,
          )}</cbc:EndpointID>`
        : ""
    }
      <cac:PartyName><cbc:Name>${esc(p.tradingName ?? p.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(a.line1)}</cbc:StreetName>${
          a.line2 ? `\n        <cbc:AdditionalStreetName>${esc(a.line2)}</cbc:AdditionalStreetName>` : ""
        }
        <cbc:CityName>${esc(a.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(a.postalCode)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${a.countryCode}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${
        p.vatNumber
          ? `\n      <cac:PartyTaxScheme><cbc:CompanyID>${esc(
              p.vatNumber,
            )}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
          : ""
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>${
          p.siren
            ? `\n        <cbc:CompanyID schemeID="0002">${esc(p.siren)}</cbc:CompanyID>`
            : ""
        }
      </cac:PartyLegalEntity>${
        p.contact
          ? `\n      <cac:Contact>${
              p.contact.name ? `<cbc:Name>${esc(p.contact.name)}</cbc:Name>` : ""
            }${p.contact.phone ? `<cbc:Telephone>${esc(p.contact.phone)}</cbc:Telephone>` : ""}${
              p.contact.email ? `<cbc:ElectronicMail>${esc(p.contact.email)}</cbc:ElectronicMail>` : ""
            }</cac:Contact>`
          : ""
      }
    </cac:Party>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
