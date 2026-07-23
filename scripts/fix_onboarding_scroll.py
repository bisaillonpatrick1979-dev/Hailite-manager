from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'components' / 'OnboardingScreen.tsx'
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    text = text.replace(old, new, 1)


# Hooks nécessaires pour remettre chaque étape en haut automatiquement.
text = text.replace(
    "import React, { useMemo, useState } from 'react';",
    "import React, { useEffect, useMemo, useRef, useState } from 'react';",
    1,
)

if 'const onboardingScrollRef = useRef<HTMLDivElement | null>(null);' not in text:
    replace_once(
        "  const [step, setStep] = useState(1);\n",
        "  const [step, setStep] = useState(1);\n"
        "  const onboardingScrollRef = useRef<HTMLDivElement | null>(null);\n",
        'référence du contenu défilable',
    )

if 'Chaque nouvelle étape revient toujours au premier élément.' not in text:
    anchor = "  const [crossBorderAccepted, setCrossBorderAccepted] = useState(false);\n"
    addition = """

  // Chaque nouvelle étape revient toujours au premier élément. Sur téléphone et
  // tablette, l’utilisateur ne peut donc pas arriver au milieu d’une étape ni
  // manquer le premier avis légal après avoir appuyé sur Continuer.
  useEffect(() => {
    const scrollArea = onboardingScrollRef.current;
    if (!scrollArea) return;
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTo({ top: 0, behavior: 'auto' });
      scrollArea.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);
"""
    replace_once(anchor, anchor + addition, 'retour en haut par étape')

# Une seule hauteur réelle d’écran. L’en-tête et le pied restent visibles; tout
# le contenu central devient la grande zone de défilement tactile.
old_main_candidates = [
    '<main id="hailite-onboarding-screen" className="min-h-screen bg-[#0F1115] text-[#E0E2E6] font-sans px-4 py-5 sm:px-6 flex items-center justify-center">',
    '<main className="min-h-screen bg-[#0A0D12] text-white px-4 py-5 sm:px-6 flex items-center justify-center">',
]
new_main = '<main id="hailite-onboarding-screen" className="h-[100dvh] min-h-0 overflow-hidden bg-[#0F1115] text-[#E0E2E6] font-sans p-2 sm:p-4 flex items-stretch justify-center">'
if new_main not in text:
    matches = [candidate for candidate in old_main_candidates if candidate in text]
    if len(matches) != 1:
        raise RuntimeError(f'conteneur principal onboarding: {len(matches)} ancre(s)')
    text = text.replace(matches[0], new_main, 1)

old_section_candidates = [
    '<section className="w-full max-w-4xl rounded-3xl border border-gray-800 bg-[#16191F] shadow-2xl overflow-hidden">',
    '<section className="w-full max-w-4xl rounded-3xl border border-slate-700 bg-[#111722] shadow-2xl overflow-hidden">',
]
new_section = '<section id="hailite-onboarding-card" className="h-full min-h-0 w-full max-w-4xl rounded-3xl border border-gray-800 bg-[#16191F] shadow-2xl overflow-hidden flex flex-col">'
if new_section not in text:
    matches = [candidate for candidate in old_section_candidates if candidate in text]
    if len(matches) != 1:
        raise RuntimeError(f'carte onboarding: {len(matches)} ancre(s)')
    text = text.replace(matches[0], new_section, 1)

old_header_candidates = [
    '<header className="p-5 sm:p-7 border-b border-gray-800 bg-gradient-to-r from-[#16191F] to-[#111318]">',
    '<header className="p-5 sm:p-7 border-b border-slate-700 bg-gradient-to-r from-slate-950 to-slate-900">',
]
new_header = '<header id="hailite-onboarding-header" className="shrink-0 p-4 sm:p-6 border-b border-gray-800 bg-gradient-to-r from-[#16191F] to-[#111318]">'
if new_header not in text:
    matches = [candidate for candidate in old_header_candidates if candidate in text]
    if len(matches) != 1:
        raise RuntimeError(f'en-tête onboarding: {len(matches)} ancre(s)')
    text = text.replace(matches[0], new_header, 1)

old_content = '<div className="p-5 sm:p-8 max-h-[72vh] overflow-y-auto">'
new_content = '<div ref={onboardingScrollRef} id="hailite-onboarding-scroll" role="region" aria-label={isFR ? \'Contenu de l’étape de configuration\' : \'Setup step content\'} tabIndex={-1} className="hailite-onboarding-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y p-4 sm:p-7 pb-10 sm:pb-12 focus:outline-none">'
if new_content not in text:
    replace_once(old_content, new_content, 'zone principale défilable')

old_footer_candidates = [
    '<footer className="p-5 sm:p-7 border-t border-gray-800 bg-[#0F1115]/90 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">',
    '<footer className="p-5 sm:p-7 border-t border-slate-700 bg-slate-950/60 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">',
]
new_footer = '<footer id="hailite-onboarding-footer" className="shrink-0 p-3 sm:p-5 border-t border-gray-800 bg-[#0F1115]/95 flex flex-row gap-2 sm:gap-3 justify-between" style={{ paddingBottom: \'max(0.75rem, env(safe-area-inset-bottom, 0px))\' }}>'
if new_footer not in text:
    matches = [candidate for candidate in old_footer_candidates if candidate in text]
    if len(matches) != 1:
        raise RuntimeError(f'pied onboarding: {len(matches)} ancre(s)')
    text = text.replace(matches[0], new_footer, 1)

# Les deux commandes restent sur une seule rangée même sur téléphone afin de
# laisser davantage de hauteur au texte et aux cases à cocher.
text = text.replace(
    'className="min-h-14 rounded-2xl border border-gray-700 px-6 text-lg font-bold disabled:opacity-30 flex items-center justify-center gap-2"',
    'className="flex-1 min-w-0 min-h-12 rounded-2xl border border-gray-700 px-3 sm:px-6 text-base sm:text-lg font-bold disabled:opacity-30 flex items-center justify-center gap-1.5 sm:gap-2"',
    1,
)
text = text.replace(
    'className="min-h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 px-7 text-lg font-black text-white disabled:opacity-40 flex items-center justify-center gap-2"',
    'className="flex-1 min-w-0 min-h-12 rounded-2xl bg-orange-600 hover:bg-orange-500 px-3 sm:px-7 text-base sm:text-lg font-black text-white disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2"',
    1,
)
text = text.replace(
    'className="min-h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 px-7 text-lg font-black text-white flex items-center justify-center gap-2"',
    'className="flex-1 min-w-0 min-h-12 rounded-2xl bg-orange-600 hover:bg-orange-500 px-3 sm:px-7 text-base sm:text-lg font-black text-white flex items-center justify-center gap-1.5 sm:gap-2"',
    1,
)

path.write_text(text, encoding='utf-8')
print('Défilement onboarding téléphone/tablette corrigé et vérifié.')
