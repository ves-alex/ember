// Point d'entrée de l'application.
//
// Ce module ne définit pas de logique métier — il se contente d'orchestrer :
//   - vérifier la session,
//   - charger les données,
//   - tenir le splash assez longtemps,
//   - déclencher la bonne transition,
//   - câbler les boutons aux handlers exportés par les autres modules.

import { state, SUPABASE_URL } from "./state.js";
import { $, $$ } from "./utils.js";
import { ensureSession, signInGoogle, signOut } from "./supabase.js";
import { loadQuitPlan, loadCigarettesSinceStart, updateTrigger } from "./db.js";
import {
  showScreen, holdSplash, transitionFromSplash,
} from "./transitions.js";
import {
  renderMain, startDelayTimer, handlePlusOne, closeTriggerModal,
} from "./screens/main.js";
import { renderStats, renderDailyChart, adjustWeeklyReduction } from "./screens/stats.js";
import { fillSettingsForm, saveSettings, exportJSON } from "./screens/settings.js";
import {
  showOnboardingStep, getCurrentStep, setPickedMode, submitOnboarding,
} from "./screens/onboarding.js";
import { getLabels } from "./labels.js";

// Applique les labels dépendant du mode dans l'UI globale. À appeler après
// chaque changement de `state.plan.tracking_mode` (au boot, après un save
// settings qui change le mode, etc.).
function applyModeToUI() {
  const L = getLabels();
  const mode = (state.plan && state.plan.tracking_mode) || "cigarette";

  // Thème CSS : un attribut data sur <body> que styles.css utilise pour
  // override les CSS vars d'accent (--accent, --accent-dim, --logo-*).
  // On le persiste aussi en localStorage pour pré-thèmer le splash dès
  // le prochain chargement, avant que `state.plan` soit chargé depuis Supabase.
  document.body.dataset.mode = mode;
  localStorage.setItem("ember-mode", mode);

  // Bouton +1 dans l'écran main
  const plusLabelEl = $("#btn-plus-one .plus-label");
  if (plusLabelEl) plusLabelEl.textContent = L.plusButtonLabel;
  $("#btn-plus-one").setAttribute("aria-label", L.plusAriaLabel);

  // Labels de la section Settings → Prix + nb par boîte + libellé hebdo
  const priceLabel = $("#set-price-label");
  if (priceLabel) priceLabel.textContent = L.boxLabel;
  const unitsLabel = $("#set-units-per-box-label");
  if (unitsLabel) unitsLabel.textContent = L.unitsPerBoxLabel;
  const weeklyLabel = $("#set-weekly-label");
  if (weeklyLabel) weeklyLabel.textContent = "Réduction hebdomadaire (" + L.unitPlural + "/semaine)";

  // Section "Économies" sur l'écran stats : visible uniquement en mode cigarette
  const savingsSection = document.querySelector(".stat-savings");
  if (savingsSection) savingsSection.hidden = !L.showSavings;
}

async function enterApp() {
  state.cigarettes = await loadCigarettesSinceStart();
  showScreen("screen-main");
  applyModeToUI();
  renderMain();
  startDelayTimer();
  fillSettingsForm();
}

async function boot() {
  if (SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    document.body.innerHTML =
      '<div style="padding:32px;color:#e6e8eb;font-family:system-ui;max-width:560px;margin:40px auto;line-height:1.5">' +
      '<h1 style="color:#ff8c42">Ember — config manquante</h1>' +
      "<p>Remplis <code>SUPABASE_URL</code> et <code>SUPABASE_KEY</code> dans <code>state.js</code> (en haut du fichier), " +
      "puis exécute les SQL du dossier <code>supabase/</code> dans Supabase Studio.</p></div>";
    return;
  }

  const splashStart = Date.now();
  const MIN_SPLASH_MS = 1900;     // 1.9s ≈ moins d'un cycle complet de respiration

  const user = await ensureSession();
  if (!user) {
    await holdSplash(splashStart, MIN_SPLASH_MS);
    transitionFromSplash("screen-auth");
    return;
  }
  state.user = user;
  state.plan = await loadQuitPlan();

  if (!state.plan) {
    await holdSplash(splashStart, MIN_SPLASH_MS);
    transitionFromSplash("screen-onboarding");
    showOnboardingStep(1);
    return;
  }

  // Charge les clopes en parallèle du splash hold pour gagner du temps.
  state.cigarettes = await loadCigarettesSinceStart();
  await holdSplash(splashStart, MIN_SPLASH_MS);

  // Pré-render le main avant la transition pour que la mesure du bouton
  // soit fiable et que l'écran soit en place dès qu'il fade-in.
  applyModeToUI();
  renderMain();
  fillSettingsForm();
  await transitionFromSplash("screen-main");
  startDelayTimer();
}

function wireEvents() {
  $("#btn-google").addEventListener("click", signInGoogle);
  $("#btn-plus-one").addEventListener("click", handlePlusOne);
  $("#btn-logout").addEventListener("click", async () => {
    await signOut();
    showScreen("screen-auth");
  });
  $("#btn-save-settings").addEventListener("click", async () => {
    const result = await saveSettings();
    if (result.ok && result.modeChanged) {
      applyModeToUI();
      renderMain();   // Refresh compteur/status avec les nouveaux labels
    }
  });
  $("#btn-export").addEventListener("click", exportJSON);

  // Stepper carte Trajectoire : régler la réduction hebdo à la main, dans
  // les deux sens (0 inclus = quota figé, totalement réversible). stats.js
  // borne + upsert + re-render des stats ; on resync compteur et Réglages.
  const stepReduction = async (delta) => {
    const dec = $("#traj-dec"), inc = $("#traj-inc");
    dec.disabled = inc.disabled = true;
    const ok = await adjustWeeklyReduction(delta);
    dec.disabled = inc.disabled = false;
    if (ok) {
      renderMain();
      fillSettingsForm();
    }
  };
  $("#traj-dec").addEventListener("click", () => stepReduction(-1));
  $("#traj-inc").addEventListener("click", () => stepReduction(1));

  // Bottom nav
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      showScreen(target);
      if (target === "screen-stats") renderStats();
      if (target === "screen-settings") fillSettingsForm();
    });
  });

  // Onboarding — étape 1 : choix du mode (clic direct, pas de bouton Suivant)
  $$(".onb-mode-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.mode;
      // Imp. : on doit fixer state.plan.tracking_mode AVANT d'appeler getLabels(),
      // sinon getLabels() retombe sur 'cigarette' par fallback. On simule un
      // plan partiel le temps de l'onboarding pour que les labels suivants
      // soient cohérents.
      state.plan = { tracking_mode: mode };
      setPickedMode(mode, getLabels());
      showOnboardingStep(2);
    });
  });

  // Onboarding — boutons Suivant / Retour
  $("#btn-onb-next").addEventListener("click", async () => {
    const step = getCurrentStep();
    if (step < 4) {
      showOnboardingStep(step + 1);
      return;
    }
    const saved = await submitOnboarding();
    if (!saved) {
      alert("Impossible d'enregistrer ton plan. Vérifie ta connexion.");
      return;
    }
    state.plan = saved;
    await enterApp();
  });
  $("#btn-onb-back").addEventListener("click", () => {
    const step = getCurrentStep();
    if (step > 1) showOnboardingStep(step - 1);
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

// Pré-thème : on lit le mode persisté en localStorage et on l'applique sur
// <body> AVANT le splash. Sans ça, un user pastille verrait un flash ambre
// pendant ~1,9s (le hold splash) avant que applyModeToUI() bascule en vert.
// Au tout premier lancement il n'y a rien en localStorage, on garde le défaut
// CSS (ambre). Protégé pour le cas (théorique) où <body> ne serait pas
// encore parsé au moment où ce module s'évalue.
function applySavedMode() {
  const savedMode = localStorage.getItem("ember-mode");
  if ((savedMode === "pastille" || savedMode === "cigarette") && document.body) {
    document.body.dataset.mode = savedMode;
  }
}
applySavedMode();

// Démarrage. Les modules sont chargés via <script type="module">,
// l'évaluation est différée par défaut — quand on arrive ici, le DOM est
// soit prêt soit en cours de parsing. On gère les deux cas par sûreté.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { wireEvents(); boot(); });
} else {
  wireEvents();
  boot();
}
