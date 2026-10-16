import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Chip, ErrorText, Field, Sheet, T } from './ui';
import { useTheme } from '@/lib/theme';
import { api, ApiError } from '@/lib/api';
import { REPORT_REASONS, ROOM_LABEL, type Listing } from '@/lib/types';
import { firstName } from '@/lib/format';

/* ---------- like one photo or one answer, with a comment ---------- */
export type LikeTarget = { kind: 'photo' | 'prompt'; index: number } | null;

export function LikeSheet({
  listing,
  target,
  onClose,
  onSend,
}: {
  listing: Listing | undefined;
  target: LikeTarget;
  onClose: () => void;
  onSend: (comment: string) => Promise<void>;
}) {
  const { c } = useTheme();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setComment('');
    setError('');
    setBusy(false);
  }, [target, listing?.id]);

  if (!listing || !target) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;
  const label =
    target.kind === 'photo'
      ? `${ROOM_LABEL[listing.photos[target.index]?.room] || 'Photo'} photo`
      : listing.prompts[target.index]?.q ?? '';
  const text = target.kind === 'prompt' ? listing.prompts[target.index]?.a ?? '' : '';
  const who = firstName(listing.owner?.name ?? 'them');

  async function send() {
    setBusy(true);
    setError('');
    try {
      await onSend(comment.trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send. Try again.');
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose}>
      <T v="title">Tell {who} what got you</T>
      <View style={{ backgroundColor: c.lime, borderColor: c.edge, borderWidth: 2, borderRadius: 12, padding: 12, gap: 4 }}>
        <T v="label" style={{ color: c.onTile }}>{label}</T>
        {text ? <T v="bold" style={{ color: c.onTile }}>{text}</T> : null}
      </View>
      <Field
        label="Add a comment (optional)"
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={500}
        placeholder={target.kind === 'photo' ? 'Okay but this light is unreal.' : 'This is exactly the kind of flat I want.'}
      />
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Send like" kind="primary" icon="heart" onPress={send} loading={busy} />
        <Button title="Not now" onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  );
}

/* ---------- report or block ---------- */
export function ReportSheet({
  visible,
  who,
  listingId,
  conversationId,
  onClose,
  onDone,
}: {
  visible: boolean;
  who: string;
  listingId?: string;
  conversationId?: string;
  onClose: () => void;
  onDone: (blocked: boolean) => void;
}) {
  const { c } = useTheme();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setReason('');
      setDetails('');
      setBlock(true);
      setError('');
      setBusy(false);
    }
  }, [visible]);

  async function submit() {
    if (!reason) {
      setError('Pick the closest reason first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.report({ listingId, conversationId, reason, details: details.trim(), block });
      onDone(r.blocked);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the report. Try again.');
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <T v="title">Report {firstName(who)}</T>
      <T v="small" muted>What happened? Pick the closest one.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {REPORT_REASONS.map((r) => (
          <Chip key={r.key} label={r.label} selected={reason === r.key} onPress={() => setReason(r.key)} />
        ))}
      </View>
      <Field label="Details (optional)" value={details} onChangeText={setDetails} multiline maxLength={500} placeholder="Anything that helps us check it." />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Switch
          value={block}
          onValueChange={setBlock}
          accessibilityLabel={`Also block ${firstName(who)}`}
          trackColor={{ true: c.tangerine, false: c.muted }}
        />
        <T style={{ flex: 1 }}>Also block {firstName(who)}</T>
      </View>
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Send report" kind="primary" onPress={submit} loading={busy} />
        <Button title="Cancel" onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  );
}
