import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { CookieConsentBanner, getStoredConsent, type ConsentLevel } from './components/CookieConsentBanner';
import { useAuthStore } from './store/useAuthStore';
import { LandingPage }         from './pages/LandingPage';
import { SearchPage }          from './pages/SearchPage';
import { PricingPage }         from './pages/PricingPage';
import { AuthPage }            from './pages/AuthPage';
import { DashboardPage }       from './pages/DashboardPage';
import { CheckoutPage }        from './pages/CheckoutPage';
import { CheckoutSuccessPage } from './pages/CheckoutSuccessPage';
import { PrivacidadPage }      from './pages/PrivacidadPage';
import { TerminosPage }        from './pages/TerminosPage';
import { CookiesPage }         from './pages/CookiesPage';
import { PoliticaIAPage }      from './pages/PoliticaIAPage';

export function App() {
  const [consent,  setConsent]  = useState<ConsentLevel | null>(null);
  const [checked,  setChecked]  = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // ── 1. Check cookie consent ───────────────────────────────────────────
  useEffect(() => {
    const stored = getStoredConsent();
    if (stored) setConsent(stored.level);
    setChecked(true);
  }, []);

  // ── 2. Manually hydrate the auth store (Atelier pattern: skipHydration) ─
  useEffect(() => {
    useAuthStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  // Don't render until both checks complete
  if (!checked || !hydrated) return null;

  const showBanner = consent === null;

  return (
    <div className="min-h-screen flex flex-col bg-brand-navy text-white font-sans">
      <AnimatePresence>
        {showBanner && <CookieConsentBanner onAccept={(l) => setConsent(l)} />}
      </AnimatePresence>

      <div
        className={showBanner ? 'pointer-events-none select-none' : ''}
        style={showBanner ? { filter: 'blur(4px)', transition: 'filter 0.3s' } : {}}
        aria-hidden={showBanner}
      >
        <Navbar />
        <main className="flex-1">
          <Routes>
            {/* Public */}
            <Route path="/"             element={<LandingPage />} />
            <Route path="/buscar"       element={<SearchPage />} />
            <Route path="/pricing"      element={<PricingPage />} />
            <Route path="/auth"         element={<AuthPage />} />

            {/* Checkout — requires auth (checked inside the page) */}
            <Route path="/checkout"         element={<CheckoutPage />} />
            <Route path="/checkout/success" element={<CheckoutSuccessPage />} />

            {/* Protected — requires auth (checked inside the page) */}
            <Route path="/dashboard/*" element={<DashboardPage />} />

            {/* Legal */}
            <Route path="/privacidad"  element={<PrivacidadPage />} />
            <Route path="/terminos"    element={<TerminosPage />} />
            <Route path="/cookies"     element={<CookiesPage />} />
            <Route path="/politica-ia" element={<PoliticaIAPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </div>
  );
}
