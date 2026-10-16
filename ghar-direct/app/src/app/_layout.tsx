import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { SessionProvider, useSession } from '@/lib/session';
import { ToastProvider } from '@/lib/toast';
import { InboxProvider } from '@/lib/inbox';
import { useTheme } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold,
    Caveat_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });
  // If a font fails to load the app still opens, just with the system font.
  if (!loaded && !fontError) return null;
  return (
    <SessionProvider>
      <ToastProvider>
        <InboxProvider>
          <RootNavigator />
        </InboxProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

function RootNavigator() {
  const { user, loading } = useSession();
  const { c, dark } = useTheme();

  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);

  if (loading) return null;
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
