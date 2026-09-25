// ============================================================
// HAITI REH-CARE — Site public — client Supabase + helpers
// Partage la même auth / base de données que l'ERP.
// ============================================================

const SUPABASE_URL = 'https://jbshrucfzwwzrsronodm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2hydWNmend3enJzcm9ub2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjkyNjcsImV4cCI6MjEwNTc0NTI2N30.aZvGaGCWT06gUZDPaEyn6kWLC13eFZjXFP8Fp8mgxKI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.db = db;

// URL de l'ERP (espace staff). Quand le site et l'ERP sont déployés
// comme deux projets Vercel séparés, remplace ceci par l'URL de l'ERP,
// ex. 'https://haitirecare-erp.vercel.app/index.html'
const ERP_LOGIN_URL = '../index.html';

// ---------- État global du site ----------
const Site = {
  enterprise: null,
  catalog: null,

  // Charge l'entreprise active (nom, logo, contacts…)
  async loadEnterprise() {
    if (this.enterprise) return this.enterprise;
    try {
      const { data, error } = await db.rpc('erp_public_enterprise');
      if (!error && data) {
        this.enterprise = data;
        try { localStorage.setItem('site_enterprise_cache', JSON.stringify(data)); } catch (e) {}
      }
    } catch (e) { console.warn('enterprise:', e); }

    if (!this.enterprise) {
      try {
        const cached = localStorage.getItem('site_enterprise_cache');
        if (cached) this.enterprise = JSON.parse(cached);
      } catch (e) {}
    }

    if (!this.enterprise) {
      this.enterprise = {
        id: null,
        name: 'HAITI REH-CARE',
        description: 'Centre de physiothérapie, massothérapie, prothèses, orthèses et matériel orthopédique.',
        logo_url: null, phone: '', email: '', address: 'Port-au-Prince', city: '', country: 'Haïti'
      };
    }
    return this.enterprise;
  },

  // Catalogue public: services + produits
  async loadCatalog() {
    if (this.catalog) return this.catalog;
    const ent = await this.loadEnterprise();
    
    // 1. RPC (filtré par entreprise)
    if (ent.id) {
      try {
        const { data, error } = await db.rpc('erp_public_catalog', { p_enterprise_id: ent.id });
        if (!error && data) {
          this.catalog = data;
          try { localStorage.setItem('site_catalog_cache', JSON.stringify(data)); } catch (e) {}
          return data;
        }
      } catch (e) { console.warn('catalog rpc:', e); }
    }

    // 2. Fallback: lecture directe des tables publiques
    try {
      const [sv, pr] = await Promise.all([
        db.from('erp_services').select('id, name, category, description, price, devise, duration_min')
          .eq('is_public', true).eq('is_active', true).order('category').order('price'),
        db.from('erp_produits').select('id, designation, categorie, description, prix_vente, unite, image_url')
          .eq('is_public', true).eq('is_active', true).order('designation')
      ]);

      if (sv.data || pr.data) {
        this.catalog = { services: sv.data || [], products: pr.data || [] };
        try { localStorage.setItem('site_catalog_cache', JSON.stringify(this.catalog)); } catch (e) {}
        return this.catalog;
      }
    } catch (e) {
      console.warn('catalog fallback:', e);
    }

    // 3. Offline Cache Fallback
    try {
      const cached = localStorage.getItem('site_catalog_cache');
      if (cached) {
        this.catalog = JSON.parse(cached);
        console.log('[Offline] Loaded public catalog from local cache.');
        return this.catalog;
      }
    } catch (e) {}

    this.catalog = { services: [], products: [] };
    return this.catalog;
  },

  // URL du logo uploadé dans les paramètres ERP — null tant qu'aucun
  // logo n'est configuré (l'emplacement reste vide dans le header).
  logo() {
    return this.enterprise?.logo_url || null;
  },

  // ---------- Header / Footer ----------
  renderHeader(active) {
    const ent = this.enterprise || {};
    const name = ent.name || 'HAITI REH-CARE';
    const el = document.getElementById('site-header');
    if (!el) return;
    const logoUrl = this.logo();
    el.innerHTML = `
      <div class="site-header-inner">
        <a href="index.html" class="site-brand">
          ${logoUrl
            ? `<img src="${logoUrl}" alt="${name}">`
            : '<img src="assets/logohaitirecare.png" alt="HAITI REH-CARE" style="height:40px; object-fit:contain; border-radius:8px;">'}
          <span>${name}<small>Physiothérapie & Réadaptation</small></span>
        </a>
        <nav class="site-nav" id="site-nav">
          <a href="index.html" ${active === 'home' ? 'class="active"' : ''}>Accueil</a>
          <a href="soins.html" ${active === 'soins' ? 'class="active"' : ''}>Soins & Services</a>
          <a href="materiel.html" ${active === 'materiel' ? 'class="active"' : ''}>Matériel</a>
          <a href="annonces.html" ${active === 'annonces' ? 'class="active"' : ''}>Annonces</a>
          <a href="contact.html" ${active === 'contact' ? 'class="active"' : ''}>Contact</a>
          <a href="compte.html" ${active === 'compte' ? 'class="active"' : ''}>Mon compte</a>
          <a href="rendez-vous.html" class="btn btn-teal"><i data-lucide="calendar-plus"></i> Rendez-vous</a>
        </nav>
        <button class="burger" onclick="document.getElementById('site-nav').classList.toggle('open')">
          <i data-lucide="menu"></i>
        </button>
      </div>`;
    lucide.createIcons();
  },

  renderFooter() {
    const ent = this.enterprise || {};
    const name = ent.name || 'HAITI REH-CARE';
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = `
      <div class="footer-inner">
        <div class="footer-grid">
          <div>
            <div class="footer-brand">${this.logo() ? `<img src="${this.logo()}" alt="${name}">` : ''}${name}</div>
            <p>${ent.description || 'Centre de physiothérapie, réadaptation, prothèses et orthèses.'}</p>
          </div>
          <div>
            <h4>Navigation</h4>
            <ul>
              <li><a href="soins.html">Soins & Services</a></li>
              <li><a href="materiel.html">Matériel orthopédique</a></li>
              <li><a href="annonces.html">Annonces</a></li>
              <li><a href="rendez-vous.html">Prendre rendez-vous</a></li>
              <li><a href="compte.html">Espace patient</a></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <div class="contact-line"><i data-lucide="map-pin"></i>${ent.address || 'Port-au-Prince'}${ent.city ? ', ' + ent.city : ''}</div>
            <div class="contact-line"><i data-lucide="phone"></i>${ent.phone || ''}</div>
            <div class="contact-line"><i data-lucide="mail"></i>${ent.email || ''}</div>
          </div>
          <div>
            <h4>Horaires</h4>
            <div class="contact-line"><i data-lucide="clock"></i>Lun – Ven : 8h – 17h</div>
            <div class="contact-line"><i data-lucide="clock"></i>Samedi : 8h – 12h</div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} ${name} — Tous droits réservés</span>
          <a href="${ERP_LOGIN_URL}" style="color:#64748B;">Espace staff →</a>
        </div>
      </div>`;
    lucide.createIcons();
  },

  // ---------- Helpers ----------
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  money(n, devise = 'HTG') {
    if (n === null || n === undefined) return '';
    return `${Number(n).toLocaleString('fr-FR')} ${devise}`;
  },
  date(d, withTime = false) {
    if (!d) return '';
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return new Date(d).toLocaleDateString('fr-FR', opts);
  },
  rdvBadge(statut) {
    const map = {
      en_attente: ['badge-amber', 'En attente'],
      confirme:   ['badge-green', 'Confirmé'],
      annule:     ['badge-red', 'Annulé'],
      termine:    ['badge-gray', 'Terminé'],
      absent:     ['badge-red', 'Absent']
    };
    const [cls, label] = map[statut] || ['badge-gray', statut];
    return `<span class="badge ${cls}">${label}</span>`;
  },

  // Session courante (patient connecté ou null)
  async session() {
    const { data } = await db.auth.getSession();
    return data?.session || null;
  },
  async myPatientId() {
    const { data } = await db.rpc('erp_my_patient_id');
    return data || null;
  }
};

// Init commun: charge l'entreprise puis affiche header/footer
async function initSite(active) {
  await Site.loadEnterprise();
  Site.renderHeader(active);
  Site.renderFooter();
}
