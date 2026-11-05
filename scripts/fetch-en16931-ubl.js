#!/usr/bin/env node
/**
 * Télécharge le Schematron EN 16931 UBL (CEN/TC 434) et le compile en SEF gzippé.
 *
 *   npm run vendor:ubl
 */
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { createReadStream } from "node:fs";

const VERSION = "1.3.17";
const XSLT_URL = `https://raw.githubusercontent.com/ConnectingEurope/eInvoicing-EN16931/validation-${VERSION}/ubl/xslt/EN16931-UBL-validation.xslt`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "vendor/en16931-ubl");
const xsltPath = resolve(dir, "EN16931-UBL-validation.xslt");
const sefPath = resolve(dir, "EN16931-UBL-validation.sef.json");
const gzPath = `${sefPath}.gz`;

await mkdir(dir, { recursive: true });

process.stdout.write(`Téléchargement EN 16931 UBL ${VERSION}…\n`);
const res = await fetch(XSLT_URL);
if (!res.ok) throw new Error(`HTTP ${res.status} ${XSLT_URL}`);
await writeFile(xsltPath, Buffer.from(await res.arrayBuffer()));

process.stdout.write("Compilation XSLT → SEF (xslt3)…\n");
execFileSync(
  "npx",
  ["xslt3", "-nogo", "-xsl", xsltPath, "-export", sefPath],
  { stdio: "inherit", cwd: root },
);

process.stdout.write("Compression SEF…\n");
await pipeline(createReadStream(sefPath), createGzip({ level: 9 }), createWriteStream(gzPath));

process.stdout.write(`✔ ${gzPath}\n`);
