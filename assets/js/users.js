// Users module helper functions

export async function loadUsers(filters = {}) {
  let query = db.from('erp_users').select('*, erp_postes(*)').eq('is_active', true);
  
  if (filters.role) {
    query = query.eq('role', filters.role);
  }
  
  if (filters.poste_id) {
    query = query.eq('poste_id', filters.poste_id);
  }
  
  const { data, error } = await query.order('last_name');
  
  if (error) {
    console.error('Load users error:', error);
    return [];
  }
  
  return data || [];
}

export async function getUserById(userId) {
  const { data, error } = await db
    .from('erp_users')
    .select('*, erp_postes(*)')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('Get user error:', error);
    return null;
  }
  
  return data;
}

export async function createUser(userData) {
  const { data, error } = await db.auth.signUp({
    email: userData.email,
    password: userData.password,
    options: {
      data: {
        first_name: userData.first_name,
        last_name: userData.last_name
      }
    }
  });
  
  if (error) throw error;
  
  const profileData = {
    id: data.user.id,
    first_name: userData.first_name,
    last_name: userData.last_name,
    email: userData.email,
    phone: userData.phone,
    role: userData.role,
    poste_id: userData.poste_id
  };
  
  const { error: profileError } = await db.from('erp_users').insert(profileData);
  
  if (profileError) throw profileError;
  
  return data.user;
}

export async function updateUser(userId, userData) {
  const { error } = await db
    .from('erp_users')
    .update(userData)
    .eq('id', userId);
  
  if (error) throw error;
  
  return true;
}

export async function deleteUser(userId) {
  const { error } = await db
    .from('erp_users')
    .update({ is_active: false })
    .eq('id', userId);
  
  if (error) throw error;
  
  return true;
}

export function formatRole(role) {
  const roleNames = {
    'pdg': 'PDG',
    'secretaire': 'Secrétaire',
    'comptable': 'Comptable',
    'responsable_stock': 'Responsable Stock',
    'commercial': 'Commercial',
    'rh': 'RH',
    'receptionniste': 'Réceptionniste',
    'chauffeur': 'Chauffeur',
    'employe': 'Employé'
  };
  
  return roleNames[role] || role;
}

export function hasPermission(permission) {
  const role = window.currentUser?.role;
  if (!role) return false;
  
  const permissions = {
    'pdg': ['all'],
    'secretaire': ['users.view', 'clients.view', 'clients.edit', 'tasks.view', 'tasks.edit'],
    'comptable': ['finances.view', 'finances.edit', 'rapports.view'],
    'responsable_stock': ['stock.view', 'stock.edit', 'rapports.view'],
    'commercial': ['clients.view', 'clients.edit', 'stock.view', 'tasks.view'],
    'rh': ['rh.view', 'rh.edit', 'users.view'],
    'employe': ['tasks.view', 'tasks.edit']
  };
  
  const userPermissions = permissions[role] || [];
  
  if (role === 'pdg') return true;
  if (permission === 'all') return role === 'pdg';
  
  return userPermissions.includes(permission) || userPermissions.includes('all');
}
