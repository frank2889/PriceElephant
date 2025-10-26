/**
 * Import via API endpoint instead of direct database access
 */

const testProducts = [
  {
    shopify_customer_id: 1,
    product_name: 'Apple AirPods Pro (2nd generation)',
    product_ean: '194253398578',
    product_sku: 'MTJV3',
    brand: 'Apple',
    category: 'Audio',
    own_price: 279.00,
    product_url: 'https://www.apple.com/airpods-pro/',
    image_url: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83',
    active: true
  },
  {
    shopify_customer_id: 1,
    product_name: 'Lenovo ThinkPad X1 Carbon Gen 11',
    product_ean: '197530828089',
    product_sku: '21HM002RMH',
    brand: 'Lenovo',
    category: 'Laptops',
    own_price: 1899.00,
    product_url: 'https://www.lenovo.com/thinkpad-x1-carbon',
    image_url: 'https://p3-ofp.static.pub/ShareResource/na/subseries/hero/thinkpad-x1-carbon-gen-11.png',
    active: true
  },
  {
    shopify_customer_id: 1,
    product_name: 'Logitech MX Master 3S',
    product_ean: '5099206098596',
    product_sku: '910-006559',
    brand: 'Logitech',
    category: 'Accessories',
    own_price: 99.99,
    product_url: 'https://www.logitech.com/mx-master-3s',
    image_url: 'https://resource.logitech.com/w_800,c_lpad,ar_1:1,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/mice/mx-master-3s/gallery/mx-master-3s-mouse-top-view-graphite.png',
    active: true
  },
  {
    shopify_customer_id: 1,
    product_name: 'Samsung Odyssey G9',
    product_ean: '8806092613577',
    product_sku: 'LC49G95TSSUXEN',
    brand: 'Samsung',
    category: 'Monitors',
    own_price: 1399.00,
    product_url: 'https://www.samsung.com/odyssey-g9',
    image_url: 'https://images.samsung.com/is/image/samsung/p6pim/nl/lc49g95tssuxen/gallery/nl-odyssey-g9-lc49g95tssuxen-224895803',
    active: true
  },
  {
    shopify_customer_id: 1,
    product_name: 'Sony PlayStation 5',
    product_ean: '0711719395058',
    product_sku: 'CFI-1216A',
    brand: 'Sony',
    category: 'Gaming',
    own_price: 549.99,
    product_url: 'https://www.playstation.com/ps5/',
    image_url: 'https://gmedia.playstation.com/is/image/SIEPDC/ps5-product-thumbnail-01-en-14sep21',
    active: true
  }
];

async function importViaAPI() {
  const API_BASE = 'https://web-production-2568.up.railway.app';
  
  console.log('🔄 Importing products via Railway API...\n');
  
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const product of testProducts) {
    try {
      const response = await fetch(`${API_BASE}/api/v1/products/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(product)
      });
      
      if (response.ok) {
        console.log(`✅ Imported: ${product.product_name}`);
        imported++;
      } else if (response.status === 409) {
        console.log(`⏭️  Skipped: ${product.product_name} (already exists)`);
        skipped++;
      } else {
        const error = await response.text();
        console.log(`❌ Failed: ${product.product_name} - ${error}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ Failed: ${product.product_name} - ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Import complete!`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
}

importViaAPI()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
