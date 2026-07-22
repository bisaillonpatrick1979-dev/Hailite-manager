from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
path = root / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')

# Uniformise les imports, même si le script principal a déjà remplacé une partie.
text = text.replace(
    "import { CANADIAN_REGIONS, US_REGIONS } from '../regionsData';",
    "import { getDefaultRegion, type MarketCode } from '../internationalRegions';"
)
if "from '../internationalRegions'" not in text:
    text = text.replace(
        "import { translations, fmt } from '../translations';",
        "import { getDefaultRegion, type MarketCode } from '../internationalRegions';\nimport { translations, fmt } from '../translations';"
    )

# Remplace le bloc régional historique par une version internationale et place
# le format monétaire dans la portée du composant.
pattern = re.compile(
    r"  const companyCountry = companyInfo\.country \|\| 'CA';\n"
    r"  const companyRegion = .*?;\n"
    r"  const isQuebec = .*?;\n"
    r"  const regionName = .*?;\n"
    r"  const t = translations\[currentLanguage\];\n"
    r"  const dateLocale = .*?;\n",
    re.DOTALL,
)
replacement = """  const companyCountry: MarketCode = companyInfo.country === 'US' || companyInfo.country === 'EU' ? companyInfo.country : 'CA';
  const companyRegion = getDefaultRegion(companyCountry, companyInfo.region);
  const isQuebec = companyCountry === 'CA' && companyRegion.code === 'QC';
  const regionName = currentLanguage === 'FR' ? companyRegion.nameFR : companyRegion.nameEN;
  const t = translations[currentLanguage];
  const dateLocale = companyInfo.dateLocale || (currentLanguage === 'FR' ? 'fr-CA' : 'en-CA');
  const currency = companyInfo.currency || (companyCountry === 'US' ? 'USD' : companyCountry === 'EU' ? 'EUR' : 'CAD');
  const money = (value: number) => new Intl.NumberFormat(dateLocale, { style: 'currency', currency }).format(Number(value || 0));
"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1 and 'const money = (value: number)' not in text:
    raise RuntimeError(f'Bloc régional ClientDocumentsManager non remplacé: {count}')

# La taxe locale doit faire partie du total configuré.
text = text.replace(
    "const taxRate = (companyInfo.taxRate1 ?? companyRegion.taxRate1) + (companyInfo.taxRate2 ?? companyRegion.taxRate2);",
    "const taxRate = (companyInfo.taxRate1 ?? companyRegion.taxRate1) + (companyInfo.taxRate2 ?? companyRegion.taxRate2) + (companyInfo.localTaxRate ?? 0);"
)

path.write_text(text, encoding='utf-8')
print('Post-correctif international du gestionnaire de documents appliqué.')
