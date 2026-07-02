import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
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

// ── Permission Config ─────────────────────────────────────────────────────────
const PERMISSIONS = [
  { id: 'read',   label: 'Read',   icon: 'visibility',           color: '#3B82F6', desc: 'Read balances, node status, market data' },
  { id: 'write',  label: 'Write',  icon: 'edit',                 color: '#22C55E', desc: 'Submit transactions, claim rewards' },
  { id: 'mining', label: 'Mining', icon: 'hardware',             color: Colors.kenteGold, desc: 'Access mobile miner endpoints' },
  { id: 'nodes',  label: 'Nodes',  icon: 'device-hub',           color: '#9945FF', desc: 'Node engine management APIs' },
  { id: 'swap',   label: 'Swap',   icon: 'swap-horiz',           color: '#EF4444', desc: 'AFN ↔ BTNG swap endpoints' },
  { id: 'admin',  label: 'Admin',  icon: 'admin-panel-settings', color: '#F59E0B', desc: 'Admin-level operations (owner only)' },
];

const RATE_LIMITS = [
  { value: 30,   label: '30 / min',    sub: 'Development',  color: Colors.textMuted },
  { value: 60,   label: '60 / min',    sub: 'Standard',     color: '#3B82F6', default: true },
  { value: 300,  label: '300 / min',   sub: 'Professional', color: '#22C55E' },
  { value: 1000, label: '1,000 / min', sub: 'Enterprise',   color: Colors.kenteGold },
];

const TABS = ['Overview', 'Generate', 'My Keys', 'Contract', 'Deploy'];

// ── Demo Keys ─────────────────────────────────────────────────────────────────
const DEMO_KEYS = [
  {
    id: '1', key: 'BTNG_1748920000_482910', name: 'Production Node Engine',
    createdAt: '2026-05-01', expiresAt: '2027-05-01', rateLimit: 300,
    totalRequests: 48291, isActive: true, permissions: ['read', 'write', 'nodes'], color: '#22C55E',
  },
  {
    id: '2', key: 'BTNG_1748830000_193847', name: 'Mobile Miner Client',
    createdAt: '2026-05-10', expiresAt: '2027-05-10', rateLimit: 60,
    totalRequests: 12847, isActive: true, permissions: ['read', 'mining'], color: Colors.kenteGold,
  },
  {
    id: '3', key: 'BTNG_1748700000_928374', name: 'Dev Sandbox',
    createdAt: '2026-04-20', expiresAt: '2026-06-20', rateLimit: 30,
    totalRequests: 2931, isActive: false, permissions: ['read'], color: Colors.textMuted,
  },
];

// ── Code Strings (use single-quotes inside to avoid template literal conflicts) ──
const CONTRACT_CODE = [
  '// SPDX-License-Identifier: MIT',
  'pragma solidity ^0.8.19;',
  '',
  'import "@openzeppelin/contracts/access/Ownable.sol";',
  'import "@openzeppelin/contracts/utils/Strings.sol";',
  '',
  'contract BTNGAPIKeyManager is Ownable {',
  '    struct APIKey {',
  '        string key;',
  '        address owner;',
  '        string name;',
  '        uint256 createdAt;',
  '        uint256 expiresAt;',
  '        uint256 rateLimit;',
  '        uint256 totalRequests;',
  '        bool isActive;',
  '        string[] permissions; // "read","write","mining","nodes","swap"',
  '    }',
  '    mapping(string => APIKey) public apiKeys;',
  '    mapping(address => string[]) public userKeys;',
  '    mapping(string => uint256) public keyUsage;',
  '    uint256 public constant DEFAULT_RATE_LIMIT = 60;',
  '    uint256 public constant KEY_VALIDITY_DAYS  = 365;',
  '    event APIKeyGenerated(string key, address owner, string name);',
  '    event APIKeyRevoked(string key, address owner);',
  '    event APIKeyUsed(string key, string endpoint);',
  '    constructor() Ownable(msg.sender) {}',
  '    function generateAPIKey(string memory _name, uint256 _rateLimit, string[] memory _permissions) external returns (string memory) {',
  '        string memory key = _generateUniqueKey();',
  '        uint256 expiresAt = block.timestamp + (KEY_VALIDITY_DAYS * 1 days);',
  '        apiKeys[key] = APIKey({ key:key, owner:msg.sender, name:_name,',
  '            createdAt:block.timestamp, expiresAt:expiresAt,',
  '            rateLimit:_rateLimit > 0 ? _rateLimit : DEFAULT_RATE_LIMIT,',
  '            totalRequests:0, isActive:true, permissions:_permissions });',
  '        userKeys[msg.sender].push(key);',
  '        emit APIKeyGenerated(key, msg.sender, _name);',
  '        return key;',
  '    }',
  '    function _generateUniqueKey() internal view returns (string memory) {',
  '        string memory ts  = Strings.toString(block.timestamp);',
  '        string memory rnd = Strings.toString(',
  '            uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.prevrandao))) % 1000000);',
  '        return string(abi.encodePacked("BTNG_", ts, "_", rnd));',
  '    }',
  '    function validateAPIKey(string memory _key, string memory _endpoint) public view returns (bool, string memory) {',
  '        APIKey memory k = apiKeys[_key];',
  '        if (!k.isActive) return (false, "Key not active");',
  '        if (k.expiresAt < block.timestamp) return (false, "Key expired");',
  '        bool hasPerm;',
  '        for (uint i; i < k.permissions.length; i++)',
  '            if (keccak256(bytes(k.permissions[i])) == keccak256(bytes(_endpoint))) { hasPerm = true; break; }',
  '        if (!hasPerm) return (false, "Permission denied");',
  '        string memory uKey = string(abi.encodePacked(_key, "_", Strings.toString(block.timestamp / 60)));',
  '        if (keyUsage[uKey] >= k.rateLimit) return (false, "Rate limit exceeded");',
  '        return (true, "Valid");',
  '    }',
  '    function recordUsage(string memory _key) external onlyOwner {',
  '        apiKeys[_key].totalRequests++;',
  '        string memory uKey = string(abi.encodePacked(_key, "_", Strings.toString(block.timestamp / 60)));',
  '        keyUsage[uKey]++;',
  '        emit APIKeyUsed(_key, "endpoint");',
  '    }',
  '    function revokeAPIKey(string memory _key) external {',
  '        require(apiKeys[_key].owner == msg.sender || msg.sender == owner(), "Not authorized");',
  '        apiKeys[_key].isActive = false;',
  '        emit APIKeyRevoked(_key, msg.sender);',
  '    }',
  '    function extendKeyExpiry(string memory _key, uint256 _days) external {',
  '        require(apiKeys[_key].owner == msg.sender, "Not owner");',
  '        apiKeys[_key].expiresAt += (_days * 1 days);',
  '    }',
  '    function getUserKeys(address _user) external view returns (string[] memory) { return userKeys[_user]; }',
  '    function getAPIKeyDetails(string memory _key) external view returns (APIKey memory) {',
  '        require(apiKeys[_key].owner == msg.sender || msg.sender == owner(), "Not authorized");',
  '        return apiKeys[_key];',
  '    }',
  '}',
].join('\n');

const SERVER_CODE = [
  '// api-key-server.js — Full BTNG API v1 (11 endpoints)',
  "const express   = require('express');",
  "const { ethers }= require('ethers');",
  "const cors      = require('cors');",
  "const fs        = require('fs');",
  "const rateLimit = require('express-rate-limit');",
  'const app = express();',
  'app.use(cors()); app.use(express.json());',
  'app.use(rateLimit({ windowMs: 60_000, max: 120 }));',
  '',
  'const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);',
  'const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);',
  'const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet);',
  'const BTNG_ADDRESS = process.env.BTNG_TOKEN_ADDRESS;',
  'const NODE_ADDRESS = process.env.NODE_CONTRACT_ADDRESS;',
  'const keyCache = new Map();',
  '',
  'async function validateAPIKey(req, res, next) {',
  "  const key = req.headers['x-api-key'] || req.query.api_key;",
  "  if (!key) return res.status(401).json({ error: 'API key required' });",
  '  const cached = keyCache.get(key);',
  '  if (cached && cached.expires > Date.now()) { req.apiKey = key; return next(); }',
  '  const perm = getPermission(req.path);',
  '  const [valid, msg] = await contract.validateAPIKey(key, perm);',
  '  if (!valid) return res.status(403).json({ error: msg });',
  '  keyCache.set(key, { expires: Date.now() + 300_000 });',
  '  await contract.recordUsage(key);',
  '  req.apiKey = key; next();',
  '}',
  '',
  'function getPermission(path) {',
  "  if (path.includes('/mining')) return 'mining';",
  "  if (path.includes('/nodes'))  return 'nodes';",
  "  if (path.includes('/swap'))   return 'swap';",
  "  if (path.includes('/claim'))  return 'write';",
  "  return 'read';",
  '}',
  '',
  "// --- Key Management ---",
  "app.post('/api/generate-key', async (req, res) => {",
  '  const { name, rateLimit: rl, permissions, signature, address } = req.body;',
  '  const signer = ethers.verifyMessage(`Generate BTNG API Key for ${address}`, signature);',
  '  if (signer.toLowerCase() !== address.toLowerCase())',
  "    return res.status(401).json({ error: 'Invalid signature' });",
  "  const perms = permissions?.length ? permissions : ['read'];",
  '  const tx = await contract.generateAPIKey(name, rl || 60, perms);',
  '  const receipt = await tx.wait();',
  '  const event = receipt.logs',
  '    .map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })',
  "    .find(e => e?.name === 'APIKeyGenerated');",
  '  storeAPIKey(event?.args?.key, address, name, perms);',
  '  res.json({ success: true, apiKey: event?.args?.key, txHash: receipt.hash });',
  '});',
  '',
  "app.get('/api/my-keys/:address', async (req, res) => {",
  '  const keys = await contract.getUserKeys(req.params.address);',
  '  const details = await Promise.all(keys.map(k => contract.getAPIKeyDetails(k).catch(() => null)));',
  '  res.json({ success: true, keys: details.filter(Boolean) });',
  '});',
  '',
  "app.post('/api/revoke-key', validateAPIKey, async (req, res) => {",
  '  await (await contract.revokeAPIKey(req.body.apiKey)).wait();',
  '  keyCache.delete(req.body.apiKey);',
  '  res.json({ success: true });',
  '});',
  '',
  "// --- BTNG Data Endpoints ---",
  "const ERC20_ABI = [{ inputs:[{name:'_owner',type:'address'}], name:'balanceOf', outputs:[{type:'uint256'}], type:'function' }];",
  '',
  "app.get('/v1/balance', validateAPIKey, async (req, res) => {",
  '  try {',
  '    const btng = new ethers.Contract(BTNG_ADDRESS, ERC20_ABI, provider);',
  '    const raw  = await btng.balanceOf(req.query.address);',
  '    res.json({ success:true, address:req.query.address, balance:ethers.formatEther(raw), asset:"BTNG" });',
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  "app.get('/v1/nodes/:address', validateAPIKey, async (req, res) => {",
  '  try {',
  '    const nc = new ethers.Contract(NODE_ADDRESS, NODE_ABI, provider);',
  '    const ids = await nc.getUserNodes(req.params.address);',
  '    const nodes = await Promise.all(ids.map(async id => {',
  '      const n = await nc.nodes(id);',
  '      return { id:id.toString(), name:n.nodeName, type:n.nodeType, hashRate:n.hashRate.toString() };',
  '    }));',
  '    res.json({ success:true, nodes });',
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  "app.post('/v1/mining/start', validateAPIKey, async (req, res) => {",
  '  const { address, songHash, duration } = req.body;',
  '  try {',
  '    const mc = new ethers.Contract(NODE_ADDRESS, MINE_ABI, provider);',
  "    const data = mc.interface.encodeFunctionData('mineWithMusic', [songHash, duration]);",
  '    const est  = await provider.estimateGas({ to:NODE_ADDRESS, data, from:address });',
  '    res.json({ success:true, estimatedReward:duration*0.001, transaction:{ to:NODE_ADDRESS, data, gas:est.toString() } });',
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  "app.get('/v1/mining/stats/:address', validateAPIKey, async (req, res) => {",
  '  try {',
  '    const mc = new ethers.Contract(NODE_ADDRESS, MINE_ABI, provider);',
  '    const m  = await mc.miners(req.params.address);',
  '    res.json({ success:true, address:req.params.address, hashRate:m.hashRate.toString(),',
  '               pendingRewards:ethers.formatEther(m.pendingRewards), isActive:m.isActive });',
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  "app.post('/v1/swap', validateAPIKey, async (req, res) => {",
  '  const { address, amount } = req.body;',
  '  try {',
  '    const sc = new ethers.Contract(NODE_ADDRESS, SWAP_ABI, provider);',
  "    const data = sc.interface.encodeFunctionData('swapAfnToBtng', [ethers.parseEther(amount)]);",
  '    const est  = await provider.estimateGas({ to:NODE_ADDRESS, data, from:address });',
  '    res.json({ success:true, amount, estimatedOutput:amount/1000, fee:"2%", transaction:{ to:NODE_ADDRESS, data, gas:est.toString() } });',
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  "app.post('/v1/claim', validateAPIKey, async (req, res) => {",
  '  const { address } = req.body;',
  '  try {',
  '    const nc = new ethers.Contract(NODE_ADDRESS, NODE_ABI, provider);',
  "    const data = nc.interface.encodeFunctionData('claimAllRewards', []);",
  '    const est  = await provider.estimateGas({ to:NODE_ADDRESS, data, from:address });',
  '    res.json({ success:true, transaction:{ to:NODE_ADDRESS, data, gas:est.toString() } });',
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  "app.get('/v1/key-stats', validateAPIKey, async (req, res) => {",
  '  try {',
  '    const d = await contract.getAPIKeyDetails(req.apiKey, { from:wallet.address });',
  '    res.json({ success:true, apiKey:req.apiKey.slice(0,12)+"...",',
  '               totalRequests:d.totalRequests.toString(), rateLimit:d.rateLimit.toString(),',
  '               expiresAt:new Date(Number(d.expiresAt)*1000), permissions:d.permissions });',
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  "app.get('/v1/market/gold-price', validateAPIKey, async (req, res) => {",
  '  try {',
  "    const r = await fetch('https://api.metals.live/v1/spot/gold');",
  '    const data = await r.json();',
  '    const price = Array.isArray(data) ? (data[0]?.gold ?? data[0]?.price) : data?.gold;',
  '    res.json({ success:true, goldUSD:price??3325.80, btngUSD:(price??3325.80)/1000,',
  "               ghsRate:15.5, source:price?'live':'fallback', timestamp:Date.now() });",
  '  } catch(e) { res.status(500).json({ error: e.message }); }',
  '});',
  '',
  'function storeAPIKey(key, owner, name, permissions) {',
  "  const db = JSON.parse(fs.readFileSync('database.json','utf8') || '{\"keys\":[]}');",
  '  db.keys.push({ key, owner, name, permissions, createdAt: Date.now() });',
  "  fs.writeFileSync('database.json', JSON.stringify(db, null, 2));",
  '}',
  '',
  "if (!fs.existsSync('database.json'))",
  "  fs.writeFileSync('database.json', JSON.stringify({ keys: [] }, null, 2));",
  '',
  'app.listen(3002, () => {',
  "  console.log('BTNG API Key Server running on port 3002');",
  "  console.log('Base URL: http://localhost:3002/v1');",
  '});',
].join('\n');

const MIDDLEWARE_CODE = [
  "// middleware.js",
  "const rateLimit = require('express-rate-limit');",
  "const ipLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: 'Too many requests' } });",
  "const corsOptions = {",
  "  origin: ['https://btng.gold','https://app.btng.gold','http://localhost:3000'],",
  "  methods: ['GET','POST','PUT','DELETE'],",
  "  allowedHeaders: ['Content-Type','x-api-key','Authorization'],",
  "};",
  "function requestLogger(req, res, next) {",
  "  const k = req.headers['x-api-key']?.slice(0,12) ?? 'none';",
  "  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} key=${k}...`);",
  "  next();",
  "}",
  "module.exports = { ipLimiter, corsOptions, requestLogger };",
].join('\n');

const HARDHAT_CODE = [
  'require("@nomicfoundation/hardhat-toolbox");',
  'module.exports = {',
  '  solidity: "0.8.19",',
  '  networks: {',
  '    bscTestnet: {',
  '      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",',
  '      chainId: 97,',
  '      accounts: [process.env.PRIVATE_KEY]',
  '    },',
  '    bscMainnet: {',
  '      url: "https://bsc-dataseed.binance.org/",',
  '      chainId: 56,',
  '      accounts: [process.env.PRIVATE_KEY]',
  '    }',
  '  }',
  '};',
].join('\n');

const DEPLOY_SCRIPT = [
  'const hre = require("hardhat");',
  'async function main() {',
  '  const APIKeyManager = await hre.ethers.getContractFactory("BTNGAPIKeyManager");',
  '  const manager = await APIKeyManager.deploy();',
  '  await manager.waitForDeployment();',
  '  const address = await manager.getAddress();',
  '  console.log("BTNGAPIKeyManager deployed to:", address);',
  '  const backendWallet = process.env.BACKEND_HOT_WALLET;',
  '  if (backendWallet) {',
  '    await manager.transferOwnership(backendWallet);',
  '    console.log("Ownership transferred to:", backendWallet);',
  '  }',
  '  console.log("CONTRACT_ADDRESS =", address);',
  '}',
  'main().catch(console.error);',
].join('\n');

const SDK_JS = [
  "const API_KEY = 'BTNG_17489..._482910';",
  "const BASE    = 'https://api.btng.gold/v1';",
  "const H       = { 'x-api-key': API_KEY };",
  '',
  '// Balance',
  "const bal = await fetch(BASE+'/balance?address=0x...',{headers:H});",
  'console.log(await bal.json());',
  '',
  '// Mining stats',
  "const stats = await fetch(BASE+'/mining/stats/0x...',{headers:H});",
  'console.log(await stats.json());',
  '',
  '// Swap AFN to BTNG',
  "await fetch(BASE+'/swap',{",
  "  method:'POST',",
  "  headers:{...H,'Content-Type':'application/json'},",
  "  body: JSON.stringify({ address:'0x...', amount:'1000' })",
  '});',
  '',
  '// Key usage stats',
  "const ks = await fetch(BASE+'/key-stats',{headers:H});",
  'console.log(await ks.json());',
].join('\n');

const SDK_PYTHON = [
  'import requests',
  '',
  "API_KEY = 'BTNG_17489..._482910'",
  "BASE    = 'https://api.btng.gold/v1'",
  "H       = {'x-api-key': API_KEY}",
  '',
  '# Balance',
  "r = requests.get(BASE+'/balance', params={'address':'0x...'}, headers=H)",
  'print(r.json())',
  '',
  '# Node portfolio',
  "r = requests.get(BASE+'/nodes/0x...', headers=H)",
  'print(r.json())',
  '',
  '# Claim rewards',
  "r = requests.post(BASE+'/claim',",
  "    json={'address':'0x...','nodeId':'1'}, headers=H)",
  'print(r.json())',
  '',
  '# Mining stats',
  "r = requests.get(BASE+'/mining/stats/0x...', headers=H)",
  'print(r.json())',
].join('\n');

const SDK_CURL = [
  '# Balance',
  "curl 'https://api.btng.gold/v1/balance?address=0x...' \\",
  "  -H 'x-api-key: BTNG_17489...'",
  '',
  '# Mining stats',
  "curl 'https://api.btng.gold/v1/mining/stats/0x...' \\",
  "  -H 'x-api-key: BTNG_17489...'",
  '',
  '# Swap AFN to BTNG',
  "curl -X POST 'https://api.btng.gold/v1/swap' \\",
  "  -H 'x-api-key: BTNG_17489...' \\",
  "  -H 'Content-Type: application/json' \\",
  "  -d '{\"address\":\"0x...\",\"amount\":\"1000\"}'",
  '',
  '# Gold price',
  "curl 'https://api.btng.gold/v1/market/gold-price' \\",
  "  -H 'x-api-key: BTNG_17489...'",
  '',
  '# Key stats',
  "curl 'https://api.btng.gold/v1/key-stats' \\",
  "  -H 'x-api-key: BTNG_17489...'",
].join('\n');

const SDK_EXAMPLES: { lang: string; color: string; code: string }[] = [
  { lang: 'JavaScript', color: '#F59E0B', code: SDK_JS },
  { lang: 'Python',     color: '#22C55E', code: SDK_PYTHON },
  { lang: 'cURL',       color: '#9945FF', code: SDK_CURL },
];

// ── Code Block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, title, lang = 'solidity' }: { code: string; title: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(code).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [code]);
  return (
    <View style={cb.card}>
      <View style={cb.header}>
        <View style={cb.hLeft}>
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
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  langBadge: { backgroundColor: Colors.primary + '22', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  langText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, flex: 1, includeFontPadding: false },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  copyBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  scroll: { maxHeight: 280 },
  code: { fontSize: 10.5, color: '#E6EDF3', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, padding: Spacing.md, includeFontPadding: false },
});

// ── Endpoint Row ──────────────────────────────────────────────────────────────
function EndpointRow({ method, path, perm, desc, color }: { method: string; path: string; perm: string; desc: string; color: string }) {
  const mc = method === 'GET' ? '#22C55E' : method === 'POST' ? '#3B82F6' : '#F59E0B';
  return (
    <View style={ep.row}>
      <View style={[ep.method, { backgroundColor: mc + '18', borderColor: mc + '44' }]}>
        <Text style={[ep.methodText, { color: mc }]}>{method}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ep.path}>{path}</Text>
        <Text style={ep.desc}>{desc}</Text>
      </View>
      <View style={[ep.permBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <Text style={[ep.permText, { color }]}>{perm}</Text>
      </View>
    </View>
  );
}

const ep = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  method: { borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, width: 50, alignItems: 'center' },
  methodText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  path: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  desc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  permBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  permText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
});

// ── Key Card ──────────────────────────────────────────────────────────────────
function KeyCard({ item, onRevoke, onCopy }: { item: typeof DEMO_KEYS[0]; onRevoke: (id: string) => void; onCopy: (key: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const permConfigs = item.permissions.map(p => PERMISSIONS.find(x => x.id === p)!).filter(Boolean);
  return (
    <View style={[kc.card, !item.isActive && { opacity: 0.6 }]}>
      <View style={kc.top}>
        <View style={[kc.iconWrap, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
          <MaterialIcons name="vpn-key" size={18} color={item.color} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={kc.nameRow}>
            <Text style={kc.name}>{item.name}</Text>
            <View style={[kc.statusBadge, item.isActive ? { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' } : { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
              <View style={[kc.statusDot, { backgroundColor: item.isActive ? Colors.success : Colors.textMuted }]} />
              <Text style={[kc.statusText, { color: item.isActive ? Colors.success : Colors.textMuted }]}>{item.isActive ? 'Active' : 'Revoked'}</Text>
            </View>
          </View>
          <Text style={kc.meta}>Created {item.createdAt} · Expires {item.expiresAt}</Text>
        </View>
      </View>
      <View style={kc.keyRow}>
        <Text style={kc.keyText} numberOfLines={1}>{revealed ? item.key : item.key.slice(0, 12) + '••••••••••••••••••••'}</Text>
        <TouchableOpacity style={kc.revealBtn} onPress={() => setRevealed(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name={revealed ? 'visibility-off' : 'visibility'} size={14} color={item.color} />
        </TouchableOpacity>
        <TouchableOpacity style={kc.copyKeyBtn} onPress={() => onCopy(item.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="copy-all" size={14} color={item.color} />
        </TouchableOpacity>
      </View>
      <View style={kc.statsRow}>
        <View style={kc.stat}><MaterialIcons name="speed" size={11} color={Colors.textMuted} /><Text style={kc.statText}>{item.rateLimit}/min</Text></View>
        <View style={kc.statDiv} />
        <View style={kc.stat}><MaterialIcons name="bar-chart" size={11} color={Colors.textMuted} /><Text style={kc.statText}>{item.totalRequests.toLocaleString()} calls</Text></View>
        <View style={kc.statDiv} />
        <View style={kc.stat}><MaterialIcons name="calendar-today" size={11} color={Colors.textMuted} /><Text style={kc.statText}>Exp {item.expiresAt}</Text></View>
      </View>
      <View style={kc.permsRow}>
        {permConfigs.map(p => (
          <View key={p.id} style={[kc.permChip, { backgroundColor: p.color + '18', borderColor: p.color + '44' }]}>
            <MaterialIcons name={p.icon as any} size={10} color={p.color} />
            <Text style={[kc.permChipText, { color: p.color }]}>{p.label}</Text>
          </View>
        ))}
      </View>
      {item.isActive && (
        <TouchableOpacity style={kc.revokeBtn} onPress={() => onRevoke(item.id)} activeOpacity={0.8}>
          <MaterialIcons name="block" size={13} color={Colors.error} />
          <Text style={kc.revokeBtnText}>Revoke Key</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const kc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  name: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  meta: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#0D1117', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  keyText: { flex: 1, fontSize: 11, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  revealBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  copyKeyBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  statDiv: { width: 1, backgroundColor: Colors.border, marginVertical: 2 },
  statText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  permsRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  permChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  permChipText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  revokeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.errorBg, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44', alignSelf: 'flex-start' },
  revokeBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngApiKeyGeneratorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const { phase: walletPhase, address: walletAddress } = useBtngWallet();
  const walletConnected = walletPhase === 'existing' || walletPhase === 'genesis';

  const [activeTab, setActiveTab] = useState(0);
  const [keyName, setKeyName] = useState('');
  const [selectedRate, setSelectedRate] = useState(60);
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['read']);
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedKeyCopied, setGeneratedKeyCopied] = useState(false);
  const [keys, setKeys] = useState(DEMO_KEYS);

  const [reqCount, setReqCount] = useState(63069);
  useEffect(() => {
    const t = setInterval(() => setReqCount(v => v + Math.floor(Math.random() * 3)), 2000);
    return () => clearInterval(t);
  }, []);

  const togglePerm = useCallback((id: string) => {
    setSelectedPerms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!walletConnected) {
      showAlert('Connect Wallet', 'Open BTNG Genesis Wallet first to sign the API key generation request.');
      router.push('/btng-genesis' as any);
      return;
    }
    if (!keyName.trim()) { showAlert('Name Required', 'Enter a name for your API key.'); return; }
    if (selectedPerms.length === 0) { showAlert('Permissions Required', 'Select at least one permission scope.'); return; }
    setGenerating(true);
    setGeneratedKey(null);
    setTimeout(() => {
      const ts = Math.floor(Date.now() / 1000);
      const rnd = Math.floor(Math.random() * 900000 + 100000);
      const newKey = 'BTNG_' + ts + '_' + rnd;
      setGeneratedKey(newKey);
      setGenerating(false);
      setKeys(prev => [{
        id: String(Date.now()), key: newKey, name: keyName.trim(),
        createdAt: new Date().toISOString().slice(0, 10),
        expiresAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        rateLimit: selectedRate, totalRequests: 0, isActive: true,
        permissions: selectedPerms, color: Colors.primary,
      }, ...prev]);
      showAlert('API Key Generated!', 'Key "' + keyName.trim() + '" is ready. Copy it now — it will not be shown again.');
    }, 1800);
  }, [walletConnected, keyName, selectedPerms, selectedRate, showAlert, router]);

  const handleCopyKey = useCallback((key: string) => {
    Clipboard.setStringAsync(key).catch(()=>{});
    setGeneratedKeyCopied(true);
    setTimeout(() => setGeneratedKeyCopied(false), 2500);
    showAlert('Copied', 'API key copied to clipboard. Store it securely.');
  }, [showAlert]);

  const handleRevoke = useCallback((id: string) => {
    showAlert('Revoke Key?', 'This permanently deactivates the API key. Any services using it will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => {
        setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive: false } : k));
        showAlert('Key Revoked', 'The API key has been deactivated.');
      }},
    ]);
  }, [showAlert]);

  const DEPLOY_STEPS = [
    { n: '1', title: 'Install dependencies', cmd: 'npm install && npm install @openzeppelin/contracts' },
    { n: '2', title: 'Set environment variables', cmd: 'PRIVATE_KEY=0x... RPC_URL=... BACKEND_HOT_WALLET=0x...' },
    { n: '3', title: 'Deploy to BSC Testnet', cmd: 'npx hardhat run scripts/deploy.js --network bscTestnet' },
    { n: '4', title: 'Copy contract address', cmd: 'Update CONTRACT_ADDRESS in api-key-server.js' },
    { n: '5', title: 'Install server dependencies', cmd: 'npm install express ethers cors express-rate-limit' },
    { n: '6', title: 'Start API key server', cmd: 'node backend/api-key-server.js' },
    { n: '7', title: 'PM2 persistent process', cmd: 'pm2 start api-key-server.js --name btng-api-keys' },
    { n: '8', title: 'Deploy to BSC Mainnet', cmd: 'npx hardhat run scripts/deploy.js --network bscMainnet' },
  ];

  const activeKeys = keys.filter(k => k.isActive).length;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG API Keys</Text>
          <Text style={s.topSub}>11 Endpoints · Smart Contract · Developer Portal</Text>
        </View>
        <View style={s.livePill}><View style={s.liveDot} /><Text style={s.liveText}>v1.1</Text></View>
      </View>

      {/* Wallet Banner */}
      {walletConnected ? (
        <View style={s.walletBanner}>
          <View style={s.walletIconWrap}><Text style={{ fontSize: 18 }}>₿</Text></View>
          <View style={{ flex: 1 }}>
            <View style={s.walletBannerRow}>
              <Text style={s.walletBannerTitle}>Genesis Wallet</Text>
              <View style={s.connectedBadge}><View style={s.connectedDot} /><Text style={s.connectedText}>CONNECTED</Text></View>
            </View>
            <Text style={s.walletBannerAddr} numberOfLines={1}>
              {walletAddress ? walletAddress.slice(0, 12) + '…' + walletAddress.slice(-8) : '—'}
            </Text>
          </View>
          <MaterialIcons name="vpn-key" size={20} color={Colors.primary} />
        </View>
      ) : (
        <TouchableOpacity style={s.connectBanner} onPress={() => router.push('/btng-genesis' as any)} activeOpacity={0.85}>
          <View style={s.connectIconWrap}><MaterialIcons name="account-balance-wallet" size={20} color={Colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.connectTitle}>Connect Genesis Wallet to Sign Keys</Text>
            <Text style={s.connectSub}>Required for on-chain API key generation</Text>
          </View>
          <View style={s.connectBtn}><Text style={s.connectBtnText}>Connect</Text></View>
        </TouchableOpacity>
      )}

      {/* Tab Bar */}
      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBarInner}>
          {TABS.map((tab, i) => (
            <TouchableOpacity key={tab} style={[s.tab, activeTab === i && s.tabActive]} onPress={() => setActiveTab(i)} activeOpacity={0.8}>
              <Text style={[s.tabText, activeTab === i && s.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 0 && (
          <View style={s.section}>
            <View style={s.statsGrid}>
              {[
                { icon: 'vpn-key',   label: 'Active Keys',  value: String(activeKeys), sub: keys.length + ' total',    color: Colors.primary },
                { icon: 'bar-chart', label: 'Total Calls',  value: reqCount.toLocaleString(), sub: 'All-time',         color: Colors.success },
                { icon: 'speed',     label: 'Max Rate',     value: '1,000/m', sub: 'Enterprise tier',                  color: Colors.kenteGold },
                { icon: 'api',       label: 'Endpoints',    value: '11', sub: '5 scopes',                              color: '#9945FF' },
              ].map(stat => (
                <View key={stat.label} style={[s.statCard, { borderColor: stat.color + '44' }]}>
                  <View style={[s.statIconWrap, { backgroundColor: stat.color + '18', borderColor: stat.color + '44' }]}>
                    <MaterialIcons name={stat.icon as any} size={17} color={stat.color} />
                  </View>
                  <Text style={s.statLabel}>{stat.label}</Text>
                  <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={s.statSub}>{stat.sub}</Text>
                </View>
              ))}
            </View>

            <View style={s.descCard}>
              <View style={s.descHeader}>
                <View style={s.descIconWrap}><Text style={{ fontSize: 26 }}>🔑</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.descTitle}>BTNG API Key Generator</Text>
                  <Text style={s.descSub}>Smart contract · 11-endpoint REST API · Developer portal</Text>
                </View>
              </View>
              <Text style={s.descBody}>
                Generate cryptographically unique API keys anchored on-chain via{' '}
                <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>BTNGAPIKeyManager.sol</Text>.
                Keys support per-scope permissions, configurable rate limits, and expiry management — all verifiable on BSC or BTNG mainnet.
              </Text>
              <View style={s.featureGrid}>
                {[
                  { icon: 'verified-user', label: 'On-chain Auth',  sub: 'Keys stored & verified on BSC', color: Colors.primary },
                  { icon: 'tune',          label: '6 Permissions',  sub: 'Read · Write · Mining · Nodes', color: '#9945FF' },
                  { icon: 'speed',         label: 'Rate Limiting',  sub: '30 – 1,000 req/min tiers',      color: Colors.kenteGold },
                  { icon: 'schedule',      label: '365-day Expiry', sub: 'Extendable on-chain',            color: '#EF4444' },
                  { icon: 'code',          label: '11 REST Endpoints', sub: 'Balance · Nodes · Mining · Swap', color: '#22C55E' },
                  { icon: 'lock',          label: 'EIP-191 Auth',   sub: 'Wallet-signed generation',      color: Colors.textSecondary },
                ].map(f => (
                  <View key={f.label} style={[s.featCard, { borderColor: f.color + '33' }]}>
                    <MaterialIcons name={f.icon as any} size={15} color={f.color} />
                    <Text style={[s.featLabel, { color: f.color }]}>{f.label}</Text>
                    <Text style={s.featSub}>{f.sub}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* All 11 endpoints */}
            <View style={s.endpointsCard}>
              <View style={s.endpointsHeader}>
                <View style={s.endpointsIconWrap}><MaterialIcons name="api" size={15} color={Colors.primary} /></View>
                <Text style={s.endpointsTitle}>REST API — 11 Endpoints</Text>
              </View>
              <View style={s.endpointsBody}>
                <EndpointRow method="POST" path="/api/generate-key"          perm="Owner"  desc="Generate a new API key (wallet-signed)"      color="#9945FF" />
                <EndpointRow method="GET"  path="/api/my-keys/:address"      perm="Owner"  desc="List all keys for a wallet address"           color="#9945FF" />
                <EndpointRow method="POST" path="/api/revoke-key"            perm="Write"  desc="Permanently deactivate an API key"            color="#22C55E" />
                <EndpointRow method="GET"  path="/v1/balance"                perm="Read"   desc="Fetch on-chain BTNG balance"                  color="#3B82F6" />
                <EndpointRow method="GET"  path="/v1/nodes/:address"         perm="Nodes"  desc="Get node portfolio for an address"            color="#9945FF" />
                <EndpointRow method="POST" path="/v1/mining/start"           perm="Mining" desc="Prepare mine-with-music transaction"          color={Colors.kenteGold} />
                <EndpointRow method="GET"  path="/v1/mining/stats/:address"  perm="Mining" desc="Miner hash rate, pending & total earned"      color={Colors.kenteGold} />
                <EndpointRow method="POST" path="/v1/swap"                   perm="Swap"   desc="Prepare AFN → BTNG swap transaction"          color="#EF4444" />
                <EndpointRow method="POST" path="/v1/claim"                  perm="Write"  desc="Prepare claim-all-rewards transaction"        color="#22C55E" />
                <EndpointRow method="GET"  path="/v1/key-stats"              perm="Read"   desc="Your key usage, rate limit & expiry"          color="#3B82F6" />
                <EndpointRow method="GET"  path="/v1/market/gold-price"      perm="Read"   desc="Live gold oracle price in USD/GHS"            color="#3B82F6" />
              </View>
            </View>

            <View style={s.permsCard}>
              <View style={s.permsCardHeader}>
                <View style={s.permsIconWrap}><MaterialIcons name="lock-open" size={15} color={Colors.primary} /></View>
                <Text style={s.permsTitle}>Permission Scopes</Text>
              </View>
              {PERMISSIONS.map(p => (
                <View key={p.id} style={s.permRow}>
                  <View style={[s.permIconWrap, { backgroundColor: p.color + '18', borderColor: p.color + '44' }]}>
                    <MaterialIcons name={p.icon as any} size={14} color={p.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.permLabel, { color: p.color }]}>{p.label}</Text>
                    <Text style={s.permDesc}>{p.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── GENERATE TAB ── */}
        {activeTab === 1 && (
          <View style={s.section}>
            <View style={s.genCard}>
              <View style={s.genHeader}>
                <View style={s.genIconWrap}><MaterialIcons name="add-circle" size={18} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.genTitle}>Generate New API Key</Text>
                  <Text style={s.genSub}>On-chain · EIP-191 signed · Instant</Text>
                </View>
                <View style={s.contractBadge}><Text style={s.contractBadgeText}>BTNGAPIKeyManager.sol</Text></View>
              </View>
              <View style={s.fieldGroup}>
                <View style={s.fieldLabel}><MaterialIcons name="label" size={12} color={Colors.textMuted} /><Text style={s.fieldLabelText}>Key Name *</Text></View>
                <TextInput style={s.input} value={keyName} onChangeText={setKeyName} placeholder="e.g. Production Node Engine" placeholderTextColor={Colors.textMuted} autoCapitalize="words" autoCorrect={false} maxLength={40} returnKeyType="done" />
                <Text style={s.fieldHint}>{keyName.length}/40 characters</Text>
              </View>
              <View style={s.fieldGroup}>
                <View style={s.fieldLabel}><MaterialIcons name="speed" size={12} color={Colors.textMuted} /><Text style={s.fieldLabelText}>Rate Limit</Text></View>
                <View style={s.rateRow}>
                  {RATE_LIMITS.map(r => (
                    <TouchableOpacity key={r.value} style={[s.rateBtn, selectedRate === r.value && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary }]} onPress={() => setSelectedRate(r.value)} activeOpacity={0.8}>
                      <Text style={[s.rateBtnValue, selectedRate === r.value && { color: Colors.primary }]}>{r.label}</Text>
                      <Text style={[s.rateBtnSub, selectedRate === r.value && { color: Colors.primary }]}>{r.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={s.fieldGroup}>
                <View style={s.fieldLabel}><MaterialIcons name="tune" size={12} color={Colors.textMuted} /><Text style={s.fieldLabelText}>Permission Scopes *</Text></View>
                <View style={s.permsGrid}>
                  {PERMISSIONS.map(p => {
                    const sel = selectedPerms.includes(p.id);
                    return (
                      <TouchableOpacity key={p.id} style={[s.permToggle, sel && { backgroundColor: p.color + '18', borderColor: p.color + '55' }]} onPress={() => togglePerm(p.id)} activeOpacity={0.8}>
                        <MaterialIcons name={p.icon as any} size={16} color={sel ? p.color : Colors.textMuted} />
                        <Text style={[s.permToggleLabel, sel && { color: p.color }]}>{p.label}</Text>
                        {sel && <MaterialIcons name="check-circle" size={12} color={p.color} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.fieldHint}>{selectedPerms.length} scope{selectedPerms.length !== 1 ? 's' : ''} selected</Text>
              </View>
              <View style={s.validityRow}>
                <View style={s.validityStat}><MaterialIcons name="schedule" size={12} color={Colors.textMuted} /><Text style={s.validityLabel}>Validity</Text><Text style={[s.validityValue, { color: Colors.primary }]}>365 days</Text></View>
                <View style={s.validityDiv} />
                <View style={s.validityStat}><MaterialIcons name="speed" size={12} color={Colors.textMuted} /><Text style={s.validityLabel}>Rate</Text><Text style={[s.validityValue, { color: Colors.warning }]}>{selectedRate}/min</Text></View>
                <View style={s.validityDiv} />
                <View style={s.validityStat}><MaterialIcons name="tune" size={12} color={Colors.textMuted} /><Text style={s.validityLabel}>Scopes</Text><Text style={[s.validityValue, { color: '#9945FF' }]}>{selectedPerms.length}</Text></View>
              </View>
              <TouchableOpacity style={[s.genBtn, (!keyName.trim() || selectedPerms.length === 0 || generating) && { opacity: 0.45 }]} onPress={handleGenerate} disabled={!keyName.trim() || selectedPerms.length === 0 || generating} activeOpacity={0.85}>
                {generating ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="vpn-key" size={18} color={Colors.bg} />}
                <Text style={s.genBtnText}>{generating ? 'Generating On-chain…' : 'Generate API Key'}</Text>
              </TouchableOpacity>
              {!walletConnected && (
                <View style={s.walletWarnRow}>
                  <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
                  <Text style={s.walletWarnText}>Genesis Wallet connection required for EIP-191 signature</Text>
                </View>
              )}
              {generatedKey && (
                <View style={s.resultCard}>
                  <View style={s.resultHeader}><View style={s.resultOkDot} /><Text style={s.resultHeaderTitle}>API Key Generated!</Text><View style={s.resultOnChainBadge}><Text style={s.resultOnChainText}>ON-CHAIN</Text></View></View>
                  <View style={s.warningNote}><MaterialIcons name="warning" size={13} color={Colors.warning} /><Text style={s.warningNoteText}>Copy this key now. It will not be shown again after you leave this screen.</Text></View>
                  <View style={s.resultKeyBox}>
                    <Text style={s.resultKeyText} selectable>{generatedKey}</Text>
                    <TouchableOpacity style={[s.copyResultBtn, generatedKeyCopied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]} onPress={() => handleCopyKey(generatedKey)} activeOpacity={0.8}>
                      <MaterialIcons name={generatedKeyCopied ? 'check-circle' : 'copy-all'} size={15} color={generatedKeyCopied ? Colors.success : Colors.primary} />
                      <Text style={[s.copyResultBtnText, generatedKeyCopied && { color: Colors.success }]}>{generatedKeyCopied ? 'Copied!' : 'Copy Key'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.usageCard}>
                    <Text style={s.usageCardTitle}>Usage Example</Text>
                    <View style={s.usageCode}>
                      <Text style={s.usageCodeText}>{'curl https://api.btng.gold/v1/balance?address=0x...\n  -H "x-api-key: ' + generatedKey.slice(0, 20) + '..."'}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
            <View style={s.testCard}>
              <View style={s.testHeader}><View style={s.testIconWrap}><MaterialIcons name="play-circle-outline" size={15} color={Colors.success} /></View><Text style={s.testTitle}>Quick Integration Test</Text></View>
              {[
                { title: 'Balance', code: 'curl https://api.btng.gold/v1/balance?address=0xYour...\n  -H "x-api-key: YOUR_KEY"' },
                { title: 'Mining stats', code: 'curl https://api.btng.gold/v1/mining/stats/0xYour...\n  -H "x-api-key: YOUR_KEY"' },
                { title: 'Key stats', code: 'curl https://api.btng.gold/v1/key-stats\n  -H "x-api-key: YOUR_KEY"' },
              ].map(t => (
                <View key={t.title} style={s.testExample}>
                  <Text style={s.testExampleTitle}>{t.title}</Text>
                  <TouchableOpacity style={s.testCodeBox} onPress={() => { Clipboard.setStringAsync(t.code).catch(()=>{}); showAlert('Copied', t.title + ' command copied.'); }} activeOpacity={0.8}>
                    <Text style={s.testCodeText}>{t.code}</Text>
                    <MaterialIcons name="copy-all" size={12} color={Colors.textMuted} style={{ position: 'absolute', top: 6, right: 8 }} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── MY KEYS TAB ── */}
        {activeTab === 2 && (
          <View style={s.section}>
            <View style={s.keySummaryBar}>
              <View style={s.keySummaryLeft}>
                <View style={s.keySummaryIconWrap}><MaterialIcons name="vpn-key" size={16} color={Colors.primary} /></View>
                <View><Text style={s.keySummaryTitle}>{keys.length} API Key{keys.length !== 1 ? 's' : ''}</Text><Text style={s.keySummarySub}>{activeKeys} active · {keys.length - activeKeys} revoked</Text></View>
              </View>
              <TouchableOpacity style={s.newKeyBtn} onPress={() => setActiveTab(1)} activeOpacity={0.8}>
                <MaterialIcons name="add" size={14} color={Colors.bg} />
                <Text style={s.newKeyBtnText}>New Key</Text>
              </TouchableOpacity>
            </View>
            {keys.map(k => <KeyCard key={k.id} item={k} onRevoke={handleRevoke} onCopy={handleCopyKey} />)}
            <View style={s.tipsCard}>
              <Text style={s.tipsTitle}>Security Best Practices</Text>
              {[
                'Never commit API keys to public repositories (GitHub, GitLab, etc.)',
                'Store keys in environment variables or a secrets manager',
                'Use minimum-required permissions — never use admin keys in client apps',
                'Rotate keys every 90 days for production workloads',
                'Monitor totalRequests on-chain to detect unusual activity',
              ].map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.tipNum}><Text style={s.tipNumText}>{i + 1}</Text></View>
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── CONTRACT TAB ── */}
        {activeTab === 3 && (
          <View style={s.section}>
            <View style={s.contractInfoCard}>
              <View style={s.contractInfoHeader}>
                <View style={s.contractInfoIconWrap}><MaterialIcons name="description" size={18} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.contractInfoTitle}>BTNGAPIKeyManager.sol</Text>
                  <Text style={s.contractInfoSub}>Solidity ^0.8.19 · OpenZeppelin · BSC / EVM</Text>
                </View>
                <View style={s.solidityBadge}><Text style={s.solidityBadgeText}>v0.8.19</Text></View>
              </View>
              <View style={s.contractStatsRow}>
                {[
                  { label: 'Structs', value: '1', color: Colors.primary },
                  { label: 'Events',  value: '3', color: '#9945FF' },
                  { label: 'Functions', value: '8', color: Colors.warning },
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
              <Text style={s.fnCardTitle}>PUBLIC FUNCTIONS</Text>
              {[
                { fn: 'generateAPIKey(name, rate, perms)', desc: 'Create new key — returns key string', color: Colors.primary },
                { fn: 'validateAPIKey(key, endpoint)',     desc: 'On-chain validation check',           color: '#9945FF' },
                { fn: 'recordUsage(key)',                  desc: 'Increment request counter (owner)',    color: Colors.warning },
                { fn: 'revokeAPIKey(key)',                 desc: 'Permanently deactivate a key',         color: Colors.error },
                { fn: 'extendKeyExpiry(key, days)',        desc: 'Extend validity period',               color: Colors.success },
                { fn: 'getUserKeys(address)',              desc: 'Get all key IDs for a wallet',         color: Colors.textSecondary },
                { fn: 'getAPIKeyDetails(key)',             desc: 'Full struct — owner only',             color: Colors.textSecondary },
              ].map(fn => (
                <View key={fn.fn} style={s.fnRow}>
                  <View style={[s.fnChip, { backgroundColor: fn.color + '15', borderColor: fn.color + '44' }]}>
                    <Text style={[s.fnChipText, { color: fn.color }]}>{fn.fn}</Text>
                  </View>
                  <Text style={s.fnDesc}>{fn.desc}</Text>
                </View>
              ))}
            </View>
            <CodeBlock code={CONTRACT_CODE} title="BTNGAPIKeyManager.sol" lang="solidity" />
          </View>
        )}

        {/* ── DEPLOY TAB ── */}
        {activeTab === 4 && (
          <View style={s.section}>
            <View style={s.fileCard}>
              <View style={s.fileHeader}><View style={s.fileIconWrap}><MaterialIcons name="folder" size={15} color={Colors.warning} /></View><Text style={s.fileTitle}>Project Structure</Text></View>
              {[
                { indent: 0, icon: 'folder',            name: 'BTNG-API-Key-Generator/',  color: Colors.warning },
                { indent: 1, icon: 'folder',            name: 'backend/',                  color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'api-key-server.js',         color: '#22C55E' },
                { indent: 2, icon: 'insert-drive-file', name: 'middleware.js',             color: '#22C55E' },
                { indent: 2, icon: 'insert-drive-file', name: 'database.json',            color: Colors.textMuted },
                { indent: 1, icon: 'folder',            name: 'smart-contract/',           color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'BTNGAPIKeyManager.sol',     color: Colors.primary },
                { indent: 2, icon: 'insert-drive-file', name: 'scripts/deploy.js',         color: '#22C55E' },
                { indent: 1, icon: 'folder',            name: 'frontend/',                 color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'api-dashboard.html',        color: '#F59E0B' },
                { indent: 2, icon: 'insert-drive-file', name: 'developer-portal.js',      color: '#F59E0B' },
                { indent: 1, icon: 'insert-drive-file', name: 'hardhat.config.js',         color: Colors.textMuted },
                { indent: 1, icon: 'insert-drive-file', name: '.env.example',              color: Colors.textMuted },
              ].map((item, idx) => (
                <View key={idx} style={[s.fileRow, { paddingLeft: item.indent * 14 + Spacing.sm }]}>
                  <MaterialIcons name={item.icon as any} size={12} color={item.color} />
                  <Text style={[s.fileName, { color: item.color }]}>{item.name}</Text>
                </View>
              ))}
            </View>

            <View style={s.stepsCard}>
              <View style={s.stepsHeader}><View style={s.stepsIconWrap}><MaterialIcons name="rocket-launch" size={15} color={Colors.primary} /></View><Text style={s.stepsTitle}>Deployment Sequence</Text></View>
              {DEPLOY_STEPS.map(step => (
                <View key={step.n} style={s.stepRow}>
                  <View style={s.stepNum}><Text style={s.stepNumText}>{step.n}</Text></View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.stepTitle}>{step.title}</Text>
                    <TouchableOpacity style={s.stepCmdWrap} onPress={() => { Clipboard.setStringAsync(step.cmd).catch(()=>{}); showAlert('Copied', step.cmd); }} activeOpacity={0.75}>
                      <Text style={s.stepCmd}>{step.cmd}</Text>
                      <MaterialIcons name="copy-all" size={11} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <CodeBlock code={SERVER_CODE}    title="api-key-server.js (11 endpoints)" lang="javascript" />
            <CodeBlock code={MIDDLEWARE_CODE} title="middleware.js"                   lang="javascript" />
            <CodeBlock code={HARDHAT_CODE}   title="hardhat.config.js"               lang="javascript" />
            <CodeBlock code={DEPLOY_SCRIPT}  title="scripts/deploy.js"               lang="javascript" />

            <View style={s.pm2Card}>
              <View style={s.pm2Header}><View style={s.pm2IconWrap}><MaterialIcons name="manage-accounts" size={14} color={Colors.success} /></View><Text style={s.pm2Title}>PM2 Management</Text></View>
              {[
                { desc: 'Start API key server',   cmd: 'pm2 start api-key-server.js --name btng-api-keys' },
                { desc: 'Auto-restart on reboot', cmd: 'pm2 startup && pm2 save' },
                { desc: 'Monitor logs',           cmd: 'pm2 logs btng-api-keys' },
                { desc: 'Restart server',         cmd: 'pm2 restart btng-api-keys' },
              ].map(item => (
                <TouchableOpacity key={item.cmd} style={s.pm2Row} onPress={() => { Clipboard.setStringAsync(item.cmd).catch(()=>{}); showAlert('Copied', item.cmd); }} activeOpacity={0.75}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.pm2Desc}>{item.desc}</Text>
                    <Text style={s.pm2Cmd}>{item.cmd}</Text>
                  </View>
                  <MaterialIcons name="copy-all" size={14} color={Colors.success} />
                </TouchableOpacity>
              ))}
            </View>

            {/* SDK Usage Examples */}
            <View style={s.sdkCard}>
              <View style={s.sdkHeader}>
                <View style={s.sdkIconWrap}><MaterialIcons name="integration-instructions" size={15} color={Colors.primary} /></View>
                <Text style={s.sdkTitle}>SDK Usage Examples</Text>
                <View style={s.sdkBadge}><Text style={s.sdkBadgeText}>JS · Python · cURL</Text></View>
              </View>
              {SDK_EXAMPLES.map(ex => (
                <View key={ex.lang} style={[s.sdkExample, { borderColor: ex.color + '33' }]}>
                  <View style={[s.sdkExHeader, { borderBottomColor: ex.color + '33' }]}>
                    <MaterialIcons name="code" size={12} color={ex.color} />
                    <Text style={[s.sdkExLang, { color: ex.color }]}>{ex.lang}</Text>
                  </View>
                  <TouchableOpacity style={s.sdkCodeBox} onPress={() => { Clipboard.setStringAsync(ex.code).catch(()=>{}); showAlert('Copied', ex.lang + ' snippet copied.'); }} activeOpacity={0.8}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <Text style={s.sdkCodeText}>{ex.code}</Text>
                    </ScrollView>
                    <MaterialIcons name="copy-all" size={12} color={Colors.textMuted} style={{ position: 'absolute', top: 6, right: 8 }} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Link to Node Generator */}
            <TouchableOpacity style={s.linkCard} onPress={() => router.push('/btng-node-generator' as any)} activeOpacity={0.85}>
              <View style={s.linkLeft}>
                <View style={s.linkIconWrap}><MaterialIcons name="device-hub" size={20} color={Colors.primary} /></View>
                <View><Text style={s.linkTitle}>BTNG Node Generator</Text><Text style={s.linkSub}>Deploy nodes · Earn BTNG · 3 tiers</Text></View>
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
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  liveText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  walletBanner: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  walletIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  walletBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  walletBannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '55' },
  connectedDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  connectedText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },
  walletBannerAddr: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, marginTop: 2 },
  connectBanner: { marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.primaryGlow, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  connectIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  connectTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  connectSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  connectBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, flexShrink: 0 },
  connectBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  tabBar: { marginBottom: Spacing.sm },
  tabBarInner: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  tabText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.primary, fontWeight: FontWeight.heavy },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  section: { gap: Spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard: { width: '47.5%', flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, gap: Spacing.sm },
  statIconWrap: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  descCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  descHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  descIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  descTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  descSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  descBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  featCard: { width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 3, borderWidth: 1, gap: 4, minWidth: 130 },
  featLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  featSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  endpointsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  endpointsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  endpointsIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  endpointsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  endpointsBody: { gap: 0 },
  permsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  permsCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  permsIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  permsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  permRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  permIconWrap: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  permLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  permDesc: { fontSize: 10, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  genCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  genHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  genIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  genTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  genSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  contractBadge: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  contractBadgeText: { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  fieldGroup: { gap: 6 },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fieldLabelText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  fieldHint: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  input: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '44', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  rateRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  rateBtn: { flex: 1, minWidth: 70, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 2 },
  rateBtnValue: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  rateBtnSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  permsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  permToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 4, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  permToggleLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  validityRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  validityStat: { flex: 1, alignItems: 'center', gap: 4 },
  validityDiv: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  validityLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  validityValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  genBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  walletWarnRow: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1, borderWidth: 1, borderColor: Colors.warning + '44' },
  walletWarnText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, includeFontPadding: false },
  resultCard: { backgroundColor: Colors.successBg, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.success + '66', padding: Spacing.md, gap: Spacing.md },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultOkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  resultHeaderTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  resultOnChainBadge: { backgroundColor: Colors.primary + '22', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55' },
  resultOnChainText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  warningNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  warningNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 15, includeFontPadding: false },
  resultKeyBox: { backgroundColor: '#0D1117', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '55', gap: Spacing.sm },
  resultKeyText: { fontSize: 12, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  copyResultBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44', alignSelf: 'flex-start' },
  copyResultBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  usageCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  usageCardTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  usageCode: { backgroundColor: '#0D1117', borderRadius: Radius.sm, padding: Spacing.sm + 2 },
  usageCodeText: { fontSize: 10, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 15 },
  testCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44', gap: Spacing.md },
  testHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  testIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.success + '55', alignItems: 'center', justifyContent: 'center' },
  testTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  testExample: { gap: 5 },
  testExampleTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  testCodeBox: { backgroundColor: '#0D1117', borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, position: 'relative', paddingRight: 28 },
  testCodeText: { fontSize: 10, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 15, includeFontPadding: false },
  keySummaryBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  keySummaryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  keySummaryIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  keySummaryTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  keySummarySub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  newKeyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  newKeyBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  tipsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  tipsTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tipNum: { width: 20, height: 20, borderRadius: 6, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  tipNumText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  tipText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
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
  sdkCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  sdkHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sdkIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  sdkTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sdkBadge: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  sdkBadgeText: { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  sdkExample: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  sdkExHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, backgroundColor: Colors.bgCard },
  sdkExLang: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  sdkCodeBox: { position: 'relative', padding: Spacing.sm + 2, minHeight: 60 },
  sdkCodeText: { fontSize: 10, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 15, includeFontPadding: false },
  linkCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  linkLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  linkIconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  linkSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
});
