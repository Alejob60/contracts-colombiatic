import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, FileSearch, LogOut, User } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const NAV_LINKS = [
  { href: '/buscar', label: 'Buscar' },
  { href: '/#servicios', label: 'Servicios' },
  { href: '/pricing', label: 'Precios' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAuth, isPro, user, logout } = useAuthStore();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || mobileOpen
          ? 'bg-brand-dark/95 backdrop-blur-xl border-b border-white/5 shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14 sm:h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400
              flex items-center justify-center">
              <FileSearch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <span className="font-semibold text-white text-base sm:text-lg tracking-tight">
              ColombiaTIC <span className="text-emerald-400">Contracts</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`text-sm transition-colors ${
                  pathname === link.href
                    ? 'text-emerald-400'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            {isAuth ? (
              <>
                {!isPro && (
                  <Link to="/checkout"
                    className="text-sm bg-amber-500/10 border border-amber-500/20 text-amber-400
                      px-3 py-1.5 rounded-lg hover:bg-amber-500/15 transition-colors font-medium">
                    ⚡ Activar PRO
                  </Link>
                )}
                <Link to="/dashboard"
                  className="flex items-center gap-1.5 text-sm text-stone-300 hover:text-white
                    transition-colors px-3 py-1.5">
                  <User className="w-3.5 h-3.5" />
                  {user?.name?.split(' ')[0] ?? 'Dashboard'}
                </Link>
                <button onClick={() => { logout(); navigate('/'); }}
                  className="p-2 text-stone-500 hover:text-stone-300 transition-colors"
                  title="Cerrar sesión">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <Link to="/auth"
                  className="text-sm text-stone-400 hover:text-white transition-colors px-3 py-1.5">
                  Iniciar sesión
                </Link>
                <Link to="/buscar"
                  className="text-sm bg-gradient-to-r from-emerald-500 to-teal-400 text-white
                    font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
                  Buscar gratis
                </Link>
              </>
            )}
          </div>

          {/* Mobile: buscar shortcut + hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              to="/buscar"
              className="text-xs bg-gradient-to-r from-emerald-500 to-teal-400 text-white
                font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Buscar
            </Link>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="p-2 text-stone-400 hover:text-white transition-colors
                min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden bg-brand-dark/98 border-b border-white/5"
          >
            <div className="px-4 pb-4 pt-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="flex items-center py-3.5 text-stone-300 hover:text-white
                    border-b border-white/5 text-sm font-medium last:border-0 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/auth"
                className="flex items-center justify-center mt-3 py-3 border border-white/10
                  text-stone-300 rounded-xl text-sm font-medium hover:border-white/20 hover:text-white
                  transition-colors"
              >
                Iniciar sesión
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
