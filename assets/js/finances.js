// Finances module helper functions

export async function loadRevenues(filters = {}) {
  let query = db.from('erp_revenus').select('*, erp_clients(nom, prenom)');
  
  if (filters.dateStart) {
    query = query.gte('date_transaction', filters.dateStart);
  }
  
  if (filters.dateEnd) {
    query = query.lte('date_transaction', filters.dateEnd);
  }
  
  if (filters.category) {
    query = query.eq('categorie', filters.category);
  }
  
  const { data, error } = await query.order('date_transaction', { ascending: false });
  
  if (error) {
    console.error('Load revenues error:', error);
    return [];
  }
  
  return data || [];
}

export async function loadExpenses(filters = {}) {
  let query = db.from('erp_depenses').select('*');
  
  if (filters.dateStart) {
    query = query.gte('date_transaction', filters.dateStart);
  }
  
  if (filters.dateEnd) {
    query = query.lte('date_transaction', filters.dateEnd);
  }
  
  if (filters.category) {
    query = query.eq('categorie', filters.category);
  }
  
  const { data, error } = await query.order('date_transaction', { ascending: false });
  
  if (error) {
    console.error('Load expenses error:', error);
    return [];
  }
  
  return data || [];
}

export async function createRevenue(revenueData) {
  const { data, error } = await db.from('erp_revenus').insert({
    ...revenueData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function createExpense(expenseData) {
  const { data, error } = await db.from('erp_depenses').insert({
    ...expenseData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function loadCaisse(date) {
  const { data, error } = await db
    .from('erp_caisse')
    .select('*')
    .eq('date_caisse', date)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Load caisse error:', error);
    return null;
  }
  
  return data;
}

export async function createCaisse(date) {
  const { data, error } = await db.from('erp_caisse').insert({
    date_caisse: date,
    solde_ouverture: 0,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function createCaisseOperation(operationData) {
  const { data, error } = await db.from('erp_caisse_operations').insert({
    ...operationData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export function formatCurrency(amount, currency = 'HTG') {
  return new Intl.NumberFormat('fr-HT', { style: 'currency', currency: currency }).format(amount);
}

export async function getFinancialSummary(dateStart, dateEnd) {
  const [revenues, expenses] = await Promise.all([
    loadRevenues({ dateStart, dateEnd }),
    loadExpenses({ dateStart, dateEnd })
  ]);
  
  const totalRevenues = revenues.reduce((sum, r) => sum + parseFloat(r.montant), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.montant), 0);
  const netProfit = totalRevenues - totalExpenses;
  
  return {
    totalRevenues,
    totalExpenses,
    netProfit,
    margin: totalRevenues > 0 ? ((netProfit / totalRevenues) * 100).toFixed(2) : 0
  };
}
