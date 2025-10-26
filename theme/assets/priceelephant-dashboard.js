(function () {
  console.log('[PriceElephant] Dashboard script gestart');
  
  // Debug helpers
  function updateDebug(key, value) {
    const el = document.getElementById(`pe-debug-${key}`);
    if (el) el.textContent = value;
  }
  
  const root = document.getElementById('priceelephant-dashboard-root');
  if (!root) {
    console.error('[PriceElephant] Root element niet gevonden: #priceelephant-dashboard-root');
    updateDebug('script', '❌ Root niet gevonden');
    return;
  }

  updateDebug('script', '✅ Script geladen');
  
  const customerId = root.dataset.customerId;
  const apiBaseUrl = (root.dataset.apiBaseUrl || '').replace(/\/$/, '');
  
  console.log('[PriceElephant] Configuratie:', {
    customerId,
    apiBaseUrl,
    rootFound: !!root
  });

  const channableForm = document.getElementById('pe-channable-form');
  const channableStatus = document.getElementById('pe-channable-status');
  const channableImportBtn = document.getElementById('pe-channable-import');
  const shopifyStatus = document.getElementById('pe-shopify-status');
  const shopifyMetrics = document.getElementById('pe-shopify-metrics');
  const shopifySyncBtn = document.getElementById('pe-shopify-sync');
  const shopifySyncAllBtn = document.getElementById('pe-shopify-sync-all');
  const shopifyLimitInput = document.getElementById('pe-sync-limit');
  const productSearchInput = document.getElementById('pe-product-search');
  const productsBody = document.getElementById('pe-products-body');
  const productsEmptyState = document.getElementById('pe-products-empty');
  const competitorsCard = document.getElementById('pe-competitors-card');
  const competitorsList = document.getElementById('pe-competitors-list');
  const competitorsEmpty = document.getElementById('pe-competitors-empty');
  const competitorsStatus = document.getElementById('pe-competitors-status');
  const competitorForm = document.getElementById('pe-competitor-form');
  const selectedProductName = document.getElementById('pe-selected-product-name');
  const selectedProductSku = document.getElementById('pe-selected-product-sku');
  const selectedProductEan = document.getElementById('pe-selected-product-ean');
  const selectedProductOwnPrice = document.getElementById('pe-selected-product-own-price');

  const state = {
    products: [],
    pagination: null,
    selectedProductId: null,
  };

  const currencyFormatter = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
  const dateFormatter = new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  function showStatus(target, message, type) {
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
    target.classList.remove('pe-alert--success', 'pe-alert--error');
    if (type === 'success') {
      target.classList.add('pe-alert--success');
    } else if (type === 'error') {
      target.classList.add('pe-alert--error');
    }
  }

  async function apiFetch(path, options) {
    if (!apiBaseUrl) {
      throw new Error('API basis URL ontbreekt in sectie-instellingen.');
    }

    const response = await fetch(`${apiBaseUrl}${path}`, Object.assign({
      headers: {
        'Content-Type': 'application/json',
      },
    }, options));

    if (response.status === 204) {
      return null;
    }

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        throw new Error(`Ongeldig antwoord van server: ${text}`);
      }
    }

    if (!response.ok) {
      const message = payload?.error || payload?.message || response.statusText;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  async function apiGet(path) {
    try {
      return await apiFetch(path, { method: 'GET' });
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      return '—';
    }
    return currencyFormatter.format(number);
  }

  function formatDate(value) {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return dateFormatter.format(date);
  }

  function setLoading(button, loading) {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = 'Bezig...';
      button.disabled = true;
    } else {
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
      button.disabled = false;
    }
  }

  function renderProducts() {
    productsBody.innerHTML = '';
    if (!state.products.length) {
      productsEmptyState.hidden = false;
      return;
    }

    productsEmptyState.hidden = true;
    state.products.forEach((product) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <strong>${product.product_name || 'Naam onbekend'}</strong>
          <div class="pe-text-muted">${product.brand || '—'}${product.category ? ` · ${product.category}` : ''}</div>
        </td>
        <td>${product.product_ean || '—'}</td>
        <td>${formatPrice(product.own_price)}</td>
        <td>
          <span class="pe-status-chip pe-status-chip--${product.metrics?.competitorCount ? 'success' : 'pending'}">
            ${product.metrics?.competitorCount || 0} concurrenten
          </span>
        </td>
        <td>
          <span class="pe-status-chip pe-status-chip--${product.syncStatus === 'synced' ? 'success' : 'pending'}">
            ${product.syncStatus === 'synced' ? 'Synced' : 'Pending'}
          </span>
        </td>
        <td style="text-align: right;">
          <button
            class="pe-button pe-button--secondary"
            data-action="manage-competitors"
            data-product-id="${product.id}"
          >Beheer</button>
        </td>
      `;
      productsBody.appendChild(row);
    });
  }

  function renderCompetitors(product, manualCompetitors) {
    if (!product) {
      competitorsCard.hidden = true;
      return;
    }

    competitorsCard.hidden = false;
    selectedProductName.textContent = product.product_name || 'Onbekend product';
    selectedProductSku.textContent = product.product_sku ? `SKU ${product.product_sku}` : 'Geen SKU';
    selectedProductEan.textContent = product.product_ean ? `EAN ${product.product_ean}` : 'Geen EAN';
    selectedProductOwnPrice.textContent = `Eigen prijs ${formatPrice(product.own_price)}`;

    competitorsList.innerHTML = '';
    if (!manualCompetitors || !manualCompetitors.length) {
      competitorsEmpty.hidden = false;
      return;
    }

    competitorsEmpty.hidden = true;
    manualCompetitors.forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'pe-competitor-item';
      wrapper.innerHTML = `
        <div class="pe-competitor-item__meta">
          <strong>${item.retailer}</strong>
          <a href="${item.competitor_url}" target="_blank" rel="noopener" class="pe-text-muted">${item.competitor_url}</a>
          <div class="pe-text-muted">
            Laatste prijs: ${formatPrice(item.price_snapshot?.price)} · ${item.price_snapshot?.inStock === false ? 'Niet op voorraad' : 'Op voorraad'}
          </div>
          <div class="pe-text-muted">Laatste update: ${formatDate(item.price_snapshot?.scrapedAt)}</div>
        </div>
        <div>
          <button
            class="pe-button pe-button--danger"
            data-action="delete-competitor"
            data-competitor-id="${item.id}"
          >Verwijderen</button>
        </div>
      `;
      competitorsList.appendChild(wrapper);
    });
  }

  async function loadChannableConfig() {
    showStatus(channableStatus, '', null);
    try {
      const config = await apiGet(`/api/v1/channable/config/${customerId}`);
      if (config?.config) {
        const data = config.config;
        if (data.feedUrl) {
          channableForm.feedUrl.value = data.feedUrl;
        }
        if (data.feedFormat) {
          channableForm.feedFormat.value = data.feedFormat;
        }
        if (data.hasApiCredentials) {
          showStatus(channableStatus, 'API credentials opgeslagen. Token wordt om veiligheidsredenen niet getoond.', 'success');
        }
      }
    } catch (error) {
      showStatus(channableStatus, `Kon Channable-configuratie niet laden: ${error.message}`, 'error');
    }
  }

  async function loadShopifyStatus() {
    showStatus(shopifyStatus, '', null);
    shopifyMetrics.innerHTML = '';
    try {
      const status = await apiFetch(`/api/v1/shopify/status/${customerId}`, { method: 'GET' });
      if (!status?.status) {
        return;
      }
      const { total, synced, pending, syncPercentage } = status.status;

      const metrics = [
        { label: 'Totaal', value: total },
        { label: 'Synced', value: synced },
        { label: 'Pending', value: pending },
        { label: 'Sync %', value: `${syncPercentage}%` },
      ];

      metrics.forEach((metric) => {
        const badge = document.createElement('span');
        badge.className = 'pe-badge';
        badge.textContent = `${metric.label}: ${metric.value}`;
        shopifyMetrics.appendChild(badge);
      });
    } catch (error) {
      showStatus(shopifyStatus, `Kon Shopify-status niet ophalen: ${error.message}`, 'error');
    }
  }

  async function loadProducts(searchTerm) {
    const params = new URLSearchParams({ limit: '50' });
    if (searchTerm) {
      params.set('search', searchTerm);
    }

    try {
      const data = await apiFetch(`/api/v1/products/${customerId}?${params.toString()}`, { method: 'GET' });
      state.products = data?.products || [];
      state.pagination = data?.pagination || null;
      renderProducts();
    } catch (error) {
      productsBody.innerHTML = '';
      productsEmptyState.hidden = false;
      productsEmptyState.textContent = `Kon producten niet laden: ${error.message}`;
    }
  }

  async function openCompetitorManager(productId) {
    const product = state.products.find((item) => String(item.id) === String(productId));
    if (!product) {
      showStatus(competitorsStatus, 'Product niet gevonden in huidige lijst.', 'error');
      return;
    }

    state.selectedProductId = product.id;
    showStatus(competitorsStatus, '', null);
    competitorsEmpty.hidden = true;
    competitorsList.innerHTML = '';
    renderCompetitors(product, []);

    try {
      const data = await apiFetch(`/api/v1/products/${customerId}/${product.id}/competitors`, {
        method: 'GET',
      });
      renderCompetitors(product, data?.manualCompetitors || []);
    } catch (error) {
      showStatus(competitorsStatus, `Kon concurrenten niet laden: ${error.message}`, 'error');
    }
  }

  async function handleChannableSubmit(event) {
    event.preventDefault();
    console.log('[PriceElephant] Channable form submit triggered');
    updateDebug('action', '📝 Channable config opslaan...');
    
    showStatus(channableStatus, '', null);

    const formData = new FormData(channableForm);
    const payload = {
      customerId,
      feedUrl: formData.get('feedUrl')?.trim() || undefined,
      companyId: formData.get('companyId')?.trim() || undefined,
      projectId: formData.get('projectId')?.trim() || undefined,
      apiToken: formData.get('apiToken')?.trim() || undefined,
      feedFormat: formData.get('feedFormat') || 'xml',
    };
    
    console.log('[PriceElephant] Channable config payload:', payload);

    if (!payload.feedUrl && !(payload.companyId && payload.projectId && payload.apiToken)) {
      showStatus(channableStatus, 'Vul een feed URL in of alle API-velden.', 'error');
      updateDebug('error', 'Validatie fout: ontbrekende velden');
      return;
    }

    setLoading(channableForm.querySelector('button[type="submit"]'), true);
    try {
      console.log('[PriceElephant] Posting to /api/v1/channable/configure...');
      await apiFetch('/api/v1/channable/configure', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.log('[PriceElephant] Channable config saved successfully');
      showStatus(channableStatus, 'Channable-configuratie opgeslagen.', 'success');
      updateDebug('action', '✅ Config opgeslagen');
      updateDebug('error', 'Geen');
    } catch (error) {
      console.error('[PriceElephant] Channable config error:', error);
      showStatus(channableStatus, `Opslaan mislukt: ${error.message}`, 'error');
      updateDebug('error', error.message);
    } finally {
      setLoading(channableForm.querySelector('button[type="submit"]'), false);
    }
  }

  async function handleChannableImport() {
    console.log('[PriceElephant] Channable import button clicked');
    updateDebug('action', '📥 Channable import starten...');
    
    showStatus(channableStatus, '', null);
    setLoading(channableImportBtn, true);

    try {
      console.log('[PriceElephant] Posting to /api/v1/channable/import...');
      const response = await apiFetch('/api/v1/channable/import', {
        method: 'POST',
        body: JSON.stringify({ customerId }),
      });
      console.log('[PriceElephant] Import response:', response);
      const created = response?.results?.created || 0;
      const updated = response?.results?.updated || 0;
      showStatus(
        channableStatus,
        `Import gestart. ${created} nieuw · ${updated} bijgewerkt.`,
        'success'
      );
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      showStatus(channableStatus, `Import mislukt: ${error.message}`, 'error');
    } finally {
      setLoading(channableImportBtn, false);
    }
  }

  async function handleShopifySync(all = false) {
    showStatus(shopifyStatus, '', null);
    const button = all ? shopifySyncAllBtn : shopifySyncBtn;
    setLoading(button, true);

    const limitValue = parseInt(shopifyLimitInput.value, 10);
    const payload = { customerId };
    if (!all && Number.isInteger(limitValue) && limitValue > 0) {
      payload.limit = limitValue;
    }

    try {
      const endpoint = all ? '/api/v1/shopify/sync-all' : '/api/v1/shopify/sync';
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const message = response?.message || 'Sync uitgevoerd.';
      const results = response?.results;
      const detail = results ? ` (${results.synced || 0} synced / ${results.failed || 0} fouten)` : '';
      showStatus(shopifyStatus, `${message}${detail}`, 'success');
      await loadShopifyStatus();
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      showStatus(shopifyStatus, `Sync mislukt: ${error.message}`, 'error');
    } finally {
      setLoading(button, false);
    }
  }

  async function handleCompetitorSubmit(event) {
    event.preventDefault();
    if (!state.selectedProductId) {
      showStatus(competitorsStatus, 'Selecteer eerst een product.', 'error');
      return;
    }

    const formData = new FormData(competitorForm);
    const retailer = formData.get('retailer')?.trim();
    const competitorUrl = formData.get('competitorUrl')?.trim();

    if (!retailer || !competitorUrl) {
      showStatus(competitorsStatus, 'Retailer en URL zijn verplicht.', 'error');
      return;
    }

    setLoading(competitorForm.querySelector('button[type="submit"]'), true);

    try {
      await apiFetch(`/api/v1/products/${customerId}/${state.selectedProductId}/competitors`, {
        method: 'POST',
        body: JSON.stringify({ retailer, competitorUrl }),
      });
      competitorForm.reset();
      showStatus(competitorsStatus, 'Concurrent toegevoegd.', 'success');
      await openCompetitorManager(state.selectedProductId);
    } catch (error) {
      showStatus(competitorsStatus, `Toevoegen mislukt: ${error.message}`, 'error');
    } finally {
      setLoading(competitorForm.querySelector('button[type="submit"]'), false);
    }
  }

  async function handleDeleteCompetitor(competitorId) {
    if (!state.selectedProductId) {
      showStatus(competitorsStatus, 'Geen product geselecteerd.', 'error');
      return;
    }

    try {
      await apiFetch(`/api/v1/products/${customerId}/${state.selectedProductId}/competitors/${competitorId}`, {
        method: 'DELETE',
      });
      showStatus(competitorsStatus, 'Concurrent verwijderd.', 'success');
      await openCompetitorManager(state.selectedProductId);
    } catch (error) {
      showStatus(competitorsStatus, `Verwijderen mislukt: ${error.message}`, 'error');
    }
  }

  function setupEventListeners() {
    console.log('[PriceElephant] Setup event listeners');
    console.log('[PriceElephant] Elements check:', {
      channableForm: !!channableForm,
      channableImportBtn: !!channableImportBtn,
      shopifySyncBtn: !!shopifySyncBtn,
      shopifySyncAllBtn: !!shopifySyncAllBtn,
      competitorForm: !!competitorForm
    });
    
    let listenersCount = 0;
    
    if (channableForm) {
      channableForm.addEventListener('submit', handleChannableSubmit);
      console.log('[PriceElephant] Channable form listener attached');
      listenersCount++;
    }
    
    if (channableImportBtn) {
      channableImportBtn.addEventListener('click', handleChannableImport);
      console.log('[PriceElephant] Channable import button listener attached');
      listenersCount++;
    }
    
    if (shopifySyncBtn) {
      shopifySyncBtn.addEventListener('click', () => handleShopifySync(false));
      console.log('[PriceElephant] Shopify sync button listener attached');
      listenersCount++;
    }
    
    if (shopifySyncAllBtn) {
      shopifySyncAllBtn.addEventListener('click', () => handleShopifySync(true));
      console.log('[PriceElephant] Shopify sync all button listener attached');
      listenersCount++;
    }
    
    if (competitorForm) {
      competitorForm.addEventListener('submit', handleCompetitorSubmit);
      console.log('[PriceElephant] Competitor form listener attached');
      listenersCount++;
    }
    
    updateDebug('listeners', `✅ ${listenersCount} listeners`);
  

    productsBody.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.dataset.action;
      if (action === 'manage-competitors') {
        const productId = target.dataset.productId;
        openCompetitorManager(productId);
      }
    });

    competitorsList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.dataset.action;
      if (action === 'delete-competitor') {
        const competitorId = target.dataset.competitorId;
        handleDeleteCompetitor(competitorId);
      }
    });

    let searchTimeout = null;
    productSearchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadProducts(productSearchInput.value.trim());
      }, 350);
    });
  }

  async function init() {
    console.log('[PriceElephant] Initializing dashboard...');
    try {
      setupEventListeners();
      console.log('[PriceElephant] Loading initial data...');
      await Promise.all([
        loadChannableConfig(),
        loadShopifyStatus(),
        loadProducts(),
      ]);
      console.log('[PriceElephant] Dashboard initialized successfully');
    } catch (error) {
      console.error('[PriceElephant] Fout bij initialisatie:', error);
    }
  }

  init();
})();
