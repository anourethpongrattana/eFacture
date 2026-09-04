import { Router, json } from "express";

import type { EInvoicingModule } from "../../../einvoicing/index.js";
import { makeEInvoicingController } from "../controllers/einvoicing.controller.js";

/**
 * Routeur Express prêt à monter dans une app existante :
 *   app.use("/api/v1/einvoices", createEInvoicingRouter(module));
 */
export function createEInvoicingRouter(module: EInvoicingModule): Router {
  const router = Router();
  const controller = makeEInvoicingController(module);

  router.use(json({ limit: "2mb" }));
  router.post("/", controller.generate);
  router.post("/validate", controller.validate);

  return router;
}
