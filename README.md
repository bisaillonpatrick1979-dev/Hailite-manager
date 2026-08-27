# Hailite Manager

Application React/Vite avec API Express et stockage Supabase.

**Vous venez d'acheter l'application ?** Le guide d'installation pas-à-pas est
dans [`INSTALLATION.md`](INSTALLATION.md). Il ne demande aucune connaissance en
informatique.

## Développement local

Prérequis : Node.js 22 et une compagnie déjà provisionnée dans Supabase
(voir `supabase/schema.sql` puis `supabase/provision.sql`).

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

## Faire essayer l'application à quelqu'un

Deux façons, selon ce que la personne doit voir.

**Une version d'essai autonome** — elle installe, repart d'une base vierge, et
l'accès s'arrête tout seul au bout de sept jours.

```bash
npm run android:trial-apk   # APK d'essai, à envoyer
```

Cette compilation ne contacte **aucun** serveur : ni le vôtre, ni un autre.
C'est la propriété la plus importante, et elle est vérifiée à chaque
changement par `npm run test:trial` (parcours navigateur, branché sur la CI).
Sans ce garde, l'adresse de serveur figée dans l'application ferait lire vos
données par la personne qui l'essaie.

Le délai se change avec `VITE_TRIAL_DAYS` (voir `.env.trial`). Une variable
absente ou illisible produit une application normale, jamais une application
qui s'éteint sans que personne l'ait voulu.

L'échéance repose sur l'horloge de l'appareil. Reculer l'horloge ne rallonge
rien — la date la plus avancée jamais vue fait foi — mais désinstaller puis
réinstaller repart à zéro. C'est une échéance de courtoisie, pas un verrou :
seul un serveur pourrait faire mieux, et c'est précisément ce qu'on évite ici.

**Un accès invité sur VOTRE serveur** — pour un sous-traitant de passage ou un
employé temporaire qui doit voir de vraies données. Dans la fiche employé,
remplissez « Fin d'accès » (bouton « 1 semaine »). Passé la date, la connexion
est refusée et le profil disparaît de la liste. Attention : cette personne voit
alors les données de votre entreprise — ce n'est pas une démonstration à
l'aveugle.

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
