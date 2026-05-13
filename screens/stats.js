// Écran stats : semaine, graphe quotidien, heatmap, triggers,
// économies, bilan cumulé, série.
//
// Chart.js est chargé en <script> classique dans index.html et expose
// la classe globale `Chart` sur window — on l'utilise telle quelle ici.

import { state, TRIGGER_LABELS } from "../state.js";
import { $, pad2, startOfDay, daysBetween } from "../utils.js";
import { effectiveQuota } from "./main.js";

export function renderStats() {
  renderWeekly();
  renderDailyChart();
  renderHeatmap();
  renderTriggerList();
  renderSavings();
  renderCumul();
  renderStreak();
}

// Renvoie un tableau {date: Date, count: number} pour les N derniers jours,
// du plus ancien au plus récent. N inclut aujourd'hui.
function dailyBuckets(nDays) {
  const today = startOfDay(new Date());
  const out = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({ date: d, count: 0 });
  }
  for (const c of state.cigarettes) {
    const t = startOfDay(new Date(c.smoked_at));
    const diff = daysBetween(t, today);
    if (diff >= 0 && diff < nDays) out[nDays - 1 - diff].count++;
  }
  return out;
}

function startDate() {
  return state.plan && state.plan.start_date
    ? new Date(state.plan.start_date + "T00:00:00")
    : startOfDay(new Date());
}

function daysSinceStart() {
  return daysBetween(startDate(), new Date()) + 1;   // inclut aujourd'hui (J+1 dès le premier jour)
}

// ─── Cette semaine vs la précédente ───
function renderWeekly() {
  const today = startOfDay(new Date());
  const end = new Date(today);
  end.setDate(end.getDate() + 1);                    // exclusif
  const startCur = new Date(today);
  startCur.setDate(startCur.getDate() - 6);          // 7 derniers jours, today inclus
  const endPrev = new Date(startCur);
  const startPrev = new Date(startCur);
  startPrev.setDate(startPrev.getDate() - 7);

  const count = (from, to) =>
    state.cigarettes.filter((c) => {
      const t = new Date(c.smoked_at);
      return t >= from && t < to;
    }).length;

  const cur = count(startCur, end);
  const prev = count(startPrev, endPrev);

  $("#week-current").textContent = cur;
  $("#week-previous").textContent = prev > 0 ? prev : "—";

  const deltaEl = $("#week-delta");
  deltaEl.classList.remove("is-positive", "is-negative", "is-neutral");
  if (prev === 0) {
    deltaEl.textContent = "—";
    deltaEl.classList.add("is-neutral");
  } else {
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct < 0) {
      deltaEl.textContent = pct + " %";
      deltaEl.classList.add("is-positive");          // baisse = bon = vert
    } else if (pct > 0) {
      deltaEl.textContent = "+" + pct + " %";
      deltaEl.classList.add("is-negative");
    } else {
      deltaEl.textContent = "0 %";
      deltaEl.classList.add("is-neutral");
    }
  }
}

// ─── Graphe quotidien ───
export function renderDailyChart() {
  const ctx = $("#chart-daily").getContext("2d");
  const n = state.chartRange;
  const buckets = dailyBuckets(n);
  const start = startDate();
  const labels = buckets.map((b) => pad2(b.date.getDate()) + "/" + pad2(b.date.getMonth() + 1));
  const counts = buckets.map((b) => b.count);
  const preStart = buckets.map((b) => b.date < start);      // booléen par jour

  const colors = preStart.map((p) => (p ? "rgba(138, 143, 150, 0.35)" : "#ff8c42"));
  const quota = effectiveQuota(state.plan);
  const quotaLine = buckets.map((b) => (b.date >= start ? quota : null));

  $("#chart-title").textContent = n + " derniers jours";

  if (state.chartInstance) state.chartInstance.destroy();
  state.chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Clopes",
          data: counts,
          backgroundColor: colors,
          borderRadius: 3,
          maxBarThickness: 18,
        },
        {
          label: "Quota",
          data: quotaLine,
          type: "line",
          borderColor: "#8a8f96",
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      scales: {
        x: { ticks: { color: "#8a8f96", maxTicksLimit: 7 }, grid: { display: false } },
        y: {
          ticks: { color: "#8a8f96", precision: 0 },
          grid: { color: "#2c3036" },
          beginAtZero: true,
          suggestedMax: quota + 2,
        },
      },
      plugins: {
        legend: { labels: { color: "#e6e8eb", boxWidth: 12 } },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const idx = items[0].dataIndex;
              return preStart[idx] ? "(avant le début du sevrage)" : "";
            },
          },
        },
      },
    },
  });
}

// ─── Heatmap heures × jours ───
function renderHeatmap() {
  const wrap = $("#heatmap");
  const placeholder = $("#heatmap-placeholder");
  const days = daysSinceStart();
  if (days < 7 || state.cigarettes.length < 5) {
    wrap.hidden = true;
    placeholder.hidden = false;
    return;
  }
  wrap.hidden = false;
  placeholder.hidden = true;
  wrap.innerHTML = "";

  const buckets = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of state.cigarettes) {
    const t = new Date(c.smoked_at);
    let dow = t.getDay() - 1;
    if (dow < 0) dow = 6;
    buckets[dow][t.getHours()]++;
  }
  let max = 1;
  for (const row of buckets) for (const v of row) if (v > max) max = v;
  const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];

  const corner = document.createElement("div");
  corner.className = "heatmap-row-label";
  wrap.appendChild(corner);
  for (let h = 0; h < 24; h++) {
    const cell = document.createElement("div");
    cell.className = "heatmap-row-label";
    cell.textContent = h % 6 === 0 ? h + "h" : "";
    wrap.appendChild(cell);
  }
  for (let d = 0; d < 7; d++) {
    const lbl = document.createElement("div");
    lbl.className = "heatmap-row-label";
    lbl.textContent = dayLabels[d];
    wrap.appendChild(lbl);
    for (let h = 0; h < 24; h++) {
      const v = buckets[d][h];
      const level = v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4));
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.dataset.level = level;
      cell.title = dayLabels[d] + " " + h + "h : " + v + " clope" + (v > 1 ? "s" : "");
      wrap.appendChild(cell);
    }
  }
  wrap.style.gridTemplateRows = "16px repeat(7, 1fr)";
}

// ─── Triggers ───
function renderTriggerList() {
  const counts = {};
  for (const c of state.cigarettes) {
    if (c.trigger_tag) counts[c.trigger_tag] = (counts[c.trigger_tag] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const ul = $("#trigger-list");
  ul.innerHTML = "";
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Aucun trigger renseigné pour l'instant.";
    ul.appendChild(li);
    return;
  }
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const max = entries[0][1];
  for (const [tag, count] of entries) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = TRIGGER_LABELS[tag] || tag;
    const bar = document.createElement("div");
    bar.className = "trigger-bar";
    const fill = document.createElement("div");
    fill.className = "trigger-bar-fill";
    fill.style.width = (count / max) * 100 + "%";
    bar.appendChild(fill);
    const num = document.createElement("span");
    num.className = "trigger-count";
    const pct = Math.round((count / total) * 100);
    num.textContent = count + " · " + pct + " %";
    li.appendChild(name);
    li.appendChild(bar);
    li.appendChild(num);
    ul.appendChild(li);
  }
}

// ─── Économies ───
function renderSavings() {
  if (!state.plan) return;
  const pricePerCig = (state.plan.price_per_pack || 0) / (state.plan.cigs_per_pack || 20);
  const start = startDate();
  const days = daysSinceStart();
  const real = state.cigarettes.filter((c) => new Date(c.smoked_at) >= start).length;
  const baseline = state.plan.daily_quota * days;
  const avoided = Math.max(0, baseline - real);
  const savings = avoided * pricePerCig;

  const startStr = start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  if (days < 3) {
    $("#savings-amount").textContent = "À mesurer";
    $("#savings-detail").textContent =
      "Reviens dans " + (3 - days) + " jour" + (3 - days > 1 ? "s" : "") + " pour une estimation fiable.";
    $("#savings-avoided").textContent = "";
    return;
  }

  $("#savings-amount").textContent = savings.toFixed(2).replace(".", ",") + " €";
  $("#savings-detail").textContent =
    "Depuis le " + startStr + " (" + days + " jour" + (days > 1 ? "s" : "") + ").";
  $("#savings-avoided").textContent =
    avoided + " clope" + (avoided > 1 ? "s" : "") + " évitée" + (avoided > 1 ? "s" : "") +
    " par rapport à ta baseline de " + state.plan.daily_quota + "/j.";
}

// ─── Bilan cumulé depuis le début ───
function renderCumul() {
  if (!state.plan) return;
  const start = startDate();
  const days = daysSinceStart();
  const real = state.cigarettes.filter((c) => new Date(c.smoked_at) >= start).length;
  const baseline = state.plan.daily_quota * days;
  const diff = baseline - real;
  const lineEl = $("#cumul-line");
  const detailEl = $("#cumul-detail");

  lineEl.innerHTML =
    "J+" + days + " · " + real + " clope" + (real !== 1 ? "s" : "") + " fumée" + (real !== 1 ? "s" : "") +
    " sur un quota cumulé de " + baseline + ".";
  if (diff > 0) {
    detailEl.innerHTML = "Tu es <strong style='color:var(--success)'>" + diff +
      "</strong> en dessous de l'objectif. Continue.";
  } else if (diff === 0) {
    detailEl.textContent = "Tu es pile sur ton objectif.";
  } else {
    detailEl.innerHTML = "Tu es <strong style='color:var(--danger)'>" + Math.abs(diff) +
      "</strong> au-dessus de l'objectif. Pas grave, on rattrape.";
  }
}

// ─── Série actuelle + record ───
function renderStreak() {
  const start = startOfDay(startDate());
  const today = startOfDay(new Date());
  const quota = effectiveQuota(state.plan);

  // Booléens "under_quota" par jour, du start à hier inclus.
  const flags = [];
  let day = new Date(start);
  while (day < today) {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const count = state.cigarettes.filter((c) => {
      const t = new Date(c.smoked_at);
      return t >= day && t < next;
    }).length;
    flags.push(count < quota);
    day = next;
  }

  // Série actuelle : nb de true consécutifs en partant de la fin
  let current = 0;
  for (let i = flags.length - 1; i >= 0; i--) {
    if (flags[i]) current++;
    else break;
  }

  // Record : max run de true dans tout l'historique
  let record = 0, run = 0;
  for (const f of flags) {
    if (f) { run++; if (run > record) record = run; }
    else { run = 0; }
  }

  $("#streak-value").textContent =
    current + " jour" + (current !== 1 ? "s" : "") + " consécutif" + (current !== 1 ? "s" : "") + " sous quota";
  if (flags.length === 0) {
    $("#streak-record").textContent = "L'historique commencera demain.";
  } else if (record === current) {
    $("#streak-record").textContent = "C'est ton record. Tiens bon.";
  } else {
    $("#streak-record").textContent = "Record : " + record + " jour" + (record !== 1 ? "s" : "") + ".";
  }
}
