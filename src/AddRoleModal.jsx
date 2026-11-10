import { useMemo, useState } from "react";
import { computePriority, normalizeUrl } from "./scoring.js";

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "5vh 1rem", zIndex: 1000, overflowY: "auto",
};

const panelStyle = {
  background: "white", borderRadius: 12, padding: "1.5rem", width: "100%",
  maxWidth: 760, boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
};

const labelStyle = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
const buttonStyle = { padding: "8px 16px", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const secondaryButtonStyle = { ...buttonStyle, background: "white", color: "#111" };
const hintStyle = { fontSize: 12, color: "#777", lineHeight: 1.5, marginBottom: 10 };

const REQUIRED_FIELDS = ["company", "title", "location", "salary", "fit", "hire", "tier", "cos_path", "note"];
const URL_RE = /^https?:\/\/\S+$/i;

const RESUME_VERSIONS = `A = Consumer/DTC (Green Street DTC brand wins) — consumer, ecomm, CPG, retail
B = AI-Native Operator (AI agent deployment + adoption playbooks) — AI-first companies, AI transformation roles
C = Enterprise Ops + AI (cross-functional execution at Alaska Airlines scale) — enterprise, healthcare tech, matrixed orgs
D = Startup PM (spec writing, OKRs, 0→1) — roles that prefer a PM background`;

// Split the paste box into jobs. Two formats:
//  • a list of links, one per line
//  • blocks separated by a line of --- , each with a link on the first line and the JD below
export function parseJobs(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const hasSeparators = /^\s*-{3,}\s*$/m.test(trimmed);
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);

  if (!hasSeparators && lines.every((l) => URL_RE.test(l))) {
    return lines.map((url) => ({ url, jobDescription: "" }));
  }

  const blocks = hasSeparators ? trimmed.split(/^\s*-{3,}\s*$/m) : [trimmed];
  return blocks
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const blockLines = b.split("\n");
      const first = blockLines[0].trim();
      if (URL_RE.test(first)) {
        return { url: first, jobDescription: blockLines.slice(1).join("\n").trim() };
      }
      const found = b.match(/https?:\/\/\S+/);
      return { url: found ? found[0] : "", jobDescription: b };
    });
}

function buildPrompt(profile, jobs, existingRoles) {
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

function extractJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function toRole(parsed, fallbackJob) {
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

export default function AddRoleModal({ profile, existingRoles, onAdd, onClose }) {
  const [step, setStep] = useState(1);
  const [input, setInput] = useState("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const existingByUrl = useMemo(() => {
    const map = new Map();
    existingRoles.forEach((r) => { if (r.url) map.set(normalizeUrl(r.url), r); });
    return map;
  }, [existingRoles]);

  const jobs = useMemo(() => parseJobs(input), [input]);
  const alreadyTracked = jobs.filter((j) => j.url && existingByUrl.has(normalizeUrl(j.url)));
  const newJobs = jobs.filter((j) => !(j.url && existingByUrl.has(normalizeUrl(j.url))));

  const generatePrompt = () => {
    if (!newJobs.length) {
      setError(jobs.length ? "Every link is already in the tracker." : "Paste at least one link or job description.");
      return;
    }
    setError("");
    setPrompt(buildPrompt(profile, newJobs, existingRoles));
    setStep(2);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — user can still select and copy manually.
    }
  };

  const reviewResponse = () => {
    let items;
    try {
      items = extractJson(response);
    } catch {
      setError("That doesn't look like valid JSON. Copy Claude's whole reply and try again.");
      return;
    }
    const rows = items.map((item, i) => {
      const missing = REQUIRED_FIELDS.filter((f) => item[f] === undefined || item[f] === null || item[f] === "");
      const role = toRole(item, newJobs[i]);
      const urlDup = role.url && existingByUrl.get(normalizeUrl(role.url));
      const dup = role.duplicateOf ? existingRoles.find((r) => r.num === Number(role.duplicateOf)) : urlDup;
      return {
        role,
        missing,
        duplicate: dup || null,
        include: !missing.length && !dup,
        priority: computePriority(role),
      };
    });
    setError("");
    setPreview(rows);
    setStep(3);
  };

  const toggle = (i) => setPreview((rows) => rows.map((r, j) => (j === i ? { ...r, include: !r.include } : r)));
  const selected = preview.filter((r) => r.include && !r.missing.length);

  const addSelected = () => {
    if (!selected.length) {
      setError("Nothing selected to add.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    onAdd(selected.map((r) => ({ ...r.role, priority: r.priority, dateAdded: today })));
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Add Roles</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, fontSize: 11, color: "#999" }}>
          {["Paste jobs", "Score with Claude", "Review & add"].map((s, i) => (
            <span key={s} style={{ fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? "#111" : "#999" }}>
              {i + 1}. {s}{i < 2 ? "  →" : ""}
            </span>
          ))}
        </div>

        {step === 1 && (
          <>
            <label style={labelStyle}>Job links and descriptions</label>
            <div style={hintStyle}>
              Paste as many as you like. Either <strong>one link per line</strong>, or separate jobs with a line containing <code>---</code> and put the link on the first line with the job description under it (best for LinkedIn and other postings Claude can't open).
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"https://jobs.ashbyhq.com/company-a/...\nhttps://job-boards.greenhouse.io/company-b/...\n---\nhttps://www.linkedin.com/jobs/view/...\nChief of Staff to the CEO\nAbout the role: ..."}
              rows={12}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />

            {jobs.length > 0 && (
              <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
                <strong>{newJobs.length}</strong> new job{newJobs.length === 1 ? "" : "s"} detected
                {alreadyTracked.length > 0 && (
                  <span style={{ color: "#b45309" }}>
                    {" "}· {alreadyTracked.length} already in tracker (skipped): {alreadyTracked.map((j) => existingByUrl.get(normalizeUrl(j.url)).company).join(", ")}
                  </span>
                )}
              </div>
            )}

            {error && <div style={{ color: "#d94f40", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
              <button onClick={generatePrompt} style={buttonStyle}>Generate Claude prompt ({newJobs.length})</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <label style={labelStyle}>1. Copy this prompt into Claude</label>
            <div style={hintStyle}>One prompt scores all {newJobs.length} job{newJobs.length === 1 ? "" : "s"} at once. Use a Claude chat with web access so it can open links you didn't paste descriptions for.</div>
            <textarea
              readOnly
              value={prompt}
              rows={7}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8, fontFamily: "ui-monospace, monospace", fontSize: 12, background: "#fafafa" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
              <button onClick={copyPrompt} style={secondaryButtonStyle}>{copied ? "Copied!" : "Copy prompt"}</button>
            </div>

            <label style={labelStyle}>2. Paste Claude's JSON reply here</label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder='[{"company": "...", "title": "...", ...}, ...]'
              rows={8}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />

            {error && <div style={{ color: "#d94f40", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => { setError(""); setStep(1); }} style={secondaryButtonStyle}>← Back</button>
              <button onClick={reviewResponse} style={buttonStyle}>Review roles</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={hintStyle}>Untick anything you don't want. Duplicates of roles already in the tracker are unticked by default.</div>
            <div style={{ maxHeight: "55vh", overflowY: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#fafafa", borderBottom: "1px solid #eee" }}>
                    {["", "Company — Title", "Tier", "Fit", "Priority", "Resume", "Notes"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...preview.entries()]
                    .sort((a, b) => b[1].priority - a[1].priority)
                    .map(([i, row]) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f2f2f2", opacity: row.include ? 1 : 0.55 }}>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="checkbox" checked={row.include} disabled={row.missing.length > 0} onChange={() => toggle(i)} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <div style={{ fontWeight: 600, color: "#111" }}>{row.role.company || "?"}</div>
                          <div style={{ color: "#666" }}>{row.role.title}</div>
                          <div style={{ color: "#999", fontSize: 11 }}>{row.role.location} · {row.role.salary}</div>
                        </td>
                        <td style={{ padding: "6px 8px" }}>{row.role.tier || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{row.role.fit ?? "—"}</td>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{row.priority}</td>
                        <td style={{ padding: "6px 8px" }}>{row.role.resumeVersion || "—"}</td>
                        <td style={{ padding: "6px 8px", fontSize: 11, color: "#b45309" }}>
                          {row.missing.length > 0 && <div style={{ color: "#d94f40" }}>Missing: {row.missing.join(", ")}</div>}
                          {row.duplicate && <div>Duplicate of #{row.duplicate.num} {row.duplicate.company}</div>}
                          {row.role.disqualified && <div style={{ color: "#712B13" }}>Do not apply</div>}
                          {row.role.openQuestions.length > 0 && <div style={{ color: "#777" }}>Confirm: {row.role.openQuestions.join("; ")}</div>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {error && <div style={{ color: "#d94f40", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => { setError(""); setStep(2); }} style={secondaryButtonStyle}>← Back</button>
              <button onClick={addSelected} style={buttonStyle}>Add {selected.length} role{selected.length === 1 ? "" : "s"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
