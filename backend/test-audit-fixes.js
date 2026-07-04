const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const PORT = process.env.TEST_PORT || 5102;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'audit_test_secret';
const tag = `audit_${Date.now()}`;

function makeToken(user) {
  return jwt.sign(
    { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function httpJson(pathname, options = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function waitForServer(child) {
  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(`${BASE_URL}/snacks`);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw lastError || new Error('server did not start');
}

async function applyCurrentFunctions() {
  const functionsSql = fs.readFileSync(path.join(__dirname, '../database/functions.sql'), 'utf8');
  await pool.query(functionsSql);
}

async function createFixture() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const city = `AuditCity-${tag}`;
    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, city, role)
       VALUES ($1, $2, 'test-hash', '9999999999', $3, 'user')
       RETURNING user_id, name, email, role`,
      [`Audit User ${tag}`, `${tag}@example.com`, city]
    );
    const otherRes = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, city, role)
       VALUES ($1, $2, 'test-hash', '8888888888', $3, 'user')
       RETURNING user_id, name, email, role`,
      [`Audit Other ${tag}`, `${tag}-other@example.com`, city]
    );
    const thirdRes = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, city, role)
       VALUES ($1, $2, 'test-hash', '7777777777', $3, 'user')
       RETURNING user_id, name, email, role`,
      [`Audit Third ${tag}`, `${tag}-third@example.com`, city]
    );
    const cinemaRes = await client.query(
      `INSERT INTO cinemas (name, city, address)
       VALUES ($1, $2, 'Audit Test Address')
       RETURNING cinema_id`,
      [`Audit Cinema ${tag}`, city]
    );
    const movieRes = await client.query(
      `INSERT INTO movies (title, genre, duration_mins, language, vote_average, vote_count)
       VALUES ($1, 'Action', 120, 'English', 9.9, 1)
       RETURNING movie_id, title`,
      [`Audit Booking Movie ${tag}`]
    );
    const aiMovieRes = await client.query(
      `INSERT INTO movies (title, genre, duration_mins, language, vote_average, vote_count)
       VALUES ($1, 'Action', 120, 'English', 9.9, 1)
       RETURNING movie_id, title`,
      [`Audit AI Movie ${tag}`]
    );
    const cinemaId = cinemaRes.rows[0].cinema_id;
    const movieId = movieRes.rows[0].movie_id;
    const aiMovieId = aiMovieRes.rows[0].movie_id;

    async function makeShow(label, seatCount, showMovieId = movieId) {
      const screenRes = await client.query(
        `INSERT INTO screens (cinema_id, name, total_seats)
         VALUES ($1, $2, $3)
         RETURNING screen_id`,
        [cinemaId, `Audit Screen ${label} ${tag}`, seatCount]
      );
      const screenId = screenRes.rows[0].screen_id;
      const seats = [];
      for (let i = 1; i <= seatCount; i += 1) {
        const seatRes = await client.query(
          `INSERT INTO seats (screen_id, row_no, seat_no, seat_type, price_multiplier)
           VALUES ($1, 'A', $2, 'VIP', 1.00)
           RETURNING seat_id, row_no, seat_no`,
          [screenId, i]
        );
        seats.push(seatRes.rows[0]);
      }
      const showRes = await client.query(
        `INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats)
         VALUES ($1, $2, NOW() + INTERVAL '7 days' + ($3 || ' minutes')::interval, 2000.00, $4)
         RETURNING show_id`,
        [showMovieId, screenId, label === 'A' ? 1 : label === 'B' ? 2 : 3, seatCount]
      );
      return { screenId, showId: showRes.rows[0].show_id, seats };
    }

    const showA = await makeShow('A', 1);
    const showB = await makeShow('B', 1);
    const aiShow = await makeShow('AI', 3, aiMovieId);

    const seedBookingRes = await client.query(
      `INSERT INTO bookings (user_id, show_id, total_amount, status)
       VALUES ($1, $2, 0, 'Pending')
       RETURNING booking_id`,
      [userRes.rows[0].user_id, showA.showId]
    );
    await client.query(
      `INSERT INTO loyalty_ledger (user_id, booking_id, points_earned, created_at, expires_at)
       VALUES ($1, $2, 1000, clock_timestamp() - INTERVAL '1 minute', NOW() + INTERVAL '60 days')`,
      [userRes.rows[0].user_id, seedBookingRes.rows[0].booking_id]
    );

    await client.query('COMMIT');
    return {
      city,
      movieTitle: aiMovieRes.rows[0].title,
      user: userRes.rows[0],
      otherUser: otherRes.rows[0],
      thirdUser: thirdRes.rows[0],
      showA,
      showB,
      aiShow,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${tag}%`]);
  await pool.query('DELETE FROM cinemas WHERE name LIKE $1', [`Audit Cinema ${tag}`]);
  await pool.query('DELETE FROM movies WHERE title LIKE $1', [`Audit % Movie ${tag}`]);
}

async function main() {
  await applyCurrentFunctions();
  const fixture = await createFixture();
  const token = makeToken(fixture.user);
  const otherToken = makeToken(fixture.otherUser);
  const thirdToken = makeToken(fixture.thirdUser);

  const server = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT, JWT_SECRET, CORS_ORIGINS: 'http://localhost:5173' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => process.stdout.write(`[server] ${data}`));
  server.stderr.on('data', data => process.stdout.write(`[server:err] ${data}`));

  try {
    await waitForServer(server);

    console.log('\nTEST 1: profile GET and PUT persist to DB');
    const profileBefore = await httpJson('/user/profile', { headers: { Authorization: `Bearer ${token}` } });
    const profileUpdate = await httpJson('/user/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `Updated ${tag}`, phone: '1234567890', city: fixture.city }),
    });
    const profileAfter = await httpJson('/user/profile', { headers: { Authorization: `Bearer ${token}` } });
    console.log(JSON.stringify({
      beforeStatus: profileBefore.status,
      updateStatus: profileUpdate.status,
      afterStatus: profileAfter.status,
      afterName: profileAfter.body.name,
      afterPhone: profileAfter.body.phone,
    }, null, 2));

    console.log('\nTEST 2: concurrent loyalty redemption rejects overspend');
    const bookingBodies = [
      { show_id: fixture.showA.showId, seat_ids: [fixture.showA.seats[0].seat_id], snack_ids: [], applyPoints: true, payment_method: 'Demo' },
      { show_id: fixture.showB.showId, seat_ids: [fixture.showB.seats[0].seat_id], snack_ids: [], applyPoints: true, payment_method: 'Demo' },
    ];
    const loyaltyResults = await Promise.all(bookingBodies.map(body =>
      httpJson('/bookings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
    ));
    const balanceAfter = await httpJson('/user/loyalty', { headers: { Authorization: `Bearer ${token}` } });
    console.log(JSON.stringify({
      statuses: loyaltyResults.map(r => r.status),
      bodies: loyaltyResults.map(r => r.body),
      balanceAfter: balanceAfter.body.balance,
    }, null, 2));

    console.log('\nTEST 3: bot rejects out-of-scope prompt even with city context');
    const outOfScope = await httpJson('/autonomous-agent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'tell me a joke', context: { city: fixture.city } }),
    });
    console.log(JSON.stringify(outOfScope.body, null, 2));

    console.log('\nTEST 4: AI concierge excludes active held seats');
    const heldSeat = fixture.aiShow.seats[0];
    const hold = await httpJson('/seat-holds', {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({ show_id: fixture.aiShow.showId, seat_ids: [heldSeat.seat_id] }),
    });
    const agent = await httpJson('/autonomous-agent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${thirdToken}` },
      body: JSON.stringify({
        prompt: `Book 1 ticket for ${fixture.movieTitle} in ${fixture.city} tonight`,
        context: { city: fixture.city, movie_title: fixture.movieTitle, quantity: 1, time_of_day: 'tonight' },
      }),
    });
    const selectedSeatIds = agent.body.payload?.preSelectedSeatIds || [];
    console.log(JSON.stringify({
      holdStatus: hold.status,
      heldSeatId: heldSeat.seat_id,
      agentStatus: agent.status,
      agentType: agent.body.type,
      selectedSeatIds,
      heldSeatSelected: selectedSeatIds.includes(heldSeat.seat_id),
    }, null, 2));

    const checks = {
      profileOk: profileBefore.status === 200 &&
        profileUpdate.status === 200 &&
        profileAfter.body.name === `Updated ${tag}` &&
        profileAfter.body.phone === '1234567890',
      loyaltyOk: loyaltyResults.filter(r => r.status === 200).length === 1 &&
        loyaltyResults.filter(r => r.status === 409).length === 1 &&
        Number(balanceAfter.body.balance) >= 0,
      outOfScopeOk: outOfScope.status === 200 &&
        outOfScope.body.type === 'out_of_scope' &&
        /only help with booking movie tickets/i.test(outOfScope.body.message),
      aiHoldOk: hold.status === 200 &&
        agent.status === 200 &&
        agent.body.type === 'checkout' &&
        !selectedSeatIds.includes(heldSeat.seat_id),
    };
    console.log('\nCHECKS:', JSON.stringify(checks, null, 2));
    if (!Object.values(checks).every(Boolean)) {
      throw new Error(`audit fix checks failed: ${JSON.stringify(checks)}`);
    }

    console.log('\nPASS: audit fixes verified');
  } finally {
    server.kill('SIGTERM');
    await cleanup();
    await pool.end();
  }
}

main().catch(async err => {
  console.error('\nFAIL:', err);
  try {
    await cleanup();
    await pool.end();
  } catch {}
  process.exit(1);
});
