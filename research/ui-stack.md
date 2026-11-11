# UI template, chart and auth stack research (2026-11-12)

Research report. Facts carry a source; anything flagged *(opinion)* is the researcher's judgement. Star counts, licences and last-push dates were read from the GitHub API on 2026-11-12; bundle sizes from bundlephobia (min+gzip).

## A. Templates / starter kits

| Template | Stack | Stars | Licence / price | Last push | Ships | Look & feel *(opinion)* |
|---|---|---|---|---|---|---|
| **shadcn-admin** (satnaing) | Vite + TanStack Router + shadcn/Tailwind | 16,665 | MIT | 2026-09-10 | Sidebar, 10+ pages (tasks data-table with faceted filters, users, settings, auth pages, error pages), light/dark, RTL, cmd-K search. Clerk optional | Cleanest free one: muted greys, one accent, dense tables. "A dashboard UI collection, not a starter" - easy to strip |
| **next-shadcn-dashboard-starter** (Kiranism) | Next.js 16 App Router + shadcn + Tailwind v4 | 7,256 | MIT | 2026-11-08 | Overview with Recharts, TanStack Table + nuqs URL filters, TanStack Form + Zod, kanban, Sentry, Dockerfiles with standalone output | Clean, same language as shadcn blocks. **Clerk is a hard dependency**; `bun run cleanup clerk` removes it |
| **shadcn blocks** (`dashboard-01`, `sidebar-01..16`, `login-0x`) | Any React | (shadcn/ui 127,922) | MIT | 2026-11-11 | `npx shadcn add dashboard-01` = app-sidebar, site-header, KPI cards, interactive area chart, data-table, nav-user | The reference look everyone copies. Blocks you assemble, not a template |
| **Shadcnblocks** (paid) | shadcn | - | $149 / $299 / $399 one-time; Admin Kit only in Premium/Elite | - | 2,697+ blocks via `npx shadcn add` from their registry | Marketing-first; result is plain source in your repo so it survives the corporate mirror if installed at home and committed |
| **TailAdmin** | React + Tailwind | 1,301 | MIT free; Pro $59-$299 | 2026-10-29 | Dashboard, tables, forms, ApexCharts, auth, dark mode | Mid-density, more colour and card chrome than shadcn |
| **Horizon UI** | Chakra or shadcn | 2,909 / 651 | MIT | 2025-01 | Dashboard, tables, profile, auth | Stale ~22 months; decorative gradients |
| **Mosaic Lite** (Cruip) | React + Tailwind | 2,856 | No licence field; Pro paid | 2025-03-02 | Analytics dashboard, Chart.js | Stale, licence unclear |
| **Tailwind Plus / Catalyst** | React + Headless UI | - | **New sign-ups closed 2026-09-09 when Tailwind Labs joined Shopify** | - | Application UI kit, no charts | Very clean, but cannot be bought now |
| **Tremor** | React + Tailwind + Radix, Recharts underneath | 3,699 | Apache-2.0, free since Vercel acquisition (Jan 2025) | **2025-10-10** | 35+ chart/dashboard components; blocks.tremor.so templates | Beautiful muted charts, but no push in 13 months. Treat as frozen |
| **Vercel admin template** | Next.js + shadcn + Drizzle + NextAuth | 1,622 | MIT | 2026-01-15 | Sidebar, products table, auth | Tiny; a reference, not a base |
| **Refine** | Headless React framework; Ant/MUI/Mantine/Chakra, shadcn integration in docs | 36,027 | MIT | 2026-09-10 | CRUD scaffolding, auth provider, access control, data providers | Good for many CRUD resources; adds a layer; this app is 80% visualisation |
| **Ant Design Pro** | Umi + Ant Design | 38,954 | MIT | 2026-11-04 | Full enterprise admin, ProTable, ProLayout | Dense; Chinese-enterprise aesthetic; Umi lock-in |
| **MUI Toolpad** | MUI | 1,703 | MIT | **ARCHIVED 2026-09-23** | - | Do not start here |
| **Minimal UI** / **Devias Kit** (free) | MUI | 2,787 / 5,582 | MIT free; Pro paid | 2025-04 / 2025-06 | MUI dashboards, DataGrid demos | MUI-heavy; free repos idle ~18 months |
| **Berry** (free) | MUI | 2,192 | MIT (Pro paid) | 2026-11-05 | MUI dashboard, ApexCharts | Active, but busier styling |
| **CoreUI** (free React) | Bootstrap 5 | 4,969 | MIT (Pro paid) | 2026-10-20 | Bootstrap admin | Not "modern/uncluttered" by the owner's bar |
| **Metronic 9** | Tailwind, React/Next | - | $49 / $199 / $999 | - | Hundreds of pages, ReUI (shadcn-based) | Huge, hard to strip |
| **Nuxt UI dashboard** (Vue) | Nuxt 4 + Nuxt UI | 1,118 | MIT | 2026-11-11 | Sidebar, tables, charts, settings | Clean, active; only if Vue is preferred |
| **shadcn-svelte** | SvelteKit | 9,253 | MIT | 2026-11-03 | Same blocks as shadcn | Smaller ecosystem for charts/tables/auth |
| **Flowbite admin** | Tailwind + Flowbite | 2,896 | MIT | 2025-03-20 | Bootstrap-ish Tailwind admin | Stale |
| **AdminLTE** | Bootstrap | 45,688 | MIT | 2026-11-04 | Classic admin | The contrast case: dense, boxy, 2015 look |
| **Mantine analytics dashboard** | Next.js 16 + Mantine 9 | ~350 | MIT | active | Recharts + Mantine DataTable | Small community |

## B. Chart / visualisation libraries

| Library | Stars | Licence | Last push | Bundle | Heatmap | Radar | Org tree / hierarchy | Dark theme / shadcn tokens | A11y |
|---|---|---|---|---|---|---|---|---|---|
| **Recharts 3** | 27,697 | MIT | 2026-11-11 | 150 KB | **None built in** | Yes | No | Excellent: shadcn `ChartContainer` resolves `var(--chart-1)` per theme | Basic |
| **Nivo** | 14,135 | MIT | 2026-07-21 | per-package (heatmap 49 KB + core) | **Yes**: SVG + canvas, tooltips, legends; no native row/column grouping | Yes | Treemap, sunburst, circle-packing, bump, tree | Theme object | Per-chart a11y section |
| **Apache ECharts** (+ echarts-for-react 5,009 stars) | 67,703 | Apache-2.0 | 2026-10-13 | 368 KB full; ~100-150 KB tree-shaken | **Best**: cartesian heatmap with `visualMap`, canvas, `dataZoom` for thousands of cells | Yes | **Yes**: `tree` (collapsible), `treemap`, `sunburst`, `graph` | Built-in dark theme + custom theme JSON; read CSS variables at mount | Basic ARIA |
| **visx** | 21,103 | MIT | 2026-06-22 | modular | Yes, low-level | Build it | `@visx/hierarchy` | Whatever you draw | You write it |
| **Observable Plot** | 5,424 | ISC | 2026-11-05 | 127 KB | `cell` mark, excellent dense heatmaps | No | Tree mark | Imperative SVG | Decent |
| **Chart.js 4** + chartjs-chart-matrix | 67,789 / 247 | MIT | 2026-11-09 | 70 KB | Via plugin (canvas) | Yes | No | Strings | Weak |
| **d3-org-chart** (bumbeishvili) | 1,223 | MIT | 2026-07-08 | 31 KB | - | - | **Purpose-built collapsible org chart**, custom node HTML | Node HTML is yours | Low |
| **React Flow** (`@xyflow/react`) | 38,973 | MIT | 2026-11-10 | 60 KB | - | - | General node graph; needs d3-hierarchy/dagre layout | Nodes are React components | OK |
| **Plotly.js** | 18,379 | MIT | 2026-11-10 | **1.4 MB** | Yes | Yes | Treemap, sunburst | Templates | Low |

## C. Data table / filter components

| Component | Stars | Licence / price | Last push | Grouped rows | Pivot | Faceted filters, column toggles, server-side |
|---|---|---|---|---|---|---|
| **TanStack Table** + shadcn data-table recipe | 28,567 | MIT | 2026-11-02 | Yes (grouping, aggregation, expanding) | **No** - cross-tab is your own transform | Copy-paste recipe: faceted filters, column visibility, selection, pagination; server mode. shadcn docs moved to **TanStack Table v9** (announced 2026-08-04); v8 still fine |
| **AG Grid Community** | 15,680 | MIT (Enterprise EULA) | 2026-11-11 | **Enterprise** | Enterprise | Community: sort, filter, column mgmt, virtualised rows. Heavy styling to match shadcn |
| **MUI X DataGrid** | - | MIT Community; **Premium $588/yr/dev** | active | Premium | **Premium** | Drags in MUI/Emotion |
| **Mantine React Table** | 1,105 | MIT | 2026-06-05 | Yes | No | Requires Mantine |

## D. Full-stack and auth

| Item | Status (fact) |
|---|---|
| **Next.js standalone** | `output: 'standalone'` emits `.next/standalone/server.js` with traced `node_modules`; copy `public` and `.next/static` yourself; `PORT`/`HOSTNAME` env |
| **better-auth** | 30,712 stars, MIT, pushed 2026-11-11. **Joined Vercel 2026-07-07** ("keeping auth open source, framework and platform agnostic"). Core email+password; `admin` plugin (roles, ban, impersonate, `createUser`, `setUserPassword`); **`@better-auth/sso` plugin: OIDC + SAML 2.0, SP- and IdP-initiated, SLO, `registerSSOProvider` stores connections in an `ssoProvider` table**; Drizzle and Prisma adapters |
| **Auth.js / NextAuth** | 28,378 stars, ISC. **Part of Better Auth since 2025-09-22; README recommends Better Auth for new projects**; v5 still beta. SAML only via BoxyHQ Jackson as a separate service |
| **@node-saml/node-saml** | 135 stars, MIT, npm 5.2.0 published 2026-10-26; `passport-saml` 881 stars, active |
| **samlify** | 664 stars, MIT, active 2026-11-09 |
| **python3-saml** | 760 stars, MIT, **last PyPI release 1.16.0 on 2023-10-09**; needs libxmlsec1 (C dep) |
| **pysaml2** | 618 stars, Apache-2.0, 7.5.5 on PyPI 2026-09-17, active |
| **Keycloak** / **Authentik** | 37,821 / 26,310 stars, active - broker SAML IdP to OIDC app |
| **Drizzle** 36,274 / **Prisma** 47,666 | Both Apache-2.0, both active |

## Ranked top-3 per category

**Templates**
1. **shadcn blocks (`dashboard-01` + `sidebar-07` + `login-03`) assembled by hand, borrowing shadcn-admin's data-table and settings pages.** MIT, the "modern clean" baseline, nothing to strip, and the most-seen code for an AI agent *(opinion on the last point)*.
2. **shadcn-admin (satnaing)** - the best complete free admin; Vite + TanStack Router. Page-pattern reference even on Next.
3. **next-shadcn-dashboard-starter (Kiranism)** - Next.js with Docker and nuqs URL-state filters wired; budget a day to remove Clerk and swap in better-auth.
Not ranked: Tremor (frozen), Catalyst (unbuyable), Toolpad (archived), Horizon/Mosaic/Flowbite/Minimal/Devias (18-22 months idle). Refine adds abstraction the app does not need *(opinion)*.

**Charts**
1. **Apache ECharts via echarts-for-react** for the hard charts: heatmap (thousands of cells, `visualMap`, `dataZoom`), `tree` for the collapsible org tree, `treemap`/`sunburst`, radar.
2. **Recharts 3** for ordinary charts (trend lines, bars, sparklines) because shadcn's `ChartContainer` gives theme-token colours for free.
3. **Nivo** as the all-React alternative (real heatmap, radar, treemap, sunburst, bump); slower maintenance.
Special mention: **d3-org-chart** if the org tree must look like a classic HR org chart with rich HTML cards.

**Tables**
1. **TanStack Table + shadcn data-table recipe.** The skills matrix is **not** a table-library pivot: build it as a server-computed `{row, col, value}` grid rendered by ECharts heatmap (interactive) or a plain `<table>`/CSS grid (editable). TanStack handles the long-form lists and grouped-by-team views.
2. **MUI X DataGrid Premium** only if true end-user pivoting is ever needed.
3. **AG Grid Community** - grouping/pivot/tree are Enterprise and it fights the shadcn look.

**Stack / auth**
1. **Next.js 16 App Router + better-auth (email/password + admin + `@better-auth/sso`) + Drizzle + Postgres**, standalone Docker image.
2. **Vite React SPA + FastAPI + SQLAlchemy + pysaml2** - if Python is preferred; costs two containers, two build pipelines, CORS/cookies and hand-rolled auth.
3. **Keycloak/Authentik broker in front** (OIDC to the app, SAML to the corporate IdP) - if the corporate security team prefers a known IdP product; one more container.

## Recommended stack *(opinion, facts cited above)*

**Next.js 16 (App Router, `output: 'standalone'`) + TypeScript + Tailwind v4 + shadcn/ui blocks + TanStack Table + Recharts 3 (via shadcn charts) for simple charts + ECharts for heatmap/radar/org tree + better-auth (email+password, `admin` plugin, `@better-auth/sso` later) + Drizzle + Postgres. Start from `npx shadcn add dashboard-01 sidebar-07 login-03`, borrow shadcn-admin's tasks table and settings pages.**

Why:
- **One container, one language, one build.** Every package is plain public npm (shadcn components are copied into the repo). Standalone output = `node` + `.next/standalone`, no `npm install` at runtime; fits the existing `work.env`/`home.env` + digest-pin + 72-hour-gate pattern. FastAPI would add a PyPI mirror, libxmlsec1 for python3-saml (last release 2023), and a second image.
- **Seed admin/admin -> SAML later with no re-architecture.** better-auth keeps users in your own Postgres tables; email+password and SSO are plugins on the same `user` table. Day one: `emailAndPassword` + `admin` plugin, seed admin and force a password change. Later: `registerSSOProvider` with the IdP's SAML metadata, link by email domain. Local login stays for break-glass. Auth.js cannot do this without BoxyHQ Jackson.
- **Design parity.** shadcn's chart config maps `--chart-1..5` to light/dark; Recharts reads them natively; ECharts reads the same CSS variables once at mount.
- **Filters everywhere** via URL state (nuqs) + a shadcn faceted-filter toolbar, so every view is linkable and the executive, team-lead and own-profile views are the same pages with different filter defaults and role gates.

Known risks:
1. **Two chart libraries.** ECharts (~150 KB tree-shaken) on top of Recharts. Mitigation: lazy-load ECharts routes; or go Nivo-only.
2. **better-auth is young and now Vercel-owned.** MIT and self-hostable, but API churn is real; pin versions, keep auth behind a thin `lib/auth.ts` facade. SAML with the real corporate IdP must be tested against a staging IdP (signed assertions vs responses, NameID format, clock skew) before promising a date.
3. **Next.js in a corporate network**: `NEXT_TELEMETRY_DISABLED=1`, no `next/font/google` (self-host the font), Server Actions behind a reverse proxy need `allowedOrigins`.
4. **TanStack Table v8 -> v9**: pick one and pin.
5. **Matrix at scale** (2,000 people x 300 skills = 600k cells) is not a DOM problem: aggregate server-side, show teams x skill groups by default, drill down. ECharts canvas copes with ~50k cells.
6. **Executive vs team views** tempt a second design language. One component set; vary density with a `compact` mode, not new components.

## Design rules from the reference dashboards *(opinion, from Linear, Vercel, Plane, Cal.com, PostHog, Grafana 11, Tremor blocks, shadcn dashboard-01)*

1. **Neutral canvas, one accent.** Near-white/near-black neutrals, 2-3 grey text steps, exactly one accent colour for the primary action and selected nav item. Status uses 3-4 muted semantic colours, never a rainbow.
2. **Chart colours restrained and ordered.** 5 chart colours max, desaturated, first matching the accent. Heatmaps use a single-hue sequential scale, diverging only for "gap vs requirement".
3. **Density from typography, not boxes.** 13-14 px table text, 32-36 px rows, hairline dividers, no zebra striping, right-aligned tabular numbers. Cards: one 1 px border, no shadow, no gradient.
4. **Filters in a toolbar above the content, not a sidebar.** Chips/combobox buttons in one row with a search box; active filters as removable chips; all in the URL. Left sidebar is navigation only, collapsible to icons.
5. **KPI tiles small and few.** 4-5 in one row, number + delta + sparkline, icons at most 16 px.
6. **Progressive disclosure.** Overview -> click a team -> drawer with the team heatmap -> click a person -> profile page. Drawers for detail, full pages only for things people bookmark, modals only for confirmations.
7. **Spacing scale** 4/8/16/24 px; page padding 24 px; grid gap 16 px; section headers are text, not bars.
8. **Dark mode is a token swap**, same hierarchy and borders; charts read the same variables; test heatmap legibility in both.
9. **Monochrome line icons** (Lucide) at 16 px; no illustrations in the app shell.
10. **Empty, loading and error states designed** (skeletons, one-line empty copy with a primary action).

## URLs

Templates: https://github.com/satnaing/shadcn-admin - https://github.com/Kiranism/next-shadcn-dashboard-starter - https://ui.shadcn.com/blocks - https://ui.shadcn.com/docs/components/data-table - https://ui.shadcn.com/docs/components/chart - https://www.shadcnblocks.com/pricing - https://tailadmin.com/pricing - https://github.com/TailAdmin/free-react-tailwind-admin-dashboard - https://github.com/horizon-ui/horizon-ui-chakra - https://github.com/cruip/tailwind-dashboard-template - https://tailwindcss.com/blog/tailwind-is-joining-shopify - https://tremor.so/ - https://github.com/tremorlabs/tremor - https://github.com/vercel/nextjs-postgres-nextauth-tailwindcss-template - https://refine.dev/docs/ - https://github.com/ant-design/ant-design-pro - https://github.com/mui/toolpad - https://github.com/minimal-ui-kit/material-kit-react - https://github.com/devias-io/material-kit-react - https://github.com/codedthemes/berry-free-react-admin-template - https://github.com/coreui/coreui-free-react-admin-template - https://keenthemes.com/metronic/pricing - https://github.com/nuxt-ui-templates/dashboard - https://github.com/huntabyte/shadcn-svelte - https://github.com/themesberg/flowbite-admin-dashboard - https://github.com/ColorlibHQ/AdminLTE - https://github.com/design-sparx/mantine-analytics-dashboard

Charts: https://github.com/recharts/recharts - https://github.com/plouc/nivo - https://nivo.rocks/heatmap/ - https://github.com/apache/echarts - https://github.com/hustcc/echarts-for-react - https://github.com/airbnb/visx - https://github.com/observablehq/plot - https://github.com/chartjs/Chart.js - https://github.com/kurkle/chartjs-chart-matrix - https://github.com/bumbeishvili/org-chart - https://github.com/xyflow/xyflow - https://github.com/plotly/plotly.js

Tables: https://github.com/TanStack/table - https://tanstack.com/blog/announcing-tanstack-table-v9 - https://tanstack.com/table/v8/docs/guide/grouping - https://www.ag-grid.com/react-data-grid/community-vs-enterprise/ - https://mui.com/x/react-data-grid/pivoting/ - https://github.com/KevinVandy/mantine-react-table

Auth / stack: https://better-auth.com/docs/plugins/sso - https://better-auth.com/docs/plugins/admin - https://better-auth.com/blog/better-auth-joins-vercel - https://better-auth.com/blog/authjs-joins-better-auth - https://github.com/nextauthjs/next-auth - https://authjs.dev/getting-started/providers/boxyhq-saml - https://github.com/boxyhq/jackson - https://github.com/node-saml/node-saml - https://github.com/tngan/samlify - https://github.com/SAML-Toolkits/python3-saml - https://github.com/IdentityPython/pysaml2 - https://github.com/keycloak/keycloak - https://github.com/goauthentik/authentik - https://github.com/drizzle-team/drizzle-orm - https://github.com/prisma/prisma - https://nextjs.org/docs/app/api-reference/config/next-config-js/output - https://docs.docker.com/guides/nextjs/containerize/

Design references: https://linear.app - https://vercel.com/dashboard - https://plane.so - https://cal.com - https://posthog.com - https://blocks.tremor.so - https://ui.shadcn.com/examples/dashboard

Not verified: exact publish date of `@tremor/react` 3.18.7, current MUI X Pro price, whether Metronic's React/Next edition is fully released.
