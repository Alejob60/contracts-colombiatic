import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  tenantId?: string;
}

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  isPro: boolean;
  isAuth: boolean;
  login: (token: string, refresh: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user:   null,
      token:  null,
      isPro:  false,
      isAuth: false,

      login: (token, refresh, user) => {
        const isPro = user.plan === 'PRO_LICITADOR' || user.role === 'PRO';
        const maxAge = 7 * 24 * 3600;
        document.cookie = `contracts_token=${token}; max-age=${maxAge}; path=/; SameSite=Lax; Secure`;
        document.cookie = `contracts_refresh=${refresh}; max-age=${maxAge}; path=/; SameSite=Lax; Secure`;
        set({ user, token, isPro, isAuth: true });
      },

      logout: () => {
        document.cookie = 'contracts_token=; max-age=0; path=/';
        document.cookie = 'contracts_refresh=; max-age=0; path=/';
        set({ user: null, token: null, isPro: false, isAuth: false });
      },
    }),
    {
      name: 'contracts_auth_v1',
      partialize: (state) => ({
        user:   state.user,
        token:  state.token,
        isPro:  state.isPro,
        isAuth: state.isAuth,
      }),
    },
  ),
);

export function getTokenFromCookie(): string | null {
  // First try the cookie
  const cookieMatch = document.cookie.match(/contracts_token=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];
  // Fallback: read from Zustand persisted store
  try {
    const stored = localStorage.getItem('contracts_auth_v1');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token ?? null;
    }
  } catch { /* corrupt localStorage — non-critical */ }
  return null;
}
