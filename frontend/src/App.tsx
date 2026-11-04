import { Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
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
  return (
    <div className="min-h-screen flex flex-col bg-brand-navy text-white font-sans">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/buscar" element={<SearchPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/dashboard/*" element={<DashboardPage />} />
          {/* Legal */}
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="/terminos" element={<TerminosPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/politica-ia" element={<PoliticaIAPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
