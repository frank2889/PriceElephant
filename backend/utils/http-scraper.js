/**
 * HTTP-only scraper for sites that block headless browsers
 * Faster and cheaper than browser-based scraping
 * Works well for simple sites without heavy JavaScript
 */

const axios = require('axios');

class HttpScraper {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Extract text content from HTML using selector
   * Simple regex-based extraction (no DOM parser needed)
   */
  extractWithSelector(html, selector) {
    // Try to find elements matching the selector
    const results = [];
    
    // Split selector by comma (multiple selectors)
    const selectors = selector.split(',').map(s => s.trim());
    
    for (const sel of selectors) {
      // Simple class selector: .price-box .price
      if (sel.includes('.')) {
        const classes = sel.split('.').filter(c => c.trim());
        
        for (const className of classes) {
          // Match: <tag class="className">content</tag>
          const regex = new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([^<]+)</`, 'gi');
          const matches = [...html.matchAll(regex)];
          
          for (const match of matches) {
            if (match[1]) {
              results.push(match[1].trim());
            }
          }
        }
      }
      
      // Data attribute selector: [data-price-type="finalPrice"]
      if (sel.includes('[data-')) {
        const attrMatch = sel.match(/\[([^=]+)="([^"]+)"\]/);
        if (attrMatch) {
          const [, attr, value] = attrMatch;
          const regex = new RegExp(`<[^>]*${attr}="${value}"[^>]*>([^<]+)</`, 'gi');
          const matches = [...html.matchAll(regex)];
          
          for (const match of matches) {
            if (match[1]) {
              results.push(match[1].trim());
            }
          }
        }
      }
      
      // Tag selector: h1
      if (sel.match(/^[a-z]+$/i)) {
        const regex = new RegExp(`<${sel}[^>]*>([^<]+)</${sel}>`, 'gi');
        const matches = [...html.matchAll(regex)];
        
        for (const match of matches) {
          if (match[1]) {
            results.push(match[1].trim());
          }
        }
      }
      
      // Itemprop selector: [itemprop="brand"]
      if (sel.includes('[itemprop=')) {
        const propMatch = sel.match(/\[itemprop="([^"]+)"\]/);
        if (propMatch) {
          const prop = propMatch[1];
          const regex = new RegExp(`<[^>]*itemprop="${prop}"[^>]*>([^<]+)</`, 'gi');
          const matches = [...html.matchAll(regex)];
          
          for (const match of matches) {
            if (match[1]) {
              results.push(match[1].trim());
            }
          }
        }
      }
    }
    
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Parse price from text
   */
  parsePrice(text) {
    if (!text) return null;
    
    // Remove everything except digits, comma, dot, minus
    const cleaned = text.replace(/[^\d,.-]/g, '').replace(',', '.');
    const price = parseFloat(cleaned);
    
    return isNaN(price) || price <= 0 ? null : price;
  }

  /**
   * Scrape page using simple HTTP request (no browser)
   * @param {string} url - Page URL
   * @param {Object} selectors - CSS selectors to try
   * @returns {Object} Scraped data
   */
  async scrape(url, selectors) {
    try {
      console.log('🌐 [HTTP Scraper] Attempting HTTP-only scrape...');
      
      // Random user agent
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      
      // Fetch HTML
      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
          'Referer': new URL(url).origin
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 500 // Accept even 4xx
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = response.data;
      console.log(`🌐 [HTTP Scraper] Downloaded ${html.length} bytes`);

      // Try structured data first (most reliable)
      let price = null;
      let originalPrice = null;
      let title = null;
      let brand = null;

      // 1. Try meta tags (Open Graph / Product)
      const metaPriceMatch = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i);
      if (metaPriceMatch) {
        price = this.parsePrice(metaPriceMatch[1]);
        console.log(`🌐 [HTTP Scraper] Found price in meta: ${price}`);
      }

      // 2. Try JSON-LD structured data
      const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/is);
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd.offers?.price) {
            price = this.parsePrice(jsonLd.offers.price);
            console.log(`🌐 [HTTP Scraper] Found price in JSON-LD: ${price}`);
          }
          if (jsonLd.name) {
            title = jsonLd.name.trim();
          }
          if (jsonLd.brand?.name) {
            brand = jsonLd.brand.name.trim();
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      }

      // 3. Try inline JavaScript data (Magento pattern)
      const magentoDataMatch = html.match(/"final_price":([\d.]+)/);
      if (magentoDataMatch && !price) {
        price = this.parsePrice(magentoDataMatch[1]);
        console.log(`🌐 [HTTP Scraper] Found price in Magento data: ${price}`);
      }

      const magentoRegularMatch = html.match(/"regular_price":([\d.]+)/);
      if (magentoRegularMatch) {
        originalPrice = this.parsePrice(magentoRegularMatch[1]);
        console.log(`🌐 [HTTP Scraper] Found original price: ${originalPrice}`);
      }

      // 4. Fallback to CSS selectors
      if (!price) {
        const priceText = this.extractWithSelector(html, selectors.price);
        price = this.parsePrice(priceText);
      }
      
      if (!originalPrice) {
        const originalPriceText = this.extractWithSelector(html, selectors.originalPrice || '');
        originalPrice = this.parsePrice(originalPriceText);
      }
      
      if (!title) {
        title = this.extractWithSelector(html, selectors.title);
      }

      if (!brand) {
        brand = this.extractWithSelector(html, selectors.brand || '');
      }

      // Check if in stock (basic check)
      const bodyTextLower = html.toLowerCase();
      const inStock = !bodyTextLower.includes('uit voorraad') && 
                      !bodyTextLower.includes('niet leverbaar') &&
                      !bodyTextLower.includes('out of stock') &&
                      !bodyTextLower.includes('sold out');

      console.log(`🌐 [HTTP Scraper] Extracted: price=${price}, originalPrice=${originalPrice}, title=${title?.substring(0, 30)}`);

      if (!price || price <= 0) {
        throw new Error('No valid price found in HTTP response');
      }

      return {
        price,
        originalPrice,
        title,
        brand,
        inStock,
        currency: 'EUR',
        extractedBy: 'http',
        scrapedAt: new Date().toISOString()
      };

    } catch (error) {
      console.log(`🌐 [HTTP Scraper] Failed: ${error.message}`);
      throw new Error(`HTTP scraping failed: ${error.message}`);
    }
  }
}

module.exports = HttpScraper;
