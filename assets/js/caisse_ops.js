// ==============================================================
// ENCAISSEMENTS — Caisse & Comptabilité (m=encaissements)
//   * Resi, devi, fakti, fakti proforma
//   * Mòd peman: Cash / MonCash / Chèque / Virement
//   * Resi enprimab (fenèt dedye → print/PDF)
//   * Rezime jou a pa mòd peman + cloture caisse
// Rele pa module.html — bezwen branch.js + clinique.js (erpEsc…)
// ==============================================================

const MODE_PAIEMENTS = {
  cash: 'Cash', moncash: 'MonCash', cheque: 'Chèque', virement: 'Virement'
};
const TYPE_DOCS = {
  recu: 'Reçu', devis: 'Devis', facture: 'Facture', proforma: 'Facture proforma'
};

async function renderEncaissementsModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement des encaissements...</div></div>';

  const today = new Date().toISOString().slice(0, 10);
  const [encRes, patients] = await Promise.all([
    erpSelect('erp_encaissements', '*, erp_patients(code, nom, prenom)')
      .order('created_at', { ascending: false }).limit(300),
    erpLoadPatientsForSelect()
  ]);

  window._encAll = encRes.data || [];
  window._encPatients = patients;
  window._encFilter = { date: today, type: '', statut: '' };

  const du_jour = window._encAll.filter(e => e.date_doc === today && e.statut === 'paye');
  const byMode = {};
  du_jour.forEach(e => { const k = e.mode_paiement || 'autre'; byMode[k] = (byMode[k] || 0) + parseFloat(e.montant || 0); });
  const totalJour = Object.values(byMode).reduce((a, b) => a + b, 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Encaissements</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Reçus, devis, factures et factures proforma — numérotation automatique par annexe.
        </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="enc-new-btn">
          <i data-lucide="plus"></i> Nouveau document
        </button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom: var(--space-6);">
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
    </div>

    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-body" style="padding:14px; display:flex; gap:12px; align-items:end; flex-wrap:wrap;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Date</label>
          <input type="date" id="enc-f-date" class="form-input" value="${today}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Type de document</label>
          <select id="enc-f-type" class="form-select form-input">
            <option value="">Tous</option>
            ${Object.entries(TYPE_DOCS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Statut</label>
          <select id="enc-f-statut" class="form-select form-input">
            <option value="">Tous</option>
            <option value="paye">Payé</option>
            <option value="en_attente">En attente</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
        <button class="btn btn-secondary" id="enc-cloture-btn" title="Clôture de caisse du jour">
          <i data-lucide="lock"></i> Clôturer la caisse
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
    </div>`;

  ['enc-f-date', 'enc-f-type', 'enc-f-statut'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      window._encFilter = {
        date: document.getElementById('enc-f-date').value,
        type: document.getElementById('enc-f-type').value,
        statut: document.getElementById('enc-f-statut').value
      };
      renderEncTable();
    });
  });

  document.getElementById('enc-new-btn').addEventListener('click', openEncForm);
  document.getElementById('enc-cloture-btn').addEventListener('click', cloturerCaisse);
  renderEncTable();
  if (typeof lucide !== 'undefined') lucide.createIcons();
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

  document.getElementById('enc-count').textContent = `${rows.length} document(s)`;

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

function openEncForm() {
  const patients = window._encPatients || [];
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Nouveau document</h3>
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
          <label class="form-label">Patient</label>
          <select name="patient_id" class="form-select form-input">
            <option value="">— Anonyme / autre —</option>
            ${patients.map(p => `<option value="${p.id}">${erpEsc(erpPatientName(p))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Motif *</label>
        <input type="text" name="motif" class="form-input" required
               placeholder="Consultation, séance physio, appareillage, matériel…">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Montant *</label>
          <input type="number" name="montant" class="form-input" min="0" step="0.01" required>
        </div>
        <div class="form-group">
          <label class="form-label">Devise</label>
          <select name="devise" class="form-select form-input">
            <option value="HTG">HTG</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Mode de paiement</label>
          <select name="mode_paiement" class="form-select form-input">
            <option value="">— (devis/proforma) —</option>
            ${Object.entries(MODE_PAIEMENTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Référence (nº chèque, ref MonCash…)</label>
          <input type="text" name="reference" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Statut</label>
        <select name="statut" class="form-select form-input">
          <option value="paye">Payé</option>
          <option value="en_attente">En attente</option>
        </select>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="enc-save">Enregistrer</button>
    </div>`);

  document.getElementById('enc-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('enc-form'));
    const patient = patients.find(p => p.id === fd.get('patient_id'));
    if (!fd.get('motif') || !fd.get('montant')) return erpToast('Motif et montant requis', true);

    const { data, error } = await db.from('erp_encaissements').insert(withBranch({
      patient_id: patient?.id || null,
      patient_nom: patient ? erpPatientName(patient) : null,
      type_document: fd.get('type_document'),
      montant: parseFloat(fd.get('montant')),
      devise: fd.get('devise') || 'HTG',
      mode_paiement: fd.get('mode_paiement') || null,
      reference: fd.get('reference') || null,
      motif: fd.get('motif'),
      statut: fd.get('statut') || 'paye',
      created_by: window.currentUser?.id
    })).select('*, erp_patients(code, nom, prenom)').single();

    if (error) return erpToast('Erreur: ' + error.message, true);

    // Fèmen sik pasyan an si li te "à encaisser" epi li peye
    if (patient?.id && data.statut === 'paye') {
      await db.from('erp_patients')
        .update({ workflow_step: 'cloture' })
        .eq('id', patient.id)
        .eq('workflow_step', 'a_encaisser');
    }

    window._encAll.unshift(data);
    erpCloseModal();
    erpToast(`Document ${data.numero || ''} enregistré`);
    if (typeof logActivity === 'function')
      logActivity('Encaissement', 'Caisse', `${data.numero} — ${erpFmtMoney(data.montant, data.devise)}`);
    renderEncTable();
    printEncaissement(data.id);
  });
}

// Enpresyon resi/devi — fenèt dedye (PDF via "Save as PDF")
function printEncaissement(id) {
  const e = (window._encAll || []).find(x => x.id === id);
  if (!e) return;
  const settings = window.enterpriseContext?.settings || {};
  const company = settings.company_name || 'HAITI REH-CARE';
  const annexe = erpAnnexeShortName(e.annexe_id || getInsertAnnexeId());
  const w = window.open('', '_blank', 'width=640,height=760');
  if (!w) return erpToast('Popup bloqué — autorisez les popups', true);

  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${TYPE_DOCS[e.type_document]} ${erpEsc(e.numero || '')}</title>
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
      <p>${TYPE_DOCS[e.type_document]} Nº <strong>${erpEsc(e.numero || '—')}</strong> — ${erpFmtDate(e.date_doc)}</p>
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

// Cloture caisse jou a — rezime pa mòd peman + mark erp_caisse
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
    // Jwenn/kreye caisse jounen an pou annex la
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
