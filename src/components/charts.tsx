"use client";
// The few charts the app uses, all through shadcn's chart wrapper so colours come
// from the theme tokens (--chart-1..5) in light and dark alike.
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid,
  PolarRadiusAxis, Radar, RadarChart, XAxis, YAxis,
} from "recharts";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";

export function TrendChart({ data }: { data: { period: string; onTarget: number | null; assessed: number | null }[] }) {
  const config = {
    onTarget: { label: "On target", color: "var(--chart-1)" },
    assessed: { label: "Assessed", color: "var(--chart-2)" },
  } satisfies ChartConfig;
  if (data.length < 2) return <p className="text-sm text-muted-foreground">The trend appears after the second monthly snapshot.</p>;
  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={6} fontSize={11}
          tickFormatter={(p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short" })} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `${v}%`} width={40} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => (
          <div className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{config[n as keyof typeof config]?.label}</span><span className="font-medium tabular">{v as number}%</span></div>
        )} />} />
        <Line dataKey="onTarget" type="monotone" stroke="var(--color-onTarget)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="assessed" type="monotone" stroke="var(--color-assessed)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}

export function SkillRadar({ data }: { data: { name: string; target: number; level: number; self: number }[] }) {
  const config = {
    target: { label: "Target", color: "var(--chart-5)" },
    level: { label: "Validated", color: "var(--chart-1)" },
    self: { label: "Self", color: "var(--chart-2)" },
  } satisfies ChartConfig;
  if (data.length < 3) return null;
  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-72 w-full">
      <RadarChart data={data} outerRadius="62%" margin={{ left: 36, right: 36, top: 8, bottom: 8 }}>
        <ChartTooltip content={<ChartTooltipContent />} />
        <PolarGrid />
        <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={false} axisLine={false} />
        <Radar isAnimationActive={false} dataKey="target" stroke="var(--color-target)" fill="transparent" strokeDasharray="4 3" strokeWidth={1.5} />
        <Radar isAnimationActive={false} dataKey="self" stroke="var(--color-self)" fill="var(--color-self)" fillOpacity={0.08} strokeWidth={1} />
        <Radar isAnimationActive={false} dataKey="level" stroke="var(--color-level)" fill="var(--color-level)" fillOpacity={0.25} strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  );
}

export function DistributionChart({ data }: { data: { level: string; people: number }[] }) {
  const config = { people: { label: "People", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-44 w-full">
      <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="level" tickLine={false} axisLine={false} fontSize={11} interval={0} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="people" fill="var(--color-people)" radius={3} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ i, v }));
  const config = { v: { label: "", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-8 w-24">
      <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Area dataKey="v" type="monotone" stroke="var(--color-v)" fill="var(--color-v)" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  );
}
