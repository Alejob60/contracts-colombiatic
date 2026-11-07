import { useEffect, useState } from 'react';
import { useNavigate, Link, Routes, Route } from 'react-router-dom';
import { Search, FileText, Bell, BarChart3, Users, ArrowRight, Zap, Building2, Bookmark } from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { PerfilPage }        from './dashboard/PerfilPage';
import { GuardadosPage }     from './dashboard/GuardadosPage';
import { DocumentosPage }    from './dashboard/DocumentosPage';
import { EvaluacionesPage }  from './dashboard/EvaluacionesPage';
import { AlertasPage }       from './dashboard/AlertasPage';
import { AnalyticaPage }     from './dashboard/AnalyticaPage';
import { RedB2BPage }        from './dashboard/RedB2BPage';
import { WorkspacePage }     from './dashboard/WorkspacePage';
import { ExternalProcessPage } from './dashboard/ExternalProcessPage';
import { IntegracionSECOPPage } from './dashboard/IntegracionSECOPPage';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const FEATURE_CARDS = [
  { icon: Search,    title: 'Búsqueda ilimitada',  desc: 'Sprint 1 ✓ — activo', done: true,  to: '/buscar' },
  { icon: Building2, title: 'Perfil de empresa',   desc: 'Sprint 3 ✓ — activo', done: true,  to: '/dashboard/perfil' },
  { icon: Bookmark,  title: 'Procesos guardados',  desc: 'Sprint 3 ✓ — activo', done: true,  to: '/dashboard/guardados' },
  { icon: FileText,  title: 'Documentos RAG',      desc: 'Sprint 4 ✓ — activo', done: true,  to: '/dashboard/documentos' },
  { icon: BarChart3, title: 'Evaluador IA',         desc: 'Sprint 5 ✓ — activo', done: true,  to: '/dashboard/evaluaciones' },
  { icon: Bell,      title: 'Alertas Email',     desc: 'Sprint 6 ✓ — activo', done: true,  to: '/dashboard/alertas' },
  { icon: BarChart3, title: 'Analítica',          desc: 'Sprint 7 ✓ — activo', done: true,  to: '/dashboard/analitica' },
  { icon: Users,     title: 'Red B2B',            desc: 'Sprint 8 ✓ — activo', done: true,  to: '/dashboard/b2b' },
];

function DashboardHome() {
  const { user, isPro } = useAuthStore();
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    const token = getContractsToken();
    if (!token) return;
    fetch(`${API_BASE}/api/v1/company/saved`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSavedCount(d.total ?? 0))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <p className="text-stone-500 text-sm mb-1">Bienvenido,</p>
        <h1 className="text-white font-bold text-2xl">
          {user?.name ?? user?.email ?? 'Contratista'}
        </h1>
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            isPro
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'bg-white/5 text-stone-400 border border-white/10'
          }`}>
            {isPro ? '⚡ PRO Licitador' : 'Plan Gratuito'}
          </span>
          <span className="text-stone-600 text-xs">{user?.email}</span>
        </div>
      </div>

      {/* PRO upgrade banner */}
      {!isPro && (
        <div className="mb-8 p-5 bg-gradient-to-r from-emerald-500/10 to-teal-500/5
          border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-white font-semibold mb-1">Activa el Plan PRO Licitador</p>
            <p className="text-stone-400 text-sm">
              Búsquedas ilimitadas, evaluador IA, alertas WhatsApp y más.
            </p>
          </div>
          <Link to="/checkout"
            className="shrink-0 flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm">
            <Zap className="w-4 h-4" />
            Activar PRO — $149.000/mes
          </Link>
        </div>
      )}

      {/* Quick stats */}
      {savedCount !== null && savedCount > 0 && (
        <div className="mb-6 flex gap-3">
          <Link to="/dashboard/guardados"
            className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border border-white/8
              rounded-xl text-sm text-stone-300 hover:text-white hover:border-white/15 transition-all">
            <Bookmark className="w-4 h-4 text-emerald-400" />
            {savedCount} proceso{savedCount !== 1 ? 's' : ''} guardado{savedCount !== 1 ? 's' : ''}
            <ArrowRight className="w-3.5 h-3.5 text-stone-500" />
          </Link>
        </div>
      )}

      {/* Quick action: search */}
      <div className="mb-8 p-4 bg-white/[0.02] border border-white/8 rounded-2xl">
        <h2 className="text-white font-semibold text-sm mb-3">Buscar licitaciones SECOP II</h2>
        <Link to="/buscar"
          className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/20
            rounded-xl hover:border-emerald-500/30 transition-colors group">
          <div className="flex items-center gap-3">
            <Search className="w-4 h-4 text-emerald-400" />
            <span className="text-stone-300 text-sm group-hover:text-white transition-colors">
              Ir al buscador →
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-500 group-hover:text-emerald-400 transition-colors" />
        </Link>
      </div>

      {/* Modules */}
      <h2 className="text-stone-500 text-xs uppercase tracking-wider font-medium mb-4">
        Módulos del Dashboard
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURE_CARDS.map((f) => (
          <Link key={f.title} to={f.to}
            className={`bg-white/[0.02] border border-white/8 rounded-2xl p-5 transition-all ${
              f.done
                ? 'hover:border-emerald-500/20 hover:bg-white/[0.04] cursor-pointer'
                : 'opacity-50 cursor-not-allowed pointer-events-none'
            }`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
              f.done ? 'bg-emerald-500/15' : 'bg-white/5'
            }`}>
              <f.icon className={`w-4 h-4 ${f.done ? 'text-emerald-400' : 'text-stone-500'}`} />
            </div>
            <h3 className="text-stone-300 font-medium text-sm mb-0.5">{f.title}</h3>
            <p className={`text-xs ${f.done ? 'text-emerald-600' : 'text-stone-600'}`}>
              {f.desc}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}

export function DashboardPage() {
  const navigate   = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) navigate('/auth?redirect=/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-brand-navy pt-20 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="perfil"       element={<PerfilPage />} />
          <Route path="guardados"    element={<GuardadosPage />} />
          <Route path="documentos"   element={<DocumentosPage />} />
          <Route path="evaluaciones" element={<EvaluacionesPage />} />
          <Route path="alertas"      element={<AlertasPage />} />
          <Route path="analitica"    element={<AnalyticaPage />} />
          <Route path="b2b"          element={<RedB2BPage />} />
          <Route path="workspace/:procesoId" element={<WorkspacePage />} />
          <Route path="proceso-externo" element={<ExternalProcessPage />} />
          <Route path="integracion-secop" element={<IntegracionSECOPPage />} />
        </Routes>
      </div>
    </div>
  );
}
