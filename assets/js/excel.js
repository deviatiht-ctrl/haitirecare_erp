// Excel Export Helper using SheetJS
// Load SheetJS CDN: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js

// Export data to Excel
function exportToExcel(data, filename, sheetname) {
  if (typeof XLSX === 'undefined') {
    console.error('SheetJS not loaded. Include the CDN script.');
    return;
  }
  
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetname);
    
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `${filename}_${dateStr}.xlsx`);
    
    // Log activity
    if (typeof logActivity === 'function') {
      logActivity('Export Excel', sheetname, `Exporté ${data.length} enregistrements`);
    }
    
  } catch (error) {
    console.error('Excel export error:', error);
    alert('Erreur lors de l\'export Excel');
  }
}

// Export multiple sheets to one Excel file
function exportMultipleSheets(sheetsData, filename) {
  if (typeof XLSX === 'undefined') {
    console.error('SheetJS not loaded. Include the CDN script.');
    return;
  }
  
  try {
    const wb = XLSX.utils.book_new();
    
    sheetsData.forEach(sheet => {
      const ws = XLSX.utils.json_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    });
    
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `${filename}_${dateStr}.xlsx`);
    
    // Log activity
    if (typeof logActivity === 'function') {
      logActivity('Export Excel multi-feuilles', filename, `${sheetsData.length} feuilles exportées`);
    }
    
  } catch (error) {
    console.error('Excel export error:', error);
    alert('Erreur lors de l\'export Excel');
  }
}

// Export table HTML to Excel
function exportTableToExcel(tableId, filename) {
  if (typeof XLSX === 'undefined') {
    console.error('SheetJS not loaded. Include the CDN script.');
    return;
  }
  
  try {
    const table = document.getElementById(tableId);
    if (!table) {
      console.error('Table not found');
      return;
    }
    
    const ws = XLSX.utils.table_to_sheet(table);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `${filename}_${dateStr}.xlsx`);
    
    // Log activity
    if (typeof logActivity === 'function') {
      logActivity('Export Excel table', tableId, 'Table exportée');
    }
    
  } catch (error) {
    console.error('Excel export error:', error);
    alert('Erreur lors de l\'export Excel');
  }
}

// Format data for Excel export (add headers, format dates, etc.)
function formatDataForExport(data, headers) {
  return data.map(row => {
    const formattedRow = {};
    headers.forEach(header => {
      const key = header.key;
      const label = header.label;
      
      let value = row[key];
      
      // Format dates
      if (value instanceof Date) {
        value = value.toLocaleDateString('fr-FR');
      } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
        value = new Date(value).toLocaleDateString('fr-FR');
      }
      
      // Format currency
      if (header.type === 'currency' && typeof value === 'number') {
        value = value.toFixed(2);
      }
      
      formattedRow[label] = value || '';
    });
    
    return formattedRow;
  });
}

// Common export configurations
const exportConfigs = {
  inventory: {
    filename: 'inventaire',
    sheetname: 'Stock',
    headers: [
      { key: 'code', label: 'Code' },
      { key: 'designation', label: 'Désignation' },
      { key: 'categorie', label: 'Catégorie' },
      { key: 'quantite', label: 'Quantité' },
      { key: 'quantite_min', label: 'Quantité Min' },
      { key: 'prix_achat', label: 'Prix Achat', type: 'currency' },
      { key: 'prix_vente', label: 'Prix Vente', type: 'currency' },
      { key: 'unite', label: 'Unité' },
      { key: 'fournisseur', label: 'Fournisseur' }
    ]
  },
  revenues: {
    filename: 'revenus',
    sheetname: 'Revenus',
    headers: [
      { key: 'date_transaction', label: 'Date' },
      { key: 'description', label: 'Description' },
      { key: 'categorie', label: 'Catégorie' },
      { key: 'montant', label: 'Montant', type: 'currency' },
      { key: 'devise', label: 'Devise' },
      { key: 'notes', label: 'Notes' }
    ]
  },
  expenses: {
    filename: 'depenses',
    sheetname: 'Dépenses',
    headers: [
      { key: 'date_transaction', label: 'Date' },
      { key: 'description', label: 'Description' },
      { key: 'categorie', label: 'Catégorie' },
      { key: 'montant', label: 'Montant', type: 'currency' },
      { key: 'devise', label: 'Devise' },
      { key: 'notes', label: 'Notes' }
    ]
  },
  clients: {
    filename: 'clients',
    sheetname: 'Clients',
    headers: [
      { key: 'nom', label: 'Nom' },
      { key: 'prenom', label: 'Prénom' },
      { key: 'company', label: 'Entreprise' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Téléphone' },
      { key: 'address', label: 'Adresse' },
      { key: 'type', label: 'Type' }
    ]
  },
  employees: {
    filename: 'employes',
    sheetname: 'Employés',
    headers: [
      { key: 'first_name', label: 'Prénom' },
      { key: 'last_name', label: 'Nom' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Téléphone' },
      { key: 'role', label: 'Rôle' },
      { key: 'date_embauche', label: 'Date Embauche' },
      { key: 'type_contrat', label: 'Type Contrat' }
    ]
  },
  tasks: {
    filename: 'taches',
    sheetname: 'Tâches',
    headers: [
      { key: 'titre', label: 'Titre' },
      { key: 'statut', label: 'Statut' },
      { key: 'priorite', label: 'Priorité' },
      { key: 'echeance', label: 'Échéance' },
      { key: 'module_tag', label: 'Module' },
      { key: 'created_at', label: 'Créé le' }
    ]
  }
};

// Export with predefined config
function exportWithConfig(data, configKey) {
  const config = exportConfigs[configKey];
  if (!config) {
    console.error('Export config not found:', configKey);
    return;
  }
  
  const formattedData = formatDataForExport(data, config.headers);
  exportToExcel(formattedData, config.filename, config.sheetname);
}
