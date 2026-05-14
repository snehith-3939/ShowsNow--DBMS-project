const testEmail = `test_${Date.now()}@example.com`;

async function run() {
  const base = 'http://localhost:5000';

  // 1. Register
  console.log('\n--- 1. Register ---');
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: testEmail, password: 'password123' })
  });
  const regData = await regRes.json();
  console.log('Status:', regRes.status);
  console.log('Token received:', !!regData.token);
  console.log('User:', regData.user);

  if (!regData.token) { console.error('Registration failed!'); return; }
  const token = regData.token;

  // 2. Login with wrong password
  console.log('\n--- 2. Login (wrong password) ---');
  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'wrongpass' })
  });
  const badData = await badLogin.json();
  console.log('Status (expect 401):', badLogin.status, '| Error:', badData.error);

  // 3. Login correct
  console.log('\n--- 3. Login (correct password) ---');
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'password123' })
  });
  const loginData = await loginRes.json();
  console.log('Status:', loginRes.status);
  console.log('Token received:', !!loginData.token);

  // 4. GET /api/auth/me
  console.log('\n--- 4. GET /api/auth/me ---');
  const meRes = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meData = await meRes.json();
  console.log('Status:', meRes.status, '| User:', meData.name, meData.email);

  // 5. Try /api/bookings without token
  console.log('\n--- 5. POST /api/bookings (no token, expect 401) ---');
  const noAuthRes = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ show_id: 'fake', seat_ids: [] })
  });
  const noAuthData = await noAuthRes.json();
  console.log('Status (expect 401):', noAuthRes.status, '| Error:', noAuthData.error);

  console.log('\n✅ All auth tests passed!');
}

run().catch(console.error);
