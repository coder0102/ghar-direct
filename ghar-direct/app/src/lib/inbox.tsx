import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { useSession } from './session';
import type { ConversationSummary } from './types';

type Inbox = {
  conversations: ConversationSummary[];
  unread: number;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Inbox>({ conversations: [], unread: 0, refresh: async () => {} });

// Keeps the chat list and the unread badge fresh by asking the server every few seconds while the app is open.
export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.conversations();
      if (alive.current) setConversations(r.conversations);
    } catch (e) {
      /* offline for a moment: keep what we have */
    }
  }, [user]);

  useEffect(() => {
    alive.current = true;
    if (!user) {
      setConversations([]);
      return () => {
        alive.current = false;
      };
    }
    void refresh();
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => void refresh(), 8000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void refresh();
        if (!timer) timer = setInterval(() => void refresh(), 8000);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      alive.current = false;
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [user, refresh]);

  const value = useMemo(
    () => ({ conversations, unread: conversations.reduce((a, c) => a + c.unread, 0), refresh }),
    [conversations, refresh]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useInbox = () => useContext(Ctx);
