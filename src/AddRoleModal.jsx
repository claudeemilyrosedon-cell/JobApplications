import { useState } from "react";

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "5vh 1rem", zIndex: 1000, overflowY: "auto",
};

const panelStyle = {
  background: "white", borderRadius: 12, padding: "1.5rem", width: "100%",
  maxWidth: 640, boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
};

const labelStyle = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: 6, display: "block" };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
const buttonStyle = { padding: "8px 16px", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const secondaryButtonStyle = { ...buttonStyle, background: "white", color: "#111" };

const REQUIRED_FIELDS = ["company", "title", "location", "salary", "fit", "hire", "tier", "cos_path", "note"];

function buildPrompt(profile, url, jobDescription) {
  const resumeSection = profile.resumes.length
    ? profile.resumes.map((r, i) => `Resume ${i + 1} — "${r.name || `Resume ${i + 1}`}":\n${r.content}`).join("\n\n")
    : "(No resume versions saved in profile.)";

  return `You are evaluating a job posting against a candidate's profile for a personal job-search tracker.

CANDIDATE CONTEXT:
${profile.context || "(No context saved in profile.)"}

CANDIDATE RESUME VERSIONS:
${resumeSection}

JOB POSTING URL:
${url || "(not provided)"}

JOB DESCRIPTION:
${jobDescription}

Evaluate this role against the candidate's context and resume versions, then reply with ONLY a JSON object (no markdown fences, no commentary) with exactly these fields:

{
  "company": "string",
  "title": "string",
  "location": "string",
  "remote": true or false,
  "salary": "string (as stated in the posting, or 'Unlisted')",
  "fit": number from 1-10,
  "hire": "one of: Low, Medium-Low, Medium, Medium-High, High, Very High",
  "tier": number from 1-5 (1 = apply now strong fit, 2 = apply but review location, 3 = apply with gaps, 4 = research first, 5 = details unavailable),
  "cos_path": "string, short estimate of years of experience this role represents (e.g. '4–6 yrs')",
  "note": "string, 2-4 sentence assessment explaining the fit, gaps, and recommendation",
  "flag": "short string, e.g. LA, Remote, NYC, Reach, No",
  "recommendedResume": "the name of the best-fit resume version from the list above, or empty string if none saved"
}`;
}

export default function AddRoleModal({ profile, onAdd, onClose }) {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generatePrompt = () => {
    if (!jobDescription.trim()) {
      setError("Paste the job description first.");
      return;
    }
    setError("");
    setPrompt(buildPrompt(profile, url, jobDescription));
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

  const submitResponse = () => {
    let parsed;
    try {
      parsed = JSON.parse(response.trim());
    } catch {
      setError("That doesn't look like valid JSON. Check the response and try again.");
      return;
    }

    const missing = REQUIRED_FIELDS.filter((f) => parsed[f] === undefined || parsed[f] === null || parsed[f] === "");
    if (missing.length) {
      setError(`Missing required field(s): ${missing.join(", ")}`);
      return;
    }

    setError("");
    onAdd({
      company: parsed.company,
      title: parsed.title,
      location: parsed.location,
      remote: typeof parsed.remote === "boolean" ? parsed.remote : null,
      salary: parsed.salary,
      fit: Number(parsed.fit),
      hire: parsed.hire,
      tier: Number(parsed.tier),
      cos_path: parsed.cos_path,
      note: parsed.note,
      flag: parsed.flag || "Unknown",
      resumeVersion: parsed.recommendedResume || null,
      url: url || "",
      jobDescription,
      applied: false,
    });
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Add Role</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>×</button>
        </div>

        {step === 1 && (
          <>
            <label style={labelStyle}>Application link</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              style={{ ...inputStyle, marginBottom: 16 }}
            />

            <label style={labelStyle}>Job description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              rows={10}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
            />

            {error && <div style={{ color: "#d94f40", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
              <button onClick={generatePrompt} style={buttonStyle}>Generate Claude Prompt</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <label style={labelStyle}>1. Copy this prompt into Claude</label>
            <textarea
              readOnly
              value={prompt}
              rows={8}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8, fontFamily: "ui-monospace, monospace", fontSize: 12, background: "#fafafa" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
              <button onClick={copyPrompt} style={secondaryButtonStyle}>{copied ? "Copied!" : "Copy prompt"}</button>
            </div>

            <label style={labelStyle}>2. Paste Claude's JSON reply here</label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder='{"company": "...", "title": "...", ...}'
              rows={8}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />

            {error && <div style={{ color: "#d94f40", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => setStep(1)} style={secondaryButtonStyle}>← Back</button>
              <button onClick={submitResponse} style={buttonStyle}>Add Role</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
