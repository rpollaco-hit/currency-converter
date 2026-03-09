function getAppId() {
  return (window.APP_CONFIG && window.APP_CONFIG.OER_APP_ID) || "YOUR_APP_ID";
}

function isDemoMode() {
  const appId = getAppId();
  return !appId || appId === "YOUR_APP_ID";
}

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

const I18N = {
  en: {
    tooltipFrom: "Choose the currency you want to convert from.",
    tooltipTo: "Choose the currency you want to convert to.",
    tooltipAmount: "Enter the amount to convert.",
    tooltipSwap: "Swap the selected currencies.",
    tooltipRate: "Shows whether rates are simulated or live.",
    tooltipInstall: "Install this app on your device.",
    tooltipCopy: "Copy the converted amount.",
    loadingText: "Loading exchange tools...",
    installUnavailable: "Installation is not available right now. Try Chrome or Edge, or check if the app is already installed.",
    iosInstall: 'To install on iPhone/iPad: tap Share and then "Add to Home Screen".',
    installStarted: "App installation started.",
    installDismissed: "Installation dismissed.",
    installedOk: "App installed successfully.",
    invalidAmount: "Please enter a valid amount.",
    nothingToCopy: "Nothing to copy yet.",
    copied: "Converted value copied.",
    copyFailed: "Could not copy the value.",
    sameCurrency: "Same currency selected.",
    demoRate: "Demo mode: using simulated exchange rates.",
    demoInfo: "Demo mode active. Add your API ID for live rates.",
    modeLive: "Execution mode: Live API",
    modeCache: "Execution mode: Cached rates",
    modeFallback: "Execution mode: Fallback cache",
    modeOffline: "Execution mode: Offline cache",
    modeDemoLabel: "Execution mode: Demo",
    statusLive: "Connected to live exchange rates.",
    statusCache: "Using cached exchange rates saved on this device.",
    statusFallback: "Live request failed. Using the last saved exchange rates.",
    statusOffline: "You appear to be offline. Using saved exchange rates.",
    calcError: "Unable to calculate conversion right now.",
    initError: "Application could not be initialized."
  },
  pt: {
    tooltipFrom: "Escolha a moeda de origem da conversão.",
    tooltipTo: "Escolha a moeda de destino da conversão.",
    tooltipAmount: "Informe o valor que deseja converter.",
    tooltipSwap: "Inverte as moedas selecionadas.",
    tooltipRate: "Mostra se a cotação está simulada ou ao vivo.",
    tooltipInstall: "Instale este app no seu dispositivo.",
    tooltipCopy: "Copia o valor convertido.",
    loadingText: "Carregando ferramentas de câmbio...",
    installUnavailable: "A instalação não está disponível agora. Tente no Chrome ou Edge, ou verifique se o app já está instalado.",
    iosInstall: 'Para instalar no iPhone/iPad: toque em Compartilhar e depois em "Adicionar à Tela de Início".',
    installStarted: "Instalação do app iniciada.",
    installDismissed: "Instalação cancelada.",
    installedOk: "App instalado com sucesso.",
    invalidAmount: "Informe um valor válido.",
    nothingToCopy: "Ainda não há valor para copiar.",
    copied: "Valor convertido copiado.",
    copyFailed: "Não foi possível copiar o valor.",
    sameCurrency: "A mesma moeda foi selecionada.",
    demoRate: "Modo demonstração: usando taxas simuladas.",
    demoInfo: "Modo demonstração ativo. Adicione seu APP ID para cotações reais.",
    modeLive: "Modo de execução: API online",
    modeCache: "Modo de execução: Cache local",
    modeFallback: "Modo de execução: Cache de contingência",
    modeOffline: "Modo de execução: Offline com cache",
    modeDemoLabel: "Modo de execução: Demonstração",
    statusLive: "Conectado às cotações online.",
    statusCache: "Usando cotações em cache salvas neste dispositivo.",
    statusFallback: "A chamada online falhou. Usando a última cotação salva.",
    statusOffline: "Você parece estar offline. Usando cotações salvas.",
    calcError: "Não foi possível calcular a conversão agora.",
    initError: "Não foi possível inicializar o aplicativo."
  }
};

const localeLang = (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
const t = I18N[localeLang];

const MAP_CURRENCY_TO_CCA2_URL = "./assets/currency-to-country.json";
const FLAG_PLACEHOLDER = "./assets/flag-placeholder.svg";
const FLAG_SIZE = "w80";
const OER_TTL = 60 * 60 * 1000;

const selectFrom = document.querySelector(".currency-select-from");
const selectTo = document.querySelector(".currency-select-to");
const inputAmount = document.querySelector(".input-amount");
const swapButton = document.getElementById("swapButton");
const rateInfo = document.getElementById("rateInfo");
const statusMessage = document.getElementById("statusMessage");
const copyButton = document.getElementById("copyButton");
const installButton = document.getElementById("installButton");
const appLoading = document.getElementById("appLoading");
const loadingTextNode = document.querySelector(".app-loading__text");

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

function applyLocalizedTooltips() {
  selectFrom.title = t.tooltipFrom;
  selectTo.title = t.tooltipTo;
  inputAmount.title = t.tooltipAmount;
  if (swapButton) swapButton.title = t.tooltipSwap;
  if (rateInfo) rateInfo.title = t.tooltipRate;
  if (installButton) installButton.title = t.tooltipInstall;
  if (copyButton) copyButton.title = t.tooltipCopy;
  if (loadingTextNode) loadingTextNode.textContent = t.loadingText;
}

const cacheGet = (k) => {
  try { return JSON.parse(localStorage.getItem(k)); }
  catch { return null; }
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

function getExecutionModeMeta(ratesResp, ratesData, fromEqualsTo = false) {
  if (fromEqualsTo) {
    return {
      rateText: t.sameCurrency,
      statusText: isDemoMode() ? t.demoInfo : "",
      statusType: isDemoMode() ? "info" : "info",
    };
  }

  if (ratesResp.mode === "demo") {
    return {
      rateText: t.demoRate,
      statusText: t.demoInfo,
      statusType: "info",
    };
  }

  const dt = new Date((ratesData.timestamp || Math.floor(Date.now() / 1000)) * 1000);
  const when = dt.toLocaleString();

  if (ratesResp.mode === "api") {
    return {
      rateText: `${t.modeLive}: OpenExchangeRates • ${when}`,
      statusText: t.statusLive,
      statusType: "info",
    };
  }

  if (ratesResp.mode === "cache") {
    return {
      rateText: `${t.modeCache}: OpenExchangeRates • ${when}`,
      statusText: t.statusCache,
      statusType: "warning",
    };
  }

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return {
    rateText: `${offline ? t.modeOffline : t.modeFallback}: OpenExchangeRates • ${when}`,
    statusText: offline ? t.statusOffline : t.statusFallback,
    statusType: "warning",
  };
}

async function getRates() {
  if (isDemoMode()) {
    return {
      data: {
        timestamp: Math.floor(Date.now() / 1000),
        rates: DEMO_RATES,
      },
      mode: "demo",
    };
  }

  return fetchWithCache("oer_latest_usd", OER_TTL, async () => {
    const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(getAppId())}`;
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
    setStatus(t.invalidAmount, "warning");
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

    const executionMeta = getExecutionModeMeta(ratesResp, ratesData, from === to);
    setRateInfo(executionMeta.rateText);
    setStatus(executionMeta.statusText, executionMeta.statusType);
  } catch (error) {
    console.error("CONVERT ERROR:", error);
    fromValue.textContent = formatNumber(amount);
    toValue.textContent = "—";
    setRateInfo("");
    setStatus(t.calcError, "error");
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
    setStatus(t.nothingToCopy, "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus(t.copied, "info");
    setTimeout(() => {
      if (statusMessage?.textContent === t.copied) setStatus("", "info");
    }, 1800);
  } catch {
    setStatus(t.copyFailed, "error");
  }
}

async function handleInstallClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;

    if (choiceResult?.outcome === "accepted") {
      setStatus(t.installStarted, "info");
      installButton.disabled = true;
    } else {
      setStatus(t.installDismissed, "warning");
    }
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent);

  if (isIOS && isSafari) {
    setStatus(t.iosInstall, "info");
    return;
  }

  setStatus(t.installUnavailable, "warning");
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
  applyLocalizedTooltips();

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
  if (swapButton) swapButton.addEventListener("click", swapCurrencies);
  if (copyButton) copyButton.addEventListener("click", copyConvertedValue);
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
  if (installButton) installButton.disabled = true;
  setStatus(t.installedOk, "info");
});

document.addEventListener("DOMContentLoaded", () => {
  if (installButton) installButton.disabled = false;
  init().catch((error) => {
    console.error("INIT ERROR:", error);
    setStatus(t.initError, "error");
    hideLoadingScreen();
  });
});
