# ember

> Tracker de cigarettes pour arrêter de fumer progressivement.

PWA vanilla (HTML / CSS / JS, Supabase) calquée sur le pattern de [Nudge](https://nudgenow.vercel.app/). Trois leviers combinés : **quota journalier dégressif**, **délai minimum entre deux clopes**, **stats riches** (heatmap, courbe 30 j, économies, série).

## Setup pas à pas

### 1. Créer le projet Supabase

1. Va sur https://supabase.com → **New project**.
2. Choisis une région UE (Frankfurt) pour la conformité RGPD.
3. Une fois le projet créé, récupère dans **Settings → API** :
   - `Project URL` → c'est ton `SUPABASE_URL`
   - `publishable key` (la clé publique, pas le service_role) → c'est ton `SUPABASE_KEY`

### 2. Créer les tables

Dans le dashboard Supabase, ouvre **SQL Editor** et exécute dans l'ordre :

1. `supabase/schema.sql` — crée les tables `cigarettes` et `quit_plan`
2. `supabase/rls.sql` — active la Row Level Security (chaque user ne voit que ses données)
3. `supabase/grants.sql` — autorise les sessions authentifiées à lire/écrire

### 3. Activer Google OAuth

Dans **Authentication → Providers → Google** :
- Bascule sur Enabled
- Configure le Client ID / Secret depuis la Google Cloud Console (mêmes credentials que Nudge si tu veux, ou un nouveau client OAuth)
- **Redirect URL** à autoriser : `https://ember.vercel.app` (et `http://localhost:8000` pour les tests locaux)

### 4. Brancher l'app

Édite `script.js` (en haut du fichier) et remplace :

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_KEY = "sb_publishable_REPLACE_ME";
```

par tes vraies valeurs de l'étape 1.

### 5. Tester en local

```bash
cd /Users/alexv/ember
python3 -m http.server 8000
```

Puis ouvre http://localhost:8000 dans Safari ou Chrome. Tu devrais voir l'écran de login. Connecte-toi avec Google, fais l'onboarding (3 étapes : quota, délai, prix), puis l'écran principal apparaît.

### 6. Déployer sur Vercel

```bash
cd /Users/alexv/ember
git add .
git commit -m "init"
gh repo create ves-alex/ember --public --source=. --push
```

Puis sur https://vercel.com → **Add new project** → importer `ves-alex/ember`. Pas de build step à configurer (statique).

URL finale : `https://ember.vercel.app`.

**N'oublie pas** d'ajouter cette URL dans les Redirect URLs de Google OAuth (étape 3).

### 7. Ajouter au portfolio x37a

Édite `/Users/alexv/ves-alex.github.io/index.html` et ajoute une `.project-card` dans la section Projets, à côté de Nudge.

## Architecture

```
ember/
├── index.html       # 5 écrans (auth, onboarding, main, stats, settings) dans une SPA
├── script.js        # logique métier — wrapper restRequest() pour parler à Supabase
├── styles.css       # palette graphite + accent ambre #ff8c42
├── manifest.json    # PWA installable
├── sw.js            # service worker no-cache (juste pour rendre l'app installable)
├── vercel.json      # config Vercel
└── supabase/
    ├── schema.sql
    ├── rls.sql
    └── grants.sql
```

## Pourquoi un wrapper REST plutôt que le SDK Supabase ?

Le SDK v2 a tendance à pendre ses promises dans certains navigateurs (notamment Comet et Safari avec profil chargé). Le wrapper `restRequest()` tape directement `/rest/v1/...` avec un simple `fetch`, et n'utilise le SDK que pour l'auth (OAuth, session, signOut). Pattern documenté pour Nudge dans la mémoire `feedback_supabase_rest_bypass.md`.

## Icônes PNG manquantes

`icon.svg` existe (flamme ambre stylisée). Pour générer les PNG (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) :

```bash
# Avec rsvg-convert
brew install librsvg
rsvg-convert -w 192 -h 192 icon.svg > icon-192.png
rsvg-convert -w 512 -h 512 icon.svg > icon-512.png
rsvg-convert -w 180 -h 180 icon.svg > apple-touch-icon.png
```

Ou via un outil en ligne (https://realfavicongenerator.net) à partir du SVG.
