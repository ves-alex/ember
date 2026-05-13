// Écran réglages : édition du plan + export JSON.

import { state } from "../state.js";
import { $, isoDate } from "../utils.js";
import { upsertQuitPlan } from "../db.js";

export function fillSettingsForm() {
  if (!state.plan) return;
  $("#set-quota").value = state.plan.daily_quota;
  $("#set-delay").value = state.plan.min_delay_minutes;
  $("#set-weekly").value = state.plan.weekly_reduction || 0;
  $("#set-price").value = state.plan.price_per_pack || 12.5;
  $("#set-cigs-per-pack").value = state.plan.cigs_per_pack || 20;
}

export async function saveSettings() {
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

export function exportJSON() {
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
