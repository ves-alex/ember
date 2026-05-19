// Phase D — eval harness du coach.
// Rejoue 20 situations fixes contre l'agent déployé et vérifie qu'il
// décide d'appeler le(s) bon(s) outil(s). Donne un score X/20.
//   deno run -A /Users/alexv/ember/supabase/eval-coach.ts
//
// Coût : ~20 appels Haiku (quelques centimes), borné par le plafond 10 $.

const URL = "https://akoodxuhhahhvhkvkwwu.supabase.co/functions/v1/hello"

// Chaque cas : une situation + les outils que l'agent DEVRAIT appeler.
// T = chercher_techniques, Q = proposer_ajustement_quota.
const CAS: { q: string; attendu: string[] }[] = [
  { q: "Je suis super stressé au boulot et l'envie de fumer monte fort.", attendu: ["chercher_techniques"] },
  { q: "Grosse angoisse ce soir, j'ai envie d'une clope pour me calmer.", attendu: ["chercher_techniques"] },
  { q: "Je m'ennuie ferme et ma main cherche le paquet.", attendu: ["chercher_techniques"] },
  { q: "Je suis frustré, ça m'énerve, je veux fumer.", attendu: ["chercher_techniques"] },
  { q: "Je me sens triste là, la cigarette m'appelle.", attendu: ["chercher_techniques"] },
  { q: "Bonne nouvelle au taf, j'ai envie de fêter ça avec une clope.", attendu: ["chercher_techniques"] },
  { q: "Mon café du matin sans cigarette c'est impossible, aide-moi.", attendu: ["chercher_techniques"] },
  { q: "Quand je bois un verre je craque toujours sur la clope.", attendu: ["chercher_techniques"] },
  { q: "Juste après le repas, le réflexe cigarette est trop fort.", attendu: ["chercher_techniques"] },
  { q: "En pause au boulot tout le monde fume, j'ai du mal.", attendu: ["chercher_techniques"] },
  { q: "La première cigarette du réveil, je n'arrive pas à la sauter.", attendu: ["chercher_techniques"] },
  { q: "En soirée avec des amis je fume beaucoup plus, que faire ?", attendu: ["chercher_techniques"] },
  { q: "Dès que je conduis je veux une cigarette.", attendu: ["chercher_techniques"] },
  { q: "J'attends mon bus et le manque me prend, une astuce ?", attendu: ["chercher_techniques"] },
  { q: "J'ai fumé 9 cigarettes aujourd'hui pour un quota de 10, je peux baisser ?", attendu: ["proposer_ajustement_quota"] },
  { q: "Mon quota est à 12, j'en suis à 6 aujourd'hui. Tu en penses quoi ?", attendu: ["proposer_ajustement_quota"] },
  { q: "Je suis à 10 sur 10 pile, faut-il que je réduise la semaine prochaine ?", attendu: ["proposer_ajustement_quota"] },
  { q: "Quota 8, j'en ai fumé 3. Je peux serrer la vis ?", attendu: ["proposer_ajustement_quota"] },
  { q: "Je suis stressé, déjà 8 clopes sur 10 aujourd'hui : conseil + je baisse mon quota ?", attendu: ["chercher_techniques", "proposer_ajustement_quota"] },
  { q: "Soirée arrosée, j'ai dépassé mon quota de 10 : que faire et comment ajuster ?", attendu: ["chercher_techniques", "proposer_ajustement_quota"] },
]

let reussis = 0
for (let i = 0; i < CAS.length; i++) {
  const { q, attendu } = CAS[i]
  let appeles: string[] = []
  let erreur = ""
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    })
    const data = await res.json()
    appeles = data.outils_appeles ?? []
    if (data.erreur) erreur = data.erreur
  } catch (e) {
    erreur = String(e)
  }

  // Le cas passe si chaque outil attendu a bien été appelé (extra toléré).
  const ok = !erreur && attendu.every((o) => appeles.includes(o))
  if (ok) reussis++

  const num = String(i + 1).padStart(2, "0")
  console.log(`${ok ? "✓" : "✗"} ${num}  attendu=[${attendu.join(", ")}]  appelé=[${appeles.join(", ")}]${erreur ? "  ERREUR:" + erreur : ""}`)
}

console.log(`\nScore : ${reussis}/${CAS.length}`)
