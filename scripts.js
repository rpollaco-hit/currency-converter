const DEFAULT_CONFIG = {
  OER_APP_ID: "YOUR_APP_ID",
  MAP_CURRENCY_TO_CCA2_URL: "./assets/currency-to-country.json",
  FLAG_PLACEHOLDER: "./assets/flag-placeholder.svg",
  FLAG_SIZE: "w80",
  OER_TTL: 60 * 60 * 1000,
  PTAX_TTL: 24 * 60 * 60 * 1000
};

const APP_CONFIG = (typeof window !== "undefined" && window.APP_CONFIG) ? window.APP_CONFIG : {};
const urlParams = new URLSearchParams(window.location.search);
const urlApiKey = urlParams.get("apikey") || urlParams.get("app_id") || "";

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...APP_CONFIG,
  OER_APP_ID: (urlApiKey || APP_CONFIG.OER_APP_ID || DEFAULT_CONFIG.OER_APP_ID).trim()
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
  SEK: 10.45,
  DKK: 6.94,
  NOK: 10.63,
  NZD: 1.64,
  CNY: 7.19,
  INR: 82.95,
  MXN: 16.92
};

const DEMO_MODE = !CONFIG.OER_APP_ID || CONFIG.OER_APP_ID === "YOUR_APP_ID";

const selectFrom = document.querySelector(".currency-select-from");
const selectTo = document.querySelector(".currency-select-to");
const inputAmount = document.querySelector(".input-amount");
const swapButton = document.querySelector(".swap-button");
const rateInfo = document.querySelector(".rate-info");
const statusMessage = document.querySelector(".status-message");
const copyResultButton = document.getElementById("copyResultButton");

const fromCode = document.getElementById("fromCode");
const fromName = document.getElementById("fromName");
const fromValue = document.getElementById("fromValue");
const fromFlag = document.getElementById("fromFlag");

const toCode = document.getElementById("toCode");
const toName = document.getElementById("toName");
const toValue = document.getElementById("toValue");
const toFlag = document.getElementById("toFlag");

const browserLang = navigator.language || "en-US";
const uiLang = browserLang.toLowerCase().startsWith("pt") ? "pt" : "en";
const numberFormatter = new Intl.NumberFormat(browserLang, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const currencyNames = new Intl.DisplayNames([browserLang], { type: "currency" });

const messages = {
  pt: {
    enter_amount: "Informe um valor válido para converter.",
    same_currency: "Mesma moeda selecionada.",
    copy_success: "Valor convertido copiado.",
    copy_empty: "Nenhum valor convertido disponível para copiar.",
    init_error: "Não foi possível iniciar a aplicação. Verifique a conexão e os arquivos da pasta assets.",
    source_oer: (mode, date) => `Fonte: OpenExchangeRates (${mode}) • ${date}`,
    source_ptax: (mode, date) => `Fonte: BCB PTAX Venda (${mode}) • ${date}`,
    source_demo: "Fonte: Demo mode com taxas simuladas.",
    config_hint: "Dica: crie config.js com sua APP_ID ou use ?apikey=SUA_CHAVE para habilitar cotações em tempo real.",
    demo_mode: "Modo demonstração ativo: usando taxas simuladas. Adicione sua APP_ID em config.js ou use ?apikey=SUA_CHAVE para cotações em tempo real.",
    fallback_cache: "Cotações indisponíveis no momento. Usando cache salvo, quando disponível.",
    offline_no_cache: "Sem conexão e sem cache disponível. Conecte-se para atualizar as cotações."
  },
  en: {
    enter_amount: "Enter a valid amount to convert.",
    same_currency: "Same currency selected.",
    copy_success: "Converted value copied.",
    copy_empty: "No converted value available to copy.",
    init_error: "Unable to start the application. Check your connection and the assets folder.",
    source_oer: (mode, date) => `Source: OpenExchangeRates (${mode}) • ${date}`,
    source_ptax: (mode, date) => `Source: BCB PTAX Sell (${mode}) • ${date}`,
    source_demo: "Source: Demo mode using simulated exchange rates.",
    config_hint: "Tip: create config.js with your APP_ID or use ?apikey=YOUR_KEY to enable live rates.",
    demo_mode: "Demo mode active: using simulated exchange rates. Add your APP_ID in config.js or pass ?apikey=YOUR_KEY for live rates.",
    fallback_cache: "Live rates are unavailable right now. Using saved cache when possible.",
    offline_no_cache: "Offline and no cache available. Connect to refresh rates."
  }
};

function t(key, ...args) {
  const dict = messages[uiLang] || messages.en;
  const value = dict[key];
  return typeof value === "function" ? value(...args) : (value ?? key);
}

function setStatus(message = "", type = "info") {
  statusMessage.textContent = message;
  statusMessage.className = "status-message";
  if (message) {
    statusMessage.classList.add(`is-${type}`);
  }
}

function clearStatus() {
  setStatus("");
}

function showConfigurationHint() {
  if (DEMO_MODE) {
    setStatus(`${t("demo_mode")} ${t("config_hint")}`, "info");
  }
}

const cacheGet = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

const cacheSet = (key, value) => {
  localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
};

const cacheFresh = (key, ttlMs) => {
  const cached = cacheGet(key);
  return cached && Date.now() - cached.t < ttlMs ? cached.v : null;
};

async function fetchWithCache(key, ttlMs, fetcher) {
  const fresh = cacheFresh(key, ttlMs);
  if (fresh) {
    return { data: fresh, mode: "cache" };
  }

  const stale = cacheGet(key)?.v;

  try {
    const data = await fetcher();
    cacheSet(key, data);
    return { data, mode: "api" };
  } catch (error) {
    if (stale) {
      return { data: stale, mode: "stale-cache" };
    }
    throw error;
  }
}

function formatNumber(value) {
  return numberFormatter.format(value);
}

function parseAmount(value) {
  const normalized = value.toString().trim().replace(/\s/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) {
      return Number(normalized.replace(/,/g, ""));
    }
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }

  if (lastComma > -1) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }

  return Number(normalized.replace(/,/g, ""));
}

let currencyToCountry = {};

function flagUrlFromCurrency(code) {
  const cca2 = currencyToCountry[code];
  if (!cca2 || cca2.length !== 2) {
    return CONFIG.FLAG_PLACEHOLDER;
  }
  return `https://flagcdn.com/${CONFIG.FLAG_SIZE}/${cca2.toLowerCase()}.png`;
}

function setFlag(imgElement, code) {
  imgElement.loading = "lazy";
  imgElement.decoding = "async";
  imgElement.referrerPolicy = "no-referrer";
  imgElement.src = flagUrlFromCurrency(code);
  imgElement.alt = `${code} flag`;
}

function updateFlags() {
  setFlag(fromFlag, selectFrom.value);
  setFlag(toFlag, selectTo.value);
}

const REGION_TO_CURRENCY = {
  BR: "BRL",
  US: "USD",
  GB: "GBP",
  IE: "EUR",
  PT: "EUR",
  ES: "EUR",
  FR: "EUR",
  DE: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  AU: "AUD",
  CA: "CAD",
  NZ: "NZD",
  CH: "CHF",
  NO: "NOK",
  SE: "SEK",
  DK: "DKK",
  JP: "JPY",
  CN: "CNY",
  IN: "INR",
  MX: "MXN"
};

function getRegionFromIntlLocale() {
  try {
    if (typeof Intl.Locale === "function") {
      const locale = new Intl.Locale(browserLang);
      const maximized = locale.maximize ? locale.maximize() : locale;
      if (maximized?.region) {
        return String(maximized.region).toUpperCase();
      }
    }
  } catch {
    return "";
  }
  return "";
}

function getRegionFromLanguage() {
  const parts = browserLang.split("-");
  return parts.length >= 2 ? parts[1].toUpperCase() : "";
}

function getRegionFromTimeZoneHeuristic() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (timezone.includes("Sao_Paulo") || timezone.includes("Araguaina")) return "BR";
  if (timezone.includes("London")) return "GB";
  if (timezone.includes("Dublin")) return "IE";
  if (timezone.includes("New_York") || timezone.includes("Los_Angeles")) return "US";
  if (timezone.includes("Tokyo")) return "JP";
  if (timezone.includes("Sydney")) return "AU";
  return "";
}

function guessLocalCurrency() {
  const region = getRegionFromIntlLocale() || getRegionFromLanguage() || getRegionFromTimeZoneHeuristic();
  return REGION_TO_CURRENCY[region] || "USD";
}

async function getLatestRatesUSD() {
  if (DEMO_MODE) {
    return {
      data: {
        timestamp: Math.floor(Date.now() / 1000),
        rates: DEMO_RATES
      },
      mode: "demo"
    };
  }

  return fetchWithCache("oer_latest_usd", CONFIG.OER_TTL, async () => {
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

async function getPTAXSell(currencyISO) {
  const key = `ptax_sell_${currencyISO}`;

  return fetchWithCache(key, CONFIG.PTAX_TTL, async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const startDate = `01-${month}-${year}`;
    const endDate = `${month}-${day}-${year}`;

    const url =
      `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` +
      `CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinal)?` +
      `@moeda='${currencyISO}'&@dataInicial='${startDate}'&@dataFinal='${endDate}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`;

    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || !json?.value?.length) {
      throw new Error(`PTAX request failed for ${currencyISO}`);
    }

    return {
      cotacaoVenda: Number(json.value[0].cotacaoVenda),
      dataHoraCotacao: json.value[0].dataHoraCotacao
    };
  });
}

function buildCurrencyListSorted(ratesObject) {
  const preferredTop = ["BRL", "GBP", "EUR", "USD"];
  const allCodes = Object.keys(ratesObject);
  const set = new Set(allCodes);
  const top = preferredTop.filter((code) => set.has(code));
  const rest = allCodes.filter((code) => !preferredTop.includes(code));

  rest.sort((codeA, codeB) => {
    const nameA = currencyNames.of(codeA) || codeA;
    const nameB = currencyNames.of(codeB) || codeB;
    return nameA.localeCompare(nameB, browserLang, { sensitivity: "base" });
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

async function convertSmart(amount, from, to) {
  if (from === to) {
    return { converted: amount, meta: { source: "identity", mode: "", date: "" } };
  }

  const ratesResponse = await getLatestRatesUSD();
  const latestRates = ratesResponse.data;
  const latestMode = ratesResponse.mode;
  const latestDate = new Date(latestRates.timestamp * 1000).toISOString();

  if (DEMO_MODE) {
    return {
      converted: convertViaUSDRates(amount, from, to, latestRates.rates),
      meta: { source: "demo", mode: latestMode, date: latestDate }
    };
  }

  if (from === "BRL" || to === "BRL") {
    try {
      if (to === "BRL") {
        const ptResponse = await getPTAXSell(from);
        const ptax = ptResponse.data;
        return {
          converted: amount * ptax.cotacaoVenda,
          meta: { source: "ptax", mode: ptResponse.mode, date: ptax.dataHoraCotacao }
        };
      }

      if (from === "BRL") {
        const ptResponse = await getPTAXSell(to);
        const ptax = ptResponse.data;
        return {
          converted: amount / ptax.cotacaoVenda,
          meta: { source: "ptax", mode: ptResponse.mode, date: ptax.dataHoraCotacao }
        };
      }
    } catch {
      return {
        converted: convertViaUSDRates(amount, from, to, latestRates.rates),
        meta: { source: "oer", mode: `fallback-${latestMode}`, date: latestDate }
      };
    }
  }

  return {
    converted: convertViaUSDRates(amount, from, to, latestRates.rates),
    meta: { source: "oer", mode: latestMode, date: latestDate }
  };
}

let debounceTimer = null;

function scheduleConvert() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    convert();
  }, 250);
}

function resetResult() {
  fromValue.textContent = "—";
  toValue.textContent = "—";
  rateInfo.textContent = "";
}

async function convert() {
  const amount = parseAmount(inputAmount.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    inputAmount.classList.add("is-invalid");
    resetResult();
    setStatus(t("enter_amount"), "warning");
    return;
  }

  inputAmount.classList.remove("is-invalid");
  if (!DEMO_MODE) {
    clearStatus();
  }

  const from = selectFrom.value;
  const to = selectTo.value;

  try {
    const { converted, meta } = await convertSmart(amount, from, to);

    fromValue.textContent = formatNumber(amount);
    toValue.textContent = formatNumber(converted);

    if (meta.source === "identity") {
      rateInfo.textContent = t("same_currency");
    } else if (meta.source === "ptax") {
      rateInfo.textContent = t("source_ptax", meta.mode, meta.date || "");
    } else if (meta.source === "demo") {
      rateInfo.textContent = t("source_demo");
    } else {
      rateInfo.textContent = t("source_oer", meta.mode, meta.date || "");
    }

    if (meta.mode === "stale-cache" || String(meta.mode).includes("fallback")) {
      setStatus(t("fallback_cache"), "warning");
    } else if (DEMO_MODE) {
      setStatus(t("demo_mode"), "info");
    }
  } catch (error) {
    console.error("CONVERT ERROR:", error);
    fromValue.textContent = formatNumber(amount);
    toValue.textContent = "—";
    rateInfo.textContent = "";
    setStatus(t("offline_no_cache"), "error");
  }
}

function swapCurrencies() {
  const from = selectFrom.value;
  const to = selectTo.value;
  selectFrom.value = to;
  selectTo.value = from;
  updateUI();
  convert();
}

async function copyConvertedValue() {
  const value = toValue.textContent?.trim();
  if (!value || value === "—") {
    setStatus(t("copy_empty"), "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setStatus(t("copy_success"), "info");
  } catch (error) {
    console.error("COPY ERROR:", error);
    setStatus(t("copy_empty"), "warning");
  }
}

async function init() {
  const mapResponse = await fetch(CONFIG.MAP_CURRENCY_TO_CCA2_URL);
  if (!mapResponse.ok) {
    throw new Error("Could not load currency-to-country map");
  }
  currencyToCountry = await mapResponse.json();

  const ratesResponse = await getLatestRatesUSD();
  const latestRates = ratesResponse.data;
  const codes = buildCurrencyListSorted(latestRates.rates);
  populateSelects(codes);

  const localCurrency = guessLocalCurrency();
  selectFrom.value = codes.includes(localCurrency) ? localCurrency : (codes.includes("BRL") ? "BRL" : "USD");
  selectTo.value = codes.includes("USD") ? "USD" : codes[0];

  inputAmount.value = "100";
  updateUI();
  await convert();

  selectFrom.addEventListener("change", () => {
    updateUI();
    scheduleConvert();
  });

  selectTo.addEventListener("change", () => {
    updateUI();
    scheduleConvert();
  });

  inputAmount.addEventListener("input", scheduleConvert);
  swapButton.addEventListener("click", swapCurrencies);
  copyResultButton.addEventListener("click", copyConvertedValue);
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error("INIT ERROR:", error);
    resetResult();
    setStatus(t("init_error"), "error");
  });
});
