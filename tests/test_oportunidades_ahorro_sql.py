from pathlib import Path
import unittest


SQL_PATH = Path("scripts/sql/railway_oportunidades_ahorro.sql")


class OportunidadesAhorroSqlTest(unittest.TestCase):
    def read_sql(self) -> str:
        return SQL_PATH.read_text(encoding="utf-8").lower()

    def test_defines_isolated_materialized_view_and_refresh(self):
        sql = self.read_sql()

        self.assertIn("create or replace function public.refresh_oportunidades_ahorro", sql)
        self.assertIn("create materialized view public.vw_oportunidades_ahorro_mensual", sql)
        self.assertIn("with no data", sql)
        self.assertIn("_nemo text default null", sql)
        self.assertNotIn("drop table", sql)

    def test_uses_existing_energyos_sources(self):
        sql = self.read_sql()

        for source in [
            "public.vw_factura_dte_resumen_mensual",
            "public.vw_exposicion_spot_mensual",
            "public.vw_compliance_27191_mensual",
            "public.vw_consumo_gu_mensual",
            "public.acciones_energeticas",
        ]:
            self.assertIn(source, sql)

    def test_ranks_value_priority_and_confidence(self):
        sql = self.read_sql()

        for field in [
            "impacto_estimado_pesos",
            "ranking_score",
            "prioridad",
            "confianza",
            "accion_recomendada",
            "dolor_cliente",
        ]:
            self.assertIn(field, sql)

    def test_generates_expected_opportunity_types(self):
        sql = self.read_sql()

        for code in [
            "dte_auditoria",
            "spot_cobertura",
            "compliance_renovable",
            "consumo_desvio",
            "acciones_abiertas",
        ]:
            self.assertIn(code, sql)


if __name__ == "__main__":
    unittest.main()
