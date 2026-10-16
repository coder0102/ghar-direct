import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Button, T } from './ui';
import { api, ApiError } from '@/lib/api';
import { fonts, useTheme } from '@/lib/theme';
import { ROOM_LABEL, type Photo } from '@/lib/types';

type Props = {
  visible: boolean;
  listingId: string;
  room: string;
  onClose: () => void;
  onUploaded: (photo: Photo, count: number) => void;
};

// The only way to add a photo. The camera opens right after the server hands out a one-time code,
// and the photo goes up with the phone's GPS position at that moment. There is no gallery picker on purpose.
export function PhotoCapture({ visible, listingId, room, onClose, onUploaded }: Props) {
  const { c } = useTheme();
  const [camPerm, requestCam] = useCameraPermissions();
  const [nonce, setNonce] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [locDenied, setLocDenied] = useState(false);
  const camera = useRef<CameraView>(null);

  const prepare = useCallback(async () => {
    setError('');
    setNonce(null);
    setReady(false);
    try {
      const loc = await Location.requestForegroundPermissionsAsync();
      if (loc.status !== 'granted') {
        setLocDenied(true);
        return;
      }
      setLocDenied(false);
      const n = await api.photoNonce(listingId);
      setNonce(n.nonce);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not get ready. Try again.');
    }
  }, [listingId]);

  useEffect(() => {
    if (visible && camPerm?.granted) void prepare();
  }, [visible, camPerm?.granted, prepare]);

  async function shoot() {
    if (!nonce || !camera.current || busy) return;
    setBusy(true);
    setError('');
    setStatus('Taking the photo');
    try {
      const capturedAt = Date.now();
      const shot = await camera.current.takePictureAsync({ quality: 0.7 });
      setStatus('Checking where you are');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const form = new FormData();
      form.append('photo', { uri: shot.uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
      form.append('nonce', nonce);
      form.append('lat', String(loc.coords.latitude));
      form.append('lng', String(loc.coords.longitude));
      form.append('room', room);
      form.append('capturedAt', String(capturedAt));
      form.append('mocked', loc.mocked ? 'true' : 'false');
      setStatus('Verifying');
      const r = await api.uploadPhoto(listingId, form);
      onUploaded(r.photo, r.count);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not take the photo. Try again.');
      void prepare(); // the one-time code may be used up, get a fresh one
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        {!camPerm ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : !camPerm.granted ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
            <T v="title" style={{ color: '#fff', textAlign: 'center' }}>Camera needed</T>
            <T style={{ color: '#fff', textAlign: 'center' }}>Photos are taken on the spot so renters can trust them. There is no way to upload from your gallery.</T>
            {camPerm.canAskAgain ? (
              <Button title="Allow camera" kind="primary" onPress={() => void requestCam()} />
            ) : (
              <T style={{ color: '#fff', textAlign: 'center' }}>Turn the camera on for Ghar Direct in your phone settings, then come back.</T>
            )}
            <Button title="Close" onPress={onClose} />
          </View>
        ) : locDenied ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
            <T v="title" style={{ color: '#fff', textAlign: 'center' }}>Location needed</T>
            <T style={{ color: '#fff', textAlign: 'center' }}>We check that you are at the place when you take each photo. Turn location on for Ghar Direct and try again.</T>
            <Button title="Try again" kind="primary" onPress={() => void prepare()} />
            <Button title="Close" onPress={onClose} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView ref={camera} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
            <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: c.butter, borderColor: '#000', borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, transform: [{ rotate: '-2deg' }] }}>
                <Text style={{ color: c.onTile, fontFamily: fonts.hand, fontSize: 24, lineHeight: 30 }}>{ROOM_LABEL[room] || 'Photo'}</Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close camera"
                hitSlop={10}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center', gap: 10, paddingHorizontal: 20 }}>
              {error ? (
                <View style={{ backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: '#FFB4AB', fontFamily: fonts.bodyMedium, fontSize: 14, textAlign: 'center' }}>{error}</Text>
                </View>
              ) : null}
              {status ? <Text style={{ color: '#fff', fontFamily: fonts.bodyMedium }}>{status}…</Text> : null}
              <Pressable
                onPress={() => void shoot()}
                disabled={!ready || !nonce || busy}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 38,
                  borderWidth: 5,
                  borderColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !ready || !nonce || busy ? 0.4 : 1,
                }}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' }} />}
              </Pressable>
              <Text style={{ color: '#fff', fontFamily: fonts.body, fontSize: 12, textAlign: 'center' }}>
                Stand inside the place. Photos are checked against your location.
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
