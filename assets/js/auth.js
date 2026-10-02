// Authentication & Session Management
// Runs on every page load

// ============================================================
// Theme — clair par defaut, l'utilisateur peut passer en sombre.
// Applique immediatement (ce fichier est charge dans <head>)
// pour eviter tout flash de theme au chargement.
// ============================================================
(function applySavedTheme() {
  let theme = 'light';
  try { theme = localStorage.getItem('erp-theme') || 'light'; } catch (e) { /* ignore */ }
  document.documentElement.dataset.theme = theme;
})();

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('erp-theme', next); } catch (e) { /* ignore */ }
}

// ============================================================
// Registre des modules ERP
// Chaque module a: label, icon, section, et `page`.
// Quand `page` est null, la page est générée dynamiquement par
// /module.html?m=<code> — aucun fichier physique n'est requis.
// ============================================================
const ERP_MODULE_REGISTRY = {
  dashboard:    { label: 'Tableau de bord',      icon: 'layout-dashboard', page: '/dashboard.html',                      section: 'Principal' },
  clients:      { label: 'Clients',              icon: 'users',            page: '/modules/clients/liste.html',          section: 'Gestion' },
  stock:        { label: 'Stock & Inventaire',   icon: 'package',          page: '/modules/stock/inventaire.html',       section: 'Gestion' },
  catalogue:    { label: 'Catalogue Client',     icon: 'shopping-bag',     page: '/modules/stock/catalogue.html',        section: 'Gestion' },
  finances:     { label: 'Finances',             icon: 'dollar-sign',      page: '/modules/finances/revenus.html',       section: 'Gestion' },
  caisse:       { label: 'Caisse',               icon: 'wallet',           page: '/modules/finances/caisse.html',        section: 'Gestion' },
  ventes:       { label: 'Ventes',               icon: 'shopping-cart',    page: null,                                   section: 'Gestion' },
  factures:     { label: 'Factures',             icon: 'file-text',        page: null,                                   section: 'Gestion' },
  facturation:  { label: 'Facturation',          icon: 'receipt',          page: '/modules/finances/revenus.html',       section: 'Gestion' },
  fournisseurs: { label: 'Fournisseurs',         icon: 'truck',            page: null,                                   section: 'Gestion' },
  rh:           { label: 'Ressources Humaines',  icon: 'user-check',       page: '/modules/rh/employes.html',            section: 'RH' },
  employes:     { label: 'Employés',             icon: 'users',            page: '/modules/rh/employes.html',            section: 'RH' },
  presences:    { label: 'Présences',            icon: 'calendar-check',   page: '/modules/rh/presences.html',           section: 'RH' },
  conges:       { label: 'Congés',               icon: 'calendar',         page: '/modules/rh/conges.html',              section: 'RH' },
  taches:       { label: 'Tâches & Projets',     icon: 'check-square',     page: '/modules/taches/kanban.html',          section: 'Gestion' },
  projets:      { label: 'Projets',              icon: 'folder-kanban',    page: '/modules/taches/kanban.html',          section: 'Gestion' },
  rapports:     { label: 'Rapports',             icon: 'bar-chart-3',      page: '/modules/rapports/global.html',        section: 'Rapports' },
  messages:     { label: 'Messages',             icon: 'message-square',   page: '/modules/communication/messages.html', section: 'Communication' },
  agenda:       { label: 'Agenda',               icon: 'calendar',         page: null,                                   section: 'Communication' },
  parametres:   { label: 'Paramètres',           icon: 'settings',         page: '/modules/parametres/entreprise.html',  section: 'Administration' },
  users:        { label: 'Utilisateurs',         icon: 'user-cog',         page: '/modules/users/liste.html',            section: 'Administration' },
  annexes:      { label: 'Annexes',              icon: 'building-2',       page: null,                                   section: 'Administration' },
  // Modules cliniques (physiothérapie, hôpital...)
  patients:     { label: 'Patients',             icon: 'heart-pulse',      page: null,                                   section: 'Clinique' },
  rdv:          { label: 'Rendez-vous',          icon: 'calendar-clock',   page: null,                                   section: 'Clinique' },
  seances:      { label: 'Séances de soin',      icon: 'activity',         page: null,                                   section: 'Clinique' },
  ordonnances:  { label: 'Ordonnances',          icon: 'file-text',        page: null,                                   section: 'Clinique' },
  protheses:    { label: 'Prothèses',            icon: 'bone',             page: null,                                   section: 'Clinique' },
  ortheses:     { label: 'Orthèses',             icon: 'footprints',       page: null,                                   section: 'Clinique' },
  services:     { label: 'Services & Tarifs',    icon: 'clipboard-list',   page: null,                                   section: 'Gestion' },
  facturation_medical: { label: 'Facturation Médicale', icon: 'receipt',   page: null,                                   section: 'Gestion' },
  pharmacie:    { label: 'Pharmacie',            icon: 'pill',             page: null,                                   section: 'Gestion' },
  materiel_orthopedique: { label: 'Matériel Orthopédique', icon: 'package-plus', page: '/modules/stock/inventaire.html?cat=Mat%C3%A9riel%20Orthop%C3%A9dique&m=materiel_orthopedique', section: 'Gestion' },
  // Site public HAITI REH-CARE
  siteweb:      { label: 'Site Web',             icon: 'globe',            page: '/modules/siteweb/index.html',          section: 'Site Web' },
  annonces:     { label: 'Annonces',             icon: 'megaphone',        page: '/modules/siteweb/index.html#annonces', section: 'Site Web' }
};

// Modules toujours présents pour toute entreprise
const ERP_CORE_MODULES = ['dashboard', 'clients', 'taches', 'messages', 'rapports'];

// Clés de permission qui débloquent chaque module
const ERP_MODULE_PERMISSIONS = {
  clients:      ['clients'],
  stock:        ['stock', 'stock_read', 'catalogue'],
  catalogue:    ['catalogue', 'stock', 'stock_read'],
  finances:     ['finances', 'factures', 'facturation', 'caisse'],
  caisse:       ['caisse', 'finances'],
  ventes:       ['ventes'],
  factures:     ['factures', 'finances'],
  facturation:  ['facturation', 'factures', 'finances'],
  fournisseurs: ['fournisseurs', 'stock'],
  rh:           ['rh', 'employes'],
  employes:     ['employes', 'rh'],
  presences:    ['presences', 'rh', 'presences_own'],
  conges:       ['conges', 'rh'],
  taches:       ['taches', 'taches_own'],
  projets:      ['projets', 'taches', 'taches_own'],
  rapports:     ['rapports'],
  messages:     ['messages'],
  agenda:       ['agenda', 'messages'],
  parametres:   ['parametres'],
  users:        ['users'],
  annexes:      ['annexes', 'users', 'parametres'],
  dashboard:    ['dashboard', 'view'],
  // Modules cliniques
  patients:     ['patients', 'clients'],
  rdv:          ['rdv', 'agenda'],
  seances:      ['seances', 'patients'],
  ordonnances:  ['ordonnances', 'patients'],
  protheses:    ['protheses', 'patients'],
  ortheses:     ['ortheses', 'patients'],
  services:     ['services', 'catalogue'],
  facturation_medical: ['facturation_medical', 'facturation', 'finances'],
  pharmacie:    ['pharmacie', 'stock'],
  materiel_orthopedique: ['materiel_orthopedique', 'stock', 'catalogue'],
  siteweb:      ['siteweb', 'parametres'],
  annonces:     ['annonces', 'siteweb', 'parametres']
};

// Permissions par défaut selon le rôle (utilisées si le poste
// ne définit rien et qu'aucun module n'est assigné manuellement)
const ERP_ROLE_DEFAULT_PERMISSIONS = {
  pdg:               { all: true },
  directrice:        { all: true },
  directeur:         { all: true },
  manager:           { clients: true, stock: true, catalogue: true, finances: true, caisse: true, taches: true, rapports: true, rh: true, employes: true, messages: true, parametres: true, users: true },
  secretaire:        { clients: true, taches: true, rapports: true, messages: true, agenda: true },
  comptable:         { finances: true, caisse: true, factures: true, clients: true, rapports: true, messages: true },
  responsable_stock: { stock: true, catalogue: true, fournisseurs: true, rapports: true, messages: true },
  commercial:        { clients: true, stock_read: true, catalogue: true, ventes: true, taches: true, rapports: true, messages: true },
  rh:                { rh: true, employes: true, presences: true, conges: true, taches: true, rapports: true, messages: true },
  receptionniste:    { patients: true, clients: true, rdv: true, agenda: true, seances: true, taches: true, messages: true },
  chauffeur:         { taches_own: true, presences_own: true, messages: true },
  employe:           { taches_own: true, presences_own: true, messages: true }
};

// Comptes de direction: accès total à tous les modules, quel que soit le poste
const ERP_OWNER_EMAILS = ['haitirecareerp@gmail.com'];

function isErpOwner(user) {
  return user?.role === 'pdg' || ERP_OWNER_EMAILS.includes(String(user?.email || '').toLowerCase());
}

// Calcule les permissions effectives: rôle + poste + modules assignés
async function getEffectivePermissions(user) {
  if (isErpOwner(user)) return { all: true };

  const perms = { ...(ERP_ROLE_DEFAULT_PERMISSIONS[user?.role] || {}) };

  const postePerms = user?.erp_postes?.permissions;
  if (postePerms && typeof postePerms === 'object') {
    Object.assign(perms, postePerms);
  }

  try {
    if (user?.id) {
      const { data } = await db
        .from('erp_user_modules')
        .select('module_code, permissions, is_enabled')
        .eq('user_id', user.id);
      (data || []).forEach(m => {
        if (m.is_enabled === false) return;
        perms[m.module_code] = m.permissions || true;
      });
    }
  } catch (e) {
    console.warn('erp_user_modules:', e);
  }

  return perms;
}

// Récupère le contexte entreprise: type, secteur, modules activés
async function getEnterpriseContext(user) {
  const ctx = { settings: null, enterprise: null, type: null, modules: [...ERP_CORE_MODULES] };

  try {
    const { data } = await db.from('erp_settings').select('*').maybeSingle();
    ctx.settings = data;
  } catch (e) {
    console.warn('erp_settings:', e);
  }

  try {
    if (user?.id) {
      const { data } = await db
        .from('erp_user_enterprises')
        .select('*, erp_enterprise_registrations(*, erp_enterprise_types(*))')
        .eq('user_id', user.id)
        .eq('is_primary', true)
        .maybeSingle();
      if (data?.erp_enterprise_registrations) {
        ctx.enterprise = data.erp_enterprise_registrations;
        ctx.type = ctx.enterprise.erp_enterprise_types;
      }
    }
  } catch (e) {
    console.warn('erp_user_enterprises:', e);
  }

  // Fallback: entreprise trouvée par email (ex. le PDG qui s'est inscrit)
  if (!ctx.enterprise && user?.email) {
    try {
      const { data } = await db
        .from('erp_enterprise_registrations')
        .select('*, erp_enterprise_types(*)')
        .eq('company_email', user.email)
        .maybeSingle();
      if (data) {
        ctx.enterprise = data;
        ctx.type = data.erp_enterprise_types;
      }
    } catch (e) {
      console.warn('enterprise fallback:', e);
    }
  }

  const typeModules = ctx.type?.features?.modules;
  if (Array.isArray(typeModules)) ctx.modules.push(...typeModules);

  const unlocked = ctx.enterprise?.features_unlocked || ctx.settings?.features_enabled;
  if (unlocked && typeof unlocked === 'object') {
    if (unlocked.all) {
      ctx.unlockedAll = true;
      ctx.modules.push(...Object.keys(ERP_MODULE_REGISTRY));
    } else {
      Object.keys(unlocked)
        .filter(k => k !== 'all' && unlocked[k])
        .forEach(k => ctx.modules.push(k));
    }
  }

  ctx.modules = [...new Set(ctx.modules)];

  // Sant klinik (physiotherapy/hospital): "clients" = pasyan yo —
  // retire modil Clients la pou evite doublòn ak modil Patients.
  if (['physiotherapy', 'hospital'].includes(ctx.type?.code)) {
    ctx.modules = ctx.modules.filter(m => m !== 'clients');
  }
  return ctx;
}

// Vrai si antrepriz la se yon sant klinik (pasyan olye de kliyan)
function isClinicalEnterprise() {
  const c = window.enterpriseContext?.type?.code;
  return c === 'physiotherapy' || c === 'hospital';
}

// Vrai si l'utilisateur courant peut accéder au module.
// Seuls la direction (PDG / perms.all) voit tout; les autres ne voient
// que les modules liés à leur rôle, leur poste ou assignés manuellement.
function hasModuleAccess(code) {
  if (isErpOwner(window.currentUser)) return true;
  const perms = window.currentUser?.effective_permissions || {};
  if (perms.all) return true;

  const keys = ERP_MODULE_PERMISSIONS[code] || [code];
  return keys.some(k => perms[k]);
}

// Vrai si le module est activé pour l'entreprise ET accessible à l'utilisateur
function canUseModule(code) {
  const enabled = window.enterpriseContext?.modules || ERP_CORE_MODULES;
  if (!isErpOwner(window.currentUser) && !enabled.includes(code)) return false;
  return hasModuleAccess(code);
}

// Métadonnées de navigation d'un module — même si le module n'a
// pas de fichier dédié, sa page est générée par module.html
function getModuleNavItem(code) {
  const meta = ERP_MODULE_REGISTRY[code];
  return {
    code,
    label: meta?.label || code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    icon: meta?.icon || 'layout-grid',
    page: meta?.page || `/module.html?m=${encodeURIComponent(code)}`,
    section: meta?.section || 'Modules'
  };
}

// Liste des modules visibles dans la navigation pour l'utilisateur courant
function getVisibleNavModules() {
  const ctx = window.enterpriseContext || { modules: ERP_CORE_MODULES };
  const perms = window.currentUser?.effective_permissions || {};
  const isFullAccess = Boolean(perms.all || isErpOwner(window.currentUser));

  const candidates = isFullAccess
    ? [...Object.keys(ERP_MODULE_REGISTRY), ...(ctx.modules || [])]
    : [...(ctx.modules || []), 'parametres', 'users'];

  const seen = new Set(['dashboard']);
  const clinical = isClinicalEnterprise();
  const items = [];
  candidates.forEach(code => {
    // Klinik: modil "clients" kache — modil "patients" ranplase l
    if (clinical && code === 'clients') return;
    if (seen.has(code) || !hasModuleAccess(code)) return;
    seen.add(code);
    items.push(getModuleNavItem(code));
  });
  return items;
}

// Mapping dossier URL -> code module (pour le contrôle d'accès des pages)
const ERP_PATH_MODULE = {
  clients: 'clients', stock: 'stock', finances: 'finances', rh: 'rh',
  taches: 'taches', rapports: 'rapports', communication: 'messages',
  parametres: 'parametres', users: 'users', siteweb: 'siteweb'
};

// Check if current page is allowed for the current user
function checkPagePermission() {
  const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');

  // Anciens dashboards par rôle -> tableau de bord dynamique unifié
  if (/\/dashboard\/[^/]+\/[^/]+\.html$/.test(path) && !path.includes('/modules/')) {
    window.location.replace('/dashboard.html');
    return false;
  }

  // Sant klinik: paj "clients" yo -> modil patients (menm bagay)
  if (isClinicalEnterprise()) {
    if (/\/modules\/clients\//i.test(path)) {
      window.location.replace('/module.html?m=patients');
      return false;
    }
    if (/\/module\.html/.test(path)
        && new URLSearchParams(window.location.search).get('m') === 'clients') {
      window.location.replace('/module.html?m=patients');
      return false;
    }
  }

  // Pages de modules: /modules/<dossier>/<page>.html
  const modMatch = path.match(/\/modules\/([a-z-]+)\//i);
  if (modMatch) {
    // Chacun peut ouvrir sa propre fiche profil (sans ?id ou id=soi-même)
    const profileId = new URLSearchParams(window.location.search).get('id');
    const isOwnProfile = /\/modules\/users\/profil\.html/.test(path)
      && (!profileId || profileId === window.currentUser?.id);
    const code = ERP_PATH_MODULE[modMatch[1].toLowerCase()] || modMatch[1].toLowerCase();
    if (!isOwnProfile && !hasModuleAccess(code)) {
      window.location.href = '/dashboard.html';
      return false;
    }
  }

  // Page générée dynamiquement: /module.html?m=<code>
  if (/\/module\.html/.test(path)) {
    const m = new URLSearchParams(window.location.search).get('m');
    if (m && !hasModuleAccess(m)) {
      window.location.href = '/dashboard.html';
      return false;
    }
  }

  return true;
}

// Service Worker Registration for PWA / Offline Mode
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
    }).catch(err => {
      console.warn('[PWA] ServiceWorker registration failed:', err);
    });
  });
}

// Get current page name
function getCurrentPage() {
  const path = window.location.pathname;
  return path.split('/').pop() || 'index.html';
}

// Initialize app - check session and load user data
// Memoisee: plusieurs scripts peuvent l'appeler, elle ne s'execute qu'une fois
let _initAppPromise = null;
function initApp() {
  if (!_initAppPromise) _initAppPromise = _initAppOnce();
  return _initAppPromise;
}

async function _initAppOnce() {
  try {
    console.log('initApp called, checking session...');
    
    let user = null;
    let session = null;

    try {
      const res = await db.auth.getSession();
      session = res.data?.session;
    } catch (e) {
      console.warn('Supabase getSession network warning (offline):', e);
    }

    if (!session) {
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        user = JSON.parse(storedUser);
        console.log('Using offline cached user:', user);
      } else if (getCurrentPage() !== 'index.html') {
        window.location.href = '/index.html';
        return;
      }
    } else {
      try {
        const { data: userData, error: userError } = await db
          .from('erp_users')
          .select('*, erp_postes(*)')
          .eq('id', session.user.id)
          .single();
        
        if (userData && !userError) {
          user = userData;
          localStorage.setItem('currentUser', JSON.stringify(user));
          localStorage.setItem('currentSession', JSON.stringify(session));
        } else {
          const storedUser = localStorage.getItem('currentUser');
          if (storedUser) user = JSON.parse(storedUser);
        }
      } catch (err) {
        console.warn('User profile fetch error (offline fallback):', err);
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) user = JSON.parse(storedUser);
      }
      window.currentSession = session;
    }

    if (!user) {
      if (getCurrentPage() !== 'index.html') {
        window.location.href = '/index.html';
      }
      return;
    }

    window.currentUser = user;

    // Permissions effectives + contexte entreprise (modules activés)
    user.effective_permissions = await getEffectivePermissions(user);
    window.enterpriseContext = await getEnterpriseContext(user);

    console.log('User loaded:', user, 'Role:', user.role);

    // Check page permission
    if (!checkPagePermission()) return;

    // Update last login (if online)
    if (navigator.onLine && user?.id) {
      try {
        await db.from('erp_users').update({ last_login: new Date() }).eq('id', user.id);
      } catch (e) { /* ignore offline */ }
    }
    
    // Render sidebar if on dashboard
    if (typeof renderSidebar === 'function') {
      renderSidebar(user);
    }
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    return user;
    
  } catch (error) {
    console.error('Init error:', error);
    window.location.href = '/index.html';
  }
}

// Login function
async function login(email, password) {
  try {
    // First authenticate with Supabase
    const { data: authData, error: authError } = await db.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (authError) {
      return { success: false, error: authError.message };
    }
    
    if (!authData.user) {
      return { success: false, error: 'Authentication failed' };
    }
    
    // Get user profile from erp_users
    let { data: user, error: userError } = await db
      .from('erp_users')
      .select('*, erp_postes(*)')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (userError) {
      return { success: false, error: 'Erreur lors de la récupération du profil' };
    }

    // Itilizatè ki egziste nan Auth men san pwofil ERP (ex. anplwaye kreye
    // anvan fix la) → repare pwofil la otomatikman epi reload l.
    if (!user) {
      await db.rpc('erp_claim_my_profile');
      const retry = await db
        .from('erp_users')
        .select('*, erp_postes(*)')
        .eq('id', authData.user.id)
        .maybeSingle();
      user = retry.data;
    }

    if (!user) {
      return { success: false, error: 'Profil utilisateur non trouvé' };
    }
    
    if (!user.is_active) {
      return { success: false, error: 'Compte désactivé' };
    }
    
    // Store user globally
    window.currentUser = user;
    window.currentSession = authData.session;
    
    // All staff members land on the dynamic modular dashboard
    return { success: true, redirectUrl: 'dashboard.html' };
    
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Erreur de connexion' };
  }
}

// Logout function
async function logout() {
  try {
    await db.auth.signOut();
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentSession');
    window.location.href = '/index.html';
  } catch (error) {
    console.error('Logout error:', error);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentSession');
    window.location.href = '/index.html';
  }
}

// Log activity
async function logActivity(action, module, details) {
  try {
    if (!window.currentUser) return;
    
    await db.from('erp_activites').insert({
      user_id: window.currentUser.id,
      action: action,
      module: module,
      details: details
    });
  } catch (error) {
    console.error('Activity log error:', error);
  }
}

// Format role for display
function formatRole(role) {
  const roleNames = {
    'pdg': 'PDG',
    'directrice': 'Directrice',
    'directeur': 'Directeur',
    'manager': 'Manager',
    'secretaire': 'Secrétaire',
    'comptable': 'Comptable',
    'responsable_stock': 'Responsable Stock',
    'commercial': 'Commercial',
    'rh': 'RH',
    'receptionniste': 'Réceptionniste',
    'chauffeur': 'Chauffeur',
    'employe': 'Employé'
  };
  return roleNames[role] || role;
}

// Check if user has specific permission (rôle + poste + modules assignés)
function hasPermission(permission) {
  if (!window.currentUser) return false;

  const permissions = window.currentUser.effective_permissions
    || window.currentUser.erp_postes?.permissions
    || {};

  if (isErpOwner(window.currentUser) || permissions.all) return true;

  return Boolean(permissions[permission]);
}

// Auto-initialize on page load (if not on login page)
if (getCurrentPage() !== 'index.html') {
  document.addEventListener('DOMContentLoaded', initApp);
}
