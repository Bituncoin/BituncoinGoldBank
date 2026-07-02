/**
 * BTNG AI Support Chat
 * - Connected to BTNG AI Private Banker via btng-support-chat edge function
 * - Streaming responses with dual-path (stream / fallback) compatibility
 * - Chat history persisted to AsyncStorage
 * - African heritage design aligned with BTNG platform identity
 */
import React, {
  useState, useEffect, useRef, useCallback, Component, ReactNode,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabaseClient, useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  streaming?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'btng_support_chat_history';
const MAX_HISTORY = 40; // messages to keep in AsyncStorage
const BACKEND_URL = 'https://mebznlvyycuuddfkmebz.backend.onspace.ai';

const QUICK_PROMPTS = [
  { icon: 'account-balance-wallet', text: 'How does BTNG3 wallet work?' },
  { icon: 'grain',                  text: 'What is BTNGG gold price today?' },
  { icon: 'verified-user',          text: 'How do I complete KYC verification?' },
  { icon: 'payments',               text: 'How to deposit via MTN MoMo?' },
  { icon: 'swap-horiz',             text: 'Explain P2P trading on BTNG' },
  { icon: 'lock',                   text: 'How do I enable 2FA security?' },
];

const WELCOME_MSG: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "🏦 Welcome to BTNG AI Support!\n\nI am your BTNG AI Private Banker — here to help you with:\n• Wallet & BTNGG token\n• KYC verification\n• Trading & P2P\n• MTN MoMo deposits\n• Gold oracle & pricing\n• Any platform questions\n\nHow can I assist you today?",
  timestamp: Date.now(),
};

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ChatErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(e: any) {
    return { hasError: true, error: String(e?.message ?? e) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={err.container}>
          <MaterialIcons name="error-outline" size={40} color={Colors.error} />
          <Text style={err.title}>Chat Error</Text>
          <Text style={err.body}>{this.state.error}</Text>
          <TouchableOpacity
            style={err.btn}
            onPress={() => this.setState({ hasError: false, error: '' })}
          >
            <Text style={err.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const err = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  body: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  btnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ─── Typing Dots ──────────────────────────────────────────────────────────────
function TypingDots() {
  const a1 = useRef(new Animated.Value(0.3)).current;
  const a2 = useRef(new Animated.Value(0.3)).current;
  const a3 = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const makeDot = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        ])
      );
    const d1 = makeDot(a1, 0);
    const d2 = makeDot(a2, 180);
    const d3 = makeDot(a3, 360);
    d1.start(); d2.start(); d3.start();
    return () => { d1.stop(); d2.stop(); d3.stop(); };
  }, []);
  return (
    <View style={td.row}>
      {[a1, a2, a3].map((a, i) => (
        <Animated.View key={i} style={[td.dot, { opacity: a }]} />
      ))}
    </View>
  );
}
const td = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.primary },
});

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  if (msg.streaming) {
    return (
      <View style={[mb.row, mb.rowAssistant]}>
        <View style={mb.avatarWrap}>
          <Text style={mb.avatarEmoji}>🏦</Text>
        </View>
        <View style={[mb.bubble, mb.bubbleAssistant]}>
          {msg.content ? (
            <Text style={mb.textAssistant}>{msg.content}</Text>
          ) : (
            <TypingDots />
          )}
        </View>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        mb.row,
        isUser ? mb.rowUser : mb.rowAssistant,
        { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}
    >
      {!isUser && (
        <View style={mb.avatarWrap}>
          <Text style={mb.avatarEmoji}>🏦</Text>
        </View>
      )}
      <View style={[mb.bubble, isUser ? mb.bubbleUser : mb.bubbleAssistant]}>
        <Text style={isUser ? mb.textUser : mb.textAssistant}>{msg.content}</Text>
        <Text style={[mb.ts, isUser ? mb.tsUser : mb.tsAssistant]}>
          {new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      {isUser && (
        <View style={mb.userAvatarWrap}>
          <MaterialIcons name="person" size={16} color={Colors.bg} />
        </View>
      )}
    </Animated.View>
  );
}
const mb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: Spacing.sm },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  avatarWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1.5, borderColor: Colors.primary + '66',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarEmoji: { fontSize: 17 },
  userAvatarWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bubble: {
    maxWidth: '78%', borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: 4,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  textUser: {
    fontSize: FontSize.md, color: Colors.bg,
    fontWeight: FontWeight.medium, lineHeight: 22, includeFontPadding: false,
  },
  textAssistant: {
    fontSize: FontSize.md, color: Colors.textPrimary,
    lineHeight: 22, includeFontPadding: false,
  },
  ts: { fontSize: 10, includeFontPadding: false, alignSelf: 'flex-end' },
  tsUser: { color: 'rgba(0,0,0,0.4)' },
  tsAssistant: { color: Colors.textMuted },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SupportChatScreen() {
  return (
    <ChatErrorBoundary>
      <SupportChatInner />
    </ChatErrorBoundary>
  );
}

function SupportChatInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const streamingIdRef = useRef<string | null>(null);

  // ── Load persisted history ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: ChatMessage[] = JSON.parse(stored);
          if (parsed.length > 0) {
            // Prepend welcome only if it's not there
            const hasWelcome = parsed[0]?.id === 'welcome';
            setMessages(hasWelcome ? parsed : [WELCOME_MSG, ...parsed]);
          }
        }
      } catch { /* ignore */ }
      setHistoryLoaded(true);
    })();
  }, []);

  // ── Persist history whenever messages change ──────────────────────────────
  useEffect(() => {
    if (!historyLoaded) return;
    const toSave = messages.filter(m => !m.streaming).slice(-MAX_HISTORY);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [messages, historyLoaded]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  // ── Build conversation context for API (last 10 exchanges) ────────────────
  const buildContext = useCallback((msgs: ChatMessage[]) => {
    return msgs
      .filter(m => m.role !== 'system' && m.id !== 'welcome' && !m.streaming)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setInputText('');
    inputRef.current?.blur();

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const streamingId = `a_${Date.now()}`;
    streamingIdRef.current = streamingId;
    const streamingMsg: ChatMessage = {
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, streamingMsg]);
    setIsLoading(true);
    scrollToBottom();

    try {
      const supabase = getSupabaseClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token ?? '';

      const context = buildContext([...messages, userMsg]);

      // ── Try streaming via fetch ──────────────────────────────────────────
      const edgeUrl = `${BACKEND_URL}/functions/v1/btng-support-chat`;
      const fetchResp = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: context, stream: true }),
      });

      if (!fetchResp.ok) {
        const errText = await fetchResp.text();
        throw new Error(errText || `HTTP ${fetchResp.status}`);
      }

      const reader = fetchResp.body?.getReader();
      let accumulated = '';

      if (reader) {
        // ── Streaming path ─────────────────────────────────────────────────
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            const trimLine = line.trim();
            if (!trimLine || trimLine === 'data: [DONE]') continue;
            if (trimLine.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimLine.slice(6));
                const delta = json?.choices?.[0]?.delta?.content ?? '';
                if (delta) {
                  accumulated += delta;
                  setMessages(prev => prev.map(m =>
                    m.id === streamingId ? { ...m, content: accumulated } : m
                  ));
                  scrollToBottom(false);
                }
              } catch { /* partial chunk — skip */ }
            }
          }
        }
      } else {
        // ── Full response fallback ─────────────────────────────────────────
        const fullText = await fetchResp.text();
        const lines = fullText.split('\n');
        for (const line of lines) {
          const trimLine = line.trim();
          if (!trimLine || trimLine === 'data: [DONE]') continue;
          if (trimLine.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimLine.slice(6));
              const delta = json?.choices?.[0]?.delta?.content ?? '';
              if (delta) accumulated += delta;
            } catch { /* skip */ }
          }
        }
        // Also try as a plain JSON response
        if (!accumulated) {
          try {
            const json = JSON.parse(fullText);
            accumulated = json?.content ?? json?.choices?.[0]?.message?.content ?? '';
          } catch { /* skip */ }
        }
      }

      if (!accumulated) {
        accumulated = "I'm here to help! Please try asking your question again.";
      }

      // Finalize streaming message
      setMessages(prev => prev.map(m =>
        m.id === streamingId
          ? { ...m, content: accumulated, streaming: false }
          : m
      ));

    } catch (e: any) {
      console.error('support-chat error:', e);
      // Replace streaming bubble with error message
      setMessages(prev => prev.map(m =>
        m.id === streamingId
          ? {
              ...m,
              content: "I'm having trouble connecting right now. Please try again in a moment, or contact us directly at info@bituncoin.io",
              streaming: false,
            }
          : m
      ));
    } finally {
      setIsLoading(false);
      streamingIdRef.current = null;
      scrollToBottom();
    }
  }, [isLoading, messages, buildContext, scrollToBottom]);

  const handleClearHistory = useCallback(() => {
    showAlert('Clear Chat', 'Remove all chat history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        setMessages([WELCOME_MSG]);
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      }},
    ]);
  }, [showAlert]);

  const lastMessageRole = messages[messages.length - 1]?.role;
  const showQuickPrompts = messages.length <= 2 && !isLoading;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.headerAvatar}>
          <Text style={s.headerAvatarEmoji}>🏦</Text>
          <View style={s.headerOnlineDot} />
        </View>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>BTNG AI Support</Text>
          <View style={s.headerStatusRow}>
            <View style={s.headerOnlineDotSmall} />
            <Text style={s.headerStatus}>Online · Powered by OnSpace AI</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.clearBtn}
          onPress={handleClearHistory}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="delete-sweep" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Gold accent bar */}
      <View style={s.goldBar}>
        <MaterialIcons name="grain" size={10} color={Colors.primary} />
        <Text style={s.goldBarText}>Bituncoin Gold · Ghana · 54 African Nations · BTNG-MAINNET</Text>
        <MaterialIcons name="verified-user" size={10} color={Colors.success} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={s.messagesScroll}
          contentContainerStyle={[
            s.messagesContent,
            { paddingBottom: insets.bottom + 12 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollToBottom(false)}
        >
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {/* Quick prompts after welcome */}
          {showQuickPrompts && (
            <View style={s.quickSection}>
              <Text style={s.quickSectionTitle}>Quick questions</Text>
              <View style={s.quickGrid}>
                {QUICK_PROMPTS.map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    style={s.quickChip}
                    onPress={() => sendMessage(q.text)}
                    activeOpacity={0.75}
                  >
                    <MaterialIcons name={q.icon as any} size={13} color={Colors.primary} />
                    <Text style={s.quickChipText} numberOfLines={2}>{q.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
          <View style={s.inputWrap}>
            <TextInput
              ref={inputRef}
              style={s.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about BTNG, wallet, trading…"
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={500}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={() => sendMessage(inputText)}
            />
            {inputText.length > 0 && (
              <TouchableOpacity
                onPress={() => setInputText('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[
              s.sendBtn,
              (!inputText.trim() || isLoading) && s.sendBtnDisabled,
            ]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.bg} />
            ) : (
              <MaterialIcons name="send" size={18} color={Colors.bg} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 2, borderColor: Colors.primary + '66',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  headerAvatarEmoji: { fontSize: 22 },
  headerOnlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2, borderColor: Colors.bg,
  },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerOnlineDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  headerStatus: { fontSize: 10, color: Colors.success, fontWeight: FontWeight.semibold, includeFontPadding: false },
  clearBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Gold bar
  goldBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryGlow + '55',
    borderBottomWidth: 1, borderBottomColor: Colors.primary + '22',
  },
  goldBarText: { flex: 1, fontSize: 9, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false, letterSpacing: 0.3 },

  // Messages
  messagesScroll: { flex: 1 },
  messagesContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: 2,
  },

  // Quick prompts
  quickSection: { marginTop: Spacing.md, gap: Spacing.sm },
  quickSectionTitle: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold,
    color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false,
    marginBottom: 2,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderWidth: 1, borderColor: Colors.primary + '44',
    maxWidth: '48%',
  },
  quickChipText: {
    flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary,
    fontWeight: FontWeight.medium, includeFontPadding: false, lineHeight: 16,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    gap: 6, minHeight: 48,
  },
  input: {
    flex: 1, fontSize: FontSize.md, color: Colors.textPrimary,
    includeFontPadding: false, maxHeight: 120, lineHeight: 22,
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border,
    shadowOpacity: 0, elevation: 0,
  },
});
