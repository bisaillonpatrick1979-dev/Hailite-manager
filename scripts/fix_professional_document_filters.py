from pathlib import Path
import re

path = Path(__file__).resolve().parents[1] / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')

# Type du filtre : accepte le nouveau statut, quelle que soit la mise en forme.
text = text.replace(
    "useState<'all' | 'draft' | 'sent' | 'accepted' | 'paid' | 'overdue'>('all')",
    "useState<'all' | 'draft' | 'sent' | 'accepted' | 'completed' | 'paid' | 'overdue'>('all')"
)

# Ajoute l’option immédiatement après « accepté ». Le regex tolère les espaces,
# retours de ligne et reformattages produits par les scripts précédents.
completed_marker = "{ id: 'completed', label: currentLanguage === 'FR' ? 'Terminé' : 'Completed' }"
if completed_marker not in text:
    pattern = re.compile(
        r"(\{\s*id:\s*'accepted'\s*,\s*label:\s*t\.cdmStatusAccepted\s*\},?)"
    )
    text, count = pattern.subn(
        r"\1\n              { id: 'completed', label: currentLanguage === 'FR' ? 'Terminé' : 'Completed' },",
        text,
        count=1,
    )
    if count != 1:
        raise RuntimeError('Filtre accepté introuvable après le parcours documentaire')

# La recherche trouve aussi une facture à partir du numéro de son contrat.
if 'doc.refContract && doc.refContract.toLowerCase()' not in text:
    pattern = re.compile(
        r"\(doc\.refQuote\s*&&\s*doc\.refQuote\.toLowerCase\(\)\.includes\(searchQuery\.toLowerCase\(\)\)\)\s*;"
    )
    text, count = pattern.subn(
        "(doc.refQuote && doc.refQuote.toLowerCase().includes(searchQuery.toLowerCase())) ||\n"
        "      (doc.refContract && doc.refContract.toLowerCase().includes(searchQuery.toLowerCase()));",
        text,
        count=1,
    )
    if count != 1:
        raise RuntimeError('Recherche par référence de devis introuvable')

path.write_text(text, encoding='utf-8')
print('Filtres et recherche du parcours documentaire corrigés.')
