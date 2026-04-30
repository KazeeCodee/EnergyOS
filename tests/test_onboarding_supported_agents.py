from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class OnboardingSupportedAgentsTests(unittest.TestCase):
    def test_gran_consumidor_search_includes_all_final_consumers(self):
        source = (ROOT / "src" / "types" / "onboarding.ts").read_text(encoding="utf-8")

        self.assertIn("CONSUMIDOR_FINAL_TIPOS", source)
        final_consumers = source.split("CONSUMIDOR_FINAL_TIPOS", 1)[1].split("];", 1)[0]
        self.assertIn("Gran Usuario Mayor (GUMA)", final_consumers)
        self.assertIn("Gran Usuario Menor (GUME)", final_consumers)
        self.assertIn("Gran Usuario Particular (GUPA)", final_consumers)
        self.assertIn("GRAN DEMANDA EN DISTRIBUIDOR", final_consumers)
        self.assertNotIn("Generador", final_consumers)
        self.assertNotIn("Comercializador", final_consumers)

    def test_app_does_not_block_final_consumers_without_guma_gume_type(self):
        context_source = (ROOT / "src" / "context" / "AppContext.tsx").read_text(encoding="utf-8")
        app_source = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")

        self.assertNotIn('"unsupported_agent"', context_source)
        self.assertNotIn("isDashboardSupportedTipoAgente", context_source)
        self.assertNotIn('"unsupported_agent"', app_source)
        self.assertNotIn("UnsupportedAgentRoute", app_source)

    def test_exposicion_mart_includes_gran_demanda_en_distribuidor_from_dexc(self):
        source = (ROOT / "scripts" / "sql" / "railway_exposicion_spot_mat.sql").read_text(encoding="utf-8")

        self.assertIn("gudi_dexc", source)
        self.assertIn("'GUDI'::text as tipo_agente", source)
        self.assertIn("raw_dexc", source)
        self.assertIn("union all select * from gudi_dexc", source)

    def test_inicio_function_reports_gudi_universe_when_available(self):
        source = (ROOT / "supabase" / "functions" / "gu-informe-inicio" / "index.ts").read_text(encoding="utf-8")

        self.assertIn('gudi: universoBucket(byType.get("GUDI"))', source)


if __name__ == "__main__":
    unittest.main()
