// Écran réglages : édition du plan.

import { state } from "../state.js";
import { $ } from "../utils.js";
import { upsertQuitPlan } from "../db.js";
import { getCurrentMode, getCurrentSubstituteForm } from "../labels.js";

// Affiche/masque le bloc « forme + nom » selon le mode sélectionné dans le
// <select>, et recharge les 4 champs « par mode » pour qu'ils reflètent les
// valeurs stockées du mode visé (sinon basculer le <select> écraserait un
// mode avec les valeurs affichées de l'autre). Appelé au remplissage ET au
// changement de mode.
export function syncModeFields() {
  const row = $("#set-substitut-row");
  const selected = $("#set-mode").value;
  if (row) row.hidden = selected !== "pastille";
  fillModeFields(selected);
}

// Remplit quota/baseline/délai/weekly avec les valeurs stockées pour le mode
// passé en argument. Fallback sur les anciennes colonnes scalaires si la
// migration 2026-05-20 n'a pas encore tourné côté DB.
function fillModeFields(mode) {
  if (!state.plan) return;
  const p = state.plan;
  const quota = p[`${mode}_daily_quota`] ?? p.daily_quota ?? 15;
  const baseline = p[`${mode}_baseline_per_day`] ?? p.baseline_per_day ?? quota;
  const delay = p[`${mode}_min_delay_minutes`] ?? p.min_delay_minutes ?? 60;
  const weekly = p[`${mode}_weekly_reduction`] ?? p.weekly_reduction ?? 0;
  $("#set-baseline").value = baseline;
  $("#set-quota").value = quota;
  $("#set-delay").value = delay;
  $("#set-weekly").value = weekly;
}

export function fillSettingsForm() {
  if (!state.plan) return;
  $("#set-mode").value = getCurrentMode();
  $("#set-price").value = state.plan.price_per_pack || 12.5;
  $("#set-cigs-per-pack").value = state.plan.cigs_per_pack || 20;
  $("#set-form").value = getCurrentSubstituteForm();
  $("#set-label").value = state.plan.substitute_label || "";
  syncModeFields();   // remplit aussi les 4 champs par-mode
}

// Enregistre les réglages. Renvoie l'ancien mode + le nouveau mode pour
// permettre au caller (app.js) de déclencher un applyModeToUI() si le
// mode a changé.
export async function saveSettings() {
  const previousMode = getCurrentMode();
  const newMode = $("#set-mode").value || "cigarette";
  const quota = parseInt($("#set-quota").value, 10) || 15;
  const baseline = parseInt($("#set-baseline").value, 10) || quota;
  const delay = parseInt($("#set-delay").value, 10) || 60;
  const weekly = parseInt($("#set-weekly").value, 10) || 0;
  // Les 4 champs réglables sont écrits dans les colonnes du mode visé
  // uniquement : l'autre mode reste intact côté DB. Les champs partagés
  // (prix, paquet, mode courant, forme/nom du substitut) sont écrits
  // sans préfixe.
  const updates = {
    [`${newMode}_daily_quota`]: quota,
    [`${newMode}_baseline_per_day`]: baseline,
    [`${newMode}_min_delay_minutes`]: delay,
    [`${newMode}_weekly_reduction`]: weekly,
    price_per_pack: parseFloat($("#set-price").value.replace(",", ".")) || 12.5,
    cigs_per_pack: parseInt($("#set-cigs-per-pack").value, 10) || 20,
    tracking_mode: newMode,
  };
  // Forme + nom libre seulement en mode substitut. merge-duplicates ne
  // touche que les colonnes envoyées : en mode cigarette on ne les écrase
  // pas (elles restent disponibles si l'user rebascule).
  if (newMode === "pastille") {
    updates.substitute_form = $("#set-form").value || "pastille";
    updates.substitute_label = $("#set-label").value.trim() || null;
  }
  const saved = await upsertQuitPlan(updates);
  if (saved) {
    state.plan = saved;
    $("#settings-feedback").textContent = "Enregistré.";
    setTimeout(() => { $("#settings-feedback").textContent = ""; }, 2000);
    return { ok: true, modeChanged: previousMode !== newMode };
  }
  $("#settings-feedback").textContent = "Erreur d'enregistrement.";
  return { ok: false, modeChanged: false };
}
