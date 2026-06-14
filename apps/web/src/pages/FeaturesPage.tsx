import { Link } from "react-router-dom";

const features = [
  {
    title: "Background Removal",
    path: "/background-removal",
    description: "Remove backgrounds instantly with AI precision. Get clean, transparent PNGs ready for any background.",
    icon: "🖼️"
  },
  {
    title: "Auto Crop",
    path: "/features#auto-crop",
    description: "Automatically crop and center your product with optimal framing and aspect ratios.",
    icon: "✂️"
  },
  {
    title: "AI Enhancement",
    path: "/features#ai-enhancement",
    description: "Enhance product photos with AI-powered upscaling, color correction, and noise reduction.",
    icon: "✨"
  },
  {
    title: "Flat Lay Creation",
    path: "/flat-lay",
    description: "Generate professional flat lay product photos with customizable backgrounds and layouts.",
    icon: "📐"
  },
  {
    title: "Lifestyle Scenes",
    path: "/lifestyle-scenes",
    description: "Place products in realistic lifestyle environments with contextual backgrounds.",
    icon: "🏠"
  },
  {
    title: "Virtual Models",
    path: "/virtual-models",
    description: "Show products on virtual models for fashion, apparel, and wearable categories.",
    icon: "👗"
  },
  {
    title: "Product Videos",
    path: "/product-videos",
    description: "Create short, engaging product videos with smooth camera movements and transitions.",
    icon: "🎥"
  },
  {
    title: "Batch Processing",
    path: "/features#batch",
    description: "Process hundreds of products at once with our batch upload and processing system.",
    icon: "⚡"
  },
  {
    title: "Credit System",
    path: "/pricing",
    description: "Flexible credit-based pricing with volume discounts and subscription options.",
    icon: "💳"
  },
  {
    title: "API Ready",
    path: "/features#api",
    description: "Integrate AI photo editing directly into your workflow with our REST API.",
    icon: "🔌"
  },
  {
    title: "Admin Analytics",
    path: "/features#analytics",
    description: "Track usage, credits, and performance metrics through our admin dashboard.",
    icon: "📊"
  }
];

export function FeaturesPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">All Features</p>
        <h1>Everything you need for professional product photography.</h1>
        <p className="section-lead">
          From background removal to virtual models, we have everything to make your products sell better.
        </p>
      </div>

      <div className="feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
            {feature.path.startsWith("/") && (
              <Link to={feature.path} className="text-link">
                Learn more →
              </Link>
            )}
          </article>
        ))}
      </div>

      <div className="section-heading">
        <h2>Ready to get started?</h2>
        <p>Join thousands of sellers improving their product photos with AI.</p>
      </div>
      <div className="button-row" style={{ justifyContent: "center" }}>
        <Link to="/signup" className="button">
          Start free trial
        </Link>
        <Link to="/pricing" className="button button-secondary">
          View pricing
        </Link>
      </div>
    </section>
  );
}