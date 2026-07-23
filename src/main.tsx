import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { prepareCloudState } from './cloudBootstrap';
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
interface BoundaryState { error: unknown }
class RootErrorBoundary extends React.Component<{ children?: unknown }, BoundaryState> {
  // Les types React ne sont pas installés (module non typé) : on déclare
  // explicitement les membres hérités utilisés.
  declare props: { children?: unknown };
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
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
        <span style={{ fontSize: '40px' }}>🔄</span>
        <h1 style={{ fontSize: '20px', fontWeight: 900 }}>Une mise à jour de l’application est disponible</h1>
        <p style={{ fontSize: '14px', color: '#9CA3AF', maxWidth: '420px' }}>
          An application update is available. Reload the page to continue.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            minHeight: '48px', padding: '0 28px', borderRadius: '14px', border: 'none',
            background: '#EA580C', color: '#fff', fontSize: '16px', fontWeight: 900, cursor: 'pointer'
          }}
        >
          Recharger / Reload
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

async function startApplication() {
  // Nettoie les anciennes données de démonstration avant que le store Zustand
  // charge son état initial depuis localStorage.
  await prepareCloudState();

  const { default: App } = await import('./App.tsx');
  renderApplication(App);
}

startApplication().catch(async error => {
  console.error('Impossible d’initialiser Hailite Manager :', error);
  if (isChunkLoadError(error) && reloadOnceForStaleChunk()) return;
  // Repli robuste : l’interface reste accessible même si le préchargement cloud
  // échoue pour une raison inattendue.
  const { default: App } = await import('./App.tsx');
  renderApplication(App);
});
