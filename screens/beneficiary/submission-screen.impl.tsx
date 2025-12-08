import React, { useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '@/components/atoms/app-button';
import { AppIcon, type IconName } from '@/components/atoms/app-icon';
import { AppText } from '@/components/atoms/app-text';
import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const { width } = Dimensions.get('window');

type UploadKey = 'asset' | 'machinery' | 'documents';

type UploadState = Partial<Record<UploadKey, { uri: string; name: string; type?: string }>>;

const uploadRows: Array<{ key: UploadKey; title: string; icon: IconName }> = [
  { key: 'asset', title: 'Asset', icon: 'cube-outline' },
  { key: 'machinery', title: 'Invoice / Bills', icon: 'receipt-text-outline' },
  { key: 'documents', title: 'Documents', icon: 'file-document-outline' },
];

export type SubmissionScreenProps = {
  navigation: { goBack: () => void };
};

export const SubmissionScreen = ({ navigation }: SubmissionScreenProps) => {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [uploads, setUploads] = useState<UploadState>({});
  const gradientColors = useMemo<readonly [string, string]>(
    () => (theme.mode === 'dark' ? [theme.colors.gradientStart, theme.colors.gradientEnd] : ['#A7F3D0', '#6EE7B7']),
    [theme]
  );

  const handleUploadPress = (key: UploadKey) => {
    Alert.alert('Upload', 'Choose a source', [
      { text: 'Camera', onPress: () => openPicker(key, 'camera') },
      { text: 'Files', onPress: () => openPicker(key, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openPicker = async (key: UploadKey, source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to continue.');
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.6 });

    if (result.canceled || !result.assets?.length) return;

    const file = result.assets[0];
    const name = file.fileName || file.uri.split('/').pop() || 'Selected file';

    setUploads((prev) => ({
      ...prev,
      [key]: {
        uri: file.uri,
        name,
        type: file.mimeType || file.type,
      },
    }));
  };

  const renderPreview = (key: UploadKey) => {
    const file = uploads[key];
    if (!file) {
      return <AppText variant="labelSmall" color="muted">No file uploaded yet</AppText>;
    }

    const isImage = (file.type || '').includes('image');

    return (
      <View style={styles.previewRow}>
        {isImage ? (
          <Image source={{ uri: file.uri }} style={styles.previewImage} resizeMode="cover" />
        ) : (
          <View style={styles.previewPlaceholder}>
            <AppIcon name="file-outline" size={18} color={theme.colors.secondary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <AppText variant="bodySmall" color="text" numberOfLines={1}>
            {file.name}
          </AppText>
          <AppText variant="labelSmall" color="muted">
            Ready to submit
          </AppText>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <LinearGradient colors={gradientColors} style={styles.gradientHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
        <View style={styles.waveContainer}>
          <Svg height="100" width={width} viewBox="0 0 1440 320" style={styles.wave}>
            <Path
              fill={theme.colors.background}
              d="M0,160L48,176C96,192,192,224,288,224C384,224,480,192,576,176C672,160,768,160,864,176C960,192,1056,224,1152,229.3C1248,235,1344,213,1392,202.7L1440,192L1440,320L0,320Z"
            />
          </Svg>
        </View>
      </View>

      <SafeAreaView edges={["top"]} style={styles.floatingHeader}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.onPrimary} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>Submission</AppText>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <View style={styles.headingRow}>
            <AppIcon name="cloud-upload-outline" size={22} color={theme.colors.secondary} style={styles.headingIcon} />
            <AppText variant="titleMedium" color="text" style={styles.headingText}>Upload Evidence</AppText>
          </View>
          <AppText variant="bodyMedium" color="muted">
            Pick a source and add proof for each category below.
          </AppText>
        </View>

        {uploadRows.map((row) => (
          <View key={row.key} style={[styles.uploadCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.iconBadge}>
              <AppIcon name={row.icon} size={22} color={theme.colors.secondary} />
            </View>

            <View style={styles.cardBody}>
              <AppText variant="titleSmall" color="text">{row.title}</AppText>
              <AppText variant="labelSmall" color="muted">Upload required evidence</AppText>
              <View style={{ marginTop: 8 }}>{renderPreview(row.key)}</View>
            </View>

            <AppButton
              label="Upload"
              tone="secondary"
              onPress={() => handleUploadPress(row.key)}
              style={styles.uploadButton}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 200,
      zIndex: 0,
      overflow: 'hidden',
    },
    gradientHeader: {
      flex: 1,
      paddingBottom: 40,
    },
    waveContainer: {
      position: 'absolute',
      bottom: -1,
      left: 0,
      right: 0,
      zIndex: 1,
    },
    wave: {
      width: '100%',
    },
    floatingHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
    },
    headerContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.onPrimary,
    },
    backButton: {
      padding: 8,
    },
    scrollContent: {
      paddingTop: 160,
      paddingHorizontal: 24,
      paddingBottom: 40,
      gap: 18,
    },
    sectionHeader: {
      gap: 6,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headingIcon: {
      textShadowColor: 'rgba(0,0,0,0.08)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    headingText: {
      fontWeight: '700',
      letterSpacing: 0.3,
      textDecorationLine: 'none',
      textDecorationColor: 'transparent',
      textDecorationStyle: 'solid',
      textShadowColor: 'rgba(0,0,0,0.08)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    uploadCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 20,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.mode === 'dark' ? 0.18 : 0.06,
      shadowRadius: 6,
      elevation: theme.mode === 'dark' ? 1 : 3,
      gap: 12,
    },
    iconBadge: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardBody: {
      flex: 1,
      gap: 2,
    },
    uploadButton: {
      minWidth: 108,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    previewImage: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
    },
    previewPlaceholder: {
      width: 46,
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
  });
