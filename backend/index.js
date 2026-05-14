const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, pool } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// JWT Auth Middleware
// ---------------------------------------------------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) return res.status(401).json({ error: 'Access denied. Please log in.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token. Please log in again.' });
    req.user = user; // { user_id, name, email, role }
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
  });
};

// ---------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  try {
    // Check if email already exists
    const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, name, email, phone, role, loyalty_points, created_at',
      [name, email, password_hash, phone || null, 'user']
    );
    const user = result.rows[0];

    const token = jwt.sign(
      { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  try {
    const result = await query(
      'SELECT user_id, name, email, phone, loyalty_points, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account was created without a password. Please register again.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me — verify token, return current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT user_id, name, email, phone, city, loyalty_points, role, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch user.' });
  }
});

// ---------------------------------------------------------
// Admin Routes
// ---------------------------------------------------------

// Get Admin Stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const revenueRes = await query('SELECT SUM(total_amount) as total_revenue FROM bookings WHERE status = $1', ['Confirmed']);
    const bookingsRes = await query('SELECT COUNT(*) as total_bookings FROM bookings WHERE status = $1', ['Confirmed']);
    const moviesRes = await query('SELECT COUNT(*) as total_movies FROM movies');
    const usersRes = await query('SELECT COUNT(*) as total_users FROM users');

    res.json({
      totalRevenue: revenueRes.rows[0].total_revenue || 0,
      totalBookings: bookingsRes.rows[0].total_bookings,
      totalMovies: moviesRes.rows[0].total_movies,
      totalUsers: usersRes.rows[0].total_users
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// Add New Movie
app.post('/api/admin/movies', authenticateAdmin, async (req, res) => {
  const { title, genre, duration_mins, language, poster_url, banner_url, overview } = req.body;
  try {
    const result = await query(
      `INSERT INTO movies (title, genre, duration_mins, language, poster_url, banner_url, overview) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, genre, duration_mins, language, poster_url, banner_url, overview]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add movie' });
  }
});

// Add New Show
app.post('/api/admin/shows', authenticateAdmin, async (req, res) => {
  const { movie_id, screen_id, show_time, base_price } = req.body;
  try {
    // Basic validation: check if screen is busy at that time
    const check = await query('SELECT * FROM shows WHERE screen_id = $1 AND show_time = $2', [screen_id, show_time]);
    if (check.rows.length > 0) return res.status(409).json({ error: 'Screen is already occupied at this time' });

    const result = await query(
      `INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats) 
       VALUES ($1, $2, $3, $4, 50) RETURNING *`,
      [movie_id, screen_id, show_time, base_price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add show' });
  }
});

// Get All Bookings for Admin
app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
  try {
    const sql = `
      SELECT b.booking_id, b.total_amount, b.status, b.booking_time,
             u.name as user_name, u.email as user_email,
             m.title as movie_title,
             c.name as cinema_name
      FROM bookings b
      JOIN users u ON b.user_id = u.user_id
      JOIN shows s ON b.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      ORDER BY b.booking_time DESC
    `;
    const { rows } = await query(sql);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch all bookings' });
  }
});

// ---------------------------------------------------------
// Basic Endpoints
// ---------------------------------------------------------

// Get all movies (supports ?city= filter)
app.get('/api/movies', async (req, res) => {
  try {
    const city = req.query.city;
    let queryStr = 'SELECT * FROM movies';
    let params = [];

    if (city && city !== 'All') {
      // Find movies that have shows in the selected city
      queryStr = `
        SELECT DISTINCT m.* 
        FROM movies m
        JOIN shows s ON m.movie_id = s.movie_id
        JOIN screens sc ON s.screen_id = sc.screen_id
        JOIN cinemas c ON sc.cinema_id = c.cinema_id
        WHERE c.city ILIKE $1
      `;
      params = [city];
    }

    const { rows } = await query(queryStr, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single movie
app.get('/api/movies/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM movies WHERE movie_id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Movie not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all cinemas
app.get('/api/cinemas', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM cinemas');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all screens with cinema info
app.get('/api/screens', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.*, c.name as cinema_name 
      FROM screens s 
      JOIN cinemas c ON s.cinema_id = c.cinema_id
      ORDER BY c.name, s.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trending TV shows for Stream page
app.get('/api/stream', async (req, res) => {
  try {
    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB API Key missing' });

    const response = await fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}`);
    const data = await response.json();
    res.json(data.results || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stream data' });
  }
});

// Get shows for a movie (supports ?date= filter)
app.get('/api/shows/movie/:movie_id', async (req, res) => {
  try {
    const { movie_id } = req.params;
    const { date } = req.query; // expects YYYY-MM-DD

    let sql = `
      SELECT s.show_id, s.show_time, s.base_price, s.available_seats, s.is_surge_active,
             sc.name as screen_name, c.name as cinema_name, c.city, c.address, c.cinema_id
      FROM shows s
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.movie_id = $1
    `;
    const params = [movie_id];

    if (date) {
      sql += ` AND DATE(s.show_time) = $2`;
      params.push(date);
    } else {
      sql += ` AND DATE(s.show_time) >= CURRENT_DATE`;
    }

    sql += ` ORDER BY c.name, s.show_time`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single show details (for seat layout header)
app.get('/api/shows/:show_id', async (req, res) => {
  try {
    const sql = `
      SELECT s.show_id, s.show_time, s.base_price, s.is_surge_active, s.available_seats,
             m.title, m.poster_url, m.duration_mins, m.language,
             sc.name as screen_name, c.name as cinema_name, c.city, c.address
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.show_id = $1
    `;
    const { rows } = await query(sql, [req.params.show_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Show not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get seat layout and status for a show
app.get('/api/seats/:show_id', async (req, res) => {
  try {
    const showId = req.params.show_id;
    // Get all seats for the screen hosting the show
    const seatsSql = `
      SELECT s.seat_id, s.row_no, s.seat_no, s.seat_type, s.price_multiplier,
             (CASE WHEN t.ticket_id IS NOT NULL THEN true ELSE false END) as is_booked
      FROM seats s
      JOIN shows sh ON s.screen_id = sh.screen_id
      LEFT JOIN tickets t ON t.seat_id = s.seat_id 
           AND t.booking_id IN (SELECT booking_id FROM bookings WHERE show_id = $1 AND status = 'Confirmed')
      WHERE sh.show_id = $1
      ORDER BY s.row_no, s.seat_no
    `;
    const { rows } = await query(seatsSql, [showId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all snacks
app.get('/api/snacks', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM snacks');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// Autonomous Booking System Endpoint
// ---------------------------------------------------------
app.post('/api/autonomous-booking', async (req, res) => {
  // Expected body:
  // { city: 'Mumbai', startTime: '2023-10-27T18:00:00', endTime: '2023-10-27T23:00:00', genre: 'Sci-Fi' }
  const { city, startTime, endTime, genre } = req.body;

  try {
    // A complex query to find best matching shows
    const sql = `
      SELECT 
        s.show_id, m.title, m.genre, m.poster_url, m.banner_url, c.name AS cinema_name, c.city,
        sc.name AS screen_name, s.show_time, s.base_price, s.available_seats, s.is_surge_active
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE 
        c.city ILIKE $1
        AND s.show_time >= $2::timestamp
        AND s.show_time <= $3::timestamp
        AND ($4::varchar IS NULL OR m.genre ILIKE $4)
        AND s.available_seats > 0
      ORDER BY s.is_surge_active ASC, s.show_time ASC
      LIMIT 3;
    `;

    // Fallback times if not provided properly (just for demo)
    const st = startTime || new Date().toISOString();
    const et = endTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week

    const { rows } = await query(sql, [city, st, et, genre || null]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// Booking & Transaction Management
// ---------------------------------------------------------
app.post('/api/bookings', authenticateToken, async (req, res) => {
  const { show_id, seat_ids, snack_ids } = req.body;
  const user_id = req.user.user_id; // Always use the authenticated user's id from JWT

  // We use a transaction to ensure concurrency safety
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock the show row to prevent concurrent bookings from messing up available_seats
    const showRes = await client.query(
      'SELECT base_price, is_surge_active, available_seats FROM shows WHERE show_id = $1 FOR UPDATE',
      [show_id]
    );

    if (showRes.rows.length === 0) throw new Error('Show not found');
    const show = showRes.rows[0];

    if (show.available_seats < seat_ids.length) {
      throw new Error('Not enough available seats. Please join the waitlist.');
    }

    // 2. Check Loyalty Discount
    let discountMultiplier = 1.0;
    const loyaltyRes = await client.query(
      "SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND booking_time > NOW() - INTERVAL '30 days'",
      [user_id]
    );
    if (parseInt(loyaltyRes.rows[0].count) > 5) {
      discountMultiplier = 0.9; // 10% discount
    }

    // 3. Calculate Ticket Price (Surge Pricing logic)
    let surgeMultiplier = show.is_surge_active ? 1.2 : 1.0;
    let totalAmount = 0;
    let finalTickets = [];

    // Lock the specific seats being booked to prevent double-booking
    // Ensure they aren't already booked for this show
    for (let seat_id of seat_ids) {
      // First verify seat exists and get its multiplier
      const seatRes = await client.query('SELECT price_multiplier FROM seats WHERE seat_id = $1', [seat_id]);
      if (seatRes.rows.length === 0) throw new Error('Invalid seat');
      const seatTypeMultiplier = parseFloat(seatRes.rows[0].price_multiplier);

      // Check if already booked
      const isBooked = await client.query(`
         SELECT t.ticket_id FROM tickets t
         JOIN bookings b ON t.booking_id = b.booking_id
         WHERE b.show_id = $1 AND b.status = 'Confirmed' AND t.seat_id = $2
       `, [show_id, seat_id]);

      if (isBooked.rows.length > 0) throw new Error('Seat already booked');

      const seatPrice = parseFloat(show.base_price) * seatTypeMultiplier * surgeMultiplier * discountMultiplier;
      totalAmount += seatPrice;
      finalTickets.push({ seat_id, price: seatPrice });
    }

    // 4. Calculate Snacks Price
    if (snack_ids && snack_ids.length > 0) {
      for (let snack of snack_ids) {
        const snackRes = await client.query('SELECT price FROM snacks WHERE snack_id = $1', [snack.id]);
        if (snackRes.rows.length > 0) {
          totalAmount += (parseFloat(snackRes.rows[0].price) * snack.quantity);
        }
      }
    }

    // 5. Create Booking Record
    const bookingRes = await client.query(
      'INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING booking_id',
      [user_id, show_id, totalAmount, 'Confirmed']
    );
    const booking_id = bookingRes.rows[0].booking_id;

    // 6. Insert Tickets
    for (let t of finalTickets) {
      await client.query(
        'INSERT INTO tickets (booking_id, seat_id, final_price) VALUES ($1, $2, $3)',
        [booking_id, t.seat_id, t.price]
      );
    }

    // 7. Insert Booking Snacks
    if (snack_ids && snack_ids.length > 0) {
      for (let snack of snack_ids) {
        await client.query(
          'INSERT INTO booking_snacks (booking_id, snack_id, quantity) VALUES ($1, $2, $3)',
          [booking_id, snack.id, snack.quantity]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, booking_id, totalAmount, message: 'Booking confirmed!' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Autonomous NLP Agent Booking API — powered by Hugging Face LLM
app.post('/api/autonomous-agent', authenticateToken, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // -------------------------------------------------------
    // STEP 1: Use HF LLM to extract structured intent from prompt
    // -------------------------------------------------------
    let intent = null;

    const HF_API_KEY = process.env.HF_API_KEY;
    const systemPrompt = `You are a movie booking assistant. Extract booking intent from the user message and return ONLY valid JSON with these fields:
- "movie_title": string or null (the movie name they want to watch)
- "city": string or null (city name, e.g. "Mumbai", "Delhi", "Bangalore")
- "quantity": number (how many tickets, default 2)
- "snack": string or null (snack name like "popcorn", "nachos", "coke")
- "genre": string or null (movie genre like "action", "comedy")
- "time_of_day": string or null ("morning", "afternoon", "evening", "night") or a specific time like "6 PM"

Return ONLY the JSON object. No explanation. No markdown.`;

    if (HF_API_KEY && HF_API_KEY !== 'your_huggingface_api_key_here') {
      try {
        const hfResponse = await fetch(
          'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HF_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: `<s>[INST] ${systemPrompt}\n\nUser message: "${prompt}" [/INST]`,
              parameters: {
                max_new_tokens: 200,
                temperature: 0.1,
                return_full_text: false
              }
            })
          }
        );

        if (hfResponse.ok) {
          const hfData = await hfResponse.json();
          const rawText = Array.isArray(hfData) 
            ? hfData[0]?.generated_text 
            : hfData?.generated_text;

          if (rawText) {
            // Extract JSON from the response (it might have extra text)
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              intent = JSON.parse(jsonMatch[0]);
              console.log('HF LLM extracted intent:', intent);
            }
          }
        } else {
          const errText = await hfResponse.text();
          console.warn('HF API error:', hfResponse.status, errText);
        }
      } catch (hfErr) {
        console.warn('HF API call failed, falling back to regex:', hfErr.message);
      }
    }

    // -------------------------------------------------------
    // STEP 2: Fallback to regex parsing if LLM failed/unavailable
    // -------------------------------------------------------
    if (!intent) {
      console.log('Using regex fallback for intent extraction');
      const p = prompt.toLowerCase();

      // Quantity
      let quantity = 2;
      const numMatch = p.match(/\b(\d+)\b/);
      if (numMatch) quantity = parseInt(numMatch[1]);
      if (p.includes('one')) quantity = 1;
      if (p.includes('two')) quantity = 2;
      if (p.includes('three')) quantity = 3;
      if (p.includes('four')) quantity = 4;
      if (p.includes('five')) quantity = 5;

      // City
      let city = null;
      const cities = ['mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'hyderabad', 'pune', 'kolkata'];
      for (const c of cities) {
        if (p.includes(c)) { city = c; break; }
      }

      // Genre
      let genre = null;
      const genres = ['action', 'comedy', 'drama', 'sci-fi', 'thriller', 'horror', 'romance', 'adventure', 'fantasy'];
      for (const g of genres) {
        if (p.includes(g)) { genre = g; break; }
      }

      // Movie title (between "for"/"watch" and stop words)
      let movie_title = null;
      const titleMatch = p.match(/(?:for|watch|book)\s+(?:me\s+)?(?:\d+\s+tickets?\s+(?:for|to)\s+)?(.+?)(?=\s+in\s+|\s+at\s+|\s+with\s+|\s+tonight|\s+today|\s+whenever|\s+tomorrow|$)/i);
      if (titleMatch) {
        movie_title = titleMatch[1].replace(/\d+\s+tickets?\s+(for\s+)?/i, '').trim();
        // Clean up leftover words
        movie_title = movie_title.replace(/^(me\s+)?(a\s+)?/i, '').trim();
      }

      // Snack
      let snack = null;
      const snacks = ['popcorn', 'coke', 'nachos', 'samosa', 'pepsi'];
      for (const s of snacks) {
        if (p.includes(s)) { snack = s; break; }
      }

      // Time
      let time_of_day = null;
      const timeMatch = p.match(/(\d+)(?::\d+)?\s*(am|pm)/i);
      if (timeMatch) time_of_day = timeMatch[0];
      else if (p.includes('morning')) time_of_day = 'morning';
      else if (p.includes('afternoon')) time_of_day = 'afternoon';
      else if (p.includes('evening') || p.includes('tonight')) time_of_day = 'evening';
      else if (p.includes('night')) time_of_day = 'night';

      intent = { movie_title, city, quantity, snack, genre, time_of_day };
    }

    // Ensure quantity is a valid number
    intent.quantity = Math.min(Math.max(parseInt(intent.quantity) || 2, 1), 10);

    console.log('Final intent:', intent);

    // -------------------------------------------------------
    // STEP 3: Resolve time_of_day to a time string for SQL
    // -------------------------------------------------------
    let timeStr = null;
    if (intent.time_of_day) {
      const t = intent.time_of_day.toLowerCase();
      const specificTime = t.match(/(\d+)(?::\d+)?\s*(am|pm)/i);
      if (specificTime) {
        let hour = parseInt(specificTime[1]);
        if (specificTime[2].toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (specificTime[2].toLowerCase() === 'am' && hour === 12) hour = 0;
        timeStr = `${hour.toString().padStart(2, '0')}:00`;
      } else if (t === 'morning') timeStr = '10:00';
      else if (t === 'afternoon') timeStr = '14:00';
      else if (t === 'evening') timeStr = '18:00';
      else if (t === 'night') timeStr = '20:00';
    }

    // -------------------------------------------------------
    // STEP 4: Query database for best matching show
    // -------------------------------------------------------
    const params = [];
    let sql = `
      SELECT 
        s.show_id, s.show_time, s.base_price, s.is_surge_active,
        m.title, m.poster_url, m.genre,
        c.name as cinema_name, c.city,
        sc.name as screen_name, sc.screen_id
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.show_time >= (NOW() - INTERVAL '30 minutes')
        AND s.available_seats >= $1
    `;
    params.push(intent.quantity);
    let paramIdx = 2;

    if (intent.city) {
      sql += ` AND c.city ILIKE $${paramIdx}`;
      params.push(`%${intent.city}%`);
      paramIdx++;
    }

    if (intent.movie_title) {
      sql += ` AND m.title ILIKE $${paramIdx}`;
      params.push(`%${intent.movie_title}%`);
      paramIdx++;
    }

    sql += ` ORDER BY `;
    const orderClauses = [];

    if (intent.genre) {
      orderClauses.push(`(CASE WHEN m.genre ILIKE $${paramIdx} THEN 0 ELSE 1 END) ASC`);
      params.push(`%${intent.genre}%`);
      paramIdx++;
    }

    if (timeStr) {
      orderClauses.push(`ABS(EXTRACT(EPOCH FROM s.show_time::time) - EXTRACT(EPOCH FROM $${paramIdx}::time)) ASC`);
      params.push(timeStr);
      paramIdx++;
    }

    orderClauses.push(`m.vote_average DESC`, `s.show_time ASC`);
    sql += orderClauses.join(', ') + ` LIMIT 1`;

    const showRes = await query(sql, params);

    if (showRes.rows.length === 0) {
      // Give a helpful, specific error message
      const hint = intent.movie_title 
        ? `"${intent.movie_title}" in ${intent.city || 'your city'}` 
        : `${intent.genre || 'any movie'} in ${intent.city || 'your city'}`;
      return res.status(404).json({ 
        error: `No upcoming shows found for ${hint}. Try a different city, movie, or time.` 
      });
    }

    const bestShow = showRes.rows[0];

    // -------------------------------------------------------
    // STEP 5: Auto-select best available seats
    // -------------------------------------------------------
    const seatRes = await query(`
      SELECT seat_id, row_no, seat_no, seat_type, price_multiplier 
      FROM seats 
      WHERE screen_id = $1 
        AND seat_id NOT IN (
          SELECT t.seat_id 
          FROM tickets t
          JOIN bookings b ON t.booking_id = b.booking_id
          WHERE b.show_id = $2 AND b.status = 'Confirmed'
        )
      ORDER BY 
        CASE WHEN seat_type = 'VIP' THEN 1 
             WHEN seat_type = 'Premium' THEN 2 
             ELSE 3 END ASC,
        row_no ASC, seat_no ASC
      LIMIT $3
    `, [bestShow.screen_id, bestShow.show_id, intent.quantity]);

    if (seatRes.rows.length < intent.quantity) {
      return res.status(400).json({ 
        error: `Found "${bestShow.title}" at ${bestShow.cinema_name}, but only ${seatRes.rows.length} seat(s) available. You requested ${intent.quantity}.` 
      });
    }

    const preSelectedSeatIds = seatRes.rows.map(s => s.seat_id);
    const selectedSeats = seatRes.rows;

    const basePrice = parseFloat(bestShow.base_price);
    const surgeMultiplier = bestShow.is_surge_active ? 1.2 : 1.0;
    const totalTicketPrice = selectedSeats.reduce(
      (sum, s) => sum + (basePrice * parseFloat(s.price_multiplier) * surgeMultiplier), 
      0
    );

    // -------------------------------------------------------
    // STEP 6: Find requested snack in DB
    // -------------------------------------------------------
    let preCartSnacks = {};
    if (intent.snack) {
      const snRes = await query(
        `SELECT snack_id as id FROM snacks WHERE name ILIKE $1 LIMIT 1`, 
        [`%${intent.snack}%`]
      );
      if (snRes.rows.length > 0) {
        preCartSnacks[snRes.rows[0].id] = 1;
      }
    }

    // -------------------------------------------------------
    // STEP 7: Build response payload
    // -------------------------------------------------------
    const payload = {
      show_id: bestShow.show_id,
      preSelectedSeatIds,
      selectedSeats,
      showInfo: bestShow,
      totalTicketPrice,
      preCartSnacks,
      // Pass intent back so UI can show a summary message
      agentSummary: {
        movie: bestShow.title,
        cinema: bestShow.cinema_name,
        city: bestShow.city,
        showTime: bestShow.show_time,
        seats: intent.quantity,
        seatTypes: [...new Set(selectedSeats.map(s => s.seat_type))].join(', '),
        snack: intent.snack || null,
        poweredBy: HF_API_KEY && HF_API_KEY !== 'your_huggingface_api_key_here' ? 'Mistral-7B (HuggingFace)' : 'Regex Fallback'
      }
    };

    res.json({ message: 'Success', payload });

  } catch (err) {
    console.error('AI Agent Error:', err);
    res.status(500).json({ 
      error: 'I encountered an error while processing your request.',
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
