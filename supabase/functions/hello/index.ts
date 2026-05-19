// Le concierge : reçoit une question depuis Ember, va demander à Claude
// (avec la clé secrète, qui ne sort JAMAIS du serveur), renvoie la réponse.

import "@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "@anthropic-ai/sdk"

// CORS : la liste des en-têtes qui disent au navigateur
// "j'autorise une page d'un autre site à me parler".
const enTetesCORS = {
  "Access-Control-Allow-Origin": "*", // on resserrera plus tard à l'URL d'Ember
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  // 1. Le navigateur envoie d'abord une requête "OPTIONS" pour demander
  //    la permission (le pré-vol / preflight). On répond juste "ok, tu peux".
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: enTetesCORS })
  }

  try {
    // 2. On lit la question envoyée par Ember.
    const { question } = await req.json()
    if (!question) {
      return new Response(
        JSON.stringify({ erreur: "Aucune question fournie." }),
        { status: 400, headers: { ...enTetesCORS, "Content-Type": "application/json" } },
      )
    }

    // 3. On sort la clé secrète du "tiroir fermé" (variable d'environnement).
    //    Elle n'est écrite NULLE PART dans ce fichier.
    const cleSecrete = Deno.env.get("ANTHROPIC_API_KEY")
    if (!cleSecrete) {
      return new Response(
        JSON.stringify({ erreur: "Clé API absente côté serveur." }),
        { status: 500, headers: { ...enTetesCORS, "Content-Type": "application/json" } },
      )
    }

    // 4. On prépare le client Claude avec cette clé.
    const claude = new Anthropic({ apiKey: cleSecrete })

    // 5. On appelle Claude. C'est ici que la "vraie" magie a lieu.
    const reponseClaude = await claude.messages.create({
      model: "claude-haiku-4-5", // rapide et économe, choisi pour le mois 2
      max_tokens: 1024, // longueur max de la réponse (court pour ce test)
      // cache_control : si le contexte devient gros plus tard (RAG au mois 2),
      // Claude réutilisera la partie stable au lieu de tout relire → moins cher.
      // Inoffensif tant que c'est petit, utile dès que ça grandit.
      cache_control: { type: "ephemeral" },
      system: "Tu es un coach bienveillant qui aide à arrêter de fumer. Réponds en français, court et concret.",
      messages: [{ role: "user", content: question }],
    })

    // 6. La réponse de Claude est une liste de "blocs". On prend le texte.
    const texte = reponseClaude.content
      .filter((bloc) => bloc.type === "text")
      .map((bloc) => bloc.text)
      .join("\n")

    return new Response(JSON.stringify({ reponse: texte }), {
      headers: { ...enTetesCORS, "Content-Type": "application/json" },
    })
  } catch (erreur) {
    // Filet de sécurité : si quoi que ce soit casse, on renvoie un message clair.
    return new Response(
      JSON.stringify({ erreur: String(erreur) }),
      { status: 500, headers: { ...enTetesCORS, "Content-Type": "application/json" } },
    )
  }
})
