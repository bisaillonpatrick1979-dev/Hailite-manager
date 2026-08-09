import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canEmployeePunchProject, effectiveProjectAssignees, projectsAvailableForPunch } from '../src/projectAccess.ts';
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
