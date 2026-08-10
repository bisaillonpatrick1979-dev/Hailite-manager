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
 * Libellé d'un chantier dans une liste de sélection. Deux chantiers peuvent
 * légitimement porter le même nom — « Maison » au 335 et « Maison » au 337 de
 * la même rue. Dans un menu déroulant, ils devenaient indiscernables, et
 * l'employé risquait de pointer ses heures sur le mauvais chantier. On ajoute
 * donc de quoi les départager, mais seulement quand le nom est ambigu : sur un
 * téléphone, allonger tous les libellés nuirait plus qu'autre chose.
 */
export function projectPickerLabel(
  project: Pick<Project, 'id' | 'name' | 'clientName' | 'address'>,
  allProjects: Array<Pick<Project, 'id' | 'name'>>
): string {
  const name = project.name || '';
  const duplicated = allProjects.filter(other => (other.name || '') === name).length > 1;
  if (!duplicated) return name;

  // L'adresse distingue mieux que le client : deux chantiers du même client
  // portent souvent le même nom, alors que l'adresse est unique par définition.
  const distinguisher = (project.address || '').trim() || (project.clientName || '').trim();
  return distinguisher ? `${name} — ${distinguisher}` : name;
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
