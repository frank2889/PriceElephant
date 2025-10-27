/**
 * Setup Shopify Metafield Definitions
 * Creates metafield definitions for PriceElephant product data
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { shopifyApi } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_products', 'write_products'],
  hostName: process.env.HOST || 'localhost',
  apiVersion: '2024-10',
  isEmbeddedApp: false,
});

const session = {
  shop: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
};

const metafieldDefinitions = [
  {
    name: 'Channable Product ID',
    namespace: 'priceelephant',
    key: 'channable_id',
    description: 'External product ID from Channable feed',
    type: 'single_line_text_field',
  },
  {
    name: 'EAN Code',
    namespace: 'priceelephant',
    key: 'ean',
    description: 'European Article Number (barcode)',
    type: 'single_line_text_field',
  },
  {
    name: 'Competitor Prices',
    namespace: 'priceelephant',
    key: 'competitor_prices',
    description: 'Current competitor prices (JSON array with retailer, price, url, inStock)',
    type: 'json',
  },
  {
    name: 'Price History',
    namespace: 'priceelephant',
    key: 'price_history',
    description: 'Historical price data (JSON array with date, price, retailer)',
    type: 'json',
  },
  {
    name: 'Last Scraped',
    namespace: 'priceelephant',
    key: 'last_scraped',
    description: 'Timestamp of last competitor price scrape',
    type: 'date_time',
  },
  {
    name: 'Lowest Competitor Price',
    namespace: 'priceelephant',
    key: 'lowest_competitor',
    description: 'Current lowest competitor price (number)',
    type: 'number_decimal',
  },
  {
    name: 'Price Difference',
    namespace: 'priceelephant',
    key: 'price_difference',
    description: 'Difference between own price and lowest competitor (number)',
    type: 'number_decimal',
  },
  {
    name: 'Competitor Count',
    namespace: 'priceelephant',
    key: 'competitor_count',
    description: 'Number of active competitors tracked',
    type: 'number_integer',
  }
];

async function createMetafieldDefinitions() {
  try {
    console.log('🔧 Creating Shopify metafield definitions via GraphQL...\n');

    const client = new shopify.clients.Graphql({ session });

    for (const definition of metafieldDefinitions) {
      try {
        console.log(`📝 Creating: ${definition.name} (${definition.namespace}.${definition.key})`);

        const query = `
          mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
                namespace
                key
                type {
                  name
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variables = {
          definition: {
            name: definition.name,
            namespace: definition.namespace,
            key: definition.key,
            description: definition.description,
            type: definition.type,
            ownerType: 'PRODUCT',
          }
        };

        const response = await client.request(query, { variables });

        if (response.data.metafieldDefinitionCreate.userErrors.length > 0) {
          const errors = response.data.metafieldDefinitionCreate.userErrors;
          if (errors[0].message.includes('taken')) {
            console.log(`   ⏭️  Already exists: ${definition.namespace}.${definition.key}`);
          } else {
            console.error(`   ❌ Failed: ${errors.map(e => e.message).join(', ')}`);
          }
        } else {
          const created = response.data.metafieldDefinitionCreate.createdDefinition;
          console.log(`   ✅ Created: ${created.name} (ID: ${created.id})`);
        }

        // Rate limit: wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
      }
    }

    console.log('\n✅ Metafield definitions setup complete!');
    console.log('\nℹ️  You can view them in Shopify Admin:');
    console.log('   Settings → Custom data → Products → Metafields\n');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  }
}

createMetafieldDefinitions()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
