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

function buildPrompt(role, profile, jobDescription) {
  const resume = profile.resumes.find((r) => r.name === role.resumeVersion);
  const resumeSection = resume
    ? `Resume ("${resume.name}"):\n${resume.content}`
    : role.resumeVersion
      ? `(Resume version "${role.resumeVersion}" was recommended, but its content is not saved in the profile.)`
      : "(No resume version recommended for this role.)";

  return `You are a hiring manager evaluating a candidate for the following role. Produce a hiring-manager-style scorecard reviewing the candidate's resume against the job description.

ROLE:
${role.title} at ${role.company} (${role.location})

JOB DESCRIPTION:
${jobDescription || "(not provided)"}

CANDIDATE RESUME:
${resumeSection}

EXISTING NOTES ON THIS CANDIDATE:
${role.note || "(none)"}

Reply with a hiring-manager-style scorecard containing:
1. Overall recommendation (Strong Yes / Yes / Maybe / No) with a 1-10 fit score
2. Key strengths that match the role
3. Gaps or concerns relative to the job description
4. 3-5 suggested interview follow-up questions to probe the gaps

Format as clear markdown with headers for each section.`;
}

export default function HiringManagerModal({ role, profile, initialJobDescription, onSaveJobDescription, onClose }) {
  const [jobDescription, setJobDescription] = useState(initialJobDescription || "");
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  const generatePrompt = () => {
    setPrompt(buildPrompt(role, profile, jobDescription));
    if (jobDescription.trim()) onSaveJobDescription?.(jobDescription);
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

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Hiring Manager Review — {role.title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>×</button>
        </div>

        <label style={labelStyle}>Job description</label>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the full job description here..."
          rows={8}
          style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button onClick={generatePrompt} style={buttonStyle}>Generate Claude Prompt</button>
        </div>

        {prompt && (
          <>
            <label style={labelStyle}>Copy this prompt into Claude</label>
            <textarea
              readOnly
              value={prompt}
              rows={10}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8, fontFamily: "ui-monospace, monospace", fontSize: 12, background: "#fafafa" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={copyPrompt} style={secondaryButtonStyle}>{copied ? "Copied!" : "Copy prompt"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
