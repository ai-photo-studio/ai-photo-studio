import { Link } from "react-router-dom";

export function VirtualModelsPage() {
  return (
    <section className="page-stack">
      <div className="section-heading">
        <p className="eyebrow">Virtual Models</p>
        <h1>Show products on realistic virtual models.</h1>
        <p className="section-lead">
          Bring your fashion and apparel products to life with AI-generated models wearing your items.
        </p>
      </div>

      <div className="hero">
        <div>
          <h2>Key Features</h2>
          <ul className="feature-list">
            <li>Multiple model ethnicities and body types</li>
            <li>Customizable poses and expressions</li>
            <li>Seasonal clothing variations</li>
            <li>Perfect for fashion ecommerce</li>
          </ul>
          <Link to="/signup" className="button">
            Try virtual models
          </Link>
        </div>
        <div className="showcase-panel">
          <img src="https://images.unsplash.com/photo-1523381210434-271e09e3d799?f=auto&q=80&w=800" alt="Virtual model wearing product" />
        </div>
      </div>

      <div className="section-heading">
        <h2>Perfect for fashion categories</h2>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <h3>Women's Fashion</h3>
          <p>Dresses, tops, bottoms, and accessories on diverse models.</p>
        </article>
        <article className="feature-card">
          <h3>Men's Apparel</h3>
          <p>Shirts, pants, jackets, and menswear collections.</p>
        </article>
        <article className="feature-card">
          <h3>Shoes & Accessories</h3>
          <p>Statement pieces shown in lifestyle contexts.</p>
        </article>
      </div>
    </section>
  );
}