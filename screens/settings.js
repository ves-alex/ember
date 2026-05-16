// Écran réglages : édition du plan.

import { state } from "../state.js";
import { $ } from "../utils.js";
import { upsertQuitPlan } from "../db.js";
import { getCurrentMode } from "../labels.js";

export function fillSettingsForm() {
  if (!state.plan) return;
  // Fallback daily_quota si baseline absente (plan pré-migration), même
  // logique que effectiveBaseline() — le champ n'est jamais vide.
  $("#set-baseline").value = state.plan.baseline_per_day || state.plan.daily_quota;
  $("#set-quota").value = state.plan.daily_quota;
  $("#set-delay").value = state.plan.min_delay_minutes;
  $("#set-weekly").value = state.plan.weekly_reduction || 0;
  $("#set-price").value = state.plan.price_per_pack || 12.5;
  $("#set-cigs-per-pack").value = state.plan.cigs_per_pack || 20;
  $("#set-mode").value = getCurrentMode();
}

// Enregistre les réglages. Renvoie l'ancien mode + le nouveau mode pour
// permettre au caller (app.js) de déclencher un applyModeToUI() si le
// mode a changé.
export async function saveSettings() {
  const previousMode = getCurrentMode();
  const quota = parseInt($("#set-quota").value, 10) || 15;
  const updates = {
    baseline_per_day: parseInt($("#set-baseline").value, 10) || quota,
    daily_quota: quota,
    min_delay_minutes: parseInt($("#set-delay").value, 10) || 60,
    weekly_reduction: parseInt($("#set-weekly").value, 10) || 0,
    price_per_pack: parseFloat($("#set-price").value) || 12.5,
    cigs_per_pack: parseInt($("#set-cigs-per-pack").value, 10) || 20,
    tracking_mode: $("#set-mode").value || "cigarette",
  };
  const saved = await upsertQuitPlan(updates);
  if (saved) {
    state.plan = saved;
    $("#settings-feedback").textContent = "Enregistré.";
    setTimeout(() => { $("#settings-feedback").textContent = ""; }, 2000);
    return { ok: true, modeChanged: previousMode !== updates.tracking_mode };
  }
  $("#settings-feedback").textContent = "Erreur d'enregistrement.";
  return { ok: false, modeChanged: false };
}
