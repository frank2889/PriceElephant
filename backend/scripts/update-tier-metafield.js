const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { shopifyApi } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers'],
  hostName: 'localhost',
  apiVersion: '2024-10',
  isEmbeddedApp: false,
});

const session = {
  shop: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
};

async function updateTierMetafield() {
  try {
    const client = new shopify.clients.Graphql({ session });
    
    console.log('🔄 Updating tier metafield with validations...\n');
    
    // Delete old tier metafield
    console.log('🗑️  Deleting old tier metafield...');
    const deleteQuery = `
      mutation MetafieldDefinitionDelete($id: ID!) {
        metafieldDefinitionDelete(id: $id) {
          deletedDefinitionId
          userErrors { field message }
        }
      }
    `;
    
    const deleteResult = await client.request(deleteQuery, {
      variables: { id: 'gid://shopify/MetafieldDefinition/136639086808' }
    });
    
    if (deleteResult.data.metafieldDefinitionDelete.userErrors.length > 0) {
      console.log('   ❌ Delete errors:', deleteResult.data.metafieldDefinitionDelete.userErrors);
    } else {
      console.log('   ✅ Deleted:', deleteResult.data.metafieldDefinitionDelete.deletedDefinitionId);
    }
    
    // Create new with validations
    console.log('\n📝 Creating new tier metafield with validations...');
    const createQuery = `
      mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
            validations {
              name
              value
            }
          }
          userErrors { field message }
        }
      }
    `;
    
    const createResult = await client.request(createQuery, {
      variables: {
        definition: {
          name: 'PriceElephant Tier',
          namespace: 'priceelephant',
          key: 'tier',
          description: 'Subscription tier (trial/starter/professional/enterprise)',
          type: 'single_line_text_field',
          ownerType: 'CUSTOMER',
          validations: [{
            name: 'choices',
            value: JSON.stringify(['trial', 'starter', 'professional', 'enterprise'])
          }]
        }
      }
    });
    
    if (createResult.data.metafieldDefinitionCreate.userErrors.length > 0) {
      console.log('   ❌ Create errors:', createResult.data.metafieldDefinitionCreate.userErrors);
    } else {
      console.log('   ✅ Created:', createResult.data.metafieldDefinitionCreate.createdDefinition.name);
      console.log('   ID:', createResult.data.metafieldDefinitionCreate.createdDefinition.id);
      console.log('   Validations:', createResult.data.metafieldDefinitionCreate.createdDefinition.validations);
    }
    
    console.log('\n✅ Tier metafield updated with dropdown choices!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateTierMetafield();
