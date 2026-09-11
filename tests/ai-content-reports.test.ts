import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerAiContentReportRoutes, type AiReportEntry } from '../aiContentReports';
import { signSession } from '../auth';

const identity = { userId: 'c21d3552-28a4-44c7-af3e-ffbfedb10be7', companyId: '9705d44a-77d7-4402-933c-986441591a45', role: 'employee' as const, name: 'Test only' };
const report = { response: 'Generated test response', reason: 'unsafe', provider: 'gemini', source: 'main' };

async function fixture(save: (entry: AiReportEntry) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerAiContentReportRoutes(app, save);
  app.use((_error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ code: 'INVALID_JSON' });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    post: (body: unknown, token: string | null = signSession(identity).token) => fetch(`http://127.0.0.1:${address.port}/api/ai/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    }),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  };
}

test('AI reporting requires a valid session and never saves anonymous reports', async () => {
  let writes = 0;
  const f = await fixture(async () => { writes++; });
  try {
    assert.equal((await f.post(report, null)).status, 401);
    assert.equal((await f.post(report, 'invalid')).status, 401);
    assert.equal(writes, 0);
  } finally { await f.close(); }
});

test('report identity is server-owned and attachments/context are excluded', async () => {
  const saved: AiReportEntry[] = [];
  const f = await fixture(async entry => { saved.push(entry); });
  try {
    const res = await f.post({ ...report, comment: ' Please review ', company_id: 'another tenant', user_id: 'another person', image: 'private photo', appContext: 'private payroll' });
    assert.equal(res.status, 201);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].user_id, identity.userId);
    assert.equal(saved[0].company_id, identity.companyId);
    assert.equal(saved[0].action, 'ai_content_report');
    assert.equal(saved[0].details.reviewStatus, 'new');
    assert.equal(saved[0].details.comment, 'Please review');
    assert.doesNotMatch(JSON.stringify(saved), /another tenant|another person|private photo|private payroll/);
    assert.equal((await res.json()).reportId, saved[0].id);
  } finally { await f.close(); }
});

test('invalid or oversized reports are rejected without a write', async () => {
  let writes = 0;
  const f = await fixture(async () => { writes++; });
  try {
    for (const invalid of [null, [], {}, { ...report, response: ' ' }, { ...report, response: 'x'.repeat(16001) }, { ...report, comment: 'x'.repeat(1001) }, { ...report, comment: {} }, { ...report, reason: 'unknown' }, { ...report, provider: 'unknown' }, { ...report, source: 'unknown' }]) {
      assert.equal((await f.post(invalid)).status, 400);
    }
    assert.equal(writes, 0);
  } finally { await f.close(); }
});

test('failed durable storage never returns a receipt or private error details', async () => {
  const f = await fixture(async () => { throw new Error('private database detail'); });
  try {
    const res = await f.post(report);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { code: 'REPORT_NOT_SAVED' });
  } finally { await f.close(); }
});

test('report submission is limited per authenticated user', async () => {
  let writes = 0;
  const f = await fixture(async () => { writes++; });
  try {
    for (let i = 0; i < 15; i++) assert.equal((await f.post(report)).status, 201);
    assert.equal((await f.post(report)).status, 429);
    assert.equal(writes, 15);
  } finally { await f.close(); }
});
