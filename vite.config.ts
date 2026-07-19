import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Garde de déploiement : l’onboarding international peut être publié quelques
 * secondes avant la mise à jour complète d’apiClient.ts. Dans ce cas seulement,
 * on ajoute l’export manquant au module transformé. Dès que la vraie fonction
 * existe dans apiClient.ts, ce plugin ne modifie absolument rien.
 */
function apiClientCompatibilityPlugin(): Plugin {
  return {
    name: 'hailite-api-client-compatibility',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/apiClient.ts') && !id.endsWith('\\src\\apiClient.ts')) return null;
      if (code.includes('export function setCloudSyncAllowed')) return null;
      return {
        code: `${code}\n\nexport function setCloudSyncAllowed(allowed: boolean): void {\n  try {\n    const current = JSON.parse(localStorage.getItem('gcp_companyInfo') || '{}');\n    localStorage.setItem('gcp_companyInfo', JSON.stringify({\n      ...current,\n      cloudSyncConsent: allowed,\n      dataStorageMode: allowed ? (current.dataStorageMode || 'hybrid') : 'local'\n    }));\n  } catch {\n    // Le choix sera aussi enregistré par le store pendant la fin de l’onboarding.\n  }\n}\n`,
        map: null,
      };
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [apiClientCompatibilityPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
