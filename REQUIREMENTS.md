# Skill Management - Requirements

Status: built 2026-11-12. Each requirement below names where it lives in the app.

## Non-functional, from the owner

| Requirement | Where |
|---|---|
| Simple, informative, **uncluttered**: filters, a heatmap and a few well-chosen graphs | One filter toolbar per view (state in the URL); two heatmaps; three charts (trend, radar, distribution) |
| Audience spans **high-level management -> team -> employee**; each level sees what it needs | Overview drills company -> division -> department -> team -> person; access follows who people are (below) |
| Modern UI, light and dark theme | shadcn/ui, one accent colour; theme follows the system or is chosen per person |
| Login: seed account `admin / admin` initially, then **SAML SSO** | `admin/admin` on first start, not forced to change, and kept once SSO works (the way in when SSO is down); Settings › Single sign-on (SAML 2.0): test pop-up, mapping, activate |
| Docker deployment with the company build rules but no company data; on git with a README, screenshots, functions and capabilities | `docker compose --env-file work.env up --build -d` (or `home.env`); avro.com placeholders in `work.env`; README.md |

## Version 2 (owner, 2026-11-18): simpler, after using it at work

The feedback: "too complicated once deployed in the company". What it asked for, and where it is now:

| Requirement | Where |
|---|---|
| Simple and obvious for tech-savvy managers and leadership; nothing more than one or two clicks away | Seven menu entries, each shown only to who needs it; every team tab and every Settings section is a link of its own, one click from where you are |
| Users and teams with managers; no company divisions or other structure | A team is a manager and everyone below them, from the reporting lines (ServiceNow or the people CSV); units removed |
| Self-assessment for people, not managers and above; managers may add skills | Managers are not asked (Settings › Levels & rules can ask them too) and count in no gap; they can add skills, which count as capability |
| Self-assessment search was tiny and hid everything | My skills: a full-width search over the whole catalogue (names, categories, aliases), category chips, results listed on the page with level buttons; nothing in a pop-up |
| Management sees what they have and what they need, and who is a fit for another team | Insights: capability by team, where teams are short with who elsewhere has it, strengths, people who could strengthen another team; the same on each person's page |
| Upload a CSV of skills | Settings › Skills, first on the page: check, decide on near-identical skills, import (the work copy's feature, kept) |
| E-mail through the open relay, and telling managers they need to do something | Settings › E-mail: relay, test, which e-mails, preview of each; to the manager when ratings are sent, a weekly digest of what waits for them, weekly reminders to people with something left to do, Remind on My team |
| A demo mode that does not touch the real data, like a phone's store mode | The Demo switch: this browser on a separate demo database, orange bar, choose who you are, reset, back to real data |
| No settings hidden under clicks; every field has an (i) | Settings sections always listed on the left; Field / ToggleField / LabelInfo carry the (i); a field cannot be declared without it, and a test fails on a bare label |
| Keep what is set up (SSO, ServiceNow, synced users) | Version 2 imports version 1 once into a new database and leaves version 1 unchanged (README › Upgrading from version 1) |
| npm registry and other site locations in the work env file; HTTPS apt mirror behind the proxy | `work.env` names every build location (avro.com placeholders in git); the CA in `certs/` is trusted by apt from its first download |

Removed in version 2 to keep it simple (left in the version-1 database): units, assessment rounds, per-person targets, training plans, open positions and talent advice, the chart builder and the Operator role, the Power BI / Tableau API, the feedback inbox, the guided tour, monthly trends. Rows below that mention them describe version 1.

## MVP (all P0), as received

| # | Requirement | MVP functionality | Why it matters | Where |
|---|---|---|---|---|
| 1 | Skill taxonomy | Admin can create skill categories, skills and sub-skills. Example: Cloud -> AWS -> EC2; an ITSM platform -> Discovery -> Patterns | Foundation for everything else | Settings › Skills |
| 2 | Proficiency framework | Standard 0-5 levels with clear definitions: No Exposure, Awareness, Working, Proficient, Advanced, Expert | Prevents inconsistent interpretation of ratings | Settings › Levels & rules; shown beside every rating |
| 3 | Role-to-skill mapping | Define required skills and target proficiency by role/grade | Establishes what "good" looks like for each role | Settings › Roles & targets |
| 4 | Employee self-assessment | Employee rates proficiency against assigned/selected skills and adds comments | Establishes initial skill inventory | My skills |
| 5 | Manager validation | Manager reviews the rating and records validated proficiency | Avoids relying only on self-declared capability; makes assessments evidence based | My team › To confirm |
| 6 | Skill-gap calculation | Automatically calculate Target Level - Validated Level and categorise gaps; manager provides the required level | Converts assessment data into actionable information | Engine; Insights; each person's page |
| 7 | Team skill heatmap | Manager view of people x skills, using proficiency and gap indicators | Makes team capability and gaps immediately visible | My team › Skills grid, with a coverage row |

## Added by the owner during the build

| Requirement | Where |
|---|---|
| Employees add their skills and proficiency; managers approve or change them | Self-assessment ("Add a skill you have"); Validate (accept, change the level, or send back) |
| Managers / teams add the skills the team needs | My team (N people at level L per skill; a missing skill is added to the catalogue from there) |
| Team members select those skills, or other skills they have learned that the team may not need | Self-assessment lists role skills, the team's needs, and anything else they add; a skill missing from the catalogue can be suggested for approval |
| Roles based on who people are: manager, team member and so on | A person who manages a unit or has reports is a manager automatically; everyone else a team member; Executive and Administrator are assigned |
| Don't force the admin password reset | `FORCE_PASSWORD_CHANGE=false` in both env files |

## Added by the owner: ServiceNow, SSO and the org chart (2026-11-12)

| Requirement | Where |
|---|---|
| User and manager data and designation come from ServiceNow `sys_user`; a setting to add the ServiceNow config | Settings › ServiceNow: instance, integration user, password (stored encrypted) |
| A top-level `user_name`; people below it fetched recursively | The sync walks down the manager field from the top user |
| A configurable field (user type or another) selects which users come in; only those people can sign in | User type field plus values, with **Load values** counts; an extra encoded query; the SSO gate admits only active people |
| A test button when adding the integration | **Test**: a dry run listing who would come in, at what level, and who is left out |
| A schedule keeps the data up to date | Sync every N hours, or **Sync now**; history of every run |
| Fields user_name, display name, e-mail, manager | Mapped fields, plus designation (`title`) and any extra columns to keep |
| SSO: a test pop-up showing the fields the provider returns, a mapping to identify the person, an Activate button | Settings › Single sign-on: Test sign-in (captured, nobody signed in), Identify the person with Check, Activate |
| A tree view of who is at what level: high-level info, "i" for important info, click to go inside; drawn like an org-chart template (cards with photos, connectors) | Org chart: cards with photo, level, headcount and on-target share, connectors, collapsed cards that load their people on Expand, the **i** panel, drill-in with breadcrumbs; a List view |
| New people get a role from their ServiceNow designation |  Settings › ServiceNow › Roles from designation: ordered rules (is / starts with / contains -> role, grade), fill empty roles by default, Create from current roles, shown in Test |
| Administrators can impersonate a user to see exactly what they see and troubleshoot |  View as on a profile or in Users & access: their exact view, read-only, one hour, banner with Stop viewing, audited under the administrator |
| People with reports get My team: their people, the skills their team needs, and what else a manager looks after |  My team: tiles; People (direct or everyone below, self-assessment progress, to validate, on target, gaps, training); Skills needed; Gaps; Training |
| The top-level person does not add any skills |  Engine rule (isTop): nothing required, no self-assessment, not counted in any figure |
| An admin can clear all data and start from scratch (for a limited test) |  Import & export › Start from scratch: organisation, optionally accounts and history; configuration kept; backup taken first |
| Export and import of configuration and all data as a backup, and automatic export |  Import & export › Backups: one file with everything, download, restore (stored or uploaded), automatic schedule, safety backups |
| A change to the website or a redeploy does not impact the database |  Data and backups outside the code folder and image; demo loads once; backup before every database change; deployment test asserts the folders |
| Everything fluid and responsive on any screen; nothing breaking | No page scrolls sideways from 320 px to wide desktop (checked page by page); the org chart and validation queue change layout on narrow screens |
| User images from a URL with a placeholder replaced by a field of the user | Settings › ServiceNow › Photos: `{user_name}`, `{email}`, `{sys_id}` or a kept column |
| No reliable source of organisation data | Teams are built from the manager chain (switchable); other organisation sources are not built |
| Only team and individual capability; no suggestions such as hiring | The train / develop / move / hire plan is removed; Overview, Gaps and Talent report capability only. Confirmed 2026-11-15: still no suggestion to hire anywhere; a test fails on hiring nudges in page text |
| An overview at each level: what talent the organisation has and what is lacking | Talent (any unit): strengths, what is lacking, depth by category, role and grade mix, beyond the role, wanted, one level down, every skill |
| Endpoints for Tableau, Power BI or CSV, set up by an administrator like creating users | Admin › Integrations: a key per tool and report, chosen datasets and expiry, steps per tool, last use, revoke; OData, CSV and JSON endpoints |
| Robust for 8-10k people active on the portal | Engine rebuilt and precomputed once per data change, pages capped, org chart loaded a level at a time, several app processes, indexes; load-tested at 10,404 people (README › Scale and sizing) |
| Indexing, and PostgreSQL if it helps | Production already runs PostgreSQL 17 (the embedded database is for development and tests only); an index on every foreign key (migration 0003) |
| Org chart cards collapsed to their numbers; one level down by default; more on Expand | The chart opens on the top and one level; a card loads its people when expanded |
| FAQ, feedback and contact us | Help: FAQ by audience, contact details, feedback form and replies; Admin › Help & feedback: inbox, FAQ and contact editors |
| A guided tour per persona that highlights the buttons with what they do | The tour: team member, manager, executive and administrator steps on the real pages, offered once, restarted from Help |
| SSO setup: download this app's metadata; the Entity ID and ACS (Reply URL) values for Entra ID | Settings › Single sign-on: Download metadata (Entra: Upload metadata file), the values with copy buttons |
| Upload the identity provider's Federation Metadata XML, with a Test SSO option | Upload (or drop, or paste) the file; what it holds and its certificate expiry are shown before saving; Test SSO pop-up |
| In the test pop-up, map the SSO response to the user table | The pop-up stays open with the returned values: the value that identifies the person, and the account's name, e-mail and login name; Check and Save there |
| Restrict who can sign in by group, or to users imported from ServiceNow; an AD group or a ServiceNow group | Who may sign in: everyone imported from ServiceNow, or members of chosen ServiceNow groups and/or AD groups (the groups claim); administrators always let in |
| Import ServiceNow group data | The sync imports the synced people's groups and memberships (sys_user_group, sys_user_grmember); Settings › ServiceNow › Groups |
| A manager adds an open position (if needed) and the tool suggests what type of talent to look for | My team › Open positions, added only by the manager: open positions (role, grade, skills, headcount, notes; filled / cancelled / reopen / delete); under each, the talent to look for: must bring, can be coached, nice to have, other short team needs, a suggested role and grade, experienced or not, and people in the organisation who already have most of it |
| With no open position, the training that would be useful for the team from its skill requirements | My team › Open positions (when nothing is open) and › Training: per skill, who is below their target or one level below a short team need, who can coach, course / coaching / external, booked already; Book makes a training plan for each person chosen |
| See the types of graph available | 11 fixed views before this (heatmaps by unit and by person, trend line, calibration and coverage lists, radar, level distribution, ranked, stacked and proportion bars, org chart); now also any chart an operator builds |
| Graphs made in the app so data need not be moved out, with screenshots taken automatically | Charts: built from live data, nine chart types, saved as settings only; PNG per chart (title, subtitle, legend, date), Download all as PNG, Copy as image. Screenshots on demand only (the owner's choice, 2026-11-15) |
| The admin account is still there after SSO is enabled | The local `admin` cannot be disabled, lose the Administrator role or be tied to a person, and single sign-on never signs anyone into it; local sign-in stays on the sign-in page next to SSO. Its password can be changed (`src/lib/local-admin.ts`) |
| A script to set up the certificate | `scripts/install-cert.sh <downloaded file>`: PEM bundle or PFX, password asked once, chain built and checked, old pair backed up; the app serves HTTPS on 443 (80 redirects), makes a self-signed certificate on the first start and picks up a new one within a minute without a restart (README › HTTPS and the certificate) |
| An operator role for a leader who builds charts, with visibility of data in that hierarchy | Operator (Admin › Users & access): own hierarchy plus leaders or units an administrator assigns, read-only there; builds charts over them (both kinds of scope, the owner's choice) |

## Open questions for the requirement owner

See IDEAS.md section 10. The build took these defaults, each easy to change:

1. Required headcount per team: managers set it on My team; without it, a skill two or more members' roles need implies one person.
2. Precedence: a manager's per-person target overrides the role for that person only, with a reason.
3. Transparency: employees see their own profile only; managers see their people.
4. Cadence: assessment cycles with a due date, plus continuous updates; ratings go stale after 12 months.
5. Scale: 0-5 as received.
