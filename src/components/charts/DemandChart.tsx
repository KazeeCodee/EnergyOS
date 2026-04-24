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
import type { ComplianceRow } from "../../types";
import { chart, tooltipStyle } from "./RechartsBase";

export function DemandChart({ data }: { data: ComplianceRow[] }) {
  return (
    <ResponsiveContainer height={280} width="100%">
      <BarChart data={data}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="mes"
          fontSize={12}
          stroke={chart.axis}
          tick={{ fill: chart.axis }}
        />
        <YAxis
          fontSize={12}
          stroke={chart.axis}
          tick={{ fill: chart.axis }}
          unit=" MWh"
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(26,122,74,0.08)" }} />
        <Bar dataKey="mater_mwh" name="MATER" radius={[3, 3, 0, 0]} stackId="a">
          {data.map((row) => (
            <Cell
              fill={row.dato_sospechoso ? "#7A8797" : chart.forest}
              fillOpacity={row.dato_sospechoso ? 0.4 : 1}
              key={`mater-${row.mes}`}
            />
          ))}
        </Bar>
        <Bar dataKey="spot_mwh" name="SPOT" radius={[3, 3, 0, 0]} stackId="a">
          {data.map((row) => (
            <Cell
              fill={row.dato_sospechoso ? "#B7791F" : chart.alert}
              fillOpacity={row.dato_sospechoso ? 0.4 : 1}
              key={`spot-${row.mes}`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
