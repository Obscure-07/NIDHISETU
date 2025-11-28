import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { AppButton } from '@/components/atoms/app-button';
import { AppText } from '@/components/atoms/app-text';
import { app, db } from '@/lib/firebase';
import { useAuthStore } from '@/state/authStore';

import { HeroSurface, InfoRow, Pill, SectionCard, useBeneficiaryPalette } from './ui-kit';

const storage = getStorage(app);

type BeneficiaryPalette = ReturnType<typeof useBeneficiaryPalette>;

const tips = [
  {
    title: 'Lock GPS before capture',
    body: 'Wait for the GPS pill to turn green so the watermark stores accurate coordinates.',
  },
  {
    title: 'Use landscape mode',
    body: 'Hold the phone sideways to capture more of the asset and nearby markers.',
  },
  {
    title: 'Keep hands steady',
    body: 'Rest elbows on a support to reduce blur and pass AI clarity checks.',
  },
];

const HeroMetric = ({ label, value, palette }: { label: string; value: string; palette: BeneficiaryPalette }) => (
  <View style={[styles.metricCard, { borderColor: palette.border, backgroundColor: palette.mutedSurface }]} accessibilityLabel={label}>
    <Text style={[styles.metricLabel, { color: palette.subtext }]}>{label}</Text>
    <Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text>
  </View>
);

export interface LoanEvidenceCameraScreenProps {
  loanId?: string;
  onUploadComplete?: (payload: { imageURL: string; documentId: string }) => void;
}

export const LoanEvidenceCameraScreen = ({ loanId, onUploadComplete }: LoanEvidenceCameraScreenProps) => {
  const palette = useBeneficiaryPalette();
  const cameraRef = useRef<CameraView | null>(null);
  const containerRef = useRef<View | null>(null);
  const userId = useAuthStore((state) => state.profile?.id ?? 'anonymous');

  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean>();
  const [photoUri, setPhotoUri] = useState<string>();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    void (async () => {
      if (!permission) {
        await requestPermission();
      }
      if (!mediaPermission) {
        await requestMediaPermission();
      }
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locationStatus.status === 'granted');
    })();
  }, [mediaPermission, permission, requestMediaPermission, requestPermission]);

  const ensureLocation = async () => {
    if (!hasLocationPermission) {
      const status = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(status.status === 'granted');
      if (status.status !== 'granted') {
        Alert.alert('Location needed', 'Grant location access to embed GPS on the photo.');
        return;
      }
    }

    const position = await Location.getCurrentPositionAsync({});
    setLocation(position);
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: true });
      if (result?.uri) {
        setPhotoUri(result.uri);
        await ensureLocation();
      }
    } catch (error) {
      console.error('Unable to capture photo', error);
      Alert.alert('Camera error', 'Unable to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRetake = () => {
    setPhotoUri(undefined);
  };

  const uploadToStorage = async (uri: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const filename = `loan-evidence/${userId ?? 'anonymous'}/${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    return getDownloadURL(storageRef);
  };

  const saveMetadata = (imageURL: string) => {
    if (!location) {
      throw new Error('Missing location metadata');
    }
    const payload = {
      imageURL,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: serverTimestamp(),
      capturedAt: new Date(location.timestamp ?? Date.now()).toISOString(),
      userId: userId ?? null,
      loanId: loanId ?? null,
    };

    return addDoc(collection(db, 'loanEvidence'), payload);
  };

  const handleConfirm = async () => {
    if (!photoUri) {
      return;
    }

    if (!location) {
      await ensureLocation();
      if (!location) {
        return;
      }
    }

    setIsUploading(true);
    try {
      const finalUri = await captureRef(containerRef, {
        format: 'jpg',
        quality: 0.9,
        result: 'tmpfile',
      });

      if (mediaPermission?.granted) {
        await MediaLibrary.saveToLibraryAsync(finalUri);
      }

      const remoteUrl = await uploadToStorage(finalUri);
      const docRef = await saveMetadata(remoteUrl);
      onUploadComplete?.({ imageURL: remoteUrl, documentId: docRef.id });
      Alert.alert('Saved & Uploaded', 'Evidence photo saved to gallery and uploaded successfully.');
      setPhotoUri(undefined);
    } catch (error) {
      console.error('Upload failed', error);
      Alert.alert('Upload failed', 'Could not upload the evidence. Please retry.');
    } finally {
      setIsUploading(false);
    }
  };

  const watermarkLines = useMemo(() => {
    if (!location) {
      return [];
    }

    const capturedAt = new Date(location.timestamp ?? Date.now());
    const datetime = `${capturedAt.getDate().toString().padStart(2, '0')}-${(capturedAt.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${capturedAt.getFullYear()} ${capturedAt
      .getHours()
      .toString()
      .padStart(2, '0')}:${capturedAt.getMinutes().toString().padStart(2, '0')}`;

    return [
      `Lat: ${location.coords.latitude.toFixed(5)}`,
      `Lon: ${location.coords.longitude.toFixed(5)}`,
      `Time: ${datetime}`,
      loanId ? `Loan: ${loanId}` : undefined,
      userId ? `User: ${userId}` : undefined,
    ].filter(Boolean) as string[];
  }, [loanId, location, userId]);

  const heroMetrics = useMemo(
    () => [
      { label: 'Loan', value: loanId ?? 'Not linked' },
      { label: 'Mode', value: photoUri ? 'Preview' : 'Live' },
      { label: 'GPS', value: location ? `${location.coords.latitude.toFixed(2)}°` : 'Pending' },
    ],
    [loanId, location, photoUri]
  );

  const gpsStatus = useMemo(() => {
    if (location) {
      return `${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`;
    }
    if (hasLocationPermission === false) {
      return 'Location permission required';
    }
    return 'Fetching GPS lock…';
  }, [hasLocationPermission, location]);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: palette.background }]} edges={['top']}>
        <HeroSurface>
          <Text style={[styles.eyebrow, { color: palette.subtext }]}>Loan evidence</Text>
          <Text style={[styles.heroTitle, { color: palette.text }]}>Camera access needed</Text>
          <Text style={[styles.heroSubtitle, { color: palette.subtext }]}>Grant permission to capture AI-ready proofs.</Text>
          <AppButton label="Grant permission" onPress={requestPermission} />
        </HeroSurface>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <HeroSurface>
          <View style={styles.heroHeader}>
            <View>
              <Text style={[styles.eyebrow, { color: palette.subtext }]}>Loan evidence camera</Text>
              <Text style={[styles.heroTitle, { color: palette.text }]}>Farmer Motion capture</Text>
              <Text style={[styles.heroSubtitle, { color: palette.subtext }]}>AI-ready geo verification</Text>
            </View>
          </View>
          <View style={styles.heroPills}>
            <Pill label={photoUri ? 'Preview ready' : isCapturing ? 'Capturing…' : 'Camera live'} tone="sky" />
            <Pill label={hasLocationPermission === false ? 'GPS blocked' : location ? 'GPS locked' : 'Locking GPS'} tone={location ? 'success' : 'warning'} />
          </View>
          <View style={styles.heroMetrics} accessibilityRole="summary">
            {heroMetrics.map((metric) => (
              <HeroMetric key={metric.label} label={metric.label} value={metric.value} palette={palette} />
            ))}
          </View>
          <InfoRow label="Current GPS" value={gpsStatus} />
        </HeroSurface>

        <View
          style={[styles.captureShell, { backgroundColor: palette.surface }]}
          accessibilityLabel={photoUri ? 'Preview with watermark' : 'Live camera view'}
        >
          {!photoUri ? (
            <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="back" mode="picture">
              <View style={styles.cameraOverlay} pointerEvents="box-none">
                <TouchableOpacity
                  style={[styles.captureButton, { borderColor: palette.text }]}
                  onPress={handleCapture}
                  disabled={isCapturing}
                >
                  <View style={[styles.captureInner, { backgroundColor: palette.accent }]} />
                </TouchableOpacity>
              </View>
            </CameraView>
          ) : (
            <View style={styles.previewWrapper} ref={containerRef} collapsable={false}>
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} />
              <View style={styles.watermarkOverlay} pointerEvents="none">
                <View style={[styles.watermark, { backgroundColor: `${palette.background}CC` }]} accessibilityLabel="Watermark overlay">
                  {watermarkLines.map((line) => (
                    <AppText key={line} variant="labelSmall" color="surface">
                      {line}
                    </AppText>
                  ))}
                </View>
              </View>
              <View style={styles.previewActions}>
                <AppButton label="Retake" icon="camera" variant="outline" onPress={handleRetake} disabled={isUploading} />
                <AppButton label={isUploading ? 'Uploading…' : 'Confirm'} icon="check" onPress={handleConfirm} disabled={isUploading} />
              </View>
            </View>
          )}
        </View>

        <SectionCard title="Capture guidance" subtitle="Best practices for AI review" accentLabel="Tips">
          <AppText variant="bodySmall" color="muted">
            Keep the pump-set centered with horizon visible. Capture between 8 AM – 4 PM for best light. Once captured, confirm to embed the watermark and upload.
          </AppText>
          <View style={styles.tipList}>
            {tips.map((tip) => (
              <View key={tip.title} style={[styles.tipCard, { borderColor: palette.border }]} accessibilityLabel={tip.title}>
                <Text style={[styles.tipTitle, { color: palette.text }]}>{tip.title}</Text>
                <Text style={[styles.tipBody, { color: palette.subtext }]}>{tip.body}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title="Geo telemetry" subtitle="Live metadata" accentLabel="Auto">
          <InfoRow label="Coordinates" value={gpsStatus} />
          <InfoRow label="Loan" value={loanId ?? 'Not linked'} />
          <InfoRow label="User" value={userId ?? 'anonymous'} />
          <AppButton label="Refresh location" icon="crosshairs-gps" variant="outline" onPress={() => void ensureLocation()} />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 56,
    paddingTop: 24,
    gap: 18,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: 12,
  },
  captureShell: {
    borderRadius: 28,
    overflow: 'hidden',
    height: 420,
    position: 'relative',
  },
  cameraOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 32,
  },
  captureButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  previewWrapper: {
    flex: 1,
  },
  previewActions: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 12,
  },
  watermarkOverlay: {
    position: 'absolute',
    bottom: 90,
    left: 18,
  },
  watermark: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  tipList: {
    gap: 10,
  },
  tipCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  tipBody: {
    fontSize: 13,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '600',
  },
});
