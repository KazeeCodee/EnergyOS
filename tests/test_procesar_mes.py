from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "pipeline"
sys.path.insert(0, str(PIPELINE))

from procesar_mes import (  # noqa: E402
    MercadoMes,
    ParsedCammesaZip,
    build_parsed_cammesa_period,
    build_quality_payload,
    calculate_compliance_context,
    calculate_market_variations,
    calculate_module_2,
    infer_period_from_filename,
    parse_agum_text,
    parse_amat_text,
    parse_atra_text,
    previous_period,
    to_float,
    weighted_contract_price,
)


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def maybe_single(self):
        return self

    def execute(self):
        for row in self.rows:
            if all(row.get(field) == value for field, value in self.filters.items()):
                return FakeResponse(row)
        return FakeResponse(None)


class FakeSupabase:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        if name != "datos_mercado":
            raise AssertionError(f"Unexpected table: {name}")
        return FakeQuery(self.rows)


class NumericParsingTests(unittest.TestCase):
    def test_to_float_accepts_localized_numbers(self):
        self.assertEqual(to_float("1.234,56"), 1234.56)
        self.assertEqual(to_float("1,234.56"), 1234.56)
        self.assertEqual(to_float("$ 10.500,00"), 10500.0)
        self.assertEqual(to_float(""), 0.0)

    def test_infer_period_from_cammesa_filename(self):
        self.assertEqual(infer_period_from_filename(Path("DTE2603.zip")), (2026, 3))
        self.assertEqual(infer_period_from_filename(Path("AMAT2101.txt")), (2021, 1))
        self.assertEqual(infer_period_from_filename(Path("variables_2024_07.xlsx")), (2024, 7))

    def test_previous_period_crosses_year_boundary(self):
        self.assertEqual(previous_period(2026, 1), (2025, 12))
        self.assertEqual(previous_period(2026, 3), (2026, 2))


class CammesaParserTests(unittest.TestCase):
    def test_parse_amat_text_sums_mater_and_importe_by_demandante(self):
        text = "\n".join(
            [
                "x  y  AGENT001  z  q  60,5  121.000,50",
                "x  y  AGENT001  z  q  10,0  20.000,00",
                "x  y  OTHER001  z  q  5,0  1.500,00",
            ],
        )

        by_nemo, total_mwh, total_importe = parse_amat_text(text)

        self.assertAlmostEqual(by_nemo["AGENT001"][0], 70.5)
        self.assertAlmostEqual(by_nemo["AGENT001"][1], 141000.5)
        self.assertAlmostEqual(total_mwh, 75.5)
        self.assertAlmostEqual(total_importe, 142500.5)

    def test_parse_agum_text_sums_demand_and_spot_by_nemo(self):
        text = "\n".join(
            [
                "Precio Energia Spot",
                "Pico ($/MWh): 100",
                "Valle ($/MWh): 80",
                "Resto ($/MWh): 90",
                "A4.3.4.1",
                "AGENT001 CONTRA01 GENER001  0 0 0 60",
                "AGENT001 CONTRA02  0 0 0 40",
            ],
        )

        demanda, spot, precios = parse_agum_text(text)

        self.assertAlmostEqual(demanda["AGENT001"], 100.0)
        self.assertAlmostEqual(spot["AGENT001"], 40.0)
        self.assertEqual(precios, {"pico": 100.0, "valle": 80.0, "resto": 90.0})

    def test_parse_atra_text_accepts_proper_spanish_accent(self):
        text = f"Precio Mensual de Transporte en Alta Tensi{chr(0xF3)}n: 1.234,56"

        self.assertEqual(parse_atra_text(text), 1234.56)

    def test_build_parsed_period_keeps_energy_invariants(self):
        parsed = build_parsed_cammesa_period(
            "x  y  AGENT001  z  q  60  120000",
            "\n".join(
                [
                    "A4.3.4.1",
                    "AGENT001 CONTRA01 GENER001  0 0 0 60",
                    "AGENT001 CONTRA02  0 0 0 40",
                ],
            ),
            "Precio Mensual de Transporte en Alta Tensi\u00f3n: 50",
            source_label="test",
            source_kind="raw",
        )

        row = parsed.empresas["AGENT001"]
        self.assertEqual(row.demanda_total_mwh, 100.0)
        self.assertEqual(row.mater_mwh, 60.0)
        self.assertEqual(row.spot_mwh, 40.0)
        self.assertEqual(row.importe_mater_pesos, 120000.0)
        self.assertEqual(parsed.cargo_transporte_pesos_mwh, 50.0)


class CalculationTests(unittest.TestCase):
    def test_weighted_contract_price_prefers_dte_contract_mwh(self):
        contratos = [
            {
                "numero_contrato": "ABC-001",
                "tipo": "RPB",
                "precio_usd_mwh": 80,
                "volumen_mwh_mes": 1000,
            },
            {
                "numero_contrato": "ABC-002",
                "tipo": "RPE",
                "precio_usd_mwh": 100,
                "volumen_mwh_mes": 1000,
            },
        ]
        rows = pd.DataFrame(
            {
                "numero_contrato": ["001", "002"],
                "dem_abastecida_total": [10, 30],
            },
        )

        self.assertEqual(weighted_contract_price(contratos, rows), 95.0)

    def test_compliance_context_uses_year_to_date_accumulated_ratio(self):
        result = calculate_compliance_context(
            [{"demanda_total_mwh": 1000, "mater_mwh": 100}],
            demanda_total=1000,
            mater_mwh=300,
            mes=2,
            precio_gasoil_importado_usd_mwh=200,
        )

        self.assertEqual(result["estado"], "CUMPLE")
        self.assertEqual(result["pct_acumulado"], 20.0)
        self.assertEqual(result["mwh_faltantes"], 0.0)
        self.assertEqual(result["multa_usd"], 0.0)

    def test_module_2_scores_contract_against_market_reference(self):
        results = calculate_module_2(
            [
                {
                    "numero_contrato": "C1",
                    "precio_usd_mwh": 90,
                    "vigencia_fin": "2026-12-31",
                },
                {
                    "numero_contrato": "C2",
                    "precio_usd_mwh": 120,
                    "vigencia_fin": "2026-12-31",
                },
            ],
            precio_mercado_referencia=100,
            mater_mwh_mes=100,
        )

        self.assertEqual(results[0]["score"], "OPTIMO")
        self.assertEqual(results[0]["diferencia_pct"], -10.0)
        self.assertEqual(results[0]["diferencia_usd_mes"], 1000.0)
        self.assertEqual(results[1]["score"], "MUY_CARO")

    def test_quality_payload_flags_impossible_energy_balance(self):
        result = build_quality_payload(
            demanda_total=100,
            mater_mwh=70,
            spot_mwh=40,
            mercado=MercadoMes(cargo_transporte_pesos_mwh=10),
            parsed=ParsedCammesaZip(
                empresas={},
                total_mater_mwh=0,
                total_importe_mater_pesos=0,
                precio_spot_pico_pesos_mwh=1,
                precio_spot_valle_pesos_mwh=1,
                precio_spot_resto_pesos_mwh=1,
                cargo_transporte_pesos_mwh=10,
                source_kind="raw",
                has_raw_atra=True,
            ),
        )

        self.assertTrue(result["dato_sospechoso"])
        self.assertIn("MATER + SPOT supera", result["sospechoso_motivo"])

    def test_market_variations_compare_previous_month_and_previous_year(self):
        supabase = FakeSupabase(
            [
                {"anio": 2026, "mes": 2, "generacion_mater_gwh": 100},
                {"anio": 2025, "mes": 3, "generacion_mater_gwh": 80},
            ],
        )

        mom, yoy = calculate_market_variations(supabase, 2026, 3, 120)

        self.assertEqual(mom, 20.0)
        self.assertEqual(yoy, 50.0)


if __name__ == "__main__":
    unittest.main()
