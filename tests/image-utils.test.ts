import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeImage } from '../src/imageUtils';

test('les logos locaux, distants et encodés sont reconnus comme images', () => {
  assert.equal(looksLikeImage('/app-icon-192.png'), true);
  assert.equal(looksLikeImage('./assets/logo.png'), true);
  assert.equal(looksLikeImage('https://cdn.example.test/logo.png'), true);
  assert.equal(looksLikeImage('data:image/png;base64,AA=='), true);
});

test('un monogramme ou une valeur vide reste un logo textuel', () => {
  assert.equal(looksLikeImage('HM'), false);
  assert.equal(looksLikeImage(''), false);
  assert.equal(looksLikeImage(null), false);
});
