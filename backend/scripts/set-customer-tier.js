/**
 * Set Customer Tier in Shopify
 * Updates customer metafields with tier information
 * 
 * Usage: node set-customer-tier.js <customer-email> <tier>
 * Example: node set-customer-tier.js info@hobo.nl enterprise
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { shopifyApi } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers'],
  hostName: process.env.HOST || 'localhost',
  apiVersion: '2024-10',
  isEmbeddedApp: false,
});

const session = {
  shop: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
};

const TIER_CONFIGS = {
  trial: {
    productLimit: 50,
    competitorLimit: 1,
    apiAccess: false,
    monthlyPrice: 0
  },
  starter: {
    productLimit: 500,
    competitorLimit: 3,
    apiAccess: false,
    monthlyPrice: 49
  },
  professional: {
    productLimit: 2500,
    competitorLimit: 5,
    apiAccess: false,
    monthlyPrice: 99
  },
  enterprise: {
    productLimit: 0, // unlimited
    competitorLimit: 0, // unlimited
    apiAccess: true,
    monthlyPrice: 249
  }
};

async function setCustomerTier(email, tier) {
  try {
    if (!TIER_CONFIGS[tier]) {
      throw new Error(`Invalid tier: ${tier}. Must be one of: ${Object.keys(TIER_CONFIGS).join(', ')}`);
    }

    const client = new shopify.clients.Graphql({ session });
    
    // Find customer by email
    console.log(`🔍 Looking up customer: ${email}`);
    
    const searchQuery = `
      query SearchCustomer($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              email
              firstName
              lastName
            }
          }
        }
      }
    `;
    
    const searchResult = await client.request(searchQuery, {
      variables: { query: `email:${email}` }
    });
    
    const customers = searchResult.data.customers.edges;
    if (customers.length === 0) {
      throw new Error(`Customer not found: ${email}`);
    }
    
    const customer = customers[0].node;
    console.log(`✅ Found: ${customer.firstName} ${customer.lastName} (${customer.email})`);
    console.log(`   Customer ID: ${customer.id}\n`);
    
    // Update metafields
    const config = TIER_CONFIGS[tier];
    console.log(`📝 Setting tier to: ${tier.toUpperCase()}`);
    console.log(`   Product limit: ${config.productLimit === 0 ? 'Unlimited' : config.productLimit}`);
    console.log(`   Competitor limit: ${config.competitorLimit === 0 ? 'Unlimited' : config.competitorLimit}`);
    console.log(`   API access: ${config.apiAccess ? 'Yes' : 'No'}`);
    console.log(`   Monthly price: €${config.monthlyPrice}\n`);
    
    const updateQuery = `
      mutation UpdateCustomerMetafields($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            email
            metafields(first: 10, namespace: "priceelephant") {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const updateResult = await client.request(updateQuery, {
      variables: {
        input: {
          id: customer.id,
          metafields: [
            {
              namespace: 'priceelephant',
              key: 'tier',
              value: tier,
              type: 'single_line_text_field'
            },
            {
              namespace: 'priceelephant',
              key: 'product_limit',
              value: config.productLimit.toString(),
              type: 'number_integer'
            },
            {
              namespace: 'priceelephant',
              key: 'competitor_limit',
              value: config.competitorLimit.toString(),
              type: 'number_integer'
            },
            {
              namespace: 'priceelephant',
              key: 'api_access',
              value: config.apiAccess.toString(),
              type: 'boolean'
            },
            {
              namespace: 'priceelephant',
              key: 'monthly_price',
              value: config.monthlyPrice.toString(),
              type: 'number_decimal'
            }
          ]
        }
      }
    });
    
    if (updateResult.data.customerUpdate.userErrors.length > 0) {
      const errors = updateResult.data.customerUpdate.userErrors;
      throw new Error(`Failed to update: ${errors.map(e => e.message).join(', ')}`);
    }
    
    console.log('✅ Customer tier updated successfully!');
    console.log('\n📋 Current metafields:');
    
    const metafields = updateResult.data.customerUpdate.customer.metafields.edges;
    metafields.forEach(({ node }) => {
      console.log(`   ${node.key}: ${node.value}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// CLI
const email = process.argv[2];
const tier = process.argv[3];

if (!email || !tier) {
  console.log('Usage: node set-customer-tier.js <customer-email> <tier>');
  console.log('\nAvailable tiers:');
  Object.entries(TIER_CONFIGS).forEach(([name, config]) => {
    console.log(`  ${name}:`);
    console.log(`    - ${config.productLimit === 0 ? 'Unlimited' : config.productLimit} products`);
    console.log(`    - ${config.competitorLimit === 0 ? 'Unlimited' : config.competitorLimit} competitors`);
    console.log(`    - €${config.monthlyPrice}/month`);
  });
  process.exit(1);
}

setCustomerTier(email, tier.toLowerCase())
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
