const app = require('./app');
const knex = require('./config/database');

const PORT = process.env.PORT || 3000;

let server;

if (process.env.NODE_ENV !== 'test') {
  // Run migrations before starting server
  console.log('🔄 Running database migrations...');
  knex.migrate.latest()
    .then(() => {
      console.log('✅ Database migrations complete');
      
      server = app.listen(PORT, () => {
        const env = process.env.NODE_ENV || 'development';
        console.log(`🐘 PriceElephant Backend - Port ${PORT} (${env})`);
        console.log('Sprint 0: Foundation ✅');
      });
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('📭 SIGTERM received, closing server gracefully...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('📭 SIGINT received, closing server gracefully...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}

module.exports = app;
