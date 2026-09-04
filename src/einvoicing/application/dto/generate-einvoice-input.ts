import { z } from "zod";

/**
 * Schéma du JSON d'entrée : un sous-ensemble lisible d'EN 16931.
 * C'est le contrat public d'entrée du module (exporté depuis `index.ts`).
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "Date attendue au format ISO (YYYY-MM-DD)")
  .describe("Date ISO 8601, ex. 2026-09-04");

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, "Code pays ISO 3166-1 alpha-2, ex. FR"),
  countrySubdivision: z.string().optional(),
});

const contactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const electronicAddressSchema = z.object({
  value: z.string().min(1),
  scheme: z
    .string()
    .min(1)
    .describe('Code EAS, ex. "0009" (SIRET), "0225" (SIREN), "EM" (email)'),
});

const partySchema = z.object({
  name: z.string().min(1),
  tradingName: z.string().optional(),
  legalInfo: z.string().optional(),
  siren: z.string().regex(/^\d{9}$/, "SIREN = 9 chiffres").optional(),
  siret: z.string().regex(/^\d{14}$/, "SIRET = 14 chiffres").optional(),
  vatNumber: z
    .string()
    .regex(/^[A-Z]{2}[0-9A-Z]{2,13}$/, "N° TVA intracom, ex. FR40123456789")
    .optional(),
  address: addressSchema,
  contact: contactSchema.optional(),
  electronicAddress: electronicAddressSchema.optional(),
});

const taxSchema = z.object({
  category: z
    .enum(["S", "Z", "E", "AE", "K", "G", "O"])
    .describe("Catégorie de TVA EN 16931 (UNTDID 5305)"),
  rate: z.number().min(0).max(100),
  exemptionReason: z.string().optional(),
  exemptionCode: z.string().optional(),
});

const lineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  details: z.string().optional(),
  quantity: z.number().positive(),
  unit: z
    .string()
    .min(1)
    .default("C62")
    .describe('Code unité UN/ECE Rec. 20, ex. "C62" (unité), "HUR" (heure)'),
  unitPrice: z.number().min(0).describe("Prix unitaire net HT"),
  discount: z.number().min(0).optional().describe("Remise sur la ligne, en montant HT"),
  tax: taxSchema,
  sellerAssignedId: z.string().optional(),
});

const documentChargeSchema = z.object({
  type: z.enum(["allowance", "charge"]),
  amount: z.number().min(0),
  reason: z.string().min(1),
  reasonCode: z.string().optional(),
  tax: taxSchema,
});

const paymentSchema = z.object({
  means: z
    .enum(["10", "20", "30", "42", "48", "58", "59", "97"])
    .default("58")
    .describe("Moyen de paiement (UNTDID 4461)"),
  iban: z.string().optional(),
  bic: z.string().optional(),
  accountHolder: z.string().optional(),
  latePenaltyRate: z
    .number()
    .min(0)
    .describe("Taux annuel des pénalités de retard, en %"),
  recoveryIndemnity: z.number().min(0).default(40),
  discountTerms: z.string().optional(),
  note: z.string().optional(),
});

export const generateEInvoiceInputSchema = z.object({
  invoiceNumber: z.string().min(1),
  type: z.enum(["380", "381", "384", "386", "389"]).default("380"),
  issueDate: isoDate,
  dueDate: isoDate.optional(),
  deliveryDate: isoDate.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("EUR"),
  buyerReference: z.string().optional(),
  purchaseOrderReference: z.string().optional(),
  contractReference: z.string().optional(),
  projectReference: z.string().optional(),
  seller: partySchema,
  buyer: partySchema,
  shipToName: z.string().optional(),
  lines: z.array(lineSchema).min(1),
  documentCharges: z.array(documentChargeSchema).optional(),
  payment: paymentSchema,
  prepaidAmount: z.number().min(0).optional(),
  precedingInvoice: z
    .object({ number: z.string().min(1), issueDate: isoDate.optional() })
    .optional(),
  notes: z.array(z.string()).optional(),
});

export type GenerateEInvoiceInput = z.infer<typeof generateEInvoiceInputSchema>;
export type GenerateEInvoiceInputRaw = z.input<typeof generateEInvoiceInputSchema>;
