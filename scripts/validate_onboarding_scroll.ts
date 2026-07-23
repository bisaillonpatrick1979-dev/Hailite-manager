import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const onboarding = readFileSync(resolve(root, 'src/components/OnboardingScreen.tsx'), 'utf8');
const css = readFileSync(resolve(root, 'src/index.css'), 'utf8');

const requiredOnboardingMarkers = [
  'h-[100dvh]',
  'id="hailite-onboarding-card"',
  'id="hailite-onboarding-header"',
  'id="hailite-onboarding-scroll"',
  'id="hailite-onboarding-footer"',
  'min-h-0 flex-1 overflow-y-auto',
  'touch-pan-y',
  'onboardingScrollRef',
  "scrollTo({ top: 0, behavior: 'auto' })",
  "env(safe-area-inset-bottom, 0px)"
];

for (const marker of requiredOnboardingMarkers) {
  assert.ok(onboarding.includes(marker), `Marqueur onboarding absent: ${marker}`);
}

assert.ok(!onboarding.includes('max-h-[72vh]'), 'L’ancienne hauteur 72vh ne doit plus limiter le contenu.');
assert.ok(!onboarding.includes('flex-col-reverse sm:flex-row'), 'Les boutons ne doivent plus prendre deux rangées sur téléphone.');

const requiredCssMarkers = [
  'ONBOARDING MOBILE ET TABLETTE',
  '.hailite-onboarding-scroll',
  '-webkit-overflow-scrolling: touch',
  'touch-action: pan-y',
  'scrollbar-gutter: stable',
  'orientation: landscape',
  'max-height: 600px'
];

for (const marker of requiredCssMarkers) {
  assert.ok(css.includes(marker), `Protection CSS onboarding absente: ${marker}`);
}

console.log('Défilement onboarding validé', {
  viewport: '100dvh',
  scrollContainer: 'hailite-onboarding-scroll',
  stepResetToTop: true,
  touchPanAnywhere: true,
  visibleScrollbar: true,
  landscapeCompactMode: true,
  safeAreaFooter: true
});
