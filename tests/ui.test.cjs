const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const data = require('../data.js');
const installMock = require('./mock-firebase.cjs');

let browser;
let server;
let origin;
const root = path.resolve(__dirname, '..');
const fixture = (store = 'Synthetic store', overrides = {}) => ({
  date: '2026-10-15T12:30', store, spent: 20, points: 5, value: 0,
  createdAt: '2026-10-15T12:31', ...overrides,
});

test.before(async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const mockHtml = html
    .replace(/  <script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+"[^>]*><\/script>\n/g, '')
    .replace(/\s*@import url\('https:\/\/fonts\.googleapis\.com[^']+'\);/, '')
    .replace(/  <script>\s*const firebaseConfig = \{[\s\S]*?firebase\.initializeApp\(firebaseConfig\);\s*<\/script>/,
      `<script>(${installMock.toString()})();</script>`);
  assert.ok(!mockHtml.includes('gstatic.com/firebasejs/'));
  assert.ok(!mockHtml.includes('firebaseConfig'));
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (['/', '/mock', '/sdk-check'].includes(pathname)) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(pathname === '/sdk-check' ? html : mockHtml);
      return;
    }
    const files = { '/script.js': 'text/javascript', '/data.js': 'text/javascript', '/styles.css': 'text/css' };
    if (!files[pathname]) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': files[pathname] });
    response.end(await fs.readFile(path.join(root, pathname.slice(1))));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function mockPage(t, legacy) {
  const context = await browser.newContext({ acceptDownloads: true });
  const externalRequests = [];
  const errors = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  if (legacy) {
    await context.addInitScript((values) => {
      if (sessionStorage.getItem('seeded')) return;
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', 'true');
    }, legacy);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  t.after(async () => {
    try {
      assert.deepEqual(errors, [], 'No browser console or script errors');
      assert.deepEqual(externalRequests, [], 'Mock tests must make zero external requests');
    } finally {
      await context.close();
    }
  });
  await page.goto(origin + '/mock');
  return page;
}

const login = (page, uid) => page.evaluate(async (value) => { await mock.login(value); }, uid);
const waitHold = (page, kind, uid) => page.waitForFunction(
  ({ kind, uid }) => mock.started(kind, uid), { kind, uid }
);
async function fillRecord(page, store) {
  for (const [id, value] of Object.entries({
    dateInput: '2026-10-15T12:30', storeInput: store,
    spentInput: '20', pointsInput: '5', valueInput: '0',
  })) await page.locator('#' + id).fill(value);
}
async function upload(page, csv) {
  await page.locator('#importInput').setInputFiles({
    name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await page.waitForFunction(() => !document.getElementById('importInput').disabled);
}

test('signed-out controls are guarded; legacy cache is preserved until explicit backup and removal', async (t) => {
  const legacy = JSON.stringify([{ store: 'Unowned synthetic record' }]);
  const page = await mockPage(t, { clawRecords: legacy, clawPointCost: '88', unrelated: 'keep' });
  assert.equal(await page.locator('#recordTbody tr').count(), 0);
  assert.equal(await page.locator('#costInput').inputValue(), '3.5');
  assert.ok(await page.locator('#saveBtn').isDisabled());
  await page.locator('#saveBtn').dispatchEvent('click');
  await page.locator('#exportBtn').dispatchEvent('click');
  assert.equal(await page.evaluate(() => mock.writes.length), 0);
  assert.ok(await page.locator('#legacyCacheNotice').isVisible());
  assert.ok(await page.locator('#legacyClearBtn').isDisabled());
  await login(page, 'B');
  assert.equal(await page.locator('#recordTbody tr').count(), 0);
  assert.equal(await page.locator('#costInput').inputValue(), '3.5');
  assert.equal(await page.evaluate(() => localStorage.getItem('clawRecords')), legacy);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#legacyDownloadBtn').click();
  const backup = JSON.parse(await fs.readFile(await (await downloadPromise).path(), 'utf8'));
  assert.equal(backup.clawRecords, legacy);
  assert.equal(backup.clawPointCost, '88');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#legacyClearBtn').click();
  assert.ok(await page.locator('#legacyCacheNotice').isHidden());
  assert.deepEqual(await page.evaluate(() => ({
    records: localStorage.getItem('clawRecords'), cost: localStorage.getItem('clawPointCost'),
    unrelated: localStorage.getItem('unrelated'),
  })), { records: null, cost: null, unrelated: 'keep' });
});

test('cloud data is validated independently and HTML/IDs render as inert text; CRUD and reload work', async (t) => {
  const page = await mockPage(t);
  const htmlStore = '<img src=x onerror="window.xssExecuted=true">';
  const dangerousId = 'id\"><img src=x onerror=alert(1)>';
  await page.evaluate(({ record, dangerousId }) => {
    mock.seed('A', { pointCost: 5 }, [
      { id: dangerousId, ...record },
      { id: 'bad-store', ...record, store: null },
      { id: 'bad-date', ...record, date: '<script>alert(1)</script>' },
      { id: 'bad-number', ...record, points: Infinity },
    ]);
  }, { record: fixture(htmlStore), dangerousId });
  await login(page, 'A');
  assert.equal(await page.locator('#recordTbody tr').count(), 1);
  assert.equal(await page.locator('#recordTbody td').nth(1).textContent(), htmlStore);
  assert.equal(await page.locator('#recordTbody img, #recordTbody script').count(), 0);
  assert.equal(await page.locator('.edit-btn').getAttribute('data-id'), dangerousId);
  assert.equal(await page.evaluate(() => window.xssExecuted), undefined);
  assert.match(await page.locator('#appStatus').textContent(), /略過 3 筆/);
  assert.equal(await page.evaluate(() => mock.writes.length), 0, 'Loading must not migrate cloud data');
  await page.locator('.edit-btn').click();
  await page.locator('#storeInput').fill('Edited synthetic store');
  await page.locator('#saveBtn').click();
  await page.waitForFunction(() => document.getElementById('appStatus').textContent === '紀錄已儲存。');
  assert.equal(await page.locator('#recordTbody tr').count(), 1);
  assert.equal(await page.locator('#recordTbody td').nth(1).textContent(), 'Edited synthetic store');
  await fillRecord(page, 'Added synthetic store');
  await page.locator('#saveBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#recordTbody tr').length === 2);
  await page.locator('#filterInput').fill('Added');
  assert.equal(await page.locator('#recordTbody tr').count(), 1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.delete-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('#recordTbody tr').length === 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('clawRecords')), null);
  const saved = await page.evaluate(() => mock.dump('A'));
  await page.reload();
  assert.equal(await page.locator('#recordTbody tr').count(), 0, 'No records appear from a local cache after reload');
  await page.evaluate((saved) => mock.seed('A', saved.settings, saved.records), saved);
  await login(page, 'A');
  assert.equal(await page.locator('#recordTbody tr').count(), 1);
  assert.equal(await page.locator('#costInput').inputValue(), '5');
  assert.equal(await page.locator('#recordTbody td').nth(1).textContent(), 'Edited synthetic store');
});

for (const kind of ['settings', 'records']) {
  test(`slow A ${kind} response cannot populate B or restore A's point cost`, async (t) => {
    const page = await mockPage(t);
    await page.evaluate(({ kind, record }) => {
      mock.seed('A', { pointCost: 88 }, [{ id: 'A-record', ...record }]);
      mock.hold(kind, 'A');
      void mock.login('A');
    }, { kind, record: fixture('Private A synthetic store') });
    await waitHold(page, kind, 'A');
    await login(page, 'B');
    await page.evaluate((kind) => mock.release(kind, 'A'), kind);
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#recordTbody tr').count(), 0);
    assert.equal(await page.locator('#costInput').inputValue(), '3.5');
    assert.equal(await page.locator('#storeInput').inputValue(), '');
    assert.equal(await page.locator('#userEmail').textContent(), 'B@example.invalid');
    assert.equal(await page.locator('#totalSpent').textContent(), '$0.00');
  });
}

test('logout clears editing state immediately and pending A writes cannot affect B', async (t) => {
  const page = await mockPage(t);
  await page.evaluate((record) => mock.seed('A', { pointCost: 88 }, [{ id: 'A-record', ...record }]), fixture());
  await login(page, 'A');
  await page.locator('.edit-btn').click();
  await page.locator('#storeInput').fill('Pending A edit');
  await page.evaluate(() => mock.hold('write', 'A'));
  await page.locator('#saveBtn').click();
  await waitHold(page, 'write', 'A');
  await page.locator('#logoutBtn').click();
  assert.equal(await page.locator('#recordTbody tr').count(), 0);
  assert.equal(await page.locator('#storeInput').inputValue(), '');
  assert.equal(await page.locator('#costInput').inputValue(), '3.5');
  assert.match(await page.locator('#saveBtn').textContent(), /新增紀錄/);
  assert.ok(await page.locator('#saveBtn').isDisabled());
  await login(page, 'B');
  await page.evaluate(() => mock.release('write', 'A'));
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#recordTbody tr').count(), 0);
  assert.equal(await page.locator('#costInput').inputValue(), '3.5');
  assert.equal(await page.evaluate(() => mock.dump('B').records.length), 0);
  assert.ok(await page.evaluate(() => mock.writes.every((write) => write.uid === 'A')));
});

test('pending cost writes and file reads cannot change a later auth session', async (t) => {
  const page = await mockPage(t);
  await login(page, 'A');
  await page.evaluate(() => mock.hold('settings-write', 'A'));
  await page.locator('#costInput').fill('77');
  await page.locator('#costInput').dispatchEvent('change');
  await waitHold(page, 'settings-write', 'A');
  await login(page, 'B');
  await page.evaluate(() => mock.release('settings-write', 'A'));
  await page.waitForTimeout(30);
  assert.equal(await page.locator('#costInput').inputValue(), '3.5');
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      window.fileReadStarted = true;
      await new Promise((resolve) => { window.releaseFileRead = resolve; });
      return original.call(this);
    };
  });
  const csv = data.exportRecordsCsv([fixture()], 3.5);
  await page.locator('#importInput').setInputFiles({ name: 'test.csv', buffer: Buffer.from(csv) });
  await page.waitForFunction(() => window.fileReadStarted);
  await login(page, 'C');
  await page.evaluate(() => window.releaseFileRead());
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => mock.dump('C').records.length), 0);
  assert.equal(await page.evaluate(() => mock.writes.filter((write) => write.kind === 'record-set').length), 0);
});

test('CSV browser export/import preserves special text and signed numbers', async (t) => {
  const page = await mockPage(t);
  const input = [
    fixture('Store, "quotes"\nsecond line', { spent: -10.25, value: -2 }),
    fixture("'Original apostrophe"), fixture('=SUM(1,2)'),
  ];
  await page.evaluate((records) => mock.seed('A', undefined,
    records.map((record, index) => ({ id: `seed-${index}`, ...record }))), input);
  await login(page, 'A');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const csv = await fs.readFile(await (await downloadPromise).path(), 'utf8');
  assert.deepEqual(data.parseRecordsCsv(csv), input);
  await login(page, 'B');
  await upload(page, csv);
  assert.match(await page.locator('#appStatus').textContent(), /已匯入 3 筆/);
  const imported = await page.evaluate(() => mock.dump('B').records.map(({ id, ...record }) => record));
  assert.deepEqual(imported, input);
  assert.equal(await page.locator('#recordTbody img').count(), 0);
});

test('all CSV records and limits are checked before any write', async (t) => {
  const page = await mockPage(t);
  await login(page, 'A');
  const header = 'date,store,spent,points,value\n';
  for (const invalid of [
    header + '2026-10-15,Good,1,2,3\n2026-02-30,Bad,1,2,3\n',
    header + '2026-10-15,Store,1,2,3\n'.repeat(1001),
    'x'.repeat(data.MAX_CSV_BYTES + 1), Buffer.from([0xff, 0xfe]),
    'unknown,header\n1,2\n', header + '2026-10-15,"unclosed,1,2,3\n',
  ]) {
    await upload(page, invalid);
    assert.equal(await page.locator('#appStatus').getAttribute('data-kind'), 'error');
    assert.equal(await page.evaluate(() => mock.writes.length), 0);
  }
});

test('partial import reports uncertainty, disables duplicate submissions and resumes with the same IDs', async (t) => {
  const page = await mockPage(t);
  await login(page, 'A');
  const input = ['One', 'Two', 'Three'].map((store) => fixture(store));
  const csv = data.exportRecordsCsv(input, 3.5);
  await page.evaluate(() => {
    mock.failSetNumber = 2;
    mock.commitOnFailure = true;
    mock.hold('write', 'A');
  });
  await page.locator('#importInput').setInputFiles({ name: 'test.csv', buffer: Buffer.from(csv) });
  await waitHold(page, 'write', 'A');
  assert.ok(await page.locator('#importInput').isDisabled());
  assert.ok(await page.locator('#saveBtn').isDisabled());
  await page.locator('#importInput').dispatchEvent('change');
  await page.evaluate(() => mock.release('write', 'A'));
  await page.waitForFunction(() => !document.getElementById('importInput').disabled);
  assert.match(await page.locator('#appStatus').textContent(), /已確認 1\/3 筆/);
  assert.match(await page.locator('#appStatus').textContent(), /最後一筆可能已寫入/);
  assert.equal(await page.evaluate(() => mock.dump('A').records.length), 2);
  await upload(page, csv);
  assert.match(await page.locator('#appStatus').textContent(), /已匯入 3 筆/);
  assert.equal(await page.locator('#recordTbody tr').count(), 3);
  assert.equal(await page.evaluate(() => mock.dump('A').records.length), 3);
  assert.equal(await page.evaluate(() => mock.recordWriteCount), 4);
  const writes = await page.evaluate(() => mock.writes.filter((write) => write.kind === 'record-set'));
  assert.equal(writes[1].id, writes[2].id, 'Retry must overwrite the uncertain ID');
  await upload(page, csv);
  assert.match(await page.locator('#appStatus').textContent(), /沒有重複寫入/);
  assert.equal(await page.evaluate(() => mock.recordWriteCount), 4);
});

test('unmodified production HTML loads all three pinned Firebase SDKs with SRI', {
  skip: !process.env.CLAWLOG_VERIFY_SDK,
}, async (t) => {
  const context = await browser.newContext();
  t.after(() => context.close());
  const errors = [];
  const blocked = [];
  const responses = [];
  const sdkUrls = ['app', 'auth', 'firestore'].map((name) =>
    `https://www.gstatic.com/firebasejs/10.12.2/firebase-${name}-compat.js`);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin === origin || sdkUrls.includes(url)) return route.continue();
    if (url.startsWith('https://fonts.googleapis.com/')) {
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    // No OAuth, Firestore, analytics, or other backend traffic is permitted.
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (sdkUrls.includes(response.url())) responses.push([response.url(), response.status()]);
  });
  await page.goto(origin + '/sdk-check');
  assert.deepEqual(await page.evaluate(() => ({
    version: firebase.SDK_VERSION, apps: firebase.apps.length,
    auth: typeof firebase.auth, firestore: typeof firebase.firestore,
    user: firebase.auth().currentUser,
  })), { version: '10.12.2', apps: 1, auth: 'function', firestore: 'function', user: null });
  assert.equal(responses.length, 3);
  assert.ok(responses.every(([, status]) => status === 200));
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, [], 'No live backend request should be attempted');
  assert.ok(await page.locator('#saveBtn').isDisabled());
});
