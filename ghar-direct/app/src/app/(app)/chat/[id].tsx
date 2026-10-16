import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Chip, ErrorText, Panel, Sticker, T } from '@/components/ui';
import { ReportSheet } from '@/components/Sheets';
import { api, ApiError } from '@/lib/api';
import { useInbox } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { fonts, useTheme } from '@/lib/theme';
import { firstName, inr } from '@/lib/format';
import type { ConversationDetail, Message } from '@/lib/types';

const RENTER_QUICK = ['Is it still available?', 'Can I visit on Saturday?', 'Can we talk about the deposit?', 'Are pets allowed?'];

export default function Chat() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useInbox();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reporting, setReporting] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const lastId = useRef(0);

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([api.conversation(id), api.messages(id, 0)]);
      setDetail(d.conversation);
      setMessages(m.messages);
      lastId.current = m.messages.length ? m.messages[m.messages.length - 1].id : 0;
      setLoadError('');
      void refresh();
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Could not open this chat.');
    }
  }, [id, refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  // New messages arrive by asking the server every few seconds while this screen is open.
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(async () => {
        try {
          const m = await api.messages(id, lastId.current);
          if (m.messages.length) {
            lastId.current = m.messages[m.messages.length - 1].id;
            setMessages((prev) => [...prev, ...m.messages.filter((x) => !prev.some((p) => p.id === x.id))]);
            void refresh();
          }
          setDetail((d) => {
            if (d && d.status !== m.status) {
              void load(); // the owner replied: reload so the address appears
              return { ...d, status: m.status };
            }
            return d;
          });
        } catch (e) {
          /* keep trying */
        }
      }, 3000);
      return () => clearInterval(timer);
    }, [id, refresh, load])
  );

  async function send(body: string) {
    const b = body.trim();
    if (!b || sending) return;
    setSending(true);
    setError('');
    try {
      const r = await api.sendMessage(id, b);
      lastId.current = Math.max(lastId.current, r.message.id);
      setMessages((prev) => [...prev, r.message]);
      setText('');
      setDetail((d) => (d ? { ...d, status: r.status } : d));
      if (detail && detail.status !== r.status) void load();
      void refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function decide(kind: 'accept' | 'decline') {
    try {
      if (kind === 'accept') await api.acceptChat(id);
      else await api.declineChat(id);
      toast(kind === 'accept' ? 'Chat opened. Say hi.' : 'Chat closed.');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Try again.');
    }
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: c.bg }}>
        <ErrorText>{loadError}</ErrorText>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }
  if (!detail) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const owner = detail.iAm === 'owner';
  const pending = detail.status === 'pending';
  const declined = detail.status === 'declined';
  const canType = !declined && !(pending && !owner);
  const who = detail.other.name;
  const rp = detail.other.profile;
  const l = detail.listing;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: who,
          headerRight: () => (
            <Pressable onPress={() => setReporting(true)} accessibilityRole="button" accessibilityLabel="Report or block" hitSlop={10}>
              <Text style={{ color: c.muted, fontFamily: fonts.bodyBold, fontSize: 14, textDecorationLine: 'underline' }}>Report</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <ScrollView
          ref={scroller}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          keyboardShouldPersistTaps="handled"
        >
          {l ? (
            <Sticker radius={14} offset={3} innerStyle={{ padding: 10, gap: 2 }}>
              <T v="bold">{l.type === 'flatmate' ? 'Room' : `${l.bhk} BHK`} in {l.locality}</T>
              <T v="mono" muted>{inr(l.rent)} / month · {detail.other.role}</T>
              {l.addressLine ? <T v="small">Address: {l.addressLine}</T> : null}
              {!owner && !l.addressLine ? <T v="small" muted>The exact address appears once {firstName(who)} accepts your chat.</T> : null}
            </Sticker>
          ) : null}

          {owner && pending && rp ? (
            <Panel>
              <T v="label" muted>{firstName(who)}'s renter card</T>
              {rp.work ? <T v="bold">{rp.work}</T> : null}
              <T v="small" muted>
                {[rp.budget ? `Budget ${inr(rp.budget)}` : '', rp.moveIn ? `Moving in ${rp.moveIn}` : ''].filter(Boolean).join(' · ') || 'No budget or move-in date shared'}
              </T>
              {rp.about ? <T>{rp.about}</T> : null}
              {(rp.prompts || []).map((p) => (
                <View key={p.q} style={{ backgroundColor: c.lime, borderColor: c.edge, borderWidth: 2, borderRadius: 12, padding: 10, gap: 2 }}>
                  <T v="label" style={{ color: c.onTile }}>{p.q}</T>
                  <T v="bold" style={{ color: c.onTile }}>{p.a}</T>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Accept" kind="primary" onPress={() => void decide('accept')} />
                <Button title="Decline" onPress={() => void decide('decline')} />
              </View>
              <T v="small" muted>Replying also opens the chat.</T>
            </Panel>
          ) : null}

          {pending && !owner ? (
            <T v="hand" muted style={{ textAlign: 'center', fontSize: 20 }}>
              Sent. {firstName(who)} will see your card and reply when ready.
            </T>
          ) : null}
          {declined ? <T v="hand" muted style={{ textAlign: 'center', fontSize: 20 }}>This chat was closed.</T> : null}

          {messages.map((m) => (
            <View
              key={m.id}
              style={{
                alignSelf: m.mine ? 'flex-end' : 'flex-start',
                maxWidth: '84%',
                backgroundColor: m.mine ? c.tangerine : c.surface,
                borderColor: c.edge,
                borderWidth: 2,
                borderRadius: 18,
                borderBottomRightRadius: m.mine ? 5 : 18,
                borderBottomLeftRadius: m.mine ? 18 : 5,
                paddingHorizontal: 13,
                paddingVertical: 9,
                gap: 6,
              }}
            >
              {m.quote ? (
                <View style={{ backgroundColor: c.white, borderColor: c.edge, borderWidth: 2, borderRadius: 10, padding: 7 }}>
                  <T v="label" style={{ color: c.onTile, fontSize: 10 }}>{m.quote.label}</T>
                  {m.quote.text ? <T v="bold" style={{ color: c.onTile, fontSize: 14, lineHeight: 18 }}>{m.quote.text}</T> : null}
                </View>
              ) : null}
              <T style={{ color: m.mine ? c.onTile : c.ink }}>{m.body}</T>
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
          {!owner && detail.status === 'open' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {RENTER_QUICK.map((q) => (
                <Chip key={q} label={q} onPress={() => void send(q)} />
              ))}
            </ScrollView>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={text}
              onChangeText={setText}
              editable={canType}
              placeholder={declined ? 'This chat was closed' : pending && !owner ? `Waiting for ${firstName(who)} to reply` : 'Write a message'}
              placeholderTextColor={c.muted}
              accessibilityLabel="Message"
              maxLength={1000}
              multiline
              style={{
                flex: 1,
                maxHeight: 110,
                borderWidth: 2,
                borderColor: c.edge,
                borderRadius: 16,
                backgroundColor: c.surface,
                color: c.ink,
                fontFamily: fonts.body,
                fontSize: 15,
                paddingHorizontal: 14,
                paddingVertical: 9,
                opacity: canType ? 1 : 0.6,
              }}
            />
            <Button title="Send" kind="primary" onPress={() => void send(text)} disabled={!canType || !text.trim()} loading={sending} />
          </View>
        </View>
      </KeyboardAvoidingView>

      <ReportSheet
        visible={reporting}
        who={who}
        conversationId={id}
        onClose={() => setReporting(false)}
        onDone={(blocked) => {
          setReporting(false);
          toast(blocked ? 'Reported and blocked. This chat is gone.' : 'Report sent. Thanks for keeping this safe.');
          void refresh();
          if (blocked) router.back();
        }}
      />
    </SafeAreaView>
  );
}
