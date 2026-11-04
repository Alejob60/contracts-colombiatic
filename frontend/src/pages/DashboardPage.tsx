import { Link } from 'react-router-dom';
import { Lock, Search, FileText, Bell, BarChart3, Users, ArrowRight } from 'lucide-react';

const FEATURES = [
  { icon: Search, title: 'Búsqueda ilimitada', desc: 'Sprint 1 ✓' },
  { icon: BarChart3, title: 'Perfil de empresa', desc: 'Sprint 3' },
  { icon: FileText, title: 'Documentos RAG', desc: 'Sprint 4' },
  { icon: BarChart3, title: 'Evaluador IA', desc: 'Sprint 5' },
  { icon: Bell, title: 'Alertas WhatsApp', desc: 'Sprint 6' },
  { icon: Users, title: 'Red B2B', desc: 'Próximamente' },
];

export function DashboardPage() {
  return (
    <div className="min-h-screen bg-brand-navy pt-24 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-xl">Dashboard — Próximamente</h1>
            <p className="text-stone-500 text-sm">Requiere cuenta PRO Licitador</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 opacity-60"
            >
              <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center mb-3">
                <f.icon className="w-4 h-4 text-stone-500" />
              </div>
              <h3 className="text-stone-300 font-medium text-sm mb-0.5">{f.title}</h3>
              <p className="text-stone-600 text-xs">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm"
          >
            Activar Plan PRO <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
