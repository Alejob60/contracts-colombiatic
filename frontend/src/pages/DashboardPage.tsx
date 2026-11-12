import { useEffect, useState } from 'react';
import { useNavigate, Link, Routes, Route } from 'react-router-dom';
import {
  Search, FileText, Bell, BarChart3, Users,
  ArrowRight, Zap, Building2, Bookmark, TrendingUp,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { DashboardSidebar, MobileSidebarTrigger } from '@/components/layout/DashboardSidebar';
import { ProfileCompletionBanner } from '@/components/profile/ProfileCompletionBanner';
import { useProfileCompletion }    from '@/hooks/useProfileCompletion';
import { PerfilPage }        from './dashboard/PerfilPage';
import { GuardadosPage }     from './dashboard/GuardadosPage';
import { DocumentosPage }    from './dashboard/DocumentosPage';
import { EvaluacionesPage }  from './dashboard/EvaluacionesPage';
import { AlertasPage }       from './dashboard/AlertasPage';
import { AnalyticaPage }     from './dashboard/AnalyticaPage';
import { RedB2BPage }        from './dashboard/RedB2BPage';
import { WorkspacePage }     from './dashboard/WorkspacePage';
import { ExternalProcessPage }  from './dashboard/ExternalProcessPage';
import { IntegracionSECOPPage } from './dashboard/IntegracionSECOPPage';
import { KResidualPage }        from './dashboard/KResidualPage';
import { ProfileWizardPage }    from './dashboard/ProfileWizardPage';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function DashboardHome() {
  const { user, isPro } = useAuthStore();
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const { data: completion } = useProfileCompletion(true);

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

      {/* Profile completion banner — shown when score < 80 */}
      {completion && completion.score < 80 && (
        <div className="mb-6">
          <ProfileCompletionBanner data={completion} variant="full" />
        </div>
      )}

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

      {/* Quick actions grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link to="/buscar"
          className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20
            rounded-2xl p-5 hover:bg-emerald-500/15 transition-all group">
          <div>
            <p className="text-white font-semibold">Buscar licitaciones</p>
            <p className="text-emerald-400/70 text-sm mt-0.5">SECOP II · caché local · filtros personalizados</p>
          </div>
          <Search className="w-8 h-8 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
        </Link>
        <Link to={isPro ? '/dashboard/evaluaciones' : '/pricing'}
          className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20
            rounded-2xl p-5 hover:bg-purple-500/15 transition-all group">
          <div>
            <p className="text-white font-semibold">Evaluar viabilidad con IA</p>
            <p className="text-purple-400/70 text-sm mt-0.5">
              {isPro ? 'Claude · análisis de pliegos' : '🔒 Solo Plan PRO'}
            </p>
          </div>
          <Zap className="w-8 h-8 text-purple-400 group-hover:scale-110 transition-transform shrink-0" />
        </Link>
        <Link to="/dashboard/perfil"
          className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20
            rounded-2xl p-5 hover:bg-blue-500/15 transition-all group">
          <div>
            <p className="text-white font-semibold">Perfil de empresa</p>
            <p className="text-blue-400/70 text-sm mt-0.5">UNSPSC · filtros personalizados · capacidad K</p>
          </div>
          <Building2 className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
        </Link>
        <Link to="/dashboard/k-residual"
          className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20
            rounded-2xl p-5 hover:bg-amber-500/15 transition-all group">
          <div>
            <p className="text-white font-semibold">Capacidad Residual K</p>
            <p className="text-amber-400/70 text-sm mt-0.5">habilitación financiera · SMMLV</p>
          </div>
          <TrendingUp className="w-8 h-8 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
        </Link>
        <Link to="/dashboard/alertas"
          className="flex items-center justify-between bg-rose-500/10 border border-rose-500/20
            rounded-2xl p-5 hover:bg-rose-500/15 transition-all group">
          <div>
            <p className="text-white font-semibold">Alertas de procesos</p>
            <p className="text-rose-400/70 text-sm mt-0.5">nuevos procesos según tu perfil</p>
          </div>
          <Bell className="w-8 h-8 text-rose-400 group-hover:scale-110 transition-transform shrink-0" />
        </Link>
        <Link to="/dashboard/b2b"
          className="flex items-center justify-between bg-teal-500/10 border border-teal-500/20
            rounded-2xl p-5 hover:bg-teal-500/15 transition-all group">
          <div>
            <p className="text-white font-semibold">Red B2B</p>
            <p className="text-teal-400/70 text-sm mt-0.5">subcontratistas · consorcios · alianzas</p>
          </div>
          <Users className="w-8 h-8 text-teal-400 group-hover:scale-110 transition-transform shrink-0" />
        </Link>
      </div>
    </>
  );
}

export function DashboardPage() {
  const navigate   = useNavigate();
  const { isAuthenticated } = useAuthStore();

  // Sidebar state — persisted in localStorage
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!isAuthenticated) navigate('/auth?redirect=/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-brand-navy">
      {/* Left sidebar */}
      <DashboardSidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content — offset by sidebar width */}
      <main className={`transition-all duration-200 pt-16 pb-16 px-4 min-h-screen
        ${collapsed ? 'lg:ml-16' : 'lg:ml-60'}`}>
        <div className="max-w-5xl mx-auto pt-6">
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="perfil"           element={<PerfilPage />} />
          <Route path="perfil/wizard"    element={<ProfileWizardPage />} />
          <Route path="guardados"    element={<GuardadosPage />} />
          <Route path="documentos"   element={<DocumentosPage />} />
          <Route path="evaluaciones" element={<EvaluacionesPage />} />
          <Route path="alertas"      element={<AlertasPage />} />
          <Route path="analitica"    element={<AnalyticaPage />} />
          <Route path="b2b"          element={<RedB2BPage />} />
          <Route path="workspace/:procesoId" element={<WorkspacePage />} />
          <Route path="proceso-externo" element={<ExternalProcessPage />} />
          <Route path="integracion-secop" element={<IntegracionSECOPPage />} />
          <Route path="k-residual"       element={<KResidualPage />} />
        </Routes>
        </div>
      </main>

      {/* Mobile FAB trigger */}
      <MobileSidebarTrigger onClick={() => setMobileOpen(true)} />
    </div>
  );
}
