import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { prepareCloudState } from './cloudBootstrap';
import { purgeLegacySensitiveStorage } from './securityStorage';
import { LOCAL_TEST_MODE } from './testProfiles';
import { isNativeRuntime } from './runtimeConfig';
import './index.css';

// ---------------------------------------------------------------------------
// Récupération des « chunks » périmés après un redéploiement.
// L'application charge plusieurs vues en différé (lazy import). Si un nouveau
// déploiement survient pendant qu'un onglet est ouvert, les fichiers hachés de
// l'ancienne version n'existent plus : l'import différé échoue et React
// démonte tout — écran noir jusqu'à un rafraîchissement manuel. On recharge
// alors la page une seule fois automatiquement pour récupérer la nouvelle
// version (garde-fou sessionStorage contre les boucles de rechargement).
// ---------------------------------------------------------------------------
const RELOAD_GUARD_KEY = 'gcp_chunkReloadedAt';

function reloadOnceForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < 30000) return false; // déjà rechargé il y a moins de 30 s
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage indisponible : on recharge quand même (au pire une fois de plus)
  }
  window.location.reload();
  return true;
}

const isChunkLoadError = (error: unknown): boolean =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Failed to fetch/i
    .test(String((error as any)?.message || error || ''));

// Vite émet cet événement quand le préchargement d'un import dynamique échoue.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

// Filet de sécurité : plus jamais d'écran noir silencieux. Si un chunk périmé
// fait planter le rendu, on recharge une fois ; pour toute autre erreur, on
// affiche un écran de secours avec un bouton de rechargement.
// Langue choisie par l'utilisateur, lue directement du stockage : cet écran
// s'affiche justement quand l'application n'a pas pu se monter, donc sans store.
function recoveryLanguage(): 'FR' | 'EN' {
  try {
    return JSON.parse(localStorage.getItem('gcp_currentLanguage') || '"FR"') === 'EN' ? 'EN' : 'FR';
  } catch {
    return 'FR';
  }
}

// Le message doit dire ce qui s'est réellement passé. Annoncer « une mise à
// jour est disponible » après un plantage de rendu envoie l'utilisateur
// recharger indéfiniment sans jamais comprendre pourquoi.
function recoveryText(staleChunk: boolean): { title: string; body: string; button: string } {
  const fr = recoveryLanguage() === 'FR';
  if (staleChunk) {
    return fr
      ? {
          title: 'Une mise à jour de l’application est disponible',
          body: 'Rechargez la page pour continuer avec la nouvelle version.',
          button: 'Recharger'
        }
      : {
          title: 'An application update is available',
          body: 'Reload the page to continue with the new version.',
          button: 'Reload'
        };
  }
  return fr
    ? {
        title: 'Cet écran n’a pas pu s’afficher',
        body: 'Rechargez la page. Si le problème revient au même endroit, notez ce que vous faisiez et signalez-le : vos données enregistrées ne sont pas touchées.',
        button: 'Recharger'
      }
    : {
        title: 'This screen could not be displayed',
        body: 'Reload the page. If it happens again at the same place, note what you were doing and report it: your saved data is not affected.',
        button: 'Reload'
      };
}

interface BoundaryState { error: unknown; staleChunk: boolean }
class RootErrorBoundary extends React.Component<{ children?: unknown }, BoundaryState> {
  // Les types React ne sont pas installés (module non typé) : on déclare
  // explicitement les membres hérités utilisés.
  declare props: { children?: unknown };
  state: BoundaryState = { error: null, staleChunk: false };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error, staleChunk: isChunkLoadError(error) };
  }

  componentDidCatch(error: unknown) {
    console.error('Erreur de rendu Hailite Manager :', error);
    if (isChunkLoadError(error)) reloadOnceForStaleChunk();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{
        minHeight: '100vh', background: '#0A0D12', color: '#E0E2E6',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '16px', padding: '24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif'
      }}>
        <span style={{ fontSize: '40px' }}>{this.state.staleChunk ? '🔄' : '⚠️'}</span>
        <h1 style={{ fontSize: '20px', fontWeight: 900 }}>{recoveryText(this.state.staleChunk).title}</h1>
        <p style={{ fontSize: '14px', color: '#9CA3AF', maxWidth: '420px' }}>
          {recoveryText(this.state.staleChunk).body}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            minHeight: '48px', padding: '0 28px', borderRadius: '14px', border: 'none',
            background: '#EA580C', color: '#fff', fontSize: '16px', fontWeight: 900, cursor: 'pointer'
          }}
        >
          {recoveryText(this.state.staleChunk).button}
        </button>
      </main>
    );
  }
}

function renderApplication(App: React.ComponentType) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  );
}

// ---------------------------------------------------------------------------
// Route /assistant : mini-application « Assistant IA » (admins seulement).
// Ouvre directement le chat IA sans charger l'interface complète — pensée pour
// être ajoutée à l'écran d'accueil d'un téléphone comme icône dédiée.
// ---------------------------------------------------------------------------
const IS_ASSISTANT_ROUTE = window.location.pathname.replace(/\/+$/, '') === '/assistant';

function installAssistantPwaTags() {
  document.title = 'Assistant IA — Hailite Manager';
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = '/assistant.webmanifest';
  document.head.appendChild(manifest);
  const appleCapable = document.createElement('meta');
  appleCapable.name = 'apple-mobile-web-app-capable';
  appleCapable.content = 'yes';
  document.head.appendChild(appleCapable);
  const appleTitle = document.createElement('meta');
  appleTitle.name = 'apple-mobile-web-app-title';
  appleTitle.content = 'Assistant IA';
  document.head.appendChild(appleTitle);
  const appleIcon = document.createElement('link');
  appleIcon.rel = 'apple-touch-icon';
  appleIcon.href = '/assistant-icon-180.png';
  document.head.appendChild(appleIcon);
}

async function loadRouteComponent(): Promise<React.ComponentType> {
  if (IS_ASSISTANT_ROUTE) {
    installAssistantPwaTags();
    const { default: AssistantApp } = await import('./AssistantApp.tsx');
    return AssistantApp;
  }
  const { default: App } = await import('./App.tsx');
  return App;
}

async function startApplication() {
  // Retire les anciennes sessions, NIP et données métier avant que Zustand ne
  // puisse les relire. En production, seules les préférences non sensibles restent.
  purgeLegacySensitiveStorage(LOCAL_TEST_MODE);
  await prepareCloudState();

  renderApplication(await loadRouteComponent());
}

startApplication().catch(async error => {
  console.error('Impossible d’initialiser Hailite Manager :', error);
  if (isChunkLoadError(error) && reloadOnceForStaleChunk()) return;
  // Repli robuste : l’interface reste accessible même si le préchargement cloud
  // échoue pour une raison inattendue.
  renderApplication(await loadRouteComponent());
});

// L'installation PWA sert de solution multiplateforme hors des boutiques.
// Capacitor embarque déjà les fichiers web : aucun service worker n'est requis
// dans l'application native et il pourrait y conserver une version périmée.
if (import.meta.env.PROD && !isNativeRuntime && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Le mode hors connexion n’a pas pu être activé :', error);
    });
  });
}
