from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src' / 'components' / 'OnboardingScreen.tsx'
text = path.read_text(encoding='utf-8')

needle = "</dd><div><dt className=\"text-gray-400\">{isFR ? 'Fichier de sauvegarde'"
replacement = "</dd></div><div><dt className=\"text-gray-400\">{isFR ? 'Fichier de sauvegarde'"

if needle in text:
    text = text.replace(needle, replacement, 1)
elif replacement not in text:
    raise RuntimeError('Résumé du stockage introuvable pour correction')

path.write_text(text, encoding='utf-8')
print('Balises du résumé de stockage corrigées.')
