#!/usr/bin/env node
/**
 * Télécharge les artefacts UBL CIUS-FR (XSD OASIS 2.1 redistribué par le FNFE,
 * Schematron CEN EN 16931, Schematron BR-FR) et compile les XSLT en SEF gzippé.
 *
 *   npm run vendor:ubl
 */
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FNFE_TAG = "v1.4.0.04";
const FNFE_XSD_BASE = `https://raw.githubusercontent.com/fnfempe/France_RFE/${FNFE_TAG}/FNFE_RFE_INVOICE/UBL/1xsd_UBL2.1`;

const schematronArtefacts = [
  {
    dir: "vendor/en16931-ubl",
    file: "EN16931-UBL-validation",
    url: "https://raw.githubusercontent.com/ConnectingEurope/eInvoicing-EN16931/validation-1.3.17/ubl/xslt/EN16931-UBL-validation.xslt",
    label: "EN 16931 UBL 1.3.17",
  },
  {
    dir: "vendor/france-rfe",
    file: "BR-FR-Flux2-Schematron-UBL",
    url: `https://raw.githubusercontent.com/fnfempe/France_RFE/${FNFE_TAG}/FNFE_RFE_INVOICE/UBL/EN16931/2xslt/BR-FR-Flux2-Schematron-UBL.xslt`,
    label: "BR-FR Flux 2 UBL 1.4.0.04",
  },
];

const ublXsdFiles = [
  "UBL2.1_README.md",
  "maindoc/UBL-Invoice-2.1.xsd",
  "maindoc/UBL-CreditNote-2.1.xsd",
  "common/CCTS_CCT_SchemaModule-2.1.xsd",
  "common/UBL-CommonAggregateComponents-2.1.xsd",
  "common/UBL-CommonBasicComponents-2.1.xsd",
  "common/UBL-CommonExtensionComponents-2.1.xsd",
  "common/UBL-CommonSignatureComponents-2.1.xsd",
  "common/UBL-CoreComponentParameters-2.1.xsd",
  "common/UBL-ExtensionContentDataType-2.1.xsd",
  "common/UBL-QualifiedDataTypes-2.1.xsd",
  "common/UBL-SignatureAggregateComponents-2.1.xsd",
  "common/UBL-SignatureBasicComponents-2.1.xsd",
  "common/UBL-UnqualifiedDataTypes-2.1.xsd",
  "common/UBL-XAdESv132-2.1.xsd",
  "common/UBL-XAdESv141-2.1.xsd",
  "common/UBL-xmldsig-core-schema-2.1.xsd",
];

await fetchUblXsd();

if (process.env.UBL_VENDOR_XSD_ONLY === "1") {
  process.stdout.write("UBL_VENDOR_XSD_ONLY=1 : Schematron inchangé.\n");
  process.exit(0);
}

for (const a of schematronArtefacts) {
  const dir = resolve(root, a.dir);
  const xsltPath = resolve(dir, `${a.file}.xslt`);
  const sefPath = resolve(dir, `${a.file}.sef.json`);
  const gzPath = `${sefPath}.gz`;
  await mkdir(dir, { recursive: true });

  process.stdout.write(`Téléchargement ${a.label}…\n`);
  const res = await fetch(a.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${a.url}`);
  await writeFile(xsltPath, Buffer.from(await res.arrayBuffer()));

  process.stdout.write("Compilation XSLT → SEF (xslt3)…\n");
  // SaxonJS exige `-export:fichier` (un seul argument). `npx xslt3 -export file`
  // laisse `-export` sans valeur → « Command line option -export requires a value ».
  const xslt3 = resolve(root, "node_modules/xslt3/xslt3.js");
  execFileSync(process.execPath, [xslt3, "-nogo", `-xsl:${xsltPath}`, `-export:${sefPath}`], {
    stdio: "inherit",
    cwd: root,
  });

  process.stdout.write("Compression SEF…\n");
  await pipeline(
    createReadStream(sefPath),
    createGzip({ level: 9 }),
    createWriteStream(gzPath),
  );
  await unlink(sefPath);
  process.stdout.write(`✔ ${gzPath}\n`);
}

async function fetchUblXsd() {
  const dest = resolve(root, "vendor/france-rfe/ubl-xsd");
  await mkdir(dest, { recursive: true });
  for (const rel of ublXsdFiles) {
    const url = `${FNFE_XSD_BASE}/${rel}`;
    const out = resolve(dest, rel);
    await mkdir(dirname(out), { recursive: true });
    process.stdout.write(`Téléchargement XSD UBL ${rel}…\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
  }
  await writeFile(
    resolve(dest, "SOURCE.json"),
    `${JSON.stringify(
      {
        name: "OASIS UBL 2.1 XSD (Invoice / CreditNote), redistribué par FNFE-MPE",
        version: "2.1",
        pack: `France_RFE ${FNFE_TAG}`,
        source: `https://github.com/fnfempe/France_RFE/tree/${FNFE_TAG}/FNFE_RFE_INVOICE/UBL/1xsd_UBL2.1`,
        oasis: "http://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip",
        note: "CIUS-FR n'a pas de XSD propre : on valide le schéma OASIS UBL 2.1 puis les Schematron. Régénérer via : npm run vendor:ubl",
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`✔ ${dest}\n`);
}
