// Le concierge, version AGENT (C1) : Claude a 2 outils qu'il peut décider
// d'utiliser. Boucle d'agent : il demande un outil → on l'exécute → on lui
// rend le résultat → il continue, jusqu'à sa réponse finale.

import "@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "@anthropic-ai/sdk"

const enTetesCORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const SUPABASE_URL = "https://akoodxuhhahhvhkvkwwu.supabase.co"
const PUBLIC_KEY = "sb_publishable_VHjPBsTKF69i5hQ5C6DOcw_UxtWeNmw"
const moteurSens = new Supabase.ai.Session("gte-small")

// Historique FICTIF d'apprentissage. Jamais les vraies données.
const HISTORIQUE_SYNTHETIQUE =
  "Données fictives du jour : 8 cigarettes fumées, quota du jour = 10, " +
  "déclencheurs fréquents aujourd'hui : stress (x4), café (x2), ennui (x2)."

function repondre(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...enTetesCORS, "Content-Type": "application/json" },
  })
}

// --- La "notice" des outils donnée à Claude ---
const OUTILS = [
  {
    name: "chercher_techniques",
    description:
      "Cherche les meilleures techniques anti-craving pour une situation donnée. " +
      "À utiliser quand l'utilisateur décrit une envie de fumer ou un déclencheur.",
    input_schema: {
      type: "object",
      properties: {
        situation: { type: "string", description: "La situation/déclencheur en une phrase" },
      },
      required: ["situation"],
    },
  },
  {
    name: "proposer_ajustement_quota",
    description:
      "Calcule une recommandation d'ajustement du quota selon la consommation du jour. " +
      "À utiliser quand l'utilisateur parle de son quota ou de son rythme.",
    input_schema: {
      type: "object",
      properties: {
        clopes_aujourdhui: { type: "number" },
        quota_actuel: { type: "number" },
      },
      required: ["clopes_aujourdhui", "quota_actuel"],
    },
  },
]

// --- L'exécution réelle des outils (côté serveur) ---
async function executerOutil(nom: string, args: any): Promise<string> {
  if (nom === "chercher_techniques") {
    const v = await moteurSens.run(args.situation, { mean_pool: true, normalize: true })
    const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/match_strategies", {
      method: "POST",
      headers: {
        apikey: PUBLIC_KEY,
        Authorization: "Bearer " + PUBLIC_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: "[" + Array.from(v).join(",") + "]",
        match_count: 3,
      }),
    })
    const fiches = await res.json()
    return Array.isArray(fiches)
      ? fiches.map((f: any) => `- ${f.titre} : ${f.contenu}`).join("\n")
      : "(aucune fiche)"
  }

  if (nom === "proposer_ajustement_quota") {
    const { clopes_aujourdhui, quota_actuel } = args
    if (clopes_aujourdhui < quota_actuel) {
      return `Tu es à ${clopes_aujourdhui}/${quota_actuel}. Marge confortable : ` +
        `tu peux viser un quota de ${quota_actuel - 1} la semaine prochaine.`
    }
    return `Tu es à ${clopes_aujourdhui}/${quota_actuel}. Pas de baisse cette semaine : ` +
      `consolide ce palier avant de réduire.`
  }

  return "Outil inconnu."
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCORS })

  try {
    const { question } = await req.json()
    if (!question) return repondre({ erreur: "Aucune question fournie." }, 400)

    const cleClaude = Deno.env.get("ANTHROPIC_API_KEY")
    if (!cleClaude) return repondre({ erreur: "Clé API absente côté serveur." }, 500)

    const claude = new Anthropic({ apiKey: cleClaude })
    const messages: any[] = [{ role: "user", content: question }]
    const outilsAppeles: string[] = []

    // La boucle d'agent : on tourne tant que Claude réclame un outil
    // (garde-fou : 5 tours max pour éviter une boucle infinie).
    let reponse
    for (let tour = 0; tour < 5; tour++) {
      reponse = await claude.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system:
          "Tu es un coach bienveillant qui aide à arrêter de fumer. " +
          "Réponds en français, court et concret. Utilise tes outils quand c'est pertinent. " +
          "Appuie tes conseils sur les techniques que l'outil te renvoie.\n\n" +
          HISTORIQUE_SYNTHETIQUE,
        tools: OUTILS,
        messages,
      })

      // Claude a fini de parler (il ne réclame pas d'outil) → on sort.
      if (reponse.stop_reason !== "tool_use") break

      // Sinon : on rejoue ce qu'il a dit, on exécute chaque outil demandé,
      // et on lui renvoie les résultats.
      messages.push({ role: "assistant", content: reponse.content })
      const resultats = []
      for (const bloc of reponse.content) {
        if (bloc.type === "tool_use") {
          outilsAppeles.push(bloc.name)
          const sortie = await executerOutil(bloc.name, bloc.input)
          resultats.push({
            type: "tool_result",
            tool_use_id: bloc.id,
            content: sortie,
          })
        }
      }
      messages.push({ role: "user", content: resultats })
    }

    const texte = (reponse?.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")

    return repondre({ reponse: texte, outils_appeles: outilsAppeles })
  } catch (erreur) {
    return repondre({ erreur: String(erreur) }, 500)
  }
})
