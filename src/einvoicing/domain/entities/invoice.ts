import { DomainError, InvoiceValidationError, type ValidationIssue } from "../errors.js";
import { Money } from "../value-objects/money.js";
import { Party } from "../value-objects/party.js";
import { PaymentTerms } from "../value-objects/payment-terms.js";
import { TaxCategory } from "../value-objects/tax-category.js";
import { InvoiceLine } from "./invoice-line.js";

/** Type de document (BT-3), codes UNTDID 1001. */
export type InvoiceTypeCode =
  | "380" // Facture commerciale
  | "381" // Avoir (note de crédit)
  | "384" // Facture rectificative
  | "386" // Facture d'acompte
  | "389"; // Facture d'autofacturation

/** Remise ou frais au niveau document (BG-20 / BG-21). */
export interface DocumentCharge {
  /** true = frais, false = remise. */
  isCharge: boolean;
  amount: Money;
  reason: string;
  reasonCode?: string;
  taxCategory: TaxCategory;
}

export interface InvoiceProps {
  number: string;
  type?: InvoiceTypeCode;
  issueDate: Date;
  currency: string;
  seller: Party;
  buyer: Party;
  /** Référence acheteur (BT-10) — sert au routage via PPF/PDP. */
  buyerReference?: string;
  lines: InvoiceLine[];
  paymentTerms: PaymentTerms;
  /** Date de livraison / exécution de la prestation (BT-72). Mention obligatoire FR. */
  deliveryDate?: Date;
  /** Nom du lieu de livraison (BT-70). */
  shipToName?: string;
  /** Référence bon de commande (BT-13). */
  purchaseOrderReference?: string;
  /** Référence contrat / n° de marché (BT-12). */
  contractReference?: string;
  /** Référence projet (BT-11). */
  projectReference?: string;
  /** Facture(s) antérieure(s) rectifiée(s) (BG-3) — pour un avoir. */
  precedingInvoiceReference?: { number: string; issueDate?: Date };
  /** Montant déjà réglé / acompte (BT-113). */
  prepaidAmount?: Money;
  documentCharges?: DocumentCharge[];
  /** Notes libres (BG-1). */
  notes?: string[];
}

/** Agrégat Facture (racine). Porte les invariants métier + les mentions FR. */
export class Invoice {
  readonly number: string;
  readonly type: InvoiceTypeCode;
  readonly issueDate: Date;
  readonly currency: string;
  readonly seller: Party;
  readonly buyer: Party;
  readonly buyerReference?: string;
  readonly lines: InvoiceLine[];
  readonly paymentTerms: PaymentTerms;
  readonly deliveryDate?: Date;
  readonly shipToName?: string;
  readonly purchaseOrderReference?: string;
  readonly contractReference?: string;
  readonly projectReference?: string;
  readonly precedingInvoiceReference?: { number: string; issueDate?: Date };
  readonly prepaidAmount: Money;
  readonly documentCharges: DocumentCharge[];
  readonly notes: string[];

  constructor(props: InvoiceProps) {
    if (!props.number?.trim())
      throw new DomainError("Facture: numéro manquant (BT-1)");
    if (!(props.issueDate instanceof Date) || Number.isNaN(props.issueDate.getTime()))
      throw new DomainError("Facture: date d'émission invalide (BT-2)");
    if (!/^[A-Z]{3}$/.test(props.currency))
      throw new DomainError(`Facture: devise invalide (${props.currency})`);
    if (!props.lines || props.lines.length === 0)
      throw new DomainError("Facture: au moins une ligne est requise");

    const ids = new Set<string>();
    for (const line of props.lines) {
      if (ids.has(line.id))
        throw new DomainError(`Facture: identifiant de ligne dupliqué (${line.id})`);
      ids.add(line.id);
      if (line.unitPrice.currency !== props.currency)
        throw new DomainError(
          `Ligne ${line.id}: devise ${line.unitPrice.currency} ≠ devise facture ${props.currency}`,
        );
    }

    this.number = props.number.trim();
    this.type = props.type ?? "380";
    this.issueDate = props.issueDate;
    this.currency = props.currency;
    this.seller = props.seller;
    this.buyer = props.buyer;
    this.buyerReference = props.buyerReference?.trim() || undefined;
    this.lines = props.lines;
    this.paymentTerms = props.paymentTerms;
    this.deliveryDate = props.deliveryDate;
    this.shipToName = props.shipToName?.trim() || undefined;
    this.purchaseOrderReference = props.purchaseOrderReference?.trim() || undefined;
    this.contractReference = props.contractReference?.trim() || undefined;
    this.projectReference = props.projectReference?.trim() || undefined;
    this.precedingInvoiceReference = props.precedingInvoiceReference;
    this.prepaidAmount = props.prepaidAmount ?? Money.zero(props.currency);
    this.documentCharges = props.documentCharges ?? [];
    this.notes = props.notes?.filter((n) => n.trim()) ?? [];
  }

  get isCreditNote(): boolean {
    return this.type === "381";
  }

  /**
   * Contrôles de conformité "mentions obligatoires" françaises qui vont au-delà
   * des invariants de construction. Lève une InvoiceValidationError si non conforme.
   */
  assertFrenchComplianceOrThrow(): void {
    const issues: ValidationIssue[] = [];
    const bothFrench =
      this.seller.address.countryCode === "FR" &&
      this.buyer.address.countryCode === "FR";

    if (!this.seller.siret && !this.seller.siren)
      issues.push({
        path: "seller.siret",
        code: "BR-FR-SELLER-ID",
        message: "Le vendeur doit être identifié par un SIREN ou un SIRET",
      });
    if (!this.seller.vatNumber && this.hasTaxableLines())
      issues.push({
        path: "seller.vatNumber",
        code: "BR-FR-SELLER-VAT",
        message:
          "N° de TVA intracommunautaire du vendeur obligatoire dès lors que la facture porte de la TVA",
      });
    if (bothFrench && !this.buyer.siren && !this.buyer.siret)
      issues.push({
        path: "buyer.siren",
        code: "BR-FR-BUYER-ID",
        message:
          "Entre assujettis établis en France, le SIREN de l'acheteur est obligatoire (réforme 2026)",
      });
    if (!this.deliveryDate)
      issues.push({
        path: "deliveryDate",
        code: "BR-FR-DELIVERY-DATE",
        message:
          "La date de livraison ou d'exécution de la prestation est une mention obligatoire",
      });
    if (!this.paymentTerms.dueDate)
      issues.push({
        path: "paymentTerms.dueDate",
        code: "BR-FR-DUE-DATE",
        message: "La date d'échéance du règlement est une mention obligatoire",
      });
    if (this.isCreditNote && !this.precedingInvoiceReference)
      issues.push({
        path: "precedingInvoiceReference",
        code: "BR-FR-CREDIT-REF",
        message: "Un avoir doit référencer la facture d'origine",
      });

    if (issues.length > 0) throw new InvoiceValidationError(issues);
  }

  hasTaxableLines(): boolean {
    return this.lines.some((l) => l.taxCategory.rate > 0) ||
      this.documentCharges.some((c) => c.taxCategory.rate > 0);
  }

  /** Toutes les catégories de TVA distinctes présentes sur la facture. */
  taxCategories(): TaxCategory[] {
    const map = new Map<string, TaxCategory>();
    for (const line of this.lines) map.set(line.taxCategory.key, line.taxCategory);
    for (const c of this.documentCharges) map.set(c.taxCategory.key, c.taxCategory);
    return [...map.values()];
  }
}
