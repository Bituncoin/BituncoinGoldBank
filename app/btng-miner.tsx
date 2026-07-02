import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, Platform, Vibration, AccessibilityInfo,
  TextInput, ActivityIndicator, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAlert, getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ===============================================
// BTNG ONE-COLUMN FINAL PRODUCT ENGINE
// BituncoinOS · Music Mining · Mobile Banking
// ===============================================

// ---------- CORE TYPES ----------

type UID = string;

interface MusicTrack {
  track_uid:        UID;
  file_url:         string;
  title:            string;
  artist:           string;
  album?:           string;
  genre?:           string;
  duration_seconds: number;
  boost_multiplier: number;   // e.g. 2.4
  btng_per_minute:  number;   // e.g. 0.0018
  emoji:            string;
  color:            string;
  isNew?:           boolean;
}

interface MinerState {
  miner_uid:                UID;
  wallet_uid:               UID;
  current_track_uid?:       UID;
  mode:                     'standard' | 'music';
  base_hash_rate_khs:       number;
  effective_hash_rate_khs:  number;
  btng_per_minute:          number;
  pending_btng:             number;
}

// ---------- UTIL ----------

function generateUID(prefix: string): UID {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO(): string { return new Date().toISOString(); }

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE_HASH_RATE         = 142;
const MUSIC_BOOST_MULT       = 2.4;
const BTNG_PER_MINUTE_BASE   = 0.0008;
const BTNG_PER_MINUTE_MUSIC  = 0.0018;
const BLOCK_TRUCK_CHANCE     = 0.012;
const BLOCK_TRUCK_REWARD     = 50;
const MINE_INTERVAL_MS       = 8000;
const MAX_LOG_ENTRIES        = 50;
const CUSTOM_TRACKS_KEY      = 'btng_custom_mining_tracks_v1';
const EQ_STORAGE_KEY         = 'btng_miner_eq_settings_v1';
const SESSION_HISTORY_KEY    = 'btng_miner_session_history_v1';
const MAX_SESSION_HISTORY    = 7;

// ── Equalizer Types & Presets ─────────────────────────────────────────────────
interface EqBands { hz60: number; hz250: number; hz1k: number; hz4k: number; hz16k: number; }
type EqPresetName = 'Flat' | 'Bass Boost' | 'Treble' | 'Vocal' | 'Club';

const EQ_BANDS_DEFAULT: EqBands = { hz60: 0, hz250: 0, hz1k: 0, hz4k: 0, hz16k: 0 };

const EQ_PRESETS: Record<EqPresetName, EqBands> = {
  'Flat':       { hz60: 0,   hz250: 0,  hz1k: 0,  hz4k: 0,  hz16k: 0  },
  'Bass Boost': { hz60: 10,  hz250: 7,  hz1k: 0,  hz4k: -2, hz16k: -2 },
  'Treble':     { hz60: -3,  hz250: -2, hz1k: 1,  hz4k: 5,  hz16k: 10 },
  'Vocal':      { hz60: -5,  hz250: 0,  hz1k: 6,  hz4k: 5,  hz16k: -2 },
  'Club':       { hz60: 6,   hz250: 4,  hz1k: 1,  hz4k: 4,  hz16k: 3  },
};

const EQ_BAND_LABELS = [
  { key: 'hz60',  label: '60Hz',  short: '60' },
  { key: 'hz250', label: '250Hz', short: '250' },
  { key: 'hz1k',  label: '1kHz',  short: '1k' },
  { key: 'hz4k',  label: '4kHz',  short: '4k' },
  { key: 'hz16k', label: '16kHz', short: '16k' },
] as const;

// ── EXPANDED Music Library (One-Column Engine) ─────────────────────────────────
// Each track has its own boost_multiplier + btng_per_minute as per the engine spec
const MUSIC_LIBRARY: MusicTrack[] = [
  // ── BTNG Originals ──
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/btng-beat-vol1.mp3',
    title:            'BTNG Mining Beat Vol.1',
    artist:           'BTNG Sovereign',
    album:            'BituncoinOS Soundpack',
    genre:            'Afrobeats',
    duration_seconds: 222,
    boost_multiplier: 2.4,
    btng_per_minute:  0.0018,
    emoji:            '🎵',
    color:            '#F5C518',
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/btng-beat-vol2.mp3',
    title:            'BTNG Mining Beat Vol.2',
    artist:           'BTNG Sovereign',
    album:            'BituncoinOS Soundpack',
    genre:            'Afrobeats',
    duration_seconds: 255,
    boost_multiplier: 2.5,
    btng_per_minute:  0.0019,
    emoji:            '🎶',
    color:            '#D4A017',
    isNew:            true,
  },
  // ── Ghana & West Africa ──
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/ghana-gold-rhythm.mp3',
    title:            'Ghana Gold Rhythm',
    artist:           'BituncoinOS',
    album:            'African Mining Sessions',
    genre:            'Highlife',
    duration_seconds: 255,
    boost_multiplier: 2.4,
    btng_per_minute:  0.0018,
    emoji:            '🇬🇭',
    color:            '#009A44',
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/accra-chain-groove.mp3',
    title:            'Accra Chain Groove',
    artist:           'Gold Coast Sessions',
    album:            'African Mining Sessions',
    genre:            'Highlife',
    duration_seconds: 238,
    boost_multiplier: 2.3,
    btng_per_minute:  0.0017,
    emoji:            '🌊',
    color:            '#3B82F6',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/kumasi-block-beat.mp3',
    title:            'Kumasi Block Beat',
    artist:           'BTNG Radio',
    album:            'African Mining Sessions',
    genre:            'Afro-Fusion',
    duration_seconds: 300,
    boost_multiplier: 2.6,
    btng_per_minute:  0.0020,
    emoji:            '⛏️',
    color:            '#EF4444',
    isNew:            true,
  },
  // ── Pan-Africa ──
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/africa-free-trade-groove.mp3',
    title:            'Africa Free Trade Groove',
    artist:           'BTNG Radio',
    album:            'AfCFTA Soundtrack',
    genre:            'Afro-Jazz',
    duration_seconds: 301,
    boost_multiplier: 2.4,
    btng_per_minute:  0.0018,
    emoji:            '🌍',
    color:            '#22C55E',
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/54-africa-anthem.mp3',
    title:            '54 Africa Anthem',
    artist:           'BTNG Collective',
    album:            'AfCFTA Soundtrack',
    genre:            'Afro-Pop',
    duration_seconds: 277,
    boost_multiplier: 2.5,
    btng_per_minute:  0.0019,
    emoji:            '✊',
    color:            '#8B5CF6',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/nairobi-node.mp3',
    title:            'Nairobi Node',
    artist:           'East Africa Chain',
    album:            'AfCFTA Soundtrack',
    genre:            'Benga-Tech',
    duration_seconds: 243,
    boost_multiplier: 2.3,
    btng_per_minute:  0.0017,
    emoji:            '🦁',
    color:            '#F59E0B',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/lagos-ledger-flow.mp3',
    title:            'Lagos Ledger Flow',
    artist:           'Afro-Defi Collective',
    album:            'DeFi Africa Vol.1',
    genre:            'Afrobeats',
    duration_seconds: 264,
    boost_multiplier: 2.4,
    btng_per_minute:  0.0018,
    emoji:            '🏙️',
    color:            '#06B6D4',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/johannesburg-hash.mp3',
    title:            'Johannesburg Hash',
    artist:           'Southern Blockchain',
    album:            'DeFi Africa Vol.1',
    genre:            'Amapiano',
    duration_seconds: 290,
    boost_multiplier: 2.5,
    btng_per_minute:  0.0019,
    emoji:            '💎',
    color:            '#EC4899',
    isNew:            true,
  },
  // ── BTNG Sovereign Specials ──
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/sovereign-chain-vibes.mp3',
    title:            'Sovereign Chain Vibes',
    artist:           'BTNG Studio',
    album:            'Sovereign Series',
    genre:            'Afro-Pop',
    duration_seconds: 238,
    boost_multiplier: 2.4,
    btng_per_minute:  0.0018,
    emoji:            '🛡️',
    color:            '#D4A017',
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/block-truck-anthem.mp3',
    title:            'Block Truck Anthem',
    artist:           'BTNG Collective',
    album:            'Sovereign Series',
    genre:            'Afrobeats',
    duration_seconds: 273,
    boost_multiplier: 2.8,
    btng_per_minute:  0.0022,
    emoji:            '🚛',
    color:            '#F7931A',
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/gold-reserve-symphony.mp3',
    title:            'Gold Reserve Symphony',
    artist:           'BTNG Orchestra',
    album:            'Sovereign Series',
    genre:            'Afro-Classical',
    duration_seconds: 360,
    boost_multiplier: 3.0,
    btng_per_minute:  0.0024,
    emoji:            '🏆',
    color:            '#FFD700',
    isNew:            true,
  },
  // ── BTNG Reggae · Album 13 ──────────────────────────────────────────────────
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/album13-track01.mp3',
    title:            'Gold Roots Rising',
    artist:           'BTNG Artist',
    album:            'Album 13',
    genre:            'Reggae',
    duration_seconds: 268,
    boost_multiplier: 2.6,
    btng_per_minute:  0.0020,
    emoji:            '🌿',
    color:            '#22C55E',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/album13-track02.mp3',
    title:            'Sovereign Riddim',
    artist:           'BTNG Artist',
    album:            'Album 13',
    genre:            'Reggae',
    duration_seconds: 242,
    boost_multiplier: 2.7,
    btng_per_minute:  0.0021,
    emoji:            '✊',
    color:            '#16A34A',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/album13-track03.mp3',
    title:            'One Africa Skank',
    artist:           'BTNG Artist',
    album:            'Album 13',
    genre:            'Reggae',
    duration_seconds: 310,
    boost_multiplier: 2.5,
    btng_per_minute:  0.0019,
    emoji:            '🌍',
    color:            '#15803D',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/album13-track04.mp3',
    title:            'Gold Chain Vibration',
    artist:           'BTNG Artist',
    album:            'Album 13',
    genre:            'Reggae',
    duration_seconds: 284,
    boost_multiplier: 2.8,
    btng_per_minute:  0.0022,
    emoji:            '🏆',
    color:            '#D4A017',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/album13-track05.mp3',
    title:            'Block by Block',
    artist:           'BTNG Artist',
    album:            'Album 13',
    genre:            'Reggae',
    duration_seconds: 255,
    boost_multiplier: 2.6,
    btng_per_minute:  0.0020,
    emoji:            '⛏️',
    color:            '#F59E0B',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/album13-track06.mp3',
    title:            'Zion Blockchain',
    artist:           'BTNG Artist',
    album:            'Album 13',
    genre:            'Reggae',
    duration_seconds: 295,
    boost_multiplier: 2.7,
    btng_per_minute:  0.0021,
    emoji:            '🔱',
    color:            '#EAB308',
    isNew:            true,
  },
  // ── BTNG Reggae · Track 17 ──────────────────────────────────────────────────
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/track17-vol01.mp3',
    title:            'Babylon Must Fall',
    artist:           'BTNG Artist',
    album:            'Track 17',
    genre:            'Reggae',
    duration_seconds: 330,
    boost_multiplier: 2.9,
    btng_per_minute:  0.0023,
    emoji:            '🦁',
    color:            '#F97316',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/track17-vol02.mp3',
    title:            'Digital Liberation',
    artist:           'BTNG Artist',
    album:            'Track 17',
    genre:            'Reggae',
    duration_seconds: 272,
    boost_multiplier: 2.8,
    btng_per_minute:  0.0022,
    emoji:            '🔓',
    color:            '#84CC16',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/track17-vol03.mp3',
    title:            'BTNG Movement',
    artist:           'BTNG Artist',
    album:            'Track 17',
    genre:            'Reggae',
    duration_seconds: 315,
    boost_multiplier: 3.0,
    btng_per_minute:  0.0024,
    emoji:            '🎸',
    color:            '#22D3EE',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/track17-vol04.mp3',
    title:            'Roots & Gold',
    artist:           'BTNG Artist',
    album:            'Track 17',
    genre:            'Reggae',
    duration_seconds: 258,
    boost_multiplier: 2.7,
    btng_per_minute:  0.0021,
    emoji:            '🌱',
    color:            '#4ADE80',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/track17-vol05.mp3',
    title:            'Burning Fire Skank',
    artist:           'BTNG Artist',
    album:            'Track 17',
    genre:            'Reggae',
    duration_seconds: 288,
    boost_multiplier: 2.6,
    btng_per_minute:  0.0020,
    emoji:            '🔥',
    color:            '#FB923C',
    isNew:            true,
  },
  // ── BTNG Reggae · Singles ───────────────────────────────────────────────────
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/single-africa-gold.mp3',
    title:            'Africa Gold (Single)',
    artist:           'BTNG Artist',
    album:            'Singles',
    genre:            'Reggae',
    duration_seconds: 221,
    boost_multiplier: 2.5,
    btng_per_minute:  0.0019,
    emoji:            '🎤',
    color:            '#A3E635',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/single-crypto-king.mp3',
    title:            'Crypto King (Single)',
    artist:           'BTNG Artist',
    album:            'Singles',
    genre:            'Reggae',
    duration_seconds: 198,
    boost_multiplier: 2.4,
    btng_per_minute:  0.0018,
    emoji:            '👑',
    color:            '#FCD34D',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/single-ghana-sovereign.mp3',
    title:            'Ghana Sovereign (Single)',
    artist:           'BTNG Artist',
    album:            'Singles',
    genre:            'Reggae',
    duration_seconds: 235,
    boost_multiplier: 2.6,
    btng_per_minute:  0.0020,
    emoji:            '🇬🇭',
    color:            '#34D399',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/single-freedom-chain.mp3',
    title:            'Freedom Chain (Single)',
    artist:           'BTNG Artist',
    album:            'Singles',
    genre:            'Reggae',
    duration_seconds: 244,
    boost_multiplier: 2.7,
    btng_per_minute:  0.0021,
    emoji:            '⛓️',
    color:            '#60A5FA',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/single-btng-anthem.mp3',
    title:            'BTNG Anthem (Single)',
    artist:           'BTNG Artist',
    album:            'Singles',
    genre:            'Reggae',
    duration_seconds: 262,
    boost_multiplier: 2.9,
    btng_per_minute:  0.0023,
    emoji:            '🎵',
    color:            '#C084FC',
    isNew:            true,
  },
  // ── Chill & Focus ──
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/kente-lofi.mp3',
    title:            'Kente Lo-Fi Beats',
    artist:           'Kente Sound Lab',
    album:            'Chill & Mine',
    genre:            'Lo-Fi Hip-Hop',
    duration_seconds: 195,
    boost_multiplier: 2.2,
    btng_per_minute:  0.0016,
    emoji:            '🎧',
    color:            '#A78BFA',
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/mine-in-peace.mp3',
    title:            'Mine in Peace',
    artist:           'Ambient Chain',
    album:            'Chill & Mine',
    genre:            'Ambient',
    duration_seconds: 420,
    boost_multiplier: 2.1,
    btng_per_minute:  0.0015,
    emoji:            '🌙',
    color:            '#818CF8',
    isNew:            true,
  },
  {
    track_uid:        generateUID('TRACK'),
    file_url:         'https://storage.btng.gold/audio/deep-forest-hash.mp3',
    title:            'Deep Forest Hash',
    artist:           'Rainforest Chain',
    album:            'Chill & Mine',
    genre:            'Nature Beats',
    duration_seconds: 385,
    boost_multiplier: 2.0,
    btng_per_minute:  0.0014,
    emoji:            '🌿',
    color:            '#34D399',
    isNew:            true,
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface SessionRecord {
  date:    string;   // short label e.g. "Jun 28"
  time:    string;   // e.g. "14:32"
  btng:    number;   // BTNG earned this session
  minutes: number;   // session duration minutes
  ts:      number;   // unix ms for sorting
}

interface MineLog {
  id:       string;
  ts:       string;
  type:     'mine' | 'block' | 'music' | 'system';
  message:  string;
  reward?:  number;
}

interface MinerStats {
  totalMined:     number;
  pendingRewards: number;
  blocksFound:    number;
  sessionMinutes: number;
  hashRate:       number;
  musicMinutes:   number;
  miningCycles:   number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4): string   { return n.toFixed(d); }
function fmtBig(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return n.toFixed(0);
}
function nowTime(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── One-column library engine (from spec) ─────────────────────────────────────
function getOneColumnMusicLibrary(): MusicTrack[] {
  return MUSIC_LIBRARY;
}

// ── Animated Ring ─────────────────────────────────────────────────────────────
function MiningRing({ active, boost, boostColor = Colors.warning }: {
  active:      boolean;
  boost:       boolean;
  boostColor?: string;
}) {
  const rot   = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const rotLoop   = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (active) {
      const dur = boost ? 1200 : 2400;
      rotLoop.current = Animated.loop(
        Animated.timing(rot, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true })
      );
      rotLoop.current.start();
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: boost ? 1.12 : 1.06, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      rotLoop.current?.stop();
      pulseLoop.current?.stop();
      Animated.timing(pulse, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
    return () => { rotLoop.current?.stop(); pulseLoop.current?.stop(); };
  }, [active, boost]);

  const spin      = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringColor = boost ? boostColor : Colors.primary;

  return (
    <View style={ring.container} accessible accessibilityLabel={boost ? 'Music mining active with boost' : active ? 'Mining active' : 'Mining paused'}>
      <Animated.View style={[ring.outerRing, { borderColor: ringColor + (active ? 'BB' : '33'), transform: [{ rotate: spin }] }]} />
      <Animated.View style={[ring.midRing,  { borderColor: ringColor + (active ? '55' : '22'), transform: [{ rotate: spin }, { scaleX: -1 }] }]} />
      <Animated.View style={[ring.core, { backgroundColor: ringColor + '18', borderColor: ringColor + (active ? '88' : '33'), transform: [{ scale: pulse }] }]}>
        <Text style={ring.coreEmoji}>{boost ? '🎵' : active ? '⛏️' : '💤'}</Text>
        <Text style={[ring.coreLabel, { color: active ? ringColor : Colors.textMuted }]}>
          {boost ? 'MUSIC\nMINING' : active ? 'MINING\nACTIVE' : 'PAUSED'}
        </Text>
      </Animated.View>
    </View>
  );
}

const ring = StyleSheet.create({
  container: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  outerRing: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 2.5, borderStyle: 'dashed' },
  midRing:   { position: 'absolute', width: 175, height: 175, borderRadius: 87.5, borderWidth: 1.5, borderStyle: 'dotted' },
  core:      { width: 130, height: 130, borderRadius: 65, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 4 },
  coreEmoji: { fontSize: 36 },
  coreLabel: { fontSize: 10, fontWeight: FontWeight.heavy, textAlign: 'center', letterSpacing: 0.8, includeFontPadding: false, lineHeight: 13 },
});

// ── Hash Rate Counter ─────────────────────────────────────────────────────────
function HashCounter({ value, label, color = Colors.primary }: { value: string; label: string; color?: string }) {
  return (
    <View style={hc.cell} accessible accessibilityLabel={`${label.replace(/\n/g, ' ')}: ${value}`}>
      <Text style={[hc.value, { color }]}>{value}</Text>
      <Text style={hc.label}>{label}</Text>
    </View>
  );
}
const hc = StyleSheet.create({
  cell:  { flex: 1, alignItems: 'center', gap: 3 },
  value: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, textAlign: 'center', includeFontPadding: false },
});

// ── Audio Visualizer Bars ─────────────────────────────────────────────────────
function AudioViz({ playing, color, barCount = 7 }: { playing: boolean; color: string; barCount?: number }) {
  const barAnims = useRef(Array.from({ length: barCount }, () => new Animated.Value(0.3))).current;
  const loopRefs = useRef<(Animated.CompositeAnimation | null)[]>(Array(barCount).fill(null));

  useEffect(() => {
    barAnims.forEach((anim, i) => {
      if (playing) {
        const dur   = 260 + i * 55;
        const delay = i * 90;
        const loop  = Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1,   duration: dur, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0.15, duration: dur, useNativeDriver: true }),
          ])
        );
        loopRefs.current[i] = loop;
        loop.start();
      } else {
        loopRefs.current[i]?.stop();
        Animated.timing(anim, { toValue: 0.3, duration: 200, useNativeDriver: true }).start();
      }
    });
    return () => loopRefs.current.forEach(l => l?.stop());
  }, [playing]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: 32, paddingBottom: 2 }}>
      {barAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width:           3.5,
            borderRadius:    2,
            backgroundColor: playing ? color : Colors.textMuted,
            height:          anim.interpolate({ inputRange: [0, 1], outputRange: [4, 28] }),
          }}
        />
      ))}
    </View>
  );
}

// ── Stereo Audio Visualizer (dual-channel L/R) ───────────────────────────────
function StereoViz({
  playing, color, volume, balance, barCount = 8,
}: {
  playing:  boolean;
  color:    string;
  volume:   number;   // 0-100
  balance:  number;   // -100(L) to 100(R)
  barCount?: number;
}) {
  // Left channel bars
  const lBars = useRef(Array.from({ length: barCount }, () => new Animated.Value(0.2))).current;
  // Right channel bars
  const rBars = useRef(Array.from({ length: barCount }, () => new Animated.Value(0.2))).current;
  const lLoops = useRef<(Animated.CompositeAnimation | null)[]>(Array(barCount).fill(null));
  const rLoops = useRef<(Animated.CompositeAnimation | null)[]>(Array(barCount).fill(null));

  // balance: -100 = full left, 0 = center, 100 = full right
  const lGain = volume / 100 * (balance <= 0 ? 1 : 1 - balance / 100);
  const rGain = volume / 100 * (balance >= 0 ? 1 : 1 + balance / 100);

  useEffect(() => {
    lBars.forEach((anim, i) => {
      lLoops.current[i]?.stop();
      if (playing && lGain > 0) {
        const dur = 220 + i * 45;
        const loop = Animated.loop(Animated.sequence([
          Animated.timing(anim, { toValue: lGain, duration: dur, useNativeDriver: true }),
          Animated.timing(anim, { toValue: lGain * 0.1 + 0.05, duration: dur + 40, useNativeDriver: true }),
        ]));
        lLoops.current[i] = loop;
        loop.start();
      } else {
        Animated.timing(anim, { toValue: 0.08, duration: 200, useNativeDriver: true }).start();
      }
    });
    rBars.forEach((anim, i) => {
      rLoops.current[i]?.stop();
      if (playing && rGain > 0) {
        const dur = 240 + i * 50;
        const loop = Animated.loop(Animated.sequence([
          Animated.timing(anim, { toValue: rGain, duration: dur, useNativeDriver: true }),
          Animated.timing(anim, { toValue: rGain * 0.1 + 0.05, duration: dur + 60, useNativeDriver: true }),
        ]));
        rLoops.current[i] = loop;
        loop.start();
      } else {
        Animated.timing(anim, { toValue: 0.08, duration: 200, useNativeDriver: true }).start();
      }
    });
    return () => {
      lLoops.current.forEach(l => l?.stop());
      rLoops.current.forEach(l => l?.stop());
    };
  }, [playing, volume, balance]);

  const maxH = 36;
  return (
    <View style={sv.wrap}>
      {/* L label */}
      <Text style={[sv.chLabel, { color: lGain > 0.3 ? color : Colors.textMuted }]}>L</Text>
      {/* Left channel */}
      <View style={sv.channel}>
        {lBars.map((anim, i) => (
          <Animated.View
            key={`l${i}`}
            style={[
              sv.bar,
              {
                backgroundColor: playing ? color : Colors.textMuted,
                opacity: playing ? 0.85 : 0.3,
                transform: [{ scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) }],
                height: maxH,
              },
            ]}
          />
        ))}
      </View>
      {/* Center divider */}
      <View style={sv.centerDiv} />
      {/* Right channel */}
      <View style={sv.channel}>
        {rBars.map((anim, i) => (
          <Animated.View
            key={`r${i}`}
            style={[
              sv.bar,
              {
                backgroundColor: playing ? color : Colors.textMuted,
                opacity: playing ? 0.85 : 0.3,
                transform: [{ scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) }],
                height: maxH,
              },
            ]}
          />
        ))}
      </View>
      {/* R label */}
      <Text style={[sv.chLabel, { color: rGain > 0.3 ? color : Colors.textMuted }]}>R</Text>
    </View>
  );
}

const sv = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingVertical: 4 },
  channel:  { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: 36 },
  bar:      { width: 3.5, borderRadius: 2 },
  chLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, width: 10, textAlign: 'center' },
  centerDiv:{ width: 1, height: 28, backgroundColor: Colors.border, marginHorizontal: 3 },
});

// ── Seek Bar ─────────────────────────────────────────────────────────────────
function SeekBar({
  elapsed,
  duration,
  color,
  onSeek,
}: {
  elapsed:  number;
  duration: number;
  color:    string;
  onSeek:   (ms: number) => void;
}) {
  const trackWidth     = useRef(0);
  const isScrubbing    = useRef(false);
  const scrubPos       = useRef(new Animated.Value(duration > 0 ? elapsed / duration : 0)).current;
  const [scrubSecs, setScrubSecs] = useState<number | null>(null);

  useEffect(() => {
    if (!isScrubbing.current && duration > 0) {
      Animated.timing(scrubPos, {
        toValue:  elapsed / duration,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
  }, [elapsed, duration]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        isScrubbing.current = true;
        if (trackWidth.current <= 0 || duration <= 0) return;
        const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth.current));
        scrubPos.setValue(pct);
        setScrubSecs(Math.round(pct * duration));
      },
      onPanResponderMove: (e) => {
        if (trackWidth.current <= 0 || duration <= 0) return;
        const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth.current));
        scrubPos.setValue(pct);
        setScrubSecs(Math.round(pct * duration));
      },
      onPanResponderRelease: (e) => {
        if (trackWidth.current <= 0 || duration <= 0) {
          isScrubbing.current = false;
          setScrubSecs(null);
          return;
        }
        const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth.current));
        const seekMs = Math.round(pct * duration * 1000);
        onSeek(seekMs);
        setScrubSecs(null);
        isScrubbing.current = false;
      },
      onPanResponderTerminate: () => {
        isScrubbing.current = false;
        setScrubSecs(null);
      },
    })
  ).current;

  const fillW = scrubPos.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const displayElapsed  = scrubSecs !== null ? scrubSecs : elapsed;
  const displayDuration = duration > 0 ? duration : 0;

  return (
    <View style={sk.wrap}>
      <View style={sk.timeRow}>
        <Text style={[sk.timeText, { color: scrubSecs !== null ? color : Colors.textMuted }]}>
          {fmtDuration(displayElapsed)}
        </Text>
        {scrubSecs !== null && (
          <View style={[sk.scrubChip, { borderColor: color + '55', backgroundColor: color + '18' }]}>
            <MaterialIcons name="touch-app" size={10} color={color} />
            <Text style={[sk.scrubText, { color }]}>scrubbing</Text>
          </View>
        )}
        <Text style={sk.timeText}>{displayDuration > 0 ? fmtDuration(displayDuration) : '--:--'}</Text>
      </View>

      <View
        style={sk.track}
        onLayout={e => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
        accessible
        accessibilityLabel={`Seek bar. Position: ${fmtDuration(displayElapsed)} of ${fmtDuration(displayDuration)}`}
        accessibilityRole="adjustable"
      >
        <View style={sk.trackBg} />
        <View style={[sk.trackBuf, { backgroundColor: color + '22' }]} />
        <Animated.View style={[sk.fill, { width: fillW, backgroundColor: color }]} />
        <Animated.View
          style={[
            sk.thumb,
            {
              marginLeft: scrubPos.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              left: scrubPos.interpolate({ inputRange: [0, 1], outputRange: [-8, -8] }),
              borderColor: color,
              shadowColor: color,
              transform: [{ scale: scrubSecs !== null ? 1.35 : 1 }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  wrap:      { gap: 4 },
  timeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeText:  { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  scrubChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  scrubText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  track:     { height: 32, justifyContent: 'center', position: 'relative' },
  trackBg:   { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  trackBuf:  { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2 },
  fill:      { position: 'absolute', left: 0, height: 4, borderRadius: 2 },
  thumb:     { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.bgCard, borderWidth: 2.5, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 5, elevation: 5, top: 8 },
});

// ── Volume Slider ─────────────────────────────────────────────────────────────
function VolumeSlider({
  value, color, onValueChange,
}: {
  value:         number;  // 0-100
  color:         string;
  onValueChange: (v: number) => void;
}) {
  const trackWidth = useRef(0);
  const thumbAnim  = useRef(new Animated.Value(value / 100)).current;

  // Sync external changes
  useEffect(() => {
    Animated.timing(thumbAnim, { toValue: value / 100, duration: 80, useNativeDriver: false }).start();
  }, [value]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        if (trackWidth.current <= 0) return;
        const x = e.nativeEvent.locationX;
        const pct = Math.max(0, Math.min(1, x / trackWidth.current));
        onValueChange(Math.round(pct * 100));
        thumbAnim.setValue(pct);
      },
      onPanResponderMove: (e, gs) => {
        if (trackWidth.current <= 0) return;
        const x = e.nativeEvent.locationX;
        const pct = Math.max(0, Math.min(1, x / trackWidth.current));
        onValueChange(Math.round(pct * 100));
        thumbAnim.setValue(pct);
      },
    })
  ).current;

  const fillW = thumbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={vs.track}
      onLayout={e => { trackWidth.current = e.nativeEvent.layout.width; }}
      {...panResponder.panHandlers}
      accessible
      accessibilityLabel={`Volume: ${value}%`}
      accessibilityRole="adjustable"
    >
      {/* Track background */}
      <View style={vs.trackBg} />
      {/* Fill */}
      <Animated.View style={[vs.fill, { width: fillW, backgroundColor: color }]} />
      {/* Thumb */}
      <Animated.View
        style={[
          vs.thumb,
          {
            left: thumbAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, -8] }),
            marginLeft: thumbAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            borderColor: color,
            shadowColor: color,
          },
        ]}
      />
    </View>
  );
}
const vs = StyleSheet.create({
  track:  { height: 28, justifyContent: 'center', position: 'relative' },
  trackBg:{ position: 'absolute', left: 0, right: 0, height: 5, borderRadius: 3, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  fill:   { position: 'absolute', left: 0, height: 5, borderRadius: 3 },
  thumb:  { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.bgCard, borderWidth: 2, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4, top: 6 },
});

// ── Vertical Band Slider (for EQ) ────────────────────────────────────────────
function VerticalBandSlider({
  value, color, onValueChange,
}: {
  value:         number;  // -12 to +12 dB
  color:         string;
  onValueChange: (v: number) => void;
}) {
  const EQ_MIN = -12;
  const EQ_MAX = 12;
  const EQ_RANGE = EQ_MAX - EQ_MIN;
  const TRACK_H = 90;

  const trackH   = useRef(TRACK_H);
  const thumbAnim = useRef(new Animated.Value(1 - (value - EQ_MIN) / EQ_RANGE)).current;

  useEffect(() => {
    Animated.timing(thumbAnim, {
      toValue:  1 - (value - EQ_MIN) / EQ_RANGE,
      duration: 80,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        if (trackH.current <= 0) return;
        const y = e.nativeEvent.locationY;
        const pct = Math.max(0, Math.min(1, y / trackH.current));
        const db  = Math.round((1 - pct) * EQ_RANGE + EQ_MIN);
        onValueChange(Math.max(EQ_MIN, Math.min(EQ_MAX, db)));
        thumbAnim.setValue(pct);
      },
      onPanResponderMove: (e) => {
        if (trackH.current <= 0) return;
        const y = e.nativeEvent.locationY;
        const pct = Math.max(0, Math.min(1, y / trackH.current));
        const db  = Math.round((1 - pct) * EQ_RANGE + EQ_MIN);
        onValueChange(Math.max(EQ_MIN, Math.min(EQ_MAX, db)));
        thumbAnim.setValue(pct);
      },
    })
  ).current;

  // Center line (0 dB) position
  const centerPct   = 1 - (0 - EQ_MIN) / EQ_RANGE; // 0.5
  const isPositive  = value >= 0;

  // Fill: from center to thumb
  const fillTop = thumbAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [`${centerPct * 100}%`, `${centerPct * 100}%`],  // will be overridden
  });
  // Use numeric fill approach: measure via value
  const fillTopPct  = isPositive
    ? (1 - (value - EQ_MIN) / EQ_RANGE) * 100
    : centerPct * 100;
  const fillBotPct  = isPositive
    ? centerPct * 100
    : (1 - (value - EQ_MIN) / EQ_RANGE) * 100;
  const fillHeight  = Math.abs(value) / EQ_RANGE * 100;

  const thumbTopPct = thumbAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={vbs.track}
      onLayout={e => { trackH.current = e.nativeEvent.layout.height; }}
      {...panResponder.panHandlers}
      accessible
      accessibilityLabel={`EQ band: ${value >= 0 ? '+' : ''}${value} dB`}
      accessibilityRole="adjustable"
    >
      {/* Track bg */}
      <View style={vbs.trackBg} />
      {/* 0 dB center line */}
      <View style={[vbs.centerLine, { top: `${centerPct * 100}%` as any }]} />
      {/* Fill from center */}
      {value !== 0 && (
        <View
          style={[
            vbs.fill,
            {
              backgroundColor: isPositive ? color : color + 'AA',
              top:    `${fillTopPct}%` as any,
              height: `${fillHeight}%` as any,
            },
          ]}
        />
      )}
      {/* Thumb */}
      <Animated.View
        style={[
          vbs.thumb,
          {
            top:         thumbTopPct,
            marginTop:   -7,
            borderColor: color,
            shadowColor: color,
            backgroundColor: value === 0 ? Colors.bgCard : color,
          },
        ]}
      />
    </View>
  );
}

const vbs = StyleSheet.create({
  track:     { width: 28, height: 90, alignItems: 'center', position: 'relative', justifyContent: 'flex-start' },
  trackBg:   { position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  centerLine:{ position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: Colors.border + 'CC' },
  fill:      { position: 'absolute', left: 12, width: 4, borderRadius: 2 },
  thumb:     { position: 'absolute', left: 6, width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 4 },
});

// ── 5-Band Equalizer Panel ────────────────────────────────────────────────────
function EqualizerPanel({
  bands, preset, color,
  onBandChange, onPresetChange,
}: {
  bands:          EqBands;
  preset:         EqPresetName | null;
  color:          string;
  onBandChange:   (key: keyof EqBands, value: number) => void;
  onPresetChange: (name: EqPresetName) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.timing(expandAnim, {
      toValue:  next ? 1 : 0,
      duration: 260,
      easing:   Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  // Check if bands match any preset
  const matchedPreset = (Object.keys(EQ_PRESETS) as EqPresetName[]).find(name =>
    EQ_BAND_LABELS.every(b => EQ_PRESETS[name][b.key] === bands[b.key])
  ) ?? null;

  const isFlat = EQ_BAND_LABELS.every(b => bands[b.key] === 0);

  return (
    <View style={[eq.card, { borderColor: color + '33' }]}>
      {/* Header toggle */}
      <TouchableOpacity
        style={eq.header}
        onPress={toggleExpand}
        activeOpacity={0.8}
        accessible
        accessibilityLabel={expanded ? 'Collapse equalizer' : 'Expand equalizer'}
        accessibilityRole="button"
      >
        <View style={[eq.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <MaterialIcons name="equalizer" size={16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={eq.title}>5-Band Equalizer</Text>
          <Text style={[eq.subtitle, { color: isFlat ? Colors.textMuted : color }]}>
            {matchedPreset ?? (isFlat ? 'Flat · no EQ' : 'Custom')}
          </Text>
        </View>
        {!isFlat && (
          <View style={[eq.activePip, { backgroundColor: color }]} />
        )}
        <MaterialIcons
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={20}
          color={Colors.textMuted}
        />
      </TouchableOpacity>

      {/* Collapsible body */}
      <Animated.View
        style={[{
          maxHeight: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 360] }),
          opacity:   expandAnim,
          overflow:  'hidden',
        }]}
      >
        {/* Preset chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={eq.presetRow}
        >
          {(Object.keys(EQ_PRESETS) as EqPresetName[]).map(name => {
            const active = matchedPreset === name;
            return (
              <TouchableOpacity
                key={name}
                style={[eq.presetChip, active && { backgroundColor: color + '22', borderColor: color + '88' }]}
                onPress={() => onPresetChange(name)}
                activeOpacity={0.8}
                accessible
                accessibilityLabel={`EQ preset: ${name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[eq.presetText, { color: active ? color : Colors.textMuted }]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
          {/* Reset */}
          <TouchableOpacity
            style={[eq.presetChip, isFlat && { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}
            onPress={() => onPresetChange('Flat')}
            activeOpacity={0.8}
            accessible
            accessibilityLabel="Reset EQ to flat"
            accessibilityRole="button"
          >
            <MaterialIcons name="refresh" size={11} color={isFlat ? Colors.textMuted : Colors.error} />
            <Text style={[eq.presetText, { color: isFlat ? Colors.textMuted : Colors.error }]}>Reset</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Band sliders */}
        <View style={eq.bandsRow}>
          {EQ_BAND_LABELS.map(band => {
            const val = bands[band.key];
            const isActive = val !== 0;
            return (
              <View key={band.key} style={eq.bandCol}>
                {/* dB value */}
                <Text style={[eq.dbVal, { color: isActive ? color : Colors.textMuted }]}>
                  {val > 0 ? `+${val}` : val}
                </Text>
                {/* Vertical slider */}
                <VerticalBandSlider
                  value={val}
                  color={color}
                  onValueChange={v => onBandChange(band.key, v)}
                />
                {/* Freq label */}
                <Text style={[eq.freqLabel, { color: isActive ? color : Colors.textMuted }]}>{band.short}</Text>
              </View>
            );
          })}
        </View>

        {/* dB range legend */}
        <View style={eq.legend}>
          <Text style={eq.legendText}>+12 dB</Text>
          <Text style={eq.legendText}>0</Text>
          <Text style={eq.legendText}>-12 dB</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const eq = StyleSheet.create({
  card:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  iconWrap:   { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle:   { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false, marginTop: 1 },
  activePip:  { width: 7, height: 7, borderRadius: 3.5, marginRight: 4 },
  presetRow:  { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: 7 },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
  presetText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  bandsRow:   { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingBottom: 4 },
  bandCol:    { alignItems: 'center', gap: 5, minWidth: 40 },
  dbVal:      { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, height: 14, textAlign: 'center' },
  freqLabel:  { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false, textAlign: 'center' },
  legend:     { flexDirection: 'column', position: 'absolute', left: Spacing.sm, top: 56, bottom: 32, justifyContent: 'space-between', pointerEvents: 'none' },
  legendText: { fontSize: 7, color: Colors.textMuted, includeFontPadding: false },
});

// ── Stereo Controller Card ────────────────────────────────────────────────────
function StereoController({
  playing, color, volume, balance, muted,
  onVolumeChange, onBalanceChange, onMuteToggle,
  eqBands, eqPreset, onEqBandChange, onEqPresetChange,
}: {
  playing:           boolean;
  color:             string;
  volume:            number;
  balance:           number;  // -100(L) to 100(R)
  muted:             boolean;
  onVolumeChange:    (v: number) => void;
  onBalanceChange:   (v: number) => void;
  onMuteToggle:      () => void;
  eqBands:           EqBands;
  eqPreset:          EqPresetName | null;
  onEqBandChange:    (key: keyof EqBands, value: number) => void;
  onEqPresetChange:  (name: EqPresetName) => void;
}) {
  const effectiveVolume = muted ? 0 : volume;

  // Volume icon
  const volIcon = muted || volume === 0
    ? 'volume-off'
    : volume < 40 ? 'volume-down' : 'volume-up';

  // Balance label
  const balanceLabel = balance === 0
    ? 'C'
    : balance < 0 ? `L${Math.abs(balance)}` : `R${balance}`;

  return (
    <View
      style={[sc.card, { borderColor: color + '33' }]}
      accessible
      accessibilityLabel={`Stereo controls. Volume: ${volume}%. Balance: ${balanceLabel}. ${muted ? 'Muted' : 'Unmuted'}`}
    >
      {/* Header */}
      <View style={sc.header}>
        <View style={[sc.iconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
          <MaterialIcons name="graphic-eq" size={16} color={color} />
        </View>
        <Text style={sc.title}>Stereo Audio</Text>
        <View style={[sc.stereoChip, { backgroundColor: color + '15', borderColor: color + '33' }]}>
          <View style={[sc.stereoDot, { backgroundColor: playing && !muted ? color : Colors.textMuted }]} />
          <Text style={[sc.stereoChipText, { color: playing && !muted ? color : Colors.textMuted }]}>
            {playing && !muted ? 'STEREO LIVE' : muted ? 'MUTED' : 'STANDBY'}
          </Text>
        </View>
      </View>

      {/* Stereo Visualizer */}
      <View style={[sc.vizWrap, { borderColor: color + '22' }]}>
        <StereoViz
          playing={playing && !muted}
          color={color}
          volume={effectiveVolume}
          balance={balance}
          barCount={9}
        />
      </View>

      {/* Volume Row */}
      <View style={sc.controlRow}>
        <TouchableOpacity
          style={[sc.muteBtn, muted && { backgroundColor: Colors.error + '22', borderColor: Colors.error + '66' }]}
          onPress={onMuteToggle}
          activeOpacity={0.8}
          accessible
          accessibilityLabel={muted ? 'Unmute' : 'Mute'}
          accessibilityRole="button"
        >
          <MaterialIcons
            name={volIcon as any}
            size={18}
            color={muted ? Colors.error : color}
          />
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={sc.labelRow}>
            <Text style={sc.ctrlLabel}>VOLUME</Text>
            <Text style={[sc.ctrlValue, { color }]}>{muted ? 'MUTED' : `${volume}%`}</Text>
          </View>
          <VolumeSlider value={volume} color={color} onValueChange={onVolumeChange} />
        </View>
      </View>

      {/* Balance Row */}
      <View style={sc.controlRow}>
        <View style={sc.balLabelWrap}>
          <MaterialIcons name="tune" size={18} color={color} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={sc.labelRow}>
            <Text style={sc.ctrlLabel}>BALANCE</Text>
            <Text style={[sc.ctrlValue, { color: balance === 0 ? Colors.success : color }]}>
              {balance === 0 ? 'CENTER' : balance < 0 ? `◀ L${Math.abs(balance)}` : `R${balance} ▶`}
            </Text>
          </View>
          <View style={sc.balanceRow}>
            <Text style={sc.balSide}>L</Text>
            <View style={{ flex: 1 }}>
              <VolumeSlider
                value={(balance + 100) / 2}  // map -100..100 → 0..100
                color={color}
                onValueChange={v => onBalanceChange(Math.round(v * 2 - 100))}
              />
            </View>
            <Text style={sc.balSide}>R</Text>
          </View>
        </View>
      </View>

      {/* Quick presets */}
      <View style={sc.presetRow}>
        {[
          { label: 'Max', vol: 100, bal: 0   },
          { label: 'Left', vol: volume, bal: -60 },
          { label: 'Center', vol: volume, bal: 0 },
          { label: 'Right', vol: volume, bal: 60 },
          { label: '50%', vol: 50, bal: 0   },
        ].map(p => (
          <TouchableOpacity
            key={p.label}
            style={[
              sc.presetChip,
              {
                backgroundColor:
                  volume === p.vol && balance === p.bal
                    ? color + '22' : Colors.bgElevated,
                borderColor:
                  volume === p.vol && balance === p.bal
                    ? color + '66' : Colors.border,
              },
            ]}
            onPress={() => { onVolumeChange(p.vol); onBalanceChange(p.bal); }}
            activeOpacity={0.8}
            accessible
            accessibilityLabel={`Preset: ${p.label}`}
            accessibilityRole="button"
          >
            <Text style={[
              sc.presetText,
              { color: volume === p.vol && balance === p.bal ? color : Colors.textMuted },
            ]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 5-Band Equalizer */}
      <EqualizerPanel
        bands={eqBands}
        preset={eqPreset}
        color={color}
        onBandChange={onEqBandChange}
        onPresetChange={onEqPresetChange}
      />
    </View>
  );
}

const sc = StyleSheet.create({
  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, gap: Spacing.md },
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:     { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:        { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  stereoChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  stereoDot:    { width: 6, height: 6, borderRadius: 3 },
  stereoChipText:{ fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  vizWrap:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  controlRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  muteBtn:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, flexShrink: 0 },
  balLabelWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  labelRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ctrlLabel:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  ctrlValue:    { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  balanceRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balSide:      { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, width: 8, textAlign: 'center', includeFontPadding: false },
  presetRow:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  presetChip:   { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  presetText:   { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ── One-Column Track Row ──────────────────────────────────────────────────────
function TrackRow({
  track,
  isSelected,
  isPlaying,
  onSelect,
}: {
  track:      MusicTrack;
  isSelected: boolean;
  isPlaying:  boolean;
  onSelect:   () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    onSelect();
  };

  const boostLabel = `${track.boost_multiplier}x boost · ${(track.btng_per_minute * 1000).toFixed(1)} mBTNG/min`;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          tr.row,
          isSelected && { borderColor: track.color + '88', backgroundColor: track.color + '0C' },
        ]}
        onPress={handlePress}
        activeOpacity={0.85}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${track.title} by ${track.artist}, ${track.genre}, ${fmtDuration(track.duration_seconds)}. ${boostLabel}. ${isSelected ? 'Currently selected' : 'Tap to select'}`}
        accessibilityState={{ selected: isSelected }}
      >
        {/* Left: emoji + accent bar */}
        <View style={[tr.emojiWrap, { backgroundColor: track.color + '15', borderColor: track.color + '33' }]}>
          {isPlaying ? (
            <AudioViz playing={true} color={track.color} barCount={4} />
          ) : (
            <Text style={{ fontSize: 22 }}>{track.emoji}</Text>
          )}
        </View>

        {/* Center: track info */}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[tr.title, { color: isSelected ? track.color : Colors.textPrimary }]} numberOfLines={1}>
              {track.title}
            </Text>
            {track.isNew && (
              <View style={[tr.newBadge, { backgroundColor: track.color + '20', borderColor: track.color + '44' }]}>
                <Text style={[tr.newBadgeText, { color: track.color }]}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={tr.artist} numberOfLines={1}>{track.artist} · {track.genre}</Text>
          {track.album ? <Text style={tr.album} numberOfLines={1}>📀 {track.album}</Text> : null}
          {/* Boost chips */}
          <View style={tr.boostRow}>
            <View style={[tr.boostChip, { backgroundColor: track.color + '18', borderColor: track.color + '44' }]}>
              <MaterialIcons name="bolt" size={9} color={track.color} />
              <Text style={[tr.boostText, { color: track.color }]}>{track.boost_multiplier}x</Text>
            </View>
            <View style={[tr.boostChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
              <MaterialIcons name="toll" size={9} color="#22C55E" />
              <Text style={[tr.boostText, { color: '#22C55E' }]}>{(track.btng_per_minute * 1000).toFixed(1)} mBTNG/min</Text>
            </View>
            <Text style={tr.duration}>{fmtDuration(track.duration_seconds)}</Text>
          </View>
        </View>

        {/* Right: selected indicator */}
        <View style={[tr.selectIndicator, isSelected && { backgroundColor: track.color + '20', borderColor: track.color + '88' }]}>
          {isSelected ? (
            <MaterialIcons name="radio-button-checked" size={18} color={track.color} />
          ) : (
            <MaterialIcons name="radio-button-unchecked" size={18} color={Colors.textMuted} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const tr = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  emojiWrap:     { width: 52, height: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  artist:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  album:         { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  boostRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 2 },
  boostChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  boostText:     { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  duration:      { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginLeft: 'auto' },
  newBadge:      { borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 },
  newBadgeText:  { fontSize: 7, fontWeight: FontWeight.heavy, includeFontPadding: false },
  selectIndicator: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
});

// ── Music Player (Now Playing bar) ────────────────────────────────────────────
function MusicPlayer({
  playing,
  track,
  onToggle,
  onNext,
  onPrev,
  onBrowse,
  volume,
  balance,
  muted,
  repeat,
  shuffle,
  onVolumeChange,
  onBalanceChange,
  onMuteToggle,
  onRepeatToggle,
  onShuffleToggle,
  elapsedSecs,
  eqBands,
  eqPreset,
  onEqBandChange,
  onEqPresetChange,
  sleepTimerRemaining,
  onSleepTimerPress,
  onCancelSleepTimer,
  durationSecs,
  onSeek,
}: {
  playing:           boolean;
  track:             MusicTrack;
  onToggle:          () => void;
  onNext:            () => void;
  onPrev:            () => void;
  onBrowse:          () => void;
  volume:            number;
  balance:           number;
  muted:             boolean;
  repeat:            boolean;
  shuffle:           boolean;
  onVolumeChange:    (v: number) => void;
  onBalanceChange:   (v: number) => void;
  onMuteToggle:      () => void;
  onRepeatToggle:    () => void;
  onShuffleToggle:   () => void;
  elapsedSecs?:        number;
  durationSecs?:       number;
  onSeek?:             (ms: number) => void;
  eqBands:             EqBands;
  eqPreset:            EqPresetName | null;
  onEqBandChange:      (key: keyof EqBands, value: number) => void;
  onEqPresetChange:    (name: EqPresetName) => void;
  sleepTimerRemaining: number;
  onSleepTimerPress:   () => void;
  onCancelSleepTimer:  () => void;
}) {
  return (
    <View
      style={[mp.card, { borderColor: (playing ? track.color : Colors.textMuted) + '55' }]}
      accessible
      accessibilityLabel={`Music Miner. Now playing: ${track.title} by ${track.artist}. ${playing ? 'Playing' : 'Paused'}. Boost: ${track.boost_multiplier}x`}
    >
      <View style={mp.header}>
        <View style={[mp.iconWrap, { backgroundColor: track.color + '18', borderColor: track.color + '33' }]}>
          <MaterialIcons name="music-note" size={18} color={track.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mp.cardTitle}>Music Miner</Text>
          <Text style={mp.cardSub}>Earn up to {track.boost_multiplier}x more BTNG while listening</Text>
        </View>
        <TouchableOpacity
          style={[mp.sleepBtn, sleepTimerRemaining > 0 && { backgroundColor: '#818CF818', borderColor: '#818CF855' }]}
          onPress={onSleepTimerPress}
          activeOpacity={0.8}
          accessible
          accessibilityLabel={sleepTimerRemaining > 0 ? `Sleep timer: pausing in ${fmtCountdown(sleepTimerRemaining)}` : 'Set sleep timer'}
          accessibilityRole="button"
        >
          <MaterialIcons name="bedtime" size={16} color={sleepTimerRemaining > 0 ? '#818CF8' : Colors.textMuted} />
          {sleepTimerRemaining > 0 && <View style={[mp.sleepActiveDot, { backgroundColor: '#818CF8' }]} />}
        </TouchableOpacity>

        {playing && (
          <View style={[mp.boostBadge, { backgroundColor: track.color + '22', borderColor: track.color + '55' }]}>
            <View style={[mp.boostDot, { backgroundColor: track.color }]} />
            <Text style={[mp.boostText, { color: track.color }]}>{track.boost_multiplier}x BOOST</Text>
          </View>
        )}
      </View>

      {/* Track card */}
      <View style={mp.trackCard}>
        <View style={[mp.trackIconWrap, { backgroundColor: track.color + '18', borderColor: track.color + '44' }]}>
          {playing ? (
            <StereoViz playing={true} color={track.color} volume={muted ? 0 : volume} balance={balance} barCount={4} />
          ) : (
            <Text style={{ fontSize: 26 }}>{track.emoji}</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={mp.trackTitle} numberOfLines={1}>{track.title}</Text>
          <Text style={mp.trackArtist}>{track.artist} · {track.genre}</Text>
          {track.album ? <Text style={mp.trackAlbum} numberOfLines={1}>📀 {track.album}</Text> : null}
          <Text style={[mp.trackDuration, { color: track.color }]}>
            {playing && elapsedSecs !== undefined && elapsedSecs > 0
              ? `${fmtDuration(elapsedSecs)} / ${fmtDuration(track.duration_seconds)}`
              : fmtDuration(track.duration_seconds)
            }
            {' · '}{(track.btng_per_minute * 1000).toFixed(1)} mBTNG/min
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={mp.controls}>
        {/* Shuffle */}
        <TouchableOpacity
          style={[mp.modeBtn, shuffle && { backgroundColor: track.color + '22', borderColor: track.color + '88' }]}
          onPress={onShuffleToggle}
          activeOpacity={0.8}
          accessible
          accessibilityLabel={shuffle ? 'Shuffle on — tap to disable' : 'Shuffle off — tap to enable'}
          accessibilityRole="button"
          accessibilityState={{ checked: shuffle }}
        >
          <MaterialIcons name="shuffle" size={17} color={shuffle ? track.color : Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={mp.ctrlBtn}
          onPress={onPrev}
          activeOpacity={0.75}
          accessible
          accessibilityLabel="Previous track"
          accessibilityRole="button"
        >
          <MaterialIcons name="skip-previous" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[mp.playBtn, playing && { backgroundColor: track.color, shadowColor: track.color }]}
          onPress={onToggle}
          activeOpacity={0.85}
          accessible
          accessibilityLabel={playing ? 'Pause music' : 'Play music'}
          accessibilityRole="button"
        >
          <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={28} color={Colors.bg} />
        </TouchableOpacity>

        <TouchableOpacity
          style={mp.ctrlBtn}
          onPress={onNext}
          activeOpacity={0.75}
          accessible
          accessibilityLabel="Next track"
          accessibilityRole="button"
        >
          <MaterialIcons name="skip-next" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>

        {/* Repeat */}
        <TouchableOpacity
          style={[mp.modeBtn, repeat && { backgroundColor: track.color + '22', borderColor: track.color + '88' }]}
          onPress={onRepeatToggle}
          activeOpacity={0.8}
          accessible
          accessibilityLabel={repeat ? 'Repeat on — tap to disable' : 'Repeat off — tap to enable'}
          accessibilityRole="button"
          accessibilityState={{ checked: repeat }}
        >
          <MaterialIcons name="repeat" size={17} color={repeat ? track.color : Colors.textMuted} />
          {repeat && (
            <View style={[mp.modePip, { backgroundColor: track.color }]} />
          )}
        </TouchableOpacity>
      </View>

      {sleepTimerRemaining > 0 && (
        <View style={[mp.sleepCountdownChip, sleepTimerRemaining <= 10 && { borderColor: Colors.error + '66', backgroundColor: Colors.error + '10' }]}>
          <MaterialIcons name="bedtime" size={12} color={sleepTimerRemaining <= 10 ? Colors.error : '#818CF8'} />
          <Text style={[mp.sleepCountdownText, sleepTimerRemaining <= 10 && { color: Colors.error }]}>
            Sleep in {fmtCountdown(sleepTimerRemaining)}
          </Text>
          <TouchableOpacity onPress={onCancelSleepTimer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessible accessibilityLabel="Dismiss sleep timer" accessibilityRole="button">
            <MaterialIcons name="close" size={12} color={sleepTimerRemaining <= 10 ? Colors.error : '#818CF8'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Seek Bar */}
      {onSeek ? (
        <View style={[mp.seekWrap, { borderColor: track.color + '22' }]}>
          <SeekBar
            elapsed={elapsedSecs ?? 0}
            duration={durationSecs ?? track.duration_seconds}
            color={track.color}
            onSeek={onSeek}
          />
        </View>
      ) : null}

      {/* Stereo Controller + EQ */}
      <StereoController
        playing={playing}
        color={track.color}
        volume={volume}
        balance={balance}
        muted={muted}
        onVolumeChange={onVolumeChange}
        onBalanceChange={onBalanceChange}
        onMuteToggle={onMuteToggle}
        eqBands={eqBands}
        eqPreset={eqPreset}
        onEqBandChange={onEqBandChange}
        onEqPresetChange={onEqPresetChange}
      />

      {/* Browse Library button */}
      <TouchableOpacity
        style={[mp.browseBtn, { borderColor: track.color + '44', backgroundColor: track.color + '0C' }]}
        onPress={onBrowse}
        activeOpacity={0.85}
        accessible
        accessibilityLabel={`Browse all ${MUSIC_LIBRARY.length} tracks in the music library`}
        accessibilityRole="button"
      >
        <MaterialIcons name="library-music" size={15} color={track.color} />
        <Text style={[mp.browseBtnText, { color: track.color }]}>
          Browse Library · {MUSIC_LIBRARY.length} Tracks
        </Text>
        <MaterialIcons name="chevron-right" size={16} color={track.color} />
      </TouchableOpacity>

      <View style={mp.note}>
        <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
        <Text style={mp.noteText}>
          Music boosts mining {track.boost_multiplier}x · Select tracks from the library for different boost rates · Longer sessions = higher rewards
        </Text>
      </View>
    </View>
  );
}

const mp = StyleSheet.create({
  card:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, gap: Spacing.md, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 5 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:      { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardSub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  boostBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  boostDot:      { width: 6, height: 6, borderRadius: 3 },
  boostText:     { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  trackCard:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  trackIconWrap: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  trackTitle:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  trackArtist:   { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  trackAlbum:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  trackDuration: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  controls:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  ctrlBtn:       { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  modeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, position: 'relative' },
  modePip:       { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2 },
  playBtn:       { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.textMuted, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  seekWrap:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1 },
  browseBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, paddingVertical: 11, paddingHorizontal: Spacing.md, borderWidth: 1 },
  browseBtnText: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  sleepBtn:           { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, position: 'relative' },
  sleepActiveDot:     { position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: Colors.bgCard },
  sleepCountdownChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#818CF812', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: '#818CF844' },
  sleepCountdownText: { flex: 1, fontSize: 11, fontWeight: FontWeight.bold, color: '#818CF8', includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  note:          { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  noteText:      { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
});

// ── Playlist Queue Panel ────────────────────────────────────────────────────────
function PlaylistQueue({
  currentIndex,
  shuffle,
  tracks,
  playingUid,
  color,
  onSelectTrack,
}: {
  currentIndex:  number;
  shuffle:       boolean;
  tracks:        MusicTrack[];
  playingUid:    string;
  color:         string;
  onSelectTrack: (track: MusicTrack, index: number) => void;
}) {
  const [expanded,    setExpanded]    = useState(true);
  const expandAnim   = useRef(new Animated.Value(1)).current;
  const dragY        = useRef(new Animated.Value(0)).current;
  const lastDragY    = useRef(0);
  const COLLAPSED_H  = 52;
  const EXPANDED_H   = 340;

  // Build the queue: next 5 tracks after current
  const queue: { track: MusicTrack; index: number }[] = [];
  if (shuffle) {
    // pick 5 random non-current tracks
    const pool = tracks.map((t, i) => ({ track: t, index: i })).filter(x => x.index !== currentIndex);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    queue.push(...pool.slice(0, 5));
  } else {
    for (let k = 1; k <= 5; k++) {
      const idx = (currentIndex + k) % tracks.length;
      queue.push({ track: tracks[idx], index: idx });
    }
  }

  const toggleExpand = (next?: boolean) => {
    const isNext = next !== undefined ? next : !expanded;
    setExpanded(isNext);
    Animated.timing(expandAnim, {
      toValue:  isNext ? 1 : 0,
      duration: 260,
      easing:   Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  // Drag handle pan responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        lastDragY.current = 0;
      },
      onPanResponderMove: (_, gs) => {
        dragY.setValue(Math.max(-20, Math.min(20, gs.dy)));
      },
      onPanResponderRelease: (_, gs) => {
        dragY.setValue(0);
        // Swipe down → collapse, swipe up → expand
        if (gs.dy > 30 && expanded)  toggleExpand(false);
        if (gs.dy < -30 && !expanded) toggleExpand(true);
      },
    })
  ).current;

  const panelH = expandAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [COLLAPSED_H, EXPANDED_H],
  });

  const nowPlaying = tracks[currentIndex];

  return (
    <Animated.View
      style={[
        pq.panel,
        { borderColor: color + '44', height: panelH, transform: [{ translateY: dragY }] },
      ]}
    >
      {/* Drag handle */}
      <View
        style={pq.dragArea}
        {...panResponder.panHandlers}
        accessible
        accessibilityLabel={expanded ? 'Collapse playlist queue' : 'Expand playlist queue'}
        accessibilityRole="button"
      >
        <View style={pq.dragHandle} />
        <View style={pq.queueHeader}>
          <View style={[pq.queueIconWrap, { backgroundColor: color + '18', borderColor: color + '33' }]}>
            <MaterialIcons name="queue-music" size={14} color={color} />
          </View>
          <Text style={pq.queueTitle}>Up Next</Text>
          <View style={[pq.shuffleChip, shuffle && { backgroundColor: color + '18', borderColor: color + '55' }]}>
            <MaterialIcons name={shuffle ? 'shuffle' : 'list'} size={11} color={shuffle ? color : Colors.textMuted} />
            <Text style={[pq.shuffleChipText, { color: shuffle ? color : Colors.textMuted }]}>
              {shuffle ? 'Shuffle' : 'In Order'}
            </Text>
          </View>
          <View style={[pq.countChip, { backgroundColor: color + '15', borderColor: color + '33' }]}>
            <Text style={[pq.countText, { color }]}>{queue.length} tracks</Text>
          </View>
          <TouchableOpacity
            style={pq.collapseBtn}
            onPress={() => toggleExpand()}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons
              name={expanded ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
              size={20}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Now-playing mini row */}
      <View style={[pq.nowRow, { backgroundColor: color + '0C', borderColor: color + '33' }]}>
        <AudioViz playing={playingUid === nowPlaying.track_uid} color={color} barCount={4} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[pq.nowTitle, { color }]} numberOfLines={1}>
            {nowPlaying.emoji} {nowPlaying.title}
          </Text>
          <Text style={pq.nowSub}>{nowPlaying.artist} · {nowPlaying.genre}</Text>
        </View>
        <View style={[pq.nowBadge, { backgroundColor: color + '20', borderColor: color + '44' }]}>
          <Text style={[pq.nowBadgeText, { color }]}>NOW</Text>
        </View>
      </View>

      {/* Queue list */}
      <Animated.View style={{ flex: 1, opacity: expandAnim, overflow: 'hidden' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={pq.listContent}
          scrollEnabled={expanded}
        >
          {queue.map(({ track, index }, pos) => {
            const isNow = track.track_uid === playingUid;
            return (
              <TouchableOpacity
                key={`q${index}`}
                style={[
                  pq.qRow,
                  isNow && { backgroundColor: track.color + '10', borderColor: track.color + '66' },
                ]}
                onPress={() => onSelectTrack(track, index)}
                activeOpacity={0.8}
                accessible
                accessibilityLabel={`Queue position ${pos + 1}: ${track.title} by ${track.artist}. Tap to play.`}
                accessibilityRole="button"
                accessibilityState={{ selected: isNow }}
              >
                {/* Position number */}
                <View style={[
                  pq.posNum,
                  isNow && { backgroundColor: track.color + '22', borderColor: track.color + '55' },
                ]}>
                  {isNow ? (
                    <AudioViz playing={true} color={track.color} barCount={3} />
                  ) : (
                    <Text style={[pq.posText, { color: isNow ? track.color : Colors.textMuted }]}>
                      {pos + 1}
                    </Text>
                  )}
                </View>

                {/* Emoji */}
                <View style={[pq.trackEmoji, { backgroundColor: track.color + '15', borderColor: track.color + '33' }]}>
                  <Text style={{ fontSize: 18 }}>{track.emoji}</Text>
                </View>

                {/* Track info */}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={[pq.qTitle, { color: isNow ? track.color : Colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {track.title}
                  </Text>
                  <Text style={pq.qArtist} numberOfLines={1}>
                    {track.artist} · {track.genre}
                  </Text>
                </View>

                {/* Boost chip + duration */}
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <View style={[pq.boostChip, { backgroundColor: track.color + '18', borderColor: track.color + '44' }]}>
                    <MaterialIcons name="bolt" size={9} color={track.color} />
                    <Text style={[pq.boostText, { color: track.color }]}>{track.boost_multiplier}×</Text>
                  </View>
                  <Text style={pq.qDuration}>{fmtDuration(track.duration_seconds)}</Text>
                </View>

                {/* Play arrow */}
                <MaterialIcons
                  name={isNow ? 'graphic-eq' : 'play-circle-outline'}
                  size={18}
                  color={isNow ? track.color : Colors.textMuted}
                />
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 8 }} />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const pq = StyleSheet.create({
  panel:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  dragArea:     { paddingTop: 8, paddingBottom: 4, paddingHorizontal: Spacing.md, cursor: 'grab' as any },
  dragHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 8 },
  queueHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  queueIconWrap:{ width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  queueTitle:   { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  shuffleChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
  shuffleChipText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  countChip:    { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  countText:    { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  collapseBtn:  { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  nowRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: 8, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 8, borderWidth: 1 },
  nowTitle:     { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  nowSub:       { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  nowBadge:     { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  nowBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  listContent:  { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  qRow:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, minHeight: 52 },
  posNum:       { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  posText:      { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  trackEmoji:   { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  qTitle:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  qArtist:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  boostChip:    { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  boostText:    { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  qDuration:    { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ── Library Browser Panel ─────────────────────────────────────────────────────
function LibraryPanel({
  visible,
  selectedUid,
  playingUid,
  onSelect,
  onClose,
  customTracks = [],
  onAddTrack,
  cloudSyncing = false,
  defaultShowUpload = false,
}: {
  visible:            boolean;
  selectedUid:        UID;
  playingUid:         UID;
  onSelect:           (track: MusicTrack) => void;
  onClose:            () => void;
  customTracks?:      MusicTrack[];
  onAddTrack?:        (track: MusicTrack) => void;
  cloudSyncing?:      boolean;
  defaultShowUpload?: boolean;
}) {
  const [filter, setFilter] = useState('All');
  const slideAnim = useRef(new Animated.Value(300)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;

  // ── Upload form state ───────────────────────────────────────────────────────
  const [showUpload,    setShowUpload]    = useState(defaultShowUpload);
  const didAutoOpen = useRef(false);
  const [upTitle,       setUpTitle]       = useState('');
  const [upArtist,      setUpArtist]      = useState('');
  const [upGenre,       setUpGenre]       = useState('');
  const [upFile,        setUpFile]        = useState<string | null>(null);
  const [upFileName,    setUpFileName]    = useState<string | null>(null);
  const [upLoading,     setUpLoading]     = useState(false);
  const [upProgress,    setUpProgress]    = useState<number | null>(null);
  const [upError,       setUpError]       = useState<string | null>(null);
  const upFormAnim = useRef(new Animated.Value(0)).current;

  const toggleUploadForm = () => {
    const next = !showUpload;
    setShowUpload(next);
    setUpError(null);
    Animated.timing(upFormAnim, {
      toValue:  next ? 1 : 0,
      duration: 280,
      easing:   Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const handlePickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/*', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUpFile(asset.uri);
      setUpFileName(asset.name ?? 'audio file');
      // Pre-fill title from filename if empty
      if (!upTitle.trim()) {
        const base = (asset.name ?? '').replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        if (base) setUpTitle(base);
      }
    } catch (err: any) {
      setUpError('Could not open file picker: ' + (err?.message ?? 'unknown'));
    }
  };

  // Lightweight connectivity probe — mirrors OfflineBanner's logic
  const probeLive = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://clients3.google.com/generate_204', {
        method: 'HEAD', signal: controller.signal, cache: 'no-store',
      });
      clearTimeout(tid);
      return res.status === 204 || res.ok;
    } catch {
      try {
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 3000);
        await fetch('https://www.gstatic.com/generate_204', {
          method: 'HEAD', signal: c2.signal, cache: 'no-store',
        });
        clearTimeout(t2);
        return true;
      } catch {
        return false;
      }
    }
  };

  const handleUploadTrack = async () => {
    if (!upTitle.trim())  { setUpError('Track title is required'); return; }
    if (!upArtist.trim()) { setUpError('Artist name is required');  return; }
    if (!upFile)          { setUpError('Please select an audio file first'); return; }

    // ── Network probe before upload ─────────────────────────────────────────
    const isLive = await probeLive();
    if (!isLive) {
      setUpError('No internet connection — please check your network and try again.');
      return;
    }

    setUpLoading(true);
    setUpError(null);
    setUpProgress(0);

    // Animate progress 0 → 85% while the upload is in-flight
    let progressValue = 0;
    const progressInterval = setInterval(() => {
      progressValue = Math.min(progressValue + Math.random() * 7 + 2, 85);
      setUpProgress(Math.round(progressValue));
    }, 350);

    try {
      const supabase = getSupabaseClient();

      // Read file as base64 (required for file:// URIs on mobile)
      const base64 = await FileSystem.readAsStringAsync(upFile, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Decode base64 → Uint8Array
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Resolve content-type from extension
      const ext = (upFileName ?? 'track.mp3').split('.').pop()?.toLowerCase() ?? 'mp3';
      const contentTypeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        mp4: 'audio/mp4',
        m4a: 'audio/x-m4a',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        aac: 'audio/aac',
      };
      const contentType = contentTypeMap[ext] ?? 'audio/mpeg';

      // Upload to Supabase Storage → mining-audio bucket
      const filePath = `tracks/${generateUID('UPLOAD')}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('mining-audio')
        .upload(filePath, bytes.buffer, { contentType, upsert: false });

      clearInterval(progressInterval);

      if (uploadError) throw new Error(uploadError.message);

      setUpProgress(100);

      // Resolve public URL
      const { data: { publicUrl } } = supabase.storage
        .from('mining-audio')
        .getPublicUrl(filePath);

      const newTrack: MusicTrack = {
        track_uid:        generateUID('TRACK'),
        file_url:         publicUrl,
        title:            upTitle.trim(),
        artist:           upArtist.trim(),
        genre:            upGenre.trim() || 'Custom',
        album:            'My Uploads',
        duration_seconds: 0,
        boost_multiplier: 2.4,
        btng_per_minute:  0.0018,
        emoji:            '🎤',
        color:            '#A78BFA',
        isNew:            true,
      };
      onAddTrack?.(newTrack);

      // Hold at 100% briefly so the user sees it complete
      await new Promise(r => setTimeout(r, 700));

      // Reset form
      setUpTitle('');
      setUpArtist('');
      setUpGenre('');
      setUpFile(null);
      setUpFileName(null);
      setUpProgress(null);
      setShowUpload(false);
      Animated.timing(upFormAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    } catch (err: any) {
      clearInterval(progressInterval);
      setUpProgress(null);
      setUpError('Upload failed: ' + (err?.message ?? 'unknown error'));
    } finally {
      setUpLoading(false);
    }
  };

  const allLibrary    = [...customTracks, ...getOneColumnMusicLibrary()];
  const allGenres     = ['All', ...Array.from(new Set(allLibrary.map(t => t.genre ?? 'Other')))];
  const filtered      = filter === 'All'
    ? allLibrary
    : allLibrary.filter(t => (t.genre ?? 'Other') === filter);
  const totalCount    = allLibrary.length;

  // Auto-open upload form when defaultShowUpload is set
  useEffect(() => {
    if (visible && defaultShowUpload && !didAutoOpen.current) {
      didAutoOpen.current = true;
      setShowUpload(true);
      Animated.timing(upFormAnim, {
        toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false,
      }).start();
    }
  }, [visible, defaultShowUpload]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0,   duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacAnim,  { toValue: 1,   duration: 320, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 300, duration: 240, useNativeDriver: true }),
        Animated.timing(opacAnim,  { toValue: 0,   duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[lb.overlay, { opacity: opacAnim, transform: [{ translateY: slideAnim }] }]}>
      {/* Header */}
      <View style={lb.header}>
        <View style={lb.headerLeft}>
          <MaterialIcons name="library-music" size={18} color={Colors.primary} />
          <Text style={lb.headerTitle}>Music Library</Text>
          <View style={lb.countChip}>
            <Text style={lb.countText}>{totalCount} tracks</Text>
          </View>
          {customTracks.length > 0 && (
            <View style={[lb.countChip, { backgroundColor: '#A78BFA20', borderColor: '#A78BFA44' }]}>
              <Text style={[lb.countText, { color: '#A78BFA' }]}>{customTracks.length} uploaded</Text>
            </View>
          )}
          {customTracks.length > 0 && (
            <View style={[lb.countChip, { backgroundColor: '#22C55E18', borderColor: '#22C55E44', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
              <MaterialIcons name="save" size={9} color="#22C55E" />
              <Text style={[lb.countText, { color: '#22C55E' }]}>Saved locally</Text>
            </View>
          )}
          {cloudSyncing ? (
            <View style={[lb.countChip, { backgroundColor: '#60A5FA18', borderColor: '#60A5FA44', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
              <ActivityIndicator size="small" color="#60A5FA" style={{ width: 9, height: 9 }} />
              <Text style={[lb.countText, { color: '#60A5FA' }]}>Syncing…</Text>
            </View>
          ) : customTracks.length > 0 ? (
            <View style={[lb.countChip, { backgroundColor: '#60A5FA18', borderColor: '#60A5FA44', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
              <MaterialIcons name="cloud-done" size={9} color="#60A5FA" />
              <Text style={[lb.countText, { color: '#60A5FA' }]}>Cloud synced</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Upload button */}
          <TouchableOpacity
            style={[lb.uploadBtn, showUpload && { backgroundColor: '#A78BFA20', borderColor: '#A78BFA88' }]}
            onPress={toggleUploadForm}
            activeOpacity={0.8}
            accessible
            accessibilityLabel={showUpload ? 'Close upload form' : 'Upload your own audio track'}
            accessibilityRole="button"
          >
            <MaterialIcons name={showUpload ? 'close' : 'upload'} size={16} color={showUpload ? '#A78BFA' : Colors.textMuted} />
            {!showUpload && (
              <Text style={lb.uploadBtnText}>Upload</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={lb.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessible
            accessibilityLabel="Close music library"
            accessibilityRole="button"
          >
            <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Upload Form (animated) ─────────────────────────────────────────── */}
      <Animated.View
        style={[
          lb.uploadForm,
          {
            maxHeight: upFormAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }),
            opacity:   upFormAnim,
            overflow:  'hidden',
          },
        ]}
      >
        <View style={lb.uploadFormInner}>
          {/* Form header */}
          <View style={lb.uploadFormHeader}>
            <View style={lb.uploadFormIconWrap}>
              <MaterialIcons name="music-note" size={14} color="#A78BFA" />
            </View>
            <Text style={lb.uploadFormTitle}>Upload Your Track</Text>
            <View style={[lb.countChip, { backgroundColor: '#A78BFA18', borderColor: '#A78BFA44' }]}>
              <Text style={[lb.countText, { color: '#A78BFA' }]}>2.4× boost</Text>
            </View>
          </View>

          {/* File picker */}
          <TouchableOpacity
            style={[lb.filePicker, upFile && { borderColor: '#A78BFA88', backgroundColor: '#A78BFA0C' }]}
            onPress={handlePickAudio}
            activeOpacity={0.85}
            accessible
            accessibilityLabel={upFile ? `Selected: ${upFileName}. Tap to change` : 'Pick an audio file (mp3, mp4, m4a)'}
            accessibilityRole="button"
          >
            <MaterialIcons
              name={upFile ? 'audio-file' : 'attach-file'}
              size={18}
              color={upFile ? '#A78BFA' : Colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={[lb.filePickerText, { color: upFile ? '#A78BFA' : Colors.textMuted }]} numberOfLines={1}>
                {upFileName ?? 'Tap to pick audio file (mp3, mp4, m4a)'}
              </Text>
              {upFile ? (
                <Text style={lb.filePickerSub}>✓ File selected — tap to change</Text>
              ) : null}
            </View>
            <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Form fields */}
          <View style={lb.formFields}>
            <View style={lb.formField}>
              <Text style={lb.formLabel}>Track Title *</Text>
              <TextInput
                style={lb.formInput}
                value={upTitle}
                onChangeText={setUpTitle}
                placeholder="e.g. Ghana Gold Beat"
                placeholderTextColor={Colors.textMuted}
                maxLength={60}
                accessible
                accessibilityLabel="Track title"
              />
            </View>
            <View style={lb.formField}>
              <Text style={lb.formLabel}>Artist *</Text>
              <TextInput
                style={lb.formInput}
                value={upArtist}
                onChangeText={setUpArtist}
                placeholder="e.g. BTNG Studio"
                placeholderTextColor={Colors.textMuted}
                maxLength={40}
                accessible
                accessibilityLabel="Artist name"
              />
            </View>
            <View style={lb.formField}>
              <Text style={lb.formLabel}>Genre (optional)</Text>
              <TextInput
                style={lb.formInput}
                value={upGenre}
                onChangeText={setUpGenre}
                placeholder="e.g. Afrobeats, Lo-Fi, Custom…"
                placeholderTextColor={Colors.textMuted}
                maxLength={30}
                accessible
                accessibilityLabel="Genre"
              />
            </View>
          </View>

          {/* Upload Progress Bar */}
          {upProgress !== null ? (
            <View style={lb.progressWrap}>
              <View style={lb.progressHeader}>
                <MaterialIcons
                  name={upProgress < 100 ? 'cloud-upload' : 'check-circle'}
                  size={13}
                  color={upProgress < 100 ? '#A78BFA' : '#22C55E'}
                />
                <Text style={[lb.progressLabel, { color: upProgress < 100 ? '#A78BFA' : '#22C55E' }]}>
                  {upProgress < 100 ? `Uploading… ${upProgress}%` : 'Upload complete ✓'}
                </Text>
                <Text style={lb.progressPct}>{upProgress}%</Text>
              </View>
              <View style={lb.progressTrack}>
                <Animated.View
                  style={[
                    lb.progressFill,
                    {
                      width: `${upProgress}%` as any,
                      backgroundColor: upProgress < 100 ? '#A78BFA' : '#22C55E',
                    },
                  ]}
                />
              </View>
              <Text style={lb.progressSub}>
                {upProgress < 100
                  ? 'Uploading to BTNG mining-audio storage…'
                  : 'Track saved to Supabase Storage · Adding to library…'}
              </Text>
            </View>
          ) : null}

          {/* Error */}
          {upError ? (
            <View style={lb.upErrStrip}>
              <MaterialIcons name="error-outline" size={12} color="#EF4444" />
              <Text style={lb.upErrText}>{upError}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <TouchableOpacity
            style={[lb.uploadSubmitBtn, (upLoading || !upFile) && { opacity: 0.5 }]}
            onPress={handleUploadTrack}
            disabled={upLoading || !upFile || upProgress !== null}
            activeOpacity={0.85}
            accessible
            accessibilityLabel="Add track to music library"
            accessibilityRole="button"
          >
            {upLoading ? (
              <ActivityIndicator size="small" color={Colors.bg} />
            ) : (
              <MaterialIcons name="library-add" size={16} color={Colors.bg} />
            )}
            <Text style={lb.uploadSubmitText}>
              {upLoading ? 'Adding Track…' : 'Add to Library'}
            </Text>
          </TouchableOpacity>

          <Text style={lb.uploadNote}>
            Uploaded tracks get 2.4× boost · stored in Supabase Storage · tagged NEW
          </Text>
        </View>
      </Animated.View>

      {/* Genre filter chips */}
      <View style={lb.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lb.filterContent}>
          {allGenres.map(g => (
            <TouchableOpacity
              key={g}
              style={[lb.filterChip, g === filter && lb.filterChipActive]}
              onPress={() => setFilter(g)}
              activeOpacity={0.8}
              accessible
              accessibilityLabel={`Filter by ${g}`}
              accessibilityRole="button"
              accessibilityState={{ selected: g === filter }}
            >
              <Text style={[lb.filterText, g === filter && lb.filterTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sorted info */}
      <View style={lb.sortRow}>
        <MaterialIcons name="sort" size={11} color={Colors.textMuted} />
        <Text style={lb.sortText}>Showing {filtered.length} track{filtered.length !== 1 ? 's' : ''} · sorted by boost multiplier</Text>
        {customTracks.length > 0 && (
          <View style={[lb.countChip, { backgroundColor: '#A78BFA18', borderColor: '#A78BFA33', marginLeft: 'auto' }]}>
            <MaterialIcons name="upload" size={9} color="#A78BFA" />
            <Text style={[lb.countText, { color: '#A78BFA' }]}>{customTracks.length} yours</Text>
          </View>
        )}
      </View>

      {/* One-column library — sorted by boost descending */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={lb.listContent}>
        {[...filtered].sort((a, b) => b.boost_multiplier - a.boost_multiplier).map(track => (
          <TrackRow
            key={track.track_uid}
            track={track}
            isSelected={track.track_uid === selectedUid}
            isPlaying={track.track_uid === playingUid}
            onSelect={() => { onSelect(track); onClose(); }}
          />
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </Animated.View>
  );
}

const lb = StyleSheet.create({
  overlay:          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Colors.bg, zIndex: 99 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, flexWrap: 'wrap' },
  headerTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  countChip:        { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  countText:        { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  closeBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  uploadBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, borderRadius: 18, paddingHorizontal: 12, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  uploadBtnText:    { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  uploadForm:       { borderBottomWidth: 1, borderBottomColor: Colors.border },
  uploadFormInner:  { padding: Spacing.xl, gap: Spacing.md, backgroundColor: '#A78BFA06' },
  uploadFormHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  uploadFormIconWrap:{ width: 30, height: 30, borderRadius: 9, backgroundColor: '#A78BFA18', borderWidth: 1, borderColor: '#A78BFA44', alignItems: 'center', justifyContent: 'center' },
  uploadFormTitle:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#A78BFA', includeFontPadding: false },
  filePicker:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed' },
  filePickerText:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  filePickerSub:    { fontSize: 9, color: '#A78BFA', includeFontPadding: false, marginTop: 2 },
  formFields:       { gap: Spacing.sm },
  formField:        { gap: 5 },
  formLabel:        { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false, letterSpacing: 0.3 },
  formInput:        { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  upErrStrip:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#EF444410', borderRadius: Radius.md, padding: 8, borderWidth: 1, borderColor: '#EF444433' },
  upErrText:        { flex: 1, fontSize: 10, color: '#FCA5A5', lineHeight: 14, includeFontPadding: false },
  uploadSubmitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#A78BFA', borderRadius: Radius.lg, paddingVertical: 13, shadowColor: '#A78BFA', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  uploadSubmitText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  uploadNote:       { fontSize: 9, color: Colors.textMuted, textAlign: 'center', lineHeight: 13, includeFontPadding: false },
  progressWrap:     { backgroundColor: '#A78BFA0A', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#A78BFA33', gap: 7 },
  progressHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressLabel:    { flex: 1, fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false },
  progressPct:      { fontSize: 12, fontWeight: FontWeight.heavy, color: '#A78BFA', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  progressTrack:    { height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#A78BFA22' },
  progressFill:     { height: 6, borderRadius: 3 },
  progressSub:      { fontSize: 9, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false },
  filterWrap:       { borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterContent:    { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, gap: Spacing.sm },
  filterChip:       { paddingHorizontal: 13, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, height: 34, justifyContent: 'center' },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium, includeFontPadding: false },
  filterTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  sortRow:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.xl, paddingVertical: 7, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sortText:         { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  listContent:      { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
});

// ── Session Bar Chart ────────────────────────────────────────────────────────
function SessionBarChart({ sessions }: { sessions: SessionRecord[] }) {
  // Always render 7 slots (pad with empty if fewer)
  const SLOTS = 7;
  const slots: (SessionRecord | null)[] = [
    ...Array.from({ length: Math.max(0, SLOTS - sessions.length) }, () => null),
    ...sessions.slice(-SLOTS),
  ];

  const maxBtng = Math.max(...slots.map(s => s?.btng ?? 0), 0.0001);

  // 7 fixed Animated.Values for bar heights
  const barAnims = useRef(
    Array.from({ length: SLOTS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const anims = slots.map((slot, i) =>
      Animated.timing(barAnims[i], {
        toValue:  slot ? (slot.btng / maxBtng) : 0,
        duration: 500 + i * 60,
        easing:   Easing.out(Easing.cubic),
        useNativeDriver: false,
      })
    );
    Animated.parallel(anims).start();
  }, [sessions.length, maxBtng]);

  const MAX_BAR_H = 72;

  const dateLabel = (s: SessionRecord) => {
    const parts = s.date.split(' ');
    return parts.length === 2 ? `${parts[0]}\n${parts[1]}` : s.date;
  };

  return (
    <View style={sbc.card}>
      {/* Header */}
      <View style={sbc.header}>
        <View style={sbc.iconWrap}>
          <MaterialIcons name="bar-chart" size={15} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sbc.title}>Session Earnings</Text>
          <Text style={sbc.subtitle}>Last {sessions.length > 0 ? Math.min(sessions.length, SLOTS) : 0} session{sessions.length !== 1 ? 's' : ''} · BTNG mined per session</Text>
        </View>
        {sessions.length > 0 && (
          <View style={[sbc.totalChip, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
            <MaterialIcons name="toll" size={10} color={Colors.primary} />
            <Text style={[sbc.totalText, { color: Colors.primary }]}>
              {sessions.reduce((a, s) => a + s.btng, 0).toFixed(4)} total
            </Text>
          </View>
        )}
      </View>

      {sessions.length === 0 ? (
        <View style={sbc.empty}>
          <MaterialIcons name="hourglass-empty" size={28} color={Colors.textMuted} />
          <Text style={sbc.emptyText}>Start and stop mining to record sessions</Text>
        </View>
      ) : (
        <View style={sbc.chartArea}>
          {/* Y-axis max label */}
          <Text style={sbc.yMax}>{maxBtng.toFixed(4)}</Text>
          {/* Bars row */}
          <View style={sbc.barsRow}>
            {slots.map((slot, i) => (
              <View key={i} style={sbc.barCol}>
                {/* BTNG label above bar */}
                <Text style={[sbc.barValueText, { opacity: slot ? 1 : 0, color: Colors.primary }]}>
                  {slot ? slot.btng.toFixed(3) : ''}
                </Text>
                {/* Bar container */}
                <View style={[sbc.barTrack, { height: MAX_BAR_H }]}>
                  <Animated.View
                    style={[
                      sbc.bar,
                      {
                        height: barAnims[i].interpolate({
                          inputRange:  [0, 1],
                          outputRange: [0, MAX_BAR_H],
                        }),
                        backgroundColor: slot
                          ? barAnims[i].interpolate({
                              inputRange:  [0, 0.5, 1],
                              outputRange: [Colors.primary + 'AA', Colors.primary + 'CC', Colors.primary],
                            })
                          : Colors.bgElevated,
                      },
                    ]}
                  />
                </View>
                {/* Date label */}
                <Text style={[sbc.barDateText, { color: slot ? Colors.textSecondary : Colors.border }]} numberOfLines={2}>
                  {slot ? dateLabel(slot) : '--'}
                </Text>
              </View>
            ))}
          </View>
          {/* Y=0 baseline */}
          <View style={sbc.baseline} />
          {/* Y-axis min */}
          <Text style={sbc.yMin}>0</Text>
        </View>
      )}

      {/* Recent sessions list */}
      {sessions.length > 0 && (
        <View style={sbc.sessionList}>
          {[...sessions].reverse().slice(0, 3).map((s, i) => (
            <View key={s.ts} style={[sbc.sessionRow, i === 0 && { borderColor: Colors.primary + '44', backgroundColor: Colors.primaryGlow }]}>
              <View style={[sbc.sessionDot, { backgroundColor: i === 0 ? Colors.primary : Colors.textMuted }]} />
              <Text style={sbc.sessionDate}>{s.date} {s.time}</Text>
              <View style={{ flex: 1 }} />
              <Text style={[sbc.sessionBtng, { color: i === 0 ? Colors.primary : Colors.textSecondary }]}>
                +{s.btng.toFixed(6)} BTNG
              </Text>
              <Text style={sbc.sessionMin}>{s.minutes.toFixed(1)}m</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const sbc = StyleSheet.create({
  card:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:      { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  totalChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  totalText:     { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  empty:         { alignItems: 'center', gap: 8, paddingVertical: Spacing.xl },
  emptyText:     { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  chartArea:     { position: 'relative', paddingLeft: 44, paddingBottom: 32 },
  yMax:          { position: 'absolute', left: 0, top: 0, fontSize: 8, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, width: 40, textAlign: 'right' },
  yMin:          { position: 'absolute', left: 0, bottom: 32, fontSize: 8, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, width: 40, textAlign: 'right' },
  barsRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  barCol:        { flex: 1, alignItems: 'center', gap: 3 },
  barTrack:      { width: '100%', justifyContent: 'flex-end', backgroundColor: Colors.bgElevated, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  bar:           { width: '100%', borderRadius: 4 },
  barValueText:  { fontSize: 7, fontWeight: FontWeight.heavy, textAlign: 'center', includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  barDateText:   { fontSize: 7, textAlign: 'center', includeFontPadding: false, lineHeight: 9, marginTop: 2 },
  baseline:      { position: 'absolute', left: 44, right: 0, bottom: 32, height: 1.5, backgroundColor: Colors.border },
  sessionList:   { gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  sessionRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border },
  sessionDot:    { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  sessionDate:   { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sessionBtng:   { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  sessionMin:    { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginLeft: 4 },
});

// ── Sleep Timer Sheet ───────────────────────────────────────────────────────────
const SLEEP_PRESETS = [
  { label: '15 min', secs: 15 * 60 },
  { label: '30 min', secs: 30 * 60 },
  { label: '1 hour', secs: 60 * 60 },
  { label: '2 hrs',  secs: 120 * 60 },
] as const;

function fmtCountdown(secs: number): string {
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return m > 0 ? `${h}h ${m}m ${s}s` : `${h}h ${s}s`;
  }
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function SleepTimerSheet({
  visible,
  activeRemaining,
  onSelect,
  onCancel,
  onClose,
}: {
  visible:          boolean;
  activeRemaining:  number;
  onSelect:         (secs: number) => void;
  onCancel:         () => void;
  onClose:          () => void;
}) {
  const slideAnim    = useRef(new Animated.Value(320)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim,    { toValue: 0,   duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1,   duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim,    { toValue: 320, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0,   duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <Animated.View style={[sts.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[sts.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={sts.handle} />

        <View style={sts.header}>
          <View style={sts.iconWrap}>
            <MaterialIcons name="bedtime" size={18} color="#818CF8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={sts.title}>Sleep Timer</Text>
            <Text style={sts.subtitle}>Music and mining pause after the selected time</Text>
          </View>
          <TouchableOpacity style={sts.closeBtn} onPress={onClose} activeOpacity={0.8} accessible accessibilityLabel="Close sleep timer" accessibilityRole="button">
            <MaterialIcons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {activeRemaining > 0 && (
          <View style={sts.activeStrip}>
            <MaterialIcons name="timer" size={14} color="#818CF8" />
            <Text style={sts.activeText}>Pausing in {fmtCountdown(activeRemaining)}</Text>
            <TouchableOpacity style={sts.cancelActiveBtn} onPress={() => { onCancel(); onClose(); }} activeOpacity={0.8} accessible accessibilityLabel="Cancel sleep timer" accessibilityRole="button">
              <Text style={sts.cancelActiveText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={sts.sectionLabel}>SELECT DURATION</Text>

        <View style={sts.presetsGrid}>
          {SLEEP_PRESETS.map(p => {
            const isActive = activeRemaining > 0 && activeRemaining <= p.secs && activeRemaining > p.secs - 120;
            return (
              <TouchableOpacity
                key={p.label}
                style={[sts.presetBtn, isActive && sts.presetBtnActive]}
                onPress={() => { onSelect(p.secs); onClose(); }}
                activeOpacity={0.8}
                accessible
                accessibilityLabel={`Sleep timer: ${p.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <MaterialIcons name="bedtime" size={22} color={isActive ? '#818CF8' : Colors.textMuted} />
                <Text style={[sts.presetLabel, isActive && sts.presetLabelActive]}>{p.label}</Text>
                {isActive && <View style={sts.activePip} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={sts.footerNote}>
          <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
          <Text style={sts.footerNoteText}>
            Music gently fades out 3 seconds before pausing
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

const sts = StyleSheet.create({
  backdrop:         { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200 },
  sheet:            { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, zIndex: 201, borderTopWidth: 1, borderTopColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 20 },
  handle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  header:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconWrap:         { width: 38, height: 38, borderRadius: 12, backgroundColor: '#818CF818', borderWidth: 1, borderColor: '#818CF833', alignItems: 'center', justifyContent: 'center' },
  title:            { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle:         { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  closeBtn:         { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  activeStrip:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: '#818CF812', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: '#818CF844' },
  activeText:       { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#818CF8', includeFontPadding: false },
  cancelActiveBtn:  { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.error + '18', borderWidth: 1, borderColor: Colors.error + '55' },
  cancelActiveText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.error, includeFontPadding: false },
  sectionLabel:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false, paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  presetsGrid:      { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, flexWrap: 'wrap' },
  presetBtn:        { flex: 1, minWidth: '45%', flexDirection: 'column', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md, borderWidth: 1.5, borderColor: Colors.border, position: 'relative' },
  presetBtnActive:  { backgroundColor: '#818CF812', borderColor: '#818CF888' },
  presetLabel:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  presetLabelActive:{ color: '#818CF8' },
  activePip:        { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#818CF8' },
  footerNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: Spacing.xl, marginTop: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  footerNoteText:   { flex: 1, fontSize: 10, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
});

// ── Block Truck Alert ─────────────────────────────────────────────────────────
function BlockTruckAlert({ visible, reward, onDismiss }: { visible: boolean; reward: number; onDismiss: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Vibration.vibrate([0, 100, 80, 100, 80, 200]);
      AccessibilityInfo.announceForAccessibility(`Block truck found! You earned ${reward} BTNG bonus reward.`);
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 5, useNativeDriver: true }),
        Animated.delay(200),
        Animated.loop(
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 6,  duration: 80, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 80, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0,  duration: 80, useNativeDriver: true }),
          ]),
          { iterations: 3 }
        ),
      ]).start();
      const t = setTimeout(onDismiss, 6000);
      return () => clearTimeout(t);
    } else {
      Animated.timing(scaleAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[bt.container, { transform: [{ scale: scaleAnim }, { translateX: shakeAnim }] }]}
      accessible
      accessibilityLabel={`Block truck found! Block reward: ${reward} BTNG`}
      accessibilityLiveRegion="assertive"
    >
      <View style={bt.truckRow}>
        <Text style={bt.truckEmoji}>🚛</Text>
        <View style={bt.truckTrail}>
          {['💨', '💨', '💨'].map((e, i) => <Text key={i} style={[bt.trailEmoji, { opacity: 1 - i * 0.3 }]}>{e}</Text>)}
        </View>
      </View>
      <Text style={bt.title}>BLOCK TRUCK FOUND!</Text>
      <Text style={bt.sub}>You hit the jackpot while mining!</Text>
      <View style={bt.rewardRow}>
        <Text style={bt.rewardLabel}>Block Reward</Text>
        <Text style={bt.rewardValue}>{reward} BTNG</Text>
      </View>
      <TouchableOpacity style={bt.dismissBtn} onPress={onDismiss} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Claim reward and continue mining">
        <MaterialIcons name="check-circle" size={16} color={Colors.bg} />
        <Text style={bt.dismissText}>Claim & Continue Mining</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const bt = StyleSheet.create({
  container:  { marginHorizontal: 0, backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.kenteGold, gap: Spacing.sm, alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 16 },
  truckRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  truckEmoji: { fontSize: 52 },
  truckTrail: { flexDirection: 'row', alignItems: 'center' },
  trailEmoji: { fontSize: 22 },
  title:      { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false, letterSpacing: 0.5 },
  sub:        { fontSize: FontSize.sm, color: Colors.bg, opacity: 0.8, includeFontPadding: false },
  rewardRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  rewardLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.bg, includeFontPadding: false },
  rewardValue:{ fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.kenteGold, includeFontPadding: false },
  dismissBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, paddingHorizontal: Spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  dismissText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});

// ── Log entry ─────────────────────────────────────────────────────────────────
function LogEntry({ entry }: { entry: MineLog }) {
  const iconMap: Record<string, { icon: string; color: string }> = {
    mine:   { icon: 'toll',           color: Colors.primary  },
    block:  { icon: 'emoji-events',   color: Colors.kenteGold },
    music:  { icon: 'music-note',     color: Colors.warning  },
    system: { icon: 'info-outline',   color: Colors.textMuted },
  };
  const { icon, color } = iconMap[entry.type] ?? iconMap.system;
  return (
    <View style={le.row} accessible accessibilityLabel={`${entry.ts}: ${entry.message}${entry.reward !== undefined ? `, earned ${fmt(entry.reward, 6)} BTNG` : ''}`}>
      <View style={[le.dot, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <MaterialIcons name={icon as any} size={11} color={color} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={le.msg}>{entry.message}</Text>
        {entry.reward !== undefined && (
          <Text style={[le.reward, { color }]}>+{fmt(entry.reward, 6)} BTNG</Text>
        )}
      </View>
      <Text style={le.ts}>{entry.ts}</Text>
    </View>
  );
}

const le = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '88' },
  dot:    { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  msg:    { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 15, includeFontPadding: false },
  reward: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  ts:     { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, flexShrink: 0 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngMinerScreen() {
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const { showAlert } = useAlert();
  const { user }  = useAuth();

  const [customTracks,        setCustomTracks]        = useState<MusicTrack[]>([]);
  const [cloudSyncing,        setCloudSyncing]        = useState(false);
  const customTracksLoaded = useRef(false);
  const [mining,             setMining]             = useState(false);
  const [musicPlaying,       setMusicPlaying]       = useState(false);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [showLibrary,        setShowLibrary]        = useState(false);
  const [showSleepSheet,      setShowSleepSheet]      = useState(false);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(0);
  const sleepTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sleepFadeRef          = useRef(false);
  const sleepWasMiningRef     = useRef(false);
  const sleepWasMusicRef      = useRef(false);
  const [openUploadDirect,   setOpenUploadDirect]   = useState(false);
  const [blockTruckVisible,  setBlockTruckVisible]  = useState(false);
  const [blockTruckReward,   setBlockTruckReward]   = useState(BLOCK_TRUCK_REWARD);
  const [logs,               setLogs]               = useState<MineLog[]>([
    { id: '0', ts: nowTime(), type: 'system', message: 'BTNG Mobile Miner initialized · Ready to mine Bituncoin Gold' },
  ]);
  const [stats, setStats] = useState<MinerStats>({
    totalMined:     0,
    pendingRewards: 0,
    blocksFound:    0,
    sessionMinutes: 0,
    hashRate:       0,
    musicMinutes:   0,
    miningCycles:   0,
  });
  const [liveHashRate, setLiveHashRate] = useState(0);

  // ── Stereo / Volume state ──────────────────────────────────────────────────
  const [volume,      setVolume]      = useState(80);   // 0-100
  const [balance,     setBalance]     = useState(0);    // -100(L) to 100(R)
  const [muted,       setMuted]       = useState(false);
  const [repeat,      setRepeat]      = useState(false);
  const [shuffle,     setShuffle]     = useState(false);
  const [elapsedSecs,  setElapsedSecs]  = useState(0);
  const [durationSecs, setDurationSecs] = useState(0);

  // ── Equalizer state ───────────────────────────────────────────────────────
  const [eqBands,  setEqBands]  = useState<EqBands>({ ...EQ_BANDS_DEFAULT });
  const [eqPreset, setEqPreset] = useState<EqPresetName | null>('Flat');
  const eqLoaded = useRef(false);

  // ── Session history state ─────────────────────────────────────────────────
  const [sessionHistory,    setSessionHistory]    = useState<SessionRecord[]>([]);
  const sessionStartBtng    = useRef(0);   // totalMined snapshot at session start
  const sessionStartTime    = useRef<number>(0);

  // ── expo-av Audio refs ─────────────────────────────────────────────────────
  const soundRef      = useRef<Audio.Sound | null>(null);
  const handleNextRef = useRef<() => void>(() => {});
  const volumeRef     = useRef(80);
  const balanceRef    = useRef(0);
  const mutedRef      = useRef(false);
  volumeRef.current   = volume;
  balanceRef.current  = balance;
  mutedRef.current    = muted;

  // ── addLog — defined FIRST so sleep timer callbacks can reference it ─────────
  const addLog = useCallback((entry: Omit<MineLog, 'id' | 'ts'>) => {
    setLogs(prev => {
      const newEntry: MineLog = {
        id: generateUID('LOG'),
        ts: nowTime(),
        ...entry,
      };
      return [newEntry, ...prev].slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  // ── Sleep timer logic ──────────────────────────────────────────────────────
  const cancelSleepTimer = useCallback(() => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }
    setSleepTimerRemaining(0);
    sleepFadeRef.current = false;
  }, []);

  const startSleepTimer = useCallback((secs: number) => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }
    sleepFadeRef.current = false;
    setSleepTimerRemaining(secs);
    addLog({ type: 'system', message: `Sleep timer set: pausing in ${fmtCountdown(secs)}` });

    sleepTimerIntervalRef.current = setInterval(() => {
      setSleepTimerRemaining(prev => {
        if (prev <= 1) {
          clearInterval(sleepTimerIntervalRef.current!);
          sleepTimerIntervalRef.current = null;
          return 0;
        }
        // Begin fade-out in last 3 seconds
        if (prev <= 4 && !sleepFadeRef.current) {
          sleepFadeRef.current = true;
          sleepWasMiningRef.current = miningRef.current;
          sleepWasMusicRef.current  = musicRef.current;
          let fadeVol = volumeRef.current;
          const step  = Math.max(1, fadeVol / 30);
          const fadeInt = setInterval(() => {
            fadeVol = Math.max(0, fadeVol - step);
            soundRef.current?.setVolumeAsync(fadeVol / 100).catch(() => {});
            if (fadeVol <= 0) clearInterval(fadeInt);
          }, 100);
        }
        return prev - 1;
      });
    }, 1000);
  }, [addLog]);

  // Trigger pause when timer reaches 0
  useEffect(() => {
    if (sleepTimerRemaining !== 0) return;
    if (!sleepFadeRef.current) return;
    sleepFadeRef.current = false;
    if (sleepWasMusicRef.current) {
      soundRef.current?.pauseAsync().catch(() => {});
      setMusicPlaying(false);
      minerStateRef.current.mode                    = 'standard';
      minerStateRef.current.effective_hash_rate_khs = minerStateRef.current.base_hash_rate_khs;
      minerStateRef.current.btng_per_minute         = BTNG_PER_MINUTE_BASE;
    }
    if (sleepWasMiningRef.current) {
      setMining(false);
      if (mineIntervalRef.current)    { clearInterval(mineIntervalRef.current);    mineIntervalRef.current    = null; }
      if (sessionIntervalRef.current) { clearInterval(sessionIntervalRef.current); sessionIntervalRef.current = null; }
      if (hashFluctuateRef.current)   { clearInterval(hashFluctuateRef.current);   hashFluctuateRef.current   = null; }
      setLiveHashRate(0);
    }
    addLog({ type: 'system', message: 'Sleep timer elapsed: mining and music paused' });
  }, [sleepTimerRemaining]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current);
  }, []);

  // ── Load session history on mount ──────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(SESSION_HISTORY_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SessionRecord[];
          if (Array.isArray(parsed)) setSessionHistory(parsed);
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  // ── Load EQ from AsyncStorage on mount ──────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(EQ_STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as { bands: EqBands; preset: EqPresetName | null };
          if (saved.bands) setEqBands(saved.bands);
          if (saved.preset !== undefined) setEqPreset(saved.preset);
        } catch { /* ignore */ }
      }
    }).catch(() => {}).finally(() => { eqLoaded.current = true; });
  }, []);

  // ── Persist EQ changes ────────────────────────────────────────────────────
  useEffect(() => {
    if (!eqLoaded.current) return;
    AsyncStorage.setItem(EQ_STORAGE_KEY, JSON.stringify({ bands: eqBands, preset: eqPreset })).catch(() => {});
  }, [eqBands, eqPreset]);

  // ── EQ handlers ───────────────────────────────────────────────────────────
  const handleEqBandChange = useCallback((key: keyof EqBands, value: number) => {
    setEqBands(prev => ({ ...prev, [key]: value }));
    setEqPreset(null); // custom when manually adjusted
  }, []);

  const handleEqPresetChange = useCallback((name: EqPresetName) => {
    setEqBands({ ...EQ_PRESETS[name] });
    setEqPreset(name);
  }, []);

  // ── Configure Audio session once on mount ─────────────────────────────────
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS:      true,
      staysActiveInBackground:   true,
      shouldDuckAndroid:         false,
    }).catch(() => {});
    return () => {
      // Unload sound on unmount
      soundRef.current?.stopAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  // ── Core audio loader ─────────────────────────────────────────────────────
  const loadAndPlayTrack = useCallback(async (track: MusicTrack) => {
    try {
      // Tear down previous sound
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      setElapsedSecs(0);
      setDurationSecs(0);

      const { sound } = await Audio.Sound.createAsync(
        { uri: track.file_url },
        {
          shouldPlay:           true,
          volume:               mutedRef.current ? 0 : volumeRef.current / 100,
          isMuted:              mutedRef.current,
          progressUpdateIntervalMillis: 1000,
        },
        (status: AVPlaybackStatus) => {
          if (!status.isLoaded) return;
          setElapsedSecs(Math.floor((status.positionMillis ?? 0) / 1000));
          if ((status.durationMillis ?? 0) > 0) {
            setDurationSecs(Math.floor(status.durationMillis! / 1000));
          }
          if (status.didJustFinish) {
            handleNextRef.current();
          }
        }
      );

      // Fetch duration immediately after load
      try {
        const initStatus = await sound.getStatusAsync();
        if (initStatus.isLoaded && (initStatus.durationMillis ?? 0) > 0) {
          setDurationSecs(Math.floor(initStatus.durationMillis! / 1000));
        }
      } catch { /* ignore */ }

      // Apply stereo pan: expo-av range is -1 (full left) to 1 (full right)
      await sound.setPanAsync(balanceRef.current / 100).catch(() => {});
      soundRef.current = sound;
    } catch (err) {
      // Network or format errors on placeholder URLs are expected — ignore silently
      console.warn('[BTNG Miner] Audio load:', (err as any)?.message ?? err);
    }
  }, []);

  // ── Sync volume + muted to live sound ────────────────────────────────────
  useEffect(() => {
    if (!soundRef.current) return;
    soundRef.current.setVolumeAsync(muted ? 0 : volume / 100).catch(() => {});
    soundRef.current.setIsMutedAsync(muted).catch(() => {});
  }, [volume, muted]);

  // ── Sync repeat (loop) to live sound ──────────────────────────────────────
  useEffect(() => {
    if (!soundRef.current) return;
    soundRef.current.setIsLoopingAsync(repeat).catch(() => {});
  }, [repeat]);

  const shuffleRef = useRef(false);
  shuffleRef.current = shuffle;

  // ── Sync stereo balance to live sound ────────────────────────────────────
  useEffect(() => {
    if (!soundRef.current) return;
    soundRef.current.setPanAsync(balance / 100).catch(() => {});
  }, [balance]);

  // ── Load persisted custom tracks on mount (AsyncStorage + Supabase) ─────────
  useEffect(() => {
    (async () => {
      // 1. Load from AsyncStorage first (instant, offline-capable)
      try {
        const raw = await AsyncStorage.getItem(CUSTOM_TRACKS_KEY);
        if (raw) {
          const parsed: MusicTrack[] = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCustomTracks(parsed);
          }
        }
      } catch { /* ignore storage errors */ } finally {
        customTracksLoaded.current = true;
      }

      // 2. Load from Supabase for cross-device sync (authenticated users only)
      if (!user?.id) return;
      try {
        setCloudSyncing(true);
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('btng_uploaded_tracks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error || !data || data.length === 0) return;
        const cloudTracks: MusicTrack[] = data.map((row: any) => ({
          track_uid:        row.track_uid,
          file_url:         row.file_url,
          title:            row.title,
          artist:           row.artist,
          genre:            row.genre ?? 'Custom',
          album:            'My Uploads',
          duration_seconds: 0,
          boost_multiplier: Number(row.boost_multiplier ?? 2.4),
          btng_per_minute:  Number(row.btng_per_minute  ?? 0.0018),
          emoji:            '🎤',
          color:            '#A78BFA',
          isNew:            false,
        }));
        // Merge: cloud tracks are source-of-truth; deduplicate by track_uid
        setCustomTracks(prev => {
          const merged = [...cloudTracks];
          for (const local of prev) {
            if (!merged.find(t => t.track_uid === local.track_uid)) {
              merged.push(local);
            }
          }
          return merged;
        });
      } catch { /* ignore cloud errors silently */ } finally {
        setCloudSyncing(false);
      }
    })();
  }, [user?.id]);

  // ── Persist custom tracks whenever they change (skip first render) ─────────
  useEffect(() => {
    if (!customTracksLoaded.current) return;
    AsyncStorage.setItem(CUSTOM_TRACKS_KEY, JSON.stringify(customTracks)).catch(() => {});
  }, [customTracks]);

  const currentTrack = MUSIC_LIBRARY[selectedTrackIndex];

  // ── Miner state (engine spec) ──────────────────────────────────────────────
  const minerStateRef = useRef<MinerState>({
    miner_uid:               generateUID('MINER'),
    wallet_uid:              generateUID('WALLET'),
    current_track_uid:       currentTrack.track_uid,
    mode:                    'standard',
    base_hash_rate_khs:      BASE_HASH_RATE,
    effective_hash_rate_khs: BASE_HASH_RATE,
    btng_per_minute:         BTNG_PER_MINUTE_BASE,
    pending_btng:            0,
  });

  const mineIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const hashFluctuateRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef  = useRef(stats);
  statsRef.current = stats;
  const miningRef  = useRef(mining);
  miningRef.current = mining;
  const musicRef  = useRef(musicPlaying);
  musicRef.current = musicPlaying;
  const trackRef  = useRef(currentTrack);
  trackRef.current = currentTrack;
  const loadAndPlayTrackRef = useRef(loadAndPlayTrack);
  loadAndPlayTrackRef.current = loadAndPlayTrack;

  // ── selectTrackForMiner (engine spec) ──────────────────────────────────────
  const selectTrackForMiner = useCallback((track: MusicTrack) => {
    const miner = minerStateRef.current;
    miner.mode                    = 'music';
    miner.current_track_uid       = track.track_uid;
    miner.effective_hash_rate_khs = miner.base_hash_rate_khs * track.boost_multiplier;
    miner.btng_per_minute         = track.btng_per_minute;
    addLog({
      type:    'music',
      message: `🎵 Track selected: ${track.title} · ${track.boost_multiplier}x boost · ${(track.btng_per_minute * 1000).toFixed(1)} mBTNG/min`,
    });
  }, [addLog]);

  // ── runMiningCycle (engine spec) ─────────────────────────────────────────
  const doCycle = useCallback(() => {
    const isMusic = musicRef.current;
    const track   = trackRef.current;
    const base    = isMusic ? track.btng_per_minute : BTNG_PER_MINUTE_BASE;
    const reward  = base * (8 / 60) * (0.85 + Math.random() * 0.3);

    // Update engine miner state
    const miner = minerStateRef.current;
    miner.pending_btng += reward;

    if (Math.random() < BLOCK_TRUCK_CHANCE) {
      const bReward = BLOCK_TRUCK_REWARD + Math.floor(Math.random() * 10);
      setBlockTruckReward(bReward);
      setBlockTruckVisible(true);
      miner.pending_btng += bReward;
      setStats(prev => ({
        ...prev,
        blocksFound:    prev.blocksFound + 1,
        pendingRewards: prev.pendingRewards + bReward + reward,
        totalMined:     prev.totalMined + bReward + reward,
        miningCycles:   prev.miningCycles + 1,
      }));
      addLog({ type: 'block', message: `🚛 BLOCK TRUCK found at block #${fmtBig(350000 + statsRef.current.miningCycles)}!`, reward: bReward });
    } else {
      setStats(prev => ({
        ...prev,
        pendingRewards: prev.pendingRewards + reward,
        totalMined:     prev.totalMined + reward,
        miningCycles:   prev.miningCycles + 1,
        musicMinutes:   isMusic ? prev.musicMinutes + 8 / 60 : prev.musicMinutes,
      }));
      addLog({
        type:    isMusic ? 'music' : 'mine',
        message: isMusic
          ? `🎵 ${track.emoji} Music mining · ${track.title} · ${track.boost_multiplier}x`
          : `⛏️ Mining cycle · hash verified · block #${fmtBig(350000 + statsRef.current.miningCycles)}`,
        reward,
      });
    }
  }, [addLog]);

  const startMining = useCallback(() => {
    setMining(true);
    // Snapshot totalMined at session start so we can compute delta on stop
    sessionStartBtng.current = statsRef.current.totalMined;
    sessionStartTime.current = Date.now();
    addLog({ type: 'system', message: '⛏️ Mining engine started · Connected to BTNG Sovereign Chain' });
    mineIntervalRef.current    = setInterval(doCycle, MINE_INTERVAL_MS);
    sessionIntervalRef.current = setInterval(() => {
      setStats(prev => ({ ...prev, sessionMinutes: prev.sessionMinutes + 1 / 60 }));
    }, 1000);
    hashFluctuateRef.current = setInterval(() => {
      const track = trackRef.current;
      const base  = musicRef.current
        ? BASE_HASH_RATE * track.boost_multiplier
        : BASE_HASH_RATE;
      setLiveHashRate(Math.round(base * (0.9 + Math.random() * 0.2)));
    }, 1200);
    setLiveHashRate(BASE_HASH_RATE);
  }, [doCycle, addLog]);

  const stopMining = useCallback(() => {
    setMining(false);
    if (mineIntervalRef.current)    { clearInterval(mineIntervalRef.current);    mineIntervalRef.current    = null; }
    if (sessionIntervalRef.current) { clearInterval(sessionIntervalRef.current); sessionIntervalRef.current = null; }
    if (hashFluctuateRef.current)   { clearInterval(hashFluctuateRef.current);   hashFluctuateRef.current   = null; }
    setLiveHashRate(0);
    addLog({ type: 'system', message: '⏸️ Mining engine paused' });

    // ── Record session in history ──────────────────────────────────────────
    const btngEarned = statsRef.current.totalMined - sessionStartBtng.current;
    const elapsedMs  = Date.now() - sessionStartTime.current;
    const elapsedMin = elapsedMs / 60000;
    if (btngEarned > 0 || elapsedMin >= 0.1) {
      const now   = new Date();
      const month = now.toLocaleString('en-GB', { month: 'short' });
      const day   = now.getDate();
      const rec: SessionRecord = {
        date:    `${month} ${day}`,
        time:    now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        btng:    Math.max(0, btngEarned),
        minutes: Math.round(elapsedMin * 10) / 10,
        ts:      now.getTime(),
      };
      setSessionHistory(prev => {
        const next = [...prev, rec].slice(-MAX_SESSION_HISTORY);
        AsyncStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    }
  }, [addLog]);

  // Restart cycle when music/track changes
  useEffect(() => {
    if (mining) {
      if (mineIntervalRef.current) clearInterval(mineIntervalRef.current);
      mineIntervalRef.current = setInterval(doCycle, MINE_INTERVAL_MS);
      if (musicPlaying) {
        addLog({ type: 'music', message: `🎵 Music boost activated · ${currentTrack.title} · ${currentTrack.boost_multiplier}x hash rate` });
      }
    }
  }, [musicPlaying, selectedTrackIndex]);

  useEffect(() => () => {
    if (mineIntervalRef.current)    clearInterval(mineIntervalRef.current);
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    if (hashFluctuateRef.current)   clearInterval(hashFluctuateRef.current);
  }, []);

  // ── Seek handler ──────────────────────────────────────────────────────────
  const handleSeek = useCallback(async (ms: number) => {
    if (!soundRef.current) return;
    await soundRef.current.setPositionAsync(ms).catch(() => {});
    setElapsedSecs(Math.floor(ms / 1000));
  }, []);

  // Keep handleNextRef up-to-date (set after handleNext is defined below)

  // ── claimPendingToWallet (engine spec) ────────────────────────────────────
  const handleClaimRewards = useCallback(() => {
    if (stats.pendingRewards <= 0) {
      showAlert('No Rewards', 'Mine some BTNG first before claiming.');
      return;
    }
    const amt = stats.pendingRewards;
    // Reset engine pending
    minerStateRef.current.pending_btng = 0;
    setStats(prev => ({ ...prev, pendingRewards: 0 }));
    addLog({ type: 'system', message: `💰 Claimed ${fmt(amt, 6)} BTNG to BTNG Genesis Wallet` });
    showAlert('Rewards Claimed', `${fmt(amt, 6)} BTNG has been transferred to your BTNG Genesis Wallet.\n\nKeep mining to earn more!`);
  }, [stats.pendingRewards, addLog, showAlert]);

  const handleMusicToggle = useCallback(async () => {
    const next = !musicPlaying;
    setMusicPlaying(next);
    const miner = minerStateRef.current;
    if (next) {
      selectTrackForMiner(currentTrack);
      // Resume existing sound if already loaded for same track, otherwise load fresh
      if (soundRef.current) {
        await soundRef.current.playAsync().catch(() => {});
      } else {
        await loadAndPlayTrackRef.current(currentTrack);
      }
    } else {
      miner.mode                    = 'standard';
      miner.effective_hash_rate_khs = miner.base_hash_rate_khs;
      miner.btng_per_minute         = BTNG_PER_MINUTE_BASE;
      // Pause (not stop) so resume works
      await soundRef.current?.pauseAsync().catch(() => {});
    }
  }, [musicPlaying, currentTrack, selectTrackForMiner]);

  const handleTrackSelect = useCallback(async (track: MusicTrack) => {
    const idx = MUSIC_LIBRARY.findIndex(t => t.track_uid === track.track_uid);
    if (idx === -1) return;
    setSelectedTrackIndex(idx);
    selectTrackForMiner(track);
    setMusicPlaying(true);
    setElapsedSecs(0);
    // Always load fresh when user explicitly picks a track
    await loadAndPlayTrackRef.current(track);
  }, [selectTrackForMiner]);

  const handleNext = useCallback(async () => {
    let nextIdx: number;
    if (shuffleRef.current) {
      do { nextIdx = Math.floor(Math.random() * MUSIC_LIBRARY.length); }
      while (MUSIC_LIBRARY.length > 1 && nextIdx === selectedTrackIndex);
    } else {
      nextIdx = (selectedTrackIndex + 1) % MUSIC_LIBRARY.length;
    }
    const nextTrack = MUSIC_LIBRARY[nextIdx];
    setSelectedTrackIndex(nextIdx);
    selectTrackForMiner(nextTrack);
    setElapsedSecs(0);
    if (musicRef.current) {
      await loadAndPlayTrackRef.current(nextTrack);
    }
  }, [selectedTrackIndex, selectTrackForMiner]);

  // Keep handleNextRef synced so the playback completion callback always calls the latest version
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  const handlePrev = useCallback(async () => {
    const prevIdx = (selectedTrackIndex - 1 + MUSIC_LIBRARY.length) % MUSIC_LIBRARY.length;
    const prevTrack = MUSIC_LIBRARY[prevIdx];
    setSelectedTrackIndex(prevIdx);
    selectTrackForMiner(prevTrack);
    setElapsedSecs(0);
    if (musicRef.current) {
      await loadAndPlayTrackRef.current(prevTrack);
    }
  }, [selectedTrackIndex, selectTrackForMiner]);

  const effectiveHashRate = mining ? liveHashRate : 0;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Library Browser ───────────────────────────────────────────── */}
      <LibraryPanel
        visible={showLibrary}
        selectedUid={currentTrack.track_uid}
        playingUid={musicPlaying ? currentTrack.track_uid : ''}
        onSelect={handleTrackSelect}
        onClose={() => { setShowLibrary(false); setOpenUploadDirect(false); }}
        customTracks={customTracks}
        cloudSyncing={cloudSyncing}
        defaultShowUpload={openUploadDirect}
        onAddTrack={async (track) => {
          // 1. Update local state immediately
          setCustomTracks(prev => [track, ...prev]);
          // 2. Persist to Supabase for cross-device sync
          if (user?.id) {
            try {
              const supabase = getSupabaseClient();
              await supabase.from('btng_uploaded_tracks').insert({
                user_id:          user.id,
                track_uid:        track.track_uid,
                file_url:         track.file_url,
                title:            track.title,
                artist:           track.artist,
                genre:            track.genre ?? 'Custom',
                boost_multiplier: track.boost_multiplier,
                btng_per_minute:  track.btng_per_minute,
              });
            } catch { /* ignore insert errors — local state already updated */ }
          }
        }}
      />

      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          accessible
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Mobile Miner</Text>
          <Text style={s.topSub}>Mine Bituncoin Gold · Music Boost Engine</Text>
        </View>
        <TouchableOpacity
          style={[s.libraryBtn, showLibrary && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}
          onPress={() => setShowLibrary(true)}
          accessible
          accessibilityLabel={`Open music library. ${MUSIC_LIBRARY.length} tracks available`}
          accessibilityRole="button"
        >
          <MaterialIcons name="library-music" size={18} color={showLibrary ? Colors.primary : Colors.textMuted} />
        </TouchableOpacity>
        <View
          style={[s.statusDot, { backgroundColor: mining ? Colors.success : Colors.textMuted }]}
          accessible
          accessibilityLabel={mining ? 'Mining active' : 'Mining inactive'}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        accessible
        accessibilityLabel="BTNG Miner screen"
      >
        {/* Block Truck Alert */}
        <BlockTruckAlert
          visible={blockTruckVisible}
          reward={blockTruckReward}
          onDismiss={() => setBlockTruckVisible(false)}
        />

        {/* Mining Ring */}
        <View style={s.ringSection} accessible={false}>
          <MiningRing
            active={mining}
            boost={mining && musicPlaying}
            boostColor={currentTrack.color}
          />
          <View style={s.hashGrid}>
            <HashCounter
              value={mining ? `${effectiveHashRate}` : '0'}
              label={'HASH RATE\nKH/s'}
              color={musicPlaying && mining ? currentTrack.color : Colors.primary}
            />
            <View style={s.hashDivider} />
            <HashCounter
              value={fmt(stats.pendingRewards, 4)}
              label={'PENDING\nBTNG'}
              color={Colors.success}
            />
            <View style={s.hashDivider} />
            <HashCounter
              value={String(stats.blocksFound)}
              label={'BLOCKS\nFOUND'}
              color={Colors.kenteGold}
            />
          </View>
        </View>

        {/* Mine / Stop Button */}
        <TouchableOpacity
          style={[s.mineBtn, mining && s.mineBtnStop]}
          onPress={mining ? stopMining : startMining}
          activeOpacity={0.85}
          accessible
          accessibilityRole="button"
          accessibilityLabel={mining ? `Stop mining. Session: ${fmt(stats.sessionMinutes, 1)} minutes` : 'Start mining BTNG Gold Coin'}
        >
          <MaterialIcons
            name={mining ? 'stop-circle' : 'play-circle-filled'}
            size={26}
            color={Colors.bg}
          />
          <View>
            <Text style={s.mineBtnTitle}>{mining ? 'Stop Mining' : 'Start Mining'}</Text>
            <Text style={s.mineBtnSub}>
              {mining
                ? `Running · ${fmt(stats.sessionMinutes, 1)} min session`
                : 'Tap to start earning BTNG Gold Coin'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Stats Cards */}
        <View style={s.statsGrid} accessible={false}>
          {[
            { icon: 'toll',          label: 'Total Mined',    value: fmt(stats.totalMined, 6) + ' BTNG',          color: Colors.primary  },
            { icon: 'music-note',    label: 'Music Minutes',  value: fmt(stats.musicMinutes, 1) + ' min',         color: currentTrack.color },
            { icon: 'loop',          label: 'Mine Cycles',    value: String(stats.miningCycles),                  color: '#9945FF' },
            { icon: 'timer',         label: 'Session Time',   value: fmt(stats.sessionMinutes, 1) + ' min',       color: Colors.success  },
            { icon: 'emoji-events',  label: 'Block Trucks',   value: String(stats.blocksFound),                   color: Colors.kenteGold },
            { icon: 'trending-up',   label: 'Effective Rate', value: (mining ? effectiveHashRate : 0) + ' KH/s',  color: musicPlaying && mining ? currentTrack.color : Colors.primary },
          ].map(item => (
            <View
              key={item.label}
              style={[s.statCard, { borderColor: item.color + '33' }]}
              accessible
              accessibilityLabel={`${item.label}: ${item.value}`}
            >
              <MaterialIcons name={item.icon as any} size={16} color={item.color} />
              <Text style={[s.statValue, { color: item.color }]}>{item.value}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Session Bar Chart */}
        <SessionBarChart sessions={sessionHistory} />

        {/* Claim Button */}
        {stats.pendingRewards > 0.0001 && (
          <TouchableOpacity
            style={s.claimBtn}
            onPress={handleClaimRewards}
            activeOpacity={0.85}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Claim ${fmt(stats.pendingRewards, 6)} BTNG rewards to your Genesis Wallet`}
          >
            <MaterialIcons name="savings" size={22} color={Colors.bg} />
            <View style={{ flex: 1 }}>
              <Text style={s.claimBtnTitle}>Claim {fmt(stats.pendingRewards, 6)} BTNG</Text>
              <Text style={s.claimBtnSub}>Transfer to your BTNG Genesis Wallet</Text>
            </View>
            <View style={s.claimBadge}>
              <Text style={s.claimBadgeText}>CLAIM</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Music Player */}
        <MusicPlayer
          playing={musicPlaying}
          track={currentTrack}
          onToggle={handleMusicToggle}
          onNext={handleNext}
          onPrev={handlePrev}
          onBrowse={() => setShowLibrary(true)}
          volume={volume}
          balance={balance}
          muted={muted}
          repeat={repeat}
          shuffle={shuffle}
          onVolumeChange={setVolume}
          onBalanceChange={setBalance}
          onMuteToggle={() => setMuted(m => !m)}
          onRepeatToggle={async () => {
            const next = !repeat;
            setRepeat(next);
            await soundRef.current?.setIsLoopingAsync(next).catch(() => {});
          }}
          onShuffleToggle={() => setShuffle(s => !s)}
          elapsedSecs={elapsedSecs}
          durationSecs={durationSecs}
          onSeek={handleSeek}
          eqBands={eqBands}
          eqPreset={eqPreset}
          onEqBandChange={handleEqBandChange}
          onEqPresetChange={handleEqPresetChange}
          sleepTimerRemaining={sleepTimerRemaining}
          onSleepTimerPress={() => setShowSleepSheet(true)}
          onCancelSleepTimer={cancelSleepTimer}
        />

        {/* ── Playlist Queue ─────────────────────────────────────────── */}
        <PlaylistQueue
          currentIndex={selectedTrackIndex}
          shuffle={shuffle}
          tracks={MUSIC_LIBRARY}
          playingUid={musicPlaying ? currentTrack.track_uid : ''}
          color={currentTrack.color}
          onSelectTrack={async (track, idx) => {
            setSelectedTrackIndex(idx);
            selectTrackForMiner(track);
            setMusicPlaying(true);
            setElapsedSecs(0);
            await loadAndPlayTrackRef.current(track);
          }}
        />

        {/* ── Upload Track Banner ─────────────────────────────────────── */}
        <TouchableOpacity
          style={s.uploadBanner}
          onPress={() => { setOpenUploadDirect(true); setShowLibrary(true); }}
          activeOpacity={0.85}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Upload your own audio track to the mining library. ${customTracks.length > 0 ? customTracks.length + ' tracks uploaded' : 'No uploads yet'}`}
        >
          <View style={s.uploadBannerIconWrap}>
            <MaterialIcons name="upload" size={20} color="#A78BFA" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.uploadBannerTitle}>Upload Your Music Track</Text>
            <Text style={s.uploadBannerSub}>
              {customTracks.length > 0
                ? `${customTracks.length} track${customTracks.length !== 1 ? 's' : ''} uploaded · 2.4× boost · stored in cloud`
                : 'Add your own mp3 / m4a / wav · get 2.4× mining boost'}
            </Text>
          </View>
          {customTracks.length > 0 && (
            <View style={s.uploadBannerBadge}>
              <Text style={s.uploadBannerBadgeText}>{customTracks.length}</Text>
            </View>
          )}
          <MaterialIcons name="chevron-right" size={18} color="#A78BFA" />
        </TouchableOpacity>

        {/* Now-playing quick row */}
        {musicPlaying && (
          <View style={[s.nowPlayingBar, { borderColor: currentTrack.color + '55', backgroundColor: currentTrack.color + '0A' }]}>
            <AudioViz playing={true} color={currentTrack.color} barCount={5} />
            <View style={{ flex: 1 }}>
              <Text style={[s.nowPlayingTitle, { color: currentTrack.color }]} numberOfLines={1}>
                {currentTrack.emoji} {currentTrack.title}
              </Text>
              <Text style={s.nowPlayingMeta}>
                {currentTrack.boost_multiplier}x boost · {(currentTrack.btng_per_minute * 1000).toFixed(1)} mBTNG/min · {currentTrack.genre}
              </Text>
            </View>
            <View style={[s.nowPlayingBadge, { backgroundColor: currentTrack.color + '20', borderColor: currentTrack.color + '44' }]}>
              <Text style={[s.nowPlayingBadgeText, { color: currentTrack.color }]}>LIVE</Text>
            </View>
          </View>
        )}

        {/* How it Works */}
        <View style={s.howCard}>
          <View style={s.howHeader}>
            <View style={s.howIconWrap}><MaterialIcons name="lightbulb-outline" size={16} color={Colors.primary} /></View>
            <Text style={s.howTitle}>How Mobile Mining Works</Text>
          </View>
          <View style={s.howSteps}>
            {[
              { n: '1', icon: 'play-circle-filled',  text: 'Tap Start Mining to activate the BTNG mobile mining engine',                            color: Colors.primary     },
              { n: '2', icon: 'library-music',        text: `Choose any of ${MUSIC_LIBRARY.length} tracks — Reggae, Afrobeats, Highlife, Amapiano & more — each with a unique boost rate (2.0×–3.0×)`, color: '#A78BFA'          },
              { n: '3', icon: 'music-note',           text: 'Enable Music Mining for a boost — earn BTNG while listening to your selected track',     color: Colors.warning     },
              { n: '4', icon: 'devices',              text: 'Engine runs on-device using your CPU — simulated PoW with BTNG sovereign chain',          color: '#9945FF'          },
              { n: '5', icon: 'emoji-events',         text: 'Random Block Trucks give 50+ BTNG bonus rewards (1.2% chance per cycle)',                 color: Colors.kenteGold   },
              { n: '6', icon: 'savings',              text: 'Claim accumulated BTNG rewards to your Genesis Wallet anytime',                           color: Colors.success     },
            ].map(step => (
              <View key={step.n} style={s.howStep}>
                <View style={[s.howStepNum, { backgroundColor: step.color + '18', borderColor: step.color + '55' }]}>
                  <MaterialIcons name={step.icon as any} size={13} color={step.color} />
                </View>
                <Text style={s.howStepText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Reward Schedule */}
        <View style={s.rewardCard}>
          <View style={s.rewardHeader}>
            <View style={s.rewardIconWrap}><MaterialIcons name="schedule" size={14} color={Colors.primary} /></View>
            <Text style={s.rewardTitle}>Reward Schedule</Text>
          </View>
          {[
            { mode: 'Standard Mining',            rate: '0.0008 BTNG/min',  boost: '1×',      color: Colors.primary  },
            { mode: 'Music Mining (avg)',          rate: '0.0018 BTNG/min',  boost: '2.4×',    color: Colors.warning  },
            { mode: 'Reggae · BTNG Movement',     rate: '0.0024 BTNG/min',  boost: '3.0×',    color: '#22C55E'       },
            { mode: 'Gold Reserve Symphony',       rate: '0.0024 BTNG/min',  boost: '3.0×',    color: '#FFD700'       },
            { mode: 'Block Truck Anthem',          rate: '0.0022 BTNG/min',  boost: '2.8×',    color: '#F7931A'       },
            { mode: 'Block Truck Jackpot',         rate: '50–60 BTNG',       boost: 'JACKPOT', color: Colors.kenteGold },
          ].map(row => (
            <View key={row.mode} style={s.rewardRow}>
              <View style={[s.rewardModeDot, { backgroundColor: row.color }]} />
              <Text style={s.rewardMode}>{row.mode}</Text>
              <Text style={[s.rewardRate, { color: row.color }]}>{row.rate}</Text>
              <View style={[s.rewardBoostChip, { backgroundColor: row.color + '18', borderColor: row.color + '44' }]}>
                <Text style={[s.rewardBoostText, { color: row.color }]}>{row.boost}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Mining Log */}
        <View style={s.logCard}>
          <View style={s.logHeader}>
            <View style={s.logIconWrap}><MaterialIcons name="terminal" size={14} color={Colors.primary} /></View>
            <Text style={s.logTitle}>Mining Log</Text>
            <View style={[s.logLivePill, mining && s.logLivePillActive]}>
              <View style={[s.logLiveDot, mining && s.logLiveDotActive]} />
              <Text style={[s.logLiveText, mining && s.logLiveTextActive]}>{mining ? 'LIVE' : 'PAUSED'}</Text>
            </View>
          </View>
          <View style={s.logEntries}>
            {logs.slice(0, 16).map(entry => <LogEntry key={entry.id} entry={entry} />)}
          </View>
        </View>

        {/* Contract Info */}
        <View style={s.contractCard}>
          <View style={s.contractHeader}>
            <MaterialIcons name="description" size={12} color={Colors.primary} />
            <Text style={s.contractTitle}>MobileMiningRewards.sol · Solidity ^0.8.19</Text>
          </View>
          {[
            { fn: 'registerMiner()',                       desc: 'Activate mobile miner account',               color: Colors.primary  },
            { fn: 'mineWithMusic(songHash, seconds)',       desc: 'Mine BTNG while listening to music',          color: Colors.warning  },
            { fn: 'uploadMusicSingleFile(file, metadata)', desc: 'Add new track to mining library',             color: '#A78BFA'       },
            { fn: 'getOneColumnMusicLibrary()',            desc: 'Return full one-column track list',           color: '#60A5FA'       },
            { fn: 'claimRewards()',                        desc: 'Withdraw pending BTNG rewards',               color: Colors.success  },
            { fn: 'foundBlockTruck()',                     desc: 'Jackpot: 50 BTNG block reward',               color: Colors.kenteGold },
          ].map(c => (
            <View key={c.fn} style={s.contractRow}>
              <View style={[s.contractFnChip, { backgroundColor: c.color + '18', borderColor: c.color + '44' }]}>
                <Text style={[s.contractFnText, { color: c.color }]}>{c.fn}</Text>
              </View>
              <Text style={s.contractDesc}>{c.desc}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={s.deployBtn}
            onPress={() => router.push('/btng-contract-deploy' as any)}
            activeOpacity={0.85}
            accessible
            accessibilityLabel="Deploy Mobile Mining Rewards smart contract"
            accessibilityRole="button"
          >
            <MaterialIcons name="rocket-launch" size={14} color={Colors.bg} />
            <Text style={s.deployBtnText}>Deploy MobileMiningRewards Contract</Text>
            <MaterialIcons name="chevron-right" size={14} color={Colors.bg} />
          </TouchableOpacity>
        </View>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>

      {/* ── Sleep Timer Sheet — outside ScrollView so backdrop covers full screen ── */}
      <SleepTimerSheet
        visible={showSleepSheet}
        activeRemaining={sleepTimerRemaining}
        onSelect={startSleepTimer}
        onCancel={cancelSleepTimer}
        onClose={() => setShowSleepSheet(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  libraryBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter:      { alignItems: 'center', flex: 1 },
  topTitle:       { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub:         { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  statusDot:      { width: 10, height: 10, borderRadius: 5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  scroll:         { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  ringSection:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6 },
  hashGrid:       { flexDirection: 'row', width: '100%', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  hashDivider:    { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  mineBtn:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.lg, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  mineBtnStop:    { backgroundColor: Colors.error, shadowColor: Colors.error },
  mineBtnTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  mineBtnSub:     { fontSize: FontSize.xs, color: Colors.bg, opacity: 0.8, includeFontPadding: false, marginTop: 2 },

  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard:       { width: '31%', flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 4, borderWidth: 1, alignItems: 'center', gap: 4, minWidth: 90 },
  statValue:      { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  statLabel:      { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  claimBtn:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.success, borderRadius: Radius.xl, padding: Spacing.md, shadowColor: Colors.success, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  claimBtnTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  claimBtnSub:    { fontSize: 10, color: Colors.bg, opacity: 0.8, includeFontPadding: false, marginTop: 1 },
  claimBadge:     { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  claimBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.8, includeFontPadding: false },

  // Now playing bar
  nowPlayingBar:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1.5 },
  nowPlayingTitle:    { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  nowPlayingMeta:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  nowPlayingBadge:    { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  nowPlayingBadgeText:{ fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },

  howCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  howHeader:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  howIconWrap:    { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  howTitle:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  howSteps:       { gap: Spacing.sm },
  howStep:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  howStepNum:     { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  howStepText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },

  rewardCard:      { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  rewardHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rewardIconWrap:  { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  rewardTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  rewardRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rewardModeDot:   { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  rewardMode:      { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  rewardRate:      { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  rewardBoostChip: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  rewardBoostText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },

  logCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  logHeader:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  logIconWrap:       { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  logTitle:          { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  logLivePill:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  logLivePillActive: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  logLiveDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.textMuted },
  logLiveDotActive:  { backgroundColor: Colors.success },
  logLiveText:       { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  logLiveTextActive: { color: Colors.success },
  logEntries:        { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },

  contractCard:    { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  contractHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  contractTitle:   { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  contractRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border },
  contractFnChip:  { borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  contractFnText:  { fontSize: 10, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  contractDesc:    { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  deployBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, marginTop: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  deployBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Upload Track Banner
  uploadBanner:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: '#A78BFA44', shadowColor: '#A78BFA', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  uploadBannerIconWrap:  { width: 44, height: 44, borderRadius: 14, backgroundColor: '#A78BFA18', borderWidth: 1, borderColor: '#A78BFA44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  uploadBannerTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#A78BFA', includeFontPadding: false },
  uploadBannerSub:       { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  uploadBannerBadge:     { width: 24, height: 24, borderRadius: 12, backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  uploadBannerBadgeText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
});
