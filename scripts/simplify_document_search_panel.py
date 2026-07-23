from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')

# La liste ne dépend plus de filtres cachés. Elle affiche tous les documents et
# la seule réduction possible est la recherche demandée par l'utilisateur.
search_start = text.find('  // Filters calculation\n')
search_end = text.find('  // Aggregated totals\n', search_start)
if search_start == -1 or search_end == -1:
    raise RuntimeError(f'Calcul de recherche introuvable: debut={search_start}, fin={search_end}')

search_logic = """  // Recherche unique dans tous les devis, contrats et factures.
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredDocs = documents.filter(doc => {
    if (!normalizedSearch) return true;

    const documentTypeLabel = doc.type === 'quote'
      ? 'devis quote soumission'
      : doc.type === 'contract'
        ? 'contrat contract travaux'
        : 'facture invoice';

    return [
      doc.number,
      doc.clientName,
      doc.clientAddress,
      doc.clientEmail,
      doc.clientPhone,
      doc.siteAddress,
      doc.refQuote,
      doc.refContract,
      doc.status,
      documentTypeLabel
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(normalizedSearch));
  });

"""
text = text[:search_start] + search_logic + text[search_end:]

# Retire l'ancien bloc complet : bouton rapide, onglets de type et filtres de
# statut. Les trois grandes cartes au-dessus demeurent les seules commandes de
# création. La recherche reste immédiatement au-dessus de la liste.
panel_start = text.find('      {/* 🔍 FILTER BAR */}')
panel_end = text.find('      {/* 📋 DOCUMENT GRID / LIST */}', panel_start)
if panel_start == -1 or panel_end == -1:
    raise RuntimeError(f'Ancien panneau de filtres introuvable: debut={panel_start}, fin={panel_end}')

search_panel = """      {/* Recherche unique — les créations restent uniquement dans les trois cartes du haut. */}
      <div id="document-search-only" className="rounded-2xl border border-gray-850 bg-[#12131A] p-4 sm:p-5">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder={currentLanguage === 'FR'
              ? 'Rechercher un client, un numéro de devis, de contrat ou de facture…'
              : 'Search a client, quote, contract, or invoice number…'}
            aria-label={currentLanguage === 'FR' ? 'Rechercher dans tous les documents' : 'Search all documents'}
            className="min-h-14 w-full rounded-xl border border-gray-800 bg-gray-900 py-3 pl-12 pr-4 text-base text-white placeholder:text-gray-500 focus:border-orange-500 focus:outline-none"
          />
        </div>
        {searchQuery.trim() && (
          <p className="mt-2 px-1 text-xs font-bold text-gray-400">
            {filteredDocs.length} {currentLanguage === 'FR' ? 'résultat(s) trouvé(s)' : 'result(s) found'}
          </p>
        )}
      </div>

"""
text = text[:panel_start] + search_panel + text[panel_end:]

path.write_text(text, encoding='utf-8')
print('Ancien panneau de création et de filtres retiré; recherche unique conservée.')
