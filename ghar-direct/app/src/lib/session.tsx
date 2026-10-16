import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

const KEY = 'ghar_token';

type Session = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<Session | null>(null);

async function saveToken(t: string | null) {
  try {
    if (t) await SecureStore.setItemAsync(KEY, t);
    else await SecureStore.deleteItemAsync(KEY);
  } catch (e) {
    /* secure storage unavailable (for example on web): the session just will not survive a restart */
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
    await saveToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(KEY);
        if (saved) {
          setToken(saved);
          const { user: u } = await api.me();
          if (alive) setUser(u);
        }
      } catch (e) {
        // A bad or expired token, or no network on launch: start logged out.
        setToken(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<Session>(
    () => ({
      user,
      loading,
      setUser,
      signOut,
      signIn: async (email, password) => {
        const r = await api.login({ email, password });
        setToken(r.token);
        await saveToken(r.token);
        setUser(r.user);
      },
      signUp: async (name, email, password) => {
        const r = await api.register({ name, email, password });
        setToken(r.token);
        await saveToken(r.token);
        setUser(r.user);
      },
    }),
    [user, loading, signOut]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside <SessionProvider>');
  return v;
}
