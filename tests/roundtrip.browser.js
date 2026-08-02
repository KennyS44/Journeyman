/* ==========================================================================
   tests/roundtrip.browser.js — полный круг сохранения и загрузки кодекса
   в настоящем браузере.

   Набивает пространство с объектами, связью, текстом, картинкой внутри текста,
   музыкой и пометкой; сохраняет всё в файл; стирает базу начисто; загружает
   файл обратно и сверяет записи побуквенно. Отдельно проверяет, что картинка
   внутри текста снова показывается (ссылки на файлы при загрузке выдаются
   новые, и разметку приходится переписывать), и что меню не разъезжается на
   экране шириной 390 px.

   В отличие от calc.test.js и zip.test.js этому файлу нужен Playwright и
   поднятый сервер, поэтому он не запускается вместе с остальными:

       npm i -D playwright && npx playwright install chromium
       python3 -m http.server 8000        # в папке проекта
       JM_URL=http://127.0.0.1:8000/ node tests/roundtrip.browser.js

   Снимки экрана складываются в JM_SHOTS (по умолчанию — временная папка).
   ========================================================================== */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Playwright может стоять и локально, и глобально — берём откуда есть. */
function loadPlaywright() {
  for (const where of ['playwright', '/usr/local/lib/node_modules/playwright']) {
    try { return require(where); } catch (_) {}
  }
  throw new Error('Playwright не найден: npm i -D playwright && npx playwright install chromium');
}

/** Если браузера штатной сборки нет, берём любой распакованный из кеша. */
function findChromium() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
  let names;
  try { names = fs.readdirSync(cache); } catch (_) { return undefined; }
  const candidates = [];
  for (const name of names) {
    candidates.push(
      path.join(cache, name, 'chrome-linux', 'chrome'),
      path.join(cache, name, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
  }
  return candidates.find((p) => fs.existsSync(p));
}

const pw = loadPlaywright();
async function launchChromium(options = {}) {
  try {
    return await pw.chromium.launch(options);
  } catch (err) {
    const executablePath = findChromium();
    if (!executablePath) throw err;
    return pw.chromium.launch({ ...options, executablePath });
  }
}

const BASE = process.env.JM_URL || 'http://127.0.0.1:8000/';
const OUT = process.env.JM_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'jm-shots-'));
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-round-'));

// маленький настоящий png (8×8, красный)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIm' +
  'BymDUwFEDRw0cNRAAaWkDBTaFrqcAAAAASUVORK5CYII=', 'base64');
const MP3 = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA', 'base64');

const step = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
};

(async () => {
  const browser = await launchChromium();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [консоль]', m.text()); });
  page.on('pageerror', (e) => console.log('  [ошибка страницы]', e.message));

  // имена передаются буфером, а не путём: так в проверку попадает кириллица
  // в имени файла — она уезжает в codex.json и должна вернуться оттуда целой
  const imgFile = { name: 'карта побережья.png', mimeType: 'image/png', buffer: PNG };
  const mp3File = { name: 'тема таверны.mp3', mimeType: 'audio/mpeg', buffer: MP3 };

  await page.goto(BASE);
  await page.waitForSelector('.menu-wrap');

  /* --- набиваем кодекс ------------------------------------------------- */

  console.log('· создаю пространство');
  await page.click('.space-card.new');
  await page.waitForTimeout(120);          // модалка сама наводит фокус на первое поле
  await page.fill('#f_name', 'Побережье Мечей');
  await page.fill('#f_description', 'Кампания для проверки');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('.canvas-viewport');

  console.log('· добавляю два объекта');
  for (const name of ['Таверна «Спящий великан»', 'Валдрин']) {
    await page.click('.toolbar .btn-primary');
    await page.waitForTimeout(120);
    await page.fill('#f_name', name);
    await page.click('.modal button[type=submit]');
    await page.waitForFunction((n) => [...document.querySelectorAll('.node-name')].some((e) => e.textContent === n), name);
  }

  console.log('· связываю их');
  await page.click('.toolbar .btn >> nth=1');
  await page.click('.node >> nth=0');
  await page.click('.node >> nth=1');
  await page.waitForSelector('.wire');
  await page.keyboard.press('Escape');
  await step(page, '01-пространство');

  console.log('· пишу текст и кладу картинку с музыкой');
  await page.click('.node-name >> nth=0');
  await page.waitForSelector('.doc-text');
  await page.click('.doc-text');
  await page.keyboard.type('Трактирщик должен гильдии сорок золотых.');

  // картинка прямо в текст
  await page.click('.doc-tools .doc-tool >> nth=5');
  await page.setInputFiles('#file-input', imgFile);
  await page.waitForSelector('.doc-text img[data-asset]');

  // музыка в боковую панель
  await page.click('.panel:has-text("Музыка") summary');
  await page.click('.panel:has-text("Музыка") .panel-body > .btn');
  await page.setInputFiles('#file-input', mp3File);
  await page.waitForSelector('.track-name');

  await page.click('.panel:has-text("Пометки") summary');
  await page.click('.panel:has-text("Пометки") .panel-body > .btn');
  await page.waitForTimeout(120);
  await page.fill('#f_text', 'У трактирщика долг перед гильдией');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('.note');
  await page.waitForTimeout(900);            // дать сработать отложенному сохранению
  await step(page, '02-объект');

  const before = await page.evaluate(async () => {
    const spaces = await DB.listSpaces();
    const out = [];
    for (const s of spaces) {
      const nodes = await DB.listNodes(s.id);
      const links = await DB.listLinks(s.id);
      const ns = [];
      for (const n of nodes) {
        const assets = await DB.listAssets(n.id);
        ns.push({ name: n.name, text: n.text, html: n.html, notes: (n.notes || []).length,
                  cover: !!n.coverId, assets: assets.map((a) => a.kind + ':' + a.name + ':' + a.size).sort() });
      }
      out.push({ name: s.name, description: s.description, links: links.length, nodes: ns.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return out;
  });
  console.log('· набрано:', JSON.stringify(before).length, 'символов описания');

  /* --- сохраняем в файл -------------------------------------------------- */

  console.log('· сохраняю кодекс в файл');
  await page.click('.topbar .btn-ghost[title="В меню"]');
  await page.waitForSelector('.backup');
  const dl = await Promise.race([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('.backup-actions .btn >> nth=0').then(() => new Promise(() => {})),
  ]);
  const zipPath = path.join(TMP, 'codex.jm.zip');
  await dl.saveAs(zipPath);
  console.log('  файл:', dl.suggestedFilename(), fs.statSync(zipPath).size, 'байт');
  await step(page, '03-меню-с-кнопками');

  /* --- стираем всё ------------------------------------------------------- */

  console.log('· стираю базу начисто');
  await page.evaluate(() => new Promise((res, rej) => {
    indexedDB.databases && null;
    const req = indexedDB.deleteDatabase('journeyman');
    req.onsuccess = res; req.onerror = rej; req.onblocked = res;
  }));
  await page.reload();
  await page.waitForSelector('.menu-wrap');
  const empty = await page.evaluate(() => DB.listSpaces().then((s) => s.length));
  if (empty !== 0) throw new Error('база не очистилась: ' + empty);

  /* --- загружаем обратно ------------------------------------------------- */

  console.log('· загружаю из файла');
  await page.click('.backup-actions .btn >> nth=1');
  await page.setInputFiles('#file-input', zipPath);
  await page.waitForSelector('.modal:has-text("Загрузить кодекс?")');
  await step(page, '04-подтверждение');
  await page.click('.modal .btn-primary');
  await page.waitForSelector('.space-card:not(.new)', { timeout: 20000 });
  await page.waitForTimeout(600);
  await step(page, '05-после-загрузки');

  const after = await page.evaluate(async () => {
    const spaces = await DB.listSpaces();
    const out = [];
    for (const s of spaces) {
      const nodes = await DB.listNodes(s.id);
      const links = await DB.listLinks(s.id);
      const ns = [];
      for (const n of nodes) {
        const assets = await DB.listAssets(n.id);
        ns.push({ name: n.name, text: n.text, html: n.html, notes: (n.notes || []).length,
                  cover: !!n.coverId, assets: assets.map((a) => a.kind + ':' + a.name + ':' + a.size).sort() });
      }
      out.push({ name: s.name, description: s.description, links: links.length, nodes: ns.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return out;
  });

  /* --- сверка ------------------------------------------------------------ */

  const strip = (v) => JSON.parse(JSON.stringify(v).replace(/data-asset=\\"[^\\"]*\\"/g, "data-asset=?"));
  const a = JSON.stringify(strip(before)), b = JSON.stringify(strip(after));
  if (a !== b) {
    console.log('\nБЫЛО : ' + a + '\n\nСТАЛО: ' + b);
    throw new Error('после загрузки кодекс отличается');
  }
  console.log('· записи совпали до буквы');

  // картинка в тексте должна показываться, а не висеть битой ссылкой
  await page.click('.space-card:not(.new)');
  await page.waitForSelector('.node-name');
  await page.click('.node-name >> nth=0');
  await page.waitForSelector('.doc-text img[data-asset]');
  const imgOk = await page.evaluate(() => {
    const i = document.querySelector('.doc-text img[data-asset]');
    return i && i.naturalWidth > 0 && i.src.startsWith('blob:');
  });
  if (!imgOk) throw new Error('картинка в тексте не отрисовалась после загрузки');
  console.log('· картинка внутри текста снова показывается');
  await step(page, '06-объект-после-загрузки');

  /* --- проверка на телефоне --------------------------------------------- */

  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(BASE);
  await phone.waitForSelector('.backup');
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const tap = await phone.evaluate(() => [...document.querySelectorAll('.backup-actions .btn')]
    .map((b) => Math.round(b.getBoundingClientRect().height)));
  await phone.screenshot({ path: path.join(OUT, '07-телефон.png'), fullPage: true });
  console.log('· телефон: горизонтальный вылет', overflow, 'px, высота кнопок', tap.join('/'));
  if (overflow > 0) throw new Error('на 390px появилась прокрутка вбок');
  if (tap.some((h) => h < 44)) throw new Error('кнопки мельче 44px');

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\nКруг пройден полностью. Снимки экрана: ' + OUT);
})().catch((e) => { console.error('\nПРОВАЛ:', e.message); process.exit(1); });
