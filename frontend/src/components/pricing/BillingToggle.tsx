import type { BillingCycle } from '@/lib/constants/pricing';

interface BillingToggleProps {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
}

export function BillingToggle({ cycle, onChange }: BillingToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 bg-white/5 border border-white/8 rounded-xl p-1">
      <button
        type="button"
        onClick={() => onChange('MONTHLY')}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          cycle === 'MONTHLY'
            ? 'bg-emerald-500 text-white shadow-sm'
            : 'text-stone-400 hover:text-white'
        }`}
      >
        Mensual
      </button>
      <button
        type="button"
        onClick={() => onChange('YEARLY')}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
          cycle === 'YEARLY'
            ? 'bg-emerald-500 text-white shadow-sm'
            : 'text-stone-400 hover:text-white'
        }`}
      >
        Anual
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            cycle === 'YEARLY' ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'
          }`}
        >
          −20%
        </span>
      </button>
    </div>
  );
}
