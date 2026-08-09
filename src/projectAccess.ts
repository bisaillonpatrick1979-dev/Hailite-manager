import type { Employee, Project } from './types';

/** Chantiers actifs qu'un utilisateur a réellement le droit de pointer. */
export function projectsAvailableForPunch(
  projects: Project[],
  employee: Pick<Employee, 'id' | 'role'> | null | undefined
): Project[] {
  if (!employee) return [];

  return projects.filter(project =>
    project.status === 'active' && (
      employee.role === 'admin' || (project.assignedEmployees || []).includes(employee.id)
    )
  );
}

/**
 * Employés retenus à la création d'un chantier. Tant que personne n'a touché
 * aux cases, toute l'équipe est assignée : un chantier créé sans assignation
 * n'apparaît chez aucun employé au moment de pointer, et rien ne le signalait.
 * Décocher reste possible — mais devient alors un choix explicite.
 */
export function effectiveProjectAssignees(
  assignable: Pick<Employee, 'id'>[],
  selected: string[],
  touched: boolean
): string[] {
  if (touched) return selected;
  return assignable.map(employee => employee.id);
}

export function canEmployeePunchProject(
  project: Project | undefined,
  employee: Pick<Employee, 'id' | 'role'> | null | undefined
): boolean {
  if (!project || !employee || project.status !== 'active') return false;
  return employee.role === 'admin' || (project.assignedEmployees || []).includes(employee.id);
}
