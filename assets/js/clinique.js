// ==============================================================
// WORKFLOW KLINIK — multi-annexes
//   * m=rdv           → carnet de rendez-vous (sekrè/resepsyonis)
//   * m=consultations → file d'attente médecin + évaluation + orientation
//   * m=seances       → file de soins physio + validation séances
//   * m=atelier       → ordres de fabrication (teknisyen atelye)
// Rele pa module.html — bezwen branch.js (filtè annex) + auth.js
// ==============================================================

// ---------- Ti edp UI pataje ----------
window.erpEsc = window.erpEsc || function (s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
window.erpFmtDate = window.erpFmtDate || function (d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch (e) { return d; }
};
window.erpFmtMoney = window.erpFmtMoney || function (m, devise = 'HTG') {
  const n = parseFloat(m || 0);
  return new Intl.NumberFormat('fr-HT', { style: 'currency', currency: devise }).format(n);
};
window.erpShowModal = window.erpShowModal || function (html, wide) {
  erpCloseModal();
  const wrap = document.createElement('div');
  wrap.id = 'erp-modal-overlay';
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `<div class="modal" ${wide ? 'style="max-width:860px; width:95%;"' : ''}>${html}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) erpCloseModal(); });
  document.body.appendChild(wrap);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  return wrap;
};
window.erpCloseModal = window.erpCloseModal || function () {
  document.getElementById('erp-modal-overlay')?.remove();
};
window.erpToast = window.erpToast || function (msg, isErr) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 18px;
    border-radius:10px; color:#fff; font-size:14px; box-shadow:0 8px 24px rgba(0,0,0,.25);
    background:${isErr ? '#dc2626' : '#059669'};`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
};

const WF_LABELS = {
  accueil: 'Accueil', attente_evaluation: "File d'évaluation",
  en_physio: 'Physiothérapie', en_atelier: 'Atelier',
  a_encaisser: 'À encaisser', cloture: 'Clôturé'
};
function wfBadge(step) {
  const colors = {
    accueil: 'badge-secondary', attente_evaluation: 'badge-warning',
    en_physio: 'badge-info', en_atelier: 'badge-warning',
    a_encaisser: 'badge-danger', cloture: 'badge-success'
  };
  return `<span class="badge ${colors[step] || 'badge-secondary'}">${WF_LABELS[step] || step || '—'}</span>`;
}
const ATELIER_STATUTS = {
  en_attente: 'En attente', en_cours: 'En cours',
  pret: 'Prêt', livre: 'Livré', annule: 'Annulé'
};
const ATELIER_FLOW = ['en_attente', 'en_cours', 'pret', 'livre'];

// Lis itilizatè klinik (médecin/fizyo/direksyon) pou selectè yo
async function erpLoadClinicalStaff() {
  try {
    const { data } = await db.from('erp_users')
      .select('id, first_name, last_name, role, annexe_id')
      .eq('is_active', true)
      .in('role', ['pdg', 'directrice', 'directeur', 'medecin', 'physiotherapeute'])
      .order('first_name');
    return data || [];
  } catch (e) { return []; }
}
async function erpLoadPatientsForSelect() {
  try {
    const { data } = await erpSelect('erp_patients',
      'id, code, nom, prenom, phone, annexe_id')
      .eq('is_active', true).order('nom').limit(500);
    return data || [];
  } catch (e) { return []; }
}
function erpPatientName(p) {
  return `${p?.code ? '[' + p.code + '] ' : ''}${p?.nom || ''} ${p?.prenom || ''}`.trim();
}

// ==============================================================
// 1. CARNET DE RENDEZ-VOUS — m=rdv
// ==============================================================
let _rdvFilters = { date: '', praticien: '', statut: '', q: '' };

async function renderRdvModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement du carnet...</div></div>';

  const [rdvRes, staff, patients] = await Promise.all([
    erpSelect('erp_rdv', '*').order('date_rdv', { ascending: false }).limit(300),
    erpLoadClinicalStaff(),
    erpLoadPatientsForSelect()
  ]);
  const rdvs = rdvRes.data || [];
  window._rdvStaff = staff;
  window._rdvPatients = patients;
  window._rdvAll = rdvs;

  const canCreate = true;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Carnet de rendez-vous</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Planification par praticien et par type de soin — annexe active affichée dans la barre du haut.
        </p>
      </div>
      ${canCreate ? `<div class="page-actions">
        <button class="btn btn-primary" id="rdv-new-btn">
          <i data-lucide="calendar-plus"></i> Nouveau rendez-vous
        </button>
      </div>` : ''}
    </div>

    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-body" style="padding:14px; display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; align-items:end;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Date</label>
          <input type="date" id="rdv-f-date" class="form-input">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Praticien</label>
          <select id="rdv-f-praticien" class="form-select form-input">
            <option value="">Tous</option>
            ${staff.map(s => `<option value="${s.id}">${erpEsc(s.first_name)} ${erpEsc(s.last_name)} (${typeof formatRole === 'function' ? formatRole(s.role) : s.role})</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Statut</label>
          <select id="rdv-f-statut" class="form-select form-input">
            <option value="">Tous</option>
            <option value="en_attente">En attente</option>
            <option value="confirme">Confirmé</option>
            <option value="termine">Terminé</option>
            <option value="annule">Annulé</option>
            <option value="absent">Absent</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Recherche patient</label>
          <input type="text" id="rdv-f-q" class="form-input" placeholder="Nom, téléphone, code...">
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title" id="rdv-count"></h3></div>
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Date</th><th>Heure</th><th>Patient</th><th>Téléphone</th>
            <th>Praticien</th><th>Motif</th><th>Statut</th><th>Actions</th>
          </tr></thead>
          <tbody id="rdv-tbody"></tbody>
        </table>
      </div>
    </div>`;

  ['rdv-f-date', 'rdv-f-praticien', 'rdv-f-statut', 'rdv-f-q'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      _rdvFilters = {
        date: document.getElementById('rdv-f-date').value,
        praticien: document.getElementById('rdv-f-praticien').value,
        statut: document.getElementById('rdv-f-statut').value,
        q: document.getElementById('rdv-f-q').value.toLowerCase()
      };
      renderRdvTable();
    });
  });

  document.getElementById('rdv-new-btn')?.addEventListener('click', () => openRdvForm());
  renderRdvTable();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderRdvTable() {
  const tbody = document.getElementById('rdv-tbody');
  if (!tbody) return;
  const staffMap = {};
  (window._rdvStaff || []).forEach(s => staffMap[s.id] = s);

  const rows = (window._rdvAll || []).filter(r => {
    if (_rdvFilters.date && r.date_rdv !== _rdvFilters.date) return false;
    if (_rdvFilters.praticien && r.praticien_id !== _rdvFilters.praticien) return false;
    if (_rdvFilters.statut && r.statut !== _rdvFilters.statut) return false;
    if (_rdvFilters.q) {
      const hay = `${r.patient_nom || ''} ${r.patient_prenom || ''} ${r.patient_phone || ''} ${r.motif || ''}`.toLowerCase();
      if (!hay.includes(_rdvFilters.q)) return false;
    }
    return true;
  });

  document.getElementById('rdv-count').textContent = `${rows.length} rendez-vous`;

  const STATUT_BADGE = {
    en_attente: 'badge-warning', confirme: 'badge-info',
    termine: 'badge-success', annule: 'badge-danger', absent: 'badge-secondary'
  };

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:var(--clr-text-muted,#94a3b8);">Aucun rendez-vous pour ces filtres.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const p = staffMap[r.praticien_id];
    const isWaiting = ['en_attente', 'confirme'].includes(r.statut);
    return `<tr>
      <td>${erpFmtDate(r.date_rdv)}</td>
      <td>${r.heure_rdv ? String(r.heure_rdv).slice(0, 5) : '—'}</td>
      <td><strong>${erpEsc(r.patient_nom)} ${erpEsc(r.patient_prenom || '')}</strong></td>
      <td>${erpEsc(r.patient_phone || '—')}</td>
      <td>${p ? erpEsc(p.first_name + ' ' + p.last_name) : '—'}</td>
      <td>${erpEsc(r.motif || '—')}</td>
      <td><span class="badge ${STATUT_BADGE[r.statut] || 'badge-secondary'}">${r.statut || '—'}</span></td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${isWaiting ? `<button class="table-action-btn" title="Confirmer" onclick="rdvSetStatut('${r.id}','confirme')"><i data-lucide="check"></i></button>` : ''}
          ${isWaiting ? `<button class="table-action-btn" title="Envoyer en évaluation (file médecin)" onclick="rdvToEvaluation('${r.id}','${r.patient_id || ''}')"><i data-lucide="stethoscope"></i></button>` : ''}
          ${isWaiting ? `<button class="table-action-btn" title="Annuler" onclick="rdvSetStatut('${r.id}','annule')"><i data-lucide="x"></i></button>` : ''}
          ${r.statut === 'confirme' ? `<button class="table-action-btn" title="Marquer terminé" onclick="rdvSetStatut('${r.id}','termine')"><i data-lucide="check-check"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function rdvSetStatut(id, statut) {
  const { error } = await db.from('erp_rdv').update({ statut }).eq('id', id);
  if (error) return erpToast('Erreur: ' + error.message, true);
  const r = (window._rdvAll || []).find(x => x.id === id);
  if (r) r.statut = statut;
  if (typeof logActivity === 'function') logActivity('RDV ' + statut, 'Rendez-vous', id);
  renderRdvTable();
}

// Voye pasyan an nan file evalyasyon doktè a
async function rdvToEvaluation(rdvId, patientId) {
  if (!patientId) return erpToast('RDV sans dossier patient lié', true);
  const { error } = await db.from('erp_patients')
    .update({ workflow_step: 'attente_evaluation' }).eq('id', patientId);
  if (error) return erpToast('Erreur: ' + error.message, true);
  await rdvSetStatut(rdvId, 'confirme');
  erpToast('Patient envoyé dans la file du médecin');
  if (typeof logActivity === 'function') logActivity('Envoi en évaluation', 'Patients', patientId);
}

function openRdvForm() {
  const patients = window._rdvPatients || [];
  const staff = window._rdvStaff || [];
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Nouveau rendez-vous</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="rdv-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Patient *</label>
        <select name="patient_id" class="form-select form-input" required>
          <option value="">— Choisir —</option>
          ${patients.map(p => `<option value="${p.id}">${erpEsc(erpPatientName(p))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Praticien</label>
        <select name="praticien_id" class="form-select form-input">
          <option value="">— Non assigné —</option>
          ${staff.map(s => `<option value="${s.id}">${erpEsc(s.first_name)} ${erpEsc(s.last_name)}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input type="date" name="date_rdv" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Heure</label>
          <input type="time" name="heure_rdv" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Motif / type de soin</label>
        <input type="text" name="motif" class="form-input" placeholder="Consultation, séance physio, essayage…">
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea name="notes" class="form-textarea form-input" rows="2"></textarea>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="rdv-form-save">Enregistrer</button>
    </div>`);

  document.getElementById('rdv-form-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('rdv-form'));
    const patient = patients.find(p => p.id === fd.get('patient_id'));
    if (!patient) return erpToast('Choisir un patient', true);
    if (!fd.get('date_rdv')) return erpToast('Date requise', true);

    const payload = withBranch({
      patient_id: patient.id,
      patient_nom: patient.nom,
      patient_prenom: patient.prenom,
      patient_phone: patient.phone,
      praticien_id: fd.get('praticien_id') || null,
      date_rdv: fd.get('date_rdv'),
      heure_rdv: fd.get('heure_rdv') || null,
      motif: fd.get('motif') || null,
      notes: fd.get('notes') || null,
      statut: 'en_attente',
      created_by: window.currentUser?.id
    });

    const { data, error } = await db.from('erp_rdv').insert(payload).select().single();
    if (error) return erpToast('Erreur: ' + error.message, true);
    window._rdvAll.unshift(data);
    erpCloseModal();
    erpToast('Rendez-vous enregistré');
    if (typeof logActivity === 'function') logActivity('Nouveau RDV', 'Rendez-vous', erpPatientName(patient));
    renderRdvTable();
  });
}

// ==============================================================
// 2. FILE D'ATTENTE MÉDECIN + ÉVALUATION — m=consultations
// ==============================================================
async function renderConsultationsModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement de la file...</div></div>';

  const [queueRes, evalRes] = await Promise.all([
    erpSelect('erp_patients',
      'id, code, nom, prenom, phone, workflow_step, motif_consultation, diagnostic, created_at')
      .eq('workflow_step', 'attente_evaluation')
      .order('created_at', { ascending: true }),
    erpSelect('erp_evaluations',
      '*, erp_patients(code, nom, prenom)')
      .order('created_at', { ascending: false }).limit(30)
  ]);

  const queue = queueRes.data || [];
  const evals = evalRes.data || [];

  const ORIENT_LABEL = { physio: 'Physiothérapie', atelier: 'Atelier / Appareillage', suivi: 'Suivi médical', aucune: 'Aucune' };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Consultations &amp; Évaluations</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          File d'attente médicale — espace épuré pour la prise en charge des patients.
        </p>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-header">
        <h3 class="card-title"><i data-lucide="clock" style="width:16px;height:16px;vertical-align:-2px;"></i>
          File d'attente (${queue.length})</h3>
      </div>
      <div class="card-body" style="padding: var(--space-4);">
        ${queue.length ? queue.map(p => `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px; border:1px solid var(--clr-border,#e2e8f0); border-radius:10px; margin-bottom:10px;">
            <div>
              <strong>${erpEsc(erpPatientName(p))}</strong>
              <div style="font-size:12px; color:var(--clr-text-muted,#94a3b8);">
                ${erpEsc(p.motif_consultation || p.diagnostic || 'Évaluation initiale')}
                ${p.phone ? ' · ' + erpEsc(p.phone) : ''}
              </div>
            </div>
            <button class="btn btn-primary" onclick="openEvalForm('${p.id}','${erpEsc(erpPatientName(p)).replace(/'/g, "\\'")}')">
              <i data-lucide="stethoscope"></i> Évaluer
            </button>
          </div>`).join('')
        : '<div style="text-align:center; padding:24px; color:var(--clr-text-muted,#94a3b8);">Aucun patient dans la file — la secrétaire envoie les dossiers depuis le carnet de rendez-vous.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Évaluations récentes</h3></div>
      <div class="table-container">
        <table class="table">
          <thead><tr><th>Date</th><th>Patient</th><th>Motif</th><th>Orientation</th><th>Médecin</th></tr></thead>
          <tbody>
            ${evals.length ? evals.map(e => `<tr>
              <td>${erpFmtDate(e.date_evaluation)}</td>
              <td><strong>${erpEsc(erpPatientName(e.erp_patients || {}))}</strong></td>
              <td>${erpEsc(e.motif || '—')}</td>
              <td><span class="badge badge-info">${ORIENT_LABEL[e.orientation] || e.orientation}</span></td>
              <td>${erpEsc(e.medecin_id === window.currentUser?.id ? 'Moi' : (e.medecin_id || '—'))}</td>
            </tr>`).join('')
            : '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--clr-text-muted,#94a3b8);">Aucune évaluation enregistrée.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Fòm evalyasyon + oryantasyon (physio / atelier)
function openEvalForm(patientId, patientName) {
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Évaluation — ${erpEsc(patientName)}</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="eval-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Motif de consultation</label>
        <input type="text" name="motif" class="form-input" placeholder="Ex: douleur lombaire, appareillage…">
      </div>
      <div class="form-group">
        <label class="form-label">Rapport d'évaluation *</label>
        <textarea name="rapport" class="form-textarea form-input" rows="4" required
                  placeholder="Observations cliniques, bilan, conclusion…"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Orientation *</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label style="display:flex; align-items:center; gap:8px; padding:10px; border:1px solid var(--clr-border,#e2e8f0); border-radius:8px; cursor:pointer; font-weight:normal;">
            <input type="radio" name="orientation" value="physio" required>
            <i data-lucide="activity" style="width:16px;height:16px;"></i> Physiothérapie
          </label>
          <label style="display:flex; align-items:center; gap:8px; padding:10px; border:1px solid var(--clr-border,#e2e8f0); border-radius:8px; cursor:pointer; font-weight:normal;">
            <input type="radio" name="orientation" value="atelier">
            <i data-lucide="hammer" style="width:16px;height:16px;"></i> Atelier / Appareillage
          </label>
          <label style="display:flex; align-items:center; gap:8px; padding:10px; border:1px solid var(--clr-border,#e2e8f0); border-radius:8px; cursor:pointer; font-weight:normal;">
            <input type="radio" name="orientation" value="suivi">
            <i data-lucide="clipboard-check" style="width:16px;height:16px;"></i> Suivi médical
          </label>
          <label style="display:flex; align-items:center; gap:8px; padding:10px; border:1px solid var(--clr-border,#e2e8f0); border-radius:8px; cursor:pointer; font-weight:normal;">
            <input type="radio" name="orientation" value="aucune">
            <i data-lucide="check" style="width:16px;height:16px;"></i> Aucune (clôturer)
          </label>
        </div>
      </div>
      <div id="eval-physio-fields" class="hidden">
        <div class="form-group">
          <label class="form-label">Plan de traitement</label>
          <input type="text" name="plan_traitement" class="form-input" placeholder="Ex: renforcement + étirements">
        </div>
        <div class="form-group">
          <label class="form-label">Nombre de séances prévues</label>
          <input type="number" name="nb_seances_prevues" class="form-input" min="1" value="10">
        </div>
      </div>
      <div id="eval-atelier-fields" class="hidden">
        <div class="form-group">
          <label class="form-label">Type d'appareil</label>
          <select name="type_appareil" class="form-select form-input">
            <option value="prothese">Prothèse</option>
            <option value="orthese" selected>Orthèse</option>
            <option value="support">Support / Ceinture</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Fiche technique (mesures, matériaux, consignes)</label>
          <textarea name="fiche_technique" class="form-textarea form-input" rows="3"
                    placeholder="Mesures, matériaux, consignes de fabrication…"></textarea>
        </div>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="eval-save">Enregistrer l'évaluation</button>
    </div>`, true);

  // Montre/bloki chan selon oryantasyon an
  document.querySelectorAll('#eval-form input[name=orientation]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('eval-physio-fields').classList.toggle('hidden', r.value !== 'physio' || !r.checked);
      document.getElementById('eval-atelier-fields').classList.toggle('hidden', r.value !== 'atelier' || !r.checked);
    });
  });

  document.getElementById('eval-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('eval-form'));
    const orientation = fd.get('orientation');
    if (!orientation) return erpToast('Choisir une orientation', true);
    if (!fd.get('rapport')) return erpToast('Rapport requis', true);

    const evalPayload = withBranch({
      patient_id: patientId,
      medecin_id: window.currentUser?.id,
      motif: fd.get('motif') || null,
      rapport: fd.get('rapport'),
      orientation,
      plan_traitement: fd.get('plan_traitement') || null,
      nb_seances_prevues: parseInt(fd.get('nb_seances_prevues')) || null,
      created_by: window.currentUser?.id
    });

    const { data: evalRow, error } = await db.from('erp_evaluations')
      .insert(evalPayload).select().single();
    if (error) return erpToast('Erreur: ' + error.message, true);

    // Oryantasyon otomatik
    let nextStep = 'a_encaisser';
    if (orientation === 'physio') nextStep = 'en_physio';
    if (orientation === 'aucune') nextStep = 'cloture';
    if (orientation === 'atelier') {
      nextStep = 'en_atelier';
      // Jenere fich teknik la nan file travay atelye a
      await db.from('erp_atelier_orders').insert(withBranch({
        patient_id: patientId,
        evaluation_id: evalRow.id,
        type_appareil: fd.get('type_appareil') || 'orthese',
        description: fd.get('motif') || fd.get('rapport'),
        fiche_technique: { details: fd.get('fiche_technique') || '' },
        statut: 'en_attente',
        created_by: window.currentUser?.id
      }));
    }

    await db.from('erp_patients').update({ workflow_step: nextStep }).eq('id', patientId);

    erpCloseModal();
    erpToast(orientation === 'atelier'
      ? 'Évaluation enregistrée — fiche transmise à l\'atelier'
      : orientation === 'physio'
        ? 'Évaluation enregistrée — dossier envoyé en physiothérapie'
        : 'Évaluation enregistrée');
    if (typeof logActivity === 'function') logActivity('Évaluation', 'Consultations', `${patientName} → ${orientation}`);
    // Reload modil la
    const container = document.getElementById('module-content');
    if (container) renderConsultationsModule(container);
  });
}

// ==============================================================
// 3. FILE DE SOINS PHYSIO — m=seances
// ==============================================================
async function renderSeancesModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement de la file de soins...</div></div>';

  const [queueRes, seancesRes] = await Promise.all([
    erpSelect('erp_patients',
      'id, code, nom, prenom, phone, workflow_step, diagnostic, plan_exercices')
      .eq('workflow_step', 'en_physio')
      .order('created_at', { ascending: true }),
    erpSelect('erp_seances', '*, erp_patients(code, nom, prenom)')
      .order('date_seance', { ascending: false }).limit(200)
  ]);

  const queue = queueRes.data || [];
  const seances = seancesRes.data || [];
  window._physioSeances = seances;
  window._physioQueue = queue;

  const canTreat = ['physiotherapeute', 'medecin', 'pdg', 'directrice', 'directeur', 'employe', 'secretaire']
    .includes(window.currentUser?.role) || hasGlobalAccess(window.currentUser);

  const seanceBadge = { prevue: 'badge-warning', realisee: 'badge-success', annulee: 'badge-danger' };
  const seanceLabel = { prevue: 'Prévue', realisee: 'Réalisée', annulee: 'Annulée' };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">File de soins — Physiothérapie</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Patients orientés par le médecin. Validez chaque séance et saisissez la note d'évolution.
        </p>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-header"><h3 class="card-title">Patients en traitement (${queue.length})</h3></div>
      <div class="card-body" style="padding: var(--space-4);">
        ${queue.length ? queue.map(p => {
          const mes = seances.filter(s => s.patient_id === p.id);
          const done = mes.filter(s => s.statut === 'realisee').length;
          const next = mes.find(s => s.statut === 'prevue');
          return `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px; border:1px solid var(--clr-border,#e2e8f0); border-radius:10px; margin-bottom:10px; flex-wrap:wrap;">
            <div style="min-width:220px;">
              <strong>${erpEsc(erpPatientName(p))}</strong>
              <div style="font-size:12px; color:var(--clr-text-muted,#94a3b8);">
                ${erpEsc(p.diagnostic || '')} — ${done} séance(s) réalisée(s)
                ${next ? ` · prochaine: ${erpFmtDate(next.date_seance)}` : ''}
              </div>
            </div>
            ${canTreat ? `<div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-secondary" onclick="physioPlanSeance('${p.id}')">
                <i data-lucide="calendar-plus"></i> Planifier
              </button>
              ${next ? `<button class="btn btn-primary" onclick="physioValideSeance('${next.id}','${erpEsc(erpPatientName(p)).replace(/'/g, "\\'")}')">
                <i data-lucide="check"></i> Valider la séance du ${erpFmtDate(next.date_seance)}
              </button>` : ''}
              <button class="btn btn-secondary" onclick="physioClore('${p.id}')">
                <i data-lucide="check-check"></i> Traitement terminé
              </button>
            </div>` : ''}
          </div>`;
        }).join('')
        : '<div style="text-align:center; padding:24px; color:var(--clr-text-muted,#94a3b8);">Aucun patient en physiothérapie pour cette annexe.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Séances récentes</h3></div>
      <div class="table-container">
        <table class="table">
          <thead><tr><th>Date</th><th>Patient</th><th>Type</th><th>Durée</th><th>Statut</th><th>Note d'évolution</th></tr></thead>
          <tbody>
            ${seances.length ? seances.slice(0, 50).map(s => `<tr>
              <td>${erpFmtDate(s.date_seance)}</td>
              <td><strong>${erpEsc(erpPatientName(s.erp_patients || {}))}</strong></td>
              <td>${erpEsc(s.type_seance || '—')}</td>
              <td>${s.duree_min || '—'} min</td>
              <td><span class="badge ${seanceBadge[s.statut] || 'badge-secondary'}">${seanceLabel[s.statut] || s.statut}</span></td>
              <td style="max-width:280px; font-size:12px;">${erpEsc(s.observations || '—')}</td>
            </tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--clr-text-muted,#94a3b8);">Aucune séance.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function physioPlanSeance(patientId) {
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Planifier une séance</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="seance-form" class="modal-body">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input type="date" name="date_seance" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Heure</label>
          <input type="time" name="heure" class="form-input">
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Type de séance</label>
          <input type="text" name="type_seance" class="form-input" placeholder="Physiothérapie, massothérapie…">
        </div>
        <div class="form-group">
          <label class="form-label">Durée (min)</label>
          <input type="number" name="duree_min" class="form-input" value="45" min="10">
        </div>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="seance-save">Planifier</button>
    </div>`);

  document.getElementById('seance-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('seance-form'));
    if (!fd.get('date_seance')) return erpToast('Date requise', true);
    const { error } = await db.from('erp_seances').insert(withBranch({
      patient_id: patientId,
      praticien_id: window.currentUser?.id,
      date_seance: fd.get('date_seance'),
      heure: fd.get('heure') || null,
      type_seance: fd.get('type_seance') || 'Physiothérapie',
      duree_min: parseInt(fd.get('duree_min')) || 45,
      statut: 'prevue',
      created_by: window.currentUser?.id
    }));
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpCloseModal();
    erpToast('Séance planifiée');
    const container = document.getElementById('module-content');
    if (container) renderSeancesModule(container);
  });
}

function physioValideSeance(seanceId, patientName) {
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Valider la séance — ${erpEsc(patientName)}</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="valid-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Note d'évolution</label>
        <textarea name="observations" class="form-textarea form-input" rows="4"
                  placeholder="Progrès, douleur, exercices réalisés…"></textarea>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="valid-save">Valider la séance</button>
    </div>`);

  document.getElementById('valid-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('valid-form'));
    const { error } = await db.from('erp_seances')
      .update({ statut: 'realisee', observations: fd.get('observations') || null,
                praticien_id: window.currentUser?.id })
      .eq('id', seanceId);
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpCloseModal();
    erpToast('Séance validée');
    if (typeof logActivity === 'function') logActivity('Séance réalisée', 'Physiothérapie', patientName);
    const container = document.getElementById('module-content');
    if (container) renderSeancesModule(container);
  });
}

function physioClore(patientId) {
  if (!confirm('Clôturer le traitement et envoyer le dossier à la caisse ?')) return;
  db.from('erp_patients').update({ workflow_step: 'a_encaisser' }).eq('id', patientId)
    .then(({ error }) => {
      if (error) return erpToast('Erreur: ' + error.message, true);
      erpToast('Dossier transmis à la caisse');
      const container = document.getElementById('module-content');
      if (container) renderSeancesModule(container);
    });
}

// ==============================================================
// 4. ATELYE — LÒD FABRIKASYON — m=atelier
// ==============================================================
let _atelierFilter = '';

async function renderAtelierModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement de l\'atelier...</div></div>';

  const [ordersRes, staffRes] = await Promise.all([
    erpSelect('erp_atelier_orders', '*, erp_patients(code, nom, prenom)')
      .order('created_at', { ascending: false }).limit(200),
    db.from('erp_users').select('id, first_name, last_name, role')
      .eq('is_active', true)
      .in('role', ['ouvrier', 'medecin', 'pdg', 'directeur', 'directrice'])
  ]);

  window._atelierOrders = ordersRes.data || [];
  window._atelierStaff = staffRes.data || [];

  const counts = {};
  window._atelierOrders.forEach(o => { counts[o.statut] = (counts[o.statut] || 0) + 1; });

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Atelier — Ordres de fabrication</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Fiches techniques transmises par le médecin : En attente → En cours → Prêt → Livré.
        </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="atelier-new-btn">
          <i data-lucide="plus"></i> Nouvel ordre
        </button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom: var(--space-6);">
      ${['en_attente', 'en_cours', 'pret', 'livre'].map(s => `
        <div class="kpi-card" style="cursor:pointer;" onclick="_atelierFilter='${s}'; renderAtelierTable();">
          <div class="kpi-content">
            <div class="kpi-label">${ATELIER_STATUTS[s]}</div>
            <div class="kpi-value">${counts[s] || 0}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-body" style="padding:14px; display:flex; gap:12px; align-items:end; flex-wrap:wrap;">
        <div class="form-group" style="margin:0; min-width:200px;">
          <label class="form-label">Statut</label>
          <select id="at-f-statut" class="form-select form-input">
            <option value="">Tous</option>
            ${Object.entries(ATELIER_STATUTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-secondary" onclick="_atelierFilter='';document.getElementById('at-f-statut').value='';renderAtelierTable();">
          <i data-lucide="rotate-ccw"></i> Réinitialiser
        </button>
      </div>
    </div>

    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Nº</th><th>Patient</th><th>Type</th><th>Priorité</th>
            <th>Technicien</th><th>Statut</th><th>Commande</th><th>Livraison</th><th>Actions</th>
          </tr></thead>
          <tbody id="at-tbody"></tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('at-f-statut').addEventListener('change', (e) => {
    _atelierFilter = e.target.value;
    renderAtelierTable();
  });
  document.getElementById('atelier-new-btn').addEventListener('click', openAtelierForm);
  renderAtelierTable();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderAtelierTable() {
  const tbody = document.getElementById('at-tbody');
  if (!tbody) return;
  const staffMap = {};
  (window._atelierStaff || []).forEach(s => staffMap[s.id] = s);

  const rows = (window._atelierOrders || []).filter(o => !_atelierFilter || o.statut === _atelierFilter);
  const badge = { en_attente: 'badge-secondary', en_cours: 'badge-warning', pret: 'badge-info', livre: 'badge-success', annule: 'badge-danger' };
  const prio = { basse: '', normale: '', haute: '⚠️', urgente: '🔴' };

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--clr-text-muted,#94a3b8);">Aucun ordre de fabrication.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(o => {
    const tech = staffMap[o.technicien_id];
    const idx = ATELIER_FLOW.indexOf(o.statut);
    const nextStatut = idx >= 0 && idx < ATELIER_FLOW.length - 1 ? ATELIER_FLOW[idx + 1] : null;
    return `<tr>
      <td><strong>${erpEsc(o.numero || '—')}</strong></td>
      <td>${erpEsc(erpPatientName(o.erp_patients || {}))}</td>
      <td>${erpEsc(o.type_appareil || '—')}</td>
      <td>${prio[o.priorite] || ''} ${erpEsc(o.priorite || 'normale')}</td>
      <td>${tech ? erpEsc(tech.first_name + ' ' + tech.last_name) : '—'}</td>
      <td><span class="badge ${badge[o.statut] || 'badge-secondary'}">${ATELIER_STATUTS[o.statut] || o.statut}</span></td>
      <td>${erpFmtDate(o.date_commande)}</td>
      <td>${erpFmtDate(o.date_livraison || o.date_livraison_prevue)}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${!o.technicien_id && o.statut !== 'livre' && o.statut !== 'annule'
            ? `<button class="table-action-btn" title="Prendre en charge" onclick="atelierTake('${o.id}')"><i data-lucide="hand"></i></button>` : ''}
          ${nextStatut ? `<button class="table-action-btn" title="Passer à: ${ATELIER_STATUTS[nextStatut]}" onclick="atelierAdvance('${o.id}','${nextStatut}','${o.patient_id || ''}')"><i data-lucide="arrow-right"></i></button>` : ''}
          <button class="table-action-btn" title="Détails / fiche technique" onclick="atelierDetails('${o.id}')"><i data-lucide="eye"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function atelierTake(id) {
  const { error } = await db.from('erp_atelier_orders')
    .update({ technicien_id: window.currentUser?.id }).eq('id', id);
  if (error) return erpToast('Erreur: ' + error.message, true);
  const o = (window._atelierOrders || []).find(x => x.id === id);
  if (o) o.technicien_id = window.currentUser?.id;
  renderAtelierTable();
  erpToast('Ordre pris en charge');
}

async function atelierAdvance(id, nextStatut, patientId) {
  const upd = { statut: nextStatut };
  if (nextStatut === 'livre') upd.date_livraison = new Date().toISOString().slice(0, 10);
  const { error } = await db.from('erp_atelier_orders').update(upd).eq('id', id);
  if (error) return erpToast('Erreur: ' + error.message, true);
  const o = (window._atelierOrders || []).find(x => x.id === id);
  if (o) Object.assign(o, upd);
  // Aparèy livre → dosye a ale nan kes la
  if (nextStatut === 'livre' && patientId) {
    await db.from('erp_patients').update({ workflow_step: 'a_encaisser' }).eq('id', patientId);
  }
  if (typeof logActivity === 'function') logActivity('Atelier: ' + nextStatut, 'Atelier', o?.numero || id);
  renderAtelierTable();
  erpToast('Statut: ' + ATELIER_STATUTS[nextStatut]);
}

function atelierDetails(id) {
  const o = (window._atelierOrders || []).find(x => x.id === id);
  if (!o) return;
  const fiche = o.fiche_technique || {};
  const rows = Object.entries(fiche).map(([k, v]) =>
    `<tr><td style="font-weight:600; width:40%;">${erpEsc(k)}</td><td>${erpEsc(String(v))}</td></tr>`).join('');
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Fiche technique — ${erpEsc(o.numero || '')}</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <div class="modal-body">
      <p><strong>Patient:</strong> ${erpEsc(erpPatientName(o.erp_patients || {}))}</p>
      <p><strong>Type:</strong> ${erpEsc(o.type_appareil)} &nbsp; <strong>Priorité:</strong> ${erpEsc(o.priorite)}</p>
      <p><strong>Description:</strong> ${erpEsc(o.description || '—')}</p>
      ${rows ? `<table class="table">${rows}</table>` : ''}
      ${o.notes ? `<p><strong>Notes:</strong> ${erpEsc(o.notes)}</p>` : ''}
      ${o.cout ? `<p><strong>Coût:</strong> ${erpFmtMoney(o.cout, o.devise)}</p>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Fermer</button>
    </div>`);
}

async function openAtelierForm() {
  const patients = await erpLoadPatientsForSelect();
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Nouvel ordre de fabrication</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="at-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Patient *</label>
        <select name="patient_id" class="form-select form-input" required>
          <option value="">— Choisir —</option>
          ${patients.map(p => `<option value="${p.id}">${erpEsc(erpPatientName(p))}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Type d'appareil *</label>
          <select name="type_appareil" class="form-select form-input">
            <option value="prothese">Prothèse</option>
            <option value="orthese" selected>Orthèse</option>
            <option value="support">Support / Ceinture</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Priorité</label>
          <select name="priorite" class="form-select form-input">
            <option value="basse">Basse</option>
            <option value="normale" selected>Normale</option>
            <option value="haute">Haute</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input type="text" name="description" class="form-input" placeholder="Ex: Orthèse tibiale gauche">
      </div>
      <div class="form-group">
        <label class="form-label">Fiche technique (mesures, matériaux)</label>
        <textarea name="fiche" class="form-textarea form-input" rows="3"></textarea>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Coût estimé (HTG)</label>
          <input type="number" name="cout" class="form-input" min="0" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">Livraison prévue</label>
          <input type="date" name="date_livraison_prevue" class="form-input">
        </div>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="at-save">Créer l'ordre</button>
    </div>`);

  document.getElementById('at-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('at-form'));
    if (!fd.get('patient_id')) return erpToast('Choisir un patient', true);
    const { error } = await db.from('erp_atelier_orders').insert(withBranch({
      patient_id: fd.get('patient_id'),
      type_appareil: fd.get('type_appareil'),
      priorite: fd.get('priorite'),
      description: fd.get('description') || null,
      fiche_technique: { details: fd.get('fiche') || '' },
      cout: parseFloat(fd.get('cout')) || 0,
      date_livraison_prevue: fd.get('date_livraison_prevue') || null,
      statut: 'en_attente',
      technicien_id: window.currentUser?.id,
      created_by: window.currentUser?.id
    }));
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpCloseModal();
    erpToast('Ordre créé');
    const container = document.getElementById('module-content');
    if (container) renderAtelierModule(container);
  });
}
