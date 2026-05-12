// ember — logique principale
//
// Pattern calqué sur Nudge (/Users/alexv/next-move/script.js) :
//   - Init Supabase via CDN ESM jsdelivr (chargé en <script type="module"> dans index.html).
//   - Toutes les lectures/écritures DB passent par un wrapper restRequest() qui tape
//     directement /rest/v1, parce que le SDK v2 peut pendre ses promesses dans certains
//     navigateurs (mémoire feedback_supabase_rest_bypass.md). Le SDK n'est utilisé que
//     pour auth (OAuth, session, signOut).

// ───────── CONFIG À REMPLIR PAR ALEX ─────────
// Crée un projet Supabase dédié à ember, copie URL + publishable key ci-dessous,
// puis exécute les fichiers SQL dans supabase/ (schema → rls → grants).
// Active OAuth Google dans Authentication → Providers.
const SUPABASE_URL = "https://akoodxuhhahhvhkvkwwu.supabase.co";
const SUPABASE_KEY = "sb_publishable_VHjPBsTKF69i5hQ5C6DOcw_UxtWeNmw";
// ─────────────────────────────────────────────

const SUPABASE_REST = SUPABASE_URL + "/rest/v1";
// Triggers d'envie de fumer — liste consolidée à partir de :
//   - NHS Better Health (UK) "Understand your smoking triggers and cravings"
//   - National Cancer Institute (cancer.gov) "Tips for Coping with Nicotine Withdrawal and Triggers"
//   - Tabac Info Service (FR) "Je découvre mon profil de fumeur"
//   - CDC "Why Quitting Smoking Is Hard"
// 18 entrées organisées mentalement : 6 émotions, 3 consommables, 6 moments / activités, 3 divers.
const TRIGGER_LABELS = {
  // Émotions
  stress: "Stress",
  anxiete: "Anxiété",
  ennui: "Ennui",
  frustration: "Frustration",
  tristesse: "Tristesse",
  joie: "Joie",
  // Consommables / repas
  cafe: "Café",
  alcool: "Alcool",
  repas: "Repas",
  // Moments / activités
  pause: "Pause",
  reveil: "Réveil",
  soiree: "Soirée",
  conduite: "Conduite",
  attente: "Attente",
  social: "Social",
  // Divers
  telephone: "Téléphone",
  habitude: "Habitude",
  autre: "Autre",
};

let supabase = null;
let state = {
  user: null,
  plan: null,
  cigarettes: [],        // 30 derniers jours
  lastCigaretteId: null,
  delayTimer: null,
  chartInstance: null,
  chartRange: 14,        // 7 | 14 | 30 jours visibles
};

// ───────── Helpers DOM ─────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$(".screen").forEach((el) => el.classList.toggle("active", el.id === id));
  const showNav = ["screen-main", "screen-stats", "screen-settings"].includes(id);
  const nav = $("#bottom-nav");
  nav.hidden = !showNav;
  $$(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === id);
  });
  window.scrollTo(0, 0);
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function fmtTime(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
function fmtMinSec(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return pad2(m) + ":" + pad2(s);
}
function fmtDateFr(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function isoDate(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function daysBetween(a, b) {
  const ms = startOfDay(b) - startOfDay(a);
  return Math.round(ms / 86400000);
}

// ───────── Init Supabase ─────────
function initSupabaseClient() {
  if (!window.__createSupabaseClient) return false;
  supabase = window.__createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      lock: (_name, _timeout, fn) => fn(),
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
    },
  });
  return true;
}

function getAccessToken() {
  // Supabase stocke en localStorage sous une clé dérivée de l'URL.
  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const raw = localStorage.getItem("sb-" + projectRef + "-auth-token");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token);
  } catch { return null; }
}

async function restRequest(path, init = {}) {
  const token = getAccessToken();
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(SUPABASE_REST + path, { ...init, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (!res.ok) {
    return { data: null, error: { message: (data && data.message) || text || res.statusText, status: res.status } };
  }
  return { data, error: null };
}

// ───────── Auth ─────────
async function signInGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) alert("Erreur de connexion : " + error.message);
}

async function signOut() {
  try { await supabase.auth.signOut(); } catch {}
  state.user = null;
  state.plan = null;
  state.cigarettes = [];
  showScreen("screen-auth");
}

async function ensureSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.user;
}

// ───────── Data load ─────────
async function loadQuitPlan() {
  const { data, error } = await restRequest(
    "/quit_plan?user_id=eq." + state.user.id + "&select=*&limit=1"
  );
  if (error) {
    console.error("loadQuitPlan", error);
    return null;
  }
  return (data && data[0]) || null;
}

async function loadCigarettes30d() {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const isoSince = since.toISOString();
  const { data, error } = await restRequest(
    "/cigarettes?user_id=eq." + state.user.id +
    "&smoked_at=gte." + encodeURIComponent(isoSince) +
    "&select=id,smoked_at,trigger_tag,note&order=smoked_at.desc"
  );
  if (error) {
    console.error("loadCigarettes30d", error);
    return [];
  }
  return data || [];
}

async function insertCigarette() {
  const row = { user_id: state.user.id, smoked_at: new Date().toISOString() };
  const { data, error } = await restRequest("/cigarettes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (error) {
    alert("Erreur d'enregistrement : " + error.message);
    return null;
  }
  return (data && data[0]) || null;
}

async function updateTrigger(cigId, trigger) {
  const { error } = await restRequest(
    "/cigarettes?id=eq." + cigId,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ trigger_tag: trigger }),
    }
  );
  if (error) console.error("updateTrigger", error);
}

async function upsertQuitPlan(plan) {
  // Le pattern UPSERT PostgREST : envoyer la ligne complète sur la table en POST
  // avec Prefer: resolution=merge-duplicates. Le user_id est la PK.
  const payload = { user_id: state.user.id, ...plan };
  const { data, error } = await restRequest("/quit_plan", {
    method: "POST",
    headers: {
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });
  if (error) {
    console.error("upsertQuitPlan", error);
    return null;
  }
  return (data && data[0]) || null;
}

// ───────── Plan effectif ─────────
function effectiveQuota(plan) {
  if (!plan) return 15;
  const start = new Date(plan.start_date + "T00:00:00");
  const weeks = Math.max(0, Math.floor(daysBetween(start, new Date()) / 7));
  const reduced = plan.daily_quota - (plan.weekly_reduction || 0) * weeks;
  return Math.max(1, reduced);
}

// ───────── Écran main : rendu ─────────
function renderMain() {
  const now = new Date();
  $("#header-date").textContent = fmtDateFr(now);

  const today = startOfDay(now);
  const todayCigs = state.cigarettes.filter((c) => new Date(c.smoked_at) >= today);
  const quota = effectiveQuota(state.plan);

  // Compteur
  $("#counter-value").textContent = todayCigs.length;
  $("#counter-quota").textContent = quota;
  const counterEl = $("#counter-value");
  counterEl.classList.toggle("is-warning", todayCigs.length >= quota * 0.8 && todayCigs.length < quota);
  counterEl.classList.toggle("is-danger", todayCigs.length >= quota);

  // Status texte
  let status;
  if (todayCigs.length === 0) status = "Aucune clope aujourd'hui. Tiens bon.";
  else if (todayCigs.length < quota) status = "Tu es dans ton quota.";
  else if (todayCigs.length === quota) status = "Quota atteint. Chaque clope en plus est un choix.";
  else status = "Au-delà de ton quota (+" + (todayCigs.length - quota) + ").";
  $("#counter-status").textContent = status;

  // Délai vs dernière clope
  const last = state.cigarettes[0];
  state.lastCigaretteId = last ? last.id : null;
  updateDelayDisplay(now);

  // Chips
  $("#chip-avg-interval").textContent = computeAvgInterval(todayCigs);
  $("#chip-yesterday").textContent = computeYesterdayCount(state.cigarettes);
  $("#chip-last").textContent = last ? fmtTime(new Date(last.smoked_at)) : "—";
}

function computeAvgInterval(todayCigs) {
  if (todayCigs.length < 2) return "—";
  const sorted = [...todayCigs].sort((a, b) => new Date(a.smoked_at) - new Date(b.smoked_at));
  let sumMin = 0;
  for (let i = 1; i < sorted.length; i++) {
    sumMin += (new Date(sorted[i].smoked_at) - new Date(sorted[i - 1].smoked_at)) / 60000;
  }
  const avg = Math.round(sumMin / (sorted.length - 1));
  if (avg >= 60) return Math.floor(avg / 60) + "h" + pad2(avg % 60);
  return avg + " min";
}

function computeYesterdayCount(allCigs) {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return allCigs.filter((c) => {
    const t = new Date(c.smoked_at);
    return t >= yesterday && t < today;
  }).length;
}

function updateDelayDisplay(now) {
  const last = state.cigarettes[0];
  const minDelay = (state.plan && state.plan.min_delay_minutes) || 60;
  const btn = $("#btn-plus-one");
  const todayCigs = state.cigarettes.filter((c) => new Date(c.smoked_at) >= startOfDay(now));
  const quota = effectiveQuota(state.plan);
  const overQuota = todayCigs.length >= quota;

  if (!last) {
    $("#delay-label").textContent = "Disponible";
    $("#delay-label").classList.remove("is-pending");
    $("#delay-countdown").hidden = true;
    btn.classList.remove("is-pending");
    btn.classList.toggle("is-over-quota", overQuota);
    return;
  }

  const elapsedSec = Math.floor((now - new Date(last.smoked_at)) / 1000);
  const remainSec = minDelay * 60 - elapsedSec;

  if (remainSec > 0) {
    $("#delay-label").textContent = "Prochaine dispo dans";
    $("#delay-label").classList.add("is-pending");
    $("#delay-countdown").textContent = fmtMinSec(remainSec);
    $("#delay-countdown").hidden = false;
    btn.classList.add("is-pending");
    btn.classList.remove("is-over-quota");
  } else {
    $("#delay-label").textContent = "Disponible";
    $("#delay-label").classList.remove("is-pending");
    $("#delay-countdown").hidden = true;
    btn.classList.remove("is-pending");
    btn.classList.toggle("is-over-quota", overQuota);
  }
}

function startDelayTimer() {
  if (state.delayTimer) clearInterval(state.delayTimer);
  state.delayTimer = setInterval(() => updateDelayDisplay(new Date()), 1000);
}

// ───────── Bouton +1 : flux principal ─────────
async function handlePlusOne() {
  const now = new Date();
  const last = state.cigarettes[0];
  const minDelay = (state.plan && state.plan.min_delay_minutes) || 60;
  const todayCount = state.cigarettes.filter((c) => new Date(c.smoked_at) >= startOfDay(now)).length;
  const quota = effectiveQuota(state.plan);

  // 1. Délai en cours ?
  if (last) {
    const elapsedMin = (now - new Date(last.smoked_at)) / 60000;
    if (elapsedMin < minDelay) {
      const remainMin = Math.ceil(minDelay - elapsedMin);
      const ok = await confirmDialog(
        "Tu fumes avant le délai",
        "Il restait " + remainMin + " min avant ta prochaine clope prévue. Tu es sûr ?"
      );
      if (!ok) return;
    }
  }

  // 2. Au-delà du quota ?
  if (todayCount >= quota) {
    const ok = await confirmDialog(
      "Quota atteint",
      "Tu as déjà fumé " + todayCount + " clope" + (todayCount > 1 ? "s" : "") +
        " aujourd'hui (quota : " + quota + "). Tu veux vraiment continuer ?"
    );
    if (!ok) return;
  }

  // 3. INSERT
  const inserted = await insertCigarette();
  if (!inserted) return;

  state.cigarettes.unshift(inserted);
  state.lastCigaretteId = inserted.id;
  renderMain();

  // 4. Modal trigger (skippable)
  openTriggerModal(inserted.id);
}

function confirmDialog(title, body) {
  return new Promise((resolve) => {
    $("#modal-confirm-title").textContent = title;
    $("#modal-confirm-body").textContent = body;
    $("#modal-confirm").hidden = false;
    const okBtn = $("#btn-confirm-ok");
    const cancelBtn = $("#btn-confirm-cancel");
    const cleanup = () => {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      $("#modal-confirm").hidden = true;
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

function openTriggerModal(cigId) {
  $("#modal-trigger").hidden = false;
  $("#modal-trigger").dataset.cigId = cigId;
}

function closeTriggerModal() {
  $("#modal-trigger").hidden = true;
}

// ───────── Stats ─────────
function renderStats() {
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
function renderDailyChart() {
  const ctx = $("#chart-daily").getContext("2d");
  const n = state.chartRange;
  const buckets = dailyBuckets(n);
  const start = startDate();
  const labels = buckets.map((b) => pad2(b.date.getDate()) + "/" + pad2(b.date.getMonth() + 1));
  const counts = buckets.map((b) => b.count);
  const preStart = buckets.map((b) => b.date < start);      // booléen par jour

  // Coloration : barre gris pâle si jour pré-sevrage, ambre sinon
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

  // Construit un tableau de booléens "under_quota" par jour, du start à hier inclus.
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

// ───────── Settings ─────────
function fillSettingsForm() {
  if (!state.plan) return;
  $("#set-quota").value = state.plan.daily_quota;
  $("#set-delay").value = state.plan.min_delay_minutes;
  $("#set-weekly").value = state.plan.weekly_reduction || 0;
  $("#set-price").value = state.plan.price_per_pack || 12.5;
  $("#set-cigs-per-pack").value = state.plan.cigs_per_pack || 20;
}

async function saveSettings() {
  const updates = {
    daily_quota: parseInt($("#set-quota").value, 10) || 15,
    min_delay_minutes: parseInt($("#set-delay").value, 10) || 60,
    weekly_reduction: parseInt($("#set-weekly").value, 10) || 0,
    price_per_pack: parseFloat($("#set-price").value) || 12.5,
    cigs_per_pack: parseInt($("#set-cigs-per-pack").value, 10) || 20,
  };
  const saved = await upsertQuitPlan(updates);
  if (saved) {
    state.plan = saved;
    $("#settings-feedback").textContent = "Enregistré.";
    setTimeout(() => { $("#settings-feedback").textContent = ""; }, 2000);
  } else {
    $("#settings-feedback").textContent = "Erreur d'enregistrement.";
  }
}

function exportJSON() {
  const blob = new Blob(
    [JSON.stringify({ plan: state.plan, cigarettes: state.cigarettes }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ember-" + isoDate(new Date()) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ───────── Onboarding ─────────
let onbStep = 1;
function showOnboardingStep(step) {
  onbStep = step;
  $$(".onb-step").forEach((el) => {
    el.hidden = parseInt(el.dataset.step, 10) !== step;
  });
  $("#onb-step-indicator").textContent = step + " / 3";
  $("#btn-onb-back").hidden = step === 1;
  $("#btn-onb-next").textContent = step === 3 ? "Terminer" : "Suivant";
}

async function finishOnboarding() {
  const plan = {
    daily_quota: parseInt($("#onb-quota").value, 10) || 15,
    min_delay_minutes: parseInt($("#onb-delay").value, 10) || 60,
    weekly_reduction: 1,
    price_per_pack: parseFloat($("#onb-price").value) || 12.5,
    cigs_per_pack: parseInt($("#onb-cigs-per-pack").value, 10) || 20,
    start_date: isoDate(new Date()),
  };
  const saved = await upsertQuitPlan(plan);
  if (!saved) {
    alert("Impossible d'enregistrer ton plan. Vérifie ta connexion.");
    return;
  }
  state.plan = saved;
  await enterApp();
}

// ───────── Boot ─────────
async function enterApp() {
  state.cigarettes = await loadCigarettes30d();
  showScreen("screen-main");
  renderMain();
  startDelayTimer();
  fillSettingsForm();
}

// Garantit un temps minimum sur le splash pour que la respiration du logo
// ait le temps de se jouer avant la transition (sinon on flash l'écran auth).
function holdSplash(start, minMs) {
  const remaining = Math.max(0, minMs - (Date.now() - start));
  return new Promise((r) => setTimeout(r, remaining));
}

async function boot() {
  if (!initSupabaseClient()) {
    window.addEventListener("supabase-loaded", boot, { once: true });
    return;
  }
  if (SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    document.body.innerHTML =
      '<div style="padding:32px;color:#e6e8eb;font-family:system-ui;max-width:560px;margin:40px auto;line-height:1.5">' +
      '<h1 style="color:#ff8c42">Ember — config manquante</h1>' +
      "<p>Remplis <code>SUPABASE_URL</code> et <code>SUPABASE_KEY</code> dans <code>script.js</code> (en haut du fichier), " +
      "puis exécute les SQL du dossier <code>supabase/</code> dans Supabase Studio.</p></div>";
    return;
  }

  const splashStart = Date.now();
  const MIN_SPLASH_MS = 1900;     // 1.9s ≈ moins d'un cycle complet de respiration

  const user = await ensureSession();
  if (!user) {
    await holdSplash(splashStart, MIN_SPLASH_MS);
    showScreen("screen-auth");
    return;
  }
  state.user = user;
  state.plan = await loadQuitPlan();

  await holdSplash(splashStart, MIN_SPLASH_MS);

  if (!state.plan) {
    showScreen("screen-onboarding");
    showOnboardingStep(1);
    return;
  }
  await enterApp();
}

// ───────── Event wiring ─────────
function wireEvents() {
  $("#btn-google").addEventListener("click", signInGoogle);
  $("#btn-plus-one").addEventListener("click", handlePlusOne);
  $("#btn-logout").addEventListener("click", signOut);
  $("#btn-save-settings").addEventListener("click", saveSettings);
  $("#btn-export").addEventListener("click", exportJSON);

  // Bottom nav
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      showScreen(target);
      if (target === "screen-stats") renderStats();
      if (target === "screen-settings") fillSettingsForm();
    });
  });

  // Onboarding
  $("#btn-onb-next").addEventListener("click", () => {
    if (onbStep < 3) showOnboardingStep(onbStep + 1);
    else finishOnboarding();
  });
  $("#btn-onb-back").addEventListener("click", () => {
    if (onbStep > 1) showOnboardingStep(onbStep - 1);
  });

  // Sélecteur de range pour le graphe (7/14/30 jours)
  $$(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const range = parseInt(btn.dataset.range, 10);
      if (!range || range === state.chartRange) return;
      state.chartRange = range;
      $$(".range-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderDailyChart();
    });
  });

  // Modal trigger
  $$(".trigger-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cigId = $("#modal-trigger").dataset.cigId;
      const tag = btn.dataset.trigger;
      closeTriggerModal();
      if (!cigId) return;
      await updateTrigger(cigId, tag);
      const cig = state.cigarettes.find((c) => c.id === cigId);
      if (cig) cig.trigger_tag = tag;
    });
  });
  $("#btn-trigger-skip").addEventListener("click", closeTriggerModal);
}

// Démarrage
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { wireEvents(); boot(); });
} else {
  wireEvents();
  boot();
}
