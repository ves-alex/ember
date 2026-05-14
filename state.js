// État global et constantes partagées entre modules.

// ───────── CONFIG À REMPLIR PAR ALEX ─────────
// Crée un projet Supabase dédié à ember, copie URL + publishable key ci-dessous,
// puis exécute les fichiers SQL dans supabase/ (schema → rls → grants).
// Active OAuth Google dans Authentication → Providers.
export const SUPABASE_URL = "https://akoodxuhhahhvhkvkwwu.supabase.co";
export const SUPABASE_KEY = "sb_publishable_VHjPBsTKF69i5hQ5C6DOcw_UxtWeNmw";
// ─────────────────────────────────────────────

export const SUPABASE_REST = SUPABASE_URL + "/rest/v1";

// Triggers d'envie de fumer — liste consolidée à partir de :
//   - NHS Better Health (UK) "Understand your smoking triggers and cravings"
//   - National Cancer Institute (cancer.gov) "Tips for Coping with Nicotine Withdrawal and Triggers"
//   - Tabac Info Service (FR) "Je découvre mon profil de fumeur"
//   - CDC "Why Quitting Smoking Is Hard"
// 18 entrées organisées mentalement : 6 émotions, 3 consommables, 6 moments / activités, 3 divers.
export const TRIGGER_LABELS = {
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

export const state = {
  user: null,
  plan: null,
  cigarettes: [],        // 30 derniers jours, TOUS modes confondus
  lastCigaretteId: null,
  delayTimer: null,
  chartInstance: null,
  chartRange: 14,        // 7 | 14 | 30 jours visibles
};

// Retourne uniquement les entries du mode courant. Les renders consomment
// ce filtré au lieu de `state.cigarettes` direct, pour isoler les deux modes
// (cigarette / pastille) : chaque mode son compteur, son historique, ses
// stats. La colonne `tracking_mode` sur la table `cigarettes` est servie
// par `loadCigarettes30d()` et injectée par `insertCigarette()`.
export function getCurrentCigarettes() {
  const mode = (state.plan && state.plan.tracking_mode) || "cigarette";
  return state.cigarettes.filter((c) => (c.tracking_mode || "cigarette") === mode);
}
