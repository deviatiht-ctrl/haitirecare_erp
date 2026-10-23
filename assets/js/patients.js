// ==============================================================
// Modul PATIENTS — dosye pasyan konplè (fòm papye Fèy 1-10)
//   * Enskripsyon: fòm an seksyon ki swiv fòm papye a
//   * Kòd pasyan otomatik: prefiks annex itilizatè a (ex: PAP-0001)
//   * Dossier: rezime + fich reevalyasyon (Fèy 10)
// Rele pa module.html?m=patients
// ==============================================================

let _patients = [];
let _annexes = [];
let _patientView = 'list';      // 'list' | 'form' | 'dossier' | 'demandes' | 'demande' | 'lien'
let _editingPatient = null;
let _currentPatient = null;
let _patientSearch = '';
let _patientFilterAnnexe = '';   // '' | annexe_id | '__none__'
let _patientFilterStatut = '';
let _patientFilterService = '';
let _patientSort = 'recent';     // 'recent' | 'code' | 'nom' | 'annexe'

// Demandes en ligne (fòm piblik site/inscription.html)
let _demandes = [];
let _currentDemande = null;
let _demandeStatutFilter = 'en_attente';
let _prefillPatient = null;      // payload yon demand ki ap tounen dosye
let _demandeEnCours = null;      // id demand k ap trete a
let _demandesSubscribed = false;
let _lienAnnexeCode = '';        // '' = tout annex yo

const STAFF_DIRECTION = ['pdg', 'directrice', 'directeur'];

// Jewografi Ayiti — depatman -> komin (pou lis seleksyon rapid)
const HAITI_GEO = {
  'Artibonite': ['Anse-Rouge','Dessalines','Desdunes','Ennery','Gonaïves','Grande-Saline','Gros-Morne','La Chapelle','L\'Estère','Liancourt','Marmelade','Petite Rivière de l\'Artibonite','Saint-Marc','Saint-Michel-de-l\'Attalaye','Terre-Neuve','Verrettes'],
  'Centre': ['Belladère','Boucan-Carré','Cerca-Carvajal','Cerca-la-Source','Hinche','Lascahobas','Maïssade','Mirebalais','Saut-d\'Eau','Savanette','Thomassique','Thomonde'],
  'Grand\'Anse': ['Abricots','Anse-d\'Hainault','Beaumont','Bonbon','Chambellan','Corail','Dame-Marie','Jérémie','Les Irois','Marfranc','Moron','Pestel','Roseaux'],
  'Nippes': ['Anse-à-Veau','Arnaud','Baradères','Fonds-des-Nègres','Grand-Boucan','L\'Asile','Miragoâne','Paillant','Petit-Trou-de-Nippes','Petite-Rivière-de-Nippes','Plaisance-du-Sud'],
  'Nord': ['Acul-du-Nord','Bahon','Bas-Limbé','Borgne','Cap-Haïtien','Dondon','Grande-Rivière-du-Nord','La Victoire','Limbé','Limonade','Milot','Pignon','Pilate','Plaine-du-Nord','Plaisance','Port-Margot','Quartier-Morin','Ranquitte','Saint-Raphaël'],
  'Nord-Est': ['Capotille','Carice','Ferrière','Fort-Liberté','Mombin-Crochu','Mont-Organisé','Ouanaminthe','Perches','Sainte-Suzanne','Terrier-Rouge','Trou-du-Nord','Vallières'],
  'Nord-Ouest': ['Anse-à-Foleur','Baie-de-Henne','Bassin-Bleu','Bombardopolis','Chansolme','Île de la Tortue','Jean-Rabel','La Pointe-des-Palmistes','Môle-Saint-Nicolas','Port-de-Paix','Saint-Louis-du-Nord'],
  'Ouest': ['Anse-à-Galets','Arcahaie','Cabaret','Carrefour','Cité Soleil','Cornillon','Croix-des-Bouquets','Delmas','Fonds-Verrettes','Ganthier','Grand-Goâve','Gressier','Kenscoff','Léogâne','Petit-Goâve','Pétion-Ville','Pointe-à-Raquette','Port-au-Prince','Tabarre','Thomazeau'],
  'Sud': ['Aquin','Arniquet','Camp-Perrin','Cavaillon','Chantal','Chardonnières','Île-à-Vache','Les Anglais','Les Cayes','Maniche','Port-Salut','Roche-à-Bateaux','Saint-Jean-du-Sud','Saint-Louis-du-Sud','Tiburon','Torbeck'],
  'Sud-Est': ['Anse-à-Pitre','Bainet','Belle-Anse','Cayes-Jacmel','Côtes-de-Fer','Grand-Gosier','Jacmel','La Vallée-de-Jacmel','Marigot','Thiotte']
};
const HAITI_DEPARTEMENTS = Object.keys(HAITI_GEO);
const HAITI_ALL_COMMUNES = Object.values(HAITI_GEO).flat().sort();

// Select depatman + input komin (datalist filtre pa depatman)
function inDepartement(name, label) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <select name="${name}" class="form-select form-input" id="patient-departement">
      <option value="">— Sélectionner —</option>
      ${HAITI_DEPARTEMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
    </select>
  </div>`;
}
function inCommune(name, label) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="text" name="${name}" class="form-input" list="commune-list"
           placeholder="Tapez ou choisissez une commune">
    <datalist id="commune-list"></datalist>
  </div>`;
}

// --------------------------------------------------------------
// Konfigirasyon fòm la — seksyon yo swiv fòm papye a
// --------------------------------------------------------------
const ENVOYE_DE_OPTIONS = [];
const AMP_MI = [
  ['desarticulation_hanche', 'Désarticulation de la hanche'],
  ['femorale', 'Fémorale'],
  ['tibiale', 'Tibiale'],
  ['desarticulation_cheville', 'Désarticulation de cheville'],
  ['partielle_pied', 'Partielle du pied']
];
const AMP_MS = [
  ['desarticulation_epaule', "Désarticulation d'épaule"],
  ['humerale', 'Humérale'],
  ['radiale', 'Radiale'],
  ['desarticulation_poignet', 'Désarticulation poignet'],
  ['partielle_main', 'Partielle de la main']
];
const BILAN_COGNITIF_KEYS = [
  ['orientation', 'Orientation'], ['resolution_problemes', 'Résolution de problèmes'],
  ['perspicacite', 'Perspicacité'], ['memoire_court', 'Mémoire — court terme'],
  ['memoire_long', 'Mémoire — long terme'], ['memoire_ancien', 'Mémoire — ancien'],
  ['coordination', 'Coordination'], ['ecriture', 'Écriture'],
  ['langage', 'Langage'], ['autre', 'Autre']
];
const DOULEUR_NATURE = [
  'Crampes', 'Douleur', 'Terne', 'Forte', 'Brûlante', 'Promené',
  'Lancinante', 'Picotement', 'Engourdissement', 'Profonde', 'Piqué', 'Sore'
];
const DOULEUR_ASPECT = [
  'Constant', 'Intermittent', 'Épisodique', 'Défensive',
  'Amélioration', 'Aggravant', 'Immuable', 'Fluctuante'
];
const MAIGNE_KEYS = [
  ['courber_devant', 'Courber devant'], ['courber_arriere', 'Courber en arrière'],
  ['cote_gauche', 'Courber sur le côté gauche'], ['cote_droite', 'Courber sur le côté droit'],
  ['rot_gauche', 'Rotation gauche'], ['rot_droite', 'Rotation droite']
];
const FONCTIONNEL_ACTIVITES = [
  ['rouler_cotes', 'Rouler sur les côtés'],
  ['asseoir_allonge', "S'asseoir à partir d'une position allongée"],
  ['equilibre_assis', 'Équilibre dans la position assise (sur le côté du lit)'],
  ['transfert_lit_chaise', 'Transfert lit et chaise'],
  ['lever_assis', 'Se lever à partir d’une position assise'],
  ['equilibre_bipodale', 'Équilibre debout bipodale'],
  ['equilibre_unipodale', 'Équilibre debout unipodale'],
  ['accroupir', "S'accroupir"],
  ['marcher', 'Marcher ou se déplacer'],
  ['marches_obstacles', 'Monter/descendre quelques marches ou obstacles'],
  ['charge_plat', 'Porter une charge lors des déplacements (terrain plat)'],
  ['charge_obstacles', "Porter une charge lors des passages d'obstacle"],
  ['asseoir_allonger', "S'asseoir / S'allonger"],
  ['objet_main_affectee', 'Prendre un objet avec la main affectée'],
  ['objet_deux_mains', 'Prendre un objet avec deux mains (en même temps)'],
  ['toilette', 'Faire sa toilette / Se baigner / se doucher'],
  ['toilettes_latrines', 'Utiliser les toilettes ou les latrines'],
  ['habiller_haut', "S'habiller et se déshabiller — partie haute du corps"],
  ['habiller_bas', "S'habiller et se déshabiller — partie basse du corps"],
  ['manger_boire', 'Manger et boire'],
  ['cuisiner', 'Cuisiner / préparer son repas'],
  ['laver_linge', 'Laver son linge']
];
const MUSCULAIRE_ROWS = [
  ['Épaule', [['flex', 'Flex.'], ['ext', 'Ext.'], ['abd', 'Abd.'], ['add', 'Add.'], ['rot_int', 'Rot. Int.'], ['rot_ext', 'Rot. Ext.']]],
  ['Coude', [['flex', 'Flex.'], ['ext', 'Ext.']]],
  ['Avant-bras', [['pron', 'Pron.'], ['sup', 'Sup.']]],
  ['Poignet', [['flex', 'Flex.'], ['ext', 'Ext.']]],
  ['Doigts de la main', [['flex', 'Flex.'], ['ext', 'Ext.']]],
  ['Hanche', [['flex', 'Flex.'], ['ext', 'Ext.'], ['abd', 'Abd.'], ['add', 'Add.'], ['rot_int', 'Rot. Int.'], ['rot_ext', 'Rot. Ext.']]],
  ['Genou', [['flex', 'Flex.'], ['ext', 'Ext.']]],
  ['Cheville', [['flex', 'Flex.'], ['ext', 'Ext.'], ['ever', 'Ever.'], ['inver', 'Inver.']]],
  ['Orteils', [['flex', 'Flex.'], ['ext', 'Ext.']]],
  ['Tronc', [['flex', 'Flex.'], ['ext', 'Ext.'], ['incl_d', 'Incl. D'], ['incl_g', 'Incl. G'], ['rot_d', 'Rot. D'], ['rot_g', 'Rot. G']]],
  ['Cou', [['flex', 'Flex.'], ['ext', 'Ext.'], ['incl_d', 'Incl. D'], ['incl_g', 'Incl. G'], ['rot_d', 'Rot. D'], ['rot_g', 'Rot. G']]]
];
const PLAN_EXERCICES = [
  ['mob_passive', 'Mob. passive'], ['mob_assistee', 'Mob. assistée'],
  ['auto_mob', 'Auto mob.'], ['mob_active', 'Mob. active'],
  ['etirements', 'Étirements'], ['massage', 'Massage'],
  ['proprioception', 'Proprioception'], ['transferts', 'Transferts'],
  ['positionnement', 'Positionnement'], ['renforcement', 'Renforcement'],
  ['equilibre', 'Équilibre'], ['marche', 'Marche'],
  ['thermotherapie', 'Thermothérapie'], ['electrotherapie', 'Électrothérapie'],
  ['mecanotherapie', 'Mécanothérapie'], ['travaux_manuel', 'Travaux manuel'],
  ['exercices_fonctionnels', 'Exercices fonctionnels'], ['respi', 'Respi'],
  ['autre', 'Autre']
];

// --------------------------------------------------------------
// Helper ti moso HTML
// --------------------------------------------------------------
function escH(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inText(name, label, type = 'text', extra = '') {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" name="${name}" class="form-input" ${extra}>
  </div>`;
}
function inArea(name, label, extra = '') {
  return `<div class="form-group" style="grid-column: 1 / -1;">
    <label class="form-label">${label}</label>
    <textarea name="${name}" class="form-textarea form-input" rows="2" ${extra}></textarea>
  </div>`;
}
function inCheckGroup(name, label, options, useValues = false) {
  return `<div class="form-group" style="grid-column: 1 / -1;">
    <label class="form-label">${label}</label>
    <div style="display:flex; flex-wrap:wrap; gap:10px 18px;">
      ${options.map(o => {
        const [val, lbl] = useValues ? o : [o, o];
        return `<label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:normal; cursor:pointer;">
          <input type="checkbox" name="${name}" value="${escH(val)}"> ${escH(lbl)}
        </label>`;
      }).join('')}
    </div>
  </div>`;
}
function inRadioGroup(name, label, options, required = false) {
  return `<div class="form-group" style="grid-column: 1 / -1;">
    <label class="form-label">${label}</label>
    <div style="display:flex; flex-wrap:wrap; gap:10px 18px;">
      ${options.map(([val, lbl]) => `
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:normal; cursor:pointer;">
          <input type="radio" name="${name}" value="${escH(val)}" ${required ? 'required' : ''}> ${escH(lbl)}
        </label>`).join('')}
    </div>
  </div>`;
}
function jsonInputs(group, keys) {
  return `<div class="form-group" style="grid-column: 1 / -1;">
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
      ${keys.map(([k, lbl]) => `
        <div>
          <label style="font-size:12px; color: var(--clr-text-muted, #94a3b8);">${lbl}</label>
          <input type="text" class="form-input" data-json="${group}" data-key="${k}" style="padding:6px 10px;">
        </div>`).join('')}
    </div>
  </div>`;
}

// --------------------------------------------------------------
// FÒM KONPLÈ — 9 seksyon
// --------------------------------------------------------------
// Preview pwochen kòd pasyan pou yon annex (san enkremante kontè a)
function annexeNextCodePreview(annexe) {
  if (!annexe) {
    const user = window.currentUser;
    annexe = (_annexes || []).find(a => a.id === user?.annexe_id)
          || (_annexes || []).find(a => a.is_principale)
          || (_annexes || [])[0]
          || (window.erpAnnexes || []).find(a => a.id === user?.annexe_id)
          || (window.erpAnnexes || []).find(a => a.is_principale)
          || (window.erpAnnexes || [])[0]
          || null;
  }
  const prefix = (annexe && annexe.code) ? annexe.code : 'PAP';
  let maxSeq = (annexe && typeof annexe.patient_seq === 'number') ? annexe.patient_seq : 0;

  // Kalkile pi gwo sekans ki egziste nan _patients pou prefiks sa a
  (_patients || []).forEach(p => {
    if (p.code && p.code.toUpperCase().startsWith(`${prefix}-`)) {
      const n = parseInt(p.code.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
  });

  return `${prefix}-${String(maxSeq + 1).padStart(4, '0')}`;
}

// Prochain numéro de dossier HRC (série générale continuing from 1161)
function getNextDossierPreview() {
  let maxNum = 1161;
  (_patients || []).forEach(p => {
    const raw = (p.numero_dossier || p.code || '');
    if (raw.toUpperCase().startsWith('HRC-')) {
      const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n) && n > maxNum && n < 2000) {
        maxNum = n;
      }
    }
  });
  return `HRC-${String(maxNum + 1).padStart(6, '0')}`;
}

function renderPatientFormHTML(user, canChooseAnnexe) {
  const annexesActives = (_annexes || []).filter(a => a.is_active);
  const userAnnexe = (_annexes || []).find(a => a.id === user?.annexe_id)
    || (_annexes || []).find(a => a.is_principale)
    || annexesActives[0]
    || (window.erpAnnexes || []).find(a => a.id === user?.annexe_id)
    || (window.erpAnnexes || []).find(a => a.is_principale)
    || (window.erpAnnexes || [])[0]
    || null;

  // Anplwaye: annex li a parèt otomatikman (readonly) + pwochen kòd la.
  // Direksyon: ka chwazi yon lòt annex; kòd la mete ajou otomatikman.
  const annexeField = canChooseAnnexe
    ? `<div class="form-group">
        <label class="form-label">Annexe *</label>
        <select name="annexe_id" class="form-select form-input" id="annexe-select">
          ${annexesActives.map(a =>
            `<option value="${a.id}" data-code="${escH(annexeNextCodePreview(a))}" ${(_editingPatient?.annexe_id || userAnnexe?.id) === a.id ? 'selected' : ''}>${a.code} — ${escH(a.nom)}</option>`).join('')}
        </select>
      </div>`
    : `<div class="form-group">
        <label class="form-label">Annexe (automatique)</label>
        <input type="text" class="form-input" readonly style="background: var(--clr-bg-soft, #f1f5f9);"
               value="${escH(userAnnexe ? `${userAnnexe.code} — ${userAnnexe.nom}` : 'Siège')}">
      </div>`;

  return `
  <form id="patient-form">
    <!-- FÈY 1 — Dosye & enfòmasyon pèsonèl -->
    <details class="card" open style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">I. Dossier &amp; Informations personnelles</h3></summary>
      <div class="card-body" style="padding: var(--space-5); display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px;">
        <div class="form-group">
          <label class="form-label">Code patient (automatique)</label>
          <input type="text" class="form-input" id="code-preview" name="code" readonly
                 value="${escH(_editingPatient?.code || annexeNextCodePreview(userAnnexe))}"
                 style="background: var(--clr-bg-soft, #f1f5f9); font-weight:600;">
          ${_editingPatient ? '' : '<small style="color:var(--clr-text-muted,#94a3b8);">Préfixe de votre annexe (ex: PAP-0001)</small>'}
        </div>
        ${annexeField}
        <div class="form-group">
          <label class="form-label">N° du dossier (U.N)</label>
          <input type="text" class="form-input" name="numero_dossier" id="numero-dossier-input"
                 value="${escH(_editingPatient?.numero_dossier || getNextDossierPreview())}"
                 style="font-weight:600;">
          ${_editingPatient ? '' : '<small style="color:var(--clr-text-muted,#94a3b8);">Série générale HRC (automatique)</small>'}
        </div>
        ${inCheckGroup('type_service', 'Type de service', [['PO','P/O'],['PHYSIO','PHYSIO'],['MED','MED']], true)}
        <div class="form-group">
          <label class="form-label">Photo du patient</label>
          <input type="file" name="photo_file" class="form-input" accept="image/*">
        </div>
        ${inText('date_enregistrement', "Date d'enregistrement", 'date')}
        ${inText('nom', 'Nom *', 'text', 'required')}
        ${inText('prenom', 'Prénom')}
        ${inText('date_naissance', 'Date de naissance', 'date')}
        ${inText('personne_responsable', 'Personne responsable')}
        ${inText('phone', 'Téléphone', 'tel')}
        ${inText('email', 'Email', 'email')}
        ${inText('adresse_rue', 'Adresse / N° maison / rue')}
        ${inText('province', 'Province / Arrondissement')}
        ${inCommune('commune', 'Commune')}
        ${inDepartement('departement', 'Département')}
        ${inText('localite', 'Village / Ville / Section')}
        ${inRadioGroup('sexe', 'Genre', [['M','Masculin'],['F','Féminin']])}
        ${inRadioGroup('etat_civil', 'État civil', [['celibataire','Célibataire'],['marie','Marié(e)'],['divorce','Divorcé(e)'],['veuf','Veuf(ve)']])}
        ${inText('carte_identite', "N° Carte d'identité")}
      </div>
    </details>

    <!-- FÈY 2 — Referans & invalidite -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">II. Référence &amp; Invalidité</h3></summary>
      <div class="card-body" style="padding: var(--space-5); display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px;">
        ${inText('envoye_de_autre', 'Référence (Envoyé de / Médecin / Hôpital / Physio)', 'text')}
        ${inRadioGroup('deja_appareille', 'Déjà appareillé', [['non','Non'],['oui','Oui'],['oui_hrc','Oui, par Haiti Reh-Care']])}
        ${inText('diagnostic', 'Diagnostic / Invalidité')}
        ${inCheckGroup('cause_invalidite', "Cause de l'invalidité", [['congenitale_infectieuse','Congénitale / Infectieuse'],['cancereuse','Cancéreuse'],['traumatique','Traumatique'],['vasculaire','Vasculaire']], true)}
        ${inCheckGroup('raison_trauma', 'Raison du trauma', [['morsure','Morsure'],['accident_professionnel','Accident professionnel'],['accident_circulation','Accident de circulation'],['accident_sport','Accident de sport'],['conflit','Liée au conflit']], true)}
      </div>
    </details>

    <!-- FÈY 3 — Nivo anplitasyon -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">III. Niveau d'amputation</h3></summary>
      <div class="card-body" style="padding: var(--space-5);">
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px; margin-bottom:16px;">
          ${inText('date_amputation', "Date d'amputation", 'date')}
          ${inText('hopital_amputation', "Hôpital d'amputation")}
          <div class="form-group">
            <label class="form-label">Région de l'accident</label>
            <input type="text" name="region_accident" class="form-input" list="dept-list">
            <datalist id="dept-list">
              ${HAITI_DEPARTEMENTS.map(d => `<option value="${d}">`).join('')}
            </datalist>
          </div>
          ${inText('lieu_accident', "Lieu de l'accident")}
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(260px,100%),1fr)); gap:16px;">
          <fieldset style="border:1px solid var(--clr-border,#e2e8f0); border-radius:8px; padding:12px;">
            <legend style="font-size:13px; font-weight:600; padding:0 6px;">Membre inférieur (MI)</legend>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(140px,100%),1fr)); gap:8px;">
              ${['gauche','droite'].map(side => `
                <div>
                  <strong style="font-size:12px;">MI ${side === 'gauche' ? 'GAUCHE' : 'DROITE'}</strong>
                  ${AMP_MI.map(([v,l]) => `
                    <label style="display:block; font-size:12px; font-weight:normal; margin-top:4px; cursor:pointer;">
                      <input type="checkbox" name="amp_mi_${side}" value="${v}"> ${l}
                    </label>`).join('')}
                </div>`).join('')}
            </div>
          </fieldset>
          <fieldset style="border:1px solid var(--clr-border,#e2e8f0); border-radius:8px; padding:12px;">
            <legend style="font-size:13px; font-weight:600; padding:0 6px;">Membre supérieur (MS)</legend>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(140px,100%),1fr)); gap:8px;">
              ${['gauche','droite'].map(side => `
                <div>
                  <strong style="font-size:12px;">MS ${side === 'gauche' ? 'GAUCHE' : 'DROITE'}</strong>
                  ${AMP_MS.map(([v,l]) => `
                    <label style="display:block; font-size:12px; font-weight:normal; margin-top:4px; cursor:pointer;">
                      <input type="checkbox" name="amp_ms_${side}" value="${v}"> ${l}
                    </label>`).join('')}
                </div>`).join('')}
            </div>
          </fieldset>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px; margin-top:16px;">
          ${inRadioGroup('activite', 'Activité', [['etudiant','Étudiant'],['salarie','Salarié'],['autres','Autres']])}
          ${inText('activite_autre', 'Autre activité (précisez)')}
          ${inText('nombre_enfants', "Nombre d'enfants", 'number', 'min="0"')}
        </div>
      </div>
    </details>

    <!-- FÈY 4 — Evalyasyon inisyal / anamnèz -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">IV. Évaluation initiale / Anamnèse</h3></summary>
      <div class="card-body" style="padding: var(--space-5); display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px;">
        ${inText('date_evaluation', "Date de l'évaluation", 'date')}
        ${inText('profession', 'Profession')}
        ${inArea('motif_consultation', 'Motif de consultation (anamnèse)')}
        ${inArea('antecedent_medical', 'Antécédent médical (cancer ou autre ?)')}
        ${inArea('antecedent_familial', 'Antécédent familial (problèmes de santé familiaux)')}
      </div>
    </details>

    <!-- FÈY 5 — Bilan konjitif & doulè -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">V. Bilan cognitif &amp; douleur</h3></summary>
      <div class="card-body" style="padding: var(--space-5); display:grid; grid-template-columns:1fr; gap:16px;">
        <div>
          <label class="form-label">3.2 Bilan cognitif</label>
          ${jsonInputs('bilan_cognitif', BILAN_COGNITIF_KEYS)}
        </div>
        <div>
          <label class="form-label">3.3 Bilan douleur</label>
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px;">
            ${inText('douleur_localisation', 'Localisation de la douleur')}
            <div class="form-group" style="grid-column: 1 / -1;">
              <label class="form-label">Niveau de douleur actuelle (0 = aucune, 10 = pire)</label>
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${Array.from({length: 11}, (_, i) => `
                  <label style="display:flex; align-items:center; gap:4px; font-size:13px; font-weight:normal; cursor:pointer;">
                    <input type="radio" name="douleur_niveau" value="${i}"> ${i}
                  </label>`).join('')}
              </div>
            </div>
            ${inCheckGroup('douleur_nature', 'Nature de la douleur', DOULEUR_NATURE)}
            ${inCheckGroup('douleur_aspect', 'Aspect de la douleur', DOULEUR_ASPECT)}
            ${inRadioGroup('douleur_sommeil', 'Impact sur le sommeil ?', [['non','Non'],['oui','Oui']])}
            ${inText('douleur_sommeil_detail', 'Si oui, précisez')}
            ${inText('douleur_facteurs_declenchants', 'Facteurs déclenchants')}
            ${inText('douleur_facteurs_calmants', 'Facteurs calmants')}
            ${inCheckGroup('douleur_symptomes', 'Symptômes', ['Perte de mouvement','Perte de force','Spasme musculaire'])}
          </div>
        </div>
        <div>
          <label class="form-label">Tests spécifiques — Étoile de Maigne</label>
          ${jsonInputs('etoile_maigne', MAIGNE_KEYS)}
        </div>
      </div>
    </details>

    <!-- FÈY 6 — Bilan fonksyonèl -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">VI. Bilan fonctionnel</h3></summary>
      <div class="card-body" style="padding: var(--space-5);">
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px; margin-bottom:16px;">
          ${inText('test_lasegue', 'Test de Lasègue (degré si positif)')}
          ${inText('autres_tests', 'Autres tests (précisez)')}
        </div>
        <p style="font-size:12px; color: var(--clr-text-muted,#94a3b8);">
          Échelle — 5: autonome · 4: seul avec difficultés · 3: aide matérielle · 2: aide humaine · 1: incapable
        </p>
        <div class="table-container">
          <table class="table" style="font-size:13px;">
            <thead><tr><th>Activité</th><th style="width:110px;">Score (1-5)</th></tr></thead>
            <tbody>
              ${FONCTIONNEL_ACTIVITES.map(([k, lbl]) => `
                <tr>
                  <td>${lbl}</td>
                  <td>
                    <select class="form-select form-input" data-json="bilan_fonctionnel" data-key="${k}" style="padding:4px 8px;">
                      <option value="">—</option>
                      ${[5,4,3,2,1].map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${inArea('bilan_fonctionnel_commentaire', 'Commentaire')}
      </div>
    </details>

    <!-- FÈY 7 — Bilan miskilè / atikilè -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">VII. Bilan musculaire / articulaire</h3></summary>
      <div class="card-body" style="padding: var(--space-5); overflow-x:auto;">
        <table class="table" style="font-size:12px; min-width:640px;">
          <thead>
            <tr>
              <th>Segment / Mouvement</th>
              <th>B.M. D</th><th>B.M. G</th><th>B.A. D</th><th>B.A. G</th>
            </tr>
          </thead>
          <tbody>
            ${MUSCULAIRE_ROWS.map(([seg, mvts]) => mvts.map(([mv, ml], i) => `
              <tr>
                <td>${i === 0 ? `<strong>${seg}</strong> — ` : ''}${ml}</td>
                ${['bm_d','bm_g','ba_d','ba_g'].map(c => `
                  <td><input type="text" class="form-input" style="padding:3px 6px; width:64px;"
                        data-json="bilan_musculaire" data-key="${seg.toLowerCase().replace(/[^a-z]/g,'')}_${mv}" data-sub="${c}"></td>
                `).join('')}
              </tr>`).join('')).join('')}
          </tbody>
        </table>
        <p style="font-size:12px; color: var(--clr-text-muted,#94a3b8); margin-bottom:0;">
          B.M. = Bilan musculaire · B.A. = Bilan articulaire · D = droite · G = gauche
        </p>
      </div>
    </details>

    <!-- FÈY 8 — Lòt enfòmasyon & objektif -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">VIII. Autres informations &amp; objectifs</h3></summary>
      <div class="card-body" style="padding: var(--space-5); display:grid; grid-template-columns:1fr; gap:16px;">
        ${inArea('bilans_complementaires', '4.6 Autres bilans (proprioception, respiratoire, orthopédique, sensibilité, complications, marche…)')}
        <div>
          <label class="form-label">Informations importantes</label>
          <div id="infos-importantes-rows"></div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addInfoImportanteRow()">
            <i data-lucide="plus"></i> Ajouter une ligne
          </button>
        </div>
        ${inArea('problemes', '5. Problèmes')}
        ${inArea('attentes_patient', '6. Attentes du patient')}
        ${inCheckGroup('objectifs', '7. Objectifs de traitement', [['prevention','Prévention des complications invalidantes'],['recuperation','Récupération ou maintien du niveau de fonction'],['autre','Autre (spécifiez)']], true)}
        ${inText('objectifs_autre', 'Autre objectif')}
        ${inArea('objectifs_court_terme', 'À court terme')}
      </div>
    </details>

    <!-- FÈY 9 — Preskripsyon & swivi -->
    <details class="card" style="margin-bottom:16px;">
      <summary class="card-header" style="cursor:pointer;"><h3 class="card-title">IX. Prescription &amp; suivi du traitement</h3></summary>
      <div class="card-body" style="padding: var(--space-5);">
        <label class="form-label">Plan d'exercices (initial)</label>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(min(300px,100%),1fr)); gap:8px 16px; margin-bottom:16px;">
          ${PLAN_EXERCICES.map(([k, lbl]) => `
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:normal; white-space:nowrap; cursor:pointer; min-width:150px;">
                <input type="checkbox" name="ex_${k}"> ${lbl}
              </label>
              <input type="text" class="form-input" name="exdet_${k}" placeholder="Détails" style="padding:4px 8px; font-size:12px;">
            </div>`).join('')}
        </div>
        ${inArea('contre_indication', 'Contre-indication')}
      </div>
    </details>

    <div style="display:flex; gap:12px; flex-wrap:wrap; position:sticky; bottom:0; padding:12px 0; background: var(--clr-bg, #fff);">
      <button type="submit" class="btn btn-primary">
        <i data-lucide="save"></i> ${_editingPatient ? 'Mettre à jour le dossier' : 'Enregistrer le patient'}
      </button>
      <button type="button" class="btn btn-secondary" onclick="patientShowList()">Annuler</button>
    </div>
  </form>`;
}

// --------------------------------------------------------------
// KOLEKTE DONE FÒM LA -> obj ki prale nan erp_register_patient
// --------------------------------------------------------------
function collectPatientForm(form) {
  const fd = new FormData(form);
  const data = {};

  const SIMPLE = ['code','numero_dossier','date_enregistrement','nom','prenom',
    'date_naissance','personne_responsable','phone','email','adresse_rue',
    'province','commune','departement','localite','sexe','etat_civil',
    'carte_identite','envoye_de_autre','deja_appareille','diagnostic',
    'date_amputation','hopital_amputation','region_accident','lieu_accident',
    'activite','activite_autre','date_evaluation','profession',
    'motif_consultation','antecedent_medical','antecedent_familial',
    'douleur_localisation','douleur_sommeil','douleur_sommeil_detail',
    'douleur_facteurs_declenchants','douleur_facteurs_calmants',
    'test_lasegue','autres_tests','bilan_fonctionnel_commentaire',
    'bilans_complementaires','problemes','attentes_patient',
    'objectifs_autre','objectifs_court_terme','contre_indication'];

  SIMPLE.forEach(k => {
    const v = fd.get(k);
    if (v !== null && v !== '') data[k] = v;
  });

  if (data.code && !data.numero_dossier) data.numero_dossier = data.code;
  if (!data.code && data.numero_dossier) data.code = data.numero_dossier;
  if (data.envoye_de_autre) data.envoye_de = [data.envoye_de_autre];

  const n = parseInt(fd.get('nombre_enfants'), 10);
  if (!isNaN(n)) data.nombre_enfants = n;
  const dn = parseInt(fd.get('douleur_niveau'), 10);
  if (!isNaN(dn)) data.douleur_niveau = dn;

  ['type_service','envoye_de','cause_invalidite','raison_trauma',
   'douleur_nature','douleur_aspect','douleur_symptomes','objectifs']
    .forEach(name => {
      const vals = fd.getAll(name);
      if (vals.length) data[name] = vals;
    });

  // JSONB: data-json + data-key (+ data-sub opsyonèl)
  form.querySelectorAll('[data-json]').forEach(el => {
    const g = el.dataset.json, k = el.dataset.key, sub = el.dataset.sub;
    const v = el.value;
    if (v === '' || v === null) return;
    data[g] = data[g] || {};
    if (sub) {
      data[g][k] = data[g][k] || {};
      data[g][k][sub] = v;
    } else {
      data[g][k] = v;
    }
  });

  // Nivo anplitasyon
  const amp = {};
  ['mi_gauche','mi_droite','ms_gauche','ms_droite'].forEach(side => {
    const vals = fd.getAll('amp_' + side);
    if (vals.length) amp[side] = vals;
  });
  if (Object.keys(amp).length) data.niveau_amputation = amp;

  // Plan egzèsis: checkbox + detay
  const plan = {};
  PLAN_EXERCICES.forEach(([k]) => {
    if (fd.get('ex_' + k) === 'on') {
      plan[k] = fd.get('exdet_' + k) || '';
    }
  });
  if (Object.keys(plan).length) data.plan_exercices = plan;

  // Enfòmasyon enpòtan (liy repete)
  const infos = [];
  form.querySelectorAll('#infos-importantes-rows .info-row').forEach(row => {
    const d = row.querySelector('[data-f="date"]')?.value;
    const i = row.querySelector('[data-f="info"]')?.value;
    if (d || i) infos.push({ date: d || null, info: i || '' });
  });
  if (infos.length) data.informations_importantes = infos;

  // Annex (direksyon sèlman — RPC la verifye)
  const ax = fd.get('annexe_id');
  if (ax) data.annexe_id = ax;

  return data;
}

// --------------------------------------------------------------
// RANPLI FÒM LA NAN MÒD EDIT
// --------------------------------------------------------------
function fillPatientForm(form, p) {
  if (!p) return;
  Object.keys(p).forEach(k => {
    const v = p[k];
    if (v === null || v === undefined) return;

    if (Array.isArray(v)) {
      form.querySelectorAll(`input[name="${k}"]`).forEach(cb => {
        cb.checked = v.includes(cb.value);
      });
      return;
    }
    if (typeof v === 'object') return; // jsonb — okipe pi ba

    const el = form.querySelector(`[name="${k}"]`);
    if (!el) return;
    if (el.type === 'radio') {
      const r = form.querySelector(`[name="${k}"][value="${CSS.escape(String(v))}"]`);
      if (r) r.checked = true;
    } else {
      el.value = v;
    }
  });

  // JSONB widgets
  ['bilan_cognitif','etoile_maigne','bilan_fonctionnel','bilan_musculaire'].forEach(g => {
    const obj = p[g];
    if (!obj || typeof obj !== 'object') return;
    form.querySelectorAll(`[data-json="${g}"]`).forEach(el => {
      const key = el.dataset.key, sub = el.dataset.sub;
      const val = sub ? obj[key]?.[sub] : obj[key];
      if (val !== undefined && val !== null) el.value = val;
    });
  });

  // Anplitasyon
  const amp = p.niveau_amputation || {};
  Object.keys(amp).forEach(side => {
    (amp[side] || []).forEach(v => {
      const cb = form.querySelector(`input[name="amp_${side}"][value="${v}"]`);
      if (cb) cb.checked = true;
    });
  });

  // Plan egzèsis
  const plan = p.plan_exercices || {};
  Object.keys(plan).forEach(k => {
    const cb = form.querySelector(`input[name="ex_${k}"]`);
    if (cb) cb.checked = true;
    const det = form.querySelector(`input[name="exdet_${k}"]`);
    if (det) det.value = plan[k];
  });

  // Enfòmasyon enpòtan
  (p.informations_importantes || []).forEach(row => addInfoImportanteRow(row));
}

function addInfoImportanteRow(row = {}) {
  const c = document.getElementById('infos-importantes-rows');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'info-row';
  div.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
  div.innerHTML = `
    <input type="date" class="form-input" data-f="date" value="${escH(row.date || '')}" style="max-width:170px;">
    <input type="text" class="form-input" data-f="info" value="${escH(row.info || '')}" placeholder="Information">
    <button type="button" class="table-action-btn danger" onclick="this.closest('.info-row').remove()">
      <i data-lucide="x"></i>
    </button>`;
  c.appendChild(div);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --------------------------------------------------------------
// FOTO — upload nan bucket 'erp-documents' (prive)
// --------------------------------------------------------------
async function uploadPatientPhoto(file, patientId) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `patients/${patientId || 'new'}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from('erp-documents').upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

async function patientPhotoSignedUrl(path) {
  if (!path) return null;
  if (/^https?:/.test(path)) return path;
  try {
    const { data } = await db.storage.from('erp-documents').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  } catch (e) { return null; }
}

// --------------------------------------------------------------
// VIIS — lis / fòm / dosye
// --------------------------------------------------------------
async function loadAllPatients() {
  let all = [];
  let from = 0;
  const batch = 1000;
  while (true) {
    const { data, error } = await db
      .from('erp_patients')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + batch - 1);
    if (error) {
      console.error('[patients] load error:', error);
      break;
    }
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < batch) break;
    from += batch;
  }
  return all;
}

async function renderPatientsModule(container, meta) {
  const user = window.currentUser;

  const [patients, { data: annexes }, { data: demandes }] = await Promise.all([
    loadAllPatients(),
    db.from('erp_annexes').select('*').eq('is_active', true).order('is_principale', { ascending: false }),
    loadDemandes()
  ]);
  _patients = patients || [];
  _annexes = annexes || [];
  _demandes = demandes || [];

  subscribeDemandes();

  if (_patientView === 'form') return renderPatientForm(container, user);
  if (_patientView === 'demandes') return renderDemandesList(container);
  if (_patientView === 'demande' && _currentDemande) {
    _currentDemande = _demandes.find(d => d.id === _currentDemande.id) || _currentDemande;
    return renderDemandeDetail(container, _currentDemande);
  }
  if (_patientView === 'lien') return renderPatientLink(container);
  if (_patientView === 'dossier' && _currentPatient) {
    // Mete ajou dosye a depi lis frech la (apre yon edit)
    _currentPatient = _patients.find(p => p.id === _currentPatient.id) || _currentPatient;
    return renderPatientDossier(container, _currentPatient);
  }
  renderPatientList(container);
}

// --------------------------------------------------------------
// DEMANDES EN LIGNE — chajman + realtime + toast
// --------------------------------------------------------------
async function loadDemandes() {
  try {
    // Tab la nan BRANCH_SCOPED_TABLES → filtè annex otomatik
    return await db.from('erp_patient_demandes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
  } catch (e) {
    console.warn('[demandes] load:', e);
    return { data: [] };
  }
}

function demandesEnAttente() {
  return _demandes.filter(d => d.statut === 'en_attente');
}

// Sekretè a resevwa demand yo OTOMATIKMAN (postgres_changes).
// Si realtime la pa aktive sou sèvè a, lis la mete ajou nan
// chak louvri modil + bouton "Actualiser".
// Èske nou sou paj modil "patients" la kounye a?
function onPatientsModulePage() {
  return /\/module\.html/.test(location.pathname)
    && new URLSearchParams(location.search).get('m') === 'patients';
}

function subscribeDemandes() {
  if (_demandesSubscribed || typeof db.channel !== 'function') return;
  _demandesSubscribed = true;
  try {
    db.channel('erp_patient_demandes_feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_patient_demandes' },
        (payload) => {
          const row = payload.new;
          if (!row || _demandes.some(d => d.id === row.id)) return;
          _demandes.unshift(row);
          demandeToast(`Nouvelle demande — ${[row.prenom, row.nom].filter(Boolean).join(' ')}`);
          // Rafrechi sèlman si itilizatè a toujou nan modil Patients la
          if (!onPatientsModulePage()) return;
          const c = document.getElementById('module-content');
          if (_patientView === 'list' && c) renderPatientList(c);
          if (_patientView === 'demandes' && c) renderDemandesList(c);
        })
      .subscribe();
  } catch (e) {
    console.warn('[demandes] realtime:', e);
  }
}

// Ti toast an ba a dwat lè yon demand rive
function demandeToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; background:#0f766e; color:#fff; padding:12px 18px; border-radius:12px; font-size:14px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,.2); cursor:pointer;';
  t.innerHTML = `<i data-lucide="inbox" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;"></i>${escH(msg)}`;
  t.onclick = () => {
    t.remove();
    if (onPatientsModulePage()) patientShowDemandes();
    else window.location.href = '/module.html?m=patients';
  };
  document.body.appendChild(t);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => t.remove(), 8000);
}

// --------------------------------------------------------------
// FILTÈ / TRI / ESTATISTIK
// --------------------------------------------------------------
const PATIENT_STATUTS = ['actif', 'en_cours', 'termine', 'inactif'];

function patientSortRows(rows) {
  const s = _patientSort;
  const copy = [...rows];
  if (s === 'code') {
    copy.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'fr'));
  } else if (s === 'nom') {
    copy.sort((a, b) => `${a.nom} ${a.prenom || ''}`.localeCompare(`${b.nom} ${b.prenom || ''}`, 'fr'));
  } else if (s === 'annexe') {
    copy.sort((a, b) => {
      const ca = _annexes.find(x => x.id === a.annexe_id)?.code || 'ZZZ';
      const cb = _annexes.find(x => x.id === b.annexe_id)?.code || 'ZZZ';
      return ca.localeCompare(cb) || (a.code || '').localeCompare(b.code || '');
    });
  } else {
    copy.sort((a, b) => String(b.date_enregistrement || b.created_at || '')
      .localeCompare(String(a.date_enregistrement || a.created_at || '')));
  }
  return copy;
}

function patientFilteredRows() {
  const q = _patientSearch.toLowerCase();
  return patientSortRows(_patients.filter(p =>
    (!q || `${p.code || ''} ${p.numero_dossier || ''} ${p.nom} ${p.prenom || ''} ${p.phone || ''}`.toLowerCase().includes(q))
    && (!_patientFilterAnnexe
        || (_patientFilterAnnexe === '__none__' ? !p.annexe_id : p.annexe_id === _patientFilterAnnexe))
    && (!_patientFilterStatut || (p.statut || 'actif') === _patientFilterStatut)
    && (!_patientFilterService || (p.type_service || []).includes(_patientFilterService))
  ));
}

function patientSetFilter(key, value) {
  if (key === 'annexe') _patientFilterAnnexe = value;
  if (key === 'statut') _patientFilterStatut = value;
  if (key === 'service') _patientFilterService = value;
  if (key === 'sort') _patientSort = value;
  const c = document.getElementById('module-content');
  if (c) renderPatientList(c);
}

function patientResetFilters() {
  _patientSearch = '';
  _patientFilterAnnexe = '';
  _patientFilterStatut = '';
  _patientFilterService = '';
  _patientSort = 'recent';
  const c = document.getElementById('module-content');
  if (c) renderPatientList(c);
}

// Panèl estatistik pa annex — pou direksyon an sèlman
function renderPatientStatsHTML() {
  const monthKey = new Date().toISOString().slice(0, 7);
  const total = _patients.length;
  const actifs = _patients.filter(p => (p.statut || 'actif') === 'actif').length;
  const newMonth = _patients.filter(p =>
    String(p.date_enregistrement || p.created_at || '').startsWith(monthKey)).length;
  const sansAnnexe = _patients.filter(p => !p.annexe_id).length;

  const card = (accent, icon, value, label, badge, onclick) => `
    <div class="pat-stat" style="--accent:${accent};" ${onclick ? `onclick="${onclick}"` : ''}>
      <div class="pat-stat-top">
        <div class="pat-stat-icon"><i data-lucide="${icon}"></i></div>
        ${badge ? `<span class="pat-stat-badge">${badge}</span>` : ''}
      </div>
      <div class="pat-stat-value">${value}</div>
      <div class="pat-stat-label">${label}</div>
    </div>`;

  const annexeCards = _annexes.map(a => {
    const count = _patients.filter(p => p.annexe_id === a.id).length;
    return card('#8B5CF6', 'building-2', count,
      `${escH(a.code)} — ${escH(a.nom)}`,
      `proch. ${escH(annexeNextCodePreview(a))}`,
      `patientSetFilter('annexe','${a.id}')`);
  }).join('');

  const noneCard = sansAnnexe
    ? card('#94A3B8', 'help-circle', sansAnnexe, 'Sans annexe', '',
        `patientSetFilter('annexe','__none__')`)
    : '';

  return `
  <style>
    .pat-stats { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:14px; margin-bottom:22px; }
    .pat-stat { background:var(--clr-card,#fff); border:1px solid var(--clr-border,#e2e8f0); border-radius:14px; padding:16px; cursor:pointer; transition:transform .15s, box-shadow .15s; }
    .pat-stat:hover { transform:translateY(-2px); box-shadow:0 8px 18px rgba(0,0,0,.07); }
    .pat-stat-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
    .pat-stat-icon { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; color:var(--accent); background:color-mix(in srgb, var(--accent) 12%, transparent); }
    .pat-stat-icon i { width:19px; height:19px; }
    .pat-stat-badge { font-size:10px; font-weight:600; color:var(--accent); background:color-mix(in srgb, var(--accent) 10%, transparent); padding:3px 8px; border-radius:999px; }
    .pat-stat-value { font-size:24px; font-weight:700; color:var(--clr-text,#1e293b); }
    .pat-stat-label { font-size:12px; color:var(--clr-text-secondary,#64748b); margin-top:2px; }
  </style>
  <div class="pat-stats">
    ${card('#2563EB', 'users', total, 'Total patients', `${newMonth} ce mois`, `patientSetFilter('annexe','')`)}
    ${card('#10B981', 'user-check', actifs, 'Patients actifs', '', `patientSetFilter('statut','actif')`)}
    ${annexeCards}
    ${noneCard}
  </div>`;
}

function renderPatientList(container) {
  const user = window.currentUser;
  const canSeeStats = STAFF_DIRECTION.includes(user?.role)
    || ['secretaire', 'receptionniste', 'manager'].includes(user?.role)
    || (typeof isErpOwner === 'function' && isErpOwner(user));
  const annexeOf = (p) => _annexes.find(a => a.id === p.annexe_id);
  const rows = patientFilteredRows();

  const statutsInData = [...new Set(_patients.map(p => p.statut || 'actif'))];
  const servicesInData = [...new Set(_patients.flatMap(p => p.type_service || []))];
  const hasFilters = _patientFilterAnnexe || _patientFilterStatut || _patientFilterService;

  container.innerHTML = `
    ${canSeeStats ? renderPatientStatsHTML() : ''}
    <div class="page-header">
      <div class="topbar-search" style="max-width:320px;">
        <i data-lucide="search"></i>
        <input type="text" id="patient-search" placeholder="Rechercher (code, nom, téléphone)..."
               value="${escH(_patientSearch)}">
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="patientShowDemandes()">
          <i data-lucide="inbox"></i> Demandes
          ${demandesEnAttente().length
            ? `<span style="background:#d97706; color:#fff; font-size:11px; font-weight:700; border-radius:999px; padding:2px 8px; margin-left:4px;">${demandesEnAttente().length}</span>`
            : ''}
        </button>
        <button class="btn btn-secondary" onclick="patientShowLien()" title="Lien & QR code du formulaire en ligne">
          <i data-lucide="qr-code"></i> Formulaire en ligne
        </button>
        <button class="btn btn-primary" onclick="patientShowForm()">
          <i data-lucide="plus"></i> Nouveau patient
        </button>
      </div>
    </div>
    <div class="filters-bar" style="margin-bottom:16px;">
      <select class="form-select form-input" style="max-width:210px;"
              onchange="patientSetFilter('annexe', this.value)">
        <option value="">Toutes les annexes</option>
        ${_annexes.map(a =>
          `<option value="${a.id}" ${_patientFilterAnnexe === a.id ? 'selected' : ''}>${escH(a.code)} — ${escH(a.nom)}</option>`).join('')}
        <option value="__none__" ${_patientFilterAnnexe === '__none__' ? 'selected' : ''}>Sans annexe</option>
      </select>
      <select class="form-select form-input" style="max-width:170px;"
              onchange="patientSetFilter('statut', this.value)">
        <option value="">Tous les statuts</option>
        ${statutsInData.map(s =>
          `<option value="${escH(s)}" ${_patientFilterStatut === s ? 'selected' : ''}>${escH(s)}</option>`).join('')}
      </select>
      <select class="form-select form-input" style="max-width:160px;"
              onchange="patientSetFilter('service', this.value)">
        <option value="">Tous services</option>
        ${servicesInData.map(s =>
          `<option value="${escH(s)}" ${_patientFilterService === s ? 'selected' : ''}>${escH(s)}</option>`).join('')}
      </select>
      <select class="form-select form-input" style="max-width:190px;"
              onchange="patientSetFilter('sort', this.value)">
        <option value="recent" ${_patientSort === 'recent' ? 'selected' : ''}>Plus récents</option>
        <option value="code" ${_patientSort === 'code' ? 'selected' : ''}>Trier par code</option>
        <option value="nom" ${_patientSort === 'nom' ? 'selected' : ''}>Trier par nom (A-Z)</option>
        <option value="annexe" ${_patientSort === 'annexe' ? 'selected' : ''}>Trier par annexe</option>
      </select>
      ${hasFilters ? `<button class="btn btn-ghost" onclick="patientResetFilters()">
        <i data-lucide="x"></i> Réinitialiser
      </button>` : ''}
      <span style="margin-left:auto; font-size:13px; color:var(--clr-text-muted,#94a3b8); align-self:center;">
        ${rows.length} / ${_patients.length} patient(s)
      </span>
    </div>
    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Code</th><th>N° Dossier</th><th>Patient</th><th>Annexe</th><th>Service</th>
              <th>Téléphone</th><th>Enregistré le</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(p => `
              <tr>
                <td><strong>${escH(p.code || '-')}</strong></td>
                <td><span style="font-weight:600; color:var(--clr-primary,#4f46e5);">${escH(p.numero_dossier || '-')}</span></td>
                <td>${escH(p.nom)} ${escH(p.prenom || '')}</td>
                <td>${escH(annexeOf(p)?.code || '-')}</td>
                <td>${(p.type_service || []).join(', ') || '-'}</td>
                <td>${escH(p.phone || '-')}</td>
                <td>${p.date_enregistrement || (p.created_at || '').slice(0,10) || '-'}</td>
                <td><span class="status-badge ${p.statut === 'actif' ? 'active' : 'pending'}">${escH(p.statut || 'actif')}</span></td>
                <td>
                  <button class="table-action-btn" onclick="patientShowDossier('${p.id}')">
                    <i data-lucide="folder-open"></i> Dossier
                  </button>
                </td>
              </tr>`).join('')
            : `<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--clr-text-muted,#94a3b8);">Aucun patient ${hasFilters ? 'ne correspond aux filtres.' : 'enregistré.'}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('patient-search')?.addEventListener('input', (e) => {
    _patientSearch = e.target.value;
    renderPatientList(container);
    const inp = document.getElementById('patient-search');
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderPatientForm(container, user) {
  const canChoose = STAFF_DIRECTION.includes(user?.role) || (typeof isErpOwner === 'function' && isErpOwner(user));
  const fromDemande = _prefillPatient && !_editingPatient;
  container.innerHTML = `
    <div class="page-header">
      <h2 style="margin:0;">${_editingPatient ? 'Modifier le dossier' : 'Nouveau patient'}</h2>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="patientShowList()">
          <i data-lucide="arrow-left"></i> Retour à la liste
        </button>
      </div>
    </div>
    ${fromDemande ? `
      <div class="card" style="margin-bottom:16px; border-left:4px solid #0d9488; padding:14px 18px; display:flex; align-items:center; gap:12px;">
        <i data-lucide="inbox" style="color:#0d9488;"></i>
        <div style="font-size:14px;">
          <strong>Demande en ligne</strong> — le formulaire est pré-rempli avec les
          informations du patient. Vérifiez, complétez puis
          <strong>Enregistrer le patient</strong> pour créer le dossier.
        </div>
      </div>` : ''}
    ${renderPatientFormHTML(user, canChoose)}`;

  const form = document.getElementById('patient-form');

  // Direksyon: preview kòd la swiv annex ki chwazi a
  const annexeSelect = form.querySelector('#annexe-select');
  const codePreview = form.querySelector('#code-preview');
  const updateCodePreview = () => {
    const opt = annexeSelect?.selectedOptions?.[0];
    if (opt && codePreview && !_editingPatient) codePreview.value = opt.dataset.code || '—';
  };
  if (annexeSelect) {
    annexeSelect.addEventListener('change', updateCodePreview);
    updateCodePreview();
  }


  // Depatman -> filtre lis komin yo
  const deptSelect = form.querySelector('#patient-departement');
  const communeList = form.querySelector('#commune-list');
  const fillCommunes = () => {
    if (!communeList) return;
    const communes = deptSelect?.value && HAITI_GEO[deptSelect.value]
      ? HAITI_GEO[deptSelect.value] : HAITI_ALL_COMMUNES;
    communeList.innerHTML = communes.map(c => `<option value="${escH(c)}">`).join('');
  };
  if (deptSelect) deptSelect.addEventListener('change', fillCommunes);

  addInfoImportanteRow();
  if (_editingPatient) {
    fillPatientForm(form, _editingPatient);
    fillCommunes();
  } else if (_prefillPatient) {
    fillPatientForm(form, _prefillPatient);
    fillCommunes();
  } else {
    fillCommunes();
  }

  form.addEventListener('submit', (e) => submitPatientForm(e, container));
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function submitPatientForm(e, container) {
  e.preventDefault();
  const form = e.target;
  const data = collectPatientForm(form);
  if (!data.nom) { alert('Le nom du patient est obligatoire.'); return; }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    // Foto (opsyonèl)
    const photoFile = form.querySelector('input[name="photo_file"]')?.files?.[0];
    if (photoFile) {
      try { data.photo_url = await uploadPatientPhoto(photoFile, _editingPatient?.id); }
      catch (pe) { console.warn('Photo upload:', pe); }
    }

    if (_editingPatient) {
      delete data.annexe_id; // annex la pa chanje nan edit
      const { error } = await db.from('erp_patients').update(data).eq('id', _editingPatient.id);
      if (error) throw error;
      if (typeof logActivity === 'function') logActivity('Modification', 'Patients', `Dossier ${_editingPatient.code || ''} mis à jour`);
      patientShowDossier(_editingPatient.id, container);
      return;
    }

    let created = null;
    if (!data.code || data.code === '—') {
      const codeInp = form.querySelector('#code-preview');
      data.code = (codeInp && codeInp.value && codeInp.value !== '—') ? codeInp.value.trim() : annexeNextCodePreview();
    }
    if (!data.numero_dossier) {
      const dosInp = form.querySelector('#numero-dossier-input');
      data.numero_dossier = (dosInp && dosInp.value) ? dosInp.value.trim() : getNextDossierPreview();
    }

    // Eseye RPC erp_register_patient
    const { data: rpcData, error: rpcErr } = await db.rpc('erp_register_patient', { p_data: data });
    if (!rpcErr && rpcData) {
      created = rpcData;
    } else {
      // Fallback: fè insert dirèk nan erp_patients
      const annId = data.annexe_id || (typeof getInsertAnnexeId === 'function' ? getInsertAnnexeId() : null);
      const payload = {
        ...data,
        numero_dossier: data.numero_dossier || getNextDossierPreview(),
        annexe_id: annId || undefined,
        enterprise_id: window.enterpriseContext?.enterprise?.id || undefined,
        created_by: window.currentUser?.id || undefined,
        statut: 'actif',
        is_active: true
      };
      const { data: insData, error: insErr } = await db
        .from('erp_patients')
        .insert(payload)
        .select()
        .single();
      if (insErr) throw insErr;
      created = insData;
    }

    if (typeof logActivity === 'function') logActivity('Création', 'Patients', `Patient ${created?.code || ''} enregistré`);

    // Si dosye a soti nan yon demand anliy → maké l "traite" + lyen l
    if (_demandeEnCours) {
      try {
        await db.from('erp_patient_demandes').update({
          statut: 'traite',
          patient_id: created?.id || null,
          traite_par: window.currentUser?.id || null,
          traite_at: new Date().toISOString()
        }).eq('id', _demandeEnCours);
        const dd = _demandes.find(x => x.id === _demandeEnCours);
        if (dd) { dd.statut = 'traite'; dd.patient_id = created?.id || null; }
      } catch (e) {
        console.warn('[demandes] marquage traité:', e);
      }
    }
    _demandeEnCours = null;
    _prefillPatient = null;

    _patientView = 'list';
    _editingPatient = null;
    await renderPatientsModule(container);
    if (created?.code) alert(`Patient enregistré — Code: ${created.code}`);
  } catch (err) {
    console.error('Patient save error:', err);
    alert('Erreur: ' + (err.message || err));
    btn.disabled = false;
  }
}

// --------------------------------------------------------------
// DOSYE PASYAN — rezime + reevalyasyon (Fèy 10)
// --------------------------------------------------------------
async function renderPatientDossier(container, p) {
  const annexe = _annexes.find(a => a.id === p.annexe_id);
  const photoUrl = await patientPhotoSignedUrl(p.photo_url);
  const { data: reevals } = await db
    .from('erp_patient_reevaluations')
    .select('*')
    .eq('patient_id', p.id)
    .order('date_reevaluation', { ascending: false });

  const row = (lbl, val) => val ? `<div><div class="user-card-detail-label">${lbl}</div><div class="user-card-detail-value">${escH(Array.isArray(val) ? val.join(', ') : val)}</div></div>` : '';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">${escH(p.nom)} ${escH(p.prenom || '')}</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Code: <strong>${escH(p.code || '-')}</strong> · Annexe: ${escH(annexe?.nom || '-')}
          ${p.numero_dossier ? ` · Dossier U.N: ${escH(p.numero_dossier)}` : ''}
        </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="patientEdit('${p.id}')">
          <i data-lucide="pencil"></i> Modifier
        </button>
        <button class="btn btn-secondary" onclick="patientShowList()">
          <i data-lucide="arrow-left"></i> Liste
        </button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(300px,100%), 1fr)); gap:16px;">
      <div class="card" style="padding: var(--space-5);">
        <h3 class="card-title" style="margin-bottom:12px;">Informations personnelles</h3>
        ${photoUrl ? `<img src="${photoUrl}" alt="Photo" style="width:84px; height:84px; object-fit:cover; border-radius:10px; margin-bottom:12px;">` : ''}
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(150px,100%),1fr)); gap:10px;">
          ${row('Né(e) le', p.date_naissance)}
          ${row('Genre', p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : p.sexe)}
          ${row('État civil', p.etat_civil)}
          ${row("Carte d'identité", p.carte_identite)}
          ${row('Téléphone', p.phone)}
          ${row('Email', p.email)}
          ${row('Responsable', p.personne_responsable)}
          ${row('Service', (p.type_service || []).join(', '))}
          ${row('Adresse', [p.adresse_rue || p.adresse, p.localite, p.commune, p.departement, p.province].filter(Boolean).join(', '))}
        </div>
      </div>

      <div class="card" style="padding: var(--space-5);">
        <h3 class="card-title" style="margin-bottom:12px;">Référence &amp; invalidité</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(150px,100%),1fr)); gap:10px;">
          ${row('Envoyé de', (p.envoye_de || []).concat(p.envoye_de_autre ? [p.envoye_de_autre] : []))}
          ${row('Déjà appareillé', {non:'Non', oui:'Oui', oui_hrc:'Oui — Haiti Reh-Care'}[p.deja_appareille])}
          ${row('Diagnostic', p.diagnostic)}
          ${row("Cause", p.cause_invalidite)}
          ${row('Trauma', p.raison_trauma)}
          ${row('Activité', p.activite)}
          ${row('Enfants', p.nombre_enfants)}
        </div>
      </div>

      ${p.motif_consultation || p.antecedent_medical ? `
      <div class="card" style="padding: var(--space-5);">
        <h3 class="card-title" style="margin-bottom:12px;">Évaluation initiale</h3>
        <div style="display:grid; gap:10px;">
          ${row('Motif', p.motif_consultation)}
          ${row('Antécédent médical', p.antecedent_medical)}
          ${row('Antécédent familial', p.antecedent_familial)}
          ${row('Problèmes', p.problemes)}
          ${row('Attentes', p.attentes_patient)}
          ${row('Objectifs court terme', p.objectifs_court_terme)}
          ${row('Contre-indication', p.contre_indication)}
        </div>
      </div>` : ''}
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-header"><h3 class="card-title">Fiches de réévaluation</h3></div>
      <div class="card-body" style="padding: var(--space-5);">
        ${(reevals || []).length ? `
          <div class="table-container" style="margin-bottom:16px;">
            <table class="table" style="font-size:13px;">
              <thead><tr><th>Date</th><th>Conclusion</th><th>Fréquence Tx</th><th>Évaluateur</th></tr></thead>
              <tbody>
                ${reevals.map(r => `
                  <tr>
                    <td>${r.date_reevaluation || ''}</td>
                    <td>${escH(r.conclusion || '-')}</td>
                    <td>${escH(r.frequence_tx || '-')}</td>
                    <td>${escH(r.evaluateur_nom || '-')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<p style="color:var(--clr-text-muted,#94a3b8);">Aucune réévaluation enregistrée.</p>'}

        <details>
          <summary style="cursor:pointer; font-weight:600; font-size:14px;">+ Nouvelle réévaluation</summary>
          <form id="reeval-form" style="margin-top:12px; display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:16px;">
            ${inText('date_reevaluation', 'Date', 'date')}
            ${inText('frequence_tx', 'Fréquence de Tx')}
            ${inText('evaluateur_nom', "Nom de l'évaluateur")}
            ${inArea('conclusion', 'Conclusion')}
            ${inArea('modifications_text', 'Modifications du plan (exercices + / -) — une par ligne')}
            <div class="form-group" style="grid-column: 1 / -1;">
              <button type="submit" class="btn btn-primary btn-sm"><i data-lucide="plus"></i> Ajouter</button>
            </div>
          </form>
        </details>
      </div>
    </div>`;

  document.getElementById('reeval-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const modifs = String(fd.get('modifications_text') || '')
      .split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => ({ date: fd.get('date_reevaluation') || null, modification: l }));
    const rec = {
      patient_id: p.id,
      date_reevaluation: fd.get('date_reevaluation') || null,
      conclusion: fd.get('conclusion') || null,
      modifications: modifs,
      frequence_tx: fd.get('frequence_tx') || null,
      evaluateur_nom: fd.get('evaluateur_nom') || null,
      created_by: window.currentUser?.id || null
    };
    const { error } = await db.from('erp_patient_reevaluations').insert(rec);
    if (error) { alert('Erreur: ' + error.message); return; }
    if (typeof logActivity === 'function') logActivity('Réévaluation', 'Patients', `Réévaluation ${p.code || p.nom}`);
    renderPatientDossier(container, p);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --------------------------------------------------------------
// Navigasyon ant viu yo
// --------------------------------------------------------------
function patientShowList() {
  _patientView = 'list';
  _editingPatient = null;
  _currentPatient = null;
  _prefillPatient = null;
  _demandeEnCours = null;
  const c = document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}
function patientShowForm() {
  _patientView = 'form';
  _editingPatient = null;
  _prefillPatient = null;
  _demandeEnCours = null;
  const c = document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}
function patientEdit(id) {
  _editingPatient = _patients.find(p => p.id === id) || _currentPatient;
  _prefillPatient = null;
  _demandeEnCours = null;
  _patientView = 'form';
  const c = document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}
function patientShowDossier(id, container) {
  _currentPatient = _patients.find(p => p.id === id) || _currentPatient;
  _patientView = 'dossier';
  const c = container || document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}

// --------------------------------------------------------------
// DEMANDES EN LIGNE — lis, detay, validasyon
// --------------------------------------------------------------
function patientShowDemandes() {
  _patientView = 'demandes';
  const c = document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}
function patientShowLien() {
  _patientView = 'lien';
  const c = document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}
function demandeSetStatut(v) {
  _demandeStatutFilter = v;
  const c = document.getElementById('module-content');
  if (c) renderDemandesList(c);
}
async function demandesRefresh() {
  const c = document.getElementById('module-content');
  const { data } = await loadDemandes();
  _demandes = data || [];
  if (c) renderDemandesList(c);
}

const DEMANDE_STATUTS = {
  en_attente: ['pending', 'En attente'],
  traite:     ['active', 'Traitée'],
  rejete:     ['inactive', 'Rejetée']
};

function renderDemandesList(container) {
  const rows = _demandeStatutFilter
    ? _demandes.filter(d => d.statut === _demandeStatutFilter)
    : _demandes;
  const annexeOf = (d) => _annexes.find(a => a.id === d.annexe_id);
  const counts = {
    en_attente: _demandes.filter(d => d.statut === 'en_attente').length,
    traite: _demandes.filter(d => d.statut === 'traite').length,
    rejete: _demandes.filter(d => d.statut === 'rejete').length
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Demandes en ligne</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Formulaires remplis par les patients depuis le lien / QR code — ils arrivent ici automatiquement.
        </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="demandesRefresh()">
          <i data-lucide="refresh-cw"></i> Actualiser
        </button>
        <button class="btn btn-secondary" onclick="patientShowLien()">
          <i data-lucide="qr-code"></i> Lien &amp; QR code
        </button>
        <button class="btn btn-secondary" onclick="patientShowList()">
          <i data-lucide="arrow-left"></i> Liste patients
        </button>
      </div>
    </div>
    <div class="filters-bar" style="margin-bottom:16px;">
      <select class="form-select form-input" style="max-width:220px;"
              onchange="demandeSetStatut(this.value)">
        <option value="en_attente" ${_demandeStatutFilter === 'en_attente' ? 'selected' : ''}>En attente (${counts.en_attente})</option>
        <option value="traite" ${_demandeStatutFilter === 'traite' ? 'selected' : ''}>Traitées (${counts.traite})</option>
        <option value="rejete" ${_demandeStatutFilter === 'rejete' ? 'selected' : ''}>Rejetées (${counts.rejete})</option>
        <option value="" ${_demandeStatutFilter === '' ? 'selected' : ''}>Toutes (${_demandes.length})</option>
      </select>
    </div>
    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Reçue le</th><th>Patient</th><th>Téléphone</th>
              <th>Annexe</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(d => {
              const [cls, lbl] = DEMANDE_STATUTS[d.statut] || ['pending', d.statut];
              return `
              <tr>
                <td>${escH((d.created_at || '').slice(0, 16).replace('T', ' '))}</td>
                <td><strong>${escH(d.nom)}</strong> ${escH(d.prenom || '')}</td>
                <td>${escH(d.phone || '-')}</td>
                <td>${escH(annexeOf(d)?.code || 'Toutes')}</td>
                <td><span class="status-badge ${cls}">${lbl}</span></td>
                <td>
                  <button class="table-action-btn" onclick="demandeShowDetail('${d.id}')">
                    <i data-lucide="eye"></i> Voir
                  </button>
                </td>
              </tr>`;
            }).join('')
            : `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--clr-text-muted,#94a3b8);">
                 Aucune demande ${_demandeStatutFilter === 'en_attente' ? 'en attente — les nouvelles demandes apparaîtront ici automatiquement.' : 'dans cette catégorie.'}
               </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function demandeShowDetail(id) {
  _currentDemande = _demandes.find(d => d.id === id);
  _patientView = 'demande';
  const c = document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}

function renderDemandeDetail(container, d) {
  const p = d.payload || {};
  const annexe = _annexes.find(a => a.id === d.annexe_id);
  const [cls, lbl] = DEMANDE_STATUTS[d.statut] || ['pending', d.statut];
  const patientLinked = d.patient_id ? _patients.find(x => x.id === d.patient_id) : null;

  const row = (l, val) => val
    ? `<div><div class="user-card-detail-label">${l}</div><div class="user-card-detail-value">${escH(Array.isArray(val) ? val.join(', ') : val)}</div></div>`
    : '';
  const ampLabels = Object.fromEntries(AMP_MI.concat(AMP_MS));
  const amp = p.niveau_amputation || {};
  const ampRows = Object.entries(amp)
    .filter(([, v]) => Array.isArray(v) && v.length)
    .map(([k, v]) => row(k.replace(/_/g, ' ').toUpperCase(), v.map(x => ampLabels[x] || x)))
    .join('');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">${escH(d.nom)} ${escH(d.prenom || '')}</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Demande reçue le ${escH((d.created_at || '').slice(0, 16).replace('T', ' '))}
          · Annexe: ${escH(annexe?.nom || 'Toutes')}
          · <span class="status-badge ${cls}">${lbl}</span>
        </p>
      </div>
      <div class="page-actions">
        ${d.statut === 'en_attente' ? `
          <button class="btn btn-primary" onclick="demandeToPatient('${d.id}')">
            <i data-lucide="folder-plus"></i> Créer le dossier
          </button>
          <button class="btn btn-secondary" onclick="demandeRejeter('${d.id}')">
            <i data-lucide="x"></i> Rejeter
          </button>` : ''}
        ${patientLinked ? `
          <button class="btn btn-primary" onclick="patientShowDossier('${patientLinked.id}')">
            <i data-lucide="folder-open"></i> Ouvrir le dossier ${escH(patientLinked.code || '')}
          </button>` : ''}
        <button class="btn btn-secondary" onclick="patientShowDemandes()">
          <i data-lucide="arrow-left"></i> Demandes
        </button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(300px,100%), 1fr)); gap:16px;">
      <div class="card" style="padding: var(--space-5);">
        <h3 class="card-title" style="margin-bottom:12px;">Informations personnelles</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(150px,100%),1fr)); gap:10px;">
          ${row('Né(e) le', p.date_naissance)}
          ${row('Genre', p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : p.sexe)}
          ${row('État civil', p.etat_civil)}
          ${row("Carte d'identité", p.carte_identite)}
          ${row('Téléphone', p.phone)}
          ${row('Email', p.email)}
          ${row('Responsable', p.personne_responsable)}
          ${row('Profession', p.profession)}
          ${row('Activité', p.activite)}
          ${row('Enfants', p.nombre_enfants)}
          ${row('Service', (p.type_service || []).join(', '))}
          ${row('Adresse', [p.adresse_rue, p.localite, p.commune, p.departement, p.province].filter(Boolean).join(', '))}
        </div>
      </div>

      <div class="card" style="padding: var(--space-5);">
        <h3 class="card-title" style="margin-bottom:12px;">Référence &amp; santé</h3>
        <div style="display:grid; gap:10px;">
          ${row('Envoyé de', (p.envoye_de || []).concat(p.envoye_de_autre ? [p.envoye_de_autre] : []))}
          ${row('Déjà appareillé', { non: 'Non', oui: 'Oui', oui_hrc: 'Oui — Haiti Reh-Care' }[p.deja_appareille])}
          ${row('Diagnostic', p.diagnostic)}
          ${row('Cause', p.cause_invalidite)}
          ${row('Trauma', p.raison_trauma)}
          ${row('Motif', p.motif_consultation)}
          ${row('Antécédent médical', p.antecedent_medical)}
          ${row('Antécédent familial', p.antecedent_familial)}
          ${row('Douleur', [p.douleur_localisation, p.douleur_niveau != null ? `${p.douleur_niveau}/10` : ''].filter(Boolean).join(' — '))}
          ${row('Attentes', p.attentes_patient)}
        </div>
      </div>

      ${ampRows || p.date_amputation ? `
      <div class="card" style="padding: var(--space-5);">
        <h3 class="card-title" style="margin-bottom:12px;">Amputation</h3>
        <div style="display:grid; gap:10px;">
          ${row("Date d'amputation", p.date_amputation)}
          ${row('Hôpital', p.hopital_amputation)}
          ${row("Région de l'accident", p.region_accident)}
          ${row("Lieu de l'accident", p.lieu_accident)}
          ${ampRows}
        </div>
      </div>` : ''}
    </div>`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Konvèti demand la an dosye: fòm konplè a pre-ranpli →
// erp_register_patient la kreye dosye a ak kòd otomatik la.
function demandeToPatient(id) {
  const d = _demandes.find(x => x.id === id);
  if (!d) return;
  _prefillPatient = { ...(d.payload || {}) };
  if (d.annexe_id) _prefillPatient.annexe_id = d.annexe_id; // pre-chwazi annex demand la
  _demandeEnCours = d.id;
  _editingPatient = null;
  _patientView = 'form';
  const c = document.getElementById('module-content');
  if (c) renderPatientsModule(c);
}

async function demandeRejeter(id) {
  if (!confirm('Rejeter cette demande ?')) return;
  const { error } = await db.from('erp_patient_demandes').update({
    statut: 'rejete',
    traite_par: window.currentUser?.id || null,
    traite_at: new Date().toISOString()
  }).eq('id', id);
  if (error) { alert('Erreur: ' + error.message); return; }
  const d = _demandes.find(x => x.id === id);
  if (d) d.statut = 'rejete';
  _demandeStatutFilter = 'en_attente';
  patientShowDemandes();
}

// --------------------------------------------------------------
// LYEN + QR CODE — fòm piblik la pou telefòn pasyan an
// --------------------------------------------------------------
// Domèn piblik pwojè a. Lyen/QR la fèt pou telefòn pasyan an —
// li pa janm ka rive sou 127.0.0.1/localhost (dev lokal), kidonk
// nan ka sa a nou sèvi ak URL Vercel la (oswa company_website nan
// paramèt antrepriz la si li konfigire).
const PATIENT_FORM_ORIGIN = 'https://haitirecare-erp-phi.vercel.app';

function patientFormUrl(annexeCode) {
  const isLocal = location.protocol === 'file:'
    || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  const configured = (window.enterpriseContext?.enterprise?.company_website || '')
    .replace(/\/+$/, '');
  const origin = isLocal ? (configured || PATIENT_FORM_ORIGIN) : location.origin;
  const base = `${origin}/site/inscription.html`;
  return annexeCode ? `${base}?a=${encodeURIComponent(annexeCode)}` : base;
}

let _qrLibPromise = null;
function ensureQrLib() {
  if (_qrLibPromise) return _qrLibPromise;
  _qrLibPromise = new Promise((resolve) => {
    if (typeof qrcode !== 'undefined') return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return _qrLibPromise;
}

async function renderQrBox() {
  const el = document.getElementById('qr-box');
  if (!el) return;
  const url = patientFormUrl(_lienAnnexeCode);
  el.innerHTML = '<div style="padding:40px; color:var(--clr-text-muted,#94a3b8); font-size:13px;">Génération…</div>';
  const ok = await ensureQrLib();
  if (!ok) {
    el.innerHTML = '<div style="padding:40px; color:var(--clr-text-muted,#94a3b8); font-size:13px; text-align:center;">QR code indisponible hors ligne —<br>copiez le lien ci-dessus.</div>';
    return;
  }
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    el.innerHTML = qr.createSvgTag(6, 4);
  } catch (e) {
    el.innerHTML = '<div style="padding:40px; font-size:13px;">Erreur QR — copiez le lien.</div>';
  }
}

function lienSetAnnexe(code) {
  _lienAnnexeCode = code;
  const inp = document.getElementById('lien-url');
  if (inp) inp.value = patientFormUrl(code);
  renderQrBox();
}

async function lienCopier() {
  const url = patientFormUrl(_lienAnnexeCode);
  try {
    await navigator.clipboard.writeText(url);
    alert('Lien copié !');
  } catch (e) {
    const inp = document.getElementById('lien-url');
    if (inp) { inp.select(); document.execCommand('copy'); alert('Lien copié !'); }
  }
}

function renderPatientLink(container) {
  const url = patientFormUrl(_lienAnnexeCode);
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Formulaire d'inscription en ligne</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Le patient remplit son dossier lui-même sur son téléphone — la demande
          arrive automatiquement dans « Demandes en ligne ».
        </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="patientShowList()">
          <i data-lucide="arrow-left"></i> Liste patients
        </button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(320px,100%),1fr)); gap:16px;">
      <div class="card" style="padding: var(--space-5);">
        <h3 class="card-title" style="margin-bottom:14px;">1. Choisissez l'annexe concernée</h3>
        <div class="form-group" style="margin-bottom:18px;">
          <select class="form-select form-input" onchange="lienSetAnnexe(this.value)">
            <option value="" ${_lienAnnexeCode === '' ? 'selected' : ''}>Toutes les annexes (réception centrale)</option>
            ${_annexes.map(a =>
              `<option value="${escH(a.code)}" ${_lienAnnexeCode === a.code ? 'selected' : ''}>${escH(a.code)} — ${escH(a.nom)}</option>`).join('')}
          </select>
        </div>

        <h3 class="card-title" style="margin-bottom:10px;">2. Partagez le lien</h3>
        <p style="font-size:13px; color:var(--clr-text-muted,#94a3b8); margin-top:0;">
          Envoyez-le par WhatsApp/SMS au patient, ou saisissez-le sur sa tablette à l'accueil :
        </p>
        <div style="display:flex; gap:8px;">
          <input type="text" id="lien-url" class="form-input" readonly value="${escH(url)}"
                 style="font-size:12.5px; background:var(--clr-bg-soft,#f1f5f9);">
          <button class="btn btn-primary" onclick="lienCopier()" style="white-space:nowrap;">
            <i data-lucide="copy"></i> Copier
          </button>
        </div>
        <a href="${escH(url)}" target="_blank" rel="noopener"
           style="display:inline-flex; align-items:center; gap:6px; margin-top:12px; font-size:13px;">
          <i data-lucide="external-link" style="width:15px;height:15px;"></i> Ouvrir le formulaire
        </a>
      </div>

      <div class="card" style="padding: var(--space-5); text-align:center;">
        <h3 class="card-title" style="margin-bottom:6px;">3. Ou faites scanner le QR code</h3>
        <p style="font-size:13px; color:var(--clr-text-muted,#94a3b8); margin-top:0;">
          Le patient le scanne avec l'appareil photo de son téléphone.
        </p>
        <div id="qr-box" style="display:flex; justify-content:center; padding:12px;"></div>
        <button class="btn btn-secondary" onclick="window.print()">
          <i data-lucide="printer"></i> Imprimer pour l'accueil
        </button>
      </div>
    </div>`;

  renderQrBox();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
