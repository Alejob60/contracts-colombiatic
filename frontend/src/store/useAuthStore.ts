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
        document.cookie = `contracts_token=${token}; max-age=${maxAge}; path=/; SameSite=Lax`;
        document.cookie = `contracts_refresh=${refresh}; max-age=${maxAge}; path=/; SameSite=Lax`;
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
      partialState: (state) => ({
        user:   state.user,
        token:  state.token,
        isPro:  state.isPro,
        isAuth: state.isAuth,
      }),
    } as Parameters<typeof persist>[1],
  ),
);

export function getTokenFromCookie(): string | null {
  const match = document.cookie.match(/contracts_token=([^;]+)/);
  return match ? match[1] : localStorage.getItem('contracts_token');
}
