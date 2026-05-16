import React, {
  createContext,
  useState,
  useCallback,
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

function readStoredAuth() {
  const storedToken = localStorage.getItem('kereo_token');
  const storedUser = localStorage.getItem('kereo_user');

  if (!storedToken || !storedUser) {
    return {
      token: null,
      user: null,
    };
  }

  try {
    return {
      token: storedToken,
      user: JSON.parse(storedUser) as AuthUser,
    };
  } catch {
    localStorage.removeItem('kereo_token');
    localStorage.removeItem('kereo_user');

    return {
      token: null,
      user: null,
    };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState(readStoredAuth);
  const [isLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const { accessToken, user: authUser } = res.data;
    localStorage.setItem('kereo_token', accessToken);
    localStorage.setItem('kereo_user', JSON.stringify(authUser));
    setAuthState({
      token: accessToken,
      user: authUser,
    });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password);
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('kereo_token');
    localStorage.removeItem('kereo_user');
    setAuthState({
      token: null,
      user: null,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user: authState.user, token: authState.token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
