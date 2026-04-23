import {
  Bar,
  BarChart,
  CartesianGrid,
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
        <Bar dataKey="mater_mwh" fill={chart.forest} name="MATER" radius={[3, 3, 0, 0]} stackId="a" />
        <Bar dataKey="spot_mwh" fill={chart.alert} name="SPOT" radius={[3, 3, 0, 0]} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
