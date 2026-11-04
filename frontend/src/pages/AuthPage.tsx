import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function AuthPage() {
  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4 pt-16">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">🔐</span>
        </div>
        <h1 className="text-white font-semibold text-2xl mb-2">Autenticación</h1>
        <p className="text-stone-500 text-sm mb-6">
          Sprint 2 — Próximamente. Login y registro de empresas.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-stone-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
