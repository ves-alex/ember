// Bundles textuels par mode : cigarette, ou famille « substitut » (gomme,
// pastille/comprimé, spray, inhaleur). Le mode est porté par
// `state.plan.tracking_mode` ('cigarette' | 'pastille'). Pour des raisons de
// compat DB, la clé de la famille substitut reste 'pastille' (aucune
// migration de contrainte CHECK) ; la FORME précise vit dans
// `state.plan.substitute_form`, et un nom de produit libre dans
// `state.plan.substitute_label`.
//
// getLabels() : 'cigarette' → bundle cigarette ; sinon → bundle substitut
// construit pour la forme courante (fallback 'pastille' si la colonne est
// absente → comportement strictement identique à l'avant-refacto).
//
// Valeurs par défaut = posologie usuelle des notices ANSM / Tabac Info
// Service (base-donnees-publique.medicaments.gouv.fr). Ce sont des points de
// départ raisonnables et SÛRS (sous les maxima), l'utilisateur les ajuste à
// l'onboarding et dans les Réglages.

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
};

// ─── Famille « substitut » : une forme = un jeu de défauts + vocabulaire ───
// `selectLabel` : libellé affiché dans le <select> de forme (onboarding /
// Réglages). `sourceNote` : repère de posologie glissé dans le sous-titre
// onboarding. `packWord` : conditionnement (boîte / flacon).
export const SUBSTITUTE_FORMS = {
  pastille: {
    unit: "pastille", unitPlural: "pastilles",
    selectLabel: "Pastille / comprimé à sucer",
    packWord: "boîte",
    unitsPerBoxLabel: "Pastilles par boîte",
    quotaDefault: 12, delayDefault: 30, unitsPerBoxDefault: 30, priceDefault: 15.0,
    sourceNote: "ex. Nicorette/Nicopass : max 15/j",
  },
  gomme: {
    unit: "gomme", unitPlural: "gommes",
    selectLabel: "Gomme à mâcher",
    packWord: "boîte",
    unitsPerBoxLabel: "Gommes par boîte",
    quotaDefault: 12, delayDefault: 60, unitsPerBoxDefault: 30, priceDefault: 20.0,
    sourceNote: "gomme nicotine : ~8–12/j",
  },
  spray: {
    unit: "pulvérisation", unitPlural: "pulvérisations",
    selectLabel: "Spray buccal",
    packWord: "flacon",
    unitsPerBoxLabel: "Pulvérisations par flacon",
    quotaDefault: 20, delayDefault: 15, unitsPerBoxDefault: 150, priceDefault: 25.0,
    sourceNote: "spray 1 mg : max 2/prise, 4/h, 64/j",
  },
  inhaleur: {
    unit: "cartouche", unitPlural: "cartouches",
    selectLabel: "Inhaleur",
    packWord: "boîte",
    unitsPerBoxLabel: "Cartouches par boîte",
    quotaDefault: 6, delayDefault: 60, unitsPerBoxDefault: 20, priceDefault: 30.0,
    sourceNote: "inhaleur : ~6–12 cartouches/j",
  },
};

// Construit le bundle substitut pour une forme + un éventuel nom de produit
// libre (qui remplace alors le mot d'unité — « 1 Nicopass » au lieu de
// « 1 pastille »). Mémoïsé par (forme|label) car getLabels() est appelé
// souvent par les renders.
const _bundleCache = {};

function makeSubstituteBundle(formKey, customLabel) {
  const cacheKey = formKey + "|" + (customLabel || "");
  if (_bundleCache[cacheKey]) return _bundleCache[cacheKey];

  const spec = SUBSTITUTE_FORMS[formKey] || SUBSTITUTE_FORMS.pastille;
  const lbl = (customLabel || "").trim();
  const u = lbl || spec.unit;          // singulier affiché
  const up = lbl || spec.unitPlural;   // pluriel affiché (pas de 's' si nom libre)
  const word = (n) => (n !== 1 ? up : u);

  const bundle = {
    unit: u,
    unitPlural: up,
    boxLabel: "Prix par " + spec.packWord + " (€)",
    unitsPerBoxLabel: spec.unitsPerBoxLabel,
    plusButtonLabel: "1 " + u,
    plusAriaLabel: "Enregistrer une prise",
    modeSelectLabel: "Substituts",

    quotaDefault: spec.quotaDefault,
    delayDefault: spec.delayDefault,
    unitsPerBoxDefault: spec.unitsPerBoxDefault,
    priceDefault: spec.priceDefault,

    onbStep2Title: "Combien de " + up + " par jour aujourd'hui ?",
    onbStep2Sub: "Ta conso actuelle, référence de tes progrès (" + spec.sourceNote + ").",
    onbStep3Title: "Quel délai minimum entre deux prises ?",
    onbStep3Sub: "Un timer t'aidera à espacer. Tu peux toujours passer outre.",
    onbStep4Title: "Prix d'une " + spec.packWord + " ?",
    onbStep4Sub: "Pour avoir une idée du budget mensuel.",
    onbUnitDay: "par jour",
    onbUnitMin: "minutes",

    counterZero: "Aucune prise aujourd'hui.",
    counterInQuota: "Tu es dans ton quota.",
    counterAtQuota: "Quota atteint. Espace tes prises.",
    counterOverQuota: (excess) => "Au-delà de ton quota (+" + excess + ").",

    confirmDelayTitle: "Tu en prends avant le délai",
    confirmDelayBody: (m) =>
      "Il restait " + m + " min avant ta prochaine prise prévue. Tu es sûr ?",
    confirmQuotaTitle: "Quota atteint",
    confirmQuotaBody: (n, quota) =>
      "Tu as déjà pris " + n + " " + word(n) +
      " aujourd'hui (quota : " + quota + "). Tu veux vraiment continuer ?",
    confirmYes: "Oui, j'en prends une",
    confirmNo: "Non, j'attends",

    cumulLine: (days, n, baseline) =>
      "J+" + days + " · " + n + " " + word(n) +
      " pris" + (n !== 1 ? "es" : "e") +
      " sur un quota cumulé de " + baseline + ".",

    // Les substituts coûtent : pas d'« économies » à célébrer.
    savingsAvoided: () => "",
    showSavings: false,

    heatmapCellTitle: (dayLabel, hour, n) =>
      dayLabel + " " + hour + "h : " + n + " " + word(n),
  };

  _bundleCache[cacheKey] = bundle;
  return bundle;
}

// Récupère le bundle adapté au plan courant. Fallbacks gracieux : pas de
// plan → cigarette ; mode substitut sans forme renseignée (plans d'avant la
// migration) → 'pastille', soit exactement le comportement historique.
export function getLabels() {
  const plan = state.plan;
  const mode = (plan && plan.tracking_mode) || "cigarette";
  if (mode === "cigarette") return MODE_TEXTS.cigarette;
  const form = (plan && plan.substitute_form) || "pastille";
  const customLabel = plan && plan.substitute_label;
  return makeSubstituteBundle(form, customLabel);
}

// Mode de famille courant ('cigarette' | 'pastille'). 'pastille' = toute la
// famille substitut (cf. note d'en-tête sur la clé DB conservée).
export function getCurrentMode() {
  return (state.plan && state.plan.tracking_mode) || "cigarette";
}

// Forme substitut courante ('pastille' par défaut). Utile à l'UI pour
// pré-sélectionner le bon <option> sans reconstruire un bundle.
export function getCurrentSubstituteForm() {
  return (state.plan && state.plan.substitute_form) || "pastille";
}
