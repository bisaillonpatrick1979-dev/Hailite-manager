from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')

# Les scripts précédents installent déjà les gardes cloudSyncAllowed sur toutes
# les opérations réseau. Ici, on vérifie qu'ils sont bien présents et que le
# mode de validation local ne peut jamais les réactiver.
required_fragments = [
    "const localTestModeEnabled = () =>",
    "if (localTestModeEnabled()) return false;",
    "cloudSyncAllowed = localTestModeEnabled() ? false : allowed;",
    "if (!cloudSyncAllowed) return { status: 'unavailable' };",
    "if (!cloudSyncAllowed) return [];",
    "if (!cloudSyncAllowed) throw new Error('Cloud sync disabled by company settings');",
    "if (!cloudSyncAllowed) return { enabled: false, tables: {} };"
]

missing = [fragment for fragment in required_fragments if fragment not in text]
if missing:
    raise RuntimeError(
        'Verrou réseau incomplet en mode test : ' + ' | '.join(missing)
    )

# Vérifie aussi que toutes les fonctions de base de données sont protégées.
for signature in [
    'async function dbList(',
    'async function dbInsert(',
    'async function dbUpsert(',
    'async function dbUpdate(',
    'async function dbDelete('
]:
    start = text.find(signature)
    if start < 0:
        raise RuntimeError(f'Fonction réseau introuvable : {signature}')
    block = text[start:start + 360]
    if "if (!cloudSyncAllowed)" not in block:
        raise RuntimeError(f'Fonction réseau non protégée : {signature}')

print('Tous les accès cloud sont bloqués et vérifiés en mode de validation local.')
