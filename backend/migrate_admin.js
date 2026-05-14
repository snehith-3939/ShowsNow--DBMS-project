require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'bookmyshow',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

async function migrate() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'");
    console.log('✅ Migration done: Added role column to users table');
    
    // Promote the first user to admin for testing (or any specific email)
    // Adjust this email to yours if needed
    // await pool.query("UPDATE users SET role = 'admin' WHERE email = 'your@email.com'");
    
    pool.end();
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    pool.end();
  }
}

migrate();
