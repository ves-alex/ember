// Lectures/écritures métier sur Supabase, via le wrapper REST.

import { state } from "./state.js";
import { restRequest } from "./supabase.js";

export async function loadQuitPlan() {
  const { data, error } = await restRequest(
    "/quit_plan?user_id=eq." + state.user.id + "&select=*&limit=1"
  );
  if (error) {
    console.error("loadQuitPlan", error);
    return null;
  }
  return (data && data[0]) || null;
}

export async function loadCigarettes30d() {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const isoSince = since.toISOString();
  const { data, error } = await restRequest(
    "/cigarettes?user_id=eq." + state.user.id +
    "&smoked_at=gte." + encodeURIComponent(isoSince) +
    "&select=id,smoked_at,trigger_tag,note,tracking_mode&order=smoked_at.desc"
  );
  if (error) {
    console.error("loadCigarettes30d", error);
    return [];
  }
  return data || [];
}

export async function insertCigarette() {
  // tracking_mode tagué sur l'INSERT pour préserver l'historique si l'user
  // switche de mode plus tard. Le filtrage au render se base sur ce champ.
  const mode = (state.plan && state.plan.tracking_mode) || "cigarette";
  const row = {
    user_id: state.user.id,
    smoked_at: new Date().toISOString(),
    tracking_mode: mode,
  };
  const { data, error } = await restRequest("/cigarettes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (error) {
    alert("Erreur d'enregistrement : " + error.message);
    return null;
  }
  return (data && data[0]) || null;
}

export async function updateTrigger(cigId, trigger) {
  const { error } = await restRequest(
    "/cigarettes?id=eq." + cigId,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ trigger_tag: trigger }),
    }
  );
  if (error) console.error("updateTrigger", error);
}

export async function upsertQuitPlan(plan) {
  // Pattern UPSERT PostgREST : POST avec Prefer: resolution=merge-duplicates.
  // user_id est la PK.
  const payload = { user_id: state.user.id, ...plan };
  const { data, error } = await restRequest("/quit_plan", {
    method: "POST",
    headers: {
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });
  if (error) {
    console.error("upsertQuitPlan", error);
    return null;
  }
  return (data && data[0]) || null;
}
