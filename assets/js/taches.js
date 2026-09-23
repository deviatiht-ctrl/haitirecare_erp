// Tasks module helper functions

export async function loadTasks(filters = {}) {
  let query = db.from('erp_taches').select('*, assigne:erp_users(first_name, last_name), assigne_par:erp_users(first_name, last_name)');
  
  if (filters.status) {
    query = query.eq('statut', filters.status);
  }
  
  if (filters.priority) {
    query = query.eq('priorite', filters.priority);
  }
  
  if (filters.assigneeId) {
    query = query.eq('assigne_a', filters.assigneeId);
  }
  
  if (filters.module) {
    query = query.eq('module_tag', filters.module);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    console.error('Load tasks error:', error);
    return [];
  }
  
  return data || [];
}

export async function getTaskById(taskId) {
  const { data, error } = await db
    .from('erp_taches')
    .select('*, assigne:erp_users(first_name, last_name)')
    .eq('id', taskId)
    .single();
  
  if (error) {
    console.error('Get task error:', error);
    return null;
  }
  
  return data;
}

export async function createTask(taskData) {
  const { data, error } = await db.from('erp_taches').insert({
    ...taskData,
    statut: taskData.statut || 'a_faire',
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function updateTask(taskId, taskData) {
  const { error } = await db
    .from('erp_taches')
    .update(taskData)
    .eq('id', taskId);
  
  if (error) throw error;
  
  return true;
}

export async function updateTaskStatus(taskId, newStatus) {
  const { error } = await db
    .from('erp_taches')
    .update({ statut: newStatus })
    .eq('id', taskId);
  
  if (error) throw error;
  
  return true;
}

export async function deleteTask(taskId) {
  const { error } = await db.from('erp_taches').delete().eq('id', taskId);
  
  if (error) throw error;
  
  return true;
}

export async function getTasksByStatus() {
  const tasks = await loadTasks();
  
  const byStatus = {
    a_faire: [],
    en_cours: [],
    en_revision: [],
    termine: []
  };
  
  tasks.forEach(task => {
    if (byStatus[task.statut]) {
      byStatus[task.statut].push(task);
    }
  });
  
  return byStatus;
}

export async function getTasksByAssignee(assigneeId) {
  return await loadTasks({ assigneeId });
}

export function isTaskOverdue(task) {
  if (!task.echeance) return false;
  return new Date(task.echeance) < new Date() && task.statut !== 'termine';
}

export function getTaskPriorityColor(priority) {
  const colors = {
    'haute': 'danger',
    'moyenne': 'warning',
    'basse': 'secondary'
  };
  
  return colors[priority] || 'secondary';
}

export function getTaskStatusColor(status) {
  const colors = {
    'a_faire': 'secondary',
    'en_cours': 'primary',
    'en_revision': 'warning',
    'termine': 'success'
  };
  
  return colors[status] || 'secondary';
}

export async function getTaskStats(dateStart, dateEnd) {
  let query = db.from('erp_taches').select('*');
  
  if (dateStart) {
    query = query.gte('created_at', dateStart);
  }
  
  if (dateEnd) {
    query = query.lte('created_at', dateEnd);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Get task stats error:', error);
    return null;
  }
  
  const tasks = data || [];
  const total = tasks.length;
  const completed = tasks.filter(t => t.statut === 'termine').length;
  const inProgress = tasks.filter(t => t.statut === 'en_cours').length;
  const overdue = tasks.filter(t => isTaskOverdue(t)).length;
  
  return { total, completed, inProgress, overdue };
}
