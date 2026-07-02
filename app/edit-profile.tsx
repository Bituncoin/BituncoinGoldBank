import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile } from '@/services/authService';
import { uploadAvatar } from '@/services/profileStorageService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGButton } from '@/components';

const AVATAR_OPTIONS = [
  '🥇', '₿', '🦁', '🐉', '⚡', '🌍', '🔥', '💎', '🚀', '🎯',
  '🏆', '🌟', '👑', '🦊', '🐺', '🦅', '🌙', '⚔️', '🛡️', '💰',
];

const COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'South Africa', 'Ethiopia', 'Tanzania',
  'Uganda', 'Rwanda', 'Cameroon', 'Senegal', 'Ivory Coast', 'Egypt',
  'Morocco', 'Tunisia', 'Zimbabwe', 'Zambia', 'Botswana', 'Namibia',
  'Angola', 'Mozambique', 'United States', 'United Kingdom', 'Canada',
  'Germany', 'France', 'Netherlands', 'China', 'India', 'Other',
];

function isPhotoUrl(v?: string) {
  return !!v && v.startsWith('http');
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user, updateUser, refreshUser } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [country, setCountry] = useState(user?.country ?? 'Ghana');
  const [avatar, setAvatar] = useState(user?.avatar_url ?? '🥇');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Local preview URI for newly picked photo (before save)
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [pendingPhotoBase64, setPendingPhotoBase64] = useState<string | null>(null);

  const isDirty =
    fullName !== (user?.full_name ?? '') ||
    username !== (user?.username ?? '') ||
    country !== (user?.country ?? 'Ghana') ||
    avatar !== (user?.avatar_url ?? '🥇') ||
    localPhotoUri !== null;

  // ── Pick photo from camera roll ───────────────────────────────────────────
  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission Required', 'Please allow access to your photo library in Settings to upload a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setLocalPhotoUri(asset.uri);
      setPendingPhotoBase64(asset.base64 ?? null);
      setAvatar('');
      setShowAvatarPicker(false);
    }
  };

  // ── Take a photo with the camera ──────────────────────────────────────────
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Camera Permission Required', 'Please allow camera access in Settings to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setLocalPhotoUri(asset.uri);
      setPendingPhotoBase64(asset.base64 ?? null);
      setAvatar('');
      setShowAvatarPicker(false);
    }
  };

  // ── Show photo source picker ──────────────────────────────────────────────
  const handlePhotoSourcePrompt = () => {
    showAlert('Add Profile Photo', 'Choose how to add your photo', [
      { text: 'Take Selfie', onPress: handleTakePhoto },
      { text: 'Choose from Library', onPress: handlePickPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Remove photo (revert to emoji) ────────────────────────────────────────
  const handleRemovePhoto = () => {
    showAlert('Remove Photo', 'Remove your profile photo and use an emoji avatar instead?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          setLocalPhotoUri(null);
          setPendingPhotoBase64(null);
          setAvatar('🥇');
        },
      },
    ]);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user?.id) return;

    const trimmedName = fullName.trim();
    const trimmedUsername = username.trim();

    if (!trimmedName) { showAlert('Name Required', 'Please enter your full name.'); return; }
    if (trimmedUsername && trimmedUsername.length < 3) {
      showAlert('Username Too Short', 'Username must be at least 3 characters.'); return;
    }
    if (trimmedUsername && !/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      showAlert('Invalid Username', 'Username can only contain letters, numbers, and underscores.'); return;
    }

    setSaving(true);

    let finalAvatarUrl = avatar;

    // Upload new photo if one was selected
    if (pendingPhotoBase64 && localPhotoUri) {
      setUploadingPhoto(true);
      const { url, error: uploadError } = await uploadAvatar(user.id, pendingPhotoBase64);
      setUploadingPhoto(false);

      if (uploadError || !url) {
        setSaving(false);
        showAlert('Photo Upload Failed', uploadError ?? 'Could not upload your photo. Please try again.');
        return;
      }
      finalAvatarUrl = url;
    }

    const updates: Record<string, string> = {
      full_name: trimmedName,
      country,
      avatar_url: finalAvatarUrl,
    };
    if (trimmedUsername) updates.username = trimmedUsername;

    const { error } = await updateProfile(user.id, updates);
    setSaving(false);

    if (error) {
      showAlert('Update Failed', error);
      return;
    }

    updateUser({
      full_name: trimmedName,
      username: trimmedUsername || user.username,
      country,
      avatar_url: finalAvatarUrl,
    });
    await refreshUser();

    setLocalPhotoUri(null);
    setPendingPhotoBase64(null);

    showAlert('Profile Updated', 'Your profile has been saved successfully.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const handleBack = () => {
    if (isDirty) {
      showAlert('Unsaved Changes', 'You have unsaved changes. Discard them?', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  // Determine what to show in the avatar circle preview
  const hasLocalPhoto = !!localPhotoUri;
  const hasStoredPhoto = isPhotoUrl(avatar);
  const showPhoto = hasLocalPhoto || hasStoredPhoto;
  const photoSource = hasLocalPhoto
    ? { uri: localPhotoUri! }
    : hasStoredPhoto
      ? { uri: avatar }
      : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
          {isDirty ? (
            <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.saveHeaderText}>Save</Text>
              }
            </TouchableOpacity>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Avatar / Photo Section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              {/* Photo or Emoji circle */}
              <TouchableOpacity
                style={styles.avatarCircle}
                onPress={() => {
                  if (showPhoto) {
                    showAlert('Change Photo', 'What would you like to do?', [
                      { text: 'Take Selfie', onPress: handleTakePhoto },
                      { text: 'Choose from Library', onPress: handlePickPhoto },
                      { text: 'Remove Photo', style: 'destructive', onPress: handleRemovePhoto },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  } else {
                    setShowAvatarPicker(!showAvatarPicker);
                  }
                }}
                activeOpacity={0.85}
              >
                {showPhoto && photoSource ? (
                  <Image
                    source={photoSource}
                    style={styles.avatarImage}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Text style={styles.avatarEmoji}>{avatar || '🥇'}</Text>
                )}
                <View style={styles.avatarEditBadge}>
                  <MaterialIcons name="edit" size={12} color={Colors.bg} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Photo action buttons */}
            <View style={styles.photoButtonRow}>
              <TouchableOpacity
                style={styles.uploadPhotoBtn}
                onPress={handleTakePhoto}
                activeOpacity={0.8}
                disabled={uploadingPhoto}
              >
                <MaterialIcons name="camera-alt" size={16} color={Colors.primary} />
                <Text style={styles.uploadPhotoBtnText}>Take Selfie</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.uploadPhotoBtn}
                onPress={showPhoto ? handlePhotoSourcePrompt : handlePickPhoto}
                activeOpacity={0.8}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <MaterialIcons name="photo-library" size={16} color={Colors.primary} />
                }
                <Text style={styles.uploadPhotoBtnText}>
                  {showPhoto ? 'Change' : 'Gallery'}
                </Text>
              </TouchableOpacity>
            </View>

            {showPhoto && (
              <TouchableOpacity onPress={handleRemovePhoto}>
                <Text style={styles.removePhotoLink}>Remove photo</Text>
              </TouchableOpacity>
            )}

            {!showPhoto && (
              <Text style={styles.avatarHint}>Tap circle or choose an emoji below</Text>
            )}
          </View>

          {/* Avatar Picker (emoji, only shown when no photo) */}
          {!showPhoto && (
            <TouchableOpacity
              style={styles.emojiPickerToggle}
              onPress={() => setShowAvatarPicker(!showAvatarPicker)}
            >
              <MaterialIcons name="tag-faces" size={16} color={Colors.primary} />
              <Text style={styles.emojiPickerToggleText}>
                {showAvatarPicker ? 'Hide Emoji Picker' : 'Choose Emoji Avatar'}
              </Text>
              <MaterialIcons
                name={showAvatarPicker ? 'expand-less' : 'expand-more'}
                size={18}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          )}

          {showAvatarPicker && !showPhoto && (
            <View style={styles.avatarPickerCard}>
              <Text style={styles.pickerTitle}>Choose Avatar</Text>
              <View style={styles.avatarGrid}>
                {AVATAR_OPTIONS.map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.avatarOption, avatar === emoji && styles.avatarOptionSelected]}
                    onPress={() => { setAvatar(emoji); setShowAvatarPicker(false); }}
                  >
                    <Text style={styles.avatarOptionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Form Fields */}
          <View style={styles.formSection}>
            <Text style={styles.sectionLabel}>PERSONAL INFO</Text>
            <View style={styles.fieldCard}>

              {/* Full Name */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldIcon}>
                  <MaterialIcons name="person" size={18} color={Colors.primary} />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Full Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Your full name"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldDivider} />

              {/* Username */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldIcon}>
                  <MaterialIcons name="alternate-email" size={18} color={Colors.primary} />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Username</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={username}
                    onChangeText={text => setUsername(text.toLowerCase().replace(/\s/g, ''))}
                    placeholder="your_username"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>
              </View>

              <View style={styles.fieldDivider} />

              {/* Country */}
              <TouchableOpacity
                style={styles.fieldRow}
                onPress={() => setShowCountryPicker(!showCountryPicker)}
                activeOpacity={0.7}
              >
                <View style={styles.fieldIcon}>
                  <MaterialIcons name="public" size={18} color={Colors.primary} />
                </View>
                <View style={[styles.fieldContent, { flexDirection: 'row', alignItems: 'center' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Country</Text>
                    <Text style={styles.fieldValue}>{country}</Text>
                  </View>
                  <MaterialIcons
                    name={showCountryPicker ? 'expand-less' : 'expand-more'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

            </View>
          </View>

          {/* Country Picker */}
          {showCountryPicker && (
            <View style={styles.countryPickerCard}>
              <Text style={styles.pickerTitle}>Select Country</Text>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {COUNTRIES.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.countryOption, country === c && styles.countryOptionSelected]}
                    onPress={() => { setCountry(c); setShowCountryPicker(false); }}
                  >
                    <Text style={[styles.countryOptionText, country === c && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                      {c}
                    </Text>
                    {country === c && <MaterialIcons name="check" size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Read-only Info */}
          <View style={styles.formSection}>
            <Text style={styles.sectionLabel}>ACCOUNT INFO</Text>
            <View style={styles.fieldCard}>
              <View style={styles.fieldRow}>
                <View style={styles.fieldIcon}>
                  <MaterialIcons name="email" size={18} color={Colors.textMuted} />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <Text style={[styles.fieldValue, { color: Colors.textMuted }]}>{user?.email}</Text>
                </View>
                <View style={styles.lockedBadge}>
                  <MaterialIcons name="lock" size={12} color={Colors.textMuted} />
                </View>
              </View>
              <View style={styles.fieldDivider} />
              <View style={styles.fieldRow}>
                <View style={styles.fieldIcon}>
                  <MaterialIcons name="stars" size={18} color={Colors.textMuted} />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>Membership Tier</Text>
                  <Text style={[styles.fieldValue, { color: Colors.primary }]}>{user?.tier ?? 'Bronze'}</Text>
                </View>
                <View style={styles.lockedBadge}>
                  <MaterialIcons name="lock" size={12} color={Colors.textMuted} />
                </View>
              </View>
              <View style={styles.fieldDivider} />
              <View style={styles.fieldRow}>
                <View style={styles.fieldIcon}>
                  <MaterialIcons name="verified-user" size={18} color={Colors.textMuted} />
                </View>
                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>KYC Status</Text>
                  <Text style={[styles.fieldValue, {
                    color: user?.kyc_status === 'verified' ? Colors.success :
                      user?.kyc_status === 'pending' ? Colors.warning : Colors.textMuted
                  }]}>
                    {(user?.kyc_status ?? 'pending').charAt(0).toUpperCase() + (user?.kyc_status ?? 'pending').slice(1)}
                  </Text>
                </View>
                <View style={styles.lockedBadge}>
                  <MaterialIcons name="lock" size={12} color={Colors.textMuted} />
                </View>
              </View>
            </View>
          </View>

          {/* Info note */}
          <View style={styles.infoNote}>
            <MaterialIcons name="info-outline" size={14} color={Colors.info} />
            <Text style={styles.infoNoteText}>
              Email and tier cannot be changed here. To update your email, contact BTNG support.
            </Text>
          </View>

          <BTNGButton
            title={saving ? (uploadingPhoto ? 'Uploading photo...' : 'Saving...') : 'Save Changes'}
            onPress={handleSave}
            variant="primary"
            size="lg"
            fullWidth
            loading={saving}
          />

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  saveHeaderBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.lg,
    backgroundColor: Colors.primary, minWidth: 48, alignItems: 'center',
  },
  saveHeaderText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  content: { paddingHorizontal: Spacing.xl, paddingBottom: 32, gap: Spacing.lg },

  // Avatar
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  avatarWrapper: { position: 'relative' },
  avatarCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.bgCard,
    borderWidth: 3, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarEmoji: { fontSize: 44 },
  avatarEditBadge: {
    position: 'absolute', bottom: 4, right: 4, width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.bg,
  },
  photoButtonRow: {
    flexDirection: 'row', gap: Spacing.sm,
  },
  uploadPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.bgCard, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderWidth: 1, borderColor: Colors.primary + '66',
  },
  uploadPhotoBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  removePhotoLink: { fontSize: FontSize.xs, color: Colors.error, textDecorationLine: 'underline', includeFontPadding: false },
  avatarHint: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Emoji picker toggle
  emojiPickerToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, alignSelf: 'stretch',
  },
  emojiPickerToggleText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },

  // Avatar picker
  avatarPickerCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md,
  },
  pickerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  avatarOption: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.bgElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  avatarOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  avatarOptionEmoji: { fontSize: 24 },

  // Form
  formSection: { gap: Spacing.sm },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  fieldCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 60 },
  fieldIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.bgElevated,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
  },
  fieldContent: { flex: 1, gap: 2 },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  fieldInput: {
    fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium,
    paddingVertical: 2, includeFontPadding: false,
  },
  fieldValue: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false },
  fieldDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 52 + Spacing.md },
  lockedBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.bgElevated,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },

  // Country picker
  countryPickerCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.sm,
  },
  countryOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 4, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  countryOptionSelected: { backgroundColor: Colors.primaryGlow },
  countryOptionText: { fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },

  // Info note
  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
});
