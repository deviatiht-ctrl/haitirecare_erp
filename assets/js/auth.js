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
  catalogue:    { label: 'Catalogue',            icon: 'shopping-bag',     page: '/modules/stock/inventaire.html',       section: 'Gestion' },
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
  materiel_orthopedique: { label: 'Matériel Orthopédique', icon: 'package-plus', page: '/modules/stock/inventaire.html',   section: 'Gestion' }
};

// Modules toujours présents pour toute entreprise
const ERP_CORE_MODULES = ['dashboard', 'clients', 'taches', 'messages', 'rapports'];

// Clés de permission qui débloquent chaque module
const ERP_MODULE_PERMISSIONS = {
  clients:      ['clients'],
  stock:        ['stock', 'stock_read', 'catalogue'],
  catalogue:    ['catalogue', 'stock', 'stock_read'],
  finances:     ['finances', 'factures', 'facturation'],
  caisse:       ['caisse', 'finances'],
  ventes:       ['ventes', 'clients'],
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
  materiel_orthopedique: ['materiel_orthopedique', 'stock', 'catalogue']
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
  employe:           { taches_own: true, presences_own: true, messages: true }
};

// Permissions "larges" — un utilisateur qui n'a QUE des permissions
// *_own / communication ne doit pas voir les modules métier de l'entreprise
const ERP_NARROW_PERMISSIONS = ['messages', 'agenda', 'taches_own', 'presences_own'];

// Calcule les permissions effectives: rôle + poste + modules assignés
async function getEffectivePermissions(user) {
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
    Object.keys(unlocked)
      .filter(k => k !== 'all' && unlocked[k])
      .forEach(k => ctx.modules.push(k));
  }

  ctx.modules = [...new Set(ctx.modules)];
  return ctx;
}

// Vrai si l'utilisateur courant peut accéder au module
function hasModuleAccess(code) {
  const perms = window.currentUser?.effective_permissions || {};
  if (perms.all) return true;

  const keys = ERP_MODULE_PERMISSIONS[code] || [code];
  if (keys.some(k => perms[k])) return true;

  // Module activé pour l'entreprise: visible sauf profil "restreint"
  const entModules = window.enterpriseContext?.modules || [];
  if (entModules.includes(code)) {
    const hasBroadPerm = Object.keys(perms).some(k => perms[k] && !ERP_NARROW_PERMISSIONS.includes(k));
    if (hasBroadPerm) return true;
  }

  return false;
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
  const candidates = [...(ctx.modules || []), 'parametres', 'users'];
  const seen = new Set(['dashboard']);
  const items = [];
  candidates.forEach(code => {
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
  parametres: 'parametres', users: 'users'
};

// Check if current page is allowed for the current user
function checkPagePermission() {
  const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');

  // Anciens dashboards par rôle -> tableau de bord dynamique unifié
  if (/\/dashboard\/[^/]+\/[^/]+\.html$/.test(path) && !path.includes('/modules/')) {
    window.location.replace('/dashboard.html');
    return false;
  }

  // Pages de modules: /modules/<dossier>/<page>.html
  const modMatch = path.match(/\/modules\/([a-z-]+)\//i);
  if (modMatch) {
    const code = ERP_PATH_MODULE[modMatch[1].toLowerCase()] || modMatch[1].toLowerCase();
    if (!hasModuleAccess(code)) {
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
    
    // Check if user is authenticated with Supabase (admin/PDG)
    const { data: { session }, error: sessionError } = await db.auth.getSession();
    
    console.log('Supabase session:', session, 'Error:', sessionError);
    
    let user;
    
    if (sessionError || !session) {
      // Check if non-admin user is stored in localStorage
      console.log('No Supabase session, checking localStorage');
      const storedUser = localStorage.getItem('currentUser');
      const storedSession = localStorage.getItem('currentSession');
      if (storedUser && storedSession) {
        user = JSON.parse(storedUser);
        console.log('Using localStorage user:', user);
      } else {
        console.log('No session and no localStorage user, redirecting to index');
        window.location.href = '/index.html';
        return;
      }
    } else {
      // Fetch user profile with role for Supabase users
      const { data: userData, error: userError } = await db
        .from('erp_users')
        .select('*, erp_postes(*)')
        .eq('id', session.user.id)
        .single();
      
      if (userError || !userData) {
        console.error('User fetch error:', userError);
        await db.auth.signOut();
        window.location.href = '/index.html';
        return;
      }
      
      if (!userData.is_active) {
        await db.auth.signOut();
        window.location.href = '/index.html';
        return;
      }
      
      user = userData;
      window.currentSession = session;
    }

    window.currentUser = user;

    // Permissions effectives + contexte entreprise (modules activés)
    user.effective_permissions = await getEffectivePermissions(user);
    window.enterpriseContext = await getEnterpriseContext(user);

    console.log('User loaded:', user, 'Role:', user.role);

    // Check page permission
    if (!checkPagePermission()) return;

    // Update last login
    try {
      await db.from('erp_users').update({ last_login: new Date() }).eq('id', user.id);
    } catch (e) {
      console.warn('last_login update:', e);
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
    const { data: user, error: userError } = await db
      .from('erp_users')
      .select('*, erp_postes(*)')
      .eq('id', authData.user.id)
      .maybeSingle();
    
    if (userError) {
      return { success: false, error: 'Erreur lors de la récupération du profil' };
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
    
    // Check if user is solely a platform admin without enterprise
    try {
      const { data: enterpriseId } = await db.rpc('erp_get_user_enterprise');
      
      // If user has no enterprise but is CVisual admin, route to platform admin console
      if (!enterpriseId) {
        const { data: isAdmin } = await db.rpc('erp_is_cvisual_admin');
        if (isAdmin) {
          return { success: true, redirectUrl: 'cvisual-admin.html' };
        }
      }
    } catch (e) {
      console.warn('Enterprise check warning:', e);
    }
    
    // All enterprises use the dynamic modular dashboard (dashboard.html)
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

  if (window.currentUser.role === 'pdg' || permissions.all) return true;

  return Boolean(permissions[permission]);
}

// Auto-initialize on page load (if not on login page)
if (getCurrentPage() !== 'index.html') {
  document.addEventListener('DOMContentLoaded', initApp);
}
