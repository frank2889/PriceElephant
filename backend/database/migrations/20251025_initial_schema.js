/**
 * Database Migration: Initial Schema
 * Creates all 15 core tables for PriceElephant
 */

exports.up = async function(knex) {
  // 1. Subscription Plans
  await knex.schema.createTable('subscription_plans', (table) => {
    table.increments('id').primary();
    table.string('name', 50).notNullable().unique(); // 'trial', 'starter', 'professional', 'enterprise', 'scale'
    table.decimal('price', 10, 2).notNullable();
    table.integer('max_competitors').notNullable();
    table.integer('max_products'); // NULL = unlimited
    table.integer('trial_days').defaultTo(0);
    table.jsonb('features'); // {"api_access": true, "white_label": true, "channable": true}
    table.integer('updates_per_day').defaultTo(2); // 2x, 6x, 12x, or 24x (real-time)
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 2. Customer Subscriptions
  await knex.schema.createTable('subscriptions', (table) => {
    table.increments('id').primary();
    table.bigInteger('shopify_customer_id').notNullable();
    table.string('stripe_customer_id', 255);
    table.string('stripe_subscription_id', 255);
    table.integer('plan_id').references('id').inTable('subscription_plans');
    table.string('status', 50).defaultTo('trial'); // 'trial', 'active', 'cancelled', 'past_due'
    table.timestamp('trial_ends_at');
    table.timestamp('current_period_end');
    table.timestamp('cancelled_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('shopify_customer_id');
    table.index('stripe_subscription_id');
  });

  // 3. Product-Customer Relations (many-to-many)
  await knex.schema.createTable('product_customers', (table) => {
    table.increments('id').primary();
    table.bigInteger('shopify_product_id').notNullable();
    table.bigInteger('shopify_customer_id').notNullable();
    table.decimal('customer_price', 10, 2); // Customer-specific price
    table.timestamp('added_at').defaultTo(knex.fn.now());
    
    table.unique(['shopify_product_id', 'shopify_customer_id']);
    table.index('shopify_product_id');
    table.index('shopify_customer_id');
  });

  // 4. Manual Competitor URLs
  await knex.schema.createTable('manual_competitor_urls', (table) => {
    table.increments('id').primary();
    table.bigInteger('shopify_product_id').notNullable();
    table.bigInteger('shopify_customer_id').notNullable();
    table.string('retailer', 100).notNullable(); // 'bol.com', 'coolblue', etc.
    table.text('competitor_url').notNullable();
    table.boolean('active').defaultTo(true);
    table.timestamp('added_at').defaultTo(knex.fn.now());
    
    table.unique(['shopify_product_id', 'shopify_customer_id', 'retailer']);
    table.index('shopify_product_id');
    table.index('shopify_customer_id');
  });

  // 5. Scrape Jobs
  await knex.schema.createTable('scrape_jobs', (table) => {
    table.increments('id').primary();
    table.bigInteger('shopify_customer_id');
    table.bigInteger('shopify_product_id');
    table.string('product_ean', 20);
    table.string('retailer_url', 500);
    table.string('status', 50); // 'pending', 'processing', 'completed', 'failed'
    table.string('retailer', 100); // 'bol.com', 'coolblue', 'amazon.nl', 'mediamarkt'
    table.integer('retry_count').defaultTo(0);
    table.text('error_message');
    table.timestamp('scraped_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('status');
    table.index('shopify_customer_id');
    table.index('shopify_product_id');
  });

  // 6. Price Snapshots (partitioned table - no PRIMARY KEY on id for partitioning)
  await knex.raw(`
    CREATE TABLE price_snapshots (
      id BIGSERIAL NOT NULL,
      shopify_customer_id BIGINT,
      shopify_product_id BIGINT,
      product_ean VARCHAR(20),
      retailer VARCHAR(100),
      price DECIMAL(10,2),
      in_stock BOOLEAN DEFAULT true,
      scraped_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (id, scraped_at)
    ) PARTITION BY RANGE (scraped_at)
  `);

  // Create initial partitions (current month + next 3 months)
  const currentDate = new Date();
  for (let i = 0; i < 4; i++) {
    const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
    const nextPartitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i + 1, 1);
    const partitionName = `price_snapshots_${partitionDate.getFullYear()}_${String(partitionDate.getMonth() + 1).padStart(2, '0')}`;
    
    await knex.raw(`
      CREATE TABLE ${partitionName} PARTITION OF price_snapshots
      FOR VALUES FROM ('${partitionDate.toISOString().split('T')[0]}') TO ('${nextPartitionDate.toISOString().split('T')[0]}')
    `);
  }

  // 7. Email Notifications
  await knex.schema.createTable('email_notifications', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('shopify_customer_id').notNullable();
    table.string('email_type', 50); // 'welcome', 'price_alert', 'weekly_report', 'trial_ending'
    table.string('klaviyo_message_id', 255);
    table.jsonb('metadata'); // Product info, price change details, etc.
    table.timestamp('sent_at').defaultTo(knex.fn.now());
    table.timestamp('opened_at');
    table.timestamp('clicked_at');
    
    table.index(['shopify_customer_id', 'sent_at']);
  });

  // 8. Price Alerts
  await knex.schema.createTable('price_alerts', (table) => {
    table.increments('id').primary();
    table.bigInteger('shopify_customer_id').notNullable();
    table.bigInteger('shopify_product_id').notNullable();
    table.string('alert_type', 50); // 'below_threshold', 'above_threshold', 'any_change', 'stock_change'
    table.decimal('threshold_price', 10, 2);
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('shopify_customer_id');
    table.index('shopify_product_id');
  });

  // 9. Channable Integrations
  await knex.schema.createTable('channable_integrations', (table) => {
    table.increments('id').primary();
    table.bigInteger('shopify_customer_id').notNullable().unique();
    table.string('channable_company_id', 255);
    table.string('channable_project_id', 255);
    table.text('feed_url'); // Public feed URL
    table.string('api_token', 500); // Encrypted
    table.string('feed_format', 20).defaultTo('xml'); // 'xml', 'csv'
    table.timestamp('last_sync_at');
    table.integer('products_synced').defaultTo(0);
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('shopify_customer_id');
  });

  // 10. Retailer Configurations
  await knex.schema.createTable('retailer_configs', (table) => {
    table.increments('id').primary();
    table.string('retailer_name', 100).notNullable().unique();
    table.jsonb('playwright_config'); // Selectors, wait times, etc.
    table.jsonb('proxy_config');
    table.boolean('active').defaultTo(true);
    table.integer('success_rate').defaultTo(0); // Percentage
    table.timestamp('last_updated').defaultTo(knex.fn.now());
  });

  // 11. API Keys (for Professional/Enterprise tiers)
  await knex.schema.createTable('api_keys', (table) => {
    table.increments('id').primary();
    table.bigInteger('shopify_customer_id').notNullable();
    table.string('api_key', 64).notNullable().unique();
    table.string('name', 100); // User-defined label
    table.timestamp('last_used_at');
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('shopify_customer_id');
    table.index('api_key');
  });

  // 12. Audit Logs
  await knex.schema.createTable('audit_logs', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('shopify_customer_id');
    table.string('action', 100); // 'product_added', 'subscription_upgraded', 'alert_created'
    table.jsonb('details');
    table.string('ip_address', 45);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['shopify_customer_id', 'created_at']);
  });

  // 13. Feature Flags
  await knex.schema.createTable('feature_flags', (table) => {
    table.increments('id').primary();
    table.string('flag_name', 100).notNullable().unique();
    table.boolean('enabled').defaultTo(false);
    table.jsonb('rollout_percentage'); // Gradual rollout config
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 14. AI Predictions (for Sprint 10+)
  await knex.schema.createTable('ai_predictions', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('shopify_product_id').notNullable();
    table.string('prediction_type', 50); // 'optimal_price', 'demand_forecast', 'competitor_move'
    table.decimal('predicted_value', 10, 2);
    table.integer('confidence_score'); // 0-100
    table.jsonb('model_metadata');
    table.timestamp('valid_until');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('shopify_product_id');
  });

  // 15. System Health Metrics
  await knex.schema.createTable('system_metrics', (table) => {
    table.bigIncrements('id').primary();
    table.string('metric_name', 100); // 'scraper_success_rate', 'api_response_time', 'active_users'
    table.decimal('metric_value', 10, 2);
    table.timestamp('recorded_at').defaultTo(knex.fn.now());
    
    table.index(['metric_name', 'recorded_at']);
  });
};

exports.down = async function(knex) {
  // Drop tables in reverse order (respecting foreign keys)
  await knex.schema.dropTableIfExists('system_metrics');
  await knex.schema.dropTableIfExists('ai_predictions');
  await knex.schema.dropTableIfExists('feature_flags');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('retailer_configs');
  await knex.schema.dropTableIfExists('channable_integrations');
  await knex.schema.dropTableIfExists('price_alerts');
  await knex.schema.dropTableIfExists('email_notifications');
  await knex.raw('DROP TABLE IF EXISTS price_snapshots CASCADE');
  await knex.schema.dropTableIfExists('scrape_jobs');
  await knex.schema.dropTableIfExists('manual_competitor_urls');
  await knex.schema.dropTableIfExists('product_customers');
  await knex.schema.dropTableIfExists('subscriptions');
  await knex.schema.dropTableIfExists('subscription_plans');
};
