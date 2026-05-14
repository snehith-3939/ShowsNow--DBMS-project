const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'bookmyshow',
  password: 'Blackfan!!8',
  port: 5432,
});

async function test() {
  try {
    const prompt = "Book me 2 tickets for an action movie in Mumbai on 25th april at 6 PM with Coke";
    const p = prompt.toLowerCase();
    
    let quantity = 2;
    const numMatch = p.match(/\b(\d+)\b/);
    if (numMatch) quantity = parseInt(numMatch[1]);
    
    let city = 'Mumbai';
    const cities = ['mumbai', 'delhi', 'bangalore', 'chennai', 'hyderabad', 'pune', 'kolkata', 'chandigarh'];
    for (const c of cities) {
      if (p.includes(c)) { city = c; break; }
    }
    
    let genre = '';
    const genres = ['action', 'comedy', 'drama', 'sci-fi', 'thriller', 'horror', 'romance', 'adventure', 'fantasy'];
    for (const g of genres) {
      if (p.includes(g)) { genre = g; break; }
    }
    
    let time = null;
    const timeMatch = p.match(/(\d+)(?::\d+)?\s*(am|pm)/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const ampm = timeMatch[2];
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      time = `${hour.toString().padStart(2, '0')}:00`;
    }
    
    let snackName = null;
    const snacks = ['popcorn', 'coke', 'nachos', 'samosa', 'pepsi'];
    for (const s of snacks) {
      if (p.includes(s)) { snackName = s; break; }
    }

    const params = [`%${city}%`, `%${genre}%`];
    let sql = `
      SELECT 
        s.show_id, 
        s.show_time, 
        s.base_price, 
        m.title, 
        c.name as cinema_name, 
        sc.name as screen_name,
        sc.screen_id
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE c.city ILIKE $1
        AND s.show_time >= NOW()
    `;

    sql += ` ORDER BY `;
    let orderClauses = [];
    if (genre) {
      orderClauses.push(`(CASE WHEN m.genre ILIKE $2 THEN 0 ELSE 1 END) ASC`);
    }
    if (time) {
      params.push(time); // $3
      orderClauses.push(`ABS(EXTRACT(EPOCH FROM s.show_time::time) - EXTRACT(EPOCH FROM $3::time)) ASC`);
    }
    orderClauses.push(`m.vote_average DESC`);
    
    sql += orderClauses.join(', ') + ` LIMIT 1`;
    
    console.log("SQL:", sql);
    console.log("PARAMS:", params);

    const showRes = await pool.query(sql, params);
    console.log("ROWS:", showRes.rows.length);
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    pool.end();
  }
}

test();
