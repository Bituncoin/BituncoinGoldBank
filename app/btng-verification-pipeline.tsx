import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { useVerificationPipeline } from '@/hooks/useVerificationPipeline';
import {
  DocumentType,
  DOC_TYPE_META,
  VerificationInput,
  VerificationStageStatus,
} from '@/services/verificationPipelineService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

type Screen = 'home' | 'run' | 'history';

const COUNTRY_OPTIONS = [
  'Ghana', 'Nigeria', 'Kenya', 'South Africa', 'Egypt',
  'Ethiopia', 'Tanzania', 'Uganda', 'Ivory Coast', 'Senegal',
  'Cameroon', 'Zimbabwe', 'Zambia', 'Mozambique', 'Rwanda',
  'United States', 'United Kingdom', 'Canada', 'Germany', 'France',
];

const STAGE_COLORS: Record<VerificationStageStatus, string> = {
  idle:    Colors.textMuted,
  running: '#3B82F6',
  done:    '#22C55E',
  failed:  '#EF4444',
  skipped: Colors.textMuted,
};

const TRUST_COLOR = (score: number) =>
  score >= 80 ? '#22C55E' : score >= 65 ? '#F59E0B' : '#EF4444';

const KYC_STATUS_COLOR: Record<string, string> = {
  verified:     '#22C55E',
  approved:     '#22C55E',
  under_review: '#F59E0B',
  pending:      Colors.textMuted,
  rejected:     '#EF4444',
};

export default function BtngVerificationPipeline() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const {
    stages, running, complete, failed, currentStageIndex,
    receipt, error, doc, hashResult, oracle, kyc, cert, equityResult,
    verificationHistory, verificationCerts, kycStatus, dataLoading,
    executePipeline, reset, reload,
  } = useVerificationPipeline();

  const [screen, setScreen] = useState<Screen>('home');

  // Form state
  const [docType, setDocType] = useState<DocumentType>('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [ownerName, setOwnerName] = useState(user?.full_name ?? '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [country, setCountry] = useState('Ghana');
  const [assetValue, setAssetValue] = useState('');
  const [activateEquity, setActivateEquity] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const handleExecute = useCallback(async () => {
    if (!idNumber.trim()) { showAlert('Missing ID', 'Enter your document ID number.'); return; }
    if (!ownerName.trim()) { showAlert('Missing Name', 'Enter the document owner name.'); return; }
    const input: VerificationInput = {
      docType,
      idNumber,
      ownerName,
      dateOfBirth,
      country,
      assetValue: activateEquity ? (parseFloat(assetValue) || 0) : 0,
      activateEquity,
    };
    setScreen('run');
    await executePipeline(input);
  }, [docType, idNumber, ownerName, dateOfBirth, country, assetValue, activateEquity, executePipeline, showAlert]);

  // ── Home Screen ────────────────────────────────────────────────────────
  const renderHome = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Hero */}
      <View style={styles.heroCard}>
        <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.heroCoin} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Verification Pipeline</Text>
          <Text style={styles.heroSub}>Sovereign Identity Kernel · btngd v1.0 · 7-Stage Execution</Text>
        </View>
        <View style={[styles.liveBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
          <View style={styles.liveDot} />
          <Text style={[styles.liveBadgeText, { color: '#22C55E' }]}>LIVE</Text>
        </View>
      </View>

      {/* Pipeline strip */}
      <View style={styles.stagesStrip}>
        {stages.map((s, i) => (
          <View key={s.id} style={styles.stripStage}>
            <View style={[styles.stripDot, { backgroundColor: STAGE_COLORS[s.status] }]} />
            {i < stages.length - 1 && <View style={styles.stripLine} />}
          </View>
        ))}
      </View>
      <Text style={styles.stripLabel}>7-Stage Verification Pipeline · Idle</Text>

      {/* KYC + Stats Row */}
      <View style={styles.statsRow}>
        <StatCard icon="verified-user" label="KYC Status"
          value={kycStatus.status.replace(/_/g, ' ').toUpperCase()}
          color={KYC_STATUS_COLOR[kycStatus.status] ?? Colors.textMuted} />
        <StatCard icon="grade" label="KYC Level" value={`Level ${kycStatus.level}`} color="#3B82F6" />
        <StatCard icon="workspace-premium" label="Certs" value={verificationCerts.length.toString()} color="#D4A017" />
      </View>

      {/* Flow stages overview */}
      <View style={[styles.sectionWrap, { marginBottom: Spacing.sm }]}>
        <Text style={styles.sectionLabel}>PIPELINE STAGES</Text>
        {[
          { n: 1, label: 'Document Upload',        desc: 'Capture ID · Passport · License', icon: 'upload-file',    color: '#3B82F6' },
          { n: 2, label: 'Hash Fingerprinting',    desc: 'BTNG-HASH-256 tamper-proof hash', icon: 'fingerprint',    color: '#9945FF' },
          { n: 3, label: 'Oracle Cross-Check',     desc: 'Identity confidence · Trust score', icon: 'public',       color: '#F59E0B' },
          { n: 4, label: 'KYC Status Update',      desc: 'Write to kyc_submissions DB',      icon: 'how-to-reg',   color: '#22C55E' },
          { n: 5, label: 'Certificate Issuance',   desc: 'Mint Verification Certificate NFT', icon: 'workspace-premium', color: '#D4A017' },
          { n: 6, label: 'Equity Pool Activation', desc: 'Activate equity in btng_equity_pool', icon: 'account-balance', color: '#EF4444' },
          { n: 7, label: 'Autopilot Sync',         desc: 'Sync state · Pre-load next params',  icon: 'smart-toy',  color: '#3B82F6' },
        ].map((s, i) => (
          <View key={s.n} style={styles.overviewStage}>
            <View style={[styles.overviewNum, { backgroundColor: s.color + '18', borderColor: s.color + '44' }]}>
              <Text style={[styles.overviewNumText, { color: s.color }]}>{s.n}</Text>
            </View>
            {i < 6 && <View style={[styles.overviewConnector, { backgroundColor: Colors.border }]} />}
            <View style={[styles.overviewIcon, { backgroundColor: s.color + '12', borderColor: s.color + '33' }]}>
              <MaterialIcons name={s.icon as any} size={16} color={s.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.overviewLabel}>{s.label}</Text>
              <Text style={styles.overviewDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Document Type Selector */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>DOCUMENT TYPE</Text>
        <View style={styles.docTypeGrid}>
          {(Object.entries(DOC_TYPE_META) as [DocumentType, typeof DOC_TYPE_META[DocumentType]][]).map(([type, meta]) => (
            <TouchableOpacity
              key={type}
              style={[styles.docTypeCard, docType === type && { borderColor: meta.color, backgroundColor: meta.color + '10' }]}
              onPress={() => setDocType(type)}
              activeOpacity={0.85}
            >
              <MaterialIcons name={meta.icon as any} size={20} color={docType === type ? meta.color : Colors.textMuted} />
              <Text style={[styles.docTypeLabel, docType === type && { color: meta.color }]} numberOfLines={2}>{meta.label}</Text>
              <View style={[styles.docTypeKycBadge, { backgroundColor: meta.color + '18', borderColor: meta.color + '33' }]}>
                <Text style={[styles.docTypeKycText, { color: meta.color }]}>L{meta.kycLevel}</Text>
              </View>
              {docType === type && (
                <View style={[styles.docTypeCheck, { backgroundColor: meta.color }]}>
                  <MaterialIcons name="check" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Input Form */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>DOCUMENT DETAILS</Text>

        <Text style={styles.inputLabel}>Document ID Number *</Text>
        <TextInput
          style={styles.input}
          value={idNumber}
          onChangeText={setIdNumber}
          placeholder="e.g. GHA-1234567890 or P12345678"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
        />

        <Text style={[styles.inputLabel, { marginTop: 10 }]}>Owner Full Name *</Text>
        <TextInput
          style={styles.input}
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="As shown on document"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="words"
        />

        <Text style={[styles.inputLabel, { marginTop: 10 }]}>Date of Birth</Text>
        <TextInput
          style={styles.input}
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={[styles.inputLabel, { marginTop: 10 }]}>Country</Text>
        <TouchableOpacity
          style={[styles.input, styles.inputPicker]}
          onPress={() => setShowCountryPicker(!showCountryPicker)}
          activeOpacity={0.85}
        >
          <Text style={[styles.inputPickerText, { color: country ? Colors.textPrimary : Colors.textMuted }]}>{country || 'Select country'}</Text>
          <MaterialIcons name={showCountryPicker ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
        </TouchableOpacity>
        {showCountryPicker && (
          <View style={styles.countryDropdown}>
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {COUNTRY_OPTIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.countryOption, country === c && styles.countryOptionActive]}
                  onPress={() => { setCountry(c); setShowCountryPicker(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.countryOptionText, country === c && { color: Colors.primary }]}>{c}</Text>
                  {country === c && <MaterialIcons name="check" size={14} color={Colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Equity Activation */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>EQUITY POOL ACTIVATION</Text>
        <View style={styles.equityToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.equityToggleLabel}>Activate Equity on Verification</Text>
            <Text style={styles.equityToggleDesc}>Adds verified asset to btng_equity_pool for minting</Text>
          </View>
          <Switch
            value={activateEquity}
            onValueChange={setActivateEquity}
            trackColor={{ false: Colors.bgElevated, true: Colors.primary }}
            thumbColor="#fff"
          />
        </View>
        {activateEquity && (
          <>
            <Text style={[styles.inputLabel, { marginTop: 8 }]}>Asset Value (BTNGG)</Text>
            <TextInput
              style={styles.input}
              value={assetValue}
              onChangeText={setAssetValue}
              placeholder="e.g. 5000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            {assetValue && parseFloat(assetValue) > 0 && (
              <View style={styles.previewBox}>
                <PreviewRow label="Base Value" value={`${parseFloat(assetValue).toLocaleString()} BTNGG`} />
                <PreviewRow label="Adj. Value (~5% haircut)" value={`${(parseFloat(assetValue) * 0.95).toLocaleString(undefined, { maximumFractionDigits: 2 })} BTNGG`} color={Colors.primary} />
                <PreviewRow label="LTV Available @ 70%" value={`~${(parseFloat(assetValue) * 0.95 * 0.70).toLocaleString(undefined, { maximumFractionDigits: 2 })} BTNGG`} color="#22C55E" />
              </View>
            )}
          </>
        )}
      </View>

      {/* Info box */}
      <View style={[styles.sectionWrap, { marginBottom: Spacing.md }]}>
        <View style={styles.infoBox}>
          <MaterialIcons name="info-outline" size={14} color="#3B82F6" />
          <Text style={[styles.infoText, { color: '#3B82F6' }]}>
            The Verification Pipeline runs 7 stages: Document → Hash → Oracle → KYC → Certificate NFT → Equity Pool → Autopilot Sync. All data is stored on the BTNG sovereign ledger.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.runBtn, running && styles.runBtnDisabled]}
          onPress={handleExecute}
          disabled={running}
          activeOpacity={0.85}
        >
          <MaterialIcons name="verified-user" size={20} color="#fff" />
          <Text style={styles.runBtnText}>Execute Verification Pipeline</Text>
        </TouchableOpacity>
      </View>

      {/* Active Certs */}
      {verificationCerts.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>VERIFICATION CERTIFICATES</Text>
          {verificationCerts.slice(0, 3).map((c: any) => (
            <CertMiniCard key={c.id} cert={c} />
          ))}
        </View>
      )}

      {/* History preview */}
      {verificationHistory.length > 0 && (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>RECENT VERIFICATIONS</Text>
            <TouchableOpacity onPress={() => setScreen('history')}>
              <Text style={styles.seeAllText}>View All →</Text>
            </TouchableOpacity>
          </View>
          {verificationHistory.slice(0, 2).map((r: any) => (
            <HistoryCard key={r.id} record={r} />
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );

  // ── Pipeline Run Screen ────────────────────────────────────────────────
  const renderRun = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Status header */}
      <View style={[styles.runStatusCard, {
        borderColor: complete ? '#22C55E55' : failed ? '#EF444455' : '#3B82F655',
        backgroundColor: complete ? '#22C55E0A' : failed ? '#EF44440A' : '#3B82F60A',
      }]}>
        <View style={styles.runStatusIcon}>
          {running && <ActivityIndicator size={32} color="#3B82F6" />}
          {complete && <MaterialIcons name="verified-user" size={44} color="#22C55E" />}
          {failed && <MaterialIcons name="gpp-bad" size={44} color="#EF4444" />}
          {!running && !complete && !failed && <MaterialIcons name="shield" size={44} color={Colors.textMuted} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.runStatusTitle, {
            color: complete ? '#22C55E' : failed ? '#EF4444' : running ? '#3B82F6' : Colors.textMuted
          }]}>
            {running ? 'Pipeline Executing…' : complete ? 'Verification Complete!' : failed ? 'Verification Failed' : 'Ready'}
          </Text>
          <Text style={styles.runStatusSub}>
            {running ? `Stage ${currentStageIndex + 1}/7 · btngd executing`
              : complete ? `Trust ${receipt?.trustScore}/100 · KYC ${receipt?.kycStatus} · Certificate issued`
              : failed ? (error ?? 'Unknown error')
              : 'Awaiting execution'}
          </Text>
        </View>
      </View>

      {/* Stage trace */}
      <Text style={[styles.sectionLabel, { paddingHorizontal: Spacing.xl }]}>EXECUTION TRACE</Text>
      {stages.map((stage, idx) => (
        <PipelineStageRow key={stage.id} stage={stage} index={idx} isCurrently={currentStageIndex === idx && running} />
      ))}

      {/* Intermediate data panel */}
      {(doc || hashResult || oracle) && (
        <View style={[styles.sectionWrap, { marginTop: 12 }]}>
          <Text style={styles.sectionLabel}>KERNEL DATA</Text>
          <View style={styles.kernelDataCard}>
            {doc && (
              <>
                <KernelRow label="Doc Type" value={DOC_TYPE_META[doc.docType].label} />
                <KernelRow label="ID Number" value={doc.idNumber} mono />
                <KernelRow label="Owner" value={doc.ownerName} />
                <KernelRow label="Country" value={doc.country} />
              </>
            )}
            {hashResult && (
              <>
                <KernelRow label="Algorithm" value={hashResult.algorithm} color={Colors.primary} />
                <KernelRow label="Fingerprint" value={hashResult.fingerprint.slice(0, 24) + '…'} mono />
                <KernelRow label="Input Hash" value={hashResult.inputHash} mono />
              </>
            )}
            {oracle && (
              <>
                <KernelRow label="Trust Score" value={`${oracle.trustScore}/100`} color={TRUST_COLOR(oracle.trustScore)} />
                <KernelRow label="Confidence" value={`${oracle.identityConfidence}%`} />
                <KernelRow label="Region" value={oracle.region} color="#22C55E" />
                <KernelRow label="Oracle ID" value={oracle.oracleId} mono />
                <KernelRow
                  label="Flags"
                  value={oracle.flags.length > 0 ? oracle.flags.join(', ') : 'None'}
                  color={oracle.flags.length > 0 ? '#F59E0B' : '#22C55E'}
                />
              </>
            )}
            {kyc && (
              <>
                <KernelRow label="KYC Status" value={kyc.status.toUpperCase()} color={KYC_STATUS_COLOR[kyc.status] ?? Colors.textMuted} />
                <KernelRow label="KYC Level" value={`Level ${kyc.kycLevel}`} color="#3B82F6" />
                {kyc.submissionId && <KernelRow label="Submission" value={kyc.submissionId.slice(0, 16) + '…'} mono />}
              </>
            )}
            {cert && (
              <>
                <KernelRow label="Cert NFT ID" value={cert.certNftId} mono />
                <KernelRow label="Grade" value={cert.equityGrade} color="#D4A017" />
                <KernelRow label="Asset Value" value={`${cert.assetValue.toLocaleString()} BTNGG`} color={Colors.primary} />
                <KernelRow label="Expires" value={cert.expiresAt} />
              </>
            )}
            {equityResult && equityResult.activated && (
              <>
                <KernelRow label="Equity ID" value={equityResult.equityId} mono />
                <KernelRow label="Adj. Value" value={`${equityResult.adjustedValue.toLocaleString()} BTNGG`} color={Colors.primary} />
                <KernelRow label="Risk Tier" value={equityResult.riskTier} color={equityResult.riskTier === 'LOW' ? '#22C55E' : '#F59E0B'} />
                <KernelRow label="LTV Available" value={`${equityResult.ltvAvailable.toLocaleString()} BTNGG`} color="#22C55E" />
              </>
            )}
          </View>
        </View>
      )}

      {/* Verification Receipt */}
      {receipt && complete && (
        <View style={[styles.sectionWrap, { marginTop: 4 }]}>
          <Text style={styles.sectionLabel}>VERIFICATION RECEIPT</Text>
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.receiptCoin} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptTitle}>VerificationReceipt · {receipt.verificationId}</Text>
                <Text style={styles.receiptSub}>BTNG Identity Kernel · Sovereign Verification v1.0</Text>
              </View>
              <View style={[styles.liveBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveBadgeText, { color: '#22C55E' }]}>VERIFIED</Text>
              </View>
            </View>

            <View style={styles.trustMeter}>
              <View style={styles.trustMeterBar}>
                <View style={[styles.trustMeterFill, {
                  width: `${receipt.trustScore}%` as any,
                  backgroundColor: TRUST_COLOR(receipt.trustScore),
                }]} />
              </View>
              <Text style={[styles.trustMeterLabel, { color: TRUST_COLOR(receipt.trustScore) }]}>
                Trust Score: {receipt.trustScore}/100
              </Text>
            </View>

            <View style={styles.receiptRows}>
              <ReceiptRow label="Owner" value={receipt.ownerName} />
              <ReceiptRow label="Document" value={DOC_TYPE_META[receipt.docType].label} />
              <ReceiptRow label="Fingerprint" value={receipt.fingerprint.slice(0, 20) + '…'} mono />
              <ReceiptRow label="KYC Status" value={receipt.kycStatus.toUpperCase()} color={KYC_STATUS_COLOR[receipt.kycStatus] ?? Colors.textMuted} />
              <ReceiptRow label="KYC Level" value={`Level ${receipt.kycLevel}`} color="#3B82F6" />
              <ReceiptRow label="Certificate NFT" value={receipt.certNftId ?? '-'} mono color="#D4A017" />
              {receipt.equityActivated && (
                <>
                  <ReceiptRow label="Equity ID" value={receipt.equityId ?? '-'} mono />
                  <ReceiptRow label="Equity Value" value={`${receipt.equityValue.toLocaleString()} BTNGG`} color={Colors.primary} large />
                </>
              )}
              <ReceiptRow label="Region" value={receipt.region} />
              <ReceiptRow label="Timestamp" value={new Date(receipt.timestamp).toLocaleString()} />
            </View>

            {/* Autopilot */}
            <View style={styles.autopilotDivider}>
              <Text style={styles.autopilotLabel}>🤖 AUTOPILOT PREDICTION</Text>
            </View>
            <View style={styles.receiptRows}>
              <ReceiptRow label="Next Verification" value={receipt.autopilot.nextVerificationDue} color={Colors.primary} />
              <ReceiptRow label="Document Expiry" value={receipt.autopilot.documentExpiry} />
              <ReceiptRow label="Trust Trend" value={receipt.autopilot.trustTrend.toUpperCase()}
                color={receipt.autopilot.trustTrend === 'improving' ? '#22C55E' : receipt.autopilot.trustTrend === 'stable' ? Colors.primary : '#EF4444'} />
              <ReceiptRow label="Recommended Action" value={receipt.autopilot.nextRecommendedAction} />
            </View>

            <View style={styles.receiptFooter}>
              <MaterialIcons name="verified" size={13} color="#22C55E" />
              <Text style={styles.receiptFooterText}>
                This VerificationReceipt is cryptographically fingerprinted by the BTNG Sovereign Identity Kernel and stored on-ledger.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => { reset(); setScreen('home'); }} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>New Verification</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.runBtn, { flex: 1 }]} onPress={() => setScreen('history')} activeOpacity={0.85}>
              <Text style={styles.runBtnText}>View History</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Error actions */}
      {failed && (
        <View style={[styles.sectionWrap, { marginTop: 8 }]}>
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
          <TouchableOpacity
            style={[styles.runBtn, { backgroundColor: '#EF4444', marginTop: 10 }]}
            onPress={() => { reset(); setScreen('home'); }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="refresh" size={18} color="#fff" />
            <Text style={styles.runBtnText}>Retry Pipeline</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ── History Screen ─────────────────────────────────────────────────────
  const renderHistory = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Verification History</Text>
        <Text style={styles.stepSub}>All identity verification events · Sovereign ledger</Text>
      </View>
      {verificationHistory.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialIcons name="verified-user" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No verifications yet</Text>
          <Text style={styles.emptySubText}>Run the verification pipeline to register your identity</Text>
        </View>
      ) : (
        verificationHistory.map((r: any) => <HistoryCard key={r.id} record={r} expanded />)
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );

  const getScreenTitle = () => {
    switch (screen) {
      case 'run': return 'Pipeline Execution';
      case 'history': return 'Verification History';
      default: return 'Verification Pipeline';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => screen !== 'home' ? setScreen('home') : router.back()}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{getScreenTitle()}</Text>
          <Text style={styles.headerSub}>BituncoinOS · btngd · Sovereign Identity Kernel</Text>
        </View>
        {screen === 'home' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setScreen('history')}>
              <MaterialIcons name="history" size={18} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={reload}>
              <MaterialIcons name="refresh" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tab nav */}
      {screen === 'home' && (
        <View style={styles.tabRow}>
          {([
            { id: 'home',    label: '🔐 Verify'  },
            { id: 'history', label: '📋 History'  },
          ] as const).map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tab, screen === t.id && styles.tabActive]}
              onPress={() => setScreen(t.id as Screen)}
            >
              <Text style={[styles.tabText, screen === t.id && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {dataLoading && screen === 'home' ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading verification data...</Text>
        </View>
      ) : (
        <>
          {screen === 'home' && renderHome()}
          {screen === 'run' && renderRun()}
          {screen === 'history' && renderHistory()}
        </>
      )}
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PipelineStageRow({ stage, index, isCurrently }: { stage: any; index: number; isCurrently: boolean }) {
  const statusColor = STAGE_COLORS[stage.status as VerificationStageStatus];
  const isDone = stage.status === 'done';
  const isFailed = stage.status === 'failed';
  const isRunning = stage.status === 'running';
  const isSkipped = stage.status === 'skipped';

  return (
    <View style={[pss.row, isFailed && pss.rowFailed, isDone && pss.rowDone, isRunning && pss.rowRunning]}>
      <View style={pss.left}>
        <View style={[pss.numWrap, { borderColor: statusColor + '55', backgroundColor: statusColor + '18' }]}>
          {isRunning ? (
            <ActivityIndicator size="small" color={statusColor} />
          ) : isDone ? (
            <MaterialIcons name="check" size={14} color={statusColor} />
          ) : isFailed ? (
            <MaterialIcons name="close" size={14} color={statusColor} />
          ) : isSkipped ? (
            <MaterialIcons name="skip-next" size={14} color={statusColor} />
          ) : (
            <Text style={[pss.numText, { color: statusColor }]}>{index + 1}</Text>
          )}
        </View>
        {index < 6 && <View style={[pss.connector, { backgroundColor: isDone ? '#22C55E44' : Colors.border }]} />}
      </View>
      <View style={pss.body}>
        <View style={pss.titleRow}>
          <Text style={[pss.stageName, {
            color: isDone ? '#22C55E' : isFailed ? '#EF4444' : isRunning ? '#3B82F6' : isSkipped ? Colors.textMuted : Colors.textSecondary
          }]}>{stage.label}</Text>
          {stage.duration !== undefined && <Text style={pss.duration}>{stage.duration}ms</Text>}
          {isRunning && (
            <View style={pss.activePill}>
              <Text style={pss.activePillText}>ACTIVE</Text>
            </View>
          )}
          {isSkipped && (
            <View style={[pss.activePill, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
              <Text style={[pss.activePillText, { color: Colors.textMuted }]}>SKIPPED</Text>
            </View>
          )}
        </View>
        <Text style={pss.stageDesc} numberOfLines={isRunning || isDone ? 2 : 1}>{stage.desc}</Text>
        {stage.result && <Text style={pss.stageResult} numberOfLines={2}>{stage.result}</Text>}
        {stage.error && <Text style={pss.stageError}>{stage.error}</Text>}
      </View>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={[scStyles.card, { borderColor: color + '33' }]}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={[scStyles.value, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={scStyles.label}>{label}</Text>
    </View>
  );
}

function CertMiniCard({ cert }: { cert: any }) {
  const color = '#D4A017';
  return (
    <View style={cmStyles.card}>
      <View style={[cmStyles.icon, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name="workspace-premium" size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cmStyles.id} numberOfLines={1}>{cert.cert_id}</Text>
        <Text style={cmStyles.type}>{cert.cert_type?.replace(/_/g, ' ')} · Grade {cert.equity_grade}</Text>
      </View>
      <View style={cmStyles.right}>
        <Text style={cmStyles.value}>{(cert.asset_value ?? 0).toLocaleString()}</Text>
        <Text style={cmStyles.valueSub}>BTNGG</Text>
        <View style={[cmStyles.badge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#22C55E' }} />
          <Text style={[cmStyles.badgeText, { color: '#22C55E' }]}>{cert.status?.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

function HistoryCard({ record, expanded = false }: { record: any; expanded?: boolean }) {
  const trustColor = TRUST_COLOR(record.trust_score ?? 0);
  return (
    <View style={hStyles.card}>
      <View style={hStyles.header}>
        <View style={hStyles.iconWrap}>
          <MaterialIcons name="verified-user" size={16} color="#3B82F6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={hStyles.id} numberOfLines={1}>{record.verification_id}</Text>
          <Text style={hStyles.date}>{new Date(record.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <View style={hStyles.trustWrap}>
          <Text style={[hStyles.trust, { color: trustColor }]}>{record.trust_score ?? 0}</Text>
          <Text style={hStyles.trustSub}>Trust</Text>
        </View>
      </View>
      {expanded && (
        <View style={hStyles.details}>
          <HRow label="Doc Type" value={record.doc_type?.replace(/_/g, ' ') ?? '-'} />
          <HRow label="Owner" value={record.owner_name ?? '-'} />
          <HRow label="KYC Status" value={(record.kyc_status ?? '-').toUpperCase()} color={KYC_STATUS_COLOR[record.kyc_status ?? ''] ?? Colors.textMuted} />
          <HRow label="Certificate" value={record.cert_id ?? '-'} mono />
          <HRow label="Equity Activated" value={record.equity_activated ? 'YES' : 'NO'} color={record.equity_activated ? '#22C55E' : Colors.textMuted} />
          {record.equity_activated && <HRow label="Equity Value" value={`${(record.equity_value ?? 0).toLocaleString()} BTNGG`} color={Colors.primary} />}
          <HRow label="Status" value={(record.status ?? '-').toUpperCase()} color="#22C55E" />
        </View>
      )}
    </View>
  );
}

function PreviewRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>{label}</Text>
      <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: color ?? Colors.textPrimary, includeFontPadding: false }}>{value}</Text>
    </View>
  );
}

function KernelRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
      <Text style={{ fontSize: 11, color: Colors.textMuted, includeFontPadding: false, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: FontWeight.semibold, color: color ?? Colors.textSecondary, includeFontPadding: false, flex: 2, textAlign: 'right', fontFamily: mono ? 'monospace' : undefined }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ReceiptRow({ label, value, color, mono, large }: { label: string; value: string; color?: string; mono?: boolean; large?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' }}>
      <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false }}>{label}</Text>
      <Text style={{ fontSize: large ? FontSize.lg : FontSize.sm, fontWeight: large ? FontWeight.heavy : FontWeight.semibold, color: color ?? Colors.textPrimary, includeFontPadding: false, fontFamily: mono ? 'monospace' : undefined, flex: 1, textAlign: 'right' }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function HRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ fontSize: 11, color: Colors.textMuted, includeFontPadding: false }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: FontWeight.semibold, color: color ?? Colors.textSecondary, includeFontPadding: false, fontFamily: mono ? 'monospace' : undefined }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Sub-component StyleSheets ───────────────────────────────────────────────

const pss = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: Spacing.xl, paddingVertical: 6 },
  rowDone: {}, rowFailed: {}, rowRunning: {},
  left: { width: 32, alignItems: 'center' },
  numWrap: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  connector: { width: 2, flex: 1, marginTop: 3, minHeight: 10 },
  body: { flex: 1, paddingLeft: Spacing.md, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stageName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false, flex: 1 },
  duration: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  activePill: { backgroundColor: '#3B82F620', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#3B82F644' },
  activePillText: { fontSize: 8, fontWeight: FontWeight.heavy, color: '#3B82F6', letterSpacing: 0.5, includeFontPadding: false },
  stageDesc: { fontSize: 11, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  stageResult: { fontSize: 11, color: '#22C55E', includeFontPadding: false, marginTop: 3, lineHeight: 15 },
  stageError: { fontSize: 11, color: '#EF4444', includeFontPadding: false, marginTop: 3 },
});

const scStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

const cmStyles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: Spacing.md, marginBottom: 8 },
  icon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  id: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace', includeFontPadding: false },
  type: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 3 },
  value: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  valueSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

const hStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#3B82F618', borderWidth: 1, borderColor: '#3B82F644', alignItems: 'center', justifyContent: 'center' },
  id: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace', includeFontPadding: false },
  date: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  trustWrap: { alignItems: 'flex-end' },
  trust: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  trustSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  details: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.sm, paddingTop: Spacing.sm, gap: 2 },
});

// ── Main StyleSheet ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scrollContent: { paddingTop: Spacing.sm },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.md, color: Colors.textMuted },
  // Hero
  heroCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, marginHorizontal: Spacing.xl, borderWidth: 2, borderColor: '#3B82F655', gap: Spacing.md, alignItems: 'center', marginBottom: Spacing.md, shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  heroCoin: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#3B82F6' },
  heroTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#3B82F6', includeFontPadding: false },
  heroSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 3 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#22C55E' },
  liveBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  // Pipeline strip
  stagesStrip: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: 4 },
  stripStage: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stripDot: { width: 8, height: 8, borderRadius: 4 },
  stripLine: { flex: 1, height: 2, backgroundColor: Colors.border },
  stripLabel: { fontSize: 10, color: Colors.textMuted, marginHorizontal: Spacing.xl, marginBottom: Spacing.md, includeFontPadding: false },
  // Stats
  statsRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.md },
  // Section
  sectionWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  sectionLabel: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, marginBottom: 8, includeFontPadding: false },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  seeAllText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  // Overview stages
  overviewStage: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  overviewNum: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  overviewNumText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  overviewConnector: { position: 'absolute', left: 11, top: 24, width: 2, height: 18 },
  overviewIcon: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 8, flexShrink: 0 },
  overviewLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, marginLeft: 10 },
  overviewDesc: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginLeft: 10, marginTop: 2 },
  // Doc type grid
  docTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  docTypeCard: { width: '31%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: 5 },
  docTypeLabel: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  docTypeKycBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  docTypeKycText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  docTypeCheck: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // Form
  inputLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false, marginBottom: 6 },
  input: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 13, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 2 },
  inputPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  inputPickerText: { fontSize: FontSize.sm, includeFontPadding: false },
  countryDropdown: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginTop: 4, marginBottom: 4 },
  countryOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  countryOptionActive: { backgroundColor: Colors.primaryGlow },
  countryOptionText: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  // Equity toggle
  equityToggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, gap: Spacing.md },
  equityToggleLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  equityToggleDesc: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  previewBox: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 8, marginTop: 4 },
  // Info box
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#3B82F610', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#3B82F633', alignItems: 'flex-start', marginBottom: Spacing.md },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16, includeFontPadding: false },
  // Run button
  runBtn: { flexDirection: 'row', backgroundColor: '#3B82F6', borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
  runBtnDisabled: { opacity: 0.5 },
  runBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  secondaryBtn: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  secondaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  // Run screen
  runStatusCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, borderRadius: Radius.xl, borderWidth: 2, padding: Spacing.lg, gap: Spacing.md },
  runStatusIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  runStatusTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  runStatusSub: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, marginTop: 3 },
  kernelDataCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 2 },
  errorBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#EF444412', borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: '#EF444444' },
  errorText: { flex: 1, fontSize: FontSize.sm, color: '#EF4444', includeFontPadding: false, lineHeight: 18 },
  // Receipt
  receiptCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 2, borderColor: '#3B82F666', padding: Spacing.lg, gap: Spacing.md, shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  receiptCoin: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#3B82F6' },
  receiptTitle: { fontSize: 11, fontWeight: FontWeight.bold, color: '#3B82F6', fontFamily: 'monospace', includeFontPadding: false },
  receiptSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  receiptRows: { gap: 0 },
  autopilotDivider: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  autopilotLabel: { fontSize: 10, fontWeight: FontWeight.heavy, color: '#9945FF', letterSpacing: 0.8, includeFontPadding: false },
  receiptFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#22C55E0A', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#22C55E33' },
  receiptFooterText: { flex: 1, fontSize: 10, color: '#22C55E', lineHeight: 15, includeFontPadding: false },
  // Trust meter
  trustMeter: { gap: 6 },
  trustMeterBar: { height: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, overflow: 'hidden' },
  trustMeterFill: { height: '100%', borderRadius: Radius.full },
  trustMeterLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  // History/empty
  stepHeader: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  stepTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  stepSub: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false, marginTop: 3 },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.xl, gap: 8 },
  emptyText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  emptySubText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});
