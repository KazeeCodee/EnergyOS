from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import UTC, date, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from supabase import Client

from procesar_pendientes import BUCKET, get_supabase, process_pending_item


CAMMESA_DOCUMENTS_URL = "https://api.cammesa.com/pub-svc/public/findDocumentosByNemoRango"
CAMMESA_ATTACHMENT_URL = "https://api.cammesa.com/pub-svc/public/findAttachmentByNemoId"
START_YEAR = 2020
START_MONTH = 2


class CammesaUnavailableError(Exception):
    pass


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        force=True,
    )


def get_loader_user_id() -> str:
    value = os.getenv("CAMMESA_LOADER_USER_ID", "").strip()
    if value:
        return value
    raise SystemExit(
        "ERROR: CAMMESA_LOADER_USER_ID no está definida.\n"
        "Seteá el UUID del usuario admin que va a figurar como responsable de la carga histórica.\n"
        "Podés obtenerlo con:\n"
        "SELECT id FROM auth.users LIMIT 5;"
    )


def pad_month(value: int) -> str:
    return str(value).zfill(2)


def build_range(anio: int, mes: int) -> tuple[str, str]:
    from_value = f"{anio}-{pad_month(mes)}-01T00:00:00.000-03:00"
    next_year = anio + 1 if mes == 12 else anio
    next_month = 1 if mes == 12 else mes + 1
    to_value = f"{next_year}-{pad_month(next_month)}-01T00:00:00.000-03:00"
    return from_value, to_value


def month_label(anio: int, mes: int) -> str:
    return f"{anio}-{pad_month(mes)}"


def parse_period(value: str) -> tuple[int, int]:
    try:
        parsed = datetime.strptime(value, "%Y-%m")
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Periodo invalido '{value}'. Usá YYYY-MM.") from exc
    return parsed.year, parsed.month


def month_range(desde: tuple[int, int], hasta: tuple[int, int]) -> list[tuple[int, int]]:
    months: list[tuple[int, int]] = []
    anio, mes = desde
    while (anio, mes) <= hasta:
        months.append((anio, mes))
        if mes == 12:
            anio += 1
            mes = 1
        else:
            mes += 1
    return months


def fetch_json(url: str, params: dict[str, str]) -> Any:
    full_url = f"{url}?{urlencode(params)}"
    request = Request(full_url, method="GET")
    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == 404:
            raise CammesaUnavailableError(f"CAMMESA devolvió 404 para {full_url}") from exc
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(detail or f"CAMMESA respondió {exc.code} para {full_url}") from exc
    except URLError as exc:
        raise RuntimeError(f"No se pudo conectar a CAMMESA: {exc.reason}") from exc


def fetch_bytes(url: str, params: dict[str, str]) -> bytes:
    full_url = f"{url}?{urlencode(params)}"
    request = Request(full_url, method="GET")
    try:
        with urlopen(request, timeout=120) as response:
            return response.read()
    except HTTPError as exc:
        if exc.code == 404:
            raise CammesaUnavailableError(f"Adjunto no disponible en CAMMESA para {full_url}") from exc
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(detail or f"CAMMESA respondió {exc.code} para {full_url}") from exc
    except URLError as exc:
        raise RuntimeError(f"No se pudo descargar desde CAMMESA: {exc.reason}") from exc


def fetch_completed_processing(supabase: Client, anio: int, mes: int) -> dict[str, Any] | None:
    response = (
        supabase.table("procesamientos")
        .select("id,estado")
        .eq("anio", anio)
        .eq("mes", mes)
        .eq("estado", "completo")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def fetch_processing_status(supabase: Client, procesamiento_id: str) -> dict[str, Any] | None:
    response = (
        supabase.table("procesamientos")
        .select("id,estado,error_message,resumen")
        .eq("id", procesamiento_id)
        .maybe_single()
        .execute()
    )
    return response.data or None


def find_documento_y_adjunto(anio: int, mes: int) -> tuple[str, str]:
    attachment_name = f"DTE{str(anio)[-2:]}{pad_month(mes)}.zip"
    from_value, to_value = build_range(anio, mes)
    documentos = fetch_json(
        CAMMESA_DOCUMENTS_URL,
        {
            "nemo": "DTE_EMISION",
            "fechadesde": from_value,
            "fechahasta": to_value,
        },
    )

    if not isinstance(documentos, list) or not documentos:
        raise CammesaUnavailableError(f"No hay documentos DTE_EMISION para {month_label(anio, mes)}")

    for documento in documentos:
        if not isinstance(documento, dict):
            continue

        document_id = str(documento.get("id", "")).strip()
        if not document_id:
            continue

        attachments = documento.get("adjuntos")
        if not isinstance(attachments, list):
            continue

        for item in attachments:
            if not isinstance(item, dict):
                continue
            maybe_id = str(item.get("id", "")).strip()
            maybe_name = str(item.get("nombre", "")).strip()
            if maybe_id == attachment_name or maybe_name == attachment_name:
                return document_id, attachment_name

    raise CammesaUnavailableError(f"No encontré el adjunto {attachment_name}")


def upload_zip_to_storage(
    supabase: Client,
    loader_user_id: str,
    anio: int,
    mes: int,
    attachment_name: str,
    zip_bytes: bytes,
) -> dict[str, Any]:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    storage_path = f"{anio}/{pad_month(mes)}/dte-{timestamp}-{attachment_name}"
    supabase.storage.from_(BUCKET).upload(
        storage_path,
        zip_bytes,
        {"content-type": "application/zip", "upsert": "true"},
    )

    response = (
        supabase.table("cammesa_archivos")
        .insert(
            {
                "tipo": "DTE",
                "anio": anio,
                "mes": mes,
                "file_path": storage_path,
                "file_name": attachment_name,
                "size_bytes": len(zip_bytes),
                "content_type": "application/zip",
                "uploaded_by": loader_user_id,
            }
        )
        .execute()
    )
    data = response.data or []
    if isinstance(data, list):
        if not data:
            raise RuntimeError(f"No se pudo crear el registro de cammesa_archivos para {attachment_name}")
        return data[0]
    return data


def create_processing(
    supabase: Client,
    loader_user_id: str,
    archivo: dict[str, Any],
    anio: int,
    mes: int,
    document_id: str,
    attachment_name: str,
) -> dict[str, Any]:
    response = (
        supabase.table("procesamientos")
        .insert(
            {
                "anio": anio,
                "mes": mes,
                "dte_archivo_id": archivo["id"],
                "variables_archivo_id": archivo["id"],
                "estado": "pendiente",
                "resumen": {
                    "origen": "carga_historica",
                    "documento_id": document_id,
                    "archivo_descargado": attachment_name,
                },
                "creado_por": loader_user_id,
            }
        )
        .execute()
    )
    data = response.data or []
    if isinstance(data, list):
        if not data:
            raise RuntimeError(f"No se pudo crear el procesamiento para {month_label(anio, mes)}")
        procesamiento = data[0]
    else:
        procesamiento = data
    supabase.table("audit_logs").insert(
        {
            "actor_user_id": loader_user_id,
            "action": "download_cammesa_dte",
            "entity": "procesamientos",
            "entity_id": procesamiento["id"],
            "metadata": {
                "origen": "carga_historica",
                "anio": anio,
                "mes": mes,
                "document_id": document_id,
                "attachment_name": attachment_name,
            },
        }
    ).execute()
    return procesamiento


def process_month(supabase: Client, loader_user_id: str, anio: int, mes: int) -> str:
    label = month_label(anio, mes)
    if fetch_completed_processing(supabase, anio, mes):
        logging.info("[%s] salteado: ya existe una corrida completa", label)
        return "skipped"

    document_id, attachment_name = find_documento_y_adjunto(anio, mes)
    zip_bytes = fetch_bytes(
        CAMMESA_ATTACHMENT_URL,
        {
            "nemo": "DTE_EMISION",
            "docId": document_id,
            "attachmentId": attachment_name,
        },
    )
    archivo = upload_zip_to_storage(supabase, loader_user_id, anio, mes, attachment_name, zip_bytes)
    procesamiento = create_processing(supabase, loader_user_id, archivo, anio, mes, document_id, attachment_name)

    logging.info("[%s] corrida creada (%s), iniciando procesamiento inmediato", label, procesamiento["id"])
    item = {
        **procesamiento,
        "dte_archivo": archivo,
        "variables_archivo": archivo,
    }
    process_pending_item(supabase, item)

    final_status = fetch_processing_status(supabase, procesamiento["id"])
    if final_status and final_status.get("estado") == "completo":
        logging.info("[%s] procesado correctamente", label)
        return "processed"

    error_message = (final_status or {}).get("error_message") or "Procesamiento finalizó sin estado completo"
    raise RuntimeError(f"[{label}] {error_message}")


def parse_args() -> argparse.Namespace:
    current = date.today()
    parser = argparse.ArgumentParser(description="Carga histórica de DTEs CAMMESA para EnergyOS.")
    parser.add_argument(
        "--desde",
        type=parse_period,
        default=(START_YEAR, START_MONTH),
        help="Periodo inicial en formato YYYY-MM. Default: 2020-02",
    )
    parser.add_argument(
        "--hasta",
        type=parse_period,
        default=(current.year, current.month),
        help="Periodo final en formato YYYY-MM. Default: mes actual",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    setup_logging()
    loader_user_id = get_loader_user_id()
    supabase = get_supabase()
    if args.desde > args.hasta:
        raise SystemExit("--desde no puede ser mayor que --hasta")

    processed: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []

    for anio, mes in month_range(args.desde, args.hasta):
        label = month_label(anio, mes)
        try:
            result = process_month(supabase, loader_user_id, anio, mes)
            if result == "processed":
                processed.append(label)
            elif result == "skipped":
                skipped.append(label)
        except CammesaUnavailableError as exc:
            logging.warning("[%s] no disponible en CAMMESA: %s", label, exc)
            errors.append(f"{label} (no disponible)")
        except Exception as exc:
            logging.exception("[%s] error en la carga histórica", label)
            errors.append(f"{label} ({exc})")

    print("")
    print("Resumen carga historica")
    print(f"Meses procesados: {len(processed)}")
    print(f"Meses salteados: {len(skipped)}")
    print(f"Meses con error: {len(errors)}")
    if errors:
        print("Detalle errores:")
        for item in errors:
            print(f"- {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
