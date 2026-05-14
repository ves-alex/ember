// Écran principal : compteur du jour, bouton +1, délai, chips,
// et les deux modals (confirmation bypass / sélection trigger).

import { state, getCurrentCigarettes } from "../state.js";
import {
  $, $$, pad2, fmtTime, fmtMinSec, fmtDateFr, startOfDay, daysBetween,
} from "../utils.js";
import { insertCigarette } from "../db.js";
import { getLabels } from "../labels.js";

export function effectiveQuota(plan) {
  if (!plan) return 15;
  const start = new Date(plan.start_date + "T00:00:00");
  const weeks = Math.max(0, Math.floor(daysBetween(start, new Date()) / 7));
  const reduced = plan.daily_quota - (plan.weekly_reduction || 0) * weeks;
  return Math.max(1, reduced);
}

export function renderMain() {
  const now = new Date();
  $("#header-date").textContent = fmtDateFr(now);

  const today = startOfDay(now);
  const myCigs = getCurrentCigarettes();
  const todayCigs = myCigs.filter((c) => new Date(c.smoked_at) >= today);
  const quota = effectiveQuota(state.plan);

  $("#counter-value").textContent = todayCigs.length;
  $("#counter-quota").textContent = quota;
  const counterEl = $("#counter-value");
  counterEl.classList.toggle("is-warning", todayCigs.length >= quota * 0.8 && todayCigs.length < quota);
  counterEl.classList.toggle("is-danger", todayCigs.length >= quota);

  const L = getLabels();
  let status;
  if (todayCigs.length === 0) status = L.counterZero;
  else if (todayCigs.length < quota) status = L.counterInQuota;
  else if (todayCigs.length === quota) status = L.counterAtQuota;
  else status = L.counterOverQuota(todayCigs.length - quota);
  $("#counter-status").textContent = status;

  // Labels dynamiques sur le bouton +1 (le texte HTML est juste un placeholder
  // initial, c'est ce render qui le rend cohérent avec le mode courant).
  const plusLabelEl = $("#btn-plus-one .plus-label");
  if (plusLabelEl) plusLabelEl.textContent = L.plusButtonLabel;
  $("#btn-plus-one").setAttribute("aria-label", L.plusAriaLabel);

  // myCigs est trié par smoked_at desc (cf. loadCigarettes30d), donc [0]
  // est bien la dernière entrée du mode courant.
  const last = myCigs[0];
  state.lastCigaretteId = last ? last.id : null;
  updateDelayDisplay(now);

  $("#chip-avg-interval").textContent = computeAvgInterval(todayCigs);
  $("#chip-yesterday").textContent = computeYesterdayCount(myCigs);
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
  const myCigs = getCurrentCigarettes();
  const last = myCigs[0];
  const minDelay = (state.plan && state.plan.min_delay_minutes) || 60;
  const btn = $("#btn-plus-one");
  const todayCigs = myCigs.filter((c) => new Date(c.smoked_at) >= startOfDay(now));
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

export function startDelayTimer() {
  if (state.delayTimer) clearInterval(state.delayTimer);
  state.delayTimer = setInterval(() => updateDelayDisplay(new Date()), 1000);
}

export async function handlePlusOne() {
  const now = new Date();
  const myCigs = getCurrentCigarettes();
  const last = myCigs[0];
  const minDelay = (state.plan && state.plan.min_delay_minutes) || 60;
  const todayCount = myCigs.filter((c) => new Date(c.smoked_at) >= startOfDay(now)).length;
  const quota = effectiveQuota(state.plan);

  const L = getLabels();

  // 1. Délai en cours ?
  if (last) {
    const elapsedMin = (now - new Date(last.smoked_at)) / 60000;
    if (elapsedMin < minDelay) {
      const remainMin = Math.ceil(minDelay - elapsedMin);
      const ok = await confirmDialog(
        L.confirmDelayTitle,
        L.confirmDelayBody(remainMin)
      );
      if (!ok) return;
    }
  }

  // 2. Au-delà du quota ?
  if (todayCount >= quota) {
    const ok = await confirmDialog(
      L.confirmQuotaTitle,
      L.confirmQuotaBody(todayCount, quota)
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
  const L = getLabels();
  return new Promise((resolve) => {
    $("#modal-confirm-title").textContent = title;
    $("#modal-confirm-body").textContent = body;
    const okBtn = $("#btn-confirm-ok");
    const cancelBtn = $("#btn-confirm-cancel");
    okBtn.textContent = L.confirmYes;
    cancelBtn.textContent = L.confirmNo;
    $("#modal-confirm").hidden = false;
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

export function closeTriggerModal() {
  $("#modal-trigger").hidden = true;
}
