# Centro Documental Energetico Design

## Objetivo

Dar al cliente un lugar seguro para guardar contratos, facturas y anexos energeticos, y capturar una ficha contractual estructurada que desbloquee analisis mas precisos en EnergyOS.

## Valor de producto

El contrato MATER/proveedor es informacion privada que EnergyOS no puede inferir. El modulo ofrece utilidad inmediata: orden documental, vencimientos, cobertura contractual y campos necesarios para futuras auditorias de factura, forecast y simulaciones.

## Alcance v1

- Biblioteca por NEMO con documentos privados.
- Carga de PDF/imagenes/documentos a bucket privado.
- Metadata: tipo, proveedor, periodo, vencimiento, confidencialidad y notas.
- Ficha contractual opcional: precio, moneda, volumen, inicio/fin, ajuste, take-or-pay, proveedor y cobertura.
- Alertas simples: documentos por vencer, contratos incompletos y potencial de valor desbloqueado.
- Descarga mediante URL firmada generada por Edge Function.

## Seguridad

- Tablas nuevas con RLS por `current_user_nemos()`.
- Bucket privado `energy-documents`.
- Path de storage: `<nemo>/<user_id>/<document_id>/<filename>`.
- Edge Function valida JWT y pertenencia del NEMO antes de listar, crear metadata o firmar descarga.

## No alcance v1

- No parseo automatico de PDFs.
- No OCR ni IA contractual.
- No auditoria de factura MATER automatica todavia.
- No roles finos por area interna; todos los usuarios vinculados al NEMO pueden ver sus documentos.
