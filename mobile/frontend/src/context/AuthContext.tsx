import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { authAPI, setSessionExpiredHandler, UserProfile } from '../services/api';
import { storage } from '../services/storage';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role: string | null;
  isAdmin: boolean;
  isDataEntry: boolean;
  sessionExpiredNotice: string | null;
  clearSessionNotice: () => void;
  login: (email: string, password: string) => Promise<{ success: boolean; user?: UserProfile; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  const clearSessionNotice = useCallback(() => {
    setSessionExpiredNotice(null);
  }, []);

  // Securely log out and reset all authentication state
  const logout = useCallback(async () => {
    try {
      await storage.clearAuth();
    } catch (err) {
      console.error('[AuthContext] Error during logout storage cleanup:', err);
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  // Handle automatic 401 session expiration from interceptor
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setToken(null);
      setUser(null);
      setSessionExpiredNotice('Your session has expired or is invalid. Please sign in again.');
    });

    return () => {
      setSessionExpiredHandler(null);
    };
  }, []);

  // Initialize session from secure storage on app launch
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const storedToken = await storage.getToken();
        const cachedUser = await storage.getUser<UserProfile>();

        if (storedToken && isMounted) {
          setToken(storedToken);
          if (cachedUser) {
            setUser(cachedUser);
          }

          // Silently verify session with real backend
          try {
            const res = await authAPI.getMe();
            if (res && res.user && isMounted) {
              setUser(res.user);
              await storage.setUser(res.user);
            }
          } catch (verifyError: any) {
            console.warn('[AuthContext] Session validation failed:', verifyError?.message);
            if (verifyError?.response?.status === 401 && isMounted) {
              await storage.clearAuth();
              setToken(null);
              setUser(null);
              setSessionExpiredNotice('Your session has expired. Please log in again.');
            }
          }
        }
      } catch (err) {
        console.error('[AuthContext] Init error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Login handler
  const login = useCallback(async (email: string, password: string) => {
    setSessionExpiredNotice(null);
    try {
      const res = await authAPI.login(email, password);

      if (res && res.token && res.user) {
        await storage.setToken(res.token);
        await storage.setUser(res.user);
        setToken(res.token);
        setUser(res.user);
        return { success: true, user: res.user };
      }

      return { success: false, error: res.message || 'Login failed. Invalid response from server.' };
    } catch (err: any) {
      console.error('[AuthContext] Login failed:', err);

      let errorMessage = 'Unable to connect to the server. Please check your internet connection.';

      if (err.response) {
        // Backend returned a specific error response
        const serverMessage = err.response.data?.message;
        const validationErrors = err.response.data?.errors;
        if (validationErrors) {
          const firstErr = Object.values(validationErrors)[0];
          errorMessage = typeof firstErr === 'string' ? firstErr : String(serverMessage || 'Validation error');
        } else if (serverMessage) {
          errorMessage = serverMessage;
        } else if (err.response.status === 401) {
          errorMessage = 'Invalid email or password. Please verify credentials.';
        } else if (err.response.status === 403) {
          errorMessage = 'Account deactivated. Please contact administration.';
        } else if (err.response.status >= 500) {
          errorMessage = 'Server error encountered. Please try again shortly.';
        }
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        errorMessage = 'Connection timed out. Please check your internet.';
      }

      return { success: false, error: errorMessage };
    }
  }, []);

  // Refresh profile handler
  const refreshProfile = useCallback(async () => {
    try {
      const res = await authAPI.getMe();
      if (res?.user) {
        setUser(res.user);
        await storage.setUser(res.user);
      }
    } catch (err) {
      console.warn('[AuthContext] refreshProfile error:', err);
    }
  }, []);

  const role = user?.role || null;
  const isAdmin = role === 'ADMIN' || role === 'ADMIN_PUBLISHER' || role === 'VERIFIER' || role === 'VERIFICATION_MANAGER';
  const isDataEntry = role === 'DATA_ENTRY';
  const isAuthenticated = Boolean(token && user);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated,
      role,
      isAdmin,
      isDataEntry,
      sessionExpiredNotice,
      clearSessionNotice,
      login,
      logout,
      refreshProfile,
    }),
    [user, token, isLoading, isAuthenticated, role, isAdmin, isDataEntry, sessionExpiredNotice, clearSessionNotice, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
