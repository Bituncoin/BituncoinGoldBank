import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKyc } from '@/hooks/useKyc';
import { IdType } from '@/services/kycService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGButton } from '@/components';

const ID_TYPES: { value: IdType; label: string; icon: string }[] = [
  { value: 'national_id', label: 'National ID Card', icon: 'badge' },
  { value: 'passport', label: 'Passport', icon: 'book' },
  { value: 'drivers_license', label: "Driver's License", icon: 'drive-eta' },
];

const COUNTRIES = ['Ghana', 'Nigeria', 'Kenya', 'South Africa', 'Egypt', 'Ethiopia', 'Tanzania', 'Uganda', 'Other'];

const STATUS_CONFIG = {
  pending: { color: Colors.warning, bg: Colors.warningBg, icon: 'hourglass-top', label: 'Under Review' },
  under_review: { color: Colors.info, bg: Colors.primaryGlow, icon: 'find-in-page', label: 'Under Review' },
  verified: { color: Colors.success, bg: Colors.successBg, icon: 'verified-user', label: 'Verified' },
  rejected: { color: Colors.error, bg: Colors.errorBg, icon: 'cancel', label: 'Rejected' },
};

function UploadSlot({
  label,
  hint,
  icon,
  uri,
  onPick,
  disabled,
}: {
  label: string;
  hint: string;
  icon: string;
  uri: string | null;
  onPick: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.uploadSlot, uri && styles.uploadSlotFilled, disabled && { opacity: 0.5 }]}
      onPress={onPick}
      activeOpacity={0.75}
      disabled={disabled}
    >
      {uri ? (
        <View style={styles.uploadSlotFilled}>
          <View style={styles.uploadedIcon}>
            <MaterialIcons name="check-circle" size={28} color={Colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.uploadedLabel}>{label}</Text>
            <Text style={styles.uploadedHint}>Tap to replace</Text>
          </View>
          <MaterialIcons name="photo" size={20} color={Colors.success} />
        </View>
      ) : (
        <>
          <View style={styles.uploadIconCircle}>
            <MaterialIcons name={icon as any} size={26} color={Colors.primary} />
          </View>
          <Text style={styles.uploadLabel}>{label}</Text>
          <Text style={styles.uploadHint}>{hint}</Text>
          <View style={styles.uploadCTA}>
            <MaterialIcons name="add-a-photo" size={14} color={Colors.bg} />
            <Text style={styles.uploadCTAText}>Choose File</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

export default function KYCScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const { submission, loading, submitting, progress, submit, refresh } = useMyKyc(user?.id);

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('Ghana');
  const [idNumber, setIdNumber] = useState('');
  const [idType, setIdType] = useState<IdType>('national_id');
  const [idFrontUri, setIdFrontUri] = useState<string | null>(null);
  const [idBackUri, setIdBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Pre-fill from user profile
  useEffect(() => {
    if (user?.username) setFullName(user.username);
  }, [user]);

  // Pre-fill from existing submission
  useEffect(() => {
    if (submission) {
      if (submission.full_name) setFullName(submission.full_name);
      if (submission.date_of_birth) setDob(submission.date_of_birth);
      if (submission.country) setCountry(submission.country);
      if (submission.id_number) setIdNumber(submission.id_number);
      if (submission.id_type) setIdType(submission.id_type);
    }
  }, [submission]);

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Required', 'Please allow photo access to upload KYC documents.');
        return false;
      }
    }
    return true;
  };

  const pickImage = async (setter: (uri: string) => void, label: string) => {
    const ok = await requestPermission();
    if (!ok) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: false,
    });

    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      showAlert('Sign In Required', 'Please sign in to submit KYC.');
      return;
    }
    if (!fullName.trim() || !dob.trim() || !idNumber.trim()) {
      showAlert('Missing Fields', 'Please complete all personal information fields.');
      return;
    }
    if (!idFrontUri) {
      showAlert('ID Required', 'Please upload the front of your ID document.');
      return;
    }
    if (!selfieUri) {
      showAlert('Selfie Required', 'Please upload a selfie photo for identity verification.');
      return;
    }

    const { error } = await submit({
      fullName: fullName.trim(),
      dateOfBirth: dob.trim(),
      country,
      idNumber: idNumber.trim(),
      idType,
      idFrontUri,
      idBackUri,
      selfieUri,
    });

    if (error) {
      showAlert('Submission Failed', error);
    } else {
      showAlert(
        'KYC Submitted',
        'Your identity verification has been submitted. Our team will review it within 24-48 hours.',
        [{ text: 'Done', onPress: () => router.back() }]
      );
    }
  };

  const canResubmit = !submission || submission.status === 'rejected';
  const isAlreadySubmitted = submission && (submission.status === 'pending' || submission.status === 'under_review');
  const isVerified = submission?.status === 'verified';

  const stepProgress = [!!fullName && !!dob && !!country && !!idNumber, !!idFrontUri, !!selfieUri];
  const completedSteps = stepProgress.filter(Boolean).length;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading KYC status...</Text>
      </View>
    );
  }

  const statusCfg = submission ? STATUS_CONFIG[submission.status] : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>KYC Verification</Text>
          {submission && (
            <View style={[styles.statusPill, { backgroundColor: statusCfg!.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusCfg!.color }]} />
              <Text style={[styles.statusPillText, { color: statusCfg!.color }]}>
                {statusCfg!.label}
              </Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Verified Banner */}
        {isVerified && (
          <View style={styles.verifiedBanner}>
            <View style={styles.verifiedIconWrap}>
              <MaterialIcons name="verified-user" size={36} color={Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.verifiedTitle}>Identity Verified</Text>
              <Text style={styles.verifiedSub}>Your account is fully verified and eligible for all platform features.</Text>
            </View>
          </View>
        )}

        {/* Rejected Banner */}
        {submission?.status === 'rejected' && (
          <View style={styles.rejectedBanner}>
            <MaterialIcons name="cancel" size={22} color={Colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectedTitle}>Verification Rejected</Text>
              {submission.rejection_reason && (
                <Text style={styles.rejectedReason}>Reason: {submission.rejection_reason}</Text>
              )}
              <Text style={styles.rejectedSub}>Please re-submit with correct documents.</Text>
            </View>
          </View>
        )}

        {/* Under Review Banner */}
        {isAlreadySubmitted && (
          <View style={styles.reviewBanner}>
            <MaterialIcons name="hourglass-top" size={22} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reviewTitle}>
                {submission?.status === 'under_review' ? 'Under Review' : 'Submitted — Awaiting Review'}
              </Text>
              <Text style={styles.reviewSub}>
                Submitted {new Date(submission!.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
                Review takes 24-48 hours.
              </Text>
            </View>
          </View>
        )}

        {/* Benefits Card */}
        <View style={styles.benefitsCard}>
          <Text style={styles.sectionTitle}>Why Verify?</Text>
          {[
            { icon: 'arrow-upward', text: 'Unlimited withdrawals — up to $500K/day' },
            { icon: 'people', text: 'Full P2P trading access' },
            { icon: 'security', text: 'Enhanced account protection' },
            { icon: 'star', text: 'Priority customer support & Silver tier' },
          ].map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <MaterialIcons name={b.icon as any} size={15} color={Colors.success} />
              </View>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {/* Progress Bar */}
        {!isVerified && !isAlreadySubmitted && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Completion Progress</Text>
              <Text style={styles.progressPct}>{Math.round((completedSteps / 3) * 100)}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(completedSteps / 3) * 100}%` }]} />
            </View>
            <View style={styles.progressSteps}>
              {[
                { label: 'Personal Info', done: stepProgress[0] },
                { label: 'ID Document', done: stepProgress[1] },
                { label: 'Selfie', done: stepProgress[2] },
              ].map((s, i) => (
                <View key={i} style={styles.progressStep}>
                  <View style={[styles.progressStepDot, { backgroundColor: s.done ? Colors.success : Colors.bgElevated, borderColor: s.done ? Colors.success : Colors.border }]}>
                    {s.done && <MaterialIcons name="check" size={10} color="#fff" />}
                  </View>
                  <Text style={[styles.progressStepLabel, { color: s.done ? Colors.success : Colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* FORM — only show when can submit */}
        {(canResubmit && !isAlreadySubmitted) && (
          <>
            {/* SECTION 1: Personal Info */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionNum, stepProgress[0] && styles.sectionNumDone]}>
                  {stepProgress[0]
                    ? <MaterialIcons name="check" size={13} color="#fff" />
                    : <Text style={styles.sectionNumText}>1</Text>
                  }
                </View>
                <Text style={styles.sectionTitle}>Personal Information</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Legal Name *</Text>
                <View style={styles.inputRow}>
                  <MaterialIcons name="person-outline" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="As shown on ID document"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Date of Birth *</Text>
                <View style={styles.inputRow}>
                  <MaterialIcons name="cake" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={dob}
                    onChangeText={setDob}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Country *</Text>
                <TouchableOpacity
                  style={styles.inputRow}
                  onPress={() => setShowCountryPicker(v => !v)}
                >
                  <MaterialIcons name="flag" size={18} color={Colors.textMuted} />
                  <Text style={[styles.input, { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, color: Colors.textPrimary }]}>
                    {country}
                  </Text>
                  <MaterialIcons name={showCountryPicker ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
                </TouchableOpacity>
                {showCountryPicker && (
                  <View style={styles.countryDropdown}>
                    {COUNTRIES.map(c => (
                      <TouchableOpacity key={c} style={[styles.countryOption, country === c && styles.countryOptionActive]}
                        onPress={() => { setCountry(c); setShowCountryPicker(false); }}>
                        <Text style={[styles.countryOptionText, country === c && { color: Colors.primary, fontWeight: FontWeight.bold }]}>{c}</Text>
                        {country === c && <MaterialIcons name="check" size={14} color={Colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>ID Number *</Text>
                <View style={styles.inputRow}>
                  <MaterialIcons name="tag" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={idNumber}
                    onChangeText={setIdNumber}
                    placeholder="Document number"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </View>

            {/* SECTION 2: ID Document */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionNum, stepProgress[1] && styles.sectionNumDone]}>
                  {stepProgress[1]
                    ? <MaterialIcons name="check" size={13} color="#fff" />
                    : <Text style={styles.sectionNumText}>2</Text>
                  }
                </View>
                <Text style={styles.sectionTitle}>ID Document</Text>
              </View>

              {/* ID Type Picker */}
              <Text style={[styles.label, { marginBottom: 6 }]}>Document Type</Text>
              <View style={styles.idTypeRow}>
                {ID_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.idTypeBtn, idType === t.value && styles.idTypeBtnActive]}
                    onPress={() => setIdType(t.value)}
                  >
                    <MaterialIcons name={t.icon as any} size={18} color={idType === t.value ? Colors.primary : Colors.textMuted} />
                    <Text style={[styles.idTypeBtnText, idType === t.value && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                      {t.label}
                    </Text>
                    {idType === t.value && <MaterialIcons name="radio-button-checked" size={14} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Upload Slots */}
              <View style={styles.uploadGrid}>
                <UploadSlot
                  label="Front of ID"
                  hint="Clear photo, all corners visible"
                  icon="credit-card"
                  uri={idFrontUri}
                  onPick={() => pickImage(setIdFrontUri, 'ID Front')}
                />
                <UploadSlot
                  label="Back of ID"
                  hint="Required for National ID"
                  icon="flip-to-back"
                  uri={idBackUri}
                  onPick={() => pickImage(setIdBackUri, 'ID Back')}
                />
              </View>

              <View style={styles.uploadNote}>
                <MaterialIcons name="info-outline" size={13} color={Colors.warning} />
                <Text style={styles.uploadNoteText}>
                  Ensure the document is clearly visible, not blurred, and all text is readable. Max 10MB per file.
                </Text>
              </View>
            </View>

            {/* SECTION 3: Selfie */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionNum, stepProgress[2] && styles.sectionNumDone]}>
                  {stepProgress[2]
                    ? <MaterialIcons name="check" size={13} color="#fff" />
                    : <Text style={styles.sectionNumText}>3</Text>
                  }
                </View>
                <Text style={styles.sectionTitle}>Selfie Verification</Text>
              </View>

              <UploadSlot
                label="Selfie Photo"
                hint="Clear face photo in good lighting"
                icon="face"
                uri={selfieUri}
                onPick={() => pickImage(setSelfieUri, 'Selfie')}
              />

              <View style={styles.selfieGuide}>
                {[
                  { ok: true, text: 'Face fully visible, no sunglasses' },
                  { ok: true, text: 'Good lighting, no shadows on face' },
                  { ok: true, text: 'Neutral expression, eyes open' },
                  { ok: false, text: 'No hats, filters, or face coverings' },
                ].map((g, i) => (
                  <View key={i} style={styles.selfieGuideRow}>
                    <MaterialIcons name={g.ok ? 'check-circle' : 'cancel'} size={14} color={g.ok ? Colors.success : Colors.error} />
                    <Text style={styles.selfieGuideText}>{g.text}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Submit */}
            {submitting ? (
              <View style={styles.submittingCard}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.submittingTitle}>Uploading Documents</Text>
                <Text style={styles.submittingProgress}>{progress || 'Please wait...'}</Text>
                <View style={styles.submittingBar}>
                  <View style={styles.submittingFill} />
                </View>
              </View>
            ) : (
              <BTNGButton
                title="Submit KYC Verification"
                onPress={handleSubmit}
                variant="primary"
                size="lg"
                fullWidth
              />
            )}

            <View style={styles.disclaimerCard}>
              <MaterialIcons name="lock" size={14} color={Colors.textMuted} />
              <Text style={styles.disclaimerText}>
                Your documents are encrypted and stored securely. They are only accessible to our compliance team and will never be shared with third parties.
              </Text>
            </View>
          </>
        )}

        {/* Verified benefits full display */}
        {isVerified && (
          <View style={styles.benefitsCard}>
            <Text style={styles.sectionTitle}>Your Verification Details</Text>
            {[
              { label: 'Full Name', value: submission?.full_name ?? 'N/A' },
              { label: 'ID Type', value: ID_TYPES.find(t => t.value === submission?.id_type)?.label ?? 'N/A' },
              { label: 'Country', value: submission?.country ?? 'N/A' },
              { label: 'Reviewed', value: submission?.reviewed_at ? new Date(submission.reviewed_at).toLocaleDateString('en-GB') : 'N/A' },
            ].map(row => (
              <View key={row.label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{row.label}</Text>
                <Text style={styles.detailValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.md, includeFontPadding: false },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false },
  scrollContent: { padding: Spacing.xl, gap: Spacing.lg },

  // Status Banners
  verifiedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.successBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.success + '44' },
  verifiedIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.success + '22', alignItems: 'center', justifyContent: 'center' },
  verifiedTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  verifiedSub: { fontSize: FontSize.xs, color: Colors.success + 'CC', includeFontPadding: false, marginTop: 3, lineHeight: 16 },
  rejectedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.errorBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.error + '44' },
  rejectedTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  rejectedReason: { fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false, marginTop: 3, fontStyle: 'italic' },
  rejectedSub: { fontSize: FontSize.xs, color: Colors.error + 'BB', includeFontPadding: false, marginTop: 3 },
  reviewBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.warningBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.warning + '44' },
  reviewTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  reviewSub: { fontSize: FontSize.xs, color: Colors.warning + 'BB', includeFontPadding: false, marginTop: 3, lineHeight: 16 },

  // Benefits
  benefitsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.successBg, alignItems: 'center', justifyContent: 'center' },
  benefitText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1, includeFontPadding: false },

  // Progress
  progressCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  progressPct: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  progressBar: { height: 8, backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },
  progressSteps: { flexDirection: 'row', justifyContent: 'space-between' },
  progressStep: { alignItems: 'center', gap: 5 },
  progressStepDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  progressStepLabel: { fontSize: 10, includeFontPadding: false },

  // Form sections
  section: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  sectionNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  sectionNumDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  sectionNumText: { fontSize: 12, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  inputGroup: { gap: 6 },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, gap: Spacing.sm, minHeight: 52 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false, paddingVertical: Spacing.sm + 2 },
  countryDropdown: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginTop: -4 },
  countryOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  countryOptionActive: { backgroundColor: Colors.primaryGlow },
  countryOptionText: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },

  // ID Type
  idTypeRow: { gap: Spacing.sm },
  idTypeBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  idTypeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  idTypeBtnText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },

  // Upload
  uploadGrid: { flexDirection: 'row', gap: Spacing.md },
  uploadSlot: { flex: 1, alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  uploadSlotFilled: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  uploadedIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.successBg, alignItems: 'center', justifyContent: 'center' },
  uploadedLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.success, includeFontPadding: false },
  uploadedHint: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  uploadIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  uploadLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  uploadHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  uploadCTA: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  uploadCTAText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  uploadNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  uploadNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 16, includeFontPadding: false },

  // Selfie Guide
  selfieGuide: { gap: 6 },
  selfieGuideRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selfieGuideText: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },

  // Submitting
  submittingCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', gap: Spacing.md },
  submittingTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  submittingProgress: { fontSize: FontSize.sm, color: Colors.primary, includeFontPadding: false },
  submittingBar: { width: '100%', height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  submittingFill: { height: 6, width: '60%', backgroundColor: Colors.primary, borderRadius: 3 },

  // Disclaimer
  disclaimerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  disclaimerText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },

  // Detail rows (verified state)
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  detailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
});
