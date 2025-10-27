/**
 * Run production migration via direct database connection
 * Usage: DATABASE_URL="postgresql://..." node scripts/run-production-migration.js
 */

require('dotenv').config();

// Override knex config to use production DATABASE_URL
const knex = require('knex')({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || process.env.PRODUCTION_DATABASE_URL,
  pool: {
    min: 1,
    max: 5
  },
  migrations: {
    directory: './database/migrations',
    tableName: 'knex_migrations'
  },
  ssl: process.env.DATABASE_SSL !== 'false' ? {
    rejectUnauthorized: false
  } : false
});

async function runMigration() {
  console.log('🔄 Running production database migration...\n');

  try {
    // Check current migration status
    console.log('📋 Current migration status:');
    const [completed, pending] = await knex.migrate.list();
    console.log(`   Completed: ${completed.length} migrations`);
    console.log(`   Pending: ${pending.length} migrations\n`);

    if (pending.length === 0) {
      console.log('✅ Database is already up to date!');
      
      // Show variant columns
      console.log('\n📊 Checking variant columns in products table:');
      const columns = await knex('products').columnInfo();
      const variantColumns = Object.keys(columns).filter(c => 
        c.includes('variant') || c.includes('option') || c.includes('parent_product')
      );
      
      if (variantColumns.length > 0) {
        console.log('   Variant columns found:');
        variantColumns.forEach(col => {
          console.log(`   ✅ ${col} (${columns[col].type})`);
        });
      } else {
        console.log('   ❌ No variant columns found!');
      }
      
      await knex.destroy();
      process.exit(0);
    }

    // Run pending migrations
    console.log('🚀 Running migrations...');
    const [batch, migrations] = await knex.migrate.latest();
    
    console.log(`\n✅ Migration successful!`);
    console.log(`   Batch: ${batch}`);
    console.log(`   Migrations run:`);
    migrations.forEach(m => console.log(`   - ${m}`));

    // Verify variant columns
    console.log('\n📊 Verifying variant columns in products table:');
    const columns = await knex('products').columnInfo();
    const variantColumns = [
      'parent_product_id',
      'variant_title', 
      'variant_position',
      'option1_name',
      'option1_value',
      'option2_name',
      'option2_value',
      'option3_name',
      'option3_value',
      'is_parent_product'
    ];

    let allPresent = true;
    variantColumns.forEach(col => {
      if (columns[col]) {
        console.log(`   ✅ ${col} (${columns[col].type})`);
      } else {
        console.log(`   ❌ ${col} - MISSING!`);
        allPresent = false;
      }
    });

    if (allPresent) {
      console.log('\n🎉 All variant columns present!');
    } else {
      console.log('\n⚠️  Some variant columns are missing!');
    }

    await knex.destroy();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    await knex.destroy();
    process.exit(1);
  }
}

// Verify DATABASE_URL is set
if (!process.env.DATABASE_URL && !process.env.PRODUCTION_DATABASE_URL) {
  console.error('❌ DATABASE_URL or PRODUCTION_DATABASE_URL environment variable is required!');
  console.error('\nUsage:');
  console.error('  DATABASE_URL="postgresql://user:pass@host:port/db" node scripts/run-production-migration.js');
  console.error('  or');
  console.error('  PRODUCTION_DATABASE_URL="postgresql://..." node scripts/run-production-migration.js');
  process.exit(1);
}

console.log(`📡 Connecting to database: ${(process.env.DATABASE_URL || process.env.PRODUCTION_DATABASE_URL).split('@')[1]}\n`);

runMigration();
