// Le concierge, version RAG (B4) : il va chercher les 3 fiches anti-craving
// les plus proches du sens de la question, puis demande à Claude de répondre
// en s'appuyant dessus. La clé Claude ne sort jamais du serveur.

import "@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "@anthropic-ai/sdk"

const enTetesCORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Coordonnées publiques (déjà publiques dans state.js) : chemin de lecture.
const SUPABASE_URL = "https://akoodxuhhahhvhkvkwwu.supabase.co"
const PUBLIC_KEY = "sb_publishable_VHjPBsTKF69i5hQ5C6DOcw_UxtWeNmw"

// Moteur d'embedding intégré de Supabase (même modèle gte-small que les fiches).
const moteurSens = new Supabase.ai.Session("gte-small")

function repondre(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...enTetesCORS, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCORS })

  try {
    const { question } = await req.json()
    if (!question) return repondre({ erreur: "Aucune question fournie." }, 400)

    const cleClaude = Deno.env.get("ANTHROPIC_API_KEY")
    if (!cleClaude) return repondre({ erreur: "Clé API absente côté serveur." }, 500)

    // 1. Coordonnées de sens de la question (moteur intégré Supabase).
    const vecteur = await moteurSens.run(question, {
      mean_pool: true,
      normalize: true,
    })

    // 2. On demande au bibliothécaire les 3 fiches les plus proches.
    const rechRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/match_strategies", {
      method: "POST",
      headers: {
        apikey: PUBLIC_KEY,
        Authorization: "Bearer " + PUBLIC_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: "[" + Array.from(vecteur).join(",") + "]",
        match_count: 3,
      }),
    })
    const fiches = await rechRes.json()
    const fichesTexte = Array.isArray(fiches)
      ? fiches.map((f) => `- ${f.titre} : ${f.contenu}`).join("\n")
      : "(aucune fiche disponible)"

    // 3. L'examen avec antisèche : on colle les fiches dans la consigne.
    const claude = new Anthropic({ apiKey: cleClaude })
    const reponseClaude = await claude.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      cache_control: { type: "ephemeral" },
      system:
        "Tu es un coach bienveillant qui aide à arrêter de fumer. " +
        "Réponds en français, court et concret. " +
        "Appuie-toi en priorité sur les fiches fournies ci-dessous ; " +
        "tu peux les reformuler et les adapter à la situation, mais reste dans leur esprit.\n\n" +
        "Fiches anti-craving pertinentes :\n" + fichesTexte,
      messages: [{ role: "user", content: question }],
    })

    const texte = reponseClaude.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")

    return repondre({ reponse: texte, fiches_utilisees: Array.isArray(fiches) ? fiches.map((f) => f.titre) : [] })
  } catch (erreur) {
    return repondre({ erreur: String(erreur) }, 500)
  }
})
