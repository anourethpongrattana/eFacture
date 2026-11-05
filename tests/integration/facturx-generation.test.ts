import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createEInvoicingModule } from "../../src/einvoicing/index.js";

async function loadExample(name: string) {
  const raw = await readFile(resolve(process.cwd(), "examples", name), "utf-8");
  return JSON.parse(raw);
}

describe("génération e2e (exemples réels, libs réelles)", () => {
  it.each(["invoice.minimal.json", "invoice.full.json"])(
    "produit un Factur-X EN16931 valide pour %s",
    async (file) => {
      const einvoicing = createEInvoicingModule();
      const input = await loadExample(file);

      const result = await einvoicing.generateEInvoice(input, {
        format: "facturx",
        validate: true,
      });

      expect(result.contentType).toBe("application/pdf");
      // Signature PDF + marqueur PDF/A-3 (métadonnées XMP).
      const text = Buffer.from(result.content).toString("latin1");
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text).toContain("pdfaid");

      expect(result.validation).toBeDefined();
      if (!result.validation!.valid) {
        console.error(JSON.stringify(result.validation, null, 2));
      }
      expect(result.validation!.errors.filter((e) => e.severity !== "warning")).toEqual([]);
      expect(result.validation!.valid).toBe(true);
    },
  );

  it.each(["invoice.minimal.json", "invoice.full.json"])(
    "produit un XML CII valide pour %s",
    async (file) => {
      const einvoicing = createEInvoicingModule();
      const input = await loadExample(file);

      const result = await einvoicing.generateEInvoice(input, {
        format: "cii",
        validate: true,
      });

      expect(result.contentType).toBe("application/xml");
      const xml = Buffer.from(result.content).toString("utf-8");
      expect(xml).toContain("CrossIndustryInvoice");

      if (!result.validation!.valid) {
        console.error(JSON.stringify(result.validation, null, 2));
      }
      expect(result.validation!.valid).toBe(true);
    },
  );

  it("rejette un XML UBL incomplet via le XSD OASIS 2.1", async () => {
    const einvoicing = createEInvoicingModule();
    const stub = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>X</cbc:ID>
</Invoice>`;
    const report = await einvoicing.validateEInvoice({
      format: "ubl",
      content: new TextEncoder().encode(stub),
    });
    expect(report.valid).toBe(false);
    expect(report.xsdValid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors.some((e) => e.rule === "XSD-UBL-2.1")).toBe(true);
  });

  it.each(["invoice.minimal.json", "invoice.full.json"])(
    "produit un XML UBL CIUS-FR (EN16931 + BR-FR) valide pour %s",
    async (file) => {
      const einvoicing = createEInvoicingModule();
      const input = await loadExample(file);

      const result = await einvoicing.generateEInvoice(input, {
        format: "ubl",
        validate: true,
      });

      expect(result.contentType).toBe("application/xml");
      const xml = Buffer.from(result.content).toString("utf-8");
      expect(xml).toContain("<Invoice");
      expect(xml).toContain("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2");
      expect(xml).toContain("<cbc:ProfileID>S1</cbc:ProfileID>");
      expect(xml).toContain("#PMD#");
      expect(xml).toContain("#PMT#");
      expect(xml).toContain("#AAB#");
      expect(xml).toContain("#BAR#B2B");
      expect(xml).toContain('schemeID="0225"');
      expect(result.validation!.profile).toBe("ubl:cius-fr");
      expect(result.validation!.xsdValid).toBe(true);

      expect(result.validation).toBeDefined();
      if (!result.validation!.valid) {
        console.error(JSON.stringify(result.validation, null, 2));
      }
      expect(result.validation!.errors.filter((e) => e.severity !== "warning")).toEqual([]);
      expect(result.validation!.valid).toBe(true);
      expect(result.validation!.schematronValid).toBe(true);
    },
  );
});
