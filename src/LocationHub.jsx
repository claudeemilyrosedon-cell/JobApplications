import { useEffect, useState } from "react";
import { RoleScorecard, ROLES, getEffectiveStatus } from "./App.jsx";
import { REGIONS } from "./regions.js";
import { computePriority, isDisqualified, companyKey, todayScore, inferLocationClass } from "./scoring.js";
import { loadCustomRoles, loadStatusOverrides, loadDateAppliedOverrides } from "./storage.js";

const FONT = "'Inter', system-ui, sans-serif";

const TABS = [
  { key: "home", label: "Home" },
  { key: "la", label: "Los Angeles" },
  { key: "raleigh", label: "Raleigh-Durham" },
  { key: "charlotte", label: "Charlotte" },
  { key: "atlanta", label: "Atlanta" },
];

const CITY = {
  la: { label: "Los Angeles", short: "LA", color: "#1D4ED8", bg: "#EFF6FF", home: "Westchester – Torrance", scale: "Priority score: fit, hire odds, LA/remote, pay, COO path" },
  raleigh: { label: "Raleigh-Durham", short: "RDU", color: "#047857", bg: "#ECFDF5" },
  charlotte: { label: "Charlotte", short: "CLT", color: "#B45309", bg: "#FFFBEB" },
  atlanta: { label: "Atlanta", short: "ATL", color: "#7C3AED", bg: "#F5F3FF" },
};
for (const k of ["raleigh", "charlotte", "atlanta"]) {
  CITY[k].home = REGIONS[k].home;
  CITY[k].scale = `Lifestyle score: ${REGIONS[k].partLabels.join(", ").toLowerCase()}`;
}

const STATUS_CHIP = {
  applied: { label: "Applied", bg: "#F0FDF4", color: "#15803D", border: "#86EFAC" },
  interviewing: { label: "Interviewing", bg: "#FAEEDA", color: "#633806", border: "#EF9F27" },
  no_response: { label: "No response", bg: "#F5F3FF", color: "#5B21B6", border: "#C4B5FD" },
};

function readHash() {
  const h = (typeof window !== "undefined" ? window.location.hash : "").replace("#", "");
  return ["home", "la", "raleigh", "charlotte", "atlanta"].includes(h) ? h : "home";
}

// Statuses for the NC/Atlanta city roles (they aren't in the main tracker).
const CITY_STATUS_KEY = "role-scorecard-city-status";
function loadCityStatus() {
  try { return JSON.parse(localStorage.getItem(CITY_STATUS_KEY) || "{}") || {}; } catch { return {}; }
}
function saveCityStatus(v) {
  try { localStorage.setItem(CITY_STATUS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

// Every tracker role (built-in + added on the site) with its live status.
function trackerRoles() {
  const overrides = loadStatusOverrides();
  const dates = loadDateAppliedOverrides();
  return [...ROLES, ...loadCustomRoles()].map((r) => ({ ...r, status: getEffectiveStatus(r, overrides, dates) }));
}

// LA list for the Home "best overall" view: active, scored by priority.
function laRoles() {
  return trackerRoles()
    .map((r) => ({ ...r, score: computePriority(r) }))
    .filter((r) => !["rejected", "closed"].includes(r.status) && !isDisqualified(r) && !r.duplicateOf && r.score > 0)
    .map(toCard)
    .sort((a, b) => b.score - a.score || (b.fit || 0) - (a.fit || 0));
}

function toCard(r) {
  return {
    id: r.num, company: r.company, title: r.title, location: r.location, salary: r.salary,
    fit: r.fit, hire: r.hire, resumeVersion: r.resumeVersion, score: r.score, status: r.status,
    why: r.note, url: r.url, city: "la", reasons: r.reasons,
  };
}

function regionRoles(key) {
  const st = loadCityStatus();
  return REGIONS[key].roles.map((r) => ({ ...r, city: key, status: st[`${key}-${r.id}`] || "unapplied" }));
}

// Companies already applied to anywhere (tracker or city tabs), so today's picks skip them.
function appliedCompanies() {
  const set = new Set(trackerRoles().filter((r) => r.status !== "unapplied").map((r) => companyKey(r.company)));
  for (const k of Object.keys(REGIONS)) for (const r of regionRoles(k)) if (r.status !== "unapplied") set.add(companyKey(r.company));
  return set;
}

// Today's picks for LA: same rules as the tracker's Today's Top 5, limited to LA-based or remote roles.
function laToday(n) {
  const skip = appliedCompanies();
  const ranked = trackerRoles()
    .filter((r) => r.status === "unapplied" && r.tier >= 1 && r.tier <= 3 && r.resumeVersion && !r.duplicateOf)
    .filter((r) => inferLocationClass(r) !== "relocation")
    .map((r) => ({ ...r, ...todayScore(r) }))
    .filter((r) => !r.expired && r.base > 0)
    .sort((a, b) => b.score - a.score || (Number(b.fit) || 0) - (Number(a.fit) || 0));
  return pickUnique(ranked.map(toCard), n, skip);
}

// Today's picks for a city: un-applied roles, best lifestyle score first.
function cityToday(key, n) {
  const ranked = regionRoles(key).filter((r) => r.status === "unapplied").sort((a, b) => b.score - a.score);
  return pickUnique(ranked, n, appliedCompanies());
}

function pickUnique(ranked, n, skip) {
  const seen = new Map();
  const picks = [];
  for (const r of ranked) {
    const k = companyKey(r.company);
    if (skip.has(k)) continue;
    if (seen.has(k)) { seen.get(k).also.push(r); continue; }
    if (picks.length >= n) continue;
    const pick = { ...r, also: [] };
    seen.set(k, pick);
    picks.push(pick);
  }
  return picks;
}

// One role per company; extra roles at the same company ride along as "also".
function topUnique(roles, n) {
  const seen = new Map();
  const picks = [];
  for (const r of roles) {
    const k = companyKey(r.company);
    if (seen.has(k)) { seen.get(k).also.push(r); continue; }
    if (picks.length >= n) continue;
    const pick = { ...r, also: [] };
    seen.set(k, pick);
    picks.push(pick);
  }
  return picks;
}

function Chip({ city }) {
  const c = CITY[city];
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999, background: c.bg, color: c.color, border: `1px solid ${c.color}33` }}>{c.short}</span>;
}

function StatusChip({ status }) {
  const s = STATUS_CHIP[status];
  if (!s) return null;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{s.label}</span>;
}

function ScoreBadge({ score, color }) {
  return (
    <div style={{ minWidth: 46, height: 46, borderRadius: 10, background: color, color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 8, opacity: 0.85, marginTop: 2, letterSpacing: "0.05em" }}>/100</div>
    </div>
  );
}

function Parts({ role }) {
  if (!role.parts) return null;
  const reg = REGIONS[role.city];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: "6px 12px", margin: "10px 0 4px" }}>
      {role.parts.map((v, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555" }}>
            <span>{reg.partLabels[i]}</span><span style={{ fontWeight: 600, color: "#111" }}>{v}/{reg.partMax[i]}</span>
          </div>
          <div style={{ height: 4, background: "#eee", borderRadius: 2, marginTop: 3 }}>
            <div style={{ width: `${Math.min(100, (v / reg.partMax[i]) * 100)}%`, height: 4, borderRadius: 2, background: CITY[role.city].color }} />
          </div>
        </div>
      ))}
      {role.penalty ? <div style={{ fontSize: 11, color: "#991B1B" }}>Penalty −{role.penalty}</div> : null}
    </div>
  );
}

function RoleCard({ role, rank, showCity, action }) {
  const [open, setOpen] = useState(rank === 1);
  const [more, setMore] = useState(false);
  const long = (role.why || "").length > 320;
  const c = CITY[role.city];
  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 10, background: "white" }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
        <ScoreBadge score={role.score} color={c.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>#{rank}</span>
            {showCity && <Chip city={role.city} />}
            <StatusChip status={role.status} />
            {role.resumeVersion && <span style={{ fontSize: 10, color: "#666", border: "1px solid #ddd", borderRadius: 999, padding: "1px 7px" }}>Resume {role.resumeVersion}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111", lineHeight: 1.3 }}>{role.company}</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.35 }}>{role.title}</div>
          <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>{role.location} · {role.salary || "Pay unlisted"}{role.fit ? ` · Fit ${role.fit}/10` : ""}{role.hire ? ` · Hire odds ${role.hire}` : ""}</div>
        </div>
        <div style={{ fontSize: 14, color: "#bbb", paddingTop: 2 }}>{open ? "▾" : "▸"}</div>
      </div>
      {open && (
        <div style={{ marginTop: 8, paddingLeft: 58 }}>
          <Parts role={role} />
          {role.drive && <div style={{ fontSize: 12, color: "#444", margin: "6px 0" }}><b>Commute:</b> {role.drive}</div>}
          {role.why && (
            <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
              {long && !more ? `${role.why.slice(0, 320).replace(/\s+\S*$/, "")}… ` : role.why}
              {long && <button onClick={() => setMore(!more)} style={{ border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 600, color: c.color, cursor: "pointer" }}>{more ? " Show less" : "Read more"}</button>}
            </div>
          )}
          {role.also?.length > 0 && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
              <b>Also at {role.company}:</b> {role.also.map((a) => `${a.title} (${a.score})`).join(" · ")}. Apply to one role per company.
            </div>
          )}
          {role.reasons?.length > 0 && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Today: {role.reasons.join(" · ")}</div>}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            {role.url && <a href={role.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: c.color }}>View posting ↗</a>}
            {action}
          </div>
        </div>
      )}
    </div>
  );
}

function CityView({ city, onOpenAll, onChange }) {
  const c = CITY[city];
  const [, bump] = useState(0);
  const picks = city === "la" ? laToday(5) : cityToday(city, 5);
  const appliedHere = city === "la" ? [] : regionRoles(city).filter((r) => r.status !== "unapplied");

  const setCity = (role, status) => {
    const st = loadCityStatus();
    const key = `${city}-${role.id}`;
    if (status === "unapplied") delete st[key]; else st[key] = status;
    saveCityStatus(st);
    bump((x) => x + 1);
    onChange?.();
  };

  const btn = { fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${c.color}`, background: "white", color: c.color, cursor: "pointer" };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>Top 5 to apply to today in {c.label}</div>
      <div style={{ fontSize: 13, color: "#666", margin: "4px 0 2px" }}>Target home base: {c.home}</div>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 14 }}>
        {city === "la"
          ? "Same rules as Today's Top 5 in the tracker: not yet applied, tier 1–3, LA-based or remote, newer postings and close deadlines rank higher. Skips companies you've already applied to."
          : `${c.scale}. Not yet applied, one per company, skipping companies you've already applied to. Mark a role applied and the next one moves up.`}
      </div>
      {picks.length === 0 && <div style={{ fontSize: 13, color: "#666", padding: "12px 0" }}>Nothing left to apply to here. Add or rescore roles to refill this list.</div>}
      {picks.map((r, i) => (
        <RoleCard key={`${city}-${r.id}`} role={r} rank={i + 1}
          action={city === "la"
            ? <button style={btn} onClick={onOpenAll}>Update status in tracker</button>
            : <button style={btn} onClick={() => setCity(r, "applied")}>✓ Mark applied</button>} />
      ))}
      {city === "la" && (
        <button onClick={onOpenAll} style={{ marginTop: 6, padding: "8px 16px", borderRadius: 8, border: "1.5px solid #111", background: "#111", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Open the full application tracker →
        </button>
      )}
      {appliedHere.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 13, fontWeight: 600, color: "#555", cursor: "pointer" }}>Applied in {c.label} ({appliedHere.length})</summary>
          <div style={{ marginTop: 8 }}>
            {appliedHere.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ flex: 1 }}><b>{r.company}</b> · {r.title}</span>
                <select value={r.status} onChange={(e) => setCity(r, e.target.value)} style={{ fontSize: 12 }}>
                  <option value="applied">Applied</option>
                  <option value="interviewing">Interviewing</option>
                  <option value="rejected">Rejected</option>
                  <option value="closed">Closed</option>
                  <option value="unapplied">Undo (not applied)</option>
                </select>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function HomeView({ lists, go }) {
  const all = ["la", "raleigh", "charlotte", "atlanta"].flatMap((k) => lists[k]).filter((r) => !["rejected", "closed"].includes(r.status));
  all.sort((a, b) => b.score - a.score);
  const best = topUnique(all, 8);
  return (
    <div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.25rem 1rem 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 12 }}>
          {["la", "raleigh", "charlotte", "atlanta"].map((k) => {
            const top = lists[k][0];
            const c = CITY[k];
            return (
              <div key={k} onClick={() => go(k)} style={{ cursor: "pointer", border: `1.5px solid ${c.color}33`, background: c.bg, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>{c.label} · top 5 →</div>
                {top && <div style={{ fontSize: 13, color: "#111", lineHeight: 1.35, marginTop: 4 }}><b>#1 {top.company}</b> · {top.score}<div style={{ color: "#555", fontSize: 12 }}>{top.title}</div></div>}
              </div>
            );
          })}
        </div>
        <details style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: "10px 14px", background: "#fafafa" }}>
          <summary style={{ fontSize: 14, fontWeight: 700, color: "#111", cursor: "pointer" }}>Best roles overall, all 4 cities (top {best.length})</summary>
          <div style={{ marginTop: 8 }}>
            {best.map((r) => (
              <div key={`best-${r.city}-${r.id}`} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #eee" }}>
                <span style={{ fontWeight: 800, color: CITY[r.city].color, minWidth: 24 }}>{r.score}</span>
                <Chip city={r.city} />
                <span style={{ flex: 1 }}><b>{r.company}</b> · {r.title} <StatusChip status={r.status} /></span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.5, marginTop: 8 }}>
              LA uses the tracker's priority score; Raleigh-Durham, Charlotte and Atlanta use the lifestyle score (can the job move back with you, travel freedom, commute). Both run 0–100.
            </div>
          </div>
        </details>
      </div>
      <RoleScorecard />
    </div>
  );
}

export default function LocationHub() {
  const [tab, setTab] = useState(readHash);
  const [lists, setLists] = useState(() => ({
    la: laRoles(), raleigh: regionRoles("raleigh"), charlotte: regionRoles("charlotte"), atlanta: regionRoles("atlanta"),
  }));

  useEffect(() => {
    const onHash = () => setTab(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refresh = () => setLists({ la: laRoles(), raleigh: regionRoles("raleigh"), charlotte: regionRoles("charlotte"), atlanta: regionRoles("atlanta") });

  const go = (key) => {
    refresh();
    window.location.hash = key;
    setTab(key);
    window.scrollTo(0, 0);
  };

  const active = tab;

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.96)", borderBottom: "1px solid #eee", backdropFilter: "blur(6px)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "10px 1rem 0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#888" }}>Emily Rose Don · Role Scorecard · 4 locations</div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", marginTop: 6 }}>
            {TABS.map((t) => {
              const on = active === t.key;
              const color = t.key === "home" ? "#111" : CITY[t.key].color;
              return (
                <button key={t.key} onClick={() => go(t.key)} style={{
                  whiteSpace: "nowrap", padding: "8px 12px", border: "none", background: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: on ? 700 : 500, color: on ? color : "#666",
                  borderBottom: `2.5px solid ${on ? color : "transparent"}`,
                }}>{t.label}</button>
              );
            })}
          </div>
        </div>
      </div>

      {tab === "home" ? (
        <HomeView lists={lists} go={go} />
      ) : (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>
          <CityView city={tab} onOpenAll={() => go("home")} onChange={refresh} />
        </div>
      )}
    </div>
  );
}
