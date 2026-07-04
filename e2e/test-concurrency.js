const API = process.env.API_URL || 'http://localhost:5000/api';

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function registerUser(email, name) {
  const result = await jsonFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password: 'password123', phone: '1111111111' }),
  });
  if (!result.ok) {
    throw new Error(`registration failed for ${email}: ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function findAvailableSeat() {
  const moviesResult = await jsonFetch('/movies');
  if (!Array.isArray(moviesResult.body)) {
    throw new Error(`movies endpoint returned ${typeof moviesResult.body}, expected array`);
  }

  for (const movie of moviesResult.body) {
    const showsResult = await jsonFetch(`/shows/movie/${movie.movie_id}`);
    if (!Array.isArray(showsResult.body)) continue;

    for (const show of showsResult.body) {
      const seatsResult = await jsonFetch(`/seats/${show.show_id}`);
      if (!Array.isArray(seatsResult.body)) continue;

      const seat = seatsResult.body.find(s => !s.is_booked && !s.is_held);
      if (seat) {
        return { show, seat };
      }
    }
  }

  throw new Error('No available seat found. Start the backend and seed the database first.');
}

async function runConcurrencyTest() {
  const tag = Date.now();
  const userA = await registerUser(`e2e_a_${tag}@example.com`, 'E2E Concurrency A');
  const userB = await registerUser(`e2e_b_${tag}@example.com`, 'E2E Concurrency B');
  const { show, seat } = await findAvailableSeat();

  console.log('Concurrent booking target:', {
    show_id: show.show_id,
    seat_id: seat.seat_id,
    seat_label: `${seat.row_no}${seat.seat_no}`,
  });

  const bookingBody = {
    show_id: show.show_id,
    seat_ids: [seat.seat_id],
    snack_ids: [],
    applyPoints: false,
    payment_method: 'Demo',
  };

  const requestA = jsonFetch('/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userA.token}` },
    body: JSON.stringify(bookingBody),
  });
  const requestB = jsonFetch('/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userB.token}` },
    body: JSON.stringify(bookingBody),
  });

  const [resultA, resultB] = await Promise.all([requestA, requestB]);
  const statuses = [resultA.status, resultB.status];
  console.log(JSON.stringify({
    statuses,
    bodies: [resultA.body, resultB.body],
  }, null, 2));

  const exactlyOneSucceeded = [resultA, resultB].filter(r => r.ok).length === 1;
  const exactlyOneConflict = statuses.filter(status => status === 409).length === 1;
  if (!exactlyOneSucceeded || !exactlyOneConflict) {
    throw new Error(`Expected one success and one 409 conflict, got ${statuses.join(', ')}`);
  }

  console.log('PASS: concurrent requests fired with Promise.all; exactly one booking succeeded');
}

runConcurrencyTest().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
