import { DomainError } from "../errors.js";
import { Money } from "../value-objects/money.js";
import { TaxCategory } from "../value-objects/tax-category.js";

export interface InvoiceLineProps {
  /** Identifiant de ligne (BT-126), unique dans la facture. */
  id: string;
  /** Désignation du produit / service (BT-153). */
  description: string;
  /** Détail additionnel (BT-154), optionnel. */
  details?: string;
  quantity: number;
  /** Code unité de mesure UN/ECE Rec. 20 (BT-130), ex. "C62" (unité), "HUR" (heure). */
  unitCode: string;
  /** Prix unitaire net HT (BT-146). */
  unitPrice: Money;
  taxCategory: TaxCategory;
  /** Remise sur la ligne, montant HT (BT-136), optionnel. */
  discountAmount?: Money;
  /** Référence article vendeur (BT-155), optionnel. */
  sellerAssignedId?: string;
}

/** Ligne de facture (BG-25). */
export class InvoiceLine {
  readonly id: string;
  readonly description: string;
  readonly details?: string;
  readonly quantity: number;
  readonly unitCode: string;
  readonly unitPrice: Money;
  readonly taxCategory: TaxCategory;
  readonly discountAmount?: Money;
  readonly sellerAssignedId?: string;

  constructor(props: InvoiceLineProps) {
    if (!props.id?.trim()) throw new DomainError("Ligne: identifiant manquant");
    if (!props.description?.trim())
      throw new DomainError(`Ligne ${props.id}: désignation manquante`);
    if (!Number.isFinite(props.quantity) || props.quantity <= 0)
      throw new DomainError(`Ligne ${props.id}: quantité invalide`);
    if (!props.unitCode?.trim())
      throw new DomainError(`Ligne ${props.id}: unité de mesure manquante`);
    if (props.unitPrice.isNegative())
      throw new DomainError(`Ligne ${props.id}: prix unitaire négatif`);
    if (props.discountAmount && props.discountAmount.isNegative())
      throw new DomainError(`Ligne ${props.id}: remise négative`);

    this.id = props.id.trim();
    this.description = props.description.trim();
    this.details = props.details?.trim() || undefined;
    this.quantity = props.quantity;
    this.unitCode = props.unitCode.trim();
    this.unitPrice = props.unitPrice;
    this.taxCategory = props.taxCategory;
    this.discountAmount = props.discountAmount;
    this.sellerAssignedId = props.sellerAssignedId?.trim() || undefined;
  }

  /** Montant net HT de la ligne (BT-131) = PU × quantité − remise. */
  get netAmount(): Money {
    const gross = this.unitPrice.times(this.quantity);
    return this.discountAmount ? gross.subtract(this.discountAmount) : gross;
  }

  /** Montant de TVA de la ligne (indicatif ; la TVA due est calculée par ventilation). */
  get taxAmount(): Money {
    return this.netAmount.percentage(this.taxCategory.rate);
  }
}
