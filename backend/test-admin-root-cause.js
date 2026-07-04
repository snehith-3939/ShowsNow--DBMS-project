const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const PORT = process.env.TEST_PORT || 5101;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const tag = `admin_root_${Date.now()}`;

function tokenFor(user, roleOverride) {
  return jwt.sign(
    {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: roleOverride || user.role,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function httpJson(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function waitForServer(child) {
  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
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

async function createUser(role) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, phone, role)
     VALUES ($1, $2, 'test-hash', '9999999999', $3)
     RETURNING user_id, name, email, role`,
    [`${role} ${tag}`, `${role}_${tag}@example.com`, role]
  );
  return rows[0];
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%_${tag}@example.com`]);
}

async function main() {
  const adminUser = await createUser('admin');
  const normalUser = await createUser('user');
  const staleAdminToken = tokenFor(adminUser, 'user');
  const normalUserToken = tokenFor(normalUser);

  const server = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT, JWT_SECRET },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => process.stdout.write(`[server] ${data}`));
  server.stderr.on('data', data => process.stdout.write(`[server:err] ${data}`));

  try {
    await waitForServer(server);

    console.log('\nTEST: admin dashboard data uses database role, not stale JWT role');
    const stats = await httpJson('/admin/stats', staleAdminToken);
    const waitlists = await httpJson('/admin/waitlists', staleAdminToken);
    const nonAdmin = await httpJson('/admin/stats', normalUserToken);

    const output = {
      staleAdminJwtRole: 'user',
      databaseRoleForSameUser: adminUser.role,
      statsStatus: stats.status,
      statsBodyKeys: Object.keys(stats.body),
      totalRevenueValue: stats.body.totalRevenue,
      totalRevenueIsNumeric: Number.isFinite(Number(stats.body.totalRevenue)),
      waitlistsStatus: waitlists.status,
      waitlistsIsArray: Array.isArray(waitlists.body),
      waitlistsSampleType: Array.isArray(waitlists.body) ? 'array' : typeof waitlists.body,
      nonAdminStatus: nonAdmin.status,
      nonAdminBody: nonAdmin.body,
    };
    console.log(JSON.stringify(output, null, 2));

    const ok = stats.status === 200 &&
      Object.prototype.hasOwnProperty.call(stats.body, 'totalRevenue') &&
      Number.isFinite(Number(stats.body.totalRevenue)) &&
      waitlists.status === 200 &&
      Array.isArray(waitlists.body) &&
      nonAdmin.status === 403;

    if (!ok) {
      throw new Error('admin root-cause regression failed');
    }

    console.log('\nPASS: admin NaN/waitlist response-shape root cause verified');
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
