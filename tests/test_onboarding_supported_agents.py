from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class OnboardingSupportedAgentsTests(unittest.TestCase):
    def test_gran_consumidor_search_only_includes_dashboard_supported_types(self):
        source = (ROOT / "src" / "types" / "onboarding.ts").read_text(encoding="utf-8")

        self.assertIn("DASHBOARD_SUPPORTED_GRAN_CONSUMIDOR_TIPOS", source)
        supported_section = source.split("DASHBOARD_SUPPORTED_GRAN_CONSUMIDOR_TIPOS", 1)[1].split("];", 1)[0]
        self.assertIn("Gran Usuario Mayor (GUMA)", supported_section)
        self.assertIn("Gran Usuario Menor (GUME)", supported_section)
        self.assertNotIn("GRAN DEMANDA EN DISTRIBUIDOR", supported_section)
        self.assertNotIn("Gran Usuario Particular (GUPA)", supported_section)

    def test_app_has_gate_to_reselect_unsupported_linked_agent(self):
        app_source = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
        context_source = (ROOT / "src" / "context" / "AppContext.tsx").read_text(encoding="utf-8")

        self.assertIn('"unsupported_agent"', context_source)
        self.assertIn("isDashboardSupportedTipoAgente", context_source)
        self.assertIn("UnsupportedAgentRoute", app_source)
        self.assertIn("unlinkUserAgente", app_source)


if __name__ == "__main__":
    unittest.main()
