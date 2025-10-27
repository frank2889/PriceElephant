(function () {
  console.log('[PriceElephant] Dashboard script gestart');
  
  // Debug helpers
  function updateDebug(key, value) {
    const el = document.getElementById(`pe-debug-${key}`);
    if (el) el.textContent = value;
  }
  
  function setApiStatus(api, status) {
    const el = document.getElementById(`pe-debug-${api}`);
    if (!el) return;
    
    const icons = { loading: '⏳', success: '✅', error: '❌', skip: '⏭️' };
    const colors = { loading: '#64748b', success: '#16a34a', error: '#dc2626', skip: '#94a3b8' };
    
    const icon = icons[status] || '?';
    const color = colors[status] || '#000';
    
    el.style.color = color;
    el.textContent = `${api.charAt(0).toUpperCase() + api.slice(1)}: ${icon}`;
  }
  
  const root = document.getElementById('priceelephant-dashboard-root');
  if (!root) {
    console.error('[PriceElephant] Root element niet gevonden: #priceelephant-dashboard-root');
    updateDebug('script', '❌ Root niet gevonden');
    return;
  }

  updateDebug('script', '✅ Script geladen');
  
  const customerId = root.dataset.customerId;
  let apiBaseUrl = (root.dataset.apiBaseUrl || '').replace(/\/$/, '');
  
  // Fallback to Railway URL if not configured in theme settings
  if (!apiBaseUrl) {
    // TODO: Update this with your actual Railway URL from Railway dashboard
    apiBaseUrl = 'https://web-production-2568.up.railway.app';
    console.warn('[PriceElephant] ⚠️  API Base URL niet geconfigureerd in theme settings');
    console.warn('[PriceElephant] Gebruik fallback:', apiBaseUrl);
    console.warn('[PriceElephant] Configureer dit in: Theme Editor → PriceElephant Dashboard → API Base URL');
    updateDebug('error', '⚠️  API URL gebruikt fallback - configureer in theme settings');
  }
  
  updateDebug('url', apiBaseUrl);
  
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
      
      // Build metadata badges
      const badges = [];
      if (product.image_url) badges.push('🖼️');
      if (product.rating) badges.push(`⭐${product.rating.toFixed(1)}`);
      if (product.review_count) badges.push(`(${product.review_count})`);
      if (product.discount_percentage) badges.push(`<span style="color: #dc2626;">-${product.discount_percentage}%</span>`);
      if (product.has_free_shipping) badges.push('🚚');
      if (product.stock_level !== null && product.stock_level !== undefined) {
        const stockColor = product.stock_level > 10 ? '#059669' : product.stock_level > 0 ? '#f59e0b' : '#dc2626';
        badges.push(`<span style="color: ${stockColor};">📦${product.stock_level}</span>`);
      }
      if (product.delivery_time) badges.push(`⏱️ ${product.delivery_time}`);
      if (product.bundle_info) badges.push('🎁');
      
      const badgeHtml = badges.length ? `<div style="font-size: 11px; margin-top: 4px;">${badges.join(' ')}</div>` : '';
      
      // Price display with original price if discounted
      let priceHtml = formatPrice(product.own_price);
      if (product.original_price && product.original_price > product.own_price) {
        priceHtml = `
          <div>
            <span style="text-decoration: line-through; color: #9ca3af; font-size: 12px;">${formatPrice(product.original_price)}</span>
            <strong style="color: #dc2626;">${formatPrice(product.own_price)}</strong>
          </div>
        `;
      }
      
      row.innerHTML = `
        <td>
          <strong>${product.product_name || 'Naam onbekend'}</strong>
          <div class="pe-text-muted">${product.brand || '—'}${product.category ? ` · ${product.category}` : ''}</div>
          ${badgeHtml}
        </td>
        <td>${product.product_ean || '—'}</td>
        <td>${priceHtml}</td>
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
    setApiStatus('channable', 'loading');
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
        setApiStatus('channable', 'success');
      } else {
        setApiStatus('channable', 'skip');
      }
    } catch (error) {
      showStatus(channableStatus, `Kon Channable-configuratie niet laden: ${error.message}`, 'error');
      setApiStatus('channable', 'error');
    }
  }

  async function loadSitemapConfig() {
    showStatus(sitemapStatus, '', null);
    setApiStatus('sitemap', 'loading');
    try {
      console.log('[loadSitemapConfig] Fetching config for customer:', customerId);
      const config = await apiGet(`/api/v1/sitemap/config/${customerId}`);
      console.log('[loadSitemapConfig] Config loaded:', config);
      
      if (config?.sitemapUrl) {
        sitemapForm.sitemapUrl.value = config.sitemapUrl;
        if (config.productUrlPattern) {
          sitemapForm.productUrlPattern.value = config.productUrlPattern;
        }
        showStatus(sitemapStatus, 'Sitemap configuratie geladen.', 'success');
        setApiStatus('sitemap', 'success');
      } else {
        setApiStatus('sitemap', 'skip');
      }
    } catch (error) {
      console.error('[loadSitemapConfig] Error:', error);
      // 404 is OK - no config yet
      if (error.message && !error.message.includes('404')) {
        showStatus(sitemapStatus, `Kon sitemap-configuratie niet laden: ${error.message}`, 'error');
        setApiStatus('sitemap', 'error');
      } else {
        setApiStatus('sitemap', 'skip');
      }
    }
  }

  async function loadProducts(searchTerm) {
    setApiStatus('products', 'loading');
    const params = new URLSearchParams({ limit: '50' });
    if (searchTerm) {
      params.set('search', searchTerm);
    }

    try {
      const data = await apiFetch(`/api/v1/products/${customerId}?${params.toString()}`, { method: 'GET' });
      state.products = data?.products || [];
      state.pagination = data?.pagination || null;
      renderProducts();
      setApiStatus('products', 'success');
    } catch (error) {
      productsBody.innerHTML = '';
      productsEmptyState.hidden = false;
      productsEmptyState.textContent = `Kon producten niet laden: ${error.message}`;
      setApiStatus('products', 'error');
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
        
        // Count metadata extraction stats
        const metadataStats = [];
        let imagesCount = 0, ratingsCount = 0, brandsCount = 0, stockCount = 0, deliveryCount = 0, bundleCount = 0;
        
        if (results.products) {
          results.products.forEach(p => {
            if (p.image_url) imagesCount++;
            if (p.rating) ratingsCount++;
            if (p.brand) brandsCount++;
            if (p.stock_level !== null && p.stock_level !== undefined) stockCount++;
            if (p.delivery_time) deliveryCount++;
            if (p.bundle_info) bundleCount++;
          });
          
          if (imagesCount) metadataStats.push(`🖼️ ${imagesCount}`);
          if (ratingsCount) metadataStats.push(`⭐ ${ratingsCount}`);
          if (brandsCount) metadataStats.push(`🏷️ ${brandsCount}`);
          if (stockCount) metadataStats.push(`📦 ${stockCount}`);
          if (deliveryCount) metadataStats.push(`⏱️ ${deliveryCount}`);
          if (bundleCount) metadataStats.push(`🎁 ${bundleCount}`);
        }
        
        const metadataInfo = metadataStats.length ? `\n📋 Metadata: ${metadataStats.join(' · ')}` : '';
        const errorInfo = results.errors?.length > 0 ? ` | ⚠️ Errors: ${results.errors.length}` : '';
        
        showStatus(sitemapStatus, `${message}\n${scanInfo}\n${importInfo}${metadataInfo}${errorInfo}`, results.errors?.length > 0 ? 'error' : 'success');
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
      sitemapForm: !!sitemapForm,
      sitemapImportBtn: !!sitemapImportBtn,
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
    updateDebug('action', '🔄 Loading initial data...');
    
    try {
      setupEventListeners();
      updateDebug('listeners', '✅ 6 listeners');
      
      console.log('[PriceElephant] Loading initial data...');
      
      // Load configs sequentially to see which one fails
      updateDebug('action', '📡 Loading Channable config...');
      await loadChannableConfig();
      updateDebug('action', '📡 Loading Sitemap config...');
      await loadSitemapConfig();
      updateDebug('action', '📡 Loading products...');
      await loadProducts();
      
      updateDebug('action', '✅ All data loaded');
      console.log('[PriceElephant] Dashboard initialized successfully');
    } catch (error) {
      console.error('[PriceElephant] Fout bij initialisatie:', error);
      updateDebug('error', `❌ ${error.message}`);
      updateDebug('action', `❌ Failed: ${error.message}`);
    }
  }

  // Wait for DOM before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
