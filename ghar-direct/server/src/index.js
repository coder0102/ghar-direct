'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { loadConfig, validateConfig } = require('./config');
const { migrate } = require('./schema');
const { createStorage } = require('./storage');
const { getIdProvider } = require('./idverify');
const { createApp } = require('./app');

async function main() {
  const cfg = loadConfig();
  const problems = validateConfig(cfg);
  if (problems.length) {
    console.error('Cannot start. Fix these first:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  if (cfg.idProvider === 'stub') {
    console.warn('WARNING: ID_PROVIDER=stub approves everyone. Use it for testing only.');
  }
  if (cfg.storage === 'local') {
    console.warn('WARNING: STORAGE=local keeps photos on this server\'s disk. Most hosts erase it on every deploy. Use STORAGE=s3 for a real launch.');
  }

  const db = new Pool({
    connectionString: cfg.databaseUrl,
    ssl: cfg.databaseSsl ? { rejectUnauthorized: false } : undefined,
  });
  await migrate(db);

  const app = createApp({ db, cfg, storage: createStorage(cfg), idProvider: getIdProvider(cfg.idProvider) });
  const server = app.listen(cfg.port, () => console.log(`Ghar Direct server listening on port ${cfg.port}`));

  const stop = () => server.close(() => db.end().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
