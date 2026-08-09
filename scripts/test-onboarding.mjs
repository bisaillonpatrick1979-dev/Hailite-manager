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
  cloudProbeValid: false,
  cloudProbeRequests: [],
  demoSettingsVisible: false,
  demoActivated: false,
  demoCountsValid: false,
  demoMutationApplied: false,
  demoStatsVisible: false,
  demoRealStateRestored: false,
  demoCloudRequests: [],
  consoleErrors: [],
  pageErrors: [],
  testStage: 'launch',
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

  // Charge les modules du serveur Vite en arrière-plan et conserve leurs
  // références dans la page. Ne pas retourner la promesse import() à Puppeteer:
  // certains Chromium la libèrent prématurément (« Promise was collected »).
  // Ce pont n'existe que dans cette page de test et n'ajoute rien à l'app.
  result.testStage = 'test-bridge';
  await page.evaluate(() => {
    window.__hailiteTestBridge = null;
    window.__hailiteTestBridgeError = '';
    Promise.all([import('/src/store.ts'), import('/src/apiClient.ts')])
      .then(([storeModule, apiClient]) => {
        window.__hailiteTestBridge = {
          store: storeModule.useAppStore,
          snapshotKeys: storeModule.DEMO_SANDBOX_SNAPSHOT_KEYS,
          apiClient,
          cloudProbeDone: false,
          cloudProbeError: ''
        };
      })
      .catch(error => { window.__hailiteTestBridgeError = String(error?.message || error); });
  });
  await page.waitForFunction(
    () => Boolean(window.__hailiteTestBridge || window.__hailiteTestBridgeError),
    { timeout: 30000 }
  );
  const bridgeError = await page.evaluate(() => window.__hailiteTestBridgeError);
  if (bridgeError) throw new Error(`Pont de test impossible à charger: ${bridgeError}`);

  // Établit une session admin fictive en mémoire sans ajouter le moindre
  // contournement d'authentification au bundle de production.
  result.testStage = 'session';
  await page.evaluate(() => {
    const { store } = window.__hailiteTestBridge;
    const state = store.getState();
    const admin = state.employees.find(employee => employee.role === 'admin');
    if (!admin) throw new Error('Administrateur local de validation introuvable');
    store.setState({
      activeEmployee: {
        ...admin,
        privacyNoticeVersion: '2026.08',
        privacyNoticeAcknowledgedAt: '2026-08-06T12:00:00.000Z',
        locationNoticeAcknowledgedAt: '2026-08-06T12:00:00.000Z'
      }
    });
  });

  // Branche un faux serveur authentifié, puis prouve que les chemins lecture et
  // écriture atteignent réellement ce serveur AVANT d'activer l'isolation.
  result.testStage = 'cloud-probe';
  await page.evaluate(() => {
    const bridge = window.__hailiteTestBridge;
    const apiClient = bridge.apiClient;
    const originalFetch = window.fetch.bind(window);
    const calls = [];
    window.__hailiteCloudTestRequests = calls;
    window.fetch = async (input, init = {}) => {
      const request = input instanceof Request ? input : null;
      const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : request?.url || String(input);
      const url = new URL(rawUrl, window.location.href);
      const method = String(init.method || request?.method || 'GET').toUpperCase();
      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        calls.push(`${method} ${url.pathname}`);
        const payload = url.pathname === '/api/hydrate'
          ? { enabled: false, tables: {} }
          : { id: 'cloud-probe', ok: true };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(input, init);
    };

    apiClient.setAuthenticatedSession(true);
    apiClient.setCloudSyncAllowed(true);
    apiClient.hydrateFromCloud()
      .then(() => {
        apiClient.syncInsert('clients', { id: 'cloud-probe', name: 'Sonde CI' });
        bridge.cloudProbeDone = true;
      })
      .catch(error => {
        bridge.cloudProbeError = String(error?.message || error);
        bridge.cloudProbeDone = true;
      });
  });
  await page.waitForFunction(() => window.__hailiteTestBridge?.cloudProbeDone, { timeout: 30000 });
  const cloudProbeError = await page.evaluate(() => window.__hailiteTestBridge.cloudProbeError);
  if (cloudProbeError) throw new Error(`Sonde nuage échouée: ${cloudProbeError}`);
  await page.waitForFunction(
    () => window.__hailiteCloudTestRequests?.includes('POST /api/db/clients'),
    { timeout: 30000 }
  );
  result.cloudProbeRequests = await page.evaluate(() => {
    const requests = [...(window.__hailiteCloudTestRequests || [])];
    window.__hailiteCloudTestRequests.length = 0;
    return requests;
  });
  const cloudAllowed = await page.evaluate(() => window.__hailiteTestBridge.apiClient.isCloudSyncAllowed());
  result.cloudProbeValid = Boolean(
    cloudAllowed && result.cloudProbeRequests.includes('GET /api/hydrate') &&
    result.cloudProbeRequests.includes('POST /api/db/clients')
  );

  // La liste exportée par le store est la même source de vérité que celle qui
  // capture le véritable instantané. Le statut réseau est opérationnel et peut
  // légitimement être recalculé à la sortie; toutes les données sont comparées.
  result.testStage = 'snapshot-before-demo';
  const realStateBeforeDemo = await page.evaluate(() => {
    const { store, snapshotKeys } = window.__hailiteTestBridge;
    const state = store.getState();
    const keys = snapshotKeys.filter(key => key !== 'offlineSyncStatus');
    return {
      keys,
      serialized: JSON.stringify(Object.fromEntries(keys.map(key => [key, state[key]])))
    };
  });
  result.demoComparedCollections = realStateBeforeDemo.keys;

  await waitForText('Plus');
  await clickButton('Plus');
  await waitForText('Réglages');
  await clickButton('Réglages');
  await waitForText('Démo 5 ans');
  await clickButton('Démo 5 ans');
  await waitForText('Mode Démo — cinq ans de données');
  result.demoSettingsVisible = true;

  await checkLabel('Je comprends que toutes les modifications');
  await clickButton('Activer le Mode Démo 5 ans');
  await waitForText('Mode Démo 5 ans — données fictives');
  result.demoActivated = true;

  result.testStage = 'demo-state';
  const demoState = await page.evaluate(() => {
    const state = window.__hailiteTestBridge.store.getState();
    return {
      active: state.demoSandboxActive,
      totalRows: state.demoSandboxSummary?.counts.totalRows || 0,
      projects: state.projects.length,
      punches: state.punchSessions.length,
      documents: state.documents.length,
      photos: state.projectPhotos.length,
      safety: state.safetyRecords.length
    };
  });
  result.demoCounts = demoState;
  result.demoCountsValid = Boolean(
    demoState.active && demoState.totalRows >= 6500 && demoState.projects >= 100 &&
    demoState.punches >= 3000 && demoState.documents >= 280 && demoState.photos >= 280 && demoState.safety >= 180
  );

  // Tente une hydratation et une vraie mutation de store pendant la démo. Sans
  // les gardes du bac à sable, ces deux opérations atteindraient le faux nuage
  // validé ci-dessus; avec l'isolation, elles restent entièrement en mémoire.
  result.testStage = 'demo-isolation';
  const isolationProof = await page.evaluate(() => {
    const { apiClient, store } = window.__hailiteTestBridge;
    void apiClient.hydrateFromCloud();
    const clientName = 'Client ajouté uniquement dans la démo';
    store.getState().addClient({
      name: clientName,
      company: 'Bac à sable',
      email: 'demo-only@hailite.example',
      phone: '403-555-0199',
      address: 'Adresse fictive'
    });
    return {
      mutationApplied: store.getState().clients.some(client => client.name === clientName),
      requests: [...window.__hailiteCloudTestRequests]
    };
  });
  result.demoMutationApplied = isolationProof.mutationApplied;
  result.demoCloudRequests = isolationProof.requests;

  await clickButton('Stats');
  await page.waitForSelector('#view-stats-content', { visible: true, timeout: 30000 });
  result.demoStatsVisible = await page.$eval('#view-stats-content', element => (element.innerText || '').trim().length > 500);

  await clickButton('Retour aux vraies données');
  await page.waitForFunction(
    () => !(document.body.textContent || '').includes('Mode Démo 5 ans — données fictives'),
    { timeout: 30000 }
  );
  result.testStage = 'snapshot-after-demo';
  const realStateAfterDemo = await page.evaluate(() => {
    const { store, snapshotKeys } = window.__hailiteTestBridge;
    const state = store.getState();
    const keys = snapshotKeys.filter(key => key !== 'offlineSyncStatus');
    return {
      keys,
      serialized: JSON.stringify(Object.fromEntries(keys.map(key => [key, state[key]])))
    };
  });
  result.demoRealStateRestored = (
    JSON.stringify(realStateAfterDemo.keys) === JSON.stringify(realStateBeforeDemo.keys) &&
    realStateAfterDemo.serialized === realStateBeforeDemo.serialized
  );
  result.testStage = 'complete';
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
  result.cloudProbeValid && result.demoSettingsVisible && result.demoActivated && result.demoCountsValid && result.demoMutationApplied &&
  result.demoStatsVisible && result.demoRealStateRestored && result.demoCloudRequests.length === 0 &&
  result.consoleErrors.length === 0 && result.pageErrors.length === 0 &&
  !result.hookErrorDetected && !result.testError
);

fs.writeFileSync('onboarding-transition-test-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exit(1);
