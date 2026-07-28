import { Link } from "react-router-dom";

const featureContent = {
  "background-removal": {
    eyebrow: "Background removal",
    title: "Clean product cutouts for Daraz, Shopify, WooCommerce, Facebook, and Instagram.",
    body: "Remove busy backgrounds, generate transparent PNGs, or place products on marketplace-ready white backgrounds."
  },
  enhancement: {
    eyebrow: "AI enhancement",
    title: "Sharper, brighter product photos without a reshoot.",
    body: "Upscale, denoise, sharpen, and normalize product photos before publishing or exporting ad creatives."
  },
  "flat-lay": {
    eyebrow: "Flat lay",
    title: "Create polished flat lay product scenes for social and ecommerce.",
    body: "Turn simple catalog photos into clean flat lays for fashion, accessories, cosmetics, grocery, and home products."
  },
  lifestyle: {
    eyebrow: "Lifestyle scenes",
    title: "Generate scene-ready visuals that help products feel real.",
    body: "Place products into home, office, outdoor, premium, or social-media-ready lifestyle scenes."
  },
  "virtual-model": {
    eyebrow: "Virtual models",
    title: "Show apparel and accessories on model-style visuals.",
    body: "Create virtual model previews for catalogs, ads, and social campaigns while keeping the product prominent."
  },
  videos: {
    eyebrow: "Product videos",
    title: "Prepare product motion assets for ads and reels.",
    body: "Generate product video concepts, turntable-ready assets, and short creative directions for Meta ad workflows."
  }
} as const;

type FeatureKey = keyof typeof featureContent;

export function FeaturePage({ feature }: { feature: FeatureKey }) {
  const content = featureContent[feature];

  return (
    <section className="page-stack feature-detail">
      <div className="section-heading">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="section-lead">{content.body}</p>
      </div>
      <div className="export-grid">
        {["Daraz listing images", "Shopify product photos", "Meta ad creatives", "Instagram posts"].map((item) => (
          <article className="export-card" key={item}>
            <span>{item}</span>
            <strong>PKR-ready workflow</strong>
          </article>
        ))}
      </div>
      <div className="center-actions">
        <Link className="button" to="/">
          Upload a product photo
        </Link>
        <Link className="button button-secondary" to="/pricing">
          View PKR pricing
        </Link>
      </div>
    </section>
  );
}
