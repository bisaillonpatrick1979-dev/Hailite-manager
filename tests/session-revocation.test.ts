import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createSessionMiddleware, signSession, type AuthedRequest, type SessionAccount } from '../auth';

const context = { userId: '00000000-0000-4000-8000-000000000001', companyId: '00000000-0000-4000-8000-000000000002', role: 'admin' as const, name: 'Fixture' };
const initial: SessionAccount = { id: context.userId, company_id: context.companyId, full_name: context.name, role: 'admin', is_active: true };

async function fixture(required = true) {
  let account: SessionAccount | null = { ...initial };
  let unavailable = false;
  const app = express();
  app.get('/test', createSessionMiddleware(required, async () => {
    if (unavailable) throw new Error('private database detail');
    return account;
  }), (req: AuthedRequest, res) => { res.json({ role: req.auth?.role || 'anonymous' }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  // Reuse exactly the same valid token before and after the database changes.
  const token = signSession(context).token;
  return {
    get: (headers: Record<string, string> = { Authorization: `Bearer ${token}` }) => fetch(`http://127.0.0.1:${address.port}/test`, { headers }),
    setAccount: (next: SessionAccount | null) => { account = next; },
    failLookup: () => { unavailable = true; },
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  };
}

test('deleting or deactivating an account revokes its existing valid token on the next request', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.get()).status, 200);
    f.setAccount(null);
    assert.equal((await f.get()).status, 401);
    f.setAccount({ ...initial, is_active: false });
    assert.equal((await f.get()).status, 401);
  } finally { await f.close(); }
});

test('a previous administrator token uses current permissions after demotion', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await (await f.get()).json(), { role: 'admin' });
    f.setAccount({ ...initial, role: 'employee' });
    assert.deepEqual(await (await f.get()).json(), { role: 'employee' });
  } finally { await f.close(); }
});

test('shortened access expiry and another organization both invalidate a session', async () => {
  const f = await fixture();
  try {
    f.setAccount({ ...initial, access_expires_at: new Date(Date.now() - 1000).toISOString() });
    assert.equal((await f.get()).status, 401);
    f.setAccount({ ...initial, company_id: 'different-company' });
    assert.equal((await f.get()).status, 401);
  } finally { await f.close(); }
});

test('database failure cannot fall back to the stale token or leak the database error', async () => {
  const f = await fixture();
  try {
    f.failLookup();
    const response = await f.get();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'AUTH_UNAVAILABLE');
  } finally { await f.close(); }
});

test('optional authentication also refuses a revoked session but allows anonymous local requests', async () => {
  const f = await fixture(false);
  try {
    assert.deepEqual(await (await f.get({})).json(), { role: 'anonymous' });
    f.setAccount(null);
    assert.equal((await f.get()).status, 401);
  } finally { await f.close(); }
});

test('malformed cookies produce an authentication response instead of a crash', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.get({ Cookie: 'gcp_session=%broken' })).status, 401);
  } finally { await f.close(); }
});
