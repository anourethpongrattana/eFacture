import { Buffer } from "node:buffer";

import type { Request, Response, NextFunction } from "express";

import type {
  EInvoiceFormat,
  EInvoicingModule,
} from "../../../einvoicing/index.js";

const FORMATS: EInvoiceFormat[] = ["facturx", "cii", "ubl"];

function parseFormat(value: unknown): EInvoiceFormat {
  if (typeof value === "string" && (FORMATS as string[]).includes(value)) {
    return value as EInvoiceFormat;
  }
  return "facturx";
}

function truthy(value: unknown): boolean {
  return value === "true" || value === "1" || value === true;
}

export function makeEInvoicingController(module: EInvoicingModule) {
  return {
    /** POST /  — body = JSON facture ; renvoie le fichier (ou du JSON si Accept: application/json). */
    async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const format = parseFormat(req.query.format);
        const validate = truthy(req.query.validate);
        const result = await module.generateEInvoice(req.body, { format, validate });

        const wantsJson = req.accepts(["application/pdf", "application/xml", "json"]) === "json";
        if (wantsJson) {
          res.json({
            format: result.format,
            fileName: result.fileName,
            invoiceNumber: result.invoiceNumber,
            contentType: result.contentType,
            contentBase64: Buffer.from(result.content).toString("base64"),
            validation: result.validation,
          });
          return;
        }

        res.setHeader("Content-Type", result.contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${result.fileName}"`,
        );
        if (result.validation) {
          res.setHeader(
            "X-EInvoice-Valid",
            String(result.validation.valid),
          );
        }
        res.send(Buffer.from(result.content));
      } catch (err) {
        next(err);
      }
    },

    /** POST /validate — body = { format, contentBase64 }. */
    async validate(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const format = parseFormat(req.body?.format);
        const b64 = req.body?.contentBase64;
        if (typeof b64 !== "string") {
          res.status(400).json({
            error: "bad_request",
            message: "Champ contentBase64 (string) requis",
          });
          return;
        }
        const report = await module.validateEInvoice({
          format,
          content: new Uint8Array(Buffer.from(b64, "base64")),
        });
        res.status(report.valid ? 200 : 422).json(report);
      } catch (err) {
        next(err);
      }
    },
  };
}
