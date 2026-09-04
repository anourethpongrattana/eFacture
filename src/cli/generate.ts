import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { createEInvoicingModule } from "../einvoicing/index.js";
import type { EInvoiceFormat } from "../einvoicing/index.js";

/**
 * CLI de démonstration : « un fichier JSON en entrée → une facture en sortie ».
 *
 *   npm run generate -- --input examples/invoice.full.json --output out/facture.pdf --format facturx --validate
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      format: { type: "string", short: "f", default: "facturx" },
      validate: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help || !values.input) {
    process.stdout.write(
      `Usage: generate --input <fichier.json> [--output <fichier>] [--format facturx|cii|ubl] [--validate]\n`,
    );
    process.exit(values.help ? 0 : 1);
  }

  const format = values.format as EInvoiceFormat;
  const inputPath = resolve(process.cwd(), values.input!);
  const payload = JSON.parse(await readFile(inputPath, "utf-8"));

  const einvoicing = createEInvoicingModule();
  const result = await einvoicing.generateEInvoice(payload, {
    format,
    validate: values.validate,
  });

  const outputPath = resolve(
    process.cwd(),
    values.output ?? `out/${result.fileName}`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.content);

  process.stdout.write(
    `✔ Facture ${result.invoiceNumber} générée (${format}) → ${outputPath} (${result.content.byteLength} octets)\n`,
  );

  if (result.validation) {
    const v = result.validation;
    if (v.skippedReason) {
      process.stdout.write(`ℹ Validation ignorée : ${v.skippedReason}\n`);
    } else {
      process.stdout.write(
        `${v.valid ? "✔" : "✗"} Validation ${v.profile ?? ""} : ${
          v.valid ? "CONFORME" : "NON CONFORME"
        } (XSD=${v.xsdValid}, Schematron=${v.schematronValid ?? "n/a"})\n`,
      );
      for (const e of v.errors.slice(0, 20)) {
        process.stdout.write(
          `   - [${e.severity}${e.rule ? ` ${e.rule}` : ""}] ${e.message}\n`,
        );
      }
      if (!v.valid) process.exitCode = 2;
    }
  }
}

main().catch((err) => {
  process.stderr.write(`\n✗ ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
