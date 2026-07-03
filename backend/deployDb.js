require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pool } = require('./db');

const databaseDir = path.join(__dirname, '../database');

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  return result.rows[0].exists;
}

async function runSqlFile(client, fileName) {
  const sql = fs.readFileSync(path.join(databaseDir, fileName), 'utf8');
  console.log(`Running ${fileName}...`);
  await client.query(sql);
}

async function runMigrations(client) {
  const migrationsDir = path.join(databaseDir, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    await runSqlFile(client, path.join('migrations', file));
  }
}

async function deployDb() {
  const client = await pool.connect();
  let seededWithMovies = false;

  try {
    const hasUsersTable = await tableExists(client, 'users');
    const hasMoviesTable = await tableExists(client, 'movies');

    if (!hasUsersTable) {
      await runSqlFile(client, 'schema.sql');
      await runSqlFile(client, 'functions.sql');
      await runSqlFile(client, 'seed.sql');
      seededWithMovies = true;
    } else {
      await runSqlFile(client, 'functions.sql');
      if (hasMoviesTable) {
        await runMigrations(client);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (seededWithMovies) {
    console.log('Running movie/show seeder...');
    execFileSync(process.execPath, [path.join(__dirname, 'seedData.js')], {
      stdio: 'inherit',
      env: process.env,
    });
  }

  console.log('Database deploy step complete.');
}

deployDb().catch(error => {
  console.error('Database deploy failed:', error);
  process.exit(1);
});
