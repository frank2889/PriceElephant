// PriceElephant - Price Alert System (Shopify Theme)
document.addEventListener('DOMContentLoaded', () => {
  const alertForms = document.querySelectorAll('.price-alert-form');
  
  alertForms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const emailInput = form.querySelector('input[type="email"]');
      const productId = form.dataset.productId;
      const targetPrice = form.querySelector('input[name="target_price"]')?.value;
      
      if (!emailInput?.value || !productId) {
        showError(form, 'Vul alle velden in');
        return;
      }

      try {
        const apiBase = window.PRICEELEPHANT_API || 'http://localhost:3000';
        const response = await fetch(`${apiBase}/apps/priceelephant/alerts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            productId,
            email: emailInput.value,
            targetPrice: targetPrice || null
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create price alert');
        }

        const result = await response.json();
        
        if (result.success) {
          showSuccess(form, result.message);
        } else {
          showError(form, 'Er ging iets mis. Probeer het opnieuw.');
        }
      } catch (error) {
        console.error('PriceElephant Alert Error:', error);
        showError(form, 'Kon geen verbinding maken met de server');
      }
    });
  });
});

function showSuccess(form, message) {
  form.classList.add('price-alert-form--success');
  form.innerHTML = `
    <div style="padding: 20px; background: #10B981; color: white; border-radius: 8px; text-align: center;">
      <strong>✓ Gelukt!</strong><br>
      ${message}
    </div>
  `;
}

function showError(form, message) {
  form.classList.add('price-alert-form--error');
  const errorEl = document.createElement('p');
  errorEl.style.cssText = 'color: #EF4444; font-size: 14px; margin-top: 10px;';
  errorEl.textContent = message;
  form.appendChild(errorEl);
  
  setTimeout(() => errorEl.remove(), 3000);
}
