# eFacture — POC de facturation électronique (EN 16931 / CIUS-FR)

POC Node.js + Express, en **clean architecture**, qui transforme un **JSON**
en facture électronique conforme à la réforme française. Un seul agrégat
métier EN 16931, trois sorties :

| `--format` | Contenu | Profil de validation |
|---|---|---|
| `facturx` (défaut) | PDF lisible + XML CII embarqué (PDF/A-3b) | EN 16931 générique |
| `cii` | XML CII (UN/CEFACT) seul | EN 16931 générique |
| `ubl` | XML UBL 2.1 (OASIS) seul | **CIUS-FR** (EN 16931 + BR-FR) |

```
JSON  ──▶  domaine EN 16931 (TVA, totaux, mentions FR)
            ├── format=ubl     ──▶  XML UBL 2.1 CIUS-FR
            ├── format=cii     ──▶  XML CII EN 16931
            └── format=facturx ──▶  PDF/A-3b + CII embarqué
```

L’UBL est le format au profil français **CIUS-FR** (XP Z12-012) : cadre de
facturation, notes légales, identifiants SIREN/SIRET et Schematron BR-FR.
Factur-X et le CII restent validés EN 16931 générique (pas encore
Extended-CTC-FR).

## Démarrage rapide

Prérequis : Node.js ≥ 20.11.

```bash
npm install

# CLI : un fichier JSON → une facture
npm run generate -- --input examples/invoice.full.json --output out/facture.pdf --format facturx --validate

# UBL CIUS-FR (le livrable « français » du POC)
npm run generate -- --input examples/invoice.full.json --output out/facture.ubl.xml --format ubl --validate

# Serveur HTTP de démonstration
npm run dev
```

```bash
curl -X POST 'http://localhost:3000/api/v1/einvoices?format=ubl&validate=true' \
  -H 'Content-Type: application/json' \
  --data @examples/invoice.full.json \
  --output facture.ubl.xml
```

Autres commandes : `npm run typecheck`, `npm test`, `npm run build`,
`npm run vendor:ubl` (régénère les Schematron compilés).

## Validation

`validate=true` (CLI `--validate`, requête `?validate=true`) lance une
validation **Schematron** du livrable (100 % JavaScript/WebAssembly, aucune
JVM) :

| Format | Moteur | Artefacts |
|---|---|---|
| `cii` / `facturx` | [`@stafyniaksacha/facturx`](https://github.com/stafyniaksacha/facturx) | XSD + Schematron EN 16931 |
| `ubl` | SaxonJS + XSLT compilé (SEF) | CEN EN 16931 v1.3.17 (`vendor/en16931-ubl/`) **puis** BR-FR Flux 2 FNFE-MPE v1.4.0.04 (`vendor/france-rfe/`) |

Le profil reporté pour l’UBL est `ubl:cius-fr`. Un document non conforme
fait échouer la CLI (code 2) et l’API HTTP (422).

## Conformité française (CIUS-FR)

Couvert **dans le document** (domaine + sérialiseur UBL + Schematron BR-FR) :

- identité vendeur/acheteur : SIREN (`schemeID="0002"`), SIRET établissement
  (`schemeID="0009"`), n° TVA
- adresses électroniques de routage (BT-34 / BT-49) : SIREN
  `schemeID="0225"`, déduites automatiquement si absentes du JSON
- n° de facture (BT-1, max 35 caractères `A-Z a-z 0-9 - + _ /`) et date
- date de livraison / exécution (BT-72)
- lignes, totaux HT par taux, TVA, TTC
- conditions et date d’échéance
- notes CIUS-FR (BG-1) :
  - `#PMD#` pénalités de retard (art. L441-10)
  - `#PMT#` indemnité forfaitaire de recouvrement (art. D441-5, 40 €)
  - `#AAB#` conditions d’escompte (ou « néant »)
  - `#BAR#B2B` traitement attendu (e-invoicing B2B par défaut)
- cadre de facturation (BT-23 / `ProfileID`), défaut `S1` (facture de services)
- `CustomizationID` = `urn:cen.eu:en16931:2017` (identifiant officiel CIUS-FR)

Contrôles métier : `Invoice.assertFrenchComplianceOrThrow()` avant toute
génération. Contrôles syntaxiques UBL : Schematron CEN puis BR-FR.

**Hors périmètre** (exigé par la réforme, mais ce n’est pas le rôle de
l’émetteur du fichier) : transmission via une Plateforme Agréée, signature
électronique, archivage à valeur probante, consultation de l’annuaire PPF,
profil **Extended-CTC-FR** (Factur-X / CII).

## Où s’arrête ce POC : la transmission passe par une Plateforme Agréée

Depuis l’abandon (oct. 2024) du portail public de facturation comme outil de
saisie/réception, **une entreprise ne transmet jamais une facture directement
à son client** : elle passe obligatoirement par une **Plateforme Agréée**
(PA, ex-PDP), qui route la facture vers la PA du destinataire, gère les
statuts de cycle de vie (déposée, reçue, encaissée, rejetée…) et transmet à
l’administration fiscale les données requises (facturation + e-reporting) via
l’annuaire central du PPF. Obligatoire à la réception dès le 1ᵉʳ septembre
2026 (toutes entreprises), et à l’émission dès 2026 pour les grandes
entreprises/ETI, 2027 pour PME/TPE.

Ce que ce POC produit — un **UBL CIUS-FR** ou un **Factur-X / CII EN 16931**
— est exactement ce qu’on remet en entrée à une PA. Un document valide n’est
pas « transmis » : le routage, les statuts et l’e-reporting restent à la
charge de la PA. Toute PA doit savoir recevoir les trois formats.

Sources : [economie.gouv.fr — ouverture de l’annuaire](https://www.economie.gouv.fr/actualites/facturation-electronique-ouverture-de-lannuaire-dedie),
[Pennylane — liste des PA](https://www.pennylane.com/fr/fiches-pratiques/facture-electronique/liste-des-pdp),
[e-invoicing-france.eu — formats et profils (XP Z12-012)](https://www.e-invoicing-france.eu/documentation/xp-z12-012/AFNOR-FE-XP-Z12-012-4-Formats-et-profils).

## Architecture (clean architecture)

Le cœur métier vit dans **`src/einvoicing/`**, un module autonome sans
dépendance à Express — c’est lui qu’on récupère pour l’intégrer ailleurs.

```
src/
  einvoicing/
    domain/            Invoice, Party, PaymentTerms, codes CIUS-FR
                       (french-e-invoicing.ts), totaux (invoice-calculator.ts,
                       point de calcul unique), ports
    application/       schéma JSON (zod), mapper → domaine,
                       GenerateEInvoiceUseCase / ValidateEInvoiceUseCase
    infrastructure/    UBL maison + Schematron CEN/BR-FR (SaxonJS),
                       node-zugferd (CII), pdfkit (PDF),
                       @stafyniaksacha/facturx (assemblage + validation CII)
    config/container.ts composition root
    index.ts            API publique du module
  interfaces/http/     Express (dépend de einvoicing/, jamais l’inverse)
  cli/generate.ts      CLI (même cas d’usage que le HTTP)
  main.ts              point d’entrée process
vendor/
  en16931-ubl/         Schematron CEN EN 16931 UBL v1.3.17
  france-rfe/          Schematron BR-FR Flux 2 v1.4.0.04
```

Règle de dépendance : `domain` n’importe rien · `application → domain` ·
`infrastructure → domain` (implémente les ports) · `interfaces` / `cli →
einvoicing/index.ts` uniquement.

## Format du JSON d’entrée

Schéma complet (zod) :
[`src/einvoicing/application/dto/generate-einvoice-input.ts`](src/einvoicing/application/dto/generate-einvoice-input.ts).
Exemples : [`examples/invoice.minimal.json`](examples/invoice.minimal.json)
(1 ligne, TVA 20 %) et [`examples/invoice.full.json`](examples/invoice.full.json)
(multi-taux, remise/frais document, ligne exonérée, acompte).

Points clés :

- `seller` / `buyer` : `siret` / `siren`, `vatNumber`, `address`, `contact`.
  Le SIREN de l’acheteur est requis entre assujettis français. L’adresse
  électronique (`electronicAddress`) est optionnelle : à défaut, le SIREN
  est émis en `schemeID="0225"`.
- `billingFramework` (optionnel, défaut `S1`) : cadre CIUS-FR (BT-23),
  ex. `S1` services, `B1` biens, `M1` mixte. Liste dans
  `french-e-invoicing.ts`.
- `barTreatment` (optionnel, défaut `B2B`) : `B2B`, `B2C`, `B2BINT`, etc.
- `lines[].tax.category` : code EN 16931 (UNTDID 5305). **`S`** couvre le
  taux standard **et** les taux réduits français (10 %, 5,5 %, 2,1 %) : seul
  `rate` change.
- `payment.latePenaltyRate` / `recoveryIndemnity` : mentions légales
  obligatoires, injectées en notes `#PMD#` / `#PMT#` et dans BT-20.
- `type` : `380` facture, `381` avoir (exige `precedingInvoice`), `384`
  rectificative, `386` acompte, `389` autofacturation.

## Intégrer dans un projet Express existant

1. Copier `src/einvoicing/` (et éventuellement
   `src/interfaces/http/routes/einvoicing.routes.ts` +
   `controllers/einvoicing.controller.ts`) ainsi que `vendor/en16931-ubl/`
   et `vendor/france-rfe/` pour la validation UBL.
2. Ajouter les dépendances : `node-zugferd`, `pdf-lib`, `pdfkit`, `zod`,
   `@stafyniaksacha/facturx`, `saxon-js` (versions dans `package.json`).
3. Soit monter le routeur prêt à l’emploi :

   ```ts
   import { createEInvoicingModule } from "./einvoicing/index.js";
   import { createEInvoicingRouter } from "./interfaces/http/routes/einvoicing.routes.js";

   const einvoicing = createEInvoicingModule({ validateByDefault: false });
   app.use("/api/v1/einvoices", createEInvoicingRouter(einvoicing));
   ```

   soit appeler le cas d’usage depuis un contrôleur / job existant :

   ```ts
   const { content, fileName } = await einvoicing.generateEInvoice(payload, {
     format: "ubl",
     validate: true,
   });
   ```

Le module est sans état (pas de DB, pas de `process.env` interne — la config
est passée explicitement) : fonction pure `JSON → facture`.

## Limites connues du POC

- **UBL** : sérialiseur maison (`infrastructure/serializers/ubl.serializer.ts`),
  profil CIUS-FR. Le XSD OASIS UBL 2.1 n’est pas embarqué ; les règles
  UBL-CR-* du Schematron CEN couvrent la cardinalité. Régénérer les
  artefacts : `npm run vendor:ubl`.
- **Factur-X / CII** : validés EN 16931 générique uniquement. `node-zugferd`
  n’émet pas le `ProfileID` / cadre BT-23 ; le profil Extended-CTC-FR n’est
  pas appliqué.
- **`node-zugferd@0.1.0`** (beta), contournements dans `sanitize-cii-xml.ts` :
  - la remise de ligne (BG-27) n’est pas émise en XML (le `chargeIndicator`
    n’a pas de xpath) ; elle reste dans `lineTotalAmount` (BT-131) ;
  - l’ordre XML de `CategoryTradeTax` pour les remises/frais document
    (BG-20/BG-21) est corrigé après coup ;
  - la validation XSD interne de node-zugferd est désactivée (`strict:
    false`, dépendance JVM) ; la validation réelle passe par
    `@stafyniaksacha/facturx` ;
  - l’assemblage PDF/A-3b utilise `@stafyniaksacha/facturx#generate()`
    (pas `embedInPdf()`, qui régénère le XML sans `sanitizeCiiXml`) ;
  - l’identifiant de trailer PDF de `pdfkit` (`/ID`) est retiré avant
    assemblage (`stripTrailerId`, via `pdf-lib`).

  À réévaluer si `node-zugferd` publie une version stable.

## Tests

```bash
npm test
```

- **Unitaires** (`tests/unit/`) : calcul de TVA/totaux, mapping JSON →
  domaine (cadre `S1`, notes PMD/PMT/AAB/BAR, endpoint `0225`), cas d’usage
  `GenerateEInvoiceUseCase` avec adaptateurs factices.
- **Intégration** (`tests/integration/`) : génère les 3 formats à partir des
  exemples. Factur-X/CII : XSD + Schematron EN 16931. UBL : Schematron CEN
  **et** BR-FR (profil `ubl:cius-fr`). Aucune lib n’est mockée.
