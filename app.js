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
import { loadQuitPlan, loadCigarettes30d, updateTrigger } from "./db.js";
import {
  showScreen, holdSplash, transitionFromSplash,
} from "./transitions.js";
import {
  renderMain, startDelayTimer, handlePlusOne, closeTriggerModal,
} from "./screens/main.js";
import { renderStats, renderDailyChart } from "./screens/stats.js";
import { fillSettingsForm, saveSettings, exportJSON } from "./screens/settings.js";
import {
  showOnboardingStep, getCurrentStep, submitOnboarding,
} from "./screens/onboarding.js";

async function enterApp() {
  state.cigarettes = await loadCigarettes30d();
  showScreen("screen-main");
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
  state.cigarettes = await loadCigarettes30d();
  await holdSplash(splashStart, MIN_SPLASH_MS);

  // Pré-render le main avant la transition pour que la mesure du bouton
  // soit fiable et que l'écran soit en place dès qu'il fade-in.
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
  $("#btn-onb-next").addEventListener("click", async () => {
    const step = getCurrentStep();
    if (step < 3) {
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

// Démarrage. Les modules sont chargés via <script type="module">,
// l'évaluation est différée par défaut — quand on arrive ici, le DOM est
// soit prêt soit en cours de parsing. On gère les deux cas par sûreté.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { wireEvents(); boot(); });
} else {
  wireEvents();
  boot();
}
