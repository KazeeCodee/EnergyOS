from pathlib import Path
import unittest


SQL_PATH = Path("scripts/sql/railway_acciones_energeticas.sql")


class AccionesEnergeticasSqlTest(unittest.TestCase):
    def read_sql(self) -> str:
        return SQL_PATH.read_text(encoding="utf-8").lower()

    def test_defines_operational_tables_without_destructive_drops(self):
        sql = self.read_sql()

        self.assertIn("create table if not exists public.acciones_energeticas", sql)
        self.assertIn("create table if not exists public.acciones_energeticas_eventos", sql)
        self.assertIn("create unique index if not exists acciones_energeticas_regla_uidx", sql)
        self.assertIn("create index if not exists acciones_energeticas_nemo_estado_period_idx", sql)
        self.assertNotIn("drop table", sql)
        self.assertNotIn("drop materialized view", sql)

    def test_refresh_function_is_agent_scoped_and_preserves_handled_actions(self):
        sql = self.read_sql()

        self.assertIn("create or replace function public.refresh_acciones_energeticas", sql)
        self.assertIn("_nemo text default null", sql)
        self.assertIn("upper(_nemo)", sql)
        self.assertIn("periodos_operativos", sql)
        self.assertIn("interval '11 months'", sql)
        self.assertIn("estado in ('pendiente', 'en_revision')", sql)
        self.assertIn("on conflict", sql)
        self.assertIn("estado = public.acciones_energeticas.estado", sql)
        self.assertIn("distinct on (nemo, anio, mes, regla_codigo)", sql)

    def test_generates_actions_from_existing_marts(self):
        sql = self.read_sql()

        for source in [
            "public.vw_factura_dte_resumen_mensual",
            "public.vw_exposicion_spot_mensual",
            "public.vw_compliance_27191_mensual",
            "public.vw_consumo_gu_mensual",
        ]:
            self.assertIn(source, sql)

        for rule in [
            "dte_reconciliacion",
            "dte_variacion_alta",
            "spot_alta",
            "compliance_brecha",
            "consumo_variacion",
        ]:
            self.assertIn(rule, sql)

    def test_stores_action_context_and_value_signals(self):
        sql = self.read_sql()

        for field in [
            "impacto_estimado_pesos",
            "severidad",
            "origen_modulo",
            "origen_tabla",
            "detalle",
            "periodo_label",
            "actualizada_en",
        ]:
            self.assertIn(field, sql)


if __name__ == "__main__":
    unittest.main()
