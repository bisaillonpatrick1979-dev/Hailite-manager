# Installer Hailite Manager chez vous

> **Vous voulez juste essayer l'application ?** Si quelqu'un vous a envoyé une
> version d'essai, il n'y a rien à installer d'autre et rien à configurer :
> ouvrez-la, elle part d'une base vierge et l'accès dure une semaine. Un bandeau
> orange affiche les jours restants. Rien de ce que vous y entrez ne quitte
> votre appareil.


Ce guide s'adresse à la personne qui vient d'acheter l'application. Il ne
demande aucune connaissance en informatique : tout se fait dans un navigateur,
en copiant-collant.

Comptez **30 à 45 minutes** la première fois.

---

## D'abord : où vivront vos données ?

Vos données d'entreprise — vos clients, vos chantiers, vos heures, vos
factures — doivent vivre quelque part. Vous avez deux façons de faire, et le
choix se présente au premier démarrage de l'application.

|                                        | Votre propre serveur | Votre nuage personnel |
|----------------------------------------|----------------------|-----------------------|
| Comptes à créer                        | Deux (gratuits)      | Aucun                 |
| Vos employés se connectent de leur téléphone | Oui             | Non — voir plus bas   |
| Vos données transitent par un tiers    | Non, c'est votre compte | Non               |
| Temps d'installation                   | 30 à 45 min          | 2 min                 |
| Sauvegarde chez vous                   | Oui, en plus         | Oui, c'est le principe |

**Le point important, dit franchement.** Pour que plusieurs personnes se
connectent chacune de son propre téléphone et retrouvent chacune ses affaires,
il faut un serveur quelque part. C'est lui qui vérifie les NIP, qui décide qui
a le droit de voir quoi, et qui empêche deux téléphones d'écrire en même temps
la même heure de pointage. Un fichier déposé sur Google Drive ne peut pas faire
ce travail : c'est un fichier, il ne décide rien.

Donc :

- **Vous êtes seul, ou tout le monde pointe sur la même tablette au chantier**
  → le nuage personnel suffit. Chaque employé se connecte avec son NIP sur cet
  appareil et retrouve ses affaires; le patron garde tout, et une copie
  complète part automatiquement sur son nuage.
- **Chaque employé a son téléphone et pointe de son bord**
  → il faut votre propre serveur. Suivez la partie 2.

Vous pouvez commencer avec le nuage personnel et passer au serveur plus tard :
vos données se transfèrent.

---

# Partie 1 — Le nuage personnel (rien à créer)

1. Installez l'application.
2. Au premier démarrage, à l'étape **Stockage**, choisissez
   **« Mon nuage personnel »**.
3. Choisissez où déposer le fichier : Google Drive, OneDrive, Dropbox, iCloud
   Drive, Samsung Cloud, ou simplement un dossier de l'appareil.
4. Donnez la permission quand le téléphone la demande.
5. Sur le même écran, entrez **votre nom et le NIP de votre choix**. C'est
   votre accès d'administrateur. Personne ne pourra vous le redonner si vous
   l'oubliez : notez-le quelque part de sûr.
6. Terminez l'accueil. C'est tout — aucun compte à créer nulle part.

Ensuite, ajoutez vos employés dans **Administration → Employés → Ajouter**.
Chacun reçoit son NIP et retrouve ses affaires en se connectant sur cet
appareil.

À partir de là, l'application dépose automatiquement une copie complète de
votre entreprise dans ce dossier, quelques secondes après chaque changement.

**Pour récupérer vos données** (nouveau téléphone, appareil perdu) :
Réglages → Importer des données → **Restaurer une sauvegarde Hailite**, puis
choisissez le fichier dans votre nuage.

**Deux choses à savoir.**

- Ce fichier contient votre entreprise au complet. Il est aussi sensible que
  vos dossiers papier : gardez-le dans un dossier privé, pas dans un dossier
  partagé avec des liens publics.
- Le NIP en clair n'est jamais écrit, ni sur l'appareil ni dans ce fichier :
  l'application n'en garde qu'une empreinte, dont on ne peut pas le déduire
  directement. Mais soyons francs — un NIP à quatre chiffres n'a que dix mille
  possibilités. Il empêche un employé d'ouvrir le dossier d'un collègue sur la
  tablette du chantier; il n'arrête pas quelqu'un qui vous vole l'appareil.
  **Activez le verrouillage d'écran de votre téléphone**, c'est lui la vraie
  protection.

**Si vous oubliez votre NIP** en mode hors serveur, il n'y a personne pour le
réinitialiser : c'est le revers de n'avoir aucun compte chez personne. Gardez
une sauvegarde à jour et notez votre NIP ailleurs.

---

# Partie 2 — Votre propre serveur (Supabase + Vercel)

Vous allez créer deux comptes gratuits :

- **Supabase**, qui garde vos données. → https://supabase.com
- **Vercel**, qui fait tourner l'application. → https://vercel.com

Ils sont à vous. Personne d'autre n'y a accès, pas même le vendeur de
l'application.

---

## Étape 1 — Créer la base de données (10 min)

1. Allez sur **https://supabase.com** et cliquez sur *Start your project*.
   Créez un compte (Google ou courriel).
2. Cliquez sur **New project**.
   - *Name* : le nom de votre entreprise.
   - *Database Password* : générez-en un et **notez-le ailleurs**. Vous n'en
     aurez pas besoin tous les jours, mais il est irrécupérable.
   - *Region* : choisissez la plus proche de vous. Au Canada :
     **Canada (Central)**. Aux États-Unis : la région de votre état.
3. Attendez deux ou trois minutes que le projet démarre.

### Créer les tables

4. Dans le menu de gauche, cliquez sur **SQL Editor**, puis **New query**.
5. Ouvrez le fichier `supabase/schema.sql` fourni avec l'application, copiez
   **tout** son contenu, collez-le dans la fenêtre, et cliquez sur **Run**.

   Vous devez voir *Success*. Quelques messages « already exists, skipping »
   sont normaux et sans conséquence.

6. Nouvelle requête (*New query*). Ouvrez cette fois `supabase/provision.sql`.
   **Avant de le coller, modifiez les six lignes du bloc « À REMPLIR »** :

   ```sql
   v_company_name   text := 'Mon Entreprise Inc.';   -- votre nom légal
   v_country        text := 'Canada';                -- ou 'United States'
   v_region         text := 'Alberta';               -- votre province ou état
   v_currency       text := 'CAD';                   -- ou 'USD'
   v_admin_name     text := 'Prénom Nom';            -- votre nom
   v_admin_pin      text := '4821';                  -- LE NIP QUE VOUS VOULEZ
   ```

   Collez, puis **Run**.

7. Dans les messages, repérez la ligne :

   ```
   DEFAULT_COMPANY_ID = 8f3a1c22-....-............
   ```

   **Copiez cette valeur quelque part.** Vous en aurez besoin à l'étape 3.
   Si elle a défilé, retrouvez-la avec `select id, name from public.companies;`

8. Nouvelle requête. Copiez-collez le contenu de `supabase_security.sql`, puis
   **Run**. Ce fichier verrouille la base : seule votre application pourra y
   toucher.

### Récupérer vos deux clés

9. Menu de gauche → **Project Settings** → **API**. Notez :
   - **Project URL** — quelque chose comme `https://abcdefgh.supabase.co`
   - **Secret key** (ou *service_role key* sur les projets plus anciens) —
     une longue chaîne commençant par `sb_secret_...`

> **Cette clé secrète ouvre toute votre base.** Ne la mettez jamais dans un
> courriel, un message texte, une capture d'écran ou un site web. Elle ne va
> qu'à un seul endroit : la case Vercel de l'étape 3.

---

## Étape 2 — Fabriquer le secret de session (1 min)

L'application a besoin d'une longue phrase secrète pour signer les sessions de
connexion. Générez-en une :

- **Mac ou Linux**, dans le Terminal : `openssl rand -base64 48`
- **Windows**, dans PowerShell :
  `[Convert]::ToBase64String((1..48|%{Get-Random -Max 256}))`
- **Sans ligne de commande** : https://generate-secret.vercel.app/48

Copiez le résultat. C'est votre `SESSION_SECRET`. Au moins 32 caractères.

---

## Étape 3 — Mettre l'application en ligne (15 min)

1. Allez sur **https://vercel.com** et créez un compte (le plus simple : avec
   votre compte GitHub).
2. **Add New… → Project**, puis importez le dépôt de l'application.
3. Avant de cliquer sur *Deploy*, ouvrez **Environment Variables** et ajoutez
   ces lignes, une par une :

   | Nom | Valeur |
   |-----|--------|
   | `SUPABASE_URL` | le *Project URL* de l'étape 1.9 |
   | `SUPABASE_SECRET_KEY` | la *Secret key* de l'étape 1.9 |
   | `SESSION_SECRET` | la phrase générée à l'étape 2 |
   | `DEFAULT_COMPANY_ID` | l'identifiant noté à l'étape 1.7 |
   | `APP_URL` | l'adresse de votre application (voir ci-dessous) |
   | `SUPABASE_PROJECT_MEDIA_BUCKET` | `project-media` |

   Pour `APP_URL` : mettez `https://` suivi du nom que Vercel propose pour
   votre projet, par exemple `https://mon-entreprise.vercel.app`. Vous pourrez
   le corriger après le premier déploiement si l'adresse diffère.

4. Cliquez sur **Deploy** et attendez deux ou trois minutes.
5. Ouvrez l'adresse. Connectez-vous avec le nom et le NIP de l'étape 1.6.

Si la connexion fonctionne, c'est terminé : la base, le serveur et
l'application se parlent.

---

## Étape 4 — Le stockage des photos (5 min)

Les photos de chantier ont besoin d'un espace de rangement.

1. Supabase → menu de gauche → **Storage** → **New bucket**.
2. Nom : **`project-media`** (exactement, en minuscules).
3. Laissez la case *Public bucket* **décochée**. Les photos ne passent que par
   l'application, jamais par un lien public.
4. **Create bucket**.

---

## Étape 5 — L'assistant IA (facultatif)

L'application peut lire les cartes de compétence et répondre à des questions.
Il faut pour cela une clé chez un fournisseur d'IA. C'est **facultatif** : tout
le reste fonctionne sans.

Ajoutez dans Vercel (Settings → Environment Variables) **celle que vous voulez
utiliser**, une seule suffit :

| Nom | Où l'obtenir |
|-----|--------------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `OPENAI_API_KEY` | https://platform.openai.com |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |

Ces clés restent chez Vercel. Elles ne descendent jamais dans le téléphone ni
dans le navigateur — c'est vérifié automatiquement à chaque mise à jour.

L'assistant ne reçoit jamais un NIP, un numéro d'assurance sociale, une clé ni
une coordonnée bancaire.

Après avoir ajouté une variable, il faut redéployer : Vercel → **Deployments**
→ le dernier → **⋯** → **Redeploy**.

---

## Étape 6 — Ajouter vos employés

Plus besoin de SQL. Dans l'application : **Administration → Employés →
Ajouter**. Chaque personne reçoit son propre NIP et se connecte de son
téléphone avec.

---

# Problèmes courants

**« Aucune compagnie configurée »**
`provision.sql` n'a pas été exécuté, ou `DEFAULT_COMPANY_ID` est absent ou mal
copié dans Vercel. Vérifiez avec `select id, name from public.companies;`

**« Plusieurs compagnies existent »**
Vous avez exécuté `provision.sql` deux fois sur des bases différentes, ou créé
une deuxième compagnie à la main. Renseignez `DEFAULT_COMPANY_ID` dans Vercel
avec celle que vous voulez garder.

**Je me connecte, mais tout est vide**
Normal sur une installation neuve : il n'y a encore aucun chantier. Créez un
client, puis un chantier.

**J'ai oublié mon NIP**
Supabase → SQL Editor :

```sql
update public.app_users
   set access_code_hash = extensions.crypt('NOUVEAU_NIP', extensions.gen_salt('bf', 10)),
       failed_attempts = 0, locked_until = null
 where full_name = 'Prénom Nom';
```

**Trop de tentatives**
La protection contre les essais répétés se relâche d'elle-même après quelques
minutes. La requête ci-dessus la débloque immédiatement.

**Une modification n'apparaît pas après avoir changé une variable Vercel**
Il faut redéployer : Deployments → le dernier → ⋯ → Redeploy.

---

# Ce qu'il faut garder précieusement

| Quoi | Où le retrouver si perdu |
|------|--------------------------|
| Mot de passe de la base Supabase | Nulle part — à réinitialiser dans Supabase |
| Clé secrète Supabase | Project Settings → API |
| `SESSION_SECRET` | Vercel → Settings → Environment Variables |
| `DEFAULT_COMPANY_ID` | `select id from public.companies;` |
| Votre NIP | Nulle part — à réenregistrer avec la requête ci-dessus |

---

# Une note sur les impôts

Les exports fiscaux de l'application (T5018 au Canada, 1099-NEC aux
États-Unis) sont une **aide à la préparation**, pas un conseil comptable.
Faites-les valider par votre comptable avant de les transmettre.
