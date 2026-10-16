import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, IdBadge, Sticker, T } from './ui';
import { fonts, useTheme } from '@/lib/theme';
import { inr, shortDate } from '@/lib/format';
import { ROOM_LABEL, type Listing } from '@/lib/types';

type Props = {
  listing: Listing;
  onLike: (kind: 'photo' | 'prompt', index: number) => void;
  onReport?: () => void;
};

function LikeButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: c.white,
        borderColor: c.edge,
        borderWidth: 2.5,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="heart" size={22} color={c.heart} />
    </Pressable>
  );
}

function PhotoTile({ listing, index, hero, onLike }: { listing: Listing; index: number; hero?: boolean; onLike: Props['onLike'] }) {
  const { c } = useTheme();
  const p = listing.photos[index];
  if (!p) return null;
  const room = ROOM_LABEL[p.room] || 'Photo';
  return (
    <Sticker radius={26} offset={6}>
      <View style={{ aspectRatio: 4 / 4.6, backgroundColor: c.sky }}>
        <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`${room} photo`} />
        <View
          style={{
            position: 'absolute', top: 14, left: 14, backgroundColor: c.butter, borderColor: c.edge, borderWidth: 2,
            borderRadius: 10, paddingHorizontal: 12, transform: [{ rotate: '-3deg' }],
          }}
        >
          <Text style={{ color: c.onTile, fontFamily: fonts.hand, fontSize: 24, lineHeight: 30 }}>{room}</Text>
        </View>
        {hero ? (
          <View
            style={{
              position: 'absolute', top: 14, right: 14, backgroundColor: c.lime, borderColor: c.edge, borderWidth: 2.5,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center', transform: [{ rotate: '4deg' }],
            }}
          >
            <Text style={{ color: c.onTile, fontFamily: fonts.monoMedium, fontSize: 20 }}>{inr(listing.rent)}</Text>
            <Text style={{ color: c.onTile, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {listing.type === 'flatmate' ? 'your share / mo' : 'per month'}
            </Text>
          </View>
        ) : null}
        <View
          style={{
            position: 'absolute', left: 14, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: 'rgba(14,10,30,0.82)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
          }}
        >
          <Ionicons name="shield-checkmark" size={14} color="#8CC0FF" />
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.body, fontSize: 12 }}>verified {shortDate(p.capturedAt)}</Text>
        </View>
        <LikeButton label={`Like this ${room.toLowerCase()} photo`} onPress={() => onLike('photo', index)} />
      </View>
    </Sticker>
  );
}

function PromptTile({ listing, index, onLike }: { listing: Listing; index: number; onLike: Props['onLike'] }) {
  const { c } = useTheme();
  const p = listing.prompts[index];
  if (!p) return null;
  const bg = [c.lime, c.pink, c.sky, c.butter][(index + listing.photos.length) % 4];
  return (
    <Sticker radius={26} offset={6} bg={bg}>
      <View style={{ padding: 20, paddingBottom: 72 }}>
        <T v="label" style={{ color: c.onTile }}>{p.q}</T>
        <Text style={{ color: c.onTile, fontFamily: fonts.display, fontSize: 27, lineHeight: 30, letterSpacing: -0.7, marginTop: 8 }}>{p.a}</Text>
        <LikeButton label="Like this answer" onPress={() => onLike('prompt', index)} />
      </View>
    </Sticker>
  );
}

function InfoTile({ listing }: { listing: Listing }) {
  const { c } = useTheme();
  const fm = listing.type === 'flatmate';
  const facts = [
    fm ? listing.roomType : '',
    fm && listing.alreadyLiving ? `${listing.alreadyLiving} ${listing.alreadyLiving > 1 ? 'people' : 'person'} already live here` : '',
    listing.sqft ? `${listing.sqft.toLocaleString()} sq ft` : '',
    listing.furnishing,
    listing.floor,
    listing.availableFrom ? `Free from ${listing.availableFrom}` : '',
    listing.deposit ? `Deposit ${listing.deposit}` : '',
    listing.distanceKm !== undefined ? `About ${listing.distanceKm} km away` : '',
  ].filter(Boolean);
  return (
    <Sticker radius={26} offset={6} innerStyle={{ padding: 18, gap: 12 }}>
      <View
        style={{
          alignSelf: 'flex-start', backgroundColor: fm ? c.pink : c.sky, borderColor: c.edge, borderWidth: 2, borderRadius: 8,
          paddingHorizontal: 10, transform: [{ rotate: '-1.5deg' }],
        }}
      >
        <Text style={{ color: c.onTile, fontFamily: fonts.mono, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {fm ? 'Flatmate wanted' : `${listing.bhk} BHK`}
        </Text>
      </View>
      <T v="display" style={{ fontSize: 30, lineHeight: 31 }}>
        {fm ? `A room in a ${listing.bhk} BHK, ${listing.locality}` : `${listing.bhk} BHK in ${listing.locality}`}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {facts.map((f) => (
          <View key={f} style={{ borderColor: c.edge, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 1 }}>
            <T v="small">{f}</T>
          </View>
        ))}
      </View>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 2, borderStyle: 'dashed', borderColor: c.edge,
        }}
      >
        <Avatar name={listing.owner?.name ?? '?'} />
        <View style={{ flex: 1 }}>
          <T v="bold">{listing.owner?.name ?? 'Owner'}</T>
          <T v="small" muted>{listing.role}</T>
        </View>
        {listing.owner?.idVerified ? <IdBadge /> : null}
      </View>
    </Sticker>
  );
}

function WhereTile({ listing }: { listing: Listing }) {
  const { c } = useTheme();
  return (
    <Sticker radius={26} offset={6} bg={c.tangerine} innerStyle={{ padding: 18, gap: 12 }}>
      <T v="label" style={{ color: c.onTile }}>Where you will be</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="location" size={28} color={c.onTile} />
        <Text style={{ flex: 1, color: c.onTile, fontFamily: fonts.display, fontSize: 22, lineHeight: 24, letterSpacing: -0.4 }}>
          {listing.nearby || listing.locality}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {listing.tags.map((t) => (
          <View key={t} style={{ backgroundColor: c.white, borderColor: c.edge, borderWidth: 2, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 1 }}>
            <Text style={{ color: c.onTile, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{t}</Text>
          </View>
        ))}
      </View>
    </Sticker>
  );
}

// A Hinge-style profile: photo, details, prompt, photos, prompt, photos, prompt, photo, where.
export function ListingProfile({ listing, onLike, onReport }: Props) {
  const n = listing.photos.length;
  const rest: number[] = [];
  for (let i = 5; i < n; i++) rest.push(i);
  return (
    <View style={{ gap: 18 }}>
      <PhotoTile listing={listing} index={0} hero onLike={onLike} />
      <InfoTile listing={listing} />
      <PromptTile listing={listing} index={0} onLike={onLike} />
      <PhotoTile listing={listing} index={1} onLike={onLike} />
      <PhotoTile listing={listing} index={2} onLike={onLike} />
      <PromptTile listing={listing} index={1} onLike={onLike} />
      <PhotoTile listing={listing} index={3} onLike={onLike} />
      <PhotoTile listing={listing} index={4} onLike={onLike} />
      <PromptTile listing={listing} index={2} onLike={onLike} />
      {rest.map((i) => (
        <PhotoTile key={i} listing={listing} index={i} onLike={onLike} />
      ))}
      <WhereTile listing={listing} />
      {onReport ? (
        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={onReport} accessibilityRole="button" hitSlop={10} style={{ padding: 10 }}>
            <T v="small" muted style={{ textDecorationLine: 'underline' }}>Report or block this listing</T>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
