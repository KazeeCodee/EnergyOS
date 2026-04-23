from __future__ import annotations

import argparse
import logging
import os
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from supabase import Client, create_client

from procesar_mes import (
    extract_mercado,
    fetch_active_empresas,
    get_required_env,
    parse_dte_mate,
    process_empresa,
    setup_logging,
    upsert_mercado,
    verify_month,
)


BUCKET = "cammesa-uploads"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def get_supabase() -> Client:
    supabase_url = get_required_env("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or get_required_env("SUPABASE_SERVICE_KEY")
    return create_client(supabase_url, service_key)


def fetch_pending(supabase: Client, limit: int) -> list[dict[str, Any]]:
    response = (
        supabase.table("procesamientos")
        .select(
            "*,"
            "dte_archivo:cammesa_archivos!procesamientos_dte_archivo_id_fkey(*),"
            "variables_archivo:cammesa_archivos!procesamientos_variables_archivo_id_fkey(*)"
        )
        .eq("estado", "pendiente")
        .order("created_at")
        .limit(limit)
        .execute()
    )
    return response.data or []


def update_processing(supabase: Client, procesamiento_id: str, payload: dict[str, Any]) -> None:
    supabase.table("procesamientos").update(payload).eq("id", procesamiento_id).execute()


def download_file(supabase: Client, archivo: dict[str, Any], target_dir: Path) -> Path:
    file_path = archivo["file_path"]
    raw = supabase.storage.from_(BUCKET).download(file_path)
    local_path = target_dir / archivo["file_name"]
    local_path.write_bytes(raw)

    if local_path.suffix.lower() == ".zip":
        extract_dir = target_dir / f"{local_path.stem}_unzipped"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(local_path) as archive:
            archive.extractall(extract_dir)
        xlsx_files = sorted(extract_dir.rglob("*.xlsx"))
        if not xlsx_files:
            raise ValueError(f"El ZIP {archivo['file_name']} no contiene archivos .xlsx")
        return xlsx_files[0]

    return local_path


def insert_empresa_result(
    supabase: Client,
    procesamiento_id: str,
    empresa_id: str | None,
    estado: str,
    mensaje: str | None = None,
    result: dict[str, Any] | None = None,
) -> None:
    supabase.table("procesamiento_empresas").insert(
        {
            "procesamiento_id": procesamiento_id,
            "empresa_id": empresa_id,
            "estado": estado,
            "mensaje": mensaje,
            "demanda_total_mwh": result.get("demanda_total_mwh") if result else None,
            "mater_mwh": result.get("mater_mwh") if result else None,
            "spot_mwh": result.get("spot_mwh") if result else None,
        }
    ).execute()


def process_pending_item(supabase: Client, item: dict[str, Any]) -> None:
    procesamiento_id = item["id"]
    anio = int(item["anio"])
    mes = int(item["mes"])
    setup_logging(anio, mes)

    update_processing(
        supabase,
        procesamiento_id,
        {"estado": "procesando", "started_at": now_iso(), "error_message": None},
    )
    logging.info("Inicio procesamiento pendiente %s para %s-%02d", procesamiento_id, anio, mes)

    try:
        dte_archivo = item.get("dte_archivo")
        variables_archivo = item.get("variables_archivo")
        if not dte_archivo or not variables_archivo:
            raise ValueError("La corrida no tiene asociados ambos archivos CAMMESA")

        with tempfile.TemporaryDirectory(prefix="energyos_cammesa_") as temp_name:
            temp_dir = Path(temp_name)
            dte_path = download_file(supabase, dte_archivo, temp_dir)
            variables_path = download_file(supabase, variables_archivo, temp_dir)

            dte = parse_dte_mate(dte_path)
            mercado = extract_mercado(variables_path, anio, mes)

            processed_empresa_ids: set[str] = set()
            empresas = fetch_active_empresas(supabase)
            sin_datos = 0
            for empresa in empresas:
                result = process_empresa(supabase, empresa, dte, mercado, anio, mes)
                if result:
                    processed_empresa_ids.add(empresa["id"])
                    insert_empresa_result(supabase, procesamiento_id, empresa["id"], "completo", result=result)
                else:
                    sin_datos += 1
                    insert_empresa_result(
                        supabase,
                        procesamiento_id,
                        empresa["id"],
                        "sin_datos",
                        "No se encontraron datos MATER/DTE para los Nemos activos.",
                    )

            upsert_mercado(supabase, mercado, anio, mes)
            verify_month(supabase, processed_empresa_ids, anio, mes)

        update_processing(
            supabase,
            procesamiento_id,
            {
                "estado": "completo",
                "completed_at": now_iso(),
                "resumen": {
                    "empresas_total": len(empresas),
                    "empresas_procesadas": len(processed_empresa_ids),
                    "empresas_sin_datos": sin_datos,
                    "dte_archivo": dte_archivo["file_name"],
                    "variables_archivo": variables_archivo["file_name"],
                },
            },
        )
        logging.info("Procesamiento %s completo", procesamiento_id)
    except Exception as exc:
        logging.exception("Error en procesamiento pendiente %s", procesamiento_id)
        update_processing(
            supabase,
            procesamiento_id,
            {"estado": "error", "completed_at": now_iso(), "error_message": str(exc)},
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Procesa corridas pendientes creadas desde el dashboard admin.")
    parser.add_argument("--limit", type=int, default=1, help="Cantidad maxima de corridas pendientes a procesar.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    supabase = get_supabase()
    pending = fetch_pending(supabase, args.limit)
    if not pending:
        print("No hay procesamientos pendientes.")
        return 0

    for item in pending:
        process_pending_item(supabase, item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
