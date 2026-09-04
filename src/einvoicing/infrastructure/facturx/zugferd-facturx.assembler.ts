import { generate } from "@stafyniaksacha/facturx";
import { PDFDocument } from "pdf-lib";

import type {
  FacturxAssembler,
  RenderContext,
} from "../../domain/ports/index.js";
import { mapInvoiceToZugferd } from "../zugferd/invoice-to-zugferd.mapper.js";
import { sanitizeCiiXml } from "../zugferd/sanitize-cii-xml.js";
import { en16931Invoicer } from "../zugferd/zugferd-invoicer.js";

/**
 * Assemble le Factur-X : le XML CII (dérivé des mêmes données que le PDF, et
 * assaini via `sanitizeCiiXml`) est embarqué dans le PDF lisible pour produire
 * un PDF/A-3b avec les métadonnées Factur-X.
 *
 * L'assemblage utilise `@stafyniaksacha/facturx#generate` plutôt que le
 * `embedInPdf` natif de node-zugferd : celui-ci régénère son propre XML en
 * interne (impossible à assainir avant embarquement) et ne permet pas
 * d'utiliser notre XML déjà corrigé/validé.
 */
export class ZugferdFacturxAssembler implements FacturxAssembler {
  async assemble({
    pdf,
    ctx,
  }: {
    pdf: Uint8Array;
    ctx: RenderContext;
  }): Promise<Uint8Array> {
    const data = mapInvoiceToZugferd(ctx);
    const document = en16931Invoicer.create(data);
    const xml = sanitizeCiiXml(await document.toXML());

    return generate({
      pdf: Buffer.from(await stripTrailerId(pdf)),
      xml,
      flavor: "facturx",
      level: "en16931",
      language: "fr",
      meta: {
        author: ctx.invoice.seller.name,
        title: `Facture ${ctx.invoice.number}`,
        subject: `Facture ${ctx.invoice.number} — ${ctx.invoice.buyer.name}`,
        keywords: ["facture", "factur-x", "en16931"],
        date: ctx.invoice.issueDate,
      },
    });
  }
}

/**
 * `@stafyniaksacha/facturx#generate` refuse (pour l'instant) d'assembler un
 * PDF qui porte déjà un identifiant de trailer `/ID` — or pdfkit en assigne
 * toujours un. On le retire avant l'assemblage ; `generate()` en pose un
 * nouveau, dérivé du contenu final (XML inclus), comme l'exige Factur-X.
 */
async function stripTrailerId(pdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  doc.context.trailerInfo.ID = undefined;
  return doc.save();
}
