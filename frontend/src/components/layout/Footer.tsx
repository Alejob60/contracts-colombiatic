import { Link } from 'react-router-dom';
import { FileSearch } from 'lucide-react';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5 bg-brand-dark py-12 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
        {/* Brand */}
        <div className="md:col-span-1">
          <Link to="/" className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center">
              <FileSearch className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-white">
              ColombiaTIC <span className="text-emerald-400">Contracts</span>
            </span>
          </Link>
          <p className="text-stone-500 text-xs leading-relaxed max-w-xs">
            Inteligencia artificial para el ciclo completo de contratación pública colombiana.
            Hecho para contratistas colombianos.
          </p>
        </div>

        {/* Plataforma */}
        <div>
          <h3 className="text-stone-300 font-semibold text-xs mb-3 uppercase tracking-wider">Plataforma</h3>
          <ul className="space-y-2">
            {[
              { to: '/buscar', label: 'Buscador SECOP II' },
              { to: '/pricing', label: 'Plan PRO Licitador' },
              { to: '/auth', label: 'Crear cuenta' },
              { to: '/dashboard', label: 'Mi Dashboard' },
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-stone-500 hover:text-stone-300 text-xs transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Servicios */}
        <div>
          <h3 className="text-stone-300 font-semibold text-xs mb-3 uppercase tracking-wider">Servicios</h3>
          <ul className="space-y-2">
            {[
              { label: 'Buscar licitaciones', to: '/buscar' },
              { label: 'Evaluador IA de pliegos', to: '/pricing' },
              { label: 'Alertas WhatsApp', to: '/pricing' },
              { label: 'Sync SIA OBSERVA', to: '/pricing' },
              { label: 'Publicar en SECOP II', to: '/pricing' },
            ].map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="text-stone-500 hover:text-stone-300 text-xs transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="text-stone-300 font-semibold text-xs mb-3 uppercase tracking-wider">Legal</h3>
          <ul className="space-y-2">
            {[
              { to: '/terminos', label: 'Términos de uso' },
              { to: '/privacidad', label: 'Política de Privacidad' },
              { to: '/cookies', label: 'Política de Cookies' },
              { to: '/politica-ia', label: 'Política de Uso de IA' },
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-stone-500 hover:text-stone-300 text-xs transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-stone-600 text-xs">
          © {year} ColombiaTIC SAS · contracts.colombiatic.com.co · Construido para contratistas colombianos
        </p>
        <div className="flex gap-4 text-xs text-stone-700">
          <span>Protección de datos — Ley 1581/2012</span>
          <a
            href="https://datos.gov.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 hover:text-emerald-500"
          >
            Datos: datos.gov.co
          </a>
        </div>
      </div>
    </footer>
  );
}
