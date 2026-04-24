import {
  Pie,
  PieChart,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { percent } from "../../utils/format";
import { chart } from "./RechartsBase";

export function ComplianceGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const data = [
    { name: "Cumplimiento", value: clamped },
    { name: "Pendiente", value: 100 - clamped },
  ];

  return (
    <div className="relative h-[230px]">
      <ResponsiveContainer height="100%" width="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="70%"
            dataKey="value"
            endAngle={0}
            innerRadius={74}
            outerRadius={96}
            paddingAngle={2}
            startAngle={180}
          >
            <Cell fill={chart.forest} />
            <Cell fill={chart.navyBorder} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-7 text-center">
        <p className="number font-syne text-5xl font-extrabold text-ivory">
          {percent(clamped)}
        </p>
        <p className="mt-1 text-sm text-mist">Renovable anual</p>
      </div>
    </div>
  );
}
