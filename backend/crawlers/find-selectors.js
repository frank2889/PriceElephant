/**
 * Coolblue Selector Finder
 * Debug tool to find the correct selectors on Coolblue
 */

const { chromium } = require('playwright');

async function findSelectors() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Use Coolblue homepage to find a real product
  await page.goto('https://www.coolblue.nl/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Find first product link
  const productLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/product/"]'));
    return links[0]?.href || null;
  });
  
  if (!productLink) {
    console.log('No product links found on homepage');
    await browser.close();
    return;
  }
  
  console.log(`Found product: ${productLink}`);
  
  // Navigate to product page
  await page.goto(productLink, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Find all elements with "price" in class or data attributes
  const priceSelectors = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const priceElements = elements.filter(el => {
      const classList = Array.from(el.classList).join(' ');
      const dataAttrs = Array.from(el.attributes).map(attr => `${attr.name}=${attr.value}`).join(' ');
      return (classList + dataAttrs).toLowerCase().includes('price');
    });
    
    return priceElements.slice(0, 10).map(el => ({
      tag: el.tagName,
      class: Array.from(el.classList).join(' '),
      dataTest: el.getAttribute('data-test'),
      text: el.textContent?.trim().substring(0, 50)
    }));
  });
  
  console.log('\n=== PRICE ELEMENTS ===');
  console.table(priceSelectors);
  
  // Find h1 for title
  const titleSelectors = await page.evaluate(() => {
    const h1s = Array.from(document.querySelectorAll('h1'));
    return h1s.map(el => ({
      tag: 'H1',
      class: Array.from(el.classList).join(' '),
      dataTest: el.getAttribute('data-test'),
      text: el.textContent?.trim().substring(0, 50)
    }));
  });
  
  console.log('\n=== TITLE ELEMENTS (H1) ===');
  console.table(titleSelectors);
  
  // Take screenshot
  await page.screenshot({ path: '/Users/Frank/Documents/PriceElephant/backend/coolblue-debug.png', fullPage: true });
  console.log('\n✅ Screenshot saved to backend/coolblue-debug.png');
  
  await browser.close();
}

findSelectors().catch(console.error);
