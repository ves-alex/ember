// Onboarding 3 étapes : quota, délai, prix.
//
// onbStep est local au module (pas de fuite globale). app.js orchestre
// le flux next/back/submit via les exports ci-dessous — c'est lui qui
// appelle ensuite enterApp() une fois le plan sauvegardé (on évite ainsi
// une dépendance circulaire onboarding ↔ app).

import { $, $$, isoDate } from "../utils.js";
import { upsertQuitPlan } from "../db.js";

let onbStep = 1;

export function showOnboardingStep(step) {
  onbStep = step;
  $$(".onb-step").forEach((el) => {
    el.hidden = parseInt(el.dataset.step, 10) !== step;
  });
  $("#onb-step-indicator").textContent = step + " / 3";
  $("#btn-onb-back").hidden = step === 1;
  $("#btn-onb-next").textContent = step === 3 ? "Terminer" : "Suivant";
}

export function getCurrentStep() {
  return onbStep;
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
  };
  return await upsertQuitPlan(plan);
}
