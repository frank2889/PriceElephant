/**
 * Selector Learning Service
 * Purpose: Store and retrieve successful CSS selectors to make scraper self-learning
 * 
 * Flow:
 * 1. Before scraping: Get best learned selectors for domain
 * 2. After scraping: Save successful selectors
 * 3. After AI Vision: Extract actual selectors that would have worked
 * 4. Over time: Build domain-specific selector knowledge base
 */

const db = require('../config/database');

class SelectorLearningService {
  /**
   * Get best selectors for a domain and field
   * Returns selectors sorted by success rate (best first)
   * 
   * @param {string} domain - e.g., "hifi.eu"
   * @param {string} fieldName - e.g., "price", "title", "stock"
   * @param {number} limit - Max number of selectors to return (default: 5)
   * @returns {Array} Array of selector objects
   */
  async getLearnedSelectors(domain, fieldName, limit = 5) {
    try {
      const selectors = await db('learned_selectors')
        .where({ domain, field_name: fieldName })
        .where('success_rate', '>=', 50) // Only return selectors with >50% success rate
        .orderBy([
          { column: 'success_rate', order: 'desc' },
          { column: 'success_count', order: 'desc' },
          { column: 'last_success', order: 'desc' }
        ])
        .limit(limit)
        .select('*');
      
      console.log(`[SelectorLearning] Found ${selectors.length} learned selectors for ${domain}.${fieldName}`);
      return selectors;
    } catch (error) {
      console.error('[SelectorLearning] Error retrieving selectors:', error.message);
      return [];
    }
  }

  /**
   * Save or update a successful selector
   * If selector already exists, increments success_count and updates success_rate
   * 
   * @param {string} domain - e.g., "hifi.eu"
   * @param {string} fieldName - e.g., "price"
   * @param {string} cssSelector - The CSS selector that worked
   * @param {string} extractedValue - Example value that was extracted
   * @param {string} learnedFrom - 'css', 'ai_vision', 'manual'
   */
  async recordSuccess(domain, fieldName, cssSelector, extractedValue, learnedFrom = 'css') {
    try {
      // Check if selector already exists
      const existing = await db('learned_selectors')
        .where({ domain, field_name: fieldName, css_selector: cssSelector })
        .first();
      
      if (existing) {
        // Update existing selector
        const newSuccessCount = existing.success_count + 1;
        const totalAttempts = newSuccessCount + existing.failure_count;
        const newSuccessRate = (newSuccessCount / totalAttempts) * 100;
        
        await db('learned_selectors')
          .where({ id: existing.id })
          .update({
            success_count: newSuccessCount,
            success_rate: newSuccessRate,
            last_used: db.fn.now(),
            last_success: db.fn.now(),
            updated_at: db.fn.now(),
            example_value: extractedValue // Update with latest example
          });
        
        console.log(`[SelectorLearning] ✅ Updated selector for ${domain}.${fieldName}: ${cssSelector} (${newSuccessCount} successes, ${newSuccessRate.toFixed(1)}% rate)`);
      } else {
        // Insert new selector
        await db('learned_selectors').insert({
          domain,
          field_name: fieldName,
          css_selector: cssSelector,
          selector_type: 'css',
          success_count: 1,
          failure_count: 0,
          success_rate: 100.00,
          learned_from: learnedFrom,
          example_value: extractedValue,
          first_seen: db.fn.now(),
          last_used: db.fn.now(),
          last_success: db.fn.now(),
          updated_at: db.fn.now()
        });
        
        console.log(`[SelectorLearning] 🎓 Learned new selector for ${domain}.${fieldName}: ${cssSelector} (from ${learnedFrom})`);
      }
    } catch (error) {
      console.error('[SelectorLearning] Error recording success:', error.message);
    }
  }

  /**
   * Record a selector failure
   * Increments failure_count and updates success_rate
   * 
   * @param {string} domain
   * @param {string} fieldName
   * @param {string} cssSelector
   */
  async recordFailure(domain, fieldName, cssSelector) {
    try {
      const existing = await db('learned_selectors')
        .where({ domain, field_name: fieldName, css_selector: cssSelector })
        .first();
      
      if (existing) {
        const newFailureCount = existing.failure_count + 1;
        const totalAttempts = existing.success_count + newFailureCount;
        const newSuccessRate = (existing.success_count / totalAttempts) * 100;
        
        await db('learned_selectors')
          .where({ id: existing.id })
          .update({
            failure_count: newFailureCount,
            success_rate: newSuccessRate,
            last_used: db.fn.now(),
            updated_at: db.fn.now()
          });
        
        console.log(`[SelectorLearning] ⚠️ Selector failed for ${domain}.${fieldName}: ${cssSelector} (${newSuccessRate.toFixed(1)}% rate)`);
      }
    } catch (error) {
      console.error('[SelectorLearning] Error recording failure:', error.message);
    }
  }

  /**
   * Extract actual selectors from page after AI Vision success
   * This is the key to learning - AI Vision tells us WHAT to extract,
   * we find the CSS selector that gets to that element
   * 
   * @param {Object} page - Playwright page instance
   * @param {Object} aiResult - AI Vision result with extracted data
   * @param {string} domain
   * @returns {Object} Map of field -> discovered selector
   */
  async discoverSelectorsFromAI(page, aiResult, domain) {
    try {
      console.log('[SelectorLearning] 🔍 Discovering selectors from AI Vision result...');
      
      const discoveries = {};
      
      // For each field AI found, try to locate it in the DOM
      const fields = ['price', 'title', 'originalPrice', 'brand', 'rating', 'reviewCount'];
      
      for (const field of fields) {
        if (!aiResult[field]) continue;
        
        const value = String(aiResult[field]).trim();
        if (!value || value === 'null' || value === 'undefined') continue;
        
        // Try to find element containing this exact value
        const selector = await page.evaluate(({ fieldName, searchValue }) => {
          // Search for text content match
          const allElements = document.querySelectorAll('*');
          const matches = [];
          
          for (const el of allElements) {
            // Skip scripts, styles, etc.
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'HR'].includes(el.tagName)) continue;
            
            const text = el.textContent?.trim() || '';
            const directText = Array.from(el.childNodes)
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent.trim())
              .join(' ')
              .trim();
            
            // Check if element contains our value
            if (text.includes(searchValue) || directText.includes(searchValue)) {
              // Build a specific selector
              let specificSelector = el.tagName.toLowerCase();
              
              // Add ID if available
              if (el.id) {
                specificSelector = `#${el.id}`;
              }
              // Add class if available
              else if (el.className && typeof el.className === 'string') {
                const classes = el.className.split(' ').filter(c => c.trim());
                if (classes.length > 0) {
                  specificSelector += '.' + classes.slice(0, 3).join('.');
                }
              }
              
              // Add data attributes
              const dataAttrs = Array.from(el.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .slice(0, 2);
              
              if (dataAttrs.length > 0) {
                specificSelector += dataAttrs.map(attr => `[${attr.name}]`).join('');
              }
              
              matches.push({
                selector: specificSelector,
                exactMatch: text === searchValue || directText === searchValue,
                length: text.length,
                element: el.tagName
              });
            }
          }
          
          // Return best match (exact match preferred, shortest text preferred)
          matches.sort((a, b) => {
            if (a.exactMatch && !b.exactMatch) return -1;
            if (!a.exactMatch && b.exactMatch) return 1;
            return a.length - b.length;
          });
          
          return matches[0]?.selector || null;
        }, { fieldName: field, searchValue: value });
        
        if (selector) {
          discoveries[field] = selector;
          console.log(`[SelectorLearning] 💡 Discovered selector for ${field}: ${selector}`);
          
          // Save to database
          await this.recordSuccess(domain, field, selector, value, 'ai_vision');
        }
      }
      
      return discoveries;
    } catch (error) {
      console.error('[SelectorLearning] Error discovering selectors:', error.message);
      return {};
    }
  }

  /**
   * Get statistics about learned selectors
   * @returns {Object} Stats object
   */
  async getStats() {
    try {
      const stats = await db('learned_selectors')
        .select(
          db.raw('COUNT(DISTINCT domain) as total_domains'),
          db.raw('COUNT(*) as total_selectors'),
          db.raw('AVG(success_rate) as avg_success_rate'),
          db.raw('SUM(success_count) as total_successes'),
          db.raw('COUNT(CASE WHEN learned_from = \'ai_vision\' THEN 1 END) as ai_discovered')
        )
        .first();
      
      return {
        totalDomains: parseInt(stats.total_domains) || 0,
        totalSelectors: parseInt(stats.total_selectors) || 0,
        avgSuccessRate: parseFloat(stats.avg_success_rate) || 0,
        totalSuccesses: parseInt(stats.total_successes) || 0,
        aiDiscovered: parseInt(stats.ai_discovered) || 0
      };
    } catch (error) {
      console.error('[SelectorLearning] Error getting stats:', error.message);
      return {};
    }
  }

  /**
   * Clean up old/bad selectors
   * Remove selectors with <20% success rate and no recent successes
   */
  async cleanup() {
    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const deleted = await db('learned_selectors')
        .where('success_rate', '<', 20)
        .where('last_success', '<', oneMonthAgo)
        .del();
      
      console.log(`[SelectorLearning] 🧹 Cleaned up ${deleted} low-performing selectors`);
      return deleted;
    } catch (error) {
      console.error('[SelectorLearning] Error cleaning up:', error.message);
      return 0;
    }
  }
}

module.exports = new SelectorLearningService();
