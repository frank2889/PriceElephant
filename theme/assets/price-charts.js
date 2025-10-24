document.addEventListener('DOMContentLoaded', () => {
  const chartElements = document.querySelectorAll('[id^="price-history-chart-"]');
  if (!chartElements.length) {
    return;
  }

  chartElements.forEach(async (canvas) => {
    const container = canvas.closest('#PriceHistory');
    const productHandle = container?.dataset.productHandle;
    if (!productHandle) {
      return;
    }

    try {
      const response = await fetch(`/apps/priceelephant/products/${productHandle}/history`);
      if (!response.ok) {
        throw new Error('Failed to load price history');
      }
      const data = await response.json();
      renderChart(canvas, data);
    } catch (error) {
      console.error(error);
    }
  });
});

function renderChart(canvas, data) {
  const context = canvas.getContext('2d');
  if (!window.Chart) {
    console.warn('Chart.js not loaded');
    return;
  }

  const labels = data.map((entry) => entry.date);
  const prices = data.map((entry) => entry.price);

  new window.Chart(context, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Prijs',
          data: prices,
          borderColor: '#FF6B00',
          backgroundColor: 'rgba(255, 107, 0, 0.15)',
          tension: 0.35
        }
      ]
    },
    options: {
      scales: {
        y: {
          ticks: {
            callback: (value) => new Intl.NumberFormat(window.Shopify.locale, {
              style: 'currency',
              currency: Shopify.currency.active
            }).format(value)
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}
