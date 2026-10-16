import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, useTheme } from './theme';

const Ctx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      }, 2800);
    },
    [opacity]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
        <Animated.View style={[styles.toast, { opacity, backgroundColor: c.ink }]}>
          <Text style={[styles.text, { color: c.bg }]}>{msg}</Text>
        </Animated.View>
      </View>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, maxWidth: 380 },
  text: { fontFamily: fonts.bodyBold, fontSize: 14, textAlign: 'center' },
});
