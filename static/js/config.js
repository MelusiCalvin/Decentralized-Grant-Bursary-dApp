function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

const runtimeApiBaseUrl =
  typeof window !== "undefined" && typeof window.__API_BASE_URL__ === "string"
    ? window.__API_BASE_URL__
    : "";

const defaultApiBaseUrl =
  typeof window !== "undefined" && window.location?.origin
    ? `${window.location.origin}/api`
    : "http://localhost:8000/api";

export const APP_CONFIG = {
  API_BASE_URL: stripTrailingSlash(runtimeApiBaseUrl || defaultApiBaseUrl),
  NETWORK: "Preprod",
  WALLET_NAME: "lace",
  BLOCKFROST_URL: "https://cardano-preprod.blockfrost.io/api/v0",
  BLOCKFROST_API_KEY: "preprodro4PqSLOz8TdnAzOLeE3vM2HLAjE5RQP",
  GRANT_SCRIPT_ADDRESS: "addr_test1wzplaceholderreplacewithscriptaddress",
  GRANT_VALIDATOR_CBOR_HEX: "",
};
