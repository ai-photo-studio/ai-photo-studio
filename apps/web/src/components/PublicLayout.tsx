import { Link, NavLink, Outlet } from "react-router-dom";
import { useState, useEffect } from "react";

const features = [
  { title: "Background Removal", path: "/background-removal", description: "Remove backgrounds instantly with AI precision" },
  { title: "Auto Crop", path: "/features#auto-crop", description: "Automatically crop and center your product" },
  { title: "AI Enhancement", path: "/features#ai-enhancement", description: "Enhance photos with AI upscaling and correction" },
  { title: "Flat Lay Creation", path: "/flat-lay", description: "Generate professional flat lay product photos" },
  { title: "Lifestyle Scenes", path: "/lifestyle-scenes", description: "Place products in realistic environments" },
  { title: "Virtual Models", path: "/virtual-models", description: "Show products on virtual models" },
  { title: "Product Videos", path: "/product-videos", description: "Create short, engaging product videos" },
  { title: "Batch Processing", path: "/features#batch", description: "Process hundreds of products at once" },
  { title: "Credit System", path: "/pricing", description: "Flexible credit-based pricing" },
  { title: "API Ready", path: "/features#api", description: "Integrate into your workflow" }
];

export function PublicLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsFeaturesOpen(false);
  }, []);

  return (
    <div className="site-shell">
      <header className={`site-header ${isSticky ? "site-header-sticky" : ""}`}>
        <Link to="/" className="brand">
          <span className="brand-mark">AI</span>
          <span>
            <strong>Product Photo Studio</strong>
            <small>AI product photography for ecommerce sellers</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Home
          </NavLink>
          <div className="nav-features" onMouseEnter={() => setIsFeaturesOpen} onMouseLeave={() => setIsFeaturesOpen}>
            <button className="nav-link" type="button">
              Features ▼
            </button>
            <div className={`mega-menu ${isFeaturesOpen ? "mega-menu-open" : ""}`}>
              <div className="mega-menu-grid">
                {features.map((feature) => (
                  <Link to={feature.path} key={feature.title} className="mega-menu-item">
                    <strong>{feature.title}</strong>
                    <span>{feature.description}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <NavLink to="/pricing" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Pricing
          </NavLink>
          <NavLink to="/login" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Login
          </NavLink>
          <NavLink to="/signup" className={({ isActive }) => `button button-small${isActive ? " button-active" : ""}`}>
            Get started
          </NavLink>
          <button className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
            ☰
          </button>
        </nav>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-main">
          <div>
            <h3>AI Product Photo Studio</h3>
            <p>Professional AI product photo editing for ecommerce sellers on Daraz, Shopify, WooCommerce, Facebook, TikTok, and WhatsApp.</p>
            <div className="social-links">
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
            </div>
          </div>
          <div className="footer-columns">
            <div>
              <h4>Features</h4>
              <Link to="/background-removal">Background Removal</Link>
              <Link to="/flat-lay">Flat Lay</Link>
              <Link to="/lifestyle-scenes">Lifestyle Scenes</Link>
              <Link to="/virtual-models">Virtual Models</Link>
              <Link to="/product-videos">Product Videos</Link>
            </div>
            <div>
              <h4>Company</h4>
              <Link to="/pricing">Pricing</Link>
              <Link to="/features">All Features</Link>
              <Link to="/blog">Blog</Link>
            </div>
            <div>
              <h4>Support</h4>
              <Link to="/contact">Contact</Link>
              <Link to="/faq">FAQ</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 AI Product Photo Studio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}