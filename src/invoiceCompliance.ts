// ---------------------------------------------------------------------------
// Conformité avant facturation — le chantier doit être fini pour être facturé
// ---------------------------------------------------------------------------
// Un employé ou un sous-traitant ne peut plus envoyer sa facture tant qu'il
// reste une tâche ouverte sur un des chantiers qu'elle couvre. C'est la
// dernière porte avant que l'argent circule : une fois la facture partie, plus
// personne ne retourne cocher la case, et le chantier ne peut pas être fermé.
//
// TROIS CHOIX QUI COMPTENT
//
// 1. Un chantier sans aucune tâche ne bloque rien. Beaucoup de petits travaux
//    n'ont pas de liste ; exiger une liste vide reviendrait à empêcher toute
//    facturation sur ces chantiers-là.
//
// 2. Un pointage qui renvoie à un chantier supprimé ne bloque pas non plus. Le
//    travailleur ne peut rien y faire, et on ne va pas retenir sa paie pour une
//    ligne effacée par le bureau. Le cas est signalé pour que la gestion le
//    voie, sans piéger la personne.
//
// 3. La porte s'applique à l'envoi par le travailleur. L'administration garde
//    la main : elle peut toujours traiter une facture, parce qu'une tâche peut
//    devenir impossible — matériau discontinué, client qui change d'idée — et
//    que quelqu'un doit pouvoir trancher.

import type { Invoice, Project, ProjectTask, PunchSession } from './types';

export interface OpenTaskGroup {
  projectId: string;
  projectName: string;
  openTasks: ProjectTask[];
  criticalCount: number;
}

export interface InvoiceCompliance {
  /** Vrai quand la facture peut partir. */
  ready: boolean;
  /** Chantiers couverts par la facture, via ses pointages. */
  projectIds: string[];
  /** Uniquement les chantiers où il reste quelque chose à cocher. */
  groups: OpenTaskGroup[];
  totalOpenTasks: number;
  /** Chantiers cités par un pointage mais introuvables : signalés, non bloquants. */
  unknownProjectIds: string[];
}

/** Chantiers couverts par une facture, déduits de ses pointages. */
export function projectIdsForInvoice(invoice: Pick<Invoice, 'sessionIds'>, punchSessions: PunchSession[]): string[] {
  const wanted = new Set(invoice.sessionIds || []);
  const found: string[] = [];
  for (const session of punchSessions) {
    if (!wanted.has(session.id)) continue;
    const projectId = session.projectId || '';
    if (projectId && !found.includes(projectId)) found.push(projectId);
  }
  return found;
}

export function openTasksOf(project: Pick<Project, 'tasks'>): ProjectTask[] {
  return (project.tasks || []).filter(task => !task.done);
}

/**
 * Ce qui empêche la facture de partir. On renvoie les tâches elles-mêmes et non
 * un simple compte : le travailleur doit savoir quoi aller cocher, sur quel
 * chantier, sans avoir à chercher.
 */
export function checkInvoiceCompliance(
  invoice: Pick<Invoice, 'sessionIds'>,
  punchSessions: PunchSession[],
  projects: Project[]
): InvoiceCompliance {
  const projectIds = projectIdsForInvoice(invoice, punchSessions);
  const groups: OpenTaskGroup[] = [];
  const unknownProjectIds: string[] = [];

  for (const projectId of projectIds) {
    const project = projects.find(candidate => candidate.id === projectId);
    if (!project) {
      unknownProjectIds.push(projectId);
      continue;
    }
    const openTasks = openTasksOf(project);
    if (openTasks.length === 0) continue;
    groups.push({
      projectId,
      projectName: project.name || '',
      openTasks,
      criticalCount: openTasks.filter(task => task.priority === 'critique').length
    });
  }

  const totalOpenTasks = groups.reduce((sum, group) => sum + group.openTasks.length, 0);
  return {
    ready: totalOpenTasks === 0,
    projectIds,
    groups,
    totalOpenTasks,
    unknownProjectIds
  };
}

export interface ProjectClosureCheck {
  /** Vrai quand le chantier peut passer à « terminé ». */
  ready: boolean;
  openTasks: ProjectTask[];
  /** Pointages encore ouverts : quelqu'un est peut-être encore sur place. */
  openPunches: PunchSession[];
  /** Factures encore au brouillon : le travail n'a pas été facturé. */
  draftInvoices: Invoice[];
  /** Factures envoyées mais pas payées : signalé, jamais bloquant. */
  unpaidInvoices: Invoice[];
}

/**
 * Ce qui empêche de fermer un chantier.
 *
 * Une tâche ouverte bloque : c'est la raison d'être de la porte. Un pointage
 * encore en cours bloque aussi — fermer le chantier sous les pieds de
 * quelqu'un qui y travaille fausserait ses heures.
 *
 * Une facture impayée ne bloque pas : le paiement dépend du client, pas du
 * chantier, et un entrepreneur doit pouvoir clore ses travaux avant d'être
 * payé. On le signale, c'est tout.
 */
export function checkProjectClosure(
  project: Project,
  punchSessions: PunchSession[],
  invoices: Invoice[]
): ProjectClosureCheck {
  const openTasks = openTasksOf(project);
  const openPunches = punchSessions.filter(
    session => session.projectId === project.id && session.endTime === null
  );

  const sessionIdsOfProject = new Set(
    punchSessions.filter(session => session.projectId === project.id).map(session => session.id)
  );
  const touchesProject = (invoice: Invoice) =>
    (invoice.sessionIds || []).some(id => sessionIdsOfProject.has(id));

  const draftInvoices = invoices.filter(invoice => invoice.status === 'draft' && touchesProject(invoice));
  const unpaidInvoices = invoices.filter(invoice => invoice.status === 'pending' && touchesProject(invoice));

  return {
    ready: openTasks.length === 0 && openPunches.length === 0,
    openTasks,
    openPunches,
    draftInvoices,
    unpaidInvoices
  };
}

/**
 * Phrase unique décrivant ce qui manque, en français ou en anglais. Centralisée
 * ici pour que le bouton, l'infobulle et le message de refus disent exactement
 * la même chose — un écran qui explique autrement qu'un autre finit par ne plus
 * être cru.
 */
export function complianceSummary(compliance: InvoiceCompliance, language: 'FR' | 'EN'): string {
  if (compliance.ready) {
    return language === 'FR'
      ? 'Toutes les tâches du chantier sont cochées.'
      : 'All site tasks are checked.';
  }
  const tasks = compliance.totalOpenTasks;
  const sites = compliance.groups.length;
  if (language === 'FR') {
    return sites === 1
      ? `${tasks} tâche${tasks > 1 ? 's' : ''} à terminer sur « ${compliance.groups[0].projectName} ».`
      : `${tasks} tâches à terminer sur ${sites} chantiers.`;
  }
  return sites === 1
    ? `${tasks} task${tasks > 1 ? 's' : ''} left on “${compliance.groups[0].projectName}”.`
    : `${tasks} tasks left across ${sites} sites.`;
}
