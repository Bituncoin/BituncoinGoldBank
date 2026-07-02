// BTNG API Key Manager — Manage external service credentials
// Payment Gateways · AI Providers · Data Oracles · Custom Endpoints
import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Animated, Easing, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────
type KeyCategory = 'payment' | 'ai' | 'oracle' | 'btng' | 'custom';
type KeyStatus   = 'active' | 'inactive' | 'untested' | 'error';

interface ApiKey {
  id: string;
  name: string;
  service: string;
  category: KeyCategory;
  key: string;
  endpoint?: string;
  status: KeyStatus;
  lastTested?: string;
  responseMs?: number;
  notes?: string;
  createdAt: string;
}

// ── Category Config ───────────────────────────────────────────────────────────
const CATEGORIES: { key: KeyCategory | 'all'; label: string; icon: string; color: string }[] = [
  { key: 'all',     label: 'All Keys',  icon: 'vpn-key',        color: Colors.primary   },
  { key: 'payment', label: 'Payment',   icon: 'payment',        color: '#22C55E'         },
  { key: 'ai',      label: 'AI / LLM',  icon: 'smart-toy',      color: '#9945FF'         },
  { key: 'oracle',  label: 'Oracles',   icon: 'show-chart',     color: '#F59E0B'         },
  { key: 'btng',    label: 'BTNG',      icon: 'hub',            color: Colors.primary    },
  { key: 'custom',  label: 'Custom',    icon: 'tune',           color: '#3B82F6'         },
];

// ── Pre-seeded Templates ──────────────────────────────────────────────────────
const TEMPLATES: Omit<ApiKey, 'id' | 'key' | 'status' | 'lastTested' | 'responseMs' | 'createdAt'>[] = [
  // Payment
  { name: 'MTN MoMo Ghana',      service: 'MTN MoMo',       category: 'payment', endpoint: 'https://sandbox.momodeveloper.mtn.com/v1_0/apiuser', notes: 'Ghana Mobile Money API' },
  { name: 'Paystack Live',       service: 'Paystack',       category: 'payment', endpoint: 'https://api.paystack.co/bank', notes: 'Africa payment gateway' },
  { name: 'Flutterwave',         service: 'Flutterwave',    category: 'payment', endpoint: 'https://api.flutterwave.com/v3/banks/GH', notes: 'Pan-Africa payments' },
  { name: 'Stripe Secret',       service: 'Stripe',         category: 'payment', endpoint: 'https://api.stripe.com/v1/balance', notes: 'Global card processing' },
  // AI
  { name: 'OpenAI GPT-4o',       service: 'OpenAI',         category: 'ai',      endpoint: 'https://api.openai.com/v1/models', notes: 'GPT-4o / DALL-E' },
  { name: 'Anthropic Claude',    service: 'Anthropic',      category: 'ai',      endpoint: 'https://api.anthropic.com/v1/messages', notes: 'Claude 3.5 Sonnet' },
  { name: 'Google Gemini',       service: 'Google AI',      category: 'ai',      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', notes: 'Gemini 1.5 Pro' },
  // Oracle
  { name: 'CoinGecko Pro',       service: 'CoinGecko',      category: 'oracle',  endpoint: 'https://pro-api.coingecko.com/api/v3/ping', notes: 'Live crypto prices' },
  { name: 'Gold API Live',       service: 'Gold-API',       category: 'oracle',  endpoint: 'https://www.goldapi.io/api/XAU/USD', notes: 'Real-time gold/oz prices' },
  { name: 'Metals-Live',         service: 'Metals.live',    category: 'oracle',  endpoint: 'https://metals.live/api/latest', notes: 'Precious metals oracle' },
  { name: 'CryptoCompare',       service: 'CryptoCompare',  category: 'oracle',  endpoint: 'https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD', notes: 'Crypto market data' },
  // BTNG
  { name: 'BTNG Node Primary',   service: 'BTNG Mainnet',   category: 'btng',    endpoint: 'http://72.62.160.237:64799/api/v1/blockchain/info', notes: 'Primary VPS · srv1219227' },
  { name: 'BTNG Node Secondary', service: 'BTNG Mainnet',   category: 'btng',    endpoint: 'http://168.231.79.52:64799/api/v1/blockchain/info', notes: 'Secondary VPS · srv1282934' },
  { name: 'BTNG Price Oracle',   service: 'BTNG Oracle',    category: 'btng',    endpoint: 'http://72.62.160.237:64799/api/v1/price', notes: 'BTNG/USD price feed' },
  { name: 'BTNG Reserve API',    service: 'BTNG Reserve',   category: 'btng',    endpoint: 'http://72.62.160.237:64799/api/v1/gold/reserve', notes: 'Gold reserve cert endpoint' },
];

const STORAGE_KEY = 'btng_api_keys_v1';

// ── Helpers ───────────────────────────────────────────────────────────────────
function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  const show = 4;
  return key.substring(0, show) + '•'.repeat(Math.min(key.length - show * 2, 20)) + key.slice(-show);
}

function categoryColor(cat: KeyCategory): string {
  return CATEGORIES.find(c => c.key === cat)?.color ?? Colors.textMuted;
}

function statusColor(s: KeyStatus): string {
  return s === 'active' ? Colors.success : s === 'inactive' ? Colors.textMuted : s === 'error' ? Colors.error : Colors.warning;
}

function statusLabel(s: KeyStatus): string {
  return s === 'active' ? 'ACTIVE' : s === 'inactive' ? 'INACTIVE' : s === 'error' ? 'ERROR' : 'UNTESTED';
}

function statusIcon(s: KeyStatus): string {
  return s === 'active' ? 'check-circle' : s === 'inactive' ? 'remove-circle-outline' : s === 'error' ? 'error' : 'radio-button-unchecked';
}

// ── Pulse Dot ─────────────────────────────────────────────────────────────────
function PulseDot({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.8, duration: 800, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ])).start();
  }, [anim]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.25, transform: [{ scale: anim }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ── Add Key Modal ─────────────────────────────────────────────────────────────
function AddKeyModal({ visible, onClose, onAdd, editItem }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (key: Omit<ApiKey, 'id' | 'status' | 'createdAt'>) => void;
  editItem?: ApiKey | null;
}) {
  const [name, setName]         = useState('');
  const [service, setService]   = useState('');
  const [category, setCategory] = useState<KeyCategory>('custom');
  const [key, setKey]           = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [notes, setNotes]       = useState('');
  const [showKey, setShowKey]   = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setService(editItem.service);
      setCategory(editItem.category);
      setKey(editItem.key);
      setEndpoint(editItem.endpoint ?? '');
      setNotes(editItem.notes ?? '');
    } else {
      setName(''); setService(''); setCategory('custom');
      setKey(''); setEndpoint(''); setNotes('');
    }
    setShowKey(false);
    setTemplateOpen(false);
  }, [editItem, visible]);

  const handleTemplate = (tmpl: typeof TEMPLATES[0]) => {
    setName(tmpl.name);
    setService(tmpl.service);
    setCategory(tmpl.category);
    setEndpoint(tmpl.endpoint ?? '');
    setNotes(tmpl.notes ?? '');
    setTemplateOpen(false);
  };

  const canSave = name.trim() && service.trim() && key.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={am.overlay}>
          <View style={am.sheet}>
            {/* Header */}
            <View style={am.header}>
              <View style={am.headerIcon}>
                <MaterialIcons name="vpn-key" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={am.headerTitle}>{editItem ? 'Edit API Key' : 'Add API Key'}</Text>
                <Text style={am.headerSub}>Configure a new external service credential</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {/* Template Picker */}
              {!editItem && (
                <View style={am.templateSection}>
                  <TouchableOpacity style={am.templateToggle} onPress={() => setTemplateOpen(o => !o)}>
                    <MaterialIcons name="bolt" size={14} color={Colors.warning} />
                    <Text style={am.templateToggleText}>Quick-fill from templates</Text>
                    <MaterialIcons name={templateOpen ? 'expand-less' : 'expand-more'} size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {templateOpen && (
                    <View style={am.templateList}>
                      {TEMPLATES.map(t => (
                        <TouchableOpacity key={t.name} style={am.templateItem} onPress={() => handleTemplate(t)}>
                          <View style={[am.templateDot, { backgroundColor: categoryColor(t.category) }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={am.templateName}>{t.name}</Text>
                            <Text style={am.templateService}>{t.service}</Text>
                          </View>
                          <View style={[am.templateCatBadge, { backgroundColor: categoryColor(t.category) + '18', borderColor: categoryColor(t.category) + '44' }]}>
                            <Text style={[am.templateCatText, { color: categoryColor(t.category) }]}>{t.category.toUpperCase()}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Category Picker */}
              <Text style={am.fieldLabel}>Category</Text>
              <View style={am.catRow}>
                {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={[am.catBtn, category === c.key && { backgroundColor: c.color + '18', borderColor: c.color }]}
                    onPress={() => setCategory(c.key as KeyCategory)}
                  >
                    <MaterialIcons name={c.icon as any} size={13} color={category === c.key ? c.color : Colors.textMuted} />
                    <Text style={[am.catBtnText, category === c.key && { color: c.color }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Fields */}
              {([
                { label: 'Service Name', value: service, setter: setService, placeholder: 'e.g. OpenAI', icon: 'dns' },
                { label: 'Display Name', value: name, setter: setName, placeholder: 'e.g. GPT-4o Production Key', icon: 'label' },
                { label: 'API Endpoint (optional)', value: endpoint, setter: setEndpoint, placeholder: 'https://api.example.com/v1/ping', icon: 'link' },
                { label: 'Notes (optional)', value: notes, setter: setNotes, placeholder: 'Purpose or environment…', icon: 'notes' },
              ] as any[]).map((f, i) => (
                <View key={i}>
                  <Text style={am.fieldLabel}>{f.label}</Text>
                  <View style={am.inputWrap}>
                    <MaterialIcons name={f.icon} size={16} color={Colors.textMuted} style={{ marginLeft: Spacing.md }} />
                    <TextInput
                      style={am.input}
                      value={f.value}
                      onChangeText={f.setter}
                      placeholder={f.placeholder}
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              ))}

              {/* API Key field */}
              <Text style={am.fieldLabel}>API Key / Secret <Text style={{ color: Colors.error }}>*</Text></Text>
              <View style={am.inputWrap}>
                <MaterialIcons name="lock" size={16} color={Colors.textMuted} style={{ marginLeft: Spacing.md }} />
                <TextInput
                  style={[am.input, { flex: 1 }]}
                  value={key}
                  onChangeText={setKey}
                  placeholder="Paste your API key here…"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowKey(s => !s)} style={{ padding: Spacing.md }}>
                  <MaterialIcons name={showKey ? 'visibility-off' : 'visibility'} size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={am.securityNote}>
                <MaterialIcons name="shield" size={12} color={Colors.success} />
                <Text style={am.securityNoteText}>Stored locally on device · Never transmitted without your action</Text>
              </View>

              <View style={{ height: Spacing.xl }} />
            </ScrollView>

            {/* Save button */}
            <View style={am.footer}>
              <TouchableOpacity style={am.cancelBtn} onPress={onClose}>
                <Text style={am.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[am.saveBtn, !canSave && { opacity: 0.45 }]}
                onPress={() => canSave && onAdd({ name, service, category, key, endpoint: endpoint || undefined, notes: notes || undefined, lastTested: undefined, responseMs: undefined })}
                disabled={!canSave}
              >
                <MaterialIcons name={editItem ? 'save' : 'add'} size={16} color={Colors.bg} />
                <Text style={am.saveBtnText}>{editItem ? 'Save Changes' : 'Add Key'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const am = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerIcon:      { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub:       { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  templateSection: { margin: Spacing.xl, marginBottom: 0, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  templateToggle:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  templateToggleText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.warning, includeFontPadding: false },
  templateList:    { borderTopWidth: 1, borderTopColor: Colors.border, maxHeight: 220 },
  templateItem:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '66' },
  templateDot:     { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  templateName:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  templateService: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  templateCatBadge:{ borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  templateCatText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  fieldLabel:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, marginHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: 6, includeFontPadding: false },
  catRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: Spacing.xl, marginBottom: Spacing.xs },
  catBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  catBtnText:      { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  inputWrap:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, marginHorizontal: Spacing.xl, gap: 8 },
  input:           { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, padding: Spacing.md, includeFontPadding: false },
  securityNote:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: Spacing.xl, marginTop: 6 },
  securityNoteText:{ fontSize: 10, color: Colors.success, includeFontPadding: false },
  footer:          { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn:       { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  saveBtn:         { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ── Key Card ──────────────────────────────────────────────────────────────────
function KeyCard({ item, onEdit, onDelete, onTest, testing }: {
  item: ApiKey;
  onEdit: (item: ApiKey) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  testing: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const catColor = categoryColor(item.category);
  const sColor   = statusColor(item.status);
  const catLabel = CATEGORIES.find(c => c.key === item.category)?.label ?? item.category;

  return (
    <View style={kc.card}>
      {/* Card top row */}
      <View style={kc.topRow}>
        <View style={[kc.catDot, { backgroundColor: catColor }]} />
        <View style={{ flex: 1 }}>
          <View style={kc.nameRow}>
            <Text style={kc.name} numberOfLines={1}>{item.name}</Text>
            <View style={[kc.statusBadge, { backgroundColor: sColor + '18', borderColor: sColor + '44' }]}>
              {item.status === 'active' && <PulseDot color={sColor} size={6} />}
              <MaterialIcons name={statusIcon(item.status) as any} size={10} color={sColor} />
              <Text style={[kc.statusText, { color: sColor }]}>{statusLabel(item.status)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={[kc.catBadge, { backgroundColor: catColor + '14', borderColor: catColor + '33' }]}>
              <Text style={[kc.catText, { color: catColor }]}>{catLabel.toUpperCase()}</Text>
            </View>
            <Text style={kc.service}>{item.service}</Text>
          </View>
        </View>
        {/* Action buttons */}
        <View style={kc.actions}>
          <TouchableOpacity style={kc.actionBtn} onPress={() => onEdit(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MaterialIcons name="edit" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={kc.actionBtn} onPress={() => onDelete(item.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MaterialIcons name="delete-outline" size={14} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Key value row */}
      <View style={kc.keyRow}>
        <MaterialIcons name="lock" size={13} color={Colors.textMuted} />
        <Text style={kc.keyValue} numberOfLines={1}>{revealed ? item.key : maskKey(item.key)}</Text>
        <TouchableOpacity onPress={() => setRevealed(r => !r)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <MaterialIcons name={revealed ? 'visibility-off' : 'visibility'} size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { ExpoClipboard.setStringAsync(item.key).catch(()=>{}); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <MaterialIcons name="content-copy" size={14} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Endpoint row */}
      {item.endpoint && (
        <View style={kc.endpointRow}>
          <MaterialIcons name="link" size={12} color={Colors.textMuted} />
          <Text style={kc.endpointText} numberOfLines={1}>{item.endpoint}</Text>
        </View>
      )}

      {/* Notes */}
      {item.notes && (
        <Text style={kc.notes}>{item.notes}</Text>
      )}

      {/* Footer: last tested + ping button */}
      <View style={kc.footer}>
        <View style={kc.footerLeft}>
          {item.lastTested ? (
            <>
              <MaterialIcons name="access-time" size={11} color={Colors.textMuted} />
              <Text style={kc.lastTested}>Tested {item.lastTested}</Text>
              {item.responseMs != null && (
                <View style={[kc.pingBadge, { backgroundColor: item.responseMs < 500 ? Colors.success + '18' : Colors.warning + '18', borderColor: item.responseMs < 500 ? Colors.success + '44' : Colors.warning + '44' }]}>
                  <Text style={[kc.pingMs, { color: item.responseMs < 500 ? Colors.success : Colors.warning }]}>{item.responseMs}ms</Text>
                </View>
              )}
            </>
          ) : (
            <Text style={kc.lastTested}>Not yet tested</Text>
          )}
        </View>
        <TouchableOpacity
          style={[kc.testBtn, testing && { opacity: 0.6 }, { borderColor: catColor + '66', backgroundColor: catColor + '10' }]}
          onPress={() => onTest(item.id)}
          disabled={testing}
          activeOpacity={0.8}
        >
          {testing
            ? <ActivityIndicator size="small" color={catColor} />
            : <MaterialIcons name="wifi-tethering" size={14} color={catColor} />}
          <Text style={[kc.testBtnText, { color: catColor }]}>{testing ? 'Testing…' : 'Ping'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const kc = StyleSheet.create({
  card:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  topRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  catDot:        { width: 10, height: 10, borderRadius: 5, marginTop: 5, flexShrink: 0 },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name:          { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flex: 1 },
  statusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  statusText:    { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  catBadge:      { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  catText:       { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  service:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  actions:       { flexDirection: 'row', gap: 4 },
  actionBtn:     { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  keyRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  keyValue:      { flex: 1, fontSize: 12, color: Colors.primary, fontFamily: 'monospace', includeFontPadding: false },
  endpointRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  endpointText:  { flex: 1, fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', includeFontPadding: false },
  notes:         { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic', includeFontPadding: false },
  footer:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.xs, borderTopWidth: 1, borderTopColor: Colors.border + '66' },
  footerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  lastTested:    { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  pingBadge:     { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  pingMs:        { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  testBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  testBtnText:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngApiManagerScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { showAlert } = useAlert();

  const [keys, setKeys]               = useState<ApiKey[]>([]);
  const [activeCategory, setActiveCategory] = useState<KeyCategory | 'all'>('all');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editItem, setEditItem]       = useState<ApiKey | null>(null);
  const [testing, setTesting]         = useState<Record<string, boolean>>({});
  const [search, setSearch]           = useState('');

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setKeys(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const persist = useCallback((updated: ApiKey[]) => {
    setKeys(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const handleAdd = useCallback((data: Omit<ApiKey, 'id' | 'status' | 'createdAt'>) => {
    if (editItem) {
      const updated = keys.map(k => k.id === editItem.id
        ? { ...k, ...data, status: 'untested' as KeyStatus }
        : k);
      persist(updated);
      setEditItem(null);
    } else {
      const newKey: ApiKey = {
        ...data,
        id: `key_${Date.now()}`,
        status: 'untested',
        createdAt: new Date().toISOString(),
      };
      persist([...keys, newKey]);
    }
    setModalOpen(false);
  }, [keys, editItem, persist]);

  const handleDelete = useCallback((id: string) => {
    showAlert('Delete API Key', 'This will permanently remove this key. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(keys.filter(k => k.id !== id)) },
    ]);
  }, [keys, persist, showAlert]);

  const handleEdit = useCallback((item: ApiKey) => {
    setEditItem(item);
    setModalOpen(true);
  }, []);

  // ── Test Ping ─────────────────────────────────────────────────────────────────
  const handleTest = useCallback(async (id: string) => {
    const item = keys.find(k => k.id === id);
    if (!item?.endpoint) {
      showAlert('No Endpoint', 'Add an API endpoint URL to test connectivity for this key.');
      return;
    }
    setTesting(prev => ({ ...prev, [id]: true }));
    const start = Date.now();
    let status: KeyStatus = 'error';
    let ms = 0;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const headers: Record<string, string> = {};
      // Attach key as Bearer for standard APIs
      if (item.key && item.key.length > 4 && !item.endpoint.includes('72.62') && !item.endpoint.includes('168.231')) {
        headers['Authorization'] = `Bearer ${item.key}`;
      }
      const resp = await fetch(item.endpoint, { method: 'GET', headers, signal: ctrl.signal });
      clearTimeout(timer);
      ms = Date.now() - start;
      status = resp.ok || resp.status === 401 || resp.status === 403
        ? 'active'   // 401/403 means the endpoint is live, auth expected
        : 'error';
    } catch (e: any) {
      ms = Date.now() - start;
      status = e?.name === 'AbortError' ? 'error' : 'error';
    }
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const updated = keys.map(k => k.id === id
      ? { ...k, status, lastTested: now, responseMs: ms }
      : k);
    persist(updated);
    setTesting(prev => ({ ...prev, [id]: false }));
  }, [keys, persist, showAlert]);

  const handleTestAll = useCallback(async () => {
    const testable = filtered.filter(k => !!k.endpoint);
    if (!testable.length) { showAlert('No Testable Keys', 'Add API endpoint URLs to test connectivity.'); return; }
    for (const k of testable) {
      await handleTest(k.id);
    }
  }, [keys]);

  // ── Filter / Stats ────────────────────────────────────────────────────────────
  const filtered = keys.filter(k => {
    const catOk = activeCategory === 'all' || k.category === activeCategory;
    const searchOk = !search || k.name.toLowerCase().includes(search.toLowerCase()) || k.service.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  const totalActive   = keys.filter(k => k.status === 'active').length;
  const totalError    = keys.filter(k => k.status === 'error').length;
  const totalUntested = keys.filter(k => k.status === 'untested').length;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>API Key Manager</Text>
          <Text style={s.topSub}>Payment · AI · Oracles · BTNG</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { setEditItem(null); setModalOpen(true); }}>
          <MaterialIcons name="add" size={20} color={Colors.bg} />
        </TouchableOpacity>
      </View>

      {/* Stats Banner */}
      <View style={s.statsBanner}>
        {[
          { label: 'Total Keys',  value: keys.length,     color: Colors.primary   },
          { label: 'Active',      value: totalActive,      color: Colors.success    },
          { label: 'Errors',      value: totalError,       color: Colors.error      },
          { label: 'Untested',    value: totalUntested,    color: Colors.warning    },
        ].map((stat, i) => (
          <View key={stat.label} style={[s.statCell, i < 3 && { borderRightWidth: 1, borderRightColor: Colors.border }]}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search keys or services…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.testAllBtn} onPress={handleTestAll} activeOpacity={0.85}>
          <MaterialIcons name="play-arrow" size={16} color={Colors.primary} />
          <Text style={s.testAllBtnText}>Test All</Text>
        </TouchableOpacity>
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.catTabs}
        style={s.catTabsScroll}
      >
        {CATEGORIES.map(cat => {
          const count = cat.key === 'all' ? keys.length : keys.filter(k => k.category === cat.key).length;
          const isActive = activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[s.catTab, isActive && { backgroundColor: cat.color + '18', borderColor: cat.color }]}
              onPress={() => setActiveCategory(cat.key as any)}
              activeOpacity={0.82}
            >
              <MaterialIcons name={cat.icon as any} size={13} color={isActive ? cat.color : Colors.textMuted} />
              <Text style={[s.catTabText, isActive && { color: cat.color }]}>{cat.label}</Text>
              {count > 0 && (
                <View style={[s.catTabCount, { backgroundColor: isActive ? cat.color : Colors.bgElevated, borderColor: isActive ? cat.color + '66' : Colors.border }]}>
                  <Text style={[s.catTabCountText, { color: isActive ? Colors.bg : Colors.textMuted }]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Key List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="vpn-key" size={36} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{keys.length === 0 ? 'No API Keys Yet' : 'No Keys Found'}</Text>
            <Text style={s.emptySub}>
              {keys.length === 0
                ? 'Add your first external API key to integrate payment gateways, AI providers, and data oracles.'
                : 'Try a different search or category filter.'}
            </Text>
            {keys.length === 0 && (
              <TouchableOpacity style={s.emptyAddBtn} onPress={() => { setEditItem(null); setModalOpen(true); }}>
                <MaterialIcons name="add" size={16} color={Colors.bg} />
                <Text style={s.emptyAddBtnText}>Add First Key</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <View style={s.resultHeader}>
              <Text style={s.resultCount}>{filtered.length} {activeCategory === 'all' ? 'total' : CATEGORIES.find(c => c.key === activeCategory)?.label} key{filtered.length !== 1 ? 's' : ''}</Text>
            </View>
            {filtered.map(item => (
              <KeyCard
                key={item.id}
                item={item}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTest={handleTest}
                testing={!!testing[item.id]}
              />
            ))}
          </>
        )}

        {/* Integration Tips */}
        <View style={s.tipsCard}>
          <View style={s.tipsHeader}>
            <MaterialIcons name="tips-and-updates" size={16} color={Colors.warning} />
            <Text style={s.tipsTitle}>Integration Tips</Text>
          </View>
          {[
            { icon: 'shield',           tip: 'Keys are stored locally — never sent to external servers without your explicit action.' },
            { icon: 'wifi-tethering',   tip: 'Use "Ping" to verify an endpoint is live. A 401/403 response still means the server is reachable.' },
            { icon: 'bolt',             tip: 'Use templates to quickly pre-fill well-known service endpoints and skip manual configuration.' },
            { icon: 'lock',             tip: 'For production, store sensitive keys in Secrets (Cloud panel) for Edge Function use, not just locally.' },
          ].map((t, i) => (
            <View key={i} style={s.tipRow}>
              <MaterialIcons name={t.icon as any} size={14} color={Colors.primary} />
              <Text style={s.tipText}>{t.tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <AddKeyModal
        visible={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        onAdd={handleAdd}
        editItem={editItem}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  addBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:    { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  statsBanner: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  statCell:    { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, gap: 3 },
  statValue:   { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  searchRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  searchInput:{ flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, paddingVertical: Spacing.sm + 2, includeFontPadding: false },
  testAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  testAllBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  catTabsScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  catTabs:     { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: 8, alignItems: 'center', paddingVertical: 2 },
  catTab:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border },
  catTabText:  { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  catTabCount: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, minWidth: 18, alignItems: 'center' },
  catTabCountText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  scroll:      { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xs, gap: Spacing.md },
  resultHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCount: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  empty:       { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyIcon:   { width: 72, height: 72, borderRadius: 22, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:    { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, maxWidth: 260, includeFontPadding: false },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  emptyAddBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  tipsCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm, marginTop: Spacing.sm },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  tipsTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  tipRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  tipText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
});
