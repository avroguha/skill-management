# Skill Management - ideas on top of the MVP, and the template recommendation

Written 2026-11-12 against the seven P0 requirements in [REQUIREMENTS.md](REQUIREMENTS.md).
Research behind it: [research/product-survey.md](research/product-survey.md) (what 20 products do and what their users complain about) and [research/ui-stack.md](research/ui-stack.md) (templates, chart libraries, SAML stacks). Nothing is built yet.

The guiding rule from the owner: **simple, informative, uncluttered**. So every idea below is judged on one question: does it make the heatmap and the hire/train decision more honest, or does it add a widget? Ideas that only add widgets are in the "not building" list at the end.

---

## 1. Reading of the seven P0s - where each needs sharpening

| # | P0 | Keep as is | Sharpen before building |
|---|---|---|---|
| 1 | Skill taxonomy | Category -> skill -> sub-skill tree, admin-managed | Fix the depth at **3 levels** and make only leaves rateable (every product that lets categories be rated ends up with inconsistent data). Add **aliases** ("K8s" = "Kubernetes"), a **status** (draft / active / retired) and **merge** so renames do not orphan history. Decide where a tool-specific skill lives once (one skill entity org-wide; the *target* varies by role, never the skill - Skills Base's hard-won rule). |
| 2 | Proficiency framework 0-5 | Six named levels, exactly as given | Write each level as **observable autonomy**, not an adjective (e.g. Working = "does routine tasks without help"; Advanced = "handles the hard cases and coaches others"), because self-ratings cluster at the midpoint when the words are vague. Keep **"not assessed" separate from 0** - 0 is a fact, blank is a missing fact, and the heatmap must not paint them the same. Store the scale as data so it can change without code. |
| 3 | Role-to-skill mapping | Required skills + target level per role/grade | Add a **mandatory / nice-to-have** flag per role-skill (otherwise every role has 40 "required" skills and the gap list is noise). Add an optional **minimum headcount per team per skill** ("this team needs 2 people at Proficient in AWS"). Without a demand number the app can say *who is weak* but never *what to hire* - this one field is what turns a matrix into a hiring plan. |
| 4 | Employee self-assessment | Rate + comment per skill | Run it inside an **assessment cycle** with a due date (quarterly or half-yearly), so completion is measurable and the data has a date. The single biggest complaint about every product surveyed is stale, half-filled data. Record **last assessed** on every rating. Let the employee add skills outside their role profile (that is how hidden capability surfaces). |
| 5 | Manager validation | Manager records validated proficiency | Store **self and validated as two values**, never overwrite. Management views use validated only; the person page shows both and the delta. Require a **one-line evidence note** when validating 4 or 5 (the two levels that drive hire/no-hire decisions). Give the manager a **validation queue** (bulk approve where they agree) or validation will not happen - CivicActions' experience: supervisor assessment "supported but not used". |
| 6 | Skill-gap calculation | Target - Validated, categorised | Define the categories now: **exceeds (<0)**, **meets (0)**, **minor (1)**, **significant (2)**, **critical (3+ or target >= Proficient with validated <= Awareness)**, plus **not assessed** as its own bucket. Define **precedence of the required level**: role default -> team override -> individual override by manager, each stamped with who/when, and the UI shows which one applies. "Manager provides required level" in the P0 must not silently replace the role standard, or roles stop meaning anything. |
| 7 | Team skill heatmap | People x skills, proficiency and gap indicators | This is the product. Specification in section 4. The one addition that matters: a **coverage row** under each skill column (people at/above target / required headcount) - the exact feature a Kahuna reviewer asked for and could not get. |

## 2. Who looks at it, and the one screen each gets

Five screens total. Every screen has the same filter bar (division, department, team, role, skill category, cycle, "stale only"), the same colour legend, and drills into the next by clicking. No separate "dashboard builder".

| Persona | Screen | What they see in one glance | What they click to |
|---|---|---|---|
| **Executive / leadership** | **Overview** | 5 KPI tiles (assessed %, on-target %, critical gaps, single points of failure, stale %); heatmap **org unit x skill category** coloured by % on target; top-10 gaps list with a train/hire tag; one trend line | A cell -> that unit's heatmap. A gap -> the skill explorer |
| **Department head** | Same Overview, filter pinned to their subtree | Teams x categories | Team |
| **Manager / team lead** | **Team** | Heatmap **people x skills** (grouped by category) with the coverage row; validation queue count; gap list sorted worst-first | A cell -> inline validate; a person -> Person |
| **Employee** | **Person** (own) | Radar of validated vs role target; skill list with self / validated / target / last assessed; what to grow for the next grade | Start or update self-assessment |
| **Anyone with a question** | **Skill explorer** | One skill across the org: distribution bar by level, who has it, where it is in surplus, trend | A person; a team |
| **Admin** | **Admin** | Taxonomy tree, roles and grades, org units, cycles, users and SSO, import/export | - |

Role gates: Admin sees all; Executive reads all; Manager reads and validates their subtree only; Employee reads self and their team's **aggregate** (not colleagues' individual ratings, unless the owner wants the MuchSkills-style transparency - open question below).

## 3. Additions beyond the MVP, tiered

**P1 - ship with or right after the MVP; without these the MVP data is not trustworthy enough to act on**

1. **Org hierarchy with roll-up.** Org units as a tree (company > division > department > team), employee belongs to one unit, unit has a manager. Roll-up metric = **% of required (person, skill) pairs at or above target** - numerators and denominators simply add up the tree, so the executive number and the team number agree. Never average levels across people (an average hides one expert and four novices).
2. **Assessment cycles.** Named period, due date, who is in scope, completion % per team, reminder emails. Managers get a "12 of 18 submitted, 7 to validate" line.
3. **Staleness.** Rating older than N months (default 12) renders grey-hatched, counts in the stale KPI, and is excluded from "on target" if the admin chooses. Nothing decays silently.
4. **Coverage and single point of failure.** Per team per skill: people at/above target vs required headcount; **SPOF badge** when exactly one. This is the bus-factor view leadership actually asks for.
5. **Hire-vs-train tagging on every gap** (rule in section 5).
6. **Self-vs-validated calibration view.** One small table per manager or team: average delta between self and validated ratings. A delta over 1 means the scale is being read two ways; this is how the admin finds teams that need the level definitions re-explained.
7. **People finder.** "Who has Kubernetes at Proficient or above?" - a filter on data the app already holds, almost free, and the most-used feature in Skills Base and Kahuna.
8. **Snapshots for trends.** Store the roll-up numbers per unit per month. The executive question "are we getting better?" needs history from day one; it cannot be reconstructed later.
9. **CSV import and export that round-trips** (people, org, taxonomy, role profiles, ratings). Reviewers of three products complained that exports could not be re-imported. Also the only realistic way to seed 500 people and 200 skills.
10. **Rating history and audit** (who changed what, when) - needed for trends anyway and for HR to trust the numbers.

**P2 - next increment, each small, each makes the hire/train output better**

11. **Interest flag per skill** ("want to grow this"). One checkbox turns the training list from "people who are weak" into "people who are weak *and willing*" (the skill-will idea from MuchSkills and Skills Base, without their bubble UI).
12. **Certifications** with issue date, expiry, evidence file; expiring-in-90-days list; optional link "cert X satisfies skill Y at level Z".
13. **Training actions against gaps**: planned / in progress / done, due date, link to the course. Not an LMS, just closing the loop so a gap can show "training booked" instead of staying red for a year (AG5's reviewers had to run a second tool for this).
14. **Role fit and next-grade view** on the person page: % of the role profile met, and the shortest list of skills that would satisfy the next grade. This is what gets employees to keep their data current.
15. **Surplus / internal mobility hint**: when a team lacks a skill that another team has in surplus (coverage above required headcount), say so before saying "hire".
16. **Manager digest email**: pending validations, newly critical gaps, expiring certs, stale ratings. Weekly, one email.
17. **Over-qualification flag** (validated well above target on mandatory skills): a retention and mobility signal, shown only on the person page and skill explorer.

**P3 - later, only if asked**

18. **AI assist for admins only**: suggest skills and target levels from a role title or job description when building a profile; draft level descriptors. **Never infer an employee's proficiency** - reviewers distrust inferred ratings (Eightfold, Workday) and it undermines the validated/self distinction the P0s are built on.
19. **Peer endorsement** as a third, clearly-labelled value. Adds data; adds noise. Off by default.
20. **Project or initiative staffing** ("who can we put on X?") - the people finder with a saved list.
21. **Multiple managers / dotted lines.** Model one manager per unit in v1; matrix reporting doubles the permission logic for little value in a skills tool.

## 4. The heatmap - the one component that has to be right

- **Colour means gap, not level**, in every management view: green = meets or exceeds, amber = one below, red = two or more below, **grey = not required for this person**, **hatched = not assessed**. Raw level (0-5, single-hue scale) appears only on the person page. Mixing the two meanings is the most common reason skills matrices become unreadable.
- **Three zoom levels, each fits one screen**: org unit x category (exec) -> people x skills in one team (manager) -> one person x their skills (person). Never render 500 x 200; the executive grid is computed server-side.
- **Column footer** per skill: coverage "3 / 2" (at-or-above target / required), SPOF badge, "hide green columns" toggle so the view shrinks to what needs attention.
- **Rows sorted worst-gap-first** by default; row header shows the person's role and on-target %.
- **One toggle**: validated (default) / self / both.
- **Legend always visible**, five colours maximum, each paired with an icon or hatch so it survives colour-blindness and greyscale printing.
- **Hover = tooltip with the numbers and the date; click = inline validate (manager) or open the person.** No modal for reading.
- **Export the current view** as CSV and PNG - executives paste these into decks.

## 5. The hire-vs-train rule (the app's actual output)

For every team x skill where coverage is below required headcount, or a mandatory skill has a critical gap:

1. Anyone in the team at **target - 1** -> **train** (short course, pairing). Interest flag set -> listed first.
2. Anyone at **target - 2** with interest set -> **develop** (longer plan).
3. Another unit has **surplus** on the skill -> **move or share** (shown before hire).
4. Otherwise -> **hire**, with the level and headcount shortfall stated.

Every gap in the top-10 list carries one of those four tags. No product surveyed documents such a rule; it is the thing an executive wants read out to them.

## 6. Data model sketch (enough to validate the ideas, not a schema)

`org_unit` (tree) - `employee` (unit, role, grade, manager, sso subject) - `skill_category` (tree, 2 levels) - `skill` (leaf; aliases; status) - `proficiency_level` (0-5, name, autonomy text) - `role` and `grade` - `role_skill` (role, skill, target level, mandatory) - `unit_skill_requirement` (unit, skill, min headcount, optional target override) - `assessment_cycle` - `rating` (employee, skill, cycle, self level, self comment, validated level, validated by, evidence note, interest, assessed at) - `rating_history` - `certification` - `training_action` - `snapshot` (unit, skill or category, month, numerator, denominator) - `user`, `session`, `sso_provider` (from the auth library).

Gap, coverage, SPOF, on-target % and the hire/train tag are **computed views**, never stored columns, so a change to a role profile is reflected everywhere at once.

## 7. What we deliberately will not build (anti-clutter)

No LMS or course catalogue; no gamification, badges or leaderboards; no 9-box or performance review; no 12-widget configurable dashboards; no bubble charts; no inferred proficiency from resumes or ticket data; no chat; no mobile app (responsive web is enough); no per-user colour schemes beyond light/dark; no rainbow category colours.

## 8. Template and stack - recommendation

Full comparison with stars, licences and dates in [research/ui-stack.md](research/ui-stack.md).

**Decided (owner, 2026-11-12): shadcn/ui blocks on Next.js, not a purchased template.**

| Layer | Choice | Why |
|---|---|---|
| Look and components | **shadcn/ui** blocks (`dashboard-01`, `sidebar-07`, `login-03`) + the data-table recipe; **shadcn-admin** (MIT, 16.7k stars, active) as the page-pattern reference | The clean, neutral, one-accent look the owner described is exactly what these are; nothing to strip out; MIT; copied into the repo so the corporate npm mirror is irrelevant |
| Framework | **Next.js 16** App Router, standalone output | One container, one language, one build; fits the existing home.env / work.env Docker pattern |
| Tables and filters | **TanStack Table** + shadcn faceted filters, filter state in the URL | Every view linkable; the exec, manager and employee views are the same pages with different defaults |
| Heatmap, radar, org tree | ~~Apache ECharts~~ **plain HTML tables** for the heatmaps, Recharts for the radar | Changed while building: no view renders more than a team at once, so a table gives sticky headers, grouped skill columns, the coverage row, hatching for "not assessed" and keyboard access more simply than a canvas chart. One chart library instead of two. |
| Simple charts | **Recharts 3** through shadcn's chart wrapper | Trend lines, bars, sparklines with theme colours for free |
| Auth | **better-auth**: email+password and admin plugin now, `@better-auth/sso` (SAML 2.0) later, all on the same user table | Seed `admin/admin` on day one with forced password change, add the corporate IdP later with no re-architecture, keep local login for break-glass. Auth.js cannot do SAML without a second service and now points new projects at better-auth |
| Data | **Postgres + Drizzle** | Mainstream; matrix aggregates as SQL views |

Rejected and why: **Tremor** (lovely charts, but no commit in 13 months since Vercel bought it), **Tailwind Catalyst** (sales closed after Tailwind Labs joined Shopify), **MUI Toolpad** (archived Sept 2026), **Horizon / Mosaic / Minimal / Devias** (idle 18-22 months), **Ant Design Pro / Metronic** (capable but dense and hard to strip), **Refine** (good CRUD framework, but this app is mostly visualisation), **AG Grid / MUI DataGrid** (grouping and pivot are paid tiers; the matrix is better built as a computed grid anyway). A Python backend (FastAPI + pysaml2) is viable but costs a second container, a second package mirror and a C dependency for SAML.

Risks worth saying out loud: better-auth is young and now Vercel-owned (pin versions, keep it behind one file); SAML must be tested against the real IdP's staging tenant early; two chart libraries cost ~150 KB extra (lazy-load the ECharts routes); the corporate build needs telemetry off and a self-hosted font.

Design rules to hold the line on clutter (from Linear, Vercel, Plane, PostHog, shadcn's own example): neutral canvas with one accent; five chart colours maximum; density from typography, not boxes; filters as chips in a toolbar, sidebar for navigation only; 4-5 KPI tiles in one row; drawers for detail, pages only for things people bookmark; dark mode as a token swap; designed empty and loading states.

## 9. Taxonomy seed

The example taxonomy in the requirement (Cloud -> AWS -> EC2, platform -> module -> feature) suggests a hand-built, company-specific tree, which is right. If a broader seed is wanted: **ESCO** (13k skills, free with attribution, CSV) for breadth; **SFIA 9** for IT role profiles but it needs a licence for a large organisation; **O*NET** level descriptors (CC BY) are good wording to borrow for the six level definitions. Lightcast and LinkedIn are not downloadable.

## 10. Open questions for the requirement owner

1. **Required headcount per team per skill** - will managers maintain it? It is the difference between "who is weak" and "what to hire".
2. **Precedence** when a manager's required level differs from the role standard: override per person, or raise the role?
3. **Transparency**: can employees see their teammates' validated levels (MuchSkills says it keeps self-ratings honest), or only aggregates?
4. **Cycle cadence**: quarterly, half-yearly, or continuous with a 12-month staleness rule?
5. **Is 0-5 fixed?** Research favours four positive levels with clear anchors; the P0 says six. Keeping six is fine if the level texts are concrete.
6. **Org source**: HR export CSV, or SAML attributes (department, manager) on first login?
7. **Grades**: how many per role, and does the target level step with grade (Engineer I: Working, Engineer II: Proficient ...)?
8. **Executive anonymity**: should the overview ever show names, or only counts until you reach a team?
9. **Scale**: how many people and skills in the first year (changes whether the matrix needs server-side aggregation on day one)?

## 11. Notes

- Start with `admin/admin`, force a change on first login, and log the seed account's use; SAML is a configuration step later, not a rewrite.
- Built 2026-11-12: P0s, the P1 list and from P2 the interest flag, training plans, role fit and next grade, the surplus (move) step and over-qualification. Not built: certifications, the manager digest e-mail, AI assist, peer endorsement (README, "Not built yet").
