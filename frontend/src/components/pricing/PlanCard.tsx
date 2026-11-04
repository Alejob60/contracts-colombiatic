import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap } from 'lucide-react';
import { BillingToggle } from './BillingToggle';
import type { BillingCycle } from '@/lib/constants/pricing';

interface PlanCardProps {
  pricing: {
    name: string;
    tagline: string;
    prices: {
      monthly: { cop: number; label: string };
      yearly: { cop: number; monthlyEquivalent: number; label: string; discount: number };
    };
    features: readonly string[];
  };
  initialCycle?: BillingCycle;
  onCycleChange?: (cycle: BillingCycle) => void;
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function PlanCard({ pricing, initialCycle = 'MONTHLY', onCycleChange }: PlanCardProps) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);

  const handleCycle = (c: BillingCycle) => {
    setCycle(c);
    onCycleChange?.(c);
  };

  const isYearly = cycle === 'YEARLY';
  const displayPrice = isYearly
    ? pricing.prices.yearly.monthlyEquivalent
    : pricing.prices.monthly.cop;

  return (
    <div className="relative bg-gradient-to-b from-emerald-500/5 to-transparent border border-emerald-500/20
      rounded-2xl p-8 shadow-xl shadow-emerald-500/5">
      {/* Popular badge */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
        <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400
          text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">
          <Zap className="w-3 h-3" />
          MÁS POPULAR
        </span>
      </div>

      <div className="mb-5">
        <h2 className="text-white font-semibold text-xl mb-1">{pricing.name}</h2>
        <p className="text-stone-500 text-sm">{pricing.tagline}</p>
      </div>

      {/* Billing toggle */}
      <BillingToggle cycle={cycle} onChange={handleCycle} />

      {/* Price */}
      <div className="my-5">
        <div className="flex items-end gap-1">
          <span className="text-4xl font-bold text-white">{formatCOP(displayPrice)}</span>
          <span className="text-stone-500 text-sm mb-1">/mes</span>
        </div>
        {isYearly && (
          <p className="text-stone-500 text-xs mt-1">
            {formatCOP(pricing.prices.yearly.cop)} facturado anualmente
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-2.5 mb-7">
        {pricing.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-stone-300">
            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            {feature}
          </li>
        ))}
      </ul>

      <Link
        to="/auth"
        className="block text-center w-full bg-gradient-to-r from-emerald-500 to-teal-400
          text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
      >
        Activar Plan PRO
      </Link>

      <p className="text-center text-stone-600 text-xs mt-3">
        Sin permanencia · Cancela cuando quieras
      </p>
    </div>
  );
}
