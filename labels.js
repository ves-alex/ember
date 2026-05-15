// Bundles textuels par mode de tracking : cigarette (default) ou pastille.
//
// Toutes les strings et valeurs par défaut spécifiques au mode vivent ici.
// Le reste du code lit `getLabels()` pour récupérer le bundle adapté au
// `state.plan.tracking_mode` courant — fallback 'cigarette' si la colonne
// est absente (migration DB pas encore appliquée).
//
// Sources des valeurs par défaut pastille : notice ANSM officielle
// NICORETTE 2 mg comprimés à sucer (base-donnees-publique.medicaments.gouv.fr,
// monographie 65043451). Max 15 comprimés/jour, min 9/j les 6 premières
// semaines, pas de délai fixe entre prises imposé.

import { state } from "./state.js";

const MODE_TEXTS = {
  cigarette: {
    // Lexique
    unit: "clope",
    unitPlural: "clopes",
    boxLabel: "Prix par paquet (€)",
    unitsPerBoxLabel: "Cigarettes par paquet",
    plusButtonLabel: "1 clope",
    plusAriaLabel: "Enregistrer une cigarette",
    modeSelectLabel: "Cigarettes",

    // Valeurs par défaut pour l'onboarding et les nouveaux plans
    quotaDefault: 15,
    delayDefault: 60,
    unitsPerBoxDefault: 20,
    priceDefault: 12.5,

    // Onboarding
    onbStep2Title: "Combien de clopes par jour aujourd'hui ?",
    onbStep2Sub: "Sois honnête, c'est ta référence pour mesurer tes progrès.",
    onbStep3Title: "Quel délai minimum entre deux clopes ?",
    onbStep3Sub: "Un timer t'aidera à attendre. Tu peux toujours passer outre.",
    onbStep4Title: "Prix d'un paquet ?",
    onbStep4Sub: "Pour mesurer ce que tu économises au fil du temps.",
    onbUnitDay: "par jour",
    onbUnitMin: "minutes",

    // Compteur main
    counterZero: "Aucune clope aujourd'hui. Tiens bon.",
    counterInQuota: "Tu es dans ton quota.",
    counterAtQuota: "Quota atteint. Chaque clope en plus est un choix.",
    counterOverQuota: (excess) => "Au-delà de ton quota (+" + excess + ").",

    // Confirmations (dialogue de bypass)
    confirmDelayTitle: "Tu fumes avant le délai",
    confirmDelayBody: (m) =>
      "Il restait " + m + " min avant ta prochaine clope prévue. Tu es sûr ?",
    confirmQuotaTitle: "Quota atteint",
    confirmQuotaBody: (n, quota) =>
      "Tu as déjà fumé " + n + " clope" + (n > 1 ? "s" : "") +
      " aujourd'hui (quota : " + quota + "). Tu veux vraiment continuer ?",
    confirmYes: "Oui, j'allume",
    confirmNo: "Non, j'attends",

    // Stats — bilan cumulé
    cumulLine: (days, n, baseline) =>
      "J+" + days + " · " + n + " clope" + (n !== 1 ? "s" : "") +
      " fumée" + (n !== 1 ? "s" : "") +
      " sur un quota cumulé de " + baseline + ".",

    // Stats — savings
    savingsAvoided: (n, ref) =>
      n + " clope" + (n > 1 ? "s" : "") + " évitée" + (n > 1 ? "s" : "") +
      " par rapport à ta conso d'avant (" + ref + "/j).",
    showSavings: true,

    // Stats — heatmap tooltip
    heatmapCellTitle: (dayLabel, hour, n) =>
      dayLabel + " " + hour + "h : " + n + " clope" + (n > 1 ? "s" : ""),
  },

  pastille: {
    // Lexique
    unit: "pastille",
    unitPlural: "pastilles",
    boxLabel: "Prix par boîte (€)",
    unitsPerBoxLabel: "Pastilles par boîte",
    plusButtonLabel: "1 pastille",
    plusAriaLabel: "Enregistrer une pastille",
    modeSelectLabel: "Pastilles",

    // Valeurs par défaut sourcées notice ANSM Nicorette 2 mg :
    // max 15/j, min 9/j les 6 premières semaines. On part de 12 (milieu de
    // fourchette), avec délai de 30 min pour conserver la mécanique d'attente
    // de l'app (la notice n'impose pas de délai fixe).
    quotaDefault: 12,
    delayDefault: 30,
    unitsPerBoxDefault: 30,
    priceDefault: 15.0,

    // Onboarding
    onbStep2Title: "Combien de pastilles par jour aujourd'hui ?",
    onbStep2Sub: "Ta conso actuelle, référence de tes progrès (Nicorette : max 15/j).",
    onbStep3Title: "Quel délai minimum entre deux pastilles ?",
    onbStep3Sub: "Un timer t'aidera à espacer. Tu peux toujours passer outre.",
    onbStep4Title: "Prix d'une boîte ?",
    onbStep4Sub: "Pour avoir une idée du budget mensuel.",
    onbUnitDay: "par jour",
    onbUnitMin: "minutes",

    // Compteur main
    counterZero: "Aucune pastille aujourd'hui.",
    counterInQuota: "Tu es dans ton quota.",
    counterAtQuota: "Quota atteint. Espace tes prises.",
    counterOverQuota: (excess) => "Au-delà de ton quota (+" + excess + ").",

    // Confirmations
    confirmDelayTitle: "Tu en prends avant le délai",
    confirmDelayBody: (m) =>
      "Il restait " + m + " min avant ta prochaine pastille prévue. Tu es sûr ?",
    confirmQuotaTitle: "Quota atteint",
    confirmQuotaBody: (n, quota) =>
      "Tu as déjà pris " + n + " pastille" + (n > 1 ? "s" : "") +
      " aujourd'hui (quota : " + quota + "). Tu veux vraiment continuer ?",
    confirmYes: "Oui, j'en prends une",
    confirmNo: "Non, j'attends",

    // Stats — bilan cumulé
    cumulLine: (days, n, baseline) =>
      "J+" + days + " · " + n + " pastille" + (n !== 1 ? "s" : "") +
      " prise" + (n !== 1 ? "s" : "") +
      " sur un quota cumulé de " + baseline + ".",

    // Stats — savings : section masquée en mode pastille (les pastilles
    // coûtent, on ne fait pas d'économies, ce serait trompeur).
    savingsAvoided: () => "",
    showSavings: false,

    // Stats — heatmap tooltip
    heatmapCellTitle: (dayLabel, hour, n) =>
      dayLabel + " " + hour + "h : " + n + " pastille" + (n > 1 ? "s" : ""),
  },
};

// Récupère le bundle adapté au mode courant. Fallback 'cigarette' si la
// colonne `tracking_mode` n'est pas encore présente côté DB (migration
// pas appliquée) ou si state.plan n'existe pas encore.
export function getLabels() {
  const mode = (state.plan && state.plan.tracking_mode) || "cigarette";
  return MODE_TEXTS[mode] || MODE_TEXTS.cigarette;
}

// Petit utilitaire pour obtenir explicitement le mode courant (utile
// pour les comparaisons côté UI sans passer par le bundle).
export function getCurrentMode() {
  return (state.plan && state.plan.tracking_mode) || "cigarette";
}
