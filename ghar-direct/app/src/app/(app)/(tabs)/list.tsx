import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, ErrorText, IdBadge, Screen, Sticker, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { fonts, useTheme } from '@/lib/theme';
import { inr } from '@/lib/format';
import type { Listing } from '@/lib/types';

const MIN_PHOTOS = 6;

const STATUS: Record<Listing['status'], { label: string; note: string }> = {
  draft: { label: 'Draft', note: 'Not visible to anyone yet.' },
  published: { label: 'Live', note: 'People can find this in Explore.' },
  taken_down: { label: 'Paused', note: 'Hidden from Explore. Relist when you are ready.' },
  under_review: { label: 'Under review', note: 'Several people reported this listing. We are checking it.' },
  removed: { label: 'Removed', note: '' },
};

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
}

export default function ListTab() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.myListings();
      setItems(r.listings);
    } catch (e) {
      setError(message(e));
      setItems((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function change(l: Listing, action: 'takedown' | 'relist') {
    setBusyId(l.id);
    setError('');
    try {
      if (action === 'takedown') await api.takedown(l.id);
      else await api.relist(l.id);
      toast(action === 'takedown' ? 'Paused. It is hidden from Explore.' : 'Back on Explore.');
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <T v="display">List your place</T>
      <T muted>
        Own a flat, moving out, or need a flatmate? Post it with {MIN_PHOTOS} photos taken on the spot and three prompts. People message you directly.
      </T>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {user?.idVerified ? <IdBadge /> : <T v="small" muted>You will check your ID in the first step.</T>}
      </View>

      <Button title="New listing" kind="primary" icon="add" onPress={() => router.push('/listing/new')} />
      <ErrorText>{error}</ErrorText>

      {items === null ? (
        <ActivityIndicator color={c.ink} style={{ marginTop: 24 }} />
      ) : items.length === 0 ? (
        <Sticker bg={c.butter} radius={26} offset={6} innerStyle={{ padding: 24, gap: 10, alignItems: 'center' }}>
          <T v="title" style={{ color: c.onTile, textAlign: 'center' }}>Nothing listed yet</T>
          <T style={{ color: c.onTile, textAlign: 'center' }}>
            It takes about ten minutes. Take the photos while you are at the place, then answer three prompts.
          </T>
        </Sticker>
      ) : (
        items.map((l) => {
          const st = STATUS[l.status];
          const cover = l.photos[0]?.url;
          const missing = Math.max(0, MIN_PHOTOS - l.photos.length);
          const busy = busyId === l.id;
          return (
            <Sticker key={l.id} radius={20} offset={5} innerStyle={{ padding: 12, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 84, height: 84, borderRadius: 14, overflow: 'hidden', backgroundColor: c.sky, borderColor: c.edge, borderWidth: 2 }}>
                  {cover ? <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bold" numberOfLines={2}>
                    {l.type === 'flatmate' ? 'Room in a' : ''} {l.bhk} BHK in {l.locality}
                  </T>
                  <T v="mono" muted>{inr(l.rent)} / month</T>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: 4,
                      backgroundColor: l.status === 'published' ? c.lime : c.butter,
                      borderColor: c.edge,
                      borderWidth: 1.5,
                      borderRadius: 8,
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text style={{ color: c.onTile, fontFamily: fonts.bodyBold, fontSize: 11 }}>{st.label}</Text>
                  </View>
                </View>
              </View>
              <T v="small" muted>
                {l.photos.length} of {MIN_PHOTOS} photos
                {missing ? `, ${missing} more needed to publish` : ''}. {st.note}
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Button small title={l.status === 'draft' ? 'Continue' : 'Edit'} onPress={() => router.push(`/listing/${l.id}`)} />
                {l.status === 'published' ? (
                  <Button small title="Pause" loading={busy} onPress={() => void change(l, 'takedown')} />
                ) : null}
                {l.status === 'taken_down' ? (
                  <Button small kind="lime" title="Relist" loading={busy} onPress={() => void change(l, 'relist')} />
                ) : null}
              </View>
            </Sticker>
          );
        })
      )}
    </Screen>
  );
}
