// Couche Supabase : init du client (auth uniquement) + wrapper REST.
//
// Pourquoi le wrapper REST plutôt que le SDK pour les data ops :
// le SDK v2 peut pendre ses promises sur certains navigateurs (cf. mémoire
// feedback_supabase_rest_bypass). On garde donc le SDK strictement pour
// l'auth OAuth (signInWithOAuth, getSession, signOut) et on tape directement
// /rest/v1 pour le reste.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_REST, state } from "./state.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    lock: (_name, _timeout, fn) => fn(),
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});

function getAccessToken() {
  // Supabase stocke en localStorage sous une clé dérivée de l'URL.
  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const raw = localStorage.getItem("sb-" + projectRef + "-auth-token");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token);
  } catch { return null; }
}

export async function restRequest(path, init = {}) {
  const token = getAccessToken();
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(SUPABASE_REST + path, { ...init, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (!res.ok) {
    return { data: null, error: { message: (data && data.message) || text || res.statusText, status: res.status } };
  }
  return { data, error: null };
}

export async function signInGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) alert("Erreur de connexion : " + error.message);
}

// Reset session + state. Le caller fait le showScreen() au retour pour
// éviter une dépendance circulaire avec transitions.js.
export async function signOut() {
  try { await supabase.auth.signOut(); } catch {}
  state.user = null;
  state.plan = null;
  state.cigarettes = [];
}

export async function ensureSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.user;
}
