// Script ponctuel (B2) : calcule les "coordonnées de sens" (embeddings)
// de chaque fiche et les réécrit dans la base.
//
// Lancement :
//   deno run -A --env-file=/Users/alexv/ember/supabase/functions/.env \
//     /Users/alexv/ember/supabase/embeddings.ts

import { pipeline } from "npm:@huggingface/transformers@^3"

const SUPABASE_URL = "https://akoodxuhhahhvhkvkwwu.supabase.co"
const REST = SUPABASE_URL + "/rest/v1/coaching_strategies"

// Clé SECRÈTE (admin) : sort du tiroir fermé, jamais écrite ici.
const SECRET = Deno.env.get("SUPABASE_SECRET_KEY")
if (!SECRET) {
  console.error("Clé SUPABASE_SECRET_KEY absente du .env. Stop.")
  Deno.exit(1)
}

const headers = {
  apikey: SECRET,
  Authorization: "Bearer " + SECRET,
  "Content-Type": "application/json",
}

// 1. Récupère les fiches qui n'ont pas encore de "sens".
const res = await fetch(
  REST + "?select=id,titre,contenu&embedding=is.null",
  { headers },
)
const fiches = await res.json()
if (!Array.isArray(fiches)) {
  console.error("Réponse inattendue :", fiches)
  Deno.exit(1)
}
console.log(`${fiches.length} fiche(s) à traiter.`)

// 2. Prépare le mini-modèle (téléchargé une seule fois, ~30 Mo).
console.log("Chargement du modèle gte-small…")
const extracteur = await pipeline("feature-extraction", "Supabase/gte-small")

// 3. Pour chaque fiche : calcule le sens, réécrit la ligne.
let ok = 0
for (const fiche of fiches) {
  const texte = `${fiche.titre}. ${fiche.contenu}`
  const sortie = await extracteur(texte, { pooling: "mean", normalize: true })
  const vecteur = Array.from(sortie.data) // 384 nombres

  const maj = await fetch(REST + "?id=eq." + fiche.id, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    // pgvector accepte le format texte "[0.1,0.2,...]"
    body: JSON.stringify({ embedding: "[" + vecteur.join(",") + "]" }),
  })

  if (maj.ok) {
    ok++
    console.log(`✓ ${fiche.titre}`)
  } else {
    console.error(`✗ ${fiche.titre} — ${maj.status} ${await maj.text()}`)
  }
}

console.log(`\nTerminé : ${ok}/${fiches.length} fiches ont reçu leur sens.`)
