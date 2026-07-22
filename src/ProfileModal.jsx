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

export default function ProfileModal({ profile, onSave, onClose }) {
  const [context, setContext] = useState(profile.context);
  const [resumes, setResumes] = useState(profile.resumes.length ? profile.resumes : []);

  const addResume = () => {
    setResumes([...resumes, { id: Date.now() + Math.random(), name: "", content: "" }]);
  };

  const updateResume = (id, field, value) => {
    setResumes(resumes.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeResume = (id) => {
    setResumes(resumes.filter(r => r.id !== id));
  };

  const handleSave = () => {
    onSave({ context, resumes });
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Profile</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#999" }}>×</button>
        </div>

        <label style={labelStyle}>Background / context</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. 10+ years PM/GX/operations, LA-based, targeting $150K+, no direct reports..."
          rows={5}
          style={{ ...inputStyle, marginBottom: 20, resize: "vertical" }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Resume versions</label>
          <button onClick={addResume} style={{ ...secondaryButtonStyle, padding: "4px 10px", fontSize: 12 }}>+ Add resume version</button>
        </div>

        {resumes.length === 0 && (
          <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>No resume versions yet.</div>
        )}

        {resumes.map((r) => (
          <div key={r.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={r.name}
                onChange={(e) => updateResume(r.id, "name", e.target.value)}
                placeholder="Name (e.g. A · Consumer/DTC)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => removeResume(r.id)} style={{ ...secondaryButtonStyle, border: "1.5px solid #d94f40", color: "#d94f40", padding: "4px 10px", fontSize: 12 }}>Remove</button>
            </div>
            <textarea
              value={r.content}
              onChange={(e) => updateResume(r.id, "content", e.target.value)}
              placeholder="Paste resume text..."
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
          <button onClick={handleSave} style={buttonStyle}>Save</button>
        </div>
      </div>
    </div>
  );
}
