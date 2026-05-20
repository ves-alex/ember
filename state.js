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

// Conseil court et actionnable par trigger. Affiché sous le trigger n°1
// dans les stats : tagger ne sert à rien si l'app ne renvoie pas une
// alternative concrète. Formulations alignées sur Tabac Info Service (FR)
// et NHS Better Health : substituer un geste/comportement, pas « tenir ».
export const TRIGGER_TIPS = {
  stress: "Avant d'y céder : 5 respirations lentes, expiration deux fois plus longue que l'inspiration. L'envie retombe en ~3 min.",
  anxiete: "Nomme ce qui t'angoisse à voix haute ou par écrit. La nicotine masque l'anxiété, elle ne la règle pas.",
  ennui: "L'ennui passe vite : occupe tes mains 3 min (eau, marche, message à quelqu'un) avant de décider.",
  frustration: "Évacue par le corps : serre les poings 10 s puis relâche, ou sors marcher.",
  tristesse: "Sois doux avec toi. Un appel ou un vrai moment de réconfort fait plus qu'une prise.",
  joie: "Tu peux célébrer autrement : associe ce moment à autre chose pour ne pas le lier à la nicotine.",
  cafe: "C'est l'association café→nicotine, pas le manque. Change de main, de lieu, ou passe au thé quelques jours.",
  alcool: "L'alcool baisse ta garde. Préviens-toi à l'avance d'une limite, et alterne avec un verre d'eau.",
  repas: "Quitte la table dès la fin du repas : 3 min d'activité (vaisselle, marche) cassent le réflexe.",
  pause: "Garde la pause, change le rituel : marche, étirements ou eau plutôt qu'une prise. C'est la pause que tu veux, pas la nicotine.",
  reveil: "La première est la plus ancrée. Décale-la : douche, eau, petit-déj d'abord, prise repoussée d'autant.",
  soiree: "Repère le moment déclencheur (terrasse, groupe qui sort) et prépare ta réponse avant d'y être.",
  conduite: "Mains occupées autrement : playlist, fenêtre entrouverte. Ne garde pas ta dose à portée dans la voiture.",
  attente: "L'attente est courte : sors le téléphone, un livre, ou respire — ce n'est pas le besoin mais le vide.",
  social: "« Non merci, j'arrête » suffit. Reste dans le groupe sans suivre le mouvement : tu verras que ça passe.",
  telephone: "Geste pur d'habitude : tiens un objet (stylo, balle anti-stress) pendant tes appels.",
  habitude: "Pur automatisme : casse la routine (autre trajet, autre place) pour rendre le geste conscient.",
  autre: "Note dans quel contexte précis ça arrive : repérer le motif est la première étape pour le désamorcer.",
};

export const state = {
  user: null,
  plan: null,
  cigarettes: [],        // depuis start_date (cap 366 j), TOUS modes confondus
  lastCigaretteId: null,
  delayTimer: null,
  chartInstance: null,
  chartRange: 14,        // 7 | 14 | 30 jours visibles
};

// Retourne uniquement les entries du mode courant. Les renders consomment
// ce filtré au lieu de `state.cigarettes` direct, pour isoler les deux modes
// (cigarette / pastille) : chaque mode son compteur, son historique, ses
// stats. La colonne `tracking_mode` sur la table `cigarettes` est servie
// par `loadCigarettesSinceStart()` et injectée par `insertCigarette()`.
export function getCurrentCigarettes() {
  const mode = (state.plan && state.plan.tracking_mode) || "cigarette";
  return state.cigarettes.filter((c) => (c.tracking_mode || "cigarette") === mode);
}

// Lit un paramètre du plan en respectant le mode courant. Les 4 paramètres
// réglables (daily_quota, baseline_per_day, min_delay_minutes, weekly_reduction)
// sont dédoublés en cigarette_* / pastille_* depuis la migration 2026-05-20.
// Fallback sur l'ancienne colonne scalaire si la nouvelle n'existe pas
// (cas du code déployé avant migration DB).
export function planField(plan, field) {
  if (!plan) return undefined;
  const mode = plan.tracking_mode || "cigarette";
  const v = plan[`${mode}_${field}`];
  return v === undefined ? plan[field] : v;
}
