(() => {
  const menu = document.querySelector('.header-mobile .header-side-nav');
  const toggle = document.querySelector('.header-side-nav-button');
  const setMenu = open => {
    menu?.classList.toggle('static-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('static-menu-open', open);
  };
  if (toggle) {
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-label', '메뉴');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => setMenu(!menu.classList.contains('static-open')));
    toggle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    });
  }
  document.querySelector('.header-side-nav-close')?.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { setMenu(false); document.querySelector('.static-image-dialog')?.close(); } });
  document.querySelectorAll('.mn-item').forEach(item => {
    if (!item.querySelector(':scope > .sub-mn')) return;
    const link = item.querySelector(':scope > .mn-link');
    if (!link.hasAttribute('href')) { link.setAttribute('role', 'button'); link.setAttribute('tabindex', '0'); }
    const switchMenu = () => item.classList.toggle('static-expanded');
    link.addEventListener('click', e => { if (!link.hasAttribute('href')) { e.preventDefault(); switchMenu(); } });
    link.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchMenu(); } });
    item.querySelector(':scope > .mn-dropdown')?.addEventListener('click', switchMenu);
  });
  document.querySelectorAll('[data-post]').forEach(row => {
    row.addEventListener('click', e => { if (!e.target.closest('a')) location.href = row.dataset.post; });
    row.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === row) location.href = row.dataset.post; });
  });
  document.querySelectorAll('.board-search-button button').forEach(button => {
    button.addEventListener('click', () => {
      const board = button.closest('.boardBox');
      const term = board.querySelector('.board-search-input').value.trim().toLocaleLowerCase();
      board.querySelectorAll('[data-post]').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase().includes(term); });
    });
  });
  document.querySelectorAll('.board-search-input').forEach(input => input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.closest('.board-search').querySelector('button')?.click(); }
  }));
  document.querySelectorAll('.tabBox a[href^="#"]').forEach(link => link.addEventListener('click', e => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    e.preventDefault();
    const box = link.closest('.tabBox');
    box.querySelectorAll('.tab-pane, .nav-tabs li').forEach(el => el.classList.remove('active', 'in'));
    target.classList.add('active', 'in');
    link.closest('li')?.classList.add('active');
  }));
  const dialog = document.createElement('dialog');
  dialog.className = 'static-image-dialog';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '닫기');
  const image = document.createElement('img');
  dialog.append(close, image); document.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.querySelectorAll('.image-area:not([href]), .gallery-board a:not([href]), .read-content-inner img').forEach(element => {
    element.addEventListener('click', () => {
      const img = element.tagName === 'IMG' ? element : element.querySelector('img');
      const background = element.querySelector('.gallery-board-image, .img-bg');
      const url = img?.src || (background && getComputedStyle(background).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]);
      if (!url) return;
      image.src = url; image.alt = img?.alt || ''; dialog.showModal();
    });
  });
})();
