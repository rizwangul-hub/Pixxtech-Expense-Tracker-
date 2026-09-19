import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'pixx_auth_token';
const USER_KEY = 'pixx_auth_user';

const isWeb = Platform.OS === 'web';

/**
 * Storage utility providing secure encrypted storage on native devices
 * with fallback to localStorage on web.
 */
export const storage = {
  /**
   * Save JWT token securely
   */
  async setToken(token: string): Promise<void> {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(TOKEN_KEY, token);
        }
      } else {
        await SecureStore.setItemAsync(TOKEN_KEY, token, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });
      }
    } catch (error) {
      console.error('[Storage] Error saving token:', error);
    }
  },

  /**
   * Get stored JWT token
   */
  async getToken(): Promise<string | null> {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(TOKEN_KEY);
        }
        return null;
      } else {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      console.error('[Storage] Error reading token:', error);
      return null;
    }
  },

  /**
   * Delete stored JWT token
   */
  async removeToken(): Promise<void> {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(TOKEN_KEY);
        }
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      console.error('[Storage] Error removing token:', error);
    }
  },

  /**
   * Save user profile
   */
  async setUser(user: any): Promise<void> {
    try {
      const serialized = JSON.stringify(user);
      if (isWeb) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(USER_KEY, serialized);
        }
      } else {
        await SecureStore.setItemAsync(USER_KEY, serialized);
      }
    } catch (error) {
      console.error('[Storage] Error saving user data:', error);
    }
  },

  /**
   * Get stored user profile
   */
  async getUser<T = any>(): Promise<T | null> {
    try {
      let raw: string | null = null;
      if (isWeb) {
        if (typeof window !== 'undefined' && window.localStorage) {
          raw = window.localStorage.getItem(USER_KEY);
        }
      } else {
        raw = await SecureStore.getItemAsync(USER_KEY);
      }
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      console.error('[Storage] Error reading user data:', error);
      return null;
    }
  },

  /**
   * Remove stored user profile
   */
  async removeUser(): Promise<void> {
    try {
      if (isWeb) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(USER_KEY);
        }
      } else {
        await SecureStore.deleteItemAsync(USER_KEY);
      }
    } catch (error) {
      console.error('[Storage] Error removing user data:', error);
    }
  },

  /**
   * Clear all auth-related credentials and session info
   */
  async clearAuth(): Promise<void> {
    await Promise.all([this.removeToken(), this.removeUser()]);
  },
};

export default storage;
