const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { exec } = require('child_process');
const { query, pool } = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'fallback_secret_change_me');
const HOLD_MINUTES = 10;
const PAYMENT_METHODS = new Set(['Demo', 'UPI', 'Card', 'NetBanking', 'Wallet', 'Cash']);
const LOYALTY_REWARD_SETTLEMENT_SECONDS = Math.max(
  0,
  parseInt(process.env.LOYALTY_REWARD_SETTLEMENT_SECONDS || '30', 10) || 30
);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const configuredOrigins = [
  'https://showsnow-chi.vercel.app',
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ...(process.env.CORS_ORIGINS || '').split(','),
].filter(Boolean).map(origin => origin.trim().replace(/\/$/, ''));
const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = new Set([...configuredOrigins, ...devOrigins]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));
app.use(express.json());

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function logAdminAction(db, adminId, action, entityType, entityId, details = {}) {
  await db.query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [adminId, action, entityType, entityId || null, JSON.stringify(details)]
  );
}

const loyaltyBalanceSql = `
  SELECT COALESCE(SUM(
    CASE
      WHEN points_earned > 0
        AND (expires_at IS NULL OR expires_at > NOW())
        AND ($2::timestamp IS NULL OR created_at <= $2::timestamp)
      THEN points_earned
      ELSE 0
    END - points_spent
  ), 0) AS balance
  FROM loyalty_ledger
  WHERE user_id = $1
`;

async function lockUserLoyaltyLedger(db, userId) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`loyalty:${userId}`]);
}

async function getLoyaltyRedeemableAt(db) {
  const result = await db.query(
    "SELECT transaction_timestamp() - ($1::int * INTERVAL '1 second') AS redeemable_at",
    [LOYALTY_REWARD_SETTLEMENT_SECONDS]
  );
  return result.rows[0].redeemable_at;
}

async function getLoyaltyBalance(db, userId, earnedBefore = null) {
  const result = await db.query(loyaltyBalanceSql, [userId, earnedBefore]);
  return parseInt(result.rows[0].balance, 10) || 0;
}

const BOT_OUT_OF_SCOPE_MESSAGE = 'I can only help with booking movie tickets on ShowsNow. Try asking me to find a movie, showtime, seats, or snacks.';
const BOOKING_INTENT_PATTERN = /\b(book|booking|ticket|tickets|tix|movie|movies|show|shows|showtime|showtimes|cinema|cinemas|seat|seats|watch|playing|popcorn|snack|snacks|coke|pepsi|nachos)\b/i;
const CITY_ALIASES = new Map([
  ['bombay', 'Mumbai'],
  ['mumbai', 'Mumbai'],
  ['delhi', 'Delhi'],
  ['new delhi', 'Delhi'],
  ['bangalore', 'Bengaluru'],
  ['bengaluru', 'Bengaluru'],
  ['blr', 'Bengaluru'],
  ['hyderabad', 'Hyderabad'],
  ['hyd', 'Hyderabad'],
  ['chennai', 'Chennai'],
  ['madras', 'Chennai'],
  ['pune', 'Pune'],
  ['kolkata', 'Kolkata'],
  ['calcutta', 'Kolkata'],
  ['ahmedabad', 'Ahmedabad'],
]);

function hasBookingIntent(prompt = '') {
  return BOOKING_INTENT_PATTERN.test(prompt);
}

async function extractLocalBookingIntent(promptText) {
  const lowerPrompt = promptText.toLowerCase();
  const intent = {};
  let extractedSomething = false;

  const numMatch = lowerPrompt.match(/(\d+)\s*(?:ticket|tickets|tix)/i) ||
    lowerPrompt.match(/(?:for\s+)?(\d+)\s*(?:people|person|of us)/i);
  if (numMatch) {
    intent.quantity = parseInt(numMatch[1], 10);
    extractedSomething = true;
  } else if (/\b(one|alone|myself)\b/.test(lowerPrompt) || /\bme\b/.test(lowerPrompt)) {
    intent.quantity = 1;
    extractedSomething = true;
  } else if (lowerPrompt.includes('two')) {
    intent.quantity = 2;
    extractedSomething = true;
  } else if (lowerPrompt.includes('three')) {
    intent.quantity = 3;
    extractedSomething = true;
  } else if (lowerPrompt.includes('four')) {
    intent.quantity = 4;
    extractedSomething = true;
  }

  for (const [alias, city] of [...CITY_ALIASES.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (lowerPrompt.includes(alias)) {
      intent.city = city;
      extractedSomething = true;
      break;
    }
  }

  const timeMatch = lowerPrompt.match(/(\d{1,2}:\d{2})\s*(am|pm)?/i) || lowerPrompt.match(/(\d{1,2})\s*(am|pm)/i);
  if (timeMatch) {
    intent.time_of_day = timeMatch[0];
    extractedSomething = true;
  } else if (lowerPrompt.includes('tonight')) {
    intent.time_of_day = 'tonight';
    extractedSomething = true;
  } else if (lowerPrompt.includes('morning')) {
    intent.time_of_day = 'morning';
    extractedSomething = true;
  } else if (lowerPrompt.includes('afternoon')) {
    intent.time_of_day = 'afternoon';
    extractedSomething = true;
  } else if (lowerPrompt.includes('evening')) {
    intent.time_of_day = 'evening';
    extractedSomething = true;
  } else if (lowerPrompt.includes('night')) {
    intent.time_of_day = 'night';
    extractedSomething = true;
  }

  if (lowerPrompt.includes('tomorrow')) {
    intent.date = 'tomorrow';
    extractedSomething = true;
  } else if (lowerPrompt.includes('today') || lowerPrompt.includes('tonight')) {
    intent.date = 'today';
    extractedSomething = true;
  }

  if (/\b(more|other|next|anymore|any more|another)\b/i.test(lowerPrompt)) {
    intent.option_offset = true;
    extractedSomething = true;
  }

  const snacks = ['popcorn', 'coke', 'pepsi', 'nachos', 'water', 'coffee', 'fries', 'burger', 'tea'];
  for (const snack of snacks) {
    if (lowerPrompt.includes(snack)) {
      intent.snack = snack;
      extractedSomething = true;
      break;
    }
  }

  const genres = ['action', 'comedy', 'drama', 'horror', 'romance', 'thriller', 'sci-fi', 'science fiction', 'animation'];
  for (const genre of genres) {
    if (lowerPrompt.includes(genre)) {
      intent.genre = genre === 'science fiction' ? 'sci-fi' : genre;
      extractedSomething = true;
      break;
    }
  }

  const languages = ['english', 'hindi', 'telugu', 'tamil', 'malayalam', 'kannada', 'korean', 'japanese', 'french', 'spanish'];
  for (const lang of languages) {
    if (lowerPrompt.includes(lang)) {
      intent.language = lang;
      extractedSomething = true;
      break;
    }
  }

  const cinemaChains = ['pvr', 'inox', 'miraj', 'carnival', 'cinepolis'];
  for (const chain of cinemaChains) {
    if (lowerPrompt.includes(chain)) {
      intent.cinema_name = chain;
      extractedSomething = true;
      break;
    }
  }

  const moviesRes = await query('SELECT title FROM movies ORDER BY title');
  const movieMatches = [];
  const promptWords = new Set(lowerPrompt.split(/[^a-z0-9]+/).filter(word => word.length >= 3));
  for (const movie of moviesRes.rows) {
    const title = movie.title.toLowerCase();
    const titleWords = title.split(/[^a-z0-9]+/).filter(word => word.length >= 3);
    if (lowerPrompt.includes(title)) {
      movieMatches.push(movie.title);
    } else if (titleWords.length > 0 && titleWords.every(word => promptWords.has(word))) {
      movieMatches.push(movie.title);
    } else if (titleWords.length === 1 && promptWords.has(titleWords[0])) {
      movieMatches.push(movie.title);
    }
  }

  const uniqueMovieMatches = [...new Set(movieMatches)];
  if (uniqueMovieMatches.length === 1) {
    intent.movie_title = uniqueMovieMatches[0];
    extractedSomething = true;
  } else if (uniqueMovieMatches.length > 1) {
    intent.movie_options = uniqueMovieMatches.slice(0, 5);
    extractedSomething = true;
  }

  return { intent, extractedSomething };
}

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
  authenticateToken(req, res, async () => {
    try {
      const result = await query('SELECT role FROM users WHERE user_id = $1', [req.user.user_id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (result.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      req.user.role = result.rows[0].role;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not verify admin privileges.' });
    }
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
      'INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, name, email, phone, role, created_at',
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
      'SELECT user_id, name, email, phone, role, password_hash FROM users WHERE email = $1',
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
      'SELECT user_id, name, email, phone, city, role, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch user.' });
  }
});

// GET /api/user/profile — current user's profile details
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT user_id, name, email, phone, city, role, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch profile.' });
  }
});

// PUT /api/user/profile — update current user's profile details
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  const { name, phone, city } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET name = $1, phone = $2, city = $3
       WHERE user_id = $4
       RETURNING user_id, name, email, phone, city, role, created_at`,
      [name.trim(), phone || null, city || null, req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update profile.' });
  }
});

// GET /api/user/bookings — user's own bookings with movie/cinema info
app.get('/api/user/bookings', authenticateToken, async (req, res) => {
  try {
    const sql = `
      SELECT b.booking_id, b.total_amount, b.status, b.booking_time,
             p.status as payment_status, p.method as payment_method, p.transaction_ref,
             m.title, m.poster_url,
             c.name as cinema_name, c.city,
             sc.name as screen_name,
             s.show_time,
             (
                SELECT json_agg(json_build_object('row_no', st.row_no, 'seat_no', st.seat_no))
                FROM tickets t
                JOIN seats st ON t.seat_id = st.seat_id
                WHERE t.booking_id = b.booking_id
             ) as seats
      FROM bookings b
      JOIN shows s ON b.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      WHERE b.user_id = $1
      ORDER BY b.booking_time DESC
    `;
    const { rows } = await query(sql, [req.user.user_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET /api/user/loyalty — user's loyalty point balance
app.get('/api/user/loyalty', authenticateToken, async (req, res) => {
  try {
    const db = { query };
    const redeemableAt = await getLoyaltyRedeemableAt(db);
    const balance = await getLoyaltyBalance(db, req.user.user_id, redeemableAt);
    res.json({ balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch loyalty balance' });
  }
});

// ---------------------------------------------------------
// Admin Routes
// ---------------------------------------------------------

// Get Admin Stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const revenueRes = await pool.query('SELECT SUM(total_amount) as total_revenue FROM bookings WHERE status = $1', ['Confirmed']);
    const bookingsRes = await pool.query('SELECT COUNT(*) as total_bookings FROM bookings WHERE status = $1', ['Confirmed']);
    const moviesRes = await pool.query('SELECT COUNT(*) as total_movies FROM movies');
    const usersRes = await pool.query('SELECT COUNT(*) as total_users FROM users');
    const cityRevRes = await pool.query('SELECT * FROM v_revenue_by_city ORDER BY revenue DESC');
    const occupancyRes = await pool.query('SELECT * FROM v_show_occupancy WHERE show_time >= NOW() ORDER BY occupancy_percent DESC LIMIT 10');

    res.json({
      totalRevenue: revenueRes.rows[0].total_revenue || 0,
      totalBookings: bookingsRes.rows[0].total_bookings,
      totalMovies: moviesRes.rows[0].total_movies,
      totalUsers: usersRes.rows[0].total_users,
      cityRevenue: cityRevRes.rows,
      topOccupancy: occupancyRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// Get Admin Waitlists
app.get('/api/admin/waitlists', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.waitlist_id, w.status, w.joined_at, w.requested_seats,
             u.name as user_name, u.email as user_email,
             s.show_id, s.show_time,
             m.title as movie_title
      FROM waitlist w
      JOIN users u ON w.user_id = u.user_id
      JOIN shows s ON w.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      ORDER BY w.joined_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch waitlists' });
  }
});

app.get('/api/admin/reports', authenticateAdmin, async (_req, res) => {
  try {
    const [cityRevenue, movieRevenue, cinemaRevenue, showOccupancy, topUsers] = await Promise.all([
      pool.query('SELECT * FROM v_revenue_by_city ORDER BY revenue DESC'),
      pool.query('SELECT * FROM v_revenue_by_movie ORDER BY revenue DESC, tickets_sold DESC LIMIT 20'),
      pool.query('SELECT * FROM v_revenue_by_cinema ORDER BY revenue DESC, tickets_sold DESC LIMIT 20'),
      pool.query('SELECT * FROM v_show_occupancy WHERE show_time >= NOW() ORDER BY occupancy_percent DESC, show_time ASC LIMIT 20'),
      pool.query('SELECT * FROM v_top_users ORDER BY total_spent DESC, confirmed_bookings DESC LIMIT 20'),
    ]);

    res.json({
      cityRevenue: cityRevenue.rows,
      movieRevenue: movieRevenue.rows,
      cinemaRevenue: cinemaRevenue.rows,
      showOccupancy: showOccupancy.rows,
      topUsers: topUsers.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch DBMS reports' });
  }
});

app.get('/api/admin/audit-logs', authenticateAdmin, async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT a.*, u.name AS admin_name, u.email AS admin_email
      FROM admin_audit_logs a
      LEFT JOIN users u ON a.admin_id = u.user_id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Add New Movie
app.post('/api/admin/movies', authenticateAdmin, async (req, res) => {
  const { title, genre, duration_mins, language, poster_url, banner_url, overview } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Movie title is required' });
  }

  try {
    const result = await query(
      `INSERT INTO movies (title, genre, duration_mins, language, poster_url, banner_url, overview) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title.trim(), genre || null, duration_mins || null, language || null, poster_url || null, banner_url || null, overview || null]
    );
    await logAdminAction(pool, req.user.user_id, 'CREATE_MOVIE', 'movie', result.rows[0].movie_id, {
      title: result.rows[0].title,
      genre: result.rows[0].genre,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add movie' });
  }
});

// Add New Show
app.post('/api/admin/shows', authenticateAdmin, async (req, res) => {
  const { movie_id, screen_id, show_time, base_price } = req.body;
  const parsedBasePrice = Number(base_price);

  if (!isUuid(movie_id) || !isUuid(screen_id) || !show_time || !Number.isFinite(parsedBasePrice) || parsedBasePrice <= 0) {
    return res.status(400).json({ error: 'movie_id, screen_id, show_time and a positive base_price are required' });
  }

  try {
    // Basic validation: check if screen is busy at that time
    const check = await query('SELECT * FROM shows WHERE screen_id = $1 AND show_time = $2', [screen_id, show_time]);
    if (check.rows.length > 0) return res.status(409).json({ error: 'Screen is already occupied at this time' });

    const screenRes = await query('SELECT total_seats FROM screens WHERE screen_id = $1', [screen_id]);
    if (screenRes.rows.length === 0) return res.status(404).json({ error: 'Screen not found' });
    const available_seats = screenRes.rows[0].total_seats;

    const result = await query(
      `INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [movie_id, screen_id, show_time, parsedBasePrice, available_seats]
    );
    await logAdminAction(pool, req.user.user_id, 'CREATE_SHOW', 'show', result.rows[0].show_id, {
      movie_id,
      screen_id,
      show_time,
      base_price: parsedBasePrice,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add show' });
  }
});

// Update show pricing
app.patch('/api/admin/shows/:id', authenticateAdmin, async (req, res) => {
  const { base_price } = req.body;
  const parsedBasePrice = Number(base_price);

  if (!Number.isFinite(parsedBasePrice) || parsedBasePrice <= 0) {
    return res.status(400).json({ error: 'base_price must be a positive number' });
  }

  try {
    const result = await query(
      'UPDATE shows SET base_price = $1 WHERE show_id = $2 RETURNING *',
      [parsedBasePrice, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Show not found' });
    await logAdminAction(pool, req.user.user_id, 'UPDATE_SHOW_PRICE', 'show', result.rows[0].show_id, {
      base_price: parsedBasePrice,
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update show price' });
  }
});

// Get All Bookings for Admin
app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
  try {
    const sql = `
      SELECT b.booking_id, b.total_amount, b.status, b.booking_time,
             p.status as payment_status, p.method as payment_method,
             u.name as user_name, u.email as user_email,
             m.title as movie_title,
             c.name as cinema_name
      FROM bookings b
      JOIN users u ON b.user_id = u.user_id
      JOIN shows s ON b.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
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
      // Find movies that have shows in the selected city, OR are coming soon (no shows needed)
      queryStr = `
        SELECT DISTINCT m.* 
        FROM movies m
        LEFT JOIN shows s ON m.movie_id = s.movie_id
        LEFT JOIN screens sc ON s.screen_id = sc.screen_id
        LEFT JOIN cinemas c ON sc.cinema_id = c.cinema_id
        WHERE c.city ILIKE $1 OR m.release_date > CURRENT_DATE
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
    if (!TMDB_API_KEY) return res.json([]);

    const response = await fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}`);
    const data = await response.json();
    res.json(data.results || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stream data' });
  }
});

// Get shows for a movie (supports ?date= and ?city= filter)
app.get('/api/shows/movie/:movie_id', async (req, res) => {
  try {
    const { movie_id } = req.params;
    const { date, city } = req.query; // expects YYYY-MM-DD

    let sql = `
      SELECT s.show_id, s.show_time, s.base_price, s.available_seats, s.surge_multiplier,
             sc.name as screen_name, c.name as cinema_name, c.city, c.address, c.cinema_id
      FROM shows s
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.movie_id = $1
    `;
    const params = [movie_id];
    let paramIdx = 2;

    if (date) {
      sql += ` AND DATE(s.show_time) = $${paramIdx} AND s.show_time > NOW()`;
      params.push(date);
      paramIdx++;
    } else {
      sql += ` AND s.show_time > NOW()`;
    }

    if (city && city !== 'All') {
      sql += ` AND c.city ILIKE $${paramIdx}`;
      params.push(city);
      paramIdx++;
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
      SELECT s.show_id, s.show_time, s.base_price, s.surge_multiplier, s.available_seats,
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
    let userId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token) {
        try {
          const user = jwt.verify(token, JWT_SECRET);
          userId = user.user_id;
        } catch (e) {} // ignore invalid token for optional auth
      }
    }

    await query('SELECT expire_seat_holds()');
    // Get all seats for the screen hosting the show
    const seatsSql = `
      SELECT s.seat_id, s.row_no, s.seat_no, s.seat_type, s.price_multiplier,
             (CASE WHEN t.ticket_id IS NOT NULL THEN true ELSE false END) as is_booked,
             (CASE WHEN h.hold_id IS NOT NULL THEN true ELSE false END) as is_held,
             (CASE WHEN h.user_id = $2 THEN true ELSE false END) as is_held_by_me
      FROM seats s
      JOIN shows sh ON s.screen_id = sh.screen_id
      LEFT JOIN tickets t ON t.seat_id = s.seat_id 
           AND t.show_id = $1
           AND t.booking_id IN (SELECT booking_id FROM bookings WHERE status = 'Confirmed')
      LEFT JOIN seat_holds h ON h.seat_id = s.seat_id
           AND h.show_id = $1
           AND h.status = 'Active'
           AND h.expires_at > NOW()
      WHERE sh.show_id = $1
      ORDER BY s.row_no, s.seat_no
    `;
    const { rows } = await query(seatsSql, [showId, userId]);
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
        sc.name AS screen_name, s.show_time, s.base_price, s.available_seats, s.surge_multiplier
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
      ORDER BY s.surge_multiplier ASC, s.show_time ASC
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
// Hold seats for a short checkout window.
app.post('/api/seat-holds', authenticateToken, async (req, res) => {
  const { show_id, seat_ids } = req.body;
  const user_id = req.user.user_id;

  if (!isUuid(show_id) || !Array.isArray(seat_ids) || seat_ids.length === 0 || seat_ids.some(id => !isUuid(id))) {
    return res.status(400).json({ error: 'show_id and valid seat_ids are required' });
  }

  const uniqueSeatIds = [...new Set(seat_ids)].sort();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT expire_seat_holds()');

    const showRes = await client.query('SELECT screen_id FROM shows WHERE show_id = $1 FOR UPDATE', [show_id]);
    if (showRes.rows.length === 0) throw new Error('Show not found');
    const show = showRes.rows[0];

    const holds = [];
    for (const seat_id of uniqueSeatIds) {
      const seatRes = await client.query('SELECT screen_id FROM seats WHERE seat_id = $1', [seat_id]);
      if (seatRes.rows.length === 0) throw new Error('Invalid seat');
      if (seatRes.rows[0].screen_id !== show.screen_id) throw new Error('Seat does not belong to this show');

      const bookedRes = await client.query(`
        SELECT t.ticket_id
        FROM tickets t
        JOIN bookings b ON t.booking_id = b.booking_id
        WHERE t.show_id = $1 AND t.seat_id = $2 AND b.status = 'Confirmed'
      `, [show_id, seat_id]);
      if (bookedRes.rows.length > 0) throw new Error('Seat already booked');

      const activeHoldRes = await client.query(`
        SELECT hold_id, user_id
        FROM seat_holds
        WHERE show_id = $1
          AND seat_id = $2
          AND status = 'Active'
          AND expires_at > NOW()
        FOR UPDATE
      `, [show_id, seat_id]);

      if (activeHoldRes.rows.length > 0 && activeHoldRes.rows[0].user_id !== user_id) {
        throw new Error('Seat is temporarily held by another user');
      }

      const holdRes = await client.query(`
        INSERT INTO seat_holds (show_id, seat_id, user_id, expires_at)
        VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::INTERVAL)
        ON CONFLICT (show_id, seat_id) WHERE status = 'Active'
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          hold_token = gen_random_uuid(),
          expires_at = EXCLUDED.expires_at,
          released_at = NULL
        WHERE seat_holds.user_id = EXCLUDED.user_id
        RETURNING hold_id, seat_id, hold_token, expires_at
      `, [show_id, seat_id, user_id, HOLD_MINUTES]);

      if (holdRes.rows.length === 0) throw new Error('Seat is temporarily held by another user');
      holds.push(holdRes.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ success: true, holds, expiresInMinutes: HOLD_MINUTES });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = /booked|held/i.test(err.message) ? 409 : 400;
    res.status(status).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/seat-holds', authenticateToken, async (req, res) => {
  const { show_id, seat_ids } = req.body;
  const user_id = req.user.user_id;

  if (!isUuid(show_id) || !Array.isArray(seat_ids) || seat_ids.some(id => !isUuid(id))) {
    return res.status(400).json({ error: 'show_id and valid seat_ids are required' });
  }

  try {
    const result = await query(`
      UPDATE seat_holds
      SET status = 'Released', released_at = NOW()
      WHERE show_id = $1
        AND user_id = $2
        AND seat_id = ANY($3)
        AND status = 'Active'
      RETURNING hold_id
    `, [show_id, user_id, seat_ids]);
    res.json({ success: true, released: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to release seat holds' });
  }
});

// Book tickets
app.post('/api/bookings', authenticateToken, async (req, res) => {
  const { show_id, seat_ids, snack_ids, applyPoints, payment_method } = req.body;
  const user_id = req.user.user_id;

  if (!isUuid(show_id) || !Array.isArray(seat_ids) || seat_ids.length === 0 || seat_ids.some(id => !isUuid(id))) {
    return res.status(400).json({ error: 'show_id and valid seat_ids are required' });
  }

  const uniqueSeatIds = [...new Set(seat_ids)].sort();
  if (uniqueSeatIds.length !== seat_ids.length) {
    return res.status(400).json({ error: 'Duplicate seats are not allowed' });
  }

  const paymentMethod = PAYMENT_METHODS.has(payment_method) ? payment_method : 'Demo';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const redeemableAt = await getLoyaltyRedeemableAt(client);
    await client.query('SELECT expire_seat_holds()');
    await client.query('SELECT expire_pending_bookings()');

    // 1. Get show details and lock the row
    const showRes = await client.query(
      'SELECT screen_id, base_price, surge_multiplier, available_seats FROM shows WHERE show_id = $1 FOR UPDATE',
      [show_id]
    );
    if (showRes.rows.length === 0) throw new Error('Show not found');
    const show = showRes.rows[0];

    if (show.available_seats < seat_ids.length) {
      throw new Error('Not enough seats available');
    }

    let surgeMultiplier = parseFloat(show.surge_multiplier) || 1.0;
    let ticketsTotal = 0;
    let finalTickets = [];

    for (let seat_id of uniqueSeatIds) {
      const seatRes = await client.query('SELECT price_multiplier, screen_id FROM seats WHERE seat_id = $1', [seat_id]);
      if (seatRes.rows.length === 0) throw new Error('Invalid seat');
      if (seatRes.rows[0].screen_id !== show.screen_id) throw new Error('Seat does not belong to this show');
      
      const isBooked = await client.query(`
         SELECT t.ticket_id FROM tickets t
         JOIN bookings b ON t.booking_id = b.booking_id
         WHERE t.show_id = $1 AND b.status = 'Confirmed' AND t.seat_id = $2
       `, [show_id, seat_id]);
      if (isBooked.rows.length > 0) throw new Error('Seat already booked');

      const activeHoldRes = await client.query(`
        SELECT hold_id, user_id
        FROM seat_holds
        WHERE show_id = $1
          AND seat_id = $2
          AND status = 'Active'
          AND expires_at > NOW()
        FOR UPDATE
      `, [show_id, seat_id]);
      if (activeHoldRes.rows.length > 0 && activeHoldRes.rows[0].user_id !== user_id) {
        throw new Error('Seat is temporarily held by another user');
      }

      const seatPrice = parseFloat(show.base_price) * parseFloat(seatRes.rows[0].price_multiplier) * surgeMultiplier;
      ticketsTotal += seatPrice;
      finalTickets.push({ seat_id, price: seatPrice });
    }

    // 4. Calculate Snacks
    let snacksTotal = 0;
    if (snack_ids && snack_ids.length > 0) {
      const snackUuids = snack_ids.map(s => s.id);
      const snackRes = await client.query('SELECT snack_id, price FROM snacks WHERE snack_id = ANY($1)', [snackUuids]);
      
      snacksTotal = snackRes.rows.reduce((sum, s) => {
        const orderedSnack = snack_ids.find(reqSnack => reqSnack.id === s.snack_id);
        const qty = orderedSnack ? orderedSnack.quantity : 1;
        return sum + (parseFloat(s.price) * qty);
      }, 0);
    }

    let totalAmount = ticketsTotal + snacksTotal;

    // 5. Apply Loyalty Points
    let pointsToSpend = 0;
    if (applyPoints) {
      await lockUserLoyaltyLedger(client, user_id);
      const balance = await getLoyaltyBalance(client, user_id, redeemableAt);
      if (balance <= 0) {
        throw new Error('Not enough loyalty points');
      }
      if (balance > 0) {
        const POINTS_MULTIPLIER = 0.10; // 50 points = 5 rupees
        const MAX_DISCOUNT_RUPEES = 100; 
        
        let maxPossibleDiscount = balance * POINTS_MULTIPLIER;
        let actualDiscount = Math.min(maxPossibleDiscount, MAX_DISCOUNT_RUPEES, totalAmount);
        
        if (actualDiscount > 0) {
          pointsToSpend = Math.ceil(actualDiscount / POINTS_MULTIPLIER);
          if (pointsToSpend > balance) {
            throw new Error('Not enough loyalty points');
          }
          totalAmount -= actualDiscount;
        }
      }
    }

    // 6. Create Booking (Pending)
    const bookingRes = await client.query(
      'INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING booking_id',
      [user_id, show_id, totalAmount, 'Pending']
    );
    const bookingId = bookingRes.rows[0].booking_id;

    // Insert Spent Points into Ledger
    if (pointsToSpend > 0) {
      await client.query(
        'INSERT INTO loyalty_ledger (user_id, booking_id, points_spent, expires_at) VALUES ($1, $2, $3, NULL)',
        [user_id, bookingId, pointsToSpend]
      );
    }

    for (const seat of finalTickets) {
      await client.query(
        'INSERT INTO tickets (booking_id, show_id, seat_id, final_price) VALUES ($1, $2, $3, $4)',
        [bookingId, show_id, seat.seat_id, seat.price]
      );
    }

    // 7. Insert Booking Snacks BEFORE confirming
    if (snack_ids && snack_ids.length > 0) {
      for (let snack of snack_ids) {
        await client.query(
          'INSERT INTO booking_snacks (booking_id, snack_id, quantity) VALUES ($1, $2, $3)',
          [bookingId, snack.id, snack.quantity]
        );
      }
    }

    // 8. Confirm booking — this fires the DB trigger for seat count & surge pricing & loyalty points
    await client.query('UPDATE bookings SET status = $1 WHERE booking_id = $2', ['Confirmed', bookingId]);

    await client.query(
      `INSERT INTO payments (booking_id, amount, method, status, paid_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [bookingId, totalAmount, paymentMethod, 'Paid']
    );

    await client.query(`
      UPDATE seat_holds
      SET status = 'Converted', released_at = NOW()
      WHERE show_id = $1
        AND user_id = $2
        AND seat_id = ANY($3)
        AND status = 'Active'
    `, [show_id, user_id, uniqueSeatIds]);

    await client.query('COMMIT');
    res.json({ success: true, booking_id: bookingId, totalAmount, paymentStatus: 'Paid', message: 'Booking confirmed!' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'One or more selected seats were just booked. Please choose different seats.' });
    }
    if (/booked|held|available|loyalty points/i.test(err.message)) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Booking failed. Please try again.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------
// Waitlist Management
app.get('/api/user/waitlist', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT w.waitlist_id, w.status, w.joined_at, w.requested_seats,
             s.show_id, s.show_time,
             m.title, m.title as movie_title, m.poster_url,
             c.city, c.name as cinema_name
      FROM waitlist w
      JOIN shows s ON w.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE w.user_id = $1
      ORDER BY w.joined_at DESC
    `, [req.user.user_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch waitlist' });
  }
});

// ---------------------------------------------------------
app.post('/api/waitlist', authenticateToken, async (req, res) => {
  const { show_id, requested_seats } = req.body;
  const user_id = req.user.user_id;

  if (!show_id || !requested_seats) {
    return res.status(400).json({ error: 'show_id and requested_seats are required' });
  }

  try {
    const result = await query(
      'INSERT INTO waitlist (show_id, user_id, requested_seats) VALUES ($1, $2, $3) RETURNING waitlist_id',
      [show_id, user_id, requested_seats]
    );
    res.json({ success: true, message: 'Successfully joined the waitlist!' });
  } catch (err) {
    console.error('Waitlist Error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You are already on the waitlist for this show.' });
    }
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

// ---------------------------------------------------------
// Cancellation & Auto-Booking Waitlist Engine
// ---------------------------------------------------------
app.post('/api/bookings/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.user_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify booking
    const bookingRes = await client.query('SELECT * FROM bookings WHERE booking_id = $1 AND user_id = $2 FOR UPDATE', [id, user_id]);
    if (bookingRes.rows.length === 0) throw new Error('Booking not found');
    const booking = bookingRes.rows[0];

    if (booking.status === 'Cancelled') throw new Error('Already cancelled');

    // 2. Mark as cancelled
    await client.query('UPDATE bookings SET status = $1 WHERE booking_id = $2', ['Cancelled', id]);
    await client.query(`
      UPDATE payments
      SET status = 'Refunded',
          refund_amount = amount,
          refunded_at = NOW()
      WHERE booking_id = $1
        AND status = 'Paid'
    `, [id]);
    await logAdminAction(client, null, 'CANCEL_BOOKING', 'booking', id, {
      user_id,
      show_id: booking.show_id,
    });
    await logAdminAction(client, null, 'REFUND_PAYMENT', 'booking', id, {
      reason: 'User cancellation',
    });

    // Note: The postgres trigger 'update_show_availability_and_surge' fires here 
    // and adds seats back to available_seats!
    // Delete released tickets after the trigger has counted them so UNIQUE(show_id, seat_id)
    // allows those seats to be booked again.
    await client.query('DELETE FROM tickets WHERE booking_id = $1', [id]);

    // 3. Auto-Booking Waitlist Engine
    // Fetch all Waiting users for this show
    const waitlistRes = await client.query(`
      SELECT * FROM waitlist 
      WHERE show_id = $1 AND status = 'Waiting'
      ORDER BY joined_at ASC
      FOR UPDATE SKIP LOCKED
    `, [booking.show_id]);

    for (let wlUser of waitlistRes.rows) {
      // Refresh available seats inside transaction
      const showRes = await client.query('SELECT available_seats, base_price, surge_multiplier, screen_id FROM shows WHERE show_id = $1 FOR UPDATE', [booking.show_id]);
      const show = showRes.rows[0];

      if (show.available_seats >= wlUser.requested_seats) {
         // Check for adjacent seats!
         const seatsRes = await client.query(`
            SELECT seat_id, row_no, seat_no, price_multiplier
            FROM seats 
            WHERE screen_id = $1
            AND seat_id NOT IN (
               SELECT t.seat_id FROM tickets t JOIN bookings b ON t.booking_id = b.booking_id WHERE t.show_id = $2 AND b.status = 'Confirmed'
            )
            AND seat_id NOT IN (
               SELECT h.seat_id FROM seat_holds h
               WHERE h.show_id = $2 AND h.status = 'Active' AND h.expires_at > NOW()
            )
            ORDER BY row_no ASC, seat_no ASC
         `, [show.screen_id, booking.show_id]);

         // Sliding window to find contiguous seats
         const seats = seatsRes.rows;
         let adjacentSeats = null;
         
         for (let i = 0; i <= seats.length - wlUser.requested_seats; i++) {
           let isContiguous = true;
           let currentWindow = [seats[i]];
           for (let j = 1; j < wlUser.requested_seats; j++) {
             if (seats[i+j].row_no !== seats[i].row_no || parseInt(seats[i+j].seat_no) !== parseInt(seats[i+j-1].seat_no) + 1) {
               isContiguous = false;
               break;
             }
             currentWindow.push(seats[i+j]);
           }
           if (isContiguous) {
             adjacentSeats = currentWindow;
             break;
           }
         }

         if (adjacentSeats) {
            const basePrice = parseFloat(show.base_price);
            const surgeMultiplier = parseFloat(show.surge_multiplier) || 1.0;
            const totalAmount = adjacentSeats.reduce(
              (sum, seat) => sum + (basePrice * parseFloat(seat.price_multiplier) * surgeMultiplier),
              0
            );

            // Auto-book!
            const newBookingRes = await client.query(
               'INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING booking_id',
               [wlUser.user_id, booking.show_id, totalAmount, 'Pending']
            );
            const newBookingId = newBookingRes.rows[0].booking_id;
            
            for (let seat of adjacentSeats) {
               const finalPrice = basePrice * parseFloat(seat.price_multiplier) * surgeMultiplier;
               await client.query(
                  'INSERT INTO tickets (booking_id, show_id, seat_id, final_price) VALUES ($1, $2, $3, $4)',
                  [newBookingId, booking.show_id, seat.seat_id, finalPrice]
               );
            }

            // Confirm booking
            await client.query('UPDATE bookings SET status = $1 WHERE booking_id = $2', ['Confirmed', newBookingId]);
            await client.query(
              `INSERT INTO payments (booking_id, amount, method, status)
               VALUES ($1, $2, $3, $4)`,
              [newBookingId, totalAmount, 'Demo', 'Pending']
            );
            // Mark waitlist as Auto-Booked
            await client.query('UPDATE waitlist SET status = $1 WHERE waitlist_id = $2', ['Auto-Booked', wlUser.waitlist_id]);
         }
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Booking cancelled successfully. Waitlist processed.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Autonomous booking assistant. Uses Gemini for extraction when configured,
// with a deterministic local parser and hard out-of-scope boundary.
app.post('/api/autonomous-agent', async (req, res) => {
  try {
    const { prompt, context, isOption } = req.body;
    const promptText = typeof prompt === 'string' ? prompt.trim() : '';
    if (!promptText && !context) {
      return res.json({ type: 'out_of_scope', message: BOT_OUT_OF_SCOPE_MESSAGE });
    }

    let intent = context ? { ...context } : {};
    const clarificationField = context?.clarification_field;

    if (isOption && clarificationField) {
      intent[clarificationField] = promptText;
      delete intent.clarification_field;
    } else if (promptText) {
      const lowerPrompt = promptText.toLowerCase();
      if (
        lowerPrompt.includes('start over') || 
        lowerPrompt.includes('cancel') ||
        lowerPrompt.includes('find movies') ||
        lowerPrompt.includes('movies in') ||
        lowerPrompt.includes('show me') ||
        lowerPrompt.includes('search')
      ) {
        intent = {};
      }

      if (!clarificationField) {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const systemInstruction = `You are a movie booking assistant. Extract booking intent from the user message.
Return ONLY valid JSON with these EXACT fields:
- "movie_title": string or null
- "city": string or null
- "quantity": number or null
- "snack": string or null
- "genre": string or null
- "time_of_day": string or null
- "date": string or null
- "language": string or null
- "cinema_name": string or null`;

        if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
          try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
              model: 'gemini-2.5-flash',
              systemInstruction,
              generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            });
            const result = await model.generateContent(promptText);
            intent = { ...intent, ...JSON.parse(result.response.text()) };
          } catch (e) {
            console.warn('Gemini intent extraction failed:', e.message);
          }
        }
      }

      const local = await extractLocalBookingIntent(promptText);
      const meaningfulLocalIntent = Boolean(
        local.intent.movie_title ||
        local.intent.movie_options ||
        local.intent.city ||
        local.intent.time_of_day ||
        local.intent.date ||
        local.intent.snack ||
        local.intent.genre ||
        local.intent.language
      );
      
      const isGreeting = /^(hi|hello|hey|greetings|howdy)(?:\s+there)?$/i.test(promptText.trim());
      if (isGreeting) {
         return res.json({ type: 'greeting', message: 'Hello! I am the ShowsNow Concierge. I can help you find movies and book tickets. What would you like to watch?' });
      }

      const isConversational = /^(are you|who are|what are|can you|help)\b/i.test(promptText.trim());
      
      const promptIsInScope = hasBookingIntent(promptText) || meaningfulLocalIntent || Boolean(clarificationField) || isConversational || (Object.keys(intent).length > 0);
      if (!promptIsInScope) {
        return res.json({ type: 'out_of_scope', message: BOT_OUT_OF_SCOPE_MESSAGE });
      }

      if (local.intent.movie_options?.length > 1 && !local.intent.movie_title) {
        return res.json({
          type: 'clarify',
          message: 'I found more than one matching movie. Which one did you mean?',
          options: local.intent.movie_options,
          context: { ...intent, movie_options: undefined, clarification_field: 'movie_title' }
        });
      }

      if (clarificationField && !local.extractedSomething) {
        intent[clarificationField] = promptText;
      }
      delete intent.clarification_field;
      delete local.intent.movie_options;
      
      if (local.intent.option_offset) {
        intent.current_offset = (intent.current_offset || 0) + 4;
        delete local.intent.option_offset;
      }
      
      intent = { ...intent, ...local.intent };

      if (isConversational) {
        return res.json({ type: 'greeting', message: 'I am the ShowsNow Concierge. I can help you search for movies by city, genre, or time, and book your tickets.' });
      }
    } else {
       // if no promptText (initial load), reset offset
       intent.current_offset = 0;
    }

    if (!intent.city) {
      return res.json({
        type: 'clarify',
        message: 'Which city should I search in?',
        options: ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune'],
        context: { ...intent, clarification_field: 'city' }
      });
    }

    let timeStr = null;
    let exactDateStr = null;

    if (intent.time_of_day) {
      const t = String(intent.time_of_day).toLowerCase();
      
      const dropdownMatch = t.match(/^(today|tomorrow|[a-z]{3}\s\d{1,2}),\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
      if (dropdownMatch) {
        let datePart = dropdownMatch[1].toLowerCase();
        let hour = parseInt(dropdownMatch[2], 10);
        let min = dropdownMatch[3];
        let ampm = dropdownMatch[4].toLowerCase();
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        timeStr = `${hour.toString().padStart(2, '0')}:${min}`;
        
        if (datePart === 'today') exactDateStr = 'CURRENT_DATE';
        else if (datePart === 'tomorrow') exactDateStr = 'CURRENT_DATE + INTERVAL \'1 day\'';
        else {
          const d = new Date(`${datePart} ${new Date().getFullYear()}`);
          exactDateStr = `'${d.toISOString().split('T')[0]}'`;
        }
      } else {
        const specificTimeWithColon = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        const specificTimeWithoutColon = t.match(/(\d{1,2})\s*(am|pm)/i);

        if (specificTimeWithColon) {
          let hour = parseInt(specificTimeWithColon[1], 10);
          let min = specificTimeWithColon[2];
          let ampm = specificTimeWithColon[3] ? specificTimeWithColon[3].toLowerCase() : null;
          
          if (!ampm && hour < 12) {
            hour += 12;
          } else if (ampm === 'pm' && hour < 12) {
            hour += 12;
          } else if (ampm === 'am' && hour === 12) {
            hour = 0;
          }
          timeStr = `${hour.toString().padStart(2, '0')}:${min}`;
        } else if (specificTimeWithoutColon) {
          let hour = parseInt(specificTimeWithoutColon[1], 10);
          let ampm = specificTimeWithoutColon[2].toLowerCase();
          if (ampm === 'pm' && hour < 12) hour += 12;
          if (ampm === 'am' && hour === 12) hour = 0;
          timeStr = `${hour.toString().padStart(2, '0')}:00`;
        } else if (t === 'morning') timeStr = '10:00';
        else if (t === 'afternoon') timeStr = '14:00';
        else if (t === 'evening' || t === 'tonight') timeStr = '18:00';
        else if (t === 'night') timeStr = '20:00';
      }
    }

    if (intent.date === 'today' && !exactDateStr) exactDateStr = 'CURRENT_DATE';
    if (intent.date === 'tomorrow' && !exactDateStr) exactDateStr = 'CURRENT_DATE + INTERVAL \'1 day\'';

    const params = [];
    let sql = `
      SELECT
        s.show_id, s.show_time, s.base_price, s.surge_multiplier, s.available_seats,
        m.title, m.poster_url, m.genre,
        c.name as cinema_name, c.city,
        sc.name as screen_name, sc.screen_id
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.show_time >= (NOW() - INTERVAL '30 minutes')
    `;

    let paramIdx = 1;
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
    if (intent.cinema_name) {
      sql += ` AND c.name ILIKE $${paramIdx}`;
      params.push(`%${intent.cinema_name}%`);
      paramIdx++;
    }
    if (intent.language) {
      sql += ` AND m.language ILIKE $${paramIdx}`;
      params.push(`%${intent.language}%`);
      paramIdx++;
    }

    if (exactDateStr) {
      sql += ` AND s.show_time::date = ${exactDateStr}::date`;
    }

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
    orderClauses.push('s.show_time ASC', 'm.vote_average DESC');
    sql += ` ORDER BY ${orderClauses.join(', ')} LIMIT 50`;

    const showRes = await query(sql, params);

    if (showRes.rows.length === 0) {
      if (clarificationField) {
        return res.json({ 
          type: 'error', 
          message: `I didn't understand "${promptText}". Please select an option from the list or try rephrasing.`,
          context: { ...context } 
        });
      }
      const hint = intent.movie_title || intent.genre || 'movies';
      return res.json({ 
        type: 'error', 
        message: `I could not find ${hint} in ${intent.city}. Try another movie, city, or time.` 
      });
    }

    const uniqueMovies = [...new Set(showRes.rows.map(r => r.title))];
    if (!intent.movie_title && uniqueMovies.length > 0) {
      const offset = intent.current_offset || 0;
      const opts = uniqueMovies.slice(offset, offset + 4);
      if (opts.length === 0) {
        return res.json({
          type: 'error',
          message: 'No more movies found. Try searching for a different city or genre.',
          context: { ...intent, current_offset: 0 }
        });
      }
      return res.json({
        type: 'clarify',
        message: uniqueMovies.length === 1 ? 'There is only one movie playing matching your search. Please select it to confirm:' : 'I found a few movies playing. Which one would you like?',
        options: opts,
        context: { ...intent, clarification_field: 'movie_title' }
      });
    }

    const uniqueCinemas = [...new Set(showRes.rows.map(r => r.cinema_name))];
    if (!intent.cinema_name && uniqueCinemas.length > 0) {
      const offset = intent.current_offset || 0;
      const opts = uniqueCinemas.slice(offset, offset + 4);
      if (opts.length === 0) {
        return res.json({
          type: 'error',
          message: 'No more cinemas found.',
          context: { ...intent, current_offset: 0 }
        });
      }
      return res.json({
        type: 'clarify',
        message: uniqueCinemas.length === 1 ? `I found ${uniqueMovies[0]} at only one cinema. Please select it to confirm:` : `I found ${uniqueMovies[0]} at multiple cinemas. Which one do you prefer?`,
        options: opts,
        context: { ...intent, clarification_field: 'cinema_name', movie_title: uniqueMovies[0] }
      });
    }

    const uniqueTimes = [...new Set(showRes.rows.map(r => {
      const d = new Date(r.show_time);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const isToday = d.toDateString() === today.toDateString();
      const isTomorrow = d.toDateString() === tomorrow.toDateString();
      const datePrefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      return `${datePrefix}, ${d.getHours() % 12 || 12}:${d.getMinutes().toString().padStart(2, '0')} ${d.getHours() >= 12 ? 'pm' : 'am'}`;
    }))];
    if (!intent.time_of_day && uniqueTimes.length > 0) {
      const offset = intent.current_offset || 0;
      const opts = uniqueTimes.slice(offset, offset + 4);
      if (opts.length === 0) {
        return res.json({
          type: 'error',
          message: 'No more showtimes found.',
          context: { ...intent, current_offset: 0 }
        });
      }
      return res.json({
        type: 'clarify',
        message: uniqueTimes.length === 1 ? 'There is only one showtime available. Please select it to confirm:' : 'I found multiple showtimes. Which time works best?',
        options: opts,
        context: { ...intent, clarification_field: 'time_of_day', movie_title: uniqueMovies[0], cinema_name: uniqueCinemas[0] }
      });
    }

    if (!intent.quantity) {
      return res.json({
        type: 'clarify',
        message: 'How many tickets do you need? (Max 10)',
        options: ['1', '2', '3', '4'],
        context: { ...intent, clarification_field: 'quantity' }
      });
    }
    intent.quantity = Math.min(Math.max(parseInt(intent.quantity, 10), 1), 10);

    const bestShow = showRes.rows[0];
    if (bestShow.available_seats < intent.quantity) {
      return res.json({
        type: 'waitlist',
        message: `"${bestShow.title}" at ${bestShow.cinema_name} only has ${bestShow.available_seats} seats left, but you asked for ${intent.quantity}. Want me to add you to the waitlist?`,
        waitlistData: { show_id: bestShow.show_id, requested_seats: intent.quantity }
      });
    }

    await query('SELECT expire_seat_holds()');
    const seatRes = await query(`
      SELECT seat_id, row_no, seat_no, seat_type, price_multiplier
      FROM seats
      WHERE screen_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM tickets t
          JOIN bookings b ON t.booking_id = b.booking_id
          WHERE t.seat_id = seats.seat_id
            AND t.show_id = $2
            AND b.status = 'Confirmed'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM seat_holds h
          WHERE h.seat_id = seats.seat_id
            AND h.show_id = $2
            AND h.status = 'Active'
            AND h.expires_at > NOW()
        )
      ORDER BY
        CASE WHEN seat_type = 'VIP' THEN 1 WHEN seat_type = 'Premium' THEN 2 ELSE 3 END ASC,
        row_no ASC, seat_no ASC
      LIMIT $3
    `, [bestShow.screen_id, bestShow.show_id, intent.quantity]);

    if (seatRes.rows.length < intent.quantity) {
      return res.json({ type: 'error', message: 'Not enough seats are available right now.' });
    }

    const selectedSeats = seatRes.rows;
    const basePrice = parseFloat(bestShow.base_price);
    const surgeMultiplier = parseFloat(bestShow.surge_multiplier) || 1.0;
    const totalTicketPrice = selectedSeats.reduce((sum, s) => sum + (basePrice * parseFloat(s.price_multiplier) * surgeMultiplier), 0);

    let preCartSnacks = {};
    if (intent.snack) {
      const snRes = await query('SELECT snack_id as id FROM snacks WHERE name ILIKE $1 LIMIT 1', [`%${intent.snack}%`]);
      if (snRes.rows.length > 0) preCartSnacks[snRes.rows[0].id] = 1;
    }

    const finalDateObj = new Date(bestShow.show_time);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = finalDateObj.toDateString() === today.toDateString();
    const isTomorrow = finalDateObj.toDateString() === tomorrow.toDateString();
    const datePrefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : finalDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeString = `${finalDateObj.getHours() % 12 || 12}:${finalDateObj.getMinutes().toString().padStart(2, '0')} ${finalDateObj.getHours() >= 12 ? 'pm' : 'am'}`;

    res.json({
      type: 'checkout',
      message: `I found ${intent.quantity} ticket${intent.quantity === 1 ? '' : 's'} for ${bestShow.title} at ${bestShow.cinema_name} for ${datePrefix} at ${timeString}.`,
      payload: {
        show_id: bestShow.show_id,
        preSelectedSeatIds: selectedSeats.map(s => s.seat_id),
        selectedSeats,
        showInfo: bestShow,
        totalTicketPrice,
        preCartSnacks
      }
    });
  } catch (err) {
    console.error('Autonomous Agent Error:', err);
    res.status(500).json({ error: 'Agent failed to process request' });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Schedule daily TMDB updates at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('[CRON] Running daily TMDB seed script...');
    exec('node seedData.js', (error, stdout, stderr) => {
      if (error) {
        console.error(`[CRON] Error running seed script: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`[CRON] seedData stderr: ${stderr}`);
      }
      console.log(`[CRON] seedData output:\n${stdout}`);
    });
  });
  console.log('Daily TMDB cron scheduler initialized (runs at midnight)');
});
