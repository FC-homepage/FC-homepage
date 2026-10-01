import { load } from 'cheerio';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const pages = JSON.parse(await readFile('data/pages.json', 'utf8'));
const previous = JSON.parse(await readFile('data/posts.json', 'utf8'));
const posts = [];
for (const filename of (await readdir('posts')).filter(f => /^\d{3}_.+\.json$/.test(f)).sort()) {
  const post = JSON.parse(await readFile(`posts/${filename}`, 'utf8'));
  const [id, type, ...titleParts] = filename.slice(0, -5).split('_');
  if (post.id !== id || post.type !== type || !titleParts.length) throw new Error(`Invalid post filename: ${filename}`);
  posts.push({ ...post, json: `posts/${filename}`, file: `posts/${filename.slice(0, -5)}.html` });
}
if (new Set(posts.map(p => p.id)).size !== posts.length) throw new Error('Duplicate post number');
const manifest = posts.map(({ id, type, title, sourceId, boardId, date, json, file }) => ({ id, type, title, sourceId, boardId, date, json, file }));
await writeFile('data/posts.json', JSON.stringify(manifest, null, 2) + '\n');
const routes = new Map(pages.map(p => [p.route, p.file]));
routes.set('/', 'index.html');
routes.set('/1', 'index.html');

function rewriteLinks(q, prefix) {
  q('a[href]').each((i, e) => {
    let href = q(e).attr('href');
    if (!href || href.startsWith('#')) return;
    const old = previous.find(p => p.file === href);
    if (old) href = posts.find(p => p.id === old.id)?.file || 'index.html';
    if (href.startsWith('/') || href.startsWith('https://ffxiv42.quv.kr/')) {
      const url = new URL(href, 'https://ffxiv42.quv.kr');
      const post = posts.find(p => p.sourceId === url.searchParams.get('aid'));
      if (post) href = post.file;
      else if (routes.has(url.pathname)) href = routes.get(url.pathname) + url.hash;
    }
    if (!/^(https?:|mailto:|tel:|data:)/.test(href)) href = prefix + href.replace(/^\.\.\//, '');
    q(e).attr('href', href);
  });
}

function removeEmptyOverlay(q) {
  q('.footer-fixed-contents').each((i, e) => {
    if (!q(e).text().trim() && !q(e).find('img, video, iframe').length) q(e).remove();
  });
  q('.modal, #gallery_board_image_modal, #youtube-autoplay, meta[property="og:url"]').remove();
}

function boardRow(q, table, post, number) {
  const row = q('<tr class="board-tbody-tr" role="link" tabindex="0"></tr>');
  row.attr('id', post.sourceId || `post-${post.id}`).attr('data-post', post.file);
  if (post.notice) row.addClass('notice');
  const compact = table.hasClass('board-table-4');
  if (!compact && table.find('th.board-thead-item-no').length) {
    const count = q('<td class="board-tbody-item board-tbody-item-count"></td>');
    if (post.notice) count.css('font-size', '11px').append('<div>Notice</div>');
    else count.text(number);
    row.append(count);
  }
  const title = q('<td class="board-tbody-item board-tbody-item-title"><div><a><span></span></a></div></td>');
  title.find('a').attr('href', post.file);
  title.find('span').text(post.title);
  if (compact && post.notice) title.find('div').first().prepend('<category>Notice</category>');
  if (!compact) {
    title.css('padding-left', '20px');
    if (post.notice) title.find('div').first().css('font-weight', 'bold').prepend('<i class="icon-volume-2" aria-hidden="true"></i> ');
    if (post.contentHtml.includes('<img')) title.find('div').first().append(' <i class="icon-picture" aria-hidden="true"></i>');
    if (post.comments?.length) title.find('div').first().append(q('<span class="static-comment-count"><i class="icon-bubble" aria-hidden="true"></i></span>').append(String(post.comments.length)));
  }
  row.append(title);
  if (compact || table.find('th.board-thead-item-date').length) row.append(q('<td class="board-tbody-item board-tbody-item-date"></td>').text(compact ? post.date.slice(5) : post.date));
  return row;
}

for (const page of pages) {
  const q = load(await readFile(page.file, 'utf8'));
  removeEmptyOverlay(q);
  q('webfont').remove();
  rewriteLinks(q, '');
  q('table[data-bid]').each((i, e) => {
    const table = q(e);
    const related = posts.filter(p => p.boardId === table.attr('data-bid'));
    const body = table.find('tbody').empty();
    related.forEach((post, index) => body.append(boardRow(q, table, post, related.length - index)));
    table.closest('.boardBox').find('.pager').toggleClass('static-unused-pager', related.length <= Number(table.attr('data-pagesize') || 100));
  });
  await writeFile(page.file, q.html());
}

const template = await readFile('templates/post.html', 'utf8');
for (const post of posts) {
  const q = load(template);
  removeEmptyOverlay(q);
  q('title').text(`${post.title} | 모든것의해답42`);
  q('meta[property="og:title"]').attr('content', post.title);
  q('meta[property="og:url"], .read-comment, .read-content-reply, .read-content-options-admin, .read-share, webfont').remove();
  q('.read-title').text(post.title);
  q('.read-date').text(post.date);
  q('.read-content-inner').html(post.contentHtml);
  const list = q('.read-comment-list').empty();
  for (const comment of post.comments || []) {
    const item = q('<li><div class="read-comment-top"><div class="read-comment-writer"></div><div class="read-comment-date"></div></div><div class="read-comment-content"></div></li>');
    item.css('padding-left', `${Math.min(comment.replyDepth || 0, 4) * 20}px`);
    item.find('.read-comment-writer').text(comment.author);
    item.find('.read-comment-date').text(comment.date);
    item.find('.read-comment-content').text(comment.content).css('white-space', 'pre-wrap');
    list.append(item);
  }
  const files = q('.read-attachments-list').empty();
  for (const attachment of post.attachments || []) files.append(q('<a download></a>').attr('href', attachment.file).text(attachment.name));
  q('.read-content-list').each((i, e) => q(e).replaceWith('<a class="read-content-list" href="index.html">목록</a>'));
  const related = posts.filter(p => p.boardId === post.boardId);
  const index = related.findIndex(p => p.id === post.id);
  for (const [selector, other, label] of [['.read-content-prev', related[index - 1], '이전글'], ['.read-content-next', related[index + 1], '다음글']]) {
    if (other) q(selector).replaceWith(q(`<a class="${selector.slice(1)}"></a>`).attr('href', other.file).text(label));
    else q(selector).remove();
  }
  rewriteLinks(q, '../');
  q('[src], link[href]').each((i, e) => {
    for (const key of ['src', 'href']) {
      const value = q(e).attr(key);
      if (value?.startsWith('assets/')) q(e).attr(key, '../' + value);
    }
  });
  q('[style]').each((i, e) => q(e).attr('style', q(e).attr('style').replaceAll('url("assets/', 'url("../assets/')));
  q('style').each((i, e) => q(e).text(q(e).text().replaceAll('url("assets/', 'url("../assets/')));
  await writeFile(post.file, q.html());
}
console.log(`Built ${pages.length} pages and ${posts.length} posts from JSON.`);
