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
  const sitemapStopBtn = document.getElementById('pe-sitemap-stop');
  const manualForm = document.getElementById('pe-manual-form');
  const manualStatus = document.getElementById('pe-manual-status');
  const productSearchInput = document.getElementById('pe-product-search');
  const productsBody = document.getElementById('pe-products-body');
  const productsEmptyState = document.getElementById('pe-products-empty');
  const productsStatus = document.getElementById('pe-products-status');
  const competitorsCard = document.getElementById('pe-competitors-card');
  const competitorsList = document.getElementById('pe-competitors-list');
  const competitorsEmpty = document.getElementById('pe-competitors-empty');
  const competitorsStatus = document.getElementById('pe-competitors-status');
  const competitorForm = document.getElementById('pe-competitor-form');
  const competitorSubmitButton = competitorForm
    ? competitorForm.querySelector('button[data-role="competitor-submit"]') ||
      competitorForm.querySelector('button[type="submit"]')
    : null;
  const competitorCancelEditButton = document.getElementById('pe-competitor-cancel-edit');
  const competitorRetailerInput = competitorForm ? competitorForm.querySelector('[name="retailer"]') : null;
  const competitorUrlInput = competitorForm ? competitorForm.querySelector('[name="competitorUrl"]') : null;
  const selectedProductName = document.getElementById('pe-selected-product-name');
  const selectedProductSku = document.getElementById('pe-selected-product-sku');
  const selectedProductEan = document.getElementById('pe-selected-product-ean');
  const selectedProductOwnPrice = document.getElementById('pe-selected-product-own-price');
  const debugErrorList = document.getElementById('pe-debug-error-list');
  const debugErrorCountEl = document.getElementById('pe-debug-error-count');

  // Variant management elements
  const variantsCard = document.getElementById('pe-variants-card');
  const variantsList = document.getElementById('pe-variants-list');
  const variantsEmpty = document.getElementById('pe-variants-empty');
  const variantsStatus = document.getElementById('pe-variants-status');
  const variantForm = document.getElementById('pe-variant-form');
  const selectedVariantProductName = document.getElementById('pe-selected-variant-product-name');
  const selectedVariantProductSku = document.getElementById('pe-selected-variant-product-sku');
  const selectedVariantProductEan = document.getElementById('pe-selected-variant-product-ean');
  const syncProductsBtn = document.getElementById('pe-sync-products');

  const state = {
    products: [],
    pagination: null,
    selectedProductId: null,
    tier: null,
    productLimit: null,
    isEnterprise: false,
    manualCompetitors: [],
    editingCompetitorId: null
  };

  const DEBUG_ERROR_LIMIT = 12;
  const debugErrors = [];
  let activeSitemapSource = null;
  let sitemapCancelRequested = false;

  function renderDebugErrors() {
    if (debugErrorCountEl) {
      debugErrorCountEl.textContent = String(debugErrors.length);
    }

    if (!debugErrorList) {
      return;
    }

    debugErrorList.innerHTML = '';

    if (!debugErrors.length) {
      const emptyRow = document.createElement('div');
      emptyRow.style.color = '#475569';
      emptyRow.textContent = 'Geen fouten geregistreerd.';
      debugErrorList.appendChild(emptyRow);
      return;
    }

    debugErrors.forEach((entry) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'pe-debug-error-item';
      wrapper.style.marginBottom = '4px';

      const summary = document.createElement('div');
      summary.textContent = `[${entry.time}] ${entry.stage ? `${entry.stage} · ` : ''}${entry.message}`;
      wrapper.appendChild(summary);

      if (entry.url) {
        const link = document.createElement('a');
        link.href = entry.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.style.color = '#1d4ed8';
        link.style.textDecoration = 'underline';
        link.textContent = entry.url.length > 100 ? `${entry.url.slice(0, 97)}…` : entry.url;
        wrapper.appendChild(link);
      }

      debugErrorList.appendChild(wrapper);
    });
  }

  function addDebugError(entry) {
    if (!entry || !entry.message) {
      return;
    }

    const now = new Date();
    debugErrors.unshift({
      time: now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      stage: entry.stage || entry.type || '',
      message: entry.message,
      url: entry.url || entry.currentUrl || null
    });

    if (debugErrors.length > DEBUG_ERROR_LIMIT) {
      debugErrors.splice(DEBUG_ERROR_LIMIT);
    }

    renderDebugErrors();
  }

  function resetDebugErrors() {
    debugErrors.length = 0;
    renderDebugErrors();
  }

  renderDebugErrors();

  const telemetry = {
    sitemapEvents: [],
    push(event) {
      if (this.sitemapEvents.length > 100) {
        this.sitemapEvents.shift();
      }
      this.sitemapEvents.push(event);
      window.priceElephantTelemetry = window.priceElephantTelemetry || {};
      window.priceElephantTelemetry.sitemap = this.sitemapEvents;
      console.debug('[PriceElephant][Telemetry]', event);
    }
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

  function applyEnterpriseSitemapDefaults() {
    state.isEnterprise = true;

    const maxProductsInput = document.getElementById('pe-max-products');
    const maxProductsHint = document.getElementById('pe-max-products-hint');
    const sitemapFormElement = document.querySelector('#pe-sitemap-form');
    const sitemapCard = sitemapFormElement ? sitemapFormElement.closest('.pe-card') : null;

    if (maxProductsInput) {
      maxProductsInput.value = '10000';
      maxProductsInput.setAttribute('readonly', 'readonly');
      maxProductsInput.classList.add('pe-input--readonly');

      const maxProductsField = maxProductsInput.closest('.pe-field');
      if (maxProductsField) {
        maxProductsField.style.display = 'none';
      }
    }

    if (maxProductsHint) {
      maxProductsHint.textContent = 'Enterprise: Onbeperkt producten';
    }

    if (sitemapCard && !document.getElementById('pe-enterprise-badge')) {
      const badge = document.createElement('div');
      badge.id = 'pe-enterprise-badge';
      badge.style.cssText = 'background: #059669; color: white; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-weight: 600; text-align: center;';
      badge.textContent = '✨ Enterprise: Onbeperkt producten';
      const cardBody = sitemapCard.querySelector('.pe-card-body') || sitemapCard;
      cardBody.prepend(badge);
    }
  }

  // Fetch customer tier and set appropriate defaults
  async function fetchCustomerTier() {
    try {
      console.log('[PriceElephant] Fetching customer tier for:', customerId);
      const url = `${apiBaseUrl}/api/v1/customers/${customerId}/tier`;
      console.log('[PriceElephant] Tier API URL:', url);
      
      const response = await fetch(url);
      console.log('[PriceElephant] Tier API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[PriceElephant] Customer tier data:', data);
        
        state.tier = data.tier;
        const tierProductLimit = Number(data.product_limit);
        state.productLimit = Number.isFinite(tierProductLimit) ? tierProductLimit : null;

        // Enterprise customers (product_limit = 0) get unlimited products
        if (data.tier === 'enterprise' && tierProductLimit === 0) {
          console.log('[PriceElephant] ✅ Enterprise tier - applying unlimited defaults');
          applyEnterpriseSitemapDefaults();
        } else {
          console.log('[PriceElephant] Customer tier:', data.tier, '- using tier limits');
          const maxProductsHint = document.getElementById('pe-max-products-hint');
          if (maxProductsHint && Number.isFinite(tierProductLimit) && tierProductLimit > 0) {
            maxProductsHint.textContent = `Maximaal ${tierProductLimit} producten volgens abonnement`;
          }
        }
        return data;
      } else {
        console.error('[PriceElephant] Tier API failed with status:', response.status);
        const errorText = await response.text();
        console.error('[PriceElephant] Error response:', errorText);
      }
    } catch (error) {
      console.error('[PriceElephant] Tier API error:', error.message);
      console.error('[PriceElephant] Error stack:', error.stack);
    }
    return null;
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

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function setSitemapRunning(running) {
    if (!sitemapImportBtn) return;

    if (running) {
      setLoading(sitemapImportBtn, true);
      sitemapImportBtn.hidden = true;
      if (sitemapStopBtn) {
        sitemapStopBtn.hidden = false;
        sitemapStopBtn.disabled = false;
        sitemapStopBtn.textContent = 'Stop import';
      }
    } else {
      setLoading(sitemapImportBtn, false);
      sitemapImportBtn.hidden = false;
      if (sitemapStopBtn) {
        sitemapStopBtn.hidden = true;
        sitemapStopBtn.disabled = false;
        sitemapStopBtn.textContent = 'Stop import';
      }
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
      const productName = product.product_name || 'Naam onbekend';
      const safeProductName = escapeHtml(productName);
      const placeholderInitial = escapeHtml((productName.trim().charAt(0) || '?').toUpperCase());
      const imageContent = product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="${safeProductName}" loading="lazy">`
        : `<span>${placeholderInitial}</span>`;
      
      // Build metadata badges
      const badges = [];
      const ratingValue = Number(product.rating);
      if (Number.isFinite(ratingValue) && ratingValue > 0) {
        badges.push(`⭐${ratingValue.toFixed(1)}`);
      }
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

      const variantCount = Number(product.variant_count) || 0;
      const competitorCount = Number(product.metrics?.competitorCount) || 0;
      const syncStatus = product.syncStatus === 'synced' ? 'synced' : 'pending';
      
      row.innerHTML = `
        <td class="pe-product-image-cell">
          <div class="pe-product-thumb">${imageContent}</div>
        </td>
        <td>
          <strong>${productName}</strong>
          <div class="pe-text-muted">${product.brand || '—'}${product.category ? ` · ${product.category}` : ''}</div>
          ${badgeHtml}
        </td>
        <td>${product.product_ean || '—'}</td>
        <td>${priceHtml}</td>
        <td>
          <button class="pe-button pe-button--small" data-action="manage-variants" data-product-id="${product.id}">
            ${variantCount} varianten
          </button>
        </td>
        <td>
          <span class="pe-status-chip pe-status-chip--${competitorCount ? 'success' : 'pending'}">
            ${competitorCount} concurrenten
          </span>
        </td>
        <td>
          <span class="pe-status-chip pe-status-chip--${syncStatus === 'synced' ? 'success' : 'pending'}">
            ${syncStatus === 'synced' ? '✅ Synced' : '⏳ Pending'}
          </span>
        </td>
        <td style="text-align: right;">
          ${syncStatus !== 'synced' ? `
            <button
              class="pe-button pe-button--primary pe-button--small"
              data-action="sync-to-shopify"
              data-product-id="${product.id}"
              style="margin-right: 4px;"
            >Sync to Shopify</button>
          ` : ''}
          <button
            class="pe-button pe-button--secondary pe-button--small"
            data-action="manage-competitors"
            data-product-id="${product.id}"
            style="margin-right: 4px;"
          >Beheer</button>
          <button
            class="pe-button pe-button--danger pe-button--small"
            data-action="remove-product"
            data-product-id="${product.id}"
          >Uit collectie</button>
        </td>
      `;
      productsBody.appendChild(row);
    });
  }

  function resetCompetitorForm(clearFields = true) {
    if (!competitorForm) {
      return;
      resetCompetitorForm();
    }

    if (clearFields) {
      try {
        competitorForm.reset();
      } catch (error) {
        console.warn('[PriceElephant] Failed to reset competitor form:', error.message);
      }
    }

    state.editingCompetitorId = null;
    competitorForm.classList.remove('pe-form--editing');

    if (competitorSubmitButton) {
      competitorSubmitButton.textContent = 'Concurrent toevoegen';
      delete competitorSubmitButton.dataset.originalText;
      competitorSubmitButton.disabled = false;
    }

    if (competitorCancelEditButton) {
      competitorCancelEditButton.hidden = true;
    }
  }

  function enterCompetitorEditMode(competitor) {
    if (!competitorForm || !competitor) {
      return;
    }

    state.editingCompetitorId = String(competitor.id);
    competitorForm.classList.add('pe-form--editing');

    if (competitorRetailerInput) {
      competitorRetailerInput.value = competitor.retailer || '';
    }
    if (competitorUrlInput) {
      competitorUrlInput.value = competitor.competitor_url || '';
    }

    if (competitorSubmitButton) {
      competitorSubmitButton.textContent = 'Concurrent opslaan';
    }

    if (competitorCancelEditButton) {
      competitorCancelEditButton.hidden = false;
    }

    if (competitorRetailerInput) {
      competitorRetailerInput.focus();
    }
  }

  function renderCompetitors(product, manualCompetitors) {
    state.manualCompetitors = Array.isArray(manualCompetitors) ? manualCompetitors : [];
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
    state.manualCompetitors.forEach((item) => {
      const safeRetailer = escapeHtml(item.retailer || 'Onbekende retailer');
      const safeUrl = escapeHtml(item.competitor_url || '');
      const hasUrl = Boolean(item.competitor_url);
      const priceSnapshot = item.price_snapshot || {};
      const availabilityText = priceSnapshot.inStock === false ? 'Niet op voorraad' : 'Op voorraad';
      const lastUpdateText = formatDate(priceSnapshot.scrapedAt);

      const wrapper = document.createElement('div');
      wrapper.className = 'pe-competitor-item';
      wrapper.innerHTML = `
        <div class="pe-competitor-item__meta">
          <strong>${safeRetailer}</strong>
          ${hasUrl
            ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="pe-text-muted">${safeUrl}</a>`
            : '<span class="pe-text-muted">Geen URL beschikbaar</span>'}
          <div class="pe-text-muted">
            Laatste prijs: ${formatPrice(priceSnapshot.price)} · ${availabilityText}
          </div>
          <div class="pe-text-muted">Laatste update: ${lastUpdateText}</div>
        </div>
        <div class="pe-competitor-item__actions">
          <button
            class="pe-button pe-button--primary pe-button--small"
            data-action="sync-competitor"
            data-competitor-id="${item.id}"
          >Nu syncen</button>
          <button
            class="pe-button pe-button--secondary pe-button--small"
            data-action="edit-competitor"
            data-competitor-id="${item.id}"
          >Aanpassen</button>
          <button
            class="pe-button pe-button--danger pe-button--small"
            data-action="delete-competitor"
            data-competitor-id="${item.id}"
          >Verwijderen</button>
        </div>
      `;

      const syncButton = wrapper.querySelector('button[data-action="sync-competitor"]');
      const editButton = wrapper.querySelector('button[data-action="edit-competitor"]');
      const deleteButton = wrapper.querySelector('button[data-action="delete-competitor"]');

      if (syncButton) {
        syncButton.dataset.retailer = item.retailer || '';
      }

      if (editButton) {
        editButton.dataset.retailer = item.retailer || '';
        editButton.dataset.competitorUrl = item.competitor_url || '';
      }

      if (deleteButton) {
        deleteButton.dataset.retailer = item.retailer || '';
      }

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
      console.log('[loadChannableConfig] Error (ignoring):', error.message);
      // Don't show error - Channable is optional
      setApiStatus('channable', 'skip');
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
        if (config.enterprise) {
          console.log('[loadSitemapConfig] Enterprise flag received from API');
          applyEnterpriseSitemapDefaults();
        }

        sitemapForm.sitemapUrl.value = config.sitemapUrl;
        if (config.productUrlPattern) {
          sitemapForm.productUrlPattern.value = config.productUrlPattern;
        }
        // Always load maxProducts from config (respects tier limits set in customer_configs)
        if (config.maxProducts !== undefined && config.maxProducts !== null) {
          const maxProductsInput = document.getElementById('pe-max-products');
          if (maxProductsInput) {
            if (state.isEnterprise) {
              maxProductsInput.value = '10000';
              console.log('[loadSitemapConfig] Enterprise detected, forced maxProducts field to 10000');
            } else {
              maxProductsInput.value = config.maxProducts;
              console.log('[loadSitemapConfig] Set maxProducts to:', config.maxProducts);
            }
          }
        }
        
        // Show resume status if there's saved progress
        if (config.lastScrapedPage && config.lastScrapedPage > 0) {
          const resumeStatus = document.getElementById('pe-resume-status');
          const resumePosition = document.getElementById('pe-resume-position');
          if (resumeStatus && resumePosition) {
            resumePosition.textContent = `URL #${config.lastScrapedPage}`;
            resumeStatus.style.display = 'block';
            console.log('[loadSitemapConfig] Resume status shown at position:', config.lastScrapedPage);
          }
        }
        
        showStatus(sitemapStatus, 'Sitemap configuratie geladen.', 'success');
        setApiStatus('sitemap', 'success');
      } else {
        setApiStatus('sitemap', 'skip');
      }
    } catch (error) {
      console.error('[loadSitemapConfig] Error:', error);
      // 404 or any error is OK - sitemap is optional, just skip
      setApiStatus('sitemap', 'skip');
    }
  }

  async function loadProducts(searchTerm, page = 1) {
    setApiStatus('products', 'loading');
    const params = new URLSearchParams({ 
      limit: '20', // 20 producten per pagina
      offset: String((page - 1) * 20)
    });
    if (searchTerm) {
      params.set('search', searchTerm);
    }

    try {
      const data = await apiFetch(`/api/v1/products/${customerId}?${params.toString()}`, { method: 'GET' });
      state.products = data?.products || [];
      state.pagination = data?.pagination || { page, limit: 20, total: state.products.length };
      renderProducts();
      setApiStatus('products', 'success');
    } catch (error) {
      console.log('[loadProducts] Error (showing empty state):', error.message);
      productsBody.innerHTML = '';
      productsEmptyState.hidden = false;
      productsEmptyState.textContent = 'Geen producten gevonden. Importeer producten via Channable of Sitemap.';
      setApiStatus('products', 'skip');
    }
  }

  async function openCompetitorManager(productId) {
    const product = state.products.find((item) => String(item.id) === String(productId));
    if (!product) {
      showStatus(competitorsStatus, 'Product niet gevonden in huidige lijst.', 'error');
      return;
    }

    resetCompetitorForm();
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
          productUrlPattern,
          maxProducts: parseInt(maxProducts) || 500
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

  // Background import polling
  let backgroundStatusInterval = null;

  async function checkBackgroundStatus() {
    try {
      const status = await apiGet(`/api/v1/sitemap/import/status/${customerId}`);
      const bgStatusDiv = document.getElementById('pe-background-status');
      const bgStatusText = document.getElementById('pe-bg-status-text');
      const bgProgress = document.getElementById('pe-bg-progress');
      const bgScanned = document.getElementById('pe-bg-scanned');

      if (status.status === 'running') {
        bgStatusDiv.style.display = 'block';
        bgStatusText.textContent = 'Bezig...';
        bgProgress.textContent = `${status.progress || 0}%`;
        bgScanned.textContent = status.scanned || 0;
      } else if (status.status === 'completed') {
        bgStatusDiv.style.display = 'block';
        bgStatusText.textContent = '✅ Voltooid';
        bgProgress.textContent = '100%';
        bgScanned.textContent = status.scanned || 0;
        
        // Stop polling
        if (backgroundStatusInterval) {
          clearInterval(backgroundStatusInterval);
          backgroundStatusInterval = null;
        }
        
        // Refresh product list
        await loadProducts();
      } else if (status.status === 'failed') {
        bgStatusDiv.style.display = 'block';
        bgStatusText.textContent = `❌ Mislukt: ${status.error_message || 'Onbekende fout'}`;
        
        // Stop polling
        if (backgroundStatusInterval) {
          clearInterval(backgroundStatusInterval);
          backgroundStatusInterval = null;
        }
      } else {
        bgStatusDiv.style.display = 'none';
      }
    } catch (error) {
      console.error('[Background Status] Error:', error.message);
    }
  }

  async function handleBackgroundImport() {
    console.log('[handleBackgroundImport] Starting background import');
    
    const formData = new FormData(sitemapForm);
    const sitemapUrl = formData.get('sitemapUrl')?.trim();
    const maxProducts = parseInt(formData.get('maxProducts'), 10) || 500;
    const productUrlPattern = formData.get('productUrlPattern')?.trim();
    const resetProgress = document.getElementById('pe-reset-progress')?.checked || false;

    if (!sitemapUrl) {
      showStatus(sitemapStatus, 'Vul eerst een sitemap URL in.', 'error');
      return;
    }

    try {
      const response = await apiFetch('/api/v1/sitemap/import/background', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          sitemapUrl,
          maxProducts,
          productUrlPattern: productUrlPattern || null,
          resetProgress
        })
      });

      showStatus(sitemapStatus, response.message || 'Import gestart op achtergrond!', 'success');
      updateDebug('action', '🔄 Background import started');

      // Start polling for status
      if (backgroundStatusInterval) {
        clearInterval(backgroundStatusInterval);
      }
      backgroundStatusInterval = setInterval(checkBackgroundStatus, 10000); // Poll every 10 seconds
      
      // Check immediately
      await checkBackgroundStatus();

    } catch (error) {
      console.error('[handleBackgroundImport] Error:', error.message);
      showStatus(sitemapStatus, `Start mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ ${error.message}`);
    }
  }

  async function handleSitemapImport() {
    console.log('[handleSitemapImport] STARTED');
    updateDebug('action', '🗺️ Importing from sitemap');
    
    showStatus(sitemapStatus, '', null);

    // Check if background mode is enabled
    const backgroundMode = document.getElementById('pe-background-mode')?.checked || false;
    
    if (backgroundMode) {
      return handleBackgroundImport();
    }

    if (activeSitemapSource) {
      console.warn('[handleSitemapImport] Import already running');
      showStatus(sitemapStatus, 'Er draait al een sitemap import. Stop deze eerst.', 'error');
      updateDebug('error', '❌ Sitemap import already running');
      return;
    }

    // Get progress elements
    const progressContainer = document.getElementById('pe-sitemap-progress');
    const progressFill = document.getElementById('pe-sitemap-progress-fill');
    const progressText = document.getElementById('pe-sitemap-progress-text');

    if (!progressContainer || !progressFill || !progressText) {
      console.error('[handleSitemapImport] Progress UI elementen niet gevonden');
      showStatus(sitemapStatus, 'Kan voortgang niet tonen: ontbrekende UI-elementen.', 'error');
      updateDebug('error', '❌ Progress UI ontbreekt');
      return;
    }

    const formData = new FormData(sitemapForm);
    const sitemapUrl = formData.get('sitemapUrl')?.trim();
    const maxProducts = parseInt(formData.get('maxProducts'), 10) || 500;
    const productUrlPattern = formData.get('productUrlPattern')?.trim();
    const resetProgress = document.getElementById('pe-reset-progress')?.checked || false;

    if (!sitemapUrl) {
      showStatus(sitemapStatus, 'Vul eerst een sitemap URL in.', 'error');
      return;
    }

    try {
      console.log('[handleSitemapImport] Setting up SSE stream...');
      console.log('[handleSitemapImport] Reset progress:', resetProgress);
      resetDebugErrors();
      sitemapCancelRequested = false;
      setSitemapRunning(true);
      
      // Show progress bar
      progressContainer.hidden = false;
      progressFill.style.width = '0%';
      progressFill.style.background = 'linear-gradient(90deg, var(--pe-primary), var(--pe-primary-dark))';
      progressText.textContent = resetProgress ? 'Starten vanaf begin...' : 'Verbinding maken...';
      
      // Use EventSource for real-time progress
      const eventSource = new EventSource(
        `${apiBaseUrl}/api/v1/sitemap/import-stream?` + new URLSearchParams({
          customerId,
          sitemapUrl,
          maxProducts: maxProducts.toString(),
          productUrlPattern: productUrlPattern || '',
          resetProgress: resetProgress.toString()
        })
      );

      activeSitemapSource = eventSource;

      // Handle progress events
      let lastProductRefresh = 0;
      const PRODUCT_REFRESH_INTERVAL = 3000; // Refresh elke 3 seconden

      eventSource.addEventListener('progress', (event) => {
        const data = JSON.parse(event.data);
        console.log('[SSE Progress]', data);
        telemetry.push({
          type: 'progress',
          at: new Date().toISOString(),
          payload: data
        });

        if (Number.isFinite(data.percentage)) {
          const clamped = Math.max(5, Math.min(95, data.percentage));
          progressFill.style.width = `${clamped}%`;
        }

        if (data.cancelled || data.stage === 'cancelled') {
          progressFill.style.background = '#f97316';
          progressText.textContent = data.message || '⏹️ Stopverzoek verwerkt...';
          updateDebug('sitemap', `Stop aangevraagd · scanned ${data.scanned || 0}`);
          return;
        }

        progressFill.style.background = 'linear-gradient(90deg, var(--pe-primary), var(--pe-primary-dark))';
        progressText.textContent = data.message || 'Bezig...';
        updateDebug('sitemap', `Progress ${data.percentage || 0}% · scanned ${data.scanned || 0}`);

        // LIVE UPDATE: Refresh productenlijst elke 3 seconden
        const now = Date.now();
        if (data.created > 0 && now - lastProductRefresh > PRODUCT_REFRESH_INTERVAL) {
          lastProductRefresh = now;
          console.log('[SSE] Refreshing product list...');
          loadProducts(productSearchInput.value.trim()).catch(err => {
            console.warn('[SSE] Product refresh failed:', err.message);
          });
        }

        // Show last error if available
        if (data.lastError) {
          console.error('[Scraper Error]', data.lastError);
          const errorMessage = typeof data.lastError === 'object' 
            ? (data.lastError.message || data.lastError.error || JSON.stringify(data.lastError))
            : data.lastError;
          const errorUrl = typeof data.lastError === 'object' ? data.lastError.url : null;
          
          updateDebug('error', `⚠️ ${errorMessage}`);
          addDebugError({
            stage: data.stage || 'progress',
            message: errorMessage,
            url: errorUrl || data.currentUrl || null
          });
        }

        // Update debug info
        if (data.scanned) {
          updateDebug('action', `📊 Scan: ${data.scanned} | Detected: ${data.detectedProducts || 0} | Created: ${data.created || 0} | Errors: ${data.errors || 0}`);
        }
      });

      eventSource.addEventListener('cancelled', (event) => {
        const data = JSON.parse(event.data);
        console.log('[SSE Cancelled]', data);
        telemetry.push({
          type: 'cancelled',
          at: new Date().toISOString(),
          payload: data
        });

        eventSource.close();
        if (activeSitemapSource === eventSource) {
          activeSitemapSource = null;
        }

        sitemapCancelRequested = false;

        progressFill.style.width = `${data.results?.scanned ? Math.min(100, Math.floor(20 + (data.results.scanned / Math.max(1, maxProducts)) * 60)) : 100}%`;
    progressFill.style.background = 'var(--pe-danger)';
    progressText.textContent = '⏹️ Import gestopt';

    showStatus(sitemapStatus, 'Import gestopt op verzoek van gebruiker.', 'success');
        updateDebug('action', '🛑 Sitemap import gestopt');
        updateDebug('sitemap', 'Gestopt · gebruiker annuleerde import');

        setTimeout(() => {
          progressContainer.hidden = true;
          progressFill.style.width = '0%';
          progressFill.style.background = 'linear-gradient(90deg, var(--pe-primary), var(--pe-primary-dark))';
        }, 2000);

        setSitemapRunning(false);
      });

      // Handle completion
      eventSource.addEventListener('complete', async (event) => {
        const data = JSON.parse(event.data);
        console.log('[SSE Complete]', data);
        telemetry.push({
          type: 'complete',
          at: new Date().toISOString(),
          payload: data
        });
        
        eventSource.close();
        if (activeSitemapSource === eventSource) {
          activeSitemapSource = null;
        }
        sitemapCancelRequested = false;
        
        progressFill.style.width = '100%';
        progressText.textContent = '✅ Scan voltooid!';
        
        const results = data.results;
        if (results) {
          const scanInfo = `📊 Gescand: ${results.scanned} URLs | ✅ Producten gedetecteerd: ${results.detectedProducts}`;
          const importInfo = `📦 Nieuw: ${results.created} | 🔄 Bijgewerkt: ${results.updated} | ⏭️ Overgeslagen: ${results.skipped}`;
          
          // Count metadata
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
          
          showStatus(sitemapStatus, `Import voltooid!\n${scanInfo}\n${importInfo}${metadataInfo}${errorInfo}`, results.errors?.length > 0 ? 'error' : 'success');
          updateDebug('action', `✅ Sitemap: ${results.detectedProducts} detected, ${results.created} imported`);
          updateDebug('sitemap', `Done · detected ${results.detectedProducts} · errors ${results.errors?.length || 0}`);
        }

        if (results?.errors?.length) {
          const sample = results.errors.slice(0, 5);
          sample.forEach((item, index) => {
            addDebugError({
              stage: `final ${index + 1}/${results.errors.length}`,
              message: item.error || item.message || 'Onbekende fout',
              url: item.url || null
            });
          });

          if (results.errors.length > sample.length) {
            addDebugError({
              stage: 'summary',
              message: `+${results.errors.length - sample.length} extra errors verborgen (zie console/response)`
            });
          }
        }
        
        await loadProducts(productSearchInput.value.trim());
        
        // Hide progress bar after 2 seconds
        setTimeout(() => {
          progressContainer.hidden = true;
          progressFill.style.width = '0%';
          progressFill.style.background = 'linear-gradient(90deg, var(--pe-primary), var(--pe-primary-dark))';
        }, 2000);
        
        setSitemapRunning(false);
      });

      // Handle errors
      eventSource.addEventListener('error', (event) => {
        console.error('[SSE Error]', event);
        telemetry.push({
          type: 'error',
          at: new Date().toISOString(),
          payload: event.data || null
        });

        let errorData;
        try {
          errorData = JSON.parse(event.data);
        } catch (e) {
          errorData = { message: 'Verbinding verbroken' };
        }

        eventSource.close();
        if (activeSitemapSource === eventSource) {
          activeSitemapSource = null;
        }
        sitemapCancelRequested = false;

        progressFill.style.width = '100%';
        progressFill.style.background = 'var(--pe-danger)';
        progressText.textContent = '❌ Fout opgetreden';

        showStatus(sitemapStatus, `Import mislukt: ${errorData.message || 'Onbekende fout'}`, 'error');
        updateDebug('error', `❌ Import: ${errorData.message}`);
        updateDebug('sitemap', `Error · ${errorData.message || 'Onbekend'}`);

        setTimeout(() => {
          progressContainer.hidden = true;
          progressFill.style.width = '0%';
          progressFill.style.background = 'linear-gradient(90deg, var(--pe-primary), var(--pe-primary-dark))';
        }, 3000);

        setSitemapRunning(false);
      });

      // Handle connection errors
      eventSource.onerror = () => {
        console.error('[SSE] Connection error');
        telemetry.push({
          type: 'connection-error',
          at: new Date().toISOString()
        });
        eventSource.close();
        if (activeSitemapSource === eventSource) {
          activeSitemapSource = null;
        }
        sitemapCancelRequested = false;

        progressFill.style.width = '100%';
        progressFill.style.background = 'var(--pe-danger)';
        progressText.textContent = '❌ Verbinding verloren';

        showStatus(sitemapStatus, 'Verbinding met server verloren', 'error');
        updateDebug('sitemap', 'Error · verbinding verloren');

        setTimeout(() => {
          progressContainer.hidden = true;
          progressFill.style.width = '0%';
          progressFill.style.background = 'linear-gradient(90deg, var(--pe-primary), var(--pe-primary-dark))';
        }, 3000);

        setSitemapRunning(false);
      };
      
    } catch (error) {
      console.error('[handleSitemapImport] ERROR:', error);
      
      progressFill.style.width = '100%';
      progressFill.style.background = 'var(--pe-danger)';
      progressText.textContent = '❌ Fout opgetreden';
      
      showStatus(sitemapStatus, `Import mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ Import: ${error.message}`);
      updateDebug('sitemap', `Error · ${error.message}`);
      
      setTimeout(() => {
        progressContainer.hidden = true;
        progressFill.style.width = '0%';
        progressFill.style.background = 'linear-gradient(90deg, var(--pe-primary), var(--pe-primary-dark))';
      }, 3000);
      
      setSitemapRunning(false);
      activeSitemapSource = null;
      sitemapCancelRequested = false;
    }
  }

  async function handleSitemapStop(event) {
    if (event) {
      event.preventDefault();
    }

    console.log('[handleSitemapStop] Triggered');

    if (!sitemapStopBtn) {
      return;
    }

    if (!activeSitemapSource) {
      showStatus(sitemapStatus, 'Geen actieve import om te stoppen.', 'error');
      return;
    }

    if (sitemapCancelRequested) {
      showStatus(sitemapStatus, 'Stopverzoek is al verstuurd. Een moment geduld...', null);
      return;
    }

    sitemapCancelRequested = true;
    sitemapStopBtn.disabled = true;
    sitemapStopBtn.textContent = 'Stoppen...';

    updateDebug('action', '🛑 Stopverzoek versturen');
    updateDebug('sitemap', 'Stop aangevraagd...');
    telemetry.push({
      type: 'cancel-request',
      at: new Date().toISOString(),
      payload: { customerId }
    });

    showStatus(sitemapStatus, 'Stopverzoek verstuurd. Wachten tot import stopt...', null);

    try {
      await apiFetch('/api/v1/sitemap/import/cancel', {
        method: 'POST',
        body: JSON.stringify({ customerId })
      });

      console.log('[handleSitemapStop] Cancel request acknowledged');
      sitemapStopBtn.textContent = 'Stop aangevraagd...';
      sitemapStopBtn.disabled = true;
      updateDebug('action', '🛑 Stopverzoek verstuurd');
    } catch (error) {
      console.error('[handleSitemapStop] ERROR:', error);
      sitemapCancelRequested = false;
      sitemapStopBtn.disabled = false;
      sitemapStopBtn.textContent = 'Stop import';
      showStatus(sitemapStatus, `Stoppen mislukt: ${error.message}`, 'error');
      addDebugError({ stage: 'cancel', message: `Stoppen mislukt: ${error.message}` });
      updateDebug('error', `❌ Stoppen mislukt: ${error.message}`);
    }
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    console.log('[handleManualSubmit] STARTED');
    updateDebug('action', '🔄 Manual product add');
    
    const formData = new FormData(manualForm);
    const productUrl = formData.get('productUrl')?.trim();
    const productName = formData.get('productName')?.trim();
    
    if (!productUrl) {
      showStatus(manualStatus, 'Product URL is verplicht', 'error');
      return;
    }
    
    setLoading(manualForm.querySelector('button[type="submit"]'), true);
    showStatus(manualStatus, 'Product wordt toegevoegd...', null);
    
    try {
      const response = await apiFetch('/api/v1/products/manual', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          productUrl,
          productName: productName || null
        })
      });
      
      manualForm.reset();
      const message = response?.message || 'Product toegevoegd';
      showStatus(manualStatus, `✅ ${message}`, 'success');
      updateDebug('action', '✅ Manual add successful');
      
      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      console.error('[handleManualSubmit] ERROR:', error);
      showStatus(manualStatus, `Toevoegen mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ Manual add: ${error.message}`);
    } finally {
      setLoading(manualForm.querySelector('button[type="submit"]'), false);
    }
  }

  async function handleCompetitorSubmit(event) {
    event.preventDefault();
    if (!state.selectedProductId) {
      showStatus(competitorsStatus, 'Selecteer eerst een product.', 'error');
      return;
    }

    const retailer = competitorRetailerInput?.value?.trim();
    const competitorUrl = competitorUrlInput?.value?.trim();

    if (!retailer || !competitorUrl) {
      showStatus(competitorsStatus, 'Retailer en URL zijn verplicht.', 'error');
      return;
    }

    const competitorId = state.editingCompetitorId;
    const isEditing = Boolean(competitorId);
    const endpoint = isEditing
      ? `/api/v1/products/${customerId}/${state.selectedProductId}/competitors/${competitorId}`
      : `/api/v1/products/${customerId}/${state.selectedProductId}/competitors`;
    const method = isEditing ? 'PUT' : 'POST';

    setLoading(competitorSubmitButton, true);

    try {
      await apiFetch(endpoint, {
        method,
        body: JSON.stringify({ retailer, competitorUrl }),
      });
      resetCompetitorForm();
      showStatus(
        competitorsStatus,
        isEditing ? 'Concurrent bijgewerkt.' : 'Concurrent toegevoegd.',
        'success'
      );
      await openCompetitorManager(state.selectedProductId);
    } catch (error) {
      const actionLabel = isEditing ? 'Bijwerken' : 'Toevoegen';
      showStatus(competitorsStatus, `${actionLabel} mislukt: ${error.message}`, 'error');
    } finally {
      setLoading(competitorSubmitButton, false);
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
      if (state.editingCompetitorId && String(state.editingCompetitorId) === String(competitorId)) {
        resetCompetitorForm();
      }
      await openCompetitorManager(state.selectedProductId);
    } catch (error) {
      showStatus(competitorsStatus, `Verwijderen mislukt: ${error.message}`, 'error');
    }
  }

  async function handleSyncCompetitor(competitorId, triggerButton) {
    if (!state.selectedProductId) {
      showStatus(competitorsStatus, 'Selecteer eerst een product.', 'error');
      return;
    }

    if (triggerButton) {
      setLoading(triggerButton, true);
    }

    try {
      const response = await apiFetch(
        `/api/v1/products/${customerId}/${state.selectedProductId}/competitors/${competitorId}/sync`,
        { method: 'POST' }
      );

  async function handleSyncProducts() {
    if (!customerId) {
      showStatus(productsStatus, 'Customer ID niet gevonden', 'error');
      return;
    }

    setLoading(syncProductsBtn, true);
    showStatus(productsStatus, 'Producten synchroniseren...', null);
    updateDebug('action', '🔄 Sync producten');

    try {
      const response = await apiFetch(`/api/v1/admin/sync-collection/${customerId}`, {
        method: 'POST'
      });

      if (response.success) {
        showStatus(
          productsStatus,
          `✅ ${response.total} producten gesynchroniseerd (${response.created} nieuw, ${response.updated} bijgewerkt)`,
          'success'
        );
        // Refresh products list
        await loadProducts();
        updateDebug('action', `✅ Sync voltooid: ${response.total} producten`);
      } else {
        showStatus(productsStatus, `Synchronisatie mislukt: ${response.error || 'Onbekende fout'}`, 'error');
        updateDebug('error', `❌ Sync mislukt: ${response.error}`);
      }
    } catch (error) {
      showStatus(productsStatus, `Synchronisatie mislukt: ${error.message}`, 'error');
      updateDebug('error', `❌ Sync mislukt: ${error.message}`);
    } finally {
      setLoading(syncProductsBtn, false);
    }
  }

      const snapshot = response?.snapshot;
      if (snapshot) {
        const priceText = formatPrice(snapshot.price);
        const stockText = snapshot.inStock === false ? 'niet op voorraad' : 'op voorraad';
        const timestampText = snapshot.scrapedAt ? formatDate(snapshot.scrapedAt) : 'onbekend moment';
        const methodText = snapshot.method ? ` · methode: ${snapshot.method}` : '';
        const cacheText = snapshot.cacheHit ? ' · (cache)' : '';
        showStatus(
          competitorsStatus,
          `Laatste scrape: ${priceText} (${stockText}, ${timestampText})${methodText}${cacheText}`,
          'success'
        );
      } else {
        showStatus(competitorsStatus, 'Scrape uitgevoerd.', 'success');
      }

      await openCompetitorManager(state.selectedProductId);
    } catch (error) {
      showStatus(competitorsStatus, `Sync mislukt: ${error.message}`, 'error');
    } finally {
      if (triggerButton) {
        setLoading(triggerButton, false);
      }
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

  async function handleRemoveProduct(productId, triggerButton) {
    const product = state.products.find((item) => String(item.id) === String(productId));
    if (!product) {
      showStatus(productsStatus, 'Product niet gevonden in huidige lijst.', 'error');
      return;
    }

    const confirmMessage = `Weet je zeker dat je "${product.product_name || 'dit product'}" uit de PriceElephant collectie wilt verwijderen? Het product blijft bestaan in Shopify, maar wordt niet langer gevolgd.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    if (triggerButton) {
      setLoading(triggerButton, true);
    }

    try {
      const response = await apiFetch(`/api/v1/products/${customerId}/${product.id}`, {
        method: 'DELETE',
      });
      if (response?.collectionError) {
        showStatus(
          productsStatus,
          `Product gedeactiveerd maar verwijderen uit Shopify collectie is niet gelukt: ${response.collectionError}`,
          'error'
        );
      } else if (response?.removedFromCollection) {
        showStatus(productsStatus, `"${product.product_name || 'Product'}" verwijderd uit collectie.`, 'success');
      } else {
        showStatus(productsStatus, `"${product.product_name || 'Product'}" gedeactiveerd. Product stond niet in de Shopify collectie.`, 'success');
      }

      if (state.selectedProductId && String(state.selectedProductId) === String(product.id)) {
        state.selectedProductId = null;
        competitorsCard.hidden = true;
        variantsCard.hidden = true;
      }

      await loadProducts(productSearchInput.value.trim());
    } catch (error) {
      showStatus(productsStatus, `Uit collectie verwijderen mislukt: ${error.message}`, 'error');
    } finally {
      if (triggerButton) {
        setLoading(triggerButton, false);
      }
    }
  }

  function setupEventListeners() {
    console.log('[PriceElephant] Setup event listeners');
    console.log('[PriceElephant] Elements check:', {
      channableForm: !!channableForm,
      channableImportBtn: !!channableImportBtn,
      sitemapForm: !!sitemapForm,
      sitemapImportBtn: !!sitemapImportBtn,
      manualForm: !!manualForm,
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

    if (sitemapStopBtn) {
      sitemapStopBtn.addEventListener('click', handleSitemapStop);
      console.log('[PriceElephant] Sitemap stop button listener attached');
      listenersCount++;
    }
    
    if (manualForm) {
      manualForm.addEventListener('submit', handleManualSubmit);
      console.log('[PriceElephant] Manual form listener attached');
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

    if (syncProductsBtn) {
      syncProductsBtn.addEventListener('click', handleSyncProducts);
      console.log('[PriceElephant] Sync products button listener attached');
      listenersCount++;
    }
    
    // Reset progress checkbox - show/hide resume status
    const resetProgressCheckbox = document.getElementById('pe-reset-progress');
    const resumeStatus = document.getElementById('pe-resume-status');
    if (resetProgressCheckbox && resumeStatus) {
      resetProgressCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          resumeStatus.style.display = 'none';
        } else {
          // Only show if there's actually saved progress
          const resumePosition = document.getElementById('pe-resume-position');
          if (resumePosition && resumePosition.textContent !== 'URL #0') {
            resumeStatus.style.display = 'block';
          }
        }
      });
      console.log('[PriceElephant] Reset progress checkbox listener attached');
      listenersCount++;
    }
    
    updateDebug('listeners', `✅ ${listenersCount} listeners`);
  

    productsBody.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest('button[data-action]');
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const productId = button.dataset.productId;
      if (action === 'manage-competitors') {
        openCompetitorManager(productId);
      } else if (action === 'manage-variants') {
        openVariantManager(productId);
      } else if (action === 'remove-product') {
        handleRemoveProduct(productId, button);
      }
    });

    competitorsList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest('button[data-action]');
      const action = button?.dataset.action;
      if (!action) {
        return;
      }

      const competitorId = button.dataset.competitorId;
      if (action === 'delete-competitor') {
        handleDeleteCompetitor(competitorId);
      } else if (action === 'edit-competitor') {
        const competitor = state.manualCompetitors.find((item) => String(item.id) === String(competitorId));
        if (!competitor) {
          showStatus(competitorsStatus, 'Concurrent niet gevonden.', 'error');
          return;
        }
        enterCompetitorEditMode(competitor);
      } else if (action === 'sync-competitor') {
        handleSyncCompetitor(competitorId, button);
      }
    });

    if (competitorCancelEditButton) {
      competitorCancelEditButton.addEventListener('click', () => {
        resetCompetitorForm();
      });
    }

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
      updateDebug('listeners', '✅ 7 listeners');
      
      console.log('[PriceElephant] Loading initial data...');
      
      // Fetch customer tier and set defaults
      updateDebug('action', '📡 Fetching customer tier...');
      await fetchCustomerTier();
      
      // Load configs sequentially to see which one fails
      updateDebug('action', '📡 Loading Channable config...');
      await loadChannableConfig();
      updateDebug('action', '📡 Loading Sitemap config...');
      await loadSitemapConfig();
      updateDebug('action', '📡 Loading products...');
      await loadProducts();
      
      // Check for background import status
      updateDebug('action', '📡 Checking background import status...');
      await checkBackgroundStatus();
      
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
