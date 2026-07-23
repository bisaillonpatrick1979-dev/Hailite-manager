from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'components' / 'CatalogueManager.tsx'
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    text = text.replace(old, new, 1)


# La disposition horizontale précédente comprimait la zone du nom et du
# fournisseur sur tablette. Une grille réserve maintenant une vraie colonne à
# l'image et aux renseignements. Les prix passent sur une rangée complète tant
# que l'écran n'est pas assez large.
replace_once(
    'className="p-3 bg-gray-900 border border-gray-850 hover:border-gray-800 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 text-xs transition duration-200"',
    'className="p-3 bg-gray-900 border border-gray-850 hover:border-gray-800 rounded-2xl grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-xs transition duration-200 xl:grid-cols-[80px_minmax(220px,1fr)_minmax(240px,auto)] xl:items-center"',
    'grille fiche catalogue'
)

replace_once(
    'className="w-full h-24 sm:w-20 sm:h-20 flex-shrink-0"',
    'className="h-[92px] w-[92px] flex-shrink-0 xl:h-20 xl:w-20"',
    'dimensions image catalogue'
)

replace_once(
    'className="flex-1 min-w-0 text-left"',
    'className="min-w-0 text-left"',
    'zone renseignements catalogue'
)

replace_once(
    'className="text-[10px] text-gray-500 font-mono mt-0.5"',
    'className="mt-1 break-words text-xs leading-relaxed text-gray-400"',
    'lisibilité fournisseur catalogue'
)

replace_once(
    'className="grid grid-cols-3 sm:flex gap-1.5 font-mono text-[10px] flex-shrink-0"',
    'className="col-span-2 grid min-w-0 grid-cols-3 gap-2 font-mono text-[10px] xl:col-span-1"',
    'rangée prix catalogue'
)

# Les cartes de prix utilisent toute la largeur disponible au lieu d'imposer
# trois petites largeurs fixes qui recouvraient les renseignements.
text = text.replace(
    'className="bg-gray-950 rounded p-1.5 border border-gray-850 text-center sm:w-16"',
    'className="min-w-0 rounded-lg border border-gray-850 bg-gray-950 p-2 text-center"'
)
if text.count('className="min-w-0 rounded-lg border border-gray-850 bg-gray-950 p-2 text-center"') < 3:
    raise RuntimeError('Les trois cartes de prix n’ont pas été corrigées')

replace_once(
    'className="text-gray-500 uppercase whitespace-nowrap"',
    'className="truncate text-[9px] uppercase text-gray-500"',
    'libellé premier prix'
)
# Les deux autres libellés identiques doivent aussi être modifiés.
text = text.replace(
    'className="text-gray-500 uppercase whitespace-nowrap"',
    'className="truncate text-[9px] uppercase text-gray-500"'
)
if text.count('className="truncate text-[9px] uppercase text-gray-500"') < 3:
    raise RuntimeError('Les trois libellés de prix n’ont pas été corrigés')

replace_once(
    "className={`text-[11px] font-black flex-shrink-0 sm:w-32 text-left sm:text-right ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}",
    "className={`col-span-2 text-sm font-black text-left xl:col-span-1 ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}",
    'position marge catalogue'
)

replace_once(
    'className="flex gap-1.5 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-850"',
    'className="col-span-2 flex flex-wrap justify-end gap-2 border-t border-gray-850 pt-3 xl:col-span-2"',
    'position boutons catalogue'
)

path.write_text(text, encoding='utf-8')
print('Cartes du catalogue réorganisées : fournisseur, prix et boutons ne se chevauchent plus.')
