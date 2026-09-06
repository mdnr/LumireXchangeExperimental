import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isSeller = user?.roles.includes('Seller') ?? false;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">◆</span>
          <span className="brand-name">Lumière</span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/catalogue" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Catalogue
          </NavLink>
          {isSeller && (
            <NavLink to="/seller" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Seller studio
            </NavLink>
          )}
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              <span className="nav-user" title={user.email}>
                {user.displayName}
              </span>
              <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}