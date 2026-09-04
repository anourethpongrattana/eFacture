import type {
  EInvoiceXmlSerializer,
  RenderContext,
} from "../../domain/ports/index.js";
import { mapInvoiceToZugferd } from "../zugferd/invoice-to-zugferd.mapper.js";
import { sanitizeCiiXml } from "../zugferd/sanitize-cii-xml.js";
import { en16931Invoicer } from "../zugferd/zugferd-invoicer.js";

/** Sérialiseur CII (UN/CEFACT) via node-zugferd, profil EN 16931. */
export class ZugferdCiiSerializer implements EInvoiceXmlSerializer {
  readonly syntax = "CII" as const;

  async serialize(ctx: RenderContext): Promise<string> {
    const data = mapInvoiceToZugferd(ctx);
    const document = en16931Invoicer.create(data);
    return sanitizeCiiXml(await document.toXML());
  }
}
