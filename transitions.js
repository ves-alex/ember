// Navigation entre écrans + animations splash → main.

import { $, $$ } from "./utils.js";

export function showScreen(id) {
  $$(".screen").forEach((el) => el.classList.toggle("active", el.id === id));
  const showNav = ["screen-main", "screen-stats", "screen-settings"].includes(id);
  const nav = $("#bottom-nav");
  nav.hidden = !showNav;
  $$(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === id);
  });
  window.scrollTo(0, 0);
}

// Garantit un temps minimum sur le splash pour que la respiration du logo
// ait le temps de se jouer avant la transition (sinon on flash l'écran auth).
export function holdSplash(start, minMs) {
  const remaining = Math.max(0, minMs - (Date.now() - start));
  return new Promise((r) => setTimeout(r, remaining));
}

// Transition splash → écran cible.
//
// Pour screen-main, on fait un "atterrissage" : le logo se déplace et
// se pose dans le gros bouton +1, dont les visuels (disque ambre rayonnant)
// sont proches du logo. L'écran main fade-in derrière en parallèle, le
// bouton cible reste invisible jusqu'à la fin de l'atterrissage puis
// reçoit un micro-pop de confirmation. Technique FLIP (mesure runtime).
//
// Pour les autres écrans (auth, onboarding), on garde l'embrasement
// classique : le logo grossit et se dissout sur place.
export async function transitionFromSplash(targetScreenId) {
  if (targetScreenId === "screen-main") {
    await transitionSplashToButton();
    return;
  }

  const splash = document.getElementById("screen-loading");
  const target = document.getElementById(targetScreenId);

  splash.classList.add("is-exiting");
  target.classList.add("active", "is-entering");

  const showNav = ["screen-stats", "screen-settings"].includes(targetScreenId);
  $("#bottom-nav").hidden = !showNav;
  $$(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.target === targetScreenId));

  await new Promise((r) => setTimeout(r, 1350));
  splash.classList.remove("active", "is-exiting");
  target.classList.remove("is-entering");
}

async function transitionSplashToButton() {
  const splash = document.getElementById("screen-loading");
  const target = document.getElementById("screen-main");
  const logo = splash.querySelector(".ember-logo-breathing");
  const text = splash.querySelector(".loading-text");
  const btn = document.getElementById("btn-plus-one");

  // 1. Active screen-main + le positionne en fixed pour qu'il se superpose
  //    au splash (sinon il se placerait en block flow EN-DESSOUS du splash,
  //    et le bouton +1 mesurerait à y=1268 hors du viewport).
  target.classList.add("active", "is-target-prep");
  document.getElementById("bottom-nav").hidden = false;
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.target === "screen-main"));

  // 2. Force deux frames pour garantir le layout avant la mesure.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const fromRect = logo.getBoundingClientRect();
  const toRect = btn.getBoundingClientRect();

  if (toRect.width === 0 || toRect.height === 0) {
    splash.classList.add("is-exiting");
    target.classList.add("is-entering");
    await new Promise((r) => setTimeout(r, 1350));
    splash.classList.remove("active", "is-exiting");
    target.classList.remove("is-entering");
    return;
  }

  // 3. Sort le logo du splash : position:fixed à sa position courante, on
  //    animera ses propriétés left/top/width/height directement (plus
  //    prévisible que transform sur SVG, notamment sur iOS Safari).
  logo.style.position = "fixed";
  logo.style.left = fromRect.left + "px";
  logo.style.top = fromRect.top + "px";
  logo.style.width = fromRect.width + "px";
  logo.style.height = fromRect.height + "px";
  logo.style.margin = "0";
  logo.style.zIndex = "1000";       // au-dessus du splash et du nav
  logo.style.animation = "none";    // stoppe la respiration
  logo.style.transform = "none";    // s'assure qu'aucun transform résiduel
  logo.style.willChange = "left, top, width, height, opacity, filter";

  // 4. Texte "Ember" fade rapide.
  text.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(-6px)" },
    ],
    { duration: 350, easing: "ease-out", fill: "forwards" }
  );

  // 5. Splash : fond opaque puis fade-out à 55%.
  splash.classList.add("is-revealing");

  // 6. Vol du logo vers le bouton, puis "embrasement" jusqu'à épouser le
  //    contour du cercle.
  //
  //    Géométrie : dans le SVG du logo (viewBox 512), le disque ambre
  //    saturé est un cercle r=110, soit ~43% de la viewBox. Pour que
  //    visuellement ce disque coïncide avec le bouton (taille toRect),
  //    le logo entier doit faire toRect.width / 0.43 ≈ 2.3 × toRect.width.
  //    Le halo (cercle r=220, presque toute la viewBox) déborde alors
  //    autour du bouton — effet "lueur" voulu.
  const embraceFactor = 2.3;
  const finalW = toRect.width * embraceFactor;
  const finalH = toRect.height * embraceFactor;
  const finalLeft = (toRect.left + toRect.width / 2) - finalW / 2;
  const finalTop = (toRect.top + toRect.height / 2) - finalH / 2;

  // Keyframes :
  //  - 0%   : position de départ (centre splash, taille 160)
  //  - 65%  : arrivé au-dessus du bouton ET grossi à la taille "embrace"
  //  - 78%  : reste posé brièvement (laisse l'œil percevoir l'arrivée)
  //  - 100% : opacity 0 en place, révélant le cercle gris du bouton
  const fly = logo.animate(
    [
      {
        left: fromRect.left + "px",
        top: fromRect.top + "px",
        width: fromRect.width + "px",
        height: fromRect.height + "px",
        opacity: 1,
        filter: "drop-shadow(0 0 24px rgba(255, 140, 66, 0.35)) brightness(1.05)",
      },
      {
        offset: 0.65,
        left: finalLeft + "px",
        top: finalTop + "px",
        width: finalW + "px",
        height: finalH + "px",
        opacity: 1,
        filter: "drop-shadow(0 0 40px rgba(255, 160, 90, 0.5)) brightness(1.1)",
      },
      {
        offset: 0.78,
        left: finalLeft + "px",
        top: finalTop + "px",
        width: finalW + "px",
        height: finalH + "px",
        opacity: 1,
        filter: "drop-shadow(0 0 26px rgba(255, 140, 66, 0.32)) brightness(0.95)",
      },
      {
        left: finalLeft + "px",
        top: finalTop + "px",
        width: finalW + "px",
        height: finalH + "px",
        opacity: 0,
        filter: "drop-shadow(0 0 0 rgba(255, 140, 66, 0)) brightness(0.6)",
      },
    ],
    {
      duration: 1800,
      easing: "cubic-bezier(0.5, 0.05, 0.2, 1)",
      fill: "forwards",
    }
  );

  await fly.finished;

  splash.classList.remove("active", "is-revealing");
  target.classList.remove("is-target-prep");
  logo.removeAttribute("style");
}
