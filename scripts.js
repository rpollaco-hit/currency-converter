/*
Currency Converter – Production++ (1,2,3)

(1) Auto moeda local (sem IP):
  - tenta Intl.Locale().maximize() -> region
  - fallback: navigator.language (pt-BR => BR)
  - fallback: timezone heurística
  - region -> moeda via mapa local REGION_TO_CURRENCY (leve)

(2) Cache offline:
  - OER latest em localStorage (TTL 1h)
  - PTAX Venda em localStorage (TTL 24h)

(3) Sem internet:
  - se fetch falhar, usa stale-cache
  - se não houver cache, mostra mensagem
*/

const OER_APP_ID = "5c2081e32d134ef2a379ef109aad3514";

// Arquivos locais
const MAP_CURRENCY_TO_CCA2_URL = "./assets/currency-to-country.json";
const FLAG_PLACEHOLDER = "./assets/flag-placeholder.svg";

// CDN das bandeiras
const FLAG_SIZE = "w80"; // w20,w40,w80,w160...

// TTLs (ms)
const OER_TTL = 60 * 60 * 1000;        // 1h
const PTAX_TTL = 24 * 60 * 60 * 1000;  // 24h

// =====================================================
// DOM
// =====================================================
const selectFrom = document.querySelector(".currency-select-from");
const selectTo = document.querySelector(".currency-select-to");
const inputAmount = document.querySelector(".input-amount");
const swapButton = document.querySelector(".swap-button");
const rateInfo = document.querySelector(".rate-info");

const fromCode = document.getElementById("fromCode");
const fromName = document.getElementById("fromName");
const fromValue = document.getElementById("fromValue");
const fromFlag = document.getElementById("fromFlag");

const toCode = document.getElementById("toCode");
const toName = document.getElementById("toName");
const toValue = document.getElementById("toValue");
const toFlag = document.getElementById("toFlag");

// =====================================================
// i18n mínimo (mensagens)
// =====================================================
const LANG = (navigator.language || "en").toLowerCase();
const UI_LANG = LANG.startsWith("pt") ? "pt" : "en";

const MSG = {
  pt: {
    offline_using_cache: "Sem internet: usando cache salvo.",
    offline_no_cache: "Sem internet e sem cache. Conecte para atualizar as cotações.",
    source_oer: (mode, date) => `Fonte: OpenExchangeRates (${mode}) • ${date}`,
    source_ptax: (mode, date) => `Fonte: BCB PTAX Venda (${mode}) • ${date}`,
    same_currency: "Mesma moeda selecionada."
  },
  en: {
    offline_using_cache: "Offline: using saved cache.",
    offline_no_cache: "Offline and no cache available. Connect to update rates.",
    source_oer: (mode, date) => `Source: OpenExchangeRates (${mode}) • ${date}`,
    source_ptax: (mode, date) => `Source: BCB PTAX Sell (${mode}) • ${date}`,
    same_currency: "Same currency selected."
  }
};

function m(key, ...args) {
  const dict = MSG[UI_LANG] || MSG.en;
  const val = dict[key];
  return typeof val === "function" ? val(...args) : (val ?? key);
}

// =====================================================
// Cache helpers (localStorage)
// =====================================================
const cacheGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const cacheSet = (k, v) => localStorage.setItem(k, JSON.stringify({ t: Date.now(), v }));
const cacheFresh = (k, ttlMs) => {
  const o = cacheGet(k);
  return (o && (Date.now() - o.t) < ttlMs) ? o.v : null;
};

/**
 * Busca com cache:
 * - se tem fresh: retorna {data, mode:"cache"}
 * - senão tenta API: se ok, salva e retorna {data, mode:"api"}
 * - se API falhar e tem stale: retorna {data, mode:"stale-cache"}
 * - se não tem nada: joga erro
 */
async function fetchWithCache(key, ttlMs, fetcher) {
  const fresh = cacheFresh(key, ttlMs);
  if (fresh) return { data: fresh, mode: "cache" };

  const stale = cacheGet(key)?.v;

  try {
    const data = await fetcher();
    cacheSet(key, data);
    return { data, mode: "api" };
  } catch (e) {
    if (stale) return { data: stale, mode: "stale-cache" };
    throw e;
  }
}

// =====================================================
// Formatação / Parse
// =====================================================
function formatNumber(v) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v);
}

function parseAmount(v) {
  const s = v.toString().trim().replace(/\s/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastDot > lastComma) return Number(s.replace(/,/g, ""));
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (lastComma > -1) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s.replace(/,/g, ""));
}

// =====================================================
// DisplayNames (nome da moeda no idioma do device)
// =====================================================
const currencyNames = new Intl.DisplayNames([navigator.language || "en"], { type: "currency" });

// =====================================================
// Flags (instant) via currency-to-country.json + FlagCDN
// =====================================================
let CURRENCY_TO_CCA2 = {};

function flagUrlFromCurrency(code) {
  const cca2 = CURRENCY_TO_CCA2[code];
  if (!cca2 || cca2.length !== 2) return FLAG_PLACEHOLDER;
  return `https://flagcdn.com/${FLAG_SIZE}/${cca2.toLowerCase()}.png`;
}

function setFlag(imgEl, code) {
  imgEl.loading = "lazy";
  imgEl.decoding = "async";
  imgEl.referrerPolicy = "no-referrer";
  imgEl.src = flagUrlFromCurrency(code);
  imgEl.alt = `${code} flag`;
}

function updateFlags() {
  setFlag(fromFlag, selectFrom.value);
  setFlag(toFlag, selectTo.value);
}

// =====================================================
// (1) Auto moeda local (sem IP)
// =====================================================

/**
 * Mapa leve region -> moeda.
 * Não precisa ser “todos”, apenas os mais comuns (você pode expandir).
 */
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
  // Melhor tentativa: Intl.Locale maximize (nem todos browsers suportam)
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
  // navigator.language ex: "pt-BR" -> "BR"
  const lang = navigator.language || "";
  const parts = lang.split("-");
  if (parts.length >= 2) return parts[1].toUpperCase();
  return "";
}

function getRegionFromTimeZoneHeuristic() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (tz.includes("Sao_Paulo")) return "BR";
  if (tz.includes("London")) return "GB";
  if (tz.includes("Dublin")) return "IE";
  if (tz.includes("New_York") || tz.includes("Los_Angeles")) return "US";
  if (tz.includes("Tokyo")) return "JP";
  if (tz.includes("Sydney")) return "AU";
  return "";
}

function guessLocalCurrency() {
  const region =
    getRegionFromIntlLocale() ||
    getRegionFromLanguage() ||
    getRegionFromTimeZoneHeuristic();

  return REGION_TO_CURRENCY[region] || "USD";
}

// =====================================================
// OpenExchangeRates (com cache)
// =====================================================
async function getOERLatestUSD() {
  if (!OER_APP_ID || OER_APP_ID.includes("COLE_SEU_APP_ID")) {
    throw new Error("Missing OpenExchangeRates APP_ID");
  }

  return fetchWithCache("oer_latest_usd", OER_TTL, async () => {
    const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(OER_APP_ID)}`;
    const res = await fetch(url);

    const json = await res.json();

    if (!res.ok || json?.error || !json?.rates) {
      throw new Error(json?.description || "OER request failed");
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

// =====================================================
// PTAX Venda (com cache) quando envolve BRL
// =====================================================

async function getPTAXVenda(moedaISO) {
  const key = `ptax_venda_${moedaISO}`;

  return fetchWithCache(key, PTAX_TTL, async () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const dataInicial = `01-${mm}-${yyyy}`;
    const dataFinal = `${mm}-${dd}-${yyyy}`;

    const url =
      `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` +
      `CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinal)?` +
      `@moeda='${moedaISO}'&@dataInicial='${dataInicial}'&@dataFinal='${dataFinal}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`;

    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok || !json?.value?.length) {
      throw new Error(`PTAX request failed for ${moedaISO}`);
    }

    return {
      cotacaoVenda: Number(json.value[0].cotacaoVenda),
      dataHoraCotacao: json.value[0].dataHoraCotacao
    };
  });
}

// =====================================================
// Lista de moedas (ordenada por nome + topo fixo)
// =====================================================
function buildCurrencyListSorted(ratesObj) {
  const preferredTop = ["BRL", "GBP", "EUR", "USD"];

  const allCodes = Object.keys(ratesObj);
  const set = new Set(allCodes);

  const top = preferredTop.filter(c => set.has(c));
  const rest = allCodes.filter(c => !preferredTop.includes(c));

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
    const text = `${name} — ${code}`;

    const opt1 = document.createElement("option");
    opt1.value = code;
    opt1.textContent = text;
    selectFrom.appendChild(opt1);

    const opt2 = opt1.cloneNode(true);
    selectTo.appendChild(opt2);
  }
}

// =====================================================
// UI update
// =====================================================
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

// =====================================================
// Conversão (online/offline)
// =====================================================

async function convertSmart(amount, from, to) {
  if (from === to) {
    return {
      converted: amount,
      meta: { source: "identity", mode: "", date: "" }
    };
  }

  const oerResp = await getOERLatestUSD();
  const oer = oerResp.data;
  const oerMode = oerResp.mode;
  const oerDate = new Date(oer.timestamp * 1000).toISOString();

  if (from === "BRL" || to === "BRL") {
    try {
      if (to === "BRL") {
        const ptResp = await getPTAXVenda(from);
        const ptax = ptResp.data;

        return {
          converted: amount * ptax.cotacaoVenda,
          meta: {
            source: "ptax",
            mode: ptResp.mode,
            date: ptax.dataHoraCotacao
          }
        };
      }

      if (from === "BRL") {
        const ptResp = await getPTAXVenda(to);
        const ptax = ptResp.data;

        return {
          converted: amount / ptax.cotacaoVenda,
          meta: {
            source: "ptax",
            mode: ptResp.mode,
            date: ptax.dataHoraCotacao
          }
        };
      }
    } catch (error) {
      const converted = convertViaUSDRates(amount, from, to, oer.rates);
      return {
        converted,
        meta: {
          source: "oer",
          mode: `fallback-${oerMode}`,
          date: oerDate
        }
      };
    }
  }

  const converted = convertViaUSDRates(amount, from, to, oer.rates);

  return {
    converted,
    meta: {
      source: "oer",
      mode: oerMode,
      date: oerDate
    }
  };
}

// debounce
let debounceTimer = null;
function scheduleConvert() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => convert(), 250);
}

async function convert() {
  const amount = parseAmount(inputAmount.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    fromValue.textContent = "—";
    toValue.textContent = "—";
    rateInfo.textContent = "";
    return;
  }

  const from = selectFrom.value;
  const to = selectTo.value;

  try {
    const { converted, meta } = await convertSmart(amount, from, to);

    fromValue.textContent = formatNumber(amount);
    toValue.textContent = formatNumber(converted);

    if (meta.source === "identity") {
      rateInfo.textContent = m("same_currency");
    } else if (meta.source === "ptax") {
      rateInfo.textContent = m("source_ptax", meta.mode, meta.date || "");
    } else {
      rateInfo.textContent = m("source_oer", meta.mode, meta.date || "");
    }
  } catch (error) {
    console.error("CONVERT ERROR:", error);
    fromValue.textContent = formatNumber(amount);
    toValue.textContent = "—";
    rateInfo.textContent = m("offline_no_cache");
  }
}

// swap
function swapCurrencies() {
  const a = selectFrom.value;
  const b = selectTo.value;
  selectFrom.value = b;
  selectTo.value = a;

  updateUI();
  convert();
}

// =====================================================
// INIT
// =====================================================
async function init() {
  // 0) carregar map de flags (local)
  const mapRes = await fetch(MAP_CURRENCY_TO_CCA2_URL);
  if (!mapRes.ok) throw new Error("Could not load assets/currency-to-country.json");
  CURRENCY_TO_CCA2 = await mapRes.json();

  // 1) carregar OER (com cache)
  const oerResp = await getOERLatestUSD();
  const oer = oerResp.data;

  // 2) montar lista
  const codes = buildCurrencyListSorted(oer.rates);
  populateSelects(codes);

  // 3) default moeda local (1)
  const local = guessLocalCurrency();
  selectFrom.value = codes.includes(local) ? local : (codes.includes("BRL") ? "BRL" : "USD");
  selectTo.value = codes.includes("USD") ? "USD" : codes[0];

  // 4) default amount
  inputAmount.value = "100";

  // 5) UI inicial
  updateUI();

  // 6) converter inicial (2/3)
  convert();

  // 7) eventos
  selectFrom.addEventListener("change", () => { updateUI(); scheduleConvert(); });
  selectTo.addEventListener("change", () => { updateUI(); scheduleConvert(); });
  inputAmount.addEventListener("input", scheduleConvert);
  swapButton.addEventListener("click", swapCurrencies);
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    console.error("INIT ERROR:", err);
    alert("Erro ao iniciar. Verifique APP_ID / internet e se assets/currency-to-country.json existe.");
  });
});