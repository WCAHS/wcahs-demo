#!/usr/bin/env node
/**
 * End-to-end checks for the Lost & Found admin flow, against a LOCAL dev server.
 *
 *   npx wrangler pages dev . --port 8799 --local      # in one terminal
 *   node tools/test-lf-flow.js                        # in another
 *
 * Never point this at wcahs.org: it clicks Approve. BASE is localhost-only and
 * the script refuses to run against anything else.
 *
 * The deep-link tests deliberately delay /api/admin/* responses. That latency is
 * the whole bug — on the shelter phone over cellular the inbox render finishes
 * after the deep-link handler has already given up looking for the report.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8799';
const USER = process.env.ADMIN_USER || 'admin';
const PASS = process.env.ADMIN_PASS || 'testpass123';
const LATENCY_MS = Number(process.env.LATENCY_MS || 1500);

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(BASE)) {
  console.error(`REFUSING TO RUN: BASE must be localhost, got ${BASE}`);
  process.exit(2);
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  // Detail explains a failure; printing it next to a PASS just reads as a lie.
  console.log(`${pass ? ' PASS' : ' FAIL'}  ${name}${!pass && detail ? `\n         ${detail}` : ''}`);
}

async function login(page) {
  await page.goto(`${BASE}/admin/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginForm', { state: 'visible' });
  await page.fill('#loginUser', USER);
  await page.fill('#loginPass', PASS);
  // The always-passes test widget still needs a moment to drop its token in.
  await page.waitForFunction(
    () => { const el = document.querySelector('[name="cf-turnstile-response"]'); return el && el.value; },
    null, { timeout: 20000 }
  );
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#dashboard:not(.hidden)', { timeout: 20000 });
}

/** Make every admin API call take LATENCY_MS, the way a phone on cellular does. */
async function slowAdminApi(context) {
  await context.route('**/api/admin/**', async route => {
    await new Promise(r => setTimeout(r, LATENCY_MS));
    await route.continue();
  });
}

/**
 * Open a deep link the way the notification email does: a full page load.
 * A plain goto() to a URL that differs only by its #fragment is a SAME-DOCUMENT
 * navigation — the page never reloads, showDashboard() never re-runs, and the
 * test measures nothing. The throwaway query param forces a real load.
 */
async function openDeepLink(page, hash) {
  await page.goto(`${BASE}/admin/?t=${Date.now()}${hash}`, { waitUntil: 'domcontentloaded' });
}

async function pendingIds(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/admin/lost-found', { credentials: 'same-origin' });
    const rows = await res.json();
    return rows.filter(r => r.status === 'pending').map(r => r.id);
  });
}

(async () => {
  // This box has a browser in the Playwright cache already; the matching
  // download for the freshly-installed playwright fails behind the network here.
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', e.message));

  await login(page);
  const targets = await pendingIds(page);
  if (!targets.length) { console.error('No pending reports in the local DB — reseed first.'); process.exit(2); }
  const id = targets[0];
  console.log(`\nUsing pending report id=${id}; admin API delayed by ${LATENCY_MS}ms\n`);

  // ── 1. Deep link from the notification email ──────────────────────────────
  await slowAdminApi(context);
  await page.evaluate(() => sessionStorage.setItem('wcahs_admin_page', 'submissions'));
  await openDeepLink(page, `#inbox-lf-${id}`);

  let expanded = false;
  try {
    await page.waitForSelector(`#lf-${id}:not(.hidden)`, { timeout: 15000 });
    expanded = true;
  } catch (e) { /* stays collapsed = the bug */ }
  check('deep link expands the report it names', expanded,
    expanded ? '' : `#lf-${id} never came out of .hidden`);

  if (expanded) {
    const inView = await page.evaluate((rid) => {
      const el = document.getElementById('lf-' + rid);
      const box = el.closest('.inbox-item').getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0;
    }, id);
    check('deep-linked report is scrolled into view', inView);
  }

  // ── 2. Same link, but the admin last visited a different page ─────────────
  await page.evaluate(() => sessionStorage.setItem('wcahs_admin_page', 'pets'));
  await openDeepLink(page, `#inbox-lf-${id}`);
  let survived = false;
  try {
    await page.waitForSelector(`#lf-${id}:not(.hidden)`, { timeout: 15000 });
    await page.waitForTimeout(LATENCY_MS + 800); // let the loser of the race land
    survived = await page.evaluate(rid => {
      const el = document.getElementById('lf-' + rid);
      return !!el && !el.classList.contains('hidden');
    }, id);
  } catch (e) { /* never appeared */ }
  check('deep link survives a different saved page', survived,
    survived ? '' : 'the saved page’s render overwrote the inbox');

  // ── 3. Approving tells the admin where the report went ────────────────────
  await page.evaluate(() => sessionStorage.setItem('wcahs_admin_page', 'submissions'));
  await openDeepLink(page, `#inbox-lf-${id}`);
  // Wait for the row to EXIST first. Waiting only for :not(.hidden) and
  // swallowing the timeout meant that on a slow render this fell through to
  // locator.count() before the inbox had painted, and the test failed for a
  // reason that had nothing to do with Approve.
  await page.waitForSelector(`#lf-${id}`, { state: 'attached', timeout: 20000 }).catch(() => {});
  await page.waitForSelector(`#lf-${id}:not(.hidden)`, { timeout: 15000 }).catch(() => {});
  // If the deep link didn't open it, open it by hand — this test is about what
  // Approve does, and it has to be measurable on the unfixed build too.
  await page.evaluate(rid => {
    const el = document.getElementById('lf-' + rid);
    if (el) el.classList.remove('hidden');
  }, id);
  const approve = page.locator(`#lf-${id} button:has-text("Approve")`).first();
  if (await approve.count()) {
    await approve.click();
    await page.waitForTimeout(LATENCY_MS * 2 + 1500);
    const after = await page.evaluate(rid => ({
      page: sessionStorage.getItem('wcahs_admin_page'),
      // the confirmation is a toast on <body>, not inside #content
      body: document.body.innerText.slice(0, 6000),
      stillThere: !!document.getElementById('lf-' + rid),
    }), id);
    check('approve lands the admin on Lost & Found, not a silent inbox',
      after.page === 'lost-found',
      `ended on "${after.page}"; report row present: ${after.stillThere}`);
    check('approve confirms the report is now on the public page',
      /public page|now live|approved/i.test(after.body),
      'no confirmation text found after approving');
  } else {
    check('approve button reachable after deep link', false, 'never found the Approve button');
  }

  // ── 4. Editing a report's details from the admin ──────────────────────────
  const editTarget = (await pendingIds(page))[0];
  if (editTarget) {
    await page.evaluate(() => sessionStorage.setItem('wcahs_admin_page', 'submissions'));
    await openDeepLink(page, `#inbox-lf-${editTarget}`);
    await page.waitForSelector(`#lf-${editTarget}:not(.hidden)`, { timeout: 15000 }).catch(() => {});
    const editBtn = page.locator(`#lf-${editTarget} button:has-text("Edit Details")`).first();
    check('a report has an Edit Details button', await editBtn.count() > 0);
    if (await editBtn.count()) {
      await editBtn.click();
      await page.waitForSelector('#lf-f-description', { timeout: 10000 });
      const typo = 'Corrected by test ' + Date.now();
      await page.fill('#lf-f-description', typo);
      await page.fill('#lf-f-pet_name', 'Editted Name');
      await page.click('#lf-modal-save');
      await page.waitForTimeout(LATENCY_MS * 2 + 1500);
      const saved = await page.evaluate(async (rid) => {
        const rows = await (await fetch('/api/admin/lost-found', { credentials: 'same-origin' })).json();
        return rows.find(r => r.id === rid);
      }, editTarget);
      check('edits are persisted to the report',
        saved && saved.description === typo && saved.pet_name === 'Editted Name',
        `description=${saved && saved.description}, pet_name=${saved && saved.pet_name}`);
      check('editing does not change the report’s status',
        saved && saved.status === 'pending', `status=${saved && saved.status}`);
    }
  }

  // ── 5. Adding a report by hand (a phone-in) ───────────────────────────────
  const before = await page.evaluate(async () => {
    const rows = await (await fetch('/api/admin/lost-found', { credentials: 'same-origin' })).json();
    return rows.length;
  });
  await page.evaluate(() => sessionStorage.setItem('wcahs_admin_page', 'lost-found'));
  await page.goto(`${BASE}/admin/?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("+ Add Report")', { timeout: 15000 });
  await page.click('button:has-text("+ Add Report")');
  await page.waitForSelector('#lf-f-species', { timeout: 10000 });
  await page.selectOption('#lf-f-species', 'Cat');
  await page.fill('#lf-f-color', 'Orange tabby');
  await page.fill('#lf-f-location_details', 'Phone-in test, 3rd St');
  await page.fill('#lf-f-reporter_name', 'Caller On The Phone');
  // A Lost & Found entry without a photo is close to useless, so the upload
  // path has to be exercised, not just the text fields.
  const photo = process.env.TEST_PHOTO || path.join(__dirname, '..', '.imgcache', '1789914847918-lpi1m8.jpg');
  const withPhoto = fs.existsSync(photo);
  if (withPhoto) await page.setInputFiles('#lf-f-photos', photo);
  await page.click('#lf-modal-save');
  await page.waitForTimeout(LATENCY_MS * 2 + 2000);
  const added = await page.evaluate(async () => {
    const rows = await (await fetch('/api/admin/lost-found', { credentials: 'same-origin' })).json();
    return { count: rows.length, row: rows.find(r => r.reporter_name === 'Caller On The Phone') };
  });
  check('a report can be added by hand', added.count === before + 1 && !!added.row,
    `count ${before} -> ${added.count}`);
  check('a hand-added report is live immediately',
    added.row && added.row.status === 'approved', `status=${added.row && added.row.status}`);
  check('a hand-added report reaches the public page',
    await page.evaluate(async () => {
      const rows = await (await fetch('/api/lost-found')).json();
      return rows.some(r => r.color === 'Orange tabby');
    }));
  if (withPhoto) {
    const photoOk = added.row && added.row.photo_url && added.row.photo_url.includes('/api/images/');
    check('a photo attached by hand is uploaded and linked', !!photoOk,
      `photo_url=${added.row && added.row.photo_url}`);
    if (photoOk) {
      const url = JSON.parse(added.row.photo_url)[0];
      const status = await page.evaluate(async u => (await fetch(u)).status, url);
      check('that uploaded photo actually serves', status === 200, `GET ${url} -> ${status}`);
    }
  }

  await browser.close();
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
