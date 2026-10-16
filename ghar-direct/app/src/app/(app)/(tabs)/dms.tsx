import React, { useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Avatar, Button, Sticker, T } from '@/components/ui';
import { fonts, useTheme } from '@/lib/theme';
import { useInbox } from '@/lib/inbox';
import { inr, timeAgo } from '@/lib/format';
import type { ConversationSummary } from '@/lib/types';

function statusTag(c: ConversationSummary): string | null {
  if (c.status === 'declined') return 'Closed';
  if (c.status === 'pending') return c.iAm === 'owner' ? 'New like' : 'Waiting for a reply';
  return null;
}

export default function DMs() {
  const { c } = useTheme();
  const router = useRouter();
  const { conversations, refresh } = useInbox();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={conversations}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
        ListHeaderComponent={<T v="display" style={{ marginBottom: 4 }}>DMs</T>}
        ListEmptyComponent={
          <Sticker bg={c.butter} radius={26} offset={6} innerStyle={{ padding: 26, gap: 12, alignItems: 'center' }}>
            <T v="title" style={{ color: c.onTile, textAlign: 'center' }}>Your DMs are lonely</T>
            <T style={{ color: c.onTile, textAlign: 'center' }}>Like a flat, or the exact photo you love, and a chat opens with the person behind it.</T>
            <Button title="Go explore" kind="primary" onPress={() => router.navigate('/')} />
          </Sticker>
        }
        renderItem={({ item }) => {
          const tag = statusTag(item);
          const l = item.listing;
          return (
            <Pressable onPress={() => router.push(`/chat/${item.id}`)} accessibilityRole="button" accessibilityLabel={`Chat with ${item.other.name}`}>
              <Sticker radius={18} offset={4} innerStyle={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={item.other.name} size={46} />
                <View style={{ flex: 1, gap: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{item.other.name}</T>
                    <T v="small" muted>{item.lastMessage ? timeAgo(item.lastMessage.createdAt) : ''}</T>
                  </View>
                  {l ? (
                    <T v="small" muted numberOfLines={1}>
                      {l.type === 'flatmate' ? 'Room' : `${l.bhk} BHK`} in {l.locality} · {inr(l.rent)}
                    </T>
                  ) : null}
                  <T numberOfLines={1} style={{ fontFamily: item.unread ? fonts.bodyBold : fonts.body }}>
                    {item.lastMessage ? `${item.lastMessage.mine ? 'You: ' : ''}${item.lastMessage.body}` : ''}
                  </T>
                  {tag ? (
                    <View style={{ alignSelf: 'flex-start', backgroundColor: c.butter, borderColor: c.edge, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, marginTop: 4 }}>
                      <Text style={{ color: c.onTile, fontFamily: fonts.bodyBold, fontSize: 11 }}>{tag}</Text>
                    </View>
                  ) : null}
                </View>
                {item.unread ? (
                  <View style={{ minWidth: 24, height: 24, borderRadius: 12, backgroundColor: c.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                    <Text style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: 12 }}>{item.unread}</Text>
                  </View>
                ) : null}
              </Sticker>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
