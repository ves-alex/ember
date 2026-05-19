-- Phase B (RAG) — base de connaissances anti-craving.
-- Contenu générique (aucune donnée utilisateur). À exécuter dans Supabase Studio.

-- 1. Active pgvector : la "compétence en plus" du cerveau de Postgres
--    pour comparer des sens (vecteurs), pas seulement des mots.
create extension if not exists vector;

-- 2. Le "rayon" : une fiche = une technique anti-craving.
--    embedding reste NULL pour l'instant (rempli en B2).
create table if not exists public.coaching_strategies (
  id          bigint generated always as identity primary key,
  trigger_tag text,                       -- un des 18 tags d'Ember, ou NULL = universel
  titre       text not null,
  contenu     text not null,              -- la technique, 1 à 3 phrases
  embedding   vector(384),                -- coordonnées de sens (gte-small)
  created_at  timestamptz default now()
);

-- 3. Contenu de référence, public en lecture (comme un catalogue).
--    Aucune donnée perso ici, donc pas de filtrage par utilisateur.
alter table public.coaching_strategies enable row level security;

drop policy if exists "coaching_strategies lisible par tous" on public.coaching_strategies;
create policy "coaching_strategies lisible par tous"
  on public.coaching_strategies for select
  using (true);

-- 4. Les ~20 fiches. Idempotent : on vide avant de réinsérer.
truncate public.coaching_strategies;

insert into public.coaching_strategies (trigger_tag, titre, contenu) values
('stress',      'Respiration 4-7-8', 'Inspire par le nez 4 secondes, retiens 7 secondes, expire par la bouche 8 secondes. Répète 3 fois. Ça active le système nerveux parasympathique et l''envie retombe en 2-3 minutes.'),
('stress',      'Décharge physique', 'Le stress crée une tension corporelle. Serre les poings 10 secondes puis relâche, ou fais 20 squats. Tu évacues l''adrénaline sans nicotine.'),
('anxiete',     'Ancrage 5-4-3-2-1', 'Nomme 5 choses que tu vois, 4 que tu entends, 3 que tu touches, 2 que tu sens, 1 que tu goûtes. Ça sort le cerveau de la spirale anxieuse.'),
('anxiete',     'Nommer l''angoisse', 'Écris ou dis à voix haute ce qui t''angoisse précisément. La nicotine masque l''anxiété 5 minutes ; la nommer la désamorce vraiment.'),
('ennui',       'Règle des 3 minutes', 'L''ennui passe vite. Occupe tes mains 3 minutes (eau, marche, un message à quelqu''un) avant de décider. L''envie aura souvent disparu.'),
('ennui',       'Changer de pièce', 'L''envie est liée au contexte. Change physiquement d''endroit 2 minutes : le simple changement de lieu casse l''automatisme.'),
('frustration', 'Évacuer par le corps', 'La frustration cherche une sortie. Marche vite 3 minutes, ou crie dans un coussin. Le geste défoule mieux qu''une cigarette.'),
('tristesse',   'Réconfort réel', 'Sois doux avec toi. Un appel à un proche ou une boisson chaude apporte un vrai réconfort, là où la nicotine ne fait qu''anesthésier.'),
('joie',        'Célébrer autrement', 'Tu peux marquer le moment sans nicotine : lève les bras, envoie un message, savoure. Ne lie pas tes bonnes nouvelles à la cigarette.'),
('cafe',        'Casser l''association café', 'Ce n''est pas le manque, c''est le réflexe café→clope. Change de main, bois ton café debout ou ailleurs, ou passe au thé quelques jours.'),
('alcool',      'Plan anti-relâchement', 'L''alcool baisse ta garde. Décide ta limite AVANT de boire, alterne chaque verre avec de l''eau, et préviens un ami de ton objectif.'),
('repas',       'Quitter la table', 'Le réflexe post-repas est puissant. Lève-toi dès la dernière bouchée : vaisselle, brossage de dents, ou 3 minutes de marche cassent le lien.'),
('pause',       'Garder la pause, changer le rituel', 'Tu as besoin de la pause, pas de la nicotine. Sors marcher, étire-toi ou bois un verre d''eau : la coupure reste, le geste change.'),
('reveil',      'Décaler la première', 'La cigarette du réveil est la plus ancrée. Mets douche, eau et petit-déjeuner AVANT : repousser la première de 30 min affaiblit l''habitude.'),
('soiree',      'Tenir les mains occupées', 'En soirée, l''envie vient des mains libres et du groupe. Garde un verre ou quelque chose à grignoter en main, et reste près des non-fumeurs.'),
('conduite',    'Rituel de voiture sans clope', 'La voiture est un déclencheur fort. Mets un chewing-gum en démarrant, lance un podcast, garde une bouteille d''eau à portée.'),
('attente',     'Transformer l''attente', 'Attendre crée un vide que la clope remplit. Prépare un truc à faire (lecture, respiration, marche sur place) pour ne pas laisser ce vide.'),
('social',      'Phrase prête', 'Quand on t''en propose une, aie une phrase simple prête : « non merci, j''arrête ». L''avoir préparée évite de céder par réflexe social.'),
('habitude',    'Surfer sur l''envie', 'Une envie monte, culmine ~3 minutes, puis redescend toujours, même si tu ne fumes pas. Observe-la comme une vague au lieu de lutter : elle passe.'),
(NULL,          'Méthode HALT', 'Avant de céder, demande-toi : ai-je Faim, suis-je en Colère, Seul, ou Fatigué ? Souvent l''envie de fumer est en fait un de ces 4 besoins déguisés — réponds au vrai besoin.'),
(NULL,          'Règle du délai de 10 minutes', 'Ne dis pas « jamais », dis « pas maintenant, dans 10 minutes ». Lance un minuteur. Dans 9 cas sur 10, l''envie est passée avant la sonnerie.'),
(NULL,          'Se rappeler le pourquoi', 'Garde une phrase de ta motivation accessible (santé, argent, un proche). La relire pendant l''envie reconnecte au sens et fait pencher la balance.');
