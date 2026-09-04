import { createEInvoicingModule } from "./einvoicing/index.js";
import { createServer } from "./interfaces/http/server.js";

const port = Number(process.env.PORT ?? 3000);
const validateByDefault = process.env.EINVOICE_VALIDATE_BY_DEFAULT === "true";

const module = createEInvoicingModule({ validateByDefault });
const app = createServer(module);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`eFacture POC — http://localhost:${port}`);
  console.log(`  POST /api/v1/einvoices?format=facturx|cii|ubl&validate=true`);
  console.log(`  POST /api/v1/einvoices/validate`);
});
