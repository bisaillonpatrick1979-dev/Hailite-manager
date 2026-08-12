import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashAccessCode, isLocalAccessCodeHash, verifyAccessCode } from '../src/localAuth';

test('un NIP se vérifie contre sa propre empreinte', async () => {
  const stored = await hashAccessCode('4821');
  assert.equal(await verifyAccessCode('4821', stored), true);
  assert.equal(await verifyAccessCode('4822', stored), false);
  assert.equal(await verifyAccessCode('', stored), false);
});

test('deux employés avec le même NIP n’ont pas la même empreinte', async () => {
  // Sans sel aléatoire, voir deux empreintes identiques dans une sauvegarde
  // révélerait que deux personnes partagent leur NIP.
  const premier = await hashAccessCode('1234');
  const second = await hashAccessCode('1234');
  assert.notEqual(premier, second);
  assert.equal(await verifyAccessCode('1234', premier), true);
  assert.equal(await verifyAccessCode('1234', second), true);
});

test('l’empreinte porte ses paramètres, pour rester vérifiable après un durcissement', async () => {
  const stored = await hashAccessCode('4821');
  const [algorithme, tours, sel, empreinte] = stored.split('$');
  assert.equal(algorithme, 'pbkdf2-sha256');
  assert.equal(Number(tours), 210000);
  assert.ok(sel.length > 0 && empreinte.length > 0);
});

test('le NIP en clair n’apparaît nulle part dans l’empreinte', async () => {
  const stored = await hashAccessCode('4821');
  assert.ok(!stored.includes('4821'));
});

test('un NIP trop court est refusé à l’enregistrement', async () => {
  await assert.rejects(() => hashAccessCode('12'), /trop court/);
});

test('une empreinte absente ou abîmée refuse la connexion sans planter', async () => {
  for (const abimee of [undefined, null, '', 'pbkdf2-sha256$', 'pbkdf2-sha256$0$aa$bb',
                        'pbkdf2-sha256$210000$pas-du-base64!!$xx', 'bcrypt$10$autre-chose', 42]) {
    assert.equal(await verifyAccessCode('4821', abimee), false, `refusé pour ${String(abimee)}`);
  }
});

test('on reconnaît une empreinte locale d’une empreinte de serveur', async () => {
  assert.equal(isLocalAccessCodeHash(await hashAccessCode('4821')), true);
  // Format bcrypt produit par le serveur : il ne se vérifie pas ici.
  assert.equal(isLocalAccessCodeHash('$2a$10$166wvhi8o4PH1gwJqLs2I.Fm/Iwmpro'), false);
});
