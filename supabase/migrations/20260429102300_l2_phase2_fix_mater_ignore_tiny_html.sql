-- Ajuste remoto incremental: la version aplicada de 20260429102200 aceptaba
-- HTML parcial si raw_amat no existia. Reescribimos la funcion para exigir
-- un minimo de 100 filas HTML antes de considerar esa fuente usable.

do $$
begin
  execute replace(
    pg_get_functiondef('public.refresh_mater_contrato_mensual(int,int)'::regprocedure),
    'v_use_html := v_html_rows > 0 and (v_txt_rows = 0 or v_html_rows >= ceil(v_txt_rows * 0.90));',
    'v_use_html := v_html_rows >= 100 and (v_txt_rows = 0 or v_html_rows >= ceil(v_txt_rows * 0.90));'
  );
end;
$$;
