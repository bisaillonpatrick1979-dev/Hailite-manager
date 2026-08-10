// ---------------------------------------------------------------------------
// Cartes de compétence : le travailleur soumet, le bureau vérifie
// ---------------------------------------------------------------------------
// Un employé ou un sous-traitant photographie sa nouvelle carte, recto et
// verso, et la soumet lui-même. C'est la première fois qu'un rôle non
// gestionnaire écrit dans app_users — table jusqu'ici réservée à
// l'administration. On n'a donc pas ouvert la table : on a ouvert un geste, et
// ce validateur vérifie que ce geste reste étroit.
//
// Aucune vérification automatique n'est promise nulle part : il n'existe pas de
// registre interrogeable par machine, et plusieurs organismes exigent l'accord
// du titulaire avant de confirmer quoi que ce soit à un employeur. La décision
// est humaine et consignée.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const routes = read('apiRoutes.ts');
const model = read('credentialVerification.ts');
const manager = read('src/components/EmployeeCredentialsManager.tsx');
const queue = read('src/components/CredentialVerificationQueue.tsx');
const app = read('src/App.tsx');

// -- La table reste fermée -----------------------------------------------
assert.ok(
  /app_users: ADMIN_ONLY/.test(routes),
  'La table app_users doit rester interdite en écriture à la couche de données générique.'
);

const submitRoute = routes.slice(
  routes.indexOf("app.post('/api/credentials'"),
  routes.indexOf("app.post('/api/credentials/:employeeId")
);
assert.ok(submitRoute.length > 200, 'La route de soumission est introuvable.');

// -- Le travailleur n'écrit que sa propre ligne ---------------------------
assert.ok(submitRoute.includes('requireAuth'), 'La soumission exige une session.');
for (const scope of ["eq('id', auth.userId)", "eq('company_id', auth.companyId)", "eq('is_active', true)"]) {
  assert.ok(submitRoute.includes(scope), `La soumission doit être bornée par ${scope}.`);
}
assert.ok(
  !/eq\('id',\s*(req\.body|req\.params|input)/.test(submitRoute),
  'La ligne écrite ne doit jamais venir de la requête : elle vient de la session.'
);

// -- Une seule colonne touchée -------------------------------------------
const updates = submitRoute.match(/\.update\(\{[^}]*\}\)/g) || [];
assert.equal(updates.length, 1, 'La soumission ne doit faire qu’une seule écriture.');
assert.ok(
  /\.update\(\{\s*credentials\s*\}\)/.test(updates[0]),
  `La soumission ne doit écrire que la colonne « credentials » (trouvé : ${updates[0]}).`
);

// -- Les cartes existantes sont relues côté serveur, jamais reçues du client
assert.ok(
  submitRoute.includes("select('credentials')") && submitRoute.includes('const existing'),
  'Les cartes déjà présentes doivent être relues côté serveur avant l’ajout.'
);
assert.ok(
  submitRoute.includes('[...existing, submitted]'),
  'La nouvelle carte doit être ajoutée aux cartes existantes, jamais les remplacer.'
);

// -- Personne ne se déclare vérifié ---------------------------------------
assert.ok(
  submitRoute.includes('buildSubmittedCredential('),
  'La carte enregistrée doit passer par le constructeur qui impose le statut.'
);
assert.ok(
  /verificationStatus: 'submitted'/.test(model),
  'Le constructeur doit imposer le statut « soumise ».'
);
assert.ok(
  !/verificationStatus:\s*(input|req\.body)/.test(model + routes),
  'Le statut de vérification ne doit jamais être recopié depuis l’entrée.'
);

// -- La révision est réservée au bureau -----------------------------------
const reviewRoute = routes.slice(routes.indexOf("app.post('/api/credentials/:employeeId"));
assert.ok(reviewRoute.includes('canReviewCredential(auth)'), 'La révision doit vérifier le rôle.');
assert.ok(reviewRoute.includes("status(403)"), 'Un rôle non autorisé doit être refusé explicitement.');
assert.ok(
  reviewRoute.includes("eq('company_id', auth.companyId)"),
  'La révision doit rester dans la compagnie de la personne connectée.'
);
assert.ok(
  reviewRoute.includes('ALLOWED_VERIFICATION_METHODS'),
  'La méthode de vérification doit être bornée côté serveur.'
);
assert.ok(
  reviewRoute.includes('credential_review_denied'),
  'Une tentative de révision refusée doit laisser une trace.'
);

// -- Journal d'audit, sans le contenu des photos --------------------------
for (const event of ['credential_submitted', 'credential_verified', 'credential_rejected']) {
  assert.ok(routes.includes(`'${event}'`), `Événement d’audit manquant : ${event}`);
}
assert.ok(
  !/logAudit\([^)]*photoFront/.test(routes),
  'Le journal d’audit ne doit pas transporter la photo de la carte.'
);

// -- Une fiche ne peut pas gonfler indéfiniment ---------------------------
assert.ok(routes.includes('MAX_CREDENTIALS_PER_USER'), 'Le nombre de cartes par compte doit être borné.');
assert.ok(model.includes('MAX_CREDENTIAL_PHOTO_BYTES'), 'Le poids des photos doit être borné.');

// -- Les deux faces sont exigées ------------------------------------------
assert.ok(
  model.includes("field: 'photoFront'") && model.includes("field: 'photoBack'"),
  'Le recto et le verso doivent tous deux être exigés.'
);
assert.ok(submitRoute.includes('validateSubmission('), 'Le serveur doit revalider la soumission.');
assert.ok(manager.includes('validateSubmission('), 'Le formulaire doit dire tout de suite ce qui manque.');

// -- L'appareil photo s'ouvre directement ---------------------------------
assert.ok(
  manager.includes('capture="environment"'),
  'La prise de photo doit ouvrir la caméra arrière, pas la galerie.'
);
assert.ok(manager.includes('selfService'), 'Le mode libre-service doit exister.');
assert.ok(app.includes('selfService'), 'L’écran du travailleur doit activer le mode libre-service.');

// -- Rien ne prétend vérifier automatiquement -----------------------------
for (const registry of ['tradesecrets.alberta.ca', 'energysafetycanada.com', 'ccq.org', 'osha.gov']) {
  assert.ok(model.includes(registry), `Registre absent du répertoire : ${registry}`);
}
assert.ok(
  queue.includes('registriesForCredential('),
  'La file de vérification doit proposer le bon registre selon le pays et la province.'
);
assert.ok(
  /cautionFR/.test(queue),
  'Chaque registre doit afficher sa limite : aucun ne couvre tout.'
);
assert.ok(
  !/fetch\((['"`])https?:\/\/(tradesecrets|www\.energysafetycanada|www\.ccq)/.test(model + queue + routes),
  'Aucun registre ne doit être interrogé automatiquement : ce sont des formulaires destinés à un humain.'
);

// -- Lecture assistée : une aide, jamais une preuve -----------------------
const inspectRoute = routes.slice(
  routes.indexOf("app.post('/api/credentials/:employeeId/:credentialId/inspect'"),
  routes.indexOf("// Annuaire minimal pour l'écran de connexion")
);
assert.ok(inspectRoute.length > 200, 'La route d’analyse est introuvable.');
assert.ok(inspectRoute.includes('canReviewCredential(auth)'), 'L’analyse doit être réservée à la gestion.');
assert.ok(
  inspectRoute.includes('credential_inspect_denied'),
  'Une tentative d’analyse refusée doit laisser une trace.'
);

// Les photos analysées viennent de la base, pas du corps de la requête : on
// analyse la carte réellement soumise, pas une image glissée à côté.
assert.ok(
  inspectRoute.includes('decodeImageDataUrl(credential.photoFront)') &&
  inspectRoute.includes('decodeImageDataUrl(credential.photoBack)'),
  'Les deux faces analysées doivent être relues depuis la base.'
);
assert.ok(
  !/req\.body\??\.(photo|image)/.test(inspectRoute),
  'Aucune image du corps de la requête ne doit être analysée.'
);

// La clé du fournisseur ne quitte jamais le serveur.
assert.ok(
  inspectRoute.includes('resolveProviderApiKey(selectedProvider)'),
  'La clé du fournisseur doit être résolue côté serveur.'
);
assert.ok(
  !/apiKey.*req\.body/.test(inspectRoute),
  'Aucune clé fournie par le navigateur ne doit être utilisée.'
);

// Le modèle lit, il ne juge pas.
assert.ok(
  model.includes('Tu ne dis JAMAIS si la carte est authentique ou fausse'),
  'La consigne doit interdire au modèle de se prononcer sur l’authenticité.'
);
const verdicts = model.match(/export type InspectionVerdict = ([^;]+);/);
assert.ok(verdicts, 'Le type de verdict doit être déclaré.');
for (const forbidden of ['authentic', 'genuine', 'valide', 'fake', 'fausse']) {
  assert.ok(
    !verdicts![1].includes(forbidden),
    `Le verdict ne doit pas pouvoir affirmer « ${forbidden} » : l’analyse ne peut pas le savoir.`
  );
}
assert.ok(
  queue.includes('ne prouve pas qu’une carte est authentique'),
  'L’écran doit dire clairement ce que la lecture ne prouve pas.'
);
assert.ok(
  queue.includes('registriesForCredential('),
  'Le registre doit rester proposé à côté de l’analyse : c’est lui qui tranche.'
);

// L'audit consigne le verdict, jamais ce qui a été lu sur la carte.
assert.ok(routes.includes("'credential_inspected'"), 'L’analyse doit être auditée.');
assert.ok(
  !/logAudit\([^)]*reading/.test(routes),
  'Le journal d’audit ne doit pas transporter le contenu lu sur la carte.'
);

console.log('Cartes de compétence en libre-service validées', {
  tableAppUsersToujoursFermee: true,
  ecritureBorneeALaPropreLigne: true,
  uneSeuleColonneTouchee: true,
  statutImposeParLeServeur: true,
  revisionReserveeAuBureau: true,
  auditSansPhoto: true,
  rectoEtVersoExiges: true,
  cameraDirecte: true,
  registresSansPromesseAutomatique: true,
  lectureReserveeAuBureau: true,
  photosReluesDepuisLaBase: true,
  cleJamaisDansLeNavigateur: true,
  verdictNePretendPasAuthentifier: true
});
