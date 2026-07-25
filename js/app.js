/* ==========================================================================
   app.js — экраны и логика Journeyman.
   Маршруты:  #/          меню пространств
              #/s/<id>    холст пространства
              #/n/<id>    внутренняя директория ключевого объекта
   ========================================================================== */

(() => {
  const { el, icon, toast, formDialog, confirmDialog, chooseDialog, lightbox, pickFiles,
          blobUrl, releaseUrls, sanitizeHtml, textToHtml,
          fmtDate, fmtSize, plural, debounce } = UI;

  const app = document.getElementById('app');

  const NODE_W = 176;          // ширина карточки объекта, см. .node в CSS
  const MIN_SCALE = 0.35;
  const MAX_SCALE = 2.5;

  /* ======================================================================
     Маршрутизация
     ====================================================================== */

  let teardown = null;

  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  async function route() {
    if (teardown) { try { teardown(); } catch (_) {} teardown = null; }
    releaseUrls(keepUrls());
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);
    try {
      if (parts[0] === 's' && parts[1]) return await renderSpace(parts[1]);
      if (parts[0] === 'n' && parts[1]) return await renderNode(parts[1]);
      return await renderMenu();
    } catch (err) {
      console.error(err);
      toast('Не удалось открыть раздел: ' + err.message, 'err');
      await renderMenu();
    }
  }

  window.addEventListener('hashchange', route);

  /* ======================================================================
     Мини-плеер (живёт поверх всех экранов)
     ====================================================================== */

  const player = { bar: null, audio: null, url: null };

  function playTrack(asset) {
    if (player.url) URL.revokeObjectURL(player.url);
    player.url = URL.createObjectURL(asset.blob);
    if (!player.bar) {
      player.audio = el('audio', { controls: true, autoplay: true });
      player.bar = el('div', { class: 'player' }, [
        el('span', { class: 'pl-name' }),
        player.audio,
        el('button', { class: 'btn btn-ghost btn-icon', title: 'Закрыть плеер', onclick: stopTrack }, [icon('close', 18)]),
      ]);
      document.body.append(player.bar);
    }
    player.bar.querySelector('.pl-name').textContent = asset.name;
    player.audio.src = player.url;
    player.audio.play().catch(() => {});
  }

  function stopTrack() {
    if (player.audio) player.audio.pause();
    if (player.url) { URL.revokeObjectURL(player.url); player.url = null; }
    if (player.bar) { player.bar.remove(); player.bar = null; player.audio = null; }
  }

  const keepUrls = () => new Set();

  /* ======================================================================
     Общая шапка
     ====================================================================== */

  function topbar({ title, sub, back, actions = [] }) {
    return el('header', { class: 'topbar' }, [
      back ? el('button', { class: 'btn btn-ghost btn-icon', title: back.title, onclick: back.onclick }, [icon('back')]) : null,
      el('div', { style: { minWidth: '0' } }, [
        el('div', { class: 'topbar-title', text: title }),
        sub ? el('div', { class: 'topbar-sub', text: sub }) : null,
      ]),
      el('div', { class: 'topbar-spacer' }),
      el('div', { class: 'topbar-actions' }, actions),
    ]);
  }

  /* ======================================================================
     Экран 1 — меню пространств
     ====================================================================== */

  async function renderMenu() {
    document.title = 'Journeyman — кодекс мастера';
    const spaces = await DB.listSpaces();
    const counts = {};
    for (const s of spaces) counts[s.id] = (await DB.listNodes(s.id)).length;

    const grid = el('div', { class: 'space-grid' });

    grid.append(el('button', { class: 'space-card new', onclick: newSpace }, [
      el('div', { class: 'plus', text: '+' }),
      el('h3', { text: 'Новое пространство' }),
      el('div', { class: 'space-desc', text: 'Кампания, город, подземелье — что угодно' }),
    ]));

    for (const s of spaces) {
      const n = counts[s.id];
      const card = el('div', {
        class: 'space-card', role: 'button', tabindex: '0',
        onclick: () => go('#/s/' + s.id),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('#/s/' + s.id); } },
      }, [
        el('h3', { text: s.name }),
        s.description ? el('div', { class: 'space-desc', text: s.description }) : null,
        el('div', { class: 'space-meta', text:
          `${n} ${plural(n, 'объект', 'объекта', 'объектов')} · изменено ${fmtDate(s.updatedAt)}` }),
        el('button', {
          class: 'card-del', title: 'Удалить пространство',
          onclick: async (e) => {
            e.stopPropagation();
            const ok = await confirmDialog({
              title: `Удалить «${s.name}»?`,
              description: 'Вместе с пространством исчезнут все его объекты, тексты, изображения и музыка. Отменить будет нельзя.',
            });
            if (!ok) return;
            await DB.deleteSpace(s.id);
            toast('Пространство удалено');
            route();
          },
        }, [icon('trash', 18)]),
      ]);
      grid.append(card);
    }

    app.replaceChildren(
      topbar({
        title: 'Journeyman',
        sub: 'кодекс мастера',
        actions: [el('button', { class: 'btn btn-primary', onclick: newSpace }, [icon('plus'), el('span', { text: 'Пространство' })])],
      }),
      el('main', { class: 'menu-wrap' }, [
        el('section', { class: 'hero' }, [
          el('div', { class: 'hero-mark' }, [icon('d20', 48)]),
          el('h1', { text: 'Твои миры под рукой' }),
          el('p', { text: 'Собирай пространства для кампаний: расставляй ключевые объекты, связывай их нитями и храни внутри тексты, образы и музыку.' }),
        ]),
        el('div', { class: 'rune-rule' }, [icon('d20', 16)]),
        spaces.length === 0
          ? el('div', { class: 'empty', style: { marginTop: '24px' } }, [
              el('h3', { text: 'Пока пусто' }),
              el('p', { text: 'Создай первое пространство — например, «Побережье Мечей» или «Кампания: Проклятие Страда».' }),
            ])
          : null,
        grid,
      ]),
    );
  }

  async function newSpace() {
    const v = await formDialog({
      title: 'Новое пространство',
      description: 'Свободная зона, куда вы будете добавлять ключевые объекты и связывать их между собой.',
      fields: [
        { key: 'name', label: 'Название', placeholder: 'Побережье Мечей' },
        { key: 'description', label: 'Описание', type: 'textarea', placeholder: 'Пара слов о том, что здесь хранится' },
      ],
      submit: 'Создать',
    });
    if (!v) return;
    const s = await DB.createSpace(v.name, v.description);
    go('#/s/' + s.id);
  }

  /* ======================================================================
     Экран 2 — пространство (холст)
     ====================================================================== */

  async function renderSpace(spaceId) {
    const space = await DB.getSpace(spaceId);
    if (!space) { toast('Пространство не найдено', 'err'); return renderMenu(); }
    document.title = space.name + ' — Journeyman';

    let nodes = await DB.listNodes(spaceId);
    let links = await DB.listLinks(spaceId);

    const cam = loadCam(spaceId);
    let linkMode = false;
    let linkSource = null;
    let selectedLink = null;

    const world = el('div', { class: 'canvas-world' });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'wires');
    world.append(svg);

    const viewport = el('div', { class: 'canvas-viewport' }, [world]);
    const banner = el('div', { class: 'link-banner', hidden: true });
    const zoomLabel = el('span', { class: 'zoom-label' });

    const btnAdd = el('button', { class: 'btn btn-primary', onclick: () => addNode() },
      [icon('plus'), el('span', { class: 'lbl', text: 'Объект' })]);
    const btnLink = el('button', { class: 'btn', title: 'Инструмент связи', onclick: () => setLinkMode(!linkMode) },
      [icon('link'), el('span', { class: 'lbl', text: 'Связь' })]);

    const toolbar = el('div', { class: 'toolbar' }, [
      btnAdd,
      btnLink,
      el('span', { class: 'sep' }),
      el('button', { class: 'btn btn-icon', title: 'Отдалить', onclick: () => zoomBy(1 / 1.2) }, [icon('minus')]),
      zoomLabel,
      el('button', { class: 'btn btn-icon', title: 'Приблизить', onclick: () => zoomBy(1.2) }, [icon('plus')]),
      el('button', { class: 'btn btn-icon', title: 'Показать всё', onclick: fitAll }, [icon('center')]),
    ]);

    const hint = el('div', { class: 'canvas-hint' }, [
      el('div', { class: 'empty' }, [
        el('h3', { text: 'Чистый пергамент' }),
        el('p', { text: 'Добавь первый ключевой объект — персонажа, локацию, артефакт. Карточки свободно перетаскиваются по холсту, а инструмент «Связь» протянет между ними нити.' }),
      ]),
    ]);

    viewport.append(banner, toolbar, hint);

    app.replaceChildren(
      topbar({
        title: space.name,
        sub: space.description || 'пространство',
        back: { title: 'К списку пространств', onclick: () => go('#/') },
        actions: [
          el('button', { class: 'btn btn-ghost btn-icon', title: 'Переименовать пространство', onclick: renameSpace }, [icon('pencil')]),
          el('button', { class: 'btn btn-ghost btn-icon', title: 'В меню', onclick: () => go('#/') }, [icon('home')]),
        ],
      }),
      el('div', { class: 'space-screen' }, [viewport]),
    );

    /* --- отрисовка --------------------------------------------------- */

    const nodeEls = new Map();
    let lastDragEnd = 0;          // чтобы клик сразу после перетаскивания не открывал карточку

    function applyCam() {
      world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
      zoomLabel.textContent = Math.round(cam.scale * 100) + '%';
      saveCam(spaceId, cam);
    }

    function nodeCenter(n) {
      const box = nodeEls.get(n.id);
      const h = box ? box.offsetHeight : 150;
      return { x: n.x + NODE_W / 2, y: n.y + h / 2 };
    }

    function drawWires() {
      const byId = new Map(nodes.map((n) => [n.id, n]));
      svg.replaceChildren();
      for (const l of links) {
        const a = byId.get(l.a), b = byId.get(l.b);
        if (!a || !b) continue;
        const p1 = nodeCenter(a), p2 = nodeCenter(b);
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'wire-group' + (selectedLink === l.id ? ' selected' : ''));

        const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        const hit = document.createElementNS(svgNS, 'path');
        hit.setAttribute('class', 'wire-hit');
        hit.setAttribute('d', d);
        const line = document.createElementNS(svgNS, 'path');
        line.setAttribute('class', 'wire');
        line.setAttribute('d', d);

        const dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('class', 'wire-node');
        dot.setAttribute('cx', (p1.x + p2.x) / 2);
        dot.setAttribute('cy', (p1.y + p2.y) / 2);
        dot.setAttribute('r', 4);

        g.append(hit, line, dot);
        g.addEventListener('click', async (e) => {
          e.stopPropagation();
          selectedLink = l.id;
          drawWires();
          const ok = await confirmDialog({
            title: 'Разорвать связь?',
            description: `«${a.name}» — «${b.name}»`,
            confirm: 'Разорвать',
          });
          selectedLink = null;
          if (ok) {
            await DB.deleteLink(l.id);
            links = links.filter((x) => x.id !== l.id);
            toast('Связь разорвана');
          }
          drawWires();
        });
        svg.append(g);
      }
    }

    async function drawNodes() {
      for (const box of nodeEls.values()) box.remove();
      nodeEls.clear();
      for (const n of nodes) world.append(await nodeCard(n));
      hint.hidden = nodes.length > 0;
      drawWires();
    }

    async function nodeCard(n) {
      const box = el('div', {
        class: 'node', title: 'Перетащи, чтобы переместить',
        style: { left: n.x + 'px', top: n.y + 'px' },
      });
      nodeEls.set(n.id, box);

      let thumb;
      if (n.coverId) {
        const asset = await DB.getAsset(n.coverId);
        thumb = asset
          ? el('img', { class: 'node-thumb', src: blobUrl(asset.blob), alt: '' })
          : el('div', { class: 'node-thumb-fallback' }, [icon('image', 32)]);
      } else {
        thumb = el('div', { class: 'node-thumb-fallback' }, [icon('scroll', 32)]);
      }

      const open = () => {
        if (performance.now() - lastDragEnd < 300) return;
        go('#/n/' + n.id);
      };

      box.append(
        thumb,
        // в режиме связи выбор делает обработчик pointerdown — здесь только открытие
        el('button', { class: 'node-name', text: n.name, onclick: (e) => { e.stopPropagation(); if (!linkMode) open(); } }),
        el('span', { class: 'node-open-hint', text: linkMode ? 'нажми, чтобы связать' : 'открыть' }),
        el('div', { class: 'node-tools' }, [
          el('button', { title: 'Изображение объекта', onclick: async (e) => { e.stopPropagation(); await setCover(n); } }, [icon('image', 16)]),
          el('button', { title: 'Переименовать', onclick: async (e) => { e.stopPropagation(); await renameNode(n); } }, [icon('pencil', 16)]),
          el('button', { title: 'Удалить объект', onclick: async (e) => { e.stopPropagation(); await removeNode(n); } }, [icon('trash', 16)]),
        ]),
      );

      box.addEventListener('dblclick', (e) => { e.stopPropagation(); if (!linkMode) open(); });
      makeDraggable(box, n);
      return box;
    }

    /* --- перетаскивание объекта --------------------------------------- */

    function makeDraggable(box, n) {
      let start = null;
      box.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.node-tools')) return;
        if (linkMode) { e.stopPropagation(); pickForLink(n); return; }
        e.stopPropagation();
        // указатель захватываем только когда перетаскивание действительно начнётся,
        // иначе браузер перенаправит click с кнопки внутри карточки на саму карточку
        start = { px: e.clientX, py: e.clientY, nx: n.x, ny: n.y, moved: false };
      });
      box.addEventListener('pointermove', (e) => {
        if (!start) return;
        const dx = (e.clientX - start.px) / cam.scale;
        const dy = (e.clientY - start.py) / cam.scale;
        if (!start.moved && Math.hypot(dx, dy) * cam.scale < 4) return;
        if (!start.moved) {
          start.moved = true;
          box.classList.add('dragging');
          try { box.setPointerCapture(e.pointerId); } catch (_) {}
        }
        n.x = Math.round(start.nx + dx);
        n.y = Math.round(start.ny + dy);
        box.style.left = n.x + 'px';
        box.style.top = n.y + 'px';
        drawWires();
      });
      const end = async (e) => {
        if (!start) return;
        const moved = start.moved;
        start = null;
        box.classList.remove('dragging');
        try { box.releasePointerCapture(e.pointerId); } catch (_) {}
        if (!moved) return;
        lastDragEnd = performance.now();
        await DB.updateNode(n.id, { x: n.x, y: n.y });
      };
      box.addEventListener('pointerup', end);
      box.addEventListener('pointercancel', end);
    }

    /* --- инструмент связи --------------------------------------------- */

    function setLinkMode(on) {
      linkMode = on;
      linkSource = null;
      btnLink.classList.toggle('is-active', on);
      viewport.classList.toggle('mode-link', on);
      for (const box of nodeEls.values()) {
        box.classList.remove('link-source');
        const hintEl = box.querySelector('.node-open-hint');
        if (hintEl) hintEl.textContent = on ? 'нажми, чтобы связать' : 'открыть';
      }
      banner.hidden = !on;
      banner.textContent = 'Режим связи: выбери первый объект, затем второй. Esc — выйти.';
    }

    async function pickForLink(n) {
      if (!linkSource) {
        linkSource = n.id;
        nodeEls.get(n.id)?.classList.add('link-source');
        banner.textContent = `Первый объект: «${n.name}». Теперь выбери второй.`;
        return;
      }
      if (linkSource === n.id) {
        nodeEls.get(n.id)?.classList.remove('link-source');
        linkSource = null;
        banner.textContent = 'Режим связи: выбери первый объект, затем второй. Esc — выйти.';
        return;
      }
      const from = nodes.find((x) => x.id === linkSource);
      const link = await DB.createLink(spaceId, linkSource, n.id, '');
      nodeEls.get(linkSource)?.classList.remove('link-source');
      linkSource = null;
      if (link && !links.some((l) => l.id === link.id)) {
        links.push(link);
        toast(`«${from ? from.name : '…'}» связан с «${n.name}»`);
      } else {
        toast('Эти объекты уже связаны');
      }
      banner.textContent = 'Связь создана. Выбери следующую пару или нажми Esc.';
      drawWires();
    }

    const onKey = (e) => {
      if (e.key === 'Escape' && linkMode) { setLinkMode(false); }
    };
    document.addEventListener('keydown', onKey);

    /* --- панорама и масштаб -------------------------------------------- */

    const pointers = new Map();
    let panStart = null;
    let pinchStart = null;

    viewport.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.toolbar') || e.target.closest('.node')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        panStart = { px: e.clientX, py: e.clientY, cx: cam.x, cy: cam.y };
        viewport.classList.add('is-panning');
        viewport.setPointerCapture(e.pointerId);
      } else if (pointers.size === 2) {
        panStart = null;
        const [p1, p2] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale: cam.scale,
                       mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, cx: cam.x, cy: cam.y };
      }
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchStart && pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const next = clamp(pinchStart.scale * (dist / pinchStart.dist), MIN_SCALE, MAX_SCALE);
        const r = viewport.getBoundingClientRect();
        const mx = pinchStart.mid.x - r.left, my = pinchStart.mid.y - r.top;
        const k = next / pinchStart.scale;
        cam.x = mx - (mx - pinchStart.cx) * k;
        cam.y = my - (my - pinchStart.cy) * k;
        cam.scale = next;
        applyCam();
      } else if (panStart) {
        cam.x = panStart.cx + (e.clientX - panStart.px);
        cam.y = panStart.cy + (e.clientY - panStart.py);
        applyCam();
      }
    });

    const endPan = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) { panStart = null; viewport.classList.remove('is-panning'); }
    };
    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    function zoomAt(mx, my, k) {
      const next = clamp(cam.scale * k, MIN_SCALE, MAX_SCALE);
      const ratio = next / cam.scale;
      cam.x = mx - (mx - cam.x) * ratio;
      cam.y = my - (my - cam.y) * ratio;
      cam.scale = next;
      applyCam();
    }

    function zoomBy(k) {
      const r = viewport.getBoundingClientRect();
      zoomAt(r.width / 2, r.height / 2, k);
    }

    function fitAll() {
      if (!nodes.length) { cam.x = 0; cam.y = 0; cam.scale = 1; return applyCam(); }
      const r = viewport.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        const h = nodeEls.get(n.id)?.offsetHeight || 150;
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + h);
      }
      const pad = 48;
      const padBottom = 112;              // место для панели инструментов
      const w = r.width - pad * 2;
      const h = r.height - pad - padBottom;
      const scale = clamp(Math.min(w / (maxX - minX), h / (maxY - minY), 1.2), MIN_SCALE, MAX_SCALE);
      cam.scale = scale;
      cam.x = pad + (w - (maxX - minX) * scale) / 2 - minX * scale;
      cam.y = pad + (h - (maxY - minY) * scale) / 2 - minY * scale;
      applyCam();
    }

    function viewCenterWorld() {
      const r = viewport.getBoundingClientRect();
      return { x: (r.width / 2 - cam.x) / cam.scale, y: (r.height / 2 - cam.y) / cam.scale };
    }

    /** Ближайшее к центру экрана место, где карточка ни на кого не наложится. */
    function freeSpot() {
      const GAP = 32;
      const H = 200;                                   // запас по высоте карточки
      const c = viewCenterWorld();
      const base = { x: Math.round(c.x - NODE_W / 2), y: Math.round(c.y - H / 2) };
      const boxes = nodes.map((n) => ({ x: n.x, y: n.y, h: nodeEls.get(n.id)?.offsetHeight || H }));
      const free = (p) => !boxes.some((b) =>
        p.x < b.x + NODE_W + GAP && p.x + NODE_W + GAP > b.x &&
        p.y < b.y + b.h + GAP && p.y + H + GAP > b.y);
      if (free(base)) return base;
      // расходящаяся спираль по сетке карточек
      const stepX = NODE_W + GAP, stepY = H + GAP;
      for (let ring = 1; ring <= 12; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const p = { x: base.x + dx * stepX, y: base.y + dy * stepY };
            if (free(p)) return p;
          }
        }
      }
      return { x: base.x + nodes.length * 24, y: base.y + nodes.length * 24 };
    }

    /* --- действия над объектами ---------------------------------------- */

    async function addNode() {
      const v = await formDialog({
        title: 'Новый ключевой объект',
        description: 'Персонаж, локация, артефакт, событие — всё, к чему захочется вернуться.',
        fields: [{ key: 'name', label: 'Наименование', placeholder: 'Таверна «Спящий великан»' }],
        submit: 'Добавить',
      });
      if (!v) return;
      const spot = freeSpot();
      const n = await DB.createNode(spaceId, v.name, spot.x, spot.y);
      nodes.push(n);
      await drawNodes();
      toast('Объект добавлен');
    }

    async function renameNode(n) {
      const v = await formDialog({
        title: 'Переименовать объект',
        fields: [{ key: 'name', label: 'Наименование', value: n.name }],
      });
      if (!v) return;
      n.name = v.name;
      await DB.updateNode(n.id, { name: v.name });
      await drawNodes();
    }

    async function removeNode(n) {
      const ok = await confirmDialog({
        title: `Удалить «${n.name}»?`,
        description: 'Текст, изображения, музыка и пометки объекта будут удалены вместе с ним.',
      });
      if (!ok) return;
      await DB.deleteNode(n.id);
      nodes = nodes.filter((x) => x.id !== n.id);
      links = links.filter((l) => l.a !== n.id && l.b !== n.id);
      await drawNodes();
      toast('Объект удалён');
    }

    async function setCover(n) {
      const files = await pickFiles('image/*', false);
      if (!files.length) return;
      if (n.coverId) await DB.deleteAsset(n.coverId);
      const asset = await DB.addAsset(n.id, files[0], 'cover');
      n.coverId = asset.id;
      await DB.updateNode(n.id, { coverId: asset.id });
      await drawNodes();
      toast('Изображение обновлено');
    }

    async function renameSpace() {
      const v = await formDialog({
        title: 'Пространство',
        fields: [
          { key: 'name', label: 'Название', value: space.name },
          { key: 'description', label: 'Описание', type: 'textarea', value: space.description },
        ],
      });
      if (!v) return;
      await DB.updateSpace(space.id, { name: v.name, description: v.description });
      route();
    }

    /* --- запуск экрана -------------------------------------------------- */

    await drawNodes();
    applyCam();
    if (!cam.touched && nodes.length) { fitAll(); }

    teardown = () => { document.removeEventListener('keydown', onKey); };
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function loadCam(spaceId) {
    try {
      const raw = localStorage.getItem('jm.cam.' + spaceId);
      if (raw) { const c = JSON.parse(raw); return { x: c.x, y: c.y, scale: clamp(c.scale, MIN_SCALE, MAX_SCALE), touched: true }; }
    } catch (_) {}
    return { x: 0, y: 0, scale: 1, touched: false };
  }
  const saveCam = debounce((spaceId, cam) => {
    try { localStorage.setItem('jm.cam.' + spaceId, JSON.stringify({ x: cam.x, y: cam.y, scale: cam.scale })); } catch (_) {}
  }, 300);

  /* ======================================================================
     Свиток плана
     Один и тот же узел переезжает между объектами одного плана, поэтому
     заметка остаётся на месте: не мигает, не теряет позицию прокрутки и
     не сбрасывает несохранённый текст. При смене плана строится заново.
     ====================================================================== */

  let scratchCache = null;     // { spaceId, root, area }
  let scratchHost = null;      // текущий .detail-body, на нём живёт класс

  function setScratchOpen(on) {
    if (scratchHost) scratchHost.classList.toggle('scratch-open', on);
    if (!scratchCache) return;
    try { localStorage.setItem('jm.scratch.' + scratchCache.spaceId, on ? '1' : '0'); } catch (_) {}
  }

  function scratchPanel(space) {
    if (scratchCache && scratchCache.spaceId === space.id) return scratchCache;

    const area = el('textarea', {
      class: 'scratch-text', 'aria-label': 'Заметки плана',
      placeholder: 'Общее для всего плана: состав партии, инициатива, чем кончилась прошлая сцена…',
    });
    area.value = space.scratch || '';
    const saveScratch = debounce((v) => DB.updateSpace(space.id, { scratch: v }), 500);
    area.addEventListener('input', () => saveScratch(area.value));

    const root = el('section', { class: 'scratch' }, [
      el('button', { class: 'scratch-tab', title: 'Заметки плана', onclick: () => setScratchOpen(true) }, [
        icon('note', 18),
        el('span', { class: 'scratch-tab-label', text: 'Заметки плана' }),
      ]),
      el('div', { class: 'scratch-body' }, [
        el('div', { class: 'scratch-head' }, [
          el('h2', { class: 'scratch-title', text: 'Заметки плана' }),
          el('span', { class: 'topbar-spacer' }),
          el('button', { class: 'btn btn-ghost btn-icon', title: 'Свернуть', onclick: () => setScratchOpen(false) }, [icon('close', 18)]),
        ]),
        el('p', { class: 'scratch-hint', text: space.name }),
        area,
      ]),
    ]);

    scratchCache = { spaceId: space.id, root, area };
    return scratchCache;
  }

  /* ======================================================================
     Экран 3 — внутренняя директория объекта
     ====================================================================== */

  async function renderNode(nodeId) {
    const node = await DB.getNode(nodeId);
    if (!node) { toast('Объект не найден', 'err'); return renderMenu(); }
    const space = await DB.getSpace(node.spaceId);
    document.title = node.name + ' — Journeyman';

    let assets = await DB.listAssets(node.id);
    const links = await DB.listLinks(node.spaceId);
    const siblings = await DB.listNodes(node.spaceId);

    /* --- основной документ: текст с таблицами и картинками --------------- */

    const title = el('input', { class: 'doc-title', value: node.name, 'aria-label': 'Наименование объекта' });
    const meta = el('div', { class: 'doc-meta' });
    const saveStatus = el('span', { class: 'topbar-sub', text: '' });

    const editor = el('div', {
      class: 'doc-text', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
      'aria-label': 'Текст объекта',
      'data-placeholder': 'Здесь живёт всё, что нужно помнить: описание места, реплики NPC, тайны, зацепки, статблоки…',
    });
    // старые записи хранились простым текстом — переносим их в разметку на лету
    editor.innerHTML = sanitizeHtml(node.html != null ? node.html : textToHtml(node.text));
    await hydrateImages(editor);

    /** Подставляет картинкам ссылки на файлы из хранилища. */
    async function hydrateImages(root) {
      for (const img of root.querySelectorAll('img[data-asset]')) {
        const a = await DB.getAsset(img.dataset.asset);
        if (a) img.src = blobUrl(a.blob);
        else img.replaceWith(el('span', { class: 'img-missing', text: '⟨изображение удалено⟩' }));
      }
    }

    /** Разметка для хранения: ссылки на файлы живут только в памяти. */
    function serialize() {
      const clone = editor.cloneNode(true);
      clone.querySelectorAll('img[data-asset]').forEach((i) => i.removeAttribute('src'));
      return clone.innerHTML;
    }

    function updateEmpty() {
      const blank = !editor.textContent.trim() && !editor.querySelector('img, table');
      editor.classList.toggle('is-empty', blank);
    }

    const saveDoc = debounce(async () => {
      const html = serialize();
      const plain = editor.innerText.replace(/ /g, ' ').trim();
      node.html = html;
      node.text = plain;
      await DB.updateNode(node.id, { html, text: plain });
      await DB.touchSpace(node.spaceId);
      refreshMeta();
      saveStatus.textContent = 'сохранено';
      setTimeout(() => { if (saveStatus.textContent === 'сохранено') saveStatus.textContent = ''; }, 1600);
    }, 500);

    function onEdit() {
      updateEmpty();
      saveStatus.textContent = 'сохраняю…';
      saveDoc();
    }
    editor.addEventListener('input', onEdit);

    const save = debounce(async (patch) => {
      await DB.updateNode(node.id, patch);
      await DB.touchSpace(node.spaceId);
      saveStatus.textContent = 'сохранено';
      setTimeout(() => { if (saveStatus.textContent === 'сохранено') saveStatus.textContent = ''; }, 1600);
    }, 500);

    title.addEventListener('input', () => {
      node.name = title.value;
      saveStatus.textContent = 'сохраняю…';
      save({ name: title.value.trim() || 'Без названия' });
    });

    /* --- запоминание места ввода (кнопки не должны его терять) ----------- */

    let savedRange = null;
    const rememberRange = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', rememberRange);

    function focusEditor() {
      editor.focus();
      if (!savedRange) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    // execCommand иногда оставляет <p></p> нулевой высоты — в такой абзац
    // невозможно поставить курсор, поэтому даём ему перенос строки
    const fixEmptyParagraphs = () => {
      editor.querySelectorAll('p:empty').forEach((p) => p.append(document.createElement('br')));
    };
    const exec = (cmd, val) => {
      focusEditor();
      document.execCommand(cmd, false, val);
      fixEmptyParagraphs();
      onEdit();
    };
    const insertHtml = (html) => {
      focusEditor();
      document.execCommand('insertHTML', false, html);
      fixEmptyParagraphs();
      onEdit();
    };

    // вставка из буфера: чистим разметку, чтобы не тащить чужие стили и скрипты
    editor.addEventListener('paste', (e) => {
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      e.preventDefault();
      if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
      else document.execCommand('insertText', false, text);
      onEdit();
    });

    /* --- таблицы --------------------------------------------------------- */

    function currentCell() {
      const anchor = savedRange ? savedRange.startContainer : null;
      if (!anchor || !editor.contains(anchor)) return null;
      const e = anchor.nodeType === 1 ? anchor : anchor.parentElement;
      return e ? e.closest('td, th') : null;
    }

    function tableHtml(rows, cols) {
      let h = '<table><thead><tr>';
      for (let c = 0; c < cols; c++) h += `<th>Столбец ${c + 1}</th>`;
      h += '</tr></thead><tbody>';
      for (let r = 0; r < rows; r++) {
        h += '<tr>' + '<td><br></td>'.repeat(cols) + '</tr>';
      }
      return h + '</tbody></table><p><br></p>';
    }

    async function newTable() {
      const v = await formDialog({
        title: 'Новая таблица',
        description: 'Шапку и ячейки можно править прямо в тексте.',
        fields: [
          { key: 'rows', label: 'Строк (без шапки)', value: '3' },
          { key: 'cols', label: 'Столбцов', value: '3' },
        ],
        submit: 'Вставить',
      });
      if (!v) return;
      const rows = clamp(parseInt(v.rows, 10) || 3, 1, 20);
      const cols = clamp(parseInt(v.cols, 10) || 3, 1, 10);
      insertHtml(tableHtml(rows, cols));
    }

    function addRow(cell) {
      const tr = cell.parentElement;
      const row = document.createElement('tr');
      row.innerHTML = '<td><br></td>'.repeat(tr.children.length);
      tr.after(row);
    }

    function addCol(cell) {
      const idx = [...cell.parentElement.children].indexOf(cell);
      for (const tr of cell.closest('table').rows) {
        const head = tr.parentElement.tagName === 'THEAD';
        const c = document.createElement(head ? 'th' : 'td');
        c.innerHTML = head ? 'Столбец' : '<br>';
        if (tr.children[idx]) tr.children[idx].after(c); else tr.append(c);
      }
    }

    function delRow(cell) {
      const table = cell.closest('table');
      if (table.rows.length <= 1) table.remove();
      else cell.parentElement.remove();
    }

    function delCol(cell) {
      const table = cell.closest('table');
      const idx = [...cell.parentElement.children].indexOf(cell);
      if (cell.parentElement.children.length <= 1) { table.remove(); return; }
      for (const tr of table.rows) if (tr.children[idx]) tr.children[idx].remove();
    }

    async function tableAction() {
      const cell = currentCell();
      if (!cell) return newTable();
      const what = await chooseDialog({
        title: 'Таблица',
        description: 'Курсор стоит внутри таблицы.',
        options: [
          { key: 'row', label: 'Добавить строку ниже', icon: 'plus' },
          { key: 'col', label: 'Добавить столбец справа', icon: 'plus' },
          { key: 'delrow', label: 'Удалить строку', icon: 'trash' },
          { key: 'delcol', label: 'Удалить столбец', icon: 'trash' },
          { key: 'new', label: 'Вставить другую таблицу', icon: 'table' },
        ],
      });
      if (!what) return;
      if (what === 'new') return newTable();
      ({ row: addRow, col: addCol, delrow: delRow, delcol: delCol })[what](cell);
      onEdit();
    }

    /* --- картинка в тексте ----------------------------------------------- */

    const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    async function insertImage() {
      const files = await pickFiles('image/*', false);
      if (!files.length) return;
      try {
        const a = await DB.addAsset(node.id, files[0], 'inline');
        insertHtml(`<img data-asset="${a.id}" src="${blobUrl(a.blob)}" alt="${escAttr(a.name)}"><p><br></p>`);
        toast('Картинка вставлена в текст');
      } catch (err) {
        toast('Не удалось вставить картинку: ' + err.message, 'err');
      }
    }

    /* --- панель приёмов над текстом -------------------------------------- */

    function tool(content, titleText, onclick) {
      const b = el('button', { class: 'btn btn-ghost doc-tool', title: titleText, onclick }, [content]);
      b.addEventListener('mousedown', (e) => e.preventDefault());   // не отбираем курсор у текста
      return b;
    }

    const docTools = el('div', { class: 'doc-tools' }, [
      tool(el('b', { text: 'Ж' }), 'Полужирный', () => exec('bold')),
      tool(el('i', { text: 'К' }), 'Курсив', () => exec('italic')),
      tool(el('span', { class: 'tool-h', text: 'H' }), 'Подзаголовок', () => exec('formatBlock', 'h3')),
      tool(icon('list', 18), 'Список', () => exec('insertUnorderedList')),
      el('span', { class: 'doc-tools-sep' }),
      tool(icon('table', 18), 'Таблица', tableAction),
      tool(icon('image', 18), 'Картинка в текст', insertImage),
    ]);

    function refreshMeta() {
      const words = (node.text || '').trim() ? (node.text.trim().match(/\S+/g) || []).length : 0;
      const media = assets.filter((a) => a.kind !== 'cover' && a.kind !== 'inline').length;
      meta.textContent = `${space ? space.name : 'пространство'} · ${words} ${plural(words, 'слово', 'слова', 'слов')} · ${media} ${plural(media, 'файл', 'файла', 'файлов')}`;
    }

    const doc = el('div', { class: 'doc' }, [
      el('div', { class: 'doc-inner' }, [title, meta, docTools, editor]),
    ]);
    const side = el('aside', { class: 'side' });

    /* --- размер картинок меняется перетягиванием за углы ------------------ */

    const CORNERS = { nw: -1, sw: -1, ne: 1, se: 1 };   // знак: как угол меняет ширину
    const imgFrame = el('div', { class: 'img-frame', hidden: true },
      Object.keys(CORNERS).map((c) => el('span', { class: 'ih ih-' + c, dataset: { corner: c } })));
    doc.append(imgFrame);

    let activeImg = null;

    function hideFrame() { activeImg = null; imgFrame.hidden = true; }

    function placeFrame() {
      if (!activeImg || !editor.contains(activeImg)) return hideFrame();
      const dr = doc.getBoundingClientRect();
      const ir = activeImg.getBoundingClientRect();
      imgFrame.hidden = false;
      imgFrame.style.left = (ir.left - dr.left + doc.scrollLeft) + 'px';
      imgFrame.style.top = (ir.top - dr.top + doc.scrollTop) + 'px';
      imgFrame.style.width = ir.width + 'px';
      imgFrame.style.height = ir.height + 'px';
    }

    editor.addEventListener('click', (e) => {
      const img = e.target.tagName === 'IMG' ? e.target : null;
      if (img) { activeImg = img; placeFrame(); } else hideFrame();
    });
    editor.addEventListener('input', () => { if (activeImg) placeFrame(); });
    doc.addEventListener('scroll', () => { if (activeImg) placeFrame(); }, { passive: true });
    const onWinResize = () => { if (activeImg) placeFrame(); };
    window.addEventListener('resize', onWinResize);

    for (const h of imgFrame.querySelectorAll('.ih')) {
      h.addEventListener('pointerdown', (e) => {
        if (!activeImg) return;
        e.preventDefault();
        e.stopPropagation();
        const grow = CORNERS[h.dataset.corner];
        const startX = e.clientX;
        const startW = activeImg.getBoundingClientRect().width;
        const maxW = editor.clientWidth;
        const img = activeImg;
        h.setPointerCapture(e.pointerId);

        const move = (ev) => {
          const w = clamp(Math.round(startW + (ev.clientX - startX) * grow), 48, maxW);
          img.setAttribute('width', w);
          placeFrame();
        };
        const up = (ev) => {
          try { h.releasePointerCapture(ev.pointerId); } catch (_) {}
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          h.removeEventListener('pointercancel', up);
          placeFrame();
          onEdit();
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
      });
    }

    /* --- свиток плана: тот же узел, что и на прошлом объекте -------------- */

    const scratch = scratchPanel(space || { id: node.spaceId, name: '', scratch: '' });
    // при переносе узла браузер сбрасывает прокрутку — запоминаем её
    const keep = {
      scroll: scratch.area.scrollTop,
      start: scratch.area.selectionStart,
      end: scratch.area.selectionEnd,
    };

    const body = el('div', { class: 'detail-body' }, [scratch.root, doc, side]);
    scratchHost = body;

    app.replaceChildren(
      topbar({
        title: node.name,
        sub: space ? space.name : '',
        back: { title: 'Назад в пространство', onclick: () => go('#/s/' + node.spaceId) },
        actions: [saveStatus, el('button', { class: 'btn btn-ghost btn-icon', title: 'В меню', onclick: () => go('#/') }, [icon('home')])],
      }),
      el('div', { class: 'detail-screen' }, [body]),
    );

    setScratchOpen(localStorage.getItem('jm.scratch.' + node.spaceId) === '1');
    scratch.area.scrollTop = keep.scroll;
    try { scratch.area.setSelectionRange(keep.start, keep.end); } catch (_) {}
    updateEmpty();
    refreshMeta();

    /* --- боковая панель -------------------------------------------------- */

    const openState = { dice: true, calc: true, media: true, audio: false, notes: false, links: true };

    // калькулятор и кубики собираем один раз: при перерисовке панели они
    // переезжают целиком и сохраняют введённое выражение и выпавшие значения
    const calcWidget = CALC.widget();
    const diceWidget = CALC.diceWidget();

    function panel(key, iconName, name, count, content, action) {
      const p = el('details', { class: 'panel', open: openState[key] });
      p.addEventListener('toggle', () => { openState[key] = p.open; });
      p.append(
        el('summary', {}, [
          el('span', { class: 'chev' }, [icon('chev', 16)]),
          icon(iconName, 18),
          el('span', { text: name }),
          count === null ? null : el('span', { class: 'count', text: String(count) }),
        ].filter(Boolean)),
        el('div', { class: 'panel-body' }, [content, action].filter(Boolean)),
      );
      return p;
    }

    function renderSide() {
      const media = assets.filter((a) => a.kind === 'image' || a.kind === 'video');
      const tracks = assets.filter((a) => a.kind === 'audio');
      const notes = node.notes || [];
      const myLinks = links.filter((l) => l.a === node.id || l.b === node.id);

      /* галерея */
      const gallery = media.length
        ? el('div', { class: 'gallery' }, media.map((a) => {
            const url = blobUrl(a.blob);
            const thumb = a.kind === 'video'
              ? el('video', { src: url, muted: true, preload: 'metadata' })
              : el('img', { src: url, alt: a.name, loading: 'lazy' });
            return el('button', {
              class: 'gallery-item', title: `${a.name} · ${fmtSize(a.size)}`,
              onclick: () => lightbox(url, a.mime, a.name),
              oncontextmenu: async (e) => {
                e.preventDefault();
                const ok = await confirmDialog({ title: 'Удалить файл?', description: a.name });
                if (!ok) return;
                await DB.deleteAsset(a.id);
                assets = assets.filter((x) => x.id !== a.id);
                renderSide(); refreshMeta();
              },
            }, [thumb, a.kind === 'video' ? el('span', { class: 'vid-badge' }, [icon('play', 14)]) : null]);
          }))
        : el('div', { class: 'panel-empty', text: 'Ни одного изображения. Правый клик по миниатюре удаляет файл.' });

      /* музыка */
      const music = tracks.length
        ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, tracks.map((a) => {
            const url = blobUrl(a.blob);
            return el('div', { class: 'track' }, [
              el('div', { class: 'track-head' }, [
                el('span', { class: 'track-name', text: a.name, title: `${a.name} · ${fmtSize(a.size)}` }),
                el('button', { class: 'btn btn-ghost btn-icon', title: 'Слушать поверх всех экранов', onclick: () => playTrack(a) }, [icon('play', 16)]),
                el('button', {
                  class: 'btn btn-ghost btn-icon', title: 'Удалить',
                  onclick: async () => {
                    const ok = await confirmDialog({ title: 'Удалить запись?', description: a.name });
                    if (!ok) return;
                    await DB.deleteAsset(a.id);
                    assets = assets.filter((x) => x.id !== a.id);
                    renderSide(); refreshMeta();
                  },
                }, [icon('trash', 16)]),
              ]),
              el('audio', { src: url, controls: true, preload: 'none' }),
            ]);
          }))
        : el('div', { class: 'panel-empty', text: 'Тишина. Загрузи эмбиент или боевую тему.' });

      /* пометки */
      const notesBody = notes.length
        ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, notes.slice().reverse().map((n) =>
            el('div', { class: 'note' }, [
              el('p', { text: n.text }),
              el('div', { class: 'note-foot' }, [
                el('span', { class: 'note-date', text: fmtDate(n.createdAt) }),
                el('span', { style: { flex: '1' } }),
                el('button', {
                  class: 'btn btn-ghost btn-icon', title: 'Удалить пометку',
                  onclick: async () => {
                    node.notes = (node.notes || []).filter((x) => x.id !== n.id);
                    await DB.updateNode(node.id, { notes: node.notes });
                    renderSide();
                  },
                }, [icon('trash', 16)]),
              ]),
            ])))
        : el('div', { class: 'panel-empty', text: 'Короткие напоминания себе: «у трактирщика долг перед гильдией».' });

      /* связи */
      const byId = new Map(siblings.map((n) => [n.id, n]));
      const linksBody = myLinks.length
        ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, myLinks.map((l) => {
            const other = byId.get(l.a === node.id ? l.b : l.a);
            if (!other) return null;
            return el('button', { class: 'link-row', onclick: () => go('#/n/' + other.id) }, [
              icon('chain', 18),
              el('span', { class: 'lr-name', text: other.name }),
              el('span', { class: 'chev' }, [icon('chev', 16)]),
            ]);
          }).filter(Boolean))
        : el('div', { class: 'panel-empty', text: 'Связи протягиваются в пространстве — инструментом «Связь».' });

      side.replaceChildren(
        panel('dice', 'd20', 'Кубики', null, diceWidget),
        panel('calc', 'calc', 'Калькулятор', null, calcWidget),
        panel('media', 'image', 'Изображения и видео', media.length, gallery,
          el('button', { class: 'btn', onclick: () => upload('image/*,video/*', 'media') }, [icon('plus', 18), 'Загрузить'])),
        panel('audio', 'music', 'Музыка', tracks.length, music,
          el('button', { class: 'btn', onclick: () => upload('audio/*', 'audio') }, [icon('plus', 18), 'Загрузить'])),
        panel('notes', 'note', 'Пометки', notes.length, notesBody,
          el('button', { class: 'btn', onclick: addNote }, [icon('plus', 18), 'Добавить пометку'])),
        panel('links', 'chain', 'Связанные директории', myLinks.length, linksBody,
          el('button', { class: 'btn', onclick: () => go('#/s/' + node.spaceId) }, [icon('link', 18), 'В пространство'])),
      );
    }

    async function upload(accept, group) {
      const files = await pickFiles(accept, true);
      if (!files.length) return;
      for (const f of files) {
        const kind = group === 'audio' ? 'audio' : (f.type.startsWith('video') ? 'video' : 'image');
        try {
          const a = await DB.addAsset(node.id, f, kind);
          assets.push(a);
        } catch (err) {
          toast(`Не удалось сохранить «${f.name}»: ${err.message}`, 'err');
        }
      }
      if (!node.coverId) {
        const firstImage = assets.find((a) => a.kind === 'image');
        if (firstImage) { node.coverId = firstImage.id; await DB.updateNode(node.id, { coverId: firstImage.id }); }
      }
      await DB.touchSpace(node.spaceId);
      renderSide(); refreshMeta();
      toast(`Загружено: ${files.length} ${plural(files.length, 'файл', 'файла', 'файлов')}`);
    }

    async function addNote() {
      const v = await formDialog({
        title: 'Новая пометка',
        fields: [{ key: 'text', label: 'Текст', type: 'textarea', placeholder: 'Что нельзя забыть' }],
        submit: 'Добавить',
      });
      if (!v) return;
      node.notes = (node.notes || []).concat({ id: DB.uid(), text: v.text, createdAt: Date.now() });
      await DB.updateNode(node.id, { notes: node.notes });
      renderSide();
      toast('Пометка добавлена');
    }

    renderSide();
    teardown = () => {
      document.removeEventListener('selectionchange', rememberRange);
      window.removeEventListener('resize', onWinResize);
    };
  }

  /* ======================================================================
     Старт
     ====================================================================== */

  route();
})();
