// PriceElephant - Price History Charts (Shopify Theme)
// Connects to PriceElephant API for real-time pricing data

document.addEventListener('DOMContentLoaded', () => {
  const chartElements = document.querySelectorAll('[id^="price-history-chart-"]');
  if (!chartElements.length || !window.Chart) {
    console.warn('Chart.js not loaded or no chart elements found');
    return;
  }

  chartElements.forEach(async (canvas) => {
    const container = canvas.closest('[data-product-handle]');
    const productHandle = container?.dataset.productHandle;
    const productPrice = parseFloat(container?.dataset.productPrice) || 299.99;
    
    if (!productHandle) {
      console.warn('No product handle found');
      return;
    }

    try {
      // Call PriceElephant API (local development: localhost:3000)
      const apiBase = window.PRICEELEPHANT_API || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/apps/priceelephant/products/${productHandle}/history?days=30`);
      
      if (!response.ok) {
        throw new Error('Failed to load price history');
      }
      
      const result = await response.json();
      if (result.success) {
        renderPriceChart(canvas, result.data, productPrice);
      }
    } catch (error) {
      console.error('PriceElephant API Error:', error);
      // Fallback: show message
      canvas.parentElement.innerHTML = '<p style="text-align: center; color: #6B7280;">Prijsdata wordt geladen...</p>';
    }
  });
});

function renderPriceChart(canvas, priceHistory, currentPrice) {
  const context = canvas.getContext('2d');

  const labels = priceHistory.map(entry => {
    const date = new Date(entry.date);
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  });
  const prices = priceHistory.map(entry => entry.price);

  new Chart(context, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Jouw prijs',
          data: prices,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#8B5CF6'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1F2937',
          bodyColor: '#6B7280',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return 'Prijs: €' + context.parsed.y.toFixed(2);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#9CA3AF'
          }
        },
        y: {
          grid: { color: '#F3F4F6' },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#9CA3AF',
            callback: value => '€' + value.toFixed(0)
          }
        }
      }
    }
  });
}
