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

export function canEmployeePunchProject(
  project: Project | undefined,
  employee: Pick<Employee, 'id' | 'role'> | null | undefined
): boolean {
  if (!project || !employee || project.status !== 'active') return false;
  return employee.role === 'admin' || (project.assignedEmployees || []).includes(employee.id);
}
