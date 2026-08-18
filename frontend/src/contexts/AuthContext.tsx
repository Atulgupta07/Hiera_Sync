import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserResponse, LoginRequest } from '../types';
import { authApi, setAuthToken, removeAuthToken, getAuthToken } from '../api';

interface AuthContextType {
  user: UserResponse | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const userData = await authApi.getCurrentUser();
          setUser(userData);
        } catch (error) {
          console.error('Failed to fetch user', error);
          removeAuthToken();
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();

    // Listen for global unauthorized events from API client
    const handleUnauthorized = () => {
      setUser(null);
      removeAuthToken();
    };
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, []);

  const login = async (credentials: LoginRequest & { rememberMe?: boolean }) => {
    const response = await authApi.login(credentials);
    setAuthToken(response.access_token, credentials.rememberMe ?? true);
    setUser(response.user);
  };

  const logout = () => {
    removeAuthToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
