export type HeroHero = {
  id: string;
  title: string;
  caption: string;
  alt: string;
  damageStyle: string;
  then: string;
  now: string;
  rotationSeconds: number;
};

// Premium Hero V2: the 10 approved Pakistani human-memory concepts.
// Paths mirror apps/web/public/assets/hero/hero/ and the on-disk hero-manifest.json.
export const HERO_HEROES: readonly HeroHero[] = [
  {
    id: "hero-01-affluent-parents",
    title: "Affluent Parents Portrait",
    caption: "Bring your parents' most precious portrait back with dignity.",
    alt: "Restored vintage Pakistani parents portrait in an elegant drawing room",
    damageStyle: "faded sepia, fine cracks, worn print",
    then: "/assets/hero/hero/hero-01-affluent-parents-then.jpg",
    now: "/assets/hero/hero/hero-01-affluent-parents-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-02-grandparents-legacy",
    title: "Grandparents Legacy",
    caption: "Preserve a lifetime of love for the next generation.",
    alt: "Restored portrait of elderly Pakistani grandparents",
    damageStyle: "black and white, dim exposure, aged paper",
    then: "/assets/hero/hero/hero-02-grandparents-legacy-then.jpg",
    now: "/assets/hero/hero/hero-02-grandparents-legacy-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-03-wedding-memory",
    title: "Classic Pakistani Wedding",
    caption: "Relive the day your family story began.",
    alt: "Restored classic Pakistani wedding portrait",
    damageStyle: "folds, stains, torn corner, faded highlights",
    then: "/assets/hero/hero/hero-03-wedding-memory-then.jpg",
    now: "/assets/hero/hero/hero-03-wedding-memory-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-04-childhood-siblings",
    title: "Childhood Siblings",
    caption: "Bring childhood memories back with every little detail.",
    alt: "Restored childhood siblings portrait in a Pakistani family home",
    damageStyle: "faded colour, water stain, emulsion loss",
    then: "/assets/hero/hero/hero-04-childhood-siblings-then.jpg",
    now: "/assets/hero/hero/hero-04-childhood-siblings-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-05-three-generation-family",
    title: "Three Generation Family",
    caption: "Bring generations together in one clear family memory.",
    alt: "Restored three generation Pakistani family portrait in an elegant home",
    damageStyle: "low contrast, dust, uneven fading, age spots",
    then: "/assets/hero/hero/hero-05-three-generation-family-then.jpg",
    now: "/assets/hero/hero/hero-05-three-generation-family-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-06-graduation-pride",
    title: "Graduation Pride",
    caption: "Preserve the proud day your family worked toward together.",
    alt: "Restored Pakistani graduation portrait with parents",
    damageStyle: "black and white, creases, faded academic portrait",
    then: "/assets/hero/hero/hero-06-graduation-pride-then.jpg",
    now: "/assets/hero/hero/hero-06-graduation-pride-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-07-service-honour",
    title: "Service and Honour",
    caption: "Honor a lifetime of service with a portrait worth preserving.",
    alt: "Restored vintage Pakistani military officer portrait",
    damageStyle: "black and white, strong scratches, cracked emulsion",
    then: "/assets/hero/hero/hero-07-service-honour-then.jpg",
    now: "/assets/hero/hero/hero-07-service-honour-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-08-old-city-family",
    title: "Old City Family Memory",
    caption: "Restore the family memories tied to the streets you still remember.",
    alt: "Restored Pakistani family portrait in a historic old city street",
    damageStyle: "aged black and white, grain, dark exposure, scratches",
    then: "/assets/hero/hero/hero-08-old-city-family-then.jpg",
    now: "/assets/hero/hero/hero-08-old-city-family-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-09-railway-migration",
    title: "Railway and Migration Memory",
    caption: "Keep your family's journey alive for generations.",
    alt: "Restored Pakistani family railway journey and migration memory",
    damageStyle: "severe ageing, multiple tears, stains, missing emulsion",
    then: "/assets/hero/hero/hero-09-railway-migration-then.jpg",
    now: "/assets/hero/hero/hero-09-railway-migration-now.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-10-loved-one-memorial",
    title: "Loved One Memorial",
    caption: "Keep their memory close, clear and respectfully preserved.",
    alt: "Restored memorial portrait of a Pakistani gentleman",
    damageStyle: "dim portrait, silvering, scratches, partial fading",
    then: "/assets/hero/hero/hero-10-loved-one-memorial-then.jpg",
    now: "/assets/hero/hero/hero-10-loved-one-memorial-now.jpg",
    rotationSeconds: 7
  }
];
