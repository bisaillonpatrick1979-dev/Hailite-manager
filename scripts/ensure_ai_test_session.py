from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')

text = text.replace(
    "import { authHeaders } from './apiClient';",
    "import { authHeaders, authLogin, getAuthToken } from './apiClient';"
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

path.write_text(text, encoding='utf-8')
print('Jeton IA des profils test restauré automatiquement au chargement.')
