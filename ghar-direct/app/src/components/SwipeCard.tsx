import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import { fonts, useTheme } from '@/lib/theme';

export type SwipeDir = 'like' | 'pass';
export type SwipeHandle = { swipe: (dir: SwipeDir) => void; reset: () => void };

type Props = {
  children: React.ReactNode;
  onSwipe: (dir: SwipeDir) => void;
  // Changing this puts the card back in the middle (used when the next listing arrives).
  resetKey: string;
};

const THRESHOLD = 110;

// Wraps a scrolling profile so it can also be flung left (pass) or right (like).
// Vertical drags scroll the profile; only clearly horizontal drags move the card.
export const SwipeCard = forwardRef<SwipeHandle, Props>(function SwipeCard({ children, onSwipe, resetKey }, ref) {
  const { c } = useTheme();
  const width = Dimensions.get('window').width;
  const x = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  const flyOut = (dir: SwipeDir) => {
    if (busy.current) return;
    busy.current = true;
    Animated.timing(x, { toValue: (dir === 'like' ? 1 : -1) * width * 1.3, duration: 200, useNativeDriver: false }).start(() => {
      onSwipeRef.current(dir);
    });
  };

  useImperativeHandle(ref, () => ({
    swipe: flyOut,
    // Brings the card back to the middle, for example when the request failed.
    reset: () => {
      busy.current = false;
      Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
    },
  }));

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD || (g.vx > 0.9 && g.dx > 40)) flyOut('like');
        else if (g.dx < -THRESHOLD || (g.vx < -0.9 && g.dx < -40)) flyOut('pass');
        else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  useEffect(() => {
    busy.current = false;
    x.setValue(0);
  }, [resetKey, x]);

  const rotate = x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-10deg', '0deg', '10deg'] });
  const likeOpacity = x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = x.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Animated.View {...pan.panHandlers} style={{ flex: 1, transform: [{ translateX: x }, { rotate }] }}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.like, { opacity: likeOpacity, borderColor: c.ok }]}>
        <Text style={[styles.stampText, { color: c.ok }]}>YES PLEASE</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.pass, { opacity: passOpacity, borderColor: c.danger }]}>
        <Text style={[styles.stampText, { color: c.danger }]}>NOPE</Text>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  stamp: { position: 'absolute', top: 28, borderWidth: 4, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2, backgroundColor: '#FFFFFF' },
  like: { left: 22, transform: [{ rotate: '-9deg' }] },
  pass: { right: 22, transform: [{ rotate: '9deg' }] },
  stampText: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.8 },
});
