/**
 * Real Price Scraper - Hobo.nl Implementation
 * 
 * Scrapes competitor prices for Hobo.nl products
 * Targets: Bol.com, Amazon.nl, Coolblue, MediaMarkt
 */

const axios = require('axios');
const cheerio = require('cheerio');

class CompetitorScraper {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ];
  }

  async scrapeProduct(productName, ean) {
    console.log(`🔍 Scraping prices for: ${productName} (EAN: ${ean})`);
    
    const results = await Promise.allSettled([
      this.scrapeBolCom(ean),
      this.scrapeAmazon(productName),
      this.scrapeCoolblue(productName),
      this.scrapeMediaMarkt(ean)
    ]);

    return {
      product: productName,
      ean: ean,
      competitors: results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value),
      scrapedAt: new Date().toISOString()
    };
  }

  async scrapeBolCom(ean) {
    try {
      // Bol.com search API (publiek toegankelijk)
      const searchUrl = `https://www.bol.com/nl/nl/s/?searchtext=${ean}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'nl-NL,nl;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Bol.com product card selectors (update based on actual HTML)
      const priceElement = $('[data-test="price"]').first();
      const titleElement = $('[data-test="product-title"]').first();
      
      if (priceElement.length) {
        const priceText = priceElement.text().trim();
        const price = this.parsePrice(priceText);
        
        return {
          retailer: 'Bol.com',
          price: price,
          url: searchUrl,
          inStock: true,
          lastChecked: new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.error('Bol.com scrape failed:', error.message);
      return null;
    }
  }

  async scrapeAmazon(productName) {
    try {
      const searchQuery = encodeURIComponent(productName);
      const searchUrl = `https://www.amazon.nl/s?k=${searchQuery}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept-Language': 'nl-NL,nl;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Amazon price selectors
      const priceWhole = $('.a-price-whole').first().text();
      const priceFraction = $('.a-price-fraction').first().text();
      
      if (priceWhole) {
        const price = parseFloat(`${priceWhole.replace(',', '.')}.${priceFraction || '00'}`);
        
        return {
          retailer: 'Amazon.nl',
          price: price,
          url: searchUrl,
          inStock: true,
          lastChecked: new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.error('Amazon scrape failed:', error.message);
      return null;
    }
  }

  async scrapeCoolblue(productName) {
    try {
      const searchQuery = encodeURIComponent(productName);
      const searchUrl = `https://www.coolblue.nl/zoeken?query=${searchQuery}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept-Language': 'nl-NL,nl;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Coolblue price selectors
      const priceElement = $('.sales-price__current').first();
      
      if (priceElement.length) {
        const priceText = priceElement.text().trim();
        const price = this.parsePrice(priceText);
        
        return {
          retailer: 'Coolblue',
          price: price,
          url: searchUrl,
          inStock: true,
          lastChecked: new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.error('Coolblue scrape failed:', error.message);
      return null;
    }
  }

  async scrapeMediaMarkt(ean) {
    try {
      const searchUrl = `https://www.mediamarkt.nl/nl/search.html?query=${ean}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept-Language': 'nl-NL,nl;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // MediaMarkt price selectors
      const priceElement = $('[data-test="product-price"]').first();
      
      if (priceElement.length) {
        const priceText = priceElement.text().trim();
        const price = this.parsePrice(priceText);
        
        return {
          retailer: 'MediaMarkt',
          price: price,
          url: searchUrl,
          inStock: true,
          lastChecked: new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.error('MediaMarkt scrape failed:', error.message);
      return null;
    }
  }

  parsePrice(priceText) {
    // Parse Dutch price format: "€ 299,99" or "299,99"
    const cleaned = priceText
      .replace('€', '')
      .replace(/\s/g, '')
      .replace(',', '.');
    
    return parseFloat(cleaned) || null;
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  // Rate limiting to avoid being blocked
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CompetitorScraper;
