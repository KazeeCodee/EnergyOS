import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { tooltipStyle } from "./RechartsBase";

const colors = ["#168056", "#B7791F", "#356CA5", "#7A8797"];

export function MixDonut({
  data,
  title,
}: {
  data: Array<{ name: string; value: number }>;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-navy-border bg-navy p-4">
      <h4 className="mb-2 font-syne text-sm font-bold text-ivory">{title}</h4>
      <div className="grid items-center gap-3 sm:grid-cols-[160px_1fr]">
        <ResponsiveContainer height={160} width="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell fill={colors[index % colors.length]} key={entry.name} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-3">
          {data.map((entry, index) => (
            <div className="flex items-center justify-between gap-3" key={entry.name}>
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <span className="text-sm text-mist">{entry.name}</span>
              </div>
              <span className="number font-syne text-sm font-bold text-ivory">
                {entry.value}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
