// Scoring shared by the batch Add Roles flow and the Today's Top 5 panel.
// Mirrors the role-fit-assessment and daily-top-5 skills so the site and
// Claude rank roles the same way.

export const TARGET_BASE = 180000;

const HIRE_POINTS = {
  "very high": 20, "high": 16, "medium-high": 13, "medium": 10,
  "medium-low": 7, "low-medium": 5, "low": 3, "very low": 0,
};

const LOCATION_POINTS = { la_remote: 15, remote_plus: 10, unknown: 6, relocation: 3 };
const COMP_POINTS = { floor_meets: 15, ceiling_meets: 10, unlisted: 6, below: 0 };
const PATH_POINTS = { ceo_coo: 10, cpo_cto: 7, other: 4, wrong_direction: 0 };

function hirePoints(hire) {
  if (!hire) return 6;
  const key = String(hire).toLowerCase().split(" (")[0].trim();
  return HIRE_POINTS[key] ?? 6;
}

// Pull dollar figures like "$175–250K", "$189,700-278,567", "$150K".
function salaryNumbers(salary) {
  if (!salary) return [];
  // Drop percentages (bonus %, equity %) before reading dollar figures.
  const s = String(salary).replace(/,/g, "").replace(/\d+(?:\.\d+)?\s*%/g, "");
  const nums = [];
  const re = /(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(s))) {
    const n = parseFloat(m[1]);
    nums.push(n < 1000 ? n * 1000 : n);
  }
  return nums.filter((n) => n >= 50000 && n <= 1000000);
}

export function inferCompClass(role) {
  if (role.compClass) return role.compClass;
  const nums = salaryNumbers(role.salary);
  if (!nums.length) return "unlisted";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (lo >= TARGET_BASE) return "floor_meets";
  if (hi >= TARGET_BASE) return "ceiling_meets";
  return "below";
}

export function inferLocationClass(role) {
  if (role.locationClass) return role.locationClass;
  const flag = role.flag || "";
  if (["LA", "Remote", "LA/Remote?"].includes(flag)) return "la_remote";
  if (flag === "Remote+") return "remote_plus";
  if (["Unknown", "Inaccessible", "LinkedIn", ""].includes(flag)) return role.remote === true ? "la_remote" : "unknown";
  if (["No", "Reach", "Domain"].includes(flag)) return role.remote === true ? "la_remote" : "unknown";
  return "relocation";
}

export function inferPathClass(role) {
  if (role.pathClass) return role.pathClass;
  const path = String(role.cos_path || "").toLowerCase();
  if (/wrong|not a coo|not applicable|no clear path|hr track/.test(path)) return "wrong_direction";
  const title = String(role.title || "");
  if (/deputy/i.test(title)) return "other";
  if (/\b(CEO|COO|Founder|Founders|Founder's)\b/i.test(title) || /office of the ceo/i.test(title)) return "ceo_coo";
  if (/\b(CPO|CTO)\b/.test(title)) return "cpo_cto";
  if (/chief of staff$/i.test(title.trim())) return "ceo_coo";
  return "other";
}

export function isDisqualified(role) {
  if (role.disqualified === true) return true;
  if (role.flag === "No") return true;
  if (!role.resumeVersion && role.tier >= 4) return true;
  return false;
}

export function computePriority(role) {
  if (typeof role.priority === "number" && role.priorityLocked) return role.priority;
  if (isDisqualified(role)) return 0;
  const fit = Number(role.fit) || 0;
  return Math.round(
    fit * 4 +
    hirePoints(role.hire) +
    (LOCATION_POINTS[inferLocationClass(role)] ?? 6) +
    (COMP_POINTS[inferCompClass(role)] ?? 6) +
    (PATH_POINTS[inferPathClass(role)] ?? 4)
  );
}

function daysBetween(a, b) {
  return Math.floor((b - a) / 86400000);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

export function todayScore(role, now = new Date()) {
  const base = computePriority(role);
  let score = base;
  const reasons = [];

  const deadline = parseDate(role.deadline);
  if (deadline) {
    const left = daysBetween(now, deadline);
    if (left < 0) return { score: -1, base, reasons: ["deadline passed"], expired: true };
    if (left <= 3) { score += 15; reasons.push(`deadline in ${left}d`); }
    else if (left <= 7) { score += 8; reasons.push(`deadline in ${left}d`); }
  }

  const fresh = parseDate(role.postedDate) || parseDate(role.dateAdded);
  if (fresh) {
    const age = daysBetween(fresh, now);
    if (age <= 3) { score += 8; reasons.push("new posting"); }
    else if (age <= 10) { score += 4; reasons.push("recent posting"); }
    else if (age >= 30) { score -= 8; reasons.push("posting 30+ days old"); }
  }

  const open = Array.isArray(role.openQuestions) ? role.openQuestions : [];
  if (open.some((q) => /comp|salary|pay|location|remote|onsite|in-office/i.test(q))) {
    score -= 6;
  }

  return { score, base, reasons, expired: false };
}

export function whyLine(role) {
  const bits = [];
  if (inferLocationClass(role) === "la_remote") bits.push(role.flag === "LA" ? "LA-based" : "remote");
  const comp = inferCompClass(role);
  if (comp === "floor_meets") bits.push("comp floor ≥ target");
  else if (comp === "ceiling_meets") bits.push("comp reaches target");
  const path = inferPathClass(role);
  if (path === "ceo_coo") bits.push("CEO/COO-direct");
  if (Number(role.fit) >= 9) bits.push(`fit ${role.fit}/10`);
  return bits.slice(0, 3).join(" · ");
}

export function firstAction(role) {
  const open = Array.isArray(role.openQuestions) ? role.openQuestions : [];
  if (open.length) return `Confirm: ${open[0]}`;
  if (inferCompClass(role) === "unlisted") return "Confirm comp ≥ $180K with recruiter";
  if (role.resumeVersion) return `Tailor Ver. ${role.resumeVersion} and apply`;
  return "Pick a resume version and apply";
}

// daily-top-5: unapplied, tier 1–3, has resume version, priority > 0,
// one per company, best today score first.
export function topFive(roles, getStatus, now = new Date()) {
  const ranked = roles
    .filter((r) => getStatus(r) === "unapplied")
    .filter((r) => r.tier >= 1 && r.tier <= 3 && r.resumeVersion && !r.duplicateOf)
    .map((r) => ({ role: r, ...todayScore(r, now) }))
    .filter((x) => !x.expired && x.base > 0)
    .sort((a, b) =>
      b.score - a.score ||
      (Number(b.role.fit) || 0) - (Number(a.role.fit) || 0) ||
      (inferPathClass(a.role) === "ceo_coo" ? -1 : 0) - (inferPathClass(b.role) === "ceo_coo" ? -1 : 0)
    );

  const appliedCompanies = new Set(
    roles.filter((r) => getStatus(r) !== "unapplied").map((r) => companyKey(r.company))
  );
  const seen = new Set();
  const picks = [];
  const alsoConsider = [];
  for (const x of ranked) {
    const key = companyKey(x.role.company);
    if (seen.has(key) || appliedCompanies.has(key)) continue;
    seen.add(key);
    if (picks.length < 5) picks.push(x);
    else if (alsoConsider.length < 3) alsoConsider.push(x);
    else break;
  }
  return { picks, alsoConsider, poolSize: ranked.length };
}

export function companyKey(company) {
  const c = String(company || "").toLowerCase().split(" (")[0].split(" — ")[0].trim();
  // Anonymous placeholders shouldn't collapse into each other.
  if (/^(unknown|anonymous|unnamed|stealth)/.test(c) || /unnamed/.test(String(company).toLowerCase())) {
    return `${c}#${company}`;
  }
  return c;
}

export function normalizeUrl(url) {
  return String(url || "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Per-city scores. Every tracker role gets a 0–100 score for each of the four
// search locations, so a newly added role lands in the right city tabs.
//   la        → the tracker priority above (LA-based or remote roles only)
//   raleigh   → NC lifestyle formula (fit, hire, return-ready, travel, pay vs $160K, COO path)
//   charlotte → same NC formula
//   atlanta   → Atlanta formula (adds commute from the north-suburb target homes)
// Mirrors claude/nc_lifestyle_scoring.md in the Job Applications project.
// A role scores null for a city when she couldn't do it from there.
// ---------------------------------------------------------------------------

export const CITY_KEYS = ["la", "raleigh", "charlotte", "atlanta"];
export const LIFESTYLE_FLOOR = 160000;

const CITY_PATTERNS = {
  la: /los angeles|\bL\.?A\.?\b|santa monica|culver city|el segundo|playa vista|venice, ca|pasadena|burbank|irvine|long beach|torrance|hawthorne|glendale|west hollywood|beverly hills|orange county|southern california|marina del rey/i,
  raleigh: /raleigh|durham|\bcary\b|chapel hill|morrisville|research triangle|\bRTP\b|triangle/i,
  charlotte: /charlotte|ballantyne|indian land|fort mill/i,
  atlanta: /atlanta|alpharetta|sandy springs|suwanee|duluth|johns creek|cumming|norcross|dunwoody|marietta|buckhead|roswell|peachtree corners|brookhaven|\bGA\b|georgia/i,
};
const COASTAL_RE = /new york|\bNYC\b|san francisco|\bSF\b|bay area|palo alto|mountain view|seattle|boston|los angeles|\bLA\b|santa monica|washington,? d\.?c|\bDC\b|miami/i;
const ATL_AREAS = {
  north_suburbs: /alpharetta|johns creek|suwanee|cumming|duluth|roswell|milton|norcross|lawrenceville|peachtree corners|windward/i,
  perimeter: /sandy springs|dunwoody|perimeter|brookhaven|chamblee/i,
  intown: /midtown|downtown|buckhead|atlantic station|west midtown|old fourth|ponce/i,
};
const ACCESS = ["remote", "hybrid", "onsite", "none"];

function workMode(loc) {
  if (/\bremote\b/i.test(loc) && !/not remote|no remote/i.test(loc)) return "remote";
  if (/hybrid|\d\s*(?:–|-|to)?\s*\d?\s*days?/i.test(loc)) return "hybrid";
  if (/on-?site|in-?person|in-?office|office \+|5 days/i.test(loc)) return "onsite";
  return "hybrid";
}

// How she'd work this job from a city: remote | hybrid | onsite | none.
export function cityAccess(role, city) {
  const given = role.cityAccess && role.cityAccess[city];
  if (ACCESS.includes(given)) return given;
  const loc = String(role.location || "");
  if (city === "la") {
    const lc = inferLocationClass(role);
    if (lc === "relocation") return "none";
    const elsewhere = ["raleigh", "charlotte", "atlanta"].some((c) => CITY_PATTERNS[c].test(loc));
    if (elsewhere && !CITY_PATTERNS.la.test(loc) && role.remote !== true && !/\bremote\b/i.test(loc)) return "none";
    return lc === "unknown" ? "hybrid" : workMode(loc + (role.remote === true ? " remote" : ""));
  }
  if (CITY_PATTERNS[city].test(loc)) return workMode(loc);
  if (role.remote === true || (/\bremote\b/i.test(loc) && !/not remote|no remote/i.test(loc))) return "remote";
  return "none";
}

// Can she keep the job after moving back to the coast?
export function returnReady(role) {
  if (["remote_keepable", "coastal_hub", "local_only"].includes(role.returnReady)) return role.returnReady;
  const loc = String(role.location || "");
  if (role.remote === true || /\bremote\b/i.test(loc)) return "remote_keepable";
  if (COASTAL_RE.test(loc)) return "coastal_hub";
  return "local_only";
}

function atlantaArea(role) {
  if (["north_suburbs", "perimeter", "intown", "unknown"].includes(role.atlantaArea)) return role.atlantaArea;
  const loc = String(role.location || "");
  for (const [k, re] of Object.entries(ATL_AREAS)) if (re.test(loc)) return k;
  return "unknown";
}

const LIFE_HIRE = {
  "very high": 15, "high": 12, "medium-high": 10, "medium": 8,
  "medium-low": 5, "low-medium": 4, "low": 2, "very low": 0,
};
function lifeHire(hire) {
  const key = String(hire || "").toLowerCase().split(" (")[0].trim();
  return LIFE_HIRE[key] ?? 6;
}

function lifePay(role) {
  const nums = salaryNumbers(role.salary);
  if (nums.length) {
    if (Math.min(...nums) >= LIFESTYLE_FLOOR) return 10;
    if (Math.max(...nums) >= LIFESTYLE_FLOOR) return 7;
    return 4;
  }
  const cc = role.compClass;
  if (cc === "floor_meets") return 10;
  if (cc === "ceiling_meets") return 7;
  if (cc === "below") return 4;
  return 5;
}

function isIcTitle(title) {
  const t = String(title || "");
  return /manager|analyst|associate|specialist|\blead\b|principal|strategist|generalist/i.test(t) &&
    !/director|head of|\bvp\b|vice president|chief|general manager|officer|founder/i.test(t);
}

function lifePath(role) {
  const path = inferPathClass(role);
  if (path === "wrong_direction") return 0;
  if (path === "ceo_coo" || /\bhead of\b/i.test(role.title || "")) return 15;
  if (isIcTitle(role.title)) return 8;
  if (path === "cpo_cto") return 14;
  return 11;
}

const RET_POINTS = {
  nc: { remote_keepable: 23, coastal_hub: 14, local_only: 5 },
  atlanta: { remote_keepable: 19, coastal_hub: 13, local_only: 5 },
};
const NC_TRAVEL = { remote: 10, hybrid: 8, onsite: 4 };
const ATL_TRAVEL = { remote: 5, hybrid: 3, onsite: 1 };
const ATL_COMMUTE = {
  hybrid: { north_suburbs: 9, perimeter: 7, intown: 6, unknown: 6 },
  onsite: { north_suburbs: 8, perimeter: 5, intown: 4, unknown: 4 },
};
const AREA_LABEL = { north_suburbs: "north suburbs (Alpharetta/Johns Creek)", perimeter: "Perimeter (Sandy Springs/Dunwoody)", intown: "intown (Midtown/Buckhead)", unknown: "office area not stated" };
const MODE_LABEL = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

function lifestyleScore(role, city) {
  const access = cityAccess(role, city);
  if (access === "none") return null;
  const fit = Math.round((Number(role.fit) || 0) * 2.5);
  const hire = lifeHire(role.hire);
  const ret = returnReady(role);
  const pay = lifePay(role);
  const path = lifePath(role);
  const penalty = isDisqualified(role) ? 20 : 0;
  let parts;
  let drive = "";
  if (city === "atlanta") {
    const area = atlantaArea(role);
    const commute = access === "remote" ? 10 : ATL_COMMUTE[access][area];
    parts = [fit, hire, RET_POINTS.atlanta[ret], commute, ATL_TRAVEL[access], pay, path];
    drive = access === "remote" ? "Remote from Atlanta." : `${MODE_LABEL[access]} · ${AREA_LABEL[area]}`;
  } else {
    parts = [fit, hire, RET_POINTS.nc[ret], NC_TRAVEL[access], pay, path];
    drive = access === "remote" ? "" : `${MODE_LABEL[access]} in ${city === "raleigh" ? "the Triangle" : "Charlotte"}`;
  }
  const score = Math.max(0, Math.min(100, parts.reduce((a, b) => a + b, 0) - penalty));
  return { score, parts, penalty, access, drive };
}

// { la, raleigh, charlotte, atlanta } → { score, parts?, penalty?, access, drive? } or null.
export function cityScores(role) {
  const out = {};
  const laAccess = cityAccess(role, "la");
  out.la = laAccess === "none" ? null : { score: computePriority(role), access: laAccess };
  for (const c of ["raleigh", "charlotte", "atlanta"]) out[c] = lifestyleScore(role, c);
  return out;
}

const CITY_SHORT = { la: "LA", raleigh: "RDU", charlotte: "CLT", atlanta: "ATL" };
export function cityLine(role) {
  const cs = cityScores(role);
  return Object.entries(CITY_SHORT).map(([k, label]) => `${label} ${cs[k] ? cs[k].score : "—"}`).join(" · ");
}
