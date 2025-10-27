/**
 * Setup Hobo as Enterprise Customer in Shopify
 * Creates customer with Enterprise tier metafields
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

async function setupHoboCustomer() {
  try {
    console.log('🐘 Setting up Hobo as Enterprise customer\n');
    
    const client = new shopify.clients.Graphql({ session });
    
    // Check if customer exists
    console.log('🔍 Checking if customer exists...');
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
      variables: { query: 'email:info@hobo.nl' }
    });
    
    let customerId;
    const existing = searchResult.data.customers.edges;
    
    if (existing.length > 0) {
      customerId = existing[0].node.id;
      console.log(`✅ Customer already exists: ${existing[0].node.email}`);
      console.log(`   ID: ${customerId}\n`);
    } else {
      // Create customer
      console.log('📝 Creating new customer...');
      const createQuery = `
        mutation CreateCustomer($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
              email
              firstName
              lastName
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      const createResult = await client.request(createQuery, {
        variables: {
          input: {
            email: 'info@hobo.nl',
            firstName: 'Hobo',
            lastName: 'NL',
            note: 'Enterprise customer - PriceElephant',
            tags: ['priceelephant', 'enterprise']
          }
        }
      });
      
      if (createResult.data.customerCreate.userErrors.length > 0) {
        throw new Error(createResult.data.customerCreate.userErrors.map(e => e.message).join(', '));
      }
      
      customerId = createResult.data.customerCreate.customer.id;
      console.log('✅ Customer created successfully');
      console.log(`   ID: ${customerId}\n`);
    }
    
    // Set Enterprise tier metafields
    console.log('🏢 Setting Enterprise tier metafields...');
    console.log('   • Product limit: Unlimited');
    console.log('   • Competitor limit: Unlimited');
    console.log('   • API access: Enabled');
    console.log('   • Monthly price: €249\n');
    
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
          id: customerId,
          metafields: [
            {
              namespace: 'priceelephant',
              key: 'tier',
              value: 'enterprise',
              type: 'single_line_text_field'
            },
            {
              namespace: 'priceelephant',
              key: 'product_limit',
              value: '0',
              type: 'number_integer'
            },
            {
              namespace: 'priceelephant',
              key: 'competitor_limit',
              value: '0',
              type: 'number_integer'
            },
            {
              namespace: 'priceelephant',
              key: 'api_access',
              value: 'true',
              type: 'boolean'
            },
            {
              namespace: 'priceelephant',
              key: 'monthly_price',
              value: '249',
              type: 'number_decimal'
            }
          ]
        }
      }
    });
    
    if (updateResult.data.customerUpdate.userErrors.length > 0) {
      throw new Error(updateResult.data.customerUpdate.userErrors.map(e => e.message).join(', '));
    }
    
    console.log('✅ Hobo configured as Enterprise customer!');
    console.log('\n📋 Metafields set:');
    const metafields = updateResult.data.customerUpdate.customer.metafields.edges;
    metafields.forEach(({ node }) => {
      console.log(`   ${node.key}: ${node.value}`);
    });
    
    console.log('\n🎉 Setup complete! Hobo is now your first Enterprise customer.\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

setupHoboCustomer()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
