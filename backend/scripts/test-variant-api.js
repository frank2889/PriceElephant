/**
 * Test manual variant creation API
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const CUSTOMER_ID = 1; // Replace with actual customer ID

async function testVariantAPI() {
  console.log('🧪 Testing Manual Variant Creation API\n');

  try {
    // Step 1: Get a product to work with
    console.log('1️⃣ Fetching products...');
    const productsResponse = await axios.get(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}`
    );
    
    if (!productsResponse.data.products || productsResponse.data.products.length === 0) {
      console.log('❌ No products found. Please import some products first.');
      return;
    }

    const testProduct = productsResponse.data.products[0];
    console.log(`✅ Found product: ${testProduct.product_name} (ID: ${testProduct.id})\n`);

    // Step 2: Convert to parent product
    console.log('2️⃣ Converting product to parent with first variant...');
    const convertResponse = await axios.post(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/convert-to-parent`,
      {
        option1_name: 'Kleur',
        option1_value: 'Blauw'
      }
    );
    console.log(`✅ ${convertResponse.data.message}`);
    console.log(`   Option: ${convertResponse.data.product.option1_name} = ${convertResponse.data.product.option1_value}\n`);

    // Step 3: Add variant 1 - Different color
    console.log('3️⃣ Adding variant: Rood...');
    const variant1Response = await axios.post(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants`,
      {
        product_name: testProduct.product_name,
        product_sku: `${testProduct.product_sku}-RED`,
        own_price: testProduct.own_price + 5,
        option1_name: 'Kleur',
        option1_value: 'Rood'
      }
    );
    console.log(`✅ ${variant1Response.data.message}`);
    console.log(`   Variant ID: ${variant1Response.data.variant.id}`);
    console.log(`   Variant Title: ${variant1Response.data.variant.variant_title}\n`);

    // Step 4: Add variant 2 - Different color
    console.log('4️⃣ Adding variant: Groen...');
    const variant2Response = await axios.post(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants`,
      {
        product_name: testProduct.product_name,
        product_sku: `${testProduct.product_sku}-GREEN`,
        own_price: testProduct.own_price + 10,
        option1_name: 'Kleur',
        option1_value: 'Groen'
      }
    );
    console.log(`✅ ${variant2Response.data.message}`);
    console.log(`   Variant ID: ${variant2Response.data.variant.id}`);
    console.log(`   Variant Title: ${variant2Response.data.variant.variant_title}\n`);

    // Step 5: Get all variants
    console.log('5️⃣ Fetching all variants...');
    const variantsResponse = await axios.get(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants`
    );
    console.log(`✅ Found ${variantsResponse.data.total_variants} variants`);
    console.log(`   Parent: ${variantsResponse.data.parent.product_name}`);
    console.log(`   Options: ${JSON.stringify(variantsResponse.data.options, null, 2)}`);
    console.log(`\n   Variants:`);
    variantsResponse.data.variants.forEach((v, i) => {
      console.log(`     ${i + 1}. ${v.variant_title} - €${v.own_price} (Position: ${v.variant_position})`);
    });
    console.log('');

    // Step 6: Update a variant
    console.log('6️⃣ Updating variant price...');
    const updateResponse = await axios.put(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants/${variant1Response.data.variant.id}`,
      {
        own_price: testProduct.own_price + 15
      }
    );
    console.log(`✅ ${updateResponse.data.message}`);
    console.log(`   New price: €${updateResponse.data.variant.own_price}\n`);

    // Step 7: Test multi-option variant
    console.log('7️⃣ Adding variant with multiple options (Kleur + Maat)...');
    const variant3Response = await axios.post(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants`,
      {
        product_name: testProduct.product_name,
        product_sku: `${testProduct.product_sku}-YELLOW-L`,
        own_price: testProduct.own_price + 20,
        option1_name: 'Kleur',
        option1_value: 'Geel',
        option2_name: 'Maat',
        option2_value: 'Large'
      }
    );
    console.log(`✅ ${variant3Response.data.message}`);
    console.log(`   Variant Title: ${variant3Response.data.variant.variant_title}`);
    console.log(`   Options: ${variant3Response.data.variant.option1_value} / ${variant3Response.data.variant.option2_value}\n`);

    // Step 8: Test duplicate detection
    console.log('8️⃣ Testing duplicate variant detection...');
    try {
      await axios.post(
        `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants`,
        {
          product_name: testProduct.product_name,
          option1_name: 'Kleur',
          option1_value: 'Rood' // Duplicate!
        }
      );
      console.log('❌ Should have detected duplicate!');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log(`✅ Duplicate detected correctly: ${error.response.data.error}\n`);
      } else {
        throw error;
      }
    }

    // Step 9: Delete a variant
    console.log('9️⃣ Deleting a variant...');
    const deleteResponse = await axios.delete(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants/${variant2Response.data.variant.id}`
    );
    console.log(`✅ ${deleteResponse.data.message}\n`);

    // Step 10: Final variant list
    console.log('🔟 Final variant list...');
    const finalResponse = await axios.get(
      `${BASE_URL}/api/v1/products/${CUSTOMER_ID}/${testProduct.id}/variants`
    );
    console.log(`✅ Total variants: ${finalResponse.data.total_variants}`);
    finalResponse.data.variants.forEach((v, i) => {
      console.log(`   ${i + 1}. ${v.variant_title} - €${v.own_price}`);
    });

    console.log('\n✅ All variant API tests passed! 🎉');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run tests
testVariantAPI();
