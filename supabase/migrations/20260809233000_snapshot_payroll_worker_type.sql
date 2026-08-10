-- Fige le statut salarié/sous-traitant au moment du versement. Sans cet
-- instantané, modifier plus tard le profil d'une personne réécrit implicitement
-- l'histoire comptable et peut fausser un export T5018 ou 1099-NEC.
alter table if exists public.payroll_payments
  add column if not exists worker_type_at_payment text;

alter table if exists public.payroll_payments
  drop constraint if exists payroll_payments_worker_type_at_payment_check;

alter table if exists public.payroll_payments
  add constraint payroll_payments_worker_type_at_payment_check
  check (worker_type_at_payment is null or worker_type_at_payment in ('salaried', 'contractor'));
