-- =============================================================================
-- EnergyOS Data Room privado - Railway Postgres
-- =============================================================================
-- Proposito:
--   Guardar datos privados del cliente en Railway, no en Supabase.
--   Supabase queda como identidad/login; Railway guarda contratos, documentos,
--   facturas, forecast, reclamos y observaciones privadas.
--
-- Aplicacion:
--   psql "$RAILWAY_DATABASE_URL" -f scripts/sql/railway_client_private_data_room.sql
--
-- Seguridad:
--   El frontend no debe conectar directo a Railway. Toda lectura/escritura debe
--   pasar por una API/edge function que valide el JWT de Supabase y los NEMOs
--   autorizados del usuario antes de consultar este schema.
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists client_private;

create table if not exists client_private.sites (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  site_code text not null,
  site_name text not null,
  distributor_nemo text null check (distributor_nemo is null or char_length(distributor_nemo) = 8),
  supply_point_code text null,
  address text null,
  contracted_power_mw numeric null check (contracted_power_mw is null or contracted_power_mw >= 0),
  max_demand_power_mw numeric null check (max_demand_power_mw is null or max_demand_power_mw >= 0),
  responsible_email text null,
  active boolean not null default true,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nemo, site_code)
);

create table if not exists client_private.contracts (
  id uuid primary key default gen_random_uuid(),
  buyer_nemo text not null check (char_length(buyer_nemo) = 8),
  contract_name text not null,
  contract_type text not null check (contract_type in ('BASE','PLUS','RENOVABLE','DELIVERY','COMPROMISO','OTRO','PPA','DISTRIBUIDORA')),
  status text not null check (status in ('borrador','activo','vencido','rescindido','en_revision')),
  seller_nemo text null check (seller_nemo is null or char_length(seller_nemo) = 8),
  generator_group text null,
  marketer_nemo text null check (marketer_nemo is null or char_length(marketer_nemo) = 8),
  current_version_id uuid null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_private.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references client_private.contracts(id) on delete cascade,
  version_number integer not null default 1 check (version_number > 0),
  valid_from date null,
  valid_to date null,
  signed_date date null,
  monthly_energy_mwh numeric null check (monthly_energy_mwh is null or monthly_energy_mwh >= 0),
  annual_energy_mwh numeric null check (annual_energy_mwh is null or annual_energy_mwh >= 0),
  contracted_power_mw numeric null check (contracted_power_mw is null or contracted_power_mw >= 0),
  price_currency text not null check (price_currency in ('ARS','USD')),
  base_price numeric null check (base_price is null or base_price >= 0),
  price_type text not null check (price_type in ('fijo','indexado','por_banda','escalonado','formula')),
  renewable boolean not null default false,
  technology text null check (technology is null or technology in ('solar','eolica','hidro','biomasa','termica','mixta','desconocida')),
  internal_owner_email text null,
  renewal_deadline date null,
  adjustment_index text null,
  adjustment_frequency text null,
  source_document_name text null,
  source_payload jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  unique (contract_id, version_number),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

alter table client_private.contracts
  drop constraint if exists contracts_current_version_id_fkey;

alter table client_private.contracts
  add constraint contracts_current_version_id_fkey
  foreign key (current_version_id)
  references client_private.contract_versions(id)
  on delete set null;

create table if not exists client_private.contract_supply_points (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references client_private.contracts(id) on delete cascade,
  site_id uuid null references client_private.sites(id) on delete set null,
  buyer_nemo text not null check (char_length(buyer_nemo) = 8),
  supply_point_code text null,
  allocation_pct numeric null check (allocation_pct is null or (allocation_pct >= 0 and allocation_pct <= 100)),
  created_at timestamptz not null default now()
);

create table if not exists client_private.contract_monthly_commitments (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references client_private.contract_versions(id) on delete cascade,
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  energy_mwh numeric not null check (energy_mwh >= 0),
  peak_mwh numeric null check (peak_mwh is null or peak_mwh >= 0),
  valley_mwh numeric null check (valley_mwh is null or valley_mwh >= 0),
  rest_mwh numeric null check (rest_mwh is null or rest_mwh >= 0),
  price_currency text null check (price_currency is null or price_currency in ('ARS','USD')),
  price_mwh numeric null check (price_mwh is null or price_mwh >= 0),
  formula_applied text null,
  created_at timestamptz not null default now(),
  unique (contract_version_id, periodo)
);

create table if not exists client_private.contract_clauses (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references client_private.contract_versions(id) on delete cascade,
  clause_type text not null,
  clause_title text not null,
  clause_text text null,
  deadline date null,
  amount numeric null,
  unit text null,
  created_at timestamptz not null default now()
);

create table if not exists client_private.documents (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  document_type text not null check (document_type in ('contrato','factura','dte','liquidacion','smec','auditoria','reclamo','forecast','otro')),
  file_name text not null,
  storage_provider text null,
  storage_key text null,
  mime_type text null,
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  checksum_sha256 text null,
  uploaded_by_user_id uuid null,
  uploaded_at timestamptz not null default now()
);

create table if not exists client_private.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references client_private.documents(id) on delete cascade,
  entity_type text not null check (entity_type in ('contract','contract_version','invoice','claim','audit_observation','site','forecast')),
  entity_id uuid not null,
  evidence_note text null,
  created_at timestamptz not null default now()
);

create table if not exists client_private.invoice_imports (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  invoice_type text not null check (invoice_type in ('factura_distribuidora','dte','liquidacion_cammesa','comercializador','otro')),
  issuer_name text null,
  currency text not null check (currency in ('ARS','USD')),
  total_amount numeric null check (total_amount is null or total_amount >= 0),
  document_id uuid null references client_private.documents(id) on delete set null,
  status text not null default 'borrador' check (status in ('borrador','validado','rechazado')),
  created_by_user_id uuid null,
  created_at timestamptz not null default now()
);

create table if not exists client_private.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_import_id uuid not null references client_private.invoice_imports(id) on delete cascade,
  concept_code text null,
  concept_name text not null,
  energy_mwh numeric null check (energy_mwh is null or energy_mwh >= 0),
  power_mw numeric null check (power_mw is null or power_mw >= 0),
  unit_price numeric null,
  amount numeric not null,
  currency text not null check (currency in ('ARS','USD')),
  created_at timestamptz not null default now()
);

create table if not exists client_private.forecasts (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  scenario text not null check (scenario in ('base','optimista','estresado','presupuesto','provision')),
  demand_mwh numeric null check (demand_mwh is null or demand_mwh >= 0),
  expected_cost_amount numeric null check (expected_cost_amount is null or expected_cost_amount >= 0),
  currency text null check (currency is null or currency in ('ARS','USD')),
  notes text null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  unique (nemo, periodo, scenario)
);

create table if not exists client_private.claims (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  title text not null,
  status text not null check (status in ('abierto','en_revision','presentado','resuelto','cerrado','descartado')),
  owner_email text null,
  due_date date null,
  estimated_impact_amount numeric null,
  currency text null check (currency is null or currency in ('ARS','USD')),
  description text null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_private.audit_observations (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  observation_type text not null check (observation_type in ('smec','auditoria','observacion_tecnica','medicion','otro')),
  title text not null,
  status text not null check (status in ('abierta','en_revision','resuelta','cerrada')),
  owner_email text null,
  due_date date null,
  description text null,
  document_id uuid null references client_private.documents(id) on delete set null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now()
);

create table if not exists client_private.responsibles (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  area text not null check (area in ('energia','finanzas','administracion','planta','sustentabilidad','asesor','otro')),
  full_name text null,
  email text not null,
  phone text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (nemo, email, area)
);

create table if not exists client_private.tasks (
  id uuid primary key default gen_random_uuid(),
  nemo text not null check (char_length(nemo) = 8),
  title text not null,
  related_entity_type text null,
  related_entity_id uuid null,
  owner_email text null,
  due_date date null,
  status text not null default 'pendiente' check (status in ('pendiente','en_progreso','bloqueada','completa','cancelada')),
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_private_sites_nemo_idx
  on client_private.sites (nemo);

create index if not exists client_private_contracts_buyer_nemo_idx
  on client_private.contracts (buyer_nemo);

create index if not exists client_private_contract_versions_contract_idx
  on client_private.contract_versions (contract_id, version_number desc);

create index if not exists client_private_documents_nemo_idx
  on client_private.documents (nemo, uploaded_at desc);

create index if not exists client_private_invoice_imports_nemo_periodo_idx
  on client_private.invoice_imports (nemo, periodo);

create index if not exists client_private_forecasts_nemo_periodo_idx
  on client_private.forecasts (nemo, periodo);

create index if not exists client_private_claims_nemo_status_idx
  on client_private.claims (nemo, status);

create index if not exists client_private_audit_observations_nemo_status_idx
  on client_private.audit_observations (nemo, status);

create or replace view client_private.v_contracts_latest as
select
  c.id,
  c.buyer_nemo,
  c.contract_name,
  c.contract_type,
  c.status,
  c.seller_nemo,
  c.generator_group,
  c.marketer_nemo,
  c.created_by_user_id,
  c.created_at,
  c.updated_at,
  v.id as version_id,
  v.version_number,
  v.valid_from,
  v.valid_to,
  v.signed_date,
  v.monthly_energy_mwh,
  v.annual_energy_mwh,
  v.contracted_power_mw,
  v.price_currency,
  v.base_price,
  v.price_type,
  v.renewable,
  v.technology,
  v.internal_owner_email,
  v.renewal_deadline,
  v.adjustment_index,
  v.adjustment_frequency,
  v.source_document_name,
  v.source_payload
from client_private.contracts c
left join client_private.contract_versions v
  on v.id = c.current_version_id;
