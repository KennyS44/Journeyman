/* ==========================================================================
   db.js — хранилище на IndexedDB.
   Всё живёт в браузере пользователя: записи (пространства, объекты, связи)
   и сами файлы (изображения, видео, музыка) в виде Blob.
   ========================================================================== */

const DB = (() => {
  const NAME = 'journeyman';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('spaces')) {
          db.createObjectStore('spaces', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('nodes')) {
          db.createObjectStore('nodes', { keyPath: 'id' }).createIndex('spaceId', 'spaceId');
        }
        if (!db.objectStoreNames.contains('links')) {
          db.createObjectStore('links', { keyPath: 'id' }).createIndex('spaceId', 'spaceId');
        }
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id' }).createIndex('nodeId', 'nodeId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let out;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      const get = (n) => t.objectStore(n);
      Promise.resolve(fn(stores.length === 1 ? get(stores[0]) : get, t))
        .then((v) => { out = v; })
        .catch((e) => { try { t.abort(); } catch (_) {} reject(e); });
    });
  }

  const wrap = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* --- пространства ------------------------------------------------------ */

  const listSpaces = () =>
    tx(['spaces'], 'readonly', (s) => wrap(s.getAll()))
      .then((all) => all.sort((a, b) => b.updatedAt - a.updatedAt));

  const getSpace = (id) => tx(['spaces'], 'readonly', (s) => wrap(s.get(id)));

  async function createSpace(name, description) {
    const now = Date.now();
    const space = { id: uid(), name, description: description || '', createdAt: now, updatedAt: now };
    await tx(['spaces'], 'readwrite', (s) => wrap(s.put(space)));
    return space;
  }

  async function updateSpace(id, patch) {
    return tx(['spaces'], 'readwrite', async (s) => {
      const cur = await wrap(s.get(id));
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      await wrap(s.put(next));
      return next;
    });
  }

  const touchSpace = (id) => updateSpace(id, {});

  async function deleteSpace(id) {
    const nodes = await listNodes(id);
    await tx(['spaces', 'nodes', 'links', 'assets'], 'readwrite', async (get) => {
      await wrap(get('spaces').delete(id));
      for (const n of nodes) {
        await wrap(get('nodes').delete(n.id));
        const assets = await wrap(get('assets').index('nodeId').getAllKeys(n.id));
        for (const k of assets) await wrap(get('assets').delete(k));
      }
      const linkKeys = await wrap(get('links').index('spaceId').getAllKeys(id));
      for (const k of linkKeys) await wrap(get('links').delete(k));
    });
  }

  /* --- ключевые объекты -------------------------------------------------- */

  const listNodes = (spaceId) =>
    tx(['nodes'], 'readonly', (s) => wrap(s.index('spaceId').getAll(spaceId)));

  const getNode = (id) => tx(['nodes'], 'readonly', (s) => wrap(s.get(id)));

  async function createNode(spaceId, name, x, y) {
    const now = Date.now();
    const node = {
      id: uid(), spaceId, name, x, y,
      coverId: null, text: '', notes: [],
      createdAt: now, updatedAt: now,
    };
    await tx(['nodes'], 'readwrite', (s) => wrap(s.put(node)));
    await touchSpace(spaceId);
    return node;
  }

  async function updateNode(id, patch) {
    return tx(['nodes'], 'readwrite', async (s) => {
      const cur = await wrap(s.get(id));
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      await wrap(s.put(next));
      return next;
    });
  }

  async function deleteNode(id) {
    const node = await getNode(id);
    if (!node) return;
    await tx(['nodes', 'links', 'assets'], 'readwrite', async (get) => {
      await wrap(get('nodes').delete(id));
      const assetKeys = await wrap(get('assets').index('nodeId').getAllKeys(id));
      for (const k of assetKeys) await wrap(get('assets').delete(k));
      const links = await wrap(get('links').index('spaceId').getAll(node.spaceId));
      for (const l of links) {
        if (l.a === id || l.b === id) await wrap(get('links').delete(l.id));
      }
    });
    await touchSpace(node.spaceId);
  }

  /* --- связи ------------------------------------------------------------- */

  const listLinks = (spaceId) =>
    tx(['links'], 'readonly', (s) => wrap(s.index('spaceId').getAll(spaceId)));

  async function createLink(spaceId, a, b, label) {
    if (a === b) return null;
    const existing = await listLinks(spaceId);
    const dup = existing.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (dup) return dup;
    const link = { id: uid(), spaceId, a, b, label: label || '', createdAt: Date.now() };
    await tx(['links'], 'readwrite', (s) => wrap(s.put(link)));
    await touchSpace(spaceId);
    return link;
  }

  const deleteLink = (id) => tx(['links'], 'readwrite', (s) => wrap(s.delete(id)));

  /* --- файлы ------------------------------------------------------------- */

  async function addAsset(nodeId, file, kind) {
    const asset = {
      id: uid(), nodeId, kind,               // 'image' | 'video' | 'audio' | 'cover'
      name: file.name || 'без имени',
      mime: file.type || 'application/octet-stream',
      size: file.size,
      blob: file,
      createdAt: Date.now(),
    };
    await tx(['assets'], 'readwrite', (s) => wrap(s.put(asset)));
    return asset;
  }

  const listAssets = (nodeId) =>
    tx(['assets'], 'readonly', (s) => wrap(s.index('nodeId').getAll(nodeId)))
      .then((all) => all.sort((a, b) => a.createdAt - b.createdAt));

  const getAsset = (id) => tx(['assets'], 'readonly', (s) => wrap(s.get(id)));

  const deleteAsset = (id) => tx(['assets'], 'readwrite', (s) => wrap(s.delete(id)));

  /* --- служебное --------------------------------------------------------- */

  async function estimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try { return await navigator.storage.estimate(); } catch (_) { return null; }
  }

  return {
    uid,
    listSpaces, getSpace, createSpace, updateSpace, deleteSpace, touchSpace,
    listNodes, getNode, createNode, updateNode, deleteNode,
    listLinks, createLink, deleteLink,
    addAsset, listAssets, getAsset, deleteAsset,
    estimate,
  };
})();
