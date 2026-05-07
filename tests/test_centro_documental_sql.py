from pathlib import Path
import unittest


SQL_PATH = Path("supabase/migrations/20260507090000_centro_documental_energetico.sql")


class CentroDocumentalSqlTest(unittest.TestCase):
    def read_sql(self) -> str:
        return SQL_PATH.read_text(encoding="utf-8").lower()

    def test_creates_private_document_contract_tables_and_bucket(self):
        sql = self.read_sql()

        self.assertIn("create table if not exists public.documentos_energeticos", sql)
        self.assertIn("create table if not exists public.contratos_energeticos", sql)
        self.assertIn("create table if not exists public.documentos_energeticos_eventos", sql)
        self.assertIn("insert into storage.buckets", sql)
        self.assertIn("'energy-documents'", sql)
        self.assertIn("public = false", sql)

    def test_enables_rls_and_uses_current_user_nemos(self):
        sql = self.read_sql()

        for table in [
            "public.documentos_energeticos",
            "public.contratos_energeticos",
            "public.documentos_energeticos_eventos",
        ]:
            self.assertIn(f"alter table {table} enable row level security", sql)

        self.assertIn("public.current_user_nemos()", sql)
        self.assertIn("nemo = any(array(select public.current_user_nemos()))", sql)
        self.assertNotIn("using (true)", sql)

    def test_contract_fields_capture_private_value_drivers(self):
        sql = self.read_sql()

        for field in [
            "precio_energia",
            "moneda",
            "volumen_mwh_mes",
            "porcentaje_cobertura",
            "fecha_inicio",
            "fecha_fin",
            "take_or_pay",
            "ajuste_descripcion",
            "proveedor_nombre",
        ]:
            self.assertIn(field, sql)

    def test_storage_policies_are_folder_scoped_by_nemo_and_user(self):
        sql = self.read_sql()

        self.assertIn("storage.foldername(name)", sql)
        self.assertIn("bucket_id = 'energy-documents'", sql)
        self.assertIn("(storage.foldername(name))[1]", sql)
        self.assertIn("(storage.foldername(name))[2]", sql)
        self.assertIn("auth.uid()::text", sql)


if __name__ == "__main__":
    unittest.main()
