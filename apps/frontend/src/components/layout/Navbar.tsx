/* ──────────────────────────────────────────────
   Kairo — Navbar
   Fixed top navigation with glassmorphism
   ────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { formatCents, truncateAddress, cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import './Navbar.css';

interface NavbarProps {
  onMenuToggle: () => void;
}

const navLinks = [
  { label: 'Markets', path: '/markets' },
  { label: 'Portfolio', path: '/portfolio' },
  { label: 'Activity', path: '/activity' },
];

export function Navbar({ onMenuToggle }: NavbarProps) {
  const { user, balance, isAuthenticated, signIn, isLoading } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn('navbar', scrolled && 'navbar--scrolled')}
      role="banner"
    >
      {/* Logo */}
      <Link to="/" className="navbar__logo" aria-label="Kairo home">
        <span className="navbar__logo-dot" aria-hidden="true" />
        <span className="navbar__logo-text">Kairo</span>
      </Link>

      {/* Center Nav */}
      <nav aria-label="Main navigation">
        <ul className="navbar__links">
          {navLinks.map(link => (
            <li key={link.path}>
              <Link
                to={link.path}
                className={cn(
                  'navbar__link',
                  location.pathname.startsWith(link.path) && 'navbar__link--active'
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Right */}
      <div className="navbar__right">
        {isAuthenticated && user ? (
          <>
            <div className="navbar__balance" aria-label={`Balance: ${formatCents(balance)}`}>
              <svg className="navbar__balance-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4.5v7M6 6.5c0-.83.9-1.5 2-1.5s2 .67 2 1.5-.9 1.5-2 1.5-2 .67-2 1.5.9 1.5 2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {formatCents(balance)}
            </div>
            <div className="navbar__user-section" role="button" tabIndex={0} aria-label="User profile">
              <Avatar address={user.address} size="sm" />
              <span className="navbar__address">{truncateAddress(user.address)}</span>
            </div>
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={signIn}
            isLoading={isLoading}
          >
            Connect Wallet
          </Button>
        )}

        {/* Mobile hamburger */}
        <button
          className="navbar__hamburger"
          onClick={onMenuToggle}
          aria-label="Open navigation menu"
          type="button"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
      </div>
    </header>
  );
}
