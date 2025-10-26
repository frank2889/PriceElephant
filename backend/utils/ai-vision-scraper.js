/**
 * AI Vision Scraper - GPT-4 Vision emergency fallback
 * 
 * ONLY used when all other tiers fail:
 * - Direct scraping failed
 * - Free proxies failed
 * - WebShare failed
 * 
 * Cost: ~€0.02/request (expensive!)
 * Use case: Emergency backup to guarantee 99.9%+ success rate
 */

require('dotenv').config();
const OpenAI = require('openai');

class AIVisionScraper {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️  OPENAI_API_KEY not set - AI Vision fallback disabled');
      this.enabled = false;
      return;
    }
    
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.enabled = true;
  }

  /**
   * Extract product data from screenshot using GPT-4 Vision
   */
  async extractFromScreenshot(screenshotBase64, productUrl) {
    if (!this.enabled) {
      throw new Error('AI Vision is disabled - OPENAI_API_KEY not configured');
    }

    try {
      console.log('🤖 AI Vision emergency fallback (€0.02 cost)...');

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',  // Latest model with vision
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract product price from this Dutch e-commerce page screenshot.
              
              Return ONLY valid JSON:
              {
                "title": "Product name",
                "price": 99.99,
                "in_stock": true
              }
              
              Rules:
              - price as number (decimal point)
              - in_stock is boolean (check for "op voorraad", green indicator, "bestel" button)
              - Return null if you cannot find the price
              
              NO explanations, ONLY JSON.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshotBase64}`
              }
            }
          ]
        }],
        max_tokens: 300,
        temperature: 0
      });

      const content = response.choices[0].message.content;
      
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI did not return valid JSON');
      }

      const data = JSON.parse(jsonMatch[0]);

      if (!data.price || data.price <= 0) {
        throw new Error('AI could not extract valid price');
      }

      console.log(`✅ AI Vision: ${data.title} - €${data.price}`);

      return {
        title: data.title,
        price: parseFloat(data.price),
        inStock: data.in_stock !== false, // Default to true if unclear
        currency: 'EUR',
        extractedBy: 'ai-vision',
        scrapedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ AI Vision extraction failed:', error.message);
      throw error;
    }
  }

  /**
   * Take screenshot and extract data in one call
   */
  async scrapeWithVision(page) {
    try {
      // Take full page screenshot
      const screenshot = await page.screenshot({ 
        fullPage: true,
        type: 'png'
      });

      // Convert to base64
      const screenshotBase64 = screenshot.toString('base64');

      // Extract data using AI
      const data = await this.extractFromScreenshot(screenshotBase64, page.url());

      return data;

    } catch (error) {
      console.error('❌ Vision scraping failed:', error.message);
      throw error;
    }
  }

  /**
   * Calculate cost of vision scraping
   */
  static estimateCost(numProducts) {
    // GPT-4 Vision costs (as of Oct 2025)
    const costPer1kTokens = 0.01; // $0.01 per 1K tokens
    const avgTokensPerProduct = 500; // Screenshot + response
    const costPerProduct = (avgTokensPerProduct / 1000) * costPer1kTokens;
    
    return {
      perProduct: costPerProduct,
      total: costPerProduct * numProducts,
      monthly: costPerProduct * numProducts * 30 // Daily scraping
    };
  }

  /**
   * Test AI Vision scraper
   */
  static async test() {
    const { chromium } = require('playwright');
    const scraper = new AIVisionScraper();

    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  OpenAI API key not configured');
      console.log('💡 Get API key: https://platform.openai.com/api-keys');
      console.log('💡 Set OPENAI_API_KEY in .env');
      return false;
    }

    try {
      console.log('🤖 Testing AI Vision scraper...\n');

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Test with a real product page
      console.log('📸 Loading product page...');
      await page.goto('https://www.coolblue.nl/', { waitUntil: 'networkidle' });
      
      // Find first product link
      const productLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/product/"]'));
        return links[0]?.href || null;
      });

      if (!productLink) {
        throw new Error('No product found on homepage');
      }

      console.log(`🔗 Testing with: ${productLink}\n`);
      await page.goto(productLink, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Extract with AI Vision
      const data = await scraper.scrapeWithVision(page);

      await browser.close();

      console.log('\n📊 EXTRACTION RESULTS:');
      console.table(data);

      // Cost estimation
      const cost = AIVisionScraper.estimateCost(100);
      console.log('\n💰 COST ESTIMATION (100 products/day):');
      console.log(`   Per product: $${cost.perProduct.toFixed(4)}`);
      console.log(`   Per month: $${cost.monthly.toFixed(2)}`);

      return true;

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      return false;
    }
  }
}

module.exports = AIVisionScraper;

// Test if run directly
if (require.main === module) {
  AIVisionScraper.test()
    .then((success) => {
      process.exit(success ? 0 : 1);
    });
}
