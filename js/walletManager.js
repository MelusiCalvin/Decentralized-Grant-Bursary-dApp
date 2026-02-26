const WALLET_STORAGE_KEY = "grant_wallet_connection_v1";
const DEFAULT_NETWORK = "preprod";

const BECH32_CHARS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function convertBits(data, fromBits, toBits, pad = true) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const maxValue = (1 << toBits) - 1;
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1;

  for (const value of data) {
    if (value < 0 || (value >> fromBits) !== 0) {
      return null;
    }
    acc = ((acc << fromBits) | value) & maxAcc;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      out.push((acc >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) {
      out.push((acc << (toBits - bits)) & maxValue);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxValue)) {
    return null;
  }
  return out;
}

function bech32Polymod(values) {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >>> i) & 1) {
        chk ^= BECH32_GEN[i];
      }
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i += 1) {
    out.push(hrp.charCodeAt(i) >> 5);
  }
  out.push(0);
  for (let i = 0; i < hrp.length; i += 1) {
    out.push(hrp.charCodeAt(i) & 31);
  }
  return out;
}

function bech32CreateChecksum(hrp, data) {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(values) ^ 1;
  const ret = [];
  for (let i = 0; i < 6; i += 1) {
    ret.push((mod >>> (5 * (5 - i))) & 31);
  }
  return ret;
}

function bech32Encode(hrp, bytes) {
  const converted = convertBits(bytes, 8, 5, true);
  if (!converted) {
    return null;
  }
  const checksum = bech32CreateChecksum(hrp, converted);
  const combined = [...converted, ...checksum];
  return `${hrp}1${combined.map((value) => BECH32_CHARS[value]).join("")}`;
}

function hexToBytes(hex) {
  const cleaned = String(hex || "")
    .replace(/^0x/, "")
    .trim()
    .toLowerCase();
  if (!cleaned || cleaned.length % 2 !== 0) {
    return [];
  }
  const out = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    out.push(parseInt(cleaned.slice(i, i + 2), 16));
  }
  return out;
}

function unwrapCborBytesIfNeeded(bytes) {
  if (!bytes.length) {
    return bytes;
  }

  const first = bytes[0];
  let headerLength = 0;
  let payloadLength = 0;

  if (first >= 0x40 && first <= 0x57) {
    headerLength = 1;
    payloadLength = first - 0x40;
  } else if (first === 0x58 && bytes.length >= 2) {
    headerLength = 2;
    payloadLength = bytes[1];
  } else if (first === 0x59 && bytes.length >= 3) {
    headerLength = 3;
    payloadLength = (bytes[1] << 8) | bytes[2];
  } else if (first === 0x5a && bytes.length >= 5) {
    headerLength = 5;
    payloadLength = (((bytes[1] << 24) >>> 0) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
  }

  if (headerLength > 0 && bytes.length === headerLength + payloadLength) {
    return bytes.slice(headerLength);
  }
  return bytes;
}

function decodeAddressToBech32(rawAddress, network = DEFAULT_NETWORK) {
  if (!rawAddress) {
    return null;
  }

  if (typeof rawAddress === "string" && rawAddress.startsWith("addr")) {
    return rawAddress;
  }

  if (rawAddress.to_bech32 && typeof rawAddress.to_bech32 === "function") {
    try {
      return rawAddress.to_bech32();
    } catch (_error) {
      return null;
    }
  }

  if (typeof rawAddress === "string") {
    const bytes = unwrapCborBytesIfNeeded(hexToBytes(rawAddress));
    if (bytes.length > 0) {
      const hrp = network === "mainnet" ? "addr" : "addr_test";
      const bech32Address = bech32Encode(hrp, bytes);
      if (bech32Address) {
        return bech32Address;
      }
    }
    return rawAddress.replace(/^0x/, "");
  }

  return String(rawAddress);
}

class WalletManager {
  constructor() {
    this.provider = null;
    this.api = null;
    this.walletName = null;
    this.walletAddress = null;
    this.network = DEFAULT_NETWORK;
    this.listeners = [];
  }

  get isConnected() {
    return Boolean(this.api && this.walletAddress);
  }

  detectInstalledWallets() {
    if (typeof window === "undefined" || !window.cardano) {
      return [];
    }
    return Object.keys(window.cardano).filter((name) => {
      const wallet = window.cardano[name];
      return wallet && typeof wallet.enable === "function";
    });
  }

  async detectWallet(walletName = "lace") {
    if (typeof window === "undefined" || !window.cardano) {
      return null;
    }
    return window.cardano[walletName] || null;
  }

  async waitForWalletInjection(walletName = "lace", timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const wallet = await this.detectWallet(walletName);
      if (wallet) {
        return wallet;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return this.detectWallet(walletName);
  }

  async connectWallet(walletName = "lace", network = DEFAULT_NETWORK) {
    const provider = await this.waitForWalletInjection(walletName);
    if (!provider) {
      throw new Error(`${walletName} wallet not found. Install/enable Lace and refresh.`);
    }

    const api = await provider.enable();
    this.provider = provider;
    this.api = api;
    this.walletName = walletName;
    this.network = network;
    await this.updateWalletAddress();

    localStorage.setItem(
      WALLET_STORAGE_KEY,
      JSON.stringify({
        walletName,
        network,
        connectedAt: new Date().toISOString(),
      }),
    );

    this.notify();
    return this.getState();
  }

  async restoreConnection() {
    const saved = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!saved) {
      return false;
    }

    try {
      const parsed = JSON.parse(saved);
      await this.connectWallet(parsed.walletName || "lace", parsed.network || DEFAULT_NETWORK);
      return true;
    } catch (_error) {
      localStorage.removeItem(WALLET_STORAGE_KEY);
      return false;
    }
  }

  async updateWalletAddress() {
    if (!this.api) {
      this.walletAddress = null;
      return null;
    }

    let rawAddress = null;
    if (this.api.getChangeAddress) {
      rawAddress = await this.api.getChangeAddress();
    }

    if (!rawAddress && this.api.getUsedAddresses) {
      const used = await this.api.getUsedAddresses();
      if (used && used.length > 0) {
        rawAddress = used[0];
      }
    }

    this.walletAddress = decodeAddressToBech32(rawAddress, this.network);
    return this.walletAddress;
  }

  async signData(payloadHex) {
    if (!this.api || !this.walletAddress) {
      throw new Error("Wallet not connected.");
    }
    if (!payloadHex) {
      throw new Error("Payload is required for signData.");
    }

    if (typeof this.api.signData !== "function") {
      throw new Error("Connected wallet does not support CIP-30 signData.");
    }

    return this.api.signData(payloadHex, this.walletAddress);
  }

  disconnectWallet() {
    this.provider = null;
    this.api = null;
    this.walletName = null;
    this.walletAddress = null;
    localStorage.removeItem(WALLET_STORAGE_KEY);
    this.notify();
  }

  getApi() {
    return this.api;
  }

  getAddress() {
    return this.walletAddress;
  }

  getShortAddress() {
    if (!this.walletAddress) {
      return null;
    }
    return `${this.walletAddress.slice(0, 13)}...${this.walletAddress.slice(-8)}`;
  }

  getState() {
    return {
      connected: this.isConnected,
      walletName: this.walletName,
      address: this.walletAddress,
      shortAddress: this.getShortAddress(),
      network: this.network,
    };
  }

  onChange(listener) {
    if (typeof listener === "function") {
      this.listeners.push(listener);
    }
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

const walletManager = new WalletManager();

export { walletManager, decodeAddressToBech32 };
