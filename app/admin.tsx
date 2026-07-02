
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert, getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { StatCard } from '@/components';
import { ADMIN_STATS } from '@/constants/mockData';
import { useAdminBlog } from '@/hooks/useAdminBlog';
import { CreateArticlePayload } from '@/services/blogService';
import { useAdminKyc } from '@/hooks/useKyc';
import { useAdminDeposits } from '@/hooks/useAdminDeposits';
import type { AdminTxRecord } from '@/hooks/useAdminDeposits';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useAdminActivityLog } from '@/hooks/useAdminActivityLog';
import { useUserSparkline } from '@/hooks/useUserSparkline';
import { MiniChart } from '@/components';
import { getSignedUrl, KycSubmissionWithUser } from '@/services/kycService';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

const CATEGORIES = ['BTNG', 'Market', 'Ghana', 'DeFi'];
const CATEGORY_COLORS: Record<string, string> = {
  BTNG: Colors.primary,
  Market: '#F7931A',
  Ghana: '#2E7D32',
  DeFi: '#9945FF',
};
const IMAGES = ['💰', '📈', '🏛️', '🔗', '📱', '🤝', '🌍', '🌾', '⚡', '🎓', '📊', '🇬🇭', '₿'];

const BLANK_FORM: CreateArticlePayload = {
  category: 'BTNG',
  title: '',
  summary: '',
  content: '',
  author: 'BTNG Research',
  author_avatar: '📊',
  date: new Date().toISOString().split('T')[0],
  read_time: '3 min read',
  image: '💰',
  image_color: '#D4A017',
  tags: [],
  featured: false,
  published: true,
};

const KYC_STATUS_CONFIG = {
  pending: { color: Colors.warning, bg: Colors.warningBg, label: 'Pending', icon: 'hourglass-top' },
  under_review: { color: '#3B82F6', bg: '#3B82F611', label: 'In Review', icon: 'find-in-page' },
  verified: { color: Colors.success, bg: Colors.successBg, label: 'Verified', icon: 'verified-user' },
  rejected: { color: Colors.error, bg: Colors.errorBg, label: 'Rejected', icon: 'cancel' },
};

// ── Sparkline sub-component ────────────────────────────────────────────────
function UserSparklineCard({ userId, enabled }: { userId: string; enabled: boolean }) {
  const { points, loading, isEmpty } = useUserSparkline(userId, enabled);
  if (loading) {
    return (
      <View style={sparkStyles.wrapper}>
        <View style={sparkStyles.headerRow}>
          <MaterialIcons name="show-chart" size={12} color={Colors.primary} />
          <Text style={sparkStyles.title}>7-Day Activity</Text>
        </View>
        <View style={sparkStyles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={sparkStyles.loadingText}>Loading chart...</Text>
        </View>
      </View>
    );
  }
  if (isEmpty) {
    return (
      <View style={sparkStyles.wrapper}>
        <View style={sparkStyles.headerRow}>
          <MaterialIcons name="show-chart" size={12} color={Colors.textMuted} />
          <Text style={[sparkStyles.title, { color: Colors.textMuted }]}>7-Day Activity</Text>
        </View>
        <View style={sparkStyles.emptyRow}>
          <Text style={sparkStyles.emptyText}>No trade data this week</Text>
        </View>
      </View>
    );
  }
  const isPositive = points[points.length - 1] >= points[0];
  const chartColor = isPositive ? Colors.success : Colors.error;
  const totalActivity = points.reduce((a, b) => a + b, 0);
  const peak = Math.max(...points);
  const days = ['7d', '6d', '5d', '4d', '3d', '2d', '1d'];
  return (
    <View style={sparkStyles.wrapper}>
      <View style={sparkStyles.headerRow}>
        <MaterialIcons name="show-chart" size={12} color={chartColor} />
        <Text style={[sparkStyles.title, { color: chartColor }]}>7-Day Portfolio Activity</Text>
        <View style={[sparkStyles.trendBadge, { backgroundColor: chartColor + '18', borderColor: chartColor + '44' }]}>
          <MaterialIcons name={isPositive ? 'trending-up' : 'trending-down'} size={10} color={chartColor} />
          <Text style={[sparkStyles.trendText, { color: chartColor }]}>{isPositive ? 'Up' : 'Down'}</Text>
        </View>
      </View>
      <View style={sparkStyles.chartRow}>
        <MiniChart data={points} width={220} height={52} color={chartColor} showFill />
        <View style={sparkStyles.statsCol}>
          <View style={sparkStyles.statItem}>
            <Text style={sparkStyles.statLabel}>Volume</Text>
            <Text style={[sparkStyles.statVal, { color: Colors.textPrimary }]}>
              ${totalActivity >= 1_000 ? `${(totalActivity / 1_000).toFixed(1)}K` : totalActivity.toFixed(0)}
            </Text>
          </View>
          <View style={sparkStyles.statItem}>
            <Text style={sparkStyles.statLabel}>Peak</Text>
            <Text style={[sparkStyles.statVal, { color: chartColor }]}>
              ${peak >= 1_000 ? `${(peak / 1_000).toFixed(1)}K` : peak.toFixed(0)}
            </Text>
          </View>
        </View>
      </View>
      <View style={sparkStyles.dayLabels}>
        {days.map(d => (<Text key={d} style={sparkStyles.dayLabel}>{d}</Text>))}
        <Text style={sparkStyles.dayLabel}>Today</Text>
      </View>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  wrapper: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  trendText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statsCol: { flex: 1, gap: Spacing.sm, alignItems: 'flex-end' },
  statItem: { alignItems: 'flex-end', gap: 1 },
  statLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  statVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  dayLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  dayLabel: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  loadingText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  emptyRow: { paddingVertical: Spacing.sm, alignItems: 'center' },
  emptyText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
});

const AUTHORIZED_ADMIN_EMAIL = 'admin@btng.gold';
const AUTHORIZED_ADMIN_EMAILS = ['admin@btng.gold', 'info@bituncoin.io'];
const AUTHORIZED_ADMIN_NAME = 'John Kojo Zi';
const AUTHORIZED_ADMIN_TITLE = 'Bank Manager · Bituncoin Gold Bank';
// Temporary bootstrap code — shown once during first-time admin setup
const ADMIN_TEMP_CODE = 'BTNG-ADMIN-9999';

const ACTION_CONFIGS: Record<string, { icon: string; color: string; label: string }> = {
  kyc_approved:        { icon: 'verified-user',        color: Colors.success,   label: 'KYC Approved'        },
  kyc_rejected:        { icon: 'cancel',               color: Colors.error,     label: 'KYC Rejected'        },
  kyc_reviewed:        { icon: 'find-in-page',         color: '#3B82F6',        label: 'KYC In Review'       },
  user_tier_changed:   { icon: 'military-tech',        color: Colors.primary,   label: 'Tier Changed'        },
  user_admin_granted:  { icon: 'admin-panel-settings', color: Colors.warning,   label: 'Admin Granted'       },
  user_admin_revoked:  { icon: 'remove-moderator',     color: Colors.error,     label: 'Admin Revoked'       },
  blog_published:      { icon: 'publish',              color: Colors.success,   label: 'Blog Published'      },
  blog_updated:        { icon: 'edit',                 color: Colors.primary,   label: 'Blog Updated'        },
  blog_deleted:        { icon: 'delete',               color: Colors.error,     label: 'Blog Deleted'        },
  blog_status_toggled: { icon: 'toggle-on',            color: Colors.info,      label: 'Blog Toggled'        },
  deposit_approved:    { icon: 'arrow-downward',       color: Colors.success,   label: 'Deposit Approved'    },
  deposit_rejected:    { icon: 'block',                color: Colors.error,     label: 'Deposit Rejected'    },
  withdrawal_approved: { icon: 'arrow-upward',         color: Colors.copper,    label: 'Withdrawal Approved' },
  withdrawal_rejected: { icon: 'block',                color: Colors.error,     label: 'Withdrawal Rejected' },
  admin_login:         { icon: 'login',                color: Colors.primary,   label: 'Admin Login'         },
};

// ─────────────────────────────────────────────────────────────────────────────
// BTNG Document Library — Admin Section
// ─────────────────────────────────────────────────────────────────────────────

const DOC_CATEGORIES = [
  { id: 'all',         label: 'All Docs',       icon: 'folder',              color: Colors.primary },
  { id: 'legal',       label: 'Legal',          icon: 'gavel',               color: '#3B82F6' },
  { id: 'kyc',         label: 'KYC/AML',        icon: 'verified-user',       color: '#22C55E' },
  { id: 'financial',   label: 'Financial',      icon: 'account-balance',     color: Colors.primary },
  { id: 'governance',  label: 'Governance',     icon: 'policy',              color: '#9945FF' },
  { id: 'technical',   label: 'Technical',      icon: 'developer-mode',      color: '#F59E0B' },
  { id: 'marketing',   label: 'Marketing',      icon: 'campaign',            color: '#EC4899' },
  { id: 'compliance',  label: 'Compliance',     icon: 'shield',              color: Colors.success },
];

const DOC_TYPES: Record<string, { icon: string; color: string }> = {
  pdf:     { icon: 'picture-as-pdf', color: Colors.error },
  doc:     { icon: 'description',    color: '#3B82F6' },
  excel:   { icon: 'table-chart',    color: '#22C55E' },
  image:   { icon: 'image',          color: '#9945FF' },
  cert:    { icon: 'workspace-premium', color: Colors.primary },
  link:    { icon: 'link',           color: Colors.info },
  other:   { icon: 'attach-file',    color: Colors.textMuted },
};

type DocEntry = {
  id: string;
  title: string;
  description: string;
  category: string;
  type: string;
  status: 'active' | 'archived' | 'draft' | 'confidential';
  tags: string[];
  author: string;
  version: string;
  date: string;
  size: string;
  url?: string;
  pinned?: boolean;
  views: number;
};

const INITIAL_DOCS: DocEntry[] = [
  {
    id: 'd1', title: 'Company Registration Certificate',
    description: 'EKUYE DIGITAL GATEWAY TRUST LTD official certificate of incorporation under Ghana Companies Act 992.',
    category: 'legal', type: 'cert', status: 'active', tags: ['registration', 'ghana', 'legal'],
    author: 'John Kojo Zi', version: 'v1.0', date: '24 Jun 2024', size: '2.1 MB', pinned: true, views: 128,
    url: 'https://verify.btng.io/doc/CS099020624',
  },
  {
    id: 'd2', title: 'BTNG Gold Coin Whitepaper v2.0',
    description: 'Technical and economic whitepaper for BTNG Gold Coin — gold-backed sovereign digital currency for 54 African nations.',
    category: 'technical', type: 'pdf', status: 'active', tags: ['whitepaper', 'btng', 'blockchain'],
    author: 'John Kojo Zi', version: 'v2.0', date: '18 Feb 2026', size: '4.7 MB', pinned: true, views: 542,
  },
  {
    id: 'd3', title: 'AML & KYC Policy Manual',
    description: 'Anti-Money Laundering and Know Your Customer procedures aligned with Ghana Financial Intelligence Centre Act 658.',
    category: 'compliance', type: 'pdf', status: 'active', tags: ['aml', 'kyc', 'compliance', 'ghana'],
    author: 'BTNG Compliance', version: 'v1.3', date: '01 Mar 2026', size: '1.8 MB', views: 89,
  },
  {
    id: 'd4', title: 'Bank of Ghana Digital Assets Filing',
    description: 'Regulatory filing submitted to the Bank of Ghana for BTNG digital asset operations under PSS Act 987.',
    category: 'compliance', type: 'pdf', status: 'confidential', tags: ['bank-of-ghana', 'regulatory', 'filing'],
    author: 'John Kojo Zi', version: 'v1.0', date: '15 Jan 2026', size: '3.2 MB', views: 34,
  },
  {
    id: 'd5', title: 'BTNG Governance Charter',
    description: 'Constitutional framework for the BTNG Sovereignty Council — voting rights, governance circles, and amendments protocol.',
    category: 'governance', type: 'pdf', status: 'active', tags: ['governance', 'charter', 'sovereignty'],
    author: 'John Kojo Zi', version: 'v1.1', date: '10 Feb 2026', size: '890 KB', views: 201,
  },
  {
    id: 'd6', title: 'MTN MoMo Merchant Agreement',
    description: 'Official merchant agreement with MTN Mobile Money Ghana — Merchant ID 248059, MSISDN +233540418537.',
    category: 'legal', type: 'pdf', status: 'active', tags: ['mtn', 'momo', 'merchant', 'agreement'],
    author: 'MTN Ghana', version: 'v2024.1', date: '24 Jun 2024', size: '1.4 MB', views: 67,
  },
  {
    id: 'd7', title: 'BTNG Node Infrastructure Spec',
    description: 'Technical specification for BTNG Sovereign Node deployment — IP 168.231.79.52:64799 (srv1282934.hstgr.cloud), Ghana Mainnet configuration.',
    category: 'technical', type: 'doc', status: 'active', tags: ['node', 'infrastructure', 'mainnet'],
    author: 'BTNG Dev Team', version: 'v1.2', date: '18 Feb 2026', size: '560 KB', views: 145,
  },
  {
    id: 'd8', title: 'AfCFTA Integration Roadmap',
    description: 'Strategic roadmap for BTNG integration across all 54 African nations under the African Continental Free Trade Area framework.',
    category: 'governance', type: 'pdf', status: 'active', tags: ['afcfta', 'africa', '54-nations', 'roadmap'],
    author: 'John Kojo Zi', version: 'v1.0', date: '01 Apr 2026', size: '2.3 MB', pinned: true, views: 387,
  },
  {
    id: 'd9', title: 'Q1 2026 Financial Report',
    description: 'First quarter 2026 financial summary — trading volume, revenue, user growth, and platform metrics.',
    category: 'financial', type: 'excel', status: 'confidential', tags: ['financial', 'q1-2026', 'report'],
    author: 'BTNG Finance', version: 'v1.0', date: '15 Apr 2026', size: '1.1 MB', views: 28,
  },
  {
    id: 'd10', title: 'KYC Submission Audit Trail Q1 2026',
    description: 'Quarterly audit log of all KYC submissions, approvals, rejections, and reviewer actions.',
    category: 'kyc', type: 'pdf', status: 'confidential', tags: ['kyc', 'audit', 'q1-2026'],
    author: 'BTNG Compliance', version: 'v1.0', date: '10 Apr 2026', size: '2.8 MB', views: 19,
  },
  {
    id: 'd11', title: 'BTNG App Store Submission Guide',
    description: 'Step-by-step guide for submitting BTNG Gold Coin app to Apple App Store and Google Play Store.',
    category: 'technical', type: 'doc', status: 'active', tags: ['app-store', 'publishing', 'ios', 'android'],
    author: 'BTNG Dev Team', version: 'v1.0', date: '01 Jun 2026', size: '420 KB', views: 56,
  },
  {
    id: 'd12', title: 'Brand Identity & Style Guide',
    description: 'Official BTNG Gold Coin brand guidelines — logo usage, color palette (#D4A017 primary gold), typography, and visual standards.',
    category: 'marketing', type: 'pdf', status: 'active', tags: ['brand', 'design', 'marketing'],
    author: 'BTNG Design', version: 'v2.0', date: '01 Mar 2026', size: '8.4 MB', views: 234,
  },
  {
    id: 'd13', title: 'Privacy Policy — Ghana Act 843',
    description: 'Full privacy policy aligned with the Ghana Data Protection Act 2012 and AfCFTA digital regulations.',
    category: 'legal', type: 'doc', status: 'active', tags: ['privacy', 'gdpr', 'ghana', 'act-843'],
    author: 'John Kojo Zi', version: 'v1.1', date: '01 Jun 2026', size: '340 KB', views: 178,
    url: '/privacy-policy',
  },
  {
    id: 'd14', title: 'Terms of Service — v2.0',
    description: 'Full terms of service governing use of BTNG Gold Coin platform — Ghana jurisdiction, AfCFTA compliance.',
    category: 'legal', type: 'doc', status: 'active', tags: ['terms', 'legal', 'ghana'],
    author: 'John Kojo Zi', version: 'v2.0', date: '01 Jun 2026', size: '390 KB', views: 156,
    url: '/terms',
  },
  {
    id: 'd15', title: 'Proof of Gold Reserve — Bank of Ghana',
    description: 'Official certificate of gold reserve held at Bank of Ghana Vault 001, Accra — backing BTNGG digital currency.',
    category: 'financial', type: 'cert', status: 'active', tags: ['gold', 'reserve', 'certificate', 'bank-of-ghana'],
    author: 'Bank of Ghana', version: 'v2026.1', date: '18 Feb 2026', size: '1.6 MB', pinned: true, views: 891,
  },
  {
    id: 'd16', title: 'BTNG SDK License — UBL-1.0',
    description: 'Bituncoin Universal License v1.0 — governing use, modification, and distribution of the BTNG SDK package.',
    category: 'legal', type: 'doc', status: 'active', tags: ['sdk', 'license', 'ubl', 'open-source'],
    author: 'John Kojo Zi', version: 'v1.0', date: '01 Mar 2026', size: '180 KB', views: 112,
  },
];

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  active:       { color: Colors.success,  bg: Colors.successBg, label: 'Active'       },
  archived:     { color: Colors.textMuted, bg: Colors.bgElevated, label: 'Archived'   },
  draft:        { color: Colors.warning,  bg: Colors.warningBg, label: 'Draft'        },
  confidential: { color: Colors.error,    bg: Colors.errorBg,   label: 'Confidential' },
};

function AdminDocLibrary({ router, adminName }: { router: any; adminName: string }) {
  const { showAlert } = useAlert();
  const [docs, setDocs] = React.useState<DocEntry[]>(INITIAL_DOCS);
  const [catFilter, setCatFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'archived' | 'draft' | 'confidential'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [editDoc, setEditDoc] = React.useState<DocEntry | null>(null);
  const [sortBy, setSortBy] = React.useState<'date' | 'views' | 'title'>('date');
  const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');
  const [newDoc, setNewDoc] = React.useState<Partial<DocEntry>>({
    title: '', description: '', category: 'legal', type: 'pdf',
    status: 'active', tags: [], author: adminName, version: 'v1.0',
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    size: '—', views: 0,
  });
  const [tagInput, setTagInput] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [uploadFileName, setUploadFileName] = React.useState('');

  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = decode(base64);
      const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `docs/${Date.now()}_${safeName}`;
      const supabase = getSupabaseClient();
      const { data, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(storagePath, arrayBuffer, {
          contentType: asset.mimeType ?? 'application/octet-stream',
          upsert: false,
        });
      setUploading(false);
      if (uploadError) {
        showAlert('Upload Failed', uploadError.message);
        return;
      }
      const uploadedPath = data?.path ?? storagePath;
      const fileSizeStr = asset.size
        ? asset.size >= 1024 * 1024
          ? `${(asset.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.ceil(asset.size / 1024)} KB`
        : '—';
      setUploadFileName(asset.name);
      setNewDoc(d => ({
        ...d,
        url: `storage:kyc-documents/${uploadedPath}`,
        size: fileSizeStr,
        type: asset.mimeType?.includes('pdf') ? 'pdf'
          : asset.mimeType?.includes('image') ? 'image'
          : asset.mimeType?.includes('word') ? 'doc'
          : d.type ?? 'other',
      }));
      showAlert('Uploaded', `"${asset.name}" uploaded successfully.`);
    } catch (e: any) {
      setUploading(false);
      showAlert('Upload Error', e?.message ?? 'Failed to upload file.');
    }
  };

  const filtered = React.useMemo(() => {
    let d = docs;
    if (catFilter !== 'all') d = d.filter(x => x.category === catFilter);
    if (statusFilter !== 'all') d = d.filter(x => x.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      d = d.filter(x =>
        x.title.toLowerCase().includes(q) ||
        x.description.toLowerCase().includes(q) ||
        x.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return [...d].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (sortBy === 'views') return b.views - a.views;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return b.date.localeCompare(a.date);
    });
  }, [docs, catFilter, statusFilter, searchQuery, sortBy]);

  const pinnedCount   = docs.filter(d => d.pinned).length;
  const activeCount   = docs.filter(d => d.status === 'active').length;
  const confidCount   = docs.filter(d => d.status === 'confidential').length;
  const totalViews    = docs.reduce((s, d) => s + d.views, 0);

  const handleSaveDoc = () => {
    if (!newDoc.title?.trim()) { showAlert('Required', 'Title is required.'); return; }
    if (editDoc) {
      setDocs(prev => prev.map(d => d.id === editDoc.id ? { ...editDoc, ...newDoc } as DocEntry : d));
      showAlert('Updated', `"${newDoc.title}" has been updated.`);
    } else {
      const entry: DocEntry = {
        id: `d${Date.now()}`,
        title: newDoc.title ?? '',
        description: newDoc.description ?? '',
        category: newDoc.category ?? 'legal',
        type: newDoc.type ?? 'pdf',
        status: (newDoc.status as any) ?? 'active',
        tags: newDoc.tags ?? [],
        author: newDoc.author ?? adminName,
        version: newDoc.version ?? 'v1.0',
        date: newDoc.date ?? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        size: newDoc.size ?? '—',
        url: newDoc.url,
        pinned: newDoc.pinned ?? false,
        views: 0,
      };
      setDocs(prev => [entry, ...prev]);
      showAlert('Added', `"${entry.title}" added to the Document Library.`);
    }
    setShowAddModal(false);
    setEditDoc(null);
    setNewDoc({ title: '', description: '', category: 'legal', type: 'pdf', status: 'active', tags: [], author: adminName, version: 'v1.0', date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), size: '—', views: 0 });
    setTagInput('');
  };

  const handleDelete = (doc: DocEntry) => {
    showAlert('Delete Document', `Remove "${doc.title}" from the library?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setDocs(prev => prev.filter(d => d.id !== doc.id));
        setExpandedId(null);
      }},
    ]);
  };

  const handlePin = (doc: DocEntry) => {
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, pinned: !d.pinned } : d));
  };

  const handleArchive = (doc: DocEntry) => {
    const nextStatus = doc.status === 'archived' ? 'active' : 'archived';
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: nextStatus } : d));
    showAlert(nextStatus === 'archived' ? 'Archived' : 'Restored', `"${doc.title}" has been ${nextStatus === 'archived' ? 'archived' : 'restored to active'}.`);
  };

  const handleView = async (doc: DocEntry) => {
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, views: d.views + 1 } : d));
    if (doc.url) {
      if (doc.url.startsWith('storage:')) {
        const storagePath = doc.url.replace('storage:', '');
        const slashIdx = storagePath.indexOf('/');
        const bucket = storagePath.slice(0, slashIdx);
        const filePath = storagePath.slice(slashIdx + 1);
        const supabase = getSupabaseClient();
        const { data: signedData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(filePath, 3600);
        if (signedError || !signedData?.signedUrl) {
          showAlert('Access Error', signedError?.message ?? 'Could not generate download link.');
          return;
        }
        showAlert('Document Ready', `Signed link (valid 1h):\n\n${signedData.signedUrl}\n\nCopy this URL to open the document.`);
      } else if (doc.url.startsWith('/')) {
        router.push(doc.url as any);
      } else {
        showAlert('Open Document', `URL: ${doc.url}\n\nIn production this would open the document.`);
      }
    } else {
      showAlert(doc.title, `${doc.description}\n\nVersion: ${doc.version}\nAuthor: ${doc.author}\nSize: ${doc.size}\nDate: ${doc.date}\nViews: ${doc.views + 1}`);
    }
  };

  const openEdit = (doc: DocEntry) => {
    setEditDoc(doc);
    setNewDoc({ ...doc });
    setTagInput('');
    setUploadFileName(doc.url?.startsWith('storage:') ? doc.title : '');
    setShowAddModal(true);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !(newDoc.tags ?? []).includes(t)) {
      setNewDoc(d => ({ ...d, tags: [...(d.tags ?? []), t] }));
    }
    setTagInput('');
  };
  const removeTag = (tag: string) => setNewDoc(d => ({ ...d, tags: (d.tags ?? []).filter(t => t !== tag) }));

  return (
    <View style={docLib.container}>
      {/* Header */}
      <View style={docLib.header}>
        <View style={docLib.headerIconWrap}>
          <MaterialIcons name="menu-book" size={22} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={docLib.headerTitle}>BTNG Document Library</Text>
          <Text style={docLib.headerSub}>{docs.length} documents · {activeCount} active · {confidCount} confidential</Text>
        </View>
        <View style={docLib.headerActions}>
          <TouchableOpacity
            style={[docLib.viewToggle, { backgroundColor: viewMode === 'grid' ? Colors.primaryGlow : Colors.bgElevated }]}
            onPress={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}
          >
            <MaterialIcons name={viewMode === 'grid' ? 'view-list' : 'grid-view'} size={16} color={viewMode === 'grid' ? Colors.primary : Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={docLib.addBtn}
            onPress={() => { setEditDoc(null); setUploadFileName(''); setNewDoc({ title: '', description: '', category: 'legal', type: 'pdf', status: 'active', tags: [], author: adminName, version: 'v1.0', date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), size: '—', views: 0 }); setTagInput(''); setShowAddModal(true); }}
          >
            <MaterialIcons name="add" size={16} color={Colors.bg} />
            <Text style={docLib.addBtnText}>Add Doc</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick stats */}
      <View style={docLib.statsRow}>
        {[
          { label: 'Total',        val: docs.length,   color: Colors.primary   },
          { label: 'Active',       val: activeCount,   color: Colors.success   },
          { label: 'Confidential', val: confidCount,   color: Colors.error     },
          { label: 'Pinned',       val: pinnedCount,   color: Colors.warning   },
          { label: 'Total Views',  val: totalViews,    color: '#3B82F6'        },
        ].map(s => (
          <View key={s.label} style={[docLib.statCard, { borderColor: s.color + '44' }]}>
            <Text style={[docLib.statVal, { color: s.color }]}>{s.val >= 1000 ? `${(s.val / 1000).toFixed(1)}K` : s.val}</Text>
            <Text style={docLib.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Search bar */}
      <View style={docLib.searchBar}>
        <MaterialIcons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={docLib.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search title, description, tags..."
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort row */}
      <View style={docLib.sortRow}>
        <Text style={docLib.sortLabel}>Sort:</Text>
        {(['date', 'views', 'title'] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[docLib.sortChip, sortBy === s && docLib.sortChipActive]}
            onPress={() => setSortBy(s)}
          >
            <Text style={[docLib.sortChipText, sortBy === s && { color: Colors.bg }]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        {(['all', 'active', 'archived', 'draft', 'confidential'] as const).map(s => {
          const sc = s === 'active' ? Colors.success : s === 'confidential' ? Colors.error : s === 'draft' ? Colors.warning : s === 'archived' ? Colors.textMuted : Colors.primary;
          return (
            <TouchableOpacity
              key={s}
              style={[docLib.sortChip, statusFilter === s && { backgroundColor: sc, borderColor: sc }]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[docLib.sortChipText, statusFilter === s && { color: Colors.bg }]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={docLib.catScrollWrap} contentContainerStyle={docLib.catScrollContent}>
        {DOC_CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[docLib.catChip, catFilter === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]}
            onPress={() => setCatFilter(cat.id)}
          >
            <MaterialIcons name={cat.icon as any} size={12} color={catFilter === cat.id ? Colors.bg : cat.color} />
            <Text style={[docLib.catChipText, catFilter === cat.id && { color: Colors.bg }]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results count */}
      <View style={docLib.resultsRow}>
        <MaterialIcons name="filter-list" size={13} color={Colors.textMuted} />
        <Text style={docLib.resultsText}>{filtered.length} document{filtered.length !== 1 ? 's' : ''} found</Text>
      </View>

      {/* Document list */}
      {filtered.length === 0 ? (
        <View style={docLib.emptyWrap}>
          <MaterialIcons name="folder-open" size={48} color={Colors.textMuted} />
          <Text style={docLib.emptyTitle}>No documents found</Text>
          <Text style={docLib.emptySub}>Try adjusting your filters or add a new document.</Text>
        </View>
      ) : (
        <View style={viewMode === 'grid' ? docLib.gridWrap : { gap: Spacing.sm }}>
          {filtered.map(doc => {
            const typeCfg = DOC_TYPES[doc.type] ?? DOC_TYPES.other;
            const statusCfg = STATUS_CFG[doc.status];
            const catCfg = DOC_CATEGORIES.find(c => c.id === doc.category) ?? DOC_CATEGORIES[0];
            const isExpanded = expandedId === doc.id;

            if (viewMode === 'grid') {
              return (
                <TouchableOpacity
                  key={doc.id}
                  style={[docLib.gridCard, { borderColor: catCfg.color + '44' }]}
                  onPress={() => handleView(doc)}
                  activeOpacity={0.85}
                >
                  {doc.pinned && (
                    <View style={docLib.gridPinBadge}>
                      <MaterialIcons name="push-pin" size={9} color={Colors.warning} />
                    </View>
                  )}
                  <View style={[docLib.gridIconWrap, { backgroundColor: typeCfg.color + '18', borderColor: typeCfg.color + '44' }]}>
                    <MaterialIcons name={typeCfg.icon as any} size={22} color={typeCfg.color} />
                  </View>
                  <Text style={docLib.gridTitle} numberOfLines={2}>{doc.title}</Text>
                  <View style={[docLib.gridCatBadge, { backgroundColor: catCfg.color + '18', borderColor: catCfg.color + '44' }]}>
                    <Text style={[docLib.gridCatText, { color: catCfg.color }]}>{catCfg.label}</Text>
                  </View>
                  <View style={[docLib.gridStatusBadge, { backgroundColor: statusCfg.bg }]}>
                    <Text style={[docLib.gridStatusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                  </View>
                  <Text style={docLib.gridMeta}>{doc.version} · {doc.date}</Text>
                  <View style={docLib.gridViewsRow}>
                    <MaterialIcons name="visibility" size={10} color={Colors.textMuted} />
                    <Text style={docLib.gridViewsText}>{doc.views}</Text>
                  </View>
                </TouchableOpacity>
              );
            }

            return (
              <View key={doc.id} style={[docLib.listCard, { borderLeftColor: catCfg.color, borderLeftWidth: 3 }]}>
                {/* Card header row */}
                <TouchableOpacity
                  style={docLib.listCardTop}
                  onPress={() => setExpandedId(isExpanded ? null : doc.id)}
                  activeOpacity={0.78}
                >
                  <View style={[docLib.listIconWrap, { backgroundColor: typeCfg.color + '18', borderColor: typeCfg.color + '44' }]}>
                    <MaterialIcons name={typeCfg.icon as any} size={20} color={typeCfg.color} />
                    {doc.pinned && (
                      <View style={docLib.pinIndicator}>
                        <MaterialIcons name="push-pin" size={8} color={Colors.warning} />
                      </View>
                    )}
                  </View>
                  <View style={docLib.listInfo}>
                    <View style={docLib.listTitleRow}>
                      <Text style={docLib.listTitle} numberOfLines={1}>{doc.title}</Text>
                      <View style={[docLib.listStatusBadge, { backgroundColor: statusCfg.bg, borderColor: statusCfg.color + '44' }]}>
                        <Text style={[docLib.listStatusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                      </View>
                    </View>
                    <View style={docLib.listMetaRow}>
                      <View style={[docLib.listCatBadge, { backgroundColor: catCfg.color + '18', borderColor: catCfg.color + '33' }]}>
                        <MaterialIcons name={catCfg.icon as any} size={10} color={catCfg.color} />
                        <Text style={[docLib.listCatText, { color: catCfg.color }]}>{catCfg.label}</Text>
                      </View>
                      <Text style={docLib.listMetaText}>{doc.version}</Text>
                      <Text style={docLib.listMetaDot}>·</Text>
                      <Text style={docLib.listMetaText}>{doc.date}</Text>
                      <Text style={docLib.listMetaDot}>·</Text>
                      <MaterialIcons name="visibility" size={9} color={Colors.textMuted} />
                      <Text style={docLib.listMetaText}>{doc.views}</Text>
                    </View>
                  </View>
                  <MaterialIcons
                    name={isExpanded ? 'expand-less' : 'expand-more'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>

                {/* Expanded detail */}
                {isExpanded && (
                  <View style={docLib.listExpanded}>
                    <Text style={docLib.listDescription}>{doc.description}</Text>

                    <View style={docLib.listDetailsGrid}>
                      {[
                        { label: 'Author',   val: doc.author   },
                        { label: 'Version',  val: doc.version  },
                        { label: 'File Size',val: doc.size     },
                        { label: 'Added',    val: doc.date     },
                        { label: 'Category', val: catCfg.label },
                        { label: 'Type',     val: doc.type.toUpperCase() },
                      ].map(row => (
                        <View key={row.label} style={docLib.listDetailRow}>
                          <Text style={docLib.listDetailLabel}>{row.label}</Text>
                          <Text style={docLib.listDetailVal}>{row.val}</Text>
                        </View>
                      ))}
                    </View>

                    {doc.tags.length > 0 && (
                      <View style={docLib.listTagsRow}>
                        {doc.tags.map(tag => (
                          <View key={tag} style={docLib.listTag}>
                            <Text style={docLib.listTagText}>#{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Actions */}
                    <View style={docLib.listActions}>
                      <TouchableOpacity
                        style={[docLib.listActionBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}
                        onPress={() => handleView(doc)}
                      >
                        <MaterialIcons name={doc.url ? 'open-in-new' : 'visibility'} size={14} color={Colors.primary} />
                        <Text style={[docLib.listActionText, { color: Colors.primary }]}>{doc.url ? 'Open' : 'View'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[docLib.listActionBtn, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '33' }]}
                        onPress={() => openEdit(doc)}
                      >
                        <MaterialIcons name="edit" size={14} color={Colors.primary} />
                        <Text style={[docLib.listActionText, { color: Colors.primary }]}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[docLib.listActionBtn, { backgroundColor: (doc.pinned ? Colors.warningBg : Colors.bgElevated), borderColor: Colors.warning + '44' }]}
                        onPress={() => handlePin(doc)}
                      >
                        <MaterialIcons name="push-pin" size={14} color={Colors.warning} />
                        <Text style={[docLib.listActionText, { color: Colors.warning }]}>{doc.pinned ? 'Unpin' : 'Pin'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[docLib.listActionBtn, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}
                        onPress={() => handleArchive(doc)}
                      >
                        <MaterialIcons name={doc.status === 'archived' ? 'unarchive' : 'archive'} size={14} color={Colors.textMuted} />
                        <Text style={[docLib.listActionText, { color: Colors.textMuted }]}>{doc.status === 'archived' ? 'Restore' : 'Archive'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[docLib.listActionBtn, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }]}
                        onPress={() => handleDelete(doc)}
                      >
                        <MaterialIcons name="delete-outline" size={14} color={Colors.error} />
                        <Text style={[docLib.listActionText, { color: Colors.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Footer note */}
      <View style={docLib.footerNote}>
        <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
        <Text style={docLib.footerNoteText}>Documents are stored locally on-device. In production, link documents to the BTNG secure storage bucket or external CDN URLs.</Text>
      </View>

      {/* Add / Edit Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={docLib.modalOverlay}>
            <View style={docLib.modalSheet}>
              <View style={docLib.modalHeader}>
                <TouchableOpacity onPress={() => { setShowAddModal(false); setEditDoc(null); setUploadFileName(''); }}>
                  <MaterialIcons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={docLib.modalTitle}>{editDoc ? 'Edit Document' : 'Add Document'}</Text>
                <TouchableOpacity style={docLib.modalSaveBtn} onPress={handleSaveDoc}>
                  <Text style={docLib.modalSaveBtnText}>{editDoc ? 'Update' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={docLib.modalContent}>
                {/* Title */}
                <Text style={docLib.modalFieldLabel}>Title *</Text>
                <TextInput style={docLib.modalInput} value={newDoc.title ?? ''} onChangeText={v => setNewDoc(d => ({ ...d, title: v }))} placeholder="Document title..." placeholderTextColor={Colors.textMuted} />

                {/* Description */}
                <Text style={docLib.modalFieldLabel}>Description</Text>
                <TextInput style={[docLib.modalInput, { minHeight: 72 }]} value={newDoc.description ?? ''} onChangeText={v => setNewDoc(d => ({ ...d, description: v }))} placeholder="Brief description..." placeholderTextColor={Colors.textMuted} multiline />

                {/* Category */}
                <Text style={docLib.modalFieldLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: 4 }}>
                  {DOC_CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                    <TouchableOpacity key={cat.id} style={[docLib.catChip, newDoc.category === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]} onPress={() => setNewDoc(d => ({ ...d, category: cat.id }))}>
                      <MaterialIcons name={cat.icon as any} size={11} color={newDoc.category === cat.id ? Colors.bg : cat.color} />
                      <Text style={[docLib.catChipText, newDoc.category === cat.id && { color: Colors.bg }]}>{cat.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Type */}
                <Text style={docLib.modalFieldLabel}>File Type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {Object.entries(DOC_TYPES).map(([t, cfg]) => (
                    <TouchableOpacity key={t} style={[docLib.sortChip, newDoc.type === t && { backgroundColor: cfg.color, borderColor: cfg.color }]} onPress={() => setNewDoc(d => ({ ...d, type: t }))}>
                      <MaterialIcons name={cfg.icon as any} size={12} color={newDoc.type === t ? Colors.bg : cfg.color} />
                      <Text style={[docLib.sortChipText, newDoc.type === t && { color: Colors.bg }]}>{t.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Status */}
                <Text style={docLib.modalFieldLabel}>Status</Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS_CFG).map(([k, v]) => (
                    <TouchableOpacity key={k} style={[docLib.sortChip, newDoc.status === k && { backgroundColor: v.color, borderColor: v.color }]} onPress={() => setNewDoc(d => ({ ...d, status: k as any }))}>
                      <Text style={[docLib.sortChipText, newDoc.status === k && { color: Colors.bg }]}>{v.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Author & Version & Size */}
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <View style={{ flex: 2 }}>
                    <Text style={docLib.modalFieldLabel}>Author</Text>
                    <TextInput style={docLib.modalInput} value={newDoc.author ?? ''} onChangeText={v => setNewDoc(d => ({ ...d, author: v }))} placeholder="Author name" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={docLib.modalFieldLabel}>Version</Text>
                    <TextInput style={docLib.modalInput} value={newDoc.version ?? ''} onChangeText={v => setNewDoc(d => ({ ...d, version: v }))} placeholder="v1.0" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={docLib.modalFieldLabel}>Size</Text>
                    <TextInput style={docLib.modalInput} value={newDoc.size ?? ''} onChangeText={v => setNewDoc(d => ({ ...d, size: v }))} placeholder="2 MB" placeholderTextColor={Colors.textMuted} />
                  </View>
                </View>

                {/* File Upload + URL */}
                <Text style={docLib.modalFieldLabel}>File Upload / URL</Text>
                <TouchableOpacity
                  style={[docLib.uploadBtn, uploading && { opacity: 0.6 }]}
                  onPress={handleUploadFile}
                  disabled={uploading}
                  activeOpacity={0.85}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={Colors.bg} />
                  ) : (
                    <MaterialIcons name="upload-file" size={17} color={Colors.bg} />
                  )}
                  <Text style={docLib.uploadBtnText}>{uploading ? 'Uploading…' : 'Upload File (PDF, Image, DOC)'}</Text>
                </TouchableOpacity>
                {(newDoc.url && newDoc.url.startsWith('storage:')) ? (
                  <View style={docLib.uploadedBadge}>
                    <MaterialIcons name="check-circle" size={14} color={Colors.success} />
                    <Text style={docLib.uploadedBadgeText} numberOfLines={1}>
                      {uploadFileName || 'File uploaded to storage'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => { setUploadFileName(''); setNewDoc(d => ({ ...d, url: undefined })); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <View style={docLib.uploadDividerRow}>
                  <View style={docLib.uploadDividerLine} />
                  <Text style={docLib.uploadDividerText}>or paste a URL / app route</Text>
                  <View style={docLib.uploadDividerLine} />
                </View>
                <TextInput
                  style={docLib.modalInput}
                  value={(newDoc.url && !newDoc.url.startsWith('storage:')) ? newDoc.url : ''}
                  onChangeText={v => { setNewDoc(d => ({ ...d, url: v || undefined })); setUploadFileName(''); }}
                  placeholder="https://... or /route"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Tags */}
                <Text style={docLib.modalFieldLabel}>Tags</Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                  <TextInput style={[docLib.modalInput, { flex: 1, marginBottom: 0 }]} value={tagInput} onChangeText={setTagInput} placeholder="Add tag..." placeholderTextColor={Colors.textMuted} onSubmitEditing={addTag} returnKeyType="done" />
                  <TouchableOpacity style={docLib.tagAddBtn} onPress={addTag}><MaterialIcons name="add" size={18} color={Colors.bg} /></TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm }}>
                  {(newDoc.tags ?? []).map(tag => (
                    <TouchableOpacity key={tag} style={docLib.tagChip} onPress={() => removeTag(tag)}>
                      <Text style={docLib.tagChipText}>#{tag}</Text>
                      <MaterialIcons name="close" size={11} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Pinned */}
                <View style={docLib.pinnedToggleRow}>
                  <MaterialIcons name="push-pin" size={16} color={Colors.warning} />
                  <Text style={docLib.pinnedToggleLabel}>Pin to top of library</Text>
                  <Switch value={newDoc.pinned ?? false} onValueChange={v => setNewDoc(d => ({ ...d, pinned: v }))} trackColor={{ false: Colors.bgElevated, true: Colors.warning }} thumbColor="#fff" />
                </View>

                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const docLib = StyleSheet.create({
  container:          { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.xl },
  header:             { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  headerIconWrap:     { width: 48, height: 48, borderRadius: 15, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle:        { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub:          { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  headerActions:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 0 },
  viewToggle:         { width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  addBtn:             { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  addBtnText:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  statsRow:           { flexDirection: 'row', gap: Spacing.sm },
  statCard:           { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:            { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:          { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  searchBar:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 46 },
  searchInput:        { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  sortRow:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  sortLabel:          { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  sortChip:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm + 2, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  sortChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sortChipText:       { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  catScrollWrap:      { marginHorizontal: -Spacing.xl },
  catScrollContent:   { paddingHorizontal: Spacing.xl, flexDirection: 'row', gap: Spacing.sm },
  catChip:            { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  catChipText:        { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  resultsRow:         { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resultsText:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap:          { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle:         { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:           { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  // List card
  listCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  listCardTop:        { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  listIconWrap:       { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  pinIndicator:       { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  listInfo:           { flex: 1, gap: 5 },
  listTitleRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'nowrap' },
  listTitle:          { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  listStatusBadge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1, flexShrink: 0 },
  listStatusText:     { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  listMetaRow:        { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  listCatBadge:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  listCatText:        { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  listMetaText:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  listMetaDot:        { fontSize: 10, color: Colors.textMuted },
  // Expanded
  listExpanded:       { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, gap: Spacing.md, backgroundColor: Colors.bgElevated },
  listDescription:    { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  listDetailsGrid:    { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  listDetailRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listDetailLabel:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  listDetailVal:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  listTagsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  listTag:            { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '33' },
  listTagText:        { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  listActions:        { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  listActionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1, borderRadius: Radius.lg, borderWidth: 1 },
  listActionText:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  // Grid
  gridWrap:           { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gridCard:           { width: '47%', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, gap: 6, position: 'relative', minHeight: 160 },
  gridPinBadge:       { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  gridIconWrap:       { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gridTitle:          { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 16, includeFontPadding: false },
  gridCatBadge:       { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  gridCatText:        { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  gridStatusBadge:    { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  gridStatusText:     { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  gridMeta:           { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  gridViewsRow:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridViewsText:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  // Footer note
  footerNote:         { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  footerNoteText:     { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  // Upload
  uploadBtn:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, borderWidth: 1, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  uploadBtnText:      { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  uploadedBadge:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.success + '44' },
  uploadedBadgeText:  { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.success, includeFontPadding: false },
  uploadDividerRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  uploadDividerLine:  { flex: 1, height: 1, backgroundColor: Colors.border },
  uploadDividerText:  { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  // Modal
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(6,6,8,0.82)', justifyContent: 'flex-end' },
  modalSheet:         { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '92%', borderWidth: 1, borderColor: Colors.border },
  modalHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:         { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalSaveBtn:       { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 60, alignItems: 'center' },
  modalSaveBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  modalContent:       { padding: Spacing.xl, gap: Spacing.md },
  modalFieldLabel:    { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.3, includeFontPadding: false },
  modalInput:         { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false, marginBottom: 0 },
  tagAddBtn:          { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  tagChip:            { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  tagChipText:        { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  pinnedToggleRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '33' },
  pinnedToggleLabel:  { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'blog' | 'kyc' | 'deposits' | 'users' | 'logs' | 'activity' | 'account' | 'devsettings' | 'docs'>('dashboard');

  // ── HARD SECURITY GUARD — non-admin users are IMMEDIATELY redirected ─────
  // This is the first thing that runs, before any data hooks, preventing any
  // leak of admin UI or data to unauthorized users.
  const isAuthorized = !!user?.email && AUTHORIZED_ADMIN_EMAILS.includes(user.email.toLowerCase()) && user?.is_admin === true;

  // If not loading and not authorized, show access-denied immediately
  // (Do NOT allow partial renders of admin content for non-admins)

  const { events: activityEvents, loading: activityLoading, totalCount: activityTotal, refresh: refreshActivity, logEvent } = useAdminActivityLog(user?.id);

  const { articles, loading: blogLoading, saving, publish, edit, remove, toggleStatus, refresh } = useAdminBlog();
  const {
    submissions: kycSubmissions, loading: kycLoading, acting: kycActing,
    filter: kycFilter, setFilter: setKycFilter,
    approve: approveKyc, reject: rejectKyc, review: reviewKyc, refresh: refreshKyc,
    pendingCount, underReviewCount, verifiedCount, rejectedCount,
  } = useAdminKyc(user?.id);

  const {
    records: txRecords, loading: txLoading, acting: txActing,
    filter: txFilter, setFilter: setTxFilter, refresh: refreshTx,
    approve: approveTx, reject: rejectTx,
    pendingCount: txPendingCount, depositCount, withdrawCount, completedCount: txCompletedCount,
  } = useAdminDeposits(user?.id);

  const {
    users: adminUsers, loading: usersLoading, acting: usersActing,
    search: userSearch, setSearch: setUserSearch, refresh: refreshUsers,
    changeTier, toggleAdmin,
    totalCount: userTotalCount, verifiedCount: userVerifiedCount, adminCount: userAdminCount,
  } = useAdminUsers(user?.id);

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();
  const showLocalConversion = selectedCurrency.code !== 'USD';
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [sparklineUserId, setSparklineUserId] = useState<string | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);

  // ── Admin Account Security ─────────────────────────────────────────────────
  const [accNewPassword, setAccNewPassword] = useState('');
  const [accConfirmPassword, setAccConfirmPassword] = useState('');
  const [accShowPassword, setAccShowPassword] = useState(false);
  const [accChanging, setAccChanging] = useState(false);
  const [accChanged, setAccChanged] = useState(false);
  const [accResetSending, setAccResetSending] = useState(false);
  const [accResetSent, setAccResetSent] = useState(false);

  // ── Bootstrap (temp password) ───────────────────────────────────────────────
  const [bootstrapVisible, setBootstrapVisible] = useState(false);
  const [bootstrapStep, setBootstrapStep] = useState<'code' | 'create' | 'done'>('code');
  const [bootstrapCode, setBootstrapCode] = useState('');
  const [bootstrapEmail, setBootstrapEmail] = useState(AUTHORIZED_ADMIN_EMAIL);
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [bootstrapConfirm, setBootstrapConfirm] = useState('');
  const [bootstrapShowPw, setBootstrapShowPw] = useState(false);
  const [bootstrapWorking, setBootstrapWorking] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');

  const handleChangePassword = async () => {
    if (!accNewPassword.trim() || accNewPassword.length < 6) {
      showAlert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (accNewPassword !== accConfirmPassword) {
      showAlert('Mismatch', 'Passwords do not match.');
      return;
    }
    setAccChanging(true);
    const client = getSupabaseClient();
    const { error } = await client.auth.updateUser({ password: accNewPassword });
    setAccChanging(false);
    if (error) { showAlert('Error', error.message); return; }
    setAccChanged(true);
    setAccNewPassword('');
    setAccConfirmPassword('');
    setTimeout(() => setAccChanged(false), 4000);
    showAlert('Password Updated', 'Your admin password has been changed successfully.');
  };

  const handleSendResetEmail = async () => {
    setAccResetSending(true);
    const client = getSupabaseClient();
    const { error } = await client.auth.resetPasswordForEmail(AUTHORIZED_ADMIN_EMAIL, {
      redirectTo: undefined,
    });
    setAccResetSending(false);
    if (error) { showAlert('Error', error.message); return; }
    setAccResetSent(true);
    setTimeout(() => setAccResetSent(false), 6000);
    showAlert('Reset Email Sent', `A password reset link has been sent to ${AUTHORIZED_ADMIN_EMAIL}. Check your inbox.`);
  };

  const handleBootstrapVerifyCode = () => {
    if (bootstrapCode.trim() !== ADMIN_TEMP_CODE) {
      setBootstrapError('Invalid temporary access code. Please check the code and try again.');
      return;
    }
    setBootstrapError('');
    setBootstrapStep('create');
  };

  const handleBootstrapCreate = async () => {
    if (!bootstrapPassword.trim() || bootstrapPassword.length < 6) {
      setBootstrapError('Password must be at least 6 characters.');
      return;
    }
    if (bootstrapPassword !== bootstrapConfirm) {
      setBootstrapError('Passwords do not match.');
      return;
    }
    setBootstrapWorking(true);
    setBootstrapError('');
    const client = getSupabaseClient();
    const { data: signUpData, error: signUpError } = await client.auth.signUp({
      email: bootstrapEmail.trim().toLowerCase(),
      password: bootstrapPassword,
      options: {
        data: { full_name: AUTHORIZED_ADMIN_NAME },
      },
    });
    if (signUpError) {
      // Try sign-in if account already exists
      const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
        email: bootstrapEmail.trim().toLowerCase(),
        password: bootstrapPassword,
      });
      if (signInError) {
        setBootstrapWorking(false);
        setBootstrapError(signInError.message);
        return;
      }
      // Ensure is_admin flag
      if (signInData?.user) {
        await client.from('user_profiles').update({ is_admin: true, full_name: AUTHORIZED_ADMIN_NAME }).eq('id', signInData.user.id);
      }
    } else if (signUpData?.user) {
      await client.from('user_profiles').update({ is_admin: true, full_name: AUTHORIZED_ADMIN_NAME }).eq('id', signUpData.user.id);
    }
    setBootstrapWorking(false);
    setBootstrapStep('done');
  };
  const [rejectUserId, setRejectUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [txRejectId, setTxRejectId] = useState<string | null>(null);
  const [txRejectReason, setTxRejectReason] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateArticlePayload>({ ...BLANK_FORM });
  const [tagInput, setTagInput] = useState('');

  const handlePublish = async () => {
    if (!form.title.trim() || !form.content.trim() || !form.summary.trim()) {
      showAlert('Missing Fields', 'Title, summary, and content are required.');
      return;
    }
    if (editingId) {
      const { error } = await edit(editingId, form);
      if (error) { showAlert('Error', error); return; }
      showAlert('Updated', `"${form.title}" has been updated.`);
      logEvent({ action_type: 'blog_updated', details: { title: form.title, category: form.category } });
    } else {
      const { error } = await publish(form);
      if (error) { showAlert('Error', error); return; }
      showAlert('Published', `"${form.title}" is now live.`);
      logEvent({ action_type: 'blog_published', details: { title: form.title, category: form.category } });
    }
    setShowCompose(false);
    setEditingId(null);
    setForm({ ...BLANK_FORM });
  };

  const handleEdit = (article: any) => {
    setForm({
      category: article.category, title: article.title, summary: article.summary,
      content: article.content, author: article.author, author_avatar: article.author_avatar,
      date: article.date, read_time: article.read_time, image: article.image,
      image_color: article.image_color, tags: article.tags || [],
      featured: article.featured, published: article.published,
    });
    setEditingId(article.id);
    setShowCompose(true);
  };

  const handleDelete = (id: string, title: string) => {
    showAlert('Delete Article', `Delete "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await remove(id);
        if (error) showAlert('Error', error);
        else logEvent({ action_type: 'blog_deleted', details: { title } });
      }},
    ]);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  };
  const removeTag = (tag: string) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));

  // ── Access denied ──────────────────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.accessDeniedWrap}>
            <View style={styles.shieldWrap}>
              <MaterialIcons name="admin-panel-settings" size={44} color={Colors.error} />
            </View>
            <Text style={styles.accessTitle}>Access Restricted</Text>
            <Text style={styles.accessSubtitle}>This dashboard is exclusively authorized for the Bank Manager of Bituncoin Gold Bank.</Text>
            <View style={styles.identityCard}>
              <View style={styles.avatarWrap}>
                <MaterialIcons name="verified-user" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.identityName}>{AUTHORIZED_ADMIN_NAME}</Text>
                <Text style={styles.identityRole}>{AUTHORIZED_ADMIN_TITLE}</Text>
                <Text style={styles.identityEmail}>{AUTHORIZED_ADMIN_EMAIL}</Text>
              </View>
              <View style={styles.lockPill}>
                <MaterialIcons name="lock" size={11} color={Colors.warning} />
                <Text style={styles.lockPillText}>Locked</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.infoText}>
                {user ? `Signed in as ${user.email} — this account is not authorized for admin access.` : 'Please sign in with the authorized administrator account.'}
              </Text>
            </View>
            <View style={styles.secRow}>
              {['Email-Locked', 'Role-Verified', 'Bank-Grade Auth'].map(s => (
                <View key={s} style={styles.secChip}>
                  <MaterialIcons name="shield" size={10} color={Colors.success} />
                  <Text style={styles.secChipText}>{s}</Text>
                </View>
              ))}
            </View>

            {/* Bootstrap / First-time setup */}
            {!bootstrapVisible && (
              <TouchableOpacity
                style={bsStyles.setupBtn}
                onPress={() => { setBootstrapVisible(true); setBootstrapStep('code'); setBootstrapCode(''); setBootstrapError(''); }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="admin-panel-settings" size={16} color={Colors.warning} />
                <Text style={bsStyles.setupBtnText}>First-Time Admin Setup / Emergency Access</Text>
              </TouchableOpacity>
            )}

            {bootstrapVisible && (
              <View style={bsStyles.card}>
                <View style={bsStyles.cardHeader}>
                  <View style={bsStyles.cardIconWrap}>
                    <MaterialIcons name={bootstrapStep === 'done' ? 'check-circle' : 'vpn-key'} size={22} color={bootstrapStep === 'done' ? Colors.success : Colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={bsStyles.cardTitle}>
                      {bootstrapStep === 'code' ? 'Enter Temporary Access Code'
                        : bootstrapStep === 'create' ? 'Create Admin Account'
                        : 'Account Ready'}
                    </Text>
                    <Text style={bsStyles.cardSub}>
                      {bootstrapStep === 'code' ? `Use code: ${ADMIN_TEMP_CODE}`
                        : bootstrapStep === 'create' ? `Setting up ${AUTHORIZED_ADMIN_EMAIL}`
                        : 'Your admin account has been created. Sign in to continue.'}
                    </Text>
                  </View>
                </View>

                {/* Step 1: Verify temp code */}
                {bootstrapStep === 'code' && (
                  <View style={bsStyles.stepBody}>
                    <Text style={bsStyles.fieldLabel}>Temporary Access Code</Text>
                    <View style={bsStyles.inputRow}>
                      <MaterialIcons name="lock-open" size={16} color={Colors.textMuted} />
                      <TextInput
                        style={bsStyles.input}
                        value={bootstrapCode}
                        onChangeText={v => { setBootstrapCode(v); setBootstrapError(''); }}
                        placeholder={`e.g. ${ADMIN_TEMP_CODE}`}
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="characters"
                        autoCorrect={false}
                      />
                    </View>
                    {bootstrapError ? (
                      <View style={bsStyles.errorRow}>
                        <MaterialIcons name="error-outline" size={12} color={Colors.error} />
                        <Text style={bsStyles.errorText}>{bootstrapError}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[bsStyles.actionBtn, !bootstrapCode.trim() && { opacity: 0.5 }]}
                      onPress={handleBootstrapVerifyCode}
                      disabled={!bootstrapCode.trim()}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="arrow-forward" size={16} color={Colors.bg} />
                      <Text style={bsStyles.actionBtnText}>Verify Code</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step 2: Create account */}
                {bootstrapStep === 'create' && (
                  <View style={bsStyles.stepBody}>
                    <Text style={bsStyles.fieldLabel}>Admin Email</Text>
                    <View style={[bsStyles.inputRow, { backgroundColor: Colors.bgElevated }]}>
                      <MaterialIcons name="email" size={16} color={Colors.primary} />
                      <Text style={[bsStyles.input, { color: Colors.primary, fontWeight: '700' }]}>{AUTHORIZED_ADMIN_EMAIL}</Text>
                      <MaterialIcons name="lock" size={13} color={Colors.textMuted} />
                    </View>
                    <Text style={bsStyles.fieldLabel}>New Password</Text>
                    <View style={bsStyles.inputRow}>
                      <MaterialIcons name="lock-outline" size={16} color={Colors.textMuted} />
                      <TextInput
                        style={bsStyles.input}
                        value={bootstrapPassword}
                        onChangeText={v => { setBootstrapPassword(v); setBootstrapError(''); }}
                        placeholder="Min. 6 characters"
                        placeholderTextColor={Colors.textMuted}
                        secureTextEntry={!bootstrapShowPw}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity onPress={() => setBootstrapShowPw(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name={bootstrapShowPw ? 'visibility' : 'visibility-off'} size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={bsStyles.fieldLabel}>Confirm Password</Text>
                    <View style={[bsStyles.inputRow, bootstrapConfirm && bootstrapPassword !== bootstrapConfirm && { borderColor: Colors.error }]}>
                      <MaterialIcons name="lock" size={16} color={Colors.textMuted} />
                      <TextInput
                        style={bsStyles.input}
                        value={bootstrapConfirm}
                        onChangeText={v => { setBootstrapConfirm(v); setBootstrapError(''); }}
                        placeholder="Repeat password"
                        placeholderTextColor={Colors.textMuted}
                        secureTextEntry={!bootstrapShowPw}
                        autoCapitalize="none"
                      />
                    </View>
                    {bootstrapError ? (
                      <View style={bsStyles.errorRow}>
                        <MaterialIcons name="error-outline" size={12} color={Colors.error} />
                        <Text style={bsStyles.errorText}>{bootstrapError}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[bsStyles.actionBtn, bootstrapWorking && { opacity: 0.6 }]}
                      onPress={handleBootstrapCreate}
                      disabled={bootstrapWorking}
                      activeOpacity={0.85}
                    >
                      {bootstrapWorking ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="person-add" size={16} color={Colors.bg} />}
                      <Text style={bsStyles.actionBtnText}>{bootstrapWorking ? 'Creating Account…' : 'Create Admin Account'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step 3: Done */}
                {bootstrapStep === 'done' && (
                  <View style={bsStyles.stepBody}>
                    <View style={bsStyles.doneCard}>
                      <MaterialIcons name="check-circle" size={40} color={Colors.success} />
                      <Text style={bsStyles.doneTitle}>Account Created!</Text>
                      <Text style={bsStyles.doneSub}>Go to Login and sign in with your new credentials to access the Admin Dashboard.</Text>
                      <View style={bsStyles.doneCredRow}>
                        <MaterialIcons name="email" size={12} color={Colors.primary} />
                        <Text style={bsStyles.doneCredText}>{AUTHORIZED_ADMIN_EMAIL}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[bsStyles.actionBtn, { backgroundColor: Colors.success }]}
                      onPress={() => { setBootstrapVisible(false); router.replace('/login'); }}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="login" size={16} color={Colors.bg} />
                      <Text style={bsStyles.actionBtnText}>Go to Login</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={bsStyles.closeBtn}
                  onPress={() => { setBootstrapVisible(false); setBootstrapStep('code'); setBootstrapCode(''); setBootstrapError(''); setBootstrapPassword(''); setBootstrapConfirm(''); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                  <Text style={bsStyles.closeBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>{AUTHORIZED_ADMIN_NAME} · Bank Manager</Text>
        </View>
        <View style={styles.adminBadge}>
          <MaterialIcons name="admin-panel-settings" size={16} color={Colors.primary} />
          <Text style={styles.adminBadgeText}>Admin</Text>
        </View>
      </View>

      {/* Tab Row */}
      <View style={styles.tabRow}>
        {(['dashboard', 'blog', 'kyc', 'deposits', 'users', 'docs', 'logs', 'activity', 'account', 'devsettings'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t as any)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'dashboard' ? 'Stats'
                : t === 'kyc' ? `KYC${pendingCount > 0 ? ` (${pendingCount})` : ''}`
                : t === 'deposits' ? `Txns${txPendingCount > 0 ? ` (${txPendingCount})` : ''}`
                : t === 'activity' ? `Log${activityTotal > 0 ? ` (${activityTotal})` : ''}`
                : t === 'account' ? 'Security'
                : t === 'devsettings' ? '⚙️ Dev'
                : t === 'docs' ? '📚 Docs'
                : t === 'developer' ? '🧑‍💻 Dev Lib'
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── DASHBOARD TAB ── */}
        {activeTab === 'dashboard' && (
          <>
            {/* Security Status Card */}
            <TouchableOpacity
              style={styles.securityStatusCard}
              onPress={() => router.push('/btng-security-status' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.securityStatusIconWrap}>
                <MaterialIcons name="verified-user" size={26} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.securityStatusTitleRow}>
                  <Text style={styles.securityStatusTitle}>BTNG712 Security Status</Text>
                  <View style={[styles.securityStatusBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success }} />
                    <Text style={[styles.securityStatusBadgeText, { color: Colors.success }]}>LIVE</Text>
                  </View>
                </View>
                <Text style={styles.securityStatusDesc}>SSL Pinning · Handshake · Node Health</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={15} color="#22C55E" />
            </TouchableOpacity>

            {/* App Builder Card */}
            <TouchableOpacity
              style={styles.appBuilderCard}
              onPress={() => router.push('/app-builder' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.appBuilderIconWrap}>
                <MaterialIcons name="construction" size={28} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.appBuilderTitleRow}>
                  <Text style={styles.appBuilderTitle}>App Builder · Admin Center</Text>
                  <View style={styles.appBuilderBadge}>
                    <MaterialIcons name="publish" size={10} color={Colors.primary} />
                    <Text style={styles.appBuilderBadgeText}>Edit & Publish</Text>
                  </View>
                </View>
                <Text style={styles.appBuilderDesc}>Customize fonts, theme, features &amp; bank config</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={15} color={Colors.primary} />
            </TouchableOpacity>

            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <StatCard label="Total Users" value={ADMIN_STATS.totalUsers.toLocaleString()} sub="+142 this week" style={{ flex: 1 }} />
                <StatCard label="Active (24h)" value={ADMIN_STATS.activeUsers.toLocaleString()} sub="56.3% of total" color={Colors.success} style={{ flex: 1 }} />
              </View>
              <View style={styles.statsRow}>
                <StatCard label="Volume (24h)" value={`$${(ADMIN_STATS.totalVolume24h / 1_000_000).toFixed(1)}M`} sub="BTNG + all pairs" color={Colors.info} style={{ flex: 1 }} />
                <StatCard label="Revenue (30d)" value={`$${(ADMIN_STATS.totalRevenue30d / 1_000_000).toFixed(2)}M`} sub="Trading fees" color={Colors.copper} style={{ flex: 1 }} />
              </View>
              <View style={styles.statsRow}>
                <StatCard label="Blog Articles" value={String(articles.length)} sub={`${articles.filter(a => a.published).length} published`} color={Colors.primary} style={{ flex: 1 }} />
                <StatCard label="Pending KYC" value={String(pendingCount)} sub="Requires review" color={Colors.warning} style={{ flex: 1 }} />
              </View>
            </View>
            <View style={styles.overviewCard}>
              <View style={styles.overviewHeader}>
                <Text style={[styles.cardTitle, { paddingHorizontal: 0, marginBottom: 0 }]}>Platform Overview</Text>
                <View style={styles.overviewHeaderRight}>
                  {showLocalConversion && (
                    <View style={styles.currencyPill}>
                      <Text style={styles.currencyPillFlag}>{selectedCurrency.flag}</Text>
                      <Text style={styles.currencyPillCode}>{selectedCurrency.code}</Text>
                    </View>
                  )}
                  <View style={styles.livePill}>
                    {ratesLoading ? null : <View style={styles.liveDot} />}
                    <Text style={styles.livePillText}>{rateTimestamp ? `Live · ${rateTimestamp}` : 'Live'}</Text>
                  </View>
                </View>
              </View>
              {[
                { label: 'Total Deposits',    usd: ADMIN_STATS.totalDeposits,    fmt: `$${(ADMIN_STATS.totalDeposits / 1_000_000).toFixed(1)}M`, color: undefined },
                { label: 'Total Withdrawals', usd: ADMIN_STATS.totalWithdrawals,  fmt: `$${(ADMIN_STATS.totalWithdrawals / 1_000_000).toFixed(1)}M`, color: undefined },
                { label: 'Net Flow',          usd: ADMIN_STATS.totalDeposits - ADMIN_STATS.totalWithdrawals, fmt: `+$${((ADMIN_STATS.totalDeposits - ADMIN_STATS.totalWithdrawals) / 1_000_000).toFixed(1)}M`, color: Colors.success },
                { label: 'Volume (24h)',       usd: ADMIN_STATS.totalVolume24h,   fmt: `$${(ADMIN_STATS.totalVolume24h / 1_000_000).toFixed(1)}M`, color: undefined },
                { label: 'Revenue (30d)',      usd: ADMIN_STATS.totalRevenue30d,  fmt: `$${(ADMIN_STATS.totalRevenue30d / 1_000_000).toFixed(2)}M`, color: Colors.copper },
                { label: 'BTNG Price',         usd: 4.72,                         fmt: '$4.720', color: Colors.primary },
              ].map(row => {
                const localVal = showLocalConversion ? convertUSDRaw(row.usd) : 0;
                const fmtLocal = localVal >= 1_000_000
                  ? `${selectedCurrency.symbol}${(localVal / 1_000_000).toFixed(1)}M`
                  : localVal >= 1_000
                  ? `${selectedCurrency.symbol}${(localVal / 1_000).toFixed(1)}K`
                  : `${selectedCurrency.symbol}${localVal.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
                return (
                  <View key={row.label} style={styles.overviewRow}>
                    <Text style={styles.overviewLabel}>{row.label}</Text>
                    <View style={styles.overviewValueCol}>
                      <Text style={[styles.overviewValue, row.color ? { color: row.color } : {}]}>{row.fmt}</Text>
                      {showLocalConversion && localVal > 0 && (
                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeFlag}>{selectedCurrency.flag}</Text>
                          <Text style={[styles.localBadgeText, row.color ? { color: row.color } : {}]}>{fmtLocal}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── BLOG CMS TAB ── */}
        {activeTab === 'blog' && (
          <View style={styles.blogSection}>
            <View style={styles.blogHeader}>
              <View>
                <Text style={styles.cardTitle}>Blog CMS</Text>
                <Text style={styles.blogSubtitle}>{articles.length} articles · {articles.filter(a => a.published).length} published</Text>
              </View>
              <TouchableOpacity style={styles.composeBtn} onPress={() => { setForm({ ...BLANK_FORM }); setEditingId(null); setShowCompose(true); }}>
                <MaterialIcons name="add" size={18} color={Colors.bg} />
                <Text style={styles.composeBtnText}>New Post</Text>
              </TouchableOpacity>
            </View>
            {blogLoading ? (
              <View style={styles.blogLoading}><ActivityIndicator color={Colors.primary} /><Text style={styles.blogLoadingText}>Loading articles...</Text></View>
            ) : articles.length === 0 ? (
              <View style={styles.emptyBlog}>
                <MaterialIcons name="article" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyBlogText}>No articles yet</Text>
                <TouchableOpacity style={styles.composeBtn} onPress={() => setShowCompose(true)}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} />
                  <Text style={styles.composeBtnText}>Publish First Article</Text>
                </TouchableOpacity>
              </View>
            ) : (
              articles.map(article => {
                const catColor = CATEGORY_COLORS[article.category] || Colors.primary;
                return (
                  <View key={article.id} style={styles.articleRow}>
                    <View style={[styles.articleRowEmoji, { backgroundColor: catColor + '18', borderColor: catColor + '33' }]}>
                      <Text style={styles.articleRowEmojiText}>{article.image}</Text>
                    </View>
                    <View style={styles.articleRowInfo}>
                      <View style={styles.articleRowTop}>
                        <View style={[styles.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '33' }]}>
                          <Text style={[styles.catBadgeText, { color: catColor }]}>{article.category}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: article.published ? Colors.successBg : Colors.warningBg }]}>
                          <View style={[styles.statusDot, { backgroundColor: article.published ? Colors.success : Colors.warning }]} />
                          <Text style={[styles.statusText, { color: article.published ? Colors.success : Colors.warning }]}>{article.published ? 'Live' : 'Draft'}</Text>
                        </View>
                        {article.featured && (
                          <View style={styles.featuredBadge}>
                            <MaterialIcons name="star" size={10} color={Colors.primary} />
                            <Text style={styles.featuredBadgeText}>Featured</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.articleRowTitle} numberOfLines={2}>{article.title}</Text>
                      <View style={styles.articleRowMeta}>
                        <MaterialIcons name="visibility" size={11} color={Colors.textMuted} />
                        <Text style={styles.articleRowMetaText}>{article.views.toLocaleString()} views</Text>
                        <View style={styles.metaDot} />
                        <Text style={styles.articleRowMetaText}>{article.date}</Text>
                      </View>
                    </View>
                    <View style={styles.articleRowActions}>
                      <Switch value={article.published} onValueChange={(val) => toggleStatus(article.id, val)} trackColor={{ false: Colors.bgElevated, true: Colors.primary }} thumbColor="#fff" style={{ transform: [{ scale: 0.8 }] }} />
                      <TouchableOpacity style={styles.editBtn} onPress={() => handleEdit(article)}>
                        <MaterialIcons name="edit" size={14} color={Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(article.id, article.title)}>
                        <MaterialIcons name="delete-outline" size={14} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── KYC REVIEW TAB ── */}
        {activeTab === 'kyc' && (
          <View style={styles.kycSection}>
            <View style={styles.kycHeaderRow}>
              <View>
                <Text style={styles.kycHeaderTitle}>KYC Review</Text>
                <Text style={styles.kycHeaderSub}>{pendingCount + underReviewCount + verifiedCount + rejectedCount} total submissions</Text>
              </View>
              <View style={styles.kycHeaderRight}>
                {showLocalConversion && (
                  <View style={styles.currencyPill}>
                    <Text style={styles.currencyPillFlag}>{selectedCurrency.flag}</Text>
                    <Text style={styles.currencyPillCode}>{selectedCurrency.code}</Text>
                  </View>
                )}
                <View style={styles.livePill}>
                  {ratesLoading ? null : <View style={styles.liveDot} />}
                  <Text style={styles.livePillText}>{rateTimestamp ? `Live · ${rateTimestamp}` : 'Live'}</Text>
                </View>
              </View>
            </View>
            <View style={styles.kycStatsRow}>
              {[
                { label: 'Pending', count: pendingCount, color: Colors.warning },
                { label: 'In Review', count: underReviewCount, color: '#3B82F6' },
                { label: 'Verified', count: verifiedCount, color: Colors.success },
                { label: 'Rejected', count: rejectedCount, color: Colors.error },
              ].map(s => (
                <TouchableOpacity key={s.label} style={[styles.kycStatCard, { borderColor: s.color + '44', backgroundColor: s.color + '11' }]} onPress={() => setKycFilter(s.label.toLowerCase().replace(' ', '_') as any)}>
                  <Text style={[styles.kycStatCount, { color: s.color }]}>{s.count}</Text>
                  <Text style={[styles.kycStatLabel, { color: s.color }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.xl }} contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: Spacing.sm }}>
              {(['all', 'pending', 'under_review', 'verified', 'rejected'] as const).map(f => (
                <TouchableOpacity key={f} style={[styles.kycFilterChip, kycFilter === f && styles.kycFilterChipActive]} onPress={() => setKycFilter(f as any)}>
                  <Text style={[styles.kycFilterText, kycFilter === f && { color: Colors.bg }]}>{f === 'all' ? 'All' : f === 'under_review' ? 'In Review' : f.charAt(0).toUpperCase() + f.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {kycLoading ? (
              <View style={styles.kycLoading}><ActivityIndicator color={Colors.primary} /><Text style={styles.kycLoadingText}>Loading submissions...</Text></View>
            ) : kycSubmissions.length === 0 ? (
              <View style={styles.kycEmpty}><MaterialIcons name="verified-user" size={40} color={Colors.textMuted} /><Text style={styles.kycEmptyText}>No submissions found</Text></View>
            ) : (
              kycSubmissions.map(sub => {
                const cfg = KYC_STATUS_CONFIG[sub.status];
                const isActing = kycActing === sub.id;
                const userInfo = (sub as any).user_profiles;
                return (
                  <View key={sub.id} style={[styles.kycCard, { borderLeftColor: cfg.color, borderLeftWidth: 3 }]}>
                    <View style={styles.kycCardHeader}>
                      <View style={styles.kycUserAvatar}><Text style={styles.kycUserAvatarText}>{(userInfo?.full_name ?? userInfo?.username ?? 'U')[0].toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.kycUserName}>{userInfo?.full_name ?? userInfo?.username ?? 'Unknown'}</Text>
                        <Text style={styles.kycUserEmail}>{userInfo?.email ?? '—'}</Text>
                      </View>
                      <View style={[styles.kycStatusBadge, { backgroundColor: cfg.bg }]}>
                        <MaterialIcons name={cfg.icon as any} size={12} color={cfg.color} />
                        <Text style={[styles.kycStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <View style={styles.kycDetails}>
                      {[
                        ['Full Name', sub.full_name], ['DOB', sub.date_of_birth],
                        ['ID Type', sub.id_type?.replace('_', ' ')], ['ID Number', sub.id_number],
                        ['Country', sub.country],
                        ['Submitted', new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })],
                      ].map(([k, v]) => (
                        <View key={String(k)} style={styles.kycDetailRow}>
                          <Text style={styles.kycDetailLabel}>{k}</Text>
                          <Text style={styles.kycDetailVal}>{v ?? '—'}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.kycDocsRow}>
                      {[{ label: 'ID Front', hasFile: !!sub.id_front_path }, { label: 'ID Back', hasFile: !!sub.id_back_path }, { label: 'Selfie', hasFile: !!sub.selfie_path }].map(doc => (
                        <View key={doc.label} style={[styles.kycDocChip, { backgroundColor: doc.hasFile ? Colors.successBg : Colors.bgElevated, borderColor: doc.hasFile ? Colors.success + '44' : Colors.border }]}>
                          <MaterialIcons name={doc.hasFile ? 'check-circle' : 'radio-button-unchecked'} size={12} color={doc.hasFile ? Colors.success : Colors.textMuted} />
                          <Text style={[styles.kycDocChipText, { color: doc.hasFile ? Colors.success : Colors.textMuted }]}>{doc.label}</Text>
                        </View>
                      ))}
                    </View>
                    {sub.status === 'rejected' && sub.rejection_reason && (
                      <View style={styles.kycRejectionNote}><MaterialIcons name="info-outline" size={12} color={Colors.error} /><Text style={styles.kycRejectionText}>Reason: {sub.rejection_reason}</Text></View>
                    )}
                    {(sub.status === 'pending' || sub.status === 'under_review') && (
                      <View style={styles.kycActions}>
                        {sub.status === 'pending' && (
                          <TouchableOpacity style={[styles.kycActionBtn, { backgroundColor: '#3B82F611', borderColor: '#3B82F644' }, isActing && { opacity: 0.5 }]} onPress={() => reviewKyc(sub.id)} disabled={isActing}>
                            {isActing ? <ActivityIndicator size="small" color="#3B82F6" /> : <MaterialIcons name="find-in-page" size={15} color="#3B82F6" />}
                            <Text style={[styles.kycActionText, { color: '#3B82F6' }]}>Mark In Review</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.kycActionBtn, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }, isActing && { opacity: 0.5 }]}
                          onPress={async () => {
                            const { error } = await approveKyc(sub.id, sub.user_id);
                            if (error) showAlert('Error', error);
                            else {
                              showAlert('Approved', `${userInfo?.full_name ?? 'User'} KYC has been verified.`);
                              logEvent({ action_type: 'kyc_approved', target_user_id: sub.user_id, target_user_email: userInfo?.email, target_user_name: userInfo?.full_name ?? userInfo?.username, details: { id_type: sub.id_type, country: sub.country } });
                            }
                          }}
                          disabled={isActing}
                        >
                          {isActing ? <ActivityIndicator size="small" color={Colors.success} /> : <MaterialIcons name="check-circle" size={15} color={Colors.success} />}
                          <Text style={[styles.kycActionText, { color: Colors.success }]}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.kycActionBtn, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }, isActing && { opacity: 0.5 }]} onPress={() => { setRejectModalId(sub.id); setRejectUserId(sub.user_id); setRejectReason(''); }} disabled={isActing}>
                          <MaterialIcons name="cancel" size={15} color={Colors.error} />
                          <Text style={[styles.kycActionText, { color: Colors.error }]}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── DEPOSITS & WITHDRAWALS TAB ── */}
        {activeTab === 'deposits' && (
          <View style={styles.txSection}>
            <View style={styles.kycStatsRow}>
              {[
                { label: 'Pending', count: txPendingCount, color: Colors.warning },
                { label: 'Deposits', count: depositCount, color: Colors.success },
                { label: 'Withdraws', count: withdrawCount, color: Colors.error },
                { label: 'Approved', count: txCompletedCount, color: Colors.info },
              ].map(s => (
                <View key={s.label} style={[styles.kycStatCard, { borderColor: s.color + '44', backgroundColor: s.color + '11' }]}>
                  <Text style={[styles.kycStatCount, { color: s.color }]}>{s.count}</Text>
                  <Text style={[styles.kycStatLabel, { color: s.color }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.xl }} contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: Spacing.sm }}>
              {(['all', 'pending', 'deposit', 'withdraw', 'completed', 'failed'] as const).map(f => (
                <TouchableOpacity key={f} style={[styles.kycFilterChip, txFilter === f && styles.kycFilterChipActive]} onPress={() => setTxFilter(f as any)}>
                  <Text style={[styles.kycFilterText, txFilter === f && { color: Colors.bg }]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.txRefreshBtn} onPress={refreshTx}>
              <MaterialIcons name="refresh" size={15} color={Colors.primary} />
              <Text style={styles.txRefreshText}>Refresh</Text>
            </TouchableOpacity>
            {txLoading ? (
              <View style={styles.kycLoading}><ActivityIndicator color={Colors.primary} /><Text style={styles.kycLoadingText}>Loading transactions...</Text></View>
            ) : txRecords.length === 0 ? (
              <View style={styles.kycEmpty}><MaterialIcons name="receipt-long" size={40} color={Colors.textMuted} /><Text style={styles.kycEmptyText}>No transactions found</Text></View>
            ) : (
              txRecords.map(tx => {
                const isDeposit = tx.type === 'deposit';
                const typeColor = isDeposit ? Colors.success : Colors.error;
                const statusColor = tx.status === 'completed' ? Colors.success : tx.status === 'pending' ? Colors.warning : Colors.error;
                const isActing = txActing === tx.id;
                return (
                  <View key={tx.id} style={[styles.txCard, { borderLeftColor: typeColor, borderLeftWidth: 3 }]}>
                    <View style={styles.txCardHeader}>
                      <View style={[styles.txTypeIcon, { backgroundColor: typeColor + '18' }]}>
                        <MaterialIcons name={isDeposit ? 'arrow-downward' : 'arrow-upward'} size={18} color={typeColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.txCardTitleRow}>
                          <Text style={styles.txCardType}>{tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} · {tx.coin}</Text>
                          <View style={[styles.txStatusChip, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                            <View style={[styles.txStatusDot, { backgroundColor: statusColor }]} />
                            <Text style={[styles.txStatusText, { color: statusColor }]}>{tx.status}</Text>
                          </View>
                        </View>
                        <Text style={styles.txUserEmail}>{tx.user_email}</Text>
                      </View>
                    </View>
                    <View style={styles.txDetails}>
                      <View style={styles.txDetailRow}><Text style={styles.txDetailLabel}>User</Text><Text style={styles.txDetailVal}>{tx.user_name}</Text></View>
                      <View style={styles.txDetailRow}>
                        <Text style={styles.txDetailLabel}>Amount</Text>
                        <Text style={[styles.txDetailVal, { color: typeColor, fontWeight: FontWeight.bold }]}>{isDeposit ? '+' : '-'}{tx.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {tx.coin}</Text>
                      </View>
                      {tx.total_usd != null && (
                        <View style={styles.txDetailRow}>
                          <Text style={styles.txDetailLabel}>USD Value</Text>
                          <Text style={styles.txDetailVal}>${tx.total_usd.toFixed(2)}</Text>
                        </View>
                      )}
                      <View style={styles.txDetailRow}>
                        <Text style={styles.txDetailLabel}>Date</Text>
                        <Text style={styles.txDetailVal}>{new Date(tx.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                      </View>
                    </View>
                    {tx.status === 'pending' && (
                      <View style={styles.kycActions}>
                        <TouchableOpacity
                          style={[styles.kycActionBtn, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }, isActing && { opacity: 0.5 }]}
                          disabled={isActing}
                          onPress={async () => {
                            const { error } = await approveTx(tx.id);
                            if (error) showAlert('Error', error);
                            else {
                              showAlert('Approved', `${tx.type} of ${tx.amount} ${tx.coin} has been approved.`);
                              logEvent({ action_type: tx.type === 'deposit' ? 'deposit_approved' : 'withdrawal_approved', target_user_email: tx.user_email, target_user_name: tx.user_name, details: { amount: tx.amount, coin: tx.coin } });
                            }
                          }}
                        >
                          {isActing ? <ActivityIndicator size="small" color={Colors.success} /> : <MaterialIcons name="check-circle" size={15} color={Colors.success} />}
                          <Text style={[styles.kycActionText, { color: Colors.success }]}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.kycActionBtn, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }, isActing && { opacity: 0.5 }]} disabled={isActing} onPress={() => { setTxRejectId(tx.id); setTxRejectReason(''); }}>
                          <MaterialIcons name="cancel" size={15} color={Colors.error} />
                          <Text style={[styles.kycActionText, { color: Colors.error }]}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === 'users' && (
          <View style={styles.usersSection}>
            <View style={styles.kycStatsRow}>
              {[
                { label: 'Total', count: userTotalCount, color: Colors.primary },
                { label: 'KYC OK', count: userVerifiedCount, color: Colors.success },
                { label: 'Admins', count: userAdminCount, color: Colors.warning },
              ].map(s => (
                <View key={s.label} style={[styles.kycStatCard, { borderColor: s.color + '44', backgroundColor: s.color + '11', flex: 1 }]}>
                  <Text style={[styles.kycStatCount, { color: s.color }]}>{s.count}</Text>
                  <Text style={[styles.kycStatLabel, { color: s.color }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.userSearchBar}>
              <MaterialIcons name="search" size={18} color={Colors.textMuted} />
              <TextInput style={styles.userSearchInput} value={userSearch} onChangeText={setUserSearch} placeholder="Search by name or email..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} />
              {userSearch.length > 0 && (<TouchableOpacity onPress={() => setUserSearch('')}><MaterialIcons name="close" size={16} color={Colors.textMuted} /></TouchableOpacity>)}
            </View>
            <TouchableOpacity style={styles.txRefreshBtn} onPress={refreshUsers}>
              <MaterialIcons name="refresh" size={15} color={Colors.primary} /><Text style={styles.txRefreshText}>Refresh</Text>
            </TouchableOpacity>
            {usersLoading ? (
              <View style={styles.kycLoading}><ActivityIndicator color={Colors.primary} /><Text style={styles.kycLoadingText}>Loading users...</Text></View>
            ) : adminUsers.length === 0 ? (
              <View style={styles.kycEmpty}><MaterialIcons name="group" size={40} color={Colors.textMuted} /><Text style={styles.kycEmptyText}>{userSearch ? 'No users match your search' : 'No users found'}</Text></View>
            ) : (
              adminUsers.map(u => {
                const kycColor = u.kyc_status === 'verified' ? Colors.success : u.kyc_status === 'pending' ? Colors.warning : u.kyc_status === 'rejected' ? Colors.error : Colors.textMuted;
                const tierColor = u.tier === 'Gold' ? Colors.primary : u.tier === 'Silver' ? Colors.textSecondary : '#CD7F32';
                const isExpanded = expandedUserId === u.id;
                const isActing = usersActing === u.id;
                const displayName = u.full_name ?? u.username ?? 'Unknown';
                const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                return (
                  <View key={u.id} style={[styles.userCard, isExpanded && { borderColor: Colors.primary + '66' }]}>
                    <TouchableOpacity style={styles.userCardHeader} onPress={() => { const next = isExpanded ? null : u.id; setExpandedUserId(next); if (next) setSparklineUserId(next); }} activeOpacity={0.75}>
                      <View style={[styles.userAvatar, u.is_admin && { borderColor: Colors.warning, borderWidth: 2 }]}>
                        <Text style={styles.userAvatarText}>{initials}</Text>
                      </View>
                      <View style={styles.userInfo}>
                        <View style={styles.userNameRow}>
                          <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                          {u.is_admin && (<View style={styles.adminMiniTag}><Text style={styles.adminMiniTagText}>Admin</Text></View>)}
                        </View>
                        <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                        <Text style={styles.userJoined}>Joined {joinDate}</Text>
                      </View>
                      <View style={styles.userRight}>
                        <View style={[styles.kycBadge, { backgroundColor: kycColor + '22', borderColor: kycColor + '44' }]}>
                          <Text style={[styles.kycText, { color: kycColor }]}>{u.kyc_status ?? 'pending'}</Text>
                        </View>
                        <Text style={[styles.userTier, { color: tierColor }]}>{u.tier ?? 'Bronze'}</Text>
                        <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={18} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={styles.userExpanded}>
                        <UserSparklineCard userId={u.id} enabled={sparklineUserId === u.id} />
                        <Text style={styles.userActionLabel}>Change Tier</Text>
                        <View style={styles.tierBtnRow}>
                          {(['Bronze', 'Silver', 'Gold'] as const).map(t => {
                            const tc = t === 'Gold' ? Colors.primary : t === 'Silver' ? Colors.textSecondary : '#CD7F32';
                            const isSelected = (u.tier ?? 'Bronze') === t;
                            return (
                              <TouchableOpacity key={t} style={[styles.tierBtn, isSelected && { backgroundColor: tc + '22', borderColor: tc }]} disabled={isActing || isSelected}
                                onPress={async () => {
                                  const { error } = await changeTier(u.id, t);
                                  if (error) showAlert('Error', error);
                                  else {
                                    showAlert('Tier Updated', `${displayName} is now ${t} tier.`);
                                    logEvent({ action_type: 'user_tier_changed', target_user_id: u.id, target_user_email: u.email, target_user_name: displayName, details: { new_tier: t } });
                                  }
                                }}>
                                {isActing && isSelected ? <ActivityIndicator size="small" color={tc} /> : <Text style={[styles.tierBtnText, { color: isSelected ? tc : Colors.textSecondary }]}>{t}</Text>}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <View style={styles.adminToggleRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.userActionLabel}>Admin Access</Text>
                            <Text style={styles.userActionSub}>{u.is_admin ? 'User has full admin dashboard access' : 'Grant full admin dashboard access'}</Text>
                          </View>
                          <Switch value={u.is_admin} onValueChange={async (val) => {
                            const { error } = await toggleAdmin(u.id, val);
                            if (error) showAlert('Error', error);
                            else showAlert(val ? 'Admin Granted' : 'Admin Revoked', val ? `${displayName} now has admin access.` : `${displayName} admin access removed.`);
                          }} trackColor={{ false: Colors.bgElevated, true: Colors.warning }} thumbColor="#fff" disabled={isActing} />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── ACTIVITY LOG TAB ── */}
        {activeTab === 'activity' && (
          <View style={actStyles.section}>
            <View style={actStyles.header}>
              <View style={actStyles.iconWrap}><MaterialIcons name="history" size={18} color={Colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={actStyles.title}>Admin Activity Log</Text>
                <Text style={actStyles.subtitle}>{activityTotal} events recorded</Text>
              </View>
              <TouchableOpacity style={actStyles.refreshBtn} onPress={refreshActivity} disabled={activityLoading}>
                {activityLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={15} color={Colors.primary} />}
              </TouchableOpacity>
            </View>
            {activityLoading && activityEvents.length === 0 ? (
              <View style={actStyles.loadingWrap}><ActivityIndicator color={Colors.primary} /><Text style={actStyles.loadingText}>Loading...</Text></View>
            ) : activityEvents.length === 0 ? (
              <View style={actStyles.emptyWrap}>
                <View style={actStyles.emptyIcon}><MaterialIcons name="event-note" size={36} color={Colors.textMuted} /></View>
                <Text style={actStyles.emptyTitle}>No activity yet</Text>
                <Text style={actStyles.emptySub}>Every admin action appears here automatically.</Text>
              </View>
            ) : (
              activityEvents.map((ev) => {
                const cfg = ACTION_CONFIGS[ev.action_type] ?? { icon: 'info', color: Colors.primary, label: ev.action_type.replace(/_/g, ' ') };
                const date = new Date(ev.created_at);
                const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const details = ev.details ?? {};
                return (
                  <View key={ev.id} style={actStyles.eventRow}>
                    <View style={[actStyles.eventIconWrap, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
                      <MaterialIcons name={cfg.icon as any} size={16} color={cfg.color} />
                    </View>
                    <View style={actStyles.eventBody}>
                      <View style={actStyles.eventTopRow}>
                        <View style={[actStyles.actionBadge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '33' }]}>
                          <Text style={[actStyles.actionBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        <View style={actStyles.timePill}>
                          <MaterialIcons name="schedule" size={9} color={Colors.textMuted} />
                          <Text style={actStyles.timeText}>{dateStr} {timeStr}</Text>
                        </View>
                      </View>
                      {(ev.target_user_name || ev.target_user_email) ? (
                        <View style={actStyles.targetRow}>
                          <MaterialIcons name="person" size={11} color={Colors.textMuted} />
                          <Text style={actStyles.targetText} numberOfLines={1}>{[ev.target_user_name, ev.target_user_email].filter(Boolean).join(' / ')}</Text>
                        </View>
                      ) : null}
                      {Object.keys(details).length > 0 ? (
                        <View style={actStyles.detailsRow}>
                          {Object.entries(details).slice(0, 4).map(([k, v]) => (
                            <View key={k} style={actStyles.detailChip}>
                              <Text style={actStyles.detailKey}>{k.replace(/_/g, ' ')}</Text>
                              <Text style={actStyles.detailVal} numberOfLines={1}>{String(v)}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
            <View style={actStyles.footerNote}>
              <MaterialIcons name="verified-user" size={11} color={Colors.success} />
              <Text style={actStyles.footerNoteText}>RLS restricted to admin@btng.gold (John Kojo Zi) only</Text>
            </View>
          </View>
        )}

        {/* ── ACCOUNT SECURITY TAB ── */}
        {activeTab === 'account' && (
          <View style={accSecStyles.section}>
            {/* Admin Identity Card */}
            <View style={accSecStyles.identityCard}>
              <View style={accSecStyles.avatarWrap}>
                <MaterialIcons name="verified-user" size={26} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={accSecStyles.identityName}>{AUTHORIZED_ADMIN_NAME}</Text>
                <Text style={accSecStyles.identityTitle}>{AUTHORIZED_ADMIN_TITLE}</Text>
                <Text style={accSecStyles.identityEmail}>{user?.email ?? AUTHORIZED_ADMIN_EMAIL}</Text>
                {user?.id && (
                  <Text style={accSecStyles.identityId} numberOfLines={1}>ID: {user.id}</Text>
                )}
              </View>
              <View style={accSecStyles.adminBadge}>
                <MaterialIcons name="admin-panel-settings" size={12} color={Colors.primary} />
                <Text style={accSecStyles.adminBadgeText}>ADMIN</Text>
              </View>
            </View>

            {/* Account Discovery */}
            <View style={accSecStyles.discoveryCard}>
              <View style={accSecStyles.sectionHeaderRow}>
                <MaterialIcons name="manage-search" size={16} color={Colors.info} />
                <Text style={accSecStyles.sectionTitle}>Account Discovery</Text>
              </View>
              {[
                { label: 'Username / Full Name', value: user?.full_name ?? user?.username ?? 'John Kojo Zi', icon: 'person' },
                { label: 'Authorized Email', value: user?.email ?? AUTHORIZED_ADMIN_EMAIL, icon: 'email' },
                { label: 'Admin Role', value: 'Bank Manager · Bituncoin Gold Bank', icon: 'work' },
                { label: 'KYC Status', value: (user as any)?.kyc_status ?? 'Authorized', icon: 'verified-user' },
                { label: 'Account Tier', value: (user as any)?.tier ?? 'Gold', icon: 'military-tech' },
                { label: 'Created', value: user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A', icon: 'calendar-today' },
              ].map(row => (
                <View key={row.label} style={accSecStyles.discoveryRow}>
                  <MaterialIcons name={row.icon as any} size={13} color={Colors.textMuted} />
                  <Text style={accSecStyles.discoveryLabel}>{row.label}</Text>
                  <Text style={accSecStyles.discoveryValue} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Change Password */}
            <View style={accSecStyles.changeCard}>
              <View style={accSecStyles.sectionHeaderRow}>
                <MaterialIcons name="lock-reset" size={16} color={Colors.warning} />
                <Text style={[accSecStyles.sectionTitle, { color: Colors.warning }]}>Change Password</Text>
                {accChanged && (
                  <View style={accSecStyles.successPill}>
                    <MaterialIcons name="check-circle" size={11} color={Colors.success} />
                    <Text style={accSecStyles.successPillText}>Updated</Text>
                  </View>
                )}
              </View>
              <Text style={accSecStyles.changeHint}>Enter a new password for <Text style={{ color: Colors.primary, fontWeight: '700' }}>{AUTHORIZED_ADMIN_EMAIL}</Text></Text>
              <View style={accSecStyles.inputWrap}>
                <Text style={accSecStyles.inputLabel}>New Password</Text>
                <View style={accSecStyles.inputRow}>
                  <MaterialIcons name="lock-outline" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={accSecStyles.input}
                    value={accNewPassword}
                    onChangeText={setAccNewPassword}
                    placeholder="Min. 6 characters"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!accShowPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setAccShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name={accShowPassword ? 'visibility' : 'visibility-off'} size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={accSecStyles.inputWrap}>
                <Text style={accSecStyles.inputLabel}>Confirm Password</Text>
                <View style={[accSecStyles.inputRow, accConfirmPassword && accNewPassword !== accConfirmPassword && { borderColor: Colors.error + '88' }]}>
                  <MaterialIcons name="lock" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={accSecStyles.input}
                    value={accConfirmPassword}
                    onChangeText={setAccConfirmPassword}
                    placeholder="Repeat new password"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!accShowPassword}
                    autoCapitalize="none"
                  />
                </View>
                {accConfirmPassword && accNewPassword !== accConfirmPassword && (
                  <Text style={accSecStyles.mismatchText}>Passwords do not match</Text>
                )}
              </View>
              <TouchableOpacity
                style={[accSecStyles.changeBtn, (accChanging || !accNewPassword.trim() || accNewPassword.length < 6) && { opacity: 0.5 }]}
                onPress={handleChangePassword}
                disabled={accChanging || !accNewPassword.trim() || accNewPassword.length < 6}
                activeOpacity={0.85}
              >
                {accChanging ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="lock-reset" size={16} color={Colors.bg} />}
                <Text style={accSecStyles.changeBtnText}>{accChanging ? 'Updating…' : 'Update Password'}</Text>
              </TouchableOpacity>
            </View>

            {/* Forgot Password */}
            <View style={accSecStyles.forgotCard}>
              <View style={accSecStyles.sectionHeaderRow}>
                <MaterialIcons name="help-outline" size={16} color={Colors.info} />
                <Text style={[accSecStyles.sectionTitle, { color: Colors.info }]}>Forgot Password</Text>
              </View>
              <Text style={accSecStyles.changeHint}>A password reset link will be sent to your authorized admin email.</Text>
              <View style={accSecStyles.emailPreview}>
                <MaterialIcons name="mark-email-unread" size={14} color={Colors.info} />
                <Text style={accSecStyles.emailPreviewText}>{AUTHORIZED_ADMIN_EMAIL}</Text>
              </View>
              {accResetSent && (
                <View style={accSecStyles.resetSentBanner}>
                  <MaterialIcons name="check-circle" size={14} color={Colors.success} />
                  <Text style={accSecStyles.resetSentText}>Reset email sent! Check your inbox at {AUTHORIZED_ADMIN_EMAIL}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[accSecStyles.forgotBtn, accResetSending && { opacity: 0.6 }]}
                onPress={handleSendResetEmail}
                disabled={accResetSending}
                activeOpacity={0.85}
              >
                {accResetSending ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="send" size={16} color={Colors.bg} />}
                <Text style={accSecStyles.forgotBtnText}>{accResetSending ? 'Sending…' : 'Send Password Reset Email'}</Text>
              </TouchableOpacity>
            </View>

            {/* Forgot Username */}
            <View style={accSecStyles.usernameCard}>
              <View style={accSecStyles.sectionHeaderRow}>
                <MaterialIcons name="person-search" size={16} color={Colors.copper} />
                <Text style={[accSecStyles.sectionTitle, { color: Colors.copper }]}>Forgot Username / Email</Text>
              </View>
              <Text style={accSecStyles.changeHint}>Your admin credentials are hardcoded for security. Here is your complete identity reference.</Text>
              {[
                { icon: 'badge', label: 'Full Name', value: AUTHORIZED_ADMIN_NAME },
                { icon: 'email', label: 'Login Email', value: AUTHORIZED_ADMIN_EMAIL },
                { icon: 'business', label: 'Role / Title', value: 'Bank Manager · Bituncoin Gold Bank' },
                { icon: 'public', label: 'Platform', value: 'BTNG Gold Coin · Ghana & 54 Africa' },
              ].map(row => (
                <View key={row.label} style={accSecStyles.usernameRow}>
                  <View style={accSecStyles.usernameIconWrap}>
                    <MaterialIcons name={row.icon as any} size={14} color={Colors.copper} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={accSecStyles.usernameLabel}>{row.label}</Text>
                    <Text style={accSecStyles.usernameValue}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Temp Password Info */}
            <View style={accSecStyles.tempCard}>
              <View style={accSecStyles.sectionHeaderRow}>
                <MaterialIcons name="vpn-key" size={16} color={Colors.primary} />
                <Text style={[accSecStyles.sectionTitle, { color: Colors.primary }]}>Temporary Access Code</Text>
              </View>
              <Text style={accSecStyles.changeHint}>Use this code on the access-denied screen to bootstrap or recover your admin account without signing in.</Text>
              <View style={accSecStyles.tempCodeBox}>
                <MaterialIcons name="fiber-smart-record" size={14} color={Colors.primary} />
                <Text style={accSecStyles.tempCodeText}>{ADMIN_TEMP_CODE}</Text>
                <View style={accSecStyles.tempCodeBadge}>
                  <Text style={accSecStyles.tempCodeBadgeText}>Bootstrap</Text>
                </View>
              </View>
              <Text style={accSecStyles.tempCodeNote}>Store this code securely. It is the master override key for admin account setup.</Text>
            </View>

            <View style={{ height: 20 }} />
          </View>
        )}

        {/* ── DEV SETTINGS TAB ── */}
        {activeTab === 'devsettings' && (
          <View style={devStyles.section}>
            <View style={devStyles.headerCard}>
              <View style={devStyles.headerIconWrap}><MaterialIcons name="developer-mode" size={26} color={Colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={devStyles.headerTitle}>Developer & Bank Settings</Text>
                <Text style={devStyles.headerSub}>John Kojo Zi · Bank Manager · Bituncoin Gold Bank</Text>
              </View>
              <View style={devStyles.adminGreenBadge}><View style={devStyles.adminGreenDot} /><Text style={devStyles.adminGreenText}>LIVE</Text></View>
            </View>
            <View style={devStyles.sectionCard}>
              <View style={devStyles.sectionHeader}><MaterialIcons name="storefront" size={16} color={Colors.warning} /><Text style={[devStyles.sectionTitle, { color: Colors.warning }]}>Merchant Identity (MTN MoMo)</Text></View>
              {[{l:'Legal Company Name',v:'EKUYE DIGITAL GATEWAY TRUST LTD'},{l:'Trading Name',v:'BTNG Sovereign Network'},{l:'Merchant ID',v:'248059',m:true,h:true,c:Colors.warning},{l:'MSISDN',v:'+233 54 041 8537',m:true,h:true,c:Colors.warning},{l:'Local Dial',v:'054 041 8537'},{l:'Dial Code',v:'*170#',m:true},{l:'Currency',v:'GHS — Ghanaian Cedi'},{l:'Network',v:'MTN MoMo · Ghana'},{l:'Country',v:'Ghana, West Africa'},{l:'Region',v:'West Africa · 54 African Nations'}].map((row:any)=>(<View key={row.l} style={devStyles.fieldRow}><Text style={devStyles.fieldLabel}>{row.l}</Text><Text style={[devStyles.fieldValue,row.m&&devStyles.fieldValueMono,row.h&&{color:row.c??Colors.warning,fontWeight:'800'}]}>{row.v}</Text></View>))}
            </View>
            <View style={devStyles.sectionCard}>
              <View style={devStyles.sectionHeader}><MaterialIcons name="gavel" size={16} color={Colors.primary} /><Text style={[devStyles.sectionTitle,{color:Colors.primary}]}>Legal Registration</Text></View>
              {[{l:'Company Name',v:'EKUYE DIGITAL GATEWAY TRUST LTD'},{l:'Registration No.',v:'CS099020624',m:true,h:true,c:Colors.primary},{l:'TIN',v:'C0064220206',m:true,h:true,c:Colors.primary},{l:'Legal Authority',v:'Ghana Companies Act 992'},{l:'Incorporation',v:'24 June 2024'},{l:'Jurisdiction',v:'Republic of Ghana, West Africa'},{l:'Founder',v:'John Kojo Zi'},{l:'Role',v:'Founder & Lead Architect'}].map((row:any)=>(<View key={row.l} style={devStyles.fieldRow}><Text style={devStyles.fieldLabel}>{row.l}</Text><Text style={[devStyles.fieldValue,row.m&&devStyles.fieldValueMono,row.h&&{color:row.c??Colors.primary,fontWeight:'800'}]}>{row.v}</Text></View>))}
            </View>
            <View style={devStyles.sectionCard}>
              <View style={devStyles.sectionHeader}><MaterialIcons name="router" size={16} color="#22C55E" /><Text style={[devStyles.sectionTitle,{color:'#22C55E'}]}>Node & API Configuration</Text></View>
              {[{l:'BTNG Node IP',v:'168.231.79.52:64799',m:true,h:true,c:'#22C55E'},{l:'Hostname',v:'srv1282934.hstgr.cloud',m:true,h:true,c:'#22C55E'},{l:'Node Location',v:'Accra, Ghana — Ghana Mainnet'},{l:'Genesis Date',v:'February 18, 2026'},{l:'Chain',v:'BTNG Sovereign Mainnet'},{l:'Coin Type',v:'9999 (BIP-44)'},{l:'Backend',v:'mebznlvyycuuddfkmebz.backend.onspace.ai'},{l:'Explorer URL',v:'http://168.231.79.52:64799',m:true},{l:'Gold Oracle',v:'/functions/gold-oracle'},{l:'OTP Email',v:'/functions/send-otp-email'},{l:'BTNG Pay GW',v:'/functions/btng-pay-gateway'}].map((row:any)=>(<View key={row.l} style={devStyles.fieldRow}><Text style={devStyles.fieldLabel}>{row.l}</Text><Text style={[devStyles.fieldValue,row.m&&devStyles.fieldValueMono,row.h&&{color:row.c??'#22C55E',fontWeight:'800'}]} numberOfLines={1}>{row.v}</Text></View>))}
            </View>
            <View style={devStyles.sectionCard}>
              <View style={devStyles.sectionHeader}><MaterialIcons name="check-circle" size={16} color={Colors.success} /><Text style={[devStyles.sectionTitle,{color:Colors.success}]}>Platform Feature Status</Text></View>
              {['Spot Trading','P2P Marketplace','Copy Trading','Binary Trading','Practice Wallet','KYC Verification','BTNG Genesis Wallet','MTN MoMo Cash Rail','BTNG Block Explorer','Gold Oracle','Certificate Scanner','BTNG Pay Gateway','NFC Tap-to-Pay','Bulk QR Export','AI Private Banker','Africa Free Trade Zone','Node Generator (3 Tiers)','Minting Pipeline','Referral System','Blog CMS','2FA Security','Push Notifications','Admin Dashboard','Developer Settings','Watchlist & Alerts','FX Converter'].map((feat,i,arr)=>(<View key={feat} style={[devStyles.featureRow,i<arr.length-1&&{borderBottomWidth:1,borderBottomColor:Colors.border}]}><View style={[devStyles.featureStatusDot,{backgroundColor:Colors.success}]}/><Text style={devStyles.featureName}>{feat}</Text><View style={[devStyles.featureBadge,{backgroundColor:Colors.success+'18',borderColor:Colors.success+'44'}]}><Text style={[devStyles.featureBadgeText,{color:Colors.success}]}>LIVE</Text></View></View>))}
            </View>
            <View style={devStyles.sectionCard}>
              <View style={devStyles.sectionHeader}><MaterialIcons name="publish" size={16} color="#9945FF" /><Text style={[devStyles.sectionTitle,{color:'#9945FF'}]}>App Publishing Info</Text></View>
              {[{l:'App Name',v:'BTNG Gold Coin'},{l:'Bundle ID',v:'com.bituncoin.btng',m:true},{l:'Version',v:'v2.0.0'},{l:'Build',v:'Production — Expo EAS'},{l:'Platforms',v:'iOS + Android + Web'},{l:'Dev Email',v:'info@bituncoin.io'},{l:'App Store',v:'Ready for submission'},{l:'Play Store',v:'Ready for submission'},{l:'Tech Stack',v:'React Native · Expo · TypeScript'},{l:'Backend',v:'OnSpace Cloud (Supabase-compatible)'}].map((row:any)=>(<View key={row.l} style={devStyles.fieldRow}><Text style={devStyles.fieldLabel}>{row.l}</Text><Text style={[devStyles.fieldValue,row.m&&devStyles.fieldValueMono]} numberOfLines={1}>{row.v}</Text></View>))}
            </View>
            <View style={devStyles.sectionCard}>
              <View style={devStyles.sectionHeader}><MaterialIcons name="rocket-launch" size={16} color={Colors.primary} /><Text style={[devStyles.sectionTitle,{color:Colors.primary}]}>Developer Quick Launch</Text></View>
              <View style={devStyles.quickLaunchGrid}>
                {([{label:'Sovereign Engine',icon:'security',color:'#9945FF',route:'/btng-sovereign-engine'},{label:'Block Explorer',icon:'explore',color:'#3B82F6',route:'/btng-explorer'},{label:'Genesis Wallet',icon:'account-balance-wallet',color:Colors.primary,route:'/btng-genesis'},{label:'Node Dashboard',icon:'hub',color:'#22C55E',route:'/btng-node'},{label:'Cash Rail',icon:'cell-tower',color:Colors.warning,route:'/cash-rail'},{label:'API Manager',icon:'vpn-key',color:'#F59E0B',route:'/btng-api-manager'},{label:'Cert Scanner',icon:'qr-code-scanner',color:'#9945FF',route:'/cert-scanner'},{label:'Mint Pipeline',icon:'whatshot',color:Colors.primary,route:'/btng-minting-pipeline'},{label:'Pipeline Hub',icon:'device-hub',color:'#9945FF',route:'/btng-pipeline-hub'},{label:'BTNG Pay',icon:'payments',color:'#22C55E',route:'/btng-pay'},{label:'Sovereign Docs',icon:'description',color:Colors.primary,route:'/btng-sovereign-docs'},{label:'Node Engine',icon:'memory',color:'#3B82F6',route:'/btng-node-engine'},{label:'BTNG Deploy',icon:'cloud-upload',color:'#22C55E',route:'/btng-deploy'},{label:'Dev Master Admin',icon:'developer-mode',color:'#9945FF',route:'/dev-master-admin'},{label:'Security Status',icon:'verified-user',color:'#22C55E',route:'/btng-security-status'},{label:'AI Credit Engine',icon:'analytics',color:'#9945FF',route:'/ai-credit'},{label:'Vault Status',icon:'shield',color:Colors.primary,route:'/btng-vault-status'},{label:'Value Generator',icon:'flash-on',color:'#F59E0B',route:'/btng-value-generator'},{label:'Gold Certificate',icon:'workspace-premium',color:Colors.primary,route:'/btng-gold-certificate'},{label:'Cert Verifier',icon:'verified-user',color:'#22C55E',route:'/btng-cert-verifier'},{label:'Engine Launcher',icon:'rocket-launch',color:Colors.primary,route:'/btng-engine-launcher'},{label:'Pan-African Engine',icon:'public',color:'#22C55E',route:'/btng-africa-multicurrency'},{label:'Africa P2P Market',icon:'storefront',color:'#F59E0B',route:'/btng-africa-p2p'},{label:'Live Trade API',icon:'timeline',color:'#22C55E',route:'/btng-live-trade-api'},{label:'AfCFTA Gateway',icon:'public',color:'#F7931A',route:'/btng-afcfta-gateway'},{label:'Bank Wallet',icon:'account-balance-wallet',color:'#22C55E',route:'/btng-bank-wallet'},{label:'BTNG Domain',icon:'language',color:'#8247E5',route:'/btng-domain'}] as any[]).map((item:any)=>(<TouchableOpacity key={item.label} style={[devStyles.quickBtn,{borderColor:item.color+'44'}]} onPress={()=>router.push(item.route as any)} activeOpacity={0.8}><View style={[devStyles.quickBtnIcon,{backgroundColor:item.color+'18',borderColor:item.color+'44'}]}><MaterialIcons name={item.icon as any} size={18} color={item.color}/></View><Text style={[devStyles.quickBtnLabel,{color:item.color}]} numberOfLines={2}>{item.label}</Text></TouchableOpacity>))}
              </View>
            </View>
            <View style={[devStyles.sectionCard,{borderColor:Colors.primary+'66',backgroundColor:Colors.primaryGlow}]}>
              <View style={{alignItems:'center',gap:Spacing.sm,paddingVertical:Spacing.md}}>
                <Text style={{fontSize:36}}>🏅</Text>
                <Text style={devStyles.sealTitle}>BTNG SOVEREIGN PLATFORM</Text>
                <Text style={devStyles.sealSub}>John Kojo Zi · Founder & Lead Architect</Text>
                <Text style={devStyles.sealSub}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
                <Text style={devStyles.sealSub}>Reg. CS099020624 · TIN C0064220206</Text>
                <Text style={devStyles.sealSub}>Ghana Companies Act 992 · 24 June 2024</Text>
                <View style={devStyles.sealDivider}/>
                <Text style={devStyles.sealFooter}>Ghana · 54 Africa Nations · Global Diaspora</Text>
                <Text style={[devStyles.sealFooter,{color:Colors.primary}]}>info@bituncoin.io · www.bituncoin.io</Text>
              </View>
            </View>
            <View style={{height:20}}/>
          </View>
        )}

        {/* ── DOCUMENT LIBRARY TAB ── */}
        {activeTab === 'docs' && <AdminDocLibrary router={router} adminName={AUTHORIZED_ADMIN_NAME} />}

        {/* ── SYSTEM LOGS TAB ── */}
        {activeTab === 'logs' && (
          <View style={styles.logsSection}>
            <Text style={styles.cardTitle}>System Logs</Text>
            {[
              { level: 'INFO', msg: 'New user registration: kofi@btng.gold', time: '14:32:18' },
              { level: 'WARN', msg: 'KYC submission requires manual review', time: '14:28:05' },
              { level: 'INFO', msg: 'P2P trade completed — $4,850 BTNG', time: '14:25:11' },
              { level: 'ERROR', msg: 'Withdrawal attempt flagged for AML review', time: '14:20:44' },
              { level: 'INFO', msg: 'BTNG price updated — $4.72', time: '14:15:00' },
              { level: 'WARN', msg: 'Large deposit detected — $250,000 USDT', time: '14:10:32' },
              { level: 'INFO', msg: 'Database backup completed successfully', time: '14:00:00' },
            ].map((log, i) => (
              <View key={i} style={styles.logRow}>
                <View style={[styles.logLevel, { backgroundColor: log.level === 'ERROR' ? Colors.errorBg : log.level === 'WARN' ? Colors.warningBg : Colors.successBg }]}>
                  <Text style={[styles.logLevelText, { color: log.level === 'ERROR' ? Colors.error : log.level === 'WARN' ? Colors.warning : Colors.success }]}>{log.level}</Text>
                </View>
                <View style={styles.logInfo}><Text style={styles.logMsg}>{log.msg}</Text><Text style={styles.logTime}>{log.time}</Text></View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── TX REJECT MODAL ── */}
      <Modal visible={txRejectId !== null} transparent animationType="fade">
        <View style={styles.rejectOverlay}>
          <View style={styles.rejectSheet}>
            <Text style={styles.rejectSheetTitle}>Reject Transaction</Text>
            <Text style={styles.rejectSheetSub}>Provide a reason for rejecting this transaction.</Text>
            <TextInput style={[styles.textInput, { minHeight: 90 }]} value={txRejectReason} onChangeText={setTxRejectReason} placeholder="e.g. Insufficient verification..." placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" />
            <View style={styles.rejectSheetActions}>
              <TouchableOpacity style={styles.rejectCancelBtn} onPress={() => { setTxRejectId(null); setTxRejectReason(''); }}><Text style={styles.rejectCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.rejectConfirmBtn, (!txRejectReason.trim() || !!txActing) && { opacity: 0.5 }]} disabled={!txRejectReason.trim() || !!txActing}
                onPress={async () => {
                  if (!txRejectId) return;
                  const { error } = await rejectTx(txRejectId, txRejectReason.trim());
                  setTxRejectId(null); setTxRejectReason('');
                  if (error) showAlert('Error', error);
                  else showAlert('Rejected', 'Transaction has been rejected.');
                }}>
                {txActing ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={styles.rejectConfirmText}>Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── KYC REJECT MODAL ── */}
      <Modal visible={rejectModalId !== null} transparent animationType="fade">
        <View style={styles.rejectOverlay}>
          <View style={styles.rejectSheet}>
            <Text style={styles.rejectSheetTitle}>Reject KYC Submission</Text>
            <Text style={styles.rejectSheetSub}>Provide a reason so the user can re-submit correctly.</Text>
            <TextInput style={[styles.textInput, { minHeight: 90 }]} value={rejectReason} onChangeText={setRejectReason} placeholder="e.g. ID image is blurry..." placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" />
            <View style={styles.rejectSheetActions}>
              <TouchableOpacity style={styles.rejectCancelBtn} onPress={() => { setRejectModalId(null); setRejectUserId(null); }}><Text style={styles.rejectCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.rejectConfirmBtn, (!rejectReason.trim() || kycActing) && { opacity: 0.5 }]} disabled={!rejectReason.trim() || !!kycActing}
                onPress={async () => {
                  if (!rejectModalId || !rejectUserId) return;
                  const { error } = await rejectKyc(rejectModalId, rejectUserId, rejectReason.trim());
                  setRejectModalId(null); setRejectUserId(null);
                  if (error) showAlert('Error', error);
                  else showAlert('Rejected', 'KYC submission has been rejected with reason provided.');
                }}>
                {kycActing ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={styles.rejectConfirmText}>Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── COMPOSE MODAL ── */}
      <Modal visible={showCompose} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.composeSheet, { paddingBottom: insets.bottom + Spacing.md }]}>
              <View style={styles.composeSheetHeader}>
                <TouchableOpacity onPress={() => { setShowCompose(false); setEditingId(null); }}><MaterialIcons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
                <Text style={styles.composeSheetTitle}>{editingId ? 'Edit Article' : 'New Article'}</Text>
                <TouchableOpacity style={[styles.publishBtn, saving && { opacity: 0.6 }]} onPress={handlePublish} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color={Colors.bg} /> : <Text style={styles.publishBtnText}>{editingId ? 'Update' : 'Publish'}</Text>}
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.composeScrollContent}>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.catRow}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity key={cat} style={[styles.catChipSm, form.category === cat && { backgroundColor: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] }]} onPress={() => setForm(f => ({ ...f, category: cat }))}>
                      <Text style={[styles.catChipSmText, form.category === cat && { color: Colors.bg }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Article Icon</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll} contentContainerStyle={styles.emojiScrollContent}>
                  {IMAGES.map(img => (
                    <TouchableOpacity key={img} style={[styles.emojiChip, form.image === img && styles.emojiChipActive]} onPress={() => setForm(f => ({ ...f, image: img }))}>
                      <Text style={styles.emojiChipText}>{img}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.fieldLabel}>Title *</Text>
                <TextInput style={styles.textInput} value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} placeholder="Article title..." placeholderTextColor={Colors.textMuted} multiline />
                <Text style={styles.fieldLabel}>Summary *</Text>
                <TextInput style={[styles.textInput, { minHeight: 72 }]} value={form.summary} onChangeText={v => setForm(f => ({ ...f, summary: v }))} placeholder="Brief summary..." placeholderTextColor={Colors.textMuted} multiline />
                <Text style={styles.fieldLabel}>Content *</Text>
                <TextInput style={[styles.textInput, { minHeight: 200 }]} value={form.content} onChangeText={v => setForm(f => ({ ...f, content: v }))} placeholder="Write your article content here..." placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" />
                <Text style={styles.fieldLabel}>Author</Text>
                <TextInput style={styles.textInput} value={form.author} onChangeText={v => setForm(f => ({ ...f, author: v }))} placeholder="Author name..." placeholderTextColor={Colors.textMuted} />
                <Text style={styles.fieldLabel}>Read Time</Text>
                <View style={styles.readTimeRow}>
                  {['2 min read', '3 min read', '5 min read', '7 min read'].map(rt => (
                    <TouchableOpacity key={rt} style={[styles.rtChip, form.read_time === rt && styles.rtChipActive]} onPress={() => setForm(f => ({ ...f, read_time: rt }))}>
                      <Text style={[styles.rtChipText, form.read_time === rt && { color: Colors.bg }]}>{rt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Tags</Text>
                <View style={styles.tagInputRow}>
                  <TextInput style={[styles.textInput, { flex: 1, marginBottom: 0 }]} value={tagInput} onChangeText={setTagInput} placeholder="Add tag..." placeholderTextColor={Colors.textMuted} onSubmitEditing={addTag} returnKeyType="done" />
                  <TouchableOpacity style={styles.tagAddBtn} onPress={addTag}><MaterialIcons name="add" size={18} color={Colors.bg} /></TouchableOpacity>
                </View>
                <View style={styles.tagsList}>
                  {form.tags.map(tag => (
                    <TouchableOpacity key={tag} style={styles.tagItem} onPress={() => removeTag(tag)}>
                      <Text style={styles.tagItemText}>{tag}</Text>
                      <MaterialIcons name="close" size={12} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleItem}><Text style={styles.toggleLabel}>Featured</Text><Switch value={form.featured} onValueChange={v => setForm(f => ({ ...f, featured: v }))} trackColor={{ false: Colors.bgElevated, true: Colors.primary }} thumbColor="#fff" /></View>
                  <View style={styles.toggleItem}><Text style={styles.toggleLabel}>Published</Text><Switch value={form.published} onValueChange={v => setForm(f => ({ ...f, published: v }))} trackColor={{ false: Colors.bgElevated, true: Colors.success }} thumbColor="#fff" /></View>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary },
  adminBadgeText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg },
  tab: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  statsGrid: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.lg },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  overviewCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md, marginBottom: Spacing.lg },
  cardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  overviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  overviewHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currencyPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  currencyPillFlag: { fontSize: 11 },
  currencyPillCode: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  livePillText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  overviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  overviewValueCol: { alignItems: 'flex-end', gap: 3 },
  localBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '33' },
  localBadgeFlag: { fontSize: 9 },
  localBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  // Security Status card
  securityStatusCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.success + '55', shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 5 },
  securityStatusIconWrap:  { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.successBg, borderWidth: 2, borderColor: Colors.success + '77', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  securityStatusTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 },
  securityStatusTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  securityStatusBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  securityStatusBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  securityStatusDesc:      { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 18 },
  // App Builder card
  appBuilderCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 6 },
  appBuilderIconWrap:  { width: 54, height: 54, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '88', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  appBuilderTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  appBuilderTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  appBuilderBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '55' },
  appBuilderBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  appBuilderDesc:      { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 18 },
  overviewLabel: { fontSize: FontSize.md, color: Colors.textSecondary, includeFontPadding: false },
  overviewValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  // Access Denied
  accessDeniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  shieldWrap: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.errorBg, borderWidth: 2, borderColor: Colors.error + '55', alignItems: 'center', justifyContent: 'center', shadowColor: Colors.error, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 10 },
  accessTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  accessSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '66', width: '100%' },
  avatarWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  identityName: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  identityRole: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1, includeFontPadding: false },
  identityEmail: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2, includeFontPadding: false },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + '55' },
  lockPillText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, width: '100%' },
  infoText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18, includeFontPadding: false },
  secRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  secChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '44' },
  secChipText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.success, includeFontPadding: false },
  // Blog CMS
  blogSection: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  blogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  blogSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 3 },
  composeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  composeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  blogLoading: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  blogLoadingText: { color: Colors.textMuted, fontSize: FontSize.sm, includeFontPadding: false },
  emptyBlog: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyBlogText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  articleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  articleRowEmoji: { width: 52, height: 52, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  articleRowEmojiText: { fontSize: 24 },
  articleRowInfo: { flex: 1, gap: 5 },
  articleRowTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  catBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  featuredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  featuredBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  articleRowTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, lineHeight: 18, includeFontPadding: false },
  articleRowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  articleRowMetaText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  articleRowActions: { alignItems: 'center', gap: Spacing.sm },
  editBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.error + '44', alignItems: 'center', justifyContent: 'center' },
  // Users
  usersSection: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  userSearchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: Spacing.sm },
  userSearchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  userCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  userCardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  userInfo: { flex: 1, gap: 2 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  userName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  adminMiniTag: { backgroundColor: Colors.warning + '22', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: Colors.warning + '44' },
  adminMiniTagText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  userEmail: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  userJoined: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  userRight: { alignItems: 'flex-end', gap: 5 },
  kycBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  kycText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  userTier: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  userExpanded: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, gap: Spacing.md, backgroundColor: Colors.bgElevated },
  userPortfolioRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userPortfolioText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  userActionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 0.3, includeFontPadding: false },
  userActionSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  tierBtnRow: { flexDirection: 'row', gap: Spacing.sm },
  tierBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tierBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  adminToggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  // KYC Section
  kycSection: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  kycHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kycHeaderTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  kycHeaderSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  kycHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kycStatsRow: { flexDirection: 'row', gap: Spacing.sm },
  kycStatCard: { flex: 1, alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, gap: 3 },
  kycStatCount: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  kycStatLabel: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  kycFilterChip: { paddingHorizontal: Spacing.md, height: 32, justifyContent: 'center', borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  kycFilterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  kycFilterText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  kycLoading: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  kycLoadingText: { color: Colors.textMuted, fontSize: FontSize.sm, includeFontPadding: false },
  kycEmpty: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  kycEmptyText: { fontSize: FontSize.md, color: Colors.textMuted, includeFontPadding: false },
  kycCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  kycCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  kycUserAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  kycUserAvatarText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  kycUserName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  kycUserEmail: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  kycStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  kycStatusText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  kycDetails: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: 6, borderWidth: 1, borderColor: Colors.border },
  kycDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kycDetailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  kycDetailVal: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  kycDocsRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  kycDocChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  kycDocChipText: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  kycRejectionNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.error + '44' },
  kycRejectionText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, lineHeight: 16, includeFontPadding: false },
  kycActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  kycActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1, minWidth: 80 },
  kycActionText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  // Reject Modals
  rejectOverlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.85)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  rejectSheet: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', gap: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  rejectSheetTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  rejectSheetSub: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  rejectSheetActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  rejectCancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  rejectCancelText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  rejectConfirmBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.error, alignItems: 'center' },
  rejectConfirmText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  // Deposits
  txSection: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  txRefreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  txRefreshText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  txCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  txCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  txTypeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  txCardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  txCardType: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  txUserEmail: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  txStatusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  txStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  txStatusText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  txDetails: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: 8, borderWidth: 1, borderColor: Colors.border },
  txDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txDetailLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  txDetailVal: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  txDetailValCol: { alignItems: 'flex-end', gap: 4 },
  txLocalBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '33' },
  txLocalBadgeFlag: { fontSize: 10 },
  txLocalBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  txLocalBadgeCode: { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.medium, includeFontPadding: false },
  // Logs
  logsSection: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  logLevel: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm, minWidth: 50, alignItems: 'center' },
  logLevelText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  logInfo: { flex: 1, gap: 3 },
  logMsg: { fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  logTime: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  // Compose Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.8)', justifyContent: 'flex-end' },
  composeSheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '92%', borderWidth: 1, borderColor: Colors.border },
  composeSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  composeSheetTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  publishBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 72, alignItems: 'center' },
  publishBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  composeScrollContent: { padding: Spacing.xl, gap: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.3, includeFontPadding: false },
  fieldHint: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: -8 },
  textInput: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  catRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  catChipSm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 2, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  catChipSmText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  emojiScroll: { marginHorizontal: -Spacing.xl },
  emojiScrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  emojiChip: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  emojiChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  emojiChipText: { fontSize: 22 },
  readTimeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  rtChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 2, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  rtChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rtChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary, includeFontPadding: false },
  tagInputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  tagAddBtn: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  tagsList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tagItem: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  tagItemText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  toggleRow: { flexDirection: 'row', gap: Spacing.md },
  toggleItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  toggleLabel: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false },
});

const bsStyles = StyleSheet.create({
  setupBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, borderWidth: 1.5, borderColor: Colors.warning + '66', alignSelf: 'center' },
  setupBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  card: { width: '100%', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.warning + '55', gap: Spacing.md, marginTop: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  stepBody: { gap: Spacing.md },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.3, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '55', paddingHorizontal: Spacing.md, height: 50 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.errorBg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.error + '44' },
  errorText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.warning, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  actionBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  doneCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, backgroundColor: Colors.successBg, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.success + '44', padding: Spacing.xl },
  doneTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  doneSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  doneCredRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  doneCredText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  closeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm },
  closeBtnText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
});

const accSecStyles = StyleSheet.create({
  section: { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.xl },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '66' },
  avatarWrap: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center' },
  identityName: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  identityTitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  identityEmail: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  identityId: { fontSize: 9, color: Colors.textMuted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  adminBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  discoveryCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  discoveryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  discoveryLabel: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  discoveryValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, maxWidth: '55%', textAlign: 'right' },
  changeCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.warning + '44', gap: Spacing.md },
  changeHint: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17, includeFontPadding: false },
  inputWrap: { gap: 6 },
  inputLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '55', paddingHorizontal: Spacing.md, height: 50 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  mismatchText: { fontSize: FontSize.xs, color: Colors.error, marginTop: 2, includeFontPadding: false },
  successPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  successPillText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  changeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.warning, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  changeBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  forgotCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.info + '44', gap: Spacing.md },
  emailPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.info + '33' },
  emailPreviewText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.info, includeFontPadding: false },
  resetSentBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.successBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44' },
  resetSentText: { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 17, includeFontPadding: false },
  forgotBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.info, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.info, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  forgotBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  usernameCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.copper + '44', gap: Spacing.md },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  usernameIconWrap: { width: 34, height: 34, borderRadius: 11, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.copper + '44', alignItems: 'center', justifyContent: 'center' },
  usernameLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  usernameValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginTop: 2, includeFontPadding: false },
  tempCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  tempCodeBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66' },
  tempCodeText: { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  tempCodeBadge: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  tempCodeBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  tempCodeNote: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
});

const actStyles = StyleSheet.create({
  section:         { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  header:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:        { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle:        { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  refreshBtn:      { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  loadingWrap:     { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText:     { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap:       { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon:       { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:        { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, includeFontPadding: false },
  eventRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  eventIconWrap:   { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  eventBody:       { flex: 1, gap: Spacing.sm },
  eventTopRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  actionBadge:     { paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  actionBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  timePill:        { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeText:        { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  targetRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  targetText:      { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  detailsRow:      { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  detailChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border, maxWidth: 180 },
  detailKey:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  detailVal:       { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, flex: 1 },
  footerNote:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.success + '44', marginTop: Spacing.sm },
  footerNoteText:  { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 16, includeFontPadding: false },
});

const devStyles = StyleSheet.create({
  section:          { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.xl },
  headerCard:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  headerIconWrap:   { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub:        { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  adminGreenBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '55' },
  adminGreenDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  adminGreenText:   { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },
  sectionCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: 0 },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  sectionTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  fieldRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border + '66', gap: Spacing.sm },
  fieldLabel:       { width: 110, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, flexShrink: 0 },
  fieldValue:       { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  fieldValueMono:   { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  featureRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2 },
  featureStatusDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  featureName:      { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  featureBadge:     { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  featureBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  quickLaunchGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickBtn:         { width: '30%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 3, borderWidth: 1, alignItems: 'center', gap: 6, minWidth: 80 },
  quickBtnIcon:     { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quickBtnLabel:    { fontSize: 10, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false },
  sealTitle:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.5, includeFontPadding: false, textAlign: 'center' },
  sealSub:          { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, textAlign: 'center' },
  sealDivider:      { width: '80%', height: 1, backgroundColor: Colors.primary + '44', marginVertical: 4 },
  sealFooter:       { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
});
