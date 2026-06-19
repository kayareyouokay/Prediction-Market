/* ──────────────────────────────────────────────
   Kairo — Landing Page
   Premium marketing page, first impression
   ────────────────────────────────────────────── */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMarkets } from '@/hooks/useMarkets';
import { formatCents, formatQty, getYesPrice } from '@/lib/utils';
import { MarketCard } from '@/components/market/MarketCard';
import { Skeleton } from '@/components/ui/Skeleton';
import './LandingPage.css';

/* ── Inline SVG Icons ── */

function ChartBarsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 16V12" />
      <path d="M11 16V8" />
      <path d="M15 16V4" />
      <path d="M19 16v-4" />
    </svg>
  );
}

function ArrowsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v16" />
      <path d="M3 8l4-4 4 4" />
      <path d="M17 20V4" />
      <path d="M13 16l4 4 4-4" />
    </svg>
  );
}

function PieChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}

/* ── IntersectionObserver Hook ── */

function useInView(threshold = 0.15): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible];
}

/* ── Landing Page Component ── */

export function LandingPage() {
  const { isAuthenticated, signIn } = useAuth();
  const { markets, isLoading } = useMarkets();

  const [previewRef, previewVisible] = useInView(0.1);
  const [featuresRef, featuresVisible] = useInView(0.1);
  const [statsRef, statsVisible] = useInView(0.15);

  const previewMarkets = markets.slice(0, 3);

  /* ── Derived stats ── */
  const marketCount = markets.length;
  const totalVolume = markets.reduce((sum, m) => sum + m.totalQty, 0);
  const activeMarkets = markets.filter(m => m.resolution === null).length;

  const handleConnectWallet = useCallback(async () => {
    await signIn();
  }, [signIn]);

  return (
    <div className="landing-page">
      {/* ── Hero ── */}
      <section className="landing-hero" aria-label="Hero">
        <div className="landing-hero__bg-accent" aria-hidden="true" />

        <div className="landing-hero__content">
          <span className="landing-hero__badge">
            <span className="landing-hero__badge-dot" />
            Live on Solana
          </span>

          <h1 className="landing-hero__title">
            Trade on the{' '}
            <span className="landing-hero__title-gradient">Future</span>
          </h1>

          <p className="landing-hero__subtitle">
            Institutional-grade prediction markets. Trade binary outcomes
            with real-time orderbooks.
          </p>

          <div className="landing-hero__actions">
            <Link to="/markets" className="landing-hero__cta-primary">
              Explore Markets
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            {isAuthenticated ? (
              <Link to="/portfolio" className="landing-hero__cta-secondary">
                Go to Portfolio
              </Link>
            ) : (
              <button
                className="landing-hero__cta-secondary"
                onClick={handleConnectWallet}
                type="button"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Preview Markets ── */}
      <section className="landing-preview" aria-label="Featured Markets" ref={previewRef}>
        <div className="landing-preview__inner">
          <p className="landing-section-label">Live Markets</p>
          <h2 className="landing-section-title">Trade What You Believe</h2>

          {isLoading ? (
            <div className="landing-preview__skeleton-grid" aria-busy="true">
              {[0, 1, 2].map(i => (
                <div className="landing-preview__skeleton-card" key={i}>
                  <Skeleton width="70%" height="20px" borderRadius="6px" />
                  <Skeleton width="100%" height="14px" borderRadius="4px" />
                  <Skeleton width="100%" height="14px" borderRadius="4px" />
                  <Skeleton width="60%" height="32px" borderRadius="8px" />
                </div>
              ))}
            </div>
          ) : (
            <div className="landing-preview__grid">
              {previewMarkets.map((market, idx) => (
                <div
                  key={market.id}
                  className={`landing-preview__card-wrapper ${previewVisible ? 'landing-preview__card-wrapper--visible' : ''}`}
                  style={{ transitionDelay: `${idx * 120}ms` }}
                >
                  <div className="landing-preview__card-float">
                    <MarketCard market={market} />
                  </div>
                </div>
              ))}
              {previewMarkets.length === 0 && (
                <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                  No markets available yet. Check back soon.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-features" aria-label="Features" ref={featuresRef}>
        <div className="landing-features__inner">
          <p className="landing-section-label">Why Kairo</p>
          <h2 className="landing-section-title">Built for Serious Traders</h2>

          <div className="landing-features__grid">
            <article className={`landing-feature-card ${featuresVisible ? 'landing-feature-card--visible' : ''}`}>
              <div className="landing-feature-card__icon">
                <ChartBarsIcon />
              </div>
              <h3 className="landing-feature-card__title">Orderbook Trading</h3>
              <p className="landing-feature-card__desc">
                Full limit orderbook with real-time depth. Set your price, control your risk.
                No AMM slippage.
              </p>
            </article>

            <article className={`landing-feature-card ${featuresVisible ? 'landing-feature-card--visible' : ''}`}>
              <div className="landing-feature-card__icon">
                <ArrowsIcon />
              </div>
              <h3 className="landing-feature-card__title">Split &amp; Merge</h3>
              <p className="landing-feature-card__desc">
                Split USD into Yes + No shares or merge them back. Flexible position management
                with atomic settlement.
              </p>
            </article>

            <article className={`landing-feature-card ${featuresVisible ? 'landing-feature-card--visible' : ''}`}>
              <div className="landing-feature-card__icon">
                <PieChartIcon />
              </div>
              <h3 className="landing-feature-card__title">Portfolio Analytics</h3>
              <p className="landing-feature-card__desc">
                Track positions, monitor P&amp;L, and view full order history.
                Everything in one clean dashboard.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="landing-stats" aria-label="Platform Stats" ref={statsRef}>
        <div className="landing-stats__inner">
          <p className="landing-section-label">Platform</p>
          <h2 className="landing-section-title">Growing Every Day</h2>

          <div className="landing-stats__grid">
            <div className={`landing-stat-card ${statsVisible ? 'landing-stat-card--visible' : ''}`}>
              <p className="landing-stat-card__value">{marketCount}</p>
              <p className="landing-stat-card__label">Total Markets</p>
            </div>
            <div className={`landing-stat-card ${statsVisible ? 'landing-stat-card--visible' : ''}`}>
              <p className="landing-stat-card__value">{formatQty(totalVolume)}</p>
              <p className="landing-stat-card__label">Shares Traded</p>
            </div>
            <div className={`landing-stat-card ${statsVisible ? 'landing-stat-card--visible' : ''}`}>
              <p className="landing-stat-card__value">{activeMarkets}</p>
              <p className="landing-stat-card__label">Active Markets</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="landing-cta" aria-label="Call to action">
        <div className="landing-cta__inner">
          <h2 className="landing-cta__title">Ready to Start Trading?</h2>
          <p className="landing-cta__desc">
            Connect your Solana wallet and start trading on outcomes that matter to you.
          </p>
          <div className="landing-hero__actions">
            <Link to="/markets" className="landing-hero__cta-primary">
              Browse Markets
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <span className="landing-footer__brand">Kairo</span>
          <div className="landing-footer__links">
            <Link to="/markets" className="landing-footer__link">Markets</Link>
            <Link to="/portfolio" className="landing-footer__link">Portfolio</Link>
            <Link to="/activity" className="landing-footer__link">Activity</Link>
          </div>
          <span className="landing-footer__copy">&copy; {new Date().getFullYear()} Kairo. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
