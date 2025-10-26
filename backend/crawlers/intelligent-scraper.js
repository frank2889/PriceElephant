/**
 * Intelligent AI-Powered Scraper
 * 
 * De AI is de "brein" die:
 * 1. Analyseert de HTML structuur
 * 2. Bepaalt beste scraping methode
 * 3. Genereert CSS selectors dynamisch
 * 4. Valt terug naar vision als nodig
 * 
 * Voordelen:
 * - Geen hardcoded selectors die breken
 * - Werkt op ELKE e-commerce site
 * - AI kiest goedkoopste methode zelf
 * - Geen proxy problemen (AI begrijpt de HTML)
 * 
 * Cost: €0.001 voor HTML analyse (GPT-4o-mini) + €0.02 voor vision (alleen als nodig)
 */

require('dotenv').config();
const { chromium } = require('playwright');
const OpenAI = require('openai');
const db = require('../config/database');
const PriceAlertService = require('../services/price-alert');

class IntelligentScraper {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.alertService = new PriceAlertService();
    this.browser = null;
    this.context = null;
    
    // Selector cache per domain (learning system)
    this.selectorCache = new Map();
    
    this.stats = {
      total: 0,
      htmlAnalysis: 0,    // AI determined from HTML
      visionFallback: 0,  // AI needed screenshot
      cached: 0,          // Used learned selectors
      totalCost: 0
    };
  }

  /**
   * STAP 1: Probeer met geleerde selectors (GRATIS)
   */
  async tryLearnedSelectors(page, domain) {
    const cached = this.selectorCache.get(domain);
    if (!cached) return null;

    console.log(`🧠 Trying learned selectors for ${domain}...`);

    try {
      const data = await page.evaluate((selectors) => {
        const getEl = (sel) => document.querySelector(sel);
        
        const priceEl = getEl(selectors.price);
        const titleEl = getEl(selectors.title);
        
        if (!priceEl) return null;
        
        let priceText = priceEl.textContent.trim();
        priceText = priceText.replace(/[€$,\s]/g, '').replace(',', '.');
        const price = parseFloat(priceText);
        
        if (isNaN(price) || price <= 0) return null;
        
        return {
          title: titleEl?.textContent?.trim() || 'Unknown',
          price,
          inStock: true
        };
      }, cached);

      if (data?.price > 0) {
        console.log(`✅ Learned selectors worked: €${data.price}`);
        this.stats.cached++;
        return data;
      }
    } catch (error) {
      console.log(`⚠️ Learned selectors failed, need fresh analysis`);
    }
    
    return null;
  }

  /**
   * STAP 2: AI analyseert HTML en genereert selectors (€0.001)
   */
  async analyzeHTMLWithAI(html, url) {
    console.log('🤖 AI analyzing HTML structure (€0.001)...');

    const prompt = `Analyseer deze HTML van een product pagina en vind de prijs.

URL: ${url}

HTML snippet:
${html.substring(0, 80000)}

Zoek naar elementen met:
- Cijfers + € symbool
- Classes zoals: price, prijs, sales, kosten, bedrag
- Data attributes: data-price, data-test
- Grootste/meest prominente prijsweergave

BELANGRIJK:
- Actieprijs/Sale price krijgt voorkeur boven normale prijs
- Kies de HUIDIGE prijs die klant betaalt
- Vermijd "vanaf" prijzen of range prijzen als er exacte prijs is

Return JSON met MULTIPLE selectors (fallback opties):
{
  "selectors": [
    ".sales-price__current",
    "[data-test='sales-price']",
    ".product-price strong",
    ".price-current"
  ],
  "strategy": "Try selectors in order until one works"
}

Geef 5-10 verschillende selectors die kunnen werken.
Alleen JSON.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Upgrade to better model for HTML analysis
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI returned invalid JSON');

      const analysis = JSON.parse(jsonMatch[0]);
      
      console.log(`✅ AI generated ${analysis.selectors?.length || 0} selector options`);
      this.stats.totalCost += 0.003; // gpt-4o slightly more expensive

      return analysis.selectors || [];
    } catch (error) {
      console.error(`❌ HTML analysis failed:`, error.message);
      return [];
    }
  }

  /**
   * STAP 3: Probeer AI-gegenereerde selectors (MULTIPLE fallbacks)
   */
  async tryAISelectors(page, selectors) {
    if (!selectors || selectors.length === 0) return null;

    console.log(`🎯 Trying ${selectors.length} AI-generated selectors...`);

    try {
      const data = await page.evaluate((selectorList) => {
        // Try each selector until we find a price
        for (const selector of selectorList) {
          try {
            const el = document.querySelector(selector);
            if (!el) continue;
            
            let priceText = el.textContent.trim();
            
            // Parse price - handle different formats
            priceText = priceText.replace(/[€$£,\s]/g, '');
            
            // Handle both comma and dot as decimal separator
            if (priceText.includes('.') && priceText.includes(',')) {
              priceText = priceText.replace(/\./g, '').replace(',', '.');
            } else if (priceText.includes(',')) {
              const parts = priceText.split(',');
              if (parts[1]?.length === 2) {
                priceText = priceText.replace(',', '.');
              } else {
                priceText = priceText.replace(',', '');
              }
            }
            
            const price = parseFloat(priceText);
            if (isNaN(price) || price <= 0 || price > 100000) continue;
            
            // Found valid price!
            return {
              title: document.querySelector('h1')?.textContent?.trim() || 'Unknown Product',
              price,
              inStock: true,
              currency: 'EUR',
              usedSelector: selector
            };
          } catch (e) {
            continue; // Try next selector
          }
        }
        
        return null; // No selector worked
      }, selectors);

      if (data?.price > 0) {
        console.log(`✅ Selector worked: "${data.usedSelector}" → €${data.price}`);
        this.stats.htmlAnalysis++;
        return data;
      }
    } catch (error) {
      console.log(`⚠️ All AI selectors failed:`, error.message);
    }
    
    return null;
  }

  /**
   * STAP 4: Vision fallback als laatste optie (€0.02)
   */
  async extractWithVision(page, url) {
    console.log('🤖 Vision fallback (€0.02)...');

    try {
      const screenshot = await page.screenshot({ fullPage: false });
      const base64 = screenshot.toString('base64');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract ONLY the product price from this screenshot.

Rules:
- If there's a sale/discount price (usually red/larger), use that
- If multiple prices, use the CURRENT buying price
- Ignore shipping costs, "vanaf" prices

Return this EXACT JSON format (nothing else):
{"price": 299.99}

Just the number, no currency symbol.
ONLY JSON, no markdown, no explanation.`
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64}` }
            }
          ]
        }],
        max_tokens: 100,
        temperature: 0,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content.trim();
      console.log(`AI response: ${content}`);
      
      const data = JSON.parse(content);
      
      if (!data.price || isNaN(parseFloat(data.price)) || parseFloat(data.price) <= 0) {
        throw new Error('No valid price in vision response');
      }

      const price = parseFloat(data.price);
      console.log(`✅ Vision extraction: €${price}`);
      
      this.stats.visionFallback++;
      this.stats.totalCost += 0.02;

      return {
        title: 'Product',
        price,
        inStock: true,
        currency: 'EUR'
      };
    } catch (error) {
      console.error(`❌ Vision fallback failed:`, error.message);
      throw error;
    }
  }

  /**
   * Main scrape method - INTELLIGENT CASCADE
   */
  async scrape(url, productId = null, clientId = null) {
    this.stats.total++;
    const domain = new URL(url).hostname;

    // Launch browser (no proxy needed - AI reads HTML!)
    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'nl-NL'
    });

    const page = await this.context.newPage();
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      let data = null;
      let method = null;
      let cost = 0;

      // STAP 1: Try learned selectors (GRATIS)
      data = await this.tryLearnedSelectors(page, domain);
      if (data) {
        method = 'cached';
        cost = 0;
      }

      // STAP 2+3: AI HTML analysis + try selectors (€0.003)
      if (!data) {
        const html = await page.content();
        const selectors = await this.analyzeHTMLWithAI(html, url);
        
        if (selectors && selectors.length > 0) {
          data = await this.tryAISelectors(page, selectors);
          
          if (data) {
            method = 'html-analysis';
            cost = 0.003;
            
            // LEARN: Cache best selector voor volgende keer
            this.selectorCache.set(domain, [data.usedSelector]);
            console.log(`📚 Learned selector for ${domain}: "${data.usedSelector}"`);
          }
        }
      }

      // STAP 4: Vision als laatste redmiddel (€0.02)
      if (!data) {
        data = await this.extractWithVision(page, url);
        method = 'vision';
        cost = 0.02;
      }

      // Save + trigger alerts
      if (productId && data) {
        await this.saveAndAlert(productId, clientId, url, data, method, cost);
      }

      await this.browser.close();

      return { ...data, method, cost };

    } catch (error) {
      await this.browser.close();
      throw error;
    }
  }

  /**
   * Save to database + trigger price alerts
   */
  async saveAndAlert(productId, clientId, url, data, method, cost) {
    try {
      // Determine retailer from URL
      const domain = new URL(url).hostname;
      const retailer = domain.replace('www.', '').split('.')[0];

      // Save price
      await db('competitor_prices').insert({
        product_id: productId,
        retailer,
        price: data.price,
        url,
        in_stock: data.inStock,
        scraped_at: new Date(),
        created_at: new Date()
      });

      console.log(`💾 Saved ${retailer}: €${data.price} (method: ${method}, cost: €${cost})`);

      // Trigger alerts
      if (clientId) {
        const alerts = await this.alertService.analyzePriceSnapshot(
          productId,
          clientId,
          retailer,
          data.price,
          data.inStock
        );

        if (alerts.length > 0) {
          console.log(`🔔 ${alerts.length} alerts triggered`);
        }
      }
    } catch (error) {
      console.error('Save/alert error:', error.message);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgCost: this.stats.total > 0 ? (this.stats.totalCost / this.stats.total).toFixed(4) : 0,
      successRate: ((this.stats.total > 0 ? 
        ((this.stats.cached + this.stats.htmlAnalysis + this.stats.visionFallback) / this.stats.total) * 100 : 0)).toFixed(1)
    };
  }
}

module.exports = IntelligentScraper;
