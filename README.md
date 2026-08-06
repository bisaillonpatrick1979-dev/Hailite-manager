# Hailite Manager

Application React/Vite avec API Express et stockage Supabase.

## Développement local

Prérequis : Node.js 22 et une compagnie déjà provisionnée dans Supabase.

1. Copiez `.env.example` vers `.env` et configurez les variables serveur.
2. Installez exactement les dépendances verrouillées avec `npm ci`.
3. Démarrez l’application avec `npm run dev`.

Le jeu fictif local est réservé au développement visuel :

```bash
VITE_LOCAL_TEST_MODE=true npm run dev:client
```

Il ne fournit aucun contournement d’authentification.

## Vérifications

```bash
npm run typecheck
npm run lint
npm test
npm run audit
npm run build:vercel
```

Les migrations Supabase se trouvent dans `supabase/migrations`. La migration de
durcissement doit être revue puis appliquée avant de déployer le code qui dépend
des colonnes `company_id`, du bucket privé et des fonctions transactionnelles.
