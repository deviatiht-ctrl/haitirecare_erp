// Chart.js Helpers
// Load Chart.js CDN: https://cdn.jsdelivr.net/npm/chart.js

// Chart colors
const chartColors = {
  primary: '#2563EB',
  primaryLight: '#93C5FD',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  gray: '#94A3B8',
  grid: '#E2E8F0'
};

// Default chart options
const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        font: {
          family: 'Inter',
          size: 12
        },
        usePointStyle: true,
        padding: 20
      }
    },
    tooltip: {
      backgroundColor: '#0F172A',
      titleFont: {
        family: 'Inter',
        size: 14,
        weight: '600'
      },
      bodyFont: {
        family: 'Inter',
        size: 12
      },
      padding: 12,
      cornerRadius: 8
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        font: {
          family: 'Inter',
          size: 11
        },
        color: '#64748B'
      }
    },
    y: {
      grid: {
        color: chartColors.grid
      },
      ticks: {
        font: {
          family: 'Inter',
          size: 11
        },
        color: '#64748B'
      }
    }
  }
};

// Create bar chart
function createBarChart(canvasId, data, options = {}) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded. Include the CDN script.');
    return null;
  }
  
  const ctx = document.getElementById(canvasId);
  if (!ctx) {
    console.error('Canvas not found:', canvasId);
    return null;
  }
  
  const mergedOptions = {
    ...defaultOptions,
    ...options
  };
  
  const chart = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: mergedOptions
  });
  
  return chart;
}

// Create line chart
function createLineChart(canvasId, data, options = {}) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded. Include the CDN script.');
    return null;
  }
  
  const ctx = document.getElementById(canvasId);
  if (!ctx) {
    console.error('Canvas not found:', canvasId);
    return null;
  }
  
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    elements: {
      line: {
        tension: 0.3
      }
    }
  };
  
  const chart = new Chart(ctx, {
    type: 'line',
    data: data,
    options: mergedOptions
  });
  
  return chart;
}

// Create doughnut chart
function createDoughnutChart(canvasId, data, options = {}) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded. Include the CDN script.');
    return null;
  }
  
  const ctx = document.getElementById(canvasId);
  if (!ctx) {
    console.error('Canvas not found:', canvasId);
    return null;
  }
  
  const mergedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          font: {
            family: 'Inter',
            size: 12
          },
          usePointStyle: true,
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: '#0F172A',
        titleFont: {
          family: 'Inter',
          size: 14,
          weight: '600'
        },
        bodyFont: {
          family: 'Inter',
          size: 12
        },
        padding: 12,
        cornerRadius: 8
      }
    },
    cutout: '60%'
  };
  
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: data,
    options: { ...mergedOptions, ...options }
  });
  
  return chart;
}

// Create pie chart
function createPieChart(canvasId, data, options = {}) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded. Include the CDN script.');
    return null;
  }
  
  const ctx = document.getElementById(canvasId);
  if (!ctx) {
    console.error('Canvas not found:', canvasId);
    return null;
  }
  
  const mergedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          font: {
            family: 'Inter',
            size: 12
          },
          usePointStyle: true,
          padding: 15
        }
      }
    }
  };
  
  const chart = new Chart(ctx, {
    type: 'pie',
    data: data,
    options: { ...mergedOptions, ...options }
  });
  
  return chart;
}

// Prepare revenue vs expenses chart data
function prepareRevenueExpenseChart(revenues, expenses, months = 6) {
  const labels = [];
  const revenueData = [];
  const expenseData = [];
  
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    labels.push(monthLabel);
    
    const monthRevenues = revenues.filter(r => {
      const rDate = new Date(r.date_transaction);
      return rDate.getMonth() === date.getMonth() && rDate.getFullYear() === date.getFullYear();
    });
    revenueData.push(monthRevenues.reduce((sum, r) => sum + parseFloat(r.montant), 0));
    
    const monthExpenses = expenses.filter(e => {
      const eDate = new Date(e.date_transaction);
      return eDate.getMonth() === date.getMonth() && eDate.getFullYear() === date.getFullYear();
    });
    expenseData.push(monthExpenses.reduce((sum, e) => sum + parseFloat(e.montant), 0));
  }
  
  return {
    labels: labels,
    datasets: [
      {
        label: 'Revenus',
        data: revenueData,
        backgroundColor: chartColors.primary,
        borderRadius: 4
      },
      {
        label: 'Dépenses',
        data: expenseData,
        backgroundColor: chartColors.danger,
        borderRadius: 4
      }
    ]
  };
}

// Prepare expense distribution chart data
function prepareExpenseDistributionChart(expenses) {
  const categories = {};
  
  expenses.forEach(expense => {
    const category = expense.categorie || 'Autre';
    if (!categories[category]) {
      categories[category] = 0;
    }
    categories[category] += parseFloat(expense.montant);
  });
  
  const labels = Object.keys(categories);
  const data = Object.values(categories);
  
  const colors = [
    chartColors.primary,
    chartColors.success,
    chartColors.warning,
    chartColors.danger,
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
    '#F59E0B'
  ];
  
  return {
    labels: labels,
    datasets: [{
      data: data,
      backgroundColor: colors.slice(0, labels.length),
      borderWidth: 0
    }]
  };
}

// Prepare task status chart data
function prepareTaskStatusChart(tasks) {
  const statusCounts = {
    'a_faire': 0,
    'en_cours': 0,
    'en_revision': 0,
    'termine': 0
  };
  
  tasks.forEach(task => {
    if (statusCounts.hasOwnProperty(task.statut)) {
      statusCounts[task.statut]++;
    }
  });
  
  return {
    labels: ['À faire', 'En cours', 'En révision', 'Terminé'],
    datasets: [{
      data: [
        statusCounts.a_faire,
        statusCounts.en_cours,
        statusCounts.en_revision,
        statusCounts.termine
      ],
      backgroundColor: [
        chartColors.gray,
        chartColors.warning,
        chartColors.primary,
        chartColors.success
      ],
      borderWidth: 0
    }]
  };
}

// Destroy chart
function destroyChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (ctx && ctx.chart) {
    ctx.chart.destroy();
  }
}

// Update chart data
function updateChart(chart, newData) {
  if (chart) {
    chart.data = newData;
    chart.update();
  }
}
