import { useState } from "react";

const STATUS_OPTIONS = [
  ["unapplied", "To apply"],
  ["applied", "✓ Applied"],
  ["interviewing", "◐ Interviewing"],
  ["no_response", "⊘ No response"],
  ["rejected", "✗ Rejected"],
  ["closed", "✕ Closed"],
];
import { topFive, whyLine, firstAction } from "./scoring.js";

function buildApplyPrompt(picks) {
  const list = picks
    .map((p, i) => `${i + 1}. ${p.role.company} — ${p.role.title} (Ver. ${p.role.resumeVersion})\n   ${p.role.url}`)
    .join("\n");
  return `Today's top 5 applications from my tracker. For each, confirm the posting is still open, then generate a tailored resume and cover letter (use the tailored-resume-for-role skill). Batch them by resume version.\n\n${list}`;
}

export default function TopFivePanel({ roles, getStatus, onSetStatus, onOpenRole }) {
  const [lastChange, setLastChange] = useState(null);
  const [copied, setCopied] = useState(false);
  const { picks, alsoConsider, poolSize } = topFive(roles, getStatus);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildApplyPrompt(picks));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable.
    }
  };

  return (
    <div style={{ border: "1.5px solid #111", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 20, background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#111" }}>Today's Top 5</div>
        <div style={{ fontSize: 11, color: "#888" }}>
          From {poolSize} un-applied Tier 1–3 roles · deadlines and new postings rank higher · open the link to check it's still live
        </div>
      </div>

      {picks.length === 0 ? (
        <div style={{ fontSize: 13, color: "#666", padding: "10px 0" }}>No un-applied Tier 1–3 roles left. Add new postings to refill the list.</div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {picks.map((p, i) => (
            <div
              key={p.role.num}
              onClick={() => onOpenRole(p.role.num)}
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", padding: "10px 4px", borderBottom: "0.5px solid #eee", cursor: "pointer", fontSize: 12 }}
            >
              <div style={{ display: "flex", gap: 10, flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontWeight: 700, width: 14, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#111" }}>{p.role.company}</div>
                  <div style={{ color: "#666", fontSize: 11 }}>{p.role.title}</div>
                  <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>
                    {[...p.reasons, whyLine(p.role)].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", marginLeft: 24 }} onClick={(e) => e.stopPropagation()}>
                <span title="Today score (base priority)" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {p.score}{p.score !== p.base && <span style={{ fontWeight: 400, color: "#999", fontSize: 10 }}> ({p.base})</span>}
                </span>
                <span style={{ whiteSpace: "nowrap", color: "#555" }}>Ver. {p.role.resumeVersion}</span>
                <a href={p.role.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1D4ED8", fontSize: 11 }}>{firstAction(p.role)} →</a>
                <select
                  value={getStatus(p.role)}
                  onChange={(e) => {
                    const status = e.target.value;
                    onSetStatus(p.role.num, status);
                    if (status !== "unapplied") setLastChange({ num: p.role.num, company: p.role.company, status });
                  }}
                  aria-label={`Status for ${p.role.company}`}
                  title="Change status — applied or closed roles are replaced with the next best role"
                  style={{ fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 8, border: "1px solid #bbb", background: "white", cursor: "pointer" }}
                >
                  {STATUS_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {lastChange && (
        <div style={{ fontSize: 11, color: "#555", marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{lastChange.company} marked {STATUS_OPTIONS.find(([v]) => v === lastChange.status)?.[1].replace(/^[^A-Za-z]+/, "")} — replaced with the next best role.</span>
          <button
            onClick={() => { onSetStatus(lastChange.num, "unapplied"); setLastChange(null); }}
            style={{ border: "none", background: "none", color: "#1D4ED8", cursor: "pointer", fontSize: 11, padding: 0 }}
          >Undo</button>
        </div>
      )}

      {alsoConsider.length > 0 && (
        <div style={{ fontSize: 11, color: "#777", marginTop: 10 }}>
          <strong style={{ color: "#555" }}>Also consider:</strong>{" "}
          {alsoConsider.map((p) => `${p.role.company} (${p.score})`).join(" · ")}
        </div>
      )}

      {picks.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={copy} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #111", background: "white", color: "#111", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {copied ? "Copied!" : "Copy Claude prompt to build these 5 applications"}
          </button>
        </div>
      )}
    </div>
  );
}
