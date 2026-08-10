// ---------------------------------------------------------------------------
// Ce qui reste à cocher avant d'envoyer une facture
// ---------------------------------------------------------------------------
// Un bouton grisé sans explication est le pire des refus : le travailleur est
// sur un chantier, il veut être payé, et l'application dit non sans dire
// pourquoi. On nomme donc chaque tâche restante et le chantier où elle se
// trouve, avec un lien pour y aller.

import React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import type { InvoiceCompliance } from '../invoiceCompliance';
import { complianceSummary } from '../invoiceCompliance';

interface Props {
  compliance: InvoiceCompliance;
  currentLanguage: 'FR' | 'EN';
  /** Ouvre la liste de tâches du chantier concerné, quand c'est possible. */
  onOpenProject?: (projectId: string) => void;
  compact?: boolean;
}

export default function InvoiceComplianceNotice({
  compliance, currentLanguage, onOpenProject, compact = false
}: Props) {
  const isFrench = currentLanguage === 'FR';
  const t = (fr: string, en: string) => (isFrench ? fr : en);

  if (compliance.ready) {
    if (compact) return null;
    return (
      <p className="flex items-start gap-2 rounded-xl border border-green-500/25 bg-green-500/5 p-3 text-xs font-semibold text-green-300">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {complianceSummary(compliance, currentLanguage)}
      </p>
    );
  }

  return (
    <div
      className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-left"
      role="status"
    >
      <p className="flex items-start gap-2 text-xs font-black text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {t('Le chantier n’est pas terminé', 'The site is not finished')} — {complianceSummary(compliance, currentLanguage)}
        </span>
      </p>

      <p className="text-[11px] leading-relaxed text-amber-200/80">
        {t(
          'Cochez chaque tâche du chantier avant d’envoyer la facture. C’est ce qui permet ensuite de fermer le chantier.',
          'Check every site task before sending the invoice. That is what allows the site to be closed afterwards.'
        )}
      </p>

      {compliance.groups.map(group => (
        <div key={group.projectId} className="rounded-lg border border-gray-850 bg-gray-950 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">{group.projectName}</span>
            {onOpenProject && (
              <button
                type="button"
                onClick={() => onOpenProject(group.projectId)}
                className="inline-flex items-center gap-1 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-black uppercase text-orange-300"
              >
                {t('Voir les tâches', 'View tasks')}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-1">
            {group.openTasks.map(task => (
              <li key={task.id} className="flex items-start gap-2 text-[11px] text-gray-300">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full border border-gray-600"
                  aria-hidden="true"
                />
                <span className="break-words">
                  {task.text}
                  {task.priority === 'critique' && (
                    <span className="ml-1.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-300">
                      {t('critique', 'critical')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {compliance.unknownProjectIds.length > 0 && (
        <p className="text-[10px] italic text-gray-400">
          {t(
            'Un chantier lié à cette facture n’existe plus. Il ne bloque pas l’envoi, mais signalez-le au bureau.',
            'A site linked to this invoice no longer exists. It does not block sending, but tell the office.'
          )}
        </p>
      )}
    </div>
  );
}
