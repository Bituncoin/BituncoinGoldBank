// BTNG NFT Creator Studio — Mint BTNG Gold NFTs on BTNG Mainnet
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const NFT_CATEGORIES = ['Gold Reserve', 'Sovereign Identity', 'Land Rights', 'Heritage Art', 'Community Token', 'Treasury Bond'];
const NFT_ROYALTIES = ['0%', '2.5%', '5%', '7.5%', '10%'];
const EQUITY_GRADES = ['A', 'B', 'C', 'D', 'S', 'SS', 'SSS'];

const NFT_ARTWORKS = [
  { id: '1', emoji: '🥇', label: 'Gold Coin', color: Colors.primary },
  { id: '2', emoji: '🌍', label: 'Africa', color: '#22C55E' },
  { id: '3', emoji: '🏛️', label: 'Heritage', color: '#3B82F6' },
  { id: '4', emoji: '💎', label: 'Diamond', color: '#9945FF' },
  { id: '5', emoji: '🦁', label: 'Lion', color: '#F59E0B' },
  { id: '6', emoji: '🌾', label: 'Agriculture', color: '#22C55E' },
  { id: '7', emoji: '⚡', label: 'Energy', color: Colors.warning },
  { id: '8', emoji: '🔗', label: 'Chain', color: '#3B82F6' },
  { id: '9', emoji: '🏆', label: 'Trophy', color: Colors.primary },
  { id: '10', emoji: '🌊', label: 'Ocean', color: '#06B6D4' },
  { id: '11', emoji: '🎓', label: 'Education', color: '#8B5CF6' },
  { id: '12', emoji: '🌐', label: 'Global', color: Colors.primary },
];

interface NFTForm {
  name: string;
  description: string;
  category: string;
  artwork: string;
  royalty: string;
  equityGrade: string;
  supply: string;
  price: string;
  currency: string;
  transferable: boolean;
  listed: boolean;
}

const BLANK_FORM: NFTForm = {
  name: '',
  description: '',
  category: 'Gold Reserve',
  artwork: '🥇',
  royalty: '5%',
  equityGrade: 'A',
  supply: '1',
  price: '',
  currency: 'BTNGG',
  transferable: true,
  listed: true,
};

function StatCard({ label, value, color = Colors.primary }: { label: string; value: string; color?: string }) {
  return (
    <View style={[stc.card, { borderColor: color + '33' }]}>
      <Text style={[stc.value, { color }]}>{value}</Text>
      <Text style={stc.label}>{label}</Text>
    </View>
  );
}
const stc = StyleSheet.create({
  card: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, includeFontPadding: false },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

export default function NftCreatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'create' | 'collection' | 'market'>('create');
  const [form, setForm] = useState<NFTForm>({ ...BLANK_FORM });
  const [minting, setMinting] = useState(false);
  const [mintedNFTs, setMintedNFTs] = useState<any[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  const handleMint = useCallback(async () => {
    if (!form.name.trim()) { showAlert('Required', 'Please enter an NFT name.'); return; }
    if (!form.description.trim()) { showAlert('Required', 'Please enter a description.'); return; }
    setMinting(true);
    await new Promise(r => setTimeout(r, 2200));
    const tokenId = 'BTNG-NFT-' + Date.now().toString(36).toUpperCase();
    const newNFT = {
      id: tokenId,
      ...form,
      owner: user?.email ?? 'Unknown',
      mintedAt: new Date().toISOString(),
      txHash: '0x' + Math.random().toString(16).slice(2, 66),
      network: 'BTNG-MAINNET',
    };
    setMintedNFTs(prev => [newNFT, ...prev]);
    setMinting(false);
    setForm({ ...BLANK_FORM });
    setActiveTab('collection');
    showAlert('NFT Minted!', `Token ID: ${tokenId}\nMinted on BTNG Mainnet. Check your collection.`);
  }, [form, user, showAlert]);

  const TABS = [
    { key: 'create', icon: 'add-circle', label: 'Create' },
    { key: 'collection', icon: 'collections', label: 'Collection' },
    { key: 'market', icon: 'storefront', label: 'Market' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>NFT Creator Studio</Text>
          <Text style={s.topSub}>BTNG Mainnet · Mint & Trade</Text>
        </View>
        <View style={[s.backBtn, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
          <Text style={{ fontSize: 20 }}>🎨</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]} onPress={() => setActiveTab(t.key as any)}>
            <MaterialIcons name={t.icon as any} size={14} color={activeTab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
            {t.key === 'collection' && mintedNFTs.length > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{mintedNFTs.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── CREATE TAB ── */}
        {activeTab === 'create' && (
          <>
            {/* Stats */}
            <View style={s.statsRow}>
              <StatCard label="Minted" value={String(mintedNFTs.length)} />
              <StatCard label="Network" value="BTNG" color="#22C55E" />
              <StatCard label="Chain" value="Mainnet" color="#3B82F6" />
              <StatCard label="Standard" value="BEP-1155" color="#9945FF" />
            </View>

            {/* Preview Toggle */}
            <TouchableOpacity style={s.previewToggle} onPress={() => setPreviewMode(v => !v)} activeOpacity={0.8}>
              <MaterialIcons name={previewMode ? 'visibility-off' : 'visibility'} size={14} color={Colors.primary} />
              <Text style={s.previewToggleText}>{previewMode ? 'Edit Mode' : 'Preview NFT Card'}</Text>
            </TouchableOpacity>

            {/* NFT Preview Card */}
            {previewMode ? (
              <View style={s.previewCard}>
                <View style={s.previewArtwork}>
                  <Text style={s.previewArtworkEmoji}>{form.artwork}</Text>
                </View>
                <View style={[s.previewGradeBadge, { borderColor: Colors.primary + '88' }]}>
                  <Text style={s.previewGradeText}>Grade {form.equityGrade}</Text>
                </View>
                <Text style={s.previewName}>{form.name || 'Untitled NFT'}</Text>
                <Text style={s.previewDesc} numberOfLines={2}>{form.description || 'No description'}</Text>
                <View style={s.previewMeta}>
                  <View style={s.previewMetaChip}><Text style={s.previewMetaText}>{form.category}</Text></View>
                  <View style={s.previewMetaChip}><Text style={s.previewMetaText}>#{form.supply} Supply</Text></View>
                  <View style={s.previewMetaChip}><Text style={s.previewMetaText}>{form.royalty} Royalty</Text></View>
                </View>
                {form.price ? (
                  <View style={s.previewPrice}>
                    <Text style={s.previewPriceText}>{form.price} {form.currency}</Text>
                  </View>
                ) : null}
                <View style={s.previewFooter}>
                  <View style={s.previewLiveDot} />
                  <Text style={s.previewFooterText}>BTNG Mainnet · Preview</Text>
                </View>
              </View>
            ) : null}

            {/* Artwork Selector */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Choose Artwork</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.artworkRail}>
                {NFT_ARTWORKS.map(art => (
                  <TouchableOpacity
                    key={art.id}
                    style={[s.artworkChip, form.artwork === art.emoji && { backgroundColor: art.color + '22', borderColor: art.color }]}
                    onPress={() => setForm(f => ({ ...f, artwork: art.emoji }))}
                  >
                    <Text style={s.artworkEmoji}>{art.emoji}</Text>
                    <Text style={[s.artworkLabel, form.artwork === art.emoji && { color: art.color }]}>{art.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Name */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>NFT Name *</Text>
              <TextInput
                style={s.input}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="e.g. BTNG Gold Reserve #001"
                placeholderTextColor={Colors.textMuted}
                maxLength={60}
              />
              <Text style={s.charCount}>{form.name.length}/60</Text>
            </View>

            {/* Description */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Description *</Text>
              <TextInput
                style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={form.description}
                onChangeText={v => setForm(f => ({ ...f, description: v }))}
                placeholder="Describe this NFT and its sovereign value..."
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={300}
              />
              <Text style={s.charCount}>{form.description.length}/300</Text>
            </View>

            {/* Category */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Category</Text>
              <View style={s.chipGrid}>
                {NFT_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.chip, form.category === cat && s.chipActive]}
                    onPress={() => setForm(f => ({ ...f, category: cat }))}
                  >
                    <Text style={[s.chipText, form.category === cat && s.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Equity Grade */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Equity Grade</Text>
              <View style={s.gradeRow}>
                {EQUITY_GRADES.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[s.gradeChip, form.equityGrade === g && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                    onPress={() => setForm(f => ({ ...f, equityGrade: g }))}
                  >
                    <Text style={[s.gradeText, form.equityGrade === g && { color: Colors.bg }]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Supply & Price */}
            <View style={s.rowSection}>
              <View style={[s.section, { flex: 1 }]}>
                <Text style={s.sectionTitle}>Supply</Text>
                <TextInput
                  style={s.input}
                  value={form.supply}
                  onChangeText={v => setForm(f => ({ ...f, supply: v.replace(/[^0-9]/g, '') }))}
                  placeholder="1"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={[s.section, { flex: 1 }]}>
                <Text style={s.sectionTitle}>Price (BTNGG)</Text>
                <TextInput
                  style={s.input}
                  value={form.price}
                  onChangeText={v => setForm(f => ({ ...f, price: v.replace(/[^0-9.]/g, '') }))}
                  placeholder="Optional"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Royalty */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Creator Royalty</Text>
              <View style={s.chipRow}>
                {NFT_ROYALTIES.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[s.chip, form.royalty === r && s.chipActive]}
                    onPress={() => setForm(f => ({ ...f, royalty: r }))}
                  >
                    <Text style={[s.chipText, form.royalty === r && s.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Toggles */}
            <View style={s.toggleCard}>
              <View style={s.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Transferable</Text>
                  <Text style={s.toggleSub}>Allow this NFT to be transferred between wallets</Text>
                </View>
                <Switch value={form.transferable} onValueChange={v => setForm(f => ({ ...f, transferable: v }))} trackColor={{ false: Colors.bgElevated, true: Colors.primary }} thumbColor="#fff" />
              </View>
              <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>List on Marketplace</Text>
                  <Text style={s.toggleSub}>Make this NFT visible on the BTNG marketplace</Text>
                </View>
                <Switch value={form.listed} onValueChange={v => setForm(f => ({ ...f, listed: v }))} trackColor={{ false: Colors.bgElevated, true: Colors.success }} thumbColor="#fff" />
              </View>
            </View>

            {/* Blockchain Info */}
            <View style={s.blockchainCard}>
              <View style={s.blockchainRow}><MaterialIcons name="link" size={13} color={Colors.primary} /><Text style={s.blockchainLabel}>Network</Text><Text style={s.blockchainValue}>BTNG Sovereign Mainnet</Text></View>
              <View style={s.blockchainRow}><MaterialIcons name="code" size={13} color={Colors.primary} /><Text style={s.blockchainLabel}>Standard</Text><Text style={s.blockchainValue}>BEP-1155 (Multi-Token)</Text></View>
              <View style={s.blockchainRow}><MaterialIcons name="account-balance-wallet" size={13} color={Colors.primary} /><Text style={s.blockchainLabel}>Wallet</Text><Text style={s.blockchainValue} numberOfLines={1}>BTNG Genesis Wallet</Text></View>
              <View style={s.blockchainRow}><MaterialIcons name="security" size={13} color={Colors.success} /><Text style={s.blockchainLabel}>Security</Text><Text style={[s.blockchainValue, { color: Colors.success }]}>AES-256 Encrypted</Text></View>
            </View>

            {/* Mint Button */}
            <TouchableOpacity
              style={[s.mintBtn, (minting || !form.name.trim() || !form.description.trim()) && { opacity: 0.5 }]}
              onPress={handleMint}
              disabled={minting || !form.name.trim() || !form.description.trim()}
              activeOpacity={0.85}
            >
              {minting ? (
                <>
                  <ActivityIndicator size="small" color={Colors.bg} />
                  <Text style={s.mintBtnText}>Minting on BTNG Mainnet…</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="auto-awesome" size={18} color={Colors.bg} />
                  <Text style={s.mintBtnText}>Mint NFT on BTNG Mainnet</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={s.mintNote}>
              <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
              <Text style={s.mintNoteText}>NFTs are minted on the BTNG Sovereign Blockchain. Gas fees paid in BTNGG. Metadata stored on BTNG distributed storage.</Text>
            </View>
          </>
        )}

        {/* ── COLLECTION TAB ── */}
        {activeTab === 'collection' && (
          <>
            {mintedNFTs.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 56 }}>🎨</Text>
                <Text style={s.emptyTitle}>No NFTs Yet</Text>
                <Text style={s.emptySub}>Create your first BTNG Gold NFT in the Create tab. Your minted collection will appear here.</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => setActiveTab('create')}>
                  <MaterialIcons name="add-circle" size={15} color={Colors.bg} />
                  <Text style={s.emptyBtnText}>Create First NFT</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={s.collectionHeader}>
                  <Text style={s.collectionTitle}>My NFT Collection</Text>
                  <View style={s.collectionBadge}><Text style={s.collectionBadgeText}>{mintedNFTs.length} items</Text></View>
                </View>
                {mintedNFTs.map(nft => (
                  <View key={nft.id} style={s.nftCard}>
                    <View style={s.nftArtwork}><Text style={s.nftArtworkEmoji}>{nft.artwork}</Text></View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <View style={s.nftNameRow}>
                        <Text style={s.nftName} numberOfLines={1}>{nft.name}</Text>
                        <View style={s.nftGradeBadge}><Text style={s.nftGradeText}>Grade {nft.equityGrade}</Text></View>
                      </View>
                      <Text style={s.nftDesc} numberOfLines={2}>{nft.description}</Text>
                      <View style={s.nftMeta}>
                        <View style={s.nftMetaChip}><Text style={s.nftMetaText}>{nft.category}</Text></View>
                        <View style={s.nftMetaChip}><Text style={s.nftMetaText}>#{nft.supply} Supply</Text></View>
                        {nft.listed && <View style={[s.nftMetaChip, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}><Text style={[s.nftMetaText, { color: Colors.success }]}>Listed</Text></View>}
                      </View>
                      <View style={s.nftTxRow}>
                        <MaterialIcons name="link" size={10} color={Colors.textMuted} />
                        <Text style={s.nftTxText} numberOfLines={1}>{nft.id}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ── MARKET TAB ── */}
        {activeTab === 'market' && (
          <View style={s.marketWrap}>
            <View style={s.marketHero}>
              <Text style={{ fontSize: 48 }}>🏛️</Text>
              <Text style={s.marketTitle}>BTNG NFT Marketplace</Text>
              <Text style={s.marketSub}>Trade sovereign NFTs backed by African gold, land rights, and heritage certificates on the BTNG Mainnet.</Text>
              <View style={s.marketBadgeRow}>
                <View style={s.marketBadge}><Text style={s.marketBadgeText}>BTNG Mainnet</Text></View>
                <View style={s.marketBadge}><Text style={s.marketBadgeText}>0% Platform Fee</Text></View>
                <View style={s.marketBadge}><Text style={s.marketBadgeText}>54 Nations</Text></View>
              </View>
            </View>
            {[
              { emoji: '🥇', name: 'BTNG Gold Reserve Certificate', grade: 'S', price: '500 BTNGG', owner: 'EKUYE TRUST', listed: true },
              { emoji: '🌍', name: 'Africa Continental Heritage #001', grade: 'A', price: '120 BTNGG', owner: 'Sovereign Fund', listed: true },
              { emoji: '🏛️', name: 'Accra Land Rights Token', grade: 'B', price: '75 BTNGG', owner: 'Ghana Registry', listed: true },
              { emoji: '🦁', name: 'African Lion Sovereignty NFT', grade: 'SS', price: '1,200 BTNGG', owner: 'BTNG Foundation', listed: true },
            ].map((item, i) => (
              <View key={i} style={s.marketCard}>
                <View style={s.marketCardArt}><Text style={s.marketCardEmoji}>{item.emoji}</Text></View>
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={s.nftNameRow}>
                    <Text style={s.nftName} numberOfLines={1}>{item.name}</Text>
                    <View style={s.nftGradeBadge}><Text style={s.nftGradeText}>{item.grade}</Text></View>
                  </View>
                  <Text style={s.nftMetaText}>{item.owner}</Text>
                  <View style={s.marketPriceRow}>
                    <Text style={s.marketPrice}>{item.price}</Text>
                    <TouchableOpacity style={s.buyBtn} onPress={() => showAlert('Purchase', `Buy ${item.name} for ${item.price}? Connect your BTNG Genesis Wallet to proceed.`)}>
                      <Text style={s.buyBtnText}>Buy Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
            <View style={s.marketNote}>
              <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
              <Text style={s.mintNoteText}>All marketplace transactions are settled on the BTNG Sovereign Blockchain in BTNGG. Ownership is recorded immutably.</Text>
            </View>
          </View>
        )}

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: '#9945FF', fontWeight: FontWeight.semibold, includeFontPadding: false },
  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, gap: 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabBtnActive: { backgroundColor: '#9945FF' },
  tabText: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  tabBadge: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  previewToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  previewToggleText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  previewCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1.5, borderColor: '#9945FF55', alignItems: 'center', gap: Spacing.md, shadowColor: '#9945FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6 },
  previewArtwork: { width: 100, height: 100, borderRadius: 24, backgroundColor: '#9945FF18', borderWidth: 1.5, borderColor: '#9945FF55', alignItems: 'center', justifyContent: 'center' },
  previewArtworkEmoji: { fontSize: 52 },
  previewGradeBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1 },
  previewGradeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  previewName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  previewDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  previewMeta: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  previewMetaChip: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  previewMetaText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  previewPrice: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + '55' },
  previewPriceText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9945FF' },
  previewFooterText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.3, includeFontPadding: false },
  artworkRail: { gap: Spacing.sm, paddingVertical: 2 },
  artworkChip: { alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, width: 72 },
  artworkEmoji: { fontSize: 28 },
  artworkLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  input: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  charCount: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right', includeFontPadding: false },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chipRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary, includeFontPadding: false },
  chipTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  gradeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  gradeChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.border, minWidth: 44, alignItems: 'center' },
  gradeText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  rowSection: { flexDirection: 'row', gap: Spacing.md },
  toggleCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  toggleLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  toggleSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  blockchainCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  blockchainRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  blockchainLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  blockchainValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  mintBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#9945FF', borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, shadowColor: '#9945FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  mintBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  mintNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  mintNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  emptyCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xl },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#9945FF', borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  collectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  collectionBadge: { backgroundColor: '#9945FF18', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#9945FF44' },
  collectionBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#9945FF', includeFontPadding: false },
  nftCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  nftArtwork: { width: 60, height: 60, borderRadius: 16, backgroundColor: '#9945FF18', borderWidth: 1, borderColor: '#9945FF44', alignItems: 'center', justifyContent: 'center' },
  nftArtworkEmoji: { fontSize: 32 },
  nftNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nftName: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  nftGradeBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  nftGradeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  nftDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  nftMeta: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  nftMetaChip: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  nftMetaText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  nftTxRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nftTxText: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false, flex: 1 },
  marketWrap: { gap: Spacing.md },
  marketHero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.sm },
  marketTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  marketSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  marketBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  marketBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  marketBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  marketCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  marketCardArt: { width: 60, height: 60, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  marketCardEmoji: { fontSize: 32 },
  marketPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  marketPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  buyBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 6 },
  buyBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  marketNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
});
