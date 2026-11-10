// Calls the Claude API straight from the browser with the user's own API key.
// The key lives only in this browser's localStorage — never in the repo.

const API_URL = "https://api.anthropic.com/v1/messages";
const SETTINGS_KEY = "role-scorecard-claude-api";

export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (recommended)" },
  { id: "claude-opus-5-5", label: "Opus 5.5 (most thorough, slower)" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (fastest, cheapest)" },
];

export function loadApiSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { apiKey: parsed.apiKey || "", model: parsed.model || MODELS[0].id };
  } catch {
    return { apiKey: "", model: MODELS[0].id };
  }
}

export function saveApiSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save API settings", err);
  }
}

async function post(apiKey, body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-fetch-2025-09-10",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("API key was rejected — check it in Claude API settings.");
    if (res.status === 429) throw new Error("Rate limited by the API — wait a minute and retry.");
    if (res.status === 400 && /web_fetch|tool/i.test(msg)) throw new Error("This model couldn't open links — paste the job description, or pick another model in settings.");
    throw new Error(msg);
  }
  return data;
}

// Runs one prompt; lets Claude open the posting with the web fetch tool.
// Returns the text of Claude's final answer.
export async function runPrompt({ apiKey, model, prompt, allowFetch = true }) {
  const messages = [{ role: "user", content: prompt }];
  const tools = allowFetch ? [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 3 }] : undefined;

  // Server tools can pause long turns; continue up to a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    const data = await post(apiKey, { model, max_tokens: 4000, messages, ...(tools ? { tools } : {}) });
    if (data.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (!text.trim()) throw new Error("Claude returned no text.");
    return text;
  }
  throw new Error("Claude didn't finish — try again.");
}

// Pulls the first JSON object or array out of a reply that may include prose or fences.
export function parseJsonReply(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const starts = [cleaned.indexOf("["), cleaned.indexOf("{")].filter((i) => i >= 0);
  if (!starts.length) throw new Error("No JSON in Claude's reply.");
  const start = Math.min(...starts);
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(close);
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : [parsed];
}
