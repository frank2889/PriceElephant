/**
 * Add Competitor Modal
 * Self-service UI for customers to add competitor URLs
 * Uses Shopify locales for i18n
 */

class CompetitorManager {
  constructor(productId, planLimits, translations = {}) {
    this.productId = productId;
    this.maxCompetitors = planLimits.max_competitors || 3;
    this.currentCount = 0;
    this.t = translations; // Shopify translations object
  }

  /**
   * Render add competitor button + modal
   */
  render() {
    const title = this.t.title || 'Concurrent Tracking';
    const addButton = this.t.add_button || 'Voeg concurrent URL toe';
    const limitInfo = this.t.limit_info || 'concurrenten';
    const upgradeLink = this.t.upgrade_link || 'Upgrade voor meer →';
    
    return `
      <div class="competitor-manager">
        <div class="competitor-header">
          <h3>${title}</h3>
          <button 
            class="btn-add-competitor" 
            onclick="competitorManager.openModal()"
            ${this.currentCount >= this.maxCompetitors ? 'disabled' : ''}
          >
            <span>➕</span> ${addButton}
          </button>
        </div>

        <div class="competitor-limit-info">
          <span class="limit-badge ${this.currentCount >= this.maxCompetitors ? 'limit-reached' : ''}">
            ${this.currentCount} / ${this.maxCompetitors} ${limitInfo}
          </span>
          ${this.currentCount >= this.maxCompetitors ? 
            `<a href="/pricing" class="upgrade-link">${upgradeLink}</a>` : 
            ''}
        </div>

        <!-- Competitor List -->
        <div id="competitor-list" class="competitor-list">
          <!-- Loaded via loadCompetitors() -->
        </div>

        <!-- Add Modal -->
        <div id="add-competitor-modal" class="modal" style="display: none;">
          <div class="modal-content">
            <span class="close" onclick="competitorManager.closeModal()">&times;</span>
            
            <h2>Add Competitor URL</h2>
            <p>Paste the URL of your competitor's product page</p>

            <form onsubmit="competitorManager.addCompetitor(event)">
              <div class="form-group">
                <label>Competitor Product URL</label>
                <input 
                  type="url" 
                  id="competitor-url" 
                  placeholder="https://www.coolblue.nl/product/123456/..."
                  required
                />
                <small class="hint">
                  Examples: Coolblue, Bol.com, Amazon.nl, MediaMarkt, etc.
                </small>
              </div>

              <div class="form-actions">
                <button type="button" onclick="competitorManager.closeModal()" class="btn-cancel">
                  Cancel
                </button>
                <button type="submit" class="btn-primary">
                  <span class="btn-text">Add & Scrape Now</span>
                  <span class="btn-loading" style="display: none;">⏳ Scraping...</span>
                </button>
              </div>
            </form>

            <div id="add-result" class="result-message" style="display: none;"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Load existing competitors
   */
  async loadCompetitors() {
    try {
      const response = await fetch(`/api/v1/products/${this.productId}/competitors`);
      const data = await response.json();

      if (!data.success) throw new Error(data.error);

      this.currentCount = data.competitors.length;
      
      const listHtml = data.competitors.map(comp => `
        <div class="competitor-card">
          <div class="competitor-info">
            <div class="competitor-name">
              <strong>${comp.retailer}</strong>
              ${comp.in_stock ? 
                '<span class="stock-badge in-stock">✓ In stock</span>' : 
                '<span class="stock-badge out-stock">✗ Out of stock</span>'}
            </div>
            <div class="competitor-price">
              €${comp.price?.toFixed(2) || '—'}
            </div>
            <div class="competitor-meta">
              ${comp.url ? `<a href="${comp.url}" target="_blank" class="url-link">View →</a>` : ''}
              <span class="last-check">
                Last check: ${new Date(comp.scraped_at).toLocaleString('nl-NL')}
              </span>
            </div>
          </div>
          <div class="competitor-actions">
            <button onclick="competitorManager.scrapeOne('${comp.retailer}')" class="btn-icon" title="Refresh">
              🔄
            </button>
            <button onclick="competitorManager.remove('${comp.retailer}')" class="btn-icon btn-delete" title="Remove">
              🗑️
            </button>
          </div>
        </div>
      `).join('');

      document.getElementById('competitor-list').innerHTML = listHtml || 
        '<p class="empty-state">No competitors added yet. Click "Add Competitor URL" to start tracking.</p>';

    } catch (error) {
      console.error('Load competitors error:', error);
      document.getElementById('competitor-list').innerHTML = 
        `<p class="error">Failed to load competitors: ${error.message}</p>`;
    }
  }

  /**
   * Open add modal
   */
  openModal() {
    if (this.currentCount >= this.maxCompetitors) {
      alert(`Competitor limit reached (${this.maxCompetitors} max). Upgrade your plan for more.`);
      return;
    }
    document.getElementById('add-competitor-modal').style.display = 'block';
  }

  /**
   * Close modal
   */
  closeModal() {
    document.getElementById('add-competitor-modal').style.display = 'none';
    document.getElementById('competitor-url').value = '';
    document.getElementById('add-result').style.display = 'none';
  }

  /**
   * Add competitor
   */
  async addCompetitor(event) {
    event.preventDefault();

    const url = document.getElementById('competitor-url').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    const resultDiv = document.getElementById('add-result');

    // Show loading
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    submitBtn.disabled = true;

    try {
      const response = await fetch(`/api/v1/products/${this.productId}/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add competitor');
      }

      // Success!
      resultDiv.innerHTML = `
        <div class="success">
          ✅ Competitor added!<br>
          Price: €${data.data.price?.toFixed(2)}<br>
          Method: ${data.data.method}<br>
          Cost: €${data.data.cost}
        </div>
      `;
      resultDiv.style.display = 'block';

      // Reload list
      setTimeout(() => {
        this.closeModal();
        this.loadCompetitors();
      }, 2000);

    } catch (error) {
      resultDiv.innerHTML = `<div class="error">❌ ${error.message}</div>`;
      resultDiv.style.display = 'block';
    } finally {
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      submitBtn.disabled = false;
    }
  }

  /**
   * Remove competitor
   */
  async remove(retailer) {
    if (!confirm(`Remove ${retailer} from tracking?`)) return;

    try {
      const response = await fetch(`/api/v1/products/${this.productId}/competitors/${retailer}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      this.loadCompetitors();
    } catch (error) {
      alert(`Failed to remove: ${error.message}`);
    }
  }

  /**
   * Scrape one competitor
   */
  async scrapeOne(retailer) {
    // Implementation: trigger scrape for specific competitor
    alert(`Scraping ${retailer}... (implement via API)`);
  }
}

// CSS
const styles = `
<style>
.competitor-manager {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
}

.competitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.btn-add-competitor {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
}

.btn-add-competitor:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.competitor-limit-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 14px;
}

.limit-badge {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 5px 12px;
  border-radius: 15px;
  font-weight: 500;
}

.limit-badge.limit-reached {
  background: #fff3e0;
  color: #e65100;
}

.upgrade-link {
  color: #1976d2;
  text-decoration: none;
  font-weight: 500;
}

.competitor-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.competitor-info {
  flex: 1;
}

.competitor-name {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
}

.stock-badge {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 3px;
}

.stock-badge.in-stock {
  background: #e8f5e9;
  color: #2e7d32;
}

.stock-badge.out-stock {
  background: #ffebee;
  color: #c62828;
}

.competitor-price {
  font-size: 24px;
  font-weight: bold;
  color: #1976d2;
  margin: 10px 0;
}

.competitor-meta {
  font-size: 12px;
  color: #666;
  display: flex;
  gap: 15px;
}

.url-link {
  color: #1976d2;
  text-decoration: none;
}

.competitor-actions {
  display: flex;
  gap: 5px;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 5px 10px;
}

.btn-icon:hover {
  background: #f5f5f5;
  border-radius: 4px;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 40px;
}

/* Modal */
.modal {
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
}

.modal-content {
  background: white;
  margin: 10% auto;
  padding: 30px;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  position: relative;
}

.close {
  position: absolute;
  right: 20px;
  top: 20px;
  font-size: 28px;
  font-weight: bold;
  cursor: pointer;
}

.form-group {
  margin: 20px 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.hint {
  color: #666;
  font-size: 12px;
  margin-top: 5px;
  display: block;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 25px;
}

.btn-primary {
  background: #1976d2;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-cancel {
  background: #f5f5f5;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
}

.result-message {
  margin-top: 20px;
  padding: 15px;
  border-radius: 4px;
}

.result-message .success {
  background: #e8f5e9;
  color: #2e7d32;
}

.result-message .error {
  background: #ffebee;
  color: #c62828;
}
</style>
`;

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CompetitorManager, styles };
}
