import { DomainError } from "../errors.js";

export interface AddressProps {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  /** Code pays ISO 3166-1 alpha-2 (ex. "FR"). */
  countryCode: string;
  /** Subdivision / région (BT-39/BT-54), optionnel. */
  countrySubdivision?: string;
}

/** Adresse postale (BG-5 / BG-8 / BG-15 en EN 16931). */
export class Address {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly countrySubdivision?: string;

  constructor(props: AddressProps) {
    if (!props.line1?.trim()) throw new DomainError("Adresse: rue manquante");
    if (!props.city?.trim()) throw new DomainError("Adresse: ville manquante");
    if (!props.postalCode?.trim())
      throw new DomainError("Adresse: code postal manquant");
    if (!/^[A-Z]{2}$/.test(props.countryCode))
      throw new DomainError(`Adresse: code pays invalide (${props.countryCode})`);

    this.line1 = props.line1.trim();
    this.line2 = props.line2?.trim() || undefined;
    this.city = props.city.trim();
    this.postalCode = props.postalCode.trim();
    this.countryCode = props.countryCode;
    this.countrySubdivision = props.countrySubdivision?.trim() || undefined;
  }

  /** Rendu sur une ligne pour le PDF. */
  toSingleLine(): string {
    return [this.line1, this.line2, `${this.postalCode} ${this.city}`, this.countryCode]
      .filter(Boolean)
      .join(", ");
  }
}
