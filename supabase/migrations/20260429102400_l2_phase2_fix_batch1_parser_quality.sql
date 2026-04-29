-- Fixes de calidad del batch 1:
-- 1. MATER: excluir filas raw_amat de otros sublayouts donde col_003 no es NEMO.
-- 2. GUMA: soportar layout nuevo con col_002 numerica (sin distribuidor).

alter table public.guma_detalle_mensual
  alter column distribuidor_nemo drop not null;

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.refresh_mater_contrato_mensual(int,int)'::regprocedure);
  v_def := replace(
    v_def,
    'v_use_html := v_html_rows > 0 and (v_txt_rows = 0 or v_html_rows >= ceil(v_txt_rows * 0.90));',
    'v_use_html := v_html_rows >= 100 and (v_txt_rows = 0 or v_html_rows >= ceil(v_txt_rows * 0.90));'
  );
  v_def := replace(
    v_def,
    'and public.nemo_from(r.col_003) is not null
     and upper(trim(coalesce(r.col_001, ''''))) not in (''AGENTE'', ''GENERADOR'', ''TOTAL'', ''TOTALES'')',
    'and public.nemo_from(r.col_003) is not null
     and trim(coalesce(r.col_001, '''')) ~ ''^[A-Z0-9-]{8}$''
     and trim(coalesce(r.col_003, '''')) ~ ''^[A-Z0-9-]{8}$''
     and upper(trim(coalesce(r.col_001, ''''))) not in (''AGENTE'', ''GENERADOR'', ''TOTAL'', ''TOTALES'')'
  );
  v_def := replace(
    v_def,
    'and public.nemo_from(r.col_003) is not null
        and upper(trim(coalesce(r.col_001, ''''))) not in (''AGENTE'', ''GENERADOR'', ''TOTAL'', ''TOTALES'')',
    'and public.nemo_from(r.col_003) is not null
        and trim(coalesce(r.col_001, '''')) ~ ''^[A-Z0-9-]{8}$''
        and trim(coalesce(r.col_003, '''')) ~ ''^[A-Z0-9-]{8}$''
        and upper(trim(coalesce(r.col_001, ''''))) not in (''AGENTE'', ''GENERADOR'', ''TOTAL'', ''TOTALES'')'
  );
  execute v_def;

  v_def := pg_get_functiondef('public.refresh_guma_detalle_mensual(int,int)'::regprocedure);
  v_def := replace(
    v_def,
    'public.nemo_from(r.col_002) as distribuidor_nemo,',
    'case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then public.nemo_from(r.col_002) end as distribuidor_nemo,'
  );
  v_def := replace(v_def, 'public.parse_es_number(r.col_003) as demanda_real_total_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_003 else r.col_002 end) as demanda_real_total_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_004) as demanda_real_pico_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_004 else r.col_003 end) as demanda_real_pico_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_005) as demanda_real_valle_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_005 else r.col_004 end) as demanda_real_valle_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_006) as demanda_real_resto_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_006 else r.col_005 end) as demanda_real_resto_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_007) as demanda_contratada_total_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_007 else r.col_006 end) as demanda_contratada_total_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_008) as demanda_contratada_pico_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_008 else r.col_007 end) as demanda_contratada_pico_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_009) as demanda_contratada_valle_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_009 else r.col_008 end) as demanda_contratada_valle_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_010) as demanda_contratada_resto_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_010 else r.col_009 end) as demanda_contratada_resto_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_011) as compra_spot_pico_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_011 else r.col_010 end) as compra_spot_pico_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_012) as compra_spot_valle_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_012 else r.col_011 end) as compra_spot_valle_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_013) as compra_spot_resto_mwh,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_013 else r.col_012 end) as compra_spot_resto_mwh,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_014) as compra_spot_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_014 else r.col_013 end) as compra_spot_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_015) as cargo_energia_adicional_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_015 else r.col_014 end) as cargo_energia_adicional_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_016) as cargo_servicios_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_016 else r.col_015 end) as cargo_servicios_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_017) as recupero_costos_operat_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_017 else r.col_016 end) as recupero_costos_operat_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_018) as cargo_serv_confiabilidad_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_018 else r.col_017 end) as cargo_serv_confiabilidad_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_019) as cargo_transp_at_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_019 else r.col_018 end) as cargo_transp_at_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_020) as cargo_transp_dt_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_020 else r.col_019 end) as cargo_transp_dt_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_021) as cargo_ampliac_at_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_021 else r.col_020 end) as cargo_ampliac_at_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_022) as cargo_ampliac_dt_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_022 else r.col_021 end) as cargo_ampliac_dt_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_023) as potencia_maxima_mw,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_023 else r.col_022 end) as potencia_maxima_mw,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_024) as potencia_declarada_mw,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_024 else r.col_023 end) as potencia_declarada_mw,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_025) as potencia_phmd_mw,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_025 else r.col_024 end) as potencia_phmd_mw,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_026) as compra_ppad_mw,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_026 else r.col_025 end) as compra_ppad_mw,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_027) as compra_potencia_ppad_mwhrp,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_027 else r.col_026 end) as compra_potencia_ppad_mwhrp,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_028) as potencia_contratada_mwhrp,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_028 else r.col_027 end) as potencia_contratada_mwhrp,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_029) as potencia_mater_mw,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_029 else r.col_028 end) as potencia_mater_mw,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_030) as potencia_pesos,', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_030 else r.col_029 end) as potencia_pesos,');
  v_def := replace(v_def, 'public.parse_es_number(r.col_031) as cargo_comercializ_cc_pesos', 'public.parse_es_number(case when trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$'' then r.col_031 else r.col_030 end) as cargo_comercializ_cc_pesos');
  v_def := replace(
    v_def,
    'and public.nemo_from(r.col_002) is not null
      and upper(trim(coalesce(r.col_001, ''''))) not in (''AGENTE'', ''TOTAL'', ''TOTALES'')',
    'and (
        trim(coalesce(r.col_002, '''')) ~ ''^[A-Z0-9-]{8}$''
        or public.parse_es_number(r.col_002) is not null
      )
      and upper(trim(coalesce(r.col_001, ''''))) not in (''AGENTE'', ''TOTAL'', ''TOTALES'')'
  );
  execute v_def;
end;
$$;
