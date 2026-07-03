require('dotenv').config();
const { query } = require('./db');

async function debugAI() {
  const city = 'Mumbai';
  const movieTitle = 'Devil Wears Prada 2';
  const params = [`%${city}%`];
  let sql = `
    SELECT 
      s.show_id, s.show_time, s.base_price, s.is_surge_active,
      m.title, m.poster_url, c.name as cinema_name, 
      sc.name as screen_name, sc.screen_id
    FROM shows s
    JOIN movies m ON s.movie_id = m.movie_id
    JOIN screens sc ON s.screen_id = sc.screen_id
    JOIN cinemas c ON sc.cinema_id = c.cinema_id
    WHERE c.city ILIKE $1
      AND s.show_time >= (NOW() - INTERVAL '30 minutes')
  `;

  if (movieTitle) {
    sql += ` AND m.title ILIKE $2`;
    params.push(`%${movieTitle}%`);
  }

  sql += ` ORDER BY m.rating DESC LIMIT 1`;

  console.log('--- Step 1: Finding Show ---');
  console.log('SQL:', sql);
  console.log('Params:', params);

  try {
    const showRes = await query(sql, params);
    if (showRes.rows.length === 0) {
      console.log('❌ No shows found.');
      return;
    }
    const bestShow = showRes.rows[0];
    console.log('✅ Show found:', bestShow.title, 'at', bestShow.cinema_name);

    console.log('\n--- Step 2: Finding Seats ---');
    const quantity = 2;
    const seatSql = `
      SELECT seat_id, row_no, seat_no, seat_type, price_multiplier 
      FROM seats 
      WHERE screen_id = $1 
      AND seat_id NOT IN (
        SELECT t.seat_id 
        FROM tickets t
        JOIN bookings b ON t.booking_id = b.booking_id
        WHERE t.show_id = $2 AND b.status = 'Confirmed'
      )
      ORDER BY 
        CASE WHEN seat_type = 'VIP' THEN 1 WHEN seat_type = 'Premium' THEN 2 ELSE 3 END ASC,
        row_no, seat_no
      LIMIT $3
    `;
    console.log('Seat Params:', [bestShow.screen_id, bestShow.show_id, quantity]);
    const seatRes = await query(seatSql, [bestShow.screen_id, bestShow.show_id, quantity]);
    console.log('✅ Seats found:', seatRes.rows.length);

  } catch (err) {
    console.error('❌ SQL ERROR:', err.message);
  }
}

debugAI();
