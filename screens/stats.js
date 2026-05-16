// Écran stats : semaine, graphe quotidien, heatmap, triggers,
// économies, bilan cumulé, série.
//
// Chart.js est chargé en <script> classique dans index.html et expose
// la classe globale `Chart` sur window — on l'utilise telle quelle ici.

import { state, TRIGGER_LABELS, TRIGGER_TIPS, getCurrentCigarettes } from "../state.js";
import { $, pad2, startOfDay, daysBetween } from "../utils.js";
import { effectiveQuota, effectiveBaseline, quotaOnDate } from "./main.js";
import { getLabels } from "../labels.js";
import { upsertQuitPlan } from "../db.js";

export function renderStats() {
  // Masque ou révèle la section "Économies" selon le mode courant. En mode
  // pastille, les substituts coûtent → afficher des "économies" serait trompeur.
  const savingsSection = document.querySelector(".stat-savings");
  if (savingsSection) savingsSection.hidden = !getLabels().showSavings;

  renderWeekly();
  renderDailyChart();
  renderQuotaTrajectory();
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
  for (const c of getCurrentCigarettes()) {
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

// Somme des quotas effectifs jour par jour, du début à aujourd'hui inclus.
// Comme le quota baisse chaque semaine, on ne peut pas faire quota×jours :
// il faut additionner le quota réellement applicable chaque jour.
function cumulativeQuota() {
  const start = startOfDay(startDate());
  const today = startOfDay(new Date());
  let total = 0;
  const d = new Date(start);
  while (d <= today) {
    total += quotaOnDate(state.plan, d);
    d.setDate(d.getDate() + 1);
  }
  return total;
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

  const myCigs = getCurrentCigarettes();
  const count = (from, to) =>
    myCigs.filter((c) => {
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

// ─── Trajectoire du quota ───
// Rend visible le moteur silencieux de l'app : le quota baisse de
// `weekly_reduction` toutes les 7 jours. On affiche le quota du jour, la
// prochaine marche (valeur + date), et la date d'arrivée au plancher (1/j).
function renderQuotaTrajectory() {
  if (!state.plan) return;
  const plan = state.plan;
  const start = startOfDay(startDate());
  const today = startOfDay(new Date());
  const reduction = plan.weekly_reduction || 0;
  const current = effectiveQuota(plan);

  $("#traj-current").textContent = "Quota actuel : " + current + " / jour";
  const nextEl = $("#traj-next");
  const goalEl = $("#traj-goal");
  // Le stepper reflète toujours la valeur courante : réglable à la main,
  // dans les deux sens, 0 inclus → aucune action à sens unique.
  const valEl = $("#traj-redux-val");
  if (valEl) valEl.textContent = reduction;

  if (reduction <= 0) {
    nextEl.textContent =
      "Quota figé à " + current + "/jour. Monte la réduction pour qu'il baisse tout seul vers l'arrêt.";
    goalEl.textContent = "";
    return;
  }
  if (current <= 1) {
    nextEl.textContent = "Tu es au plancher : 1 / jour. Le dernier palier.";
    goalEl.textContent = "";
    return;
  }

  const weeks = Math.max(0, Math.floor(daysBetween(start, today) / 7));
  const nextDate = new Date(start);
  nextDate.setDate(nextDate.getDate() + (weeks + 1) * 7);
  const nextQuota = Math.max(1, plan.daily_quota - reduction * (weeks + 1));
  const inDays = daysBetween(today, nextDate);
  const whenStr = nextDate.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });
  nextEl.textContent =
    "Prochaine baisse : " + nextQuota + " / jour dans " +
    inDays + " jour" + (inDays > 1 ? "s" : "") + " (" + whenStr + ").";

  // Date d'arrivée au plancher : nb de semaines pour que le quota touche 1.
  const weeksToFloor = Math.ceil((plan.daily_quota - 1) / reduction);
  const floorDate = new Date(start);
  floorDate.setDate(floorDate.getDate() + weeksToFloor * 7);
  const floorStr = floorDate.toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
  goalEl.textContent = "À ce rythme, quota de 1/jour atteint le " + floorStr + ".";
}

// Ajuste la réduction hebdo de ±1 depuis le stepper de la carte Trajectoire.
// Bornée [0, 10] : 0 = quota figé (réversible à tout moment). merge-duplicates
// ne touche que `weekly_reduction`. app.js rafraîchit ensuite main + settings.
export async function adjustWeeklyReduction(delta) {
  if (!state.plan) return false;
  const cur = state.plan.weekly_reduction || 0;
  const next = Math.max(0, Math.min(10, cur + delta));
  if (next === cur) return false;            // déjà à la borne : no-op
  const saved = await upsertQuitPlan({ weekly_reduction: next });
  if (!saved) {
    alert("Impossible d'enregistrer. Vérifie ta connexion.");
    return false;
  }
  state.plan = saved;
  renderStats();
  return true;
}

// ─── Heatmap des heures ───
// Progressif : tant qu'il n'y a pas ~3 semaines de données, la grille
// jour×heure (7×24 = 168 cases) n'aurait ~1 échantillon par case → bruit
// pur, aucun « motif » visible malgré la promesse du sous-titre. On montre
// donc d'abord une vue HEURES SEULES (24 cases), utile dès 7 jours et
// cohérente avec le texte « Quelles heures de la journée ». Le jour×heure
// n'apparaît qu'une fois qu'il devient statistiquement lisible.
const HEATMAP_GRID_DAYS = 21;

function renderHeatmap() {
  const wrap = $("#heatmap");
  const placeholder = $("#heatmap-placeholder");
  const note = $("#heatmap-note");
  const days = daysSinceStart();
  const myCigs = getCurrentCigarettes();

  if (days < 7 || myCigs.length < 5) {
    wrap.hidden = true;
    placeholder.hidden = false;
    if (note) note.hidden = true;
    return;
  }
  wrap.hidden = false;
  placeholder.hidden = true;
  wrap.innerHTML = "";

  const fmtTitle = (h, v) => {
    const L = getLabels();
    return pad2(h) + "h — " + v + " " + (v === 1 ? L.unit : L.unitPlural);
  };

  if (days < HEATMAP_GRID_DAYS) {
    // ── Vue heures seules (1 ligne de 24) ──
    const hours = Array(24).fill(0);
    for (const c of myCigs) hours[new Date(c.smoked_at).getHours()]++;
    let max = 1;
    for (const v of hours) if (v > max) max = v;

    const corner = document.createElement("div");
    corner.className = "heatmap-row-label";
    wrap.appendChild(corner);
    for (let h = 0; h < 24; h++) {
      const lbl = document.createElement("div");
      lbl.className = "heatmap-row-label";
      lbl.textContent = h % 6 === 0 ? h + "h" : "";
      wrap.appendChild(lbl);
    }
    const rowLbl = document.createElement("div");
    rowLbl.className = "heatmap-row-label";
    wrap.appendChild(rowLbl);
    for (let h = 0; h < 24; h++) {
      const v = hours[h];
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.dataset.level = v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4));
      cell.title = fmtTitle(h, v);
      wrap.appendChild(cell);
    }
    wrap.style.gridTemplateRows = "16px 1fr";
    if (note) {
      note.hidden = false;
      note.textContent =
        "Vue par heure. La grille jour × heure arrive vers " +
        HEATMAP_GRID_DAYS + " jours, quand les motifs deviennent fiables.";
    }
    return;
  }

  // ── Grille jour × heure (7×24) ──
  if (note) note.hidden = true;
  const buckets = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of myCigs) {
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
      cell.title = getLabels().heatmapCellTitle(dayLabels[d], h, v);
      wrap.appendChild(cell);
    }
  }
  wrap.style.gridTemplateRows = "16px repeat(7, 1fr)";
}

// ─── Triggers ───
function renderTriggerList() {
  const allCigs = getCurrentCigarettes();
  const counts = {};
  for (const c of allCigs) {
    if (c.trigger_tag) counts[c.trigger_tag] = (counts[c.trigger_tag] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const entries = sorted.slice(0, 6);
  const ul = $("#trigger-list");
  const tipEl = $("#trigger-tip");
  const covEl = $("#trigger-coverage");
  ul.innerHTML = "";
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Aucun trigger renseigné pour l'instant.";
    ul.appendChild(li);
    tipEl.hidden = true;
    if (covEl) covEl.hidden = true;
    return;
  }

  // % calculés sur TOUTES les clopes taguées (pas seulement le top 6) pour
  // ne pas fausser les parts, et couverture affichée pour rappeler que les
  // clopes non taguées ne sont pas dans ces %.
  const taggedTotal = sorted.reduce((s, [, n]) => s + n, 0);
  if (covEl) {
    covEl.hidden = false;
    covEl.textContent =
      taggedTotal + "/" + allCigs.length + " clopes taguées — les % portent sur les taguées.";
  }

  // Conseil ciblé sur le trigger n°1 : c'est là que l'app crée de la valeur,
  // sinon tagger ne sert à rien. entries est déjà trié par fréquence desc.
  const topTag = entries[0][0];
  const tip = TRIGGER_TIPS[topTag];
  if (tip) {
    tipEl.innerHTML =
      "<strong>" + (TRIGGER_LABELS[topTag] || topTag) +
      "</strong> est ton déclencheur n°1. " + tip;
    tipEl.hidden = false;
  } else {
    tipEl.hidden = true;
  }
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
    const pct = Math.round((count / taggedTotal) * 100);
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
  // Section masquée par renderStats() en mode pastille — on no-op aussi ici
  // au cas où la fonction serait appelée directement ailleurs.
  if (!getLabels().showSavings) return;
  const pricePerCig = (state.plan.price_per_pack || 0) / (state.plan.cigs_per_pack || 20);
  const start = startDate();
  const days = daysSinceStart();
  const real = getCurrentCigarettes().filter((c) => new Date(c.smoked_at) >= start).length;
  // Référence = ce que l'user fumait AVANT de réduire (figé), pas son quota.
  // C'est ça qui donne le vrai nombre de clopes / d'euros évités.
  const ref = effectiveBaseline(state.plan);
  const baseline = ref * days;
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
    getLabels().savingsAvoided(avoided, ref);
}

// ─── Bilan cumulé depuis le début ───
function renderCumul() {
  if (!state.plan) return;
  const start = startDate();
  const days = daysSinceStart();
  const real = getCurrentCigarettes().filter((c) => new Date(c.smoked_at) >= start).length;
  // Objectif cumulé = somme des quotas dégressifs jour par jour (la cible se
  // resserre avec le temps), et non l'ancienne conso de référence.
  const objective = cumulativeQuota();
  const diff = objective - real;
  const lineEl = $("#cumul-line");
  const detailEl = $("#cumul-detail");

  lineEl.textContent = getLabels().cumulLine(days, real, objective);
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

  // Booléens "sous quota" par jour, du start à AUJOURD'HUI inclus. Le quota
  // de référence est celui réellement applicable ce jour-là (il baisse chaque
  // semaine), pas le quota d'aujourd'hui appliqué rétroactivement.
  // Aujourd'hui compte tant qu'il n'est pas encore dépassé : la journée reste
  // « sauvable », on ne casse pas la série tant que tu n'as pas franchi la
  // limite — c'est plus juste et ça maintient la motivation en cours de route.
  const myCigs = getCurrentCigarettes();
  const flags = [];
  let day = new Date(start);
  while (day <= today) {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const count = myCigs.filter((c) => {
      const t = new Date(c.smoked_at);
      return t >= day && t < next;
    }).length;
    // Réussite = être DANS son quota (≤), pas strictement en dessous.
    // Atteindre pile sa limite, c'est avoir tenu son objectif, pas échoué :
    // traiter un jour à 12 (quota 12) comme un échec est démotivant et
    // injuste vs un jour à 30. La tolérance s'arrête là (pas de marge floue
    // au-delà, qui serait impossible à expliquer simplement).
    flags.push(count <= quotaOnDate(state.plan, day));
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

  // Chiffre HÉROS = part des jours dans le quota (métrique robuste : une
  // mauvaise journée ne l'efface pas). La série consécutive — fragile et
  // sujette à l'effet « tant pis pour aujourd'hui » qui fait rechuter — est
  // reléguée en ligne secondaire, jamais affichée comme un échec sec.
  const goodDays = flags.filter(Boolean).length;
  const pct = flags.length ? Math.round((goodDays / flags.length) * 100) : 0;

  const valEl = $("#streak-value");
  const recEl = $("#streak-record");

  if (flags.length === 0) {
    valEl.textContent = "À suivre";
    recEl.textContent = "L'historique commence aujourd'hui.";
    return;
  }

  // Héros : le %, avec le détail brut juste derrière.
  valEl.textContent = pct + " % de jours dans ton quota";

  const detail =
    goodDays + "/" + flags.length + " jours · série en cours " +
    current + " j · record " + record + " j.";

  let note;
  if (current === 0) {
    // Anti-rechute : un écart ne disqualifie pas l'effort global.
    note = "Hier au-dessus, mais le reste compte : " + pct +
      " % de tes jours tiennent. Repars de là, sans tout remettre à zéro.";
  } else if (current === record && record >= 2) {
    note = "Tu es sur ta meilleure période. Continue.";
  } else if (pct >= 70) {
    note = "Tendance solide. C'est ça qui compte sur la durée, pas un jour isolé.";
  } else {
    note = "Chaque jour dans le quota fait monter ce pourcentage. Vise-le.";
  }
  recEl.textContent = detail + " " + note;
}
