// Reports module helper functions

export async function getGlobalReport(dateStart, dateEnd) {
  const [revenuesResult, expensesResult, clientsResult, employeesResult, productsResult, tasksResult] = await Promise.all([
    db.from('erp_revenus').select('*').gte('date_transaction', dateStart).lte('date_transaction', dateEnd),
    db.from('erp_depenses').select('*').gte('date_transaction', dateStart).lte('date_transaction', dateEnd),
    db.from('erp_clients').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('erp_users').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('erp_produits').select('*').eq('is_active', true),
    db.from('erp_taches').select('*')
  ]);

  const revenues = revenuesResult.data || [];
  const expenses = expensesResult.data || [];
  
  const totalRevenues = revenues.reduce((sum, r) => sum + parseFloat(r.montant), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.montant), 0);
  const stockValue = (productsResult.data || []).reduce((sum, p) => sum + (p.quantite * p.prix_vente), 0);

  return {
    period: { start: dateStart, end: dateEnd },
    financials: {
      totalRevenues,
      totalExpenses,
      netProfit: totalRevenues - totalExpenses,
      margin: totalRevenues > 0 ? ((totalRevenues - totalExpenses) / totalRevenues * 100).toFixed(2) : 0
    },
    entities: {
      clients: clientsResult.count || 0,
      employees: employeesResult.count || 0,
      products: productsResult.data?.length || 0
    },
    stock: {
      value: stockValue
    },
    tasks: {
      total: tasksResult.data?.length || 0,
      completed: (tasksResult.data || []).filter(t => t.statut === 'termine').length,
      inProgress: (tasksResult.data || []).filter(t => t.statut === 'en_cours').length
    }
  };
}

export async function getFinancialReport(dateStart, dateEnd) {
  const [revenues, expenses] = await Promise.all([
    db.from('erp_revenus').select('*').gte('date_transaction', dateStart).lte('date_transaction', dateEnd),
    db.from('erp_depenses').select('*').gte('date_transaction', dateStart).lte('date_transaction', dateEnd)
  ]);

  const revenuesByCategory = {};
  const expensesByCategory = {};

  (revenues.data || []).forEach(r => {
    const cat = r.categorie || 'Autre';
    revenuesByCategory[cat] = (revenuesByCategory[cat] || 0) + parseFloat(r.montant);
  });

  (expenses.data || []).forEach(e => {
    const cat = e.categorie || 'Autre';
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + parseFloat(e.montant);
  });

  const totalRevenues = Object.values(revenuesByCategory).reduce((a, b) => a + b, 0);
  const totalExpenses = Object.values(expensesByCategory).reduce((a, b) => a + b, 0);

  return {
    period: { start: dateStart, end: dateEnd },
    summary: {
      totalRevenues,
      totalExpenses,
      netProfit: totalRevenues - totalExpenses
    },
    revenuesByCategory,
    expensesByCategory,
    revenues: revenues.data || [],
    expenses: expenses.data || []
  };
}

// user_id refere auth.users (pa erp_users) → join PostgREST pa mache;
// fize non yo apre requete a.
export async function getActivityLog(filters = {}) {
  let query = db.from('erp_activites').select('*');
  
  if (filters.dateStart) {
    query = query.gte('created_at', filters.dateStart);
  }
  
  if (filters.dateEnd) {
    query = query.lte('created_at', filters.dateEnd);
  }
  
  if (filters.module) {
    query = query.eq('module', filters.module);
  }
  
  if (filters.userId) {
    query = query.eq('created_by', filters.userId);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
  
  if (error) {
    console.error('Load activity log error:', error);
    return [];
  }

  const { data: users } = await db.from('erp_users').select('id, first_name, last_name');
  const map = {};
  (users || []).forEach(u => { map[u.id] = u; });
  return (data || []).map(a => ({ ...a, erp_users: map[a.user_id] || null }));
}

export async function logActivity(action, module, details = '') {
  try {
    await db.from('erp_activites').insert({
      action,
      module,
      details,
      created_by: window.currentUser?.id
    });
  } catch (error) {
    console.error('Log activity error:', error);
  }
}

export function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'À l\'instant';
  if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `Il y a ${Math.floor(seconds / 86400)} j`;
  if (seconds < 2592000) return `Il y a ${Math.floor(seconds / 604800)} sem`;
  if (seconds < 31536000) return `Il y a ${Math.floor(seconds / 2592000)} mois`;
  
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

export async function generateExcelReport(reportType, dateStart, dateEnd) {
  const data = await getGlobalReport(dateStart, dateEnd);
  
  const workbook = {
    'Résumé': [
      { '': '' },
      { 'Période': `Du ${dateStart} au ${dateEnd}` },
      { '': '' },
      { 'Revenus totaux': data.financials.totalRevenues },
      { 'Dépenses totales': data.financials.totalExpenses },
      { 'Bénéfice net': data.financials.netProfit },
      { 'Marge': `${data.financials.margin}%` },
      { '': '' },
      { 'Clients actifs': data.entities.clients },
      { 'Employés actifs': data.entities.employees },
      { 'Articles en stock': data.entities.products }
    ]
  };
  
  return workbook;
}
