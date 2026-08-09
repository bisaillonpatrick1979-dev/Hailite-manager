import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.env.STORE_SCREENSHOT_URL || 'http://127.0.0.1:4173';
const chromePath = process.env.CHROME_PATH;
if (!chromePath) throw new Error('CHROME_PATH manquant');
const emojiFontPath = process.env.STORE_EMOJI_FONT_PATH;

const outputDir = path.resolve('store-assets/google-play/screenshots');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const consoleErrors = [];
const pageErrors = [];

try {
  const page = await browser.newPage();
  // 360 × 640 CSS pixels at DPR 3 produces Play-ready 1080 × 1920 images.
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForSelector('#hailite-onboarding-screen', { visible: true, timeout: 30000 });

  // Les téléphones Android possèdent une police emoji. Le Chrome headless
  // minimal utilisé en CI n’en a pas; cette injection facultative garde les
  // captures fidèles à ce qu’un utilisateur voit réellement sur son appareil.
  if (emojiFontPath) {
    const font = fs.readFileSync(emojiFontPath).toString('base64');
    await page.addStyleTag({ content: `
      @font-face { font-family: 'Hailite Screenshot Emoji'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 400; }
      html, body, button, a, span, p, h1, h2, h3, h4, div { font-family: system-ui, 'Hailite Screenshot Emoji', sans-serif; }
    ` });
    await page.evaluate(() => document.fonts.ready);
  }

  const legalLinkCount = await page.$$eval('nav[aria-label="Liens légaux"] a', links => links.length);
  if (legalLinkCount !== 3) throw new Error(`Liens légaux incomplets: ${legalLinkCount}`);

  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store.ts');
    const state = useAppStore.getState();
    state.setLanguage('FR');
    state.updateCompanyInfo({
      name: 'Hailite Exteriors',
      logo: '/app-icon-192.png',
      isOnboarded: true,
      complianceVersion: '2026.08',
      privacyPolicyVersion: '2026.08',
      geofencingEnabled: false
    });
    state.setIsOnboarded(true);
  });

  await page.waitForSelector('#login-container-wrapper', { visible: true, timeout: 30000 });
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store.ts');
    const state = useAppStore.getState();
    const admin = state.employees.find(employee => employee.role === 'admin');
    if (!admin) throw new Error('Administrateur de démonstration introuvable');
    sessionStorage.setItem(`gcp_help_welcome_${admin.id}_v1`, new Date().toISOString());
    useAppStore.setState({
      activeEmployee: {
        ...admin,
        name: 'Patrick',
        avatar: '/app-icon-192.png',
        privacyNoticeVersion: '2026.08',
        privacyNoticeAcknowledgedAt: new Date().toISOString(),
        locationNoticeAcknowledgedAt: new Date().toISOString()
      }
    });
  });

  await page.waitForSelector('#workspace-scaffold-layout', { visible: true, timeout: 30000 });

  const logoReady = await page.$eval('#navbar-scaffold img', image =>
    image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  );
  if (!logoReady) throw new Error('Le logo de la barre mobile ne peut pas être chargé');

  const assertNoHorizontalOverflow = async label => {
    const result = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('body *')]
        .map(element => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: String(element.className || '').slice(0, 160),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
          };
        })
        .filter((item, index) => {
          const element = document.querySelectorAll('body *')[index];
          if (element?.closest('#navbar-scaffold, #fixed-bottom-navigation-main')) return false;
          return item.width > document.documentElement.clientWidth + 1 || item.right > document.documentElement.clientWidth + 1 || item.left < -1;
        })
        .slice(0, 12)
    }));
    if (result.scrollWidth > result.clientWidth + 1) {
      throw new Error(`${label}: débordement horizontal ${result.scrollWidth}/${result.clientWidth} ${JSON.stringify(result.offenders)}`);
    }
  };

  const capture = async (fileName, selector, resetScroll = false) => {
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    if (resetScroll) await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    await new Promise(resolve => setTimeout(resolve, 250));
    await assertNoHorizontalOverflow(fileName);
    await page.screenshot({ path: path.join(outputDir, fileName), fullPage: false });
  };

  const clickNav = async label => {
    await page.evaluate(label => {
      const button = [...document.querySelectorAll('#fixed-bottom-navigation-main button')]
        .find(element => (element.textContent || '').includes(label));
      if (!button) throw new Error(`Navigation introuvable: ${label}`);
      button.click();
    }, label);
    await page.waitForFunction(() => window.scrollY < 2, { timeout: 5000 });
  };

  await capture('01-tableau-de-bord.png', '#view-home-content', true);
  await clickNav('Projets');
  await page.waitForSelector('#project-search-and-directory', { visible: true, timeout: 30000 });
  await page.$eval('#project-search-and-directory', element => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -76));
  await capture('02-chantiers.png', '#project-search-and-directory');
  await clickNav('Docs');
  await capture('03-documents.png', '#clients-documents-manager', true);
  await clickNav('Stats');
  await capture('04-statistiques.png', '#view-stats-content', true);

  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Erreurs navigateur: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }

  console.log(JSON.stringify({
    passed: true,
    viewport: '360x640@3x',
    output: '1080x1920',
    screenshots: fs.readdirSync(outputDir).filter(name => name.endsWith('.png')).sort(),
    legalLinkCount,
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
