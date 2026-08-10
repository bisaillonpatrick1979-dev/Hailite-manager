-- ---------------------------------------------------------------------------
-- Paie : figer la nature du travailleur au moment du versement
-- ---------------------------------------------------------------------------
-- L'export fiscal des sous-traitants (T5018 au Canada, 1099-NEC aux
-- États-Unis) classait chaque versement d'après le type de travailleur
-- ACTUEL de la personne. L'historique se réécrivait donc tout seul : quelqu'un
-- payé comme sous-traitant en 2024, embauché comme salarié en 2026, voyait ses
-- versements de 2024 disparaître d'un feuillet déjà produit et transmis.
--
-- La nature du versement est désormais figée à l'enregistrement. La colonne est
-- nullable : les versements antérieurs n'en ont pas, et l'application les
-- classe alors d'après la fiche actuelle en le signalant explicitement à
-- l'écran, pour qu'une personne vérifie plutôt que de faire confiance.
--
-- Migration additive : aucune donnée existante n'est modifiée, aucune écriture
-- en cours n'est bloquée.

alter table public.payroll_payments
  add column if not exists worker_type_at_payment text;

comment on column public.payroll_payments.worker_type_at_payment is
  'Type de travailleur au moment du versement (« contractor » / « salaried »). '
  'Fait foi pour l''export fiscal, à la place de la fiche actuelle. '
  'Nul pour les versements antérieurs à cette colonne.';
