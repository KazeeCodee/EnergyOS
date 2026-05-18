import type { AnalizadorResponse } from "../types/analizador";
import type { AuditoriaDteResponse } from "../types/auditoriaDte";
import type { Compliance27191Response } from "../types/compliance27191";
import type { ExposicionSpotResponse } from "../types/exposicionSpot";
import type { FactorCargaResponse } from "../types/factorCarga";
import type { HistoriaEnergeticaResponse } from "../types/historiaEnergetica";
import type { InformeInicioResponse } from "../types/informeInicio";
import type { MercadoContextoResponse } from "../types/mercadoContexto";
import { buildAnalizadorResponse } from "./analizador.rules";

export type BuildAnalizadorFromModulesInput = {
  periodo: string;
  spot?: ExposicionSpotResponse | null;
  dte?: AuditoriaDteResponse | null;
  renovables?: Compliance27191Response | null;
  perfilCarga?: FactorCargaResponse | null;
  historia?: HistoriaEnergeticaResponse | null;
  mercado?: MercadoContextoResponse | null;
  inicio?: InformeInicioResponse | null;
  warnings?: string[];
};

export function buildAnalizadorFromModules(input: BuildAnalizadorFromModulesInput): AnalizadorResponse {
  return buildAnalizadorResponse({
    periodo: input.periodo,
    spot: input.spot
      ? {
          serie: input.spot.serie.map((point) => ({
            periodo: point.periodo,
            pctSpot: point.pctSpot,
            costoSpotPromedioPesosMwh: point.costoSpotPromedioPesosMwh,
            subContratoMwh: point.subContratoMwh,
            compraSpotMwh: point.compraSpotMwh,
            demandaContratadaMwh: point.demandaContratadaMwh,
          })),
        }
      : null,
    dte: input.dte
      ? {
          facturaTotalPesos: input.dte.resumen.facturaTotalPesos,
          importeRevisablePesos: input.dte.resumen.importeRevisablePesos,
          costoPromedioPesosMwh: input.dte.resumen.costoPromedioPesosMwh,
          serie: input.dte.serie.map((point) => ({
            periodo: point.periodo,
            facturaTotalPesos: point.facturaTotalPesos,
            costoDtePesosMwh: point.costoDtePesosMwh,
            demandaRealMwh: point.demandaRealMwh,
          })),
        }
      : null,
    renovables: input.renovables
      ? {
          cumpleYtd: input.renovables.resumen.cumpleYtd,
          brechaYtdMwh: input.renovables.resumen.brechaYtdMwh,
          multaEstimadaPesos: input.renovables.resumen.multaEstimadaPesos,
          pctRenovablePromedio: input.renovables.resumen.pctRenovablePromedio,
        }
      : null,
    perfilCarga: input.perfilCarga
      ? {
          pctPicoPercentilPromedio: input.perfilCarga.resumen.pctPicoPercentilPromedio,
          ratioPicoVallePromedio: input.perfilCarga.resumen.ratioPicoVallePromedio,
          pctPicoPromedio: input.perfilCarga.resumen.pctPicoPromedio,
        }
      : null,
    historia: input.historia?.resumen
      ? {
          mesesDisponibles: input.historia.resumen.mesesDisponibles,
          demandaUltimos12mMwh: input.historia.resumen.demandaUltimos12mMwh,
          variacionUltimos12mPct: input.historia.resumen.variacionUltimos12mPct,
          variacionYoyUltimoMesPct: input.historia.resumen.variacionYoyUltimoMesPct,
          ultimoMesDemandaMwh: input.historia.resumen.ultimoMesDemandaMwh,
          demandaPromedioUltimos12mMwh: input.historia.resumen.demandaPromedioUltimos12mMwh,
          serie: input.historia.serieMensual.map((point) => ({
            periodo: point.periodo,
            demandaMwh: point.demandaMwh,
          })),
        }
      : null,
    mercado: input.mercado
      ? {
          renovableSistemaPctUltimoDato: input.mercado.resumen.renovableSistemaPctUltimoDato,
          tendenciaManufactureraYoyPct: input.mercado.resumen.tendenciaManufactureraYoyPct,
          sectorIndustrialLider: input.mercado.resumen.sectorIndustrialLider?.sector ?? null,
          warnings: input.mercado.warnings,
        }
      : null,
    inicio: input.inicio
      ? {
          clienteDisponible: input.inicio.cliente.disponible,
          demandaMesGwh: input.inicio.cliente.demandaMes?.totalGwh ?? null,
          spotPctMes: input.inicio.cliente.demandaMes?.mix.spotPct ?? null,
          materPctMes: input.inicio.cliente.demandaMes?.mix.materEstimadoPct ?? null,
          plusPctMes: input.inicio.cliente.demandaMes?.mix.plusPct ?? null,
          pctRenovableAnio: input.inicio.cliente.pctRenovableAnio,
          cumple27191: input.inicio.cliente.cumple27191,
        }
      : null,
    warnings: input.warnings,
  });
}
