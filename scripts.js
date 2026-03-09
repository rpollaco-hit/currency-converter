const CONFIG = {
  OER_APP_ID: (window.APP_CONFIG && window.APP_CONFIG.OER_APP_ID) || "YOUR_APP_ID",
};

const DEMO_RATES = {
  USD: 1,
  EUR: 0.93,
  GBP: 0.79,
  BRL: 5.05,
  CAD: 1.35,
  AUD: 1.52,
  JPY: 149.0,
  CHF: 0.88,
  CNY: 7.20,
  INR: 83.0,
  MXN: 17.1,
};

const DEMO_MODE = !CONFIG.OER_APP_ID || CONFIG.OER_APP_ID === "YOUR_APP_ID";

const MAP_CURRENCY_TO_CCA2_URL = "./assets/currency-to-country.json";
const FLAG_PLACEHOLDER = "./assets/flag-placeholder.svg";
const FLAG_SIZE = "w80";
const OER_TTL = 60 * 60 * 1000;

const selectFrom = document.querySelector(".currency-select-from");
const selectTo = document.querySelector(".currency-select-to");
const inputAmount = document.querySelector(".input-amount");
const swapButton = document.querySelector(".swap-button");
const rateInfo = document.querySelector(".rate-info");
const statusMessage = document.getElementById("statusMessage");
const copyButton = document.getElementById("copyButton");
const installButton = document.getElementById("installButton");
const appLoading = document.getElementById("appLoading");

const fromCode = document.getElementById("fromCode");
const fromName = document.getElementById("fromName");
const fromValue = document.getElementById("fromValue");
const fromFlag = document.getElementById("fromFlag");

const toCode = document.getElementById("toCode");
const toName = document.getElementById("toName");
const toValue = document.getElementById("toValue");
const toFlag = document.getElementById("toFlag");

let deferredInstallPrompt = null;
let CURRENCY_TO_CCA2 = {};

const currencyNames = new Intl.DisplayNames([navigator.language || "en"], { type: "currency" });

const cacheGet = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};

const cacheSet = (k, v) => localStorage.setItem(k, JSON.stringify({ t: Date.now(), v }));

const cacheFresh = (k, ttlMs) => {
  const item = cacheGet(k);
  return item && Date.now() - item.t < ttlMs ? item.v : null;
};

function setStatus(message = "", type = "info") {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.classList.remove("is-info", "is-warning", "is-error");
  if (message) statusMessage.classList.add(`is-${type}`);
}

function setRateInfo(message = "") {
  if (rateInfo) rateInfo.textContent = message;
}

function hideLoadingScreen() {
  if (appLoading) appLoading.classList.add("is-hidden");
}

function formatNumber(v) {
  return new Intl.NumberFormat(navigator.language || "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function parseAmount(value) {
  const s = String(value).trim().replace(/\s/g, "");
  if (!s) return NaN;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) return Number(s.replace(/,/g, ""));
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (lastComma > -1) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s.replace(/,/g, ""));
}

function flagUrlFromCurrency(code) {
  const cca2 = CURRENCY_TO_CCA2[code];
  if (!cca2 || cca2.length !== 2) return FLAG_PLACEHOLDER;
  return `https://flagcdn.com/${FLAG_SIZE}/${cca2.toLowerCase()}.png`;
}

function setFlag(imgEl, code) {
  if (!imgEl) return;
  imgEl.src = flagUrlFromCurrency(code);
  imgEl.alt = `${code} flag`;
  imgEl.loading = "lazy";
  imgEl.decoding = "async";
}

function updateFlags() {
  setFlag(fromFlag, selectFrom.value);
  setFlag(toFlag, selectTo.value);
}

function buildCurrencyListSorted(ratesObj) {
  const preferredTop = ["BRL", "GBP", "EUR", "USD"];
  const allCodes = Object.keys(ratesObj);
  const set = new Set(allCodes);
  const top = preferredTop.filter((c) => set.has(c));
  const rest = allCodes.filter((c) => !preferredTop.includes(c));

  rest.sort((a, b) => {
    const na = currencyNames.of(a) || a;
    const nb = currencyNames.of(b) || b;
    return na.localeCompare(nb, navigator.language || "en", { sensitivity: "base" });
  });

  return [...top, ...rest];
}

function populateSelects(codes) {
  selectFrom.innerHTML = "";
  selectTo.innerHTML = "";

  for (const code of codes) {
    const name = currencyNames.of(code) || code;
    const label = `${name} — ${code}`;

    const optionFrom = document.createElement("option");
    optionFrom.value = code;
    optionFrom.textContent = label;
    selectFrom.appendChild(optionFrom);

    const optionTo = optionFrom.cloneNode(true);
    selectTo.appendChild(optionTo);
  }
}

function updateTexts() {
  const from = selectFrom.value;
  const to = selectTo.value;

  fromCode.textContent = from;
  fromName.textContent = currencyNames.of(from) || from;
  toCode.textContent = to;
  toName.textContent = currencyNames.of(to) || to;
}

function updateUI() {
  updateTexts();
  updateFlags();
}

async function fetchWithCache(key, ttlMs, fetcher) {
  const fresh = cacheFresh(key, ttlMs);
  if (fresh) return { data: fresh, mode: "cache" };

  const stale = cacheGet(key)?.v;

  try {
    const data = await fetcher();
    cacheSet(key, data);
    return { data, mode: "api" };
  } catch (error) {
    if (stale) return { data: stale, mode: "stale-cache" };
    throw error;
  }
}

async function getRates() {
  if (DEMO_MODE) {
    return {
      data: {
        timestamp: Math.floor(Date.now() / 1000),
        rates: DEMO_RATES,
      },
      mode: "demo",
    };
  }

  return fetchWithCache("oer_latest_usd", OER_TTL, async () => {
    const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(CONFIG.OER_APP_ID)}`;
    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json?.error || !json?.rates) {
      throw new Error(json?.description || "OpenExchangeRates request failed");
    }

    return json;
  });
}

function convertViaUSDRates(amount, from, to, rates) {
  const usdToFrom = from === "USD" ? 1 : Number(rates[from]);
  const usdToTo = to === "USD" ? 1 : Number(rates[to]);

  if (!Number.isFinite(usdToFrom) || !Number.isFinite(usdToTo)) {
    throw new Error(`Currency not supported: ${from} -> ${to}`);
  }

  const amountInUSD = amount / usdToFrom;
  return amountInUSD * usdToTo;
}

async function convert() {
  const amount = parseAmount(inputAmount.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    inputAmount.classList.add("is-invalid");
    fromValue.textContent = "—";
    toValue.textContent = "—";
    setRateInfo("");
    setStatus("Please enter a valid amount.", "warning");
    return;
  }

  inputAmount.classList.remove("is-invalid");

  const from = selectFrom.value;
  const to = selectTo.value;

  try {
    const ratesResp = await getRates();
    const ratesData = ratesResp.data;
    const converted = from === to ? amount : convertViaUSDRates(amount, from, to, ratesData.rates);

    fromValue.textContent = formatNumber(amount);
    toValue.textContent = formatNumber(converted);

    if (from === to) {
      setRateInfo("Same currency selected.");
    } else if (ratesResp.mode === "demo") {
      setRateInfo("Demo mode: using simulated exchange rates.");
    } else {
      const dt = new Date((ratesData.timestamp || Math.floor(Date.now() / 1000)) * 1000);
      setRateInfo(`Live rates: OpenExchangeRates (${ratesResp.mode}) • ${dt.toLocaleString()}`);
    }

    if (DEMO_MODE) {
      setStatus("Demo mode active. Add your API ID for live rates.", "info");
    } else {
      setStatus("", "info");
    }
  } catch (error) {
    console.error("CONVERT ERROR:", error);
    fromValue.textContent = formatNumber(amount);
    toValue.textContent = "—";
    setRateInfo("");
    setStatus("Unable to calculate conversion right now.", "error");
  }
}

let debounceTimer = null;
function scheduleConvert() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convert, 180);
}

function swapCurrencies() {
  const currentFrom = selectFrom.value;
  selectFrom.value = selectTo.value;
  selectTo.value = currentFrom;
  updateUI();
  scheduleConvert();
}

async function copyConvertedValue() {
  const text = toValue.textContent?.trim();
  if (!text || text === "—") {
    setStatus("Nothing to copy yet.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Converted value copied.", "info");
    setTimeout(() => {
      if (statusMessage?.textContent === "Converted value copied.") setStatus("", "info");
    }, 1800);
  } catch {
    setStatus("Could not copy the value.", "error");
  }
}

async function handleInstallClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;

    if (choiceResult?.outcome === "accepted") {
      setStatus("App installation started.", "info");
      installButton.disabled = true;
      installButton.textContent = "Installed";
    } else {
      setStatus("Installation dismissed.", "warning");
    }
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent);

  if (isIOS && isSafari) {
    setStatus('To install on iPhone/iPad: tap Share and then "Add to Home Screen".', "info");
    return;
  }

  setStatus("Installation is not available right now. Try Chrome or Edge, or check if the app is already installed.", "warning");
}

const REGION_TO_CURRENCY = {
  BR: "BRL", US: "USD", GB: "GBP", IE: "EUR", PT: "EUR", ES: "EUR", FR: "EUR",
  DE: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", AU: "AUD", CA: "CAD",
  NZ: "NZD", CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", JP: "JPY", CN: "CNY",
  IN: "INR", MX: "MXN"
};

function getRegionFromIntlLocale() {
  try {
    if (typeof Intl.Locale === "function") {
      const loc = new Intl.Locale(navigator.language);
      const max = loc.maximize ? loc.maximize() : loc;
      if (max && max.region) return String(max.region).toUpperCase();
    }
  } catch {}
  return "";
}

function getRegionFromLanguage() {
  const lang = navigator.language || "";
  const parts = lang.split("-");
  return parts.length >= 2 ? parts[1].toUpperCase() : "";
}

function guessLocalCurrency() {
  const region = getRegionFromIntlLocale() || getRegionFromLanguage();
  return REGION_TO_CURRENCY[region] || "USD";
}

async function init() {
  try {
    const mapRes = await fetch(MAP_CURRENCY_TO_CCA2_URL);
    if (mapRes.ok) {
      CURRENCY_TO_CCA2 = await mapRes.json();
    }
  } catch {
    CURRENCY_TO_CCA2 = {};
  }

  const ratesResp = await getRates();
  const codes = buildCurrencyListSorted(ratesResp.data.rates);
  populateSelects(codes);

  const local = guessLocalCurrency();
  selectFrom.value = codes.includes(local) ? local : (codes.includes("BRL") ? "BRL" : "USD");
  selectTo.value = codes.includes("USD") ? "USD" : codes[0];

  inputAmount.value = "100";
  updateUI();
  await convert();

  selectFrom.addEventListener("change", () => { updateUI(); scheduleConvert(); });
  selectTo.addEventListener("change", () => { updateUI(); scheduleConvert(); });
  inputAmount.addEventListener("input", scheduleConvert);
  swapButton.addEventListener("click", swapCurrencies);
  copyButton.addEventListener("click", copyConvertedValue);
  if (installButton) installButton.addEventListener("click", handleInstallClick);

  hideLoadingScreen();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installButton) installButton.disabled = false;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  if (installButton) {
    installButton.disabled = true;
    installButton.textContent = "Installed";
  }
  setStatus("App installed successfully.", "info");
});

document.addEventListener("DOMContentLoaded", () => {
  if (installButton) installButton.disabled = false;
  init().catch((error) => {
    console.error("INIT ERROR:", error);
    setStatus("Application could not be initialized.", "error");
    hideLoadingScreen();
  });
});
