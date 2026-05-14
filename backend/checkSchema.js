require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: 'localhost',
  database: 'bookmyshow',
  password: process.env.DB_PASSWORD,
  port: 5432
});
p.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position")
  .then(r => { console.log('users columns:', r.rows.map(x => x.column_name).join(', ')); p.end(); })
  .catch(e => { console.error(e.message); p.end(); });
