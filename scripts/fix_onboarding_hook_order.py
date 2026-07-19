from pathlib import Path
import re

path = Path(__file__).resolve().parents[1] / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')

# React exige que tous les hooks soient appelés dans le même ordre à chaque
# rendu. L'ancien retour anticipé de l'onboarding se trouvait avant plusieurs
# useEffect : terminer l'onboarding ajoutait soudainement des hooks et React
# arrêtait le rendu, laissant uniquement le fond noir jusqu'au rechargement.
guard_pattern = re.compile(
    r"\n  if \(!isOnboarded(?: \|\| companyInfo\.complianceVersion !== '2026\.07')?\) \{\n"
    r"    return <Suspense fallback=\{<LazySectionFallback />\}><OnboardingScreen /></Suspense>;\n"
    r"  \}\n"
)

matches = list(guard_pattern.finditer(text))
if len(matches) > 1:
    raise RuntimeError(f'Plusieurs gardes onboarding trouvées: {len(matches)}')
if matches:
    text = guard_pattern.sub('\n', text, count=1)

main_return = """  return (
    <div 
      id=\"main-scaffold-container\"
"""
if main_return not in text:
    raise RuntimeError('Retour principal de App.tsx introuvable')

safe_guard = """  // Le garde onboarding doit rester APRÈS tous les hooks React. Le déplacer
  // avant un useEffect provoque « Rendered more hooks than during the previous
  // render » et un écran noir au moment de terminer la configuration.
  if (!isOnboarded || companyInfo.complianceVersion !== '2026.07') {
    return <Suspense fallback={<LazySectionFallback />}><OnboardingScreen /></Suspense>;
  }

"""

if 'Le garde onboarding doit rester APRÈS tous les hooks React' not in text:
    text = text.replace(main_return, safe_guard + main_return, 1)

# Validation structurelle : aucun hook ne doit apparaître entre le garde et le
# retour principal, et il ne doit rester qu'un seul rendu d'OnboardingScreen.
guard_index = text.index('Le garde onboarding doit rester APRÈS tous les hooks React')
return_index = text.index(main_return, guard_index)
between = text[guard_index:return_index]
if re.search(r'\buse(?:Effect|State|Ref|Memo|Callback|Reducer|LayoutEffect)\s*\(', between):
    raise RuntimeError('Un hook React demeure après le garde onboarding')
if text.count('<OnboardingScreen />') != 1:
    raise RuntimeError(f'Nombre inattendu de rendus onboarding: {text.count("<OnboardingScreen />")}')

path.write_text(text, encoding='utf-8')
print('Ordre des hooks React corrigé : transition onboarding sans écran noir.')
