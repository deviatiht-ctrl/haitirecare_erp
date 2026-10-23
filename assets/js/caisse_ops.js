// ==============================================================
// ENCAISSEMENTS — Caisse & Comptabilité (m=encaissements)
//   * Reçus, devis, factures, factures proforma
//   * Demandes d'inscription & Paiements en attente (comptabilité)
//   * Journal de Caisse & Ventilation des recettes par date
//   * Mòd peman: Cash / MonCash / Chèque / Virement
//   * Reçu imprimable (fenêtre dédiée → print/PDF)
//   * Clôture de caisse automatique
// Rele pa module.html — bezwen branch.js + clinique.js (erpEsc…)
// ==============================================================

const MODE_PAIEMENTS = {
  cash: 'Cash', moncash: 'MonCash', cheque: 'Chèque', virement: 'Virement'
};
const TYPE_DOCS = {
  recu: 'Reçu', devis: 'Devis', facture: 'Facture', proforma: 'Facture proforma'
};

window._encActiveTab = window._encActiveTab || 'documents'; // 'documents' | 'demandes' | 'journal'
window._encDemandePending = null;

async function renderEncaissementsModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement des opérations de caisse...</div></div>';

  const today = new Date().toISOString().slice(0, 10);
  const curMonth = today.slice(0, 7);

  const [encRes, patients, demandesRes, depRes, evalsRes, seancesRes] = await Promise.all([
    erpSelect('erp_encaissements', '*, erp_patients(code, nom, prenom, phone)')
      .order('created_at', { ascending: false }).limit(400),
    erpLoadPatientsForSelect(),
    erpSelect('erp_patient_demandes', '*')
      .order('created_at', { ascending: false }).limit(200),
    erpSelect('erp_depenses', '*')
      .gte('date_transaction', `${curMonth}-01`).order('date_transaction', { ascending: false }).limit(300),
    erpSelect('erp_evaluations', '*')
      .gte('date_evaluation', `${curMonth}-01`).limit(300),
    erpSelect('erp_seances', '*')
      .gte('date_seance', `${curMonth}-01`).limit(300)
  ]);

  window._encAll = encRes.data || [];
  window._encPatients = patients || [];
  window._encDemandes = demandesRes.data || [];
  window._encDepenses = depRes.data || [];
  window._encEvals = evalsRes.data || [];
  window._encSeances = seancesRes.data || [];
  window._encFilter = window._encFilter || { date: today, type: '', statut: '' };

  const du_jour = window._encAll.filter(e => e.date_doc === today && e.statut === 'paye');
  const byMode = {};
  du_jour.forEach(e => { const k = e.mode_paiement || 'autre'; byMode[k] = (byMode[k] || 0) + parseFloat(e.montant || 0); });
  const totalJour = Object.values(byMode).reduce((a, b) => a + b, 0);

  const pendingEncaissements = (window._encAll || []).filter(e => e.statut === 'en_attente');
  const pendingDemandes = (window._encDemandes || []).filter(d => d.statut === 'en_attente');
  const totalPending = pendingEncaissements.length + pendingDemandes.length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Comptabilité &amp; Caisse</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Reçus, factures, file d'encaissement (consultations &amp; achats), clôtures et ventilation journalière.
        </p>
      </div>
      <div class="page-actions" style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="enc-cloture-btn" title="Clôture de caisse du jour">
          <i data-lucide="lock"></i> Clôturer la caisse
        </button>
        <button class="btn btn-primary" id="enc-new-btn">
          <i data-lucide="plus"></i> Nouveau document / Reçu
        </button>
      </div>
    </div>

    <!-- KPIs de la journée -->
    <div class="kpi-grid" style="margin-bottom: var(--space-5);">
      <div class="kpi-card">
        <div class="kpi-icon success"><i data-lucide="banknote"></i></div>
        <div class="kpi-content">
          <div class="kpi-label">Encaissé aujourd'hui</div>
          <div class="kpi-value">${erpFmtMoney(totalJour)}</div>
        </div>
      </div>
      ${Object.entries(MODE_PAIEMENTS).map(([k, l]) => `
        <div class="kpi-card">
          <div class="kpi-content">
            <div class="kpi-label">${l}</div>
            <div class="kpi-value">${erpFmtMoney(byMode[k] || 0)}</div>
          </div>
        </div>`).join('')}
      <div class="kpi-card" style="cursor:pointer;" onclick="encSwitchTab('demandes')">
        <div class="kpi-icon warning"><i data-lucide="inbox"></i></div>
        <div class="kpi-content">
          <div class="kpi-label">À encaisser (File &amp; Demandes)</div>
          <div class="kpi-value" style="color:var(--clr-warning,#d97706);">${totalPending}</div>
        </div>
      </div>
    </div>

    <!-- Onglets du module comptable -->
    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-body" style="padding:10px 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button class="btn ${window._encActiveTab === 'documents' ? 'btn-primary' : 'btn-secondary'}" onclick="encSwitchTab('documents')">
          <i data-lucide="receipt"></i> Documents &amp; Reçus
        </button>
        <button class="btn ${window._encActiveTab === 'demandes' ? 'btn-primary' : 'btn-secondary'}" onclick="encSwitchTab('demandes')">
          <i data-lucide="inbox"></i> File d'attente Caisse &amp; Demandes
          ${totalPending ? `<span style="background:#d97706; color:#fff; font-size:11px; font-weight:700; border-radius:999px; padding:2px 8px; margin-left:6px;">${totalPending}</span>` : ''}
        </button>
        <button class="btn ${window._encActiveTab === 'journal' ? 'btn-primary' : 'btn-secondary'}" onclick="encSwitchTab('journal')">
          <i data-lucide="file-bar-chart"></i> Journal &amp; Ventilation par Date
        </button>
      </div>
    </div>

    <div id="enc-tab-content"></div>
  `;

  document.getElementById('enc-new-btn')?.addEventListener('click', () => openEncForm());
  document.getElementById('enc-cloture-btn')?.addEventListener('click', cloturerCaisse);

  renderEncCurrentTab();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function encSwitchTab(tab) {
  window._encActiveTab = tab;
  const container = document.getElementById('module-content');
  if (container) renderEncaissementsModule(container);
}

function renderEncCurrentTab() {
  const content = document.getElementById('enc-tab-content');
  if (!content) return;

  if (window._encActiveTab === 'demandes') {
    renderEncDemandesTab(content);
  } else if (window._encActiveTab === 'journal') {
    renderEncJournalTab(content);
  } else {
    renderEncDocumentsTab(content);
  }
}

// --------------------------------------------------------------
// TAB 1 : DOCUMENTS & REÇUS
// --------------------------------------------------------------
function renderEncDocumentsTab(content) {
  const today = new Date().toISOString().slice(0, 10);
  content.innerHTML = `
    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-body" style="padding:14px; display:flex; gap:12px; align-items:end; flex-wrap:wrap;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Date</label>
          <input type="date" id="enc-f-date" class="form-input" value="${window._encFilter.date || ''}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Type de document</label>
          <select id="enc-f-type" class="form-select form-input">
            <option value="">Tous</option>
            ${Object.entries(TYPE_DOCS).map(([v, l]) => `<option value="${v}" ${window._encFilter.type === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Statut</label>
          <select id="enc-f-statut" class="form-select form-input">
            <option value="">Tous</option>
            <option value="paye" ${window._encFilter.statut === 'paye' ? 'selected' : ''}>Payé</option>
            <option value="en_attente" ${window._encFilter.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
            <option value="annule" ${window._encFilter.statut === 'annule' ? 'selected' : ''}>Annulé</option>
          </select>
        </div>
        <button class="btn btn-ghost" onclick="encResetFilters()">
          <i data-lucide="x"></i> Réinitialiser
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title" id="enc-count"></h3></div>
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Nº</th><th>Date</th><th>Patient / Client</th><th>Type</th>
            <th>Motif</th><th>Montant</th><th>Mode</th><th>Statut</th><th></th>
          </tr></thead>
          <tbody id="enc-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  ['enc-f-date', 'enc-f-type', 'enc-f-statut'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      window._encFilter = {
        date: document.getElementById('enc-f-date').value,
        type: document.getElementById('enc-f-type').value,
        statut: document.getElementById('enc-f-statut').value
      };
      renderEncTable();
    });
  });

  renderEncTable();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function encResetFilters() {
  window._encFilter = { date: '', type: '', statut: '' };
  renderEncDocumentsTab(document.getElementById('enc-tab-content'));
}

function renderEncTable() {
  const tbody = document.getElementById('enc-tbody');
  if (!tbody) return;
  const f = window._encFilter;
  const rows = (window._encAll || []).filter(e => {
    if (f.date && e.date_doc !== f.date) return false;
    if (f.type && e.type_document !== f.type) return false;
    if (f.statut && e.statut !== f.statut) return false;
    return true;
  });

  const countEl = document.getElementById('enc-count');
  if (countEl) countEl.textContent = `${rows.length} document(s)`;

  const statutBadge = { paye: 'badge-success', en_attente: 'badge-warning', annule: 'badge-danger' };
  const statutLabel = { paye: 'Payé', en_attente: 'En attente', annule: 'Annulé' };

  tbody.innerHTML = rows.length ? rows.map(e => `<tr>
    <td><strong>${erpEsc(e.numero || '—')}</strong></td>
    <td>${erpFmtDate(e.date_doc)}</td>
    <td>${erpEsc(e.erp_patients ? erpPatientName(e.erp_patients) : (e.patient_nom || '—'))}</td>
    <td>${TYPE_DOCS[e.type_document] || e.type_document}</td>
    <td>${erpEsc(e.motif || '—')}</td>
    <td><strong>${erpFmtMoney(e.montant, e.devise)}</strong></td>
    <td>${MODE_PAIEMENTS[e.mode_paiement] || '—'}</td>
    <td><span class="badge ${statutBadge[e.statut] || 'badge-secondary'}">${statutLabel[e.statut] || e.statut}</span></td>
    <td><button class="table-action-btn" title="Imprimer" onclick="printEncaissement('${e.id}')"><i data-lucide="printer"></i></button></td>
  </tr>`).join('')
  : '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--clr-text-muted,#94a3b8);">Aucun document pour ces filtres.</td></tr>';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --------------------------------------------------------------
// TAB 2 : FILE D'ATTENTE CAISSE & DEMANDES D'INSCRIPTION
// --------------------------------------------------------------
function renderEncDemandesTab(content) {
  const pendingEnc = (window._encAll || []).filter(e => e.statut === 'en_attente');
  const demandes = window._encDemandes || [];
  const pendingDem = demandes.filter(d => d.statut === 'en_attente');

  content.innerHTML = `
    <!-- SECTION 1 : FILE DE CAISSE (CONSULTATIONS & ACHATS EN ATTENTE) -->
    <div class="card" style="margin-bottom: var(--space-6); border-left: 4px solid var(--clr-primary, #4f46e5);">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <h3 class="card-title" style="margin:0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="clock" style="color:var(--clr-primary, #4f46e5);"></i>
            File d'attente Caisse — Consultations &amp; Achats (${pendingEnc.length})
          </h3>
          <p style="margin:2px 0 0; font-size:12px; color:var(--clr-text-muted,#94a3b8);">
            Patients transmis par la réception pour encaissement d'une consultation ou d'un achat.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="encRefreshDemandes()">
          <i data-lucide="rotate-cw"></i> Actualiser
        </button>
      </div>
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Date / Heure</th>
            <th>Nº / Dossier</th>
            <th>Patient</th>
            <th>Service / Achat</th>
            <th>Montant prévu</th>
            <th>Statut</th>
            <th style="text-align:right;">Action</th>
          </tr></thead>
          <tbody>
            ${pendingEnc.length ? pendingEnc.map(e => {
              const p = e.erp_patients || {};
              const nom = e.erp_patients ? erpPatientName(e.erp_patients) : (e.patient_nom || 'Patient');
              const codeDossier = p.code ? `${p.code} ${p.numero_dossier ? '· ' + p.numero_dossier : ''}` : (e.numero || '—');
              return `
                <tr>
                  <td>${e.created_at ? e.created_at.slice(0, 16).replace('T', ' ') : (e.date_doc || '—')}</td>
                  <td><strong>${erpEsc(codeDossier)}</strong></td>
                  <td>
                    <strong>${erpEsc(nom)}</strong>
                    ${p.phone ? `<div style="font-size:12px; color:var(--clr-text-muted,#94a3b8);">${erpEsc(p.phone)}</div>` : ''}
                  </td>
                  <td><span class="badge badge-secondary" style="font-weight:600;">${erpEsc(e.motif || 'Consultation')}</span></td>
                  <td><strong style="color:var(--clr-primary,#4f46e5); font-size:14px;">${erpFmtMoney(e.montant, e.devise)}</strong></td>
                  <td><span class="badge badge-warning">En attente paiement</span></td>
                  <td style="text-align:right; white-space:nowrap;">
                    <button class="btn btn-primary btn-sm" onclick="validerEncaissement('${e.id}')" style="background:#16a34a; border-color:#16a34a; color:#fff; font-weight:600;">
                      <i data-lucide="check-circle"></i> Valider &amp; Encaisser
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="annulerEncaissement('${e.id}')" title="Annuler" style="color:#ef4444; margin-left:4px;">
                      <i data-lucide="trash-2"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--clr-text-muted,#94a3b8);">Aucun patient en attente d'encaissement à la caisse.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <!-- SECTION 2 : DEMANDES D'INSCRIPTION EN LIGNE -->
    <div class="card">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 class="card-title" style="margin:0; display:flex; align-items:center; gap:8px;">
            <i data-lucide="globe"></i>
            Demandes d'inscription en ligne (${demandes.length})
          </h3>
          <p style="margin:2px 0 0; font-size:12px; color:var(--clr-text-muted,#94a3b8);">
            Formulaires soumis depuis le site web en attente de paiement initial.
          </p>
        </div>
      </div>
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Date reçue</th>
            <th>Patient</th>
            <th>Téléphone</th>
            <th>Service demandé</th>
            <th>Statut</th>
            <th style="text-align:right;">Action</th>
          </tr></thead>
          <tbody>
            ${demandes.length ? demandes.map(d => {
              const payload = d.payload || {};
              const services = Array.isArray(payload.type_service) ? payload.type_service.join(', ') : (payload.type_service || 'Inscription / Évaluation');
              const isEnAttente = d.statut === 'en_attente';
              return `
                <tr>
                  <td>${d.created_at ? d.created_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td><strong>${erpEsc(d.nom || '')}</strong> ${erpEsc(d.prenom || '')}</td>
                  <td>${erpEsc(d.phone || '—')}</td>
                  <td><span class="badge badge-secondary">${erpEsc(services)}</span></td>
                  <td>
                    <span class="badge ${isEnAttente ? 'badge-warning' : (d.statut === 'traite' ? 'badge-success' : 'badge-danger')}">
                      ${isEnAttente ? 'En attente de paiement' : (d.statut === 'traite' ? 'Payé / Traité' : 'Rejeté')}
                    </span>
                  </td>
                  <td style="text-align:right;">
                    ${isEnAttente ? `
                      <button class="btn btn-primary btn-sm" onclick="encaisseDemande('${d.id}')">
                        <i data-lucide="banknote"></i> Encaisser
                      </button>
                    ` : `
                      <button class="btn btn-secondary btn-sm" onclick="encaisseDemande('${d.id}')" title="Émettre un nouveau reçu pour ce patient">
                        <i data-lucide="receipt"></i> Nouveau reçu
                      </button>
                    `}
                  </td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--clr-text-muted,#94a3b8);">Aucune demande en ligne.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function encRefreshDemandes() {
  const [encRes, demRes] = await Promise.all([
    erpSelect('erp_encaissements', '*, erp_patients(code, nom, prenom, phone)').order('created_at', { ascending: false }).limit(400),
    erpSelect('erp_patient_demandes', '*').order('created_at', { ascending: false }).limit(200)
  ]);
  window._encAll = encRes.data || [];
  window._encDemandes = demRes.data || [];
  renderEncCurrentTab();
}

function validerEncaissement(encId) {
  const enc = (window._encAll || []).find(e => e.id === encId);
  if (!enc) return;
  const p = enc.erp_patients || {};
  const nom = enc.erp_patients ? erpPatientName(enc.erp_patients) : (enc.patient_nom || 'Patient');
  const code = p.code ? ` (${p.code})` : '';

  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Valider l'encaissement — ${erpEsc(nom)}${erpEsc(code)}</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="valider-enc-form" class="modal-body">
      <div style="background:var(--clr-bg-soft,#f8fafc); border-radius:8px; padding:12px; margin-bottom:14px; border:1px solid var(--clr-border,#e2e8f0);">
        <div style="font-size:12px; color:var(--clr-text-muted,#94a3b8); margin-bottom:4px;">Motif de l'opération</div>
        <div style="font-size:15px; font-weight:600; color:var(--clr-primary,#4f46e5);">${erpEsc(enc.motif || 'Consultation / Achat')}</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Montant à encaisser *</label>
          <input type="number" name="montant" id="ve-montant" class="form-input" min="0" step="any" required value="${enc.montant || 0}">
        </div>
        <div class="form-group">
          <label class="form-label">Devise</label>
          <select name="devise" class="form-select form-input">
            <option value="HTG" ${enc.devise === 'HTG' ? 'selected' : ''}>HTG</option>
            <option value="USD" ${enc.devise === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Mode de paiement *</label>
          <select name="mode_paiement" class="form-select form-input" required>
            ${Object.entries(MODE_PAIEMENTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Référence / Nº reçu tiers</label>
          <input type="text" name="reference" class="form-input" placeholder="Optionnel (ex: ref MonCash)">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Motif ajusté (optionnel)</label>
        <input type="text" name="motif" class="form-input" value="${erpEsc(enc.motif || '')}">
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="ve-submit-btn" style="background:#16a34a; border-color:#16a34a;">
        <i data-lucide="check-circle"></i> Confirmer &amp; Imprimer le reçu
      </button>
    </div>
  `);

  document.getElementById('ve-submit-btn')?.addEventListener('click', async () => {
    const form = document.getElementById('valider-enc-form');
    if (!form.checkValidity()) return form.reportValidity();
    const fd = new FormData(form);

    const updatePayload = {
      montant: parseFloat(fd.get('montant') || 0),
      devise: fd.get('devise') || 'HTG',
      mode_paiement: fd.get('mode_paiement') || 'cash',
      reference: fd.get('reference') || null,
      motif: fd.get('motif') || enc.motif,
      statut: 'paye',
      date_doc: new Date().toISOString().slice(0, 10)
    };

    const { data, error } = await db.from('erp_encaissements')
      .update(updatePayload)
      .eq('id', encId)
      .select('*, erp_patients(code, nom, prenom)')
      .single();

    if (error) return erpToast('Erreur: ' + error.message, true);

    // Mettre à jour workflow_step du patient si attente consultation
    if (enc.patient_id) {
      try {
        await db.from('erp_patients')
          .update({ workflow_step: 'attente_evaluation' })
          .eq('id', enc.patient_id)
          .eq('workflow_step', 'a_encaisser');
      } catch (pe) {}
    }

    erpCloseModal();
    erpToast(`Paiement validé avec succès (Reçu Nº ${data.numero || ''})`);

    // Actualiser tableau
    await encRefreshDemandes();

    printEncaissement(data.id, data);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function annulerEncaissement(encId) {
  if (!confirm("Voulez-vous annuler cette demande d'encaissement ?")) return;
  const { error } = await db.from('erp_encaissements').update({ statut: 'annule' }).eq('id', encId);
  if (error) return erpToast('Erreur: ' + error.message, true);
  erpToast('Demande annulée.');
  await encRefreshDemandes();
}

function encaisseDemande(demandeId) {
  const d = (window._encDemandes || []).find(x => x.id === demandeId);
  if (!d) return;

  const payload = d.payload || {};
  const service = Array.isArray(payload.type_service) ? payload.type_service[0] : (payload.type_service || 'Évaluation');
  const nomComplet = `${d.nom || ''} ${d.prenom || ''}`.trim();

  // Chercher si le patient existe déjà dans _encPatients
  let matchedPatient = (window._encPatients || []).find(p =>
    (p.phone && d.phone && p.phone.includes(d.phone)) ||
    (`${p.nom || ''} ${p.prenom || ''}`.toLowerCase() === nomComplet.toLowerCase())
  );

  openEncForm({
    patient_id: matchedPatient ? matchedPatient.id : null,
    patient_nom: nomComplet,
    motif: `Évaluation — ${service}`,
    montant: 500, // montant suggéré par défaut pour évaluation
    demande_id: d.id
  });
}

// --------------------------------------------------------------
// TAB 3 : JOURNAL DE CAISSE & VENTILATION DES RECETTES
// Colonnes demandées par l'utilisateur:
// Table 1: Date | Nombre Évaluation | Nombre Thérapie | R Total | Prélèvement | Encaissement
// Table 2: Date | Évaluation | Réévaluation | R App | R Thérapie | R Total | Prélèvement | Encaissement
// --------------------------------------------------------------
function renderEncJournalTab(content) {
  const payes = (window._encAll || []).filter(e => e.statut === 'paye');
  const depenses = window._encDepenses || [];
  const evals = window._encEvals || [];
  const seances = window._encSeances || [];

  // Indexation par date
  const dateMap = {};
  const ensureDate = (dt) => {
    if (!dt) return null;
    const dStr = dt.slice(0, 10);
    if (!dateMap[dStr]) {
      dateMap[dStr] = {
        date: dStr,
        nb_eval: 0,
        nb_therapie: 0,
        r_eval: 0,
        r_reeval: 0,
        r_app: 0,
        r_therapie: 0,
        r_autre: 0,
        prelevement: 0
      };
    }
    return dateMap[dStr];
  };

  evals.forEach(ev => {
    const row = ensureDate(ev.date_evaluation);
    if (row) row.nb_eval += 1;
  });

  seances.forEach(sc => {
    const row = ensureDate(sc.date_seance);
    if (row) row.nb_therapie += 1;
  });

  payes.forEach(e => {
    const row = ensureDate(e.date_doc);
    if (!row) return;
    const m = (e.motif || '').toLowerCase();
    const val = parseFloat(e.montant || 0);

    if (m.includes('rééval') || m.includes('reeval')) {
      row.r_reeval += val;
    } else if (m.includes('éval') || m.includes('eval') || m.includes('consultation')) {
      row.r_eval += val;
      if (row.nb_eval === 0) row.nb_eval += 1;
    } else if (m.includes('app') || m.includes('proth') || m.includes('orth') || m.includes('atelier')) {
      row.r_app += val;
    } else if (m.includes('thérap') || m.includes('therap') || m.includes('physio') || m.includes('séance') || m.includes('seance')) {
      row.r_therapie += val;
      if (row.nb_therapie === 0) row.nb_therapie += 1;
    } else {
      row.r_autre += val;
    }
  });

  depenses.forEach(dp => {
    const row = ensureDate(dp.date_transaction);
    if (row) row.prelevement += parseFloat(dp.montant || 0);
  });

  const sortedDates = Object.keys(dateMap).sort().reverse();

  let tot_nb_eval = 0, tot_nb_therapie = 0, tot_r1 = 0, tot_prelev1 = 0, tot_enc1 = 0;
  let tot_eval = 0, tot_reeval = 0, tot_rapp = 0, tot_rtherapie = 0;

  sortedDates.forEach(dt => {
    const row = dateMap[dt];
    const r_total = row.r_eval + row.r_reeval + row.r_app + row.r_therapie + row.r_autre;
    const encaissement = r_total - row.prelevement;

    tot_nb_eval += row.nb_eval;
    tot_nb_therapie += row.nb_therapie;
    tot_r1 += r_total;
    tot_prelev1 += row.prelevement;
    tot_enc1 += encaissement;

    tot_eval += row.r_eval;
    tot_reeval += row.r_reeval;
    tot_rapp += row.r_app;
    tot_rtherapie += row.r_therapie;
  });

  content.innerHTML = `
    <!-- TABLEAU 1: Activités & Caisse -->
    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="card-title">1. Synthèse Activités &amp; Caisse par Date</h3>
        <button class="btn btn-secondary btn-sm" onclick="window.print()"><i data-lucide="printer"></i> Imprimer</button>
      </div>
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Date</th>
            <th>Nombre Évaluation</th>
            <th>Nombre Thérapie</th>
            <th>R Total</th>
            <th>Prélèvement</th>
            <th>Encaissement</th>
          </tr></thead>
          <tbody>
            ${sortedDates.length ? sortedDates.map(dt => {
              const row = dateMap[dt];
              const r_tot = row.r_eval + row.r_reeval + row.r_app + row.r_therapie + row.r_autre;
              const enc = r_tot - row.prelevement;
              return `
                <tr>
                  <td><strong>${erpFmtDate(row.date)}</strong></td>
                  <td>${row.nb_eval}</td>
                  <td>${row.nb_therapie}</td>
                  <td><strong>${erpFmtMoney(r_tot)}</strong></td>
                  <td style="color:#dc2626;">${erpFmtMoney(row.prelevement)}</td>
                  <td style="color:#16a34a; font-weight:700;">${erpFmtMoney(enc)}</td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="6" style="text-align:center; padding:24px;">Aucun mouvement enregistré.</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:var(--clr-bg-soft,#f1f5f9);">
              <td>TOTAL</td>
              <td>${tot_nb_eval}</td>
              <td>${tot_nb_therapie}</td>
              <td>${erpFmtMoney(tot_r1)}</td>
              <td style="color:#dc2626;">${erpFmtMoney(tot_prelev1)}</td>
              <td style="color:#16a34a;">${erpFmtMoney(tot_enc1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- TABLEAU 2: Ventilation détaillée des recettes -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">2. Ventilation des Recettes (Évaluation, Réévaluation, Appareillage, Thérapie)</h3>
      </div>
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Date</th>
            <th>Évaluation</th>
            <th>Réévaluation</th>
            <th>R App</th>
            <th>R Thérapie</th>
            <th>R Total</th>
            <th>Prélèvement</th>
            <th>Encaissement</th>
          </tr></thead>
          <tbody>
            ${sortedDates.length ? sortedDates.map(dt => {
              const row = dateMap[dt];
              const r_tot = row.r_eval + row.r_reeval + row.r_app + row.r_therapie + row.r_autre;
              const enc = r_tot - row.prelevement;
              return `
                <tr>
                  <td><strong>${erpFmtDate(row.date)}</strong></td>
                  <td>${erpFmtMoney(row.r_eval)}</td>
                  <td>${erpFmtMoney(row.r_reeval)}</td>
                  <td>${erpFmtMoney(row.r_app)}</td>
                  <td>${erpFmtMoney(row.r_therapie)}</td>
                  <td><strong>${erpFmtMoney(r_tot)}</strong></td>
                  <td style="color:#dc2626;">${erpFmtMoney(row.prelevement)}</td>
                  <td style="color:#16a34a; font-weight:700;">${erpFmtMoney(enc)}</td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="8" style="text-align:center; padding:24px;">Aucun mouvement enregistré.</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:var(--clr-bg-soft,#f1f5f9);">
              <td>TOTAL</td>
              <td>${erpFmtMoney(tot_eval)}</td>
              <td>${erpFmtMoney(tot_reeval)}</td>
              <td>${erpFmtMoney(tot_rapp)}</td>
              <td>${erpFmtMoney(tot_rtherapie)}</td>
              <td>${erpFmtMoney(tot_r1)}</td>
              <td style="color:#dc2626;">${erpFmtMoney(tot_prelev1)}</td>
              <td style="color:#16a34a;">${erpFmtMoney(tot_enc1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --------------------------------------------------------------
// MODAL : NOUVEAU DOCUMENT / REÇU
// --------------------------------------------------------------
function openEncForm(prefill = {}) {
  const patients = window._encPatients || [];
  window._encDemandePending = prefill.demande_id || null;

  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">${prefill.demande_id ? "Encaisser une demande d'inscription" : 'Nouveau document / Reçu'}</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="enc-form" class="modal-body">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Type de document *</label>
          <select name="type_document" class="form-select form-input">
            ${Object.entries(TYPE_DOCS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Patient *</label>
          <select name="patient_id" class="form-select form-input" id="enc-form-patient-select">
            <option value="">— Sélectionner ou inscrire —</option>
            ${patients.map(p => `<option value="${p.id}" ${prefill.patient_id === p.id ? 'selected' : ''}>${erpEsc(erpPatientName(p))}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-group" id="enc-patient-nom-group" style="${prefill.patient_id ? 'display:none;' : ''}">
        <label class="form-label">Nom du patient (si non encore enregistré dans la liste)</label>
        <input type="text" name="patient_nom" class="form-input" value="${erpEsc(prefill.patient_nom || '')}" placeholder="Nom et prénom du patient">
      </div>

      <div class="form-group">
        <label class="form-label">Motif de paiement *</label>
        <input type="text" name="motif" id="enc-motif-input" class="form-input" required
               value="${erpEsc(prefill.motif || '')}"
               placeholder="Évaluation, séance physio, appareillage, matériel…">
        <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('enc-motif-input').value='Évaluation';">Évaluation</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('enc-motif-input').value='Réévaluation';">Réévaluation</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('enc-motif-input').value='Séance Physiothérapie';">Thérapie</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('enc-motif-input').value='Appareillage (Orthèse/Prothèse)';">Appareillage</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Montant *</label>
          <input type="number" name="montant" class="form-input" min="0" step="0.01" required value="${prefill.montant || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Devise</label>
          <select name="devise" class="form-select form-input">
            <option value="HTG" selected>HTG</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Mode de paiement *</label>
          <select name="mode_paiement" class="form-select form-input" required>
            ${Object.entries(MODE_PAIEMENTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Référence (nº chèque, ref MonCash…)</label>
          <input type="text" name="reference" class="form-input" placeholder="Optionnel">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Statut</label>
        <select name="statut" class="form-select form-input">
          <option value="paye" selected>Payé</option>
          <option value="en_attente">En attente</option>
        </select>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="enc-save">Enregistrer &amp; Imprimer le reçu</button>
    </div>`);

  document.getElementById('enc-form-patient-select')?.addEventListener('change', (e) => {
    const grp = document.getElementById('enc-patient-nom-group');
    if (grp) grp.style.display = e.target.value ? 'none' : 'block';
  });

  document.getElementById('enc-save').addEventListener('click', async () => {
    const form = document.getElementById('enc-form');
    if (!form.checkValidity()) return form.reportValidity();

    const fd = new FormData(form);
    const patientId = fd.get('patient_id') || null;
    const patientObj = patients.find(p => p.id === patientId);
    const patientNom = patientObj ? erpPatientName(patientObj) : (fd.get('patient_nom') || 'Patient');

    const montant = parseFloat(fd.get('montant') || 0);
    const motif = fd.get('motif');
    const statut = fd.get('statut') || 'paye';

    const insertPayload = withBranch({
      patient_id: patientId,
      patient_nom: patientNom,
      type_document: fd.get('type_document') || 'recu',
      montant: montant,
      devise: fd.get('devise') || 'HTG',
      mode_paiement: fd.get('mode_paiement') || 'cash',
      reference: fd.get('reference') || null,
      motif: motif,
      statut: statut,
      date_doc: new Date().toISOString().slice(0, 10),
      created_by: window.currentUser?.id
    });

    const { data, error } = await db.from('erp_encaissements')
      .insert(insertPayload)
      .select('*, erp_patients(code, nom, prenom)')
      .single();

    if (error) return erpToast('Erreur: ' + error.message, true);

    // Si lié à une demande d'inscription, marquer la demande comme traitée
    if (window._encDemandePending) {
      try {
        await db.from('erp_patient_demandes').update({
          statut: 'traite',
          traite_par: window.currentUser?.id,
          traite_at: new Date().toISOString()
        }).eq('id', window._encDemandePending);

        const targetD = (window._encDemandes || []).find(x => x.id === window._encDemandePending);
        if (targetD) targetD.statut = 'traite';
      } catch (de) {
        console.warn('Demande status update error:', de);
      }
      window._encDemandePending = null;
    }

    if (patientId && statut === 'paye') {
      try {
        await db.from('erp_patients')
          .update({ workflow_step: 'cloture' })
          .eq('id', patientId)
          .eq('workflow_step', 'a_encaisser');
      } catch (pe) {}
    }

    window._encAll.unshift(data);
    erpCloseModal();
    erpToast(`Document ${data.numero || ''} enregistré avec succès`);
    if (typeof logActivity === 'function')
      logActivity('Encaissement', 'Caisse', `${data.numero} — ${erpFmtMoney(data.montant, data.devise)}`);

    renderEncCurrentTab();
    printEncaissement(data.id);
  });
}

// --------------------------------------------------------------
// IMPRESSION / REÇU PDF
// --------------------------------------------------------------
function printEncaissement(id) {
  const e = (window._encAll || []).find(x => x.id === id);
  if (!e) return;
  const settings = window.enterpriseContext?.settings || {};
  const company = settings.company_name || 'HAITI REH-CARE';
  const annexe = erpAnnexeShortName(e.annexe_id || getInsertAnnexeId());
  const w = window.open('', '_blank', 'width=640,height=760');
  if (!w) return erpToast('Popup bloqué — autorisez les popups', true);

  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${TYPE_DOCS[e.type_document] || 'Reçu'} ${erpEsc(e.numero || '')}</title>
    <style>
      body { font-family: system-ui, Arial, sans-serif; color: #111; padding: 32px; max-width: 560px; margin: auto; }
      .head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 20px; }
      .head h1 { margin: 0; font-size: 20px; }
      .head p { margin: 2px 0; font-size: 12px; color: #444; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      td { padding: 7px 4px; font-size: 14px; border-bottom: 1px solid #eee; }
      td.l { color: #555; width: 42%; }
      .total { font-size: 22px; font-weight: 700; text-align: right; margin-top: 14px; }
      .foot { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #444; }
      .sig { border-top: 1px solid #999; padding-top: 6px; width: 40%; text-align: center; }
    </style></head><body>
    <div class="head">
      <h1>${erpEsc(company)}</h1>
      <p>${erpEsc(annexe)} · ${erpEsc(settings.company_phone || '')}</p>
      <p>${TYPE_DOCS[e.type_document] || 'Document'} Nº <strong>${erpEsc(e.numero || '—')}</strong> — ${erpFmtDate(e.date_doc)}</p>
    </div>
    <table>
      <tr><td class="l">Patient / Client</td><td><strong>${erpEsc(e.erp_patients ? erpPatientName(e.erp_patients) : (e.patient_nom || '—'))}</strong></td></tr>
      <tr><td class="l">Motif</td><td>${erpEsc(e.motif || '—')}</td></tr>
      <tr><td class="l">Mode de paiement</td><td>${MODE_PAIEMENTS[e.mode_paiement] || '—'}</td></tr>
      ${e.reference ? `<tr><td class="l">Référence</td><td>${erpEsc(e.reference)}</td></tr>` : ''}
      <tr><td class="l">Statut</td><td>${e.statut === 'paye' ? 'Payé' : e.statut === 'annule' ? 'Annulé' : 'En attente'}</td></tr>
    </table>
    <div class="total">${erpFmtMoney(e.montant, e.devise)}</div>
    <div class="foot">
      <div class="sig">Signature du caissier</div>
      <div class="sig">Signature du client</div>
    </div>
    <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`);
  w.document.close();
}

// --------------------------------------------------------------
// CLÔTURE DE CAISSE
// --------------------------------------------------------------
async function cloturerCaisse() {
  const today = new Date().toISOString().slice(0, 10);
  const du_jour = (window._encAll || []).filter(e => e.date_doc === today && e.statut === 'paye');
  const byMode = {};
  du_jour.forEach(e => { const k = e.mode_paiement || 'autre'; byMode[k] = (byMode[k] || 0) + parseFloat(e.montant || 0); });
  const total = Object.values(byMode).reduce((a, b) => a + b, 0);
  const annexe = getInsertAnnexeId();
  if (!annexe) {
    return erpToast('Choisissez une annexe précise (pas "Consolidé") pour clôturer une caisse.', true);
  }

  const lines = Object.entries(MODE_PAIEMENTS)
    .map(([k, l]) => `${l}: ${erpFmtMoney(byMode[k] || 0)}`).join('\n');

  if (!confirm(`Clôturer la caisse du ${erpFmtDate(today)} ?\n\n${lines}\nTotal: ${erpFmtMoney(total)}`)) return;

  try {
    let caisse = null;
    let q = db.from('erp_caisse').select('*').eq('date_caisse', today);
    if (annexe) q = q.eq('annexe_id', annexe);
    const { data } = await q.maybeSingle();
    caisse = data;

    if (!caisse) {
      const { data: nc, error: e1 } = await db.from('erp_caisse')
        .insert(withBranch({ date_caisse: today, solde_ouverture: 0, created_by: window.currentUser?.id }))
        .select().single();
      if (e1) throw e1;
      caisse = nc;
    }

    const { error } = await db.from('erp_caisse')
      .update({ solde_fermeture: total, notes: `Clôture auto — ${lines}` })
      .eq('id', caisse.id);
    if (error) throw error;

    erpToast(`Caisse clôturée — ${erpFmtMoney(total)}`);
    if (typeof logActivity === 'function') logActivity('Clôture caisse', 'Caisse', `Total ${erpFmtMoney(total)}`);
  } catch (e) {
    erpToast('Erreur: ' + (e.message || e), true);
  }
}
