# Skill Management

Track what people can do, what each team needs, and whether to **train, develop, move or hire** to close the gap, from the whole organisation down to one person.

Built to stay simple: filters in one toolbar, a heatmap that colours the *gap* rather than the raw level, a few charts, and drill-down from executive to team to person. Light and dark themes. Local sign-in to start (`admin` / `admin`), SAML 2.0 single sign-on when you are ready.

![Overview](docs/screenshots/01-overview.png)

## Contents

- [What it does](#what-it-does)
- [How the numbers work](#how-the-numbers-work)
- [Sign-in and access](#sign-in-and-access)
- [Deploy with Docker](#deploy-with-docker)
- [Import and export](#import-and-export)
- [Develop](#develop)
- [Stack and supply chain](#stack-and-supply-chain)
- [Not built yet](#not-built-yet)

## What it does

### For executives and department heads

- **Overview** for any unit: five tiles (on target, assessed, critical gaps, single points of failure, stale), a **heatmap of units by skill category** coloured by the share of required skill ratings on target, the **top gaps with a train / develop / move / hire plan**, a 12-month **trend**, and **rating calibration** by team.
- Click a unit to go down a level; click a category to see its skills. Every filter (unit, category, role, validated or self-assessed levels) lives in the URL, so any view can be bookmarked or shared.
- **Gaps & actions**: every short team need, the single points of failure, a **hiring plan** (what is left after training, development and moving spare people), individual gaps, and training booked. Every table exports to CSV.

| Team heatmap | Gaps & actions |
|---|---|
| ![Team heatmap](docs/screenshots/02-team-heatmap.png) | ![Gaps](docs/screenshots/03-gaps.png) |

### For managers

- **People × skills heatmap** for their team: each cell is the person's validated level, coloured by the gap to *their own* target. A dot means awaiting validation, faded means stale, hatched means not assessed. The bottom row is **team coverage** (people at the level / people needed), flagging single points of failure.
- **Validate**: a queue of submitted self-assessments. Accept the level or change it, add evidence (required for Advanced and Expert), or send it back with a note. Bulk-accept per person.
- **My team**: say what the team needs, as in "2 people at Proficient in Kubernetes". The team need is on top of what the roles already expect. If the skill is not in the catalogue, add it there and then.
- **Per-person targets**: set a different required level for one person, with a reason, without touching the role standard.
- **Training plans** against a gap, with a link, due date and status.

| My team | Validate |
|---|---|
| ![My team](docs/screenshots/06-my-team.png) | ![Validate](docs/screenshots/07-validate.png) |

### For everyone

- **Self-assessment**: rate each skill 0–5 against plain-language level definitions. The person's role target is marked, and so is what their team needs. Add a comment, flag "I want to grow this", add skills they have beyond their role, or **suggest a skill** the catalogue lacks (an administrator approves it).
- **My profile**: role fit, self against validated against target by category (radar), what the next grade needs, training plans, and skills well above target.

| Self-assessment | Profile |
|---|---|
| ![Self-assessment](docs/screenshots/08-self-assessment.png) | ![Profile](docs/screenshots/04-person.png) |

### For administrators

| Section | What |
|---|---|
| Organisation | The unit tree (company, division, department, team), unit managers, people (deactivate leavers; history stays) |
| Taxonomy | Category › skill › sub-skill (for example Cloud › AWS › EC2), aliases, status. Approve suggested skills, **merge duplicates** (ratings, targets and needs move across; the old name becomes an alias) |
| Roles & targets | Required level per role and skill, for all grades or per grade; mandatory or optional |
| Levels | The wording of the 0–5 scale |
| Cycles | Assessment rounds with a due date; one open at a time |
| Users & access | Accounts, access role, which person an account is, local passwords, disable |
| Single sign-on | SAML 2.0 identity provider from metadata or by hand; the service-provider values to give the identity team |
| Import & export | CSV in and out for everything below; dry run first; remove the demo data to go live |
| Settings | When a rating goes stale; colour thresholds |
| Audit log | Every change: who, what, when |

![Roles and targets](docs/screenshots/09-admin-roles.png)

Dark mode follows the system and can be set per person:

![Dark mode](docs/screenshots/10-overview-dark.png)

## How the numbers work

All of it is computed in one place (`src/lib/engine/engine.ts`), unit-tested, never stored.

- **Levels 0–5**: No Exposure, Awareness, Working, Proficient, Advanced, Expert. "Not assessed" is blank, never 0.
- **Self and validated are separate.** Management views use the manager-validated level by default; a toggle shows self-assessed levels instead.
- **Required level precedence**: a manager's per-person target, then the role's target for the person's grade, then the role's target for all grades. The source is shown on hover.
- **Only leaf skills are rated.** A skill with active sub-skills is a heading.
- **Gap = target − level.** 0 or less meets the target; 1 is minor; 2 is significant. 3 or more is critical, and so is a target of Proficient or higher held at Awareness or below.
- **Roll-ups count pairs, never average levels.** "On target" is the share of (person, required skill) pairs at or above target, so a department's number is exactly the sum of its teams.
- **Team needs**: an explicit need (N people at level L), or one implied when two or more members' roles need a mandatory skill (one person at the role baseline). **Coverage** is the people at or above L. One holder is a single point of failure; none is a critical gap.
- **What to do about a short need**, in order. Train someone one level below. Develop someone two levels below who said they want the skill. Move or share a spare holder from another team (each spare person is offered to one gap only). Hire the rest.
- **Stale**: a validated rating older than the setting (12 months by default) shows faded; optionally it stops counting as on target.
- **Calibration**: the average of self minus validated per team. Above +1 means people and managers read the scale differently.

## Sign-in and access

- **First start** creates `admin` / `admin`. With `FORCE_PASSWORD_CHANGE=true` (the default in both env files) it must choose a new password, of at least 10 characters, before anything else opens.
- **Access follows who people are.** Anyone who manages a unit or has direct reports is a **manager** automatically, and sees, validates and sets targets for their people. Everyone else is a **team member**: their own profile and self-assessment. **Executive** (read everything) and **Administrator** are assigned in Admin › Users & access.
- **Local accounts** can be added for people without SSO; they set their own password at first sign-in.
- **SAML 2.0 single sign-on** (Admin › Single sign-on): paste the identity provider's metadata XML, or enter its entity ID, sign-in URL and signing certificate. Give the identity team the values on the same page:

  | | |
  |---|---|
  | Entity ID (Audience) | `${APP_URL}/api/auth/sso/saml2/sp/metadata?providerId=<id>` |
  | ACS URL (HTTP-POST) | `${APP_URL}/api/auth/sso/saml2/sp/acs/<id>` |
  | Name ID | e-mail address |
  | Attributes | `email` (and `displayName`); other names are configurable |
  | Signing | assertions must be signed |

  Accounts are created at first sign-in and linked to the person with the same e-mail. The local `admin` stays as a break-glass login. `test/saml.test.ts` runs the whole flow against a made-up identity provider: a signed assertion signs in; a tampered one, or one signed by another key, is refused.

## Deploy with Docker

One command per place, each with a committed env file that holds **no secrets**:

```bash
docker compose --env-file home.env up --build -d
```

```bash
docker compose --env-file work.env up --build -d
```

- `work.env` holds **placeholders on avro.com** for the image registry prefix, apt mirror, npm registry and proxy. Replace them on the work machine with the real values, and never commit those. `home.env` uses the public registries with no proxy.
- A token for a private npm registry is given for one command only: `NPM_TOKEN=... docker compose --env-file work.env up --build -d`.
- Corporate CA certificates for a TLS-inspecting proxy go in `certs/*.crt` (gitignored) on the build machine.
- Two containers, host networking. **PostgreSQL 17** listens on `127.0.0.1:${DB_PORT}` only; the **app** listens on `${APP_PORT}` (8080). Put TLS in front of the app (the company load balancer, or a reverse proxy) and set `APP_URL` to the https address people type: secure cookies and SAML depend on it.
- **Data** lives in `${DATA_DIR}`. `pgdata/` holds the database (bind mount). `secrets/` holds the database password and the session-signing secret, generated on the first start and readable only by the app's user. At work `DATA_DIR` sits outside the code folder, so copying a new version over the code never touches the data.
- **First start** migrates the database and creates `admin`. With `SEED_DEMO=true` it also loads the demo organisation (Avro Corp, made-up people), once. Sign in as `exec`, `manager` or `employee` with password `demo` to see each audience. Remove the demo in Admin › Import & export when going live.
- **Upgrade**: copy the new code, run the same command again. Migrations apply on start.
- **Backup**:

  ```bash
  docker exec skill-management-db-1 pg_dump -U skills -d skills -Fc > skills-$(date +%F).dump
  ```

| Key | Meaning |
|---|---|
| `IMAGE_REGISTRY`, `APT_MIRROR`, `NPM_REGISTRY`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` | Where the build downloads from. Empty means off. |
| `APP_PORT`, `APP_BIND`, `APP_URL`, `TRUSTED_ORIGINS` | How people reach it |
| `DB_PORT` | PostgreSQL's loopback port |
| `SEED_DEMO`, `FORCE_PASSWORD_CHANGE`, `ORG_NAME` | First start |
| `DATA_DIR`, `TZ` | Where the data lives; time zone |

## Import and export

Admin › Import & export, or `GET /api/export/<kind>` as an administrator. CSV with names, paths (`Avro Corp > Technology`, `AWS > EC2`) and e-mail addresses, never internal ids. Every export imports back unchanged (`test/transfer.test.ts` proves it end to end). Bad rows are skipped and reported by line; **Check (dry run)** changes nothing.

Load in this order the first time: `skills`, `grades`, `roles`, `role-skills`, `units`, `people`, `person-targets`, `team-needs`, `ratings`, `training-plans`.

## Develop

```bash
npm ci
```

```bash
npm run dev
```

Without `DATABASE_URL` the app uses an embedded PostgreSQL (PGlite) in `.data/`, so development needs no database server and no Docker. Put `SEED_DEMO=true` in `.env.local` for the demo organisation.

```bash
npm test
```

```bash
npm run typecheck
```

| Test | What it holds |
|---|---|
| `test/engine.test.ts` | Every rule in *How the numbers work* |
| `test/db.test.ts` | Migrations, seeding (idempotent), `admin`/`admin`, the demo story |
| `test/transfer.test.ts` | CSV round trip of everything, dry run, line-numbered errors |
| `test/saml.test.ts` | SAML sign-in end to end; tampered and wrongly signed assertions refused |
| `test/deployment.test.ts` | The deployment rules: pins, the 72-hour gate, no site locations baked in, no secrets in env files, anchored ignores |

Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` and commit the new file in `drizzle/`.

## Stack and supply chain

Next.js 16 (App Router, standalone output) · TypeScript · Tailwind CSS 4 · shadcn/ui · TanStack Table · Recharts · better-auth with its SAML plugin · Drizzle ORM · PostgreSQL 17 (PGlite in development).

- **Nothing younger than 72 hours is installed.** Dependency versions are exact. `scripts/check-release-age.cjs` checks every lockfile entry against `deps-publish-times.json` (committed; refresh with `npm run deps:age`), offline, inside the Docker build after `npm ci`.
- **Images are pinned by digest** (`image-pins.json` records when each was pushed). A digest is the same behind a registry mirror.
- The build reaches nothing on the internet beyond the package registry: telemetry is off, and the font is self-hosted.
- The runtime image is Ubuntu 24.04 running as an unprivileged user with a read-only root filesystem. It carries no proxy, registry or token. The health check uses curl, not a language runtime.

```
src/lib/engine/engine.ts   every number: targets, gaps, roll-ups, coverage, hire / train plan
src/db/                    schema, migrations, first-start seed, demo organisation
src/lib/transfer.ts        CSV import and export
src/lib/auth.ts, saml.ts   local sign-in and SAML single sign-on
src/app/(app)/             the pages; src/app/actions/ the server actions
deploy/db-entrypoint.sh    generates the secrets on the first start
```

## Not built yet

Picked up from the design notes in `IDEAS.md`; none needed for the requirements so far.

- Certifications with expiry dates and reminders
- E-mail digests for managers (pending validations, new critical gaps)
- Peer endorsements as a third, labelled value
- SCIM provisioning from the identity provider (people come from CSV or first SSO sign-in)
- SAML single logout (signing out ends the app session only)
