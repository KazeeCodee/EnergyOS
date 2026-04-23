import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CostRow } from "../../types";
import { chart, tooltipStyle } from "./RechartsBase";

export function CostChart({ data }: { data: CostRow[] }) {
  return (
    <ResponsiveContainer height={300} width="100%">
      <BarChart data={data}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
        <XAxis dataKey="mes" fontSize={11} stroke={chart.axis} tick={{ fill: chart.axis }} />
        <YAxis fontSize={12} stroke={chart.axis} tick={{ fill: chart.axis }} unit=" USD" />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(245,242,235,0.04)" }} />
        <Bar dataKey="costo_usd_mwh" name="USD/MWh" radius={[4, 4, 0, 0]}>
          {data.map((row) => (
            <Cell
              fill={
                row.es_pico
                  ? chart.alert
                  : row.tipo === "proyeccion"
                    ? chart.forestLight
                    : chart.forest
              }
              key={row.mes}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
