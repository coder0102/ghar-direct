import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Button, Chip, ErrorText, Sticker, T } from '@/components/ui';
import { ListingProfile } from '@/components/ListingProfile';
import { SwipeCard, type SwipeDir, type SwipeHandle } from '@/components/SwipeCard';
import { LikeSheet, ReportSheet, type LikeTarget } from '@/components/Sheets';
import { api, ApiError } from '@/lib/api';
import { useInbox } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { useTheme } from '@/lib/theme';
import { inr } from '@/lib/format';
import type { Listing, ListingType } from '@/lib/types';

const RENT_STEPS = [20000, 30000, 45000, 70000, 150000];

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
}

export default function Explore() {
  const { c } = useTheme();
  const toast = useToast();
  const { refresh } = useInbox();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState<'all' | ListingType>('all');
  const [rentIdx, setRentIdx] = useState(3);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [likeTarget, setLikeTarget] = useState<LikeTarget>(null);
  const [reporting, setReporting] = useState(false);
  const swipeRef = useRef<SwipeHandle>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.feed({
        type: type === 'all' ? undefined : type,
        maxRent: RENT_STEPS[rentIdx],
        lat: pos?.lat,
        lng: pos?.lng,
        radiusKm: pos ? 25 : undefined,
      });
      setItems(r.listings);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [type, rentIdx, pos]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items[0];

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [current?.id]);

  function advance() {
    const next = items.slice(1);
    setItems(next);
    // The server sends a few at a time. When we run out, ask for the next few.
    if (next.length === 0) void load();
  }

  async function decide(dir: SwipeDir) {
    const l = current;
    if (!l) return;
    try {
      if (dir === 'pass') {
        await api.pass(l.id);
      } else {
        await api.like(l.id, {});
        toast('Sent. Fingers crossed. Check your DMs.');
        void refresh();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        // No connection: put the card back instead of losing it.
        toast(e.message);
        swipeRef.current?.reset();
        return;
      }
      toast(message(e));
    }
    advance();
  }

  async function sendLike(comment: string) {
    const l = current;
    if (!l || !likeTarget) return;
    await api.like(l.id, { targetType: likeTarget.kind, targetIndex: likeTarget.index, comment });
    setLikeTarget(null);
    toast('Sent. Fingers crossed. Check your DMs.');
    void refresh();
    advance();
  }

  async function toggleNear() {
    if (pos) return setPos(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return toast('Allow location to see flats near you.');
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
    } catch (e) {
      toast('Could not find your location. Try again outside.');
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
          <Chip label="Everything" selected={type === 'all'} onPress={() => setType('all')} />
          <Chip label="Whole flats" selected={type === 'flat'} onPress={() => setType('flat')} />
          <Chip label="Flatmate wanted" selected={type === 'flatmate'} onPress={() => setType('flatmate')} />
          <Chip label={`Up to ${inr(RENT_STEPS[rentIdx])}`} onPress={() => setRentIdx((rentIdx + 1) % RENT_STEPS.length)} />
          <Chip label="Near me" selected={!!pos} onPress={toggleNear} />
        </ScrollView>
      </View>

      {loading && !current ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.tangerine} />
        </View>
      ) : error && !current ? (
        <View style={{ padding: 16, gap: 12 }}>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" onPress={() => void load()} />
        </View>
      ) : !current ? (
        <View style={{ padding: 16 }}>
          <Sticker bg={c.butter} radius={26} offset={6} innerStyle={{ padding: 28, gap: 12, alignItems: 'center' }}>
            <T v="display" style={{ color: c.onTile, textAlign: 'center', fontSize: 28 }}>You have seen everything</T>
            <T style={{ color: c.onTile, textAlign: 'center' }}>Your standards are high. Loosen the filters, or check back later for new places.</T>
            <Button title="Check again" kind="primary" onPress={() => void load()} />
          </Sticker>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <SwipeCard ref={swipeRef} resetKey={current.id} onSwipe={(d) => void decide(d)}>
            <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
              <ListingProfile
                listing={current}
                onLike={(kind, index) => setLikeTarget({ kind, index })}
                onReport={() => setReporting(true)}
              />
            </ScrollView>
          </SwipeCard>
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 14, flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
            <Button title="Nope" icon="close" onPress={() => swipeRef.current?.swipe('pass')} />
            <Button title="Ooh, yes" icon="heart" kind="primary" onPress={() => swipeRef.current?.swipe('like')} />
          </View>
        </View>
      )}

      <LikeSheet listing={current} target={likeTarget} onClose={() => setLikeTarget(null)} onSend={sendLike} />
      <ReportSheet
        visible={reporting}
        who={current?.owner?.name ?? 'this person'}
        listingId={current?.id}
        onClose={() => setReporting(false)}
        onDone={(blocked) => {
          setReporting(false);
          toast(blocked ? 'Reported and blocked. You will not see them again.' : 'Report sent. Thanks for keeping this safe.');
          if (blocked) advance();
        }}
      />
    </SafeAreaView>
  );
}
