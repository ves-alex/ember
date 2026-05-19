// Test ponctuel (B3) : pose une question, affiche les 3 fiches
// que le bibliothécaire ramène par le sens.
//   deno run -A /Users/alexv/ember/supabase/test-search.ts

import { pipeline } from "npm:@huggingface/transformers@^3"

// URL + clé PUBLIQUE (déjà publiques dans state.js) — c'est le chemin
// de lecture normal, celui que le concierge utilisera en B4.
const SUPABASE_URL = "https://akoodxuhhahhvhkvkwwu.supabase.co"
const PUBLIC_KEY = "sb_publishable_VHjPBsTKF69i5hQ5C6DOcw_UxtWeNmw"

const question = "Je suis super stressé au boulot et j'ai une envie de fumer terrible."
console.log(`Question : « ${question} »\n`)

const extracteur = await pipeline("feature-extraction", "Supabase/gte-small")
const sortie = await extracteur(question, { pooling: "mean", normalize: true })
const vecteur = Array.from(sortie.data)

const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/match_strategies", {
  method: "POST",
  headers: {
    apikey: PUBLIC_KEY,
    Authorization: "Bearer " + PUBLIC_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query_embedding: "[" + vecteur.join(",") + "]",
    match_count: 3,
  }),
})

const fiches = await res.json()
if (!Array.isArray(fiches)) {
  console.error("Réponse inattendue :", fiches)
  Deno.exit(1)
}

console.log("Les 3 fiches les plus proches par le sens :\n")
for (const f of fiches) {
  console.log(`  [${(f.similarite * 100).toFixed(0)}%] ${f.titre} (${f.trigger_tag ?? "universel"})`)
  console.log(`        ${f.contenu}\n`)
}
