import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('verification', { recursive: true });
const preview = spawn(process.execPath, ['tools/preview.mjs'], { env: { ...process.env, PORT: '4187' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise((resolve, reject) => {
  preview.stdout.once('data', data => resolve(data.toString().trim()));
  preview.once('error', reject);
  preview.once('exit', code => reject(new Error(`Preview exited: ${code}`)));
});
const browser = await chromium.launch();
const errors = [];
const external = new Set();
const failed = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base) || url.startsWith('data:')) return route.continue();
    external.add(url); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push({ url: response.url(), status: response.status() }); });
  const pages = JSON.parse(await readFile('data/pages.json', 'utf8'));
  const posts = JSON.parse(await readFile('data/posts.json', 'utf8'));
  const results = [];
  for (const item of [...pages, ...posts]) {
    await page.goto(`${base}/repository/${item.file}`, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => ({
      text: document.body.innerText.length,
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      brokenImages: [...document.images].filter(img => img.getBoundingClientRect().width > 0 && (!img.complete || img.naturalWidth === 0)).map(img => img.src),
      rootLinks: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(href => href.startsWith('/'))
    }));
    if (result.brokenImages.length) console.log(JSON.stringify({ file: item.file, ...result, errors, failed, external: [...external] }, null, 2));
    assert(result.text > 50, `${item.file}: empty page`);
    assert.equal(result.brokenImages.length, 0, `${item.file}: broken images`);
    assert.equal(result.rootLinks.length, 0, `${item.file}: root-relative links`);
    results.push({ file: item.file, ...result });
  }
  await page.goto(`${base}/repository/index.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'verification/clone-desktop.png', fullPage: true });
  await page.getByRole('link', { name: posts[0].title, exact: true }).filter({ visible: true }).first().click();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.read-title').innerText(), posts[0].title);
  await page.screenshot({ path: 'verification/clone-post.png', fullPage: true });
  await page.getByRole('link', { name: '목록', exact: true }).first().click();
  await page.waitForLoadState('networkidle');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: 'verification/clone-mobile.png', fullPage: true });
  await page.locator('.header-side-nav-button').click();
  assert(await page.locator('.header-side-nav').evaluate(el => el.classList.contains('static-open')));
  await page.waitForFunction(() => Math.abs(document.querySelector('.header-side-nav').getBoundingClientRect().left) < 1);
  await page.screenshot({ path: 'verification/clone-mobile-menu.png' });
  await page.locator('.header-side-nav').getByRole('link', { name: '부대규칙', exact: true }).click();
  await page.waitForLoadState('networkidle');
  assert(page.url().endsWith('/2.html'));
  await page.screenshot({ path: 'verification/clone-mobile-rules.png', fullPage: true });
  await page.locator('.header-side-nav-button').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('.header-side-nav').getBoundingClientRect().left) < 1);
  await page.locator('.header-side-nav').getByRole('button', { name: '가이드', exact: true }).click();
  await page.locator('.header-side-nav').getByRole('link', { name: '종합 가이드', exact: true }).click();
  await page.waitForLoadState('networkidle');
  assert(page.url().endsWith('/3.html'));
  await page.goto(`${base}/repository/${posts[1].file}`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.read-comment-list > li').count(), 4);
  await page.locator('.read-content-inner img').click();
  assert(await page.locator('dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  const mobile = [];
  for (const item of [...pages, ...posts]) {
    await page.goto(`${base}/repository/${item.file}`, { waitUntil: 'networkidle' });
    mobile.push({ file: item.file, ...(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))) });
    assert(mobile.at(-1).width <= mobile.at(-1).viewport, `${item.file}: mobile overflow`);
  }
  const report = { pages: results, mobile, errors, failed, external: [...external], checked: ['repository subpath', 'post links', 'back to list', 'mobile menu', 'existing comments', 'image dialog'] };
  await writeFile('verification/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(errors.length, 0, 'Browser errors');
  assert.equal(failed.length, 0, 'Missing local files');
  assert.equal(external.size, 0, 'External resources');
} finally {
  await browser.close();
  preview.kill();
}
