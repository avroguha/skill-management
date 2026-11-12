# Skill Management - Requirements

Status: built 2026-11-12. Each requirement below names where it lives in the app.

## Non-functional, from the owner

| Requirement | Where |
|---|---|
| Simple, informative, **uncluttered**: filters, a heatmap and a few well-chosen graphs | One filter toolbar per view (state in the URL); two heatmaps; three charts (trend, radar, distribution) |
| Audience spans **high-level management -> team -> employee**; each level sees what it needs | Overview drills company -> division -> department -> team -> person; access follows who people are (below) |
| Modern UI, light and dark theme | shadcn/ui, one accent colour; theme follows the system or is chosen per person |
| Login: seed account `admin / admin` initially, then **SAML SSO** | `admin/admin` on first start, not forced to change (setup only, disabled once SSO works); Admin › Single sign-on (SAML 2.0): test pop-up, mapping, activate |
| Docker deployment with the company build rules but no company data; on git with a README, screenshots, functions and capabilities | `docker compose --env-file work.env up --build -d` (or `home.env`); avro.com placeholders in `work.env`; README.md |

## MVP (all P0), as received

| # | Requirement | MVP functionality | Why it matters | Where |
|---|---|---|---|---|
| 1 | Skill taxonomy | Admin can create skill categories, skills and sub-skills. Example: Cloud -> AWS -> EC2; an ITSM platform -> Discovery -> Patterns | Foundation for everything else | Admin › Taxonomy |
| 2 | Proficiency framework | Standard 0-5 levels with clear definitions: No Exposure, Awareness, Working, Proficient, Advanced, Expert | Prevents inconsistent interpretation of ratings | Admin › Levels; shown beside every rating |
| 3 | Role-to-skill mapping | Define required skills and target proficiency by role/grade | Establishes what "good" looks like for each role | Admin › Roles & targets |
| 4 | Employee self-assessment | Employee rates proficiency against assigned/selected skills and adds comments | Establishes initial skill inventory | Self-assessment |
| 5 | Manager validation | Manager reviews the rating and records validated proficiency | Avoids relying only on self-declared capability; makes assessments evidence based | Validate (evidence required for 4-5) |
| 6 | Skill-gap calculation | Automatically calculate Target Level - Validated Level and categorise gaps; manager provides the required level | Converts assessment data into actionable information | Engine; per-person targets on a profile; Gaps |
| 7 | Team skill heatmap | Manager view of people x skills, using proficiency and gap indicators | Makes team capability and gaps immediately visible | Overview at team level, with a coverage row |

## Added by the owner during the build

| Requirement | Where |
|---|---|
| Employees add their skills and proficiency; managers approve or change them | Self-assessment ("Add a skill you have"); Validate (accept, change the level, or send back) |
| Managers / teams add the skills the team needs | My team (N people at level L per skill; a missing skill is added to the catalogue from there) |
| Team members select those skills, or other skills they have learned that the team may not need | Self-assessment lists role skills, the team's needs, and anything else they add; a skill missing from the catalogue can be suggested for approval |
| Roles based on who people are: manager, team member and so on | A person who manages a unit or has reports is a manager automatically; everyone else a team member; Executive and Administrator are assigned |
| Don't force the admin password reset; the account is for setup and is disabled once SSO works | `FORCE_PASSWORD_CHANGE=false` in both env files; disable `admin` in Admin › Users & access |

## Added by the owner: ServiceNow, SSO and the org chart (2026-11-12)

| Requirement | Where |
|---|---|
| User and manager data and designation come from ServiceNow `sys_user`; a setting to add the ServiceNow config | Admin › ServiceNow: instance, integration user, password (stored encrypted) |
| A top-level `user_name`; people below it fetched recursively | The sync walks down the manager field from the top user |
| A configurable field (user type or another) selects which users come in; only those people can sign in | User type field plus values, with **Load values** counts; an extra encoded query; the SSO gate admits only active people |
| A test button when adding the integration | **Test**: a dry run listing who would come in, at what level, and who is left out |
| A schedule keeps the data up to date | Sync every N hours, or **Sync now**; history of every run |
| Fields user_name, display name, e-mail, manager | Mapped fields, plus designation (`title`) and any extra columns to keep |
| SSO: a test pop-up showing the fields the provider returns, a mapping to identify the person, an Activate button | Admin › Single sign-on: Test sign-in (captured, nobody signed in), Identify the person with Check, Activate |
| A tree view of who is at what level: high-level info, "i" for important info, click to go inside; drawn like an org-chart template (cards with photos, connectors) | Org chart: cards with photo, level, headcount and on-target share, connectors, three levels at a time, the **i** panel, drill-in with breadcrumbs; a List view |
| Everything fluid and responsive on any screen; nothing breaking | No page scrolls sideways from 320 px to wide desktop (checked page by page); the org chart and validation queue change layout on narrow screens |
| User images from a URL with a placeholder replaced by a field of the user | Admin › ServiceNow › Photos: `{user_name}`, `{email}`, `{sys_id}` or a kept column |
| No reliable source of organisation data | Teams are built from the manager chain (switchable); other organisation sources are not built |
| Only team and individual capability; no suggestions such as hiring | The train / develop / move / hire plan is removed; Overview and Gaps report capability only |

## Open questions for the requirement owner

See IDEAS.md section 10. The build took these defaults, each easy to change:

1. Required headcount per team: managers set it on My team; without it, a skill two or more members' roles need implies one person.
2. Precedence: a manager's per-person target overrides the role for that person only, with a reason.
3. Transparency: employees see their own profile only; managers see their people.
4. Cadence: assessment cycles with a due date, plus continuous updates; ratings go stale after 12 months.
5. Scale: 0-5 as received.
