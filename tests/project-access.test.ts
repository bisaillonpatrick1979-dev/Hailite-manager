import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canEmployeePunchProject, effectiveProjectAssignees, projectPickerLabel, projectsAvailableForPunch } from '../src/projectAccess.ts';
import type { Employee, Project } from '../src/types.ts';

const employee = { id: 'employee-1', role: 'employee' } as Employee;
const admin = { id: 'admin-1', role: 'admin' } as Employee;
const projects: Project[] = [
  { id: 'assigned', name: 'Assigné', clientName: '', address: '', latitude: 0, longitude: 0, radius: 100, status: 'active', assignedEmployees: ['employee-1'] },
  { id: 'other', name: 'Autre', clientName: '', address: '', latitude: 0, longitude: 0, radius: 100, status: 'active', assignedEmployees: ['employee-2'] },
  { id: 'done', name: 'Terminé', clientName: '', address: '', latitude: 0, longitude: 0, radius: 100, status: 'completed', assignedEmployees: ['employee-1'] }
];

test('un employé voit seulement ses chantiers actifs dans le punch', () => {
  assert.deepEqual(projectsAvailableForPunch(projects, employee).map(project => project.id), ['assigned']);
  assert.equal(canEmployeePunchProject(projects[0], employee), true);
  assert.equal(canEmployeePunchProject(projects[1], employee), false);
  assert.equal(canEmployeePunchProject(projects[2], employee), false);
});

test('un administrateur voit tous les chantiers actifs', () => {
  assert.deepEqual(projectsAvailableForPunch(projects, admin).map(project => project.id), ['assigned', 'other']);
});

test('la création manuelle transmet réellement les travailleurs choisis', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /assignedEmployees:\s*\[\.\.\.newProjectAssignees\]/);
  assert.doesNotMatch(app, /name:\s*newProjectForm\.name[\s\S]{0,500}assignedEmployees:\s*\[\]/);
});

test('sans intervention, toute l’équipe est assignée au nouveau chantier', () => {
  // Le piège corrigé : créer un chantier sans cocher personne le rendait
  // invisible à tous les employés au moment de pointer.
  const team = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(effectiveProjectAssignees(team, [], false), ['a', 'b', 'c']);
});

test('un choix explicite est respecté, y compris vide', () => {
  const team = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(effectiveProjectAssignees(team, ['b'], true), ['b']);
  assert.deepEqual(effectiveProjectAssignees(team, [], true), []);
});

test('un chantier au nom unique garde un libellé court', () => {
  const all = [{ id: 'p1', name: 'Maison' }, { id: 'p2', name: 'Garage' }];
  const label = projectPickerLabel(
    { id: 'p1', name: 'Maison', clientName: 'Pat', address: '335 Grégoire' }, all
  );
  assert.equal(label, 'Maison');
});

test('deux chantiers du même nom sont départagés par leur adresse', () => {
  // Cas réel : « Maison » au 335 et « Maison » au 337 de la même rue. Sans
  // distinction, l'employé pointe ses heures sur le mauvais chantier.
  const all = [{ id: 'p1', name: 'Maison' }, { id: 'p2', name: 'Maison' }];
  assert.equal(
    projectPickerLabel({ id: 'p1', name: 'Maison', clientName: 'Pat', address: '335 Grégoire' }, all),
    'Maison — 335 Grégoire'
  );
  assert.equal(
    projectPickerLabel({ id: 'p2', name: 'Maison', clientName: 'Pateick', address: '337 Grégoire' }, all),
    'Maison — 337 Grégoire'
  );
});

test('sans adresse, le nom du client sert de repère', () => {
  const all = [{ id: 'p1', name: 'Kdldlkdkdx' }, { id: 'p2', name: 'Kdldlkdkdx' }];
  assert.equal(
    projectPickerLabel({ id: 'p2', name: 'Kdldlkdkdx', clientName: 'Labelle construction', address: '' }, all),
    'Kdldlkdkdx — Labelle construction'
  );
});

test('sans rien pour départager, on n’invente pas de libellé', () => {
  const all = [{ id: 'p1', name: 'Maison' }, { id: 'p2', name: 'Maison' }];
  assert.equal(projectPickerLabel({ id: 'p2', name: 'Maison', clientName: '', address: '' }, all), 'Maison');
});
