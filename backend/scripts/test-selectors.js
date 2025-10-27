/**
 * Simple Scraper Test - Direct scraping only (no proxies)
 * Tests if selectors work for each retailer
 */

require('dotenv').config();
const { chromium } = require('playwright');

const retailers = {
  bol: {
    name: 'Bol.com',
    url: 'https://www.bol.com/nl/nl/p/apple-iphone-15-128-gb-zwart/9300000165031886/',
    selectors: {
      price: '.promo-price, [data-test="price"], .price-block__highlight',
      title: 'h1[data-test="title"], h1',
      availability: '.buy-block__availability, [data-test="stock-status"]'
    }
  },
  amazon: {
    name: 'Amazon.nl',
    url: 'https://www.amazon.nl/dp/B0CHX3TW6S',
    selectors: {
      price: '.a-price-whole, #priceblock_ourprice, .a-price .a-offscreen',
      title: '#productTitle',
      availability: '#availability span'
    }
  },
  mediamarkt: {
    name: 'MediaMarkt',
    url: 'https://www.mediamarkt.nl/nl/product/_apple-iphone-15-128-gb-zwart-1991253.html',
    selectors: {
      price: '[data-test="mms-product-price"], .price, [class*="price"]',
      title: 'h1[data-test="mms-product-title"], h1',
      availability: '[data-test="mms-delivery-info"], [class*="delivery"]'
    }
  }
};

async function testRetailerSelectors(retailerKey) {
  const retailer = retailers[retailerKey];
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing ${retailer.name}`);
  console.log(`URL: ${retailer.url}`);
  console.log('='.repeat(80));

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });

  try {
    const page = await browser.newPage();
    
    console.log('📡 Loading page...');
    await page.goto(retailer.url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    await page.waitForTimeout(2000);

    // Try to find elements
    console.log('\n🔍 Testing selectors:');
    
    // Title
    const titleSelectors = retailer.selectors.title.split(',').map(s => s.trim());
    let titleFound = false;
    let titleText = null;
    
    for (const selector of titleSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          titleText = await element.textContent();
          console.log(`✅ Title found with: ${selector}`);
          console.log(`   Text: ${titleText.trim().substring(0, 80)}...`);
          titleFound = true;
          break;
        }
      } catch (e) {}
    }
    
    if (!titleFound) {
      console.log(`❌ Title not found with any selector: ${retailer.selectors.title}`);
    }

    // Price
    const priceSelectors = retailer.selectors.price.split(',').map(s => s.trim());
    let priceFound = false;
    let priceText = null;
    
    for (const selector of priceSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          priceText = await element.textContent();
          console.log(`✅ Price found with: ${selector}`);
          console.log(`   Text: ${priceText.trim()}`);
          priceFound = true;
          break;
        }
      } catch (e) {}
    }
    
    if (!priceFound) {
      console.log(`❌ Price not found with any selector: ${retailer.selectors.price}`);
      
      // Debug: Save screenshot and HTML
      await page.screenshot({ path: `debug-${retailerKey}.png`, fullPage: true });
      const html = await page.content();
      require('fs').writeFileSync(`debug-${retailerKey}.html`, html);
      console.log(`💾 Saved debug-${retailerKey}.png and debug-${retailerKey}.html`);
    }

    // Availability
    const availabilitySelectors = retailer.selectors.availability.split(',').map(s => s.trim());
    let availabilityFound = false;
    let availabilityText = null;
    
    for (const selector of availabilitySelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          availabilityText = await element.textContent();
          console.log(`✅ Availability found with: ${selector}`);
          console.log(`   Text: ${availabilityText.trim()}`);
          availabilityFound = true;
          break;
        }
      } catch (e) {}
    }
    
    if (!availabilityFound) {
      console.log(`❌ Availability not found with any selector: ${retailer.selectors.availability}`);
    }

    // Summary
    console.log(`\n📊 Result: ${titleFound ? '✅' : '❌'} Title | ${priceFound ? '✅' : '❌'} Price | ${availabilityFound ? '✅' : '❌'} Availability`);
    
    return {
      retailer: retailer.name,
      success: titleFound && priceFound,
      titleFound,
      priceFound,
      availabilityFound
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return {
      retailer: retailer.name,
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🧪 Testing Retailer Selectors\n');
  
  const results = [];
  
  for (const retailerKey of Object.keys(retailers)) {
    const result = await testRetailerSelectors(retailerKey);
    results.push(result);
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n\n${'='.repeat(80)}`);
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.retailer}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\nSuccess rate: ${successCount}/${results.length} (${(successCount/results.length*100).toFixed(0)}%)`);
}

main()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
