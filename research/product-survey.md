# Skills / competency management software: domain survey (2026-11-12)

Research report. Everything marked **[opinion]** is the researcher's judgement; the rest is sourced.
G2 and Capterra block fetchers, so review quotes come from Software Advice, SoftwareReviews, eLearning Industry, SoftwareFinder and search snippets.

## Product-by-product

### Skills Base (skills-base.com)
- **Data model.** Entities: Skills, nested Skill Categories (categories themselves are not rateable), Teams, Roles, People, Locations. A person's skill set is inherited from Team, Role, "all skills" or a custom category pick. Default rating scheme **1-5**, configurable from 2 levels up to 11 (0-10); a separate, independently configured **interest** scale; optional N/A ("decline to rate") and 0; labels/descriptions customisable, overridable per category; reducing the range triggers a "precision loss" warning. Rater types: self-assessment and supervisor assessment (privilege-gated); no formal approval workflow documented. (https://educrowd.freshservice.com/support/solutions/articles/11000078302-setup-guide, https://educrowd.freshservice.com/support/solutions/articles/11000025167-modifying-the-rating-scheme)
- **Targets / gaps.** Competency Targets are set per Team or Role (individual targets need special enablement; vendor advises against them). **Competency % = actual / target**, capped at 100% in reports; >100% flagged as over-qualification. Vendor guidance: one skill entity org-wide, vary only the target by role (never "Junior Java"/"Senior Java"); baseline targets at role level, team targets layered on top. (https://www.skills-base.com/understanding-proficiency-the-guide-to-competency-skill-gaps, https://educrowd.freshservice.com/support/solutions/articles/11000025156-competency-targets)
- **Views.** Heat Matrix (colour-coded skill + interest), Capability Matrix, Competency tab (graph + table of average level vs target), Competency Analysis bubble chart (Enterprise tier), dashboards per Location/Team/Role/Person with "top skills / most skilled / keen to improve (low skill, high interest)", People Finder. Colour convention: **green = meets/exceeds target, red/orange = below, grey = not required**; "a red column = group deficiency (train), a red row = individual/role-fit issue". Team roll-up uses *average* level vs target.
- **Real-world usage.** CivicActions: 1-5 self-rating, supervisor assessment "supported but not used", annual email nudge to re-assess, "even senior staff will likely have many 1s and 2s". (https://guidebook.civicactions.com/en/latest/04-how-we-work/tools/skills-base/)
- **Reviews.** Praise: "Great snapshot of the team at any one time". Complaints: exported data "does not easily upload back"; categories "not in harmony" (sync bug); interface "could benefit from a more modern design"; basic reporting; no native learning.
- **Pricing.** Free (25 people / 250 skills), Teams $2/user/mo, Enterprise $3/user/mo (SSO, Competency Analysis), Ultimate custom.

### AG5 (ag5.com) - the "skills matrix" reference point, frontline/manufacturing
- **Data model.** Skills/qualifications with **expiry dates and expiry alerts**, certificates stored, audit trails and e-signatures. Assessment methods: manager observation, practical test, third-party certification. Scale customer-defined; AG5 recommends 5 levels: **Apprentice, Beginner, Intermediate, Advanced, Expert**. (https://www.ag5.com/competency-proficiency-scale/)
- **Views.** Matrix filterable by shift, department, role, equipment; "see where skills are missing, expiring, or under-staffed"; cross-training / single-point-of-failure framing; multi-site roll-up. Reviewer: "Green is good, red is bad. soo simple. also you can make crossselections and different views easely." (https://www.softwareadvice.com/hr/ag5-profile/reviews/)
- **Hierarchy.** Skills organised in a drag-and-drop tree with tags.
- **Reviews (SA 14, avg 4.4; G2 ~66 at ~4.6).** Praise: ease of use, matrix clarity, support, Excel import at onboarding. Complaints: "no dashboard, insufficient reporting"; "report functionality is lacking"; "time to get new people used to the back end"; "managing a lot of qualifications is sometimes a little bit tricky (adding the needed qualifications to a position)"; "the difference between qualifications and trainings makes it confusing"; "purely a competency matrix ... another solution needed for the planning side of training"; Excel breaks down "at more than 100 competencies and/or employees".

### Kahuna (kahunaworkforce.com) - validation-centric
- **Data model.** "Validates competency, not just completion." Per-skill configurable validation methods, assessors, proficiency levels, equivalencies, prerequisites and workflow stages; skills assigned by role, location, job code; CertIQ tracks credential lapses; annual re-assessment framing. (https://kahunaworkforce.com/kahuna-skills-manager/)
- **Views.** Team Matrix, Capability Planning (who is qualified for an initiative, gaps), Insights dashboards (readiness, compliance), Talent Finder over *validated* skills.
- **Reviews.** One detailed review (Dec 2025, machinery, 500+): wants "a 'Competency Coverage' column in the team matrix that shows the current number of competent employees next to the target number required ... to tell at a glance whether we are meeting targets"; "the way the front-end handles color coding and icons" forced manual workarounds. G2 praise: "group competency validation". (https://softwarefinder.com/hr/kahuna)
- **Pricing.** Custom; third-party estimate $5-12/user/mo plus large implementation fees.

### MuchSkills (muchskills.com)
- **Data model.** Nine-level "3x3": proficiency (Beginner/Intermediate/Expert) x interest = skill-will matrix; bubble UI. Managers validate in 1:1s or on certificate completion; profiles visible to colleagues "which keeps self-reporting realistic"; certifications with evidence, issue/expiry, audit history, reminders. Taxonomy ~20k industry + 12k technical skills + 9.7k certifications. Role profiles with required levels were still "in the pipeline" in May 2025.
- **Views.** Gap analysis by role/team/department/tag "shown as heatmaps and filtered lists"; leadership view = counts per skill area split Expert/Intermediate/Beginner; regional view = % of staff at Intermediate-or-above vs a target (e.g. 70%); org chart with skills; team builder. Leadership reports anonymised.
- **Reviews.** Praise: "beautifully designed interface - clean, modern, intuitive"; "management dashboard gives valuable insights into skill distribution". Complaints: "maintaining a high-quality and up-to-date skills database still requires ongoing time and effort"; no minimum skill level per role (then); team-builder dialog "poor usability"; bulk certificate upload.

### SkillsDB (skillsdb.com)
- **Data model.** Frameworks = levels + sections + benchmarks; **0 (N/A) to 5 with behavioural anchors**; manager and self assessment stored separately with a toggle; flags Mentor / Expert / Focus area / Interest area; training records attached to cells.
- **Gap maths.** "Required level minus assessed level, per person, role, and site"; benchmarks per role; aggregate to division or org.
- **Roll-up metrics (documented).** "On Target" = % of manager grades in a career >= benchmark; "Skill Gaps" = % below; "Meets Target" = share of team whose *average* grade meets benchmark; Skill Trends = average grade over time. Indicators: green up-arrow exceeds, blue star meets, red down-arrow below, grey dash no grade. Views: matrix, leaderboards, skill concentration, distribution, radar, 9-box, trends. (https://help.skillsdb.com/manager-guide/analyze-skills)
- **Pricing.** Free (50 users, 50 skills), Team $7/user/mo, Scale $10 (SAML/OIDC SSO, SCIM, API), Enterprise custom.

### SkillsTX (SFIA-based)
- SFIA 9: 147 skills, 7 levels of responsibility; free self-assessment; optional validation by accredited assessor. "Team-level heatmaps of coverage and risk", gap analysis against required profiles, 600+ mapped job roles. Capterra: "learning curve for new administrators ... can be steep." ~$130/user/yr.

### Workday Skills Cloud
- Skill types: Skills Cloud (global ML-maintained), tenanted, crowdsourced, external. **Five customisable levels: Beginner, Intermediate, Experienced, Advanced, Expert**, computed as a *weighted average of sources* (self-rating, requested feedback, assessment, external; weights sum to 100%); default bands Experienced 3.00-3.99, Advanced 4.00-4.49, Expert 4.50-5.00; "Not Applicable" when no source. Endorsements are a source. Daily job suggests skills from courses, projects, job history. (https://doc.workday.com/admin-guide/en-us/human-capital-management/skills-and-skills-cloud/skills-cloud/nwa1636053540881.html)
- Adoption evidence: inferred skills existed but internal mobility "under 4% utilization" because outputs never reached managers.

### SAP SuccessFactors Talent Intelligence Hub
- Attributes Library with a **proficiency scale per attribute type**; choose number of levels, whether lowest is 0 or 1, whether "Too New to Rate" exists. Growth Portfolio = employee's attributes with AI-suggested skills; Role Readiness compares against expected levels. Trap: editing a scale does not update attributes already in portfolios.

### Cornerstone Skills Graph
- ~53k skills; employees declare skills (have / want to develop / ignore), self-rate **proficiency, interest and enjoyment**, receive **peer** ratings. **Default 3 proficiency levels, extendable to 10**; recommended to mirror the performance rating scale minus N/A and "No Proficiency".

### Degreed
- **Eight-level** scale (Beginner ... Master) described by autonomy/complexity. Rating precedence: **Skill Review (assessment) > Manager > Self > Peer**; manager ratings employee-requested and private by default. Reviews: "Administrators may need additional training"; "Setting up advanced reporting for many teams can be difficult".

### Pluralsight Skill IQ / Role IQ
- 0-300 percentile score, 5 bands. Complaints: "measures theoretical knowledge, not practical coding ability".

### Gloat / Eightfold / iMocha
- Gloat: inferred skills; lowest scores Ease of Customization 74, Ease of Data Integration 79; "opportunities will not show to those employees that have not filled out their skills". Eightfold: infers skills "based on what other candidates with similar job titles report" - reviewers say this inflates profiles; cons: slow, profile inaccuracies. iMocha: Lightcast-normalised taxonomy; "Skill Confidence Score" + level label.

### Lattice Grow / 15Five / TeamSkills / Skillsboard
- Lattice: competency matrix = tracks x levels x competencies with text expectations; "format of our competency matrix is not customizable". 15Five: competency > skills > key behaviours per role; career-ladder levels. TeamSkills (open source, github.com/ericchansen/teamskills): Microsoft L100-L400 4-level scale colour-coded, matrix filterable by category, Entra ID login. Skillsboard -> hilighter.io: AI proposes role skills, manager validates.

## Data model consensus
- **Skill -> category tree** (2-3 levels in practice).
- **One skill entity org-wide; required level varies by role/team.** Never duplicate skills per seniority.
- **Scale: 4-5 named levels is the mode** (Workday 5, AG5 5, NIH 5, SkillsDB 0-5, Cornerstone default 3; outliers Degreed 8, SFIA 7). Several keep **N/A / "too new to rate"** separate from 0.
- **Who rates**: self first, manager validates; validated vs unvalidated stored as a flag; only validated values feed management views. Workday/Degreed add peer and formal assessment with an explicit precedence or weighting rule.
- **Interest/aspiration** as a second dimension (Skills Base, MuchSkills, Cornerstone, SAP).
- **Certifications with issue/expiry/evidence and alerts** (AG5, MuchSkills, Kahuna, Workday).
- **Freshness**: last-assessed date, annual/quarterly re-assessment nudges. No product exposes "last used" as a first-class field.

## Views every product has
Skills matrix (rows people, columns skills grouped by category; cell colour = level or level-vs-target), self vs manager toggle, per-role gap list, filters by department/role/location, people finder by skill >= level, certificate expiry list.

## Views only the best have
- **Coverage count vs target per skill per team** (the Kahuna reviewer's requested "Competency Coverage" column; MuchSkills "% at Intermediate+ vs 70% target").
- **Single point of failure** flag ("single column of one") - skillsinventory.com's heat-map patterns (https://skillsinventory.com/blog/how-to-read-a-skills-heat-map).
- **Distribution view separate from gap view** (Tellent: Gap Analysis = below/at/above; Proficiency Distribution = share at each level).
- **Self-vs-manager delta** as a diagnostic (a gap >1.0 means the scale is being read two ways).
- **Trend over time** of average level / % on target.
- **Over-qualification flag**.
- **Skill-will 2x2**.

## Roll-up methods observed
Average level vs target (Skills Base, SkillsDB); % of grades at/above benchmark (SkillsDB On Target); % of people whose average meets benchmark; headcount at/above required level vs required headcount (TeamGuru, MuchSkills). **[opinion]** For an executive heat-map, count-at-or-above-target is the only method that survives aggregation honestly: averages hide a team of one expert and four novices, and a single "% on target" per team drills cleanly to department and company (sum numerators and denominators). Keep "average level" only on the person page.

## What users hate
- **Reporting/dashboards weak** (AG5, Degreed, Skills Base).
- **Admin back-end complexity / learning curve** (AG5, SkillsTX, Degreed, Lattice).
- **Rigid colour/icon logic and non-customisable matrix** (Kahuna, Lattice).
- **Data upkeep burden** (MuchSkills).
- **Export/import friction** (Skills Base export won't re-import; AG5 wanted self-service Excel import).
- **Inference distrust** (Eightfold inflates; Workday suggestions never reaching managers).
- **Incomplete profiles block value** (Gloat).
- **Confusing object model** (AG5 qualifications vs trainings).
- **Praise is consistent**: "Green is good, red is bad. soo simple."; "Great snapshot of the team at any one time"; "clean, modern, intuitive"; fast Excel onboarding.

## Taxonomy seed options with licences
| Source | Size / structure | Levels | Licence | Download |
|---|---|---|---|---|
| **SFIA 9** | 147 skills, 6 categories, skill codes; 7 levels of responsibility | per-skill level descriptors | Free Corporate User licence for one SME's internal use; **Extended Corporate GBP 2,000/yr** for large orgs; registration required | PDF + spreadsheet (https://sfia-online.org/en/licensing-sfia/choosing-a-licence) |
| **ESCO v1.2.1** | 2,942 occupations, 13,485 skill concepts in a mono-hierarchy | none | Free for any purpose with attribution | CSV/RDF/JSON-LD, 28 languages (https://esco.ec.europa.eu/en/use-esco/download) |
| **O*NET 30.3** | 894 occupations; skills, knowledge, abilities | Importance 1-5, Level 0-7 | CC BY 4.0 | Excel/CSV/JSON/SQL (https://www.onetcenter.org/dictionary/30.3/excel/) |
| **Lightcast Open Skills** | 34,600+ skills | none | API contract-based, free tier limited; **no bulk download** | API only |
| **LinkedIn Skills Graph** | 41,000+ skills | none | No public API | n/a |
| **EU DigComp 2.2** | 5 areas, 21 competences | 8 proficiency levels | CC BY 4.0 | PDF + JRC dataset |

**[opinion]** Seed with ESCO for breadth; SFIA for IT role profiles only if the owner accepts the licence step; O*NET's Level 0-7 anchors are useful as descriptor wording.

## Proficiency scale evidence
Self-ratings correlate only r~.34 with supervisor ratings and run lenient (Heidemeier & Moser 2009, k=128); accuracy improves when raters expect comparison against a criterion; manager ratings for administrative purposes are less reliable (.45) than for research (.61). A midpoint becomes a "dumping ground"; 4-point forced choice removes it but evidence of better validity is mixed. Dreyfus (Novice, Advanced Beginner, Competent, Proficient, Expert) and NIH (Fundamental Awareness, Novice, Intermediate, Advanced, Expert, plus N/A) are the canonical 5-level anchors; Degreed's levels are built on autonomy (supervised -> independent -> leads others).

**[opinion] Recommendation:** levels phrased as observable autonomy, N/A kept separate from 0, self and manager ratings stored separately, management views show validated values, the delta shown on the person page, an evidence note required for the top two levels, and "last assessed" / "last used" dates per rating with cells shaded grey-stale after a configurable window (12 months default) rather than numbers decaying silently.

## UX patterns for an uncluttered heatmap
1. **Rows = people (or teams when zoomed out), columns = skills grouped under category headers**; read columns first (coverage risk), rows second (individual fit).
2. **Colour encodes level-vs-target, not raw level, in management views**: green meets/exceeds, amber one below, red two+ below, **grey = not required, blank/hatched = not assessed** (never conflate grey and 0). Raw-level sequential palette only on the person page.
3. **Never render 500 x 200.** Executive level shows a **team x category** grid where each cell is "% of required (person, skill) pairs at/above target" plus a count; click drills to team x skill, then person x skill. Each view on one screen.
4. **Per-column mini-stats** under the header: people at/above target / required headcount, and a SPOF badge when exactly one person is at/above target.
5. **Sort rows by gap** (worst first) and allow "hide fully-green columns".
6. **Legend always visible**, 4-5 colours max, colour-blind safe (colour + icon pairing).
7. **One toggle: self / manager / validated only.**
8. **Filters as chips, not forms**: division, department, team, role, category, "stale only", "expiring certs".
9. **Charts beyond the heat-map**: distribution bar per skill, trend line of % on target per team, and a hiring/training split: for each gap, if >=1 person is one level below -> training candidate; if nobody is above "Aware" -> hire. (Researcher's synthesis; no product documents such a rule.)
