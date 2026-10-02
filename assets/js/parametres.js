// Settings module helper functions

export async function loadCompanySettings() {
  const { data, error } = await db.from('erp_settings').select('*').single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Load settings error:', error);
    return null;
  }
  
  return data;
}

export async function saveCompanySettings(settings) {
  const { data: existing } = await db.from('erp_settings').select('id').single();
  
  if (existing) {
    const { error } = await db.from('erp_settings').update(settings).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await db.from('erp_settings').insert(settings);
    if (error) throw error;
  }
  
  return true;
}

export async function loadPostes(filters = {}) {
  let query = db.from('erp_postes').select('*').eq('is_active', true);
  
  if (filters.department) {
    query = query.eq('department', filters.department);
  }
  
  const { data, error } = await query.order('name');
  
  if (error) {
    console.error('Load postes error:', error);
    return [];
  }
  
  return data || [];
}

export async function createPost(postData) {
  const { data, error } = await db.from('erp_postes').insert({
    ...postData,
    is_active: true
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function updatePost(postId, postData) {
  const { error } = await db
    .from('erp_postes')
    .update(postData)
    .eq('id', postId);
  
  if (error) throw error;
  
  return true;
}

export async function deletePost(postId) {
  const { error } = await db
    .from('erp_postes')
    .update({ is_active: false })
    .eq('id', postId);
  
  if (error) throw error;
  
  return true;
}

export function getPermissionMatrix() {
  return {
    'Users': {
      pdg: 'full',
      secretaire: 'read',
      comptable: 'none',
      responsable_stock: 'none',
      commercial: 'none',
      rh: 'read',
      receptionniste: 'none',
      chauffeur: 'none',
      employe: 'none'
    },
    'Stock': {
      pdg: 'full',
      secretaire: 'read',
      comptable: 'read',
      responsable_stock: 'full',
      commercial: 'read',
      rh: 'none',
      receptionniste: 'none',
      chauffeur: 'none',
      employe: 'read'
    },
    'Finances': {
      pdg: 'full',
      secretaire: 'read',
      comptable: 'full',
      responsable_stock: 'none',
      commercial: 'none',
      rh: 'none',
      receptionniste: 'none',
      chauffeur: 'none',
      employe: 'none'
    },
    'Clients': {
      pdg: 'full',
      secretaire: 'full',
      comptable: 'read',
      responsable_stock: 'none',
      commercial: 'full',
      rh: 'read',
      receptionniste: 'full',
      chauffeur: 'none',
      employe: 'none'
    },
    'RH': {
      pdg: 'full',
      secretaire: 'read',
      comptable: 'none',
      responsable_stock: 'none',
      commercial: 'none',
      rh: 'full',
      receptionniste: 'none',
      chauffeur: 'none',
      employe: 'read'
    },
    'Tâches': {
      pdg: 'full',
      secretaire: 'read',
      comptable: 'read',
      responsable_stock: 'read',
      commercial: 'read',
      rh: 'read',
      receptionniste: 'read',
      chauffeur: 'read',
      employe: 'read'
    },
    'Rapports': {
      pdg: 'full',
      secretaire: 'read',
      comptable: 'full',
      responsable_stock: 'read',
      commercial: 'read',
      rh: 'read',
      receptionniste: 'read',
      chauffeur: 'none',
      employe: 'none'
    },
    'Paramètres': {
      pdg: 'full',
      secretaire: 'none',
      comptable: 'none',
      responsable_stock: 'none',
      commercial: 'none',
      rh: 'none',
      receptionniste: 'none',
      chauffeur: 'none',
      employe: 'none'
    }
  };
}

export function checkPermission(module, action, userRole) {
  const matrix = getPermissionMatrix();
  const level = matrix[module]?.[userRole];
  
  if (!level) return false;
  if (level === 'full') return true;
  if (level === 'read' && action === 'view') return true;
  if (level === 'read' && action !== 'view') return false;
  
  return level === 'full';
}

export function getRolePermissions(role) {
  const matrix = getPermissionMatrix();
  const permissions = [];
  
  Object.entries(matrix).forEach(([module, roles]) => {
    const level = roles[role];
    if (level === 'full') {
      permissions.push(`${module}.view`, `${module}.edit`, `${module}.delete`);
    } else if (level === 'read') {
      permissions.push(`${module}.view`);
    }
  });
  
  return permissions;
}
