-- MIGRAÇÃO PontoPro V2 → Base mensal 220h (excedente = extra)
-- Rode no Supabase → SQL Editor

-- 1) permitir nulos nos campos que variam por tipo de pagamento
alter table public.employees_v2 alter column monthly_salary drop not null;
alter table public.employees_v2 alter column hourly_rate drop not null;

-- 2) adicionar base mensal (minutos) - padrão 220h = 13200 min
alter table public.employees_v2
add column if not exists monthly_base_min int not null default 13200;

-- (opcional) regra de consistência
alter table public.employees_v2 drop constraint if exists pay_type_payment_check;
alter table public.employees_v2
add constraint pay_type_payment_check
check (
  (pay_type = 'SALARIO' and monthly_salary is not null)
  or
  (pay_type = 'HORA' and hourly_rate is not null)
);
