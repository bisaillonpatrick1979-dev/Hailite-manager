/**
 * Parcours hors serveur, dans un vrai navigateur.
 *
 * Le mode « nuage personnel » promet à l'acheteur que son entreprise vit sur
 * son appareil, sans aucun compte à créer nulle part. Deux choses doivent donc
 * être vraies, et ni l'une ni l'autre ne se prouve en lisant le code :
 *
 *   1. les données survivent au démarrage — la purge de sécurité les effaçait
 *      toutes, quel que soit le mode choisi;
 *   2. le NIP se vérifie sur l'appareil, sans le moindre appel réseau, parce
 *      qu'il n'y a aucun serveur à interroger.
 *
 * Ce que contient le fichier de sauvegarde est éprouvé ailleurs, par
 * tests/personal-backup.test.ts. Le parcours d'accueil l'est par
 * test-onboarding.mjs : on installe ici directement l'état qu'il produit.
 */
import puppeteer from 'puppeteer-core';

const result = {
  testedAt: new Date().toISOString(),
  url: process.env.OFFLINE_URL || 'http://127.0.0.1:4173',
  donneesSurvivantAuDemarrage: false,
  employeProposeALaConnexion: false,
  mauvaisNipRefuse: false,
  nipVerifieSurLAppareil: false,
  aucunAppelDAuthentification: true,
  requetesApi: [],
  consoleErrors: [],
  pageErrors: [],
  etape: 'lancement',
  passed: false
};

const patienter = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cliquerBoutonContenant(page, texteAttendu, exact = false) {
  const boutons = await page.$$('button');
  for (const bouton of boutons) {
    const texte = (await page.evaluate(element => element.textContent || '', bouton)).trim();
    if (exact ? texte === texteAttendu : texte.includes(texteAttendu)) {
      await bouton.click();
      return true;
    }
  }
  return false;
}

let browser;
try {
  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH manquant');
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  page.on('console', message => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => result.pageErrors.push(String(error)));
  page.on('request', request => {
    const url = request.url();
    if (!url.includes('/api/')) return;
    result.requetesApi.push(url);
    if (url.includes('/api/auth/')) result.aucunAppelDAuthentification = false;
  });

  // --- Installer l'état que produit l'accueil en mode nuage personnel -------
  result.etape = 'installation';
  await page.goto(result.url, { waitUntil: 'domcontentloaded' });

  // L'empreinte est calculée exactement comme le fait localAuth.ts.
  const empreinte = await page.evaluate(async nip => {
    const sel = crypto.getRandomValues(new Uint8Array(16));
    const cle = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(nip), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: sel, iterations: 210000, hash: 'SHA-256' }, cle, 256
    );
    const b64 = octets => btoa(String.fromCharCode(...new Uint8Array(octets)));
    return `pbkdf2-sha256$210000$${b64(sel)}$${b64(bits)}`;
  }, '4821');

  await page.evaluate(accessCodeHash => {
    localStorage.clear();
    localStorage.setItem('gcp_companyInfo', JSON.stringify({
      name: 'Hailite Xteriors', dataStorageMode: 'personal_cloud',
      country: 'CA', region: 'AB', currency: 'CAD', isOnboarded: true,
      complianceVersion: '2026.08'
    }));
    localStorage.setItem('gcp_isOnboarded', JSON.stringify(true));
    localStorage.setItem('gcp_employees', JSON.stringify([{
      id: 'e1', name: 'Patrick Bisaillon', nip: '', accessCodeHash,
      role: 'admin', hourlyRate: 0, workerType: 'Administration',
      asNumber: '', phone: '', address: '', hireDate: '2026-01-05',
      avatar: '', level: 1, xp: 0
    }]));
    localStorage.setItem('gcp_projects', JSON.stringify([{
      id: 'c1', name: '335 Grégoire', clientName: 'Client test', address: '',
      latitude: 56.7, longitude: -111.4, radius: 100, assignedEmployees: [], status: 'active'
    }]));
  }, empreinte);

  // --- 1) Les données survivent-elles au démarrage ? -----------------------
  result.etape = 'demarrage';
  await page.reload({ waitUntil: 'networkidle2' });
  await patienter(2000);

  const restant = await page.evaluate(() => ({
    employes: JSON.parse(localStorage.getItem('gcp_employees') || 'null'),
    chantiers: JSON.parse(localStorage.getItem('gcp_projects') || 'null')
  }));
  result.donneesSurvivantAuDemarrage =
    Array.isArray(restant.employes) && restant.employes.length === 1
    && typeof restant.employes[0].accessCodeHash === 'string'
    && Array.isArray(restant.chantiers) && restant.chantiers.length === 1;

  // --- 2) Le NIP se vérifie-t-il sur l'appareil ? --------------------------
  result.etape = 'choix du profil';
  result.employeProposeALaConnexion = await cliquerBoutonContenant(page, 'Patrick Bisaillon');
  await patienter(600);

  // D'abord un mauvais NIP. Sans cette étape, « la connexion a marché » ne
  // voudrait rien dire : il faut prouver que quelque chose vérifie vraiment.
  result.etape = 'mauvais NIP';
  for (const chiffre of ['0', '0', '0', '0']) {
    await cliquerBoutonContenant(page, chiffre, true);
    await patienter(150);
  }
  await patienter(2500);
  // L'interface met le message en majuscules : la comparaison doit l'ignorer.
  result.mauvaisNipRefuse = await page.evaluate(() => {
    const texte = (document.body.innerText || '').toLowerCase();
    return texte.includes('nip incorrect') || texte.includes('incorrect pin');
  });

  result.etape = 'bon NIP';
  for (const chiffre of ['4', '8', '2', '1']) {
    await cliquerBoutonContenant(page, chiffre, true);
    await patienter(150);
  }
  await patienter(3000);

  // Le succès se juge sur la disparition de l'écran de connexion, pas sur
  // l'absence d'un message d'erreur : un écran figé n'affiche rien non plus.
  result.nipVerifieSurLAppareil = await page.evaluate(() => {
    const texte = (document.body.innerText || '').toLowerCase();
    return !texte.includes('nip incorrect') && !texte.includes('incorrect pin')
      && !texte.includes('entrez votre nip') && !texte.includes('enter your pin')
      && !texte.includes('sélectionnez votre profil') && !texte.includes('select your profile')
      && !!document.querySelector('nav');
  });

  result.passed =
    result.donneesSurvivantAuDemarrage === true
    && result.employeProposeALaConnexion === true
    && result.mauvaisNipRefuse === true
    && result.nipVerifieSurLAppareil === true
    && result.aucunAppelDAuthentification === true
    && result.pageErrors.length === 0;
  result.etape = 'terminé';
} catch (error) {
  result.pageErrors.push(String(error?.message || error));
} finally {
  await browser?.close();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
