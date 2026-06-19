/* ──────────────────────────────────────────────
   Kairo — MobileNav
   Slide-in drawer navigation for mobile
   ────────────────────────────────────────────── */

import { useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { formatCents, truncateAddress, cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import './MobileNav.css';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const navLinks = [
  { label: 'Markets', path: '/markets' },
  { label: 'Portfolio', path: '/portfolio' },
  { label: 'Activity', path: '/activity' },
];

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const { user, balance, isAuthenticated, signIn, signOut } = useAuth();
  const location = useLocation();

  /* Close on route change */
  useEffect(() => {
    if (isOpen) onClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Close on Escape */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  /* Prevent body scroll when open */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn('mobile-nav-overlay', isOpen && 'mobile-nav-overlay--visible')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <nav
        className={cn('mobile-nav', isOpen && 'mobile-nav--open')}
        aria-label="Mobile navigation"
        aria-hidden={!isOpen}
      >
        {/* User info or brand header */}
        {isAuthenticated && user ? (
          <div className="mobile-nav__user">
            <Avatar address={user.address} size="md" />
            <div className="mobile-nav__user-info">
              <span className="mobile-nav__address">
                {truncateAddress(user.address)}
              </span>
              <span className="mobile-nav__balance-display">
                {formatCents(balance)}
              </span>
            </div>
          </div>
        ) : (
          <div className="mobile-nav__header">
            <span className="mobile-nav__brand">Kairo</span>
            <button
              className="mobile-nav__close"
              onClick={onClose}
              aria-label="Close navigation"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        )}

        {/* Links */}
        <div className="mobile-nav__links">
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                'mobile-nav__link',
                location.pathname.startsWith(link.path) && 'mobile-nav__link--active'
              )}
              onClick={onClose}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mobile-nav__footer">
          {isAuthenticated ? (
            <Button variant="ghost" fullWidth onClick={handleSignOut}>
              Sign Out
            </Button>
          ) : (
            <Button variant="primary" fullWidth onClick={signIn}>
              Connect Wallet
            </Button>
          )}
        </div>
      </nav>
    </>
  );
}
