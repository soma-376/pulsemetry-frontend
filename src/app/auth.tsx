import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setToken } from '../api/client';
import type { Profile } from '../api/types';
const Context = createContext<{
  profile: Profile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const cache = useQueryClient();
  function logout() {
    setToken();
    setProfile(null);
    cache.clear();
  }
  useEffect(() => {
    window.addEventListener('pulsemetry:unauthorized', logout);
    return () => window.removeEventListener('pulsemetry:unauthorized', logout);
  }, []);
  async function login(email: string, password: string) {
    try {
      const response = await api.login(email, password);
      if (!response.access_token) throw new Error('인증 토큰이 없습니다.');
      setToken(response.access_token);
      const me = await api.me();
      if (me.role !== 'owner' && me.role !== 'admin')
        throw new Error('관리자만 로그인할 수 있습니다.');
      cache.clear();
      setProfile(me);
    } catch (error) {
      logout();
      throw error;
    }
  }
  return <Context.Provider value={{ profile, login, logout }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
