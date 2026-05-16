import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { authApi, type AuthUser } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('kereo_token');
    const storedUser = localStorage.getItem('kereo_user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('kereo_token');
        localStorage.removeItem('kereo_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const { accessToken, user: authUser } = res.data;
    localStorage.setItem('kereo_token', accessToken);
    localStorage.setItem('kereo_user', JSON.stringify(authUser));
    setToken(accessToken);
    setUser(authUser);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password);
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('kereo_token');
    localStorage.removeItem('kereo_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
