import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Animated, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useBtngWallet } from '@/hooks/useBtngWallet';
import { fetchAllAccountBalances, getRpcUrl } from '@/services/btngWalletService';

// ── Node Type Config ──────────────────────────────────────────────────────────
const NODE_TYPES = [
  {
    type: 'LIGHT',
    emoji: '💡',
    color: '#3B82F6',
    price: 100,
    hashRate: 100,
    ratePerHour: 0.5,
    ratePerDay: 12,
    roi: '8.3 days',
    description: 'Entry-level node for new generators',
    features: ['100 KH/s Hash Rate', '0.5 BTNG/hour', 'Auto-claim compatible', 'Best for beginners'],
  },
  {
    type: 'MEDIUM',
    emoji: '⚡',
    color: '#F59E0B',
    price: 500,
    hashRate: 500,
    ratePerHour: 3,
    ratePerDay: 72,
    roi: '6.9 days',
    description: 'Balanced performance and cost efficiency',
    features: ['500 KH/s Hash Rate', '3 BTNG/hour', 'Auto-reinvest capable', 'Most popular tier'],
    badge: 'POPULAR',
  },
  {
    type: 'HEAVY',
    emoji: '🔥',
    color: '#EF4444',
    price: 2000,
    hashRate: 2000,
    ratePerHour: 15,
    ratePerDay: 360,
    roi: '5.6 days',
    description: 'Maximum power for serious node operators',
    features: ['2,000 KH/s Hash Rate', '15 BTNG/hour', 'Priority rewards', 'Whale-tier earnings'],
    badge: 'MAX POWER',
  },
];

const AUTO_MODES = [
  { value: 0, label: 'Manual', icon: 'touch-app', desc: 'Claim rewards manually when ready', color: Colors.textMuted },
  { value: 1, label: 'Auto-Claim', icon: 'savings', desc: 'Automatically send rewards to wallet', color: '#22C55E' },
  { value: 2, label: 'Auto-Reinvest', icon: 'loop', desc: 'Reinvest rewards into new Light nodes', color: '#9945FF' },
];

// ── Initial demo nodes ────────────────────────────────────────────────────────
const INITIAL_NODES = [
  { id: 1, name: 'Ghana Node Alpha', type: 'HEAVY', hashRate: 2000, totalEarned: 4820.5, pendingRewards: 142.5, autoMode: 1, isActive: true, createdAt: '2026-05-10' },
  { id: 2, name: 'Africa Node Beta', type: 'MEDIUM', hashRate: 500, totalEarned: 1260.0, pendingRewards: 54.0, autoMode: 0, isActive: true, createdAt: '2026-05-18' },
  { id: 3, name: 'BTNG Node Gamma', type: 'LIGHT', hashRate: 100, totalEarned: 380.2, pendingRewards: 8.5, autoMode: 2, isActive: true, createdAt: '2026-05-25' },
];

const TABS = ['Overview', 'My Nodes', 'Contract', 'Deploy'];

// ── Code blocks ───────────────────────────────────────────────────────────────
const CONTRACT_CODE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BTNGNodeGenerator is Ownable, ReentrancyGuard {
    IERC20 public btng;

    struct Node {
        uint256 id;
        address owner;
        string nodeName;
        uint256 hashRate;
        uint256 createdAt;
        uint256 lastReward;
        uint256 totalEarned;
        bool isActive;
        string nodeType; // "LIGHT", "MEDIUM", "HEAVY"
    }

    struct Generator {
        uint256 nodeId;
        uint256 generationRate; // BTNG per hour
        uint256 lastGeneration;
        uint256 autoMode; // 0=manual 1=auto-claim 2=auto-reinvest
    }

    mapping(uint256 => Node) public nodes;
    mapping(address => uint256[]) public userNodes;
    mapping(uint256 => Generator) public generators;

    uint256 public nextNodeId = 1;

    uint256 public constant PRICE_LIGHT  = 100  * 10**18;
    uint256 public constant PRICE_MEDIUM = 500  * 10**18;
    uint256 public constant PRICE_HEAVY  = 2000 * 10**18;

    uint256 public constant RATE_LIGHT  = 5 * 10**17;  // 0.5/hr
    uint256 public constant RATE_MEDIUM = 3 * 10**18;  // 3/hr
    uint256 public constant RATE_HEAVY  = 15 * 10**18; // 15/hr

    event NodeCreated(uint256 nodeId, address owner, string nodeType);
    event NodeGenerated(uint256 nodeId, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);

    constructor(address _btng) { btng = IERC20(_btng); }

    function createNode(string memory _name, string memory _type)
        external nonReentrant
    {
        (uint256 price, uint256 hr, uint256 rate) = _nodeParams(_type);
        require(btng.transferFrom(msg.sender, address(this), price));
        nodes[nextNodeId] = Node(nextNodeId, msg.sender, _name,
            hr, block.timestamp, block.timestamp, 0, true, _type);
        generators[nextNodeId] = Generator(nextNodeId, rate, block.timestamp, 0);
        userNodes[msg.sender].push(nextNodeId++);
        emit NodeCreated(nextNodeId - 1, msg.sender, _type);
    }

    function pendingRewards(uint256 _id) public view returns (uint256) {
        if (!nodes[_id].isActive) return 0;
        uint256 hrs = (block.timestamp - generators[_id].lastGeneration) / 3600;
        return hrs * generators[_id].generationRate;
    }

    function claimAllRewards() external nonReentrant {
        uint256 total;
        for (uint256 i; i < userNodes[msg.sender].length; i++) {
            uint256 id = userNodes[msg.sender][i];
            uint256 r = pendingRewards(id);
            if (r > 0) {
                total += r;
                generators[id].lastGeneration = block.timestamp;
                nodes[id].totalEarned += r;
            }
        }
        require(total > 0, "No rewards");
        btng.transfer(msg.sender, total);
        emit RewardsClaimed(msg.sender, total);
    }

    function setAutoMode(uint256 _id, uint256 _mode) external {
        require(nodes[_id].owner == msg.sender && _mode <= 2);
        generators[_id].autoMode = _mode;
    }

    function _nodeParams(string memory t) internal pure
        returns (uint256 price, uint256 hr, uint256 rate)
    {
        if (keccak256(bytes(t)) == keccak256(bytes("LIGHT")))
            return (PRICE_LIGHT, 100, RATE_LIGHT);
        if (keccak256(bytes(t)) == keccak256(bytes("MEDIUM")))
            return (PRICE_MEDIUM, 500, RATE_MEDIUM);
        if (keccak256(bytes(t)) == keccak256(bytes("HEAVY")))
            return (PRICE_HEAVY, 2000, RATE_HEAVY);
        revert("Invalid type");
    }
}`;

const SERVER_CODE = `// node-generator-server.js
const express = require('express');
const { ethers } = require('ethers');
const app = express();
app.use(express.json());

const RPC = 'https://bsc-dataseed.binance.org/';
const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS, ABI, wallet
);

async function autoGenerate() {
  const nextId = await contract.nextNodeId();
  for (let i = 1; i < nextId; i++) {
    const node = await contract.nodes(i);
    if (!node.isActive) continue;
    const pending = await contract.pendingRewards(i);
    if (pending > 0n) {
      const tx = await contract.generateRewards(i);
      await tx.wait();
      console.log('Rewarded node', i, ethers.formatEther(pending));
    }
  }
}

setInterval(autoGenerate, 60_000);
app.listen(3001, () => console.log('Node Generator API on :3001'));`;

const HARDHAT_CODE = `require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.19",
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: [process.env.PRIVATE_KEY]
    },
    bscMainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};`;

const DEPLOY_SCRIPT = `const hre = require("hardhat");

async function main() {
  const btngAddress = "0xYourBTNGTokenAddress";
  const NodeGen = await hre.ethers.getContractFactory("BTNGNodeGenerator");
  const nodeGen = await NodeGen.deploy(btngAddress);
  await nodeGen.waitForDeployment();
  console.log("BTNGNodeGenerator:", await nodeGen.getAddress());

  const btng = await hre.ethers.getContractAt("IERC20", btngAddress);
  const fundAmount = hre.ethers.parseEther("100000");
  await btng.transfer(await nodeGen.getAddress(), fundAmount);
  console.log("Funded 100,000 BTNG");
}

main().catch(console.error);`;

// ── Code Block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, title, lang = 'solidity' }: { code: string; title: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    ExpoClipboard.setStringAsync(code).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [code]);
  return (
    <View style={cb.card}>
      <View style={cb.header}>
        <View style={cb.headerLeft}>
          <View style={cb.langBadge}><Text style={cb.langText}>{lang}</Text></View>
          <Text style={cb.title} numberOfLines={1}>{title}</Text>
        </View>
        <TouchableOpacity style={[cb.copyBtn, copied && cb.copyBtnDone]} onPress={handleCopy} activeOpacity={0.8}>
          <MaterialIcons name={copied ? 'check-circle' : 'copy-all'} size={13} color={copied ? Colors.success : Colors.primary} />
          <Text style={[cb.copyBtnText, copied && { color: Colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cb.scroll}>
        <Text style={cb.code}>{code}</Text>
      </ScrollView>
    </View>
  );
}

const cb = StyleSheet.create({
  card: { backgroundColor: '#0D1117', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  langBadge: { backgroundColor: Colors.primary + '22', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  langText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, flex: 1, includeFontPadding: false },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  copyBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  scroll: { maxHeight: 280 },
  code: { fontSize: 10.5, color: '#E6EDF3', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, padding: Spacing.md, includeFontPadding: false },
});

// ── Node Type Card ────────────────────────────────────────────────────────────
function NodeTypeCard({ node, selected, onSelect }: { node: typeof NODE_TYPES[0]; selected: boolean; onSelect: () => void }) {
  return (
    <TouchableOpacity style={[nc.card, selected && { borderColor: node.color, borderWidth: 2 }]} onPress={onSelect} activeOpacity={0.85}>
      {node.badge && (
        <View style={[nc.badge, { backgroundColor: node.color + '22', borderColor: node.color + '55' }]}>
          <Text style={[nc.badgeText, { color: node.color }]}>{node.badge}</Text>
        </View>
      )}
      <View style={[nc.iconWrap, { backgroundColor: node.color + '18', borderColor: node.color + '44' }]}>
        <Text style={{ fontSize: 30 }}>{node.emoji}</Text>
      </View>
      <Text style={[nc.type, { color: node.color }]}>{node.type}</Text>
      <Text style={nc.desc}>{node.description}</Text>
      <View style={[nc.priceRow, { backgroundColor: node.color + '12', borderColor: node.color + '33' }]}>
        <Text style={nc.priceLabel}>Cost</Text>
        <Text style={[nc.priceValue, { color: node.color }]}>{node.price} BTNG</Text>
      </View>
      <View style={nc.rateRow}>
        <View style={nc.rateStat}>
          <Text style={nc.rateStatLabel}>Rate/hr</Text>
          <Text style={[nc.rateStatValue, { color: node.color }]}>{node.ratePerHour}</Text>
        </View>
        <View style={nc.rateDivider} />
        <View style={nc.rateStat}>
          <Text style={nc.rateStatLabel}>Per day</Text>
          <Text style={[nc.rateStatValue, { color: node.color }]}>{node.ratePerDay}</Text>
        </View>
        <View style={nc.rateDivider} />
        <View style={nc.rateStat}>
          <Text style={nc.rateStatLabel}>ROI</Text>
          <Text style={[nc.rateStatValue, { color: node.color }]}>{node.roi}</Text>
        </View>
      </View>
      <View style={nc.features}>
        {node.features.map(f => (
          <View key={f} style={nc.featureRow}>
            <MaterialIcons name="check-circle" size={11} color={node.color} />
            <Text style={nc.featureText}>{f}</Text>
          </View>
        ))}
      </View>
      {selected && (
        <View style={[nc.selectedBadge, { backgroundColor: node.color }]}>
          <MaterialIcons name="check" size={12} color="#fff" />
          <Text style={nc.selectedText}>Selected</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const nc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm, alignItems: 'center', flex: 1, position: 'relative' },
  badge: { position: 'absolute', top: 8, right: 8, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  badgeText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  iconWrap: { width: 62, height: 62, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  type: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, letterSpacing: 1, includeFontPadding: false },
  desc: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 14, includeFontPadding: false },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, borderWidth: 1 },
  priceLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  priceValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  rateRow: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  rateStat: { flex: 1, alignItems: 'center', gap: 2 },
  rateDivider: { width: 1, height: 24, backgroundColor: Colors.border },
  rateStatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  rateStatValue: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  features: { width: '100%', gap: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  featureText: { fontSize: 10, color: Colors.textSecondary, includeFontPadding: false },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  selectedText: { fontSize: 10, fontWeight: FontWeight.heavy, color: '#fff', includeFontPadding: false },
});

// ── Live Node Row with ticking pending counter ────────────────────────────────
function NodeRow({
  node, onModeChange, onClaim,
}: {
  node: typeof INITIAL_NODES[0];
  onModeChange: (id: number, mode: number) => void;
  onClaim: (id: number) => void;
}) {
  const typeConfig = NODE_TYPES.find(t => t.type === node.type) ?? NODE_TYPES[0];
  const autoMode = AUTO_MODES.find(m => m.value === node.autoMode) ?? AUTO_MODES[0];

  // Tick pending rewards every second based on rate
  const [livePending, setLivePending] = useState(node.pendingRewards);
  const ratePerSec = typeConfig.ratePerHour / 3600;
  useEffect(() => {
    setLivePending(node.pendingRewards);
    const timer = setInterval(() => {
      setLivePending(prev => parseFloat((prev + ratePerSec).toFixed(6)));
    }, 1000);
    return () => clearInterval(timer);
  }, [node.pendingRewards, ratePerSec]);

  return (
    <View style={nr.card}>
      <View style={nr.top}>
        <View style={[nr.iconWrap, { backgroundColor: typeConfig.color + '18', borderColor: typeConfig.color + '44' }]}>
          <Text style={{ fontSize: 20 }}>{typeConfig.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={nr.nameRow}>
            <Text style={nr.name}>{node.name}</Text>
            <View style={[nr.typeBadge, { backgroundColor: typeConfig.color + '22', borderColor: typeConfig.color + '55' }]}>
              <Text style={[nr.typeBadgeText, { color: typeConfig.color }]}>{node.type}</Text>
            </View>
          </View>
          <Text style={nr.meta}>Node #{node.id} · {node.createdAt} · {node.hashRate.toLocaleString()} KH/s</Text>
        </View>
        <View style={nr.activeDot} />
      </View>

      {/* Stats */}
      <View style={nr.statsRow}>
        <View style={nr.stat}>
          <Text style={nr.statValue}>{node.totalEarned.toLocaleString()}</Text>
          <Text style={nr.statLabel}>Total Earned</Text>
        </View>
        <View style={nr.statDiv} />
        <View style={nr.stat}>
          <Text style={[nr.statValue, { color: Colors.success, fontSize: FontSize.xs }]}>
            {livePending.toFixed(4)}
          </Text>
          <View style={nr.pendingLabelRow}>
            <View style={nr.pendingPulseDot} />
            <Text style={[nr.statLabel, { color: Colors.success }]}>Pending BTNG</Text>
          </View>
        </View>
        <View style={nr.statDiv} />
        <View style={nr.stat}>
          <Text style={[nr.statValue, { color: typeConfig.color }]}>{typeConfig.ratePerHour}/hr</Text>
          <Text style={nr.statLabel}>Rate</Text>
        </View>
      </View>

      {/* Auto mode selector */}
      <View style={nr.modeSection}>
        <Text style={nr.modeLabel}>Auto Mode:</Text>
        <View style={nr.modeBtns}>
          {AUTO_MODES.map(m => (
            <TouchableOpacity
              key={m.value}
              style={[nr.modeBtn, node.autoMode === m.value && { backgroundColor: m.color + '22', borderColor: m.color + '55' }]}
              onPress={() => onModeChange(node.id, m.value)}
              activeOpacity={0.8}
            >
              <MaterialIcons name={m.icon as any} size={12} color={node.autoMode === m.value ? m.color : Colors.textMuted} />
              <Text style={[nr.modeBtnText, node.autoMode === m.value && { color: m.color }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={nr.modeDesc}>{autoMode.desc}</Text>
      </View>

      {/* Claim button */}
      <TouchableOpacity
        style={[nr.claimBtn, { borderColor: typeConfig.color + '55', backgroundColor: typeConfig.color + '18' }]}
        onPress={() => onClaim(node.id)}
        activeOpacity={0.85}
      >
        <MaterialIcons name="savings" size={15} color={typeConfig.color} />
        <Text style={[nr.claimBtnText, { color: typeConfig.color }]}>
          Claim {livePending.toFixed(2)} BTNG
        </Text>
        <View style={[nr.claimBtnChip, { backgroundColor: typeConfig.color + '22', borderColor: typeConfig.color + '44' }]}>
          <Text style={[nr.claimBtnChipText, { color: typeConfig.color }]}>CLAIM</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const nr = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  iconWrap: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  typeBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  typeBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  meta: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4, flexShrink: 0, marginTop: 4 },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDiv: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  statValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  statLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  pendingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pendingPulseDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 3 },
  modeSection: { gap: 6 },
  modeLabel: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  modeBtns: { flexDirection: 'row', gap: Spacing.sm },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingVertical: Spacing.sm + 1, borderWidth: 1, borderColor: Colors.border },
  modeBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  modeDesc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, fontStyle: 'italic' },
  claimBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, paddingHorizontal: Spacing.md, borderWidth: 1 },
  claimBtnText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  claimBtnChip: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  claimBtnChipText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
});

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, color, loading,
}: {
  icon: string; label: string; value: string; sub?: string; color: string; loading?: boolean;
}) {
  return (
    <View style={[sc.card, { borderColor: color + '44' }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={sc.content}>
        <Text style={sc.label}>{label}</Text>
        {loading ? (
          <ActivityIndicator size="small" color={color} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <Text style={[sc.value, { color }]}>{value}</Text>
        )}
        {sub ? <Text style={sc.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  card: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, gap: Spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 3 },
  label: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  sub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngNodeGeneratorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  // ── Wallet connection ─────────────────────────────────────────────────────
  const { phase: walletPhase, address: walletAddress, accounts } = useBtngWallet();
  const walletConnected = walletPhase === 'existing' || walletPhase === 'genesis';

  // ── Live BTNG balance from genesis wallet ─────────────────────────────────
  const [btngBalance, setBtngBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!walletConnected || accounts.length === 0) return;
    setBalanceLoading(true);
    try {
      const rpcUrl = await getRpcUrl();
      const results = await fetchAllAccountBalances(accounts.map(a => a.address), rpcUrl);
      let total = 0;
      Object.values(results).forEach(entry => {
        if (!('error' in entry)) {
          const parsed = parseFloat(entry.balance.replace(/,/g, ''));
          if (!isNaN(parsed)) total += parsed;
        }
      });
      setBtngBalance(total.toFixed(4));
    } catch {
      setBtngBalance('—');
    } finally {
      setBalanceLoading(false);
    }
  }, [walletConnected, accounts]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // ── Node state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [creating, setCreating] = useState(false);
  const [nodes, setNodes] = useState(INITIAL_NODES);

  // Computed stats
  const totalPending = nodes.reduce((s, n) => s + n.pendingRewards, 0);
  const totalEarned = nodes.reduce((s, n) => s + n.totalEarned, 0);
  const totalHashRate = nodes.reduce((s, n) => s + n.hashRate, 0);
  const dailyEarnings = nodes.reduce((sum, n) => {
    const cfg = NODE_TYPES.find(t => t.type === n.type);
    return sum + (cfg ? cfg.ratePerDay : 0);
  }, 0);

  const handleCreateNode = useCallback(() => {
    if (!walletConnected) {
      showAlert('Connect Wallet', 'Open BTNG Genesis Wallet first to deploy a node.');
      router.push('/btng-genesis' as any);
      return;
    }
    if (!selectedType) { showAlert('Select Node Type', 'Choose Light, Medium, or Heavy before creating.'); return; }
    if (!nodeName.trim()) { showAlert('Node Name Required', 'Enter a name for your node.'); return; }
    const typeConfig = NODE_TYPES.find(t => t.type === selectedType)!;
    setCreating(true);
    setTimeout(() => {
      const newNode = {
        id: nodes.length + 1,
        name: nodeName.trim(),
        type: selectedType,
        hashRate: typeConfig.hashRate,
        totalEarned: 0,
        pendingRewards: 0,
        autoMode: 0,
        isActive: true,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setNodes(prev => [...prev, newNode]);
      setCreating(false);
      setNodeName('');
      setSelectedType(null);
      setActiveTab(1);
      showAlert('Node Deployed!', `${nodeName.trim()} (${selectedType}) is now generating ${typeConfig.ratePerHour} BTNG/hour.`);
    }, 1400);
  }, [walletConnected, selectedType, nodeName, nodes, showAlert, router]);

  const handleModeChange = useCallback((id: number, mode: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, autoMode: mode } : n));
    const modeLabel = AUTO_MODES[mode]?.label ?? 'Manual';
    showAlert('Auto Mode Updated', `Node #${id} set to ${modeLabel} mode.`);
  }, [showAlert]);

  const handleClaimNode = useCallback((id: number) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const amount = node.pendingRewards.toFixed(2);
    setNodes(prev => prev.map(n => n.id === id ? { ...n, pendingRewards: 0, totalEarned: n.totalEarned + n.pendingRewards } : n));
    showAlert('Rewards Claimed!', `${amount} BTNG transferred to your Genesis Wallet.`);
  }, [nodes, showAlert]);

  const handleClaimAll = useCallback(() => {
    const total = nodes.reduce((s, n) => s + n.pendingRewards, 0);
    if (total <= 0) { showAlert('No Rewards', 'No pending rewards to claim.'); return; }
    setNodes(prev => prev.map(n => ({ ...n, totalEarned: n.totalEarned + n.pendingRewards, pendingRewards: 0 })));
    showAlert('All Rewards Claimed!', `${total.toFixed(2)} BTNG transferred to your BTNG Genesis Wallet.`);
  }, [nodes, showAlert]);

  const DEPLOY_STEPS = [
    { n: '1', title: 'Install dependencies', cmd: 'npm install && npm install @openzeppelin/contracts' },
    { n: '2', title: 'Configure hardhat.config.js', cmd: 'Add BSC Testnet / Mainnet network config' },
    { n: '3', title: 'Deploy to BSC Testnet', cmd: 'npx hardhat run scripts/deploy.js --network bscTestnet' },
    { n: '4', title: 'Copy contract address', cmd: 'Update CONTRACT_ADDRESS in node-generator-server.js' },
    { n: '5', title: 'Start backend server', cmd: 'node backend/node-generator-server.js' },
    { n: '6', title: 'PM2 auto-restart', cmd: 'pm2 start node-generator-server.js --name btng-node-gen' },
    { n: '7', title: 'Deploy to BSC Mainnet', cmd: 'npx hardhat run scripts/deploy.js --network bscMainnet' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Node Generator</Text>
          <Text style={s.topSub}>Smart Contract · Auto Rewards · 3 Tiers</Text>
        </View>
        <View style={s.livePill}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
      </View>

      {/* ── Wallet Connection Banner ── */}
      {walletConnected ? (
        <View style={s.walletBanner}>
          <View style={s.walletBannerLeft}>
            <View style={s.walletBannerIconWrap}>
              <Text style={{ fontSize: 18 }}>₿</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.walletBannerTitleRow}>
                <Text style={s.walletBannerTitle}>Genesis Wallet Connected</Text>
                <View style={s.walletConnectedBadge}>
                  <View style={s.walletConnectedDot} />
                  <Text style={s.walletConnectedText}>CONNECTED</Text>
                </View>
              </View>
              <Text style={s.walletBannerAddr} numberOfLines={1}>
                {walletAddress ? `${walletAddress.slice(0, 10)}…${walletAddress.slice(-8)}` : '—'}
              </Text>
            </View>
          </View>
          <View style={s.walletBannerRight}>
            <Text style={s.walletBalanceLabel}>Balance</Text>
            {balanceLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={s.walletBalanceValue}>{btngBalance ?? '—'}</Text>
            )}
            <Text style={s.walletBalanceTicker}>BTNG</Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.connectBanner} onPress={() => router.push('/btng-genesis' as any)} activeOpacity={0.85}>
          <View style={s.connectBannerLeft}>
            <View style={s.connectIconWrap}>
              <MaterialIcons name="account-balance-wallet" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.connectBannerTitle}>Connect BTNG Genesis Wallet</Text>
              <Text style={s.connectBannerSub}>Open your sovereign wallet to deploy nodes and claim rewards</Text>
            </View>
          </View>
          <View style={s.connectBannerBtn}>
            <Text style={s.connectBannerBtnText}>Connect</Text>
            <MaterialIcons name="arrow-forward" size={14} color={Colors.bg} />
          </View>
        </TouchableOpacity>
      )}

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map((tab, i) => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === i && s.tabActive]} onPress={() => setActiveTab(i)} activeOpacity={0.8}>
            <Text style={[s.tabText, activeTab === i && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 0 && (
          <View style={s.section}>
            {/* 4-Stat Grid */}
            <View style={s.statsGrid}>
              <View style={s.statsRow}>
                <StatCard
                  icon="account-balance-wallet"
                  label="BTNG Balance"
                  value={btngBalance ?? '—'}
                  sub="Genesis Wallet"
                  color={Colors.primary}
                  loading={balanceLoading}
                />
                <StatCard
                  icon="device-hub"
                  label="Total Nodes"
                  value={String(nodes.length)}
                  sub={`${nodes.filter(n => n.isActive).length} active`}
                  color="#9945FF"
                />
              </View>
              <View style={s.statsRow}>
                <StatCard
                  icon="bolt"
                  label="Total Hashrate"
                  value={totalHashRate.toLocaleString()}
                  sub="KH/s combined"
                  color={Colors.warning}
                />
                <StatCard
                  icon="trending-up"
                  label="Daily Earnings"
                  value={dailyEarnings.toLocaleString()}
                  sub="BTNG/day projected"
                  color={Colors.success}
                />
              </View>
            </View>

            {/* Node Type Cards */}
            <View style={s.cardSectionHeader}>
              <View style={s.cardSectionIconWrap}><MaterialIcons name="grid-view" size={15} color={Colors.primary} /></View>
              <Text style={s.cardSectionTitle}>Choose Node Type</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.nodeTypeRail}>
              {NODE_TYPES.map(nt => (
                <View key={nt.type} style={{ width: 210 }}>
                  <NodeTypeCard
                    node={nt}
                    selected={selectedType === nt.type}
                    onSelect={() => setSelectedType(prev => prev === nt.type ? null : nt.type)}
                  />
                </View>
              ))}
            </ScrollView>

            {/* Create Node Form */}
            <View style={s.createCard}>
              <View style={s.createHeader}>
                <View style={s.createIconWrap}><MaterialIcons name="add-circle" size={18} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.createTitle}>Deploy New Node</Text>
                  <Text style={s.createSub}>Pay BTNG · Start earning immediately</Text>
                </View>
                {selectedType ? (
                  <View style={[s.selectedTypeBadge, { backgroundColor: NODE_TYPES.find(t => t.type === selectedType)!.color + '22', borderColor: NODE_TYPES.find(t => t.type === selectedType)!.color + '55' }]}>
                    <Text style={[s.selectedTypeText, { color: NODE_TYPES.find(t => t.type === selectedType)!.color }]}>
                      {NODE_TYPES.find(t => t.type === selectedType)!.emoji} {selectedType}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={s.inputLabelRow}>
                <MaterialIcons name="label" size={12} color={Colors.textMuted} />
                <Text style={s.inputLabel}>Node Name</Text>
              </View>
              <TextInput
                style={s.input}
                value={nodeName}
                onChangeText={setNodeName}
                placeholder="e.g. Ghana Node Alpha"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={32}
                returnKeyType="done"
              />
              {selectedType ? (
                <View style={s.costRow}>
                  <View style={s.costLeft}>
                    <Text style={s.costLabel}>Node Cost</Text>
                    <Text style={[s.costValue, { color: NODE_TYPES.find(t => t.type === selectedType)!.color }]}>
                      {NODE_TYPES.find(t => t.type === selectedType)!.price} BTNG
                    </Text>
                  </View>
                  <View style={s.costRight}>
                    <Text style={s.costLabel}>Daily Earnings</Text>
                    <Text style={[s.costValue, { color: Colors.success }]}>
                      {NODE_TYPES.find(t => t.type === selectedType)!.ratePerDay} BTNG/day
                    </Text>
                  </View>
                </View>
              ) : null}
              <TouchableOpacity
                style={[s.createBtn, (!selectedType || !nodeName.trim() || creating) && { opacity: 0.45 }]}
                onPress={handleCreateNode}
                disabled={!selectedType || !nodeName.trim() || creating}
                activeOpacity={0.85}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={Colors.bg} />
                ) : (
                  <MaterialIcons name="rocket-launch" size={18} color={Colors.bg} />
                )}
                <Text style={s.createBtnText}>{creating ? 'Deploying Node…' : 'Deploy Node & Start Generating'}</Text>
              </TouchableOpacity>
              {!walletConnected && (
                <View style={s.walletRequiredRow}>
                  <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
                  <Text style={s.walletRequiredText}>Genesis Wallet connection required to deploy on-chain</Text>
                </View>
              )}
              <Text style={s.createHint}>Connects to BTNGNodeGenerator.sol · EVM-compatible · BSC / BTNG mainnet</Text>
            </View>

            {/* Feature Grid */}
            <View style={s.descCard}>
              <View style={s.descHeader}>
                <View style={s.descIconWrap}><Text style={{ fontSize: 24 }}>🖧</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.descTitle}>BTNG Node Generator System</Text>
                  <Text style={s.descSub}>Full production package · Smart contract + Backend + Dashboard</Text>
                </View>
              </View>
              <Text style={s.descBody}>
                Create Light, Medium, or Heavy BTNG nodes that automatically generate BTNG Gold Coin rewards over time.
                Three auto modes: Manual claim, Auto-claim to wallet, or Auto-reinvest into new nodes for compound growth.
              </Text>
              <View style={s.featureGrid}>
                {[
                  { icon: 'toll', label: '3 Node Tiers', sub: 'Light · Medium · Heavy', color: Colors.primary },
                  { icon: 'loop', label: 'Auto Modes', sub: 'Claim · Reinvest · Manual', color: '#9945FF' },
                  { icon: 'schedule', label: 'Hourly Rewards', sub: '0.5 – 15 BTNG/hour', color: Colors.warning },
                  { icon: 'security', label: 'ReentrancyGuard', sub: 'OpenZeppelin secured', color: Colors.success },
                  { icon: 'trending-up', label: 'ROI < 9 Days', sub: 'Heavy pays back in 5.6d', color: '#EF4444' },
                  { icon: 'settings', label: 'Auto Generator', sub: 'Node.js keeper · PM2', color: Colors.textSecondary },
                ].map(item => (
                  <View key={item.label} style={[s.featureCard, { borderColor: item.color + '33' }]}>
                    <MaterialIcons name={item.icon as any} size={16} color={item.color} />
                    <Text style={[s.featureCardLabel, { color: item.color }]}>{item.label}</Text>
                    <Text style={s.featureCardSub}>{item.sub}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Architecture */}
            <View style={s.archCard}>
              <View style={s.archHeader}>
                <View style={s.archIconWrap}><MaterialIcons name="account-tree" size={15} color={Colors.primary} /></View>
                <Text style={s.archTitle}>System Architecture</Text>
              </View>
              {[
                { icon: '🏦', label: 'BTNG Genesis Wallet', sub: 'Sovereign identity · HDWallet', arrow: true },
                { icon: '📜', label: 'BTNGNodeGenerator.sol', sub: 'BSC / BTNG Mainnet', arrow: true },
                { icon: '🖧', label: 'Node Engine (3 tiers)', sub: 'Light · Medium · Heavy', arrow: true },
                { icon: '🤖', label: 'Auto-Generator Keeper', sub: 'Node.js · PM2 · 60s interval', arrow: true },
                { icon: '💰', label: 'BTNG Wallet / Reinvest', sub: 'Genesis Wallet integration' },
              ].map((item) => (
                <View key={item.label} style={s.archRow}>
                  <View style={s.archIconBox}><Text style={{ fontSize: 18 }}>{item.icon}</Text></View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.archRowLabel}>{item.label}</Text>
                    {item.sub ? <Text style={s.archRowSub}>{item.sub}</Text> : null}
                  </View>
                  {item.arrow ? <MaterialIcons name="arrow-downward" size={14} color={Colors.textMuted} /> : null}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── MY NODES TAB ── */}
        {activeTab === 1 && (
          <View style={s.section}>
            {/* Summary Bar */}
            <View style={s.summaryBar}>
              <View style={s.summaryLeft}>
                <View style={s.summaryIconWrap}><MaterialIcons name="device-hub" size={16} color={Colors.primary} /></View>
                <View>
                  <Text style={s.summaryTitle}>{nodes.length} Active Nodes</Text>
                  <Text style={s.summarySub}>{totalHashRate.toLocaleString()} KH/s · {dailyEarnings} BTNG/day</Text>
                </View>
              </View>
              <View style={s.summaryRight}>
                <Text style={s.summaryPendingLabel}>Total Pending</Text>
                <Text style={[s.summaryPendingValue, { color: Colors.success }]}>{totalPending.toFixed(2)} BTNG</Text>
              </View>
            </View>

            {/* Claim All */}
            {totalPending > 0 && (
              <TouchableOpacity style={s.claimAllBtn} onPress={handleClaimAll} activeOpacity={0.85}>
                <MaterialIcons name="savings" size={20} color={Colors.bg} />
                <View style={{ flex: 1 }}>
                  <Text style={s.claimAllTitle}>Claim All · {totalPending.toFixed(2)} BTNG</Text>
                  <Text style={s.claimAllSub}>Transfer all pending rewards to Genesis Wallet</Text>
                </View>
                <View style={s.claimAllChip}><Text style={s.claimAllChipText}>CLAIM ALL</Text></View>
              </TouchableOpacity>
            )}

            {/* Node list */}
            {nodes.map(node => (
              <NodeRow key={node.id} node={node} onModeChange={handleModeChange} onClaim={handleClaimNode} />
            ))}

            {/* Add node shortcut */}
            <TouchableOpacity style={s.addNodeBtn} onPress={() => setActiveTab(0)} activeOpacity={0.8}>
              <MaterialIcons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={s.addNodeBtnText}>Deploy Another Node</Text>
              <MaterialIcons name="chevron-right" size={16} color={Colors.primary} />
            </TouchableOpacity>

            {/* Auto mode legend */}
            <View style={s.legendCard}>
              <Text style={s.legendTitle}>Auto Mode Guide</Text>
              {AUTO_MODES.map(m => (
                <View key={m.value} style={s.legendRow}>
                  <View style={[s.legendIconWrap, { backgroundColor: m.color + '18', borderColor: m.color + '44' }]}>
                    <MaterialIcons name={m.icon as any} size={13} color={m.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.legendLabel, { color: m.color }]}>{m.label}</Text>
                    <Text style={s.legendDesc}>{m.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── CONTRACT TAB ── */}
        {activeTab === 2 && (
          <View style={s.section}>
            <View style={s.contractInfoCard}>
              <View style={s.contractInfoHeader}>
                <View style={s.contractInfoIconWrap}><MaterialIcons name="description" size={18} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.contractInfoTitle}>BTNGNodeGenerator.sol</Text>
                  <Text style={s.contractInfoSub}>Solidity ^0.8.19 · OpenZeppelin · BSC / EVM</Text>
                </View>
                <View style={s.solidityBadge}><Text style={s.solidityBadgeText}>v0.8.19</Text></View>
              </View>
              <View style={s.contractStatsRow}>
                {[
                  { label: 'Node Types', value: '3', color: Colors.primary },
                  { label: 'Auto Modes', value: '3', color: '#9945FF' },
                  { label: 'Events', value: '3', color: Colors.warning },
                  { label: 'Security', value: 'OZ', color: Colors.success },
                ].map(stat => (
                  <View key={stat.label} style={s.contractStat}>
                    <Text style={[s.contractStatValue, { color: stat.color }]}>{stat.value}</Text>
                    <Text style={s.contractStatLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={s.fnCard}>
              <Text style={s.fnCardTitle}>Public Functions</Text>
              {[
                { fn: 'createNode(name, type)', desc: 'Deploy a new node — pays BTNG price', color: Colors.primary },
                { fn: 'pendingRewards(nodeId)', desc: 'View unclaimed BTNG for any node', color: Colors.warning },
                { fn: 'claimAllRewards()', desc: 'Claim all pending rewards to wallet', color: Colors.success },
                { fn: 'generateRewards(nodeId)', desc: 'Manually trigger reward generation', color: '#9945FF' },
                { fn: 'setAutoMode(nodeId, mode)', desc: 'Set 0=manual 1=claim 2=reinvest', color: Colors.textSecondary },
                { fn: 'getUserNodes(address)', desc: 'Get array of node IDs for any user', color: Colors.primary },
              ].map(fn => (
                <View key={fn.fn} style={s.fnRow}>
                  <View style={[s.fnChip, { backgroundColor: fn.color + '15', borderColor: fn.color + '44' }]}>
                    <Text style={[s.fnChipText, { color: fn.color }]}>{fn.fn}</Text>
                  </View>
                  <Text style={s.fnDesc}>{fn.desc}</Text>
                </View>
              ))}
            </View>

            <CodeBlock code={CONTRACT_CODE} title="BTNGNodeGenerator.sol" lang="solidity" />
          </View>
        )}

        {/* ── DEPLOY TAB ── */}
        {activeTab === 3 && (
          <View style={s.section}>
            {/* File structure */}
            <View style={s.fileCard}>
              <View style={s.fileHeader}>
                <View style={s.fileIconWrap}><MaterialIcons name="folder" size={15} color={Colors.warning} /></View>
                <Text style={s.fileTitle}>Project Structure</Text>
              </View>
              {[
                { indent: 0, icon: 'folder', name: 'BTNG-Node-Generator/', color: Colors.warning },
                { indent: 1, icon: 'folder', name: 'backend/', color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'node-generator-server.js', color: '#22C55E' },
                { indent: 2, icon: 'insert-drive-file', name: 'node-engine.js', color: '#22C55E' },
                { indent: 1, icon: 'folder', name: 'smart-contract/', color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'BTNGNodeGenerator.sol', color: Colors.primary },
                { indent: 2, icon: 'insert-drive-file', name: 'deploy.js', color: '#22C55E' },
                { indent: 1, icon: 'folder', name: 'frontend/', color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'index.html', color: '#F59E0B' },
                { indent: 2, icon: 'insert-drive-file', name: 'dashboard.js', color: '#F59E0B' },
                { indent: 1, icon: 'insert-drive-file', name: 'hardhat.config.js', color: Colors.textMuted },
                { indent: 1, icon: 'insert-drive-file', name: 'package.json', color: Colors.textMuted },
              ].map((item, idx) => (
                <View key={idx} style={[s.fileRow, { paddingLeft: item.indent * 16 + Spacing.sm }]}>
                  <MaterialIcons name={item.icon as any} size={13} color={item.color} />
                  <Text style={[s.fileName, { color: item.color }]}>{item.name}</Text>
                </View>
              ))}
            </View>

            {/* Deploy Steps */}
            <View style={s.stepsCard}>
              <View style={s.stepsHeader}>
                <View style={s.stepsIconWrap}><MaterialIcons name="rocket-launch" size={15} color={Colors.primary} /></View>
                <Text style={s.stepsTitle}>Deployment Sequence</Text>
              </View>
              {DEPLOY_STEPS.map(step => (
                <View key={step.n} style={s.stepRow}>
                  <View style={s.stepNum}><Text style={s.stepNumText}>{step.n}</Text></View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.stepTitle}>{step.title}</Text>
                    <View style={s.stepCmdWrap}>
                      <Text style={s.stepCmd}>{step.cmd}</Text>
                      <TouchableOpacity onPress={() => { ExpoClipboard.setStringAsync(step.cmd).catch(()=>{}); showAlert('Copied', step.cmd); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="copy-all" size={12} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <CodeBlock code={SERVER_CODE} title="node-generator-server.js" lang="javascript" />
            <CodeBlock code={HARDHAT_CODE} title="hardhat.config.js" lang="javascript" />
            <CodeBlock code={DEPLOY_SCRIPT} title="scripts/deploy.js" lang="javascript" />

            {/* PM2 */}
            <View style={s.pm2Card}>
              <View style={s.pm2Header}>
                <View style={s.pm2IconWrap}><MaterialIcons name="manage-accounts" size={14} color={Colors.success} /></View>
                <Text style={s.pm2Title}>PM2 Management Commands</Text>
              </View>
              {[
                { desc: 'Start node generator', cmd: 'pm2 start node-generator-server.js --name btng-node-gen' },
                { desc: 'Enable auto-restart on reboot', cmd: 'pm2 startup && pm2 save' },
                { desc: 'Monitor logs', cmd: 'pm2 logs btng-node-gen' },
                { desc: 'Restart server', cmd: 'pm2 restart btng-node-gen' },
                { desc: 'Stop server', cmd: 'pm2 stop btng-node-gen' },
              ].map(item => (
                <TouchableOpacity key={item.cmd} style={s.pm2Row} onPress={() => { ExpoClipboard.setStringAsync(item.cmd).catch(()=>{}); showAlert('Copied', item.cmd); }} activeOpacity={0.75}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.pm2Desc}>{item.desc}</Text>
                    <Text style={s.pm2Cmd}>{item.cmd}</Text>
                  </View>
                  <MaterialIcons name="copy-all" size={14} color={Colors.success} />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={s.linkCard} onPress={() => router.push('/btng-contract-deploy' as any)} activeOpacity={0.85}>
              <View style={s.linkLeft}>
                <View style={s.linkIconWrap}><MaterialIcons name="code" size={20} color={Colors.primary} /></View>
                <View>
                  <Text style={s.linkTitle}>Contract Deploy Package</Text>
                  <Text style={s.linkSub}>Full Hardhat + BSC scripts + verification guide</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
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
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { alignItems: 'center', flex: 1 },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '55' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },

  // Wallet banners
  walletBanner: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', flexDirection: 'row', alignItems: 'center', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  walletBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  walletBannerIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  walletBannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  walletBannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  walletConnectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '55' },
  walletConnectedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  walletConnectedText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },
  walletBannerAddr: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 2 },
  walletBannerRight: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  walletBalanceLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  walletBalanceValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  walletBalanceTicker: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },

  connectBanner: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  connectBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  connectIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  connectBannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  connectBannerSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  connectBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, flexShrink: 0 },
  connectBannerBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Tabs
  tabBar: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.sm },
  tab: { flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  tabText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.primary, fontWeight: FontWeight.heavy },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  section: { gap: Spacing.md },

  // Stats grid
  statsGrid: { gap: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },

  // Description
  descCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  descHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  descIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  descTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  descSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  descBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  featureCard: { width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 3, borderWidth: 1, gap: 4, minWidth: 130 },
  featureCardLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  featureCardSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // Node type rail
  cardSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardSectionIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  cardSectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  nodeTypeRail: { gap: Spacing.sm, paddingVertical: 2 },

  // Create card
  createCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  createHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  createIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  createTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  createSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  selectedTypeBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  selectedTypeText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  inputLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  input: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  costRow: { flexDirection: 'row', gap: Spacing.md },
  costLeft: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  costRight: { flex: 1, backgroundColor: Colors.successBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44', gap: 3 },
  costLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  costValue: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  walletRequiredRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '44' },
  walletRequiredText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  createBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  createHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Architecture
  archCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  archHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  archIconWrap: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  archTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  archRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  archIconBox: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  archRowLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  archRowSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },

  // My Nodes
  summaryBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summaryIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  summarySub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  summaryRight: { alignItems: 'flex-end' },
  summaryPendingLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  summaryPendingValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  claimAllBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.success, borderRadius: Radius.xl, padding: Spacing.md, shadowColor: Colors.success, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  claimAllTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  claimAllSub: { fontSize: 10, color: Colors.bg, opacity: 0.8, includeFontPadding: false, marginTop: 1 },
  claimAllChip: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  claimAllChipText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, letterSpacing: 0.8, includeFontPadding: false },
  addNodeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary },
  addNodeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  legendCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  legendTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  legendIconWrap: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  legendLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  legendDesc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },

  // Contract
  contractInfoCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  contractInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  contractInfoIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  contractInfoTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  contractInfoSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  solidityBadge: { backgroundColor: Colors.primary + '22', borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55', flexShrink: 0 },
  solidityBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  contractStatsRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  contractStat: { flex: 1, alignItems: 'center', gap: 2 },
  contractStatValue: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  contractStatLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  fnCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  fnCardTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  fnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fnChip: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  fnChipText: { fontSize: 10, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  fnDesc: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Deploy
  fileCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  fileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  fileIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  fileTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  fileName: { fontSize: FontSize.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  stepsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  stepsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  stepsIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  stepsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepNum: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNumText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  stepTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  stepCmdWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0D1117', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  stepCmd: { flex: 1, fontSize: 10, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  pm2Card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44', gap: Spacing.sm },
  pm2Header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  pm2IconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center' },
  pm2Title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  pm2Row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pm2Desc: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  pm2Cmd: { fontSize: 10, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  linkCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  linkLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  linkIconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  linkSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
});
