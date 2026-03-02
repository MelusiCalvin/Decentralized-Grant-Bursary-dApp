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
  apply: {
    viewId: "view-apply",
    title: "Apply For Grant",
    subtitle: "Submit your application as a beneficiary",
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
  applyMilestoneGrantId: "",
  applyMilestoneDrafts: [],
  activeRoute: "dashboard",
  activeApplicationId: null,
  connectedWallet: "",
  viewerRole: "guest",
  firstActionType: "none",
  firstActionAt: null,
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

const CATEGORY_MILESTONE_TEMPLATES = {
  education: {
    hint: "Upload requirements: results, registration letter, and motivation should be PDF files. Set minimum average threshold (for example 60%+).",
    items: [
      { title: "Upload latest academic results", description: "Applicant uploads latest academic results (PDF only).", percentage: 25, input_type: "pdf" },
      { title: "Minimum average threshold", description: "Set required minimum average (for example 60%+). Applicant uploads latest statement/report (PDF only).", percentage: 25, input_type: "pdf" },
      { title: "Proof of registration letter", description: "Applicant uploads registration letter (PDF only).", percentage: 25, input_type: "pdf" },
      { title: "Short motivation (200 words)", description: "Applicant uploads motivation letter (PDF only).", percentage: 25, input_type: "pdf" },
      { title: "Community service proof (optional bonus)", description: "Optional bonus evidence upload (PDF recommended).", percentage: 0, input_type: "pdf" },
    ],
  },
  innovation: {
    hint: "Uploads should be PDF unless noted. MVP/prototype is a typed link. Suggested minimum score: 75/100.",
    items: [
      { title: "Problem statement", description: "Upload problem statement (PDF only).", percentage: 30, input_type: "pdf" },
      { title: "Solution explanation", description: "Upload solution explanation (PDF only).", percentage: 25, input_type: "pdf" },
      { title: "Impact on community", description: "Upload expected impact details (PDF only).", percentage: 25, input_type: "pdf" },
      { title: "Budget breakdown", description: "Upload detailed budget (PDF only).", percentage: 10, input_type: "pdf" },
      { title: "Prototype demo", description: "Provide MVP/prototype link (typed URL).", percentage: 10, input_type: "link" },
      { title: "Pitch video (optional bonus)", description: "Optional pitch video link.", percentage: 0, input_type: "link" },
    ],
  },
  health: {
    hint: "Health milestone evidence should be uploaded as verified PDF documents.",
    items: [
      { title: "Medical report (verified)", description: "Upload verified medical report (PDF only).", percentage: 40, input_type: "pdf" },
      { title: "Income proof", description: "Upload household income proof (PDF only).", percentage: 30, input_type: "pdf" },
      { title: "Doctor confirmation letter", description: "Upload doctor confirmation letter (PDF only).", percentage: 10, input_type: "pdf" },
      { title: "Cost estimate", description: "Upload treatment cost estimate (PDF only).", percentage: 10, input_type: "pdf" },
      { title: "Community endorsement", description: "Upload community endorsement (PDF only).", percentage: 10, input_type: "pdf" },
    ],
  },
  ngo: {
    hint: "NGO milestone evidence should be uploaded as PDF files. Registration legitimacy is required.",
    items: [
      { title: "NGO registration certificate", description: "Required: upload registration certificate (PDF only).", percentage: 0, input_type: "pdf" },
      { title: "Project proposal", description: "Upload project proposal including sustainability plan (PDF only).", percentage: 30, input_type: "pdf" },
      { title: "Financial statements", description: "Upload audited or recent financial statements (PDF only).", percentage: 30, input_type: "pdf" },
      { title: "Beneficiary numbers", description: "Upload beneficiary metrics and reach evidence (PDF only).", percentage: 20, input_type: "pdf" },
      { title: "Photos / past impact proof", description: "Upload evidence of previous impact (PDF only).", percentage: 20, input_type: "pdf" },
    ],
  },
  community_projects: {
    hint: "Community project evidence should be uploaded as PDF files for each milestone.",
    items: [
      { title: "Description of problem", description: "Upload project problem description (PDF only).", percentage: 20, input_type: "pdf" },
      { title: "Community signatures", description: "Upload signed community support proof (PDF only).", percentage: 20, input_type: "pdf" },
      { title: "Budget", description: "Upload project budget breakdown (PDF only).", percentage: 20, input_type: "pdf" },
      { title: "Timeline", description: "Upload project timeline and delivery plan (PDF only).", percentage: 20, input_type: "pdf" },
      { title: "Local leader endorsement", description: "Upload endorsement letter from local leader (PDF only).", percentage: 20, input_type: "pdf" },
    ],
  },
  default: {
    hint: "Define milestone placeholders for required uploads and scoring.",
    items: [
      { title: "Milestone 1", description: "Describe milestone requirement", percentage: 25, input_type: "pdf" },
      { title: "Milestone 2", description: "Describe milestone requirement", percentage: 25, input_type: "pdf" },
      { title: "Milestone 3", description: "Describe milestone requirement", percentage: 25, input_type: "pdf" },
      { title: "Milestone 4", description: "Describe milestone requirement", percentage: 25, input_type: "pdf" },
    ],
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

function walletEquals(left, right) {
  return String(left || "").trim() === String(right || "").trim();
}

function roleDescription(role) {
  if (role === "funder") return "Funder";
  if (role === "applicant") return "Applicant";
  if (role === "new") return "New Wallet";
  return "Guest";
}

function mergeUniqueById(listA = [], listB = []) {
  const map = new Map();
  [...listA, ...listB].forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values());
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

function normalizeCategoryKey(categoryValue) {
  const value = String(categoryValue || "").trim().toLowerCase();
  if (value === "community" || value === "community projects") return "community_projects";
  if (value === "education") return "education";
  if (value === "innovation") return "innovation";
  if (value === "health") return "health";
  if (value === "ngo") return "ngo";
  return "default";
}

function getMilestoneTemplate(categoryValue) {
  const key = normalizeCategoryKey(categoryValue);
  return CATEGORY_MILESTONE_TEMPLATES[key] || CATEGORY_MILESTONE_TEMPLATES.default;
}

function createDefaultMilestones(categoryValue = byId("grantCategoryInput")?.value || "Education") {
  return getMilestoneTemplate(categoryValue).items.map((item) => ({
    title: item.title,
    description: item.description,
    percentage: Number(item.percentage) || 0,
    input_type: item.input_type === "link" ? "link" : "pdf",
  }));
}

function inferMilestoneInputType(milestone) {
  const explicit = String(milestone?.input_type || "").trim().toLowerCase();
  if (explicit === "link") return "link";
  if (explicit === "pdf") return "pdf";
  const haystack = `${milestone?.title || ""} ${milestone?.description || ""}`.toLowerCase();
  return haystack.includes("link") || haystack.includes("url") ? "link" : "pdf";
}

function isOptionalMilestone(milestone) {
  const haystack = `${milestone?.title || ""} ${milestone?.description || ""}`.toLowerCase();
  return haystack.includes("optional") || haystack.includes("bonus");
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

function determineViewerRole(walletAddress) {
  if (!walletAddress) {
    return { role: "guest", firstActionType: "none", firstActionAt: null };
  }

  const firstGrantMs = state.grants
    .filter((grant) => walletEquals(grant.admin_wallet, walletAddress))
    .map((grant) => new Date(grant.created_at).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0];

  const firstApplicationMs = state.applications
    .filter((application) => walletEquals(application.wallet_address, walletAddress))
    .map((application) => new Date(application.created_at).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0];

  const hasGrant = Number.isFinite(firstGrantMs);
  const hasApplication = Number.isFinite(firstApplicationMs);

  if (hasGrant && hasApplication) {
    if (firstGrantMs <= firstApplicationMs) {
      return { role: "funder", firstActionType: "grant_created", firstActionAt: new Date(firstGrantMs).toISOString() };
    }
    return { role: "applicant", firstActionType: "application_submitted", firstActionAt: new Date(firstApplicationMs).toISOString() };
  }

  if (hasGrant) {
    return { role: "funder", firstActionType: "grant_created", firstActionAt: new Date(firstGrantMs).toISOString() };
  }
  if (hasApplication) {
    return { role: "applicant", firstActionType: "application_submitted", firstActionAt: new Date(firstApplicationMs).toISOString() };
  }

  return { role: "new", firstActionType: "none", firstActionAt: null };
}

function isRouteAllowed(route) {
  const role = state.viewerRole;
  if (role === "guest") return route === "dashboard";
  if (route === "application-detail") return role !== "guest";
  if (role === "funder" && route === "apply") return false;
  if (role === "applicant" && (route === "create-grant" || route === "dashboard")) return false;
  return true;
}

function fallbackRouteForRole() {
  if (state.viewerRole === "funder") return "dashboard";
  if (state.viewerRole === "applicant") return "grants";
  return "dashboard";
}

function navigateTo(route, param = "") {
  if (route === "application-detail" && param) {
    window.location.hash = `#/application/${encodeURIComponent(param)}`;
    return;
  }
  window.location.hash = `#/${route}`;
}

function syncRoleFromState() {
  const walletAddress = walletManager.getAddress() || "";
  state.connectedWallet = walletAddress;
  const roleInfo = determineViewerRole(walletAddress);
  state.viewerRole = roleInfo.role;
  state.firstActionType = roleInfo.firstActionType;
  state.firstActionAt = roleInfo.firstActionAt;
}

function applyRoleVisibility() {
  const role = state.viewerRole;
  const navVisibility = {
    dashboard: role !== "applicant",
    grants: role !== "guest",
    apply: role !== "guest" && role !== "funder",
    applications: role !== "guest",
    "create-grant": role !== "guest" && role !== "applicant",
  };

  Object.entries(navVisibility).forEach(([route, visible]) => {
    const button = document.querySelector(`.nav-link[data-route="${route}"]`);
    if (button) {
      button.classList.toggle("hidden", !visible);
    }
  });

  const showCreate = role !== "guest" && role !== "applicant";
  byId("headerCreateGrantBtn").classList.toggle("hidden", !showCreate || state.activeRoute === "create-grant");
}

function setActiveView(route) {
  if (!isRouteAllowed(route)) {
    navigateTo(fallbackRouteForRole());
    return;
  }
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
  applyRoleVisibility();
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
  const grantsForStats =
    state.viewerRole === "funder"
      ? state.grants.filter((grant) => walletEquals(grant.admin_wallet, state.connectedWallet))
      : state.grants;
  const visibleApplications = getVisibleApplications();

  const totalPool = grantsForStats.reduce((sum, grant) => sum + Number(grant.total_funding_lovelace || 0), 0);
  const distributed = grantsForStats.reduce((sum, grant) => {
    const fallback = grant.paid ? Number(grant.amount_lovelace || 0) : 0;
    return sum + Number(grant.distributed_lovelace || fallback);
  }, 0);
  const activeGrants = grantsForStats.filter((grant) => grant.status !== "claimed").length;
  const beneficiaries = new Set(grantsForStats.map((grant) => grant.beneficiary_wallet).filter(Boolean)).size;
  const appCounts = {
    total: visibleApplications.length,
    pending: visibleApplications.filter((item) => item.status === "pending").length,
    approved: visibleApplications.filter((item) => item.status === "approved").length,
    rejected: visibleApplications.filter((item) => item.status === "rejected").length,
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

function canManageGrant(grant) {
  return state.viewerRole === "funder" && walletEquals(grant?.admin_wallet, state.connectedWallet);
}

function getVisibleApplications() {
  if (!state.connectedWallet) return [];
  if (state.viewerRole === "funder") {
    return state.applications.filter((application) => {
      const grant = state.grants.find((item) => item.id === application.grant);
      return grant && walletEquals(grant.admin_wallet, state.connectedWallet);
    });
  }
  if (state.viewerRole === "applicant") {
    return state.applications.filter((application) =>
      walletEquals(application.wallet_address, state.connectedWallet),
    );
  }
  return [];
}

function getFilteredApplications() {
  const { search, status, grant } = state.applicationFilters;
  return getVisibleApplications().filter((application) => {
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
  const visibleGrantIds = new Set(getVisibleApplications().map((item) => item.grant).filter(Boolean));
  const visibleGrants = state.grants.filter((grant) => visibleGrantIds.has(grant.id));
  select.innerHTML = `<option value="all">All Grants</option>${visibleGrants
    .map((grant) => `<option value="${grant.id}">${escapeHtml(grant.title || grant.id.slice(0, 8))}</option>`)
    .join("")}`;
  select.value = visibleGrants.some((grant) => grant.id === current) ? current : "all";
}

function populateApplyGrantSelect() {
  const select = byId("applyGrantSelect");
  if (state.viewerRole === "funder") {
    select.innerHTML = `<option value="">Funders cannot apply</option>`;
    return;
  }
  const openGrants = state.grants.filter((grant) => grant.status !== "claimed");
  const previous = select.value || "";
  select.innerHTML =
    openGrants.length > 0
      ? openGrants
          .map((grant) => `<option value="${grant.id}">${escapeHtml(grant.title || grant.id.slice(0, 8))}</option>`)
          .join("")
      : `<option value="">No open grants available</option>`;
  if (openGrants.some((grant) => grant.id === previous)) {
    select.value = previous;
  }
}

function getSelectedApplyGrant() {
  const grantId = byId("applyGrantSelect")?.value || "";
  if (!grantId) return null;
  return state.grants.find((grant) => grant.id === grantId) || null;
}

function ensureApplyMilestoneDraftsForGrant(grant) {
  if (!grant) {
    state.applyMilestoneGrantId = "";
    state.applyMilestoneDrafts = [];
    return;
  }
  const milestones = Array.isArray(grant.milestones) ? grant.milestones : [];
  const existingByIndex = new Map(
    (state.applyMilestoneGrantId === grant.id ? state.applyMilestoneDrafts : []).map((item) => [item.milestone_index, item]),
  );
  state.applyMilestoneGrantId = grant.id;
  state.applyMilestoneDrafts = milestones.map((milestone, index) => {
    const type = inferMilestoneInputType(milestone);
    const existing = existingByIndex.get(index);
    return {
      milestone_index: index,
      title: String(milestone?.title || `Milestone ${index + 1}`),
      description: String(milestone?.description || ""),
      type,
      optional: isOptionalMilestone(milestone),
      link_url: existing?.type === "link" ? existing.link_url || "" : "",
      file_name: existing?.type === "pdf" ? existing.file_name || "" : "",
      file_data: existing?.type === "pdf" ? existing.file_data || "" : "",
    };
  });
}

function renderApplyMilestoneInputs() {
  const hint = byId("applyMilestonesHint");
  const container = byId("applyMilestonesContainer");
  const selectedGrant = getSelectedApplyGrant();

  if (!selectedGrant) {
    hint.textContent = "Select a grant to load required milestone uploads.";
    container.innerHTML = "";
    ensureApplyMilestoneDraftsForGrant(null);
    return;
  }

  ensureApplyMilestoneDraftsForGrant(selectedGrant);
  if (!state.applyMilestoneDrafts.length) {
    hint.textContent = "This grant has no milestone placeholders configured.";
    container.innerHTML = "";
    return;
  }

  const requiredCount = state.applyMilestoneDrafts.filter((item) => !item.optional).length;
  hint.textContent = `Provide ${requiredCount} required milestone submission${requiredCount === 1 ? "" : "s"}. PDF items accept .pdf only.`;
  container.innerHTML = state.applyMilestoneDrafts
    .map((draft) => {
      const badge = draft.optional
        ? `<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Optional</span>`
        : `<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Required</span>`;
      const inputLabel = draft.type === "link" ? "Typed Link" : "PDF Upload";
      const inputControl =
        draft.type === "link"
          ? `<input data-apply-ms-link="${draft.milestone_index}" type="url" value="${escapeHtml(draft.link_url)}" placeholder="https://example.com/evidence" class="mt-2 w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none focus:border-indigo-400" />`
          : `
              <input data-apply-ms-file="${draft.milestone_index}" type="file" accept="application/pdf,.pdf" class="mt-2 block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" />
              <p id="applyMsFileStatus-${draft.milestone_index}" class="mt-1 text-xs ${draft.file_name ? "text-emerald-700" : "text-slate-500"}">${draft.file_name ? `Selected: ${escapeHtml(draft.file_name)}` : "No PDF selected."}</p>
            `;
      return `
        <article class="rounded-lg border border-stroke bg-white p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-slate-800">${draft.milestone_index + 1}. ${escapeHtml(draft.title)}</p>
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">${inputLabel}</span>
              ${badge}
            </div>
          </div>
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(draft.description || "Provide evidence for this milestone.")}</p>
          ${inputControl}
        </article>
      `;
    })
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.readAsDataURL(file);
  });
}

async function handleApplyMilestoneFileSelect(target) {
  const index = Number(target.dataset.applyMsFile);
  if (Number.isNaN(index) || !state.applyMilestoneDrafts[index]) return;

  const status = byId(`applyMsFileStatus-${index}`);
  const file = target.files?.[0];
  if (!file) {
    state.applyMilestoneDrafts[index].file_name = "";
    state.applyMilestoneDrafts[index].file_data = "";
    if (status) {
      status.className = "mt-1 text-xs text-slate-500";
      status.textContent = "No PDF selected.";
    }
    return;
  }

  const fileName = String(file.name || "").toLowerCase();
  const isPdfType = file.type === "application/pdf" || fileName.endsWith(".pdf");
  if (!isPdfType) {
    state.applyMilestoneDrafts[index].file_name = "";
    state.applyMilestoneDrafts[index].file_data = "";
    target.value = "";
    if (status) {
      status.className = "mt-1 text-xs text-rose-700";
      status.textContent = "Only PDF files are allowed.";
    }
    throw new Error("Only PDF files are allowed for this milestone.");
  }
  if (file.size > 8 * 1024 * 1024) {
    state.applyMilestoneDrafts[index].file_name = "";
    state.applyMilestoneDrafts[index].file_data = "";
    target.value = "";
    if (status) {
      status.className = "mt-1 text-xs text-rose-700";
      status.textContent = "File too large. Maximum is 8MB.";
    }
    throw new Error("Milestone PDF file size cannot exceed 8MB.");
  }

  const fileData = await readFileAsDataUrl(file);
  state.applyMilestoneDrafts[index].file_name = file.name;
  state.applyMilestoneDrafts[index].file_data = fileData;
  if (status) {
    status.className = "mt-1 text-xs text-emerald-700";
    status.textContent = `Selected: ${file.name}`;
  }
}

function buildApplyMilestonePayload(selectedGrant) {
  ensureApplyMilestoneDraftsForGrant(selectedGrant);
  const payload = [];

  state.applyMilestoneDrafts.forEach((draft) => {
    if (draft.type === "link") {
      const linkUrl = String(draft.link_url || "").trim();
      if (!linkUrl) {
        if (!draft.optional) {
          throw new Error(`Provide a link for "${draft.title}".`);
        }
        return;
      }
      payload.push({
        milestone_index: draft.milestone_index,
        title: draft.title,
        type: "link",
        link_url: linkUrl,
      });
      return;
    }

    if (!draft.file_data || !draft.file_name) {
      if (!draft.optional) {
        throw new Error(`Upload a PDF for "${draft.title}".`);
      }
      return;
    }
    payload.push({
      milestone_index: draft.milestone_index,
      title: draft.title,
      type: "pdf",
      file_name: draft.file_name,
      file_data: draft.file_data,
    });
  });

  return payload;
}

function populateApplicationDetailGrantSelect(preferredGrantId = "") {
  const select = byId("appDetailGrantSelect");
  const grantsForSelect =
    state.viewerRole === "funder"
      ? state.grants.filter((grant) => walletEquals(grant.admin_wallet, state.connectedWallet))
      : state.grants;
  select.innerHTML =
    grantsForSelect.length > 0
      ? grantsForSelect
          .map((grant) => `<option value="${grant.id}">${escapeHtml(grant.title || grant.id.slice(0, 8))}</option>`)
          .join("")
      : `<option value="">No grants yet - create one first</option>`;
  if (preferredGrantId && grantsForSelect.some((grant) => grant.id === preferredGrantId)) {
    select.value = preferredGrantId;
  }
  byId("appDetailClaimGrantId").value = select.value || "";
}

function renderWallet(stateData) {
  syncRoleFromState();
  const text = stateData.connected
    ? `Connected: ${stateData.shortAddress} (${stateData.walletName}) | Role: ${roleDescription(state.viewerRole)}`
    : "Wallet disconnected";
  byId("walletIndicator").textContent = text;
  byId("createWalletState").textContent = text;
  byId("applyWalletState").textContent = text;
  byId("appDetailWallet").textContent = text;
  byId("connectWalletBtn").disabled = stateData.connected;
  byId("disconnectWalletBtn").disabled = !stateData.connected;
  applyRoleVisibility();
}

function renderDashboard() {
  const stats = computeStats();
  byId("metricTotalPool").textContent = formatAdaFromLovelace(stats.totalPool);
  byId("metricDistributed").textContent = formatAdaFromLovelace(stats.distributed);
  byId("metricActiveGrants").textContent = String(stats.activeGrants);
  byId("metricBeneficiaries").textContent = String(stats.beneficiaries);

  const dashboardGrants =
    state.viewerRole === "funder"
      ? state.grants.filter((grant) => walletEquals(grant.admin_wallet, state.connectedWallet))
      : state.grants;
  const dashboardApps =
    state.viewerRole === "funder"
      ? getVisibleApplications()
      : state.applications;

  const appCountByGrant = new Map();
  dashboardApps.forEach((application) => {
    if (application.grant) appCountByGrant.set(application.grant, (appCountByGrant.get(application.grant) || 0) + 1);
  });

  const grants = dashboardGrants
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
            const dashboardButton =
              state.viewerRole === "guest"
                ? `<button disabled class="mt-4 w-full rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">Connect wallet to view grant</button>`
                : `<button data-route-jump="grants" class="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">View Details -></button>`;
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
                ${dashboardButton}
              </article>
            `;
          })
          .join("");

  const recentApps = dashboardApps
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
            const canManage = canManageGrant(grant);
            const actionButtons = canManage
              ? `
                  <button data-filter-apps-grant="${grant.id}" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                    View Applicants
                  </button>
                  <button data-open-create-with-grant="${grant.id}" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
                    Manage
                  </button>
                `
              : state.viewerRole === "guest"
                ? `
                  <button data-open-grant-readonly="${grant.id}" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                    View Details
                  </button>
                  <button class="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500" disabled>Connect Wallet</button>
                `
              : `
                  <button data-open-grant-readonly="${grant.id}" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                    View Details
                  </button>
                  ${
                    state.viewerRole !== "funder"
                      ? `<button data-start-apply-grant="${grant.id}" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">Apply</button>`
                      : `<button class="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500" disabled>Read Only</button>`
                  }
                `;
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
                  ${actionButtons}
                </div>
              </article>
            `;
          })
          .join("");
}

function renderApply() {
  populateApplyGrantSelect();
  renderApplyMilestoneInputs();
}

function renderMilestonesEditor() {
  const container = byId("milestonesContainer");
  const categoryValue = byId("grantCategoryInput")?.value || "Education";
  const template = getMilestoneTemplate(categoryValue);
  if (!state.milestones.length) state.milestones = createDefaultMilestones(categoryValue);
  byId("milestoneTemplateHint").textContent = template.hint;

  container.innerHTML = state.milestones
    .map(
      (milestone, index) => {
        const templateItem = template.items[index] || null;
        const titlePlaceholder = templateItem?.title || `Milestone ${index + 1}`;
        const descriptionPlaceholder = templateItem?.description || "Describe milestone requirement";
        return `
      <div class="grid gap-2 rounded-xl border border-stroke bg-slate-50 p-3 md:grid-cols-[auto_1fr_1.5fr_auto_auto]">
        <div class="grid h-10 w-10 place-content-center rounded-lg bg-slate-200 text-sm font-bold text-slate-600">${index + 1}</div>
        <input data-ms-field="title" data-ms-index="${index}" class="rounded-lg border border-stroke px-3 py-2 text-sm outline-none focus:border-indigo-400" value="${escapeHtml(milestone.title)}" placeholder="${escapeHtml(titlePlaceholder)}" />
        <input data-ms-field="description" data-ms-index="${index}" class="rounded-lg border border-stroke px-3 py-2 text-sm outline-none focus:border-indigo-400" value="${escapeHtml(milestone.description)}" placeholder="${escapeHtml(descriptionPlaceholder)}" />
        <div class="flex items-center gap-1">
          <input data-ms-field="percentage" data-ms-index="${index}" type="number" min="0" max="100" class="w-20 rounded-lg border border-stroke px-2 py-2 text-sm outline-none focus:border-indigo-400" value="${Number(milestone.percentage) || 0}" />
          <span class="text-sm text-slate-600">%</span>
        </div>
        <button data-ms-remove="${index}" type="button" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">Delete</button>
      </div>`;
      },
    )
    .join("");

  updateMilestoneTotalLabel();
}

function updateMilestoneTotalLabel() {
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
            const adminButtons =
              state.viewerRole === "funder"
                ? `
                    <button data-quick-review="${application.id}" data-review-status="approved" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700">Approve</button>
                    <button data-quick-review="${application.id}" data-review-status="rejected" class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700">Reject</button>
                  `
                : "";
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
                    ${adminButtons}
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

function canViewApplication(application) {
  if (!application || !state.connectedWallet) return false;
  if (state.viewerRole === "funder") {
    const grant = state.grants.find((item) => item.id === application.grant);
    return Boolean(grant && walletEquals(grant.admin_wallet, state.connectedWallet));
  }
  if (state.viewerRole === "applicant") {
    return walletEquals(application.wallet_address, state.connectedWallet);
  }
  return false;
}

function renderApplicationMilestoneSubmissions(application) {
  const container = byId("appDetailMilestoneSubmissions");
  const submissions = Array.isArray(application?.milestone_submissions) ? application.milestone_submissions : [];
  if (!submissions.length) {
    container.innerHTML = `<p class="text-sm text-slate-500">No milestone evidence submitted.</p>`;
    return;
  }

  container.innerHTML = `
    <h4 class="text-sm font-semibold text-slate-800">Milestone Evidence</h4>
    <div class="space-y-2">
      ${submissions
        .map((item) => {
          const title = escapeHtml(item?.title || "Milestone evidence");
          const type = String(item?.type || "").toLowerCase();
          if (type === "link" && item?.link_url) {
            return `<a href="${escapeHtml(item.link_url)}" target="_blank" rel="noopener noreferrer" class="block rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50">${title} - Open Link</a>`;
          }
          if (item?.file_url) {
            return `<a href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener noreferrer" class="block rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50">${title} - Open PDF</a>`;
          }
          return `<div class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm text-slate-600">${title} - Submitted</div>`;
        })
        .join("")}
    </div>
  `;
}

function renderApplicationDetail() {
  const application = state.applications.find((item) => item.id === state.activeApplicationId);
  if (!application) {
    byId("appDetailTitle").textContent = "Application not found";
    byId("appDetailSub").textContent = "Go back and choose another application.";
    byId("appDetailInfoCards").innerHTML = "";
    byId("appDetailProposal").textContent = "";
    byId("appDetailMilestoneSubmissions").innerHTML = "";
    byId("appDetailRequested").textContent = "₳0";
    byId("appDetailTimeline").innerHTML = "";
    populateApplicationDetailGrantSelect("");
    return;
  }

  if (!canViewApplication(application)) {
    byId("appDetailTitle").textContent = "Access denied";
    byId("appDetailSub").textContent = "You can only view applications linked to your role and wallet.";
    byId("appDetailInfoCards").innerHTML = "";
    byId("appDetailProposal").textContent = "";
    byId("appDetailMilestoneSubmissions").innerHTML = "";
    byId("appDetailRequested").textContent = "₳0";
    byId("appDetailTimeline").innerHTML = "";
    byId("appDetailApproveBtn").classList.add("hidden");
    byId("appDetailRejectBtn").classList.add("hidden");
    byId("appDetailFundBtn").classList.add("hidden");
    byId("appDetailClaimBtn").classList.add("hidden");
    byId("appDetailGrantSelect").disabled = true;
    byId("appDetailUnlockInput").disabled = true;
    byId("appDetailApproveAmountAda").disabled = true;
    return;
  }

  const requestedLovelace = Number(application.requested_amount_lovelace || 0);
  byId("appDetailStatusBadge").className = `inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(application.status)}`;
  byId("appDetailStatusBadge").textContent = application.status;
  byId("appDetailTitle").textContent = application.full_name;
  byId("appDetailSub").textContent = "Application for Grant";
  byId("appDetailProposal").textContent = application.purpose || "-";
  renderApplicationMilestoneSubmissions(application);
  byId("appDetailRequested").textContent = formatAdaFromLovelace(requestedLovelace);

  byId("appDetailInfoCards").innerHTML = `
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</p><p class="font-semibold text-slate-900">${escapeHtml(application.full_name)}</p></article>
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p><p class="font-semibold text-slate-900">${escapeHtml(application.email)}</p></article>
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</p><p class="font-semibold text-slate-900">${escapeHtml(application.organization || "Independent Applicant")}</p></article>
    <article class="rounded-xl border border-stroke bg-slate-50 px-3 py-2"><p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Wallet Address</p><p class="font-semibold text-slate-900">${escapeHtml(shortWallet(application.wallet_address))}</p></article>
  `;

  populateApplicationDetailGrantSelect(application.grant || "");
  if (state.viewerRole === "applicant" && application.grant) {
    byId("appDetailGrantSelect").innerHTML = `<option value="${application.grant}">${application.grant}</option>`;
    byId("appDetailGrantSelect").value = application.grant;
  }
  byId("appDetailApproveAmountAda").value = lovelaceToAdaNumber(requestedLovelace || 0) || 0;
  byId("appDetailUnlockInput").value = "";

  const isFunder = state.viewerRole === "funder";
  const isApplicant = state.viewerRole === "applicant";
  byId("appDetailApproveBtn").classList.toggle("hidden", !isFunder);
  byId("appDetailRejectBtn").classList.toggle("hidden", !isFunder);
  byId("appDetailFundBtn").classList.toggle("hidden", !isFunder);
  byId("appDetailClaimBtn").classList.toggle("hidden", !isApplicant);
  byId("appDetailGrantSelect").disabled = !isFunder;
  byId("appDetailUnlockInput").disabled = !isFunder;
  byId("appDetailApproveAmountAda").disabled = !isFunder;

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
  renderApply();
  renderMilestonesEditor();
  renderApplications();
  if (state.activeRoute === "application-detail") renderApplicationDetail();
}

async function refreshData() {
  const walletAddress = walletManager.getAddress() || "";

  const applicationsPromise = walletAddress
    ? Promise.all([
        api.listApplications({ applicant_wallet: walletAddress }),
        api.listApplications({ funder_wallet: walletAddress }),
      ]).then(([asApplicant, asFunder]) => mergeUniqueById(asApplicant, asFunder))
    : Promise.resolve([]);

  const [applications, grants, auditEvents] = await Promise.all([
    applicationsPromise,
    api.listGrants(),
    api.listAuditEvents(),
  ]);
  state.applications = applications;
  state.grants = grants;
  state.auditEvents = auditEvents;
  syncRoleFromState();
  applyRoleVisibility();
  if (!isRouteAllowed(state.activeRoute)) {
    navigateTo(fallbackRouteForRole());
    return;
  }
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
      if (state.viewerRole === "guest" && routeJump.dataset.routeJump !== "dashboard") {
        setBanner("Connect a wallet to access this feature.", "info");
        return;
      }
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
      const grant = state.grants.find((item) => item.id === filterGrant.dataset.filterAppsGrant);
      if (!canManageGrant(grant)) {
        setBanner("You can only manage applicants for grants you created.", "error");
        return;
      }
      state.applicationFilters.grant = filterGrant.dataset.filterAppsGrant;
      byId("appsGrantFilter").value = state.applicationFilters.grant;
      navigateTo("applications");
      renderApplications();
      return;
    }
    const startApplyGrant = event.target.closest("[data-start-apply-grant]");
    if (startApplyGrant) {
      if (state.viewerRole === "funder") {
        setBanner("Funder wallets cannot apply to grants.", "error");
        return;
      }
      navigateTo("apply");
      byId("applyGrantSelect").value = startApplyGrant.dataset.startApplyGrant;
      renderApplyMilestoneInputs();
      return;
    }
    const openReadonly = event.target.closest("[data-open-grant-readonly]");
    if (openReadonly) {
      setBanner("Read-only grant view. Management is restricted to the grant funder.", "info");
      return;
    }
    const openCreate = event.target.closest("[data-open-create-with-grant]");
    if (openCreate) {
      const grant = state.grants.find((item) => item.id === openCreate.dataset.openCreateWithGrant);
      if (!canManageGrant(grant)) {
        setBanner("You can only manage grants you created.", "error");
        return;
      }
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
  walletManager.onChange((walletState) => {
    renderWallet(walletState);
    renderAll();
    if (!isRouteAllowed(state.activeRoute)) {
      navigateTo(fallbackRouteForRole());
    }
  });
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
  byId("applyConnectWalletBtn").addEventListener("click", async () => {
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
  byId("grantCategoryInput").addEventListener("change", (event) => {
    state.milestones = createDefaultMilestones(event.target.value);
    renderMilestonesEditor();
    setBanner(`Loaded ${event.target.value} milestone placeholders.`, "info");
  });

  byId("addMilestoneBtn").addEventListener("click", () => {
    const template = getMilestoneTemplate(byId("grantCategoryInput")?.value || "Education");
    const nextTemplateItem = template.items[state.milestones.length] || null;
    state.milestones.push({
      title: nextTemplateItem?.title || `Milestone ${state.milestones.length + 1}`,
      description: nextTemplateItem?.description || "Describe milestone requirement",
      percentage: Number(nextTemplateItem?.percentage) || 0,
      input_type: nextTemplateItem?.input_type === "link" ? "link" : "pdf",
    });
    renderMilestonesEditor();
  });

  byId("milestonesContainer").addEventListener("input", (event) => {
    const index = Number(event.target.dataset.msIndex);
    const field = event.target.dataset.msField;
    if (Number.isNaN(index) || !field || !state.milestones[index]) return;
    state.milestones[index][field] = field === "percentage" ? Number(event.target.value) || 0 : event.target.value;
    updateMilestoneTotalLabel();
  });

  byId("milestonesContainer").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-ms-remove]");
    if (!removeButton) return;
    const index = Number(removeButton.dataset.msRemove);
    if (Number.isNaN(index)) return;
    state.milestones.splice(index, 1);
    if (!state.milestones.length) state.milestones = createDefaultMilestones(byId("grantCategoryInput")?.value || "Education");
    renderMilestonesEditor();
  });
}

async function handleApplyFormSubmit(event) {
  event.preventDefault();
  try {
    if (state.viewerRole === "funder") {
      throw new Error("Funder wallets cannot apply to grants.");
    }
    const applicantWallet = walletAddressOrError();
    const grantId = byId("applyGrantSelect").value;
    if (!grantId) throw new Error("Select a grant before submitting.");

    const selectedGrant = state.grants.find((grant) => grant.id === grantId);
    if (!selectedGrant) throw new Error("Selected grant does not exist.");
    if (selectedGrant.admin_wallet === applicantWallet) {
      throw new Error("Grant creator wallets are not allowed to apply.");
    }
    const milestoneSubmissions = buildApplyMilestonePayload(selectedGrant);

    const requestedLovelace = toLovelace(byId("applyRequestedAdaInput").value);
    if (!requestedLovelace) throw new Error("Requested amount must be greater than zero.");

    await api.submitApplication({
      grant: grantId,
      wallet_address: applicantWallet,
      full_name: byId("applyFullNameInput").value.trim(),
      email: byId("applyEmailInput").value.trim(),
      organization: byId("applyOrganizationInput").value.trim(),
      purpose: byId("applyPurposeInput").value.trim(),
      proof_url: byId("applyProofUrlInput").value.trim(),
      requested_amount_lovelace: requestedLovelace,
      milestone_submissions: milestoneSubmissions,
    });

    byId("applyForm").reset();
    state.applyMilestoneGrantId = "";
    state.applyMilestoneDrafts = [];
    populateApplyGrantSelect();
    renderApplyMilestoneInputs();
    await refreshData();
    setBanner("Application submitted successfully.", "success");
    navigateTo("applications");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function handleCreateGrant(event) {
  event.preventDefault();
  try {
    if (state.viewerRole === "applicant") {
      throw new Error("Applicant wallets cannot create grants.");
    }
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
      milestones: state.milestones,
      notes: JSON.stringify({ milestoneCount: state.milestones.length }),
    };

    await api.createGrant(payload);
    byId("createGrantForm").reset();
    state.milestones = createDefaultMilestones(byId("grantCategoryInput")?.value || "Education");
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
    const application = state.applications.find((item) => item.id === applicationId);
    const payload = { status: nextStatus, admin_wallet: adminWallet };
    if (application?.grant) {
      payload.grant_id = application.grant;
    }
    await api.reviewApplication(applicationId, payload);
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
    if (state.viewerRole !== "funder") {
      throw new Error("Only funders can approve applications.");
    }
    const adminWallet = walletAddressOrError();
    const application = getActiveApplicationOrError();
    const grant = getSelectedGrantFromDetail();
    if (!canManageGrant(grant)) throw new Error("You can only approve applicants for your own grants.");
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
    if (state.viewerRole !== "funder") {
      throw new Error("Only funders can reject applications.");
    }
    const adminWallet = walletAddressOrError();
    const application = getActiveApplicationOrError();
    if (!canViewApplication(application)) throw new Error("You can only reject applicants for your own grants.");
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
    if (state.viewerRole !== "funder") {
      throw new Error("Only funders can fund grants.");
    }
    const adminWallet = walletAddressOrError();
    const walletApi = walletApiOrError();
    const application = getActiveApplicationOrError();
    const grant = getSelectedGrantFromDetail();
    if (!canManageGrant(grant)) throw new Error("You can only fund your own grants.");
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
    if (state.viewerRole !== "applicant") {
      throw new Error("Only applicant wallets can claim from application view.");
    }
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
    if (quick) {
      if (state.viewerRole !== "funder") {
        setBanner("Only funders can review applications.", "error");
        return;
      }
      const target = state.applications.find((item) => item.id === quick.dataset.quickReview);
      if (!canViewApplication(target)) {
        setBanner("You can only review applications linked to your grants.", "error");
        return;
      }
      await quickReviewApplication(quick.dataset.quickReview, quick.dataset.reviewStatus);
    }
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
  byId("applyGrantSelect").addEventListener("change", () => {
    renderApplyMilestoneInputs();
  });
  byId("applyMilestonesContainer").addEventListener("input", (event) => {
    const linkInput = event.target.closest("[data-apply-ms-link]");
    if (!linkInput) return;
    const index = Number(linkInput.dataset.applyMsLink);
    if (Number.isNaN(index) || !state.applyMilestoneDrafts[index]) return;
    state.applyMilestoneDrafts[index].link_url = linkInput.value.trim();
  });
  byId("applyMilestonesContainer").addEventListener("change", async (event) => {
    const fileInput = event.target.closest("[data-apply-ms-file]");
    if (!fileInput) return;
    try {
      await handleApplyMilestoneFileSelect(fileInput);
    } catch (error) {
      setBanner(error.message, "error");
    }
  });
  byId("applyForm").addEventListener("submit", handleApplyFormSubmit);
  byId("createGrantForm").addEventListener("submit", handleCreateGrant);
}

async function init() {
  setBanner("Initializing GrantFlow...");
  state.milestones = createDefaultMilestones(byId("grantCategoryInput")?.value || "Education");
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

