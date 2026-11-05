import { DomainError } from "../errors.js";
import { Address } from "./address.js";

export interface PartyContact {
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * Adresse électronique de routage (BT-34 vendeur / BT-49 acheteur).
 * Indispensable pour l'acheminement via PPF/PDP dans la réforme française.
 */
export interface ElectronicAddress {
  value: string;
  /** Code EAS (ex. "0009" = SIRET, "0225" = SIREN, "EM" = email). */
  scheme: string;
}

export interface PartyProps {
  name: string;
  /** Raison sociale si différente du nom commercial. */
  tradingName?: string;
  address: Address;
  /** SIREN (9 chiffres) — identifiant légal de l'entreprise. */
  siren?: string;
  /** SIRET (14 chiffres) — identifiant de l'établissement. */
  siret?: string;
  /** N° TVA intracommunautaire (ex. "FR12345678901"). */
  vatNumber?: string;
  contact?: PartyContact;
  electronicAddress?: ElectronicAddress;
  /** Informations légales additionnelles (ex. "SARL au capital de 10 000 €"). */
  legalInfo?: string;
}

const SIREN_RE = /^\d{9}$/;
const SIRET_RE = /^\d{14}$/;
const VAT_RE = /^[A-Z]{2}[0-9A-Z]{2,13}$/;

/** Partie prenante d'une facture : vendeur (BG-4) ou acheteur (BG-7). */
export class Party {
  readonly name: string;
  readonly tradingName?: string;
  readonly address: Address;
  readonly siren?: string;
  readonly siret?: string;
  readonly vatNumber?: string;
  readonly contact?: PartyContact;
  readonly electronicAddress?: ElectronicAddress;
  readonly legalInfo?: string;

  constructor(props: PartyProps) {
    if (!props.name?.trim()) throw new DomainError("Partie: nom manquant");
    if (props.siren && !SIREN_RE.test(props.siren))
      throw new DomainError(`SIREN invalide: ${props.siren}`);
    if (props.siret && !SIRET_RE.test(props.siret))
      throw new DomainError(`SIRET invalide: ${props.siret}`);
    if (props.vatNumber && !VAT_RE.test(props.vatNumber))
      throw new DomainError(`N° TVA invalide: ${props.vatNumber}`);
    if (props.siren && props.siret && !props.siret.startsWith(props.siren))
      throw new DomainError(
        `Incohérence SIREN/SIRET: ${props.siret} ne commence pas par ${props.siren}`,
      );

    this.name = props.name.trim();
    this.tradingName = props.tradingName?.trim() || undefined;
    this.address = props.address;
    this.siren = props.siren ?? (props.siret ? props.siret.slice(0, 9) : undefined);
    this.siret = props.siret;
    this.vatNumber = props.vatNumber;
    this.contact = props.contact;
    this.electronicAddress =
      props.electronicAddress ??
      (this.siren
        ? { value: this.siren, scheme: "0225" }
        : props.siret
          ? { value: props.siret, scheme: "0009" }
          : undefined);
    this.legalInfo = props.legalInfo?.trim() || undefined;
  }
}
