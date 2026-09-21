"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "./empty-state";
import { BarChart3Icon } from "lucide-react";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

const tooltipStyle = { borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12, boxShadow: "var(--shadow-soft)" };

export function BarSeries({ data, xKey, series, height = 260, stacked }: { data: Record<string, unknown>[]; xKey: string; series: { key: string; label: string; color?: string }[]; height?: number; stacked?: boolean }) {
  if (!data.length) return <EmptyState compact icon={BarChart3Icon} title="No data yet" description="This chart fills in as records are created." className="border-dashed" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i % PALETTE.length]} radius={[6, 6, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={48} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeries({ data, xKey, series, height = 260 }: { data: Record<string, unknown>[]; xKey: string; series: { key: string; label: string; color?: string }[]; height?: number }) {
  if (!data.length) return <EmptyState compact icon={BarChart3Icon} title="No data yet" className="border-dashed" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 240, centerLabel }: { data: { name: string; value: number }[]; height?: number; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState compact icon={BarChart3Icon} title="No data yet" className="border-dashed" />;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="85%" paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center text-center">
        <span className="text-2xl font-semibold">{total.toLocaleString()}</span>
        {centerLabel ? <span className="text-xs text-muted-foreground">{centerLabel}</span> : null}
      </div>
    </div>
  );
}
