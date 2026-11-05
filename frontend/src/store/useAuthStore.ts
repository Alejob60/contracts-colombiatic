/**
 * useAuthStore — Estado de autenticación de ColombiaTIC Contracts
 *
 * Patrón basado en Atelier ecommerce (useAuthStore.ts):
 * - Cookies: contracts_token + session_token (mismo valor) + payment_verified=1
 * - localStorage: contracts_auth_v1 (Zustand persist)
 * - skipHydration: true → se hidrата manualmente en App.tsx para evitar
 *   flickers de "no autenticado" en el primer render.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId:     string;
  name:       string;
  email:      string;
  role:       string;   // FREE | PRO
  plan:       string;   // PRO_LICITADOR | FREE
  tenantId:   string;
  planTier?:  string;
}

interface AuthState {
  user:            AuthUser | null;
  token:           string | null;
  refreshToken:    string | null;
  isAuthenticated: boolean;
  isPro:           boolean;   // true when plan === PRO_LICITADOR
  isLoading:       boolean;
  error:           string | null;

  // Actions
  login:    (token: string, refresh: string, user: AuthUser) => void;
  logout:   () => void;
  setError: (msg: string) => void;
  clearError: () => void;
}

// ── Cookie helpers ─────────────────────────────────────────────────────────

const COOKIE_MAX_AGE = 7 * 24 * 3600; // 7 days

function setCookies(token: string): void {
  const isSecure = window.location.protocol === 'https:';
  const secFlag  = isSecure ? '; Secure' : '';
  const base     = `path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secFlag}`;
  document.cookie = `contracts_token=${token}; ${base}`;
  document.cookie = `session_token=${token}; ${base}`;   // alias for compatibility
}

function clearCookies(): void {
  for (const name of ['contracts_token', 'session_token', 'payment_verified']) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

function setPaymentVerified(): void {
  const isSecure = window.location.protocol === 'https:';
  const secFlag  = isSecure ? '; Secure' : '';
  document.cookie = `payment_verified=1; path=/; max-age=2592000; SameSite=Lax${secFlag}`;
}

export function getContractsToken(): string | null {
  // 1. Try cookie
  const match = document.cookie.match(/(?:^|;)\s*contracts_token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  // 2. Fallback: read from Zustand persisted store
  try {
    const raw = localStorage.getItem('contracts_auth_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.token ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

/** @deprecated use getContractsToken */
export const getTokenFromCookie = getContractsToken;

// ── Store ─────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:            null,
      token:           null,
      refreshToken:    null,
      isAuthenticated: false,
      isPro:           false,
      isLoading:       false,
      error:           null,

      login: (token, refresh, user) => {
        const isPro = user.plan === 'PRO_LICITADOR'
          || user.planTier === 'PRO_LICITADOR'
          || user.role === 'PRO';

        setCookies(token);
        if (isPro) setPaymentVerified();

        set({
          user, token,
          refreshToken:    refresh,
          isAuthenticated: true,
          isPro,
          isLoading:       false,
          error:           null,
        });
      },

      logout: () => {
        clearCookies();
        set({
          user:            null,
          token:           null,
          refreshToken:    null,
          isAuthenticated: false,
          isPro:           false,
          error:           null,
        });
      },

      setError:   (msg) => set({ error: msg, isLoading: false }),
      clearError: ()    => set({ error: null }),
    }),

    {
      name: 'contracts_auth_v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user:            state.user,
        token:           state.token,
        refreshToken:    state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        isPro:           state.isPro,
      }),
      /**
       * skipHydration = true: the store won't auto-hydrate on creation.
       * App.tsx calls useAuthStore.persist.rehydrate() after mount so the
       * first render always has the correct auth state without a flicker.
       */
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        // After rehydration, re-sync cookies from store (page refresh case)
        if (state?.token && state.isAuthenticated) {
          setCookies(state.token);
          if (state.isPro) setPaymentVerified();
        }
      },
    },
  ),
);

// ── Auth API helpers ───────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`);
  return data as {
    token: string; refreshToken: string;
    userId: string; email: string; name: string;
    role: string; plan?: string; planTier?: string; tenantId?: string;
    credits?: number;
  };
}

export async function apiRegister(name: string, email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, tenantId: 'contracts' }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 409) throw new Error('Ya existe una cuenta con ese correo.');
    throw new Error(data.message ?? `Error ${res.status}`);
  }
  return data;
}

/**
 * After Wompi payment is approved, verify the transaction and activate PRO.
 * Called from CheckoutSuccessPage.
 */
export async function verifyWompiPayment(transactionId: string, token: string | null) {
  const isSandbox = true; // Contracts always uses sandbox for now
  const baseUrl   = isSandbox
    ? 'https://sandbox.wompi.co/v1'
    : 'https://production.wompi.co/v1';

  // Verify directly with Wompi sandbox (the private key is in the backend)
  // We call our contracts API endpoint to proxy this verification
  const res = await fetch(
    `${API_BASE}/api/v1/payments/verify?transaction_id=${transactionId}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  if (!res.ok) {
    // Fallback: check via NestJS validate-payment
    const fallback = await fetch(
      `${API_BASE}/api/wompi/validate-payment?reference=${transactionId}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    return fallback.json();
  }
  return res.json();
}
