/**
 * AI Vision Scraper - GPT-4 Vision fallback for failed selector-based scraping
 * Selector-free scraping using computer vision
 */

require('dotenv').config();
const OpenAI = require('openai');

class AIVisionScraper {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Extract product data from screenshot using GPT-4 Vision
   */
  async extractFromScreenshot(screenshotBase64, productUrl) {
    try {
      console.log('🤖 Using AI Vision fallback...');

      const response = await this.client.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract product information from this e-commerce page screenshot.
              
              Return ONLY valid JSON with this exact structure:
              {
                "title": "Product name",
                "price": 99.99,
                "currency": "EUR",
                "in_stock": true,
                "promotional_price": null,
                "original_price": null,
                "shipping_cost": null,
                "confidence": 0.95
              }
              
              Rules:
              - price must be a number (use decimal point, not comma)
              - in_stock is boolean (true if "op voorraad", "in stock", green indicator)
              - promotional_price if there's a sale/discount badge
              - confidence between 0-1 based on text clarity
              - Return null for fields you cannot determine
              
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
        max_tokens: 500,
        temperature: 0.1 // Low temperature for consistent extraction
      });

      const content = response.choices[0].message.content;
      
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI did not return valid JSON');
      }

      const data = JSON.parse(jsonMatch[0]);

      console.log(`✅ AI Vision extracted: ${data.title} - €${data.price} (confidence: ${data.confidence})`);

      return {
        title: data.title,
        price: parseFloat(data.price),
        inStock: data.in_stock,
        promotionalPrice: data.promotional_price ? parseFloat(data.promotional_price) : null,
        confidence: data.confidence,
        extractedBy: 'ai-vision'
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
