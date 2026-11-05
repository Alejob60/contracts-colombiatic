import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, FileText, Bell, BarChart3, Users, ArrowRight, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const FEATURES = [
  { icon: Search,    title: 'Búsqueda ilimitada',   desc: 'Sprint 1 ✓ — activo',    done: true  },
  { icon: BarChart3, title: 'Perfil de empresa',     desc: 'Sprint 3',                done: false },
  { icon: FileText,  title: 'Documentos RAG',        desc: 'Sprint 4',                done: false },
  { icon: BarChart3, title: 'Evaluador IA',           desc: 'Sprint 5',                done: false },
  { icon: Bell,      title: 'Alertas WhatsApp',      desc: 'Sprint 6',                done: false },
  { icon: Users,     title: 'Red B2B',               desc: 'Próximamente',             done: false },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isPro, user } = useAuthStore();

  // Auth guard — redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth?redirect=/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-brand-navy pt-24 px-4 pb-16">
      <div className="max-w-4xl mx-auto">

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

        {/* PRO upgrade banner for free users */}
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

        {/* Quick action: search */}
        <div className="mb-8 p-5 bg-white/[0.02] border border-white/8 rounded-2xl">
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

        {/* Feature grid */}
        <h2 className="text-stone-500 text-xs uppercase tracking-wider font-medium mb-4">
          Módulos del Dashboard
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title}
              className={`bg-white/[0.02] border border-white/8 rounded-2xl p-5 ${
                f.done ? '' : 'opacity-50'
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
