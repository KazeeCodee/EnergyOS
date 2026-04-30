from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class AppContextAuthStateTests(unittest.TestCase):
    def test_app_context_resets_user_bound_state_on_supabase_sign_out(self):
        source = (ROOT / "src" / "context" / "AppContext.tsx").read_text(encoding="utf-8")

        self.assertIn("onAuthStateChange", source)
        self.assertIn('event === "SIGNED_OUT"', source)
        self.assertIn("setProfile(null)", source)
        self.assertIn("setAgente(null)", source)
        self.assertIn('setUltimoMesDisponible("")', source)


if __name__ == "__main__":
    unittest.main()
