import unittest

from pipeline.audit_fase1_raw import (
    AuditRow,
    parse_supabase_csv,
    row_status,
)


class SupabaseCsvParsingTests(unittest.TestCase):
    def test_parse_supabase_csv_ignores_cli_noise(self):
        output = """tabla,total,unique_source,duplicate_sources
raw_aexp,9874,9874,0
Initialising login role...
"""

        rows = parse_supabase_csv(output)

        self.assertEqual(rows, [{"tabla": "raw_aexp", "total": "9874", "unique_source": "9874", "duplicate_sources": "0"}])

    def test_parse_supabase_csv_handles_empty_output(self):
        self.assertEqual(parse_supabase_csv("Initialising login role...\n"), [])


class AuditStatusTests(unittest.TestCase):
    def test_row_status_ok_when_all_gates_match(self):
        row = AuditRow(
            tabla="raw_aexp",
            local_count=10,
            parser_count=10,
            remote_total=10,
            unique_source=10,
            duplicate_sources=0,
            health_status="ok",
            run_errors=0,
            run_open=False,
        )

        self.assertEqual(row_status(row), "ok")

    def test_row_status_pending_when_remote_is_short_without_errors(self):
        row = AuditRow(
            tabla="raw_dte",
            local_count=100,
            parser_count=100,
            remote_total=40,
            unique_source=40,
            duplicate_sources=0,
            health_status="incompleto",
            run_errors=0,
            run_open=True,
        )

        self.assertEqual(row_status(row), "pending")

    def test_row_status_fail_on_duplicate_sources(self):
        row = AuditRow(
            tabla="raw_aexp",
            local_count=10,
            parser_count=10,
            remote_total=10,
            unique_source=9,
            duplicate_sources=1,
            health_status="ok",
            run_errors=0,
            run_open=False,
        )

        self.assertEqual(row_status(row), "fail")

    def test_row_status_warns_on_prior_errors_after_data_reconciles(self):
        row = AuditRow(
            tabla="raw_adco",
            local_count=10,
            parser_count=10,
            remote_total=10,
            unique_source=10,
            duplicate_sources=0,
            health_status="ok",
            run_errors=2,
            run_open=False,
        )

        self.assertEqual(row_status(row), "warn_prior_errors")


if __name__ == "__main__":
    unittest.main()
