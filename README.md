# eFacture — POC de facturation électronique (Factur-X / EN 16931)

POC Node.js + Express, en **clean architecture**, qui transforme un **JSON**
décrivant une facture en **facture électronique conforme** à la réforme
française : **Factur-X** (PDF/A-3b lisible + XML CII embarqué, profil
**EN 16931**), avec export possible du **XML CII** ou **UBL** seuls.

```
JSON facture  ──▶  domaine (calcul TVA/totaux)  ──▶  CII / PDF  ──▶  Factur-X (PDF/A-3b)
```

## Démarrage rapide

```bash
npm install

# CLI : un fichier JSON → une facture
npm run generate -- --input examples/invoice.full.json --output out/facture.pdf --format facturx --validate

# Serveur HTTP de démonstration
npm run dev
```

```bash
curl -X POST 'http://localhost:3000/api/v1/einvoices?format=facturx&validate=true' \
  -H 'Content-Type: application/json' \
  --data @examples/invoice.full.json \
  --output facture.pdf
```

Autres commandes : `npm run typecheck`, `npm test`, `npm run build`.

## Formats produits

| `--format` | Contenu | Conteneur |
|---|---|---|
| `facturx` (défaut) | PDF lisible + XML CII embarqué | PDF/A-3b |
| `cii` | XML CII (UN/CEFACT) seul | — |
| `ubl` | XML UBL 2.1 (OASIS) seul | — |

Le paramètre `validate=true` (CLI `--validate`, requête `?validate=true`)
déclenche une validation **XSD + Schematron EN 16931** du livrable produit
via [`@stafyniaksacha/facturx`](https://github.com/stafyniaksacha/facturx)
(100 % WebAssembly, aucune JVM requise). `cii` et `facturx` sont validés ;
`ubl` ne l'est pas (voir [Limites](#limites-connues-du-poc)).

## Architecture (clean architecture)

Le cœur métier vit dans **`src/einvoicing/`**, un module autonome sans
dépendance à Express — c'est lui qu'on récupère pour l'intégrer ailleurs.

```
src/
  einvoicing/
    domain/            entités (Invoice, InvoiceLine), value objects (Money,
                        Party, TaxCategory, PaymentTerms), calcul des totaux
                        (invoice-calculator.ts — point de calcul unique,
                        partagé par le PDF et le XML), ports (interfaces)
    application/       schéma d'entrée (zod), mapper JSON → domaine,
                        cas d'usage (GenerateEInvoiceUseCase, ValidateEInvoiceUseCase)
    infrastructure/     adaptateurs concrets : node-zugferd (CII), pdfkit (PDF),
                        UBL fait main, @stafyniaksacha/facturx (assemblage
                        Factur-X + validation)
    config/container.ts composition root (injecte les adaptateurs dans les cas d'usage)
    index.ts            API PUBLIQUE du module
  interfaces/http/       Express : routes, contrôleur, middlewares (dépend de einvoicing/, jamais l'inverse)
  cli/generate.ts        CLI (même cas d'usage que le HTTP)
  main.ts                point d'entrée process
```

Règle de dépendance : `domain` n'importe rien · `application → domain` ·
`infrastructure → domain` (implémente les ports) · `interfaces`/`cli →
einvoicing/index.ts` uniquement.

## Format du JSON d'entrée

Schéma complet (zod) : [`src/einvoicing/application/dto/generate-einvoice-input.ts`](src/einvoicing/application/dto/generate-einvoice-input.ts).
Exemples : [`examples/invoice.minimal.json`](examples/invoice.minimal.json)
(1 ligne, TVA 20 %) et [`examples/invoice.full.json`](examples/invoice.full.json)
(multi-taux, remise/frais document, ligne exonérée, acompte).

Points clés :
- `seller`/`buyer` : `siret`/`siren`, `vatNumber`, `address`, `contact` — le
  SIREN de l'acheteur est requis entre assujettis français (réforme 2026).
- `lines[].tax.category` : code EN 16931 (UNTDID 5305) — **`S`** couvre le
  taux standard **et** les taux réduits français (10 %, 5,5 %, 2,1 %) : seul
  `rate` change, il n'existe pas de code dédié « taux réduit ».
- `payment.latePenaltyRate` / `recoveryIndemnity` : mentions légales
  obligatoires (pénalités de retard, indemnité forfaitaire de 40 €, art.
  L441-10 / D441-5 du Code de commerce) — injectées dans le PDF et le XML
  (BT-20).

## Mentions obligatoires françaises couvertes

Identité + SIRET/SIREN + n° TVA vendeur · SIREN acheteur (FR↔FR) · n° et date
de facture · date de livraison/exécution · lignes (désignation, quantité, PU
HT, taux) · totaux HT par taux, TVA, TTC · conditions et date de règlement ·
pénalités de retard + indemnité de recouvrement · conditions d'escompte ·
motif d'exonération de TVA le cas échéant. Contrôlées par
`Invoice.assertFrenchComplianceOrThrow()` avant toute génération (HTTP 422 /
`InvoiceValidationError` si non conforme).

Hors périmètre POC : transmission via PDP/PPF, signature électronique,
archivage à valeur probante.

## Où s'arrête ce POC : la transmission passe par une Plateforme Agréée

Depuis l'abandon (oct. 2024) du portail public de facturation comme outil de
saisie/réception, **une entreprise ne transmet jamais une facture directement
à son client** : elle passe obligatoirement par une **Plateforme Agréée**
(PA, ex-PDP), qui route la facture vers la PA du destinataire, gère les
statuts de cycle de vie (déposée, reçue, encaissée, rejetée…) et transmet à
l'administration fiscale les données requises (facturation + e-reporting) via
l'annuaire central du PPF. C'est obligatoire pour la réception depuis le 1ᵉʳ
septembre 2026 (toutes entreprises), et pour l'émission dès 2026 pour les
grandes entreprises/ETI, 2027 pour PME/TPE.

Ce que ce POC produit — **un document EN 16931 valide (Factur-X, CII ou
UBL)** — est exactement ce qu'on remet en entrée à une PA : la responsabilité
du routage, des statuts de cycle de vie et de l'e-reporting est portée par la
PA, pas par le logiciel émetteur. Deux nuances à connaître avant de brancher
une PA en aval :

- **UBL généré ici : conforme EN 16931 générique, pas encore au profil
  français.** Le socle DGFiP ajoute une extension nationale au-dessus d'EN
  16931 — **CIUS-FR** pour UBL, **Extended-CTC-FR** pour Factur-X/CII —
  portant les règles métier et statuts propres au contrôle continu français
  (publiée dans les spécifications externes, cf. AFNOR XP Z12-012). Notre
  validateur (`@stafyniaksacha/facturx`) vérifie l'EN 16931 générique, pas ce
  profil FR. Un document « valide EN 16931 » n'est donc pas automatiquement
  « accepté tel quel par une PA française » — à vérifier avec la PA ciblée.
- **Toute PA doit savoir recevoir les 3 formats, mais Factur-X/CII restent le
  chemin le plus éprouvé** (héritage Chorus Pro) et sont les deux seuls
  formats que ce POC valide réellement (XSD + Schematron). L'UBL maison reste
  documenté comme non validé (cf. Limites connues) : à consolider avant de
  s'appuyer dessus pour un flux de production.

Sources : [economie.gouv.fr — ouverture de l'annuaire](https://www.economie.gouv.fr/actualites/facturation-electronique-ouverture-de-lannuaire-dedie),
[Pennylane — liste des PA](https://www.pennylane.com/fr/fiches-pratiques/facture-electronique/liste-des-pdp),
[e-invoicing-france.eu — formats et profils (XP Z12-012)](https://www.e-invoicing-france.eu/documentation/xp-z12-012/AFNOR-FE-XP-Z12-012-4-Formats-et-profils).

## Intégrer dans un projet Express existant

1. Copier le dossier `src/einvoicing/` (et éventuellement
   `src/interfaces/http/routes/einvoicing.routes.ts` +
   `controllers/einvoicing.controller.ts` si vous voulez l'API REST telle
   quelle) dans le projet cible.
2. Ajouter les dépendances : `node-zugferd`, `pdf-lib`, `pdfkit`, `zod`,
   `@stafyniaksacha/facturx` (versions dans `package.json`).
3. Soit monter le routeur prêt à l'emploi :
   ```ts
   import { createEInvoicingModule } from "./einvoicing/index.js";
   import { createEInvoicingRouter } from "./interfaces/http/routes/einvoicing.routes.js";

   const einvoicing = createEInvoicingModule({ validateByDefault: false });
   app.use("/api/v1/einvoices", createEInvoicingRouter(einvoicing));
   ```
   soit appeler directement le cas d'usage depuis un contrôleur / job existant :
   ```ts
   const { content, fileName } = await einvoicing.generateEInvoice(payload, { format: "facturx" });
   ```

Le module est sans état (pas de DB, pas de `process.env` interne — la config
est passée explicitement) : fonction pure `JSON → facture`, sûre à intégrer
tel quel dans une app qui a déjà sa propre auth, logging, etc.

## Limites connues du POC

- **UBL** : sérialiseur maison (`infrastructure/serializers/ubl.serializer.ts`),
  couvre les BT/BG essentiels mais n'est pas validé par Schematron EN 16931
  (hors périmètre POC — CII/Factur-X reste le chemin conforme vérifié).
- **`node-zugferd@0.1.0`** (beta) a deux limites contournées explicitement
  dans le code (voir commentaires + `sanitize-cii-xml.ts`) :
  - la remise de ligne (BG-27, `SpecifiedTradeAllowanceCharge`) n'est pas
    émise : son champ `chargeIndicator` n'a pas de xpath dans cette version,
    ce qui produirait un XML invalide. La remise reste pleinement reflétée
    dans `lineTotalAmount` (BT-131), qui seul alimente les totaux/TVA.
  - pour les remises/frais **document** (BG-20/BG-21), l'ordre XML de
    `CategoryTradeTax` est corrigé après coup (`sanitizeCiiXml`) car
    `TypeCode` (un champ `additionalXml`) est toujours fusionné après
    `CategoryCode`/`RateApplicablePercent`, ce qui viole la séquence XSD.
  - la validation XSD interne de node-zugferd est désactivée (`strict:
    false`) car elle dépend de `xsd-schema-validator`, qui nécessite une
    JVM. La validation XSD + Schematron réelle est faite par
    `@stafyniaksacha/facturx`.
  - l'assemblage PDF/A-3b n'utilise pas `embedInPdf()` (qui régénère son
    propre XML en interne, sans passer par `sanitizeCiiXml`) mais
    `@stafyniaksacha/facturx#generate()`, à qui l'on fournit le XML déjà
    assaini.
  - `pdfkit` pose un identifiant de trailer PDF (`/ID`) que
    `@stafyniaksacha/facturx#generate()` ne sait pas encore remplacer ; il
    est retiré avant assemblage (`stripTrailerId`, via `pdf-lib`).

  À réévaluer si `node-zugferd` publie une version stable corrigeant ces
  points.

## Tests

```bash
npm test
```

- **Unitaires** (`tests/unit/`) : calcul de TVA/totaux (`invoice-calculator`),
  mapping JSON → domaine, cas d'usage `GenerateEInvoiceUseCase` avec des
  adaptateurs factices (pas de dépendance aux libs externes).
- **Intégration** (`tests/integration/`) : génère réellement les 3 formats à
  partir des exemples et valide le résultat (XSD + Schematron EN 16931 pour
  Factur-X/CII) — aucune lib n'est mockée.
