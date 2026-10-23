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

    // Kontèks multi-annexes: patch db.from + rezoud vi aktif la
    // (branch.js chaje dinamikman via auth.js — switcher monte apre header la)
    try {
      if (typeof loadBranchSupport === 'function') await loadBranchSupport();
      if (typeof initBranchContext === 'function') await initBranchContext(currentUser);
    } catch (e) {
      console.warn('[branch] init:', e);
    }

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
    const userRole = currentUser?.erp_postes?.name
      || (typeof formatRole === 'function' ? formatRole(currentUser?.role || 'employe') : (currentUser?.role || 'employe').toUpperCase());
    const currency = settings?.default_currency || 'HTG';

    // 5. Donnees reelles — chargees seulement pour les modules que
    //    l'utilisateur peut utiliser (le PDG voit tout, un medecin ou
    //    un employe ne voit que ce qui concerne son poste)
    const enabled = ctx.modules || [];
    const has = (c) => typeof canUseModule === 'function' ? canUseModule(c) : enabled.includes(c);
    const isClinical = typeCode === 'physiotherapy' || typeCode === 'hospital';
    const peopleModule = isClinical ? 'patients' : 'clients';

    let clients = [];
    let produits = [];
    let clientsCount = 0;
    let produitsCount = 0;
    let usersCount = 1;
    let tachesCount = 0;
    let rdvCount = 0;
    let caisseTotal = 0;

    if (has(peopleModule)) {
      try {
        let countQ = db.from(`erp_${peopleModule}`).select('id', { count: 'exact', head: true });
        let listQ = db.from(`erp_${peopleModule}`).select('*').order('created_at', { ascending: false }).limit(6);
        if (typeof applyBranchFilter === 'function') {
          countQ = applyBranchFilter(countQ);
          listQ = applyBranchFilter(listQ);
        }
        const [cRes, lRes] = await Promise.all([countQ, listQ]);
        if (cRes?.count !== null && cRes?.count !== undefined) clientsCount = cRes.count;
        if (lRes?.data) clients = lRes.data;
      } catch (e) { console.warn('Clients/Patients:', e); }
    }

    if (has('stock') || has('catalogue') || has('pharmacie') || has('materiel_orthopedique')) {
      try {
        let countQ = db.from('erp_produits').select('id', { count: 'exact', head: true }).eq('is_active', true);
        let listQ = db.from('erp_produits').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(6);
        if (typeof applyBranchFilter === 'function') {
          countQ = applyBranchFilter(countQ);
          listQ = applyBranchFilter(listQ);
        }
        const [cRes, lRes] = await Promise.all([countQ, listQ]);
        if (cRes?.count !== null && cRes?.count !== undefined) produitsCount = cRes.count;
        if (lRes?.data) produits = lRes.data;
      } catch (e) { console.warn('Produits:', e); }
    }

    if (has('users') || has('rh') || has('employes')) {
      try {
        const { count } = await db.from('erp_users').select('id', { count: 'exact', head: true }).eq('is_active', true);
        if (count) usersCount = count;
      } catch (e) { console.warn('Users count:', e); }
    }

    if (has('taches') || has('projets')) {
      try {
        let q = db.from('erp_taches').select('id', { count: 'exact', head: true }).neq('statut', 'termine');
        if (typeof applyBranchFilter === 'function') q = applyBranchFilter(q);
        const { count } = await q;
        tachesCount = count || 0;
      } catch (e) { console.warn('Taches:', e); }
    }

    if (has('rdv') || has('agenda')) {
      try {
        const today = new Date().toISOString().split('T')[0];
        let q = db.from('erp_rdv').select('id', { count: 'exact', head: true }).gte('date_rdv', today);
        if (typeof applyBranchFilter === 'function') q = applyBranchFilter(q);
        const { count } = await q;
        rdvCount = count || 0;
      } catch (e) { console.warn('RDV count:', e); }
    }

    if (has('finances') || has('caisse') || has('encaissements') || has('facturation')) {
      try {
        const monthStart = new Date().toISOString().slice(0, 8) + '01';
        let q = db.from('erp_encaissements').select('montant').gte('date_doc', monthStart);
        if (typeof applyBranchFilter === 'function') q = applyBranchFilter(q);
        const { data: encData } = await q;
        if (encData && encData.length) {
          caisseTotal = encData.reduce((s, x) => s + (parseFloat(x.montant) || 0), 0);
        } else {
          let qRev = db.from('erp_revenus').select('montant').gte('date_transaction', monthStart);
          if (typeof applyBranchFilter === 'function') qRev = applyBranchFilter(qRev);
          const { data: revData } = await qRev;
          if (revData && revData.length) {
            caisseTotal = revData.reduce((s, x) => s + (parseFloat(x.montant) || 0), 0);
          }
        }
      } catch (e) { console.warn('Finances total:', e); }
    }

    // 6. Rendu dynamique
    renderDynamicHeader({ companyName, sectorName, typeLabel, typeIcon, firstName, userRole });
    if (typeof renderBranchSwitcher === 'function') renderBranchSwitcher();
    renderDynamicStats({ clientsCount, produitsCount, usersCount, tachesCount, rdvCount, caisseTotal, currency, has, peopleModule, isClinical });
    renderDynamicSidebar({ companyName, typeLabel, firstName, lastName, userRole });
    renderDynamicQuickActions();
    renderDynamicContent({ produits, clients, has, peopleModule, currency, isClinical });
    renderBranchComparison();

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
function renderDynamicStats({ clientsCount, produitsCount, usersCount, tachesCount, rdvCount, caisseTotal, currency, has, peopleModule, isClinical }) {
  const statsContainer = document.getElementById('dynamic-stats');
  if (!statsContainer) return;

  const cards = [];

  // 1. Pasyan / Kliyan
  if (has(peopleModule)) {
    cards.push({
      icon: isClinical ? 'heart-pulse' : 'users',
      color: '#10b981',
      value: Number(clientsCount || 0).toLocaleString('fr-HT'),
      label: isClinical ? 'Patients Enregistrés' : `${erpTerm('clients', 'Clients')} Enregistrés`,
      badge: isClinical ? 'Dossiers' : 'Portefeuille'
    });
  }

  // 2. Stock / Matériel
  if (has('stock') || has('catalogue') || has('pharmacie') || has('materiel_orthopedique')) {
    cards.push({
      icon: 'package',
      color: '#3b82f6',
      value: Number(produitsCount || 0).toLocaleString('fr-HT'),
      label: isClinical ? 'Articles & Matériel' : erpTerm('produits', 'Produits & Services'),
      badge: 'Stock'
    });
  }

  // 3. Rendez-vous (si clinique)
  if (isClinical && (has('rdv') || has('agenda'))) {
    cards.push({
      icon: 'calendar-clock',
      color: '#8b5cf6',
      value: Number(rdvCount || 0).toLocaleString('fr-HT'),
      label: 'Rendez-vous à venir',
      badge: 'Planning'
    });
  }

  // 4. Finances / Caisse
  if (has('finances') || has('caisse') || has('encaissements') || has('facturation')) {
    const fmtMoney = (v) => `${Number(Math.round(v)).toLocaleString('fr-HT')} ${currency}`;
    cards.push({
      icon: 'banknote',
      color: '#22c55e',
      value: caisseTotal > 0 ? fmtMoney(caisseTotal) : `0 ${currency}`,
      label: 'Encaissements du mois',
      badge: `Devise: ${currency}`
    });
  }

  // 5. Tâches en cours
  if (has('taches') || has('projets')) {
    cards.push({
      icon: 'check-square',
      color: '#f59e0b',
      value: Number(tachesCount || 0).toLocaleString('fr-HT'),
      label: 'Tâches en cours',
      badge: 'Activité'
    });
  }

  // 6. Équipe / Collaborateurs
  if (has('users') || has('rh') || has('employes')) {
    cards.push({
      icon: 'user-check',
      color: '#06b6d4',
      value: Number(usersCount || 0).toLocaleString('fr-HT'),
      label: `${erpTerm('users', 'Collaborateurs')} & Rôles`,
      badge: 'Équipe'
    });
  }

  if (!cards.length) {
    statsContainer.style.display = 'none';
    return;
  }

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

// Modules tries par section (sections non listees inserees avant 'Administration')
const DASH_SECTION_ORDER = ['Principal', 'Clinique', 'Gestion', 'Site Web', 'RH', 'Communication', 'Rapports', 'Modules', 'Administration'];

function groupNavItems(items) {
  const grouped = {};
  items.forEach(item => {
    if (!grouped[item.section]) grouped[item.section] = [];
    grouped[item.section].push(item);
  });

  const orderedSections = DASH_SECTION_ORDER.filter(s => s !== 'Principal' && grouped[s]);
  const extraSections = Object.keys(grouped).filter(s => !DASH_SECTION_ORDER.includes(s));
  const adminIdx = orderedSections.indexOf('Administration');
  const allSections = adminIdx === -1
    ? [...orderedSections, ...extraSections]
    : [...orderedSections.slice(0, adminIdx), ...extraSections, ...orderedSections.slice(adminIdx)];

  return allSections.map(section => ({
    section,
    title: section === 'Modules' ? 'Modules métier' : section,
    items: grouped[section]
  }));
}

// --------------------------------------------------------------
// Sidebar — modules autorisés pour l'utilisateur, rangés par section
// --------------------------------------------------------------
function renderDynamicSidebar({ companyName, typeLabel, firstName, lastName, userRole }) {
  const sidebarContainer = document.getElementById('dynamic-sidebar');
  if (!sidebarContainer) return;

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';
  const items = typeof getVisibleNavModules === 'function' ? getVisibleNavModules() : [];

  let navHtml = `
    <div class="dash-nav-section">Principal</div>
    <a href="dashboard.html" class="dash-nav-item active">
      <i data-lucide="layout-dashboard"></i>
      Tableau de bord
    </a>
  `;

  groupNavItems(items).forEach(group => {
    navHtml += `<div class="dash-nav-section">${group.title}</div>`;
    group.items.forEach(item => {
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
  encaissements: { label: 'Encaisser / Reçu', desc: 'Émettre un reçu ou une facture',      color: '#10b981' },
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
  annonces:   { label: 'Annonces',         desc: 'Modérer achat/vente de matériel',      color: '#0d9488' },
  ordonnances:{ label: 'Ordonnance',       desc: 'Rédiger une prescription',             color: '#6366f1' },
  pharmacie:  { label: 'Pharmacie',        desc: 'Médicaments et dates d\'expiration',   color: '#10b981' },
  presences:  { label: 'Ma Présence',      desc: 'Pointer mon arrivée / départ',         color: '#0ea5e9' },
  messages:   { label: 'Messages',         desc: 'Discuter avec l\'équipe',              color: '#64748b' }
};

function renderDynamicQuickActions() {
  const actionsContainer = document.getElementById('dynamic-quick-actions');
  if (!actionsContainer) return;
  const user = window.currentUser;
  const isComptable = user?.role === 'comptable';

  const items = (typeof getVisibleNavModules === 'function' ? getVisibleNavModules() : [])
    .filter(i => ERP_QUICK_ACTIONS[i.code])
    .filter(i => {
      // Pour le comptable, ne pas afficher "Nouveau Patient"
      if (isComptable && i.code === 'patients') return false;
      return true;
    })
    .slice(0, 4);

  if (!items.length) {
    actionsContainer.style.display = 'none';
    return;
  }

  actionsContainer.innerHTML = items.map(item => {
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
function renderDynamicContent({ produits, clients, has, peopleModule, currency, isClinical }) {
  const contentContainer = document.getElementById('dynamic-content');
  if (!contentContainer) return;

  const money = (v) => `${Number(v || 0).toLocaleString('fr-HT')} ${currency}`;

  const produitsHtml = produits.length > 0 ? produits.map(p => {
    const prix = p.prix_vente || p.prix_unitaire || 0;
    const qty = p.quantite !== undefined && p.quantite !== null ? p.quantite : null;
    const badgeText = qty !== null ? (qty > 0 ? `${qty} en stock` : 'Rupture') : 'Disponible';
    const badgeCls = qty !== null && qty === 0 ? 'dash-badge-danger' : 'dash-badge-success';
    return `
      <tr>
        <td class="td-accent">${p.code || '-'}</td>
        <td class="td-strong">${p.designation}</td>
        <td class="td-muted">${p.categorie || '-'}</td>
        <td class="td-success">${money(prix)}</td>
        <td>
          <span class="dash-badge ${badgeCls}">${badgeText}</span>
        </td>
      </tr>
    `;
  }).join('') : `
    <tr><td colspan="5" class="dash-empty">Aucun élément enregistré pour le moment.</td></tr>
  `;

  const clientsHtml = clients.length > 0 ? clients.map(c => {
    const nomComplet = `${c.nom || ''} ${c.prenom || ''}`.trim() || 'Sans nom';
    const initial = (c.nom || c.prenom || 'P')[0].toUpperCase();
    const sub = isClinical
      ? (c.phone ? `Tél: ${c.phone}` : (c.notes || 'Dossier patient'))
      : (c.company || c.email || c.phone || '-');
    const badge = isClinical
      ? (c.code || c.numero_dossier ? `#${c.code || c.numero_dossier}` : (Array.isArray(c.type_service) ? c.type_service.join(', ') : (c.type_service || 'Patient')))
      : (c.type || 'Client');
    const link = isClinical ? `module.html?m=patients` : `modules/clients/fiche.html?id=${c.id}`;

    return `
      <div class="dash-list-row" onclick="window.location.href='${link}'" style="cursor: pointer;">
        <div class="dash-list-left">
          <div class="dash-avatar">
            ${initial}
          </div>
          <div>
            <div class="dash-row-title">${nomComplet}</div>
            <div class="dash-row-sub">${sub}</div>
          </div>
        </div>
        <span class="dash-badge dash-badge-primary">
          ${badge}
        </span>
      </div>
    `;
  }).join('') : `
    <div class="dash-empty">Aucun enregistrement.</div>
  `;

  let html = '';

  if (has('stock') || has('catalogue')) {
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

  if (has(peopleModule)) {
    const peoplePage = getModuleNavItem(peopleModule).page.replace(/^\//, '');
    html += `
      <div class="section-card">
        <div class="section-header">
          <h2 class="section-title">${erpTerm('clients', 'Clients')} Récents</h2>
          <a href="${peoplePage}" class="section-link">Voir tout &rarr;</a>
        </div>
        <div>${clientsHtml}</div>
      </div>
    `;
  }

  // Grille "Mes modules": uniquement les modules autorisés pour cet utilisateur
  const items = typeof getVisibleNavModules === 'function' ? getVisibleNavModules() : [];
  if (items.length) {
    html += `
      <div class="section-card full">
        <div class="section-header">
          <h2 class="section-title">${isErpOwner(window.currentUser) ? 'Tous les modules' : 'Mes modules'}</h2>
        </div>
        ${groupNavItems(items).map(group => `
          <div class="dash-nav-section" style="margin: 18px 0 10px 2px; color: var(--clr-text-muted);">${group.title}</div>
          <div class="module-grid">
            ${group.items.map(item => {
              const href = item.page.startsWith('/') ? item.page.slice(1) : item.page;
              return `
                <a href="${href}" class="module-tile">
                  <i data-lucide="${item.icon}"></i>
                  ${item.label}
                </a>
              `;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  contentContainer.innerHTML = html;
}

// --------------------------------------------------------------
// Konparezon annex — direksyon sèlman, vi "Consolidé"
// --------------------------------------------------------------
async function renderBranchComparison() {
  try {
    if (typeof canSwitchBranch !== 'function' || !canSwitchBranch(window.currentUser)) return;
    if (window.erpActiveBranchView !== 'all') return;
    const annexes = window.erpAnnexes || [];
    if (annexes.length < 2) return;

    const container = document.getElementById('dynamic-content');
    if (!container) return;

    const monthStart = new Date().toISOString().slice(0, 8) + '01';
    const rows = await Promise.all(annexes.map(async a => {
      const [p, r, e] = await Promise.all([
        db.from('erp_patients').select('id', { count: 'exact', head: true }).eq('annexe_id', a.id),
        db.from('erp_rdv').select('id', { count: 'exact', head: true }).eq('annexe_id', a.id).gte('date_rdv', monthStart),
        db.from('erp_encaissements').select('montant').eq('annexe_id', a.id)
          .eq('statut', 'paye').gte('date_doc', monthStart)
      ]);
      return {
        nom: `${a.code} — ${a.nom}`,
        patients: p.count || 0,
        rdv: r.count || 0,
        enc: (e.data || []).reduce((s, x) => s + parseFloat(x.montant || 0), 0)
      };
    }));

    const fmt = (v) => typeof window.erpFmtMoney === 'function'
      ? window.erpFmtMoney(v)
      : `${Number(v).toLocaleString('fr-HT')} HTG`;

    const card = document.createElement('div');
    card.className = 'section-card full';
    card.innerHTML = `
      <div class="section-header">
        <h2 class="section-title"><i data-lucide="building-2" style="width:18px;height:18px;vertical-align:-3px;"></i>
          Comparatif des annexes — ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
        <a href="module.html?m=rapports_mensuels" class="section-link">Rapports mensuels &rarr;</a>
      </div>
      <div style="overflow-x:auto;">
        <table class="dash-table">
          <thead><tr><th>Annexe</th><th>Patients</th><th>RDV ce mois</th><th>Encaissé ce mois</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td class="td-strong">${r.nom}</td>
              <td>${r.patients}</td>
              <td>${r.rdv}</td>
              <td class="td-success">${fmt(r.enc)}</td>
            </tr>`).join('')}
            <tr style="font-weight:700;">
              <td class="td-accent">Consolidé</td>
              <td>${rows.reduce((s, r) => s + r.patients, 0)}</td>
              <td>${rows.reduce((s, r) => s + r.rdv, 0)}</td>
              <td class="td-success">${fmt(rows.reduce((s, r) => s + r.enc, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
    container.prepend(card);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (e) {
    console.warn('[branch] comparatif:', e);
  }
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
