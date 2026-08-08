/**
 * R9.3-P7 HD rotating hero asset registry.
 *
 * Single source of truth for the homepage before/after comparison heroes.
 * Derived from apps/web/public/assets/hero/hero-manifest.json (the canonical
 * asset list). Then/Now HD originals live at /assets/hero/hero/*.jpg and are
 * 1600x1600 square; previews live at /assets/hero/preview/*.jpg. Keeping this
 * as a typed module makes captions, alt text and asset paths type-safe while
 * preserving the manifest origin documented in hero-manifest.json.
 */

export type HeroHero = {
  id: string;
  title: string;
  caption: string;
  alt: string;
  damageStyle: string;
  then: string;
  now: string;
  preview: string;
  rotationSeconds: number;
};

export const HERO_HEROES: readonly HeroHero[] = [
  {
    id: "hero-01-old-parents",
    title: "Old Parents Portrait",
    caption: "Bring the faces that raised you back to life.",
    alt: "Restored old Pakistani parents and family portrait",
    damageStyle: "faded, cracked, edge wear",
    then: "/assets/hero/hero/hero-01-old-parents-then.jpg",
    now: "/assets/hero/hero/hero-01-old-parents-now.jpg",
    preview: "preview/hero-01-old-parents-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-02-grandparents",
    title: "Grandparents Couple",
    caption: "Preserve a lifetime of love for the next generation.",
    alt: "Restored portrait of an elderly Pakistani grandparents couple",
    damageStyle: "heavy scratches, torn corners, faded sepia",
    then: "/assets/hero/hero/hero-02-grandparents-then.jpg",
    now: "/assets/hero/hero/hero-02-grandparents-now.jpg",
    preview: "preview/hero-02-grandparents-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-03-wedding-memory",
    title: "Wedding Memory",
    caption: "Relive the day your family story began.",
    alt: "Restored vintage Pakistani wedding portrait",
    damageStyle: "dim, cracked, faded wedding print",
    then: "/assets/hero/hero/hero-03-wedding-memory-then.jpg",
    now: "/assets/hero/hero/hero-03-wedding-memory-now.jpg",
    preview: "preview/hero-03-wedding-memory-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-04-childhood-siblings",
    title: "Childhood Siblings",
    caption: "Bring childhood memories back with every little detail.",
    alt: "Restored childhood sibling portrait in a Pakistani home setting",
    damageStyle: "scratches, faded contrast, broken edges",
    then: "/assets/hero/hero/hero-04-childhood-siblings-then.jpg",
    now: "/assets/hero/hero/hero-04-childhood-siblings-now.jpg",
    preview: "preview/hero-04-childhood-siblings-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-05-large-family",
    title: "Large Family Group",
    caption: "Bring generations together in one clear family memory.",
    alt: "Restored large multi generation Pakistani family portrait",
    damageStyle: "old sepia, creases, scratches",
    then: "/assets/hero/hero/hero-05-large-family-then.jpg",
    now: "/assets/hero/hero/hero-05-large-family-now.jpg",
    preview: "preview/hero-05-large-family-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-06-army-officer",
    title: "Army Officer Portrait",
    caption: "Honor a lifetime of service with a portrait worth preserving.",
    alt: "Restored vintage Pakistani army officer portrait",
    damageStyle: "torn paper, washed highlights, scratches",
    then: "/assets/hero/hero/hero-06-army-officer-then.jpg",
    now: "/assets/hero/hero/hero-06-army-officer-now.jpg",
    preview: "preview/hero-06-army-officer-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-07-village-family",
    title: "Village Family Outside Mud House",
    caption: "Preserve the people and the home your memories came from.",
    alt: "Restored Pakistani village family outside a traditional mud home",
    damageStyle: "dust, faded sepia, deep creases",
    then: "/assets/hero/hero/hero-07-village-family-then.jpg",
    now: "/assets/hero/hero/hero-07-village-family-now.jpg",
    preview: "preview/hero-07-village-family-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-08-old-city-bazaar",
    title: "Old City and Bazaar Memory",
    caption: "Restore the streets, markets and moments that shaped a lifetime.",
    alt: "Restored historic Pakistani city bazaar street memory",
    damageStyle: "dark exposure, scratches, age spots",
    then: "/assets/hero/hero/hero-08-old-city-bazaar-then.jpg",
    now: "/assets/hero/hero/hero-08-old-city-bazaar-now.jpg",
    preview: "preview/hero-08-old-city-bazaar-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-09-migration-railway",
    title: "Migration and Railway Memory",
    caption: "Keep your family's journey alive for generations.",
    alt: "Restored Pakistani family railway journey and migration memory",
    damageStyle: "torn edges, stains, faded railway photograph",
    then: "/assets/hero/hero/hero-09-migration-railway-then.jpg",
    now: "/assets/hero/hero/hero-09-migration-railway-now.jpg",
    preview: "preview/hero-09-migration-railway-preview.jpg",
    rotationSeconds: 7
  },
  {
    id: "hero-10-loved-one",
    title: "Loved One Memorial Portrait",
    caption: "Keep their memory close, clear and respectfully preserved.",
    alt: "Restored memorial portrait of a Pakistani man",
    damageStyle: "heavy cracks, dim face, faded portrait",
    then: "/assets/hero/hero/hero-10-loved-one-then.jpg",
    now: "/assets/hero/hero/hero-10-loved-one-now.jpg",
    preview: "preview/hero-10-loved-one-preview.jpg",
    rotationSeconds: 7
  }
];
