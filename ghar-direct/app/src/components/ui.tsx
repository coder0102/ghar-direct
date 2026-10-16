import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fonts, useTheme } from '@/lib/theme';
import { initials } from '@/lib/format';

/* ---------- text ---------- */
type Variant = 'body' | 'bold' | 'display' | 'hand' | 'mono' | 'label' | 'small' | 'title';
const VARIANTS: Record<Variant, TextStyle> = {
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bold: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 25, letterSpacing: -0.5 },
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 33, letterSpacing: -1 },
  hand: { fontFamily: fonts.hand, fontSize: 22, lineHeight: 26 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
};

export function T({ v = 'body', muted, style, ...rest }: TextProps & { v?: Variant; muted?: boolean }) {
  const { c } = useTheme();
  return <Text {...rest} style={[{ color: muted ? c.muted : c.ink }, VARIANTS[v], style]} />;
}

/* ---------- sticker: bordered box with a hard offset shadow ---------- */
export function Sticker({
  children,
  bg,
  radius = 24,
  offset = 5,
  style,
  innerStyle,
}: {
  children: React.ReactNode;
  bg?: string;
  radius?: number;
  offset?: number;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View style={[{ paddingRight: offset, paddingBottom: offset }, style]}>
      <View
        style={{ position: 'absolute', left: offset, top: offset, right: 0, bottom: 0, backgroundColor: c.shadow, borderRadius: radius }}
      />
      <View
        style={[
          { backgroundColor: bg ?? c.surface, borderColor: c.edge, borderWidth: 2.5, borderRadius: radius, overflow: 'hidden' },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/* ---------- buttons and chips ---------- */
export function Button({
  title,
  onPress,
  kind = 'default',
  disabled,
  loading,
  small,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'default' | 'primary' | 'lime' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.tangerine : kind === 'lime' ? c.lime : c.surface;
  const color = kind === 'default' ? c.ink : kind === 'danger' ? c.danger : c.onTile;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={[{ opacity: disabled ? 0.5 : 1, alignSelf: 'flex-start' }, style]}
    >
      {({ pressed }) => (
        <View style={{ transform: pressed ? [{ translateX: 2 }, { translateY: 2 }] : [] }}>
          <Sticker bg={bg} radius={14} offset={pressed ? 1 : 3}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingHorizontal: small ? 12 : 18,
                paddingVertical: small ? 6 : 11,
                minHeight: small ? 34 : 44,
              }}
            >
              {loading ? <ActivityIndicator color={color} /> : icon ? <Ionicons name={icon} size={small ? 16 : 20} color={color} /> : null}
              <Text style={{ color, fontFamily: fonts.bodyBold, fontSize: small ? 13 : 15 }}>{title}</Text>
            </View>
          </Sticker>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[
        {
          borderWidth: 2,
          borderColor: c.edge,
          borderRadius: 999,
          paddingHorizontal: 13,
          paddingVertical: 6,
          backgroundColor: selected ? c.lime : c.surface,
        },
        style,
      ]}
    >
      <Text style={{ color: selected ? c.onTile : c.ink, fontFamily: selected ? fonts.bodyBold : fonts.bodyMedium, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/* ---------- form field ---------- */
export function Field({
  label,
  hint,
  style,
  ...input
}: TextInputProps & { label: string; hint?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ gap: 5 }, style]}>
      <Text style={{ color: c.muted, fontFamily: fonts.bodyBold, fontSize: 12 }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        {...input}
        style={{
          borderWidth: 2,
          borderColor: c.edge,
          borderRadius: 12,
          backgroundColor: c.bg,
          color: c.ink,
          fontFamily: fonts.body,
          fontSize: 15,
          paddingHorizontal: 12,
          paddingVertical: Platform.OS === 'ios' ? 11 : 8,
          minHeight: input.multiline ? 80 : undefined,
          textAlignVertical: input.multiline ? 'top' : 'center',
        }}
      />
      {hint ? <T v="small" muted>{hint}</T> : null}
    </View>
  );
}

/* ---------- small pieces ---------- */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.pink,
        borderColor: c.edge,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.onTile, fontFamily: fonts.display, fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

export function IdBadge() {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: c.sky,
        borderColor: c.edge,
        borderWidth: 2,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 1,
      }}
    >
      <Ionicons name="shield-checkmark" size={13} color={c.onTile} />
      <Text style={{ color: c.onTile, fontFamily: fonts.bodyBold, fontSize: 11 }}>ID checked</Text>
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Sticker radius={22} offset={5} style={style} innerStyle={{ padding: 16, gap: 12 }}>
      {children}
    </Sticker>
  );
}

/* ---------- screen wrapper ---------- */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: 16, paddingBottom: 40, gap: 16 }, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/* ---------- bottom sheet ---------- */
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,6,20,0.6)' }}
        />
        <View
          style={{
            backgroundColor: c.surface,
            borderColor: c.edge,
            borderWidth: 2.5,
            borderBottomWidth: 0,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            maxHeight: '90%',
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 34, gap: 12 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const { c } = useTheme();
  if (!children) return null;
  return <Text style={{ color: c.danger, fontFamily: fonts.bodyMedium, fontSize: 14 }}>{children}</Text>;
}
