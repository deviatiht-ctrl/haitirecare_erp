// Layout Management - Sidebar, Topbar, Notifications

// Ordre d'affichage des sections dans la sidebar
// Les sections non listees sont inserees avant 'Administration'
const ERP_NAV_SECTION_ORDER = [
  'Principal', 'Clinique', 'Gestion', 'RH', 'Communication', 'Rapports', 'Modules', 'Administration'
];

// Construit la navigation à partir des modules activés de
// l'entreprise (erp_enterprise_types.features.modules) et des
// permissions effectives de l'utilisateur. Les modules sans page
// dédiée obtiennent une page générée via /module.html?m=<code>.
function buildNavSections() {
  const sections = {};

  // Toujours: tableau de bord
  const dash = getModuleNavItem('dashboard');
  sections[dash.section] = [dash];

  getVisibleNavModules().forEach(item => {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  });

  const ordered = ERP_NAV_SECTION_ORDER
    .filter(name => sections[name]?.length)
    .map(name => ({ section: name, items: sections[name] }));

  // Sections inconnues (nouveaux modules métier): avant Administration
  const extra = Object.keys(sections)
    .filter(name => !ERP_NAV_SECTION_ORDER.includes(name))
    .map(name => ({ section: name, items: sections[name] }));

  const adminIdx = ordered.findIndex(s => s.section === 'Administration');
  if (adminIdx === -1) return [...ordered, ...extra];
  return [...ordered.slice(0, adminIdx), ...extra, ...ordered.slice(adminIdx)];
}

// Render sidebar based on user's modules and permissions
async function renderSidebar(user) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Render user info
  const userAvatar = sidebar.querySelector('.sidebar-user-avatar');
  const userName = sidebar.querySelector('.sidebar-user-name');
  const userRole = sidebar.querySelector('.sidebar-user-role');

  if (userAvatar) {
    const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
    userAvatar.textContent = initials;
  }

  if (userName) {
    userName.textContent = `${user.first_name} ${user.last_name}`;
  }

  if (userRole) {
    userRole.textContent = formatRole(user.role);
  }

  // Settings: déjà chargés dans enterpriseContext par initApp, sinon requête
  let settings = window.enterpriseContext?.settings;
  if (!settings) {
    try {
      const { data } = await db.from('erp_settings').select('*').maybeSingle();
      settings = data;
    } catch (e) {
      console.warn('erp_settings:', e);
    }
  }

  const logoImg = sidebar.querySelector('.sidebar-logo');
  if (logoImg && settings) {
    logoImg.src = settings.logo_url || '/assets/img/logo-placeholder.svg';
    logoImg.alt = settings.company_name || 'ERP';
  }

  // Secteur: dérivé du type d'entreprise (hospital -> clinique, etc.)
  const SECTOR_ALIAS = { hospital: 'clinique', education: 'ecole' };
  const typeCode = window.enterpriseContext?.type?.code;
  const sector = SECTOR_ALIAS[typeCode] || settings?.sector || 'commerce';

  // Apply translation of title elements in topbar & DOM nodes!
  translatePageElements(sector);

  // Render navigation dynamique (modules)
  const navContainer = sidebar.querySelector('.sidebar-nav');
  if (!navContainer) return;

  navContainer.innerHTML = '';

  const currentPage = window.location.pathname + window.location.search;
  const navStructure = buildNavSections();

  navStructure.forEach(section => {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'sidebar-nav-section';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'sidebar-nav-section-title';
    sectionTitle.textContent = translateLabel(section.section, sector);
    sectionDiv.appendChild(sectionTitle);

    section.items.forEach(item => {
      const link = document.createElement('a');
      link.className = 'sidebar-nav-item';
      link.href = item.page;

      const itemPath = item.page.split('?')[0];
      const itemModDir = item.page.match(/\/modules\/([a-z-]+)\//);
      const pageModDir = currentPage.match(/\/modules\/([a-z-]+)\//);
      if (currentPage.includes(itemPath) ||
          (itemModDir && pageModDir && itemModDir[1] === pageModDir[1]) ||
          (item.code && currentPage.includes(`m=${item.code}`))) {
        link.classList.add('active');
      }

      link.innerHTML = `
        <i data-lucide="${item.icon}"></i>
        <span>${translateLabel(item.label, sector)}</span>
      `;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(item.page);
      });

      sectionDiv.appendChild(link);
    });

    navContainer.appendChild(sectionDiv);
  });

  // Re-initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function translateLabel(label, sector) {
  if (sector === 'clinique') {
    if (label === 'Clients') return 'Patients';
    if (label === 'Client') return 'Patient';
    if (label === 'Fiche Client') return 'Dossier Patient';
    if (label === 'Utilisateurs') return 'Personnel Médical';
    if (label === 'Stock') return 'Pharmacie & Matériel';
    if (label === 'Tableau de bord') return 'Tableau Clinique';
    if (label === 'Rapport global') return 'Bilan Médical';
    if (label === 'Ressources Humaines') return 'Gestion Médecins & Staff';
    if (label === 'Tâches') return 'Rendez-vous & Consultations';
  } else if (sector === 'ecole') {
    if (label === 'Clients') return 'Élèves & Parents';
    if (label === 'Client') return 'Élève';
    if (label === 'Utilisateurs') return 'Enseignants & Staff';
    if (label === 'Stock') return 'Livres & Matériel';
    if (label === 'Tableau de bord') return 'Tableau Académique';
  }
  return label;
}

function translatePageElements(sector) {
  if (sector !== 'clinique' && sector !== 'ecole') return;
  
  // Translate topbar title
  const topbarTitle = document.querySelector('.topbar-title');
  if (topbarTitle) {
    topbarTitle.textContent = translateLabel(topbarTitle.textContent.trim(), sector);
  }

  // Translate search placeholders
  const searchInput = document.getElementById('search-input') || document.querySelector('.topbar-search input');
  if (searchInput && searchInput.placeholder) {
    if (sector === 'clinique') {
      if (searchInput.placeholder.includes('client')) {
        searchInput.placeholder = searchInput.placeholder.replace(/client/g, 'patient');
      }
      if (searchInput.placeholder.includes('utilisateur')) {
        searchInput.placeholder = searchInput.placeholder.replace(/utilisateur/g, 'personnel médical');
      }
      if (searchInput.placeholder.includes('article')) {
        searchInput.placeholder = searchInput.placeholder.replace(/article/g, 'médicament/matériel');
      }
    } else if (sector === 'ecole') {
      if (searchInput.placeholder.includes('client')) {
        searchInput.placeholder = searchInput.placeholder.replace(/client/g, 'élève');
      }
    }
  }

  // Translate all text nodes in relevant DOM components
  document.querySelectorAll('.btn, .table-action-btn, label, th, h3, h4, .card-title, .page-header strong').forEach(el => {
    if (el.childNodes.length > 0) {
      el.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const txt = child.textContent;
          if (sector === 'clinique') {
            let next = txt;
            if (txt.includes('client')) next = next.replace(/client/g, 'patient');
            if (txt.includes('Client')) next = next.replace(/Client/g, 'Patient');
            if (txt.includes('utilisateurs')) next = next.replace(/utilisateurs/g, 'personnels');
            if (txt.includes('Utilisateurs')) next = next.replace(/Utilisateurs/g, 'Personnels');
            if (txt.includes('utilisateur')) next = next.replace(/utilisateur/g, 'personnel');
            if (txt.includes('Utilisateur')) next = next.replace(/Utilisateur/g, 'Personnel');
            if (txt.includes('article')) next = next.replace(/article/g, 'médicament/matériel');
            if (txt.includes('Article')) next = next.replace(/Article/g, 'Médicament/Matériel');
            if (txt.includes('produit')) next = next.replace(/produit/g, 'médicament');
            if (txt.includes('Produit')) next = next.replace(/Produit/g, 'Médicament');
            child.textContent = next;
          } else if (sector === 'ecole') {
            let next = txt;
            if (txt.includes('client')) next = next.replace(/client/g, 'élève');
            if (txt.includes('Client')) next = next.replace(/Client/g, 'Élève');
            child.textContent = next;
          }
        }
      });
    }
  });
}

// Navigate to a page
function navigateTo(url) {
  window.location.href = url;
}

// Toggle sidebar on mobile
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
  
  if (overlay) {
    overlay.classList.toggle('show');
  }
}

// Close sidebar when clicking overlay
function setupSidebarOverlay() {
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay && !overlay.getAttribute('onclick')) {
    overlay.addEventListener('click', toggleSidebar);
  }
}

// Setup mobile menu button
function setupMobileMenu() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  if (menuBtn && !menuBtn.getAttribute('onclick')) {
    menuBtn.addEventListener('click', toggleSidebar);
  }
}

// Setup user dropdown
function setupUserDropdown() {
  const userBtn = document.querySelector('.topbar-user');
  const dropdown = document.querySelector('.dropdown-menu');
  
  if (userBtn && dropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });
    
    document.addEventListener('click', () => {
      dropdown.classList.add('hidden');
    });
  }
}

// Setup notification button
function setupNotificationButton() {
  const notificationBtn = document.querySelector('.topbar-btn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', () => {
      loadNotifications();
      playNotificationSound();
    });
  }
}

// Load notifications
async function loadNotifications() {
  if (!window.currentUser) return;
  
  try {
    // Load unread messages count
    const { count: unreadMessages } = await db
      .from('erp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', window.currentUser.id)
      .eq('is_read', false);
    
    // Load unread system notifications
    const { data: notifications } = await db
      .from('erp_notifications')
      .select('*')
      .eq('user_id', window.currentUser.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5);
    
    const badge = document.querySelector('.notification-badge');
    const totalUnread = (unreadMessages || 0) + (notifications?.length || 0);
    
    if (badge) {
      if (totalUnread > 0) {
        badge.style.display = 'block';
        badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        badge.style.animation = 'pulse 2s infinite';
      } else {
        badge.style.display = 'none';
        badge.style.animation = 'none';
      }
    }
    
    return notifications;
  } catch (error) {
    console.error('Notifications error:', error);
  }
}

// Play notification sound
function playNotificationSound() {
  try {
    // Create audio context for notification sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.error('Notification sound error:', error);
  }
}

// Show browser notification
function showBrowserNotification(title, body, icon = null) {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body: body,
      icon: icon || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      badge: icon || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      vibrate: [200, 100, 200]
    });
    
    notification.onclick = function() {
      window.focus();
      notification.close();
    };
    
    playNotificationSound();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showBrowserNotification(title, body, icon);
      }
    });
  }
}

// Setup real-time notifications
function setupRealtimeNotifications() {
  if (!window.currentUser) return;
  
  try {
    // Subscribe to messages
    const messagesChannel = db
      .channel('messages_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'erp_messages',
        filter: `recipient_id=eq.${window.currentUser.id}`
      }, (payload) => {
        loadNotifications();
        const message = payload.new;
        const senderName = message.sender_first_name || 'Quelqu\'un';
        showBrowserNotification(
          `Nouveau message de ${senderName}`,
          message.content?.substring(0, 100) || 'Vous avez reçu un nouveau message'
        );
      })
      .subscribe();
    
    // Subscribe to notifications
    const notificationsChannel = db
      .channel('notifications_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'erp_notifications',
        filter: `user_id=eq.${window.currentUser.id}`
      }, (payload) => {
        loadNotifications();
        const notification = payload.new;
        showBrowserNotification(
          notification.title || 'Nouvelle notification',
          notification.message || 'Vous avez une nouvelle notification'
        );
      })
      .subscribe();
    
  } catch (error) {
    console.error('Realtime setup error:', error);
  }
}

// Mark notification as read
async function markNotificationRead(notificationId) {
  try {
    await db.from('erp_notifications').update({ is_read: true }).eq('id', notificationId);
    loadNotifications();
  } catch (error) {
    console.error('Mark read error:', error);
  }
}

// Injecte le bouton de bascule theme clair/sombre dans la topbar
function setupThemeToggle() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || actions.querySelector('.theme-toggle')) return;
  const btn = document.createElement('button');
  btn.className = 'topbar-btn theme-toggle';
  btn.title = 'Basculer mode clair / sombre';
  btn.innerHTML = '<i data-lucide="moon" class="theme-icon-moon"></i><i data-lucide="sun" class="theme-icon-sun"></i>';
  btn.addEventListener('click', toggleTheme);
  actions.prepend(btn);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Initialize layout
function initLayout() {
  setupThemeToggle();
  setupSidebarOverlay();
  setupMobileMenu();
  setupUserDropdown();
  setupNotificationButton();
  loadNotifications();
  setupRealtimeNotifications();
  requestNotificationPermission();
}

// Request notification permission
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('Notification permission:', permission);
    });
  }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', initLayout);
