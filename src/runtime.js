// Detects whether the tracker is running as a Claude artifact (inside claude.ai)
// and, if so, connects to the viewer's Claude account (sample) and the artifact's
// durable storage (db). On GitHub Pages none of this exists and the app falls back
// to localStorage plus an API key or copy-paste prompt.

export const inArtifact = typeof window !== "undefined" && typeof window.claude?.use === "function";

let samplePromise = null;
export function getSample() {
  if (!inArtifact) return Promise.resolve(null);
  if (!samplePromise) samplePromise = window.claude.use("sample").catch(() => null);
  return samplePromise;
}

let dbPromise = null;
export function getDb() {
  if (!inArtifact) return Promise.resolve(null);
  if (!dbPromise) dbPromise = window.claude.use("db").catch(() => null);
  return dbPromise;
}

// ---- Durable storage (artifact only) ----
// tracker/{profile,statusOverrides,dateApplied}  → { value }
// roles/<num>                                     → one custom role each
// jds/<num>                                       → { text } one job description each

let db = null;
let ready = false;
const lastSaved = new Map(); // path -> JSON string last written
const chains = new Map(); // path -> promise (one write at a time per doc)

function queueWrite(path, fn) {
  const prev = chains.get(path) || Promise.resolve();
  const next = prev.then(fn).catch((e) => console.error("Save failed", path, e));
  chains.set(path, next);
  return next;
}

function writeDoc(path, body) {
  if (!ready) return;
  const json = JSON.stringify(body);
  if (lastSaved.get(path) === json) return;
  lastSaved.set(path, json);
  queueWrite(path, () => db.doc(path).set(body));
}

function deleteDoc(path) {
  if (!ready || !lastSaved.has(path)) return;
  lastSaved.delete(path);
  queueWrite(path, () => db.doc(path).delete());
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

// Loads everything from storage. Resolves null when storage isn't available.
export async function loadRemote() {
  db = await getDb();
  if (!db) return null;
  const [profile, overrides, dates, roles, jds] = await withTimeout(
    Promise.all([
      db.doc("tracker/profile").get(),
      db.doc("tracker/statusOverrides").get(),
      db.doc("tracker/dateApplied").get(),
      db.collection("roles").limit(1000).get(),
      db.collection("jds").limit(1000).get(),
    ]),
    15000
  );
  const state = {
    profile: profile.exists ? profile.data().value : null,
    statusOverrides: overrides.exists ? overrides.data().value || {} : {},
    dateAppliedOverrides: dates.exists ? dates.data().value || {} : {},
    customRoles: roles.docs.map((d) => d.data()).sort((a, b) => a.num - b.num),
    jobDescriptions: Object.fromEntries(jds.docs.map((d) => [d.id, d.data().text || ""])),
  };
  if (profile.exists) lastSaved.set("tracker/profile", JSON.stringify(profile.data()));
  if (overrides.exists) lastSaved.set("tracker/statusOverrides", JSON.stringify(overrides.data()));
  if (dates.exists) lastSaved.set("tracker/dateApplied", JSON.stringify(dates.data()));
  roles.docs.forEach((d) => lastSaved.set(`roles/${d.id}`, JSON.stringify(d.data())));
  jds.docs.forEach((d) => lastSaved.set(`jds/${d.id}`, JSON.stringify(d.data())));
  ready = true;
  return state;
}

export const remote = {
  saveProfile: (profile) => writeDoc("tracker/profile", { value: profile }),
  saveStatusOverrides: (v) => writeDoc("tracker/statusOverrides", { value: v }),
  saveDateApplied: (v) => writeDoc("tracker/dateApplied", { value: v }),
  saveCustomRoles: (roles) => {
    const keep = new Set();
    roles.forEach((r) => {
      const path = `roles/${r.num}`;
      keep.add(path);
      // eslint-disable-next-line no-unused-vars
      const { jobDescription, ...rest } = r; // JDs live in jds/
      writeDoc(path, rest);
    });
    [...lastSaved.keys()].filter((p) => p.startsWith("roles/") && !keep.has(p)).forEach(deleteDoc);
  },
  saveJobDescriptions: (map) => {
    Object.entries(map).forEach(([num, text]) => {
      if (text) writeDoc(`jds/${num}`, { text: String(text).slice(0, 120000) });
    });
  },
};
