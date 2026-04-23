import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ContratosData } from "../../types";
import { chart, tooltipStyle } from "./RechartsBase";

export function ContractChart({ contratos }: { contratos: ContratosData }) {
  const data = contratos.contratos.map((contract) => ({
    name: contract.tipo,
    precio: contract.precio_usd_mwh,
  }));

  return (
    <ResponsiveContainer height={280} width="100%">
      <BarChart data={data}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
        <XAxis dataKey="name" fontSize={12} stroke={chart.axis} tick={{ fill: chart.axis }} />
        <YAxis fontSize={12} stroke={chart.axis} tick={{ fill: chart.axis }} unit=" USD" />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(245,242,235,0.04)" }} />
        <ReferenceLine
          label={{ fill: chart.axis, fontSize: 12, position: "insideTopRight", value: "Mercado" }}
          stroke={chart.alert}
          strokeDasharray="4 4"
          y={contratos.precio_mercado_referencia}
        />
        <Bar dataKey="precio" fill={chart.forest} name="Precio USD/MWh" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
