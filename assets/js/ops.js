// ==============================================================
// MODIL OPERASYON — multi-annexes
//   * m=service_client → reklamasyon, satisfaksyon, relans pasyan
//   * m=achats         → founisè + bon kòmand + resepsyon stock
//   * m=audit          → jonal odit (direksyon + enfòmatisyen)
// Rele pa module.html — bezwen branch.js + clinique.js (erpEsc…)
// ==============================================================

// ==============================================================
// 1. SERVICE CLIENT — reklamasyon, satisfaksyon, relans
// ==============================================================
async function renderServiceClientModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement du service client...</div></div>';

  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [recRes, relRes, patients] = await Promise.all([
    erpSelect('erp_reclamations', '*, erp_patients(code, nom, prenom)')
      .order('created_at', { ascending: false }).limit(200),
    erpSelect('erp_rdv', 'id, patient_id, patient_nom, patient_prenom, patient_phone, date_rdv, heure_rdv, statut, motif')
      .gte('date_rdv', today).lte('date_rdv', in7)
      .in('statut', ['en_attente', 'confirme'])
      .order('date_rdv').limit(100),
    erpLoadPatientsForSelect()
  ]);

  const reclamations = recRes.data || [];
  const relances = relRes.data || [];
  window._scPatients = patients;

  const ouvertes = reclamations.filter(r => r.statut === 'ouverte').length;
  const enCours = reclamations.filter(r => r.statut === 'en_cours').length;
  const resolues = reclamations.filter(r => ['resolue', 'fermee'].includes(r.statut)).length;
  const satNotes = reclamations.map(r => r.satisfaction).filter(Boolean);
  const satMoy = satNotes.length ? (satNotes.reduce((a, b) => a + b, 0) / satNotes.length).toFixed(1) : '—';

  const REC_BADGE = { ouverte: 'badge-danger', en_cours: 'badge-warning', resolue: 'badge-success', fermee: 'badge-secondary' };
  const REC_LABEL = { ouverte: 'Ouverte', en_cours: 'En cours', resolue: 'Résolue', fermee: 'Fermée' };
  const CANAUX = { accueil: 'Accueil', telephone: 'Téléphone', email: 'Email', site: 'Site web', autre: 'Autre' };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Service Client &amp; Suivi Patient</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Réclamations, enquêtes de satisfaction et relances post-traitement.
        </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="sc-new-btn"><i data-lucide="plus"></i> Nouvelle réclamation</button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom: var(--space-6);">
      <div class="kpi-card"><div class="kpi-icon danger"><i data-lucide="alert-circle"></i></div>
        <div class="kpi-content"><div class="kpi-label">Réclamations ouvertes</div><div class="kpi-value">${ouvertes}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon warning"><i data-lucide="loader"></i></div>
        <div class="kpi-content"><div class="kpi-label">En cours</div><div class="kpi-value">${enCours}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon success"><i data-lucide="check-circle"></i></div>
        <div class="kpi-content"><div class="kpi-label">Résolues</div><div class="kpi-value">${resolues}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon primary"><i data-lucide="star"></i></div>
        <div class="kpi-content"><div class="kpi-label">Satisfaction moyenne</div><div class="kpi-value">${satMoy}${satMoy !== '—' ? '/5' : ''}</div></div></div>
    </div>

    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-header"><h3 class="card-title"><i data-lucide="bell-ring" style="width:16px;height:16px;vertical-align:-2px;"></i>
        Relances à effectuer (RDV des 7 prochains jours)</h3></div>
      <div class="table-container">
        <table class="table">
          <thead><tr><th>Date</th><th>Heure</th><th>Patient</th><th>Téléphone</th><th>Motif</th><th>Statut RDV</th></tr></thead>
          <tbody>
            ${relances.length ? relances.map(r => `<tr>
              <td>${erpFmtDate(r.date_rdv)}</td>
              <td>${r.heure_rdv ? String(r.heure_rdv).slice(0, 5) : '—'}</td>
              <td><strong>${erpEsc(r.patient_nom)} ${erpEsc(r.patient_prenom || '')}</strong></td>
              <td>${erpEsc(r.patient_phone || '—')}</td>
              <td>${erpEsc(r.motif || '—')}</td>
              <td><span class="badge badge-info">${r.statut}</span></td>
            </tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--clr-text-muted,#94a3b8);">Aucune relance à effectuer.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Réclamations</h3></div>
      <div class="table-container">
        <table class="table">
          <thead><tr><th>Date</th><th>Patient</th><th>Canal</th><th>Sujet</th><th>Satisfaction</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            ${reclamations.length ? reclamations.map(r => `<tr>
              <td>${erpFmtDate(r.created_at)}</td>
              <td>${erpEsc(r.erp_patients ? erpPatientName(r.erp_patients) : (r.patient_nom || '—'))}</td>
              <td>${CANAUX[r.canal] || r.canal}</td>
              <td>${erpEsc(r.sujet)}</td>
              <td>${r.satisfaction ? '⭐'.repeat(r.satisfaction) : '—'}</td>
              <td><span class="badge ${REC_BADGE[r.statut] || 'badge-secondary'}">${REC_LABEL[r.statut] || r.statut}</span></td>
              <td>
                <div style="display:flex; gap:6px;">
                  ${['ouverte', 'en_cours'].includes(r.statut) ? `
                    <button class="table-action-btn" title="Traiter / résoudre" onclick="scResolve('${r.id}')"><i data-lucide="check"></i></button>` : ''}
                </div>
              </td>
            </tr>`).join('')
            : '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--clr-text-muted,#94a3b8);">Aucune réclamation enregistrée.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('sc-new-btn').addEventListener('click', openScForm);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openScForm() {
  const patients = window._scPatients || [];
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Nouvelle réclamation / enquête</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="sc-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Patient</label>
        <select name="patient_id" class="form-select form-input">
          <option value="">— Autre / non enregistré —</option>
          ${patients.map(p => `<option value="${p.id}">${erpEsc(erpPatientName(p))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Nom (si non enregistré)</label>
        <input type="text" name="patient_nom" class="form-input">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Canal</label>
          <select name="canal" class="form-select form-input">
            <option value="accueil">Accueil</option>
            <option value="telephone">Téléphone</option>
            <option value="email">Email</option>
            <option value="site">Site web</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Satisfaction (1–5)</label>
          <select name="satisfaction" class="form-select form-input">
            <option value="">—</option>
            ${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${'⭐'.repeat(n)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Sujet *</label>
        <input type="text" name="sujet" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea name="description" class="form-textarea form-input" rows="3"></textarea>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="sc-save">Enregistrer</button>
    </div>`);

  document.getElementById('sc-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('sc-form'));
    if (!fd.get('sujet')) return erpToast('Sujet requis', true);
    const patient = patients.find(p => p.id === fd.get('patient_id'));
    const { error } = await db.from('erp_reclamations').insert(withBranch({
      patient_id: patient?.id || null,
      patient_nom: patient ? erpPatientName(patient) : (fd.get('patient_nom') || null),
      canal: fd.get('canal'),
      sujet: fd.get('sujet'),
      description: fd.get('description') || null,
      satisfaction: parseInt(fd.get('satisfaction')) || null,
      statut: 'ouverte',
      created_by: window.currentUser?.id
    }));
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpCloseModal();
    erpToast('Réclamation enregistrée');
    const container = document.getElementById('module-content');
    if (container) renderServiceClientModule(container);
  });
}

function scResolve(id) {
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Traiter la réclamation</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="sc-res-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Statut</label>
        <select name="statut" class="form-select form-input">
          <option value="en_cours">En cours</option>
          <option value="resolue">Résolue</option>
          <option value="fermee">Fermée</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Résolution / réponse au patient</label>
        <textarea name="resolution" class="form-textarea form-input" rows="3"></textarea>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="sc-res-save">Enregistrer</button>
    </div>`);

  document.getElementById('sc-res-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('sc-res-form'));
    const statut = fd.get('statut');
    const { error } = await db.from('erp_reclamations').update({
      statut,
      resolution: fd.get('resolution') || null,
      resolved_at: ['resolue', 'fermee'].includes(statut) ? new Date().toISOString() : null
    }).eq('id', id);
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpCloseModal();
    erpToast('Réclamation mise à jour');
    const container = document.getElementById('module-content');
    if (container) renderServiceClientModule(container);
  });
}

// ==============================================================
// 2. ACHATS — founisè + bon kòmand + resepsyon
// ==============================================================
async function renderAchatsModule(container, meta) {
  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement des achats...</div></div>';

  const [bcRes, fourRes, prodRes, annexRes] = await Promise.all([
    erpSelect('erp_bons_commande', '*, erp_fournisseurs(nom)')
      .order('created_at', { ascending: false }).limit(200),
    db.from('erp_fournisseurs').select('*').eq('is_active', true).order('nom'),
    erpSelect('erp_produits', 'id, code, designation, quantite, quantite_min')
      .eq('is_active', true).order('designation').limit(300),
    db.from('erp_annexes').select('id, code, nom').eq('is_active', true).order('code')
  ]);

  window._achatsBC = bcRes.data || [];
  window._achatsFournisseurs = fourRes.data || [];
  window._achatsProduits = prodRes.data || [];
  window._achatsAnnexes = annexRes.data || [];

  const bcs = window._achatsBC;
  const enCours = bcs.filter(b => ['brouillon', 'envoye', 'partiel'].includes(b.statut)).length;
  const recus = bcs.filter(b => b.statut === 'recu').length;
  const totalMois = bcs
    .filter(b => (b.date_commande || '').slice(0, 7) === todayMonth())
    .reduce((a, b) => a + parseFloat(b.total || 0), 0);

  // Alèt stock kritik pou annex aktif la
  const critiques = window._achatsProduits.filter(p =>
    parseFloat(p.quantite || 0) <= parseFloat(p.quantite_min || 0));

  const BC_BADGE = { brouillon: 'badge-secondary', envoye: 'badge-info', partiel: 'badge-warning', recu: 'badge-success', annule: 'badge-danger' };
  const BC_LABEL = { brouillon: 'Brouillon', envoye: 'Envoyé', partiel: 'Partiel', recu: 'Reçu', annule: 'Annulé' };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Achats &amp; Approvisionnement</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Bons de commande fournisseurs, réceptions et transferts entre annexes.
        </p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="ach-transfer-btn"><i data-lucide="arrow-left-right"></i> Transfert d'annexe</button>
        <button class="btn btn-primary" id="ach-new-btn"><i data-lucide="plus"></i> Bon de commande</button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom: var(--space-6);">
      <div class="kpi-card"><div class="kpi-icon warning"><i data-lucide="loader"></i></div>
        <div class="kpi-content"><div class="kpi-label">Commandes en cours</div><div class="kpi-value">${enCours}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon success"><i data-lucide="package-check"></i></div>
        <div class="kpi-content"><div class="kpi-label">Reçues</div><div class="kpi-value">${recus}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon primary"><i data-lucide="banknote"></i></div>
        <div class="kpi-content"><div class="kpi-label">Achats ce mois</div><div class="kpi-value">${erpFmtMoney(totalMois)}</div></div></div>
      <div class="kpi-card"><div class="kpi-icon danger"><i data-lucide="alert-triangle"></i></div>
        <div class="kpi-content"><div class="kpi-label">Stock critique</div><div class="kpi-value">${critiques.length}</div></div></div>
    </div>

    ${critiques.length ? `
    <div class="card" style="margin-bottom: var(--space-6); border-left:4px solid #dc2626;">
      <div class="card-header"><h3 class="card-title"><i data-lucide="alert-triangle" style="width:16px;height:16px;color:#dc2626;vertical-align:-2px;"></i>
        Alertes stock critique (seuil de réapprovisionnement)</h3></div>
      <div class="table-container"><table class="table">
        <thead><tr><th>Article</th><th>Stock</th><th>Seuil</th></tr></thead>
        <tbody>${critiques.slice(0, 10).map(p => `<tr>
          <td>${erpEsc(p.designation)}</td>
          <td><span class="badge badge-danger">${p.quantite}</span></td>
          <td>${p.quantite_min}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card">
      <div class="card-header"><h3 class="card-title">Bons de commande</h3></div>
      <div class="table-container">
        <table class="table">
          <thead><tr><th>Nº</th><th>Date</th><th>Fournisseur</th><th>Articles</th><th>Total</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            ${bcs.length ? bcs.map(b => `<tr>
              <td><strong>${erpEsc(b.numero || '—')}</strong></td>
              <td>${erpFmtDate(b.date_commande)}</td>
              <td>${erpEsc(b.erp_fournisseurs?.nom || b.fournisseur_nom || '—')}</td>
              <td>${(b.items || []).length} ligne(s)</td>
              <td><strong>${erpFmtMoney(b.total)}</strong></td>
              <td><span class="badge ${BC_BADGE[b.statut] || 'badge-secondary'}">${BC_LABEL[b.statut] || b.statut}</span></td>
              <td><div style="display:flex; gap:6px;">
                ${b.statut === 'brouillon' ? `<button class="table-action-btn" title="Envoyer au fournisseur" onclick="bcStatut('${b.id}','envoye')"><i data-lucide="send"></i></button>` : ''}
                ${['envoye', 'partiel'].includes(b.statut) ? `<button class="table-action-btn" title="Réceptionner (entrée stock)" onclick="bcReception('${b.id}')"><i data-lucide="package-check"></i></button>` : ''}
                ${b.statut !== 'annule' && b.statut !== 'recu' ? `<button class="table-action-btn" title="Annuler" onclick="bcStatut('${b.id}','annule')"><i data-lucide="x"></i></button>` : ''}
              </div></td>
            </tr>`).join('')
            : '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--clr-text-muted,#94a3b8);">Aucun bon de commande.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('ach-new-btn').addEventListener('click', openBcForm);
  document.getElementById('ach-transfer-btn').addEventListener('click', openTransferForm);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function todayMonth() { return new Date().toISOString().slice(0, 7); }

async function bcStatut(id, statut) {
  const { error } = await db.from('erp_bons_commande').update({ statut }).eq('id', id);
  if (error) return erpToast('Erreur: ' + error.message, true);
  erpToast('Statut mis à jour');
  const container = document.getElementById('module-content');
  if (container) renderAchatsModule(container);
}

// Resepsyon: chak liy antre nan stock annex la
async function bcReception(id) {
  const b = (window._achatsBC || []).find(x => x.id === id);
  if (!b) return;
  if (!confirm(`Réceptionner le bon ${b.numero} ?\nLes articles seront entrés en stock.`)) return;

  try {
    for (const item of (b.items || [])) {
      if (item.produit_id) {
        await db.from('erp_stock_movements').insert(withBranch({
          produit_id: item.produit_id,
          type: 'entree',
          quantite: parseFloat(item.quantite) || 0,
          prix_unitaire: parseFloat(item.prix_unitaire) || null,
          fournisseur: b.fournisseur_nom || b.erp_fournisseurs?.nom,
          motif: 'Achat fournisseur',
          reference: b.numero,
          created_by: window.currentUser?.id
        }));
      }
    }
    await db.from('erp_bons_commande')
      .update({ statut: 'recu', recu_at: new Date().toISOString() }).eq('id', id);
    erpToast('Réception enregistrée — stock mis à jour');
    if (typeof logActivity === 'function') logActivity('Réception BC', 'Achats', b.numero);
    const container = document.getElementById('module-content');
    if (container) renderAchatsModule(container);
  } catch (e) {
    erpToast('Erreur: ' + (e.message || e), true);
  }
}

function openBcForm() {
  const fournisseurs = window._achatsFournisseurs || [];
  const produits = window._achatsProduits || [];
  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Nouveau bon de commande</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="bc-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Fournisseur</label>
        <select name="fournisseur_id" class="form-select form-input">
          <option value="">— Autre / saisir le nom —</option>
          ${fournisseurs.map(f => `<option value="${f.id}">${erpEsc(f.nom)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Nom fournisseur (si non listé)</label>
        <input type="text" name="fournisseur_nom" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Articles *</label>
        <div id="bc-items">
          <div class="bc-item" style="display:grid; grid-template-columns:2fr 1fr 1fr; gap:8px; margin-bottom:8px;">
            <select name="produit_id" class="form-select form-input bc-prod">
              <option value="">— Article catalogue —</option>
              ${produits.map(p => `<option value="${p.id}">${erpEsc(p.designation)} (stock: ${p.quantite})</option>`).join('')}
            </select>
            <input type="number" name="quantite" class="form-input" placeholder="Qté" min="1" value="1">
            <input type="number" name="prix" class="form-input" placeholder="Prix unit." min="0" step="0.01">
          </div>
        </div>
        <button type="button" class="btn btn-secondary" id="bc-add-line" style="font-size:12px; padding:6px 12px;">
          <i data-lucide="plus"></i> Ajouter une ligne
        </button>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea name="notes" class="form-textarea form-input" rows="2"></textarea>
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="bc-save">Créer le bon</button>
    </div>`, true);

  document.getElementById('bc-add-line').addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'bc-item';
    div.style.cssText = 'display:grid; grid-template-columns:2fr 1fr 1fr; gap:8px; margin-bottom:8px;';
    div.innerHTML = `
      <select name="produit_id" class="form-select form-input bc-prod">
        <option value="">— Article catalogue —</option>
        ${produits.map(p => `<option value="${p.id}">${erpEsc(p.designation)} (stock: ${p.quantite})</option>`).join('')}
      </select>
      <input type="number" name="quantite" class="form-input" placeholder="Qté" min="1" value="1">
      <input type="number" name="prix" class="form-input" placeholder="Prix unit." min="0" step="0.01">`;
    document.getElementById('bc-items').appendChild(div);
  });

  document.getElementById('bc-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('bc-form'));
    const items = [];
    document.querySelectorAll('#bc-items .bc-item').forEach(row => {
      const pid = row.querySelector('.bc-prod').value;
      const qty = parseFloat(row.querySelector('[name=quantite]').value) || 0;
      const prix = parseFloat(row.querySelector('[name=prix]').value) || 0;
      if (!pid && !qty) return;
      const prod = produits.find(p => p.id === pid);
      items.push({
        produit_id: pid || null,
        designation: prod?.designation || 'Article libre',
        quantite: qty,
        prix_unitaire: prix
      });
    });
    if (!items.length) return erpToast('Ajouter au moins un article', true);
    const total = items.reduce((a, i) => a + i.quantite * i.prix_unitaire, 0);
    const fournisseur = fournisseurs.find(f => f.id === fd.get('fournisseur_id'));

    const { error } = await db.from('erp_bons_commande').insert(withBranch({
      fournisseur_id: fd.get('fournisseur_id') || null,
      fournisseur_nom: fournisseur?.nom || fd.get('fournisseur_nom') || null,
      items, total,
      notes: fd.get('notes') || null,
      statut: 'brouillon',
      created_by: window.currentUser?.id
    }));
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpCloseModal();
    erpToast('Bon de commande créé');
    const container = document.getElementById('module-content');
    if (container) renderAchatsModule(container);
  });
}

// Transfè stock ant annex (RPC erp_transfer_stock)
function openTransferForm() {
  const produits = window._achatsProduits || [];
  const annexes = (window._achatsAnnexes || []).filter(a => a.id !== getInsertAnnexeId());
  if (!annexes.length) return erpToast('Aucune autre annexe active', true);

  erpShowModal(`
    <div class="modal-header">
      <h3 class="modal-title">Transfert de stock entre annexes</h3>
      <button class="modal-close" onclick="erpCloseModal()"><i data-lucide="x"></i></button>
    </div>
    <form id="tr-form" class="modal-body">
      <div class="form-group">
        <label class="form-label">Article *</label>
        <select name="produit_id" class="form-select form-input" required>
          <option value="">— Choisir —</option>
          ${produits.map(p => `<option value="${p.id}">${erpEsc(p.designation)} (stock: ${p.quantite})</option>`).join('')}
        </select>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Quantité *</label>
          <input type="number" name="quantite" class="form-input" min="1" step="any" required>
        </div>
        <div class="form-group">
          <label class="form-label">Annexe de destination *</label>
          <select name="dest" class="form-select form-input" required>
            ${annexes.map(a => `<option value="${a.id}">${a.code} — ${erpEsc(a.nom)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Motif</label>
        <input type="text" name="motif" class="form-input" value="Transfert entre annexes">
      </div>
    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="erpCloseModal()">Annuler</button>
      <button class="btn btn-primary" id="tr-save">Transférer</button>
    </div>`);

  document.getElementById('tr-save').addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('tr-form'));
    const { error } = await db.rpc('erp_transfer_stock', {
      p_produit_id: fd.get('produit_id'),
      p_quantite: parseFloat(fd.get('quantite')),
      p_dest_annexe_id: fd.get('dest'),
      p_motif: fd.get('motif') || 'Transfert entre annexes'
    });
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpCloseModal();
    erpToast('Transfert effectué');
    if (typeof logActivity === 'function') logActivity('Transfert stock', 'Stock', '');
  });
}

// ==============================================================
// 3. JONAL ODIT — direksyon + enfòmatisyen sèlman
// ==============================================================
async function renderAuditModule(container, meta) {
  const u = window.currentUser;
  const allowed = hasGlobalAccess(u) || u?.role === 'manager';
  if (!allowed) {
    container.innerHTML = `<div class="card" style="padding:40px; text-align:center;">
      <i data-lucide="shield-off" style="width:40px;height:40px;color:#dc2626;margin-bottom:12px;"></i>
      <h3>Accès réservé</h3>
      <p style="color:var(--clr-text-muted,#94a3b8);">Le journal d'audit est réservé à la Direction et à l'administrateur système.</p>
    </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement du journal...</div></div>';

  const { data: logs } = await erpSelect('erp_audit_log', '*')
    .order('created_at', { ascending: false }).limit(300);

  window._auditAll = logs || [];

  const tables = [...new Set(window._auditAll.map(l => l.table_name))].sort();
  const ACTION_BADGE = { INSERT: 'badge-success', UPDATE: 'badge-warning', DELETE: 'badge-danger' };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Journal d'audit</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          Traçabilité des actions critiques — utilisateur, horodatage et annexe concernée.
        </p>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-body" style="padding:14px; display:flex; gap:12px; align-items:end; flex-wrap:wrap;">
        <div class="form-group" style="margin:0; min-width:180px;">
          <label class="form-label">Table</label>
          <select id="au-f-table" class="form-select form-input">
            <option value="">Toutes</option>
            ${tables.map(t => `<option value="${t}">${t.replace('erp_', '')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0; min-width:150px;">
          <label class="form-label">Action</label>
          <select id="au-f-action" class="form-select form-input">
            <option value="">Toutes</option>
            <option value="INSERT">Création</option>
            <option value="UPDATE">Modification</option>
            <option value="DELETE">Suppression</option>
          </select>
        </div>
        <div class="form-group" style="margin:0; flex:1; min-width:200px;">
          <label class="form-label">Recherche</label>
          <input type="text" id="au-f-q" class="form-input" placeholder="Utilisateur, contenu...">
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead><tr>
            <th>Date / Heure</th><th>Utilisateur</th><th>Action</th>
            <th>Table</th><th>Annexe</th><th>Détail</th>
          </tr></thead>
          <tbody id="au-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const renderRows = () => {
    const t = document.getElementById('au-f-table').value;
    const a = document.getElementById('au-f-action').value;
    const q = document.getElementById('au-f-q').value.toLowerCase();
    const rows = window._auditAll.filter(l =>
      (!t || l.table_name === t) &&
      (!a || l.action === a) &&
      (!q || `${l.user_nom || ''} ${l.old_data || ''} ${l.new_data || ''}`.toLowerCase().includes(q))
    );

    document.getElementById('au-tbody').innerHTML = rows.length ? rows.map(l => {
      const detail = l.action === 'DELETE'
        ? Object.entries(l.old_data || {}).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(' · ')
        : Object.entries(l.new_data || {}).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(' · ');
      return `<tr>
        <td>${new Date(l.created_at).toLocaleString('fr-FR')}</td>
        <td>${erpEsc(l.user_nom || l.user_id?.slice(0, 8) || 'système')}</td>
        <td><span class="badge ${ACTION_BADGE[l.action] || 'badge-secondary'}">${l.action}</span></td>
        <td><code>${erpEsc(l.table_name.replace('erp_', ''))}</code></td>
        <td>${erpEsc(erpAnnexeCode(l.annexe_id) || '—')}</td>
        <td style="font-size:12px; max-width:320px; overflow:hidden; text-overflow:ellipsis;">${erpEsc(detail)}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--clr-text-muted,#94a3b8);">Aucune entrée.</td></tr>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  };

  ['au-f-table', 'au-f-action', 'au-f-q'].forEach(id =>
    document.getElementById(id).addEventListener('input', renderRows));
  renderRows();
}
