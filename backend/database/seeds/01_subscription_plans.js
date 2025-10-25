/**
 * Seed Subscription Plans
 * Populates the 5 pricing tiers according to DOD Section 9
 */

exports.seed = async function(knex) {
  // Clear existing data
  await knex('subscription_plans').del();

  // Insert 5 pricing tiers (final validated pricing)
  await knex('subscription_plans').insert([
    {
      name: 'trial',
      price: 0.00,
      max_competitors: 1,
      max_products: 50,
      trial_days: 14,
      updates_per_day: 2,
      features: JSON.stringify({
        channable: false,
        api_access: false,
        white_label: false,
        email_alerts: false,
        ai_chat: false,
        auto_pricing: false
      })
    },
    {
      name: 'starter',
      price: 49.00,
      max_competitors: 3,
      max_products: 150,
      trial_days: 0,
      updates_per_day: 2,
      features: JSON.stringify({
        channable: true,
        api_access: false,
        white_label: false,
        email_alerts: true,
        ai_chat: false,
        auto_pricing: false
      })
    },
    {
      name: 'professional',
      price: 99.00,
      max_competitors: 5,
      max_products: 1000,
      trial_days: 0,
      updates_per_day: 6,
      features: JSON.stringify({
        channable: true,
        api_access: true,
        white_label: false,
        email_alerts: true,
        ai_chat: true,
        auto_pricing: false
      })
    },
    {
      name: 'enterprise',
      price: 249.00,
      max_competitors: 999, // Unlimited (use high number instead of NULL)
      max_products: 5000,
      trial_days: 0,
      updates_per_day: 12,
      features: JSON.stringify({
        channable: true,
        api_access: true,
        white_label: false,
        email_alerts: true,
        ai_chat: true,
        auto_pricing: true,
        custom_ml: true,
        priority_support: true
      })
    },
    {
      name: 'scale',
      price: 599.00,
      max_competitors: 999, // Unlimited (use high number instead of NULL)
      max_products: null, // Unlimited
      trial_days: 0,
      updates_per_day: 24, // Real-time
      features: JSON.stringify({
        channable: true,
        api_access: true,
        white_label: true,
        email_alerts: true,
        ai_chat: true,
        auto_pricing: true,
        custom_ml: true,
        priority_support: true,
        dedicated_manager: true
      })
    }
  ]);
};
