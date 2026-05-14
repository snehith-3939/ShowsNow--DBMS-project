require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function resetDb() {
  const client = await pool.connect();
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
    const seedSql = fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8');

    console.log('Running schema.sql...');
    await client.query(schemaSql);
    
    console.log('Running seed.sql...');
    await client.query(seedSql);

    console.log('Database reset successful!');
  } catch (error) {
    console.error('Error resetting database:', error);
  } finally {
    client.release();
    pool.end();
  }
}

resetDb();
