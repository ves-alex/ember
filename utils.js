// Helpers DOM et formatage de dates, sans état ni dépendance.

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export function pad2(n) { return n < 10 ? "0" + n : "" + n; }
export function fmtTime(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
export function fmtMinSec(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return pad2(m) + ":" + pad2(s);
}
export function fmtDateFr(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
export function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
export function isoDate(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
export function daysBetween(a, b) {
  const ms = startOfDay(b) - startOfDay(a);
  return Math.round(ms / 86400000);
}
