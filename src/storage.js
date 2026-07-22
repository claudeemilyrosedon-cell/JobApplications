const PROFILE_KEY = "role-scorecard-profile";
const CUSTOM_ROLES_KEY = "role-scorecard-custom-roles";
const STATUS_OVERRIDES_KEY = "role-scorecard-status-overrides";

const EMPTY_PROFILE = { context: "", resumes: [] };

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw);
    return { context: parsed.context || "", resumes: Array.isArray(parsed.resumes) ? parsed.resumes : [] };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error("Failed to save profile", err);
  }
}

export function loadCustomRoles() {
  try {
    const raw = localStorage.getItem(CUSTOM_ROLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomRoles(roles) {
  try {
    localStorage.setItem(CUSTOM_ROLES_KEY, JSON.stringify(roles));
  } catch (err) {
    console.error("Failed to save custom roles", err);
  }
}

export function loadStatusOverrides() {
  try {
    const raw = localStorage.getItem(STATUS_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStatusOverrides(overrides) {
  try {
    localStorage.setItem(STATUS_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.error("Failed to save status overrides", err);
  }
}
