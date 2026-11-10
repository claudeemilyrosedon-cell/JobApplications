import { useState } from "react";
import { topFive, whyLine, firstAction } from "./scoring.js";

function buildApplyPrompt(picks) {
  const list = picks
    .map((p, i) => `${i + 1}. ${p.role.company} — ${p.role.title} (Ver. ${p.role.resumeVersion})\n   ${p.role.url}`)
    .join("\n");
  return `Today's top 5 applications from my tracker. For each, confirm the posting is still open, then generate a tailored resume and cover letter (use the tailored-resume-for-role skill). Batch them by resume version.\n\n${list}`;
}

export default function TopFivePanel({ roles, getStatus, onOpenRole }) {
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
          <thead>
            <tr style={{ borderBottom: "0.5px solid #ddd" }}>
              {["#", "Role", "Why today", "Score", "Resume", "First action"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "5px 6px", fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {picks.map((p, i) => (
              <tr key={p.role.num} style={{ borderBottom: "0.5px solid #eee", cursor: "pointer" }} onClick={() => onOpenRole(p.role.num)}>
                <td style={{ padding: "7px 6px", fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: "7px 6px" }}>
                  <div style={{ fontWeight: 600, color: "#111" }}>{p.role.company}</div>
                  <div style={{ color: "#666", fontSize: 11 }}>{p.role.title}</div>
                </td>
                <td style={{ padding: "7px 6px", color: "#555", fontSize: 11 }}>
                  {[...p.reasons, whyLine(p.role)].filter(Boolean).join(" · ")}
                </td>
                <td style={{ padding: "7px 6px", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {p.score}{p.score !== p.base && <span style={{ fontWeight: 400, color: "#999", fontSize: 10 }}> ({p.base})</span>}
                </td>
                <td style={{ padding: "7px 6px" }}>Ver. {p.role.resumeVersion}</td>
                <td style={{ padding: "7px 6px", fontSize: 11 }}>
                  <a href={p.role.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#1D4ED8" }}>{firstAction(p.role)} →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
