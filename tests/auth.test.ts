import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
const auth = await import('../auth.ts');

test('les NIP sont hachés avec bcrypt et vérifiés sans comparaison en clair', async () => {
  const hash = await auth.hashPin('4821');
  assert.match(hash, /^\$2[aby]\$/);
  assert.notEqual(hash, '4821');
  assert.deepEqual(await auth.verifyPin('4821', hash), { match: true, legacyPlaintext: false });
  assert.deepEqual(await auth.verifyPin('4822', hash), { match: false, legacyPlaintext: false });
});

test('un ancien NIP en clair est reconnu uniquement pour sa migration', async () => {
  assert.deepEqual(await auth.verifyPin('4821', '4821'), { match: true, legacyPlaintext: true });
  assert.deepEqual(await auth.verifyPin('1111', '4821'), { match: false, legacyPlaintext: false });
});

test('les sessions signées refusent toute altération', () => {
  const context = {
    userId: '00000000-0000-4000-8000-000000000001',
    companyId: '00000000-0000-4000-8000-000000000002',
    role: 'admin' as const,
    name: 'Test'
  };
  const { token } = auth.signSession(context);
  assert.deepEqual(auth.verifySession(token), context);
  assert.equal(auth.verifySession(`${token.slice(0, -1)}x`), null);
});

test('une application native peut authentifier ses requêtes avec Bearer', () => {
  const context = {
    userId: '00000000-0000-4000-8000-000000000001',
    companyId: '00000000-0000-4000-8000-000000000002',
    role: 'employee' as const,
    name: 'Mobile Test'
  };
  const { token } = auth.signSession(context);
  const request = { headers: { authorization: `Bearer ${token}` } } as any;
  assert.deepEqual(auth.extractAuth(request), context);
  request.headers.authorization = `Bearer ${token.slice(0, -1)}x`;
  assert.equal(auth.extractAuth(request), null);
});

test('l’annuaire utilise une référence opaque et stable', () => {
  const companyId = '00000000-0000-4000-8000-000000000002';
  const userId = '00000000-0000-4000-8000-000000000001';
  const handle = auth.createLoginHandle(companyId, userId);
  assert.equal(handle.length, 43);
  assert.equal(handle, auth.createLoginHandle(companyId, userId));
  assert.equal(handle.includes(companyId), false);
  assert.equal(handle.includes(userId), false);
});
