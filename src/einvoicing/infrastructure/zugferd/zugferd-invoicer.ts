import { zugferd, type Zugferd } from "node-zugferd";
import { EN16931 } from "node-zugferd/profile/en16931";

/**
 * Instance node-zugferd configurée sur le profil EN 16931 (COMFORT).
 * Partagée par le sérialiseur CII et l'assembleur Factur-X : les deux dérivent
 * du même objet de données, garantissant XML ↔ PDF cohérents.
 *
 * Typée via l'alias `Zugferd` (plutôt que le type inféré directement) : le
 * type complet du profil EN16931 est trop profond pour que tsc le nomme
 * (TS2742/TS7056). `create()` reste malgré tout vérifié à l'usage grâce à
 * `ZugferdInvoiceData`, construit à la main dans le mapper.
 *
 * `strict: false` : désactive la validation XSD interne de node-zugferd, qui
 * délègue à `xsd-schema-validator` (nécessite une JVM — indisponible ici).
 * La validation XSD + Schematron EN 16931 est faite côté module via
 * `@stafyniaksacha/facturx` (100 % WebAssembly), voir `FacturxValidator`.
 */
export const en16931Invoicer: Zugferd = zugferd({
  profile: EN16931,
  strict: false,
});

export type ZugferdDocument = ReturnType<typeof en16931Invoicer.create>;

/**
 * Forme (partielle, documentée) des données attendues par `create()` pour le
 * profil EN16931. Reflète `en16931Mask` de node-zugferd ; voir le mapper pour
 * le détail champ à champ.
 */
export interface ZugferdInvoiceData {
  number: string;
  typeCode: string;
  issueDate: Date;
  includedNote?: Array<{ content: string; subjectCode?: string }>;
  transaction: {
    line: unknown[];
    tradeAgreement: Record<string, unknown>;
    tradeDelivery?: Record<string, unknown>;
    tradeSettlement: Record<string, unknown>;
  };
}
