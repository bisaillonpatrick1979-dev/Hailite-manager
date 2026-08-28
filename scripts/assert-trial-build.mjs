/**
 * Vérifie qu'une compilation d'essai en est vraiment une.
 *
 * Le drapeau vient d'un fichier .env.trial. S'il manque — parce qu'il a été
 * oublié, ignoré par git, ou effacé — `vite build --mode trial` réussit quand
 * même et produit une application NORMALE : complète, sans échéance, et
 * pointée sur le serveur inscrit dans la compilation. Autrement dit, l'APK
 * envoyé à un inconnu pour « essayer » lui ouvrirait les données de
 * l'entreprise qui le lui a envoyé.
 *
 * C'est exactement ce qui est arrivé : .env.trial était couvert par la règle
 * `.env*` du .gitignore. Le parcours navigateur l'a attrapé en intégration
 * continue, mais personne n'aurait rien vu en fabriquant l'APK à la main.
 *
 * Ce contrôle transforme donc un échec silencieux et dangereux en un arrêt
 * bruyant, avant que le fichier ne parte à qui que ce soit.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2] || 'dist-trial';
const assets = join(dossier, 'assets');

let fichiers;
try {
  fichiers = readdirSync(assets).filter(nom => nom.endsWith('.js'));
} catch {
  console.error(`✗ Aucun dossier « ${assets} » : la compilation n'a pas eu lieu.`);
  process.exit(1);
}

const marque = fichiers.some(nom =>
  /VITE_TRIAL_DAYS\s*:\s*["'`]\d+["'`]/.test(readFileSync(join(assets, nom), 'utf8'))
);

if (!marque) {
  console.error(
    '✗ Cette compilation N\'EST PAS une version d\'essai.\n' +
    '\n' +
    '  VITE_TRIAL_DAYS est absent du résultat. Le fichier .env.trial manque ou\n' +
    '  ne contient pas de valeur valide.\n' +
    '\n' +
    '  Ne distribuez PAS ce fichier : il se comporterait comme l\'application\n' +
    '  complète et contacterait le serveur inscrit dans la compilation.\n'
  );
  process.exit(1);
}

console.log('✓ Version d\'essai confirmée : l\'échéance est bien embarquée.');
