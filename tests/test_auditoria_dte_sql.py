from pathlib import Path
import unittest


SQL_PATH = Path("scripts/sql/railway_auditoria_dte.sql")


class AuditoriaDteSqlTest(unittest.TestCase):
    def read_sql(self) -> str:
        return SQL_PATH.read_text(encoding="utf-8").lower()

    def test_defines_isolated_objects(self):
        sql = self.read_sql()

        self.assertIn("create table if not exists public.factura_dte_conceptos_mensual", sql)
        self.assertIn("create materialized view public.vw_factura_dte_resumen_mensual", sql)
        self.assertIn("create or replace function public.refresh_auditoria_dte", sql)
        self.assertIn("public.raw_dte", sql)
        self.assertNotIn("drop table", sql)
        self.assertNotIn("cascade", sql)

    def test_keeps_source_traceability(self):
        sql = self.read_sql()

        for required in [
            "source_file",
            "source_row_desde",
            "source_row_hasta",
            "parser_version",
            "raw_dte",
        ]:
            self.assertIn(required, sql)

    def test_exposes_business_metrics(self):
        sql = self.read_sql()

        for metric in [
            "factura_total_pesos",
            "subtotal_conceptos_pesos",
            "desvio_reconciliacion_pesos",
            "variacion_mom_pct",
            "costo_dte_pesos_mwh",
            "importe_revisable_pesos",
        ]:
            self.assertIn(metric, sql)

    def test_tracks_paged_dte_blocks_by_last_seen_header(self):
        sql = self.read_sql()

        self.assertIn("latest_43_row", sql)
        self.assertIn("latest_factura_row", sql)
        self.assertIn("greatest(", sql)
        self.assertNotIn("source_row - 8", sql)

    def test_includes_gume_dte_layout_44(self):
        sql = self.read_sql()

        self.assertIn("4.4%grandes usuarios menores", sql)
        self.assertIn("latest_44_row", sql)
        self.assertIn("'%energia%'", sql)
        self.assertIn("cierre_factura_rows", sql)
        self.assertIn("latest_44_row = latest_43_row", sql)
        self.assertIn("coalesce(public.parse_es_number(col_008), 0)", sql)
        self.assertIn("r.col_count in (2, 8, 9)", sql)
        self.assertIn("when r.col_count = 9 then r.col_009", sql)
        self.assertIn("when r.col_count = 8 then r.col_008", sql)


if __name__ == "__main__":
    unittest.main()
