// ============================================================
// HAITI REH-CARE ERP — Mode hors-ligne
// ------------------------------------------------------------
// 1. Intercepte les requêtes Supabase REST (/rest/v1/*) :
//      GET  → réseau d'abord, sinon réponse en cache (IndexedDB)
//      POST/PATCH/DELETE/RPC → file d'attente locale, rejouée à la reconnexion
// 2. PIN hors-ligne : connexion sans internet (géré par le PDG)
// 3. Badge de statut (en ligne / hors ligne / en attente de sync)
// 4. Bouton d'installation PWA
//
// IMPORTANT : ce fichier doit être chargé AVANT supabase.js
// (il enveloppe window.fetch avant la création du client).
// ============================================================

(function () {
  if (window.__erpOfflineLoaded) return;
  window.__erpOfflineLoaded = true;

  // ----------------------------------------------------------
  // 1. IndexedDB — file de mutations + cache de lectures + clé/valeur
  // ----------------------------------------------------------
  const IDB = {
    _p: null,
    open() {
      if (this._p) return this._p;
      this._p = new Promise((resolve, reject) => {
        const req = indexedDB.open('erp_offline', 1);
        req.onupgradeneeded = (e) => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
          if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache', { keyPath: 'key' });
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return this._p;
    },
    async _tx(store, mode, fn) {
      const d = await this.open();
      return new Promise((resolve, reject) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        const out = fn(s);
        t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    },
    put(store, val) { return this._tx(store, 'readwrite', s => s.put(val)); },
    get(store, key) {
      return this._tx(store, 'readonly', s => {
        return new Promise((res) => { const r = s.get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      }).then(v => (v instanceof Promise ? v : v));
    },
    del(store, key) { return this._tx(store, 'readwrite', s => s.delete(key)); },
    all(store) {
      return this._tx(store, 'readonly', s => {
        return new Promise((res) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
      });
    },
    count(store) {
      return this._tx(store, 'readonly', s => {
        return new Promise((res) => { const r = s.count(); r.onsuccess = () => res(r.result || 0); r.onerror = () => res(0); });
      });
    }
  };

  const kv = {
    async get(k, dflt) { try { const r = await IDB.get('kv', k); return r ? r.v : dflt; } catch (e) { return dflt; } },
    async set(k, v) { try { await IDB.put('kv', { k, v }); } catch (e) {} }
  };

  // ----------------------------------------------------------
  // 2. Interception de window.fetch → Supabase REST
  // ----------------------------------------------------------
  const _fetch = window.fetch.bind(window);
  window.__erpNativeFetch = _fetch;

  function sbOrigin() {
    try {
      const sb = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : (window.SUPABASE_URL || null);
      return sb ? new URL(sb).origin : null;
    } catch (e) { return null; }
  }

  async function handleRead(req) {
    // Range header = pagination PostgREST (différentes pages, même URL)
    const key = req.method + ' ' + req.url + ' ' + (req.headers.get('range') || '');
    try {
      const res = await _fetch(req);
      if (res && res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const body = await res.clone().text();
          const headers = {};
          res.headers.forEach((v, k) => { if (['content-type', 'content-range'].includes(k)) headers[k] = v; });
          IDB.put('cache', { key, body, status: res.status, headers, ts: Date.now() }).catch(() => {});
        }
      }
      return res;
    } catch (e) {
      // Hors-ligne → cache IndexedDB
      try {
        const hit = await IDB.get('cache', key);
        if (hit) return new Response(hit.body, { status: hit.status || 200, headers: hit.headers || { 'content-type': 'application/json' } });
      } catch (e2) {}
      // Jamais mis en cache → réponse "vide" propre
      if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
      const wantsObj = (req.headers.get('accept') || '').includes('vnd.pgrst.object+json');
      if (wantsObj) {
        return new Response(JSON.stringify({ code: 'PGRST116', message: 'Results contain 0 rows' }),
          { status: 406, headers: { 'content-type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
  }

  async function handleWrite(req) {
    // Réseau d'abord — si ça passe, comportement 100% normal
    // (clone : le body sera relu plus bas en cas d'échec)
    try { return await _fetch(req.clone()); } catch (e) { /* hors-ligne → file d'attente */ }

    const url = new URL(req.url);
    const isRpc = url.pathname.startsWith('/rest/v1/rpc/');

    let bodyText = '';
    try { bodyText = await req.text(); } catch (e) {}
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch (e) {}

    // INSERT/UPSERT : injecter un id UUID côté client si absent —
    // les écritures dépendantes (FK) resteront cohérentes au replay.
    if (!isRpc && req.method === 'POST' && body) {
      const rows = Array.isArray(body) ? body : [body];
      rows.forEach(r => { if (r && typeof r === 'object' && !r.id) r.id = crypto.randomUUID(); });
      body = Array.isArray(body) ? body : rows[0];
      bodyText = JSON.stringify(body);
    }

    const keep = {};
    ['content-type', 'apikey', 'authorization', 'prefer', 'accept', 'x-client-info']
      .forEach(h => { const v = req.headers.get(h); if (v) keep[h] = v; });

    try {
      await IDB.put('queue', { url: req.url, method: req.method, headers: keep, body: bodyText, ts: Date.now(), retries: 0 });
    } catch (e) { console.warn('[offline] queue write failed:', e); }
    SyncBadge.refresh();
    document.dispatchEvent(new CustomEvent('erp:offline-queued', { detail: { url: req.url, method: req.method } }));

    // Réponse synthétique de succès pour ne pas casser l'UI
    if (isRpc) return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
    if (req.method === 'DELETE') return new Response(null, { status: 204 });
    const prefer = req.headers.get('prefer') || '';
    if (!prefer.includes('return=representation')) return new Response(null, { status: 204 });
    const wantsObj = (req.headers.get('accept') || '').includes('vnd.pgrst.object+json');
    let rep = body == null ? [] : body;
    if (wantsObj) rep = Array.isArray(rep) ? rep[0] : rep;
    else if (!Array.isArray(rep)) rep = [rep];
    return new Response(JSON.stringify(rep), { status: req.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
  }

  window.fetch = async function (input, init) {
    try {
      const origin = sbOrigin();
      const rawUrl = (typeof input === 'string' || input instanceof URL) ? input : input.url;
      const url = new URL(rawUrl, location.href);
      if (origin && url.origin === origin && url.pathname.startsWith('/rest/v1/')) {
        const req = new Request(input, init);
        if (req.method === 'GET' || req.method === 'HEAD') return handleRead(req);
        return handleWrite(req);
      }
    } catch (e) { /* pass-through */ }
    return _fetch(input, init);
  };

  // ----------------------------------------------------------
  // 3. Synchronisation — rejoue la file (rapide, séquentiel)
  // ----------------------------------------------------------
  let _flushing = false;
  let _lastFlushOk = 0;

  async function flushQueue() {
    if (_flushing || !navigator.onLine) return;
    _flushing = true;
    SyncBadge.refresh();
    try {
      const items = await IDB.all('queue');
      if (!items.length) return;
      items.sort((a, b) => (a.qid || 0) - (b.qid || 0));

      // Token frais (celui stocké a pu expirer)
      let token = null;
      try {
        const s = await window.db?.auth?.getSession();
        token = s?.data?.session?.access_token || null;
      } catch (e) {}

      let synced = 0;
      for (const it of items) {
        const headers = { ...(it.headers || {}) };
        if (token) headers['authorization'] = 'Bearer ' + token;
        let done = false;
        try {
          const res = await _fetch(it.url, { method: it.method, headers, body: it.body || undefined });
          if (res.ok) { done = true; synced++; }
          else if (res.status >= 400 && res.status < 500) {
            // Erreur permanente (doublon, RLS, validation…) → ne pas rebloquer la file
            console.warn('[offline-sync] dropped', res.status, it.url);
            done = true;
          } else break; // 5xx → serveur down, on arrête là
        } catch (e) { break; } // toujours hors-ligne
        if (done) { try { await IDB.del('queue', it.qid); } catch (e) {} }
        else {
          it.retries = (it.retries || 0) + 1;
          if (it.retries > 8) { try { await IDB.del('queue', it.qid); } catch (e) {} }
          else { try { await IDB.put('queue', it); } catch (e) {} }
        }
      }
      if (synced > 0) {
        _lastFlushOk = Date.now();
        SyncBadge.toast(`Synchronisé — ${synced} opération${synced > 1 ? 's' : ''} envoyée${synced > 1 ? 's' : ''}`);
      }
      document.dispatchEvent(new CustomEvent('erp:synced', { detail: { synced } }));
    } catch (e) {
      console.warn('[offline-sync] flush error:', e);
    } finally {
      _flushing = false;
      SyncBadge.refresh();
    }
  }

  window.addEventListener('online', () => { flushQueue(); OfflineAuth.revalidate(); });
  window.addEventListener('offline', () => SyncBadge.refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flushQueue(); });
  setInterval(flushQueue, 15000);

  // ----------------------------------------------------------
  // 4. Badge de statut (injecté, bas-droite)
  // ----------------------------------------------------------
  const SyncBadge = {
    _el: null, _timer: null,
    ensure() {
      if (this._el || !document.body) return;
      const el = document.createElement('div');
      el.id = 'erp-sync-badge';
      el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;display:flex;align-items:center;gap:8px;'
        + 'padding:8px 14px;border-radius:999px;font:600 12px/1 system-ui,sans-serif;cursor:pointer;'
        + 'box-shadow:0 4px 16px rgba(0,0,0,.18);transition:all .3s;user-select:none;';
      el.title = 'Cliquer pour synchroniser maintenant';
      el.addEventListener('click', () => { flushQueue(); });
      document.body.appendChild(el);
      this._el = el;
    },
    async refresh() {
      this.ensure();
      if (!this._el) return;
      let pending = 0;
      try { pending = await IDB.count('queue'); } catch (e) {}
      const online = navigator.onLine;
      const el = this._el;
      if (!online) {
        el.style.background = '#f59e0b'; el.style.color = '#fff'; el.style.opacity = '1';
        el.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block"></span>'
          + 'Hors ligne' + (pending ? ` · ${pending} en attente` : '');
      } else if (_flushing || pending > 0) {
        el.style.background = '#2563eb'; el.style.color = '#fff'; el.style.opacity = '1';
        el.innerHTML = '<span style="width:10px;height:10px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:erpSpin .8s linear infinite"></span>'
          + `Sync… ${pending || ''}`;
      } else {
        el.style.background = '#10b981'; el.style.color = '#fff';
        el.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block"></span> En ligne';
        // Petit et discret quand tout est synchronisé
        el.style.opacity = '.75'; el.style.padding = '6px 10px';
        return;
      }
      el.style.padding = '8px 14px';
      if (!document.getElementById('erp-spin-style')) {
        const st = document.createElement('style');
        st.id = 'erp-spin-style';
        st.textContent = '@keyframes erpSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
      }
    },
    toast(msg) {
      this.ensure();
      if (!this._el) return;
      const el = this._el;
      el.style.background = '#10b981'; el.style.color = '#fff'; el.style.opacity = '1'; el.style.padding = '8px 14px';
      el.innerHTML = '✓ ' + msg;
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.refresh(), 3000);
    },
    pending() { return IDB.count('queue'); }
  };
  window.SyncBadge = SyncBadge;

  // ----------------------------------------------------------
  // 5. PIN hors-ligne (PDG définit, employé se connecte sans internet)
  // ----------------------------------------------------------
  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function permsFromRecord(rec) {
    if (rec.role === 'pdg' || rec.role === 'directrice' || rec.role === 'directeur'
        || rec.role === 'informaticien' || rec.email === 'haitirecarepdg@gmail.com') return { all: true };
    const roleDefaults = (typeof ERP_ROLE_DEFAULT_PERMISSIONS !== 'undefined') ? ERP_ROLE_DEFAULT_PERMISSIONS : {};
    const perms = { ...(roleDefaults[rec.role] || {}) };
    if (rec.poste_permissions && typeof rec.poste_permissions === 'object') Object.assign(perms, rec.poste_permissions);
    (rec.user_modules || []).forEach(m => {
      if (m.is_enabled === false) return;
      perms[m.module_code] = m.permissions || true;
    });
    return perms;
  }

  const OfflineAuth = {
    SESSION_KEY: 'erp_offline_session',
    USERS_KEY: 'offline_users',

    // Rafraîchit la liste des employés autorisés hors-ligne (session en ligne requise)
    async refresh(force) {
      if (!navigator.onLine || !window.db) return;
      const last = await kv.get('offline_users_ts', 0);
      if (!force && Date.now() - last < 5 * 60 * 1000) return; // max 1x / 5 min
      try {
        const { data, error } = await window.db.rpc('erp_list_offline_users');
        if (error || !Array.isArray(data)) return;
        const map = {};
        data.forEach(u => { if (u.email) map[String(u.email).toLowerCase()] = u; });
        await kv.set(this.USERS_KEY, map);
        await kv.set('offline_users_ts', Date.now());
      } catch (e) { console.warn('[offline] refresh users:', e); }
    },

    // Connexion par code seul — le code identifie l'employé, 100% locale
    async login(pin) {
      const p = String(pin || '').trim();
      if (!p) return { success: false, error: 'Entrez votre code employé' };
      const map = (await kv.get(this.USERS_KEY, {})) || {};
      let rec = null;
      for (const u of Object.values(map)) {
        if (!u.offline_access_enabled || !u.offline_pin_hash || u.is_active === false) continue;
        if (await sha256Hex(p + ':' + u.id) === u.offline_pin_hash) { rec = u; break; }
      }
      if (!rec) {
        const hasAny = Object.values(map).some(u => u.offline_access_enabled);
        if (!hasAny) {
          return { success: false, error: 'Aucun compte hors-ligne sur cet appareil — connectez-vous en ligne une première fois' };
        }
        return { success: false, error: 'Code incorrect' };
      }
      localStorage.setItem(this.SESSION_KEY, JSON.stringify({ user_id: rec.id, email: rec.email, ts: Date.now() }));
      return { success: true, redirectUrl: 'dashboard.html' };
    },

    // Session hors-ligne active → objet utilisateur pour initApp()
    async getSessionUser() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); } catch (e) {}
      if (!s || !s.user_id) return null;
      const map = (await kv.get(this.USERS_KEY, {})) || {};
      const rec = map[String(s.email || '').toLowerCase()];
      if (!rec || rec.id !== s.user_id) return null;
      return {
        id: rec.id, email: rec.email,
        first_name: rec.first_name, last_name: rec.last_name,
        role: rec.role, poste_id: rec.poste_id, annexe_id: rec.annexe_id,
        is_active: true,
        erp_postes: { permissions: rec.poste_permissions || {} },
        _offline_perms: permsFromRecord(rec)
      };
    },

    async listUsers() {
      const map = (await kv.get(this.USERS_KEY, {})) || {};
      return Object.values(map)
        .filter(u => u.offline_access_enabled && u.is_active !== false)
        .sort((a, b) => String(a.first_name).localeCompare(String(b.first_name)));
    },

    logout() {
      localStorage.removeItem(this.SESSION_KEY);
    },

    // Si le PDG a révoqué l'accès pendant qu'on était hors-ligne,
    // la revoc se propage dès que l'appareil retrouve internet.
    async revalidate() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); } catch (e) {}
      if (!s || !navigator.onLine || !window.db) return;
      await this.refresh(true);
      const map = (await kv.get(this.USERS_KEY, {})) || {};
      const rec = map[String(s.email || '').toLowerCase()];
      if (!rec || !rec.offline_access_enabled || rec.is_active === false) {
        this.logout();
        if (!/index\.html$/.test(location.pathname) && location.pathname !== '/' && location.pathname !== '') {
          location.href = '/index.html';
        }
      }
    }
  };
  window.OfflineAuth = OfflineAuth;

  // ----------------------------------------------------------
  // 6. Invite d'installation PWA (Android/desktop) + aide iOS
  // ----------------------------------------------------------
  let _deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    showInstallChip();
  });
  window.addEventListener('appinstalled', () => { hideInstallChip(); });

  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

  function showInstallChip() {
    if (isStandalone() || document.getElementById('erp-install-chip')) return;
    const chip = document.createElement('button');
    chip.id = 'erp-install-chip';
    chip.innerHTML = '⤓ Installer l\'application';
    chip.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99999;padding:10px 16px;border:none;border-radius:999px;'
      + 'background:linear-gradient(135deg,#0d9488,#2563eb);color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;'
      + 'box-shadow:0 4px 16px rgba(13,148,136,.4);';
    chip.addEventListener('click', async () => {
      if (_deferredPrompt) {
        _deferredPrompt.prompt();
        const { outcome } = await _deferredPrompt.userChoice;
        if (outcome === 'accepted') hideInstallChip();
        _deferredPrompt = null;
      } else if (isIOS()) {
        alert('Pour installer : appuyez sur Partager puis « Sur l\'écran d\'accueil ».');
      }
    });
    if (document.body) document.body.appendChild(chip);
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(chip));
  }
  function hideInstallChip() { document.getElementById('erp-install-chip')?.remove(); }
  // iOS : proposer l'installation quand même (pas de beforeinstallprompt)
  document.addEventListener('DOMContentLoaded', () => {
    SyncBadge.refresh();
    flushQueue();
    if (isIOS() && !isStandalone()) showInstallChip();
  });
})();
