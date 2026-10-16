import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Button, Chip, ErrorText, Field, Panel, Screen, Sheet, T } from '@/components/ui';
import { PhotoCapture } from '@/components/PhotoCapture';
import { api, ApiError, type ListingInput } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { fonts, useTheme } from '@/lib/theme';
import { shortDate } from '@/lib/format';
import { PROMPTS, ROLES, ROOMS, ROOM_LABEL, TAGS, type Listing, type ListingType, type Prompt } from '@/lib/types';

const MIN_PHOTOS = 6;
type Step = 'basics' | 'photos' | 'prompts' | 'review';
const STEPS: { key: Step; label: string }[] = [
  { key: 'basics', label: '1 Basics' },
  { key: 'photos', label: '2 Photos' },
  { key: 'prompts', label: '3 Prompts' },
  { key: 'review', label: '4 Publish' },
];

type Draft = {
  type: ListingType;
  role: string;
  locality: string;
  addressLine: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  bhk: number;
  sqft: string;
  rent: string;
  deposit: string;
  furnishing: string;
  floor: string;
  availableFrom: string;
  roomType: string;
  alreadyLiving: number;
  nearby: string;
  tags: string[];
};

function emptyDraft(type: ListingType): Draft {
  return {
    type, role: ROLES[type][0], locality: '', addressLine: '', lat: null, lng: null, accuracy: null, bhk: 2, sqft: '', rent: '',
    deposit: '', furnishing: '', floor: '', availableFrom: '', roomType: 'Private room', alreadyLiving: 1, nearby: '', tags: [],
  };
}

function fromListing(l: Listing): Draft {
  return {
    type: l.type, role: l.role, locality: l.locality, addressLine: l.addressLine ?? '', lat: l.lat ?? null, lng: l.lng ?? null,
    accuracy: null, bhk: l.bhk, sqft: l.sqft ? String(l.sqft) : '', rent: String(l.rent), deposit: l.deposit, furnishing: l.furnishing,
    floor: l.floor, availableFrom: l.availableFrom, roomType: l.roomType || 'Private room', alreadyLiving: l.alreadyLiving || 1,
    nearby: l.nearby, tags: l.tags,
  };
}

function msg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
}

export default function ListingWizard() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user, setUser } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('basics');
  const [listing, setListing] = useState<Listing | null>(null);
  const [d, setD] = useState<Draft>(emptyDraft('flat'));
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [room, setRoom] = useState('living');
  const [camera, setCamera] = useState(false);
  const [pickPrompt, setPickPrompt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const photos = listing?.photos ?? [];
  const locationLocked = photos.length > 0;

  // Open an existing draft or live listing.
  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const r = await api.myListings();
        const l = r.listings.find((x) => x.id === id);
        if (!l) throw new ApiError(404, 'not_found', 'Listing not found.');
        setListing(l);
        setD(fromListing(l));
        const ps = l.prompts.slice(0, 3);
        const defaults = PROMPTS[l.type];
        while (ps.length < 3) ps.push({ q: defaults.find((q) => !ps.some((p) => p.q === q)) ?? defaults[ps.length], a: '' });
        setPrompts(ps);
        setStep(l.photos.length < MIN_PHOTOS ? 'photos' : 'prompts');
      } catch (e) {
        setLoadError(msg(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  // Starting prompts for a new listing.
  useEffect(() => {
    if (isNew) {
      const q = PROMPTS[d.type];
      setPrompts([{ q: q[0], a: '' }, { q: q[1], a: '' }, { q: q[2], a: '' }]);
    }
  }, [isNew, d.type]);

  const pinLocation = useCallback(async () => {
    setError('');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return setError('Allow location so we can pin this place. We use it to verify your photos.');
    setBusy(true);
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (p.mocked) return setError('Your phone is using a fake location. Turn that off and try again.');
      setD((prev) => ({ ...prev, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }));
    } catch (e) {
      setError('Could not find your location. Step outside or near a window and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  async function verifyId() {
    setBusy(true);
    setError('');
    try {
      const r = await api.verifyId();
      setUser(r.user);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  function basicsInput(): ListingInput | null {
    const rent = parseInt(d.rent.replace(/[^0-9]/g, ''), 10);
    if (!user?.idVerified) return setError('Check your ID first.'), null;
    if (d.lat === null || d.lng === null) return setError('Pin the place while you are standing at it.'), null;
    if (d.locality.trim().length < 2) return setError('Enter the locality.'), null;
    if (!(rent > 0)) return setError('Enter the monthly rent as a number.'), null;
    return {
      type: d.type, role: d.role, locality: d.locality.trim(), addressLine: d.addressLine.trim(), lat: d.lat, lng: d.lng, bhk: d.bhk,
      sqft: parseInt(d.sqft.replace(/[^0-9]/g, ''), 10) || 0, rent, deposit: d.deposit.trim(), furnishing: d.furnishing.trim(),
      floor: d.floor.trim(), availableFrom: d.availableFrom.trim(), roomType: d.type === 'flatmate' ? d.roomType : '',
      alreadyLiving: d.type === 'flatmate' ? d.alreadyLiving : 0, nearby: d.nearby.trim(), tags: d.tags, prompts: listing?.prompts ?? [],
    };
  }

  async function saveBasics() {
    setError('');
    const input = basicsInput();
    if (!input) return;
    setBusy(true);
    try {
      if (listing) {
        const { type: _type, ...rest } = input;
        const patch: Partial<Omit<ListingInput, 'type'>> = { ...rest };
        if (locationLocked) {
          delete patch.lat;
          delete patch.lng;
        }
        const r = await api.patchListing(listing.id, patch);
        setListing(r.listing);
      } else {
        const r = await api.createListing(input);
        setListing(r.listing);
      }
      setStep('photos');
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(photoId: string) {
    if (!listing) return;
    try {
      await api.deletePhoto(listing.id, photoId);
      setListing({ ...listing, photos: listing.photos.filter((p) => p.id !== photoId) });
    } catch (e) {
      toast(msg(e));
    }
  }

  async function savePrompts() {
    setError('');
    if (!listing) return;
    if (prompts.some((p) => p.a.trim().length < 12)) return setError('Answer all three prompts with at least a short sentence each.');
    setBusy(true);
    try {
      const r = await api.patchListing(listing.id, { prompts: prompts.map((p) => ({ q: p.q, a: p.a.trim() })), tags: d.tags });
      setListing(r.listing);
      setStep('review');
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!listing) return;
    setBusy(true);
    setError('');
    setProblems([]);
    try {
      await api.publish(listing.id);
      toast('You are live on Explore.');
      router.replace('/list');
    } catch (e) {
      setError(msg(e));
      if (e instanceof ApiError && e.details) setProblems(e.details);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Screen><T muted>Loading…</T></Screen>;
  if (loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const roomChips = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {ROOMS.map((r) => <Chip key={r.key} label={r.label} selected={room === r.key} onPress={() => setRoom(r.key)} />)}
    </View>
  );

  const slots: React.ReactNode[] = [];
  const total = Math.max(MIN_PHOTOS, photos.length);
  for (let i = 0; i < total; i++) {
    const p = photos[i];
    slots.push(
      <View
        key={p ? p.id : `empty-${i}`}
        style={{
          width: '31%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: c.edge,
          borderStyle: p ? 'solid' : 'dashed', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {p ? (
          <>
            <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} />
            <View style={{ position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(14,10,30,0.82)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="shield-checkmark" size={12} color="#8CC0FF" />
            </View>
            <View style={{ position: 'absolute', left: 4, top: 4, backgroundColor: 'rgba(14,10,30,0.82)', borderRadius: 8, paddingHorizontal: 5 }}>
              <Text style={{ color: '#fff', fontFamily: fonts.body, fontSize: 10 }}>{ROOM_LABEL[p.room] ?? ''} · {shortDate(p.capturedAt)}</Text>
            </View>
            <Pressable
              onPress={() => void removePhoto(p.id)}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              hitSlop={6}
              style={{ position: 'absolute', right: 4, top: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(14,10,30,0.82)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </>
        ) : (
          <T v="mono" muted>photo {i + 1}</T>
        )}
      </View>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {STEPS.map((s) => (
          <Chip key={s.key} label={s.label} selected={step === s.key} onPress={() => (listing || s.key === 'basics') && setStep(s.key)} />
        ))}
      </View>

      {step === 'basics' ? (
        <>
          {isNew ? (
            <Panel>
              <T v="title">What are you listing?</T>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Chip label="My whole flat" selected={d.type === 'flat'} onPress={() => setD({ ...d, type: 'flat', role: ROLES.flat[0], tags: [] })} />
                <Chip label="A room, I need a flatmate" selected={d.type === 'flatmate'} onPress={() => setD({ ...d, type: 'flatmate', role: ROLES.flatmate[0], tags: [] })} />
              </View>
            </Panel>
          ) : null}
          <Panel>
            <T v="title">Who you are</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {ROLES[d.type].map((r) => <Chip key={r} label={r} selected={d.role === r} onPress={() => set('role', r)} />)}
            </View>
            {user?.idVerified ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-checkmark" size={18} color={c.ok} />
                <T style={{ color: c.ok }} v="bold">ID checked</T>
              </View>
            ) : (
              <>
                <T v="small" muted>Renters see an ID checked badge on your listing. This is a test check for now.</T>
                <Button title="Check my ID" onPress={() => void verifyId()} loading={busy} />
              </>
            )}
          </Panel>
          <Panel>
            <T v="title">Pin the place</T>
            <T v="small" muted>
              Stand inside the place and tap pin. Every photo you take later must be within about 150 metres of this spot. Renters only ever see the area, never the exact spot.
            </T>
            {locationLocked ? (
              <T v="bold">Pinned. It is locked because photos were verified here.</T>
            ) : (
              <Button title={d.lat !== null ? 'Pin again' : 'I am at the place, pin it'} icon="location" onPress={() => void pinLocation()} loading={busy} />
            )}
            {d.lat !== null && !locationLocked ? (
              <T v="bold" style={{ color: c.ok }}>Pinned{d.accuracy ? ` (accurate to about ${Math.round(d.accuracy)} m)` : ''}.</T>
            ) : null}
          </Panel>
          <Panel>
            <T v="title">The basics</T>
            <Field label="Locality" value={d.locality} onChangeText={(v) => set('locality', v)} placeholder="e.g. Basavanagudi" />
            <Field
              label="Exact address (private)"
              hint="Only shared with someone once you accept their chat."
              value={d.addressLine}
              onChangeText={(v) => set('addressLine', v)}
            />
            <View style={{ gap: 5 }}>
              <T v="small" muted>{d.type === 'flatmate' ? 'Flat size' : 'Bedrooms'}</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[1, 2, 3, 4].map((n) => <Chip key={n} label={`${n} BHK`} selected={d.bhk === n} onPress={() => set('bhk', n)} />)}
              </View>
            </View>
            <Field
              label={d.type === 'flatmate' ? 'Rent for the room (₹ per month)' : 'Rent (₹ per month)'}
              value={d.rent}
              onChangeText={(v) => set('rent', v)}
              keyboardType="number-pad"
              placeholder="30000"
            />
            <Field label="Deposit" value={d.deposit} onChangeText={(v) => set('deposit', v)} placeholder="e.g. ₹1.5 lakh" />
            {d.type === 'flat' ? (
              <>
                <Field label="Size (sq ft, optional)" value={d.sqft} onChangeText={(v) => set('sqft', v)} keyboardType="number-pad" />
                <Field label="Furnishing" value={d.furnishing} onChangeText={(v) => set('furnishing', v)} placeholder="e.g. Semi-furnished" />
                <Field label="Floor" value={d.floor} onChangeText={(v) => set('floor', v)} placeholder="e.g. 2nd of 4" />
              </>
            ) : (
              <>
                <View style={{ gap: 5 }}>
                  <T v="small" muted>Room</T>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {['Private room', 'Private room, attached bath', 'Private room, shared bath', 'Shared room'].map((r) => (
                      <Chip key={r} label={r} selected={d.roomType === r} onPress={() => set('roomType', r)} />
                    ))}
                  </View>
                </View>
                <View style={{ gap: 5 }}>
                  <T v="small" muted>Already living there</T>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[1, 2, 3, 4].map((n) => <Chip key={n} label={`${n}`} selected={d.alreadyLiving === n} onPress={() => set('alreadyLiving', n)} />)}
                  </View>
                </View>
              </>
            )}
            <Field label="Free from" value={d.availableFrom} onChangeText={(v) => set('availableFrom', v)} placeholder="e.g. 1 Nov" />
            <Field label="Location, what is nearby" value={d.nearby} onChangeText={(v) => set('nearby', v)} placeholder="e.g. Metro station, 600 m on foot" />
            <View style={{ gap: 5 }}>
              <T v="small" muted>{d.type === 'flatmate' ? 'Your vibe' : 'Good stuff'}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TAGS[d.type].map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={d.tags.includes(t)}
                    onPress={() => set('tags', d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t])}
                  />
                ))}
              </View>
            </View>
          </Panel>
          <ErrorText>{error}</ErrorText>
          <Button title="Save and add photos" kind="primary" onPress={() => void saveBasics()} loading={busy} />
        </>
      ) : null}

      {step === 'photos' && listing ? (
        <>
          <Panel>
            <T v="title">Six verified photos</T>
            <T v="small" muted>
              Take every photo here, at the place. We check your location and the time. Think of it as dating profile photos, but for walls.
            </T>
            <T v="mono">{photos.length} of {MIN_PHOTOS} verified{photos.length >= MIN_PHOTOS ? '. Nice.' : ''}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '3.5%' as unknown as number, rowGap: 10 }}>{slots}</View>
            <T v="small" muted>What is in the next photo?</T>
            {roomChips}
            <Button title="Take photo at the place" kind="primary" icon="camera" onPress={() => setCamera(true)} disabled={photos.length >= 10} />
          </Panel>
          <Button title={photos.length >= MIN_PHOTOS ? 'Next: prompts' : 'Next (you still need more photos)'} onPress={() => setStep('prompts')} />
        </>
      ) : null}

      {step === 'prompts' && listing ? (
        <>
          <Panel>
            <T v="title">Three prompts</T>
            <T v="small" muted>
              {d.type === 'flatmate' ? 'Let people feel what living with you is like.' : 'Tell people what makes this house worth it. Funny beats fancy.'}
            </T>
          </Panel>
          {prompts.map((p, i) => (
            <Panel key={i}>
              <T v="label" muted>Prompt {i + 1}</T>
              <Pressable onPress={() => setPickPrompt(i)} accessibilityRole="button" accessibilityLabel={`Change prompt ${i + 1}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.lime, borderColor: c.edge, borderWidth: 2, borderRadius: 12, padding: 12 }}>
                  <T v="bold" style={{ flex: 1, color: c.onTile }}>{p.q}</T>
                  <Ionicons name="swap-vertical" size={18} color={c.onTile} />
                </View>
              </Pressable>
              <Field
                label="Your answer"
                value={p.a}
                onChangeText={(v) => setPrompts((prev) => prev.map((x, k) => (k === i ? { ...x, a: v } : x)))}
                multiline
                maxLength={140}
                placeholder={d.type === 'flatmate' ? 'Say it like you would to a friend.' : 'Make it specific. Skip "spacious and airy".'}
                hint={`${p.a.length}/140`}
              />
            </Panel>
          ))}
          <ErrorText>{error}</ErrorText>
          <Button title="Save and review" kind="primary" onPress={() => void savePrompts()} loading={busy} />
        </>
      ) : null}

      {step === 'review' && listing ? (
        <>
          <Panel>
            <T v="title">Ready to go live?</T>
            <Check ok={!!user?.idVerified} label="ID checked" />
            <Check ok={photos.length >= MIN_PHOTOS} label={`${photos.length} of ${MIN_PHOTOS} verified photos`} />
            <Check ok={listing.prompts.length === 3} label="Three prompts answered" />
            <T v="small" muted>
              {listing.status === 'published' ? 'This listing is live. Changes you saved are already showing.' : 'Publishing puts it in front of renters straight away. You can take it down any time.'}
            </T>
          </Panel>
          {problems.length ? <View style={{ gap: 4 }}>{problems.map((p) => <ErrorText key={p}>{p}</ErrorText>)}</View> : <ErrorText>{error}</ErrorText>}
          {listing.status === 'published' ? (
            <Button title="Done" kind="primary" onPress={() => router.replace('/list')} />
          ) : (
            <Button title="Publish to Explore" kind="primary" onPress={() => void publish()} loading={busy} />
          )}
          <Button title="Save as draft for later" onPress={() => router.replace('/list')} />
        </>
      ) : null}

      {listing ? (
        <PhotoCapture
          visible={camera}
          listingId={listing.id}
          room={room}
          onClose={() => setCamera(false)}
          onUploaded={(photo, count) => {
            setListing((prev) => (prev ? { ...prev, photos: [...prev.photos, photo] } : prev));
            setCamera(false);
            toast(count >= MIN_PHOTOS ? 'Verified. That is all six.' : `Verified. ${MIN_PHOTOS - count} to go.`);
          }}
        />
      ) : null}

      <Sheet visible={pickPrompt !== null} onClose={() => setPickPrompt(null)}>
        <T v="title">Pick a prompt</T>
        {PROMPTS[d.type].map((q) => {
          const usedElsewhere = prompts.some((p, k) => p.q === q && k !== pickPrompt);
          return (
            <Chip
              key={q}
              label={usedElsewhere ? `${q} (already used)` : q}
              selected={pickPrompt !== null && prompts[pickPrompt]?.q === q}
              onPress={() => {
                if (usedElsewhere || pickPrompt === null) return;
                setPrompts((prev) => prev.map((x, k) => (k === pickPrompt ? { ...x, q } : x)));
                setPickPrompt(null);
              }}
              style={{ alignSelf: 'flex-start', opacity: usedElsewhere ? 0.5 : 1 }}
            />
          );
        })}
      </Sheet>
    </Screen>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={ok ? c.ok : c.muted} />
      <T v={ok ? 'bold' : 'body'} muted={!ok}>{label}</T>
    </View>
  );
}
