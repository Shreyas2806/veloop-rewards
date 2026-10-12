/**
 * Navbar.jsx — Top navigation bar.
 */

import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Gem, LogOut, Zap, LayoutDashboard, User } from 'lucide-react';
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
        <Link to="/dashboard" className="navbar-brand">
          <div className="navbar-logo">
            <Zap size={18} />
          </div>
          <div className="navbar-wordmark">
            <span className="navbar-title">VELoop</span>
            <span className="navbar-subtitle">Rewards</span>
          </div>
        </Link>

        {/* Nav links */}
        <div className="navbar-links">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          >
            <LayoutDashboard size={14} />
            Dashboard
          </NavLink>
          <NavLink
            to="/captcha"
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          >
            <Zap size={14} />
            Earn
          </NavLink>
          <NavLink
            to="/wallet"
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          >
            <Gem size={14} />
            Wallet
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          >
            <User size={14} />
            Profile
          </NavLink>
        </div>

        {/* Right: balance + user + logout */}
        <div className="navbar-right">
          {user && <GemBalance compact />}
          {user && (
            <Link to="/profile" className="navbar-user" title="View Profile">
              <div className="navbar-avatar">
                {user.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="navbar-username">{user.name}</span>
            </Link>
          )}
          <button className="btn-icon" onClick={handleLogout} title="Logout" aria-label="Logout">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </nav>
  );
}
