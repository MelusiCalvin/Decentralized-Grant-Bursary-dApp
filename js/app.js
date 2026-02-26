import { walletManager } from "./walletManager.js";
import { api } from "./api.js";
import { APP_CONFIG } from "./config.js";
import { claimGrantFromContract, fundGrantContract, textToHex } from "./lucidService.js";

const state = {
  grants: [],
  applications: [],
  auditEvents: [],
};

function byId(id) {
  return document.getElementById(id);
}

function toIsoUtc(localDateTimeValue) {
  const parsed = new Date(localDateTimeValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date/time value.");
  }
  return parsed.toISOString();
}

function setBanner(message, type = "info") {
  const banner = byId("statusBanner");
  const classMap = {
    info: "border-cyan-300/60 bg-cyan-500/15 text-cyan-100",
    success: "border-emerald-300/60 bg-emerald-500/15 text-emerald-100",
    error: "border-rose-300/60 bg-rose-500/20 text-rose-100",
  };
  banner.className = `rounded-2xl border px-4 py-3 text-sm font-medium shadow-inner ${classMap[type] || classMap.info}`;
  banner.textContent = message;
}

function renderWallet(stateData) {
  byId("walletState").textContent = stateData.connected
    ? `Connected: ${stateData.shortAddress} (${stateData.walletName})`
    : "Wallet disconnected";
  byId("connectWalletBtn").disabled = stateData.connected;
  byId("disconnectWalletBtn").disabled = !stateData.connected;
  byId("applyWalletAddress").value = stateData.address || "";
  byId("adminWalletHint").textContent = stateData.address || "Connect admin Lace wallet";
}

function renderTableRows(containerId, rowsHtml) {
  byId(containerId).innerHTML = rowsHtml || `<tr><td colspan="5" class="px-4 py-3 text-slate-400">No data yet.</td></tr>`;
}

function renderApplications() {
  const rows = state.applications
    .map(
      (item) => `
      <tr class="border-b border-white/5">
        <td class="px-4 py-3 text-xs text-slate-200">${item.id}</td>
        <td class="px-4 py-3 text-slate-100">${item.full_name}</td>
        <td class="px-4 py-3 text-slate-200">${item.wallet_address}</td>
        <td class="px-4 py-3">
          <span class="rounded-full px-2 py-1 text-xs ${item.status === "approved" ? "bg-emerald-500/20 text-emerald-100" : item.status === "rejected" ? "bg-rose-500/20 text-rose-100" : "bg-amber-500/20 text-amber-100"}">
            ${item.status}
          </span>
        </td>
        <td class="px-4 py-3 text-slate-300">${new Date(item.created_at).toLocaleString()}</td>
      </tr>`,
    )
    .join("");
  renderTableRows("applicationsTableBody", rows);
}

function renderGrants() {
  const rows = state.grants
    .map(
      (grant) => `
      <tr class="border-b border-white/5">
        <td class="px-4 py-3 text-xs text-slate-200">${grant.id}</td>
        <td class="px-4 py-3 text-slate-100">${grant.status}</td>
        <td class="px-4 py-3 text-slate-200">${grant.beneficiary_wallet || "-"}</td>
        <td class="px-4 py-3 text-slate-200">${Number(grant.amount_lovelace || 0).toLocaleString()}</td>
        <td class="px-4 py-3 text-slate-300">${grant.unlock_time ? new Date(grant.unlock_time).toLocaleString() : "-"}</td>
      </tr>`,
    )
    .join("");
  renderTableRows("grantsTableBody", rows);
}

function renderAuditEvents() {
  const rows = state.auditEvents
    .slice(0, 12)
    .map(
      (event) => `
      <tr class="border-b border-white/5">
        <td class="px-4 py-3 text-slate-100">${event.action}</td>
        <td class="px-4 py-3 text-slate-200">${event.actor_wallet || "-"}</td>
        <td class="px-4 py-3 text-xs text-slate-300">${event.grant_id || "-"}</td>
        <td class="px-4 py-3 text-slate-300">${new Date(event.created_at).toLocaleString()}</td>
      </tr>`,
    )
    .join("");
  renderTableRows("auditTableBody", rows);
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
  renderApplications();
  renderGrants();
  renderAuditEvents();
}

function setupWalletHandlers() {
  walletManager.onChange(renderWallet);

  byId("connectWalletBtn").addEventListener("click", async () => {
    try {
      await walletManager.connectWallet(APP_CONFIG.WALLET_NAME, APP_CONFIG.NETWORK.toLowerCase());
      setBanner("Wallet connected. You can now apply, fund, approve, or claim.", "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });

  byId("disconnectWalletBtn").addEventListener("click", () => {
    walletManager.disconnectWallet();
    setBanner("Wallet disconnected.", "info");
  });
}

function setupFormHandlers() {
  byId("applyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const walletAddress = walletManager.getAddress();
    if (!walletAddress) {
      setBanner("Connect Lace wallet before submitting an application.", "error");
      return;
    }

    const payload = {
      wallet_address: walletAddress,
      full_name: byId("fullName").value.trim(),
      email: byId("email").value.trim(),
      purpose: byId("purpose").value.trim(),
      proof_url: byId("proofUrl").value.trim(),
    };

    try {
      await api.submitApplication(payload);
      byId("applyForm").reset();
      byId("applyWalletAddress").value = walletAddress;
      await refreshData();
      setBanner("Application submitted and logged.", "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });

  byId("createGrantForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const adminWallet = walletManager.getAddress();
    if (!adminWallet) {
      setBanner("Connect admin wallet before creating a grant.", "error");
      return;
    }

    const payload = {
      admin_wallet: adminWallet,
      amount_lovelace: Number(byId("draftAmount").value),
      unlock_time: toIsoUtc(byId("draftUnlock").value),
      beneficiary_wallet: byId("draftBeneficiary").value.trim(),
      notes: byId("draftNotes").value.trim(),
    };

    try {
      const grant = await api.createGrant(payload);
      byId("createGrantForm").reset();
      byId("approveGrantId").value = grant.id;
      byId("fundGrantId").value = grant.id;
      byId("claimGrantId").value = grant.id;
      await refreshData();
      setBanner(`Draft grant ${grant.id} created.`, "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });

  byId("approveGrantForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const adminWallet = walletManager.getAddress();
    if (!adminWallet) {
      setBanner("Connect admin wallet before approval.", "error");
      return;
    }

    const grantId = byId("approveGrantId").value.trim();
    const beneficiary = byId("approveBeneficiary").value.trim();
    const amountLovelace = Number(byId("approveAmount").value);
    const unlockTime = toIsoUtc(byId("approveUnlock").value);

    const approvalPayload = JSON.stringify({
      grantId,
      beneficiary,
      amountLovelace,
      unlockTime,
      approvedAt: new Date().toISOString(),
    });

    try {
      const signature = await walletManager.signData(textToHex(approvalPayload));
      const approvalTxHash = btoa(JSON.stringify(signature)).slice(0, 120);
      await api.approveGrant(grantId, {
        admin_wallet: adminWallet,
        beneficiary_wallet: beneficiary,
        amount_lovelace: amountLovelace,
        unlock_time: unlockTime,
        milestone_approved: true,
        approval_tx_hash: approvalTxHash,
      });
      await refreshData();
      setBanner("Grant approved with admin wallet signature.", "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });

  byId("fundGrantForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const walletApi = walletManager.getApi();
    const adminWallet = walletManager.getAddress();

    if (!walletApi || !adminWallet) {
      setBanner("Connect admin wallet before funding contract.", "error");
      return;
    }

    const grantId = byId("fundGrantId").value.trim();
    const beneficiary = byId("fundBeneficiary").value.trim();
    const amountLovelace = Number(byId("fundAmount").value);
    const unlockTime = toIsoUtc(byId("fundUnlock").value);

    try {
      const txHash = await fundGrantContract(walletApi, {
        adminAddress: adminWallet,
        beneficiaryAddress: beneficiary,
        amountLovelace,
        unlockTimeIso: unlockTime,
      });
      await api.recordFunding(grantId, {
        admin_wallet: adminWallet,
        funded_tx_hash: txHash,
      });
      await refreshData();
      setBanner(`Funding tx submitted: ${txHash}`, "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });

  byId("claimForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const walletApi = walletManager.getApi();
    const beneficiaryWallet = walletManager.getAddress();
    if (!walletApi || !beneficiaryWallet) {
      setBanner("Connect beneficiary wallet before claiming.", "error");
      return;
    }

    const grantId = byId("claimGrantId").value.trim();
    const grant = state.grants.find((item) => item.id === grantId);
    if (!grant) {
      setBanner("Grant not found. Refresh and try again.", "error");
      return;
    }

    try {
      const claimability = await api.checkClaimable(grantId, beneficiaryWallet);
      if (!claimability.claimable) {
        setBanner(`Claim blocked. Checks: ${JSON.stringify(claimability.checks)}`, "error");
        return;
      }

      const txHash = await claimGrantFromContract(walletApi, {
        beneficiaryAddress: beneficiaryWallet,
        amountLovelace: Number(grant.amount_lovelace),
      });

      await api.recordClaim(grantId, {
        wallet_address: beneficiaryWallet,
        claim_tx_hash: txHash,
      });

      await refreshData();
      setBanner(`Claim successful. Tx: ${txHash}`, "success");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });

  byId("refreshBtn").addEventListener("click", async () => {
    try {
      await refreshData();
      setBanner("Data refreshed.", "info");
    } catch (error) {
      setBanner(error.message, "error");
    }
  });
}

async function init() {
  setBanner("Initializing dApp...");
  setupWalletHandlers();
  setupFormHandlers();

  try {
    await walletManager.restoreConnection();
    renderWallet(walletManager.getState());
    await api.health();
    await refreshData();
    setBanner("System ready. Connect Lace wallet to begin.", "success");
  } catch (error) {
    renderWallet(walletManager.getState());
    setBanner(`Initialization warning: ${error.message}`, "error");
  }
}

init();
