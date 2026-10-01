import { create } from 'zustand';
import type { User } from '@wednap/shared';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth: (user, token) => {
    localStorage.setItem('wedsnap_token', token);
    localStorage.setItem('wedsnap_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('wedsnap_token');
    localStorage.removeItem('wedsnap_user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  initAuth: () => {
    const token = localStorage.getItem('wedsnap_token');
    const storedUser = localStorage.getItem('wedsnap_user');
    if (token && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        set({ user, token, isAuthenticated: true });
      } catch {
        localStorage.removeItem('wedsnap_token');
        localStorage.removeItem('wedsnap_user');
      }
    }
  },
}));
