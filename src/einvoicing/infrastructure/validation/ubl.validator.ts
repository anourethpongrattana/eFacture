import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import SaxonJS from "saxon-js";

import type {
  ValidationIssueReport,
  ValidationReport,
} from "../../domain/ports/index.js";

const UBL_INVOICE_NS =
  "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const UBL_CREDITNOTE_NS =
  "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";

const stylesheetCache = new Map<string, unknown>();

/**
 * Validation UBL CIUS-FR :
 * 1. Schematron EN 16931 CEN/TC 434 v1.3.17
 * 2. Schematron BR-FR Flux 2 FNFE-MPE v1.4.0.04 (XP Z12-012)
 */
export async function validateUblXml(xml: string): Promise<ValidationReport> {
  const wellFormed = inspectUblDocument(xml);
  if (!wellFormed.ok) {
    return {
      valid: false,
      profile: "ubl:cius-fr",
      xsdValid: false,
      schematronValid: false,
      errors: [{ severity: "fatal", message: wellFormed.message }],
    };
  }

  try {
    const enIssues = await runSchematron(
      xml,
      "en16931-ubl",
      "EN16931-UBL-validation.sef.json.gz",
    );
    const frIssues = await runSchematron(
      xml,
      "france-rfe",
      "BR-FR-Flux2-Schematron-UBL.sef.json.gz",
    );
    const issues = [...enIssues, ...frIssues];
    const blocking = issues.filter((e) => e.severity !== "warning");
    return {
      valid: blocking.length === 0,
      profile: "ubl:cius-fr",
      xsdValid: true,
      schematronValid: blocking.length === 0,
      errors: issues,
    };
  } catch (err) {
    return {
      valid: false,
      profile: "ubl:cius-fr",
      xsdValid: wellFormed.ok,
      schematronValid: false,
      errors: [
        {
          severity: "fatal",
          message: `Schematron UBL: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

function inspectUblDocument(xml: string): { ok: true } | { ok: false; message: string } {
  const trimmed = xml.trim();
  if (!trimmed.startsWith("<")) {
    return { ok: false, message: "Le livrable UBL n'est pas un document XML." };
  }
  const isInvoice = trimmed.includes(UBL_INVOICE_NS);
  const isCreditNote = trimmed.includes(UBL_CREDITNOTE_NS);
  if (!isInvoice && !isCreditNote) {
    return {
      ok: false,
      message:
        "Racine UBL attendue (Invoice ou CreditNote, namespaces OASIS UBL 2.1).",
    };
  }
  return { ok: true };
}

async function runSchematron(
  xml: string,
  vendorDir: string,
  gzName: string,
): Promise<ValidationIssueReport[]> {
  const stylesheetInternal = loadStylesheet(vendorDir, gzName);
  const result = await SaxonJS.transform(
    {
      stylesheetInternal,
      sourceText: xml,
      destination: "serialized",
    },
    "async",
  );
  return parseSvrl(result.principalResult ?? "");
}

function loadStylesheet(vendorDir: string, gzName: string): unknown {
  const key = `${vendorDir}/${gzName}`;
  const cached = stylesheetCache.get(key);
  if (cached) return cached;
  const gzPath = join(resolveArtefactsDir(vendorDir), gzName);
  if (!existsSync(gzPath)) {
    throw new Error(
      `Artefact Schematron UBL introuvable: ${gzPath}. Lancer \`npm run vendor:ubl\`.`,
    );
  }
  const parsed: unknown = JSON.parse(
    gunzipSync(readFileSync(gzPath)).toString("utf8"),
  );
  stylesheetCache.set(key, parsed);
  return parsed;
}

function resolveArtefactsDir(vendorDir: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "vendor", vendorDir);
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  const fromCwd = join(process.cwd(), "vendor", vendorDir);
  if (existsSync(fromCwd)) return fromCwd;
  throw new Error(`Répertoire vendor/${vendorDir} introuvable.`);
}

function parseSvrl(svrl: string): ValidationIssueReport[] {
  const errors: ValidationIssueReport[] = [];
  const assertRe = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g;
  const textRe = /<svrl:text>([\s\S]*?)<\/svrl:text>/;
  const getAttr = (attrs: string, name: string) => {
    const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return m?.[1] ? decodeEntities(m[1]) : undefined;
  };
  let match: RegExpExecArray | null;
  while ((match = assertRe.exec(svrl)) !== null) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const message = decodeEntities(
      (body.match(textRe)?.[1] ?? "").replace(/\s+/g, " ").trim(),
    );
    const id =
      getAttr(attrs, "id") ?? message.match(/\[([A-Z]+(?:-[A-Z0-9]+)+)\]/)?.[1];
    const flag = getAttr(attrs, "flag");
    errors.push({
      message,
      rule: id,
      location: getAttr(attrs, "location"),
      severity: flag === "warning" ? "warning" : flag === "fatal" ? "fatal" : "error",
    });
  }
  return errors;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
