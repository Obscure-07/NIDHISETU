import { useRoute, type RouteProp } from '@react-navigation/native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from '../../components/react-native-maps-shim';

import { AppButton } from '@/components/atoms/app-button';
import { AppIcon } from '@/components/atoms/app-icon';
import { AppText } from '@/components/atoms/app-text';
import { Chip } from '@/components/atoms/chip';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { BeneficiaryDrawerParamList } from '@/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { HeroSurface, InfoRow, Pill, SectionCard, useBeneficiaryPalette } from './ui-kit';

export type UploadEvidenceScreenProps = NativeStackScreenProps<BeneficiaryDrawerParamList, 'UploadEvidence'>;

type PillTone = 'default' | 'amber' | 'sky' | 'violet' | 'success' | 'warning' | 'danger';

type UploadRoute = RouteProp<BeneficiaryDrawerParamList, 'UploadEvidence'>;

export const UploadEvidenceScreen = () => {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready to capture');
  const cameraRef = useRef<CameraView>(null);
  const theme = useAppTheme();
  const palette = useBeneficiaryPalette();
  const route = useRoute<UploadRoute>();
  const requirementName = route.params?.requirementName ?? 'Evidence capture';
  const requirementId = route.params?.requirementId ?? 'Requirement';

  useEffect(() => {
    if (!cameraPermission?.granted) {
      requestCameraPermission();
    }
    if (!microphonePermission?.granted) {
      requestMicrophonePermission();
    }
  }, [cameraPermission, requestCameraPermission, microphonePermission, requestMicrophonePermission]);

  useEffect(() => {
    if (!locationPermission?.granted) {
      requestLocationPermission();
      return;
    }

    const fetchLocation = async () => {
      const current = await Location.getCurrentPositionAsync({});
      setLocation(current);
    };

    fetchLocation();
  }, [locationPermission, requestLocationPermission]);

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) return;
    setStatusMessage('Capturing photo…');
    await cameraRef.current.takePictureAsync();
    setStatusMessage('Saved offline. Sync pending.');
  };

  const handleCaptureVideo = async () => {
    if (!cameraRef.current) return;
    setStatusMessage('Recording video…');
    await cameraRef.current.recordAsync({ maxDuration: 10 });
    setStatusMessage('Video saved locally');
  };

  const cameraReady = Boolean(cameraPermission?.granted && microphonePermission?.granted);
  const gpsTone: PillTone = location ? 'success' : 'warning';
  const gpsLabel = location ? `GPS ${location.coords.latitude.toFixed(2)}°` : 'Fetching GPS…';

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}
      accessibilityLabel="Upload evidence"
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HeroSurface>
          <View style={styles.heroHeader}>
            <View>
              <Text style={[styles.eyebrow, { color: palette.subtext }]}>Evidence capture</Text>
              <Text style={[styles.heroTitle, { color: palette.text }]}>{requirementName}</Text>
              <Text style={[styles.heroSubtitle, { color: palette.subtext }]}>Farmer Motion tracker</Text>
            </View>
          </View>
          <Text style={[styles.heroHint, { color: palette.text }]}>
            Keep the pump-set centered and include land markers for AI verification.
          </Text>
          <View style={styles.heroPills}>
            <Pill label={statusMessage} tone="sky" />
            <Pill label={gpsLabel} tone={gpsTone} />
          </View>
          <View style={styles.heroMetrics}>
            <HeroMetric label="Requirement" value={requirementId} palette={palette} />
            <HeroMetric label="Camera" value={cameraReady ? 'Ready' : 'Grant access'} palette={palette} />
            <HeroMetric label="Audio" value={microphonePermission?.granted ? 'On' : 'Mic needed'} palette={palette} />
          </View>
        </HeroSurface>

        <SectionCard
          title="Capture feed"
          subtitle="Live camera with geo overlay"
          accentLabel={cameraReady ? 'Live' : 'Setup'}
        >
          <View style={[styles.cameraWrapper, { backgroundColor: palette.surface }]}
            accessibilityLabel="Camera preview"
          >
            {cameraPermission?.granted ? (
              <>
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} />
                <View style={[styles.cameraOverlay, { padding: 16 }]}>
                  <Chip label={statusMessage} tone="secondary" />
                  <Chip
                    label={location ? 'GPS locked' : 'Fetching GPS…'}
                    tone={gpsTone}
                    leftIcon={<AppIcon name="crosshairs-gps" color={location ? 'success' : 'warning'} />}
                    onPress={() => setShowMap(true)}
                  />
                </View>
              </>
            ) : (
              <View style={styles.permissionView}>
                <AppText variant="bodyMedium" color="text">
                  Camera & microphone permissions required
                </AppText>
                <AppButton label="Grant camera" onPress={requestCameraPermission} />
                <AppButton label="Grant microphone" variant="secondary" onPress={requestMicrophonePermission} />
              </View>
            )}
          </View>
          <View style={styles.actionRow}>
            <AppButton label="Capture photo" icon="camera" onPress={handleCapturePhoto} />
            <AppButton label="Record clip" icon="video" variant="secondary" onPress={handleCaptureVideo} />
          </View>
        </SectionCard>

        <SectionCard
          title="Geo proof"
          subtitle="Latitude, longitude, accuracy"
          accentLabel={location ? 'Locked' : 'Pending'}
          footer={<AppButton label="Preview map" variant="ghost" onPress={() => setShowMap(true)} />}
        >
          <View style={styles.infoGrid}>
            <InfoRow label="Latitude" value={location ? location.coords.latitude.toFixed(4) : '—'} />
            <InfoRow label="Longitude" value={location ? location.coords.longitude.toFixed(4) : '—'} />
            <InfoRow label="Accuracy" value={location?.coords.accuracy ? `${Math.round(location.coords.accuracy)} m` : '—'} />
          </View>
        </SectionCard>

        <SectionCard title="Offline queue" subtitle="Sync-safe storage" accentLabel="Auto">
          <AppText variant="bodySmall" color="muted">
            Evidence files are saved locally with timestamps. They will sync once network stabilizes.
          </AppText>
          <AppButton label="View pending uploads" variant="outline" icon="cloud-off-outline" />
        </SectionCard>
      </ScrollView>

      <Modal visible={showMap} transparent animationType="fade">
        <View style={[styles.modalBackdrop, { backgroundColor: palette.background + 'E6' }]}
          accessibilityLabel="Map preview"
        >
          <View style={[styles.modalContent, { backgroundColor: palette.surface, borderColor: palette.border }]}
            accessible
          >
            {location ? (
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker coordinate={location.coords} />
              </MapView>
            ) : (
              <AppText variant="bodyMedium" color="text">
                Fetching location…
              </AppText>
            )}
            <AppButton label="Close" onPress={() => setShowMap(false)} style={{ marginTop: theme.spacing.sm }} />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 18,
  },
  cameraWrapper: {
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraOverlay: {
    gap: 12,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  permissionView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
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
  heroHint: {
    fontSize: 14,
    lineHeight: 20,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  map: {
    height: 240,
    borderRadius: 12,
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
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '600',
  },
});

const HeroMetric = ({ label, value, palette }: { label: string; value: string; palette: ReturnType<typeof useBeneficiaryPalette> }) => (
  <View style={[styles.metricCard, { borderColor: palette.border, backgroundColor: palette.mutedSurface }]}
    accessibilityLabel={label}
  >
    <Text style={[styles.metricLabel, { color: palette.subtext }]}>{label}</Text>
    <Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text>
  </View>
);
