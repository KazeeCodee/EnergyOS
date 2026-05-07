export type TipoDocumentoEnergetico =
  | "contrato_mater"
  | "contrato_proveedor"
  | "anexo_comercial"
  | "factura_proveedor"
  | "factura_distribuidor"
  | "certificado_renovable"
  | "comunicacion_cammesa"
  | "cotizacion"
  | "otro";

export type DocumentoEnergetico = {
  id: string;
  nemo: string;
  userId: string;
  tipoDocumento: TipoDocumentoEnergetico | string;
  titulo: string;
  proveedorNombre: string | null;
  periodoAnio: number | null;
  periodoMes: number | null;
  fechaDocumento: string | null;
  fechaVencimiento: string | null;
  confidencial: boolean;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  notas: string | null;
  estado: "activo" | "archivado" | "reemplazado" | string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ContratoEnergetico = {
  id: string;
  nemo: string;
  userId: string;
  documentoId: string | null;
  tipoContrato: "mater" | "ppa_renovable" | "comercializador" | "distribuidor" | "autogeneracion" | "otro" | string;
  proveedorNombre: string;
  contraparteNemo: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  precioEnergia: number | null;
  moneda: "ARS" | "USD" | "EUR" | string | null;
  volumenMwhMes: number | null;
  porcentajeCobertura: number | null;
  potenciaMw: number | null;
  takeOrPay: boolean | null;
  takeOrPayPct: number | null;
  ajusteDescripcion: string | null;
  prioridadDespacho: string | null;
  puntoSuministro: string | null;
  facturacionFrecuencia: string | null;
  estado: "borrador" | "vigente" | "vencido" | "rescindido" | "reemplazado" | string;
  notas: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CentroDocumentalResumen = {
  documentos: number;
  contratos: number;
  contratosVigentes: number;
  contratosVencen90Dias: number;
  contratosIncompletos: number;
  valorDesbloqueado: {
    auditoriaFacturaMater: boolean;
    forecastContractual: boolean;
    compliancePreciso: boolean;
  };
};

export type CentroDocumentalResponse = {
  nemo: string;
  autorizados: string[];
  resumen: CentroDocumentalResumen;
  documentos: DocumentoEnergetico[];
  contratos: ContratoEnergetico[];
  notas: {
    alcance: string;
  };
};

export type CreateDocumentoInput = {
  nemo: string;
  tipoDocumento: TipoDocumentoEnergetico;
  titulo: string;
  proveedorNombre?: string;
  periodoAnio?: number | null;
  periodoMes?: number | null;
  fechaDocumento?: string;
  fechaVencimiento?: string;
  confidencial?: boolean;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  notas?: string;
};

export type CreateContratoInput = {
  nemo: string;
  documentoId?: string | null;
  tipoContrato: string;
  proveedorNombre: string;
  contraparteNemo?: string;
  fechaInicio?: string;
  fechaFin?: string;
  precioEnergia?: number | null;
  moneda?: "ARS" | "USD" | "EUR";
  volumenMwhMes?: number | null;
  porcentajeCobertura?: number | null;
  potenciaMw?: number | null;
  takeOrPay?: boolean | null;
  takeOrPayPct?: number | null;
  ajusteDescripcion?: string;
  prioridadDespacho?: string;
  puntoSuministro?: string;
  facturacionFrecuencia?: string;
  estado?: string;
  notas?: string;
};
