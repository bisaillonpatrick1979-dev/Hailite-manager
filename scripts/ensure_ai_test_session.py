from pathlib import Path
import re

path = Path(__file__).resolve().parents[1] / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')

# Les scripts précédents peuvent ajouter d'autres fonctions dans l'import
# apiClient. On complète donc l'import existant plutôt que d'exiger une forme
# exacte à un seul symbole.
match = re.search(r"import \{([^}]*)\} from './apiClient';", text)
if match:
    names = [name.strip() for name in match.group(1).split(',') if name.strip()]
    for required in ['authHeaders', 'authLogin', 'getAuthToken']:
        if required not in names:
            names.append(required)
    replacement = "import { " + ", ".join(names) + " } from './apiClient';"
    text = text[:match.start()] + replacement + text[match.end():]
else:
    anchor_import = "import { translations, fmt } from './translations';"
    if anchor_import not in text:
        raise RuntimeError('Import apiClient et ancre translations introuvables')
    text = text.replace(
        anchor_import,
        "import { authHeaders, authLogin, getAuthToken } from './apiClient';\n" + anchor_import,
        1
    )

anchor = """  const [aiProviderStatusError, setAiProviderStatusError] = useState<boolean>(false);

"""
addition = anchor + """  // Les versions précédentes du scénario annuel pouvaient restaurer un profil
  // local sans jeton serveur. On répare automatiquement cette session afin que
  // l'assistant retrouve immédiatement les clés Vercel, sans nouvelle connexion.
  useEffect(() => {
    if (!activeEmployee?.id.startsWith('test-') || !activeEmployee.nip || getAuthToken()) return;
    authLogin(activeEmployee.id, activeEmployee.nip).catch(() => undefined);
  }, [activeEmployee?.id, activeEmployee?.nip]);

"""
if 'On répare automatiquement cette session' not in text:
    if anchor not in text:
        raise RuntimeError('Ancre de restauration automatique du jeton IA introuvable')
    text = text.replace(anchor, addition, 1)

if 'authLogin' not in text.split('\n', 15)[0:15] and "from './apiClient'" not in text[:1000]:
    raise RuntimeError('Import authLogin/getAuthToken non appliqué')

path.write_text(text, encoding='utf-8')
print('Jeton IA des profils test restauré automatiquement au chargement.')
