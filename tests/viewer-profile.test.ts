import assert from 'node:assert/strict';
import test from 'node:test';
import type { Employee } from '../src/types';
import { resolveViewerProfile } from '../src/viewerProfile';

const ACCEPTED = '2026.08';

const employee = (over: Partial<Employee> = {}): Employee => ({
  id: 'u1',
  name: 'Patrick Bisaillon',
  nip: '',
  role: 'admin',
  hourlyRate: 0,
  workerType: '',
  asNumber: '',
  phone: '',
  address: '',
  hireDate: '',
  avatar: '',
  level: 1,
  xp: 0,
  ...over
} as Employee);

const consented = employee({
  privacyNoticeVersion: ACCEPTED,
  privacyNoticeAcknowledgedAt: '2026-08-09T21:37:37Z',
  locationNoticeAcknowledgedAt: '2026-08-09T21:37:37Z'
});

test('la ligne fraîche est utilisée quand elle est disponible', () => {
  const profile = resolveViewerProfile([consented], { userId: 'u1' }, 'admin', null);
  assert.equal(profile?.privacyNoticeVersion, ACCEPTED);
  assert.equal(profile?.name, 'Patrick Bisaillon');
});

test('le consentement de la session survit à une hydratation sans la ligne du visiteur', () => {
  // Cas réel : l'employé ne lit que sa propre ligne, et elle manque à l'appel.
  const profile = resolveViewerProfile([], { userId: 'u1', name: 'Patrick' }, 'admin', consented);
  assert.equal(profile?.privacyNoticeVersion, ACCEPTED, 'l’avis ne doit pas se rouvrir');
  assert.equal(profile?.locationNoticeAcknowledgedAt, '2026-08-09T21:37:37Z');
});

test('une lecture partie avant l’enregistrement n’efface pas l’accusé de réception', () => {
  // L'hydratation revient avec des colonnes encore vides : la session gagne.
  const stale = employee({ privacyNoticeVersion: undefined });
  const profile = resolveViewerProfile([stale], { userId: 'u1' }, 'admin', consented);
  assert.equal(profile?.privacyNoticeVersion, ACCEPTED);
});

test('une lecture ancienne non vide ne remplace pas une acceptation plus récente', () => {
  const stale = employee({
    privacyNoticeVersion: '2025.01',
    privacyNoticeAcknowledgedAt: '2025-01-02T08:00:00Z',
    locationNoticeAcknowledgedAt: '2025-01-02T08:00:00Z'
  });
  const profile = resolveViewerProfile([stale], { userId: 'u1' }, 'admin', consented);
  assert.equal(profile?.privacyNoticeVersion, ACCEPTED);
  assert.equal(profile?.privacyNoticeAcknowledgedAt, '2026-08-09T21:37:37Z');
  assert.equal(profile?.locationNoticeAcknowledgedAt, '2026-08-09T21:37:37Z');
});

test('un employé qui n’a jamais accepté voit bien l’avis', () => {
  const neverAccepted = employee({ id: 'u2', name: 'Alex Tremblay', role: 'employee' });
  const profile = resolveViewerProfile([neverAccepted], { userId: 'u2' }, 'employee', null);
  assert.equal(profile?.privacyNoticeVersion, undefined, 'sinon l’avis ne serait jamais présenté');
});

test('le consentement d’un autre compte ne déteint pas sur le nouveau', () => {
  // Déconnexion puis connexion avec un employé : la session précédente porte un
  // autre identifiant et ne doit rien transmettre.
  const profile = resolveViewerProfile([], { userId: 'u2', name: 'Alex' }, 'employee', consented);
  assert.equal(profile?.privacyNoticeVersion, undefined);
  assert.equal(profile?.name, 'Alex');
});

test('le rôle vient toujours du jeton vérifié, jamais de la session', () => {
  const profile = resolveViewerProfile([consented], { userId: 'u1' }, 'employee', consented);
  assert.equal(profile?.role, 'employee', 'une session admin périmée ne doit pas élever le rôle');
});

test('aucun profil sans visiteur identifié', () => {
  assert.equal(resolveViewerProfile([consented], null, 'admin', consented), null);
});
