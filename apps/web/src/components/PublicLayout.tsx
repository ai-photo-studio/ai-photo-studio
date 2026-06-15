import { Link, NavLink, Outlet } from "react-router-dom";

export function PublicLayout() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark">AI</span>
          <span>
            <strong>Photo Studio</strong>
            <small>AI product photography</small>
          </span>
        </Link>
        <nav className="site-nav">
          <NavLink to="/background-removal" className="nav-link">Remove BG</NavLink>
          <div className="nav-dropdown">
            <button type="button" className="nav-link nav-menu-button">Services</button>
            <div className="nav-dropdown-menu" aria-label="Services menu">
              <NavLink to="/background-removal">Background Removal</NavLink>
              <NavLink to="/enhancement">AI Enhancement</NavLink>
              <NavLink to="/enhancement">Auto Crop & Center</NavLink>
              <NavLink to="/flat-lay">Flat Lay</NavLink>
              <NavLink to="/lifestyle">Lifestyle Scenes</NavLink>
              <NavLink to="/virtual-model">Virtual Models</NavLink>
              <NavLink to="/videos">Product Videos</NavLink>
              <NavLink to="/pricing">Marketplace Ready Images</NavLink>
            </div>
          </div>
          <NavLink to="/pricing" className="nav-link">Pricing</NavLink>
          <NavLink to="/login" className="nav-link">Login</NavLink>
          <NavLink to="/register" className="button">Sign Up</NavLink>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>&copy; 2026 AI Product Photo Studio. Pakistan-ready ecommerce visuals in PKR.</p>
      </footer>
    </div>
  );
}
