const { Pool } = require('pg');
require('dotenv').config();

// Assuming default PostgreSQL credentials for local development
// Users can override these in a .env file
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'bookmyshow',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

// A wrapper to execute queries easily
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
};

// Export pool for transactions
module.exports = {
  query,
  pool,
};
