// Stock module helper functions

export async function loadProducts(filters = {}) {
  let query = db.from('erp_produits').select('*').eq('is_active', true);
  
  if (filters.category) {
    query = query.eq('categorie', filters.category);
  }
  
  if (filters.supplier) {
    query = query.eq('fournisseur', filters.supplier);
  }
  
  const { data, error } = await query.order('code');
  
  if (error) {
    console.error('Load products error:', error);
    return [];
  }
  
  return data || [];
}

export async function getProductById(productId) {
  const { data, error } = await db
    .from('erp_produits')
    .select('*')
    .eq('id', productId)
    .single();
  
  if (error) {
    console.error('Get product error:', error);
    return null;
  }
  
  return data;
}

export async function createProduct(productData) {
  const { data, error } = await db.from('erp_produits').insert({
    ...productData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  return data;
}

export async function updateProduct(productId, productData) {
  const { error } = await db
    .from('erp_produits')
    .update(productData)
    .eq('id', productId);
  
  if (error) throw error;
  
  return true;
}

export async function deleteProduct(productId) {
  const { error } = await db
    .from('erp_produits')
    .update({ is_active: false })
    .eq('id', productId);
  
  if (error) throw error;
  
  return true;
}

export async function loadStockMovements(filters = {}) {
  let query = db.from('erp_stock_movements').select('*, erp_produits(designation, code)');
  
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  
  if (filters.dateStart) {
    query = query.gte('created_at', filters.dateStart);
  }
  
  if (filters.dateEnd) {
    query = query.lte('created_at', filters.dateEnd);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    console.error('Load movements error:', error);
    return [];
  }
  
  return data || [];
}

export async function createStockMovement(movementData) {
  const { data, error } = await db.from('erp_stock_movements').insert({
    ...movementData,
    created_by: window.currentUser?.id
  }).select().single();
  
  if (error) throw error;
  
  // Update product quantity
  const product = await getProductById(movementData.produit_id);
  if (product) {
    const quantityChange = movementData.type === 'entree' ? movementData.quantite : -movementData.quantite;
    await updateProduct(movementData.produit_id, {
      quantite: product.quantite + quantityChange
    });
  }
  
  return data;
}

export function getStockStatus(quantity, minQuantity) {
  if (quantity === 0) return { label: 'Rupture', class: 'danger' };
  if (quantity <= minQuantity) return { label: 'Stock faible', class: 'warning' };
  return { label: 'En stock', class: 'success' };
}

export async function getLowStockProducts() {
  const { data, error } = await db
    .from('erp_produits')
    .select('*')
    .eq('is_active', true)
    .lte('quantite', db.raw('quantite_min'));
  
  if (error) {
    console.error('Get low stock error:', error);
    return [];
  }
  
  return data || [];
}
