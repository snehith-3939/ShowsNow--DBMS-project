require('dotenv').config();
const { query } = require('./db');
query("SELECT column_name FROM information_schema.columns WHERE table_name='movies'")
  .then(r => { console.log(r.rows.map(x => x.column_name)); process.exit(0); });
