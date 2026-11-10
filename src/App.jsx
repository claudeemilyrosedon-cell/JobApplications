import { useEffect, useRef, useState } from "react";
import { loadProfile, saveProfile, loadCustomRoles, saveCustomRoles, loadStatusOverrides, saveStatusOverrides, loadJobDescriptions, saveJobDescriptions, loadDateAppliedOverrides, saveDateAppliedOverrides } from "./storage.js";
import ProfileModal from "./ProfileModal.jsx";
import AddRoleModal, { GITHUB_REPO } from "./AddRoleModal.jsx";
import HiringManagerModal from "./HiringManagerModal.jsx";
import TopFivePanel from "./TopFivePanel.jsx";
import { computePriority, normalizeUrl } from "./scoring.js";
import { inArtifact, loadRemote } from "./runtime.js";
import { ROLES } from "./rolesData.js";

const TIER_META = {
  1: { label: "Apply Now", color: "#1baf7a", bg: "#E1F5EE", border: "#5DCAA5", desc: "LA or remote · Strong fit · Salary on target · COO path clear" },
  2: { label: "Apply — Review Location", color: "#2a78d6", bg: "#E6F1FB", border: "#85B7EB", desc: "Strong fit but requires relocation or significant remote stretch" },
  3: { label: "Apply — Minor Gaps", color: "#d97706", bg: "#FAEEDA", border: "#EF9F27", desc: "Fits partially — domain stretch, location concern, or one missing requirement" },
  4: { label: "Research First", color: "#7c3aed", bg: "#EEEDFE", border: "#AFA9EC", desc: "Details inaccessible or domain mismatch — verify before applying" },
  5: { label: "Details Unavailable", color: "#888", bg: "#F5F5F5", border: "#ddd", desc: "LinkedIn-gated or JS-only — open directly to view" },
};

const APPLIED_STYLE = { bg: "#F0FDF4", color: "#15803D", border: "#86EFAC", label: "✓ Applied" };
const REJECTED_STYLE = { bg: "#FEF2F2", color: "#991B1B", border: "#FCA5A5", label: "✗ Rejected" };
const CLOSED_STYLE = { bg: "#F3F4F6", color: "#374151", border: "#9CA3AF", label: "✕ Closed" };
const UNAPPLIED_STYLE = { bg: "#F5F5F5", color: "#666", border: "#ddd", label: "Un-applied" };
const INTERVIEWING_STYLE = { bg: "#FAEEDA", color: "#633806", border: "#EF9F27", label: "◐ Interviewing" };

const STATUS_TAG_META = {
  unapplied: UNAPPLIED_STYLE,
  applied: APPLIED_STYLE,
  interviewing: INTERVIEWING_STYLE,
  rejected: REJECTED_STYLE,
  closed: CLOSED_STYLE,
};

function getRoleStatus(role, overrides) {
  if (overrides[role.num]) return overrides[role.num];
  if (role.rejected) return "rejected";
  if (role.closed || role.status === "closed") return "closed";
  if (role.applied) return "applied";
  return "unapplied";
}

function getJobDescription(role, jobDescriptions) {
  return jobDescriptions[role.num] || role.repoJobDescription || role.jobDescription || "";
}

const PENDING_KEY = "role-scorecard-pending-github";
const DATA_URL = `${import.meta.env.BASE_URL}data/added-roles.json`;

// Roles scored on GitHub by the score-roles workflow.
async function fetchRepoRoles() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const jds = data.jobDescriptions || {};
  return (data.roles || []).map(r => ({ ...r, repoJobDescription: jds[r.num] || "" }));
}

function loadPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch { return null; }
}
function savePending(p) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* ignore */ }
}

function getDateApplied(role, dateAppliedOverrides) {
  return dateAppliedOverrides[role.num] || role.dateApplied || null;
}

function formatToday() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
const STATUS_STYLES = {
  "applied":  { bg: "#E6F1FB", color: "#1D4ED8", border: "#93C5FD", label: "Applied" },
  "rejected": { bg: "#FEF2F2", color: "#991B1B", border: "#FCA5A5", label: "Rejected" },
  "interview":{ bg: "#FAEEDA", color: "#633806", border: "#EF9F27", label: "Interview" },
  "offer":    { bg: "#E1F5EE", color: "#085041", border: "#5DCAA5", label: "Offer" },
};


const RESUME_VERSION_STYLES = {
  "A": { bg: "#F5F0FF", color: "#5B21B6", border: "#C4B5FD", label: "Version A · Consumer/DTC" },
  "B": { bg: "#EFF6FF", color: "#1D4ED8", border: "#93C5FD", label: "Version B · AI-Native" },
  "C": { bg: "#F0FDF4", color: "#166534", border: "#86EFAC", label: "Version C · Enterprise Ops" },
  "D": { bg: "#FFF7ED", color: "#9A3412", border: "#FDBA74", label: "Version D · Startup PM" },
};

function getResumeStyle(key) {
  return RESUME_VERSION_STYLES[key] || { bg: "#F5F5F5", color: "#555", border: "#ddd", label: key };
}

const FLAG_STYLES = {
  "LA": { bg: "#E1F5EE", color: "#085041", label: "📍 LA" },
  "Remote": { bg: "#E6F1FB", color: "#0C447C", label: "🌐 Remote" },
  "Remote+": { bg: "#E6F1FB", color: "#0C447C", label: "🌐 Remote+" },
  "NYC": { bg: "#FAEEDA", color: "#633806", label: "🏙 NYC" },
  "Miami/NYC": { bg: "#FAEEDA", color: "#633806", label: "🏙 Miami/NYC" },
  "Palo Alto": { bg: "#FAEEDA", color: "#633806", label: "🏙 Palo Alto" },
  "SF": { bg: "#FAEEDA", color: "#633806", label: "🏙 SF" },
  "No": { bg: "#FAECE7", color: "#712B13", label: "❌ Disqualifier" },
  "Reach": { bg: "#FAEEDA", color: "#633806", label: "⬆️ Reach" },
  "Inaccessible": { bg: "#F5F5F5", color: "#888", label: "🔒 Verify" },
  "LinkedIn": { bg: "#F5F5F5", color: "#888", label: "🔗 LinkedIn" },
  "Unknown": { bg: "#F5F5F5", color: "#888", label: "❓ Unknown" },
  "Domain": { bg: "#FAECE7", color: "#712B13", label: "⚠️ Domain" },
  "Enterprise": { bg: "#F5F5F5", color: "#888", label: "🏢 Enterprise" },
  "LA/Remote?": { bg: "#E1F5EE", color: "#085041", label: "📍 LA?" },
  "Bay Area": { bg: "#FAEEDA", color: "#633806", label: "🌉 Bay Area" },
  "Chicago": { bg: "#FAEEDA", color: "#633806", label: "🏙 Chicago" },
};

function RoleScorecard() {
  const [expanded, setExpanded] = useState(null);
  const [filterTier, setFilterTier] = useState("all");
  const [profile, setProfile] = useState(() => loadProfile());
  const [customRoles, setCustomRoles] = useState(() => loadCustomRoles());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState(() => loadStatusOverrides());
  const [jobDescriptions, setJobDescriptions] = useState(() => loadJobDescriptions());
  const [dateAppliedOverrides, setDateAppliedOverrides] = useState(() => loadDateAppliedOverrides());
  const [reviewRole, setReviewRole] = useState(null);

  const [repoRoles, setRepoRoles] = useState([]);
  const [pending, setPending] = useState(() => (inArtifact ? null : loadPending()));
  const repoUrls = new Set(repoRoles.map(r => normalizeUrl(r.url)).filter(Boolean));
  const allRoles = [
    ...ROLES,
    ...repoRoles,
    // A role added in this browser that was also scored on GitHub shows once.
    ...customRoles.filter(r => !(r.url && repoUrls.has(normalizeUrl(r.url)))),
  ];
  const [remoteStatus, setRemoteStatus] = useState(inArtifact ? "loading" : "off");
  const [notice, setNotice] = useState("");
  const importInputRef = useRef(null);

  // In the Claude artifact, load the tracker from durable storage once.
  useEffect(() => {
    if (!inArtifact) return;
    let cancelled = false;
    loadRemote()
      .then((state) => {
        if (cancelled) return;
        if (!state) { setRemoteStatus("unavailable"); return; }
        if (state.profile) setProfile(state.profile);
        setCustomRoles(state.customRoles);
        setStatusOverrides(state.statusOverrides);
        setDateAppliedOverrides(state.dateAppliedOverrides);
        setJobDescriptions(state.jobDescriptions);
        setRemoteStatus("ready");
      })
      .catch(() => { if (!cancelled) setRemoteStatus("unavailable"); });
    return () => { cancelled = true; };
  }, []);
  const storageBlocked = inArtifact && remoteStatus === "loading";

  // GitHub Pages: load roles Claude scored on GitHub.
  useEffect(() => {
    if (inArtifact) return;
    fetchRepoRoles().then(setRepoRoles).catch(() => {});
  }, []);

  // While a GitHub scoring request is pending, check for new roles every 30 s.
  useEffect(() => {
    if (inArtifact || !pending) return;
    const check = async () => {
      try {
        const roles = await fetchRepoRoles();
        setRepoRoles(roles);
        const fresh = roles.filter(r => !pending.knownNums.includes(r.num));
        if (fresh.length) {
          setNotice(`Claude scored and added ${fresh.length} new role${fresh.length === 1 ? "" : "s"} — Today's Top 5 is updated.`);
          setPending(null); savePending(null);
        } else if (Date.now() - pending.since > 30 * 60 * 1000) {
          setNotice("No new roles arrived after 30 minutes — check the GitHub issue for what happened.");
          setPending(null); savePending(null);
        }
      } catch { /* try again next tick */ }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [pending]);

  const handleGithubSubmitted = (count) => {
    const p = { count, since: Date.now(), knownNums: repoRoles.map(r => r.num) };
    setPending(p); savePending(p);
  };

  const handleSaveProfile = (next) => {
    setProfile(next);
    saveProfile(next);
    setShowProfileModal(false);
  };

  const setStatus = (num, status) => {
    const next = { ...statusOverrides, [num]: status };
    setStatusOverrides(next);
    saveStatusOverrides(next);

    if (status === "applied") {
      const role = allRoles.find(r => r.num === num);
      if (role && !getDateApplied(role, dateAppliedOverrides)) {
        const nextDates = { ...dateAppliedOverrides, [num]: formatToday() };
        setDateAppliedOverrides(nextDates);
        saveDateAppliedOverrides(nextDates);
      }
    }
  };

  const setJobDescriptionForRole = (num, text) => {
    const next = { ...jobDescriptions, [num]: text };
    setJobDescriptions(next);
    saveJobDescriptions(next);
  };

  // Adds one or many scored roles. Uses functional updates so several saves in
  // quick succession (automatic scoring) never overwrite each other.
  // Existing roles are never modified.
  const handleAddRoles = (newFields, { keepOpen = false } = {}) => {
    setCustomRoles(prevCustom => {
      const working = [...ROLES, ...prevCustom];
      let nextNum = Math.max(0, ...working.map(r => r.num));
      const added = [];
      for (const fields of newFields) {
        nextNum += 1;
        const tierPeers = working.filter(r => r.tier === fields.tier);
        const nextRank = Math.max(0, ...tierPeers.map(r => r.rank)) + 1;
        const newRole = { ...fields, num: nextNum, rank: nextRank };
        working.push(newRole);
        added.push(newRole);
      }
      const next = [...prevCustom, ...added];
      saveCustomRoles(next);
      const withJd = added.filter(r => r.jobDescription);
      if (withJd.length) {
        setJobDescriptions(prevJd => {
          const nextJd = { ...prevJd };
          withJd.forEach(r => { nextJd[r.num] = r.jobDescription; });
          saveJobDescriptions(nextJd);
          return nextJd;
        });
      }
      return next;
    });
    if (!keepOpen) setShowAddRoleModal(false);
  };

  const openRole = (num) => {
    setFilterTier("all");
    setExpanded(num);
    setTimeout(() => document.getElementById(`role-${num}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  // Full backup: every role with its current state, plus the raw saved data so
  // it can be restored losslessly here or in the Claude artifact version.
  const buildBackup = () => ({
    format: "role-scorecard-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    raw: { profile, customRoles, statusOverrides, jobDescriptions, dateAppliedOverrides },
    roles: allRoles.map(r => ({
      ...r,
      status: getRoleStatus(r, statusOverrides),
      dateApplied: getDateApplied(r, dateAppliedOverrides),
      priority: computePriority(r),
      jobDescription: getJobDescription(r, jobDescriptions) || undefined,
    })),
  });

  const exportTracker = async () => {
    const json = JSON.stringify(buildBackup(), null, 2);
    if (inArtifact) {
      try {
        await navigator.clipboard.writeText(json);
        setNotice("Backup copied to your clipboard.");
      } catch {
        setNotice("Couldn't copy the backup in this view.");
      }
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `role_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Restores a backup (or the older roles-only export) by merging it in.
  // Nothing already in the tracker is deleted.
  const importBackup = (data) => {
    const builtInNums = new Set(ROLES.map(r => r.num));
    let raw;
    if (data && data.format === "role-scorecard-backup" && data.raw) {
      raw = data.raw;
    } else if (Array.isArray(data)) {
      raw = { customRoles: [], statusOverrides: {}, jobDescriptions: {}, dateAppliedOverrides: {} };
      for (const r of data) {
        const base = ROLES.find(b => b.num === r.num);
        if (!base) {
          // eslint-disable-next-line no-unused-vars
          const { status, priority, ...role } = r;
          raw.customRoles.push(role);
        }
        const defaultStatus = getRoleStatus(base || { ...r, status: undefined, applied: false }, {});
        if (r.status && r.status !== defaultStatus) raw.statusOverrides[r.num] = r.status;
        if (r.dateApplied && r.dateApplied !== (base?.dateApplied || null)) raw.dateAppliedOverrides[r.num] = r.dateApplied;
        if (r.jobDescription) raw.jobDescriptions[r.num] = r.jobDescription;
      }
    } else {
      setNotice("That file isn't a tracker backup.");
      return;
    }

    const existingUrls = new Set(allRoles.map(r => normalizeUrl(r.url)).filter(Boolean));
    const usedNums = new Set(allRoles.map(r => r.num));
    let maxNum = Math.max(0, ...allRoles.map(r => r.num), ...(raw.customRoles || []).map(r => r.num || 0));
    const numMap = {};
    const addedRoles = [];
    for (const r of raw.customRoles || []) {
      if (r.url && existingUrls.has(normalizeUrl(r.url))) continue;
      let num = r.num;
      if (!num || usedNums.has(num) || builtInNums.has(num)) num = ++maxNum;
      numMap[r.num] = num;
      usedNums.add(num);
      addedRoles.push({ ...r, num });
    }
    const mapNum = (k) => (numMap[k] !== undefined ? numMap[k] : Number(k));
    const remap = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => usedNums.has(mapNum(k))).map(([k, v]) => [mapNum(k), v]));

    const nextCustom = [...customRoles, ...addedRoles];
    const nextOverrides = { ...statusOverrides, ...remap(raw.statusOverrides) };
    const nextDates = { ...dateAppliedOverrides, ...remap(raw.dateAppliedOverrides) };
    const nextJds = { ...jobDescriptions, ...remap(raw.jobDescriptions) };
    setCustomRoles(nextCustom); saveCustomRoles(nextCustom);
    setStatusOverrides(nextOverrides); saveStatusOverrides(nextOverrides);
    setDateAppliedOverrides(nextDates); saveDateAppliedOverrides(nextDates);
    setJobDescriptions(nextJds); saveJobDescriptions(nextJds);
    if (raw.profile && !profile.context && !profile.resumes.length) { setProfile(raw.profile); saveProfile(raw.profile); }
    setNotice(`Imported ${addedRoles.length} added role${addedRoles.length === 1 ? "" : "s"} and ${Object.keys(remap(raw.statusOverrides)).length} status update${Object.keys(remap(raw.statusOverrides)).length === 1 ? "" : "s"}.`);
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      importBackup(JSON.parse(await file.text()));
    } catch {
      setNotice("Couldn't read that file — choose the backup .json from Export.");
    }
  };

  const tiers = [1,2,3,4,5];
  const sortByPriority = (roles) => [...roles].sort((a, b) => {
    // Applied/closed/rejected roles go to bottom when viewing all
    const aInactive = getRoleStatus(a, statusOverrides) !== "unapplied" ? 1 : 0;
    const bInactive = getRoleStatus(b, statusOverrides) !== "unapplied" ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;
    // Sort by tier first, then rank within tier
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.rank - b.rank;
  });
  const baseFiltered = filterTier === "all" ? allRoles : filterTier === "applied" ? allRoles.filter(r => getRoleStatus(r, statusOverrides) === "applied") : filterTier === "rejected" ? allRoles.filter(r => getRoleStatus(r, statusOverrides) === "rejected") : allRoles.filter(r => r.tier === Number(filterTier));
  const filtered = sortByPriority(baseFiltered);
  const rejectedCount = allRoles.filter(r => getRoleStatus(r, statusOverrides) === "rejected").length;
  const appliedCount = allRoles.filter(r => getRoleStatus(r, statusOverrides) === "applied").length;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>Career Advisor · Role Ranking</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 4 }}>{allRoles.length} Roles Ranked by Fit</div>
        <div style={{ fontSize: 13, color: "#666" }}>Emily Rose Don · Los Angeles, CA · July 2026 · Ranked by: location fit, skills match, hire likelihood, salary, and COO path value</div>
      </div>

      {/* Profile / Add Role actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowProfileModal(true)} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #ddd", background: "#fafafa", color: "#555", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Profile</button>
        <button onClick={() => setShowAddRoleModal(true)} disabled={storageBlocked} style={{ opacity: storageBlocked ? 0.5 : 1,  padding: "6px 14px", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "white", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>+ Add Roles</button>
        <button onClick={exportTracker} disabled={storageBlocked} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #ddd", background: "#fafafa", color: "#555", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{inArtifact ? "Copy backup" : "Export backup"}</button>
        <button onClick={() => importInputRef.current?.click()} disabled={storageBlocked} style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #ddd", background: "#fafafa", color: "#555", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Import backup</button>
        <input ref={importInputRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} />
      </div>

      {pending && (
        <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, marginBottom: 12, background: "#EFF6FF", color: "#1D4ED8", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>⏳ Claude is scoring {pending.count} role{pending.count === 1 ? "" : "s"} on GitHub — usually 2–5 minutes. This page updates by itself.</span>
          <span style={{ display: "flex", gap: 12 }}>
            <a href={`${GITHUB_REPO}/actions/workflows/score-roles.yml`} target="_blank" rel="noopener noreferrer" style={{ color: "#1D4ED8" }}>View progress</a>
            <button onClick={() => { setPending(null); savePending(null); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#1D4ED8", fontSize: 12, padding: 0 }}>Stop waiting</button>
          </span>
        </div>
      )}

      {(storageBlocked || remoteStatus === "unavailable" || notice) && (
        <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, marginBottom: 12, background: remoteStatus === "unavailable" ? "#FEF2F2" : "#F5F5F5", color: remoteStatus === "unavailable" ? "#991B1B" : "#555", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>
            {storageBlocked ? "Loading your saved tracker…" : remoteStatus === "unavailable" ? "Couldn't reach saved data — changes this visit may not be kept. Reload to try again." : notice}
          </span>
          {notice && !storageBlocked && <button onClick={() => setNotice("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#999" }}>×</button>}
        </div>
      )}

      {/* Tier filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <button onClick={() => setFilterTier("all")} style={{ padding: "6px 14px", borderRadius: 20, border: filterTier === "all" ? "1.5px solid #111" : "1.5px solid #ddd", background: filterTier === "all" ? "#111" : "#fafafa", color: filterTier === "all" ? "white" : "#555", fontSize: 12, cursor: "pointer", fontWeight: filterTier === "all" ? 600 : 400 }}>All {allRoles.length}</button>
        <button onClick={() => setFilterTier("rejected")} style={{ padding: "6px 14px", borderRadius: 20, border: filterTier === "rejected" ? `1.5px solid ${REJECTED_STYLE.color}` : `1.5px solid ${REJECTED_STYLE.border}`, background: filterTier === "rejected" ? REJECTED_STYLE.color : REJECTED_STYLE.bg, color: filterTier === "rejected" ? "white" : REJECTED_STYLE.color, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✗ Rejected ({rejectedCount})</button>
        <button onClick={() => setFilterTier("applied")} style={{ padding: "6px 14px", borderRadius: 20, border: filterTier === "applied" ? `1.5px solid ${APPLIED_STYLE.color}` : "1.5px solid #86EFAC", background: filterTier === "applied" ? APPLIED_STYLE.color : APPLIED_STYLE.bg, color: filterTier === "applied" ? "white" : APPLIED_STYLE.color, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✓ Applied ({appliedCount})</button>
        {tiers.map(t => {
          const m = TIER_META[t];
          const active = filterTier === String(t);
          return (
            <button key={t} onClick={() => setFilterTier(String(t))} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${active ? m.color : "#ddd"}`, background: active ? m.bg : "#fafafa", color: active ? m.color : "#555", fontSize: 12, cursor: "pointer", fontWeight: active ? 600 : 400 }}>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Tier summaries */}
      {filterTier === "all" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 20 }}>
          {tiers.map(t => {
            const m = TIER_META[t];
            const count = allRoles.filter(r => r.tier === t).length;
            return (
              <div key={t} onClick={() => setFilterTier(String(t))} style={{ background: m.bg, border: `1px solid ${m.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: m.color, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{count}</div>
                <div style={{ fontSize: 10, color: m.color + "CC", marginTop: 2, lineHeight: 1.4 }}>{m.desc}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Today's Top 5 */}
      {filterTier === "all" && (
        <TopFivePanel roles={allRoles} getStatus={(r) => getRoleStatus(r, statusOverrides)} onOpenRole={openRole} />
      )}

      {/* Application Tracker Dashboard */}
      {(() => {
        const appliedRoles = allRoles.filter(r => ["applied", "rejected", "interviewing"].includes(getRoleStatus(r, statusOverrides)));
        const rejectedRoles = appliedRoles.filter(r => getRoleStatus(r, statusOverrides) === "rejected");
        const inReviewRoles = appliedRoles.filter(r => getRoleStatus(r, statusOverrides) === "applied");
        return (
          <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#888", marginBottom: 12 }}>Application Tracker</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
              <div style={{ background: "var(--surface-1)", borderRadius: 8, padding: "10px 12px", border: "0.5px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Total Applied</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{appliedRoles.length}</div>
              </div>
              <div style={{ background: "#E1F5EE", borderRadius: 8, padding: "10px 12px", border: "0.5px solid #5DCAA5" }}>
                <div style={{ fontSize: 10, color: "#085041", marginBottom: 3 }}>In Review</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#085041" }}>{inReviewRoles.length}</div>
              </div>
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "10px 12px", border: "0.5px solid #FCA5A5" }}>
                <div style={{ fontSize: 10, color: "#991B1B", marginBottom: 3 }}>Rejected</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#991B1B" }}>{rejectedRoles.length}</div>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "5px 8px", color: "#888", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Company</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", color: "#888", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", color: "#888", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Resume</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", color: "#888", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Applied</th>
                  <th style={{ textAlign: "left", padding: "5px 8px", color: "#888", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {appliedRoles.sort((a,b) => (getDateApplied(a, dateAppliedOverrides)||"").localeCompare(getDateApplied(b, dateAppliedOverrides)||"")).map(r => (
                  <tr key={r.num} style={{ borderBottom: "0.5px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 500, color: "var(--text-primary)" }}>{r.company.split(" (")[0].split(" — ")[0]}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-secondary)", maxWidth: 200 }}>{r.title.split(" to ")[0].replace("Chief of Staff", "CoS").replace("Director, ", "").slice(0,35)}{r.title.length > 45 ? "…" : ""}</td>
                    <td style={{ padding: "6px 8px" }}>{r.resumeVersion ? <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: getResumeStyle(r.resumeVersion).bg, color: getResumeStyle(r.resumeVersion).color, border: `0.5px solid ${getResumeStyle(r.resumeVersion).border}`, fontWeight: 600 }}>Ver. {r.resumeVersion}</span> : "—"}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{getDateApplied(r, dateAppliedOverrides) || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      {(() => {
                        const trackerStatus = getRoleStatus(r, statusOverrides);
                        const sm = STATUS_TAG_META[trackerStatus] || APPLIED_STYLE;
                        return (
                          <select
                            value={trackerStatus}
                            onChange={(e) => setStatus(r.num, e.target.value)}
                            style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: sm.bg, color: sm.color, border: `0.5px solid ${sm.border}`, cursor: "pointer" }}
                          >
                            <option value="applied">In Review</option>
                            <option value="interviewing">Interviewing</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Role rows */}
      {filtered.map((role) => {
        const tm = TIER_META[role.tier];
        const flagStyle = FLAG_STYLES[role.flag] || FLAG_STYLES["Unknown"];
        const isOpen = expanded === role.num;
        return (
          <div key={role.num} id={`role-${role.num}`} style={{ border: `1px solid ${isOpen ? tm.color + "55" : "#e8e8e8"}`, borderRadius: 10, marginBottom: 8, overflow: "hidden", transition: "border-color 0.15s" }}>
            <div onClick={() => setExpanded(isOpen ? null : role.num)} style={{ display: "flex", alignItems: "center", cursor: "pointer", background: isOpen ? tm.bg : "#fafafa", gap: 0 }}>
              {/* Rank */}
              <div style={{ width: 44, display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 0", borderRight: "1px solid #e8e8e8", fontSize: 12, fontWeight: 700, color: isOpen ? tm.color : "#ccc", flexShrink: 0 }}>
                {String(role.rank).padStart(2,"0")}
              </div>
              {/* Tier badge */}
              <div style={{ padding: "0 10px", flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: tm.color }} />
              </div>
              {/* Main info */}
              <div style={{ flex: 1, padding: "12px 8px 12px 4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{role.company}</span>
                  <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 20, background: flagStyle.bg, color: flagStyle.color, border: `0.5px solid ${flagStyle.color}33`, whiteSpace: "nowrap" }}>{flagStyle.label}</span>
                  {(() => {
                    const status = getRoleStatus(role, statusOverrides);
                    const sm = STATUS_TAG_META[status];
                    return (
                      <select
                        value={status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStatus(role.num, e.target.value)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`, whiteSpace: "nowrap", cursor: "pointer" }}
                      >
                        <option value="unapplied">Un-applied</option>
                        <option value="applied">✓ Applied</option>
                        <option value="interviewing">◐ Interviewing</option>
                        <option value="rejected">✗ Rejected</option>
                        <option value="closed">✕ Closed</option>
                      </select>
                    );
                  })()}
                  {role.resumeVersion && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: getResumeStyle(role.resumeVersion).bg, color: getResumeStyle(role.resumeVersion).color, border: `0.5px solid ${getResumeStyle(role.resumeVersion).border}`, whiteSpace: "nowrap" }}>{getResumeStyle(role.resumeVersion).label}</span>}
                  {role.tier === 4 && <span style={{ fontSize: 10, color: "#888", background: "#f5f5f5", padding: "1px 6px", borderRadius: 10, border: "0.5px solid #ddd" }}>Tier {role.tier}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>{role.title}</div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>#{role.num} · {role.location} · {role.salary}</div>
              </div>
              {/* Scores */}
              <div style={{ display: "flex", gap: 14, padding: "0 12px", alignItems: "center", flexShrink: 0 }}>
                {role.fit !== null && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#999", marginBottom: 2 }}>Fit</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: role.fit >= 8 ? "#1baf7a" : role.fit >= 6 ? "#d97706" : "#d94f40" }}>{role.fit}/10</div>
                  </div>
                )}
                {role.fit !== null && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#999", marginBottom: 2 }}>Priority</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>{computePriority(role)}</div>
                  </div>
                )}
                {role.cos_path !== "Unknown" && role.cos_path && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#999", marginBottom: 2 }}>COO</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#555", whiteSpace: "nowrap" }}>{role.cos_path}</div>
                  </div>
                )}
              </div>
              {/* Chevron */}
              <div style={{ padding: "0 14px", fontSize: 10, color: "#bbb", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>▶</div>
            </div>

            {isOpen && (
              <div style={{ borderTop: `1px solid ${tm.color}33`, padding: "14px 16px", background: "white", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: 5 }}>Full assessment</div>
                  <div style={{ fontSize: 12, color: "#444", lineHeight: 1.65 }}>{role.note}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: 5 }}>Key details</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[["Location", role.location], ["Added", role.dateAdded], ["Deadline", role.deadline], ["Confirm", Array.isArray(role.openQuestions) && role.openQuestions.length ? role.openQuestions.join("; ") : null], ["Remote", role.remote === true ? "Yes" : role.remote === false ? "No (in-office)" : "Unknown"], ["Salary", role.salary], ["Hire likelihood", role.hire], ["COO path", role.cos_path]].filter(([k,v]) => v || !["Added", "Deadline", "Confirm"].includes(k)).map(([k,v]) => (
                      <div key={k} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 6 }}>
                        <div style={{ fontSize: 11, color: "#999" }}>{k}</div>
                        <div style={{ fontSize: 12, color: "#333", fontWeight: 500 }}>{v || "Unknown"}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: 5 }}>Action</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <a href={role.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "7px 14px", background: tm.bg, color: tm.color, border: `1px solid ${tm.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                      View posting →
                    </a>
                    <button onClick={(e) => { e.stopPropagation(); setReviewRole(role); }} style={{ padding: "7px 14px", background: "white", color: "#111", border: "1.5px solid #111", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Hiring Manager Review
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", lineHeight: 1.5 }}>
                    {role.tier === 1 && "Apply this week. Tailor resume to this role's specific language."}
                    {role.tier === 2 && "Strong role — resolve location question before applying."}
                    {role.tier === 3 && "Apply with clear gap mitigation in cover letter."}
                    {role.tier === 4 && "Research the role directly before deciding to apply."}
                    {role.tier === 5 && "Log into LinkedIn or open the link directly to view."}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 16, fontSize: 11, color: "#999", lineHeight: 1.6, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <strong style={{ color: "#555" }}>Note:</strong> 19 of 52 roles are LinkedIn-gated (require authentication) and could not be evaluated. 4 roles used JavaScript-rendering that prevented content extraction. 1 URL was too long to process. Rankings for inaccessible roles are placeholders — open them directly to evaluate. All rankings based on Emily Rose Don's profile: LA-based, 10+ years PM/GX/operations, AI practitioner, Alaska Airlines, no current direct reports.
      </div>

      {showProfileModal && (
        <ProfileModal profile={profile} onSave={handleSaveProfile} onClose={() => setShowProfileModal(false)} />
      )}
      {showAddRoleModal && (
        <AddRoleModal profile={profile} existingRoles={allRoles} onAdd={handleAddRoles} onGithubSubmitted={handleGithubSubmitted} onClose={() => setShowAddRoleModal(false)} />
      )}
      {reviewRole && (
        <HiringManagerModal
          role={reviewRole}
          profile={profile}
          initialJobDescription={getJobDescription(reviewRole, jobDescriptions)}
          onSaveJobDescription={(text) => setJobDescriptionForRole(reviewRole.num, text)}
          onClose={() => setReviewRole(null)}
        />
      )}
    </div>
  );
}

const SITE_PASSWORD = "OhNoYouKnowInspect";
const AUTH_KEY = "role-scorecard-auth";

function PasswordGate() {
  const [authed, setAuthed] = useState(() => {
    try { return sessionStorage.getItem(AUTH_KEY) === "true"; } catch { return false; }
  });
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  // The Claude artifact is private to its owner, so it needs no password.
  if (inArtifact || authed) return <RoleScorecard />;

  const submit = (e) => {
    e.preventDefault();
    if (input === SITE_PASSWORD) {
      try { sessionStorage.setItem(AUTH_KEY, "true"); } catch { /* ignore */ }
      setAuthed(true);
    } else {
      setError(true);
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 320, margin: "18vh auto 0", padding: "0 1rem", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 12 }}>This page is password protected</div>
      <form onSubmit={submit}>
        <input
          type="password"
          autoFocus
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(false); }}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${error ? "#d94f40" : "#ddd"}`, fontSize: 14, boxSizing: "border-box" }}
        />
        {error && <div style={{ color: "#d94f40", fontSize: 12, marginTop: 6 }}>Incorrect password</div>}
        <button type="submit" style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Enter
        </button>
      </form>
    </div>
  );
}

export default PasswordGate;
