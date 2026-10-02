// ==============================================================
// Modul ANNEXES — jestion sikisal yo (direksyon / PDG)
//   * Kreye annex yo (kòd = prefiks kòd pasyan, ex: "PAP" -> PAP-0001)
//   * Wè estatistik chak annex (anplwaye, pasyan, pwochen kòd)
//   * Asiye chak anplwaye nan yon annex
// Rele pa module.html?m=annexes
// ==============================================================

let _annexesList = [];
let _annexStats = {};   // annexe_id -> { employes, patients }
let _allStaff = [];

function annexCanManage() {
  const u = window.currentUser;
  return typeof isErpOwner === 'function' && isErpOwner(u)
    || ['pdg', 'directrice', 'directeur'].includes(u?.role);
}

async function renderAnnexesModule(container, meta) {
  container.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">Chargement des annexes...</div>
    </div>`;

  const [{ data: annexes }, { data: users }, { data: patients }] = await Promise.all([
    db.from('erp_annexes').select('*').order('is_principale', { ascending: false }).order('created_at'),
    db.from('erp_users').select('id, first_name, last_name, email, role, annexe_id, is_active, erp_postes(name)').order('first_name'),
    db.from('erp_patients').select('id, annexe_id, code')
  ]);

  _annexesList = annexes || [];
  _allStaff = users || [];

  _annexStats = {};
  _annexesList.forEach(a => { _annexStats[a.id] = { employes: 0, patients: 0 }; });
  (_allStaff || []).forEach(u => {
    if (u.annexe_id && _annexStats[u.annexe_id]) _annexStats[u.annexe_id].employes++;
  });
  (patients || []).forEach(p => {
    if (p.annexe_id && _annexStats[p.annexe_id]) _annexStats[p.annexe_id].patients++;
    else if (p.annexe_id) {
      _annexStats[p.annexe_id] = _annexStats[p.annexe_id] || { employes: 0, patients: 0 };
      _annexStats[p.annexe_id].patients++;
    }
  });

  const canManage = annexCanManage();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Annexes du centre</h2>
        <p style="margin:4px 0 0; color: var(--clr-text-muted, #94a3b8); font-size:13px;">
          Chaque annexe a un <strong>code</strong> qui sert de préfixe aux dossiers patients
          (ex: <code>PAP-0001</code>). Les employés enregistrent les patients pour leur annexe.
        </p>
      </div>
      ${canManage ? `
      <div class="page-actions">
        <button class="btn btn-primary" onclick="document.getElementById('annexe-form-card').classList.toggle('hidden'); lucide.createIcons();">
          <i data-lucide="plus"></i> Nouvelle annexe
        </button>
      </div>` : ''}
    </div>

    ${canManage ? `
    <div class="card hidden" id="annexe-form-card" style="margin-bottom: var(--space-6);">
      <div class="card-header"><h3 class="card-title">Créer une annexe</h3></div>
      <div class="card-body" style="padding: var(--space-5);">
        <form id="annexe-add-form">
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;">
            <div class="form-group">
              <label class="form-label">Code (préfixe) *</label>
              <input type="text" name="code" class="form-input" required maxlength="6"
                     placeholder="ex: PAP, DEL, CAP" style="text-transform: uppercase;">
            </div>
            <div class="form-group">
              <label class="form-label">Nom de l'annexe *</label>
              <input type="text" name="nom" class="form-input" required placeholder="ex: Annexe Delmas">
            </div>
            <div class="form-group">
              <label class="form-label">Ville / Commune</label>
              <input type="text" name="ville" class="form-input" list="annexe-ville-list" placeholder="Port-au-Prince">
              <datalist id="annexe-ville-list">
                ${(typeof HAITI_ALL_COMMUNES !== 'undefined' ? HAITI_ALL_COMMUNES : []).map(c => `<option value="${c}">`).join('')}
              </datalist>
            </div>
            <div class="form-group">
              <label class="form-label">Adresse</label>
              <input type="text" name="adresse" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">Téléphone</label>
              <input type="tel" name="phone" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">Responsable</label>
              <select name="responsable_id" class="form-select form-input">
                <option value="">— Aucun —</option>
                ${_allStaff.map(u => `<option value="${u.id}">${u.first_name || ''} ${u.last_name || ''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="display:flex; align-items:flex-end; gap:8px;">
              <label style="display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer;">
                <input type="checkbox" name="is_principale"> Annexe principale (siège)
              </label>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:16px;">
            <i data-lucide="check"></i> Enregistrer l'annexe
          </button>
        </form>
      </div>
    </div>` : `
    <div class="alert alert-info" style="margin-bottom: var(--space-6);">
      <div class="alert-content">
        <div class="alert-message">Seule la direction (PDG) peut créer ou modifier les annexes.</div>
      </div>
    </div>`}

    <div id="annexes-list">
      ${renderAnnexeCards(_annexesList, canManage)}
    </div>

    ${canManage ? `
    <div class="card" style="margin-top: var(--space-6);">
      <div class="card-header">
        <h3 class="card-title">Affectation du personnel</h3>
      </div>
      <div class="card-body" style="padding: var(--space-5);">
        <p style="margin-top:0; color: var(--clr-text-muted, #94a3b8); font-size:13px;">
          L'annexe d'un employé détermine le préfixe du code des patients qu'il enregistre.
        </p>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr><th>Employé</th><th>Poste</th><th>Rôle</th><th>Annexe</th></tr>
            </thead>
            <tbody>
              ${_allStaff.map(u => `
                <tr>
                  <td>${(u.first_name || '') + ' ' + (u.last_name || '')}<br>
                      <span style="color: var(--clr-text-muted, #94a3b8); font-size:12px;">${u.email || ''}</span></td>
                  <td>${u.erp_postes?.name || '-'}</td>
                  <td><span class="badge badge-secondary">${typeof formatRole === 'function' ? formatRole(u.role) : u.role}</span></td>
                  <td>
                    <select class="form-select form-input" style="min-width:160px;"
                            onchange="assignUserAnnexe('${u.id}', this.value)">
                      <option value="">— Non assigné —</option>
                      ${_annexesList.map(a => `
                        <option value="${a.id}" ${u.annexe_id === a.id ? 'selected' : ''}>${a.code} — ${a.nom}</option>
                      `).join('')}
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>` : ''}
  `;

  const form = document.getElementById('annexe-add-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const record = {
        code: String(fd.get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
        nom: String(fd.get('nom') || '').trim(),
        ville: fd.get('ville') || null,
        adresse: fd.get('adresse') || null,
        phone: fd.get('phone') || null,
        responsable_id: fd.get('responsable_id') || null,
        is_principale: fd.get('is_principale') === 'on',
        enterprise_id: window.enterpriseContext?.enterprise?.id || null,
        created_by: window.currentUser?.id || null
      };
      if (!record.code || !record.nom) {
        alert('Le code et le nom sont obligatoires.');
        return;
      }
      // Yon sèl annex prensipal
      if (record.is_principale) {
        await db.from('erp_annexes').update({ is_principale: false }).eq('is_principale', true);
      }
      const { error } = await db.from('erp_annexes').insert(record);
      if (error) {
        alert('Erreur: ' + error.message);
      } else {
        if (typeof logActivity === 'function') logActivity('Création', 'Annexes', `Annexe ${record.code} — ${record.nom}`);
        renderAnnexesModule(container, meta);
      }
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderAnnexeCards(annexes, canManage) {
  if (!annexes.length) {
    return `<div class="card" style="padding:32px; text-align:center; color: var(--clr-text-muted, #94a3b8);">
      Aucune annexe enregistrée. ${canManage ? 'Créez la première annexe du centre.' : ''}
    </div>`;
  }

  return `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">
    ${annexes.map(a => {
      const st = _annexStats[a.id] || { employes: 0, patients: 0 };
      const responsable = _allStaff.find(u => u.id === a.responsable_id);
      return `
      <div class="card" style="padding: var(--space-5); ${a.is_active ? '' : 'opacity:.55;'}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge ${a.is_active ? 'badge-primary' : 'badge-secondary'}" style="font-size:15px;">${a.code}</span>
              ${a.is_principale ? '<span class="badge badge-success">Siège</span>' : ''}
            </div>
            <h3 style="margin:8px 0 2px; font-size:17px;">${a.nom}</h3>
            <div style="color: var(--clr-text-muted, #94a3b8); font-size:13px;">
              ${[a.ville, a.phone].filter(Boolean).join(' • ') || '—'}
            </div>
            ${responsable ? `<div style="font-size:12px; margin-top:2px;">Resp.: ${responsable.first_name} ${responsable.last_name || ''}</div>` : ''}
          </div>
          ${canManage ? `
          <button class="table-action-btn ${a.is_active ? 'danger' : ''}" title="${a.is_active ? 'Désactiver' : 'Activer'}"
                  onclick="toggleAnnexe('${a.id}', ${a.is_active})">
            <i data-lucide="${a.is_active ? 'ban' : 'check'}"></i>
          </button>` : ''}
        </div>
        <div style="display:flex; gap:16px; margin-top:14px; padding-top:12px; border-top:1px solid var(--clr-border, #e2e8f0); font-size:13px;">
          <div><strong>${st.employes}</strong> employé${st.employes > 1 ? 's' : ''}</div>
          <div><strong>${st.patients}</strong> patient${st.patients > 1 ? 's' : ''}</div>
          <div style="margin-left:auto; color: var(--clr-text-muted, #94a3b8);">
            Prochain: <code>${a.code}-${String((a.patient_seq || 0) + 1).padStart(4, '0')}</code>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

async function toggleAnnexe(id, isActive) {
  const { error } = await db.from('erp_annexes').update({ is_active: !isActive }).eq('id', id);
  if (error) {
    alert('Erreur: ' + error.message);
    return;
  }
  const container = document.getElementById('module-content');
  if (container) renderAnnexesModule(container, null);
}

async function assignUserAnnexe(userId, annexeId) {
  const { error } = await db
    .from('erp_users')
    .update({ annexe_id: annexeId || null })
    .eq('id', userId);
  if (error) {
    alert('Erreur: ' + error.message);
    return;
  }
  if (typeof logActivity === 'function') logActivity('Affectation', 'Annexes', `Employé assigné à une annexe`);
  const container = document.getElementById('module-content');
  if (container) renderAnnexesModule(container, null);
}
