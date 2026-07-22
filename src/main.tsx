import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { prepareCloudState } from './cloudBootstrap';
import './index.css';

async function startApplication() {
  // Nettoie les anciennes données de démonstration avant que le store Zustand
  // charge son état initial depuis localStorage.
  await prepareCloudState();

  const { default: App } = await import('./App.tsx');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

startApplication().catch(async error => {
  console.error('Impossible d’initialiser Hailite Manager :', error);
  // Repli robuste : l’interface reste accessible même si le préchargement cloud
  // échoue pour une raison inattendue.
  const { default: App } = await import('./App.tsx');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
