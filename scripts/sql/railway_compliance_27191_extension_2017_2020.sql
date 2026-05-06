-- Extiende compliance_27191_obligacion hacia atras (2017-2020).
-- Idempotente: ON CONFLICT actualiza si ya existe.
-- Origen: Ley 27.191 Art. 8 cronograma oficial.

INSERT INTO public.compliance_27191_obligacion (anio, pct_minimo, fuente)
VALUES
  (2017, 0.08, 'Ley 27.191 Art. 8 - vigencia 8% al 31/12/2017'),
  (2018, 0.08, 'Ley 27.191 Art. 8 - vigencia 8% hasta 31/12/2019'),
  (2019, 0.12, 'Ley 27.191 Art. 8 - vigencia 12% al 31/12/2019'),
  (2020, 0.12, 'Ley 27.191 Art. 8 - vigencia 12% hasta 31/12/2021')
ON CONFLICT (anio) DO UPDATE
  SET pct_minimo = excluded.pct_minimo,
      fuente = excluded.fuente,
      updated_at = now();

-- Refrescar marts dependientes
SELECT public.refresh_compliance_27191();
