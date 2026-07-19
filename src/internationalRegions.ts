import { CANADIAN_REGIONS, US_REGIONS, type TaxRegion } from './regionsData';

export type MarketCode = 'CA' | 'US' | 'EU';
export type UnitSystem = 'imperial' | 'metric';

export interface JurisdictionDefaults {
  market: MarketCode;
  region: TaxRegion;
  currency: string;
  locale: string;
  unitSystem: UnitSystem;
  taxWarningFR: string;
  taxWarningEN: string;
}

const eu = (
  code: string,
  nameFR: string,
  nameEN: string,
  vat: number,
  currency = 'EUR',
  locale = 'en-IE'
): TaxRegion & { currency: string; locale: string } => ({
  code,
  nameFR,
  nameEN,
  taxRate1: vat,
  taxRate2: 0,
  taxRate1NameFR: `TVA standard (${vat * 100}%)`,
  taxRate1NameEN: `Standard VAT (${vat * 100}%)`,
  taxRate2NameFR: 'Autre taxe',
  taxRate2NameEN: 'Other tax',
  currency,
  locale
});

// Taux standard publiés par l’Union européenne. Les travaux immobiliers peuvent
// relever d’un taux réduit, d’une règle de lieu de l’immeuble ou de l’autoliquidation.
export const EU_REGIONS: Array<TaxRegion & { currency: string; locale: string }> = [
  eu('AT', 'Autriche', 'Austria', 0.20, 'EUR', 'de-AT'),
  eu('BE', 'Belgique', 'Belgium', 0.21, 'EUR', 'fr-BE'),
  eu('BG', 'Bulgarie', 'Bulgaria', 0.20, 'EUR', 'bg-BG'),
  eu('HR', 'Croatie', 'Croatia', 0.25, 'EUR', 'hr-HR'),
  eu('CY', 'Chypre', 'Cyprus', 0.19, 'EUR', 'el-CY'),
  eu('CZ', 'Tchéquie', 'Czechia', 0.21, 'CZK', 'cs-CZ'),
  eu('DK', 'Danemark', 'Denmark', 0.25, 'DKK', 'da-DK'),
  eu('EE', 'Estonie', 'Estonia', 0.24, 'EUR', 'et-EE'),
  eu('FI', 'Finlande', 'Finland', 0.255, 'EUR', 'fi-FI'),
  eu('FR', 'France', 'France', 0.20, 'EUR', 'fr-FR'),
  eu('DE', 'Allemagne', 'Germany', 0.19, 'EUR', 'de-DE'),
  eu('EL', 'Grèce', 'Greece', 0.24, 'EUR', 'el-GR'),
  eu('HU', 'Hongrie', 'Hungary', 0.27, 'HUF', 'hu-HU'),
  eu('IE', 'Irlande', 'Ireland', 0.23, 'EUR', 'en-IE'),
  eu('IT', 'Italie', 'Italy', 0.22, 'EUR', 'it-IT'),
  eu('LV', 'Lettonie', 'Latvia', 0.21, 'EUR', 'lv-LV'),
  eu('LT', 'Lituanie', 'Lithuania', 0.21, 'EUR', 'lt-LT'),
  eu('LU', 'Luxembourg', 'Luxembourg', 0.17, 'EUR', 'fr-LU'),
  eu('MT', 'Malte', 'Malta', 0.18, 'EUR', 'mt-MT'),
  eu('NL', 'Pays-Bas', 'Netherlands', 0.21, 'EUR', 'nl-NL'),
  eu('PL', 'Pologne', 'Poland', 0.23, 'PLN', 'pl-PL'),
  eu('PT', 'Portugal', 'Portugal', 0.23, 'EUR', 'pt-PT'),
  eu('RO', 'Roumanie', 'Romania', 0.21, 'RON', 'ro-RO'),
  eu('SK', 'Slovaquie', 'Slovakia', 0.23, 'EUR', 'sk-SK'),
  eu('SI', 'Slovénie', 'Slovenia', 0.22, 'EUR', 'sl-SI'),
  eu('ES', 'Espagne', 'Spain', 0.21, 'EUR', 'es-ES'),
  eu('SE', 'Suède', 'Sweden', 0.25, 'SEK', 'sv-SE')
];

export function getRegionsForMarket(market: MarketCode): TaxRegion[] {
  if (market === 'US') return US_REGIONS;
  if (market === 'EU') return EU_REGIONS;
  return CANADIAN_REGIONS;
}

export function getDefaultRegion(market: MarketCode, preferred?: string): TaxRegion {
  const regions = getRegionsForMarket(market);
  return regions.find(region => region.code === preferred)
    || (market === 'CA' ? regions.find(region => region.code === 'AB') : undefined)
    || (market === 'US' ? regions.find(region => region.code === 'CA') : undefined)
    || (market === 'EU' ? regions.find(region => region.code === 'FR') : undefined)
    || regions[0];
}

export function getJurisdictionDefaults(market: MarketCode, regionCode?: string): JurisdictionDefaults {
  const region = getDefaultRegion(market, regionCode);
  if (market === 'US') {
    return {
      market,
      region,
      currency: 'USD',
      locale: 'en-US',
      unitSystem: 'imperial',
      taxWarningFR: 'Le taux affiché est le taux de base de l’État. Les taxes de comté, de ville, de district et la taxabilité des travaux de construction doivent être ajoutées ou confirmées.',
      taxWarningEN: 'The displayed rate is the state base rate. County, city, district taxes and the taxability of construction work must be added or confirmed.'
    };
  }
  if (market === 'EU') {
    const euRegion = EU_REGIONS.find(item => item.code === region.code) || EU_REGIONS[0];
    return {
      market,
      region,
      currency: euRegion.currency,
      locale: euRegion.locale,
      unitSystem: 'metric',
      taxWarningFR: 'La TVA standard est préremplie. Les travaux immobiliers peuvent relever d’un taux réduit, de la règle du lieu de l’immeuble ou de l’autoliquidation. Validez le taux avec l’administration fiscale ou un professionnel.',
      taxWarningEN: 'Standard VAT is prefilled. Immovable-property work may use a reduced rate, property-location rule, or reverse charge. Confirm the rate with the tax authority or a professional.'
    };
  }
  return {
    market,
    region,
    currency: 'CAD',
    locale: 'en-CA',
    unitSystem: 'imperial',
    taxWarningFR: 'Le taux est prérempli selon la province ou le territoire. La nature de la fourniture et les règles du lieu de fourniture doivent être confirmées.',
    taxWarningEN: 'The rate is prefilled by province or territory. The type of supply and place-of-supply rules must still be confirmed.'
  };
}

export function marketLabel(market: MarketCode, language: 'FR' | 'EN'): string {
  if (market === 'US') return language === 'FR' ? 'États-Unis' : 'United States';
  if (market === 'EU') return language === 'FR' ? 'Union européenne' : 'European Union';
  return 'Canada';
}
