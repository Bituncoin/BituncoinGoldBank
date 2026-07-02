/**
 * BTNG GoldCoin Wallet Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Full UI for generating, viewing, and backing up a BTNG GoldCoin wallet.
 * Uses btngWalletCrypto.ts for pure-JS secp256k1 + RIPEMD-160 + Base58Check.
 *
 * Features:
 *   • One-tap wallet generation (private key + public key + BTNG address)
 *   • Live address QR code for receiving payments
 *   • 24-word mnemonic backup panel with word grid
 *   • Restore wallet from existing mnemonic
 *   • Copy / share all key fields
 *   • Security confirmation flow before revealing private key
 *   • Save wallet summary to Supabase (public fields only — no private key stored)
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import {
  generateBtngWallet,
  generateBtngWalletFromMnemonic,
  walletSummary,
  validateBtngAddress,
  formatBtngAddress,
  type BtngGoldWallet,
} from '@/services/btngWalletCrypto';

// ─── Small helpers ────────────────────────────────────────────────────────────
function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <TouchableOpacity
      style={[cb.btn, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}
      onPress={() => { Clipboard.setStringAsync(value).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.8}
    >
      <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={copied ? Colors.success : Colors.textMuted} />
      {label ? <Text style={[cb.label, copied && { color: Colors.success }]}>{copied ? 'Copied!' : label}</Text> : null}
    </TouchableOpacity>
  );
}
const cb = StyleSheet.create({
  btn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: Radius.md, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  label: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
});

function FieldRow({
  label, value, color, mono, secret,
}: { label: string; value: string; color?: string; mono?: boolean; secret?: boolean }) {
  const [reveal, setReveal] = useState(false);
  const display = secret && !reveal ? '•'.repeat(Math.min(value.length, 48)) : value;
  return (
    <View style={fr.wrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <Text style={fr.label}>{label}</Text>
        {secret && (
          <TouchableOpacity onPress={() => setReveal(v => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MaterialIcons name={reveal ? 'visibility-off' : 'visibility'} size={13} color={Colors.warning} />
          </TouchableOpacity>
        )}
      </View>
      <View style={fr.row}>
        <Text
          style={[fr.value, { color: color ?? Colors.textPrimary }, mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 }]}
          selectable={reveal || !secret}
          numberOfLines={secret && !reveal ? 1 : undefined}
          ellipsizeMode="middle"
        >
          {display}
        </Text>
        <CopyBtn value={value} />
      </View>
    </View>
  );
}
const fr = StyleSheet.create({
  wrap:  { gap: 2, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  label: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  row:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  value: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, lineHeight: 17 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function BtngWalletGenerateScreen() {
  const insets       = useSafeAreaInsets();
  const router       = useRouter();
  const { showAlert } = useAlert();

  const [wallet,        setWallet]        = useState<BtngGoldWallet | null>(null);
  const [generating,    setGenerating]    = useState(false);
  const [tab,           setTab]           = useState<'keys' | 'mnemonic' | 'qr' | 'restore'>('keys');
  const [confirmModal,  setConfirmModal]  = useState(false);
  const [pkRevealed,    setPkRevealed]    = useState(false);
  const [restorePhrase, setRestorePhrase] = useState('');
  const [restoreLoading,setRestoreLoading]= useState(false);
  const [shareLoading,  setShareLoading]  = useState(false);

  // ── Persist wallet address to AsyncStorage for profile shortcut card ──
  const persistWalletSummary = useCallback(async (w: BtngGoldWallet) => {
    try {
      await AsyncStorage.setItem(
        'btng_goldcoin_last_wallet_v1',
        JSON.stringify({ address: w.address, evmAddress: w.evmAddress, createdAt: w.createdAt })
      );
    } catch { /* best-effort */ }
  }, []);

  // ── Generate new wallet ────────────────────────────────────────────────
  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setPkRevealed(false);
    // Delay lets spinner render before heavy crypto work
    setTimeout(async () => {
      try {
        const w = generateBtngWallet();
        if (!w || !w.address) throw new Error('Wallet generation returned empty result.');
        setWallet(w);
        setTab('keys');
        await persistWalletSummary(w);
      } catch (e: any) {
        const msg = e?.message ?? String(e) ?? 'Unknown error';
        showAlert('Generation Error', `Could not generate wallet.\n\n${msg}`);
      } finally {
        setGenerating(false);
      }
    }, 120);
  }, [showAlert, persistWalletSummary]);

  // ── Restore from mnemonic ──────────────────────────────────────────────
  const handleRestore = useCallback(() => {
    const phrase = restorePhrase.trim();
    if (phrase.split(/\s+/).length < 12) {
      showAlert('Invalid Phrase', 'Enter your complete 12 or 24-word mnemonic phrase.');
      return;
    }
    setRestoreLoading(true);
    setTimeout(async () => {
      try {
        const w = generateBtngWalletFromMnemonic(phrase);
        if (!w || !w.address) throw new Error('Restore returned empty result.');
        setWallet(w);
        setPkRevealed(false);
        setTab('keys');
        setRestorePhrase('');
        await persistWalletSummary(w);
      } catch (e: any) {
        const msg = e?.message ?? String(e) ?? 'Unknown error';
        showAlert('Invalid Mnemonic', `Could not restore wallet — check your seed phrase.\n\n${msg}`);
      } finally {
        setRestoreLoading(false);
      }
    }, 120);
  }, [restorePhrase, showAlert, persistWalletSummary]);

  // ── Share address as text ──────────────────────────────────────────────
  const handleShareQr = useCallback(async () => {
    if (!wallet) return;
    setShareLoading(true);
    try {
      const text = `BTNG GoldCoin Address:\n${wallet.address}\n\nEVM Address:\n${wallet.evmAddress}\n\nNetwork: ${wallet.network}`;
      const fp = `${FileSystem.documentDirectory}btng_address.txt`;
      await FileSystem.writeAsStringAsync(fp, text, { encoding: FileSystem.EncodingType.UTF8 });
      const ok = await Sharing.isAvailableAsync();
      if (ok) await Sharing.shareAsync(fp, { mimeType: 'text/plain', dialogTitle: 'BTNG GoldCoin Address' });
      else showAlert('Saved', 'Address saved to app storage.');
    } catch (e: any) {
      showAlert('Share Error', e?.message ?? 'Could not share address.');
    } finally {
      setShareLoading(false);
    }
  }, [wallet, showAlert]);

  // ── Export wallet summary as JSON ──────────────────────────────────────
  const handleExportSummary = useCallback(async () => {
    if (!wallet) return;
    const summary = walletSummary(wallet);
    const json = JSON.stringify(summary, null, 2);
    try {
      const fp = `${FileSystem.documentDirectory}btng_wallet_summary.json`;
      await FileSystem.writeAsStringAsync(fp, json, { encoding: FileSystem.EncodingType.UTF8 });
      const ok = await Sharing.isAvailableAsync();
      if (ok) await Sharing.shareAsync(fp, { mimeType: 'application/json', dialogTitle: 'BTNG Wallet Summary (Public)' });
      else showAlert('Saved', 'Wallet summary exported to app storage.');
    } catch (e: any) {
      showAlert('Export Error', e?.message ?? 'Could not export wallet summary.');
    }
  }, [wallet, showAlert]);

  const TABS = [
    { key: 'keys',     label: 'Keys',     icon: 'vpn-key'        },
    { key: 'mnemonic', label: 'Seed',     icon: 'grid-view'      },
    { key: 'qr',       label: 'QR Code',  icon: 'qr-code'        },
    { key: 'restore',  label: 'Restore',  icon: 'restore'        },
  ] as const;

  const words = wallet ? wallet.mnemonic.split(' ') : [];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Wallet Generator</Text>
          <Text style={s.topSub}>secp256k1 · Base58Check · btng1g…</Text>
        </View>
        <View style={[s.backBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
          <Text style={{ fontSize: 18 }}>🥇</Text>
        </View>
      </View>

      {/* Generate button */}
      {!wallet ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* Hero */}
          <View style={s.heroCard}>
            <Text style={{ fontSize: 64 }}>🔐</Text>
            <Text style={s.heroTitle}>BTNG GoldCoin Wallet</Text>
            <Text style={s.heroSub}>
              Generate a sovereign BTNG GoldCoin address using secp256k1 elliptic curve cryptography —
              the same battle-tested algorithm securing Bitcoin and Ethereum.
            </Text>
          </View>

          {/* Spec grid */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <MaterialIcons name="security" size={16} color={Colors.primary} />
              <Text style={s.cardTitle}>Cryptographic Spec</Text>
            </View>
            {[
              { icon: 'lock',           label: 'Key Curve',      value: 'secp256k1 (EC)',             color: Colors.primary },
              { icon: 'fingerprint',    label: 'Hash 1',         value: 'SHA-256 → RIPEMD-160',       color: '#627EEA' },
              { icon: 'code',           label: 'Encoding',       value: 'Base58Check (BTC-compatible)',color: '#F7931A' },
              { icon: 'pin',            label: 'Address Format', value: 'btng1g… (35 chars)',          color: Colors.success },
              { icon: 'route',          label: 'BIP-44 Path',    value: `m/44'/9999'/0'/0/0`,         color: '#8247E5' },
              { icon: 'tag',            label: 'Coin Type',      value: '9999 (BTNG54)',               color: Colors.warning },
              { icon: 'language',       label: 'Network',        value: 'BTNG Gold Chain · Mainnet',  color: Colors.primary },
              { icon: 'account-balance',label: 'Compatible',     value: 'BTNG-54 · EVM · Web3',       color: Colors.success },
            ].map(row => (
              <View key={row.label} style={s.specRow}>
                <MaterialIcons name={row.icon as any} size={13} color={row.color} />
                <Text style={s.specLabel}>{row.label}</Text>
                <Text style={[s.specValue, { color: row.color }]}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Security warning */}
          <View style={[s.card, { borderColor: Colors.warning + '66' }]}>
            <View style={s.cardHeader}>
              <MaterialIcons name="warning" size={16} color={Colors.warning} />
              <Text style={[s.cardTitle, { color: Colors.warning }]}>Security Notice</Text>
            </View>
            {[
              'Your private key and seed phrase give FULL control of your wallet.',
              'Never share your private key or mnemonic with anyone.',
              'Store your seed phrase offline — paper or hardware wallet.',
              'BTNG support will NEVER ask for your private key.',
              'Generated entirely on-device — no keys leave your phone.',
            ].map((tip, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <MaterialIcons name="shield" size={11} color={Colors.warning} style={{ marginTop: 2 }} />
                <Text style={[s.bodyText, { color: Colors.warning, flex: 1 }]}>{tip}</Text>
              </View>
            ))}
          </View>

          {/* Restore option */}
          <TouchableOpacity style={[s.restoreLink]} onPress={() => setTab('restore')} activeOpacity={0.8}>
            <MaterialIcons name="restore" size={14} color={Colors.textMuted} />
            <Text style={s.restoreLinkText}>Already have a seed phrase? Restore wallet →</Text>
          </TouchableOpacity>

          {/* Generate button */}
          <TouchableOpacity
            style={[s.generateBtn, generating && { opacity: 0.55 }]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating
              ? <ActivityIndicator size="small" color={Colors.bg} />
              : <MaterialIcons name="add-circle" size={22} color={Colors.bg} />}
            <Text style={s.generateBtnText}>
              {generating ? 'Generating secure wallet…' : 'Generate BTNG GoldCoin Wallet'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 32 }} />
        </ScrollView>
      ) : (
        <>
          {/* Address hero strip */}
          <View style={[s.addrHero, { borderColor: Colors.primary + '66' }]}>
            <View style={s.addrHeroLeft}>
              <Text style={s.addrHeroLabel}>BTNG GoldCoin Address</Text>
              <Text style={s.addrHeroAddr} numberOfLines={1} ellipsizeMode="middle">
                {wallet.address}
              </Text>
              <Text style={s.addrHeroNetwork}>{wallet.network}</Text>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <CopyBtn value={wallet.address} label="Copy" />
              <View style={[s.validBadge, { backgroundColor: validateBtngAddress(wallet.address) ? Colors.successBg : Colors.errorBg, borderColor: (validateBtngAddress(wallet.address) ? Colors.success : Colors.error) + '55' }]}>
                <MaterialIcons name={validateBtngAddress(wallet.address) ? 'check-circle' : 'error'} size={10} color={validateBtngAddress(wallet.address) ? Colors.success : Colors.error} />
                <Text style={[s.validBadgeText, { color: validateBtngAddress(wallet.address) ? Colors.success : Colors.error }]}>
                  {validateBtngAddress(wallet.address) ? 'VALID' : 'INVALID'}
                </Text>
              </View>
            </View>
          </View>

          {/* Tabs */}
          <View style={s.tabRow}>
            {TABS.map(t => (
              <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
                <MaterialIcons name={t.icon as any} size={11} color={tab === t.key ? Colors.bg : Colors.textMuted} />
                <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

            {/* ── KEYS TAB ──────────────────────────────────────────────── */}
            {tab === 'keys' && (
              <>
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={{ fontSize: 20 }}>🥇</Text>
                    <Text style={[s.cardTitle, { color: Colors.primary }]}>BTNG GoldCoin Wallet</Text>
                    <TouchableOpacity
                      style={[cb.btn, { borderColor: Colors.primary + '44', backgroundColor: Colors.primaryGlow }]}
                      onPress={handleExportSummary}
                    >
                      <MaterialIcons name="file-download" size={13} color={Colors.primary} />
                      <Text style={[cb.label, { color: Colors.primary }]}>Export</Text>
                    </TouchableOpacity>
                  </View>

                  <FieldRow label="BTNG ADDRESS (35 chars)" value={wallet.address} color={Colors.primary} mono />
                  <FieldRow label="EVM ADDRESS (Ethereum compatible)" value={wallet.evmAddress} color="#627EEA" mono />
                  <FieldRow label="PUBLIC KEY (uncompressed, 65 bytes)" value={wallet.publicKey} color={Colors.success} mono />
                  <FieldRow label="PUBLIC KEY (compressed, 33 bytes)" value={wallet.publicKeyCompressed} color={Colors.success} mono />
                  <FieldRow label="DERIVATION PATH" value={wallet.derivationPath} color={Colors.textSecondary} />
                  <FieldRow label="COIN TYPE" value={`${wallet.coinType} (BTNG54)`} color={Colors.warning} />
                  <FieldRow label="CHAIN ID" value={wallet.chainId} color={Colors.primary} />
                  <FieldRow label="NETWORK" value={wallet.network} color={Colors.textPrimary} />
                  <FieldRow label="CREATED AT" value={new Date(wallet.createdAt).toLocaleString()} color={Colors.textSecondary} />

                  {/* Private key — locked behind reveal */}
                  <View style={[fr.wrap, { borderColor: Colors.error + '44', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.sm }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MaterialIcons name="warning" size={13} color={Colors.error} />
                      <Text style={[fr.label, { color: Colors.error }]}>PRIVATE KEY — KEEP SECRET</Text>
                    </View>
                    {pkRevealed ? (
                      <View style={fr.row}>
                        <Text style={[fr.value, { color: Colors.error, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 }]} selectable>
                          {wallet.privateKey}
                        </Text>
                        <CopyBtn value={wallet.privateKey} />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[s.revealBtn]}
                        onPress={() => setConfirmModal(true)}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons name="lock" size={14} color={Colors.error} />
                        <Text style={s.revealBtnText}>Tap to reveal private key</Text>
                        <MaterialIcons name="chevron-right" size={14} color={Colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Re-generate */}
                <TouchableOpacity style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderColor: Colors.warning + '44' }]} onPress={() => setConfirmModal(false) || showAlert('Generate New Wallet', 'This will replace the current wallet. Make sure you have backed up your seed phrase.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Generate New', style: 'destructive', onPress: handleGenerate }])} activeOpacity={0.85}>
                  <MaterialIcons name="refresh" size={18} color={Colors.warning} />
                  <Text style={[s.cardTitle, { color: Colors.warning }]}>Generate New Wallet</Text>
                  <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.warning} />
                </TouchableOpacity>
              </>
            )}

            {/* ── MNEMONIC TAB ──────────────────────────────────────────── */}
            {tab === 'mnemonic' && (
              <>
                <View style={[s.card, { borderColor: Colors.warning + '66' }]}>
                  <View style={s.cardHeader}>
                    <MaterialIcons name="warning" size={16} color={Colors.warning} />
                    <Text style={[s.cardTitle, { color: Colors.warning }]}>Seed Phrase Backup</Text>
                  </View>
                  <Text style={[s.bodyText, { color: Colors.warning }]}>
                    Write these 24 words on paper and store them in a safe place. Do NOT store digitally. Do NOT share.
                    Anyone with these words controls your wallet.
                  </Text>
                </View>

                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <MaterialIcons name="grid-view" size={16} color={Colors.primary} />
                    <Text style={s.cardTitle}>24-Word Seed Phrase</Text>
                    <CopyBtn value={wallet.mnemonic} label="Copy All" />
                  </View>
                  <View style={s.wordGrid}>
                    {words.map((word, i) => (
                      <View key={i} style={s.wordCell}>
                        <Text style={s.wordNum}>{i + 1}</Text>
                        <Text style={s.wordText}>{word}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[s.mnemonicWarning]}>
                    <MaterialIcons name="shield" size={13} color={Colors.primary} />
                    <Text style={[s.bodyText, { flex: 1, color: Colors.primary }]}>
                      Verify each word carefully. This phrase is the ONLY way to recover your wallet if you lose access.
                    </Text>
                  </View>
                </View>

                {/* Mnemonic raw copy */}
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <MaterialIcons name="text-fields" size={15} color={Colors.textMuted} />
                    <Text style={[s.cardTitle, { color: Colors.textMuted }]}>Raw Mnemonic String</Text>
                    <CopyBtn value={wallet.mnemonic} label="Copy" />
                  </View>
                  <Text style={[s.bodyText, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: Colors.textSecondary, lineHeight: 18 }]} selectable>
                    {wallet.mnemonic}
                  </Text>
                </View>
              </>
            )}

            {/* ── QR TAB ────────────────────────────────────────────────── */}
            {tab === 'qr' && (
              <>
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <MaterialIcons name="qr-code" size={16} color={Colors.primary} />
                    <Text style={s.cardTitle}>Receive BTNG Payments</Text>
                  </View>
                  <Text style={s.bodyText}>Share this QR code to receive BTNG GoldCoin. It encodes your public address only — your private key is never exposed.</Text>
                </View>

                {/* Receive Address Display */}
                <View style={s.qrCard}>
                  <View style={[s.qrInner, { paddingHorizontal: Spacing.md, paddingVertical: Spacing.lg, alignItems: 'center', gap: Spacing.sm }]}>
                    <MaterialIcons name="account-balance-wallet" size={48} color={Colors.primary} />
                    <Text style={{ fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false }}>BTNG GOLDCOIN ADDRESS</Text>
                    <View style={{ backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.md, width: '100%' }}>
                      <Text style={{ fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.primary, fontWeight: FontWeight.heavy, textAlign: 'center', letterSpacing: 0.5, includeFontPadding: false }} selectable>{wallet.address}</Text>
                    </View>
                    <View style={{ backgroundColor: '#627EEA18', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#627EEA44', padding: Spacing.sm + 2, width: '100%' }}>
                      <Text style={{ fontSize: 9, color: '#627EEA', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center', includeFontPadding: false }} selectable numberOfLines={1} ellipsizeMode="middle">{wallet.evmAddress}</Text>
                    </View>
                  </View>
                  <Text style={[s.qrAddrText, { color: Colors.primary }]}>{formatBtngAddress(wallet.address)}</Text>
                  <Text style={s.qrNetText}>{wallet.network}</Text>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
                    <TouchableOpacity style={[s.qrActionBtn, { flex: 1, borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow }]} onPress={() => Clipboard.setStringAsync(wallet.address).catch(()=>{})} activeOpacity={0.8}>
                      <MaterialIcons name="content-copy" size={14} color={Colors.primary} />
                      <Text style={[s.qrActionBtnText, { color: Colors.primary }]}>Copy Address</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.qrActionBtn, { flex: 1, backgroundColor: Colors.primary }, shareLoading && { opacity: 0.55 }]} onPress={handleShareQr} disabled={shareLoading} activeOpacity={0.85}>
                      {shareLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="share" size={14} color={Colors.bg} />}
                      <Text style={[s.qrActionBtnText, { color: Colors.bg }]}>{shareLoading ? 'Saving…' : 'Share Address'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* EVM QR */}
                <View style={[s.card, { borderColor: '#627EEA55' }]}>
                  <View style={s.cardHeader}>
                    <Text style={{ fontSize: 18 }}>🔷</Text>
                    <Text style={[s.cardTitle, { color: '#627EEA' }]}>EVM Compatible Address</Text>
                    <CopyBtn value={wallet.evmAddress} label="Copy" />
                  </View>
                  <Text style={s.bodyText}>Use this address for Ethereum, Polygon, and other EVM-compatible networks.</Text>
                  <Text style={[s.bodyText, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#627EEA', fontSize: 11 }]} selectable>
                    {wallet.evmAddress}
                  </Text>
                </View>
              </>
            )}

            {/* ── RESTORE TAB ───────────────────────────────────────────── */}
            {tab === 'restore' && (
              <>
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <MaterialIcons name="restore" size={16} color={Colors.primary} />
                    <Text style={s.cardTitle}>Restore from Seed Phrase</Text>
                  </View>
                  <Text style={s.bodyText}>
                    Enter your 12 or 24-word BIP-39 mnemonic to restore your BTNG GoldCoin wallet.
                    The derivation path{' '}
                    <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.primary }}>
                      m/44'/9999'/0'/0/0
                    </Text>{' '}
                    will be used to derive your BTNG address.
                  </Text>
                </View>

                <View style={s.card}>
                  <Text style={s.inputLabel}>SEED PHRASE (12 or 24 words, space-separated)</Text>
                  <TextInput
                    style={[s.inputField, { minHeight: 100, textAlignVertical: 'top' }]}
                    value={restorePhrase}
                    onChangeText={setRestorePhrase}
                    placeholder="word1 word2 word3 … word24"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    secureTextEntry
                  />
                  <View style={[s.card, { borderColor: Colors.warning + '44', backgroundColor: Colors.warningBg, marginTop: 0 }]}>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                      <MaterialIcons name="warning" size={13} color={Colors.warning} />
                      <Text style={[s.bodyText, { flex: 1, color: Colors.warning }]}>
                        Type your phrase manually. Never paste from clipboard if you are on a public or shared device.
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[s.generateBtn, (restoreLoading || restorePhrase.trim().split(/\s+/).length < 12) && { opacity: 0.4 }]}
                    onPress={handleRestore}
                    disabled={restoreLoading || restorePhrase.trim().split(/\s+/).length < 12}
                    activeOpacity={0.85}
                  >
                    {restoreLoading
                      ? <ActivityIndicator size="small" color={Colors.bg} />
                      : <MaterialIcons name="restore" size={20} color={Colors.bg} />}
                    <Text style={s.generateBtnText}>
                      {restoreLoading ? 'Restoring wallet…' : 'Restore BTNG Wallet'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Word count indicator */}
                {restorePhrase.trim().length > 0 && (
                  <View style={[s.card, { borderColor: (restorePhrase.trim().split(/\s+/).length >= 12 ? Colors.success : Colors.border) + '55' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons
                        name={restorePhrase.trim().split(/\s+/).length >= 24 ? 'check-circle' : restorePhrase.trim().split(/\s+/).length >= 12 ? 'check' : 'schedule'}
                        size={16}
                        color={restorePhrase.trim().split(/\s+/).length >= 12 ? Colors.success : Colors.warning}
                      />
                      <Text style={[s.bodyText, { color: restorePhrase.trim().split(/\s+/).length >= 12 ? Colors.success : Colors.warning }]}>
                        {restorePhrase.trim().split(/\s+/).length} word{restorePhrase.trim().split(/\s+/).length !== 1 ? 's' : ''} entered
                        {restorePhrase.trim().split(/\s+/).length >= 24 ? ' — ready to restore' : restorePhrase.trim().split(/\s+/).length >= 12 ? ' — minimum reached' : ' — need at least 12'}
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={{ height: insets.bottom + 48 }} />
          </ScrollView>
        </>
      )}

      {/* ── Private Key Reveal Confirmation Modal ─── */}
      <Modal visible={confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(false)}>
        <View style={cm.overlay}>
          <View style={cm.sheet}>
            <View style={cm.iconWrap}>
              <MaterialIcons name="warning" size={36} color={Colors.error} />
            </View>
            <Text style={cm.title}>Reveal Private Key?</Text>
            <Text style={cm.body}>
              Your private key gives{' '}
              <Text style={{ fontWeight: FontWeight.heavy, color: Colors.error }}>COMPLETE control</Text>
              {' '}over your wallet and all funds inside.
              {'\n\n'}
              • Never share it with anyone{'\n'}
              • Never enter it on a website{'\n'}
              • BTNG will NEVER ask for it{'\n'}
              • Store it offline, never digitally
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <TouchableOpacity style={[cm.btn, { flex: 1, backgroundColor: Colors.bgElevated, borderColor: Colors.border }]} onPress={() => setConfirmModal(false)} activeOpacity={0.8}>
                <Text style={[cm.btnText, { color: Colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[cm.btn, { flex: 1, backgroundColor: Colors.error }]}
                onPress={() => { setPkRevealed(true); setConfirmModal(false); }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="visibility" size={14} color={Colors.bg} />
                <Text style={[cm.btnText, { color: Colors.bg }]}>I Understand — Reveal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.bg },
  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:       { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
  topSub:          { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  scroll:          { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  heroCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl + 4, borderWidth: 2, borderColor: Colors.primary + '55', alignItems: 'center', gap: Spacing.md },
  heroTitle:       { fontSize: FontSize.xl + 2, fontWeight: FontWeight.heavy, color: Colors.primary, textAlign: 'center', includeFontPadding: false },
  heroSub:         { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false },

  card:            { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardHeader:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle:       { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  specRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  specLabel:       { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  specValue:       { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'right', maxWidth: '58%' },
  bodyText:        { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19, includeFontPadding: false },

  generateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  generateBtnText: { fontSize: FontSize.md + 1, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },

  restoreLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
  restoreLinkText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  addrHero:        { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addrHeroLeft:    { flex: 1, gap: 3 },
  addrHeroLabel:   { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  addrHeroAddr:    { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  addrHeroNetwork: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  validBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  validBadgeText:  { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },

  tabRow:          { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  tabBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: Spacing.sm - 1, borderRadius: Radius.md },
  tabBtnActive:    { backgroundColor: Colors.primary },
  tabText:         { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:   { color: Colors.bg },

  revealBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.errorBg, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.error + '44' },
  revealBtnText:   { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },

  wordGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wordCell:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border, minWidth: 90 },
  wordNum:         { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false, minWidth: 16, textAlign: 'right' },
  wordText:        { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  mnemonicWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },

  qrCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  qrInner:         { padding: Spacing.md, backgroundColor: '#FFFFFF', borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.border + '44', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  qrAddrText:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  qrNetText:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  qrActionBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.sm + 4 },
  qrActionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },

  inputLabel:      { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  inputField:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, lineHeight: 20 },
});

const cm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(6,6,8,0.92)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  sheet:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', maxWidth: 380, borderWidth: 1.5, borderColor: Colors.error + '55', gap: Spacing.md },
  iconWrap: { alignSelf: 'center', width: 72, height: 72, borderRadius: 22, backgroundColor: Colors.errorBg, borderWidth: 1.5, borderColor: Colors.error + '55', alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.error, textAlign: 'center', includeFontPadding: false },
  body:     { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22, includeFontPadding: false },
  btn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1 },
  btnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
});
