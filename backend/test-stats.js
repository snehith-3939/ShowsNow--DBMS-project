const jwt = require('jsonwebtoken');
require('dotenv').config();
const token = jwt.sign({ user_id: '11111111-1111-1111-1111-111111111111', role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret_change_me');

fetch('http://localhost:5000/api/admin/stats', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
