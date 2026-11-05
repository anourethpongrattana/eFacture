#!/usr/bin/env node
/**
 * Télécharge les Schematron UBL (CEN EN 16931 + FNFE BR-FR) et les compile en SEF gzippé.
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

const artefacts = [
  {
    dir: "vendor/en16931-ubl",
    file: "EN16931-UBL-validation",
    url: "https://raw.githubusercontent.com/ConnectingEurope/eInvoicing-EN16931/validation-1.3.17/ubl/xslt/EN16931-UBL-validation.xslt",
    label: "EN 16931 UBL 1.3.17",
  },
  {
    dir: "vendor/france-rfe",
    file: "BR-FR-Flux2-Schematron-UBL",
    url: "https://raw.githubusercontent.com/fnfempe/France_RFE/v1.4.0.04/FNFE_RFE_INVOICE/UBL/EN16931/2xslt/BR-FR-Flux2-Schematron-UBL.xslt",
    label: "BR-FR Flux 2 UBL 1.4.0.04",
  },
];

for (const a of artefacts) {
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
  execFileSync("npx", ["xslt3", "-nogo", "-xsl", xsltPath, "-export", sefPath], {
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
