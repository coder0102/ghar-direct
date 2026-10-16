import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Avatar, Button, Chip, ErrorText, Field, IdBadge, Panel, Screen, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { RENTER_PROMPTS, type Prompt } from '@/lib/types';

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
}

function startingPrompts(saved?: Prompt[]): Prompt[] {
  const out = (saved ?? []).slice(0, 3).map((p) => ({ ...p }));
  for (const q of RENTER_PROMPTS) {
    if (out.length >= 3) break;
    if (!out.some((p) => p.q === q)) out.push({ q, a: '' });
  }
  return out;
}

export default function YouTab() {
  const toast = useToast();
  const { user, setUser, signOut } = useSession();
  const p = user?.profile ?? {};
  const [name, setName] = useState(user?.name ?? '');
  const [work, setWork] = useState(p.work ?? '');
  const [budget, setBudget] = useState(p.budget ? String(p.budget) : '');
  const [moveIn, setMoveIn] = useState(p.moveIn ?? '');
  const [about, setAbout] = useState(p.about ?? '');
  const [prompts, setPrompts] = useState<Prompt[]>(() => startingPrompts(p.prompts));
  const [busy, setBusy] = useState<'save' | 'id' | 'delete' | null>(null);
  const [error, setError] = useState('');

  if (!user) return null;

  async function save() {
    setBusy('save');
    setError('');
    try {
      const filled = prompts.map((x) => ({ q: x.q, a: x.a.trim() })).filter((x) => x.a);
      const budgetNum = budget.replace(/[^0-9]/g, '');
      const r = await api.updateMe({
        name: name.trim() || undefined,
        profile: {
          work: work.trim(),
          budget: budgetNum ? Number(budgetNum) : 0,
          moveIn: moveIn.trim(),
          about: about.trim(),
          prompts: filled,
        },
      });
      setUser(r.user);
      toast('Saved. Owners will see this when you say hi.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  async function checkId() {
    setBusy('id');
    setError('');
    try {
      const r = await api.verifyId();
      setUser(r.user);
      toast(r.user.idVerified ? 'ID checked' : 'Your ID is being reviewed');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This removes your listings, chats and profile. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await api.deleteMe();
              await signOut();
            } catch (e) {
              setError(message(e));
              setBusy(null);
            }
          },
        },
      ]
    );
  }

  const setPrompt = (i: number, patch: Partial<Prompt>) =>
    setPrompts((prev) => prev.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const usedQs = prompts.map((x) => x.q);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={user.name} size={56} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="title" numberOfLines={1}>{user.name}</T>
          <T v="small" muted numberOfLines={1}>{user.email}</T>
        </View>
      </View>

      <Panel>
        <T v="title">Your renter card</T>
        <T v="small" muted>This goes to an owner when you like their place. Keep it honest and short.</T>
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={60} />
        <Field label="What you do" value={work} onChangeText={setWork} placeholder="e.g. Designer at a startup" maxLength={120} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1 }} label="Budget per month (₹)" value={budget} onChangeText={setBudget} keyboardType="number-pad" maxLength={8} />
          <Field style={{ flex: 1 }} label="Move in" value={moveIn} onChangeText={setMoveIn} placeholder="e.g. 1 Nov" maxLength={40} />
        </View>
        <Field label="About you" value={about} onChangeText={setAbout} multiline maxLength={300} />
      </Panel>

      <Panel>
        <T v="title">Three prompts</T>
        <T v="small" muted>Optional, but owners reply faster to people they can picture.</T>
        {prompts.map((pr, i) => (
          <View key={i} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {RENTER_PROMPTS.map((q) => (
                <Chip
                  key={q}
                  label={q}
                  selected={pr.q === q}
                  onPress={() => {
                    if (q !== pr.q && usedQs.includes(q)) return toast('You already used that prompt.');
                    setPrompt(i, { q });
                  }}
                />
              ))}
            </View>
            <Field label={`Answer ${i + 1}`} value={pr.a} onChangeText={(a) => setPrompt(i, { a })} multiline maxLength={140} hint={`${pr.a.length}/140`} />
          </View>
        ))}
      </Panel>

      <ErrorText>{error}</ErrorText>
      <Button title="Save my card" kind="primary" loading={busy === 'save'} onPress={() => void save()} />

      <Panel>
        <T v="title">ID check</T>
        {user.idVerified ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <IdBadge />
          </View>
        ) : user.idStatus === 'pending' ? (
          <T muted>Your ID is being reviewed. We will let you know.</T>
        ) : (
          <>
            <T muted>You need a checked ID to list a place. It shows an "ID checked" badge on your listings.</T>
            <Button title="Check my ID" loading={busy === 'id'} onPress={() => void checkId()} />
          </>
        )}
      </Panel>

      <View style={{ gap: 12 }}>
        <Button title="Log out" onPress={() => void signOut()} />
        <Button title="Delete my account" kind="danger" loading={busy === 'delete'} onPress={confirmDelete} />
      </View>
    </Screen>
  );
}
