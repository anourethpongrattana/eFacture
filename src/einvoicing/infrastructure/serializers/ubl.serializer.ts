import type {
  EInvoiceXmlSerializer,
  RenderContext,
} from "../../domain/ports/index.js";
import type { DocumentCharge, Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { Party } from "../../domain/value-objects/party.js";
import type { VatBreakdownLine } from "../../domain/value-objects/vat-breakdown.js";
import {
  CIUS_FR_CUSTOMIZATION_ID,
  ICD_SIRET,
} from "../../domain/value-objects/french-e-invoicing.js";

/**
 * Sérialiseur UBL 2.1 (OASIS) — profil CIUS-FR (EN 16931 + règles BR-FR).
 *
 * node-zugferd n'émet que du CII ; cet adaptateur construit un document UBL
 * `Invoice` dans l'ordre xs:sequence UBL 2.1.
 */
export class UblSerializer implements EInvoiceXmlSerializer {
  readonly syntax = "UBL" as const;

  async serialize(ctx: RenderContext): Promise<string> {
    const { invoice, totals } = ctx;
    const cur = invoice.currency;
    const amt = (n: string) => `currencyID="${cur}">${n}`;

    const header = [
      `  <cbc:CustomizationID>${CIUS_FR_CUSTOMIZATION_ID}</cbc:CustomizationID>`,
      `  <cbc:ProfileID>${esc(invoice.billingFramework)}</cbc:ProfileID>`,
      `  <cbc:ID>${esc(invoice.number)}</cbc:ID>`,
      `  <cbc:IssueDate>${isoDate(invoice.issueDate)}</cbc:IssueDate>`,
      invoice.paymentTerms.dueDate
        ? `  <cbc:DueDate>${isoDate(invoice.paymentTerms.dueDate)}</cbc:DueDate>`
        : "",
      `  <cbc:InvoiceTypeCode>${invoice.type}</cbc:InvoiceTypeCode>`,
      ...invoice.codedNotes().map(
        (n) => `  <cbc:Note>#${esc(n.subjectCode)}#${esc(n.content)}</cbc:Note>`,
      ),
      `  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`,
      invoice.buyerReference
        ? `  <cbc:BuyerReference>${esc(invoice.buyerReference)}</cbc:BuyerReference>`
        : "",
      invoice.purchaseOrderReference
        ? `  <cac:OrderReference><cbc:ID>${esc(invoice.purchaseOrderReference)}</cbc:ID></cac:OrderReference>`
        : "",
      invoice.precedingInvoiceReference
        ? billingReference(invoice.precedingInvoiceReference)
        : "",
      invoice.contractReference
        ? `  <cac:ContractDocumentReference><cbc:ID>${esc(invoice.contractReference)}</cbc:ID></cac:ContractDocumentReference>`
        : "",
      invoice.projectReference
        ? `  <cac:ProjectReference><cbc:ID>${esc(invoice.projectReference)}</cbc:ID></cac:ProjectReference>`
        : "",
      `  <cac:AccountingSupplierParty>${party(invoice.seller)}</cac:AccountingSupplierParty>`,
      `  <cac:AccountingCustomerParty>${party(invoice.buyer)}</cac:AccountingCustomerParty>`,
      delivery(invoice),
      paymentMeans(invoice),
      `  <cac:PaymentTerms><cbc:Note>${esc(invoice.paymentTerms.toLegalText())}</cbc:Note></cac:PaymentTerms>`,
      ...invoice.documentCharges.map((c) => documentAllowanceCharge(c, amt)),
      taxTotal(totals.taxTotal.toXmlString(), totals.vatBreakdown, amt),
      legalMonetaryTotal(totals, amt),
      ...invoice.lines.map((line) => invoiceLine(line, amt)),
    ].filter(Boolean);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
${header.join("\n")}
</Invoice>
`;
  }
}

function billingReference(ref: { number: string; issueDate?: Date }): string {
  return `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${esc(ref.number)}</cbc:ID>${
        ref.issueDate ? `\n      <cbc:IssueDate>${isoDate(ref.issueDate)}</cbc:IssueDate>` : ""
      }
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
}

function delivery(invoice: Invoice): string {
  if (!invoice.deliveryDate && !invoice.shipToName) return "";
  const partyName = invoice.shipToName
    ? `\n    <cac:DeliveryParty><cac:PartyName><cbc:Name>${esc(invoice.shipToName)}</cbc:Name></cac:PartyName></cac:DeliveryParty>`
    : "";
  const date = invoice.deliveryDate
    ? `\n    <cbc:ActualDeliveryDate>${isoDate(invoice.deliveryDate)}</cbc:ActualDeliveryDate>`
    : "";
  return `  <cac:Delivery>${date}${partyName}
  </cac:Delivery>`;
}

function paymentMeans(invoice: Invoice): string {
  const pt = invoice.paymentTerms;
  const account = pt.iban
    ? `\n    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(pt.iban)}</cbc:ID>${
        pt.accountHolder ? `\n      <cbc:Name>${esc(pt.accountHolder)}</cbc:Name>` : ""
      }${
        pt.bic
          ? `\n      <cac:FinancialInstitutionBranch><cbc:ID>${esc(pt.bic)}</cbc:ID></cac:FinancialInstitutionBranch>`
          : ""
      }
    </cac:PayeeFinancialAccount>`
    : "";
  return `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${pt.meansCode}</cbc:PaymentMeansCode>${account}
  </cac:PaymentMeans>`;
}

function documentAllowanceCharge(
  c: DocumentCharge,
  amt: (n: string) => string,
): string {
  const tax = c.taxCategory;
  return `  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>${c.isCharge}</cbc:ChargeIndicator>${
      c.reasonCode ? `\n    <cbc:AllowanceChargeReasonCode>${esc(c.reasonCode)}</cbc:AllowanceChargeReasonCode>` : ""
    }
    <cbc:AllowanceChargeReason>${esc(c.reason)}</cbc:AllowanceChargeReason>
    <cbc:Amount ${amt(c.amount.toXmlString())}</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID>${tax.code}</cbc:ID>
      <cbc:Percent>${tax.rate}</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>`;
}

function taxTotal(
  taxAmount: string,
  breakdown: VatBreakdownLine[],
  amt: (n: string) => string,
): string {
  const subtotals = breakdown
    .map(
      (v) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount ${amt(v.taxableAmount.toXmlString())}</cbc:TaxableAmount>
      <cbc:TaxAmount ${amt(v.taxAmount.toXmlString())}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${v.categoryCode}</cbc:ID>
        <cbc:Percent>${v.rate}</cbc:Percent>${exemption(v.exemptionCode, v.exemptionReason)}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join("\n");
  return `  <cac:TaxTotal>
    <cbc:TaxAmount ${amt(taxAmount)}</cbc:TaxAmount>
${subtotals}
  </cac:TaxTotal>`;
}

function legalMonetaryTotal(
  totals: RenderContext["totals"],
  amt: (n: string) => string,
): string {
  return `  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount ${amt(totals.lineTotal.toXmlString())}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount ${amt(totals.taxBasisTotal.toXmlString())}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount ${amt(totals.grandTotal.toXmlString())}</cbc:TaxInclusiveAmount>${
      totals.allowanceTotal.isZero()
        ? ""
        : `\n    <cbc:AllowanceTotalAmount ${amt(totals.allowanceTotal.toXmlString())}</cbc:AllowanceTotalAmount>`
    }${
      totals.chargeTotal.isZero()
        ? ""
        : `\n    <cbc:ChargeTotalAmount ${amt(totals.chargeTotal.toXmlString())}</cbc:ChargeTotalAmount>`
    }${
      totals.paidAmount.isZero()
        ? ""
        : `\n    <cbc:PrepaidAmount ${amt(totals.paidAmount.toXmlString())}</cbc:PrepaidAmount>`
    }
    <cbc:PayableAmount ${amt(totals.duePayable.toXmlString())}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}

function invoiceLine(line: InvoiceLine, amt: (n: string) => string): string {
  const net = line.netAmount.toXmlString();
  const tax = line.taxCategory;
  const lineAllowance = line.discountAmount
    ? `\n    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>Remise ligne</cbc:AllowanceChargeReason>
      <cbc:Amount ${amt(line.discountAmount.toXmlString())}</cbc:Amount>
    </cac:AllowanceCharge>`
    : "";
  const details = line.details
    ? `\n      <cbc:Description>${esc(line.details)}</cbc:Description>`
    : "";
  const sellerId = line.sellerAssignedId
    ? `\n      <cac:SellersItemIdentification><cbc:ID>${esc(line.sellerAssignedId)}</cbc:ID></cac:SellersItemIdentification>`
    : "";
  return `  <cac:InvoiceLine>
    <cbc:ID>${esc(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(line.unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount ${amt(net)}</cbc:LineExtensionAmount>${lineAllowance}
    <cac:Item>${details}
      <cbc:Name>${esc(line.description)}</cbc:Name>${sellerId}
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${tax.code}</cbc:ID>
        <cbc:Percent>${tax.rate}</cbc:Percent>${exemption(tax.exemptionCode, tax.exemptionReason)}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount ${amt(line.unitPrice.toXmlString())}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="${esc(line.unitCode)}">1</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>`;
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
    }${
      p.siret
        ? `\n      <cac:PartyIdentification><cbc:ID schemeID="${ICD_SIRET}">${esc(
            p.siret,
          )}</cbc:ID></cac:PartyIdentification>`
        : ""
    }
      <cac:PartyName><cbc:Name>${esc(p.tradingName ?? p.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(a.line1)}</cbc:StreetName>${
          a.line2 ? `\n        <cbc:AdditionalStreetName>${esc(a.line2)}</cbc:AdditionalStreetName>` : ""
        }
        <cbc:CityName>${esc(a.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(a.postalCode)}</cbc:PostalZone>${
          a.countrySubdivision
            ? `\n        <cbc:CountrySubentity>${esc(a.countrySubdivision)}</cbc:CountrySubentity>`
            : ""
        }
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
        }${
          p.legalInfo
            ? `\n        <cbc:CompanyLegalForm>${esc(p.legalInfo)}</cbc:CompanyLegalForm>`
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

function exemption(code?: string, reason?: string): string {
  const bits: string[] = [];
  if (code) bits.push(`\n        <cbc:TaxExemptionReasonCode>${esc(code)}</cbc:TaxExemptionReasonCode>`);
  if (reason) bits.push(`\n        <cbc:TaxExemptionReason>${esc(reason)}</cbc:TaxExemptionReason>`);
  return bits.join("");
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
