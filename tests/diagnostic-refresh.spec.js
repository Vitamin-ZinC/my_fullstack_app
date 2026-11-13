const { test, expect } = require('@playwright/test');
const base = process.env.E2E_APP_BASE || 'http://localhost:3000';
const cors = { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-session-id,x-guest-token,x-locale', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const freeReport = { profession: 'Research lead', summary: 'You described research projects and explaining complex ideas to others.', key_insight: 'Try a short research brief and ask one colleague for feedback on clarity.', ikigai_scores: { love: 70, good_at: 75, world_needs: 65, paid_for: 60 }, paid_report_teaser: 'SENTINEL duplicate five roles', paid_report_preview: ['SENTINEL duplicate five roles', 'SENTINEL duplicate five roles', 'SENTINEL duplicate five roles', '30-day plan'] };
const diagnosticValue = 'Your result: Clear presentation. What it means: Useful for explaining an idea. Recommendation: Test a short work presentation and ask for feedback.';
const fullReport = { ...freeReport, voice_analysis: { pace: diagnosticValue }, face_analysis: { communication: diagnosticValue }, top_roles: Array.from({ length: 5 }, (_, i) => ({ name: `Research direction ${i + 1}`, match: 85 - i * 5, why: 'Explore this practical direction through a small work experiment.', strengths: 'Explaining complex information.', risks: 'Validate the context before committing.', voiceEvidence: diagnosticValue, faceEvidence: diagnosticValue })), ikigai_zones: Object.fromEntries(['passion', 'mission', 'profession', 'vocation', 'ikigai'].map(id => [id, { title: id, insight: 'Your story connects research with practical explanations.', recommendation: 'Test one short project.' }])), career_action: 'Week 1: prepare a brief. Week 2: gather feedback. Week 3: test a second task. Week 4: review the outcome.', final_insight: 'Compare your experience with feedback from the practical experiments.' };
async function mockReports(page, { priceFails = false } = {}) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (path.endsWith('/payments/config')) return route.fulfill({ status: priceFails ? 503 : 200, headers: cors, json: priceFails ? { error: 'Unavailable' } : { priceLabel: '$7' } });
    const body = path.endsWith('/report/free') ? { reportFree: freeReport } : path.endsWith('/report/full') ? { reportFull: fullReport } : path.endsWith('/habits/config') ? { trialDays: 14, priceLabel: '$8' } : { locale: 'ru', value: null, enabled: false };
    return route.fulfill({ json: body, headers: cors });
  });
}

test('diagnostic shell is full width with one scroll surface at all breakpoints', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { priceLabel: '$3', locale: 'ru', value: null, enabled: false } }));
  for (const path of ['/flow/voice', '/flow/face', '/flow/analysis', '/report/layout/free', '/report/layout/full', '/pay/layout']) {
    await page.goto(base + path);
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.locator('#app').evaluate(el => ({ width: el.getBoundingClientRect().width, viewport: innerWidth, scroll: document.documentElement.scrollWidth, mainOverflow: getComputedStyle(el.querySelector('main')).overflowY }));
      expect(Math.abs(layout.width - layout.viewport)).toBeLessThanOrEqual(1);
      expect(layout.scroll).toBeLessThanOrEqual(layout.viewport);
      expect(layout.mainOverflow).toBe('visible');
    }
  }
});

test('free and full reports retain personal content, show one premium promise and fit every viewport', async ({ page }, info) => {
  await mockReports(page);
  for (const lang of ['ru', 'en']) {
    await page.goto(base + '/report/visual/free?lang=' + lang);
    await expect(page.getByTestId('free-report-page')).toContainText(freeReport.profession);
    await expect(page.getByTestId('premium-benefits').locator('li')).toHaveCount(5);
    await expect(page.getByTestId('open-pro-report-link')).toContainText('$7');
    await expect(page.getByTestId('free-report-page')).not.toContainText('SENTINEL');
    await expect(page.getByTestId('ikigai-zone-panel')).toHaveCount(0);
    for (const width of [360, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`free-${lang}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.goto(base + '/report/visual/full?lang=' + lang);
    await expect(page.locator('.role-card')).toHaveCount(5);
    await expect(page.getByTestId('full-report-page')).toContainText('Your story connects research');
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`full-${lang}-${width}.png`), animations: 'disabled' });
    }
    await page.getByTestId('ikigai-hotspot-passion').click();
    await expect(page.getByTestId('ikigai-zone-panel').locator('h3')).toHaveText('passion');
  }
});

test('a pricing outage never displays the obsolete static price and can be retried', async ({ page }) => {
  await mockReports(page, { priceFails: true });
  await page.goto(base + '/pay/price?lang=en');
  await expect(page.getByTestId('checkout-button')).toBeDisabled();
  await expect(page.locator('.payment-price-card')).not.toContainText('$3');
  await expect(page.getByRole('button', { name: 'Retry loading the price' })).toBeVisible();
  await page.route('**/api/payments/config', route => route.fulfill({ headers: cors, json: { priceLabel: '$9' } }));
  await page.getByRole('button', { name: 'Retry loading the price' }).click();
  await expect(page.locator('.payment-price-card')).toContainText('$9');
  await expect(page.getByTestId('checkout-button')).toBeEnabled();
});

test('onboarding resumes an existing queued diagnostic without creating a second analysis', async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem('levelup_analysis_id', 'existing'); sessionStorage.setItem('levelup_audio_upload_url', 'https://example.invalid/audio'); sessionStorage.setItem('levelup_photo_upload_url', 'https://example.invalid/photo'); });
  await mockReports(page);
  await page.route('**/api/analyses/existing/status', route => route.fulfill({ headers: cors, json: { status: 'QUEUED', progress: 10 } }));
  await page.goto(base + '/flow/start?lang=en');
  await expect(page.getByRole('link', { name: 'Continue your unfinished analysis' })).toHaveAttribute('href', '/flow/analysis');
});

test('onboarding shows backend price, requests no devices and keeps consent separate in RU and EN', async ({ page }) => {
  const writes = [];
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('Onboarding must not request devices'); };
  });
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST') writes.push(route.request().url());
    return route.fulfill({ json: { priceLabel: '$7', locale: 'ru', value: null, enabled: false } });
  });
  for (const lang of ['ru', 'en']) {
    await page.goto(base + '/flow/start?lang=' + lang);
    await expect(page.getByTestId('diagnostic-start-page')).toBeVisible();
    await expect(page.locator('.diagnostic-start-results h3')).toContainText('$7');
    await expect(page.locator('.diagnostic-start-steps li')).toHaveCount(3);
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
    expect(writes).toEqual([]);
    await page.getByTestId('diagnostic-begin').click();
    await expect(page).toHaveURL(/\/flow\/voice/);
    await expect(page.getByTestId('voice-consent').locator('input')).not.toBeChecked();
    await expect(page.getByTestId('voice-record-button')).toBeDisabled();
  }
});
