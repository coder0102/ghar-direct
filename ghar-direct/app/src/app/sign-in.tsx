import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Chip, ErrorText, Field, Panel, Screen, T } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function SignIn() {
  const { c } = useTheme();
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<'join' | 'login'>('join');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (mode === 'join' && name.trim().length < 2) return setError('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email.');
    if (password.length < (mode === 'join' ? 8 : 1)) return setError('Use at least 8 characters for the password.');
    setBusy(true);
    try {
      if (mode === 'join') await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen edges={['top', 'bottom']} contentStyle={{ paddingTop: 36, gap: 22 }}>
        <View style={{ gap: 10 }}>
          <T v="label" muted>Ghar Direct</T>
          <T v="display" style={{ fontSize: 40, lineHeight: 41 }}>Flat hunting, minus the broker and the boredom.</T>
          <T muted>Houses get a profile like people do. Swipe, like the exact photo you love, and slide into the owner's DMs.</T>
        </View>
        <Panel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Join" selected={mode === 'join'} onPress={() => setMode('join')} />
            <Chip label="Log in" selected={mode === 'login'} onPress={() => setMode('login')} />
          </View>
          {mode === 'join' ? <Field label="Your name" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" /> : null}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'join' ? 'newPassword' : 'password'}
            onSubmitEditing={submit}
          />
          <ErrorText>{error}</ErrorText>
          <Button title={mode === 'join' ? 'Create my account' : 'Log in'} kind="primary" onPress={submit} loading={busy} />
        </Panel>
        <T v="small" muted>Owners and flatmate hosts get an ID check before they can list. Every photo is taken on the spot, at the place.</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
