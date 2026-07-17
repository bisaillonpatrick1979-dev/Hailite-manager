# Sécurité — Gestion Chantier Pro

Ce document décrit les mesures de sécurité mises en place avant de connecter
l'agent IA à l'application, et ce qui reste recommandé pour la suite.

## 1. API de données protégées (Supabase)

La clé `SUPABASE_SERVICE_ROLE_KEY` reste **exclusivement côté serveur**
(`db.ts`). Depuis cette version, aucune route de données n'est servie sans
identité vérifiée :

- **Authentification par jeton (JWT HS256)** — `auth.ts`
  - `POST /api/auth/login` : le NIP est vérifié **côté serveur** contre la base
    (comparaison en temps constant) ; le navigateur ne reçoit et ne stocke que
    le jeton de session signé (12 h). Limitation à 5 tentatives / 15 min par
    IP + employé (anti force brute).
  - `GET /api/auth/directory` : annuaire minimal pour l'écran de connexion
    (id, nom, rôle, métier, avatar) — jamais de NIP, NAS ou salaire.
  - Le jeton transporte `user_id`, `company_id` et `role`, vérifiés à chaque
    requête par le middleware `requireAuth`.
  - ⚠️ `SESSION_SECRET` doit être défini dans les variables d'environnement
    (Vercel). Sans lui, un secret éphémère est généré (sessions perdues à
    chaque redémarrage — dev seulement).

- **Matrice de permissions par table et par rôle** — `apiRoutes.ts`
  - `admin` / `secretary` / `accountant` / `employee`, avec écritures
    réservées (ex. `app_users`, `companies`, `payroll_payments` : admin
    seulement ; documents, inventaire, commandes : gestion seulement).
  - **Contraintes par ligne** : un employé ne peut écrire que ses propres
    punches, factures et objectifs (`employee_id` / `user_id` comparés au
    jeton), et ne lit que ses propres données de paie.
  - **Scoping tenant** : `company_id` est toujours imposé depuis le jeton —
    le client ne choisit jamais son tenant (et ne peut pas le réaffecter via
    PATCH).

- **Redaction des colonnes sensibles** (le navigateur — et donc le modèle IA —
  ne les voit jamais) :
  - `companies.ai_api_key` : supprimé de **toutes** les réponses ;
  - `app_users.access_code_hash` (NIP) et `app_users.sin` (NAS/SIN) : admin
    uniquement ;
  - coordonnées bancaires et courriel Interac : admin uniquement.
  - Le contexte envoyé au modèle (`buildAiAppContext`) est un agrégat qui ne
    contient ni NIP, ni NAS, ni clés, ni coordonnées bancaires, et
    l'instruction système interdit au modèle de les demander ou les révéler.

- **Journal d'audit** — table `audit_logs` (voir `supabase_security.sql`) :
  connexions (réussies/échouées/throttlées), toutes les écritures
  (action, table, id, champs — jamais les valeurs) et les actions proposées
  par l'IA.

## 2. Actions IA en function calling (plus de blocs texte)

L'ancien protocole texte `<<<ACTION ... ACTION>>>` est supprimé. Les actions
sont désormais de véritables **fonctions à schéma JSON strict**
(`AI_TOOL_DEFS` dans `apiRoutes.ts`), déclarées nativement aux trois
fournisseurs (tools Anthropic, tools OpenAI, functionDeclarations Gemini) :

- champs requis, types, énumérations et bornes vérifiés **côté serveur** ;
  les champs inconnus sont retirés, les actions invalides rejetées ;
- maximum 5 actions par tour ;
- les outils ne sont proposés au modèle **que si le jeton de session porte un
  rôle de bureau** (admin/secrétaire) — jamais sur la seule foi du client ;
- le client n'interprète **jamais** de texte libre comme une commande : il
  n'exécute que le tableau `actions` structuré retourné par le serveur, avec
  une revalidation locale des champs requis avant chaque mutation ;
- les mutations résultantes repassent par l'API protégée (permissions +
  audit).

## 3. Clés IA hors du navigateur

- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` vivent
  **exclusivement** dans les variables d'environnement de l'hébergeur
  (Vercel). Toute clé envoyée par un client est ignorée par le serveur.
- L'appel direct navigateur → fournisseur IA (mode secours) est **supprimé** ;
  le navigateur n'appelle que `/api/chat`, protégé par session dès que le
  cloud est configuré.
- Le champ « clé personnelle » des Réglages est retiré ; `ai_api_key` n'est
  plus synchronisé vers la base ni renvoyé au navigateur (redaction
  inconditionnelle). Exécuter `supabase_security.sql` purge les clés déjà
  persistées.

## Variables d'environnement requises en production

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Accès base (serveur seulement) |
| `SESSION_SECRET` | Signature des jetons de session (≥ 32 caractères aléatoires) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Fournisseur(s) IA (serveur seulement) |

## Prochaines étapes recommandées

- **Supabase Auth complet** : migrer les sessions maison vers Supabase Auth
  (comptes courriel + MFA pour les rôles de bureau), avec politiques RLS par
  `auth.uid()` en plus du filtrage serveur actuel (`supabase_security.sql`
  active déjà RLS en mode « deny all » pour la clé anon).
- **NIP hachés** : stocker les NIP en hash (bcrypt/argon2) plutôt qu'en clair
  dans `app_users.access_code_hash`.
- **Routes dédiées** : continuer à remplacer les routes génériques par des
  fonctions métier précises (ex. `POST /api/punches/start`), qui portent leurs
  invariants (géorepérage, statut) côté serveur.
- **Rate limiting partagé** : déplacer le compteur anti force brute en mémoire
  vers un stockage partagé (table/Upstash) pour couvrir le multi-instance
  serverless.
