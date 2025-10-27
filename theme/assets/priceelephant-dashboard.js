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
  const sitemapForm = document.getElementById('pe-sitemap-form');
  const sitemapStatus = document.getElementById('pe-sitemap-status');
  const sitemapImportBtn = document.getElementById('pe-sitemap-import');
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

  // Variant management elements
  const variantsCard = document.getElementById('pe-variants-card');
  const variantsList = document.getElementById('pe-variants-list');
  const variantsEmpty = document.getElementById('pe-variants-empty');
  const variantsStatus = document.getElementById('pe-variants-status');
  const variantForm = document.getElementById('pe-variant-form');
  const selectedVariantProductName = document.getElementById('pe-selected-variant-product-name');
  const selectedVariantProductSku = document.getElementById('pe-selected-variant-product-sku');
  const selectedVariantProductEan = document.getElementById('pe-selected-variant-product-ean');

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

    async function apiFetch(endpoint, options = {}) {
    console.log('[apiFetch] START', { endpoint, method: options.method || 'GET' });
    updateDebug('action', `📡 API: ${endpoint}`);
    
    const url = `${apiBaseUrl}${endpoint}`;
    console.log('[apiFetch] Full URL:', url);
    
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, { ...options, headers });
      console.log('[apiFetch] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[apiFetch] Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('[apiFetch] Success data:', data);
      updateDebug('action', `✅ API response OK`);
      return data;
    } catch (error) {
      console.error('[apiFetch] CATCH ERROR:', error);
      updateDebug('error', `❌ ${error.message}`);
      throw error;
    }
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
          <button class="pe-button pe-button--small" data-action="manage-variants" data-product-id="${product.id}">
            ${product.variant_count || 0} varianten
          </button>
        </td>
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

  async function loadSitemapConfig() {
    showStatus(sitemapStatus, '', null);
    try {
      const config = await apiGet(`/api/v1/sitemap/config/${customerId}`);
      if (config?.sitemapUrl) {
        sitemapForm.sitemapUrl.value = config.sitemapUrl;
        if (config.productUrlPattern) {
          sitemapForm.productUrlPattern.value = config.productUrlPattern;
        }
        showStatus(sitemapStatus, 'Sitemap configuratie geladen.', 'success');
      }
    } catch (error) {
      // 404 is OK - no config yet
      if (error.message && !error.message.includes('404')) {
        showStatus(sitemapStatus, `Kon sitemap-configuratie niet laden: ${error.message}`, 'error');
      }
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
    console.log('[handleChannableSubmit] STARTED');
    updateDebug('action', '� Saving Channable config');
    
    const formData = new FormData(channableForm);
    const feedUrl = formData.get('feedUrl')?.trim();
    const feedFormat = formData.get('feedFormat');
    
    console.log('[handleChannableSubmit] Form data:', { feedUrl, feedFormat });

    if (!feedUrl) {
      const msg = 'Feed URL is verplicht.';
      console.warn('[handleChannableSubmit]', msg);
      showStatus(channableStatus, msg, 'error');
      updateDebug('error', '❌ No feed URL');
      return;
    }

    setLoading(channableForm.querySelector('button[type="submit"]'), true);

    try {
      console.log('[handleChannableSubmit] Calling API...');
      const response = await apiFetch('/api/v1/channable/configure', {
        method: 'POST',
        body: JSON.stringify({ customerId, feedUrl, feedFormat }),
      });
      console.log('[handleChannableSubmit] Success:', response);
      showStatus(channableStatus, response.message || 'Instellingen opgeslagen.', 'success');
      updateDebug('action', '✅ Config saved');
    } catch (error) {
      console.error('[handleChannableSubmit] ERROR:', error);
      showStatus(channableStatus, `Opslaan mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ ${error.message}`);
    } finally {
      setLoading(channableForm.querySelector('button[type="submit"]'), false);
    }
  }

    async function handleChannableImport() {
    console.log('[handleChannableImport] STARTED');
    updateDebug('action', '📥 Importing products');
    
    showStatus(channableStatus, '', null);
    setLoading(channableImportBtn, true);

    try {
      console.log('[handleChannableImport] Calling import API...');
      const response = await apiFetch('/api/v1/channable/import', {
        method: 'POST',
        body: JSON.stringify({ customerId }),
      });
      console.log('[handleChannableImport] Success:', response);
      
      const message = response?.message || 'Import uitgevoerd.';
      const stats = response?.stats;
      const detail = stats ? ` (${stats.created || 0} nieuw / ${stats.updated || 0} bijgewerkt / ${stats.errors || 0} fouten)` : '';
      showStatus(channableStatus, `${message}${detail}`, stats?.errors ? 'error' : 'success');
      updateDebug('action', `✅ Import: ${stats?.created || 0} created`);
      
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      console.error('[handleChannableImport] ERROR:', error);
      showStatus(channableStatus, `Import mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ Import: ${error.message}`);
    } finally {
      setLoading(channableImportBtn, false);
    }
  }

  async function handleSitemapSubmit(event) {
    event.preventDefault();
    console.log('[handleSitemapSubmit] STARTED');
    updateDebug('action', '💾 Saving Sitemap config');
    
    const formData = new FormData(sitemapForm);
    const sitemapUrl = formData.get('sitemapUrl')?.trim();
    const maxProducts = formData.get('maxProducts');
    const productUrlPattern = formData.get('productUrlPattern')?.trim();
    
    console.log('[handleSitemapSubmit] Form data:', { sitemapUrl, maxProducts, productUrlPattern });

    if (!sitemapUrl) {
      const msg = 'Sitemap URL is verplicht.';
      console.warn('[handleSitemapSubmit]', msg);
      showStatus(sitemapStatus, msg, 'error');
      updateDebug('error', '❌ No sitemap URL');
      return;
    }

    setLoading(sitemapForm.querySelector('button[type="submit"]'), true);

    try {
      console.log('[handleSitemapSubmit] Calling API...');
      const response = await apiFetch('/api/v1/sitemap/configure', {
        method: 'POST',
        body: JSON.stringify({ 
          customerId, 
          sitemapUrl,
          productUrlPattern
        }),
      });
      console.log('[handleSitemapSubmit] Success:', response);
      showStatus(sitemapStatus, response.message || 'Instellingen opgeslagen.', 'success');
      updateDebug('action', '✅ Sitemap config saved');
    } catch (error) {
      console.error('[handleSitemapSubmit] ERROR:', error);
      showStatus(sitemapStatus, `Opslaan mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ ${error.message}`);
    } finally {
      setLoading(sitemapForm.querySelector('button[type="submit"]'), false);
    }
  }

  async function handleSitemapImport() {
    console.log('[handleSitemapImport] STARTED');
    updateDebug('action', '🗺️ Importing from sitemap');
    
    showStatus(sitemapStatus, '', null);
    setLoading(sitemapImportBtn, true);

    const formData = new FormData(sitemapForm);
    const sitemapUrl = formData.get('sitemapUrl')?.trim();
    const maxProducts = parseInt(formData.get('maxProducts'), 10) || 50;
    const productUrlPattern = formData.get('productUrlPattern')?.trim();

    if (!sitemapUrl) {
      showStatus(sitemapStatus, 'Vul eerst een sitemap URL in.', 'error');
      setLoading(sitemapImportBtn, false);
      return;
    }

    try {
      console.log('[handleSitemapImport] Calling import API...');
      showStatus(sitemapStatus, `🔍 Intelligente scan gestart... Sitemap wordt geparsed en URLs worden gecontroleerd op productpagina's (max ${maxProducts} producten)`, 'success');
      
      const response = await apiFetch('/api/v1/sitemap/import', {
        method: 'POST',
        body: JSON.stringify({ 
          customerId,
          sitemapUrl,
          maxProducts,
          productUrlPattern
        }),
      });
      console.log('[handleSitemapImport] Success:', response);
      
      const message = response?.message || 'Import uitgevoerd.';
      const results = response?.results;
      
      if (results) {
        const scanInfo = `📊 Gescand: ${results.scanned} URLs | ✅ Producten gedetecteerd: ${results.detectedProducts}`;
        const importInfo = `📦 Nieuw: ${results.created} | 🔄 Bijgewerkt: ${results.updated} | ⏭️ Overgeslagen: ${results.skipped}`;
        const errorInfo = results.errors?.length > 0 ? ` | ⚠️ Errors: ${results.errors.length}` : '';
        showStatus(sitemapStatus, `${message}\n${scanInfo}\n${importInfo}${errorInfo}`, results.errors?.length > 0 ? 'error' : 'success');
        updateDebug('action', `✅ Sitemap: ${results.detectedProducts} detected, ${results.created} imported`);
      } else {
        showStatus(sitemapStatus, message, 'success');
      }
      
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      console.error('[handleSitemapImport] ERROR:', error);
      showStatus(sitemapStatus, `Import mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ Import: ${error.message}`);
    } finally {
      setLoading(sitemapImportBtn, false);
    }
  }

  async function handleShopifySync(all = false) {
    console.log('[handleShopifySync] STARTED', { all, customerId });
    updateDebug('action', `🔄 Shopify sync ${all ? 'all' : 'batch'}`);
    
    showStatus(shopifyStatus, '', null);
    const button = all ? shopifySyncAllBtn : shopifySyncBtn;
    console.log('[handleShopifySync] Button found:', !!button);
    setLoading(button, true);

    const limitValue = parseInt(shopifyLimitInput.value, 10);
    const payload = { customerId };
    if (!all && Number.isInteger(limitValue) && limitValue > 0) {
      payload.limit = limitValue;
    }
    console.log('[handleShopifySync] Payload:', payload);

    try {
      const endpoint = all ? '/api/v1/shopify/sync-all' : '/api/v1/shopify/sync';
      console.log('[handleShopifySync] Calling endpoint:', endpoint);
      
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      console.log('[handleShopifySync] Response:', response);
      const message = response?.message || 'Sync uitgevoerd.';
      const results = response?.results;
      const detail = results ? ` (${results.synced || 0} synced / ${results.failed || 0} fouten)` : '';
      showStatus(shopifyStatus, `${message}${detail}`, 'success');
      updateDebug('action', `✅ Sync: ${results?.synced || 0} synced`);
      
      await loadShopifyStatus();
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      console.error('[handleShopifySync] ERROR:', error);
      showStatus(shopifyStatus, `Sync mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ Sync: ${error.message}`);
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

  // Variant management functions
  async function openVariantManager(productId) {
    const product = state.products.find((item) => String(item.id) === String(productId));
    if (!product) {
      showStatus(variantsStatus, 'Product niet gevonden in huidige lijst.', 'error');
      return;
    }

    state.selectedProductId = product.id;
    showStatus(variantsStatus, '', null);
    variantsEmpty.hidden = true;
    variantsList.innerHTML = '';
    variantsCard.hidden = false;
    
    selectedVariantProductName.textContent = product.product_name || 'Onbekend product';
    selectedVariantProductSku.textContent = product.product_sku ? `SKU ${product.product_sku}` : 'Geen SKU';
    selectedVariantProductEan.textContent = product.product_ean ? `EAN ${product.product_ean}` : 'Geen EAN';

    try {
      const data = await apiFetch(`/api/v1/products/${customerId}/${product.id}/variants`, {
        method: 'GET',
      });
      renderVariants(data?.variants || []);
    } catch (error) {
      showStatus(variantsStatus, `Kon varianten niet laden: ${error.message}`, 'error');
    }
  }

  function renderVariants(variants) {
    variantsList.innerHTML = '';
    if (!variants || !variants.length) {
      variantsEmpty.hidden = false;
      return;
    }

    variantsEmpty.hidden = true;
    variants.forEach((variant) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'pe-variant-item';
      wrapper.innerHTML = `
        <div class="pe-variant-item__meta">
          <strong>${variant.variant_title || 'Variant zonder titel'}</strong>
          <div class="pe-text-muted">
            ${variant.option1_name ? `${variant.option1_name}: ${variant.option1_value}` : ''}
            ${variant.option2_name ? ` | ${variant.option2_name}: ${variant.option2_value}` : ''}
          </div>
          <div class="pe-text-muted">
            Prijs: ${formatPrice(variant.price)} | SKU: ${variant.sku || 'Geen SKU'}
          </div>
          <div class="pe-text-muted">Aangemaakt: ${formatDate(variant.created_at)}</div>
        </div>
        <div>
          <button
            class="pe-button pe-button--danger"
            data-action="delete-variant"
            data-variant-id="${variant.id}"
          >Verwijderen</button>
        </div>
      `;
      variantsList.appendChild(wrapper);
    });
  }

  async function handleVariantSubmit(event) {
    event.preventDefault();
    if (!state.selectedProductId) {
      showStatus(variantsStatus, 'Selecteer eerst een product.', 'error');
      return;
    }

    const formData = new FormData(variantForm);
    const variantData = {
      variant_title: formData.get('variantTitle')?.trim(),
      option1_name: formData.get('option1Name')?.trim(),
      option1_value: formData.get('option1Value')?.trim(),
      option2_name: formData.get('option2Name')?.trim(),
      option2_value: formData.get('option2Value')?.trim(),
      sku: formData.get('sku')?.trim(),
      price: formData.get('price')?.trim()
    };

    if (!variantData.variant_title) {
      showStatus(variantsStatus, 'Variant titel is verplicht.', 'error');
      return;
    }

    setLoading(variantForm.querySelector('button[type="submit"]'), true);

    try {
      await apiFetch(`/api/v1/products/${customerId}/${state.selectedProductId}/variants`, {
        method: 'POST',
        body: JSON.stringify(variantData),
      });
      variantForm.reset();
      showStatus(variantsStatus, 'Variant toegevoegd.', 'success');
      await openVariantManager(state.selectedProductId);
      // Refresh product list to update variant count
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      showStatus(variantsStatus, `Toevoegen mislukt: ${error.message}`, 'error');
    } finally {
      setLoading(variantForm.querySelector('button[type="submit"]'), false);
    }
  }

  async function handleDeleteVariant(variantId) {
    if (!state.selectedProductId) {
      showStatus(variantsStatus, 'Geen product geselecteerd.', 'error');
      return;
    }

    try {
      await apiFetch(`/api/v1/products/${customerId}/${state.selectedProductId}/variants/${variantId}`, {
        method: 'DELETE',
      });
      showStatus(variantsStatus, 'Variant verwijderd.', 'success');
      await openVariantManager(state.selectedProductId);
      // Refresh product list to update variant count
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      showStatus(variantsStatus, `Verwijderen mislukt: ${error.message}`, 'error');
    }
  }

  function setupEventListeners() {
    console.log('[PriceElephant] Setup event listeners');
    console.log('[PriceElephant] Elements check:', {
      channableForm: !!channableForm,
      channableImportBtn: !!channableImportBtn,
      shopifySyncBtn: !!shopifySyncBtn,
      shopifySyncAllBtn: !!shopifySyncAllBtn,
      competitorForm: !!competitorForm,
      variantForm: !!variantForm
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
    
    if (sitemapForm) {
      sitemapForm.addEventListener('submit', handleSitemapSubmit);
      console.log('[PriceElephant] Sitemap form listener attached');
      listenersCount++;
    }
    
    if (sitemapImportBtn) {
      sitemapImportBtn.addEventListener('click', handleSitemapImport);
      console.log('[PriceElephant] Sitemap import button listener attached');
      listenersCount++;
    }
    
    if (shopifySyncBtn) {
      shopifySyncBtn.addEventListener('click', () => {
        console.log('[EVENT] Shopify sync batch button clicked!');
        handleShopifySync(false);
      });
      console.log('[PriceElephant] Shopify sync button listener attached');
      listenersCount++;
    } else {
      console.warn('[PriceElephant] Shopify sync button NOT FOUND: #pe-shopify-sync');
    }
    
    if (shopifySyncAllBtn) {
      shopifySyncAllBtn.addEventListener('click', () => {
        console.log('[EVENT] Shopify sync ALL button clicked!');
        handleShopifySync(true);
      });
      console.log('[PriceElephant] Shopify sync all button listener attached');
      listenersCount++;
    } else {
      console.warn('[PriceElephant] Shopify sync all button NOT FOUND: #pe-shopify-sync-all');
    }
    
    if (competitorForm) {
      competitorForm.addEventListener('submit', handleCompetitorSubmit);
      console.log('[PriceElephant] Competitor form listener attached');
      listenersCount++;
    }
    
    if (variantForm) {
      variantForm.addEventListener('submit', handleVariantSubmit);
      console.log('[PriceElephant] Variant form listener attached');
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
      } else if (action === 'manage-variants') {
        const productId = target.dataset.productId;
        openVariantManager(productId);
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

    variantsList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.dataset.action;
      if (action === 'delete-variant') {
        const variantId = target.dataset.variantId;
        handleDeleteVariant(variantId);
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
    updateDebug('script', '✅ Script geladen');
    
    try {
      setupEventListeners();
      console.log('[PriceElephant] Loading initial data...');
      await Promise.all([
        loadChannableConfig(),
        loadSitemapConfig(),
        loadShopifyStatus(),
        loadProducts(),
      ]);
      console.log('[PriceElephant] Dashboard initialized successfully');
    } catch (error) {
      console.error('[PriceElephant] Fout bij initialisatie:', error);
      updateDebug('error', error.message);
    }
  }

  // Wait for DOM before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
