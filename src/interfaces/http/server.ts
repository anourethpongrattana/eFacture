import express, { type Express } from "express";

import type { EInvoicingModule } from "../../einvoicing/index.js";
import { createEInvoicingRouter } from "./routes/einvoicing.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

/** Construit l'app Express de démonstration (non démarrée). */
export function createServer(module: EInvoicingModule): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "efacture-poc" });
  });

  app.use("/api/v1/einvoices", createEInvoicingRouter(module));

  app.use(errorHandler);
  return app;
}
