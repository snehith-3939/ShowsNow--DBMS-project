require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: 'localhost',
  database: 'bookmyshow',
  password: process.env.DB_PASSWORD,
  port: 5432
});

pool.query("UPDATE users SET role = 'admin' WHERE email IN ('mc240041012@iiti.ac.in', 'test_1776901034578@example.com')")
  .then(() => { console.log('✅ Admin accounts ready.'); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });
