import { Link } from "react-router-dom";

export const CANONICAL_LOGO_SRC = "/assets/logo2.png";

export function BrandLogo() {
  return (
    <Link to="/" className="brand" aria-label="ThanNow home">
      <img src={CANONICAL_LOGO_SRC} alt="ThanNow" className="brand-logo" />
    </Link>
  );
}
