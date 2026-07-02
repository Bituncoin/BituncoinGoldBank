import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { useProductEngine } from '@/hooks/useProductEngine';
import { LOAN_PRODUCTS, LoanProduct, UserRole } from '@/services/productEngineService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Step constants ─────────────────────────────────────────────────────────
type Step = 'overview' | 'role_select' | 'identity' | 'credits' | 'borrow' | 'loan_review' | 'loan_success' | 'trade_certs' | 'discount';

const ROLE_OPTIONS: { value: UserRole; label: string; icon: string; desc: string; color: string }[] = [
  { value: 'client', label: 'Client', icon: '🏦', desc: 'Borrow with BTNG Gold certificates', color: '#D4A017' },
  { value: 'trader', label: 'Trader', icon: '📊', desc: 'Trade certificates & earn 10% discount', color: Colors.primary },
  { value: 'both', label: 'Both', icon: '🌍', desc: 'Full access — borrow, trade & discount', color: '#22C55E' },
];

export default function BtngProductEngine() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { renewCertId } = useLocalSearchParams<{ renewCertId?: string }>();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const {
    roleRecord, credits, creditHistory, certificates, loans,
    loading, hasIdentity, discountEligible, discountPct, userRole,
    activeCerts, setupRole, applyForLoan, getDiscount, reload,
  } = useProductEngine();

  const [step, setStep] = useState<Step>(renewCertId ? 'borrow' : 'overview');
  const [selectedRole, setSelectedRole] = useState<UserRole>('client');
  const [referralCode, setReferralCode] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [busy, setBusy] = useState(false);

  // Loan form
  const [selectedLoan, setSelectedLoan] = useState<LoanProduct>(LOAN_PRODUCTS[0]);
  const [loanAmount, setLoanAmount] = useState('');
  const [renewalCertId] = useState<string | undefined>(renewCertId ?? undefined);
  const [loanResult, setLoanResult] = useState<any>(null);

  // Discount demo
  const [demoFee, setDemoFee] = useState('100');
  const [discountResult, setDiscountResult] = useState<any>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSetupRole = useCallback(async () => {
    setBusy(true);
    const res = await setupRole(selectedRole, walletAddress, referralCode || undefined);
    setBusy(false);
    if (res.error) {
      showAlert('Setup Failed', res.error);
      return;
    }
    setStep('credits');
  }, [selectedRole, walletAddress, referralCode, setupRole, showAlert]);

  const handleApplyLoan = useCallback(async () => {
    const amount = parseFloat(loanAmount);
    if (!amount || amount < selectedLoan.minAmount || amount > selectedLoan.maxAmount) {
      showAlert('Invalid Amount', `Enter an amount between ${selectedLoan.minAmount} and ${selectedLoan.maxAmount.toLocaleString()} BTNGG`);
      return;
    }
    setBusy(true);
    const res = await applyForLoan(selectedLoan, amount, walletAddress, renewalCertId);
    setBusy(false);
    if (!res.success) {
      showAlert('Loan Failed', res.error ?? 'Could not process loan');
      return;
    }
    setLoanResult(res);
    setStep('loan_success');
  }, [loanAmount, selectedLoan, walletAddress, applyForLoan, showAlert]);

  const handleDiscountCheck = useCallback(async () => {
    const fee = parseFloat(demoFee);
    if (!fee) return;
    setBusy(true);
    const res = await getDiscount(fee);
    setBusy(false);
    setDiscountResult(res);
  }, [demoFee, getDiscount]);

  // ── Step: Overview ─────────────────────────────────────────────────────────
  const renderOverview = () => (
    <View style={styles.stepWrap}>
      {/* Hero */}
      <View style={styles.heroCard}>
        <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.heroCoin} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>BTNG Product Engine</Text>
          <Text style={styles.heroSub}>Automatic Machine · Identity → Credits → Certificates → Discounts</Text>
        </View>
      </View>

      {/* Status pills */}
      <View style={styles.statusRow}>
        <StatusPill icon="fingerprint" label="Identity" active={hasIdentity} color="#3B82F6" />
        <StatusPill icon="stars" label="Credits" active={!!credits && credits.balance > 0} color="#D4A017" value={credits ? `${credits.balance} BTNGPC` : null} />
        <StatusPill icon="workspace-premium" label="Certificate" active={activeCerts.length > 0} color="#22C55E" value={activeCerts.length > 0 ? `${activeCerts.length} Active` : null} />
        <StatusPill icon="local-offer" label="Discount" active={discountEligible} color={Colors.primary} value={discountEligible ? `${discountPct}%` : null} />
      </View>

      {/* Flow steps */}
      <Text style={styles.sectionLabel}>AUTOMATIC FLOW</Text>
      {[
        { step: 1, title: 'Choose Your Role', desc: 'Client · Trader · Both', icon: 'person', color: '#3B82F6', done: !!roleRecord, action: () => setStep('role_select') },
        { step: 2, title: 'Mint Identity NFT', desc: 'Soulbound on-chain identity', icon: 'fingerprint', color: '#9945FF', done: hasIdentity, action: () => setStep(hasIdentity ? 'credits' : 'role_select') },
        { step: 3, title: 'Claim Product Credits', desc: '100 BTNGPC sign-up reward', icon: 'stars', color: '#D4A017', done: !!roleRecord?.signup_credits_claimed, action: () => setStep('credits') },
        { step: 4, title: 'Apply for BTNG Loan', desc: 'Gold-backed · Auto certificate', icon: 'account-balance', color: '#22C55E', done: loans.length > 0, action: () => setStep('borrow') },
        { step: 5, title: 'Trade Certificates', desc: 'Marketplace · NFT receipt', icon: 'swap-horiz', color: Colors.primary, done: false, action: () => setStep('trade_certs') },
        { step: 6, title: 'Trader 10% Discount', desc: 'Auto-applied when cert held', icon: 'local-offer', color: '#EF4444', done: discountEligible, action: () => setStep('discount') },
      ].map(item => (
        <TouchableOpacity key={item.step} style={[styles.flowStep, item.done && styles.flowStepDone]} onPress={item.action} activeOpacity={0.8}>
          <View style={[styles.flowStepNum, { backgroundColor: item.done ? item.color : item.color + '22', borderColor: item.color + '55' }]}>
            {item.done
              ? <MaterialIcons name="check" size={14} color="#fff" />
              : <Text style={[styles.flowStepNumText, { color: item.color }]}>{item.step}</Text>}
          </View>
          <View style={[styles.flowStepIcon, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
            <MaterialIcons name={item.icon as any} size={20} color={item.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.flowStepTitle}>{item.title}</Text>
            <Text style={styles.flowStepDesc}>{item.desc}</Text>
          </View>
          {item.done
            ? <View style={[styles.flowDoneBadge, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}><Text style={[styles.flowDoneBadgeText, { color: item.color }]}>DONE</Text></View>
            : <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />}
        </TouchableOpacity>
      ))}

      {/* Active Certificates */}
      {activeCerts.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ACTIVE CERTIFICATES</Text>
          {activeCerts.map((cert: any) => (
            <View key={cert.id} style={styles.certCard}>
              <View style={styles.certCardLeft}>
                <View style={styles.certIconWrap}>
                  <MaterialIcons name="workspace-premium" size={22} color="#D4A017" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.certTitle}>{cert.cert_id}</Text>
                  <Text style={styles.certSub}>{cert.cert_type.replace(/_/g, ' ')} · Grade {cert.equity_grade}</Text>
                  <Text style={styles.certValue}>Value: {cert.asset_value?.toLocaleString()} BTNGG</Text>
                </View>
              </View>
              <View style={[styles.certBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                <View style={styles.certActiveDot} />
                <Text style={styles.certBadgeText}>ACTIVE</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );

  // ── Step: Role Select ──────────────────────────────────────────────────────
  const renderRoleSelect = () => (
    <View style={styles.stepWrap}>
      <StepHeader step={1} total={3} title="Choose Your Role" desc="How will you use BTNG Gold Coin?" onBack={() => setStep('overview')} />
      {ROLE_OPTIONS.map(opt => (
        <TouchableOpacity key={opt.value} style={[styles.roleCard, selectedRole === opt.value && { borderColor: opt.color, backgroundColor: opt.color + '0D' }]} onPress={() => setSelectedRole(opt.value)} activeOpacity={0.85}>
          <Text style={styles.roleEmoji}>{opt.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.roleLabel, selectedRole === opt.value && { color: opt.color }]}>{opt.label}</Text>
            <Text style={styles.roleDesc}>{opt.desc}</Text>
          </View>
          <View style={[styles.roleCheck, { borderColor: opt.color, backgroundColor: selectedRole === opt.value ? opt.color : 'transparent' }]}>
            {selectedRole === opt.value && <MaterialIcons name="check" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
      ))}

      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>WALLET ADDRESS (OPTIONAL)</Text>
      <TextInput
        style={styles.input}
        placeholder="0x… or leave blank to auto-generate"
        placeholderTextColor={Colors.textMuted}
        value={walletAddress}
        onChangeText={setWalletAddress}
        autoCapitalize="none"
      />

      <Text style={[styles.sectionLabel, { marginTop: 12 }]}>REFERRAL CODE (OPTIONAL)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. BTNG-ABC123 (+50 BTNGPC bonus)"
        placeholderTextColor={Colors.textMuted}
        value={referralCode}
        onChangeText={setReferralCode}
        autoCapitalize="characters"
      />

      <View style={styles.engineInfoBox}>
        <MaterialIcons name="auto-awesome" size={16} color="#D4A017" />
        <Text style={styles.engineInfoText}>Automatic: After selecting your role, the engine will instantly mint your Identity NFT and grant {referralCode ? '150' : '100'} BTNGPC credits.</Text>
      </View>

      <TouchableOpacity style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]} onPress={handleSetupRole} disabled={busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <>
          <MaterialIcons name="rocket-launch" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Activate — Mint Identity + Credits</Text>
        </>}
      </TouchableOpacity>
    </View>
  );

  // ── Step: Credits ──────────────────────────────────────────────────────────
  const renderCredits = () => (
    <View style={styles.stepWrap}>
      <StepHeader step={2} total={3} title="Product Credits" desc="Your BTNG spendable credits" onBack={() => setStep('overview')} />

      <View style={styles.creditsHero}>
        <Text style={styles.creditsBalance}>{credits?.balance?.toLocaleString() ?? 0}</Text>
        <Text style={styles.creditsLabel}>BTNGPC Balance</Text>
        <View style={styles.creditsStatsRow}>
          <View style={styles.creditsStat}>
            <Text style={styles.creditsStatVal}>{credits?.total_earned?.toLocaleString() ?? 0}</Text>
            <Text style={styles.creditsStatLbl}>Total Earned</Text>
          </View>
          <View style={styles.creditsStatDiv} />
          <View style={styles.creditsStat}>
            <Text style={styles.creditsStatVal}>{credits?.total_spent?.toLocaleString() ?? 0}</Text>
            <Text style={styles.creditsStatLbl}>Total Spent</Text>
          </View>
          <View style={styles.creditsStatDiv} />
          <View style={styles.creditsStat}>
            <Text style={styles.creditsStatVal}>{roleRecord?.signup_credits_claimed ? 'Yes' : 'No'}</Text>
            <Text style={styles.creditsStatLbl}>Claimed</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>IDENTITY STATUS</Text>
      <View style={styles.identityCard}>
        <View style={[styles.identityIcon, { backgroundColor: hasIdentity ? '#3B82F618' : Colors.bgElevated }]}>
          <MaterialIcons name="fingerprint" size={24} color={hasIdentity ? '#3B82F6' : Colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.identityTitle}>{hasIdentity ? 'Identity NFT Minted' : 'No Identity Yet'}</Text>
          <Text style={styles.identityNft} numberOfLines={1}>{roleRecord?.identity_nft_id ?? 'Run Setup to mint'}</Text>
          <Text style={styles.identityRole}>Role: {roleRecord?.role?.toUpperCase() ?? 'Not set'}</Text>
        </View>
        {hasIdentity && <MaterialIcons name="verified" size={22} color="#3B82F6" />}
      </View>

      {creditHistory.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>CREDIT HISTORY</Text>
          {creditHistory.slice(0, 5).map((tx: any) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={[styles.txIcon, { backgroundColor: tx.amount > 0 ? '#22C55E18' : '#EF444418' }]}>
                <MaterialIcons name={tx.amount > 0 ? 'add' : 'remove'} size={16} color={tx.amount > 0 ? '#22C55E' : '#EF4444'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txReason} numberOfLines={1}>{tx.reason}</Text>
                <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.txAmount, { color: tx.amount > 0 ? '#22C55E' : '#EF4444' }]}>
                {tx.amount > 0 ? '+' : ''}{tx.amount} BTNGPC
              </Text>
            </View>
          ))}
        </>
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('borrow')} activeOpacity={0.85}>
        <MaterialIcons name="account-balance" size={18} color="#fff" />
        <Text style={styles.primaryBtnText}>Continue → Apply for Loan</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Step: Borrow ───────────────────────────────────────────────────────────
  const renderBorrow = () => (
    <View style={styles.stepWrap}>
      <StepHeader step={3} total={3} title="BTNG Gold Loan" desc="Choose your loan product" onBack={() => setStep('overview')} />

      {renewalCertId ? (
        <View style={[styles.engineInfoBox, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
          <MaterialIcons name="autorenew" size={16} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.engineInfoText, { color: Colors.primary, fontWeight: FontWeight.bold }]}>Renewing Certificate</Text>
            <Text style={[styles.engineInfoText, { color: Colors.textSecondary, marginTop: 2, fontFamily: 'monospace' }]} numberOfLines={1}>{renewalCertId}</Text>
          </View>
        </View>
      ) : null}

      {LOAN_PRODUCTS.map(prod => (
        <TouchableOpacity key={prod.type} style={[styles.loanCard, selectedLoan.type === prod.type && { borderColor: '#22C55E', backgroundColor: '#22C55E0D' }]} onPress={() => setSelectedLoan(prod)} activeOpacity={0.85}>
          <View style={styles.loanCardTop}>
            <View style={[styles.loanIcon, { backgroundColor: selectedLoan.type === prod.type ? '#22C55E18' : Colors.bgElevated }]}>
              <MaterialIcons name="account-balance" size={20} color={selectedLoan.type === prod.type ? '#22C55E' : Colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.loanName, selectedLoan.type === prod.type && { color: '#22C55E' }]}>{prod.label}</Text>
              <Text style={styles.loanDesc}>{prod.description}</Text>
            </View>
            <View style={[styles.roleCheck, { borderColor: '#22C55E', backgroundColor: selectedLoan.type === prod.type ? '#22C55E' : 'transparent' }]}>
              {selectedLoan.type === prod.type && <MaterialIcons name="check" size={14} color="#fff" />}
            </View>
          </View>
          <View style={styles.loanStats}>
            <LoanStat label="APR" value={`${prod.aprPct}%`} />
            <LoanStat label="LTV" value={`${prod.ltv}%`} />
            <LoanStat label="Duration" value={`${prod.durationDays}D`} />
            <LoanStat label="Risk" value={prod.riskLevel} color={prod.riskLevel === 'LOW' ? '#22C55E' : '#F59E0B'} />
          </View>
        </TouchableOpacity>
      ))}

      <Text style={[styles.sectionLabel, { marginTop: 12 }]}>PRINCIPAL AMOUNT (BTNGG)</Text>
      <Text style={styles.inputHint}>Min: {selectedLoan.minAmount} · Max: {selectedLoan.maxAmount.toLocaleString()}</Text>
      <TextInput
        style={styles.input}
        placeholder={`e.g. ${selectedLoan.minAmount * 5}`}
        placeholderTextColor={Colors.textMuted}
        value={loanAmount}
        onChangeText={setLoanAmount}
        keyboardType="numeric"
      />

      {loanAmount && parseFloat(loanAmount) >= selectedLoan.minAmount && (
        <View style={styles.loanPreview}>
          <LoanPreviewRow label="Principal" value={`${parseFloat(loanAmount).toLocaleString()} BTNGG`} />
          <LoanPreviewRow label="Interest" value={`~${((parseFloat(loanAmount) * selectedLoan.aprPct / 100 / 365) * selectedLoan.durationDays).toFixed(2)} BTNGG`} color="#F59E0B" />
          <LoanPreviewRow label="Total Due" value={`~${(parseFloat(loanAmount) * (1 + selectedLoan.aprPct / 100 / 365 * selectedLoan.durationDays)).toFixed(2)} BTNGG`} color="#EF4444" />
          <LoanPreviewRow label="Cert NFT" value="Auto-minted on approval" color="#22C55E" />
          <LoanPreviewRow label="Discount" value="10% auto-unlocked" color={Colors.primary} />
          {renewalCertId ? <LoanPreviewRow label="Renewal Of" value={renewalCertId} color={Colors.primary} /> : null}
        </View>
      )}

      <View style={styles.engineInfoBox}>
        <MaterialIcons name="auto-awesome" size={16} color="#22C55E" />
        <Text style={styles.engineInfoText}>Auto engine: On approval → Loan record created → BTNG Gold Certificate NFT minted → Trader discount (10%) activated.</Text>
      </View>

      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#22C55E' }, busy && styles.primaryBtnDisabled]} onPress={handleApplyLoan} disabled={busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <>
          <MaterialIcons name="verified" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Apply → Auto-Mint Certificate</Text>
        </>}
      </TouchableOpacity>
    </View>
  );

  // ── Step: Loan Success ─────────────────────────────────────────────────────
  const renderLoanSuccess = () => (
    <View style={styles.stepWrap}>
      <View style={styles.successHero}>
        <View style={styles.successIconWrap}>
          <MaterialIcons name="check-circle" size={60} color="#22C55E" />
        </View>
        <Text style={styles.successTitle}>Loan Approved!</Text>
        <Text style={styles.successSub}>Certificate NFT auto-minted · Discount unlocked</Text>
      </View>

      <View style={styles.loanPreview}>
        <LoanPreviewRow label="Loan ID" value={loanResult?.loanId ?? '-'} />
        <LoanPreviewRow label="Certificate NFT" value={loanResult?.certNftId ?? '-'} color="#D4A017" />
        <LoanPreviewRow label="Interest" value={`${loanResult?.interestAmount?.toFixed(4)} BTNGG`} color="#F59E0B" />
        <LoanPreviewRow label="Total Due" value={`${loanResult?.totalDue?.toFixed(2)} BTNGG`} color="#EF4444" />
        <LoanPreviewRow label="Due Date" value={loanResult?.dueDate ?? '-'} />
        <LoanPreviewRow label="Trader Discount" value="10% ACTIVE" color={Colors.primary} />
      </View>

      <View style={[styles.engineInfoBox, { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]}>
        <MaterialIcons name="local-offer" size={16} color={Colors.primary} />
        <Text style={[styles.engineInfoText, { color: Colors.primary }]}>Your wallet now holds a BTNG Gold Certificate NFT. 10% trader discount is automatically applied to all future equity bond purchases and fees.</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border }]} onPress={() => setStep('trade_certs')} activeOpacity={0.85}>
          <Text style={[styles.primaryBtnText, { color: Colors.textPrimary }]}>Trade Certs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => setStep('discount')} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Check Discount</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, marginTop: 4 }]} onPress={() => setStep('overview')} activeOpacity={0.85}>
        <Text style={[styles.primaryBtnText, { color: Colors.textPrimary }]}>Back to Overview</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Step: Trade Certs ──────────────────────────────────────────────────────
  const renderTradeCerts = () => (
    <View style={styles.stepWrap}>
      <StepHeader step={5} total={6} title="Trade Certificates" desc="Your BTNG Gold Certificate marketplace" onBack={() => setStep('overview')} />

      {certificates.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialIcons name="workspace-premium" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Certificates Yet</Text>
          <Text style={styles.emptyDesc}>Apply for a loan to auto-mint your first BTNG Gold Certificate NFT.</Text>
          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={() => setStep('borrow')} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Apply for Loan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        certificates.map((cert: any) => (
          <View key={cert.id} style={styles.certCard}>
            <View style={styles.certCardLeft}>
              <View style={styles.certIconWrap}>
                <MaterialIcons name="workspace-premium" size={22} color="#D4A017" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.certTitle}>{cert.cert_id}</Text>
                <Text style={styles.certSub}>{cert.cert_type?.replace(/_/g, ' ')} · Grade {cert.equity_grade}</Text>
                <Text style={styles.certValue}>Value: {cert.asset_value?.toLocaleString()} BTNGG</Text>
                {cert.metadata?.discount_bps && (
                  <Text style={[styles.certSub, { color: Colors.primary }]}>Discount: {cert.metadata.discount_bps / 100}% unlocked</Text>
                )}
              </View>
            </View>
            <View style={[styles.certBadge, {
              backgroundColor: cert.status === 'active' ? '#22C55E18' : '#F59E0B18',
              borderColor: cert.status === 'active' ? '#22C55E44' : '#F59E0B44',
            }]}>
              {cert.status === 'active' && <View style={styles.certActiveDot} />}
              <Text style={[styles.certBadgeText, { color: cert.status === 'active' ? '#22C55E' : '#F59E0B' }]}>{cert.status?.toUpperCase()}</Text>
            </View>
          </View>
        ))
      )}

      <View style={styles.engineInfoBox}>
        <MaterialIcons name="info-outline" size={16} color="#3B82F6" />
        <Text style={[styles.engineInfoText, { color: '#3B82F6' }]}>Traders who hold a BTNG Gold Certificate automatically unlock a 10% discount on all equity bonds and platform fees — no manual redemption needed.</Text>
      </View>
    </View>
  );

  // ── Step: Discount ─────────────────────────────────────────────────────────
  const renderDiscount = () => (
    <View style={styles.stepWrap}>
      <StepHeader step={6} total={6} title="Trader Discount Engine" desc="10% automatic discount for certificate holders" onBack={() => setStep('overview')} />

      <View style={[styles.creditsHero, { backgroundColor: discountEligible ? Colors.primaryGlow : Colors.bgCard, borderColor: discountEligible ? Colors.primary + '55' : Colors.border }]}>
        <Text style={[styles.creditsBalance, { color: discountEligible ? Colors.primary : Colors.textMuted }]}>
          {discountEligible ? `${discountPct}%` : '0%'}
        </Text>
        <Text style={styles.creditsLabel}>Your Current Discount</Text>
        <Text style={[styles.identityNft, { textAlign: 'center', marginTop: 4 }]}>
          {discountEligible ? 'Active — Auto-applied to equity bonds & fees' : 'Hold a BTNG Gold Certificate to unlock'}
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>DISCOUNT CALCULATOR</Text>
      <Text style={styles.inputHint}>Enter a fee or bond price to calculate your savings</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 100"
        placeholderTextColor={Colors.textMuted}
        value={demoFee}
        onChangeText={setDemoFee}
        keyboardType="numeric"
      />
      <TouchableOpacity style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]} onPress={handleDiscountCheck} disabled={busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Calculate Discount</Text>}
      </TouchableOpacity>

      {discountResult && (
        <View style={styles.loanPreview}>
          <LoanPreviewRow label="Original Amount" value={`${parseFloat(demoFee).toLocaleString()} BTNGG`} />
          <LoanPreviewRow label="Discount BPS" value={`${discountResult.discountBps} bps (${discountResult.discountBps / 100}%)`} color={Colors.primary} />
          <LoanPreviewRow label="You Save" value={discountResult.eligible ? `-${discountResult.discountAmount.toFixed(4)} BTNGG` : '0'} color="#22C55E" />
          <LoanPreviewRow label="Final Amount" value={`${discountResult.finalAmount.toFixed(4)} BTNGG`} color={discountResult.eligible ? Colors.primary : Colors.textMuted} />
          <LoanPreviewRow label="Eligible" value={discountResult.eligible ? 'YES — Certificate held' : 'NO — No active cert'} color={discountResult.eligible ? '#22C55E' : '#EF4444'} />
        </View>
      )}

      {!discountEligible && (
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#22C55E' }]} onPress={() => setStep('borrow')} activeOpacity={0.85}>
          <MaterialIcons name="account-balance" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Get a Loan → Unlock Discount</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 'role_select': return renderRoleSelect();
      case 'credits': return renderCredits();
      case 'borrow': return renderBorrow();
      case 'loan_success': return renderLoanSuccess();
      case 'trade_certs': return renderTradeCerts();
      case 'discount': return renderDiscount();
      default: return renderOverview();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step !== 'overview' ? setStep('overview') : router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BTNG Product Engine</Text>
        <TouchableOpacity onPress={reload} style={styles.backBtn}>
          <MaterialIcons name="refresh" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading && step === 'overview' ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading engine...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {renderStep()}
        </ScrollView>
      )}
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusPill({ icon, label, active, color, value }: { icon: string; label: string; active: boolean; color: string; value?: string | null }) {
  return (
    <View style={[statusStyles.pill, { borderColor: active ? color + '55' : Colors.border, backgroundColor: active ? color + '0F' : Colors.bgCard }]}>
      <MaterialIcons name={icon as any} size={14} color={active ? color : Colors.textMuted} />
      <Text style={[statusStyles.label, { color: active ? color : Colors.textMuted }]}>{value ?? label}</Text>
    </View>
  );
}

function StepHeader({ step, total, title, desc, onBack }: { step: number; total: number; title: string; desc: string; onBack: () => void }) {
  return (
    <View style={stepStyles.wrap}>
      <View style={stepStyles.row}>
        <TouchableOpacity onPress={onBack} style={stepStyles.back}>
          <MaterialIcons name="arrow-back-ios" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={stepStyles.prog}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[stepStyles.progDot, i < step && { backgroundColor: Colors.primary }]} />
          ))}
        </View>
      </View>
      <Text style={stepStyles.title}>{title}</Text>
      <Text style={stepStyles.desc}>{desc}</Text>
    </View>
  );
}

function LoanStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={[styles.loanStatVal, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.loanStatLbl}>{label}</Text>
    </View>
  );
}

function LoanPreviewRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={[styles.previewValue, color ? { color } : {}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const { Colors: C } = { Colors };

const statusStyles = StyleSheet.create({
  pill: { flex: 1, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center', gap: 3 },
  label: { fontSize: 8, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false },
});

const stepStyles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  back: { padding: 4 },
  prog: { flexDirection: 'row', gap: 5 },
  progDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.md, color: Colors.textMuted, includeFontPadding: false },
  stepWrap: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: 10 },
  sectionLabel: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  // Hero
  heroCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.primary + '55', gap: Spacing.md, alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  heroCoin: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: Colors.primary },
  heroTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 3 },
  // Status row
  statusRow: { flexDirection: 'row', gap: 8 },
  // Flow steps
  flowStep: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: Spacing.md },
  flowStepDone: { borderColor: Colors.success + '44', backgroundColor: Colors.successBg },
  flowStepNum: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flowStepNumText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  flowStepIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flowStepTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  flowStepDesc: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  flowDoneBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  flowDoneBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  // Role cards
  roleCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  roleEmoji: { fontSize: 28 },
  roleLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  roleDesc: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  roleCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  // Input
  input: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 14, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  inputHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: -4, includeFontPadding: false },
  // Info box
  engineInfoBox: { flexDirection: 'row', gap: 10, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'flex-start' },
  engineInfoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 18 },
  // Primary button
  primaryBtn: { flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  // Credits
  creditsHero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, alignItems: 'center', gap: 4 },
  creditsBalance: { fontSize: 40, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  creditsLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  creditsStatsRow: { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md, marginTop: 4 },
  creditsStat: { flex: 1, alignItems: 'center', gap: 3 },
  creditsStatVal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  creditsStatLbl: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  creditsStatDiv: { width: 1, backgroundColor: Colors.border },
  // Identity
  identityCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  identityIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  identityTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  identityNft: { fontSize: 11, color: Colors.textMuted, includeFontPadding: false, marginTop: 2, fontFamily: 'monospace' },
  identityRole: { fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false, marginTop: 2 },
  // Tx history
  txRow: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md },
  txIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txReason: { fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  txDate: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  txAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  // Loan cards
  loanCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md },
  loanCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  loanIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loanName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  loanDesc: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  loanStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  loanStatVal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  loanStatLbl: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  // Loan preview
  loanPreview: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: 8 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  previewValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, flex: 1, textAlign: 'right' },
  // Success
  successHero: { alignItems: 'center', gap: 8, paddingVertical: Spacing.xl },
  successIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#22C55E18', borderWidth: 2, borderColor: '#22C55E44', alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 26, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  successSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  // Cert cards
  certCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: Spacing.md },
  certCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  certIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#D4A01718', borderWidth: 1, borderColor: '#D4A01744', alignItems: 'center', justifyContent: 'center' },
  certTitle: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, fontFamily: 'monospace' },
  certSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  certValue: { fontSize: FontSize.xs, color: Colors.primary, includeFontPadding: false, marginTop: 1 },
  certBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  certActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  certBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl * 2, gap: 10 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, lineHeight: 20 },
});
