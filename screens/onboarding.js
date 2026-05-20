// Onboarding 4 étapes : mode, quota, délai, prix.
//
// État local au module :
//   - onbStep : étape courante (1 à 4)
//   - pickedMode : 'cigarette' ou 'pastille' choisi à l'étape 1
//
// app.js orchestre next/back/submit via les exports ci-dessous — c'est lui
// qui appelle ensuite enterApp() une fois le plan sauvegardé (évite une
// dépendance circulaire onboarding ↔ app).

import { $, $$, isoDate, parseIntOr, parseFloatOr } from "../utils.js";
import { upsertQuitPlan } from "../db.js";

let onbStep = 1;
let pickedMode = "cigarette";
let pickedForm = "pastille";   // pertinent seulement si pickedMode === 'pastille'
let pickedLabel = "";          // nom de produit libre, optionnel

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

// Pré-remplit les inputs + titres des étapes 2-4 selon le bundle résolu.
function applyDefaults(modeTexts) {
  if (!modeTexts) return;
  $("#onb-baseline").value = modeTexts.quotaDefault;
  $("#onb-quota").value = modeTexts.quotaDefault;
  $("#onb-delay").value = modeTexts.delayDefault;
  $("#onb-price").value = modeTexts.priceDefault;
  $("#onb-cigs-per-pack").value = modeTexts.unitsPerBoxDefault;

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
  const cigsLabel = document.querySelector('.onb-step[data-step="4"] .onb-secondary label');
  if (cigsLabel) cigsLabel.textContent = modeTexts.unitsPerBoxLabel;
}

// Mode cigarette : choisi directement à l'étape 1.
export function setPickedMode(mode, modeTexts) {
  pickedMode = mode;
  $$(".onb-mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  applyDefaults(modeTexts);
}

// Famille substitut : forme + nom libre choisis dans le sous-panneau de
// l'étape 1. `modeTexts` doit être le bundle DÉJÀ résolu pour cette forme
// (l'appelant a mis state.plan.substitute_form avant d'appeler getLabels()).
export function setSubstitute(form, label, modeTexts) {
  pickedMode = "pastille";
  pickedForm = form;
  pickedLabel = (label || "").trim();
  $$(".onb-mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === "pastille"));
  applyDefaults(modeTexts);
}

// Sauvegarde le plan rempli par l'onboarding et le renvoie au caller
// (null si erreur). Ne touche pas au state ni à la navigation : c'est
// app.js qui décide quoi faire ensuite.
export async function submitOnboarding() {
  const baseline = parseIntOr($("#onb-baseline").value, 15);
  // Le quota saisi ne peut pas dépasser la conso de référence : viser
  // au-dessus de ce qu'on fume déjà n'a pas de sens pour un sevrage.
  const quota = Math.min(parseIntOr($("#onb-quota").value, baseline), baseline);
  const delay = parseIntOr($("#onb-delay").value, 60);
  // À la création, les deux modes héritent des mêmes valeurs : si l'user
  // switche plus tard, il trouvera une config plausible au lieu d'un mode
  // vide. Il pourra ensuite ajuster séparément depuis les réglages.
  const plan = {
    cigarette_daily_quota: quota,
    pastille_daily_quota: quota,
    cigarette_baseline_per_day: baseline,
    pastille_baseline_per_day: baseline,
    cigarette_min_delay_minutes: delay,
    pastille_min_delay_minutes: delay,
    cigarette_weekly_reduction: 1,
    pastille_weekly_reduction: 1,
    price_per_pack: parseFloatOr($("#onb-price").value.replace(",", "."), 12.5),
    cigs_per_pack: parseIntOr($("#onb-cigs-per-pack").value, 20),
    start_date: isoDate(new Date()),
    tracking_mode: pickedMode,
  };
  if (pickedMode === "pastille") {
    plan.substitute_form = pickedForm;
    plan.substitute_label = pickedLabel || null;
  }
  return await upsertQuitPlan(plan);
}
