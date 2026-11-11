# Skill Management - Requirements

Status: built 2026-11-12. Each requirement below names where it lives in the app.

## Non-functional, from the owner

| Requirement | Where |
|---|---|
| Simple, informative, **uncluttered**: filters, a heatmap and a few well-chosen graphs | One filter toolbar per view (state in the URL); two heatmaps; three charts (trend, radar, distribution) |
| Audience spans **high-level management -> team -> employee**; each level sees what it needs | Overview drills company -> division -> department -> team -> person; access follows who people are (below) |
| Modern UI, light and dark theme | shadcn/ui, one accent colour; theme follows the system or is chosen per person |
| Login: seed account `admin / admin` initially, then **SAML SSO** | `admin/admin` on first start, forced password change; Admin › Single sign-on (SAML 2.0), tested end to end |
| Docker deployment with the company build rules but no company data; on git with a README, screenshots, functions and capabilities | `docker compose --env-file work.env up --build -d` (or `home.env`); avro.com placeholders in `work.env`; README.md |

## MVP (all P0), as received

| # | Requirement | MVP functionality | Why it matters | Where |
|---|---|---|---|---|
| 1 | Skill taxonomy | Admin can create skill categories, skills and sub-skills. Example: Cloud -> AWS -> EC2; an ITSM platform -> Discovery -> Patterns | Foundation for everything else | Admin › Taxonomy |
| 2 | Proficiency framework | Standard 0-5 levels with clear definitions: No Exposure, Awareness, Working, Proficient, Advanced, Expert | Prevents inconsistent interpretation of ratings | Admin › Levels; shown beside every rating |
| 3 | Role-to-skill mapping | Define required skills and target proficiency by role/grade | Establishes what "good" looks like for each role | Admin › Roles & targets |
| 4 | Employee self-assessment | Employee rates proficiency against assigned/selected skills and adds comments | Establishes initial skill inventory | Self-assessment |
| 5 | Manager validation | Manager reviews the rating and records validated proficiency | Avoids relying only on self-declared capability; makes assessments evidence based | Validate (evidence required for 4-5) |
| 6 | Skill-gap calculation | Automatically calculate Target Level - Validated Level and categorise gaps; manager provides the required level | Converts assessment data into actionable information | Engine; per-person targets on a profile; Gaps & actions |
| 7 | Team skill heatmap | Manager view of people x skills, using proficiency and gap indicators | Makes team capability and gaps immediately visible | Overview at team level, with a coverage row |

## Added by the owner during the build

| Requirement | Where |
|---|---|
| Employees add their skills and proficiency; managers approve or change them | Self-assessment ("Add a skill you have"); Validate (accept, change the level, or send back) |
| Managers / teams add the skills the team needs | My team (N people at level L per skill; a missing skill is added to the catalogue from there) |
| Team members select those skills, or other skills they have learned that the team may not need | Self-assessment lists role skills, the team's needs, and anything else they add; a skill missing from the catalogue can be suggested for approval |
| Roles based on who people are: manager, team member and so on | A person who manages a unit or has reports is a manager automatically; everyone else a team member; Executive and Administrator are assigned |

## Open questions for the requirement owner

See IDEAS.md section 10. The build took these defaults, each easy to change:

1. Required headcount per team: managers set it on My team; without it, a skill two or more members' roles need implies one person.
2. Precedence: a manager's per-person target overrides the role for that person only, with a reason.
3. Transparency: employees see their own profile only; managers see their people.
4. Cadence: assessment cycles with a due date, plus continuous updates; ratings go stale after 12 months.
5. Scale: 0-5 as received.
