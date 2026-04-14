import { APP_CONFIG } from "./config.js";

let lucidModulePromise = null;
const LUCID_MODULE_URLS = [
  "https://esm.sh/lucid-cardano@0.10.11?bundle",
  "https://cdn.jsdelivr.net/npm/lucid-cardano@0.10.11/web/mod.js",
  "https://unpkg.com/lucid-cardano@0.10.11/web/mod.js",
];

function ensureConfig() {
  if (!APP_CONFIG.BLOCKFROST_API_KEY || APP_CONFIG.BLOCKFROST_API_KEY === "YOUR_BLOCKFROST_KEY") {
    throw new Error("Set BLOCKFROST_API_KEY in js/config.js.");
  }
}

async function loadLucidModule() {
  if (!lucidModulePromise) {
    lucidModulePromise = (async () => {
      const failures = [];
      for (const moduleUrl of LUCID_MODULE_URLS) {
        try {
          return await import(moduleUrl);
        } catch (error) {
          failures.push(`${moduleUrl}: ${error?.message || error}`);
        }
      }
      throw new Error(
        `Unable to load lucid-cardano from CDN. Check network/CSP. Attempts: ${failures.join(" | ")}`,
      );
    })();
  }
  return lucidModulePromise;
}

async function initLucid(walletApi) {
  ensureConfig();
  const { Lucid, Blockfrost } = await loadLucidModule();
  const lucid = await Lucid.new(
    new Blockfrost(APP_CONFIG.BLOCKFROST_URL, APP_CONFIG.BLOCKFROST_API_KEY),
    APP_CONFIG.NETWORK,
  );
  lucid.selectWallet(walletApi);
  return lucid;
}

function hasConfiguredScriptAddress() {
  return Boolean(
    APP_CONFIG.GRANT_SCRIPT_ADDRESS &&
      !APP_CONFIG.GRANT_SCRIPT_ADDRESS.includes("placeholder"),
  );
}

function hasConfiguredValidator() {
  return Boolean(APP_CONFIG.GRANT_VALIDATOR_CBOR_HEX);
}

async function buildGrantDatum(lucid, { adminAddress, beneficiaryAddress, amountLovelace, unlockTimeIso }) {
  const { Data } = await loadLucidModule();
  const adminDetails = lucid.utils.getAddressDetails(adminAddress);
  const beneficiaryDetails = lucid.utils.getAddressDetails(beneficiaryAddress);

  if (!adminDetails.paymentCredential?.hash || !beneficiaryDetails.paymentCredential?.hash) {
    throw new Error("Could not derive payment credentials from wallet address.");
  }

  const schema = Data.Object({
    adminPkh: Data.Bytes(),
    beneficiaryPkh: Data.Bytes(),
    amount: Data.Integer(),
    unlockTime: Data.Integer(),
    milestoneApproved: Data.Boolean(),
    paid: Data.Boolean(),
  });

  return Data.to(
    {
      adminPkh: adminDetails.paymentCredential.hash,
      beneficiaryPkh: beneficiaryDetails.paymentCredential.hash,
      amount: BigInt(amountLovelace),
      unlockTime: BigInt(new Date(unlockTimeIso).getTime()),
      milestoneApproved: true,
      paid: false,
    },
    schema,
  );
}

export async function fundGrantContract(walletApi, params) {
  const lucid = await initLucid(walletApi);
  if (!hasConfiguredScriptAddress()) {
    // Direct-transfer fallback when contract config is missing.
    const tx = await lucid
      .newTx()
      .payToAddress(params.beneficiaryAddress, { lovelace: BigInt(params.amountLovelace) })
      .complete();
    const signed = await tx.sign().complete();
    const txHash = await signed.submit();
    return txHash;
  }

  const datum = await buildGrantDatum(lucid, params);

  const tx = await lucid
    .newTx()
    .payToContract(APP_CONFIG.GRANT_SCRIPT_ADDRESS, { inline: datum }, { lovelace: BigInt(params.amountLovelace) })
    .complete();

  const signed = await tx.sign().complete();
  const txHash = await signed.submit();
  return txHash;
}

export async function claimGrantFromContract(walletApi, { beneficiaryAddress, amountLovelace }) {
  const lucid = await initLucid(walletApi);
  if (!hasConfiguredScriptAddress() || !hasConfiguredValidator()) {
    // In direct-transfer fallback mode, funds are transferred during sponsor funding.
    return `direct-claim-${Date.now()}`;
  }

  const { Data, Constr } = await loadLucidModule();
  const validator = {
    type: "PlutusV2",
    script: APP_CONFIG.GRANT_VALIDATOR_CBOR_HEX,
  };

  const utxos = await lucid.utxosAt(APP_CONFIG.GRANT_SCRIPT_ADDRESS);
  if (!utxos.length) {
    throw new Error("No UTxO found at grant script address.");
  }

  const selected = utxos.find((utxo) => BigInt(utxo.assets.lovelace || 0n) >= BigInt(amountLovelace));
  if (!selected) {
    throw new Error("No script UTxO with enough lovelace for payout.");
  }

  const redeemer = Data.to(new Constr(0, []));

  const tx = await lucid
    .newTx()
    .collectFrom([selected], redeemer)
    .attachSpendingValidator(validator)
    .addSigner(beneficiaryAddress)
    .payToAddress(beneficiaryAddress, { lovelace: BigInt(amountLovelace) })
    .validFrom(Date.now())
    .complete();

  const signed = await tx.sign().complete();
  const txHash = await signed.submit();
  return txHash;
}

export function textToHex(text) {
  return Array.from(new TextEncoder().encode(text))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
