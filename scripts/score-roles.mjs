// Used by .github/workflows/score-roles.yml.
//   node scripts/score-roles.mjs prepare   → reads the issue body, writes scoring-prompt.md
//   node scripts/score-roles.mjs merge     → reads scored.json from Claude, saves new roles
//                                             to public/data/added-roles.json, writes summary.md
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildPrompt, toRole, REQUIRED_FIELDS } from "../src/prompt.js";
import { computePriority, normalizeUrl } from "../src/scoring.js";
import { ROLES } from "../src/rolesData.js";

const DATA_FILE = "public/data/added-roles.json";
const FIRST_NUM = 1000; // keeps repo-scored roles clear of roles added in the browser

const DEFAULT_PROFILE = { context: "", resumes: [] };

function loadData() {
  if (!existsSync(DATA_FILE)) return { roles: [], jobDescriptions: {} };
  const d = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  return { roles: d.roles || [], jobDescriptions: d.jobDescriptions || {} };
}

// The issue body carries the jobs as a ```json block: [{ url, jobDescription }]
function readJobs() {
  const body = process.env.ISSUE_BODY || "";
  const m = body.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error("No ```json block of jobs found in the issue.");
  const jobs = JSON.parse(m[1]);
  if (!Array.isArray(jobs) || !jobs.length) throw new Error("The jobs list is empty.");
  return jobs.map((j) => ({ url: String(j.url || "").trim(), jobDescription: String(j.jobDescription || "").trim() }));
}

function prepare() {
  const jobs = readJobs();
  const data = loadData();
  const existing = [...ROLES, ...data.roles];
  const prompt = buildPrompt(DEFAULT_PROFILE, jobs, existing);
  writeFileSync("scoring-prompt.md", prompt);
  writeFileSync("jobs.json", JSON.stringify(jobs, null, 2));
  console.log(`Prepared prompt for ${jobs.length} job(s).`);
}

function extractArray(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("scored.json has no JSON array.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function merge() {
  const jobs = JSON.parse(readFileSync("jobs.json", "utf8"));
  const items = existsSync("scored.json") ? extractArray(readFileSync("scored.json", "utf8")) : [];
  const data = loadData();
  const today = new Date().toISOString().slice(0, 10);
  const all = () => [...ROLES, ...data.roles];
  let nextNum = Math.max(FIRST_NUM - 1, ...data.roles.map((r) => r.num || 0));
  const lines = [];

  items.forEach((item, i) => {
    const job = jobs.find((j) => j.url && normalizeUrl(j.url) === normalizeUrl(item.url)) || jobs[i] || {};
    const missing = REQUIRED_FIELDS.filter((f) => item[f] === undefined || item[f] === null || item[f] === "");
    const label = `${item.company || "?"} — ${item.title || job.url || "role"}`;
    if (missing.length) { lines.push(`- ⚠️ **${label}** not saved: missing ${missing.join(", ")}`); return; }
    const role = toRole(item, job);
    const dup =
      (role.duplicateOf && all().find((r) => r.num === Number(role.duplicateOf))) ||
      (role.url && all().find((r) => r.url && normalizeUrl(r.url) === normalizeUrl(role.url)));
    if (dup) { lines.push(`- ↩️ **${label}** skipped: already tracked as #${dup.num} ${dup.company}`); return; }

    const num = ++nextNum;
    const tierPeers = all().filter((r) => r.tier === role.tier);
    const rank = Math.max(0, ...tierPeers.map((r) => r.rank || 0)) + 1;
    const { jobDescription, ...rest } = role;
    const saved = { ...rest, num, rank, dateAdded: today, source: "github" };
    saved.priority = computePriority(saved);
    data.roles.push(saved);
    if (jobDescription) data.jobDescriptions[num] = jobDescription;
    lines.push(`- ✅ **${label}** — Tier ${saved.tier} · Fit ${saved.fit ?? "—"} · Priority ${saved.priority} · Resume ${saved.resumeVersion || "—"}${saved.disqualified ? " · Do not apply" : ""}`);
  });

  const scoredUrls = new Set(items.map((it) => normalizeUrl(it.url)));
  jobs.filter((j) => j.url && !scoredUrls.has(normalizeUrl(j.url)) && items.length < jobs.length)
    .forEach((j) => lines.push(`- ❌ ${j.url} — Claude returned no score (paste the job description and try again)`));

  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  const saved = lines.filter((l) => l.startsWith("- ✅")).length;
  writeFileSync("summary.md", `Claude scored this batch — **${saved} role${saved === 1 ? "" : "s"} saved**. The tracker updates in about a minute.\n\n${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
}

const cmd = process.argv[2];
if (cmd === "prepare") prepare();
else if (cmd === "merge") merge();
else { console.error("usage: score-roles.mjs prepare|merge"); process.exit(1); }
