const app = require('./app');

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log('🐘 PriceElephant Backend - Port ' + PORT);
    console.log('Sprint 0: Foundation ✅');
  });
}

module.exports = app;
