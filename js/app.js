import { walletManager } from "./walletManager.js";
import { api } from "./api.js";
import { APP_CONFIG } from "./config.js";
import { claimGrantFromContract, fundGrantContract, textToHex } from "./lucidService.js";

const ROUTE_META = {
  dashboard: {
    viewId: "view-dashboard",
    title: "Grant Dashboard",
    subtitle: "Manage and distribute grants to beneficiaries",
  },
  grants: {
    viewId: "view-grants",
    title: "Grant Programs",
    subtitle: "Browse and manage all grant programs",
  },
  applications: {
    viewId: "view-applications",
    title: "Applications",
    subtitle: "Review and manage grant applications",
  },
  "create-grant": {
    viewId: "view-create-grant",
    title: "Create New Grant",
    subtitle: "Set up a new grant program for beneficiaries",
  },
  "application-detail": {
    viewId: "view-application-detail",
    title: "Application Details",
    subtitle: "Review application, approve, fund, and track timeline",
  },
};

const state = {
  grants: [],
  applications: [],
  auditEvents: [],
  milestones: [],
  activeRoute: "dashboard",
  activeApplicationId: null,
  grantFilters: {
    search: "",
    status: "all",
    category: "all",
  },
  applicationFilters: {
    search: "",
    status: "all",
    grant: "all",
  },
};

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shortWallet(address) {
  if (!address) return "-";
  return `${address.slice(0, 12)}...${address.slice(-7)}`;
}

function toIsoUtc(localDateTimeValue) {
  const parsed = new Date(localDateTimeValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date/time value.");
  }
  return parsed.toISOString();
}

function dateInputToIso(dateString) {
  if (!dateString) return null;
  const parsed = new Date(`${dateString}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toLovelace(adaValue) {
  const numeric = Number(adaValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 1_000_000);
}

function lovelaceToAdaNumber(lovelace) {
  const numeric = Number(lovelace || 0);
  return Number.isFinite(numeric) ? numeric / 1_000_000 : 0;
}

function formatAdaFromLovelace(lovelace) {
  return `₳${lovelaceToAdaNumber(lovelace).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(isoDate) {
  if (!isoDate) return "-";
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function statusBadgeClass(status) {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-800";
    case "rejected":
      return "bg-rose-100 text-rose-800";
    case "funded":
      return "bg-indigo-100 text-indigo-800";
    case "claimed":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function createDefaultMilestones() {
  return [
    { title: "Milestone 1", description: "Kickoff complete", percentage: 25 },
    { title: "Milestone 2", description: "Midpoint deliverable", percentage: 25 },
    { title: "Milestone 3", description: "Progress review", percentage: 25 },
    { title: "Milestone 4", description: "Final submission", percentage: 25 },
  ];
}

function setBanner(message, type = "info") {
  const banner = byId("statusBanner");
  const classMap = {
    info: "border-slate-300 bg-white text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
  };
  banner.className = `mb-6 rounded-2xl border px-4 py-3 text-sm shadow-card ${classMap[type] || classMap.info}`;
  banner.textContent = message;
}

function parseRouteFromHash() {
  const cleaned = (window.location.hash || "#/dashboard").replace(/^#\//, "");
  const segments = cleaned.split("/").filter(Boolean);
  if (segments[0] === "application" && segments[1]) {
    return { route: "application-detail", applicationId: segments[1] };
  }
  const route = segments[0] || "dashboard";
  if (!ROUTE_META[route]) return { route: "dashboard", applicationId: null };
  return { route, applicationId: null };
}

function navigateTo(route, param = "") {
  if (route === "application-detail" && param) {
    window.location.hash = `#/application/${encodeURIComponent(param)}`;
    return;
  }
  window.location.hash = `#/${route}`;
}

function setActiveView(route) {
  state.activeRoute = route;
  const meta = ROUTE_META[route];
  Object.values(ROUTE_META).forEach((entry) => byId(entry.viewId).classList.remove("active"));
  byId(meta.viewId).classList.add("active");
  byId("pageTitle").textContent = meta.title;
  byId("pageSubtitle").textContent = meta.subtitle;
  document.querySelectorAll(".nav-link").forEach((button) => {
    const isActive = button.dataset.route === route || (route === "application-detail" && button.dataset.route === "applications");
    button.classList.toggle("active", isActive);
  });
  byId("headerCreateGrantBtn").classList.toggle("hidden", route === "create-grant");
}

function walletAddressOrError() {
  const wallet = walletManager.getAddress();
  if (!wallet) throw new Error("Connect Lace wallet first.");
  return wallet;
}

function walletApiOrError() {
  const walletApi = walletManager.getApi();
  if (!walletApi) throw new Error("Connect Lace wallet first.");
  return walletApi;
}

function computeStats() {
  const totalPool = state.grants.reduce((sum, grant) => sum + Number(grant.total_funding_lovelace || 0), 0);
  const distributed = state.grants.reduce((sum, grant) => {
    const fallback = grant.paid ? Number(grant.amount_lovelace || 0) : 0;
    return sum + Number(grant.distributed_lovelace || fallback);
  }, 0);
  const activeGrants = state.grants.filter((grant) => grant.status !== "claimed").length;
  const beneficiaries = new Set(state.grants.map((grant) => grant.beneficiary_wallet).filter(Boolean)).size;
  const appCounts = {
    total: state.applications.length,
    pending: state.applications.filter((item) => item.status === "pending").length,
    approved: state.applications.filter((item) => item.status === "approved").length,
    rejected: state.applications.filter((item) => item.status === "rejected").length,
  };
  return { totalPool, distributed, activeGrants, beneficiaries, appCounts };
}

function getFilteredGrants() {
  const { search, status, category } = state.grantFilters;
  return state.grants.filter((grant) => {
    const title = String(grant.title || "");
    const description = String(grant.description || "");
    const categoryValue = String(grant.category || "General");
    const searchHaystack = `${grant.id} ${title} ${description}`.toLowerCase();
    const matchesSearch = !search || searchHaystack.includes(search.toLowerCase());
    const matchesStatus = status === "all" || grant.status === status;
    const matchesCategory = category === "all" || categoryValue.toLowerCase() === category.toLowerCase();
    return matchesSearch && matchesStatus && matchesCategory;
  });
}

function getFilteredApplications() {
  const { search, status, grant } = state.applicationFilters;
  return state.applications.filter((application) => {
    const searchHaystack = `${application.full_name} ${application.email} ${application.wallet_address} ${application.organization || ""}`.toLowerCase();
    const matchesSearch = !search || searchHaystack.includes(search.toLowerCase());
    const matchesStatus = status === "all" || application.status === status;
    const matchesGrant = grant === "all" || String(application.grant) === grant;
    return matchesSearch && matchesStatus && matchesGrant;
  });
}

function populateGrantCategoryFilter() {
  const select = byId("grantsCategoryFilter");
  const existingValue = select.value || "all";
  const categories = Array.from(new Set(state.grants.map((grant) => String(grant.category || "General")).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="all">All Categories</option>${categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;
  select.value = categories.includes(existingValue) ? existingValue : "all";
}

function populateApplicationGrantFilter() {
  const select = byId("appsGrantFilter");
  const current = select.value || "all";
  select.innerHTML = `<option value="all">All Grants</option>${state.grants
    .map((grant) => `<option value="${grant.id}">${escapeHtml(grant.title || grant.id.slice(0, 8))}</option>`)
    .join("")}`;
  select.value = state.grants.some((grant) => grant.id === current) ? current : "all";
}

function populateApplicationDetailGrantSelect(preferredGrantId = "") {
  const select = byId("appDetailGrantSelect");
  select.innerHTML =
    state.grants.length > 0
      ? state.grants
          .map((grant) => `<option value="${grant.id}">${escapeHtml(grant.title || grant.id.slice(0, 8))}</option>`)
          .join("")
      : `<option value="">No grants yet - create one first</option>`;
  if (preferredGrantId && state.grants.some((grant) => grant.id === preferredGrantId)) {
    select.value = preferredGrantId;
  }
  byId("appDetailClaimGrantId").value = select.value || "";
}

function renderWallet(stateData) {
  const text = stateData.connected ? `Connected: ${stateData.shortAddress} (${stateData.walletName})` : "Wallet disconnected";
  byId("walletIndicator").textContent = text;
  byId("createWalletState").textContent = text;
  byId("appDetailWallet").textContent = text;
  byId("connectWalletBtn").disabled = stateData.connected;
  byId("disconnectWalletBtn").disabled = !stateData.connected;
}

function renderDashboard() {
  const stats = computeStats();
  byId("metricTotalPool").textContent = formatAdaFromLovelace(stats.totalPool);
  byId("metricDistributed").textContent = formatAdaFromLovelace(stats.distributed);
  byId("metricActiveGrants").textContent = String(stats.activeGrants);
  byId("metricBeneficiaries").textContent = String(stats.beneficiaries);

  const appCountByGrant = new Map();
  state.applications.forEach((application) => {
    if (application.grant) appCountByGrant.set(application.grant, (appCountByGrant.get(application.grant) || 0) + 1);
  });

  const grants = state.grants
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  byId("dashboardActiveGrants").innerHTML =
    grants.length === 0
      ? `<p class="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">No grants yet. Click "Create Grant" to start.</p>`
      : grants
          .map((grant) => {
            const total = Number(grant.total_funding_lovelace || 0);
            const distributed = Number(grant.distributed_lovelace || (grant.paid ? grant.amount_lovelace : 0) || 0);
            const progress = total > 0 ? Math.min(100, Math.round((distributed / total) * 100)) : 0;
            return `
              <article class="rounded-2xl border border-stroke bg-slate-50 p-4">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="flex flex-wrap gap-2 text-xs">
                      <span class="rounded-full bg-indigo-100 px-2 py-1 font-semibold text-indigo-700">${escapeHtml(grant.category || "general")}</span>
                      <span class="rounded-full px-2 py-1 font-semibold ${statusBadgeClass(grant.status)}">${escapeHtml(grant.status)}</span>
                    </div>
                    <h3 class="mt-2 text-xl font-bold text-slate-900">${escapeHtml(grant.title || "Untitled Grant")}</h3>
                    <p class="mt-1 text-sm text-slate-600">${escapeHtml(grant.description || "No description provided.")}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-title text-3xl font-bold text-slate-900">${formatAdaFromLovelace(total)}</p>
                    <p class="text-xs text-slate-500">Total Funding</p>
                  </div>
                </div>
                <div class="mt-3">
                  <div class="mb-1 flex justify-between text-xs text-slate-600">
                    <span>Distributed</span>
                    <span>${progress}%</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-200"><div class="h-2 rounded-full bg-indigo-600" style="width:${progress}%"></div></div>
                </div>
                <div class="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>${appCountByGrant.get(grant.id) || 0} applicants</span>
                  <span>${grant.application_deadline ? `Deadline ${formatDate(grant.application_deadline)}` : "No deadline"}</span>
                </div>
                <button data-route-jump="grants" class="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                  View Details →
                </button>
              </article>
            `;
          })
          .join("");

  const recentApps = state.applications
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);

  byId("dashboardRecentApplications").innerHTML =
    recentApps.length === 0
      ? `<p class="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">No applications submitted yet.</p>`
      : recentApps
          .map((application) => {
            const initials = escapeHtml(application.full_name?.trim()?.charAt(0)?.toUpperCase() || "?");
            return `
              <article class="rounded-2xl border border-stroke p-3">
                <div class="flex items-start gap-3">
                  <div class="grid h-9 w-9 place-content-center rounded-full bg-violetSoft font-bold text-indigo-700">${initials}</div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <p class="font-semibold text-slate-900">${escapeHtml(application.full_name)}</p>
                        <p class="text-xs text-slate-500">${escapeHtml(application.email)}</p>
                      </div>
                      <span class="rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(application.status)}">${escapeHtml(application.status)}</span>
                    </div>
                    <p class="mt-1 line-clamp-2 text-xs text-slate-600">${escapeHtml(application.purpose || "")}</p>
                    <button data-open-application="${application.id}" class="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800">View Details</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("");
}

function renderGrants() {
  populateGrantCategoryFilter();
  const filtered = getFilteredGrants();
  byId("grantsCountLabel").textContent = `Showing ${filtered.length} grants`;
  const appCountByGrant = new Map();
  state.applications.forEach((application) => {
    if (application.grant) appCountByGrant.set(application.grant, (appCountByGrant.get(application.grant) || 0) + 1);
  });

  byId("grantsGrid").innerHTML =
    filtered.length === 0
      ? `<article class="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 md:col-span-2">No grants match your filters.</article>`
      : filtered
          .map((grant) => {
            const total = Number(grant.total_funding_lovelace || 0);
            const distributed = Number(grant.distributed_lovelace || (grant.paid ? grant.amount_lovelace : 0) || 0);
            const progress = total > 0 ? Math.min(100, Math.round((distributed / total) * 100)) : 0;
            return `
              <article class="rounded-2xl border border-stroke bg-panel p-5 shadow-card">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 text-xs">
                      <span class="rounded-full bg-indigo-100 px-2 py-1 font-semibold text-indigo-700">${escapeHtml(grant.category || "general")}</span>
                      <span class="rounded-full px-2 py-1 font-semibold ${statusBadgeClass(grant.status)}">${escapeHtml(grant.status)}</span>
                    </div>
                    <h3 class="mt-2 font-title text-3xl font-bold text-slate-900">${escapeHtml(grant.title || "Untitled Grant")}</h3>
                  </div>
                  <div class="text-right">
                    <p class="font-title text-4xl font-bold">${formatAdaFromLovelace(total)}</p>
                    <p class="text-xs text-slate-500">Total Funding</p>
                  </div>
                </div>
                <p class="mt-3 line-clamp-3 text-sm text-slate-600">${escapeHtml(grant.description || "No description provided.")}</p>
                <div class="mt-4">
                  <div class="mb-1 flex justify-between text-xs text-slate-600"><span>Distributed</span><span>${progress}%</span></div>
                  <div class="h-2 rounded-full bg-slate-200"><div class="h-2 rounded-full bg-indigo-600" style="width:${progress}%"></div></div>
                </div>
                <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>${appCountByGrant.get(grant.id) || 0} applicants</span>
                  <span>${grant.application_deadline ? `Deadline ${formatDate(grant.application_deadline)}` : "No deadline"}</span>
                  <span>Max ${formatAdaFromLovelace(grant.max_per_beneficiary_lovelace || grant.amount_lovelace)}</span>
                </div>
                <div class="mt-4 grid grid-cols-2 gap-2">
                  <button data-filter-apps-grant="${grant.id}" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                    View Applicants
                  </button>
                  <button data-open-create-with-grant="${grant.id}" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
                    Manage
                  </button>
                </div>
              </article>
            `;
          })
          .join("");
}

function renderMilestonesEditor() {
  const container = byId("milestonesContainer");
  if (!state.milestones.length) state.milestones = createDefaultMilestones();

  container.innerHTML = state.milestones
    .map(
      (milestone, index) => `
      <div class="grid gap-2 rounded-xl border border-stroke bg-slate-50 p-3 md:grid-cols-[auto_1fr_1.5fr_auto_auto]">
        <div class="grid h-10 w-10 place-content-center rounded-lg bg-slate-200 text-sm font-bold text-slate-600">${index + 1}</div>
        <input data-ms-field="title" data-ms-index="${index}" class="rounded-lg border border-stroke px-3 py-2 text-sm outline-none focus:border-indigo-400" value="${escapeHtml(milestone.title)}" />
        <input data-ms-field="description" data-ms-index="${index}" class="rounded-lg border border-stroke px-3 py-2 text-sm outline-none focus:border-indigo-400" value="${escapeHtml(milestone.description)}" />
        <div class="flex items-center gap-1">
          <input data-ms-field="percentage" data-ms-index="${index}" type="number" min="0" max="100" class="w-20 rounded-lg border border-stroke px-2 py-2 text-sm outline-none focus:border-indigo-400" value="${Number(milestone.percentage) || 0}" />
          <span class="text-sm text-slate-600">%</span>
        </div>
        <button data-ms-remove="${index}" type="button" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">Delete</button>
      </div>`,
    )
    .join("");

  const total = state.milestones.reduce((sum, item) => sum + Number(item.percentage || 0), 0);
  byId("milestoneTotalLabel").textContent = `Total: ${total}%`;
  byId("milestoneTotalLabel").className = total === 100 ? "mb-3 text-sm font-medium text-emerald-600" : "mb-3 text-sm font-medium text-rose-600";
}

function renderApplications() {
  const stats = computeStats().appCounts;
  byId("appTotalCount").textContent = String(stats.total);
  byId("appPendingCount").textContent = String(stats.pending);
  byId("appApprovedCount").textContent = String(stats.approved);
  byId("appRejectedCount").textContent = String(stats.rejected);

  populateApplicationGrantFilter();
  const filtered = getFilteredApplications();
  byId("appsCountLabel").textContent = `Showing ${filtered.length} applications`;

  byId("applicationsList").innerHTML =
    filtered.length === 0
      ? `<article class="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No applications match your filters.</article>`
      : filtered
          .map((application) => {
            const initials = escapeHtml(application.full_name?.trim()?.charAt(0)?.toUpperCase() || "?");
            const requested = Number(application.requested_amount_lovelace || 0);
            const released = Number(application.released_amount_lovelace || 0);
            return `
              <article class="rounded-2xl border border-stroke bg-panel p-5 shadow-card">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="flex items-start gap-3">
                    <div class="grid h-11 w-11 place-content-center rounded-full bg-violetSoft text-lg font-bold text-indigo-700">${initials}</div>
                    <div>
                      <h3 class="text-2xl font-bold text-slate-900">${escapeHtml(application.full_name)}</h3>
                      <p class="text-sm text-slate-600">${escapeHtml(application.email)}</p>
                      <div class="mt-1 flex flex-wrap gap-3 text-sm text-slate-600">
                        <span>${escapeHtml(application.organization || "Independent Applicant")}</span>
                        <span>${shortWallet(application.wallet_address)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(application.status)}">${escapeHtml(application.status)}</span>
                    <p class="mt-2 font-title text-4xl font-bold text-slate-900">${formatAdaFromLovelace(requested)}</p>
                    <p class="text-xs text-slate-500">Requested</p>
                    ${released > 0 ? `<p class="mt-1 text-xs font-semibold text-emerald-700">${formatAdaFromLovelace(released)} released</p>` : ""}
                  </div>
                </div>
                <p class="mt-3 text-slate-700">${escapeHtml(application.purpose || "")}</p>
                <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                  <p class="text-sm text-slate-500">Applied ${formatDate(application.created_at)}</p>
                  <div class="flex gap-2">
                    <button data-quick-review="${application.id}" data-review-status="approved" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700">Quick Approve</button>
                    <button data-quick-review="${application.id}" data-review-status="rejected" class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700">Quick Reject</button>
                    <button data-open-application="${application.id}" class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">View Details</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("");
}

function buildTimelineItems(application) {
  const entries = [{ time: application.created_at, text: "Application submitted" }];
  const reviewEvents = state.auditEvents.filter(
    (event) => event.action === "APPLICATION_REVIEWED" && event.details?.application_id === application.id,
  );
  reviewEvents.forEach((event) => entries.push({ time: event.created_at, text: `Application ${event.details?.status || "reviewed"}` }));
  if (application.grant) {
    const grantEvents = state.auditEvents.filter((event) => event.grant_id === application.grant);
    grantEvents.forEach((event) => entries.push({ time: event.created_at, text: event.action.replaceAll("_", " ").toLowerCase() }));
  }
  return entries.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function renderApplicationDetail() {
  const application = state.applications.find((item) => item.id === state.activeApplicationId);
  if (!application) {
    byId("appDetailTitle").textContent = "Application not found";
    byId("appDetailSub").textContent = "Go back and choose another application.";
    byId("appDetailInfoCards").innerHTML = "";
    byId("appDetailProposal").textContent = "";
    byId("appDetailRequested").textContent = "₳0";
    byId("appDetailTimeline").innerHTML = "";
    populateApplicationDetailGrantSelect("");
    return;
  }

  const requestedLovelace = Number(application.requested_amount_lovelace || 0);
  byId("appDetailStatusBadge").className = `inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(application.status)}`;
  byId("appDetailStatusBadge").textContent = application.status;
  byId("appDetailTitle").textContent = application.full_name;
  byId("appDetailSub").textContent = "Application for Grant";
  byId("appDetailProposal").textContent = application.purpose || "-";
  byId("appDetailRequested").textContent = formatAdaFromLovelace(requestedLovelace);

  byId("appDetailInfoCards").innerHTML = `
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</p><p class="font-semibold text-slate-900">${escapeHtml(application.full_name)}</p></article>
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p><p class="font-semibold text-slate-900">${escapeHtml(application.email)}</p></article>
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</p><p class="font-semibold text-slate-900">${escapeHtml(application.organization || "Independent Applicant")}</p></article>
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Wallet Address</p><p class="font-semibold text-slate-900">${escapeHtml(shortWallet(application.wallet_address))}</p></article>
  `;

  populateApplicationDetailGrantSelect(application.grant || "");
  byId("appDetailApproveAmountAda").value = lovelaceToAdaNumber(requestedLovelace || 0) || 0;
  byId("appDetailUnlockInput").value = "";

  const timeline = buildTimelineItems(application);
  byId("appDetailTimeline").innerHTML = timeline
    .map(
      (entry) => `
        <div class="flex gap-2">
          <span class="mt-1 h-2 w-2 rounded-full bg-indigo-500"></span>
          <div><p class="font-medium text-slate-800">${escapeHtml(entry.text)}</p><p class="text-xs text-slate-500">${formatDate(entry.time)}</p></div>
        </div>`,
    )
    .join("");
}

function renderAll() {
  renderDashboard();
  renderGrants();
  renderMilestonesEditor();
  renderApplications();
  if (state.activeRoute === "application-detail") renderApplicationDetail();
}

async function refreshData() {
  const [applications, grants, auditEvents] = await Promise.all([
    api.listApplications(),
    api.listGrants(),
    api.listAuditEvents(),
  ]);
  state.applications = applications;
  state.grants = grants;
  state.auditEvents = auditEvents;
  renderAll();
}

async function connectWallet() {
  await walletManager.connectWallet(APP_CONFIG.WALLET_NAME, APP_CONFIG.NETWORK.toLowerCase());
}

function setupNavigation() {
  document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.route)));
  byId("headerCreateGrantBtn").addEventListener("click", () => navigateTo("create-grant"));
  byId("createGrantCancelBtn").addEventListener("click", () => navigateTo("grants"));
  byId("appDetailBackBtn").addEventListener("click", () => navigateTo("applications"));

  document.body.addEventListener("click", (event) => {
    const routeJump = event.target.closest("[data-route-jump]");
    if (routeJump) {
      navigateTo(routeJump.dataset.routeJump);
      return;
    }
    const openApplication = event.target.closest("[data-open-application]");
    if (openApplication) {
      navigateTo("application-detail", openApplication.dataset.openApplication);
      return;
    }
    const filterGrant = event.target.closest("[data-filter-apps-grant]");
    if (filterGrant) {
      state.applicationFilters.grant = filterGrant.dataset.filterAppsGrant;
      byId("appsGrantFilter").value = state.applicationFilters.grant;
      navigateTo("applications");
      renderApplications();
      return;
    }
    const openCreate = event.target.closest("[data-open-create-with-grant]");
    if (openCreate) {
      navigateTo("create-grant");
      setBanner(`Managing grant ${openCreate.dataset.openCreateWithGrant}. Update values and submit.`, "info");
    }
  });

  function applyRouteFromHash() {
    const parsed = parseRouteFromHash();
    state.activeApplicationId = parsed.applicationId;
    setActiveView(parsed.route);
    if (parsed.route === "application-detail") renderApplicationDetail();
  }

  window.addEventListener("hashchange", applyRouteFromHash);
  applyRouteFromHash();
}

function setupWalletHandlers() {
  walletManager.onChange(renderWallet);
  byId("connectWalletBtn").addEventListener("click", async () => {
    try {
      await connectWallet();
      setBanner("Wallet connected successfully.", "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });
  byId("inlineConnectWalletBtn").addEventListener("click", async () => {
    try {
      await connectWallet();
      setBanner("Wallet connected successfully.", "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });
  byId("appDetailConnectWalletBtn").addEventListener("click", async () => {
    try {
      await connectWallet();
      setBanner("Wallet connected successfully.", "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });
  byId("disconnectWalletBtn").addEventListener("click", () => {
    walletManager.disconnectWallet();
    setBanner("Wallet disconnected.", "info");
  });
}

function setupFilterHandlers() {
  byId("grantsSearchInput").addEventListener("input", (event) => {
    state.grantFilters.search = event.target.value.trim();
    renderGrants();
  });
  byId("grantsStatusFilter").addEventListener("change", (event) => {
    state.grantFilters.status = event.target.value;
    renderGrants();
  });
  byId("grantsCategoryFilter").addEventListener("change", (event) => {
    state.grantFilters.category = event.target.value;
    renderGrants();
  });
  byId("appsSearchInput").addEventListener("input", (event) => {
    state.applicationFilters.search = event.target.value.trim();
    renderApplications();
  });
  byId("appsStatusFilter").addEventListener("change", (event) => {
    state.applicationFilters.status = event.target.value;
    renderApplications();
  });
  byId("appsGrantFilter").addEventListener("change", (event) => {
    state.applicationFilters.grant = event.target.value;
    renderApplications();
  });
}

function setupMilestoneHandlers() {
  byId("addMilestoneBtn").addEventListener("click", () => {
    state.milestones.push({
      title: `Milestone ${state.milestones.length + 1}`,
      description: "Describe milestone requirement",
      percentage: 0,
    });
    renderMilestonesEditor();
  });

  byId("milestonesContainer").addEventListener("input", (event) => {
    const index = Number(event.target.dataset.msIndex);
    const field = event.target.dataset.msField;
    if (Number.isNaN(index) || !field || !state.milestones[index]) return;
    state.milestones[index][field] = field === "percentage" ? Number(event.target.value) || 0 : event.target.value;
    renderMilestonesEditor();
  });

  byId("milestonesContainer").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-ms-remove]");
    if (!removeButton) return;
    const index = Number(removeButton.dataset.msRemove);
    if (Number.isNaN(index)) return;
    state.milestones.splice(index, 1);
    if (!state.milestones.length) state.milestones = createDefaultMilestones();
    renderMilestonesEditor();
  });
}

async function handleCreateGrant(event) {
  event.preventDefault();
  try {
    const adminWallet = walletAddressOrError();
    const milestoneTotal = state.milestones.reduce((sum, item) => sum + Number(item.percentage || 0), 0);
    if (milestoneTotal !== 100) throw new Error("Milestone percentages must total 100%.");
    const totalFundingLovelace = toLovelace(byId("totalFundingAdaInput").value);
    const maxBeneficiaryLovelace = toLovelace(byId("maxBeneficiaryAdaInput").value);
    if (!totalFundingLovelace || !maxBeneficiaryLovelace) throw new Error("Funding values must be greater than zero.");

    const payload = {
      admin_wallet: adminWallet,
      title: byId("grantTitleInput").value.trim(),
      description: byId("grantDescriptionInput").value.trim(),
      category: byId("grantCategoryInput").value.trim(),
      application_deadline: dateInputToIso(byId("grantDeadlineInput").value),
      total_funding_lovelace: totalFundingLovelace,
      max_per_beneficiary_lovelace: maxBeneficiaryLovelace,
      amount_lovelace: maxBeneficiaryLovelace,
      unlock_time: toIsoUtc(byId("grantUnlockInput").value),
      beneficiary_wallet: byId("grantBeneficiaryInput").value.trim(),
      milestones: state.milestones,
      notes: JSON.stringify({ milestoneCount: state.milestones.length }),
    };

    await api.createGrant(payload);
    byId("createGrantForm").reset();
    state.milestones = createDefaultMilestones();
    renderMilestonesEditor();
    await refreshData();
    setBanner("Grant created successfully.", "success");
    navigateTo("grants");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function quickReviewApplication(applicationId, nextStatus) {
  try {
    const adminWallet = walletAddressOrError();
    await api.reviewApplication(applicationId, { status: nextStatus, admin_wallet: adminWallet });
    await refreshData();
    setBanner(`Application ${nextStatus}.`, "success");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

function getSelectedGrantFromDetail() {
  const grantId = byId("appDetailGrantSelect").value;
  const grant = state.grants.find((item) => item.id === grantId);
  if (!grant) throw new Error("Select a valid grant first.");
  return grant;
}

function getActiveApplicationOrError() {
  const application = state.applications.find((item) => item.id === state.activeApplicationId);
  if (!application) throw new Error("Application not found.");
  return application;
}

async function handleDetailApprove() {
  try {
    const adminWallet = walletAddressOrError();
    const application = getActiveApplicationOrError();
    const grant = getSelectedGrantFromDetail();
    const amountLovelace = toLovelace(byId("appDetailApproveAmountAda").value);
    if (!amountLovelace) throw new Error("Set approval amount greater than zero.");
    const unlockRaw = byId("appDetailUnlockInput").value;
    const unlockIso = unlockRaw ? toIsoUtc(unlockRaw) : grant.unlock_time || new Date(Date.now() + 3600 * 1000).toISOString();

    const approvalPayload = JSON.stringify({
      grantId: grant.id,
      applicationId: application.id,
      beneficiary: application.wallet_address,
      amountLovelace,
      unlockIso,
      approvedAt: new Date().toISOString(),
    });
    const signature = await walletManager.signData(textToHex(approvalPayload));
    const approvalTxHash = btoa(JSON.stringify(signature)).slice(0, 120);

    await api.approveGrant(grant.id, {
      admin_wallet: adminWallet,
      beneficiary_wallet: application.wallet_address,
      amount_lovelace: amountLovelace,
      unlock_time: unlockIso,
      milestone_approved: true,
      approval_tx_hash: approvalTxHash,
    });
    await api.reviewApplication(application.id, {
      status: "approved",
      grant_id: grant.id,
      admin_wallet: adminWallet,
    });
    await refreshData();
    setBanner("Application approved and grant updated.", "success");
    renderApplicationDetail();
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function handleDetailReject() {
  try {
    const adminWallet = walletAddressOrError();
    const application = getActiveApplicationOrError();
    await api.reviewApplication(application.id, {
      status: "rejected",
      admin_wallet: adminWallet,
    });
    await refreshData();
    setBanner("Application rejected.", "success");
    renderApplicationDetail();
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function handleDetailFund() {
  try {
    const adminWallet = walletAddressOrError();
    const walletApi = walletApiOrError();
    const application = getActiveApplicationOrError();
    const grant = getSelectedGrantFromDetail();
    const amountLovelace =
      Number(grant.amount_lovelace || 0) ||
      toLovelace(byId("appDetailApproveAmountAda").value) ||
      Number(application.requested_amount_lovelace || 0);
    if (!amountLovelace) throw new Error("No amount available for funding.");
    const unlockRaw = byId("appDetailUnlockInput").value;
    const unlockIso = unlockRaw ? toIsoUtc(unlockRaw) : grant.unlock_time || new Date(Date.now() + 3600 * 1000).toISOString();

    const txHash = await fundGrantContract(walletApi, {
      adminAddress: adminWallet,
      beneficiaryAddress: application.wallet_address,
      amountLovelace,
      unlockTimeIso: unlockIso,
    });
    await api.recordFunding(grant.id, {
      admin_wallet: adminWallet,
      funded_tx_hash: txHash,
    });
    await refreshData();
    setBanner(`Funding transaction submitted: ${txHash}`, "success");
    renderApplicationDetail();
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function handleDetailClaim() {
  try {
    const walletApi = walletApiOrError();
    const beneficiaryWallet = walletAddressOrError();
    const grantId = byId("appDetailClaimGrantId").value;
    if (!grantId) throw new Error("No grant selected to claim.");
    const grant = state.grants.find((item) => item.id === grantId);
    if (!grant) throw new Error("Selected grant not found.");

    const claimability = await api.checkClaimable(grantId, beneficiaryWallet);
    if (!claimability.claimable) throw new Error(`Claim blocked: ${JSON.stringify(claimability.checks)}`);

    const txHash = await claimGrantFromContract(walletApi, {
      beneficiaryAddress: beneficiaryWallet,
      amountLovelace: Number(grant.amount_lovelace || 0),
    });
    await api.recordClaim(grantId, {
      wallet_address: beneficiaryWallet,
      claim_tx_hash: txHash,
    });
    await refreshData();
    setBanner(`Claim completed: ${txHash}`, "success");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

function setupApplicationActions() {
  byId("applicationsList").addEventListener("click", async (event) => {
    const quick = event.target.closest("[data-quick-review]");
    if (quick) await quickReviewApplication(quick.dataset.quickReview, quick.dataset.reviewStatus);
  });
  byId("appDetailGrantSelect").addEventListener("change", (event) => {
    byId("appDetailClaimGrantId").value = event.target.value || "";
  });
  byId("appDetailApproveBtn").addEventListener("click", handleDetailApprove);
  byId("appDetailRejectBtn").addEventListener("click", handleDetailReject);
  byId("appDetailFundBtn").addEventListener("click", handleDetailFund);
  byId("appDetailClaimBtn").addEventListener("click", handleDetailClaim);
}

function setupForms() {
  byId("createGrantForm").addEventListener("submit", handleCreateGrant);
}

async function init() {
  setBanner("Initializing GrantFlow...");
  state.milestones = createDefaultMilestones();
  renderMilestonesEditor();
  renderWallet(walletManager.getState());

  setupNavigation();
  setupWalletHandlers();
  setupFilterHandlers();
  setupMilestoneHandlers();
  setupForms();
  setupApplicationActions();

  try {
    await walletManager.restoreConnection();
    renderWallet(walletManager.getState());
    await api.health();
    await refreshData();
    setBanner("System ready. Use sidebar navigation to manage grants and applications.", "success");
  } catch (error) {
    renderWallet(walletManager.getState());
    setBanner(`Initialization warning: ${error.message}`, "error");
  }
}

init();
