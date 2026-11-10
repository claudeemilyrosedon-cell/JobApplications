import { useEffect, useMemo, useRef, useState } from "react";
import { computePriority, normalizeUrl } from "./scoring.js";
import { getSample } from "./runtime.js";
import { REQUIRED_FIELDS, buildPrompt, toRole } from "./prompt.js";

const SAMPLE_ERRORS = {
  not_granted: "Claude wasn't allowed for this page — allow it when asked, then retry.",
  rate_limited: "You've hit a Claude usage limit — wait a bit, then retry.",
  sampling_disabled: "Claude isn't available on this account.",
  refused: "Claude declined this posting.",
  invalid_json: "Claude's reply wasn't valid — retry.",
  prompt_too_large: "This job description is too long — trim it and retry.",
  session_expired: "Sign in to Claude again, then retry.",
};

const CONCURRENCY = 3;
export const GITHUB_REPO = "https://github.com/claudeemilyrosedon-cell/JobApplications";
const STATUS_LABEL = {
  queued: { text: "Queued", color: "#999" },
  running: { text: "Scoring…", color: "#1D4ED8" },
  saved: { text: "Saved", color: "#15803D" },
  skipped: { text: "Skipped", color: "#b45309" },
  error: { text: "Failed", color: "#d94f40" },
};

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

const URL_RE = /https?:\/\/[^\s,]+/gi;
const emptyRow = () => ({ url: "", jobDescription: "" });


function extractJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export default function AddRoleModal({ profile, existingRoles, onAdd, onGithubSubmitted, onClose }) {
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState(() => [emptyRow()]);
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [runs, setRuns] = useState([]);
  const existingRef = useRef(existingRoles);
  existingRef.current = existingRoles;
  const [sample, setSample] = useState(null);
  useEffect(() => {
    let live = true;
    getSample().then((fn) => { if (live) setSample(() => fn); });
    return () => { live = false; };
  }, []);
  // "account": inside claude.ai, scores on the viewer's Claude account right here.
  // "github":  on GitHub Pages, files an issue; Claude Code scores it on GitHub
  //            using the owner's Claude plan (no key in the site).
  const mode = sample ? "account" : "github";

  const existingByUrl = useMemo(() => {
    const map = new Map();
    existingRoles.forEach((r) => { if (r.url) map.set(normalizeUrl(r.url), r); });
    return map;
  }, [existingRoles]);

  const jobs = rows
    .map((r) => ({ url: r.url.trim(), jobDescription: r.jobDescription.trim() }))
    .filter((r) => r.url || r.jobDescription);

  const updateRow = (i, field, value) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i) => setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, j) => j !== i)));

  // Pasting several links into one link field splits them into separate roles.
  const handleLinkPaste = (i, e) => {
    const text = e.clipboardData.getData("text");
    const urls = text.match(URL_RE) || [];
    if (urls.length < 2) return;
    e.preventDefault();
    setRows((rs) => {
      const next = [...rs];
      next[i] = { ...next[i], url: urls[0] };
      const extra = urls.slice(1).map((url) => ({ url, jobDescription: "" }));
      next.splice(i + 1, 0, ...extra);
      return next;
    });
  };

  const rowStatus = (r) => {
    const url = r.url.trim();
    if (url && existingByUrl.has(normalizeUrl(url))) return { dup: existingByUrl.get(normalizeUrl(url)) };
    return {};
  };
  const alreadyTracked = jobs.filter((j) => j.url && existingByUrl.has(normalizeUrl(j.url)));
  const newJobs = jobs.filter((j) => !(j.url && existingByUrl.has(normalizeUrl(j.url))));

  // GitHub flow: open a pre-filled issue; the score-roles workflow does the rest.
  const submitToGithub = () => {
    if (!newJobs.length) {
      setError(jobs.length ? "Every link is already in the tracker." : "Add at least one link or job description.");
      return;
    }
    setError("");
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const title = `Score roles: ${newJobs.length} role${newJobs.length === 1 ? "" : "s"} (${date})`;
    const body = `Scoring request from the Job Applications tracker. Submit this issue as-is — Claude scores the roles on GitHub and the tracker updates in a few minutes.\n\n\`\`\`json\n${JSON.stringify(newJobs, null, 1)}\n\`\`\`\n`;
    const base = `${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}`;
    const full = `${base}&body=${encodeURIComponent(body)}`;
    const fits = full.length <= 7500;
    window.open(fits ? full : base, "_blank", "noopener");
    if (!fits) navigator.clipboard?.writeText(body).catch(() => {});
    setSubmitted({ count: newJobs.length, pasteNeeded: !fits, body });
    onGithubSubmitted?.(newJobs.length);
    setStep(5);
  };

  const updateRun = (i, patch) => setRuns((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // Scores each role with Claude, then saves it straight to the tracker.
  const scoreAndSave = async (jobList) => {
    const initial = jobList.map((job) => ({ job, status: "queued", message: "", role: null }));
    setRuns(initial);
    setStep(4);
    const seen = new Set();
    let next = 0;

    const scoreOne = async (i) => {
      const job = jobList[i];
      updateRun(i, { status: "running", message: "" });
      try {
        const prompt = buildPrompt(profile, [job], existingRef.current);
        let item;
        const value = await sample.json(prompt, { modelTier: "default" });
        item = Array.isArray(value) ? value[0] : value;
        if (!item || typeof item !== "object") throw new Error("Claude's reply wasn't a role.");
        const missing = REQUIRED_FIELDS.filter((f) => item[f] === undefined || item[f] === null || item[f] === "");
        if (missing.length) throw new Error(`Claude left out: ${missing.join(", ")}`);
        const role = toRole(item, job);

        const current = existingRef.current;
        const dup =
          (role.duplicateOf && current.find((r) => r.num === Number(role.duplicateOf))) ||
          (role.url && current.find((r) => r.url && normalizeUrl(r.url) === normalizeUrl(role.url)));
        const key = `${String(role.company).toLowerCase()}|${String(role.title).toLowerCase()}`;
        if (dup || seen.has(key)) {
          updateRun(i, { status: "skipped", role, message: dup ? `Already tracked as #${dup.num} ${dup.company}` : "Duplicate of another role in this batch" });
          return;
        }
        seen.add(key);
        const saved = { ...role, priority: computePriority(role), dateAdded: new Date().toISOString().slice(0, 10) };
        onAdd([saved], { keepOpen: true });
        updateRun(i, { status: "saved", role: saved });
      } catch (err) {
        const message = (err && err.code && (SAMPLE_ERRORS[err.code] || err.message)) || err?.message || String(err);
        updateRun(i, { status: "error", message });
      }
    };

    const worker = async () => {
      while (next < jobList.length) {
        const i = next++;
        await scoreOne(i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobList.length) }, worker));
  };

  const startScoring = () => {
    if (!newJobs.length) {
      setError(jobs.length ? "Every link is already in the tracker." : "Add at least one link or job description.");
      return;
    }
    if (mode === "account") {
      const missing = newJobs.map((j, i) => (!j.jobDescription ? i + 1 : null)).filter(Boolean);
      if (missing.length) {
        setError(`Paste the job description for role${missing.length === 1 ? "" : "s"} ${missing.join(", ")} — Claude can't open links from inside this page.`);
        return;
      }
    }
    setError("");
    scoreAndSave(newJobs);
  };

  const retryFailed = () => {
    const failed = runs.filter((r) => r.status === "error").map((r) => r.job);
    if (failed.length) scoreAndSave(failed);
  };

  const generatePrompt = () => {
    if (!newJobs.length) {
      setError(jobs.length ? "Every link is already in the tracker." : "Add at least one link or job description.");
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
          {(step >= 4 ? ["Enter roles", "Score & save"] : ["Enter roles", "Score with Claude", "Review & add"]).map((s, i) => (
            <span key={s} style={{ fontWeight: (step >= 4 ? i === 1 : step === i + 1) ? 700 : 400, color: (step >= 4 ? i === 1 : step === i + 1) ? "#111" : "#999" }}>
              {i + 1}. {s}{i < (step >= 4 ? 1 : 2) ? "  →" : ""}
            </span>
          ))}
        </div>

        {step === 1 && (
          <>
            <div style={hintStyle}>
              {mode === "account"
                ? "Add each role's link and paste its job description — Claude reads the description you paste (it can't open links from inside this page)."
                : "Add each role's link and, if you have it, the job description. Paste the description for LinkedIn and other postings Claude can't open."}{" "}Pasting several links into one link box splits them into separate roles.
            </div>

            <div style={{ maxHeight: "58vh", overflowY: "auto", marginBottom: 10, paddingRight: 4 }}>
              {rows.map((r, i) => {
                const { dup } = rowStatus(r);
                return (
                  <div key={i} style={{ border: `1px solid ${dup ? "#FCD34D" : "#e8e8e8"}`, background: dup ? "#FFFBEB" : "#fcfcfc", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>Role {i + 1}</span>
                      <button onClick={() => removeRow(i)} title="Remove this role" style={{ border: "none", background: "none", fontSize: 12, color: "#999", cursor: "pointer" }}>Remove</button>
                    </div>
                    <label style={labelStyle}>Application link</label>
                    <input
                      value={r.url}
                      onChange={(e) => updateRow(i, "url", e.target.value)}
                      onPaste={(e) => handleLinkPaste(i, e)}
                      placeholder="https://..."
                      style={{ ...inputStyle, marginBottom: 8 }}
                    />
                    {dup && (
                      <div style={{ fontSize: 11, color: "#b45309", marginBottom: 8 }}>
                        Already in tracker as #{dup.num} {dup.company} — this role will be skipped.
                      </div>
                    )}
                    <label style={labelStyle}>Job description <span style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0 }}>{mode === "account" ? "(required)" : "(optional — Claude opens the link; paste it for LinkedIn)"}</span></label>
                    <textarea
                      value={r.jobDescription}
                      onChange={(e) => updateRow(i, "jobDescription", e.target.value)}
                      placeholder="Paste the full job description here..."
                      rows={5}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                );
              })}
            </div>

            <button onClick={addRow} style={{ ...secondaryButtonStyle, width: "100%", borderStyle: "dashed", marginBottom: 12 }}>+ Add another role</button>

            {jobs.length > 0 && (
              <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
                <strong>{newJobs.length}</strong> role{newJobs.length === 1 ? "" : "s"} ready to score
                {alreadyTracked.length > 0 && <span style={{ color: "#b45309" }}> · {alreadyTracked.length} already in tracker (skipped)</span>}
              </div>
            )}

            {error && <div style={{ color: "#d94f40", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <div style={{ fontSize: 12, color: "#555", border: "1px solid #eee", borderRadius: 10, padding: "8px 12px", marginBottom: 12, background: "#F0FDF4", lineHeight: 1.5 }}>
              {mode === "account"
                ? "Scoring runs on your Claude account — no API key needed. The first time, Claude asks you to allow this page."
                : "Scoring runs on GitHub using your Claude plan — no key needed here. You'll confirm a pre-filled GitHub issue, and the roles appear in a few minutes."}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
              <button onClick={generatePrompt} style={secondaryButtonStyle}>Copy prompt instead</button>
              <button onClick={mode === "account" ? startScoring : submitToGithub} style={buttonStyle}>
                Score &amp; save {newJobs.length} role{newJobs.length === 1 ? "" : "s"}
              </button>
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

        {step === 4 && (() => {
          const done = runs.every((r) => ["saved", "skipped", "error"].includes(r.status));
          const savedCount = runs.filter((r) => r.status === "saved").length;
          const failedCount = runs.filter((r) => r.status === "error").length;
          return (
            <>
              <div style={hintStyle}>
                {done
                  ? `Done — ${savedCount} role${savedCount === 1 ? "" : "s"} saved${failedCount ? `, ${failedCount} failed` : ""}. Today's Top 5 has been refreshed.`
                  : `Claude is scoring each posting (${CONCURRENCY} at a time). Each role is saved as soon as it's scored.`}
              </div>
              <div style={{ maxHeight: "55vh", overflowY: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 12 }}>
                {runs.map((r, i) => {
                  const st = STATUS_LABEL[r.status];
                  return (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderBottom: "1px solid #f2f2f2" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: st.color, minWidth: 64 }}>{st.text}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
                          {r.role ? `${r.role.company} — ${r.role.title}` : (r.job.url || r.job.jobDescription.slice(0, 80))}
                        </div>
                        {r.role && r.status === "saved" && (
                          <div style={{ fontSize: 11, color: "#666" }}>
                            Tier {r.role.tier} · Fit {r.role.fit ?? "—"} · Priority {r.role.priority} · Ver. {r.role.resumeVersion || "—"}
                            {r.role.disqualified ? " · Do not apply" : ""}
                          </div>
                        )}
                        {r.message && <div style={{ fontSize: 11, color: st.color }}>{r.message}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {done && failedCount > 0 && <button onClick={retryFailed} style={secondaryButtonStyle}>Retry {failedCount} failed</button>}
                <button onClick={onClose} style={buttonStyle} disabled={!done}>{done ? "Done" : "Working…"}</button>
              </div>
            </>
          );
        })()}

        {step === 5 && submitted && (
          <>
            <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>A GitHub issue opened in a new tab.</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {submitted.pasteNeeded && (
                  <li>The role details were too long for the link, so they're <strong>copied to your clipboard</strong> — click in the issue's description box and paste (⌘V / Ctrl+V).</li>
                )}
                <li>Click <strong>Submit new issue</strong>.</li>
                <li>Claude scores the {submitted.count} role{submitted.count === 1 ? "" : "s"} on GitHub (usually 2–5 minutes), comments a summary on the issue and closes it.</li>
                <li>This page checks for the new roles and refreshes Today's Top 5 when they land — you can close this window.</li>
              </ol>
            </div>
            {submitted.pasteNeeded && (
              <button
                onClick={() => navigator.clipboard?.writeText(submitted.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}
                style={{ ...secondaryButtonStyle, marginBottom: 12 }}
              >{copied ? "Copied!" : "Copy role details again"}</button>
            )}
            <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
              Popup blocked? <a href={`${GITHUB_REPO}/issues/new`} target="_blank" rel="noopener noreferrer">Open a new issue</a>, title it "Score roles", and paste the role details.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={buttonStyle}>Done</button>
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
