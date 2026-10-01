import { chromium } from 'playwright';
import { load } from 'cheerio';
import { mkdir, readFile, writeFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const origin = 'https://ffxiv42.quv.kr';
await mkdir('.cache/source', { recursive: true });
await mkdir('verification', { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const tab = await context.newPage();
const pageMap = new Map([['/home', 'index.html'], ['/', 'index.html'], ['/1', 'index.html']]);
const pages = [];
const boards = new Map();
const articles = new Map();
const assets = new Map();
const failures = [];
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const unwrap = value => typeof value === 'string' ? JSON.parse(value) : value;
const safeTitle = value => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '');

async function api(method, values, config) {
  const response = await context.request.post(`${origin}/module/board/board.php`, {
    form: { ...config, ...values, method }, timeout: 60000
  });
  if (!response.ok()) throw new Error(`${method}: ${response.status()}`);
  return unwrap(await response.json());
}

async function asset(rawUrl, base = origin) {
  if (!rawUrl || /^(data:|blob:|#)/.test(rawUrl)) return rawUrl;
  const url = new URL(rawUrl, base);
  if (!['ffxiv42.quv.kr', 'quv.kr', 'cdn.quv.kr', 'cdn.jsdelivr.net', 'fonts.gstatic.com', 'fonts.googleapis.com', 'unpkg.com'].includes(url.hostname)) return url.href;
  if (assets.has(url.href)) return assets.get(url.href);
  const ext = path.extname(url.pathname).toLowerCase();
  const css = ext === '.css' || url.pathname.endsWith('font.css.php');
  const file = `assets/${hash(url.href)}${css ? '.css' : (ext || '.bin')}`;
  assets.set(url.href, file);
  try {
    if (await access(file).then(() => true, () => false)) return file;
    let response = await context.request.get(url.href, { timeout: 60000, headers: { Referer: origin + '/' } });
    if (!response.ok() && url.hostname === 'cdn.quv.kr' && /%2f/i.test(url.pathname)) {
      response = await context.request.get(url.href.replace(/%2f/ig, '/'), { timeout: 60000, headers: { Referer: origin + '/' } });
    }
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    if (css) {
      const text = await rewriteCss(await response.text(), url.href, true);
      await writeFile(file, text);
    } else {
      await writeFile(file, await response.body());
    }
  } catch (error) {
    failures.push({ url: url.href, error: error.message });
    const fallback = css ? 'data:text/css,' : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    assets.set(url.href, fallback);
    return fallback;
  }
  return file;
}

async function rewriteCss(css, base, inAsset = false) {
  const matches = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)];
  for (const match of matches) {
    if (!match[2] || match[2].startsWith('data:') || match[2].startsWith('#')) continue;
    const local = await asset(match[2], base);
    css = css.replace(match[0], `url("${inAsset && local.startsWith('assets/') ? local.slice(7) : local}")`);
  }
  return css;
}

async function clean(html, sourcePath) {
  const q = load(html);
  q('script, link[rel="stylesheet/less"], meta[name="referrer"], link[rel="canonical"]').remove();
  q('.quv-made, .preview, .preview-layer, .configuration, .header-mobile-config, logo, menuitems, webfont, .webfontJson').remove();
  q('.board-write, #header-mobile-ml-area, #LoginModal, #JoinModal, #ReadPasswordCheckModal, #PolicyPrivacyModal, #CalendarScheduleModal').remove();
  q('body').css('display', 'block');
  q('.footer-fixed-contents').each((i, e) => {
    if (!q(e).text().trim() && !q(e).find('img, video, iframe').length) q(e).remove();
  });
  q('*').each((i, e) => {
    for (const key of Object.keys(e.attribs || {})) {
      if (key.startsWith('on') || key === 'contenteditable') q(e).removeAttr(key);
    }
  });
  for (const e of q('link[href]').toArray()) {
    const href = q(e).attr('href');
    if (q(e).attr('rel') === 'stylesheet' || /icon/.test(q(e).attr('rel') || '')) q(e).attr('href', await asset(href, origin + sourcePath));
  }
  for (const e of q('img, source, video, audio').toArray()) {
    for (const key of ['src', 'data-original', 'poster']) {
      if (q(e).attr(key)) q(e).attr(key, await asset(q(e).attr(key), origin + sourcePath));
    }
    if (q(e).attr('data-original')) q(e).attr('src', q(e).attr('data-original'));
    q(e).removeAttr('srcset');
  }
  for (const e of q('[style]').toArray()) q(e).attr('style', await rewriteCss(q(e).attr('style'), origin + sourcePath));
  for (const e of q('style').toArray()) q(e).text(await rewriteCss(q(e).text(), origin + sourcePath));
  q('[data-link]').each((i, e) => {
    const link = q(e).attr('data-link');
    if (link) q(e).find('a').first().attr('href', link);
  });
  q('a[href]').each((i, e) => {
    const href = q(e).attr('href');
    if (/^javascript:/i.test(href)) q(e).attr('href', '#');
    if (q(e).attr('target') === '_blank') q(e).attr('rel', 'noopener noreferrer');
  });
  q('head').append('<link rel="stylesheet" href="assets/static.css"><script defer src="assets/static.js"></script>');
  return q.html();
}

try {
  await mkdir('assets', { recursive: true });
  await mkdir('data', { recursive: true });
  await mkdir('posts', { recursive: true });
  await tab.goto(origin, { waitUntil: 'networkidle', timeout: 60000 });
  await tab.screenshot({ path: 'verification/original-desktop.png', fullPage: true });
  const html = await tab.content();
  await writeFile('.cache/source/home.html', html);
  const config = await tab.evaluate(() => ({ ...window.QV_BASE_OBJ }));
  const q = load(html);
  const queue = ['/home'];
  const seen = new Set(['/1', '/']);
  for (let index = 0; index < queue.length; index++) {
    const route = queue[index];
    if (seen.has(route)) continue;
    seen.add(route);
    if (route !== '/home') await tab.goto(origin + route, { waitUntil: 'networkidle', timeout: 60000 });
    const snapshot = await tab.content();
    const dom = load(snapshot);
    for (const e of dom('a[href]').toArray()) {
      const url = new URL(dom(e).attr('href'), origin + route);
      if (url.origin === origin && /^\/(\d+|home)$/.test(url.pathname) && !seen.has(url.pathname) && !queue.includes(url.pathname)) queue.push(url.pathname);
    }
    const file = route === '/home' ? 'index.html' : `${route.slice(1)}.html`;
    pageMap.set(route, file);
    const title = dom(`.header a[href="${route}"]`).first().text().trim() || route.slice(1);
    pages.push({ route, file, title });
    await writeFile(`.cache/source/${route.slice(1)}.html`, snapshot);
    for (const e of dom('table[data-bid]').toArray()) {
      const bid = dom(e).attr('data-bid');
      if (!boards.has(bid)) boards.set(bid, { id: bid, page: file, title, aids: [] });
      for (const row of dom(e).find('tr.board-tbody-tr[id]').toArray()) {
        const aid = dom(row).attr('id');
        if (!boards.get(bid).aids.includes(aid)) boards.get(bid).aids.push(aid);
      }
    }
    console.log(`Page ${pages.length}: ${route} (${title}), discovered ${queue.length} pages`);
  }
  for (const board of boards.values()) {
    let page = 1;
    while (true) {
      const list = await api('select_board_article_list', { bid: board.id, category: '', search_type: 'all', keyword: '', page: String(page), size: '100', segment: '0' }, config);
      if (!list?.data) throw new Error(`Invalid board list ${board.id}`);
      for (const article of list.data) {
        articles.set(article.aid, { ...article, boardId: board.id });
        if (!board.aids.includes(article.aid)) board.aids.push(article.aid);
      }
      if (page * 100 >= Number(list.total)) break;
      page++;
    }
    for (const aid of board.aids) {
      if (!articles.has(aid)) {
        const check = await api('select_board_article_check_auth', { bid: board.id, aid }, config);
        if (check.type === 'success' && check.data?.[0]) articles.set(aid, { ...check.data[0], boardId: board.id });
        else failures.push({ article: aid, error: 'Article is not publicly readable' });
      }
    }
    console.log(`Board ${board.id}: ${board.aids.length} articles`);
  }
  const order = ['0Xshfj', 'IoTDzM', ...articles.keys()].filter((aid, i, arr) => arr.indexOf(aid) === i && articles.has(aid));
  const manifest = [];
  for (let i = 0; i < order.length; i++) {
    const raw = articles.get(order[i]);
    const id = String(i + 1).padStart(3, '0');
    const type = i < 2 ? 'emph' : raw.boardId === 'tCdWBr' ? '공지' : safeTitle(boards.get(raw.boardId).title || '글');
    const title = raw.subject;
    const filename = `${id}_${type}_${safeTitle(title)}`;
    const fragment = load(raw.content || '', null, false);
    fragment('script').remove();
    for (const e of fragment('img[src]').toArray()) fragment(e).attr('src', await asset(fragment(e).attr('src')));
    for (const e of fragment('[style]').toArray()) fragment(e).attr('style', await rewriteCss(fragment(e).attr('style'), origin));
    const contentHtml = fragment.html();
    const rawComments = await api('select_board_comment', { bid: raw.boardId, aid: raw.aid }, config);
    const dateOf = value => value ? new Date(Number(value) * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : '';
    const comments = (Array.isArray(rawComments) ? rawComments : []).filter(c => c.is_secret !== '1').map(c => ({
      id: c.aid, author: c.writer, date: dateOf(c.reg_date), content: c.content, replyDepth: (c.comment_reply || '').length
    }));
    const rawFiles = await api('select_board_file', { bid: raw.boardId, aid: raw.aid }, config);
    const attachments = [];
    for (const f of Array.isArray(rawFiles) ? rawFiles : []) {
      const url = f.file_url || f.url;
      if (url) attachments.push({ name: f.file_name, file: await asset(url), size: f.file_size });
      else failures.push({ attachment: f.file_name, error: 'No public file URL' });
    }
    const post = { id, type, title, sourceId: raw.aid, boardId: raw.boardId, date: dateOf(raw.reg_date), author: raw.writer || '', notice: raw.is_notice === '1', contentHtml, comments, attachments, sourceUrl: `${origin}/module/board/read_form.html?bid=${raw.boardId}&aid=${raw.aid}` };
    const json = `posts/${filename}.json`;
    const file = `posts/${filename}.html`;
    await writeFile(json, JSON.stringify(post, null, 2) + '\n');
    manifest.push({ id, type, title, sourceId: raw.aid, boardId: raw.boardId, date: post.date, json, file });
    console.log(`Post ${id}: ${title}`);
  }
  for (const page of pages) {
    const snapshot = await readFile(`.cache/source/${page.route.slice(1)}.html`, 'utf8');
    const cleaned = load(await clean(snapshot, page.route));
    cleaned('a[href]').each((i, e) => {
      const href = cleaned(e).attr('href');
      if (!href || href.startsWith('#')) return;
      const url = new URL(href, origin + page.route);
      if (url.origin !== origin) return;
      const post = manifest.find(p => p.sourceId === url.searchParams.get('aid'));
      if (post) cleaned(e).attr('href', post.file);
      else if (pageMap.has(url.pathname)) cleaned(e).attr('href', pageMap.get(url.pathname) + url.hash);
      else cleaned(e).attr('href', url.href);
    });
    cleaned('tr.board-tbody-tr[id]').each((i, e) => {
      const post = manifest.find(p => p.sourceId === cleaned(e).attr('id'));
      if (post) {
        cleaned(e).attr('data-post', post.file).attr('tabindex', '0').attr('role', 'link');
        const span = cleaned(e).find('.board-tbody-item-title span').first();
        if (span.length) span.wrap(`<a href="${post.file}"></a>`);
      }
    });
    await writeFile(page.file, cleaned.html());
  }
  await writeFile('data/posts.json', JSON.stringify(manifest, null, 2) + '\n');
  await writeFile('data/pages.json', JSON.stringify(pages, null, 2) + '\n');
  await writeFile('data/boards.json', JSON.stringify([...boards.values()], null, 2) + '\n');
  await mkdir('templates', { recursive: true });
  const first = JSON.parse(await readFile(manifest[0].json, 'utf8'));
  await tab.goto(first.sourceUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await tab.screenshot({ path: 'verification/original-post.png', fullPage: true });
  const postTemplate = await clean(await tab.content(), '/module/board/read_form.html');
  await writeFile('templates/post.html', postTemplate);
  for (const file of (await readdir('assets')).filter(f => f.endsWith('.css'))) {
    let css = await readFile(`assets/${file}`, 'utf8');
    for (const match of [...css.matchAll(/url\(\s*(['"]?)((?:https?:)?\/\/.*?)\1\s*\)/g)]) {
      const local = await asset(match[2]);
      css = css.replace(match[0], `url("${local.startsWith('assets/') ? local.slice(7) : local}")`);
    }
    await writeFile(`assets/${file}`, css);
  }
  await tab.setViewportSize({ width: 390, height: 844 });
  await tab.goto(origin, { waitUntil: 'networkidle', timeout: 60000 });
  await tab.screenshot({ path: 'verification/original-mobile.png', fullPage: true });
  await writeFile('data/import-report.json', JSON.stringify({ origin, importedAt: new Date().toISOString(), pages: pages.length, posts: manifest.length, assets: (await readdir('assets')).length, failures }, null, 2) + '\n');
  console.log(JSON.stringify({ pages: pages.length, posts: manifest.length, assets: assets.size, failures }, null, 2));
} finally {
  await browser.close();
}
