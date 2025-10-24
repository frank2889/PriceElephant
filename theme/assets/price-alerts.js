document.addEventListener('DOMContentLoaded', () => {
  const alertForms = document.querySelectorAll('.price-alert-form');
  alertForms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const productId = form.dataset.productId;
      if (!emailInput?.value || !productId) {
        return;
      }

      try {
        const response = await fetch('/apps/priceelephant/alerts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            productId,
            email: emailInput.value
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create price alert');
        }

        form.classList.add('price-alert-form--success');
        form.innerHTML = `<p>${window.Shopify?.translations?.priceelephant_alert_success || 'Bedankt! We geven een seintje bij prijsdalingen.'}</p>`;
      } catch (error) {
        console.error(error);
        form.classList.add('price-alert-form--error');
      }
    });
  });
});
