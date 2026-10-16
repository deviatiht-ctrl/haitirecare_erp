// ==============================================================
// MULTI-ANNEXES — kontèks branch, switcher direksyon, edp filtè
// ==============================================================
// Prensip:
//   * Staff jeneral → filtre otomatik sou annex li a
//     (erp_users.annexe_id; RLS la fè menm bagay sou sèvè a).
//   * Direksyon (pdg/directrice/directeur) + Enfòmatisyen →
//     switcher nan topbar la: yon annex presi oswa "Consolidé"
//     (vi global — pa gen filtè).
//   * Chwazi yon annex mete l nan localStorage epi reload paj la —
//     tout query yo pase nan applyBranchFilter().
//
// Edp piblik yo:
//   initBranchContext(user)        — chaje annex yo + rezoud vi aktif
//   renderBranchSwitcher()         — enjekte selectè a nan topbar la
//   canSwitchBranch(user)          — direksyon / enfòmatisyen
//   getBranchFilterId()            — uuid annex oswa null (= tout)
//   getInsertAnnexeId()            — annex ki ap pran nouvo insert yo
//   applyBranchFilter(query, col)  — eq(annexe_id) si annex presi chwazi
//   erpSelect(table, cols)         — select() + filtè annex otomatik
//   withBranch(payload)            — ajoute annexe_id sou insert
//   erpAnnexeName(id)              — non annex la
//   erpAnnexeCode(id)              — kòd annex la (PAP, LEO…)
// ==============================================================

// Tab ki gen kolòn annexe_id (filtre aplikab)
const BRANCH_SCOPED_TABLES = new Set([
  'erp_patients', 'erp_rdv', 'erp_seances', 'erp_protheses', 'erp_ortheses',
  'erp_patient_reevaluations', 'erp_evaluations', 'erp_atelier_orders',
  'erp_encaissements', 'erp_reclamations', 'erp_bons_commande',
  'erp_clients', 'erp_client_suivi',
  'erp_revenus', 'erp_depenses', 'erp_caisse', 'erp_caisse_operations',
  'erp_produits', 'erp_stock_movements',
  'erp_taches',
  'erp_factures', 'erp_facturation_medical', 'erp_ordonnances',
  'erp_pharmacie', 'erp_fournisseurs', 'erp_agenda',
  'erp_annonces', 'erp_site_messages',
  'erp_presences', 'erp_conges', 'erp_performances',
  'erp_activites', 'erp_rapports_mensuels', 'erp_audit_log'
]);

const BRANCH_VIEW_KEY = 'erp-branch-view';   // 'all' | annexe_id
const BRANCH_VIEW_ALL = 'all';

window.erpAnnexes = window.erpAnnexes || [];
window.erpActiveBranchView = window.erpActiveBranchView || null; // 'all' | uuid | null

// Direksyon + admin teknik ka chanje vi annex la
function canSwitchBranch(user) {
  return ['pdg', 'directrice', 'directeur', 'informaticien'].includes(user?.role)
      || (typeof isErpOwner === 'function' && isErpOwner(user));
}

// Chaje lis annex yo yon sèl fwa epi rezoud vi aktif la
async function initBranchContext(user) {
  user = user || window.currentUser;

  try {
    const { data } = await db
      .from('erp_annexes')
      .select('*')
      .eq('is_active', true)
      .order('is_principale', { ascending: false })
      .order('created_at');
    window.erpAnnexes = data || [];
  } catch (e) {
    console.warn('[branch] Chargement annexes:', e);
    window.erpAnnexes = window.erpAnnexes || [];
  }

  if (canSwitchBranch(user)) {
    // Direksyon/admin: vi konserve nan localStorage; defo = konsolidasyon
    let view = null;
    try { view = localStorage.getItem(BRANCH_VIEW_KEY); } catch (e) { /* */ }
    if (!view) view = user?.annexe_id || BRANCH_VIEW_ALL;
    if (view !== BRANCH_VIEW_ALL
        && !window.erpAnnexes.some(a => a.id === view)) {
      view = user?.annexe_id || BRANCH_VIEW_ALL;
    }
    window.erpActiveBranchView = view;
  } else {
    // Staff: vi fikse sou annex li a (null si li pa asiye → wè done pataje)
    window.erpActiveBranchView = user?.annexe_id || null;
  }

  return window.erpActiveBranchView;
}

// ID annex pou FILTRE lekti — null vle di "pa filtre" (konsolidasyon)
function getBranchFilterId() {
  const u = window.currentUser;
  if (canSwitchBranch(u)) {
    return window.erpActiveBranchView === BRANCH_VIEW_ALL
      ? null
      : (window.erpActiveBranchView || null);
  }
  return u?.annexe_id || null;
}

// ID annex pou INSERT — staff → annex li; direksyon → annex chwazi
// (nan vi "Consolidé" → annex moun nan oswa null: trigger SQL la deside)
function getInsertAnnexeId() {
  const u = window.currentUser;
  if (!canSwitchBranch(u)) return u?.annexe_id || null;
  if (window.erpActiveBranchView
      && window.erpActiveBranchView !== BRANCH_VIEW_ALL) {
    return window.erpActiveBranchView;
  }
  return u?.annexe_id || null;
}

// Aplike filtè annex sou yon query Supabase (select/update/delete)
// Itilizasyon: applyBranchFilter(db.from('erp_rdv').select('*'))
function applyBranchFilter(query, column = 'annexe_id') {
  const id = getBranchFilterId();
  if (id && column) {
    // Menm semantik ak RLS la: annex la + liy pataje (annexe_id NULL)
    try { return query.or(`${column}.eq.${id},${column}.is.null`); }
    catch (e) { /* */ }
  }
  return query;
}

// db.from(table).select(cols) + filtè annex otomatik si tab la gen annex
function erpSelect(table, cols = '*') {
  let q = db.from(table).select(cols);
  if (BRANCH_SCOPED_TABLES.has(table)) q = applyBranchFilter(q);
  return q;
}

// Ajoute annexe_id sou yon payload insert (si li pa deja mete)
function withBranch(payload) {
  if (payload && typeof payload === 'object' && payload.annexe_id === undefined) {
    const id = getInsertAnnexeId();
    if (id) payload.annexe_id = id;
  }
  return payload;
}

function erpAnnexeName(id) {
  const a = (window.erpAnnexes || []).find(x => x.id === id);
  return a ? `${a.code} — ${a.nom}` : '—';
}
function erpAnnexeCode(id) {
  const a = (window.erpAnnexes || []).find(x => x.id === id);
  return a ? a.code : '';
}
function erpAnnexeShortName(id) {
  const a = (window.erpAnnexes || []).find(x => x.id === id);
  return a ? a.nom : '—';
}

// ==============================================================
// SWITCHER — enjekte nan topbar la
// ==============================================================
function renderBranchSwitcher() {
  const u = window.currentUser;
  if (!u) return;

  // Retire ansyen an si li egziste
  document.getElementById('branch-switcher-wrap')?.remove();

  // Sib: topbar klasik (modil yo) oswa header dashboard la
  const topbarLeft = document.querySelector('.topbar-left');
  const dashActions = document.querySelector('#dynamic-header .header-actions');
  const target = topbarLeft || dashActions;
  if (!target) return;

  const wrap = document.createElement('div');
  wrap.id = 'branch-switcher-wrap';
  wrap.style.cssText = topbarLeft
    ? 'display:flex; align-items:center; gap:8px; margin-left:18px;'
    : 'display:flex; align-items:center; gap:8px; margin-right:10px;';

  if (canSwitchBranch(u)) {
    // Selectè pou direksyon/admin: chak annex + vi konsolidasyon
    const options = [
      `<option value="${BRANCH_VIEW_ALL}" ${window.erpActiveBranchView === BRANCH_VIEW_ALL ? 'selected' : ''}>🌐 Consolidé (tout)</option>`,
      ...(window.erpAnnexes || []).map(a =>
        `<option value="${a.id}" ${window.erpActiveBranchView === a.id ? 'selected' : ''}>${a.code} — ${a.nom}</option>`)
    ].join('');

    wrap.innerHTML = `
      <i data-lucide="building-2" style="width:16px;height:16px;color:var(--clr-text-muted,#94a3b8);"></i>
      <select id="branch-switcher" class="form-input"
              style="padding:5px 10px; font-size:13px; min-width:170px; height:auto;">
        ${options}
      </select>`;

    if (dashActions && !topbarLeft) dashActions.prepend(wrap);
    else topbarLeft.appendChild(wrap);

    wrap.querySelector('#branch-switcher').addEventListener('change', (e) => {
      try { localStorage.setItem(BRANCH_VIEW_KEY, e.target.value); } catch (err) { /* */ }
      window.erpActiveBranchView = e.target.value;
      window.location.reload();
    });
  } else if (u.annexe_id) {
    // Staff: badj sèlman (pa ka chanje — RLS la bloke l de tout fason)
    wrap.innerHTML = `
      <span class="badge" title="Votre annexe de rattachement"
            style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
        <i data-lucide="map-pin" style="width:13px;height:13px;"></i>
        ${erpAnnexeShortName(u.annexe_id)}
      </span>`;
    if (dashActions && !topbarLeft) dashActions.prepend(wrap);
    else topbarLeft.appendChild(wrap);
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Tablo done yo gen kolòn annexe? (pou filtè nan paj jenerik yo)
function tableHasBranch(table) {
  return BRANCH_SCOPED_TABLES.has(table);
}

// ==============================================================
// PATCH GLOBAL db.from — filtre annex otomatik sou TOUT query yo.
//
// Tout paj ansyen yo (modules/*.html, dashboard…) fè db.from(...)
// dirèkteman. Olye pou modifye chak query, nou vlope builder la:
//   .select / .update / .delete  →  or(annexe_id = annex, IS NULL)
// Le yon annex presi chwazi, sa kenbe liy "pataje" (annexe_id NULL)
// vizib — menm semantik ak RLS la (erp_annexe_visible).
// "Consolidé" → pa gen filtè (direksyon wè tout).
// Izolasyon reyèl la rete sou sèvè a (RLS) — patch la la pou
// switcher la mache san retouche chak paj.
// ==============================================================
(function patchDbFrom() {
  if (typeof db === 'undefined' || !db || db.__branchPatched) return;
  const origFrom = db.from.bind(db);

  db.from = function (table) {
    const builder = origFrom(table);
    if (!BRANCH_SCOPED_TABLES.has(table)) return builder;
    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (prop === 'select' || prop === 'update' || prop === 'delete') {
          return function (...args) {
            const q = target[prop].apply(target, args);
            const id = getBranchFilterId();
            if (!id) return q;
            try { return q.or(`annexe_id.eq.${id},annexe_id.is.null`); }
            catch (e) { return q; }
          };
        }
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? v.bind(target) : v;
      }
    });
  };
  db.__branchPatched = true;
})();
