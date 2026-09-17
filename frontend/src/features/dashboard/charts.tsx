import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AttendanceTrendPoint, SalesTrendPoint } from "../../api/types";

// Colors are read as CSS custom properties (not literal hex) so both charts
// stay correct after a theme switch (dark/light) with no re-render logic —
// same approach the rest of the app uses for theme-aware styling.
const GRID_COLOR = "var(--color-line)";
const TEXT_COLOR = "var(--color-muted)";

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  label?: string;
  payload?: { name: string; value: number; color: string }[];
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-floating">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-ink">{formatter ? formatter(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: SalesTrendPoint[] }) {
  const hasData = data.some((d) => d.total_sales > 0 || d.total_expenses > 0);
  if (!hasData) {
    return <p className="py-10 text-center text-sm text-muted">Not enough data yet to chart a trend.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" stroke={TEXT_COLOR} fontSize={12} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis stroke={TEXT_COLOR} fontSize={12} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          cursor={{ fill: "var(--color-wash-2)" }}
          content={<ChartTooltip formatter={(v) => v.toFixed(2)} />}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: TEXT_COLOR }} />
        <Bar dataKey="total_sales" name="Sales" fill="var(--color-accent-green)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="total_expenses" name="Expenses" fill="var(--color-orange-50)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AttendanceTrendChart({ data }: { data: AttendanceTrendPoint[] }) {
  const hasData = data.some((d) => d.present > 0 || d.absent > 0);
  if (!hasData) {
    return <p className="py-10 text-center text-sm text-muted">No attendance marked in the last 7 days.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" stroke={TEXT_COLOR} fontSize={12} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
        <YAxis stroke={TEXT_COLOR} fontSize={12} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
        <Tooltip cursor={{ fill: "var(--color-wash-2)" }} content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: TEXT_COLOR }} />
        <Bar dataKey="present" name="Present" stackId="a" fill="var(--color-accent-green)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="absent" name="Absent" stackId="a" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
