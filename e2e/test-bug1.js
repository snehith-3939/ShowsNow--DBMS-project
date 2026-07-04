const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '../backend/.env' });

async function run() {
  const token = jwt.sign({ user_id: '11111111-1111-1111-1111-111111111111', role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret_change_me');
  
  // 1. Get a show
  const showsRes = await fetch('http://localhost:5000/api/movies/shows?city=Mumbai');
  const data = await showsRes.json();
  const showId = data[0].shows[0].show_id;

  // 2. Hold seat
  console.log(`Holding a seat for show ${showId}...`);
  const holdRes = await fetch('http://localhost:5000/api/seat-holds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ show_id: showId, seat_ids: ['d0150d18-3dd0-4ff6-9818-7b98d1976077'] }) // Assuming this seat_id exists, we'll fetch seats first
  });
}
run();
