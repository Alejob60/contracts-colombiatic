import { useState } from 'react';
import { PlanCard } from '@/components/pricing/PlanCard';
import { CONTRACTS_PRICING } from '@/lib/constants/pricing';
import type { BillingCycle } from '@/lib/constants/pricing';
import { Check } from 'lucide-react';

const FREE_FEATURES = [
  '3 búsquedas por día',
  'Vista parcial de resultados',
  'Nombre de entidad y departamento',
];

export function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');

  return (
    <div className="min-h-screen bg-brand-navy pt-24 pb-20 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="font-bold text-4xl md:text-5xl text-white mb-4">
            Precios simples y transparentes
          </h1>
          <p className="text-stone-400 text-lg">Empieza gratis. Actualiza cuando lo necesites.</p>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free plan */}
          <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-8">
            <div className="mb-6">
              <h2 className="text-white font-semibold text-xl mb-1">Gratis</h2>
              <p className="text-stone-500 text-sm">Para explorar la plataforma</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-stone-500 text-sm ml-2">para siempre</span>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-stone-400">
                  <Check className="w-4 h-4 text-stone-600 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="/buscar"
              className="block text-center w-full border border-white/10 text-stone-300
                hover:border-white/20 hover:text-white py-3 rounded-xl text-sm font-medium
                transition-colors"
            >
              Empezar gratis
            </a>
          </div>

          {/* PRO plan */}
          <PlanCard pricing={CONTRACTS_PRICING} initialCycle={cycle} onCycleChange={setCycle} />
        </div>

        {/* Comparison */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-white font-semibold text-xl text-center mb-8">
            Comparación detallada
          </h2>
          <div className="bg-white/[0.02] border border-white/8 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-6 py-4 text-stone-400 font-medium w-1/2">Característica</th>
                  <th className="text-center px-6 py-4 text-stone-400 font-medium">Gratis</th>
                  <th className="text-center px-6 py-4 text-emerald-400 font-medium">PRO</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Búsquedas SECOP II', '3/día', 'Ilimitadas'],
                  ['Detalle de procesos', 'Parcial', 'Completo'],
                  ['Links directos SECOP', '—', '✓'],
                  ['Presupuesto del proceso', '—', '✓'],
                  ['Evaluador IA de factibilidad', '—', '✓'],
                  ['Match Score automático', '—', '✓'],
                  ['Documentos corporativos (RAG)', '—', 'Ilimitados'],
                  ['Checklist de habilitación', '—', '✓'],
                  ['Matriz de riesgos', '—', '✓'],
                  ['Alertas WhatsApp/Email', '—', '✓'],
                  ['Red de consorcios B2B', '—', '✓'],
                ].map(([feat, free, pro]) => (
                  <tr key={feat} className="border-b border-white/5 last:border-0 hover:bg-white/[0.01]">
                    <td className="px-6 py-3.5 text-stone-300">{feat}</td>
                    <td className="px-6 py-3.5 text-center text-stone-500">{free}</td>
                    <td className="px-6 py-3.5 text-center text-emerald-400 font-medium">{pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
