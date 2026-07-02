import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Animated, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { useMintingPipeline } from '@/hooks/useMintingPipeline';
import { PipelineStageStatus, EquityAsset } from '@/services/mintingPipelineService';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

type Screen = 'home' | 'run' | 'add_equity' | 'history';

const EQUITY_TYPES: { value: EquityAsset['equityType']; label: string; icon: string; color: string }[] = [
  { value: 'gold_cert', label: 'Gold Certificate',  icon: 'workspace-premium', color: '#D4A017' },
  { value: 'property',  label: 'Property Asset',    icon: 'home',              color: '#3B82F6' },
  { value: 'commodity', label: 'Commodity',         icon: 'inventory',         color: '#22C55E' },
  { value: 'bond',      label: 'Bond / Equity',     icon: 'account-balance',   color: '#9945FF' },
  { value: 'custom',    label: 'Custom Asset',      icon: 'star',              color: '#F59E0B' },
];

const RISK_COLORS: Record<string, string> = { LOW: '#22C55E', MEDIUM: '#F59E0B', HIGH: '#EF4444' };
const STAGE_COLORS: Record<PipelineStageStatus, string> = {
  idle:    Colors.textMuted,
  running: '#3B82F6',
  done:    '#22C55E',
  failed:  '#EF4444',
  skipped: Colors.textMuted,
};

export default function BtngMintingPipeline() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const {
    stages, running, complete, failed, currentStageIndex,
    receipt, error, equity, caps, risk, intent,
    enforcedAmount, maxMintable, ltvPct, capped, preChecks,
    equityPool, mintHistory, dataLoading,
    executePipeline, reset, addEquity, reload,
  } = useMintingPipeline();

  const [screen, setScreen] = useState<Screen>('home');
  const [equityId, setEquityId] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');

  // Add equity form
  const [newEquity, setNewEquity] = useState<{
    equityType: EquityAsset['equityType'];
    baseValue: string;
    valuationMethod: string;
    riskTier: EquityAsset['riskTier'];
  }>({ equityType: 'gold_cert', baseValue: '', valuationMethod: 'BTNG_ORACLE', riskTier: 'LOW' });

  const [addingEquity, setAddingEquity] = useState(false);

  const handleRunPipeline = useCallback(async () => {
    if (!equityId.trim()) { showAlert('Missing Equity', 'Enter an equity ID to mint against.'); return; }
    const amt = parseFloat(requestedAmount);
    if (!amt || amt <= 0) { showAlert('Invalid Amount', 'Enter a valid requested mint amount.'); return; }
    setScreen('run');
    await executePipeline(equityId.trim(), amt);
  }, [equityId, requestedAmount, executePipeline, showAlert]);

  const handleAddEquity = useCallback(async () => {
    const val = parseFloat(newEquity.baseValue);
    if (!val || val <= 0) { showAlert('Invalid Value', 'Enter a valid base value.'); return; }
    setAddingEquity(true);
    const adjusted = val * 0.95;
    const result = await addEquity({
      equityId: '',
      equityType: newEquity.equityType,
      baseValue: val,
      adjustedValue: adjusted,
      valuationMethod: newEquity.valuationMethod,
      riskTier: newEquity.riskTier,
      verified: true,
    });
    setAddingEquity(false);
    if (result?.error) { showAlert('Failed', result.error); return; }
    showAlert('Equity Added', `Asset added to your equity pool. Equity ID: ${result?.equityId ?? 'generated'}`);
    setNewEquity({ equityType: 'gold_cert', baseValue: '', valuationMethod: 'BTNG_ORACLE', riskTier: 'LOW' });
    setScreen('home');
  }, [newEquity, addEquity, showAlert]);

  // ── Home Screen ────────────────────────────────────────────────────────
  const renderHome = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Hero */}
      <View style={styles.heroCard}>
        <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.heroCoin} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>BTNG Minting Pipeline</Text>
          <Text style={styles.heroSub}>Sovereign Monetary Kernel · btngd v1.0 · 10-Stage Execution</Text>
        </View>
        <View style={[styles.liveBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
          <View style={styles.liveDot} />
          <Text style={[styles.liveBadgeText, { color: '#22C55E' }]}>LIVE</Text>
        </View>
      </View>

      {/* Pipeline Overview Strip */}
      <View style={styles.stagesStrip}>
        {stages.map((s, i) => (
          <View key={s.id} style={styles.stripStage}>
            <View style={[styles.stripDot, { backgroundColor: STAGE_COLORS[s.status] }]} />
            {i < stages.length - 1 && <View style={styles.stripLine} />}
          </View>
        ))}
      </View>
      <Text style={styles.stripLabel}>10-Stage Pipeline · Idle</Text>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCard icon="layers" label="Equity Pool" value={equityPool.length.toString()} color="#3B82F6" />
        <StatCard icon="receipt-long" label="Mint History" value={mintHistory.length.toString()} color="#D4A017" />
        <StatCard icon="account-balance-wallet" label="Total Minted" value={mintHistory.reduce((s: number, r: any) => s + (r.amount_minted ?? 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} color="#22C55E" />
      </View>

      {/* Equity input */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>MINT AGAINST EQUITY</Text>
        <Text style={styles.inputHint}>Paste an Equity ID (from pool or certificate)</Text>

        {/* Quick-pick from equity pool */}
        {equityPool.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.equityChipRow}>
            {equityPool.map(eq => (
              <TouchableOpacity
                key={eq.equityId}
                style={[styles.equityChip, equityId === eq.equityId && styles.equityChipActive]}
                onPress={() => setEquityId(eq.equityId)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="workspace-premium" size={12} color={equityId === eq.equityId ? Colors.bg : Colors.primary} />
                <Text style={[styles.equityChipText, equityId === eq.equityId && { color: Colors.bg }]} numberOfLines={1}>
                  {eq.equityId.slice(0, 16)}…
                </Text>
                <Text style={[styles.equityChipVal, equityId === eq.equityId && { color: Colors.bg + 'CC' }]}>
                  {eq.adjustedValue.toLocaleString()} BTNGG
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <TextInput
          style={styles.input}
          value={equityId}
          onChangeText={setEquityId}
          placeholder="e.g. BTNG-CERT-ABC123 or EQ-XYZ"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
        />

        <Text style={[styles.inputHint, { marginTop: 10 }]}>Requested Mint Amount (BTNGG)</Text>
        <TextInput
          style={styles.input}
          value={requestedAmount}
          onChangeText={setRequestedAmount}
          placeholder="e.g. 500"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        {equityId && requestedAmount && (() => {
          const eq = equityPool.find(e => e.equityId === equityId);
          if (!eq) return null;
          const ltv = 0.70;
          const maxM = eq.adjustedValue * ltv;
          return (
            <View style={styles.previewBox}>
              <PreviewRow label="Base Value" value={`${eq.baseValue.toLocaleString()} BTNGG`} />
              <PreviewRow label="Adjusted Value" value={`${eq.adjustedValue.toLocaleString()} BTNGG`} />
              <PreviewRow label="Est. Max Mintable" value={`~${maxM.toLocaleString(undefined, { maximumFractionDigits: 2 })} BTNGG`} color={Colors.primary} />
              <PreviewRow label="Risk Tier" value={eq.riskTier} color={RISK_COLORS[eq.riskTier]} />
              {parseFloat(requestedAmount) > maxM && (
                <View style={styles.capWarn}>
                  <MaterialIcons name="warning" size={12} color="#F59E0B" />
                  <Text style={styles.capWarnText}>Amount exceeds LTV — kernel will rewrite to {maxM.toFixed(2)}</Text>
                </View>
              )}
            </View>
          );
        })()}

        <TouchableOpacity style={[styles.mintBtn, running && styles.mintBtnDisabled]} onPress={handleRunPipeline} disabled={running} activeOpacity={0.85}>
          <MaterialIcons name="rocket-launch" size={20} color="#fff" />
          <Text style={styles.mintBtnText}>Execute Minting Pipeline</Text>
        </TouchableOpacity>
      </View>

      {/* Add equity CTA */}
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>EQUITY POOL</Text>
        <TouchableOpacity style={styles.addEquityBtn} onPress={() => setScreen('add_equity')} activeOpacity={0.85}>
          <MaterialIcons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.addEquityBtnText}>Add New Equity Asset</Text>
        </TouchableOpacity>

        {equityPool.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialIcons name="account-balance" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No equity assets in pool</Text>
            <Text style={styles.emptySubText}>Add an asset or use a BTNG Certificate as equity</Text>
          </View>
        ) : (
          equityPool.map(eq => <EquityCard key={eq.equityId} equity={eq} onSelect={() => setEquityId(eq.equityId)} selected={equityId === eq.equityId} />)
        )}
      </View>

      {/* Recent mints */}
      {mintHistory.length > 0 && (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>RECENT MINTS</Text>
            <TouchableOpacity onPress={() => setScreen('history')}>
              <Text style={styles.seeAllText}>View All →</Text>
            </TouchableOpacity>
          </View>
          {mintHistory.slice(0, 3).map((r: any) => <MintHistoryCard key={r.id} receipt={r} />)}
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
          {complete && <MaterialIcons name="check-circle" size={44} color="#22C55E" />}
          {failed && <MaterialIcons name="cancel" size={44} color="#EF4444" />}
          {!running && !complete && !failed && <MaterialIcons name="play-circle-outline" size={44} color={Colors.textMuted} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.runStatusTitle, { color: complete ? '#22C55E' : failed ? '#EF4444' : running ? '#3B82F6' : Colors.textMuted }]}>
            {running ? 'Pipeline Executing…' : complete ? 'Minting Complete!' : failed ? 'Pipeline Failed' : 'Ready'}
          </Text>
          <Text style={styles.runStatusSub}>
            {running ? `Stage ${currentStageIndex + 1}/10 · btngd executing` : complete ? `${receipt?.amountMinted.toLocaleString()} BTNGG minted · Ledger updated` : failed ? error ?? 'Unknown error' : 'Awaiting execution'}
          </Text>
        </View>
      </View>

      {/* Pipeline stages */}
      <Text style={[styles.sectionLabel, { paddingHorizontal: Spacing.xl }]}>EXECUTION TRACE</Text>
      {stages.map((stage, idx) => (
        <PipelineStageRow key={stage.id} stage={stage} index={idx} isCurrently={currentStageIndex === idx && running} />
      ))}

      {/* Intermediate data panel */}
      {(equity || risk || intent) && (
        <View style={[styles.sectionWrap, { marginTop: 12 }]}>
          <Text style={styles.sectionLabel}>KERNEL DATA</Text>
          <View style={styles.kernelDataCard}>
            {equity && (
              <>
                <KernelRow label="Equity ID" value={equity.equityId} mono />
                <KernelRow label="Base Value" value={`${equity.baseValue.toLocaleString()} BTNGG`} />
                <KernelRow label="Adjusted Value" value={`${equity.adjustedValue.toLocaleString()} BTNGG`} />
                <KernelRow label="Equity Risk" value={equity.riskTier} color={RISK_COLORS[equity.riskTier]} />
              </>
            )}
            {caps && (
              <>
                <KernelRow label="Region Policy" value={caps.regionPolicy} color={Colors.primary} />
                <KernelRow label="User Tier" value={caps.userTier} />
                <KernelRow label="Network" value={caps.networkTier} color="#22C55E" />
              </>
            )}
            {risk && (
              <>
                <KernelRow label="Risk Flags" value={risk.flags.length > 0 ? risk.flags.join(', ') : 'None'} color={risk.flags.length > 0 ? '#F59E0B' : '#22C55E'} />
                <KernelRow label="LTV Multiplier" value={`${(risk.maxMintMultiplier * 100).toFixed(0)}%`} />
              </>
            )}
            {ltvPct !== null && (
              <>
                <KernelRow label="Effective LTV" value={`${ltvPct.toFixed(1)}%`} color={Colors.primary} />
                <KernelRow label="Max Mintable" value={`${maxMintable?.toLocaleString()} BTNGG`} color={Colors.primary} />
                {capped && <KernelRow label="⚠ Sovereign Cap" value={`Rewritten → ${enforcedAmount?.toLocaleString()}`} color="#F59E0B" />}
              </>
            )}
            {intent && (
              <>
                <KernelRow label="MintIntent ID" value={intent.intentId} mono />
                <KernelRow label="Final Amount" value={`${intent.amount.toLocaleString()} BTNGG`} color="#22C55E" />
                <KernelRow label="Requires Verification" value={intent.requiresVerification ? 'YES' : 'NO'} color={intent.requiresVerification ? '#F59E0B' : '#22C55E'} />
              </>
            )}
          </View>
        </View>
      )}

      {/* Pre-check results */}
      {preChecks.length > 0 && (
        <View style={[styles.sectionWrap, { marginTop: 4 }]}>
          <Text style={styles.sectionLabel}>PRE-EXECUTION CHECKS</Text>
          {preChecks.map(c => (
            <View key={c.name} style={styles.checkRow}>
              <MaterialIcons name={c.passed ? 'check-circle' : 'cancel'} size={16} color={c.passed ? '#22C55E' : '#EF4444'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkName}>{c.name}</Text>
                <Text style={styles.checkNote}>{c.note}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* MintReceipt */}
      {receipt && complete && (
        <View style={[styles.sectionWrap, { marginTop: 4 }]}>
          <Text style={styles.sectionLabel}>MINT RECEIPT</Text>
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.receiptCoin} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptTitle}>MintReceipt · {receipt.mintId}</Text>
                <Text style={styles.receiptSub}>BTNG Gold Coin · Sovereign Monetary Kernel v1.0</Text>
              </View>
              <View style={[styles.liveBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveBadgeText, { color: '#22C55E' }]}>MINTED</Text>
              </View>
            </View>
            <View style={styles.receiptRows}>
              <ReceiptRow label="Amount Minted" value={`${receipt.amountMinted.toLocaleString()} BTNGG`} large color="#D4A017" />
              <ReceiptRow label="Equity ID" value={receipt.equityId} mono />
              <ReceiptRow label="LTV Used" value={`${receipt.ltvUsed.toFixed(1)}%`} />
              <ReceiptRow label="Risk Tier" value={receipt.riskTier} color={RISK_COLORS[receipt.riskTier]} />
              <ReceiptRow label="Region" value={receipt.regionPolicy} />
              <ReceiptRow label="Wallet" value={receipt.walletAddress?.slice(0, 20) + '…' ?? '-'} mono />
              <ReceiptRow label="Timestamp" value={new Date(receipt.timestamp).toLocaleString()} />
            </View>

            {receipt.autopilot && (
              <>
                <View style={styles.autopilotDivider}>
                  <Text style={styles.autopilotLabel}>🤖 AUTOPILOT PREDICTION</Text>
                </View>
                <View style={styles.receiptRows}>
                  <ReceiptRow label="Next Likely Amount" value={`~${receipt.autopilot.nextLikelyAmount.toLocaleString()} BTNGG`} color={Colors.primary} />
                  <ReceiptRow label="Verification Depth" value={receipt.autopilot.nextVerificationDepth} />
                  <ReceiptRow label="Settlement Mode" value={receipt.autopilot.nextSettlementMode} color="#22C55E" />
                </View>
              </>
            )}

            <View style={styles.receiptFooter}>
              <MaterialIcons name="verified" size={13} color="#22C55E" />
              <Text style={styles.receiptFooterText}>
                This MintReceipt is cryptographically signed by the BTNG Sovereign Monetary Kernel and stored on-ledger.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => { reset(); setScreen('home'); }} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>New Mint</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mintBtn, { flex: 1 }]} onPress={() => setScreen('history')} activeOpacity={0.85}>
              <Text style={styles.mintBtnText}>View History</Text>
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
          <TouchableOpacity style={[styles.mintBtn, { backgroundColor: '#EF4444', marginTop: 10 }]} onPress={() => { reset(); setScreen('home'); }} activeOpacity={0.85}>
            <MaterialIcons name="refresh" size={18} color="#fff" />
            <Text style={styles.mintBtnText}>Retry Pipeline</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ── Add Equity Screen ──────────────────────────────────────────────────
  const renderAddEquity = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Add Equity Asset</Text>
        <Text style={styles.stepSub}>Register a new equity asset in your sovereign pool</Text>
      </View>

      <Text style={[styles.sectionLabel, { paddingHorizontal: Spacing.xl }]}>ASSET TYPE</Text>
      <View style={styles.equityTypeGrid}>
        {EQUITY_TYPES.map(t => (
          <TouchableOpacity
            key={t.value}
            style={[styles.equityTypeCard, newEquity.equityType === t.value && { borderColor: t.color, backgroundColor: t.color + '10' }]}
            onPress={() => setNewEquity(p => ({ ...p, equityType: t.value }))}
            activeOpacity={0.85}
          >
            <MaterialIcons name={t.icon as any} size={22} color={newEquity.equityType === t.value ? t.color : Colors.textMuted} />
            <Text style={[styles.equityTypeLabel, newEquity.equityType === t.value && { color: t.color }]}>{t.label}</Text>
            {newEquity.equityType === t.value && (
              <View style={[styles.equityTypeCheck, { backgroundColor: t.color }]}>
                <MaterialIcons name="check" size={10} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionLabel}>BASE VALUE (BTNGG)</Text>
        <TextInput
          style={styles.input}
          value={newEquity.baseValue}
          onChangeText={v => setNewEquity(p => ({ ...p, baseValue: v }))}
          placeholder="e.g. 10000"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />
        {newEquity.baseValue && parseFloat(newEquity.baseValue) > 0 && (
          <View style={styles.previewBox}>
            <PreviewRow label="Base Value" value={`${parseFloat(newEquity.baseValue).toLocaleString()} BTNGG`} />
            <PreviewRow label="Adjusted (−5% haircut)" value={`${(parseFloat(newEquity.baseValue) * 0.95).toLocaleString(undefined, { maximumFractionDigits: 2 })} BTNGG`} color={Colors.primary} />
            <PreviewRow label="Est. Mintable @ 70% LTV" value={`${(parseFloat(newEquity.baseValue) * 0.95 * 0.70).toLocaleString(undefined, { maximumFractionDigits: 2 })} BTNGG`} color="#22C55E" />
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>RISK TIER</Text>
        <View style={styles.riskRow}>
          {(['LOW', 'MEDIUM', 'HIGH'] as const).map(tier => (
            <TouchableOpacity
              key={tier}
              style={[styles.riskChip, newEquity.riskTier === tier && { backgroundColor: RISK_COLORS[tier] + '20', borderColor: RISK_COLORS[tier] }]}
              onPress={() => setNewEquity(p => ({ ...p, riskTier: tier }))}
              activeOpacity={0.85}
            >
              <Text style={[styles.riskChipText, newEquity.riskTier === tier && { color: RISK_COLORS[tier] }]}>{tier}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>VALUATION METHOD</Text>
        <View style={styles.valuationRow}>
          {['BTNG_ORACLE', 'MANUAL', 'THIRD_PARTY'].map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.valuationChip, newEquity.valuationMethod === m && styles.valuationChipActive]}
              onPress={() => setNewEquity(p => ({ ...p, valuationMethod: m }))}
              activeOpacity={0.85}
            >
              <Text style={[styles.valuationChipText, newEquity.valuationMethod === m && { color: Colors.primary }]}>{m.replace(/_/g, ' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.infoBox, { marginTop: 12 }]}>
          <MaterialIcons name="info-outline" size={14} color="#3B82F6" />
          <Text style={[styles.infoText, { color: '#3B82F6' }]}>
            Assets added to your equity pool are immediately available for minting. A 5% haircut is applied to the adjusted value to account for market volatility.
          </Text>
        </View>

        <TouchableOpacity style={[styles.mintBtn, addingEquity && styles.mintBtnDisabled]} onPress={handleAddEquity} disabled={addingEquity} activeOpacity={0.85}>
          {addingEquity ? <ActivityIndicator color="#fff" /> : <>
            <MaterialIcons name="add-circle" size={18} color="#fff" />
            <Text style={styles.mintBtnText}>Add to Equity Pool</Text>
          </>}
        </TouchableOpacity>
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );

  // ── History Screen ─────────────────────────────────────────────────────
  const renderHistory = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Mint History</Text>
        <Text style={styles.stepSub}>All BTNG minting events · Sovereign ledger</Text>
      </View>
      {mintHistory.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialIcons name="receipt-long" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No minting history yet</Text>
          <Text style={styles.emptySubText}>Execute the minting pipeline to issue BTNG</Text>
        </View>
      ) : (
        mintHistory.map((r: any) => <MintHistoryCard key={r.id} receipt={r} expanded />)
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );

  const getScreenTitle = () => {
    switch (screen) {
      case 'run': return 'Pipeline Execution';
      case 'add_equity': return 'Add Equity';
      case 'history': return 'Mint History';
      default: return 'Minting Pipeline';
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
          <Text style={styles.headerSub}>BituncoinOS · btngd · Sovereign Kernel</Text>
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

      {/* Top tab nav */}
      {screen === 'home' && (
        <View style={styles.tabRow}>
          {([
            { id: 'home',       label: '⛏ Mint',       icon: 'flash-on'    },
            { id: 'add_equity', label: '+ Equity',      icon: 'add-circle'  },
            { id: 'history',    label: '📋 History',    icon: 'history'     },
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
          <Text style={styles.loadingText}>Loading equity pool...</Text>
        </View>
      ) : (
        <>
          {screen === 'home' && renderHome()}
          {screen === 'run' && renderRun()}
          {screen === 'add_equity' && renderAddEquity()}
          {screen === 'history' && renderHistory()}
        </>
      )}
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PipelineStageRow({ stage, index, isCurrently }: { stage: any; index: number; isCurrently: boolean }) {
  const statusColor = STAGE_COLORS[stage.status as PipelineStageStatus];
  const isDone = stage.status === 'done';
  const isFailed = stage.status === 'failed';
  const isRunning = stage.status === 'running';

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
          ) : (
            <Text style={[pss.numText, { color: statusColor }]}>{index + 1}</Text>
          )}
        </View>
        {index < 9 && <View style={[pss.connector, { backgroundColor: isDone ? '#22C55E44' : Colors.border }]} />}
      </View>
      <View style={pss.body}>
        <View style={pss.titleRow}>
          <Text style={[pss.stageName, { color: isDone ? '#22C55E' : isFailed ? '#EF4444' : isRunning ? '#3B82F6' : Colors.textSecondary }]}>{stage.label}</Text>
          {stage.duration !== undefined && (
            <Text style={pss.duration}>{stage.duration}ms</Text>
          )}
          {isRunning && (
            <View style={pss.activePill}>
              <Text style={pss.activePillText}>ACTIVE</Text>
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
      <Text style={[scStyles.value, { color }]}>{value}</Text>
      <Text style={scStyles.label}>{label}</Text>
    </View>
  );
}

function EquityCard({ equity, onSelect, selected }: { equity: EquityAsset; onSelect: () => void; selected: boolean }) {
  const color = RISK_COLORS[equity.riskTier];
  return (
    <TouchableOpacity style={[eqStyles.card, selected && { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow }]} onPress={onSelect} activeOpacity={0.85}>
      <View style={eqStyles.left}>
        <View style={[eqStyles.icon, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <MaterialIcons name="workspace-premium" size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={eqStyles.id} numberOfLines={1}>{equity.equityId}</Text>
          <Text style={eqStyles.type}>{equity.equityType.replace(/_/g, ' ')} · {equity.valuationMethod}</Text>
        </View>
      </View>
      <View style={eqStyles.right}>
        <Text style={eqStyles.value}>{equity.adjustedValue.toLocaleString()}</Text>
        <Text style={eqStyles.valueSub}>BTNGG adj.</Text>
        <View style={[eqStyles.riskBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[eqStyles.riskText, { color }]}>{equity.riskTier}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MintHistoryCard({ receipt, expanded = false }: { receipt: any; expanded?: boolean }) {
  return (
    <View style={mhStyles.card}>
      <View style={mhStyles.header}>
        <View style={mhStyles.iconWrap}>
          <MaterialIcons name="star" size={16} color="#D4A017" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mhStyles.mintId} numberOfLines={1}>{receipt.mint_id}</Text>
          <Text style={mhStyles.date}>{new Date(receipt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <View style={mhStyles.amountWrap}>
          <Text style={mhStyles.amount}>{(receipt.amount_minted ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
          <Text style={mhStyles.amountUnit}>BTNGG</Text>
        </View>
      </View>
      {expanded && (
        <View style={mhStyles.details}>
          <MhRow label="Equity" value={receipt.equity_id} mono />
          <MhRow label="LTV" value={`${(receipt.ltv_used ?? 0).toFixed(1)}%`} />
          <MhRow label="Risk" value={receipt.risk_tier ?? '-'} color={RISK_COLORS[receipt.risk_tier ?? 'LOW']} />
          <MhRow label="Region" value={receipt.region_policy ?? '-'} />
          <MhRow label="Status" value={(receipt.status ?? '-').toUpperCase()} color="#22C55E" />
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
      <Text style={{ fontSize: large ? FontSize.lg : FontSize.sm, fontWeight: large ? FontWeight.heavy : FontWeight.semibold, color: color ?? Colors.textPrimary, includeFontPadding: false, fontFamily: mono ? 'monospace' : undefined }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function MhRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
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
  rowDone: {},
  rowFailed: {},
  rowRunning: {},
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
  value: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

const eqStyles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: 8 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  id: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace', includeFontPadding: false },
  type: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 3 },
  value: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  valueSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  riskBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  riskText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

const mhStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#D4A01718', borderWidth: 1, borderColor: '#D4A01744', alignItems: 'center', justifyContent: 'center' },
  mintId: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace', includeFontPadding: false },
  date: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  amountWrap: { alignItems: 'flex-end' },
  amount: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#D4A017', includeFontPadding: false },
  amountUnit: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
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
  tabText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  scrollContent: { paddingTop: Spacing.sm },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.md, color: Colors.textMuted },
  // Hero
  heroCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, marginHorizontal: Spacing.xl, borderWidth: 2, borderColor: Colors.primary + '55', gap: Spacing.md, alignItems: 'center', marginBottom: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  heroCoin: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: Colors.primary },
  heroTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
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
  inputHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 6, includeFontPadding: false },
  input: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 13, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, marginBottom: 8 },
  previewBox: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 8 },
  capWarn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, backgroundColor: '#F59E0B12', borderRadius: Radius.sm, padding: 6 },
  capWarnText: { flex: 1, fontSize: 10, color: '#F59E0B', includeFontPadding: false },
  mintBtn: { flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mintBtnDisabled: { opacity: 0.5 },
  mintBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
  secondaryBtn: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  secondaryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  addEquityBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary, paddingVertical: 12, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, justifyContent: 'center' },
  addEquityBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 8 },
  emptyText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  emptySubText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  equityChipRow: { paddingVertical: 4, gap: 8, paddingHorizontal: 0, marginBottom: 8 },
  equityChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 7 },
  equityChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  equityChipText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  equityChipVal: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  // Run screen
  runStatusCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, borderRadius: Radius.xl, borderWidth: 2, padding: Spacing.lg, gap: Spacing.md },
  runStatusIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  runStatusTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  runStatusSub: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, marginTop: 3 },
  kernelDataCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 2 },
  checkRow: { flexDirection: 'row', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'flex-start', marginBottom: 4 },
  checkName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  checkNote: { fontSize: 11, color: Colors.textSecondary, includeFontPadding: false, marginTop: 2 },
  errorBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#EF444412', borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: '#EF444444' },
  errorText: { flex: 1, fontSize: FontSize.sm, color: '#EF4444', includeFontPadding: false, lineHeight: 18 },
  // Receipt
  receiptCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.primary + '66', padding: Spacing.lg, gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  receiptCoin: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: Colors.primary },
  receiptTitle: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  receiptSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  receiptRows: { gap: 0 },
  autopilotDivider: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  autopilotLabel: { fontSize: 10, fontWeight: FontWeight.heavy, color: '#9945FF', letterSpacing: 0.8, includeFontPadding: false },
  receiptFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#22C55E0A', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#22C55E33' },
  receiptFooterText: { flex: 1, fontSize: 10, color: '#22C55E', lineHeight: 15, includeFontPadding: false },
  // Add equity
  stepHeader: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  stepTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  stepSub: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false, marginTop: 3 },
  equityTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.xl, gap: 8, marginBottom: Spacing.md },
  equityTypeCard: { width: '31%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', gap: 6 },
  equityTypeLabel: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  equityTypeCheck: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  riskRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  riskChip: { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  riskChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  valuationRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  valuationChip: { flex: 1, paddingVertical: 9, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  valuationChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  valuationChipText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#3B82F610', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#3B82F633', alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16, includeFontPadding: false },
});
