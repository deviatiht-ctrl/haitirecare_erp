// HR module helper functions

// employe_id refere auth.users (pa erp_users) → join PostgREST pa mache;
// fize non yo apre requete a.
async function withUserNames(rows, key = 'employe_id', prop = 'erp_users') {
  const { data: users } = await db.from('erp_users').select('id, first_name, last_name');
  const map = {};
  (users || []).forEach(u => { map[u.id] = u; });
  return (rows || []).map(r => ({ ...r, [prop]: map[r[key]] || null }));
}

export async function loadEmployees(filters = {}) {
  let query = db.from('erp_users').select('*, erp_postes(*)').eq('is_active', true);
  
  if (filters.role) {
    query = query.eq('role', filters.role);
  }
  
  if (filters.department) {
    query = query.eq('erp_postes.department', filters.department);
  }
  
  const { data, error } = await query.order('last_name');
  
  if (error) {
    console.error('Load employees error:', error);
    return [];
  }
  
  return data || [];
}

export async function loadPresences(filters = {}) {
  let query = db.from('erp_presences').select('*');
  
  if (filters.date) {
    query = query.eq('date_presence', filters.date);
  }
  
  if (filters.dateStart) {
    query = query.gte('date_presence', filters.dateStart);
  }
  
  if (filters.dateEnd) {
    query = query.lte('date_presence', filters.dateEnd);
  }
  
  const { data, error } = await query.order('date_presence', { ascending: false });
  
  if (error) {
    console.error('Load presences error:', error);
    return [];
  }

  return withUserNames(data);
}

export async function markPresence(employeeId, date, status, notes = '') {
  const { data, error } = await db.from('erp_presences').upsert({
    employe_id: employeeId,
    date_presence: date,
    statut: status,
    heure_arrivee: new Date().toTimeString().split(' ')[0],
    notes: notes,
    created_by: window.currentUser?.id
  }, { onConflict: 'employe_id,date_presence' }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function loadLeaves(filters = {}) {
  let query = db.from('erp_conges').select('*');
  
  if (filters.status) {
    query = query.eq('statut', filters.status);
  }
  
  if (filters.employeeId) {
    query = query.eq('employe_id', filters.employeeId);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    console.error('Load leaves error:', error);
    return [];
  }

  return withUserNames(data);
}

export async function createLeave(leaveData) {
  const { data, error } = await db.from('erp_conges').insert({
    ...leaveData,
    statut: 'en_attente',
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function updateLeaveStatus(leaveId, status, comment = '') {
  const { error } = await db.from('erp_conges').update({
    statut: status,
    commentaire_rh: comment,
    valide_par: window.currentUser?.id
  }).eq('id', leaveId);
  
  if (error) throw error;
  
  return true;
}

export async function loadPerformances(filters = {}) {
  let query = db.from('erp_performances').select('*');
  
  if (filters.employeeId) {
    query = query.eq('employe_id', filters.employeeId);
  }
  
  if (filters.period) {
    query = query.eq('periode', filters.period);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    console.error('Load performances error:', error);
    return [];
  }

  return withUserNames(data);
}

export async function createPerformance(performanceData) {
  const { data, error } = await db.from('erp_performances').insert({
    ...performanceData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

export function calculateLeaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}
