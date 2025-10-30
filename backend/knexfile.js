const defaultUser = process.env.PGUSER || process.env.USER || 'postgres';

module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || {
      host: 'localhost',
      port: 5432,
      database: 'priceelephant_dev',
      user: defaultUser
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  },

  test: {
    client: 'postgresql',
    connection: process.env.TEST_DATABASE_URL || {
      host: process.env.TEST_DATABASE_HOST || 'localhost',
      port: parseInt(process.env.TEST_DATABASE_PORT || '5432', 10),
      database: process.env.TEST_DATABASE_NAME || 'priceelephant_test',
      user: process.env.TEST_DATABASE_USER || defaultUser
    },
    pool: {
      min: 1,
      max: 5
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  },

  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN) || 5,
      max: parseInt(process.env.DATABASE_POOL_MAX) || 20
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    }
  }
};
