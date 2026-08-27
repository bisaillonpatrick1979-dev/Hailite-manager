/**
 * Version d'essai, dans un vrai navigateur.
 *
 * Ce qu'on envoie à quelqu'un qui veut essayer l'application doit tenir trois
 * promesses, et aucune ne se prouve en lisant le code :
 *
 *   1. c'est vierge — aucune donnée de l'entreprise qui l'a envoyée;
 *   2. ça ne parle à AUCUN serveur. C'est la promesse la plus importante :
 *      l'adresse du serveur est figée dans l'application à la compilation, donc
 *      sans garde, la copie d'essai irait lire et écrire dans les données de
 *      celui qui l'a envoyée;
 *   3. l'accès s'arrête tout seul à l'échéance, et reculer l'horloge de
 *      l'appareil ne le rouvre pas.
 */
import puppeteer from 'puppeteer-core';

const result = {
  testedAt: new Date().toISOString(),
  url: process.env.TRIAL_URL || 'http://127.0.0.1:4174',
  demarreVierge: false,
  aucunAppelReseau: true,
  choixServeurAbsent: false,
  decompteAffiche: false,
  bloqueApresEcheance: false,
  reculerHorlogeNeRouvreRien: false,
  requetesApi: [],
  pageErrors: [],
  etape: 'lancement',
  passed: false
};

const patienter = ms => new Promise(resolve => setTimeout(resolve, ms));

let browser;
try {
  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH manquant');
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  page.on('pageerror', error => result.pageErrors.push(String(error)));
  page.on('request', request => {
    const url = request.url();
    if (!url.includes('/api/')) return;
    result.requetesApi.push(url);
    result.aucunAppelReseau = false;
  });

  // --- 1) Installation neuve : rien ne doit s'y trouver --------------------
  result.etape = 'installation neuve';
  await page.goto(result.url, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await patienter(2500);

  const contenu = await page.evaluate(() => {
    const cles = Object.keys(localStorage).filter(k => k.startsWith('gcp_'));
    const metier = cles.filter(k => !['gcp_trialStartedAt', 'gcp_trialLastSeenAt',
      'gcp_currentLanguage', 'gcp_currentTheme', 'gcp_companyInfo', 'gcp_isOnboarded'].includes(k));
    return { cles, metier, debut: localStorage.getItem('gcp_trialStartedAt') };
  });
  result.demarreVierge = contenu.metier.length === 0 && !!contenu.debut;

  // --- 2) Le choix « serveur » ne doit pas être proposé --------------------
  result.etape = 'choix du stockage';
  const texteAccueil = await page.evaluate(() => document.body.innerText);
  result.choixServeurAbsent = !texteAccueil.includes('Supabase');

  // --- 3) Le décompte est-il visible ? -------------------------------------
  result.decompteAffiche = /essai/i.test(texteAccueil) || /trial/i.test(texteAccueil);

  // --- 4) Passé l'échéance, l'accès est fermé ------------------------------
  result.etape = 'échéance';
  await page.evaluate(() => {
    const vieux = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    localStorage.setItem('gcp_trialStartedAt', JSON.stringify(vieux));
    localStorage.setItem('gcp_trialLastSeenAt', JSON.stringify(vieux));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await patienter(2500);
  result.bloqueApresEcheance = await page.evaluate(() => {
    const texte = (document.body.innerText || '').toLowerCase();
    return texte.includes('essai est terminé') || texte.includes('trial has ended');
  });

  // --- 5) Reculer l'horloge ne rouvre rien ---------------------------------
  // On remet une date de début récente, mais la date « la plus tardive jamais
  // vue » reste au-delà de l'échéance : l'accès doit rester fermé.
  result.etape = 'horloge reculée';
  await page.evaluate(() => {
    localStorage.setItem('gcp_trialStartedAt', JSON.stringify(new Date().toISOString()));
    localStorage.setItem('gcp_trialLastSeenAt', JSON.stringify(new Date(Date.now() + 9 * 24 * 3600 * 1000).toISOString()));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await patienter(2500);
  result.reculerHorlogeNeRouvreRien = await page.evaluate(() => {
    const texte = (document.body.innerText || '').toLowerCase();
    return texte.includes('essai est terminé') || texte.includes('trial has ended');
  });

  result.passed =
    result.demarreVierge === true
    && result.aucunAppelReseau === true
    && result.choixServeurAbsent === true
    && result.decompteAffiche === true
    && result.bloqueApresEcheance === true
    && result.reculerHorlogeNeRouvreRien === true
    && result.pageErrors.length === 0;
  result.etape = 'terminé';
} catch (error) {
  result.pageErrors.push(String(error?.message || error));
} finally {
  await browser?.close();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
