export type MercadoFuente = "memnet" | "operaciones";
export type MercadoSeccion = "demanda" | "generacion" | "manufacturero";

export type MercadoDemandaPoint = {
  fecha: string;
  prevista: number | null;
  semanaAnt: number | null;
  ayer: number | null;
  hoy: number | null;
  temPrevista: number | null;
  temSemanaAnt: number | null;
  temAyer: number | null;
  temHoy: number | null;
};

export type MercadoGeneracionPoint = {
  fecha: string;
  nuclear: number | null;
  termico: number | null;
  renovableHidro50mw: number | null;
  renovableLey26190: number | null;
  importacion: number | null;
  total: number | null;
  porcentajes: {
    nuclear: number | null;
    termico: number | null;
    renovableHidro50mw: number | null;
    renovableLey26190: number | null;
    importacion: number | null;
  };
};

export type MercadoManufactureroPoint = {
  periodo: string;
  moliendaCerealesYOleaginosas: number | null;
  restoDeAlimentos: number | null;
  bebidas: number | null;
  tabaco: number | null;
  textilIndumentariaYCuero: number | null;
  maderaPapelYEdicion: number | null;
  refinacionDePetroleo: number | null;
  quimicos: number | null;
  cauchoYPlastico: number | null;
  mineralesNoMetalicos: number | null;
  metalesBasicos: number | null;
  metalmecanica: number | null;
  automotriz: number | null;
  restoDeIndustria: number | null;
  totalIndustria: number | null;
};

export type MercadoContextoResponse = {
  fuente: MercadoFuente;
  secciones: MercadoSeccion[];
  dias: number;
  meses: number;
  demanda: MercadoDemandaPoint[];
  generacion: MercadoGeneracionPoint[];
  manufacturero: MercadoManufactureroPoint[];
  resumen: {
    ultimoDatoDemanda: string | null;
    ultimoDatoGeneracion: string | null;
    renovableSistemaPctUltimoDato: number | null;
    ultimoPeriodoManufacturero: string | null;
    sectorIndustrialLider: { sector: string; valor: number } | null;
    tendenciaManufactureraYoyPct: number | null;
  };
  warnings: string[];
};
