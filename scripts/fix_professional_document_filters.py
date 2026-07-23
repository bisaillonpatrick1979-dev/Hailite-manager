from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')

text = text.replace(
    "useState<'all' | 'draft' | 'sent' | 'accepted' | 'paid' | 'overdue'>('all')",
    "useState<'all' | 'draft' | 'sent' | 'accepted' | 'completed' | 'paid' | 'overdue'>('all')"
)

completed_option = "              { id: 'completed', label: currentLanguage === 'FR' ? 'Terminé' : 'Completed' },\n"
if completed_option not in text:
    anchor = "              { id: 'accepted', label: t.cdmStatusAccepted },\n"
    if anchor not in text:
        raise RuntimeError('Filtre accepté introuvable')
    text = text.replace(anchor, anchor + completed_option, 1)

old_search = """      (doc.refQuote && doc.refQuote.toLowerCase().includes(searchQuery.toLowerCase()));
"""
new_search = """      (doc.refQuote && doc.refQuote.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (doc.refContract && doc.refContract.toLowerCase().includes(searchQuery.toLowerCase()));
"""
if old_search in text:
    text = text.replace(old_search, new_search, 1)
elif 'doc.refContract && doc.refContract.toLowerCase()' not in text:
    raise RuntimeError('Recherche des références documentaires introuvable')

path.write_text(text, encoding='utf-8')
print('Filtres et recherche du parcours documentaire corrigés.')
