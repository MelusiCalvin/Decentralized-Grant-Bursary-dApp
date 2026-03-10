import { APP_CONFIG } from "./config.js";

async function request(path, options = {}) {
  const response = await fetch(`${APP_CONFIG.API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = formatApiError(payload);
    const message = `HTTP ${response.status} on ${path}: ${detail || "Request failed."}`;
    throw new Error(message);
  }

  return payload;
}

function formatApiError(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (payload.error) return payload.error;
  if (typeof payload !== "object") return String(payload);

  const pairs = Object.entries(payload)
    .map(([field, value]) => {
      if (Array.isArray(value)) return `${field}: ${value.join(", ")}`;
      if (value && typeof value === "object") return `${field}: ${JSON.stringify(value)}`;
      return `${field}: ${value}`;
    })
    .filter(Boolean);
  return pairs.join(" | ");
}

export const api = {
  health: () => request("/health/"),

  listApplications: (params = {}) => {
    const query = new URLSearchParams();
    if (params.applicant_wallet) query.set("applicant_wallet", params.applicant_wallet);
    if (params.funder_wallet) query.set("funder_wallet", params.funder_wallet);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/applications/${suffix}`);
  },
  submitApplication: (data) =>
    request("/applications/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  reviewApplication: (applicationId, data) =>
    request(`/applications/${applicationId}/review/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listGrants: () => request("/grants/"),
  createGrant: (data) =>
    request("/grants/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteGrant: (grantId, data) =>
    request(`/grants/${grantId}/delete/`, {
      method: "DELETE",
      body: JSON.stringify(data),
    }),
  approveGrant: (grantId, data) =>
    request(`/grants/${grantId}/approve/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  recordFunding: (grantId, data) =>
    request(`/grants/${grantId}/record-funding/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  checkClaimable: (grantId, walletAddress) =>
    request(`/grants/${grantId}/claimable/?wallet=${encodeURIComponent(walletAddress)}`),
  recordClaim: (grantId, data) =>
    request(`/grants/${grantId}/record-claim/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listAuditEvents: (grantId = "") =>
    request(`/audit-events/${grantId ? `?grant_id=${encodeURIComponent(grantId)}` : ""}`),
};
