import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const result = {
  testedAt: new Date().toISOString(),
  url: process.env.ONBOARDING_URL || 'http://127.0.0.1:4173',
  onboardingVisible: false,
  clickedFinish: false,
  mainVisibleWithoutReload: false,
  loginVisibleWithoutReload: false,
  rootHasContent: false,
  bodyIsNotBlank: false,
  hookErrorDetected: false,
  consoleErrors: [],
  pageErrors: [],
  passed: false
};

let browser;
try {
  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH manquant');
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  page.on('console', message => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => result.pageErrors.push(error.message));

  const setLabelValue = async (fragment, value) => {
    await page.evaluate(({ fragment, value }) => {
      const label = [...document.querySelectorAll('label')]
        .find(element => (element.textContent || '').includes(fragment));
      const input = label?.querySelector('input, textarea, select');
      if (!input) throw new Error(`Champ introuvable: ${fragment}`);
      const prototype = input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : input instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { fragment, value });
  };

  const checkLabel = async fragment => {
    await page.evaluate(fragment => {
      const label = [...document.querySelectorAll('label')]
        .find(element => (element.textContent || '').includes(fragment));
      const input = label?.querySelector('input[type="checkbox"]');
      if (!input) throw new Error(`Case introuvable: ${fragment}`);
      if (!input.checked) input.click();
    }, fragment);
  };

  const clickButton = async text => {
    await page.evaluate(text => {
      const button = [...document.querySelectorAll('button')]
        .find(element => (element.textContent || '').trim().includes(text) && !element.disabled);
      if (!button) throw new Error(`Bouton actif introuvable: ${text}`);
      button.click();
    }, text);
  };

  const waitForText = text => page.waitForFunction(
    expected => (document.body.textContent || '').includes(expected),
    { timeout: 30000 },
    text
  );

  await page.goto(result.url, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForSelector('#hailite-onboarding-screen', { visible: true, timeout: 30000 });
  result.onboardingVisible = true;

  await setLabelValue('Nom légal ou commercial', 'Hailite Test Transition');
  await setLabelValue('Courriel de compagnie', 'test@hailite.example');
  await setLabelValue('Courriel pour les demandes de confidentialité', 'privacy@hailite.example');
  await clickButton('Continuer');
  await waitForText('Pays, région et formats');

  await clickButton('Continuer');
  await waitForText('Taxes à confirmer');
  await checkLabel('Je confirme avoir vérifié ces taux');
  await clickButton('Continuer');
  await waitForText('Données, confidentialité et hébergement');

  await clickButton('Supabase');
  await checkLabel('Avis et rôle');
  await checkLabel('Je confirmerai la base juridique');
  await checkLabel('Je comprends que le GPS');
  await clickButton('Continuer');
  await waitForText('Importer les données existantes');
  await clickButton('Continuer');
  await waitForText('Apparence et confirmation');

  await clickButton('Enregistrer et ouvrir');
  result.clickedFinish = true;
  await page.waitForSelector('#main-scaffold-container', { visible: true, timeout: 30000 });
  result.mainVisibleWithoutReload = await page.$eval('#main-scaffold-container', element => Boolean(element.offsetWidth || element.offsetHeight));
  result.loginVisibleWithoutReload = await page.$eval('#login-container-wrapper', element => Boolean(element.offsetWidth || element.offsetHeight));
  result.rootHasContent = await page.$eval('#root', element => element.childElementCount > 0 && element.innerHTML.trim().length > 100);
  result.bodyIsNotBlank = await page.$eval('body', element => (element.innerText || '').trim().length > 100);
} catch (error) {
  result.testError = String(error?.stack || error);
} finally {
  if (browser) await browser.close();
}

result.hookErrorDetected = [...result.consoleErrors, ...result.pageErrors]
  .some(message => /Rendered more hooks|hooks than during the previous render|change in the order of Hooks/i.test(message));
result.passed = Boolean(
  result.onboardingVisible && result.clickedFinish && result.mainVisibleWithoutReload &&
  result.loginVisibleWithoutReload && result.rootHasContent && result.bodyIsNotBlank &&
  !result.hookErrorDetected && !result.testError
);

fs.writeFileSync('onboarding-transition-test-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exit(1);
