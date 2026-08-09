import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// ---------------------------------------------------------------------------
// Origine du serveur d'API dans la politique de sécurité du contenu
// ---------------------------------------------------------------------------
// L'application native Capacitor s'exécute depuis `https://localhost` : ses
// appels vers le serveur sont donc d'origine croisée et doivent être
// explicitement autorisés par `connect-src`. Cette valeur était écrite en dur
// dans index.html, en plus de .env.mobile et du workflow Android — trois
// endroits à changer le jour d'un déménagement de domaine, et deux occasions
// de l'oublier. Elle est maintenant dérivée d'une seule source : le fichier
// .env du mode de construction (.env.mobile pour `--mode mobile`).
const API_ORIGIN_TOKEN = '%%API_ORIGIN%%';

function contentSecurityPolicyOrigin(apiBaseUrl: string): Plugin {
  let origin = '';
  if (apiBaseUrl) {
    try {
      origin = ` ${new URL(apiBaseUrl).origin}`;
    } catch {
      throw new Error(`VITE_API_BASE_URL n'est pas une URL valide : ${apiBaseUrl}`);
    }
  }
  return {
    name: 'hailite-csp-api-origin',
    transformIndexHtml(html) {
      return html.replaceAll(API_ORIGIN_TOKEN, origin);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  return {
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicyOrigin(String(env.VITE_API_BASE_URL || '').trim())
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
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
