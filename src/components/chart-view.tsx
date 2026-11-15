"use client";
// Draws a chart an operator built (src/lib/charts/query.ts) in any of its nine types, and turns
// a chart card into a PNG: the picture leaves the app, never the data behind it.
//
// Every type draws one <svg data-chart-svg>; the legend is plain HTML marked with
// data-legend-item, the title and subtitle with data-export-title / -subtitle. exportCardPng()
// reads those from a card and paints title, chart, legend and a footer onto a canvas, with the
// computed colours inlined so the picture matches what is on screen in light or dark mode.
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis,
  PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartResult, ChartType } from "@/lib/charts/query";

const PALETTE = ["#4f6bed", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#22c55e", "#ef4444", "#0ea5e9", "#a3a3a3", "#84cc16"];
// levels 0-5: light to dark, as on the Talent page
const LEVELS = ["#d4d4d8", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4338ca"];

export function seriesColors(result: Pick<ChartResult, "series">, byLevel: boolean): string[] {
  return result.series.map((s, i) => (byLevel && /^\d$/.test(s.key) ? LEVELS[Number(s.key)] : PALETTE[i % PALETTE.length]));
}

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const fmt = (unit: "%" | "count") => (v: unknown) => (v == null ? "–" : unit === "%" ? `${v}%` : Number(v).toLocaleString("en-GB"));

export function ChartView({ type, result, height = 300, byLevel = false, thresholds = { greenAt: 85, amberAt: 60 } }: {
  type: ChartType; result: ChartResult; height?: number; byLevel?: boolean; thresholds?: { greenAt: number; amberAt: number };
}) {
  const { rows, series, unit } = result;
  const colors = seriesColors(result, byLevel);
  const f = fmt(unit);
  const pctAxis = unit === "%" ? { domain: [0, 100] as [number, number], tickFormatter: (v: number) => `${v}%` } : { allowDecimals: false };
  const tip = <Tooltip formatter={(v) => f(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--popover-foreground)" }} />;

  if (type === "kpi") {
    return (
      <svg data-chart-svg viewBox="0 0 400 160" width="100%" height={Math.min(height, 180)} role="img" aria-label={`${f(result.total)}`}>
        <text x="200" y="92" textAnchor="middle" fontSize="64" fontWeight="700" fill="var(--foreground)">{f(result.total)}</text>
        <text x="200" y="130" textAnchor="middle" fontSize="14" fill="var(--muted-foreground)">{result.people.toLocaleString("en-GB")} people · {result.scopeLabel}</text>
      </svg>
    );
  }
  if (!rows.length) return <div className="grid place-items-center text-sm text-muted-foreground" style={{ height }}>Nothing to draw.</div>;
  if (type === "heatmap") return <Heatmap result={result} colors={colors} thresholds={thresholds} />;

  const wrap = (chart: React.ReactElement) => (
    <div data-chart-svg-host style={{ width: "100%", height }}><ResponsiveContainer>{chart}</ResponsiveContainer></div>
  );
  const longest = Math.max(...rows.map((r) => String(r.label).length));
  const xAxis = <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0}
    angle={rows.length > 6 || longest > 14 ? -35 : 0} textAnchor={rows.length > 6 || longest > 14 ? "end" : "middle"} height={rows.length > 6 || longest > 14 ? 80 : 30}
    tickFormatter={(t: string) => (t.length > 22 ? `${t.slice(0, 21)}…` : t)} />;
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />;

  if (type === "pie") {
    const key = series[0]?.key ?? "value";
    const data = rows.filter((r) => Number(r[key]) > 0);
    return wrap(
      <PieChart>
        {tip}
        <Pie data={data} dataKey={key} nameKey="label" innerRadius="45%" outerRadius="80%" isAnimationActive={false} stroke="var(--card)"
          label={({ name, value }) => `${String(name).slice(0, 18)}: ${f(value)}`} labelLine={false} fontSize={11}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
      </PieChart>,
    );
  }
  if (type === "radar") {
    return wrap(
      <RadarChart data={rows} outerRadius="70%">
        {tip}
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="label" tick={AXIS} tickFormatter={(t: string) => (t.length > 16 ? `${t.slice(0, 15)}…` : t)} />
        <PolarRadiusAxis tick={false} axisLine={false} {...(unit === "%" ? { domain: [0, 100] } : {})} />
        {series.map((s, i) => <Radar key={s.key} dataKey={s.key} name={s.label} stroke={colors[i]} fill={colors[i]} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />)}
      </RadarChart>,
    );
  }
  if (type === "line" || type === "area") {
    const Chart = type === "line" ? LineChart : AreaChart;
    return wrap(
      <Chart data={rows} margin={{ left: 0, right: 12, top: 8 }}>
        {grid}{xAxis}
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} {...pctAxis} />
        {tip}
        {series.map((s, i) => type === "line"
          ? <Line key={s.key} dataKey={s.key} name={s.label} stroke={colors[i]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          : <Area key={s.key} dataKey={s.key} name={s.label} stroke={colors[i]} fill={colors[i]} fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />)}
      </Chart>,
    );
  }
  const horizontal = type === "hbar";
  const stacked = type === "stacked";
  return wrap(
    <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 8 : 0, right: 12, top: 8 }}>
      <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--border)" />
      {horizontal ? (
        <>
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} {...pctAxis} />
          <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={Math.min(180, 12 + longest * 6.2)} interval={0}
            tickFormatter={(t: string) => (t.length > 28 ? `${t.slice(0, 27)}…` : t)} />
        </>
      ) : (
        <>{xAxis}<YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} {...pctAxis} /></>
      )}
      {tip}
      {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i]} stackId={stacked ? "a" : undefined}
        radius={stacked ? 0 : 3} maxBarSize={56} isAnimationActive={false} />)}
    </BarChart>,
  );
}

function Heatmap({ result, colors, thresholds }: { result: ChartResult; colors: string[]; thresholds: { greenAt: number; amberAt: number } }) {
  const { rows, series, unit } = result;
  const cellW = 64, cellH = 26, left = Math.min(200, 16 + Math.max(...rows.map((r) => String(r.label).length)) * 6.4), top = 90;
  const w = left + series.length * cellW + 96, h = top + rows.length * cellH + 8; // room for the last header, rotated
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => Number(r[s.key] ?? 0))));
  const fill = (v: number | null) => {
    if (v == null) return "var(--muted)";
    if (unit === "%") return v >= thresholds.greenAt ? "#86efac" : v >= thresholds.amberAt ? "#fde68a" : "#fca5a5";
    const t = v / max;
    return `rgba(79, 107, 237, ${0.12 + t * 0.78})`;
  };
  const ink = (v: number | null) => (unit === "%" || v == null || v / max < 0.55 ? "#1f2937" : "#ffffff");
  void colors;
  return (
    <div className="overflow-x-auto">
      <svg data-chart-svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Heatmap" style={{ maxWidth: "none" }}>
        {series.map((s, j) => (
          <text key={s.key} transform={`translate(${left + j * cellW + cellW / 2 + 4},${top - 6}) rotate(-40)`} fontSize="11" fill="var(--muted-foreground)">
            {s.label.length > 18 ? `${s.label.slice(0, 17)}…` : s.label}
          </text>
        ))}
        {rows.map((r, i) => (
          <g key={String(r.key)}>
            <text x={left - 8} y={top + i * cellH + cellH / 2 + 4} textAnchor="end" fontSize="11" fill="var(--foreground)">
              {String(r.label).length > 30 ? `${String(r.label).slice(0, 29)}…` : String(r.label)}
            </text>
            {series.map((s, j) => {
              const v = r[s.key] == null ? null : Number(r[s.key]);
              return (
                <g key={s.key}>
                  <rect x={left + j * cellW + 1} y={top + i * cellH + 1} width={cellW - 2} height={cellH - 2} rx="3" fill={fill(v)} />
                  <text x={left + j * cellW + cellW / 2} y={top + i * cellH + cellH / 2 + 4} textAnchor="middle" fontSize="11" fill={ink(v)}>
                    {v == null ? "–" : unit === "%" ? `${v}%` : v}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** A legend in HTML, marked so the PNG export can paint it too. */
export function ChartLegend({ result, type, byLevel }: { result: ChartResult; type: ChartType; byLevel: boolean }) {
  if (type === "kpi" || type === "heatmap") return null;
  const items = type === "pie"
    ? result.rows.filter((r) => Number(r[result.series[0]?.key ?? "value"]) > 0).map((r, i) => ({ label: String(r.label), color: PALETTE[i % PALETTE.length] }))
    : result.series.length > 1 ? result.series.map((s, i) => ({ label: s.label, color: seriesColors(result, byLevel)[i] })) : [];
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <li key={it.label} data-legend-item data-color={it.color} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: it.color }} />{it.label}
        </li>
      ))}
    </ul>
  );
}

// ---- PNG -------------------------------------------------------------------------------------

const STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline"];

function inlineSvg(svg: SVGSVGElement): { markup: string; width: number; height: number } {
  const box = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const d = dst[i] as SVGElement;
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) d.style.setProperty(p, v);
    }
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.ceil(box.width)));
  clone.setAttribute("height", String(Math.ceil(box.height)));
  return { markup: new XMLSerializer().serializeToString(clone), width: Math.ceil(box.width), height: Math.ceil(box.height) };
}

function loadImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The chart could not be drawn as an image.")); };
    img.src = url;
  });
}

/** Paints a chart card (title, subtitle, chart, legend, footer) onto a canvas and returns a PNG. */
export async function cardPng(card: HTMLElement): Promise<Blob> {
  const svg = card.querySelector<SVGSVGElement>("[data-chart-svg], [data-chart-svg-host] svg.recharts-surface");
  if (!svg) throw new Error("There is no chart to save.");
  const { markup, width, height } = inlineSvg(svg);
  const img = await loadImage(markup);
  const title = card.querySelector("[data-export-title]")?.textContent ?? "Chart";
  const subtitle = card.querySelector("[data-export-subtitle]")?.textContent ?? "";
  const notes = [...card.querySelectorAll("[data-export-note]")].map((n) => n.textContent ?? "");
  const legend = [...card.querySelectorAll<HTMLElement>("[data-legend-item]")].map((li) => ({ label: li.textContent ?? "", color: li.dataset.color ?? "#888" }));
  const cs = getComputedStyle(card);
  const bg = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "#ffffff";
  const fg = cs.color || "#111827";
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted-foreground") || "#6b7280";
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";

  const pad = 24, W = Math.max(width + pad * 2, 480);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `12px ${font}`;
  // legend rows
  const legendRows: { label: string; color: string; x: number }[][] = [[]];
  let x = pad;
  for (const it of legend) {
    const w = 18 + measure.measureText(it.label).width + 16;
    if (x + w > W - pad && legendRows.at(-1)!.length) { legendRows.push([]); x = pad; }
    legendRows.at(-1)!.push({ ...it, x });
    x += w;
  }
  const legendH = legend.length ? legendRows.length * 20 + 8 : 0;
  const headH = subtitle ? 62 : 44;
  const H = headH + height + legendH + notes.length * 18 + 34;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg; ctx.font = `600 17px ${font}`; ctx.textBaseline = "top";
  ctx.fillText(title, pad, 18);
  if (subtitle) { ctx.fillStyle = muted; ctx.font = `12px ${font}`; ctx.fillText(subtitle, pad, 42); }
  ctx.drawImage(img, pad, headH, width, height);
  let y = headH + height + 8;
  ctx.font = `12px ${font}`;
  for (const row of legendRows) {
    for (const it of row) {
      ctx.fillStyle = it.color; ctx.fillRect(it.x, y + 2, 10, 10);
      ctx.fillStyle = muted; ctx.fillText(it.label, it.x + 16, y);
    }
    if (row.length) y += 20;
  }
  for (const n of notes) { ctx.fillStyle = muted; ctx.fillText(n, pad, y); y += 18; }
  ctx.fillStyle = muted; ctx.font = `11px ${font}`;
  ctx.fillText(`Skill Management · ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`, pad, H - 22);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be made."))), "image/png"));
}

export function fileNameFor(title: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart"}-${stamp}.png`;
}

export async function downloadCardPng(card: HTMLElement) {
  const blob = await cardPng(card);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileNameFor(card.querySelector("[data-export-title]")?.textContent ?? "chart");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Copy works only on a secure page (https or localhost); the button says so otherwise. */
export function canCopyImage() {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.clipboard && "ClipboardItem" in window;
}

export async function copyCardPng(card: HTMLElement) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": cardPng(card) })]);
}
