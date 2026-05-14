// Onboarding 4 étapes : mode, quota, délai, prix.
//
// État local au module :
//   - onbStep : étape courante (1 à 4)
//   - pickedMode : 'cigarette' ou 'pastille' choisi à l'étape 1
//
// app.js orchestre next/back/submit via les exports ci-dessous — c'est lui
// qui appelle ensuite enterApp() une fois le plan sauvegardé (évite une
// dépendance circulaire onboarding ↔ app).

import { $, $$, isoDate } from "../utils.js";
import { upsertQuitPlan } from "../db.js";

let onbStep = 1;
let pickedMode = "cigarette";

const TOTAL_STEPS = 4;

export function showOnboardingStep(step) {
  onbStep = step;
  $$(".onb-step").forEach((el) => {
    el.hidden = parseInt(el.dataset.step, 10) !== step;
  });
  $("#onb-step-indicator").textContent = step + " / " + TOTAL_STEPS;
  $("#btn-onb-back").hidden = step === 1;
  $("#btn-onb-next").textContent = step === TOTAL_STEPS ? "Terminer" : "Suivant";
  // L'étape 1 (choix du mode) ne nécessite pas le bouton "Suivant" — l'user
  // valide en cliquant directement sur cigarettes ou pastilles.
  $("#btn-onb-next").hidden = step === 1;
}

export function getCurrentStep() {
  return onbStep;
}

export function getPickedMode() {
  return pickedMode;
}

// Set le mode choisi à l'étape 1. Met aussi à jour les valeurs et labels
// des étapes suivantes en utilisant les defaults du bundle correspondant.
export function setPickedMode(mode, modeTexts) {
  pickedMode = mode;
  $$(".onb-mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));

  // Préremplit les inputs des étapes 2-4 avec les defaults du mode
  if (modeTexts) {
    $("#onb-quota").value = modeTexts.quotaDefault;
    $("#onb-delay").value = modeTexts.delayDefault;
    $("#onb-price").value = modeTexts.priceDefault;
    $("#onb-cigs-per-pack").value = modeTexts.unitsPerBoxDefault;

    // Adapte les titres/sous-titres/units des étapes 2-4
    const titles = [
      { sel: '.onb-step[data-step="2"] h2', text: modeTexts.onbStep2Title },
      { sel: '.onb-step[data-step="2"] p.muted', text: modeTexts.onbStep2Sub },
      { sel: '.onb-step[data-step="3"] h2', text: modeTexts.onbStep3Title },
      { sel: '.onb-step[data-step="3"] p.muted', text: modeTexts.onbStep3Sub },
      { sel: '.onb-step[data-step="4"] h2', text: modeTexts.onbStep4Title },
      { sel: '.onb-step[data-step="4"] p.muted', text: modeTexts.onbStep4Sub },
    ];
    for (const { sel, text } of titles) {
      const el = document.querySelector(sel);
      if (el) el.textContent = text;
    }
    // Label "Cigarettes par paquet" / "Pastilles par boîte" pour l'input du bas
    const cigsLabel = document.querySelector('.onb-step[data-step="4"] .onb-secondary label');
    if (cigsLabel) cigsLabel.textContent = modeTexts.unitsPerBoxLabel;
  }
}

// Sauvegarde le plan rempli par l'onboarding et le renvoie au caller
// (null si erreur). Ne touche pas au state ni à la navigation : c'est
// app.js qui décide quoi faire ensuite.
export async function submitOnboarding() {
  const plan = {
    daily_quota: parseInt($("#onb-quota").value, 10) || 15,
    min_delay_minutes: parseInt($("#onb-delay").value, 10) || 60,
    weekly_reduction: 1,
    price_per_pack: parseFloat($("#onb-price").value) || 12.5,
    cigs_per_pack: parseInt($("#onb-cigs-per-pack").value, 10) || 20,
    start_date: isoDate(new Date()),
    tracking_mode: pickedMode,
  };
  return await upsertQuitPlan(plan);
}
