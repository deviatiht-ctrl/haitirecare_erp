// ==============================================================
// RAPPORTS MENSUELS — m=rapports_mensuels
//   * Chak poste jenere rapò mwa a (Secrétariat, Comptabilité,
//     Stock & Achats, Clinique, Atelier)
//   * Ekspòtasyon CSV (Excel) + enpresyon/PDF
//   * "Envoyer à la Direction" → erp_rapports_mensuels + notifikasyon
//   * Direksyon: boîte de réception + rapò konsolide (de tou de annex)
// Rele pa module.html — bezwen branch.js + clinique.js
// ==============================================================

let _rappPeriode = new Date().toISOString().slice(0, 7); // YYYY-MM
let _rappTab = null;

// Tab ki disponib selon wòl itilizatè a
function rapportsTabsFor(user) {
  const role = user?.role;
  const perms = user?.effective_permissions || {};
  const tabs = [];
  const push = (id, label, icon) => tabs.push({ id, label, icon });

  if (hasGlobalAccess(user)) {
    push('direction', 'Rapports reçus', 'inbox');
    push('consolide', 'Consolidation (2 annexes)', 'combine');
    push('secretariat', 'Secrétariat', 'clipboard-list');
    push('comptabilite', 'Comptabilité & Caisse', 'banknote');
    push('stock', 'Stock & Achats', 'package');
    push('clinique', 'Clinique & Atelier', 'activity');
    return tabs;
  }

  if (['secretaire', 'receptionniste', 'manager'].includes(role))
    push('secretariat', 'Secrétariat', 'clipboard-list');
  if (role === 'comptable' || perms.caisse || perms.finances)
    push('comptabilite', 'Comptabilité & Caisse', 'banknote');
  if (role === 'responsable_stock' || perms.stock || perms.achats)
    push('stock', 'Stock & Achats', 'package');
  if (['medecin', 'physiotherapeute'].includes(role) || perms.seances)
    push('clinique', 'Clinique', 'activity');
  if (role === 'ouvrier' || perms.atelier)
    push('atelier', 'Atelier', 'hammer');
  if (!tabs.length) push('clinique', 'Mon activité', 'activity');
  return tabs;
}

// ---------- Koleksyon done pou chak rapò ----------
async function buildMonthData(periode, annexeId /* null = tout */) {
  const start = `${periode}-01`;
  const end = `${periode}-31`;

  const scoped = (t, cols) => {
    let q = db.from(t).select(cols || '*');
    if (annexeId) q = q.eq('annexe_id', annexeId);
    return q;
  };

  const [rdv, patients, seances, evals, ateliers, enc, rev, dep, movs, bcs, recs, caisses] = await Promise.all([
    scoped('erp_rdv').gte('date_rdv', start).lte('date_rdv', end),
    scoped('erp_patients', 'id, code, nom, created_at').gte('created_at', start).lte('created_at', end + 'T23:59:59'),
    scoped('erp_seances').gte('date_seance', start).lte('date_seance', end),
    scoped('erp_evaluations').gte('date_evaluation', start).lte('date_evaluation', end),
    scoped('erp_atelier_orders').gte('date_commande', start).lte('date_commande', end),
    scoped('erp_encaissements').gte('date_doc', start).lte('date_doc', end),
    scoped('erp_revenus').gte('date_transaction', start).lte('date_transaction', end),
    scoped('erp_depenses').gte('date_transaction', start).lte('date_transaction', end),
    scoped('erp_stock_movements').gte('created_at', start).lte('created_at', end + 'T23:59:59'),
    scoped('erp_bons_commande').gte('date_commande', start).lte('date_commande', end),
    scoped('erp_reclamations').gte('created_at', start).lte('created_at', end + 'T23:59:59'),
    scoped('erp_caisse').gte('date_caisse', start).lte('date_caisse', end)
  ]);

  const pick = (r) => r.data || [];
  return {
    rdv: pick(rdv), patients: pick(patients), seances: pick(seances),
    evals: pick(evals), ateliers: pick(ateliers), enc: pick(enc),
    rev: pick(rev), dep: pick(dep), movs: pick(movs), bcs: pick(bcs),
    recs: pick(recs), caisses: pick(caisses)
  };
}

// ---------- Konstriksyon rapò yo ----------
function buildReport(tab, d, periode, annexeNom) {
  const R = { titre: '', kpis: [], table: null };
  const sum = (arr, k) => arr.reduce((a, x) => a + parseFloat(x[k] || 0), 0);

  if (tab === 'secretariat') {
    const annules = d.rdv.filter(r => r.statut === 'annule').length;
    const sat = d.recs.map(r => r.satisfaction).filter(Boolean);
    R.titre = `Rapport Secrétariat — ${periode} (${annexeNom})`;
    R.kpis = [
      { label: 'Nouveaux dossiers', value: d.patients.length },
      { label: 'Rendez-vous', value: d.rdv.length },
      { label: 'RDV annulés', value: annules },
      { label: 'Taux d\'annulation', value: d.rdv.length ? Math.round(annules / d.rdv.length * 100) + '%' : '0%' },
      { label: 'Réclamations', value: d.recs.length },
      { label: 'Satisfaction moyenne', value: sat.length ? (sat.reduce((a, b) => a + b) / sat.length).toFixed(1) + '/5' : '—' }
    ];
    R.table = {
      head: ['Date', 'Patient', 'Motif', 'Statut'],
      rows: d.rdv.map(r => [r.date_rdv, `${r.patient_nom || ''} ${r.patient_prenom || ''}`.trim(), r.motif || '', r.statut])
    };
  }

  if (tab === 'comptabilite') {
    const payes = d.enc.filter(e => e.statut === 'paye');
    const totalEnc = sum(payes, 'montant');
    const totRev = sum(d.rev, 'montant') + totalEnc;
    const totDep = sum(d.dep, 'montant');
    R.titre = `Rapport Comptabilité & Caisse — ${periode} (${annexeNom})`;
    R.kpis = [
      { label: 'Total Recettes (R Total)', value: erpFmtMoney(totRev) },
      { label: 'Prélèvements / Dépenses', value: erpFmtMoney(totDep) },
      { label: 'Encaissement Net', value: erpFmtMoney(totRev - totDep) },
      { label: 'Évaluations réalisées', value: d.evals.length },
      { label: 'Séances thérapie', value: d.seances.length },
      { label: 'Documents émis', value: d.enc.length },
      { label: 'Clôtures de caisse', value: d.caisses.filter(c => c.solde_fermeture != null).length }
    ];

    // Ventilation par date
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

    d.evals.forEach(ev => {
      const row = ensureDate(ev.date_evaluation);
      if (row) row.nb_eval += 1;
    });

    d.seances.forEach(sc => {
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

    d.rev.forEach(rv => {
      const row = ensureDate(rv.date_transaction);
      if (row) row.r_autre += parseFloat(rv.montant || 0);
    });

    d.dep.forEach(dp => {
      const row = ensureDate(dp.date_transaction);
      if (row) row.prelevement += parseFloat(dp.montant || 0);
    });

    const sortedDates = Object.keys(dateMap).sort();

    // Table 1: Synthèse Activités & Caisse par Date
    const t1Rows = [];
    let tot_nb_eval = 0, tot_nb_therapie = 0, tot_r1 = 0, tot_prelev1 = 0, tot_enc1 = 0;

    sortedDates.forEach(dt => {
      const row = dateMap[dt];
      const r_total = row.r_eval + row.r_reeval + row.r_app + row.r_therapie + row.r_autre;
      const encaissement = r_total - row.prelevement;

      tot_nb_eval += row.nb_eval;
      tot_nb_therapie += row.nb_therapie;
      tot_r1 += r_total;
      tot_prelev1 += row.prelevement;
      tot_enc1 += encaissement;

      t1Rows.push([
        row.date,
        row.nb_eval,
        row.nb_therapie,
        erpFmtMoney(r_total),
        erpFmtMoney(row.prelevement),
        erpFmtMoney(encaissement)
      ]);
    });

    // Table 2: Ventilation Détaillée des Recettes & Prélèvements
    const t2Rows = [];
    let tot_eval = 0, tot_reeval = 0, tot_rapp = 0, tot_rtherapie = 0;

    sortedDates.forEach(dt => {
      const row = dateMap[dt];
      const r_total = row.r_eval + row.r_reeval + row.r_app + row.r_therapie + row.r_autre;
      const encaissement = r_total - row.prelevement;

      tot_eval += row.r_eval;
      tot_reeval += row.r_reeval;
      tot_rapp += row.r_app;
      tot_rtherapie += row.r_therapie;

      t2Rows.push([
        row.date,
        erpFmtMoney(row.r_eval),
        erpFmtMoney(row.r_reeval),
        erpFmtMoney(row.r_app),
        erpFmtMoney(row.r_therapie),
        erpFmtMoney(r_total),
        erpFmtMoney(row.prelevement),
        erpFmtMoney(encaissement)
      ]);
    });

    R.tables = [
      {
        titre: '1. Synthèse Activités & Caisse par Date',
        head: ['Date', 'Nombre Évaluation', 'Nombre Thérapie', 'R Total', 'Prélèvement', 'Encaissement'],
        rows: t1Rows,
        total: ['TOTAL', tot_nb_eval, tot_nb_therapie, erpFmtMoney(tot_r1), erpFmtMoney(tot_prelev1), erpFmtMoney(tot_enc1)]
      },
      {
        titre: '2. Ventilation des Recettes (Évaluation, Réévaluation, Appareillage, Thérapie)',
        head: ['Date', 'Évaluation', 'Réévaluation', 'R App', 'R Thérapie', 'R Total', 'Prélèvement', 'Encaissement'],
        rows: t2Rows,
        total: ['TOTAL', erpFmtMoney(tot_eval), erpFmtMoney(tot_reeval), erpFmtMoney(tot_rapp), erpFmtMoney(tot_rtherapie), erpFmtMoney(tot_r1), erpFmtMoney(tot_prelev1), erpFmtMoney(tot_enc1)]
      }
    ];

    R.table = R.tables[0];
  }

  if (tab === 'stock') {
    const entrees = d.movs.filter(m => m.type === 'entree');
    const sorties = d.movs.filter(m => m.type === 'sortie');
    const byMotif = {};
    d.movs.forEach(m => { const k = m.motif || 'Autre'; byMotif[k] = (byMotif[k] || 0) + parseFloat(m.quantite || 0); });
    R.titre = `Rapport Stock & Achats — ${periode} (${annexeNom})`;
    R.kpis = [
      { label: 'Entrées', value: entrees.length },
      { label: 'Sorties', value: sorties.length },
      { label: 'Qté entrée', value: sum(entrees, 'quantite') },
      { label: 'Qté sortie', value: sum(sorties, 'quantite') },
      { label: 'Bons de commande', value: d.bcs.length },
      { label: 'Total achats', value: erpFmtMoney(sum(d.bcs, 'total')) },
      { label: 'Transferts', value: d.movs.filter(m => m.motif === 'Transfert entre annexes' || m.reference === 'TRANSFERT').length }
    ];
    R.table = {
      head: ['Date', 'Type', 'Quantité', 'Motif', 'Référence'],
      rows: d.movs.map(m => [(m.created_at || '').slice(0, 10), m.type, m.quantite, m.motif || '', m.reference || ''])
    };
  }

  if (tab === 'clinique') {
    const realisees = d.seances.filter(s => s.statut === 'realisee').length;
    R.titre = `Rapport Clinique — ${periode} (${annexeNom})`;
    R.kpis = [
      { label: 'Évaluations', value: d.evals.length },
      { label: 'Séances réalisées', value: realisees },
      { label: 'Séances prévues', value: d.seances.length - realisees },
      { label: 'Orientations physio', value: d.evals.filter(e => e.orientation === 'physio').length },
      { label: 'Orientations atelier', value: d.evals.filter(e => e.orientation === 'atelier').length }
    ];
    R.table = {
      head: ['Date', 'Type', 'Durée (min)', 'Statut'],
      rows: d.seances.map(s => [s.date_seance, s.type_seance || '', s.duree_min || '', s.statut])
    };
  }

  if (tab === 'atelier') {
    const livres = d.ateliers.filter(o => o.statut === 'livre').length;
    R.titre = `Rapport Atelier — ${periode} (${annexeNom})`;
    R.kpis = [
      { label: 'Ordres reçus', value: d.ateliers.length },
      { label: 'Fabriqués & livrés', value: livres },
      { label: 'En cours', value: d.ateliers.filter(o => o.statut === 'en_cours').length },
      { label: 'En attente', value: d.ateliers.filter(o => o.statut === 'en_attente').length },
      { label: 'Prêts (non livrés)', value: d.ateliers.filter(o => o.statut === 'pret').length }
    ];
    R.table = {
      head: ['Nº', 'Date', 'Type', 'Priorité', 'Statut', 'Coût'],
      rows: d.ateliers.map(o => [o.numero, o.date_commande, o.type_appareil, o.priorite, o.statut, o.cout])
    };
  }

  return R;
}

// ---------- Ekspòtasyon CSV (Excel) ----------
function exportReportCsv(R, periode) {
  const sep = ';';
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  let csv = '';
  csv += esc(R.titre) + '\n\n';
  csv += R.kpis.map(k => esc(k.label) + sep + esc(k.value)).join('\n') + '\n\n';

  if (R.tables && R.tables.length) {
    R.tables.forEach(tbl => {
      csv += esc(tbl.titre) + '\n';
      csv += tbl.head.map(esc).join(sep) + '\n';
      csv += tbl.rows.map(r => r.map(esc).join(sep)).join('\n') + '\n';
      if (tbl.total) csv += tbl.total.map(esc).join(sep) + '\n';
      csv += '\n';
    });
  } else if (R.table) {
    csv += R.table.head.map(esc).join(sep) + '\n';
    csv += R.table.rows.map(r => r.map(esc).join(sep)).join('\n');
  }

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rapport_${_rappTab}_${periode}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Enpresyon / PDF ----------
function printReport(R, periode) {
  const settings = window.enterpriseContext?.settings || {};
  const w = window.open('', '_blank', 'width=880,height=900');
  if (!w) return erpToast('Popup bloqué — autorisez les popups', true);

  const tablesHtml = (R.tables && R.tables.length)
    ? R.tables.map(tbl => `
        <h3 style="margin-top:20px; font-size:14px;">${erpEsc(tbl.titre)}</h3>
        <table>
          <thead><tr>${tbl.head.map(h => `<th>${erpEsc(h)}</th>`).join('')}</tr></thead>
          <tbody>${tbl.rows.map(r => `<tr>${r.map(c => `<td>${erpEsc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
          ${tbl.total ? `<tfoot><tr style="font-weight:700; background:#f0f0f0;">${tbl.total.map(c => `<td>${erpEsc(c)}</td>`).join('')}</tr></tfoot>` : ''}
        </table>
      `).join('')
    : (R.table ? `<table><thead><tr>${R.table.head.map(h => `<th>${erpEsc(h)}</th>`).join('')}</tr></thead>
        <tbody>${R.table.rows.map(r => `<tr>${r.map(c => `<td>${erpEsc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '');

  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>${erpEsc(R.titre)}</title>
    <style>
      body{font-family:system-ui,Arial,sans-serif;color:#111;padding:30px;}
      h1{font-size:18px;border-bottom:2px solid #111;padding-bottom:8px;}
      .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0;}
      .kpi{border:1px solid #ccc;border-radius:8px;padding:10px;}
      .kpi .l{font-size:11px;color:#555;}
      .kpi .v{font-size:18px;font-weight:700;}
      table{width:100%;border-collapse:collapse;margin-top:10px;margin-bottom:18px;font-size:12px;}
      th,td{border:1px solid #ccc;padding:6px;text-align:left;}
      th{background:#f0f0f0;}
      .foot{margin-top:24px;font-size:11px;color:#555;text-align:center;}
    </style></head><body>
    <h1>${erpEsc(R.titre)}</h1>
    <p style="font-size:12px;color:#555;">${erpEsc(settings.company_name || 'HAITI REH-CARE')} — généré le ${new Date().toLocaleDateString('fr-FR')}</p>
    <div class="kpis">${R.kpis.map(k => `<div class="kpi"><div class="l">${erpEsc(k.label)}</div><div class="v">${erpEsc(k.value)}</div></div>`).join('')}</div>
    ${tablesHtml}
    <div class="foot">Document généré par le système ERP — ${periode}</div>
    <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

// ---------- UI prensipal ----------
async function renderRapportsMensuelsModule(container, meta) {
  const user = window.currentUser;
  const tabs = rapportsTabsFor(user);
  if (!_rappTab || !tabs.some(t => t.id === _rappTab)) _rappTab = tabs[0]?.id || 'clinique';
  const isDir = hasGlobalAccess(user);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2 style="margin:0;">Rapports Mensuels</h2>
        <p style="margin:4px 0 0; color:var(--clr-text-muted,#94a3b8); font-size:13px;">
          ${isDir ? 'Rapports reçus des postes + consolidation des deux annexes.'
                  : 'Générez votre rapport mensuel, exportez-le (PDF/Excel) et transmettez-le à la Direction.'}
        </p>
      </div>
      <div class="page-actions" style="display:flex; align-items:center; gap:10px;">
        <label class="form-label" style="margin:0;">Période</label>
        <input type="month" id="rapp-periode" class="form-input" value="${_rappPeriode}" style="width:auto;">
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-body" style="padding:8px; display:flex; gap:6px; flex-wrap:wrap;">
        ${tabs.map(t => `<button class="btn ${t.id === _rappTab ? 'btn-primary' : 'btn-secondary'}" data-rtab="${t.id}">
          <i data-lucide="${t.icon}"></i> ${t.label}
        </button>`).join('')}
      </div>
    </div>

    <div id="rapp-body">
      <div class="loading"><div class="loading-spinner"></div><div class="loading-text">Génération du rapport...</div></div>
    </div>`;

  document.getElementById('rapp-periode').addEventListener('change', (e) => {
    _rappPeriode = e.target.value || _rappPeriode;
    renderRappTab();
  });
  container.querySelectorAll('[data-rtab]').forEach(b => {
    b.addEventListener('click', () => {
      _rappTab = b.dataset.rtab;
      container.querySelectorAll('[data-rtab]').forEach(x => {
        x.className = 'btn ' + (x.dataset.rtab === _rappTab ? 'btn-primary' : 'btn-secondary');
      });
      renderRappTab();
    });
  });

  renderRappTab();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function renderRappTab() {
  const body = document.getElementById('rapp-body');
  if (!body) return;
  const isDir = hasGlobalAccess(window.currentUser);

  if (_rappTab === 'direction') return renderRappInbox(body);
  if (_rappTab === 'consolide') return renderRappConsolide(body);

  body.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Génération...</div></div>';

  // Annex ki konsène: staff → annex li; direksyon → annex chwazi oswa konsolidasyon
  const annexeId = getBranchFilterId();
  const annexeNom = annexeId ? erpAnnexeShortName(annexeId) : 'Toutes annexes';
  const data = await buildMonthData(_rappPeriode, annexeId);
  const R = buildReport(_rappTab, data, _rappPeriode, annexeNom);
  window._currentRapport = R;

  const tablesHtml = (R.tables && R.tables.length)
    ? R.tables.map(tbl => `
        <div style="margin-top:20px;">
          <h4 style="margin:0 0 8px; color:var(--clr-primary,#4f46e5); font-size:15px; font-weight:700;">${erpEsc(tbl.titre)}</h4>
          <div class="table-container"><table class="table">
            <thead><tr>${tbl.head.map(h => `<th>${erpEsc(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${tbl.rows.length
                ? tbl.rows.map(r => `<tr>${r.map(c => `<td>${erpEsc(c)}</td>`).join('')}</tr>`).join('')
                : `<tr><td colspan="${tbl.head.length}" style="text-align:center; padding:18px; color:var(--clr-text-muted,#94a3b8);">Aucune donnée pour cette période.</td></tr>`}
            </tbody>
            ${tbl.total ? `<tfoot><tr style="font-weight:700; background:var(--clr-bg-soft,#f1f5f9);">${tbl.total.map(c => `<td>${erpEsc(c)}</td>`).join('')}</tr></tfoot>` : ''}
          </table></div>
        </div>
      `).join('')
    : (R.table ? `<div class="table-container"><table class="table">
        <thead><tr>${R.table.head.map(h => `<th>${erpEsc(h)}</th>`).join('')}</tr></thead>
        <tbody>${R.table.rows.length
          ? R.table.rows.map(r => `<tr>${r.map(c => `<td>${erpEsc(c)}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${R.table.head.length}" style="text-align:center; padding:20px; color:var(--clr-text-muted,#94a3b8);">Aucune ligne pour cette période.</td></tr>`}
        </tbody></table></div>` : '');

  body.innerHTML = `
    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h3 class="card-title">${erpEsc(R.titre)}</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary" id="rapp-csv"><i data-lucide="file-spreadsheet"></i> Excel / CSV</button>
          <button class="btn btn-secondary" id="rapp-print"><i data-lucide="printer"></i> PDF / Imprimer</button>
          ${!isDir ? `<button class="btn btn-primary" id="rapp-send"><i data-lucide="send"></i> Envoyer à la Direction</button>` : ''}
        </div>
      </div>
      <div class="card-body" style="padding: var(--space-5);">
        <div class="kpi-grid" style="margin-bottom: var(--space-5);">
          ${R.kpis.map(k => `
            <div class="kpi-card"><div class="kpi-content">
              <div class="kpi-label">${erpEsc(k.label)}</div>
              <div class="kpi-value">${erpEsc(k.value)}</div>
            </div></div>`).join('')}
        </div>
        ${tablesHtml}
      </div>
    </div>`;

  document.getElementById('rapp-csv')?.addEventListener('click', () => exportReportCsv(R, _rappPeriode));
  document.getElementById('rapp-print')?.addEventListener('click', () => printReport(R, _rappPeriode));
  document.getElementById('rapp-send')?.addEventListener('click', async () => {
    if (!confirm(`Envoyer "${R.titre}" à la Direction ?`)) return;
    const { error } = await db.rpc('erp_send_monthly_report', {
      p_module: _rappTab,
      p_periode: _rappPeriode,
      p_titre: R.titre,
      p_data: { kpis: R.kpis, table: R.table }
    });
    if (error) return erpToast('Erreur: ' + error.message, true);
    erpToast('Rapport envoyé à la Direction');
    if (typeof logActivity === 'function') logActivity('Rapport envoyé', 'Rapports', R.titre);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ---------- Direksyon: bwat resepsyon rapò yo ----------
async function renderRappInbox(body) {
  body.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Chargement des rapports reçus...</div></div>';
  const { data } = await db.from('erp_rapports_mensuels')
    .select('*, erp_annexes(code, nom)')
    .order('sent_at', { ascending: false })
    .limit(100);

  const rapps = data || [];
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><h3 class="card-title">Rapports reçus des postes (${rapps.length})</h3></div>
      <div class="table-container"><table class="table">
        <thead><tr><th>Reçu le</th><th>Période</th><th>Annexe</th><th>Module</th><th>Titre</th><th>Envoyé par</th><th></th></tr></thead>
        <tbody>
          ${rapps.length ? rapps.map(r => `<tr>
            <td>${new Date(r.sent_at).toLocaleString('fr-FR')}</td>
            <td><strong>${erpEsc(r.periode)}</strong></td>
            <td><span class="badge badge-info">${erpEsc(r.erp_annexes?.code || '—')}</span></td>
            <td>${erpEsc(r.module)}</td>
            <td>${erpEsc(r.titre)}</td>
            <td>${erpEsc(r.sent_by_nom || '—')}</td>
            <td><button class="table-action-btn" title="Voir / imprimer" onclick="viewRapport('${r.id}')"><i data-lucide="eye"></i></button></td>
          </tr>`).join('')
          : '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--clr-text-muted,#94a3b8);">Aucun rapport reçu pour l\'instant.</td></tr>'}
        </tbody></table></div>
    </div>`;
  window._rapportsRecus = rapps;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function viewRapport(id) {
  const r = (window._rapportsRecus || []).find(x => x.id === id);
  if (!r) return;
  const R = { titre: r.titre, kpis: r.data?.kpis || [], table: r.data?.table || null };
  printReport(R, r.periode);
}

// ---------- Direksyon: rapò konsolide (2 annex) ----------
async function renderRappConsolide(body) {
  body.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Consolidation des annexes...</div></div>';

  const annexes = window.erpAnnexes || [];
  // Done pa annex + total
  const perAnnexe = await Promise.all(annexes.map(async a => {
    const d = await buildMonthData(_rappPeriode, a.id);
    return { annexe: a, clinique: buildReport('clinique', d, _rappPeriode, a.nom),
             compta: buildReport('comptabilite', d, _rappPeriode, a.nom),
             secre: buildReport('secretariat', d, _rappPeriode, a.nom),
             atelier: buildReport('atelier', d, _rappPeriode, a.nom) };
  }));
  const global_ = await buildMonthData(_rappPeriode, null);
  const gCompta = buildReport('comptabilite', global_, _rappPeriode, 'Consolidé');
  const gClinique = buildReport('clinique', global_, _rappPeriode, 'Consolidé');
  const gSecret = buildReport('secretariat', global_, _rappPeriode, 'Consolidé');

  const num = (v) => parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0;

  body.innerHTML = `
    <div class="card" style="margin-bottom: var(--space-5);">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h3 class="card-title">Rapport consolidé — ${_rappPeriode} (toutes annexes)</h3>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" id="cons-print"><i data-lucide="printer"></i> PDF / Imprimer</button>
        </div>
      </div>
      <div class="card-body" style="padding: var(--space-5);">
        <div class="table-container"><table class="table">
          <thead><tr><th>Indicateur</th>${annexes.map(a => `<th>${erpEsc(a.code)} — ${erpEsc(a.nom)}</th>`).join('')}<th>Total consolidé</th></tr></thead>
          <tbody>
            ${[
              ['Nouveaux patients', a => a.secre.kpis[0].value],
              ['Rendez-vous', a => a.secre.kpis[1].value],
              ['Séances réalisées', a => a.clinique.kpis[1].value],
              ['Évaluations', a => a.clinique.kpis[0].value],
              ['Appareillages livrés', a => a.atelier.kpis[1].value],
              ['Total encaissé', a => a.compta.kpis[0].value],
              ['Résultat net', a => a.compta.kpis.find(k => k.label === 'Résultat net')?.value || '—']
            ].map(([label, get]) => `<tr>
              <td><strong>${label}</strong></td>
              ${perAnnexe.map(p => `<td>${get(p)}</td>`).join('')}
              <td><strong>${label === 'Total encaissé' ? gCompta.kpis[0].value
                : label === 'Résultat net' ? (gCompta.kpis.find(k => k.label === 'Résultat net')?.value || '—')
                : label === 'Séances réalisées' ? gClinique.kpis[1].value
                : label === 'Évaluations' ? gClinique.kpis[0].value
                : label === 'Nouveaux patients' ? gSecret.kpis[0].value
                : label === 'Rendez-vous' ? gSecret.kpis[1].value
                : perAnnexe.reduce((s, p) => s + num(get(p)), 0)}</strong></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    </div>`;

  document.getElementById('cons-print')?.addEventListener('click', () => {
    const R = {
      titre: `Rapport consolidé — ${_rappPeriode}`,
      kpis: gCompta.kpis,
      table: null
    };
    printReport(R, _rappPeriode);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
