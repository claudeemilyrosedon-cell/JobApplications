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
