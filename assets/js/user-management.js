// User Management Functions for PDG/Directeur
// Allows PDG to create users and assign roles within their enterprise

// Assign role to existing user
async function assignRoleToUser(email, firstName, lastName, role, posteId = null) {
  try {
    const { data, error } = await supabase.rpc('erp_assign_role_to_user', {
      p_email: email,
      p_first_name: firstName,
      p_last_name: lastName,
      p_role: role,
      p_poste_id: posteId
    });

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error assigning role:', error);
    return { success: false, error: error.message };
  }
}

// Create new user with role (requires auth user creation first)
async function createUserWithRole(email, password, firstName, lastName, role, posteId = null) {
  try {
    // First create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        }
      }
    });

    if (authError) throw authError;

    // Wait for user to be created then assign role
    if (authData.user) {
      // Small delay to ensure user is created in auth.users
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { data: roleData, error: roleError } = await supabase.rpc('erp_assign_role_to_user', {
        p_email: email,
        p_first_name: firstName,
        p_last_name: lastName,
        p_role: role,
        p_poste_id: posteId
      });

      if (roleError) throw roleError;

      // Add user to enterprise
      const { data: enterpriseId } = await supabase.rpc('erp_get_user_enterprise');
      if (enterpriseId) {
        await supabase.from('erp_user_enterprises').insert({
          user_id: authData.user.id,
          enterprise_id: enterpriseId,
          role_in_enterprise: role,
          is_primary: false
        });
      }

      return { success: true, data: roleData };
    }

    return { success: false, error: 'User creation failed' };
  } catch (error) {
    console.error('Error creating user with role:', error);
    return { success: false, error: error.message };
  }
}

// Get all users in enterprise (PDG only)
async function getEnterpriseUsers() {
  try {
    const { data: enterpriseId } = await supabase.rpc('erp_get_user_enterprise');
    
    if (!enterpriseId) {
      return { success: false, error: 'No enterprise found' };
    }

    const { data, error } = await supabase
      .from('erp_users')
      .select(`
        *,
        erp_postes (*),
        erp_user_enterprises (role_in_enterprise)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error getting enterprise users:', error);
    return { success: false, error: error.message };
  }
}

// Get available job positions
async function getJobPositions() {
  try {
    const { data, error } = await supabase
      .from('erp_postes')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error getting job positions:', error);
    return { success: false, error: error.message };
  }
}

// Update user role
async function updateUserRole(userId, newRole, newPosteId = null) {
  try {
    const { data, error } = await supabase
      .from('erp_users')
      .update({
        role: newRole,
        poste_id: newPosteId,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select();

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error updating user role:', error);
    return { success: false, error: error.message };
  }
}

// Deactivate user
async function deactivateUser(userId) {
  try {
    const { data, error } = await supabase
      .from('erp_users')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error deactivating user:', error);
    return { success: false, error: error.message };
  }
}

// Reactivate user
async function reactivateUser(userId) {
  try {
    const { data, error } = await supabase
      .from('erp_users')
      .update({
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error reactivating user:', error);
    return { success: false, error: error.message };
  }
}

// Get current user's role
async function getCurrentUserRole() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No user logged in' };

    const { data, error } = await supabase
      .from('erp_users')
      .select('role, first_name, last_name, email')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error getting user role:', error);
    return { success: false, error: error.message };
  }
}

// Check if current user can manage users
async function canManageUsers() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase.rpc('erp_can_manage_users');
    
    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error checking user management permission:', error);
    return false;
  }
}

// Get enterprise info for current user
async function getUserEnterprise() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No user logged in' };

    const { data, error } = await supabase
      .from('erp_user_enterprises')
      .select(`
        *,
        erp_enterprise_registrations (*),
        erp_enterprise_types (*)
      `)
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error getting user enterprise:', error);
    return { success: false, error: error.message };
  }
}

// Get appropriate dashboard based on enterprise type
async function getDashboardForUser() {
  return 'dashboard.html';
}
