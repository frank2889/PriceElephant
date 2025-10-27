/**
 * Check database schema
 */

require('dotenv').config();
const db = require('../config/database');

async function checkSchema() {
  try {
    const columns = await db('products').columnInfo();
    console.log('Products table columns:');
    Object.keys(columns).forEach(col => {
      console.log(`  - ${col}: ${columns[col].type}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
