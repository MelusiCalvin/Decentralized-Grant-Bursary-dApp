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
    const message = typeof payload === "object" ? payload.error || JSON.stringify(payload) : payload;
    throw new Error(message || "Request failed.");
  }

  return payload;
}

export const api = {
  health: () => request("/health/"),

  listApplications: () => request("/applications/"),
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
