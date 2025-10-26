const app = require('./app');

const PORT = process.env.PORT || 3000;

let server;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log('🐘 PriceElephant Backend - Port ' + PORT);
    console.log('Sprint 0: Foundation ✅');
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
