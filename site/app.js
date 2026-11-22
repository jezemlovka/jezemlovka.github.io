const TELEGRAM_URL = "https://t.me/hlidac_zemlovky";

import { resolveStatus } from "./status.js";

const BAR_URLS = {
  jzp: "https://www.automatmatuska.cz/aktualne-na-cepu-jzp/",
  dejvice: "https://www.automatmatuska.cz/aktualne-na-cepu-dejvice/",
};
const COPY = {
  present: ["Žemlovka je na čepu!", "Všeho nech a běž."],
  absent: ["Žemlovka není.", "Sucho. Zatím."],
  unknown: ["Teď nevíme.", "Mrkni radši přímo na nabídku."],
  loading: ["Koukáme na čep…", ""],
};
const WORDS = { present: "na čepu", absent: "není", unknown: "nevíme", loading: "…" };
const DEMOS = {
  "present-jzp": ["present", "absent"],
  "present-dejvice": ["absent", "present"],
  "present-both": ["present", "present"],
  absent: ["absent", "absent"],
  unknown: ["unknown", "unknown"],
  loading: null,
};
const FETCH_TIMEOUT = 6000;
const REFRESH_EVERY = 5 * 60 * 1000;
const RETRY_AFTER = 30 * 1000;
const POUR_TIME = 2000;

const root = document.documentElement;
const headline = document.getElementById("headline");
const line = document.getElementById("line");
const live = document.getElementById("live");
const rows = new Map(
  [...document.querySelectorAll("[data-bar]")].map((row) => [row.dataset.bar, row]),
);

const prague = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function inPrague(date) {
  const parts = Object.fromEntries(prague.formatToParts(date).map((p) => [p.type, p.value]));
  const day = Number(parts.day);
  const month = Number(parts.month);
  // A calendar day number, so that "včera" survives the 23- and 25-hour days.
  const dayNumber = Date.UTC(Number(parts.year), month - 1, day) / 86400000;
  return { day, month, dayNumber, clock: `${parts.hour}:${parts.minute}` };
}

function formatTime(date) {
  if (!date) return "–";
  const then = inPrague(date);
  const age = inPrague(new Date()).dayNumber - then.dayNumber;
  if (age === 0) return `dnes ${then.clock}`;
  if (age === 1) return `včera ${then.clock}`;
  return `${then.day}. ${then.month}. ${then.clock}`;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

let shown = "";
let answered = ""; // the last answer that came from data, not from a failed request
let pourTimer;
let pourWhenVisible = false;

function pour() {
  pourWhenVisible = document.hidden;
  if (pourWhenVisible) return;
  root.classList.add("pour");
  pourTimer = setTimeout(stopPour, POUR_TIME);
}

function stopPour() {
  clearTimeout(pourTimer);
  root.classList.remove("pour");
}

function render({ overall, bars }, fromData = true) {
  for (const { key, status, checkedAt } of bars) {
    const row = rows.get(key);
    row.dataset.status = status;
    setText(row.querySelector(".word"), WORDS[status]);
    setText(row.querySelector(".when"), formatTime(checkedAt));
  }

  setText(headline, COPY[overall][0]);
  setText(line, COPY[overall][1]);
  setText(
    live,
    overall === "loading"
      ? COPY.loading[0]
      : [
          COPY[overall][0],
          ...bars.map((bar) => {
            const name = rows.get(bar.key).querySelector(".bar").textContent;
            return `${name}: ${WORDS[bar.status]}.`;
          }),
        ].join(" "),
  );

  root.dataset.ready = "";
  if (overall !== shown) {
    shown = overall;
    stopPour();
    pourWhenVisible = false;
    root.dataset.state = overall;
    // a dropped connection in between is not news
    if (overall === "present" && answered !== "present") pour();
  }
  if (fromData) answered = overall;
}

function showLoading() {
  const bars = Object.keys(BAR_URLS).map((key) => ({ key, status: "loading", checkedAt: null }));
  render({ overall: "loading", bars }, false);
}

let request;
let retry;
let lastData;

async function refresh() {
  request?.abort();
  clearTimeout(retry);
  // after a night in a pocket the old answer may have expired already
  if (lastData !== undefined) render(resolveStatus(lastData), lastData !== null);

  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  let data = null;
  try {
    const response = await fetch(`./status.json?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`status.json: ${response.status}`);
    data = await response.json();
  } catch {
    data = null; // any failure is "unknown", never "absent"
  } finally {
    clearTimeout(timeout);
  }
  // A newer request owns the page; an older one must not overwrite it.
  if (request !== controller) return;

  lastData = data;
  render(resolveStatus(data), data !== null);
  if (data === null && !document.hidden) retry = setTimeout(refresh, RETRY_AFTER);
}

function showDemo(name) {
  document.querySelector(".demo").hidden = false;
  const statuses = DEMOS[name];
  if (!statuses) return showLoading();
  const checked_at = new Date().toISOString();
  const bars = Object.keys(BAR_URLS).map((key, i) => ({
    key,
    status: statuses[i],
    checked_at: statuses[i] === "unknown" ? null : checked_at,
  }));
  render(resolveStatus({ version: 1, bars }));
}

document.getElementById("telegram").href = TELEGRAM_URL;
for (const [key, url] of Object.entries(BAR_URLS)) rows.get(key).querySelector("a").href = url;

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && pourWhenVisible) pour();
});

const demo = new URLSearchParams(location.search).get("demo");
if (Object.hasOwn(DEMOS, demo ?? "")) {
  showDemo(demo);
} else {
  showLoading();
  refresh();
  setInterval(refresh, REFRESH_EVERY);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  addEventListener("online", refresh);
}
