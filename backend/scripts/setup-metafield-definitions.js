/**
 * Setup Shopify Metafield Definitions
 * Creates metafield definitions for PriceElephant product data
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { shopifyApi } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_products', 'write_products', 'read_customers', 'write_customers'],
  hostName: process.env.HOST || 'localhost',
  apiVersion: '2024-10',
  isEmbeddedApp: false,
});

const session = {
  shop: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
};

const metafieldDefinitions = [
  // Product metafields
  {
    ownerType: 'PRODUCT',
    name: 'Channable Product ID',
    namespace: 'priceelephant',
    key: 'channable_id',
    description: 'External product ID from Channable feed',
    type: 'single_line_text_field',
  },
  {
    ownerType: 'PRODUCT',
    name: 'EAN Code',
    namespace: 'priceelephant',
    key: 'ean',
    description: 'European Article Number (barcode)',
    type: 'single_line_text_field',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Competitor Prices',
    namespace: 'priceelephant',
    key: 'competitor_prices',
    description: 'Current competitor prices (JSON array with retailer, price, url, inStock)',
    type: 'json',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Competitor Data',
    namespace: 'priceelephant',
    key: 'competitor_data',
    description: 'Multi-client competitor data (JSON with own_url and competitors array)',
    type: 'json',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Price History',
    namespace: 'priceelephant',
    key: 'price_history',
    description: 'Historical price data (JSON array with date, price, retailer)',
    type: 'json',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Price History Analysis',
    namespace: 'priceelephant',
    key: 'price_history_analysis',
    description: 'Historical price analysis with trends and year-over-year comparisons (JSON)',
    type: 'json',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Last Scraped',
    namespace: 'priceelephant',
    key: 'last_scraped',
    description: 'Timestamp of last competitor price scrape',
    type: 'date_time',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Lowest Competitor Price',
    namespace: 'priceelephant',
    key: 'lowest_competitor',
    description: 'Current lowest competitor price (number)',
    type: 'number_decimal',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Price Difference',
    namespace: 'priceelephant',
    key: 'price_difference',
    description: 'Difference between own price and lowest competitor (number)',
    type: 'number_decimal',
  },
  {
    ownerType: 'PRODUCT',
    name: 'Competitor Count',
    namespace: 'priceelephant',
    key: 'competitor_count',
    description: 'Number of active competitors tracked',
    type: 'number_integer',
  },
  
  // Customer metafields
  {
    ownerType: 'CUSTOMER',
    name: 'PriceElephant Tier',
    namespace: 'priceelephant',
    key: 'tier',
    description: 'Subscription tier',
    type: 'single_line_text_field',
    validations: [
      {
        name: 'choices',
        value: JSON.stringify(['trial', 'starter', 'professional', 'enterprise'])
      }
    ]
  },
  {
    ownerType: 'CUSTOMER',
    name: 'Product Limit',
    namespace: 'priceelephant',
    key: 'product_limit',
    description: 'Maximum number of products allowed (0 = unlimited)',
    type: 'number_integer',
  },
  {
    ownerType: 'CUSTOMER',
    name: 'Competitor Limit',
    namespace: 'priceelephant',
    key: 'competitor_limit',
    description: 'Maximum number of competitors per product (0 = unlimited)',
    type: 'number_integer',
  },
  {
    ownerType: 'CUSTOMER',
    name: 'API Access',
    namespace: 'priceelephant',
    key: 'api_access',
    description: 'Whether customer has API access enabled',
    type: 'boolean',
  },
  {
    ownerType: 'CUSTOMER',
    name: 'Monthly Price',
    namespace: 'priceelephant',
    key: 'monthly_price',
    description: 'Monthly subscription price in EUR',
    type: 'number_decimal',
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
            ownerType: definition.ownerType,
            ...(definition.validations && { validations: definition.validations })
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
    console.log('   • Product metafields: Settings → Custom data → Products → Metafields');
    console.log('   • Customer metafields: Settings → Custom data → Customers → Metafields\n');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  }
}

createMetafieldDefinitions()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
