import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let checks = 0;
const failures: string[] = [];

const file = (relative: string) => path.join(root, relative);
const read = (relative: string) => fs.readFileSync(file(relative), 'utf8');

function check(condition: unknown, label: string) {
  checks += 1;
  if (!condition) failures.push(label);
}

function includes(relative: string, expected: string, label = `${relative} contient ${expected}`) {
  check(read(relative).includes(expected), label);
}

function excludes(relative: string, forbidden: string, label = `${relative} exclut ${forbidden}`) {
  check(!read(relative).includes(forbidden), label);
}

function dimensions(relative: string, width: number, height: number) {
  const bytes = fs.readFileSync(file(relative));
  const isPng = bytes.length >= 24 && bytes.subarray(1, 4).toString() === 'PNG';
  check(isPng, `${relative} est un PNG valide`);
  if (!isPng) return;
  check(bytes.readUInt32BE(16) === width && bytes.readUInt32BE(20) === height, `${relative} mesure ${width} × ${height}`);
}

const requiredFiles = [
  '.env.mobile',
  'capacitor.config.ts',
  'public/manifest.webmanifest',
  'public/privacy.html',
  'public/terms.html',
  'public/account-deletion.html',
  'public/sw.js',
  'android/app/build.gradle',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/res/xml/network_security_config.xml',
  'android/app/src/main/res/xml/data_extraction_rules.xml',
  '.github/workflows/android.yml',
  'scripts/capture-store-screenshots.mjs',
  'store-assets/google-play/listing-fr-CA.md',
  'store-assets/google-play/listing-en-CA.md',
  'store-assets/google-play/data-safety-draft.md',
  'store-assets/google-play/icon-512.svg',
  'store-assets/release-checklist.md'
];
for (const relative of requiredFiles) check(fs.existsSync(file(relative)), `${relative} existe`);

const packageJson = JSON.parse(read('package.json')) as {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};
const packageLock = JSON.parse(read('package-lock.json')) as { version?: string; packages?: Record<string, { version?: string }> };
check(packageJson.version === '1.0.0', 'package.json utilise la version 1.0.0');
check(packageLock.version === '1.0.0', 'package-lock.json utilise la version 1.0.0');
check(packageLock.packages?.['']?.version === '1.0.0', 'la racine du lockfile utilise la version 1.0.0');
for (const script of ['build:mobile', 'android:apk', 'android:bundle', 'store:screenshots', 'store:validate']) {
  check(Boolean(packageJson.scripts?.[script]), `le script npm ${script} existe`);
}
for (const dependency of ['@capacitor/android', '@capacitor/core', '@capacitor/geolocation', '@capacitor/splash-screen']) {
  check(Boolean(packageJson.dependencies?.[dependency]), `la dépendance ${dependency} est verrouillée`);
}

const mobileEnv = read('.env.mobile');
check(/^VITE_API_BASE_URL="https:\/\//m.test(mobileEnv), 'l’API mobile utilise HTTPS');
check(!/^VITE_[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)=/m.test(mobileEnv), 'aucun secret public VITE_ dans .env.mobile');

const capacitor = read('capacitor.config.ts');
includes('capacitor.config.ts', "appId: 'ca.hailite.manager'");
includes('capacitor.config.ts', "appName: 'Hailite Manager'");
includes('capacitor.config.ts', "webDir: 'dist'");
// Ce qui doit rester interdit, c'est de charger l'interface depuis un serveur
// distant : Google rejette les simples enveloppes de site web, et l'application
// exécuterait du code livré hors de la version examinée. C'est `server.url` qui
// fait cela — pas la clé `server` elle-même, qui sert aussi à épingler le
// schéma local de la WebView (voir capacitor.config.ts).
excludes('capacitor.config.ts', 'url:', 'aucune URL WebView distante dans la configuration de production');
excludes('capacitor.config.ts', 'cleartext: true', 'aucun trafic en clair autorisé par Capacitor');
includes(
  'capacitor.config.ts',
  "androidScheme: 'https'",
  'le schéma Android est épinglé (il détermine l’origine acceptée par le serveur)'
);
includes('capacitor.config.ts', 'allowMixedContent: false');
includes('capacitor.config.ts', 'webContentsDebuggingEnabled: false');
check(capacitor.includes("loggingBehavior: 'debug'"), 'les journaux WebView sont limités aux builds debug');

const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name?: string;
  display?: string;
  icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
};
check(manifest.name === 'Hailite Manager', 'le manifeste PWA porte le bon nom');
check(manifest.display === 'standalone', 'le manifeste PWA est installable en mode autonome');
check(Boolean(manifest.icons?.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable')), 'une icône PWA maskable 512 existe');
includes('index.html', 'Content-Security-Policy');
includes('index.html', '/manifest.webmanifest');
includes('src/main.tsx', "serviceWorker.register('/sw.js')");

for (const legalPage of ['public/privacy.html', 'public/terms.html', 'public/account-deletion.html']) {
  includes(legalPage, 'info@hailitexteriors.ca', `${legalPage} contient le contact public`);
  check(!/TODO|CHANGE_ME|example\.com/i.test(read(legalPage)), `${legalPage} ne contient aucun espace réservé`);
}
includes('public/privacy.html', 'precise or approximate location only during a requested punch', 'la politique anglaise explique la localisation au pointage');
includes('public/privacy.html', 'does not retain the raw audio recording', 'la politique anglaise explique le traitement de la dictée');
includes('public/privacy.html', 'Nous ne vendons pas les renseignements personnels', 'la politique française explique l’absence de vente');
includes('store-assets/google-play/data-safety-draft.md', 'Yes (potentially ephemeral)', 'le brouillon Data safety déclare prudemment la dictée vocale');
includes('public/account-deletion.html', '30 jours', 'la page de suppression donne un délai français');
includes('public/account-deletion.html', '30 days', 'la page de suppression donne un délai anglais');

const variables = read('android/variables.gradle');
check(/minSdkVersion\s*=\s*24/.test(variables), 'Android minSdk 24');
check(/compileSdkVersion\s*=\s*36/.test(variables), 'Android compileSdk 36');
check(/targetSdkVersion\s*=\s*36/.test(variables), 'Android targetSdk 36');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
for (const permission of ['INTERNET', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO']) {
  check(androidManifest.includes(`android.permission.${permission}`), `permission Android ${permission}`);
}
check(!androidManifest.includes('ACCESS_BACKGROUND_LOCATION'), 'aucune localisation Android en arrière-plan');
check(!/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/.test(androidManifest), 'aucune permission Android de stockage large');
check(androidManifest.includes('android:allowBackup="false"'), 'sauvegarde Android automatique désactivée');
check(androidManifest.includes('android:usesCleartextTraffic="false"'), 'trafic Android en clair bloqué');
const gradle = read('android/app/build.gradle');
check(/versionCode\s+1\b/.test(gradle), 'Android versionCode 1');
check(/versionName\s+"1\.0\.0"/.test(gradle), 'Android versionName 1.0.0');
check(gradle.includes('minifyEnabled true') && gradle.includes('shrinkResources true'), 'optimisation du build Android release activée');
check(gradle.includes("rootProject.file('keystore.properties')"), 'signature Android externe au dépôt');

dimensions('public/app-icon-180.png', 180, 180);
dimensions('public/app-icon-192.png', 192, 192);
dimensions('public/app-icon-512.png', 512, 512);
dimensions('public/app-icon-maskable-512.png', 512, 512);
dimensions('store-assets/google-play/icon-512.png', 512, 512);
dimensions('store-assets/google-play/feature-graphic-1024x500.png', 1024, 500);
const playIcon = fs.readFileSync(file('store-assets/google-play/icon-512.png'));
check(![4, 6].includes(playIcon[25]) && !playIcon.includes(Buffer.from('tRNS')), 'l’icône Play Store a un fond carré opaque sans coins prémasqués');
for (const screenshot of [
  '01-tableau-de-bord.png',
  '02-chantiers.png',
  '03-documents.png',
  '04-statistiques.png'
]) {
  dimensions(`store-assets/google-play/screenshots/${screenshot}`, 1080, 1920);
}

const runtime = read('src/runtimeConfig.ts');
check(runtime.includes("headers.set('X-Hailite-Client', nativePlatform)"), 'le client natif s’identifie explicitement');
check(runtime.includes("credentials: isNativeRuntime ? 'omit'"), 'le client natif ne dépend pas des cookies WebView');
includes('auth.ts', 'authorization.match(/^Bearer', 'le serveur accepte un jeton Bearer natif');
includes('apiRoutes.ts', '...(nativeClient ? { sessionToken: token } : {})', 'le jeton natif n’est pas renvoyé au navigateur Web');
includes('src/hooks/useGeofencing.ts', 'activeEmployee?.locationNoticeAcknowledgedAt', 'la permission GPS attend l’avis au personnel');
includes('src/App.tsx', 'Confidentialité et compte', 'les réglages donnent accès à la confidentialité et à la suppression');
excludes('src/apiClient.ts', "fetch('/api/", 'apiClient passe par le transport unifié');
excludes('src/App.tsx', "fetch('/api/", 'App passe par le transport unifié');

const frListing = read('store-assets/google-play/listing-fr-CA.md');
const enListing = read('store-assets/google-play/listing-en-CA.md');
const frShort = frListing.match(/## Description courte\s+> ([^\n]+)/)?.[1] || '';
const enShort = enListing.match(/## Short description\s+> ([^\n]+)/)?.[1] || '';
const frFull = frListing.match(/## Description complète\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() || '';
const enFull = enListing.match(/## Full description\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() || '';
const frRelease = frListing.match(/## Notes de version 1\.0\.0\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() || '';
const enRelease = enListing.match(/## Version 1\.0\.0 release notes\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() || '';
for (const [listing, language] of [[frListing, 'française'], [enListing, 'anglaise']] as const) {
  check(listing.includes('Hailite Manager') && 'Hailite Manager'.length <= 30, `le titre ${language} respecte la limite de 30 caractères`);
}
check(frShort.length > 0 && frShort.length <= 80, `description courte française ≤ 80 caractères (${frShort.length})`);
check(enShort.length > 0 && enShort.length <= 80, `description courte anglaise ≤ 80 caractères (${enShort.length})`);
check(frFull.length >= 200 && frFull.length <= 4000, `description complète française entre 200 et 4 000 caractères (${frFull.length})`);
check(enFull.length >= 200 && enFull.length <= 4000, `description complète anglaise entre 200 et 4 000 caractères (${enFull.length})`);
check(frRelease.length > 0 && frRelease.length <= 500, `notes de version françaises ≤ 500 caractères (${frRelease.length})`);
check(enRelease.length > 0 && enRelease.length <= 500, `notes de version anglaises ≤ 500 caractères (${enRelease.length})`);

if (failures.length) {
  console.error(`\n❌ Préparation boutique : ${failures.length} échec(s) sur ${checks} contrôles`);
  failures.forEach(failure => console.error(`  - ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`✅ Préparation boutique : ${checks} contrôles réussis`);
}
