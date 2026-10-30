// Crea y destruye exclusivamente un contenedor propio, sin leer DATABASE_URL del .env.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const name = `dayanex-test-${randomUUID()}`;
const password = randomBytes(32).toString('hex');
let server, prisma, created = false, checks = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
async function main() {
  docker(['run', '--detach', '--rm', '--name', name, '-p', '127.0.0.1::5432',
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=dayanex_test', 'postgres:16-alpine']);
  created = true;
  const dbPort = docker(['port', name, '5432/tcp']).split(':').pop();
  for (let i = 0; i < 60; i++) {
    try { docker(['exec', name, 'pg_isready', '-U', 'postgres']); break; }
    catch { if (i === 59) throw new Error('PostgreSQL de pruebas no inició.'); await pause(500); }
  }
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: 'test', VERCEL: '', PORT: String(port),
    MAIL_PROVIDER: '', GMAIL_USER: '', GMAIL_APP_PASSWORD: '', RESEND_API_KEY: '', MAIL_FROM: '', PASSWORD_RESET_URL: '',
    DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${dbPort}/dayanex_test`,
    JWT_SECRET: randomBytes(48).toString('hex'), CORS_ORIGIN: `http://127.0.0.1:${port}` };
  const run = args => execFileSync(process.execPath, args, { cwd: root, env, stdio: 'pipe', timeout: 120000 });
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  run(['node_modules/ts-node/dist/bin.js', 'prisma/seed.ts']);
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  let logs = '';
  server = spawn(process.execPath, ['dist/main.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', data => { logs = (logs + data).slice(-12000); });
  server.stderr.on('data', data => { logs = (logs + data).slice(-12000); });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    if (server.exitCode !== null || i === 119) throw new Error(`API de ensayo no inició: ${logs.replaceAll(password, '[redacted]')}`);
    await pause(500);
  }
  async function req(route, token, body, status = 200, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(origin + route, { method, signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${route}: ${response.status} ${text}`);
    checks++;
    return text ? JSON.parse(text) : null;
  }
  const users = [];
  const recoveryPage = await fetch(origin + '/recover.html');
  assert.equal(recoveryPage.status, 200);
  assert.ok((await recoveryPage.text()).includes('id="recovery"')); checks++;
  assert.ok(recoveryPage.headers.get('content-security-policy').includes("script-src 'self'")); checks++;
  assert.equal((await fetch(origin + '/recovery.js')).status, 200); checks++;
  for (let i = 0; i < 2; i++) {
    const email = `tenant-${i}-${randomUUID()}@example.com`;
    const account = await req('/api/auth/register', null, { email, password, nombre: `Ensayo ${i}`, ruc: `099999999${i}001` }, 201);
    const company = await req('/api/companies', account.accessToken, {
      ruc: `099999999${i}001`, razonSocial: `SOLO PRUEBA ${i}`, regimen: 'GENERAL' }, 201);
    users.push({ ...account, company, email });
  }
  await req('/api/auth/login', null, { ruc: users[0].company.ruc, password }, 201);
  await req('/api/auth/login', null, { ruc: users[0].company.ruc, password: 'incorrect-password' }, 401);
  await req('/api/auth/login', null, { ruc: '123', password }, 400);
  await req('/api/auth/login', null, { ruc: users[0].company.ruc, email: users[0].email, password }, 400);
  await req('/api/auth/register', null, { email: 'duplicate@example.com', nombre: 'Duplicate', password, ruc: users[0].company.ruc }, 409);
  await req('/api/auth/register', null, { email: 'escalation@example.com', nombre: 'Escalation', password, ruc: '0999999988001', platformAdmin: true }, 400);
  await req('/api/admin/users', null, undefined, 401);
  await req('/api/admin/users', users[0].accessToken, undefined, 403);
  for (const user of users) {
    user.document = await prisma.electronicDocument.create({ data: {
      companyId: user.company.id, claveAcceso: randomUUID(), ambiente: '1', tipoComprobante: 'FACTURA',
      xmlFirmado: '<soloPruebaLocal/>', hashXml: randomBytes(32).toString('hex'),
    } });
  }
  for (const [index, user] of users.entries()) {
    const own = user.company.id, other = users[1 - index].company.id;
    const list = await req('/api/companies', user.accessToken);
    assert.deepEqual(list.map(c => c.id), [own]);
    for (const route of ['/api/vouchers', '/api/ats/history', '/api/declarations/history', '/api/sri/documents', '/api/audit', '/api/tax/obligations']) {
      await req(`${route}?companyId=${other}&mes=10&anio=2026`, user.accessToken, undefined, 403);
    }
    for (const route of ['/api/declarations/generar', '/api/declarations/presentar', '/api/ats/validate', '/api/ats/generate', '/api/vouchers/import']) {
      await req(route, user.accessToken, { companyId: other, mes: 10, anio: 2026 }, 403);
    }
    await req(`/api/declarations/generar?companyId=${other}`, user.accessToken, { companyId: own, mes: 10, anio: 2026 }, 403);
    await req('/api/declarations/generar', user.accessToken, { companyId: own, mes: 10, anio: 2026 }, 201);
    await req(`/api/sri/documents/${randomUUID()}?companyId=${other}`, user.accessToken, undefined, 403);
    const foreignId = users[1 - index].document.id;
    await req(`/api/sri/documents/${foreignId}?companyId=${own}`, user.accessToken, undefined, 404);
    await req(`/api/sri/documents/${foreignId}/send`, user.accessToken, { companyId: own }, 404);
    await req(`/api/sri/documents/${foreignId}/authorization`, user.accessToken, { companyId: own }, 404);
    await req('/api/companies', null, undefined, 401);
    const login = await req('/api/auth/login', null, { email: user.email, password }, 201);
    const rotated = await req('/api/auth/refresh', null, { refreshToken: login.refreshToken }, 201);
    await req('/api/auth/refresh', null, { refreshToken: login.refreshToken }, 401);
    await req('/api/auth/logout', null, { refreshToken: rotated.refreshToken }, 201);
    await req('/api/auth/refresh', null, { refreshToken: rotated.refreshToken }, 401);
  }
  const count = docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-Atc', 'SELECT count(*) FROM tax_declarations']);
  assert.equal(count, '2', 'Solo deben existir las dos declaraciones autorizadas'); checks++;
  assert.equal(await prisma.voucher.count(), 0, 'Los intentos de importación ajena no crean registros'); checks++;
  const first = users[0];
  const xml = `<factura><infoTributaria><ruc>${first.company.ruc}</ruc><claveAcceso>solo-prueba-concurrente</claveAcceso></infoTributaria><infoFactura><fechaEmision>15/10/2026</fechaEmision><identificacionComprador>0999999999001</identificacionComprador><importeTotal>1.15</importeTotal><totalConImpuestos><totalImpuesto><codigo>2</codigo><baseImponible>1.00</baseImponible><valor>0.15</valor></totalImpuesto></totalConImpuestos></infoFactura></factura>`;
  const responses = await Promise.all([1, 2].map(() => fetch(origin + '/api/vouchers/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.accessToken}` },
    body: JSON.stringify({ companyId: first.company.id, xmlContent: xml }),
  })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 400]); checks++;
  assert.equal(await prisma.voucher.count(), 1); checks++;
  const period = { companyId: first.company.id, mes: 10, anio: 2026 };
  await req('/api/declarations/presentar', first.accessToken, period, 201);
  await Promise.all([1, 2].map(() => req('/api/declarations/generar', first.accessToken, period, 201)));
  const history = await req(`/api/declarations/history?companyId=${first.company.id}&mes=10&anio=2026`, first.accessToken);
  assert.deepEqual(history.map(h => h.version), [1, 2, 3, 4]); checks++;
  assert.equal(history[1].snapshot.estado, 'PRESENTADA_LOCAL'); checks++;
  assert.equal(history[2].previous.estado, 'PRESENTADA_LOCAL'); checks++;
  assert.equal(history[3].snapshot.estado, 'BORRADOR'); checks++;
  assert.ok(history.every(h => h.actorId && h.createdAt)); checks++;
  await req('/api/auth/forgot-password', null, { email: first.email }, 503);
  const resetToken = randomBytes(32).toString('hex');
  const firstUser = await prisma.user.findUniqueOrThrow({ where: { email: first.email } });
  await prisma.passwordReset.create({ data: { userId: firstUser.id,
    tokenHash: createHash('sha256').update(resetToken).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
  const newPassword = randomBytes(24).toString('hex');
  const resetResponses = await Promise.all([1, 2].map(() => fetch(origin + '/api/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: newPassword }),
  })));
  assert.deepEqual(resetResponses.map(r => r.status).sort(), [201, 400]); checks++;
  await req('/api/companies', first.accessToken, undefined, 401);
  await req('/api/auth/refresh', null, { refreshToken: first.refreshToken }, 401);
  await req('/api/auth/login', null, { email: first.email, password }, 401);
  await req('/api/auth/login', null, { email: first.email, password: newPassword }, 201);
  const expiredToken = randomBytes(32).toString('hex');
  await prisma.passwordReset.create({ data: { userId: firstUser.id,
    tokenHash: createHash('sha256').update(expiredToken).digest('hex'), expiresAt: new Date(Date.now() - 60000) } });
  await req('/api/auth/reset-password', null, { token: expiredToken, password: newPassword }, 400);
  // Restauración en otra base del mismo contenedor efímero, nunca sobre la original.
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: users[1].email } });
  await prisma.user.update({ where: { id: adminUser.id }, data: { platformAdmin: true } });
  const adminLogin = await req('/api/auth/login', null, { ruc: users[1].company.ruc, password }, 201);
  const adminUsers = await req('/api/admin/users', adminLogin.accessToken);
  assert.equal(adminUsers.length, 2); checks++;
  assert.ok(adminUsers.every(u => !('passwordHash' in u))); checks++;
  await req(`/api/admin/users/${adminUser.id}/status`, adminLogin.accessToken, { activo: false }, 403);
  const targetLogin = await req('/api/auth/login', null, { ruc: first.company.ruc, password: newPassword }, 201);
  await req(`/api/admin/users/${firstUser.id}/status`, adminLogin.accessToken, { activo: false }, 201);
  await req('/api/auth/me', targetLogin.accessToken, undefined, 401);
  await req('/api/auth/login', null, { ruc: first.company.ruc, password: newPassword }, 401);
  await req(`/api/admin/users/${firstUser.id}/status`, adminLogin.accessToken, { activo: true }, 201);
  await req('/api/auth/me', targetLogin.accessToken, undefined, 401);
  await req('/api/auth/login', null, { ruc: first.company.ruc, password: newPassword }, 201);
  await prisma.user.update({ where: { id: adminUser.id }, data: { platformAdmin: false } });
  await req('/api/admin/users', adminLogin.accessToken, undefined, 403);
  docker(['exec', name, 'pg_dump', '-U', 'postgres', '-d', 'dayanex_test', '-Fc', '-f', '/tmp/dayanex.dump']);
  docker(['exec', name, 'createdb', '-U', 'postgres', 'dayanex_restore']);
  docker(['exec', name, 'pg_restore', '-U', 'postgres', '-d', 'dayanex_restore', '/tmp/dayanex.dump']);
  const restored = docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_restore', '-Atc',
    'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM companies), (SELECT count(*) FROM vouchers), (SELECT count(*) FROM tax_declarations)']);
  assert.equal(restored, '2|2|1|2'); checks++;
  console.log(JSON.stringify({ result: 'PASS', checks, database: 'PostgreSQL 16 aislado', users: 2, companies: 2,
    scope: 'HTTP real: permisos, registros, login, refresh, logout; sin llamadas SRI ni producción' }));
}
main().catch(error => { console.error(error.message.replaceAll(password, '[redacted]')); process.exitCode = 1; })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([new Promise(resolve => server.once('exit', resolve)), pause(5000)]);
    }
    if (created) docker(['rm', '--force', name]);
  });
