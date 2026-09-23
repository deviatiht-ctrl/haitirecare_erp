// Clients module helper functions

export async function loadClients(filters = {}) {
  let query = db.from('erp_clients').select('*').eq('is_active', true);
  
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  
  const { data, error } = await query.order('nom');
  
  if (error) {
    console.error('Load clients error:', error);
    return [];
  }
  
  return data || [];
}

export async function getClientById(clientId) {
  const { data, error } = await db
    .from('erp_clients')
    .select('*')
    .eq('id', clientId)
    .single();
  
  if (error) {
    console.error('Get client error:', error);
    return null;
  }
  
  return data;
}

export async function createClient(clientData) {
  const { data, error } = await db.from('erp_clients').insert({
    ...clientData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function updateClient(clientId, clientData) {
  const { error } = await db
    .from('erp_clients')
    .update(clientData)
    .eq('id', clientId);
  
  if (error) throw error;
  
  return true;
}

export async function deleteClient(clientId) {
  const { error } = await db
    .from('erp_clients')
    .update({ is_active: false })
    .eq('id', clientId);
  
  if (error) throw error;
  
  return true;
}

export async function loadClientInteractions(clientId) {
  const { data, error } = await db
    .from('erp_client_suivi')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Load interactions error:', error);
    return [];
  }
  
  return data || [];
}

export async function createClientInteraction(interactionData) {
  const { data, error } = await db.from('erp_client_suivi').insert({
    ...interactionData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function getClientStats(clientId) {
  const { count: revenueCount } = await db
    .from('erp_revenus')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);
  
  const { data: revenues } = await db
    .from('erp_revenus')
    .select('montant')
    .eq('client_id', clientId);
  
  const totalPurchases = revenues?.reduce((sum, r) => sum + parseFloat(r.montant), 0) || 0;
  
  return {
    transactionCount: revenueCount || 0,
    totalPurchases
  };
}

export async function loadAllInteractions(filters = {}) {
  let query = db.from('erp_client_suivi').select('*, erp_clients(nom, prenom)');
  
  if (filters.dateStart) {
    query = query.gte('created_at', filters.dateStart);
  }
  
  if (filters.dateEnd) {
    query = query.lte('created_at', filters.dateEnd);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  
  if (error) {
    console.error('Load all interactions error:', error);
    return [];
  }
  
  return data || [];
}
