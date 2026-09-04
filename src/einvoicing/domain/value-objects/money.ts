import { DomainError } from "../errors.js";

/**
 * Montant monétaire immuable, arrondi à 2 décimales (arrondi commercial, "half up").
 *
 * On travaille en nombre décimal simple : suffisant pour un POC de facturation
 * (les quantités peuvent être fractionnaires, ce qui exclut une représentation
 * purement en centimes). Chaque opération ré-arrondit pour éviter la dérive
 * des flottants.
 */
export class Money {
  private constructor(
    /** Valeur décimale, déjà arrondie à 2 décimales. */
    public readonly amount: number,
    /** Code devise ISO 4217 (ex. "EUR"). */
    public readonly currency: string,
  ) {}

  static of(amount: number, currency: string): Money {
    if (!Number.isFinite(amount)) {
      throw new DomainError(`Montant invalide: ${amount}`);
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new DomainError(`Code devise invalide: ${currency}`);
    }
    return new Money(roundHalfUp(amount, 2), currency);
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new DomainError(
        `Devises incompatibles: ${this.currency} vs ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount - other.amount, this.currency);
  }

  /** Multiplie par un scalaire sans dimension (ex. une quantité). */
  times(factor: number): Money {
    return Money.of(this.amount * factor, this.currency);
  }

  /** Applique un pourcentage (ex. 20 pour 20 %). */
  percentage(rate: number): Money {
    return Money.of((this.amount * rate) / 100, this.currency);
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  /** Représentation canonique pour les formats XML ("1234.50"). */
  toXmlString(): string {
    return this.amount.toFixed(2);
  }

  /** Représentation lisible localisée (par défaut fr-FR). */
  format(locale = "fr-FR"): string {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: this.currency,
    }).format(this.amount);
  }
}

export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // + Number.EPSILON amortit les erreurs de représentation (ex. 1.005).
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
