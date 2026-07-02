// BTNG AI Creator Studio — Content, Analysis & AI-Powered Financial Intelligence
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const AI_TOOLS = [
  { id: 'market', emoji: '📊', title: 'Market Analysis', desc: 'AI analysis of BTNG, gold, and African markets', color: Colors.primary },
  { id: 'blog', emoji: '✍️', title: 'Blog Writer', desc: 'Generate professional BTNG blog articles', color: '#3B82F6' },
  { id: 'nft', emoji: '🎨', title: 'NFT Description', desc: 'Write compelling NFT metadata and descriptions', color: '#9945FF' },
  { id: 'certificate', emoji: '📜', title: 'Certificate Text', desc: 'Generate sovereign certificate content', color: Colors.warning },
  { id: 'whitepaper', emoji: '📄', title: 'Whitepaper Generator', desc: 'Draft BTNG project whitepapers', color: '#22C55E' },
  { id: 'invest', emoji: '💡', title: 'Investment Report', desc: 'AI-powered BTNG investment summaries', color: '#F59E0B' },
];

const QUICK_PROMPTS = [
  'Analyze BTNG gold price outlook for Africa',
  'Write a blog post about BTNG and Ghana\'s economy',
  'Generate an NFT description for a gold certificate',
  'Explain BTNG to a new investor in simple terms',
  'Compare BTNG with Bitcoin as a store of value',
  'Write a press release about BTNG launching in 54 African nations',
];

// Pre-generated responses for demo
const AI_RESPONSES: Record<string, string> = {
  market: `**BTNG Gold Market Analysis — May 2026**

The BTNG Gold Coin (BTNGG) continues to demonstrate strong performance as gold spot prices hold above $3,250/oz. Key insights:

📈 **Price Action**: BTNGG at $3.250 (+0.14% 24h) — tracking XAU precisely at 1/1000 ratio
🌍 **African Demand**: Increased institutional adoption across Ghana, Nigeria, and Kenya driving volume
💰 **GHS Conversion**: 1 BTNGG = ₵38.07 at current Bank of Ghana rate (1 USD = ₵11.71)
🏦 **Reserve Status**: 204.2B BTNGG backed by $29.5T continental reserve — 295:1 ratio maintained

**Recommendation**: BTNG remains a strong inflation hedge for African investors seeking gold exposure without physical storage challenges. The upcoming MTN MoMo payment integration across 54 nations is expected to drive significant volume growth in Q3 2026.`,

  blog: `**BTNG Gold Coin: Africa's Answer to Financial Sovereignty**

*Published by BTNG Research Team | May 2026*

For too long, Africa's vast wealth has been extracted and stored in foreign vaults. The continent holds 40% of the world's gold reserves, 10% of global oil deposits, and 60% of uncultivated arable land — yet its citizens have historically been shut out from owning a meaningful share of this wealth.

BTNG Gold Coin (BTNGG) changes this equation forever.

**What is BTNG?**
BTNG is a gold-backed digital currency pegged to 1/1000 troy ounce of XAU, anchored at the Bank of Ghana vault in Accra. Every token is 100% backed by physical gold, audited quarterly, and governed by the 54 nations of the African Union.

**Why It Matters for Ghana**
With the Ghana Cedi under persistent inflationary pressure, BTNG offers Ghanaian citizens a store of value that cannot be inflated away. Unlike bank savings, BTNG appreciates with gold — one of the most reliable stores of value in human history.

The integration with MTN MoMo (Merchant ID 248059) means any Ghanaian with a mobile phone can now buy, sell, and transact in gold-backed digital currency.

**The Road Ahead**
With 54 nations now backing the BTNG reserve, the path to a pan-African digital gold standard is clear. By 2030, EKUYE Digital Gateway Trust Ltd aims to have 100 million active BTNG wallets across the continent.

*Ghana leads. Africa follows. The world watches.*`,

  nft: `**NFT Metadata: BTNG Gold Reserve Certificate #001**

*Name*: BTNG Sovereign Gold Reserve Certificate #001
*Symbol*: BTNG-CERT-001
*Chain*: BTNG Mainnet (Coin Type 9999)
*Standard*: BEP-1155

**Description**:
This NFT represents a verifiable claim certificate backed by the BTNG Sovereign Gold Reserve, held at the Bank of Ghana Vault 001, Accra. Certificate #001 was minted at the Genesis Block (Block #0, February 18, 2026) and carries Grade-S Equity classification.

**Attributes**:
- Gold Backing: 1 oz XAU equivalent
- Reserve Location: Accra, Ghana Vault 001
- Issuer: EKUYE Digital Gateway Trust Ltd (EIN: 87-0884872)
- Equity Grade: S (Sovereign)
- Transferable: Yes
- Royalty: 5% on secondary sales
- Nations Backing: 54 African Nations`,
};

export default function AiCreatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const [activeTab, setActiveTab] = useState<'tools' | 'chat' | 'history'>('tools');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatGenerating, setChatGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!userPrompt.trim() && !selectedTool) { showAlert('Required', 'Select a tool or enter a prompt.'); return; }
    setGenerating(true);
    setResult('');
    await new Promise(r => setTimeout(r, 2000));
    const toolKey = selectedTool ?? 'market';
    const res = AI_RESPONSES[toolKey] ?? `**BTNG AI Analysis**\n\nBased on your query: "${userPrompt}"\n\nThe BTNG Gold ecosystem is designed for African financial sovereignty. Our AI model analyzes BTNG market data, gold price movements, and macroeconomic factors across 54 African nations to deliver actionable insights.\n\n**Key Points:**\n• BTNG tracks physical gold at 1/1000 oz XAU\n• Backed by Ghana Bank vault + 54-nation GDP\n• MTN MoMo integration for instant GHS conversion\n• 204.2B total supply · $29.5T reserve backing\n\n*This analysis is powered by the BTNG AI engine and should not be considered financial advice.*`;
    setResult(res);
    setGenerating(false);
  }, [userPrompt, selectedTool, showAlert]);

  const handleChat = useCallback(async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatGenerating(true);
    await new Promise(r => setTimeout(r, 1500));
    let aiReply = '';
    const lower = userMsg.toLowerCase();
    if (lower.includes('gold') || lower.includes('price')) {
      aiReply = 'BTNG Gold (BTNGG) is currently trading at $3.250, pegged to 1/1000 oz of XAU. Gold spot is $3,250/oz. The BTNG reserve ratio is 295:1, meaning the reserve holds $29.5T backing 204.2B BTNGG tokens.';
    } else if (lower.includes('ghana') || lower.includes('ghs')) {
      aiReply = '1 USD = ₵11.71 GHS today. 1 BTNGG = ₵38.07 GHS. Ghana is the home of BTNG — the Bank of Ghana Vault 001 in Accra holds the physical gold backing every BTNGG token.';
    } else if (lower.includes('btng') || lower.includes('bitcoin')) {
      aiReply = 'BTNG differs from Bitcoin fundamentally: Bitcoin has no physical backing, while BTNG is backed 1:1000 by physical XAU. Bitcoin is a speculative asset; BTNG is a gold-backed store of value anchored in African sovereignty.';
    } else if (lower.includes('invest') || lower.includes('buy')) {
      aiReply = 'BTNG can be purchased via the BTNG Gold Coin app, through MTN MoMo (Merchant ID 248059), or directly via the BTNG Sovereign wallet. Always do your own research. BTNG is designed as a long-term store of value, not speculative trading.';
    } else {
      aiReply = `Great question about "${userMsg}". BTNG is Africa's first fully sovereign gold-backed digital currency, covering 54 nations with $29.5 trillion in reserve backing. The BTNG AI engine processes data from Bank of Ghana, AU economic reports, and on-chain analytics to deliver real-time insights. How can I help you learn more?`;
    }
    setChatHistory(prev => [...prev, { role: 'ai', text: aiReply }]);
    setChatGenerating(false);
  }, [chatInput]);

  const TABS = [
    { key: 'tools', label: 'AI Tools', icon: 'auto-awesome' },
    { key: 'chat', label: 'AI Chat', icon: 'chat' },
    { key: 'history', label: 'Generated', icon: 'history' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>AI Creator Studio</Text>
          <Text style={s.topSub}>BTNG AI · 54 Nations Intelligence</Text>
        </View>
        <View style={[s.backBtn, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
          <MaterialIcons name="smart-toy" size={20} color="#9945FF" />
        </View>
      </View>

      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]} onPress={() => setActiveTab(t.key as any)}>
            <MaterialIcons name={t.icon as any} size={13} color={activeTab === t.key ? Colors.bg : Colors.textMuted} />
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── AI TOOLS ── */}
        {activeTab === 'tools' && (
          <>
            {/* Hero */}
            <View style={s.hero}>
              <View style={s.heroIconWrap}>
                <MaterialIcons name="smart-toy" size={36} color="#9945FF" />
              </View>
              <Text style={s.heroTitle}>BTNG AI Creator</Text>
              <Text style={s.heroSub}>Generate professional content, market analysis, NFT descriptions, and more — powered by BTNG AI intelligence trained on African financial data.</Text>
            </View>

            {/* Tool Grid */}
            <View style={s.toolGrid}>
              {AI_TOOLS.map(tool => (
                <TouchableOpacity
                  key={tool.id}
                  style={[s.toolCard, selectedTool === tool.id && { borderColor: tool.color, backgroundColor: tool.color + '10' }]}
                  onPress={() => { setSelectedTool(tool.id); setResult(''); setUserPrompt(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={s.toolEmoji}>{tool.emoji}</Text>
                  <Text style={[s.toolTitle, selectedTool === tool.id && { color: tool.color }]}>{tool.title}</Text>
                  <Text style={s.toolDesc}>{tool.desc}</Text>
                  {selectedTool === tool.id && (
                    <View style={[s.selectedBadge, { backgroundColor: tool.color }]}>
                      <Text style={s.selectedBadgeText}>Selected</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Prompts */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Quick Prompts</Text>
              {QUICK_PROMPTS.map((p, i) => (
                <TouchableOpacity key={i} style={s.promptChip} onPress={() => setUserPrompt(p)}>
                  <MaterialIcons name="bolt" size={12} color="#9945FF" />
                  <Text style={s.promptText} numberOfLines={1}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Prompt */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Custom Prompt</Text>
              <TextInput
                style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={userPrompt}
                onChangeText={setUserPrompt}
                placeholder="Ask BTNG AI anything about gold, Africa, markets, NFTs..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            </View>

            {/* Generate Button */}
            <TouchableOpacity
              style={[s.generateBtn, generating && { opacity: 0.6 }]}
              onPress={handleGenerate}
              disabled={generating}
              activeOpacity={0.85}
            >
              {generating ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="auto-awesome" size={18} color={Colors.bg} />}
              <Text style={s.generateBtnText}>{generating ? 'Generating with BTNG AI…' : 'Generate Content'}</Text>
            </TouchableOpacity>

            {/* Result */}
            {result ? (
              <View style={s.resultCard}>
                <View style={s.resultHeader}>
                  <View style={s.resultHeaderLeft}>
                    <View style={s.aiDot} />
                    <Text style={s.resultTitle}>AI Generated Content</Text>
                  </View>
                  <TouchableOpacity style={s.copyBtn} onPress={() => showAlert('Copied', 'Content copied to clipboard.')}>
                    <MaterialIcons name="copy-all" size={14} color="#9945FF" />
                    <Text style={s.copyBtnText}>Copy</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.resultText}>{result}</Text>
                <View style={s.resultFooter}>
                  <MaterialIcons name="verified" size={11} color={Colors.success} />
                  <Text style={s.resultFooterText}>Generated by BTNG AI · 54 Nations Intelligence Model</Text>
                </View>
              </View>
            ) : null}
          </>
        )}

        {/* ── AI CHAT ── */}
        {activeTab === 'chat' && (
          <>
            <View style={s.chatHeader}>
              <View style={s.chatAvatarWrap}>
                <MaterialIcons name="smart-toy" size={24} color="#9945FF" />
              </View>
              <View>
                <Text style={s.chatName}>BTNG AI Private Banker</Text>
                <View style={s.chatStatusRow}>
                  <View style={s.liveDot} />
                  <Text style={s.chatStatus}>Online · 54 Nations Intelligence</Text>
                </View>
              </View>
            </View>

            {chatHistory.length === 0 ? (
              <View style={s.chatEmpty}>
                <Text style={{ fontSize: 48 }}>🤖</Text>
                <Text style={s.chatEmptyTitle}>Ask BTNG AI Anything</Text>
                <Text style={s.chatEmptySub}>Gold prices, BTNG analysis, African markets, investment advice, NFT descriptions — your AI banker is ready.</Text>
                <View style={s.chatSuggestions}>
                  {['What is BTNG Gold?', 'Current gold price in GHS?', 'How to buy BTNG?'].map(q => (
                    <TouchableOpacity key={q} style={s.chatSuggestionChip} onPress={() => { setChatInput(q); }}>
                      <Text style={s.chatSuggestionText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={s.chatMessages}>
                {chatHistory.map((msg, i) => (
                  <View key={i} style={[s.chatBubble, msg.role === 'user' ? s.chatBubbleUser : s.chatBubbleAI]}>
                    {msg.role === 'ai' && (
                      <View style={s.chatAIAvatar}>
                        <MaterialIcons name="smart-toy" size={14} color="#9945FF" />
                      </View>
                    )}
                    <View style={[s.chatBubbleInner, msg.role === 'user' ? s.chatBubbleInnerUser : s.chatBubbleInnerAI]}>
                      <Text style={[s.chatBubbleText, msg.role === 'user' && { color: Colors.bg }]}>{msg.text}</Text>
                    </View>
                  </View>
                ))}
                {chatGenerating && (
                  <View style={s.chatBubble}>
                    <View style={s.chatAIAvatar}><MaterialIcons name="smart-toy" size={14} color="#9945FF" /></View>
                    <View style={s.chatBubbleInnerAI}>
                      <ActivityIndicator size="small" color="#9945FF" />
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={s.chatInputRow}>
              <TextInput
                style={s.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask BTNG AI..."
                placeholderTextColor={Colors.textMuted}
                multiline
                onSubmitEditing={handleChat}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[s.chatSendBtn, (!chatInput.trim() || chatGenerating) && { opacity: 0.4 }]}
                onPress={handleChat}
                disabled={!chatInput.trim() || chatGenerating}
              >
                <MaterialIcons name="send" size={18} color={Colors.bg} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── HISTORY ── */}
        {activeTab === 'history' && (
          <View style={s.historyEmpty}>
            <Text style={{ fontSize: 48 }}>📄</Text>
            <Text style={s.historyTitle}>Generated Content</Text>
            <Text style={s.historySub}>Your AI-generated articles, analysis, and NFT descriptions will appear here. Generate content in the AI Tools tab to get started.</Text>
            <TouchableOpacity style={s.historyBtn} onPress={() => setActiveTab('tools')}>
              <MaterialIcons name="auto-awesome" size={15} color={Colors.bg} />
              <Text style={s.historyBtnText}>Go to AI Tools</Text>
            </TouchableOpacity>
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
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  hero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: '#9945FF33', alignItems: 'center', gap: Spacing.md },
  heroIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#9945FF18', borderWidth: 1.5, borderColor: '#9945FF55', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: '#9945FF', includeFontPadding: false },
  heroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  toolCard: { width: '48%', flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 5, alignItems: 'flex-start' },
  toolEmoji: { fontSize: 26 },
  toolTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  toolDesc: { fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
  selectedBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 },
  selectedBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.3, includeFontPadding: false },
  promptChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: '#9945FF33' },
  promptText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  input: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#9945FF', borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, shadowColor: '#9945FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  generateBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  resultCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#9945FF55', gap: Spacing.md },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#9945FF', shadowColor: '#9945FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  resultTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#9945FF', includeFontPadding: false },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#9945FF18', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#9945FF44' },
  copyBtnText: { fontSize: 11, fontWeight: FontWeight.bold, color: '#9945FF', includeFontPadding: false },
  resultText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  resultFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resultFooterText: { fontSize: FontSize.xs, color: Colors.success, includeFontPadding: false },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: '#9945FF33' },
  chatAvatarWrap: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#9945FF18', borderWidth: 1.5, borderColor: '#9945FF55', alignItems: 'center', justifyContent: 'center' },
  chatName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  chatStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  chatStatus: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
  chatEmpty: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md },
  chatEmptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  chatEmptySub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  chatSuggestions: { width: '100%', gap: Spacing.sm },
  chatSuggestionChip: { backgroundColor: '#9945FF18', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: '#9945FF33', alignItems: 'center' },
  chatSuggestionText: { fontSize: FontSize.sm, color: '#9945FF', fontWeight: FontWeight.semibold, includeFontPadding: false },
  chatMessages: { gap: Spacing.sm },
  chatBubble: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  chatBubbleUser: { justifyContent: 'flex-end' },
  chatBubbleAI: { justifyContent: 'flex-start' },
  chatAIAvatar: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#9945FF18', borderWidth: 1, borderColor: '#9945FF44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chatBubbleInner: { maxWidth: '78%', borderRadius: Radius.xl, padding: Spacing.md },
  chatBubbleInnerUser: { backgroundColor: '#9945FF', borderBottomRightRadius: 4 },
  chatBubbleInnerAI: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  chatBubbleText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 19, includeFontPadding: false },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  chatInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, maxHeight: 100, includeFontPadding: false },
  chatSendBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#9945FF', alignItems: 'center', justifyContent: 'center' },
  historyEmpty: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xl },
  historyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historySub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#9945FF', borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
  historyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
