-- T1.1 Preflight check
-- Correr en Supabase SQL Editor ANTES de aplicar las migrations.
-- Si algun resultado es inesperado, pausar y revisar.

-- 1. raw_atra debe ser NULL (no existe en remoto segun T0.2)
select 'raw_atra' as tabla, to_regclass('public.raw_atra') as existe;

-- 2. Tablas ya cargadas deben existir
select 'raw_amat' as tabla, to_regclass('public.raw_amat') as existe
union all
select 'raw_agum', to_regclass('public.raw_agum');

-- 3. Ninguna de las 40 tablas faltantes debe existir aun
select unnest(array[
  'raw_dte','raw_dexc','raw_aexp','raw_agen','raw_agfq',
  'raw_aama','raw_rscj','raw_gudi','raw_adis','raw_adco',
  'raw_auto','raw_game',
  'raw_anexo_gen111','raw_anexo_gen112','raw_anexo_gen113','raw_anexo_gen114',
  'raw_anexo_gen115','raw_anexo_gen116','raw_anexo_gen117','raw_anexo_gen118',
  'raw_anexo_gen119','raw_anexo_gen12','raw_anexo_gen13',
  'raw_anexo_gen_disp_mejora','raw_anexo_generacion_forzada',
  'raw_anexo_gen_294pot','raw_anexo_gen_294ene',
  'raw_anexo_genmovil','raw_anexo_gennuc',
  'raw_anexo_mat','raw_anexo_mat_plus','raw_anexo_mat_renovable',
  'raw_anexo_mat_cvt','raw_anexo_mat_cvt_plus','raw_anexo_mat_compromiso',
  'raw_anexo_mat_cont_delivery','raw_anexo_mat_cequip724',
  'raw_anexo_guma','raw_anexo_gume'
]) as tabla,
to_regclass('public.' || unnest(array[
  'raw_dte','raw_dexc','raw_aexp','raw_agen','raw_agfq',
  'raw_aama','raw_rscj','raw_gudi','raw_adis','raw_adco',
  'raw_auto','raw_game',
  'raw_anexo_gen111','raw_anexo_gen112','raw_anexo_gen113','raw_anexo_gen114',
  'raw_anexo_gen115','raw_anexo_gen116','raw_anexo_gen117','raw_anexo_gen118',
  'raw_anexo_gen119','raw_anexo_gen12','raw_anexo_gen13',
  'raw_anexo_gen_disp_mejora','raw_anexo_generacion_forzada',
  'raw_anexo_gen_294pot','raw_anexo_gen_294ene',
  'raw_anexo_genmovil','raw_anexo_gennuc',
  'raw_anexo_mat','raw_anexo_mat_plus','raw_anexo_mat_renovable',
  'raw_anexo_mat_cvt','raw_anexo_mat_cvt_plus','raw_anexo_mat_compromiso',
  'raw_anexo_mat_cont_delivery','raw_anexo_mat_cequip724',
  'raw_anexo_guma','raw_anexo_gume'
])) as regclass_actual
order by tabla;

-- 4. Verificar migrations pendientes en supabase_migrations (si aplica)
-- select * from supabase_migrations.schema_migrations order by version desc limit 10;

-- RESULTADO ESPERADO:
--   raw_atra       -> NULL
--   raw_amat       -> public.raw_amat
--   raw_agum       -> public.raw_agum
--   resto de 40    -> NULL (todas)
-- Si alguna de las 40 ya existe con regclass != NULL, la migration es segura (IF NOT EXISTS).
-- Si raw_amat o raw_agum devuelve NULL, algo esta mal -- NO aplicar.

-- ─── 5. Duplicados en raw_amat y raw_agum ────────────────────────────────────
-- CORRER ANTES de aplicar 20260429100600_raw_amat_agum_source_unique.sql
-- Si alguna query devuelve filas, el CREATE UNIQUE INDEX va a fallar.
-- En ese caso revisar el origen y eliminar duplicados manualmente.

-- 5a. Duplicados en raw_amat
select
  source_zip, source_file, source_row,
  count(*) as n_dupes
from public.raw_amat
group by source_zip, source_file, source_row
having count(*) > 1
order by n_dupes desc
limit 20;
-- ESPERADO: 0 filas. Si hay filas -> NO aplicar migration 100600 hasta limpiar.

-- 5b. Duplicados en raw_agum
select
  source_zip, source_file, source_row,
  count(*) as n_dupes
from public.raw_agum
group by source_zip, source_file, source_row
having count(*) > 1
order by n_dupes desc
limit 20;
-- ESPERADO: 0 filas. Si hay filas -> NO aplicar migration 100600 hasta limpiar.

-- 5c. Si hay duplicados en raw_amat, identificarlos para borrado manual:
-- DELETE FROM public.raw_amat
-- WHERE id NOT IN (
--   SELECT min(id)
--   FROM public.raw_amat
--   GROUP BY source_zip, source_file, source_row
-- );
-- (Mismo patrón para raw_agum. Ejecutar solo si 5a/5b devuelven filas.)
