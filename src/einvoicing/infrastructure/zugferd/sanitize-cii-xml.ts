/**
 * Correctifs de compatibilité appliqués au XML CII produit par node-zugferd
 * (0.1.0, EN16931/BASIC-WL) avant validation/embarquement.
 *
 * Bug amont : pour `ram:CategoryTradeTax` sous `ram:SpecifiedTradeAllowanceCharge`
 * (remises/frais au niveau document, BG-20/BG-21), le champ `TypeCode` est un
 * `additionalXml` toujours fusionné *après* les champs normaux du groupe
 * (`CategoryCode`, `RateApplicablePercent`), ce qui viole la séquence attendue
 * par le XSD Factur-X (`TypeCode` doit précéder `CategoryCode`). On réordonne
 * ici ce seul fragment. À retirer si une version corrigée de node-zugferd
 * fixe l'ordre de rendu de `additionalXml`.
 */
export function sanitizeCiiXml(xml: string): string {
  return xml.replace(
    /<ram:CategoryTradeTax>([\s\S]*?)<\/ram:CategoryTradeTax>/g,
    (block, inner: string) => {
      const typeCodeMatch = inner.match(/<ram:TypeCode>[\s\S]*?<\/ram:TypeCode>/);
      if (!typeCodeMatch) return block;
      const typeCode = typeCodeMatch[0];
      const rest = inner.replace(typeCode, "");
      return `<ram:CategoryTradeTax>${typeCode}${rest}</ram:CategoryTradeTax>`;
    },
  );
}
