/* ==========================================================================
   ui.js — мелкие помощники: создание узлов, иконки, окна, уведомления,
   выбор файлов и учёт временных ссылок на Blob.
   ========================================================================== */

const UI = (() => {

  /* --- создание DOM ------------------------------------------------------ */

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
  }

  /* --- иконки (штриховые, единый стиль) ---------------------------------- */

  const PATHS = {
    plus:    '<path d="M12 5v14M5 12h14"/>',
    link:    '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 7l1.6-1.6a4 4 0 1 1 5.7 5.7L16.6 12.7"/><path d="M13 17l-1.6 1.6a4 4 0 0 1-5.7-5.7L7.4 11.3"/>',
    trash:   '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
    back:    '<path d="M15 5l-7 7 7 7"/>',
    image:   '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    music:   '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    note:    '<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    chain:   '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    chev:    '<path d="M9 6l6 6-6 6"/>',
    close:   '<path d="M6 6l12 12M18 6L6 18"/>',
    home:    '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
    center:  '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
    minus:   '<path d="M5 12h14"/>',
    d20:     '<path d="M12 2 22 8v8l-10 6L2 16V8z"/><path d="m12 2 6 12-6 8-6-8z"/><path d="M2 8h20M6 14h12"/>',
    scroll:  '<path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2z"/><path d="M9 8h6M9 12h6"/>',
    pencil:  '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14 6 4 4"/>',
    download:'<path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 19h14"/>',
    play:    '<path d="M8 5v14l11-7z"/>',
  };

  function icon(name, size = 20) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.6');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = PATHS[name] || '';
    return s;
  }

  /* --- уведомления ------------------------------------------------------- */

  function toast(message, kind) {
    const t = el('div', { class: 'toast' + (kind === 'err' ? ' err' : ''), text: message });
    document.getElementById('toasts').append(t);
    setTimeout(() => {
      t.style.transition = 'opacity 220ms cubic-bezier(.4,0,.2,1)';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 240);
    }, kind === 'err' ? 4200 : 2400);
  }

  /* --- модальные окна ---------------------------------------------------- */

  const root = () => document.getElementById('modal-root');

  function closeModal() {
    const r = root();
    r.hidden = true;
    r.replaceChildren();
    document.removeEventListener('keydown', escHandler);
  }
  let escResolve = null;
  function escHandler(e) {
    if (e.key === 'Escape') { const r = escResolve; closeModal(); if (r) r(null); }
  }

  function openModal(build) {
    return new Promise((resolve) => {
      const r = root();
      const done = (value) => { closeModal(); resolve(value); };
      escResolve = () => resolve(null);
      const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
      build(box, done);
      r.replaceChildren(box);
      r.hidden = false;
      r.onclick = (e) => { if (e.target === r) done(null); };
      document.addEventListener('keydown', escHandler);
      const first = box.querySelector('input, textarea, button');
      if (first) setTimeout(() => first.focus(), 40);
    });
  }

  /** Диалог с полями. fields: [{key,label,value,placeholder,type:'text'|'textarea'}] */
  function formDialog({ title, description, fields = [], submit = 'Сохранить' }) {
    return openModal((box, done) => {
      const inputs = {};
      const wrap = el('div', { class: 'modal-fields' });
      for (const f of fields) {
        const id = 'f_' + f.key;
        const input = f.type === 'textarea'
          ? el('textarea', { class: 'field', id, rows: 3, placeholder: f.placeholder || '' })
          : el('input', { class: 'field', id, type: 'text', placeholder: f.placeholder || '' });
        input.value = f.value || '';
        inputs[f.key] = input;
        wrap.append(el('div', {}, [el('label', { class: 'label', for: id, text: f.label }), input]));
      }
      const collect = () => {
        const out = {};
        for (const [k, i] of Object.entries(inputs)) out[k] = i.value.trim();
        if (fields[0] && !out[fields[0].key]) { inputs[fields[0].key].focus(); return null; }
        return out;
      };
      const form = el('form', { onsubmit: (e) => { e.preventDefault(); const v = collect(); if (v) done(v); } }, [
        el('h2', { text: title }),
        description ? el('p', { text: description }) : null,
        wrap,
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn', type: 'button', onclick: () => done(null), text: 'Отмена' }),
          el('button', { class: 'btn btn-primary', type: 'submit', text: submit }),
        ]),
      ]);
      box.append(form);
      Object.values(inputs).forEach((i) => {
        if (i.tagName === 'INPUT') i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = collect(); if (v) done(v); } });
      });
    });
  }

  function confirmDialog({ title, description, confirm = 'Удалить', danger = true }) {
    return openModal((box, done) => {
      box.append(
        el('h2', { text: title }),
        description ? el('p', { text: description }) : null,
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn', onclick: () => done(false), text: 'Отмена' }),
          el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => done(true), text: confirm }),
        ]),
      );
    });
  }

  /* --- просмотр изображения / видео -------------------------------------- */

  function lightbox(url, mime, caption) {
    const media = mime.startsWith('video')
      ? el('video', { src: url, controls: true, autoplay: true, playsinline: true })
      : el('img', { src: url, alt: caption || '' });
    const box = el('div', { class: 'lightbox', tabindex: '-1' }, [
      media,
      el('div', { class: 'lightbox-bar' }, [
        el('button', { class: 'btn btn-icon', title: 'Закрыть', onclick: () => close() }, [icon('close')]),
      ]),
      caption ? el('div', { class: 'lightbox-cap', text: caption }) : null,
    ]);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    function close() {
      document.removeEventListener('keydown', onKey);
      box.remove();
    }
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(box);
    box.focus();
  }

  /* --- выбор файлов ------------------------------------------------------ */

  function pickFiles(accept, multiple = true) {
    return new Promise((resolve) => {
      const input = document.getElementById('file-input');
      input.value = '';
      input.accept = accept;
      input.multiple = multiple;
      const onChange = () => {
        input.removeEventListener('change', onChange);
        resolve(Array.from(input.files || []));
      };
      input.addEventListener('change', onChange);
      input.click();
    });
  }

  /* --- временные ссылки на Blob ------------------------------------------ */

  const urls = new Set();
  function blobUrl(blob) {
    const u = URL.createObjectURL(blob);
    urls.add(u);
    return u;
  }
  function releaseUrls(keep = new Set()) {
    for (const u of urls) {
      if (keep.has(u)) continue;
      URL.revokeObjectURL(u);
      urls.delete(u);
    }
  }

  /* --- форматирование ---------------------------------------------------- */

  const fmtDate = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtSize = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  const debounce = (fn, ms) => {
    let t;
    const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    wrapped.flush = () => { clearTimeout(t); };
    return wrapped;
  };

  return { el, icon, toast, openModal, formDialog, confirmDialog, closeModal, lightbox, pickFiles, blobUrl, releaseUrls, fmtDate, fmtSize, plural, debounce };
})();
