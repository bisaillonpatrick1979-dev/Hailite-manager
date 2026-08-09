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
npm run validate:features
npm run store:validate
npm run audit
npm run build:vercel
```

Les migrations Supabase se trouvent dans `supabase/migrations`. La migration de
durcissement doit être revue puis appliquée avant de déployer le code qui dépend
des colonnes `company_id`, du bucket privé et des fonctions transactionnelles.

## Application Android

Le projet Capacitor se trouve dans `android/`. La version mobile embarque le
client Web compilé et appelle l’API publique HTTPS définie dans `.env.mobile`;
elle n’utilise pas une URL WebView distante en production.

```bash
npm run build:mobile
npm run android:apk
npm run android:bundle
```

Le workflow GitHub `Android` compile et vérifie automatiquement un APK de test
installable et un AAB de release non signé. Pour une publication, copiez
`android/keystore.properties.example` vers `android/keystore.properties`, créez
une clé d’envoi protégée et ne commitez jamais cette clé ni ses mots de passe.

Les textes, visuels, déclarations de données et étapes de publication se trouvent
dans `store-assets/`. La politique publique est servie à `/privacy.html` et le
processus externe de suppression à `/account-deletion.html`. Les quatre captures
de téléphone Play Store sont vérifiées par `npm run store:validate`; leur script
de génération reproductible est `npm run store:screenshots`.
