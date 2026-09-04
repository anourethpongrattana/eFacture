import PDFDocument from "pdfkit";

import type { Invoice } from "../../domain/entities/invoice.js";
import type {
  InvoicePdfRenderer,
  RenderContext,
} from "../../domain/ports/index.js";
import { TAX_CATEGORY_LABELS } from "../../domain/value-objects/tax-category.js";
import type { InvoiceTotals } from "../../domain/value-objects/vat-breakdown.js";

const PAGE_MARGIN = 50;
const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const TYPE_LABELS: Record<string, string> = {
  "380": "FACTURE",
  "381": "AVOIR",
  "384": "FACTURE RECTIFICATIVE",
  "386": "FACTURE D'ACOMPTE",
  "389": "FACTURE (AUTOFACTURATION)",
};

/**
 * Rend une facture lisible (le "volet lisible" du Factur-X) avec l'ensemble des
 * mentions obligatoires françaises. Les montants proviennent de `ctx.totals`
 * (point de calcul unique partagé avec le XML).
 */
export class PdfKitInvoiceRenderer implements InvoicePdfRenderer {
  async render(ctx: RenderContext): Promise<Uint8Array> {
    const { invoice, totals } = ctx;
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      info: {
        Title: `Facture ${invoice.number}`,
        Author: invoice.seller.name,
        Subject: `Facture ${invoice.number}`,
      },
    });

    const chunks: Buffer[] = [];
    const done = new Promise<Uint8Array>((resolve, reject) => {
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on("error", reject);
    });

    this.header(doc, invoice);
    this.parties(doc, invoice);
    this.references(doc, invoice);
    this.linesTable(doc, ctx);
    this.totalsBlock(doc, totals);
    this.vatBreakdownTable(doc, totals);
    this.paymentBlock(doc, invoice);
    this.legalFooter(doc, invoice);

    doc.end();
    return done;
  }

  private header(doc: PDFKit.PDFDocument, invoice: Invoice): void {
    doc
      .font(FONT_BOLD)
      .fontSize(20)
      .text(TYPE_LABELS[invoice.type] ?? "FACTURE", { align: "right" })
      .font(FONT)
      .fontSize(10)
      .text(`N° ${invoice.number}`, { align: "right" })
      .text(`Date d'émission : ${fmtDate(invoice.issueDate)}`, { align: "right" });
    if (invoice.deliveryDate) {
      doc.text(`Date de livraison / exécution : ${fmtDate(invoice.deliveryDate)}`, {
        align: "right",
      });
    }
    doc.moveDown(1);
  }

  private parties(doc: PDFKit.PDFDocument, invoice: Invoice): void {
    const top = doc.y;
    const colWidth = (doc.page.width - PAGE_MARGIN * 2 - 20) / 2;

    this.partyBox(doc, "VENDEUR", invoice.seller, PAGE_MARGIN, top, colWidth);
    this.partyBox(
      doc,
      "CLIENT",
      invoice.buyer,
      PAGE_MARGIN + colWidth + 20,
      top,
      colWidth,
    );

    doc.x = PAGE_MARGIN;
    doc.y = Math.max(doc.y, top) + 10;
    doc.moveDown(0.5);
  }

  private partyBox(
    doc: PDFKit.PDFDocument,
    title: string,
    party: Invoice["seller"],
    x: number,
    y: number,
    width: number,
  ): void {
    doc.font(FONT_BOLD).fontSize(9).text(title, x, y, { width });
    doc.font(FONT).fontSize(9);
    const lines = [
      party.tradingName && party.tradingName !== party.name
        ? `${party.name} (${party.tradingName})`
        : party.name,
      party.legalInfo,
      party.address.line1,
      party.address.line2,
      `${party.address.postalCode} ${party.address.city} — ${party.address.countryCode}`,
      party.siret ? `SIRET : ${party.siret}` : party.siren ? `SIREN : ${party.siren}` : undefined,
      party.vatNumber ? `TVA intracom. : ${party.vatNumber}` : undefined,
      party.contact?.email ? `Contact : ${party.contact.email}` : undefined,
      party.contact?.phone ? `Tél. : ${party.contact.phone}` : undefined,
    ].filter(Boolean) as string[];
    doc.text(lines.join("\n"), x, doc.y, { width });
  }

  private references(doc: PDFKit.PDFDocument, invoice: Invoice): void {
    const refs = [
      invoice.buyerReference && `Référence acheteur : ${invoice.buyerReference}`,
      invoice.purchaseOrderReference &&
        `Bon de commande : ${invoice.purchaseOrderReference}`,
      invoice.contractReference && `Contrat / marché : ${invoice.contractReference}`,
      invoice.projectReference && `Projet : ${invoice.projectReference}`,
      invoice.precedingInvoiceReference &&
        `Facture d'origine : ${invoice.precedingInvoiceReference.number}` +
          (invoice.precedingInvoiceReference.issueDate
            ? ` du ${fmtDate(invoice.precedingInvoiceReference.issueDate)}`
            : ""),
    ].filter(Boolean) as string[];

    if (refs.length > 0) {
      doc.font(FONT).fontSize(9).text(refs.join("   |   "), { width: contentWidth(doc) });
      doc.moveDown(0.5);
    }
    for (const note of invoice.notes) {
      doc.font(FONT).fontSize(9).fillColor("#444").text(note, { width: contentWidth(doc) });
      doc.fillColor("black");
    }
    if (invoice.notes.length > 0) doc.moveDown(0.5);
  }

  private linesTable(doc: PDFKit.PDFDocument, ctx: RenderContext): void {
    const { invoice } = ctx;
    const startX = PAGE_MARGIN;
    const width = contentWidth(doc);
    const cols = {
      desc: startX,
      qty: startX + width * 0.5,
      unit: startX + width * 0.62,
      pu: startX + width * 0.74,
      vat: startX + width * 0.86,
      total: startX + width,
    };

    doc.moveDown(0.5);
    const headerY = doc.y;
    doc.font(FONT_BOLD).fontSize(8.5);
    doc.text("Désignation", cols.desc, headerY, { width: width * 0.48 });
    doc.text("Qté", cols.qty, headerY, { width: width * 0.1, align: "right" });
    doc.text("Unité", cols.unit, headerY, { width: width * 0.1, align: "right" });
    doc.text("PU HT", cols.pu, headerY, { width: width * 0.12, align: "right" });
    doc.text("TVA %", cols.vat, headerY, { width: width * 0.1, align: "right" });
    doc.text("Montant HT", cols.pu, headerY, { width: width * 0.26, align: "right" });
    doc.moveTo(startX, doc.y + 2).lineTo(startX + width, doc.y + 2).stroke();
    doc.moveDown(0.5);

    doc.font(FONT).fontSize(8.5);
    for (const line of invoice.lines) {
      const rowY = doc.y;
      const label = line.details
        ? `${line.description}\n${line.details}`
        : line.description;
      doc.text(label, cols.desc, rowY, { width: width * 0.48 });
      const lineBottom = doc.y;
      doc.text(fmtNum(line.quantity), cols.qty, rowY, {
        width: width * 0.1,
        align: "right",
      });
      doc.text(line.unitCode, cols.unit, rowY, { width: width * 0.1, align: "right" });
      doc.text(line.unitPrice.format(), cols.pu, rowY, {
        width: width * 0.12,
        align: "right",
      });
      doc.text(
        line.taxCategory.rate > 0 ? fmtNum(line.taxCategory.rate) : "—",
        cols.vat,
        rowY,
        { width: width * 0.1, align: "right" },
      );
      doc.text(line.netAmount.format(), cols.pu, rowY, {
        width: width * 0.26,
        align: "right",
      });
      if (line.discountAmount && !line.discountAmount.isZero()) {
        doc
          .fillColor("#666")
          .fontSize(7.5)
          .text(`(dont remise ${line.discountAmount.format()})`, cols.desc, doc.y, {
            width: width * 0.48,
          })
          .fillColor("black")
          .fontSize(8.5);
      }
      doc.y = Math.max(doc.y, lineBottom) + 3;
    }
    doc.moveTo(startX, doc.y).lineTo(startX + width, doc.y).stroke();
    doc.moveDown(0.5);
  }

  private totalsBlock(doc: PDFKit.PDFDocument, totals: InvoiceTotals): void {
    const width = contentWidth(doc);
    const labelX = PAGE_MARGIN + width * 0.55;
    const valueW = width * 0.45;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? FONT_BOLD : FONT).fontSize(bold ? 11 : 9.5);
      const y = doc.y;
      doc.text(label, labelX, y, { width: valueW * 0.6, align: "left" });
      doc.text(value, labelX, y, { width: valueW, align: "right" });
      doc.moveDown(0.3);
    };

    if (!totals.allowanceTotal.isZero())
      row("Remises", `- ${totals.allowanceTotal.format()}`);
    if (!totals.chargeTotal.isZero())
      row("Frais", totals.chargeTotal.format());
    row("Total HT", totals.taxBasisTotal.format());
    row("Total TVA", totals.taxTotal.format());
    row("Total TTC", totals.grandTotal.format(), true);
    if (!totals.paidAmount.isZero()) {
      row("Acompte versé", `- ${totals.paidAmount.format()}`);
      row("Net à payer", totals.duePayable.format(), true);
    }
    doc.moveDown(0.5);
    doc.x = PAGE_MARGIN;
  }

  private vatBreakdownTable(doc: PDFKit.PDFDocument, totals: InvoiceTotals): void {
    const width = contentWidth(doc);
    doc.font(FONT_BOLD).fontSize(8.5).text("Ventilation de la TVA", PAGE_MARGIN, doc.y);
    doc.font(FONT).fontSize(8.5);
    const headerY = doc.y + 2;
    doc.text("Base HT", PAGE_MARGIN, headerY, { width: width * 0.25, align: "right" });
    doc.text("Taux", PAGE_MARGIN + width * 0.27, headerY, {
      width: width * 0.15,
      align: "right",
    });
    doc.text("TVA", PAGE_MARGIN + width * 0.44, headerY, {
      width: width * 0.2,
      align: "right",
    });
    doc.text("Catégorie", PAGE_MARGIN + width * 0.66, headerY, { width: width * 0.34 });
    doc.moveDown(0.3);

    for (const v of totals.vatBreakdown) {
      const y = doc.y;
      doc.text(v.taxableAmount.format(), PAGE_MARGIN, y, {
        width: width * 0.25,
        align: "right",
      });
      doc.text(v.rate > 0 ? `${fmtNum(v.rate)} %` : "—", PAGE_MARGIN + width * 0.27, y, {
        width: width * 0.15,
        align: "right",
      });
      doc.text(v.taxAmount.format(), PAGE_MARGIN + width * 0.44, y, {
        width: width * 0.2,
        align: "right",
      });
      const cat = `${v.categoryCode} — ${TAX_CATEGORY_LABELS[v.categoryCode]}${
        v.exemptionReason ? ` (${v.exemptionReason})` : ""
      }`;
      doc.text(cat, PAGE_MARGIN + width * 0.66, y, { width: width * 0.34 });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.5);
  }

  private paymentBlock(doc: PDFKit.PDFDocument, invoice: Invoice): void {
    const pt = invoice.paymentTerms;
    doc.font(FONT_BOLD).fontSize(9).text("Conditions de règlement", PAGE_MARGIN, doc.y);
    doc.font(FONT).fontSize(8.5);
    const bits = [
      `Moyen de paiement : ${pt.meansLabel}`,
      pt.dueDate ? `Échéance : ${fmtDate(pt.dueDate)}` : undefined,
      pt.iban ? `IBAN : ${pt.iban}` : undefined,
      pt.bic ? `BIC : ${pt.bic}` : undefined,
    ].filter(Boolean) as string[];
    doc.text(bits.join("   |   "), { width: contentWidth(doc) });
    doc.moveDown(0.5);
  }

  private legalFooter(doc: PDFKit.PDFDocument, invoice: Invoice): void {
    doc
      .font(FONT)
      .fontSize(7.5)
      .fillColor("#333")
      .text(invoice.paymentTerms.toLegalText(), PAGE_MARGIN, doc.y, {
        width: contentWidth(doc),
      });
    if (invoice.seller.address.countryCode === "FR") {
      doc.moveDown(0.3).text(
        "En cas d'assujettissement à la TVA sur les débits, mention « Option pour le paiement de la taxe d'après les débits » le cas échéant. " +
          "Tout professionnel en situation de retard de paiement est de plein droit débiteur des pénalités et de l'indemnité de recouvrement.",
        { width: contentWidth(doc) },
      );
    }
    doc.fillColor("black");
  }
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
}
