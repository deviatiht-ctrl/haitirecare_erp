// ==============================================================
// Modular Dashboard System
// Genere 100% du tableau de bord dynamiquement:
//   - modules actives: erp_enterprise_types.features.modules
//   - metadonnees:     erp_modules / ERP_MODULE_REGISTRY
//   - permissions:     role + poste + erp_user_modules
// Les modules sans page dediee sont crees a la volee via
// /module.html?m=<code> — aucun fichier statique n'est requis.
// ==============================================================

// Terminologie adaptee au type d'entreprise
const ERP_TERMS = {
  hospital:      { clients: 'Patients', client: 'Patient', produits: 'Articles médicaux', produit: 'Article médical', stock: 'Pharmacie & Matériel', users: 'Personnel médical' },
  physiotherapy: { clients: 'Patients', client: 'Patient', produits: 'Services & Matériel', produit: 'Article', stock: 'Matériel Orthopédique', users: 'Équipe soignante' },
  education:     { clients: 'Élèves', client: 'Élève', produits: 'Fournitures & Matériel', users: 'Enseignants & Staff' },
  boutique:      { produits: 'Produits', produit: 'Produit' },
  restaurant:    { produits: 'Plats & Menu', produit: 'Plat' },
  construction:  { produits: 'Matériel & Fournitures', clients: 'Clients & Chantiers' },
  logistics:     { clients: 'Clients & Destinataires', produits: 'Colis & Matériel' },
  manufacturing: { produits: 'Production & Matériel' },
  services:      { produits: 'Services & Packs', produit: 'Service' }
};

function erpTerm(key, fallback) {
  const typeCode = window.enterpriseContext?.type?.code;
  return ERP_TERMS[typeCode]?.[key] || fallback;
}

async function initModularDashboard() {
  try {
    if (typeof db === 'undefined') {
      console.error('Supabase client not initialized');
      return;
    }

    // 1. Session / utilisateur
    const { data: { session } } = await db.auth.getSession();

    let currentUser = window.currentUser || null;

    if (!currentUser && session?.user) {
      const { data: userProfile } = await db
        .from('erp_users')
        .select('*, erp_postes(*)')
        .eq('id', session.user.id)
        .maybeSingle();
      currentUser = userProfile || session.user;
    }

    if (!currentUser) {
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        currentUser = JSON.parse(storedUser);
      } else {
        window.location.href = 'index.html';
        return;
      }
    }

    window.currentUser = currentUser;

    // 2. Permissions effectives + contexte entreprise (modules actives)
    if (!currentUser.effective_permissions && typeof getEffectivePermissions === 'function') {
      currentUser.effective_permissions = await getEffectivePermissions(currentUser);
    }
    if (!window.enterpriseContext && typeof getEnterpriseContext === 'function') {
      window.enterpriseContext = await getEnterpriseContext(currentUser);
    }
    const ctx = window.enterpriseContext || { modules: ['clients', 'taches', 'messages', 'rapports'] };

    // 3. Metadonnees affichage
    const enterprise = ctx.enterprise;
    const settings = ctx.settings;
    const companyName = enterprise?.company_name || settings?.company_name || 'Mon Entreprise';
    const sectorName = enterprise?.secteur || settings?.sector || '';
    const typeCode = ctx.type?.code || 'default';
    const typeLabel = ctx.type?.name || 'Entreprise';
    const typeIcon = ctx.type?.icon || 'building';
    const firstName = currentUser?.first_name || 'Utilisateur';
    const lastName = currentUser?.last_name || '';
    const userRole = (currentUser?.role || 'employe').toUpperCase();
    const currency = settings?.default_currency || 'HTG';

    // 5. Donnees reelles (chargees seulement si les modules sont actives)
    const enabled = ctx.modules || [];
    const has = (c) => enabled.includes(c);

    let clients = [];
    let produits = [];
    let usersCount = 1;
    let tachesCount = 0;

    if (has('clients') || has('patients') || has('etudiants') || has('ventes')) {
      try {
        // Centres de soins: la liste vient des dossiers patients
        const clientTable = (typeCode === 'physiotherapy' || typeCode === 'hospital')
          ? 'erp_patients' : 'erp_clients';
        const { data } = await db.from(clientTable).select('*').order('created_at', { ascending: false }).limit(6);
        if (data) clients = data;
      } catch (e) { console.warn('Clients:', e); }
    }

    if (has('stock') || has('catalogue') || has('pharmacie') || has('menu') || has('materiel')) {
      try {
        const { data } = await db.from('erp_produits').select('*').order('created_at', { ascending: false }).limit(6);
        if (data) produits = data;
      } catch (e) { console.warn('Produits:', e); }
    }

    try {
      const { count } = await db.from('erp_users').select('id', { count: 'exact', head: true });
      if (count) usersCount = count;
    } catch (e) { console.warn('Users count:', e); }

    if (has('taches') || has('projets')) {
      try {
        const { count } = await db.from('erp_taches').select('id', { count: 'exact', head: true }).neq('statut', 'termine');
        tachesCount = count || 0;
      } catch (e) { console.warn('Taches:', e); }
    }

    // 6. Rendu dynamique
    renderDynamicHeader({ companyName, sectorName, typeLabel, typeIcon, firstName, userRole });
    renderDynamicStats({ clientsCount: clients.length, produitsCount: produits.length, usersCount, tachesCount, currency, modules: enabled });
    renderDynamicSidebar({ companyName, typeLabel, firstName, lastName, userRole });
    renderDynamicQuickActions();
    renderDynamicContent({ produits, clients, modules: enabled, currency });

    if (typeof lucide !== 'undefined') lucide.createIcons();
    setupDashboardMobileNav();
    hideDashboardLoader();

  } catch (error) {
    console.error('Erreur chargement dashboard modulaire:', error);
    hideDashboardLoader();
  }
}

// Retire le loader plein ecran une fois le rendu termine
function hideDashboardLoader() {
  const loader = document.getElementById('erp-loader');
  if (loader) loader.classList.add('done');
}

// Sidebar mobile: bouton flottant + overlay + fermeture au clic lien
function setupDashboardMobileNav() {
  const sidebar = document.querySelector('.dashboard-sidebar') || document.getElementById('dynamic-sidebar');
  const overlay = document.getElementById('dash-overlay');
  const btn = document.getElementById('dash-menu-btn');
  if (!sidebar || !overlay || !btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';

  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  };

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });
  overlay.addEventListener('click', close);

  // Ferme le menu apres un clic sur un lien de navigation (mobile)
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a') && window.innerWidth <= 1024) close();
  });
}

// --------------------------------------------------------------
// Header
// --------------------------------------------------------------
function renderDynamicHeader({ companyName, sectorName, typeLabel, typeIcon, firstName }) {
  const headerContainer = document.getElementById('dynamic-header');
  if (!headerContainer) return;

  headerContainer.innerHTML = `
    <div>
      <div class="dash-title-row">
        <button class="mobile-menu-btn" id="dash-menu-btn" title="Menu" style="margin-right: 8px;">
          <i data-lucide="menu"></i>
        </button>
        <h1>Bienvenue, ${firstName}</h1>
        <span class="dash-type-badge">
          <i data-lucide="${typeIcon}"></i>
          ${typeLabel}
        </span>
      </div>
      <p class="dash-subtitle">
        <strong>${companyName}</strong>${sectorName ? ' • ' + sectorName : ''}
      </p>
    </div>
    <div class="header-actions">
      <button class="header-btn header-btn-ghost theme-toggle" onclick="toggleTheme()" title="Basculer mode clair / sombre">
        <i data-lucide="moon" class="theme-icon-moon"></i>
        <i data-lucide="sun" class="theme-icon-sun"></i>
      </button>
      <button onclick="window.location.reload()" class="header-btn header-btn-ghost">
        <i data-lucide="refresh-cw"></i>
        Actualiser
      </button>
    </div>
  `;
}

// --------------------------------------------------------------
// Cartes KPI — generees selon les modules actives
// --------------------------------------------------------------
function renderDynamicStats({ clientsCount, produitsCount, usersCount, tachesCount, currency, modules }) {
  const statsContainer = document.getElementById('dynamic-stats');
  if (!statsContainer) return;

  const cards = [];
  const has = (c) => modules.includes(c);

  if (has('stock') || has('catalogue') || has('pharmacie') || has('menu') || has('materiel') || has('production')) {
    cards.push({
      icon: 'package', color: '#3b82f6',
      value: produitsCount,
      label: erpTerm('produits', 'Produits & Services'),
      badge: 'Catalogue'
    });
  }

  if (has('clients') || has('patients') || has('etudiants') || has('ventes') || has('commandes')) {
    cards.push({
      icon: has('patients') ? 'heart-pulse' : 'users', color: '#10b981',
      value: clientsCount,
      label: `${erpTerm('clients', 'Clients')} Enregistrés`,
      badge: 'Portefeuille'
    });
  }

  if (has('taches') || has('projets') || has('chantiers')) {
    cards.push({
      icon: 'check-square', color: '#f59e0b',
      value: tachesCount,
      label: 'Tâches & Projets en cours',
      badge: 'Activité'
    });
  }

  if (has('finances') || has('caisse') || has('facturation') || has('facturation_medical')) {
    cards.push({
      icon: 'dollar-sign', color: '#22c55e',
      value: 'Actif',
      label: 'Finances & Facturation',
      badge: `Devise: ${currency}`
    });
  }

  cards.push({
    icon: 'user-check', color: '#8b5cf6',
    value: usersCount,
    label: `${erpTerm('users', 'Collaborateurs')} & Rôles`,
    badge: 'Équipe'
  });

  statsContainer.innerHTML = cards.map(c => `
    <div class="stat-card" style="--accent: ${c.color}">
      <div class="stat-top">
        <div class="stat-icon">
          <i data-lucide="${c.icon}"></i>
        </div>
        <span class="stat-badge">${c.badge}</span>
      </div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');
}

// --------------------------------------------------------------
// Sidebar — 100% dynamique depuis les modules de l'entreprise
// --------------------------------------------------------------
function renderDynamicSidebar({ companyName, typeLabel, firstName, lastName, userRole }) {
  const sidebarContainer = document.getElementById('dynamic-sidebar');
  if (!sidebarContainer) return;

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';

  // Navigation dynamique: modules tries par section
  // Les sections non listees sont inserees avant 'Administration'
  const SECTION_ORDER = ['Principal', 'Clinique', 'Gestion', 'Site Web', 'RH', 'Communication', 'Rapports', 'Modules', 'Administration'];
  const items = typeof getVisibleNavModules === 'function' ? getVisibleNavModules() : [];

  const grouped = {};
  items.forEach(item => {
    if (!grouped[item.section]) grouped[item.section] = [];
    grouped[item.section].push(item);
  });

  let navHtml = `
    <div class="dash-nav-section">Principal</div>
    <a href="dashboard.html" class="dash-nav-item active">
      <i data-lucide="layout-dashboard"></i>
      Tableau de bord
    </a>
  `;

  const orderedSections = SECTION_ORDER.filter(s => s !== 'Principal' && grouped[s]);
  const extraSections = Object.keys(grouped).filter(s => !SECTION_ORDER.includes(s));
  const adminIdx = orderedSections.indexOf('Administration');
  const allSections = adminIdx === -1
    ? [...orderedSections, ...extraSections]
    : [...orderedSections.slice(0, adminIdx), ...extraSections, ...orderedSections.slice(adminIdx)];

  allSections.forEach(section => {
    navHtml += `<div class="dash-nav-section">${section === 'Modules' ? 'Modules métier' : section}</div>`;
    grouped[section].forEach(item => {
      const href = item.page.startsWith('/') ? item.page.slice(1) : item.page;
      navHtml += `
        <a href="${href}" class="dash-nav-item">
          <i data-lucide="${item.icon}"></i>
          ${item.label}
        </a>
      `;
    });
  });

  const logoUrl = window.enterpriseContext?.settings?.logo_url || '/assets/img/logohaitirecare.png';
  sidebarContainer.innerHTML = `
    <div class="dash-brand">
      <div class="dash-brand-logo" style="background: transparent; padding: 0; overflow: hidden; width: auto; height: 38px; box-shadow: none;">
        <img src="${logoUrl}" alt="${companyName}" style="height: 38px; width: auto; max-width: 140px; object-fit: contain; border-radius: 8px;">
      </div>
      <div style="overflow: hidden; min-width: 0;">
        <h2 class="dash-brand-name">${companyName}</h2>
        <span class="dash-brand-type">${typeLabel}</span>
      </div>
    </div>

    <nav class="dash-nav">
      ${navHtml}
    </nav>

    <div class="dash-sidebar-footer">
      <div class="dash-user-chip">
        <div class="dash-user-avatar">
          ${initials}
        </div>
        <div style="flex: 1; overflow: hidden; min-width: 0;">
          <div class="dash-user-name">${firstName} ${lastName}</div>
          <div class="dash-user-role">${userRole}</div>
        </div>
      </div>

      <button onclick="handleLogout()" class="dash-logout">
        <i data-lucide="log-out"></i>
        Déconnexion
      </button>
    </div>
  `;
}

// --------------------------------------------------------------
// Quick Actions — derivees des modules actives
// --------------------------------------------------------------
const ERP_QUICK_ACTIONS = {
  clients:    { label: 'Ajouter Client',   desc: 'Enregistrer un nouveau client',        color: '#3b82f6' },
  patients:   { label: 'Nouveau Patient',  desc: 'Créer un dossier patient',             color: '#10b981' },
  stock:      { label: 'Inventaire',       desc: 'Gérer le stock et les articles',       color: '#10b981' },
  catalogue:  { label: 'Catalogue',        desc: 'Gérer les offres et produits',         color: '#10b981' },
  ventes:     { label: 'Nouvelle Vente',   desc: 'Enregistrer une vente',                color: '#f59e0b' },
  caisse:     { label: 'Caisse',           desc: 'Ouvrir la caisse du jour',             color: '#22c55e' },
  taches:     { label: 'Nouvelle Tâche',   desc: 'Créer une tâche ou un projet',         color: '#f59e0b' },
  rdv:        { label: 'Rendez-vous',      desc: 'Planifier une consultation',           color: '#ec4899' },
  seances:    { label: 'Nouvelle Séance',  desc: 'Enregistrer une séance de soin',       color: '#0ea5e9' },
  services:   { label: 'Services',         desc: 'Catalogue des soins et tarifs',        color: '#14b8a6' },
  protheses:  { label: 'Prothèses',        desc: 'Suivi des prothèses en cours',         color: '#f97316' },
  ortheses:   { label: 'Orthèses',         desc: 'Suivi des orthèses en cours',          color: '#8b5cf6' },
  commandes:  { label: 'Commande',         desc: 'Prendre une nouvelle commande',        color: '#f59e0b' },
  users:      { label: 'Équipe & Accès',   desc: 'Gérer les collaborateurs',             color: '#8b5cf6' },
  parametres: { label: 'Paramètres',       desc: 'Configurer votre entreprise',          color: '#64748b' },
  siteweb:    { label: 'Site Web',         desc: 'RDV en ligne, annonces & messages',    color: '#2563eb' },
  annonces:   { label: 'Annonces',         desc: 'Modérer achat/vente de matériel',      color: '#0d9488' }
};

function renderDynamicQuickActions() {
  const actionsContainer = document.getElementById('dynamic-quick-actions');
  if (!actionsContainer) return;

  const items = (typeof getVisibleNavModules === 'function' ? getVisibleNavModules() : [])
    .filter(i => ERP_QUICK_ACTIONS[i.code])
    .slice(0, 4);

  const fallback = getModuleNavItem('parametres');
  const list = items.length ? items : [fallback];

  actionsContainer.innerHTML = list.map(item => {
    const qa = ERP_QUICK_ACTIONS[item.code];
    const href = item.page.startsWith('/') ? item.page.slice(1) : item.page;
    return `
      <div onclick="window.location.href='${href}'" class="quick-action-card" style="--accent: ${qa.color}">
        <div class="quick-action-icon">
          <i data-lucide="${item.icon}"></i>
        </div>
        <div class="quick-action-title">${qa.label}</div>
        <div class="quick-action-desc">${qa.desc}</div>
      </div>
    `;
  }).join('');
}

// --------------------------------------------------------------
// Contenu principal — sections selon les modules actives
// --------------------------------------------------------------
function renderDynamicContent({ produits, clients, modules, currency }) {
  const contentContainer = document.getElementById('dynamic-content');
  if (!contentContainer) return;

  const has = (c) => modules.includes(c);
  const money = (v) => `${v || 0} ${currency}`;

  const produitsHtml = produits.length > 0 ? produits.map(p => `
    <tr>
      <td class="td-accent">${p.code || '-'}</td>
      <td class="td-strong">${p.designation}</td>
      <td class="td-muted">${p.categorie || '-'}</td>
      <td class="td-success">${money(p.prix_vente)}</td>
      <td>
        <span class="dash-badge dash-badge-success">Disponible</span>
      </td>
    </tr>
  `).join('') : `
    <tr><td colspan="5" class="dash-empty">Aucun élément enregistré pour le moment.</td></tr>
  `;

  const clientsHtml = clients.length > 0 ? clients.map(c => `
    <div class="dash-list-row">
      <div class="dash-list-left">
        <div class="dash-avatar">
          ${(c.nom || 'C')[0].toUpperCase()}
        </div>
        <div>
          <div class="dash-row-title">${c.nom} ${c.prenom || ''}</div>
          <div class="dash-row-sub">${c.company || c.email || '-'}</div>
        </div>
      </div>
      <span class="dash-badge dash-badge-primary">
        ${c.type || 'Client'}
      </span>
    </div>
  `).join('') : `
    <div class="dash-empty">Aucun enregistrement.</div>
  `;

  let html = '';

  if (has('stock') || has('catalogue') || has('pharmacie') || has('menu') || has('materiel')) {
    html += `
      <div class="section-card">
        <div class="section-header">
          <h2 class="section-title">${erpTerm('produits', 'Catalogue')}</h2>
          <a href="modules/stock/inventaire.html" class="section-link">Gérer tout &rarr;</a>
        </div>
        <div style="overflow-x: auto;">
          <table class="dash-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Désignation</th>
                <th>Catégorie</th>
                <th>Tarif</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>${produitsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (has('clients') || has('patients') || has('etudiants') || has('ventes')) {
    html += `
      <div class="section-card">
        <div class="section-header">
          <h2 class="section-title">${erpTerm('clients', 'Clients')} Récents</h2>
          <a href="modules/clients/liste.html" class="section-link">Voir tout &rarr;</a>
        </div>
        <div>${clientsHtml}</div>
      </div>
    `;
  }

  // Si aucune des sections standard n'est active, afficher la grille des modules
  if (!html) {
    const items = typeof getVisibleNavModules === 'function' ? getVisibleNavModules() : [];
    html = `
      <div class="section-card full">
        <div class="section-header">
          <h2 class="section-title">Vos Modules</h2>
        </div>
        <div class="module-grid">
          ${items.map(item => {
            const href = item.page.startsWith('/') ? item.page.slice(1) : item.page;
            return `
              <a href="${href}" class="module-tile">
                <i data-lucide="${item.icon}"></i>
                ${item.label}
              </a>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  contentContainer.innerHTML = html;
}

// Fonction de déconnexion
async function handleLogout() {
  if (typeof logout === 'function') {
    await logout();
  } else if (typeof db !== 'undefined') {
    await db.auth.signOut();
    const theme = localStorage.getItem('erp-theme');
    localStorage.clear();
    if (theme) localStorage.setItem('erp-theme', theme);
    window.location.href = 'index.html';
  }
}

// Auto-exécution lors du chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  initModularDashboard();
});
