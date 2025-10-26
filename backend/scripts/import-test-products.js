/**
 * Import test products directly to production database
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const knex = require('knex');
const knexConfig = require('../knexfile');

// Force production config with SSL
const config = process.env.NODE_ENV === 'production' 
  ? {
      client: 'postgresql',
      connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    }
  : knexConfig[process.env.NODE_ENV || 'development'];

const db = knex(config);

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

async function importProducts() {
  try {
    console.log('🔄 Importing products to production database...\n');

    for (const product of testProducts) {
      // Check if product with this EAN already exists
      const existing = await db('products')
        .where({ product_ean: product.product_ean })
        .first();

      if (existing) {
        console.log(`⏭️  Skipped: ${product.product_name} (already exists)`);
        continue;
      }

      const [id] = await db('products')
        .insert(product)
        .returning('id');

      console.log(`✅ Imported: ${product.product_name} (ID: ${id})`);
    }

    console.log('\n📊 Import complete!');

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    throw error;
  } finally {
    await db.destroy();
  }
}

importProducts()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
