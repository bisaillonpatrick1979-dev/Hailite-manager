import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const client = await readFile(new URL('../src/apiClient.ts', import.meta.url), 'utf8');

async function migrations(): Promise<string> {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = await readdir(dir);
  const parts = await Promise.all(files.map(f => readFile(new URL(f, dir), 'utf8')));
  return parts.join('\n');
}

test('la date d’un document a une colonne pour l’accueillir', async () => {
  // Sans elle, Postgres rejetait chaque devis, contrat et facture : la table
  // n'avait que created_at, qui est l'horodatage d'insertion.
  const mapper = client.slice(client.indexOf('export function documentToRow'), client.indexOf('export function rowToDocument'));
  assert.match(mapper, /date: doc\.date/);
  assert.match(await migrations(), /alter table public\.documents add column if not exists date/);
});

test('le nom du client est écrit autant qu’il est relu', async () => {
  const write = client.slice(client.indexOf('export function documentToRow'), client.indexOf('export function rowToDocument'));
  const read = client.slice(client.indexOf('export function rowToDocument'), client.indexOf('export function rowToDocument') + 900);
  assert.match(read, /clientName: r\.client_name/);
  assert.match(write, /client_name: doc\.clientName/, 'écrit, sinon le nom repart vide au rechargement');
  assert.match(await migrations(), /alter table public\.documents add column if not exists client_name/);
});

test('la taxe locale d’une facture d’employé a une colonne', async () => {
  const mapper = client.slice(client.indexOf('export function invoiceToRow'), client.indexOf('export function invoiceToRow') + 1500);
  assert.match(mapper, /local_tax_amount: i\.localTaxAmount/);
  assert.match(await migrations(), /alter table public\.payroll_entries add column if not exists local_tax_amount/);
});
