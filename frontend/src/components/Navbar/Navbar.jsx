/**
 * Navbar.jsx — Top navigation bar.
 */

import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Gem, LogOut, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GemBalance } from '../GemBalance/GemBalance';
import './Navbar.css';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <Link to="/captcha" className="navbar-brand">
          <div className="navbar-logo">
            <Zap size={20} />
          </div>
          <span className="navbar-title">VELoop</span>
          <span className="navbar-subtitle">Rewards</span>
        </Link>

        {/* Nav links */}
        <div className="navbar-links">
          <NavLink
            to="/captcha"
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          >
            <Zap size={15} />
            Earn
          </NavLink>
          <NavLink
            to="/wallet"
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          >
            <Gem size={15} />
            Wallet
          </NavLink>
        </div>

        {/* Right: balance + user + logout */}
        <div className="navbar-right">
          {user && <GemBalance compact />}
          {user && (
            <div className="navbar-user">
              <div className="navbar-avatar">
                {user.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="navbar-username">{user.name}</span>
            </div>
          )}
          <button className="btn-icon" onClick={handleLogout} title="Logout" aria-label="Logout">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </nav>
  );
}
