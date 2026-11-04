import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { CookieConsentBanner, getStoredConsent, type ConsentLevel } from './components/CookieConsentBanner';
import { LandingPage } from './pages/LandingPage';
import { SearchPage } from './pages/SearchPage';
import { PricingPage } from './pages/PricingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { PrivacidadPage } from './pages/PrivacidadPage';
import { TerminosPage } from './pages/TerminosPage';
import { CookiesPage } from './pages/CookiesPage';
import { PoliticaIAPage } from './pages/PoliticaIAPage';

export function App() {
  const [consent, setConsent] = useState<ConsentLevel | null>(null);
  const [checked, setChecked] = useState(false);

  // Check stored consent on mount
  useEffect(() => {
    const stored = getStoredConsent();
    if (stored) {
      setConsent(stored.level);
    }
    setChecked(true);
  }, []);

  const handleConsent = (level: ConsentLevel) => {
    setConsent(level);
  };

  // Don't render anything until we've checked localStorage (avoids flash)
  if (!checked) return null;

  const showBanner = consent === null;

  return (
    <div className="min-h-screen flex flex-col bg-brand-navy text-white font-sans">
      {/* Cookie consent gate — shown until user decides */}
      <AnimatePresence>
        {showBanner && <CookieConsentBanner onAccept={handleConsent} />}
      </AnimatePresence>

      {/* Main content — visible but blurred until consent given */}
      <div
        className={showBanner ? 'pointer-events-none select-none' : ''}
        style={showBanner ? { filter: 'blur(4px)', transition: 'filter 0.3s' } : {}}
        aria-hidden={showBanner}
      >
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/buscar" element={<SearchPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard/*" element={<DashboardPage />} />
            <Route path="/privacidad" element={<PrivacidadPage />} />
            <Route path="/terminos" element={<TerminosPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="/politica-ia" element={<PoliticaIAPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </div>
  );
}
