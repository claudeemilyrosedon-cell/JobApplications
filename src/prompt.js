// Role-fit prompt and response handling, shared by the site and the GitHub
// scoring workflow (scripts/score-roles.mjs). Mirrors the role-fit-assessment skill.

export const REQUIRED_FIELDS = ["company", "title", "location", "salary", "fit", "hire", "tier", "cos_path", "note"];

const RESUME_VERSIONS = `A = Consumer/DTC (Green Street DTC brand wins) — consumer, ecomm, CPG, retail
B = AI-Native Operator (AI agent deployment + adoption playbooks) — AI-first companies, AI transformation roles
C = Enterprise Ops + AI (cross-functional execution at Alaska Airlines scale) — enterprise, healthcare tech, matrixed orgs
D = Startup PM (spec writing, OKRs, 0→1) — roles that prefer a PM background`;


export function buildPrompt(profile, jobs, existingRoles) {
  const resumeSection = profile.resumes.length
    ? profile.resumes.map((r, i) => `Resume ${i + 1} — "${r.name || `Resume ${i + 1}`}":\n${r.content}`).join("\n\n")
    : "(No resume text saved in profile — use the version definitions below.)";

  const existing = existingRoles
    .map((r) => `#${r.num} | ${r.company} | ${r.title} | ${r.url || ""}`)
    .join("\n");

  const jobsSection = jobs
    .map((j, i) => `JOB ${i + 1}\nURL: ${j.url || "(none)"}\n${j.jobDescription ? `JOB DESCRIPTION:\n${j.jobDescription}` : "JOB DESCRIPTION: (not pasted — open the URL and read the posting)"}`)
    .join("\n\n=====\n\n");

  return `You are a career advisor with HR and hiring-manager experience, scoring ${jobs.length} job posting${jobs.length === 1 ? "" : "s"} for a personal job-search tracker. Be candid — say "do not apply" when warranted.

CANDIDATE CONTEXT:
${profile.context || "(No context saved in profile.) Emily Rose Don — Los Angeles. 10+ yrs product management / CX / operations (Alaska Airlines PM; Green Street Digital DTC & B2B; AI agent shipped to production; daily Claude Code, Vercel, Lovable, GitHub). Target: Chief of Staff / Founder's Office roles, base floor $180K, long-term tech/AI company COO path toward $500K. LA or fully remote. Values work-life balance. Gaps: no direct reports, no consulting/IB/PE/MBA, no financial modeling/M&A/fundraising, never held a CoS title, no engineering degree."}

RESUME VERSIONS (recommend one letter):
${RESUME_VERSIONS}

CANDIDATE RESUME TEXT:
${resumeSection}

SCREENS — check every posting:
- Hard disqualifier (a REQUIRED credential she lacks: N yrs people management, engineering degree, HR/EA experience, "absolute must" domain, pass/fail domain signal, 0–5 yrs experience band) → tier 4, flag "No", disqualified true, resumeVersion "".
- Title in disguise: EA work (calendar, travel, expenses, errands) or HR/People ops with a CoS title → low fit.
- Comp vs $180K base floor → compClass: "floor_meets" (low end ≥ $180K), "ceiling_meets" (only top end ≥ $180K), "unlisted", "below".
- Location → locationClass: "la_remote" (LA, LA-adjacent, or fully remote), "remote_plus" (remote with travel or tough time zone), "relocation", "unknown".
- Reporting line → pathClass: "ceo_coo" (CEO, COO, founder, or dual), "cpo_cto", "other" (CBO/CRO/CDO/GM/CVP/Deputy), "wrong_direction" (credential leads away from a tech/AI COO: consumer brand, media, philanthropy, PE professional services, legacy enterprise, hardware/space/semis).
- Background filters: consulting/IB/PE/MBA required vs preferred; "PM background preferred" is a strong positive; prior CoS title preferred is a gap.
- Work-life signals: 24/7, Sundays, weekends, 50% travel → mention in note.
- Positive signals: Claude / Claude Code named, AI agent deployment or adoption mandate, CEO+COO dual reporting, travel / DTC / consumer-health domain match.
- Anonymous company → add "company name and investors" to openQuestions. Gated posting you cannot read → tier 5, flag "LinkedIn" or "Inaccessible", fill what you can.
- Duplicates: if a job matches an EXISTING ROLE below (same company + role, or same URL), set duplicateOf to that #number.

TIERS: 1 Apply Now (LA/remote, strong fit, salary on target, COO path clear) · 2 Apply — review location · 3 Apply — minor gaps · 4 Research first / do not apply · 5 Details unavailable.
FLAGS: LA, Remote, Remote+, NYC, SF, Bay Area, Chicago, Miami/NYC, Palo Alto, Non-LA hybrid, Reach, No, Unknown, Inaccessible, LinkedIn.

EXISTING ROLES (for duplicate checks):
${existing}

JOBS TO SCORE:
${jobsSection}

Reply with ONLY a JSON array (no markdown fences, no commentary) — one object per job, in the same order, each with exactly these fields:
{
  "url": "the job's URL",
  "company": "string",
  "title": "string",
  "location": "string incl. in-office days",
  "remote": true | false | null,
  "salary": "as stated, or 'Unlisted'",
  "fit": 1-10 (skills + domain match to her documented work, not company quality),
  "hire": "Very High | High | Medium-High | Medium | Medium-Low | Low-Medium | Low | Very Low",
  "tier": 1-5,
  "cos_path": "estimated years to COO from this seat, e.g. '4–6 yrs', or a short phrase like 'Wrong type for tech COO'",
  "flag": "one of the FLAGS",
  "resumeVersion": "A | B | C | D, or '' if she should not apply",
  "compClass": "floor_meets | ceiling_meets | unlisted | below",
  "locationClass": "la_remote | remote_plus | relocation | unknown",
  "pathClass": "ceo_coo | cpo_cto | other | wrong_direction",
  "disqualified": true | false,
  "deadline": "YYYY-MM-DD or null",
  "postedDate": "YYYY-MM-DD or null",
  "openQuestions": ["short things to confirm before applying, e.g. 'comp', 'remote from LA'"],
  "duplicateOf": existing #number or null,
  "note": "3–5 dense sentences: company context, how requirements map to her specific wins (name them), honest gaps, comp/location/COO-path verdict, what to confirm, and why this resume version"
}`;
}

export function toRole(parsed, fallbackJob) {
  const url = parsed.url || fallbackJob?.url || "";
  return {
    company: parsed.company,
    title: parsed.title,
    location: parsed.location,
    remote: typeof parsed.remote === "boolean" ? parsed.remote : null,
    salary: parsed.salary,
    fit: parsed.fit === null || parsed.fit === undefined ? null : Number(parsed.fit),
    hire: parsed.hire,
    tier: Number(parsed.tier),
    cos_path: parsed.cos_path,
    note: parsed.note,
    flag: parsed.flag || "Unknown",
    resumeVersion: parsed.resumeVersion || parsed.recommendedResume || null,
    compClass: parsed.compClass || undefined,
    locationClass: parsed.locationClass || undefined,
    pathClass: parsed.pathClass || undefined,
    disqualified: parsed.disqualified === true,
    deadline: parsed.deadline || null,
    postedDate: parsed.postedDate || null,
    openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.filter(Boolean) : [],
    duplicateOf: parsed.duplicateOf ?? null,
    url,
    jobDescription: fallbackJob?.jobDescription || "",
    applied: false,
  };
}
