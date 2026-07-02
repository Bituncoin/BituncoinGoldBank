import React, { useState, useCallback, useRef } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import { useBtngWallet } from '@/hooks/useBtngWallet';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Animated, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = ['Overview', 'OAuth2', 'Webhooks', 'Node.js SDK'];

// ── Code Strings ──────────────────────────────────────────────────────────────
const OAUTH2_SERVER = [
  "// oauth2-server.js — BTNG OAuth2 Authorization Server",
  "const express  = require('express');",
  "const crypto   = require('crypto');",
  "const jwt      = require('jsonwebtoken');",
  "const fs       = require('fs');",
  "",
  "const app = express();",
  "app.use(express.json());",
  "app.use(express.urlencoded({ extended: true }));",
  "",
  "const JWT_SECRET = process.env.JWT_SECRET || 'btng_secret_2026';",
  "let oauthClients = {}, authCodes = {}, accessTokens = {}, refreshTokens = {};",
  "",
  "// Load persisted clients",
  "if (fs.existsSync('./database/oauth-clients.json'))",
  "  oauthClients = JSON.parse(fs.readFileSync('./database/oauth-clients.json'));",
  "",
  "// Register new OAuth2 app",
  "app.post('/oauth/register', async (req, res) => {",
  "  const { name, redirectUri, walletAddress } = req.body;",
  "  const clientId     = crypto.randomBytes(16).toString('hex');",
  "  const clientSecret = crypto.randomBytes(32).toString('hex');",
  "  oauthClients[clientId] = { name, clientId, clientSecret,",
  "    redirectUri, owner: walletAddress, createdAt: Date.now(),",
  "    scopes: ['read','write','mining','nodes','swap'] };",
  "  fs.writeFileSync('./database/oauth-clients.json',",
  "    JSON.stringify(oauthClients, null, 2));",
  "  res.json({ success:true, clientId, clientSecret });",
  "});",
  "",
  "// Authorization endpoint → show consent screen",
  "app.get('/oauth/authorize', (req, res) => {",
  "  const { client_id, redirect_uri, scope, state } = req.query;",
  "  const client = oauthClients[client_id];",
  "  if (!client || client.redirectUri !== redirect_uri)",
  "    return res.status(400).send('Invalid client');",
  "  res.send(consentHTML(client.name, scope, client_id, redirect_uri, state));",
  "});",
  "",
  "// User approves → issue authorization code",
  "app.get('/oauth/approve', (req, res) => {",
  "  const { client_id, redirect_uri, scope, state } = req.query;",
  "  const code = crypto.randomBytes(32).toString('hex');",
  "  authCodes[code] = { clientId: client_id, scope,",
  "    expiresAt: Date.now() + 600_000 };",
  "  res.redirect(`${redirect_uri}?code=${code}&state=${state}`);",
  "});",
  "",
  "// Token endpoint — authorization_code & refresh_token grants",
  "app.post('/oauth/token', (req, res) => {",
  "  const { grant_type, code, client_id, client_secret, refresh_token } = req.body;",
  "  if (grant_type === 'authorization_code') {",
  "    const ac = authCodes[code];",
  "    if (!ac || ac.clientId !== client_id || ac.expiresAt < Date.now())",
  "      return res.status(400).json({ error: 'Invalid or expired code' });",
  "    const access = jwt.sign({ client: client_id, scope: ac.scope },",
  "      JWT_SECRET, { expiresIn: '1h' });",
  "    const refresh = crypto.randomBytes(32).toString('hex');",
  "    accessTokens[access]  = { ...ac, expiresAt: Date.now() + 3_600_000 };",
  "    refreshTokens[refresh] = { clientId: client_id, scope: ac.scope,",
  "      access, expiresAt: Date.now() + 2_592_000_000 };",
  "    delete authCodes[code];",
  "    return res.json({ access_token: access, token_type: 'Bearer',",
  "      expires_in: 3600, refresh_token: refresh, scope: ac.scope });",
  "  }",
  "  if (grant_type === 'refresh_token') {",
  "    const rt = refreshTokens[refresh_token];",
  "    if (!rt || rt.expiresAt < Date.now())",
  "      return res.status(400).json({ error: 'Invalid refresh token' });",
  "    const access = jwt.sign({ client: rt.clientId, scope: rt.scope },",
  "      JWT_SECRET, { expiresIn: '1h' });",
  "    delete accessTokens[rt.access];",
  "    accessTokens[access] = { ...rt, expiresAt: Date.now() + 3_600_000 };",
  "    rt.access = access;",
  "    return res.json({ access_token: access, token_type: 'Bearer',",
  "      expires_in: 3600 });",
  "  }",
  "  res.status(400).json({ error: 'Unsupported grant_type' });",
  "});",
  "",
  "// OAuth2 middleware for protected routes",
  "function verifyOAuth(req, res, next) {",
  "  const raw = req.headers.authorization;",
  "  if (!raw?.startsWith('Bearer '))",
  "    return res.status(401).json({ error: 'Bearer token required' });",
  "  const token = raw.slice(7);",
  "  try {",
  "    jwt.verify(token, JWT_SECRET);",
  "    if (!accessTokens[token] || accessTokens[token].expiresAt < Date.now())",
  "      return res.status(401).json({ error: 'Token expired' });",
  "    req.token = token; next();",
  "  } catch { res.status(401).json({ error: 'Invalid token' }); }",
  "}",
  "",
  "app.get('/api/user/profile', verifyOAuth, (req, res) => {",
  "  res.json({ scope: accessTokens[req.token].scope,",
  "    message: 'Authenticated via OAuth2' });",
  "});",
  "",
  "app.listen(3003, () => console.log('OAuth2 Server on :3003'));",
].join('\n');

const WEBHOOK_SERVER = [
  "// webhook-server.js — BTNG Webhook Engine",
  "const express = require('express');",
  "const crypto  = require('crypto');",
  "const axios   = require('axios');",
  "const fs      = require('fs');",
  "",
  "const app = express();",
  "app.use(express.json());",
  "",
  "let webhooks = {}, deliveries = {};",
  "if (fs.existsSync('./database/webhooks.json'))",
  "  webhooks = JSON.parse(fs.readFileSync('./database/webhooks.json'));",
  "",
  "// Register webhook",
  "app.post('/webhooks/register', (req, res) => {",
  "  const { url, events, walletAddress } = req.body;",
  "  const id  = crypto.randomBytes(16).toString('hex');",
  "  const sec = crypto.randomBytes(32).toString('hex');",
  "  webhooks[id] = { id, url,",
  "    events: events || ['mining.reward','node.created','swap.completed'],",
  "    secret: sec, owner: walletAddress, isActive: true,",
  "    stats: { total:0, success:0, failed:0 } };",
  "  fs.writeFileSync('./database/webhooks.json',",
  "    JSON.stringify(webhooks, null, 2));",
  "  res.json({ success:true, webhookId:id, secret:sec });",
  "});",
  "",
  "// Trigger event → deliver to all matching webhooks",
  "async function trigger(event, data) {",
  "  const payload = { id: crypto.randomBytes(8).toString('hex'),",
  "    event, timestamp: Date.now(), data };",
  "  const results = [];",
  "  for (const [id, wh] of Object.entries(webhooks)) {",
  "    if (!wh.isActive || !wh.events.includes(event)) continue;",
  "    const sig = crypto.createHmac('sha256', wh.secret)",
  "      .update(JSON.stringify(payload)).digest('hex');",
  "    try {",
  "      const r = await axios.post(wh.url, payload, {",
  "        headers: { 'X-BTNG-Signature': sig, 'X-Webhook-ID': id },",
  "        timeout: 5000 });",
  "      wh.stats.total++; wh.stats.success++;",
  "      results.push({ webhookId:id, status:'success', code:r.status });",
  "    } catch (e) {",
  "      wh.stats.total++; wh.stats.failed++;",
  "      results.push({ webhookId:id, status:'failed', error:e.message });",
  "    }",
  "  }",
  "  const dId = crypto.randomBytes(8).toString('hex');",
  "  deliveries[dId] = { id:dId, event, timestamp:Date.now(), results };",
  "  return results;",
  "}",
  "",
  "// Test a specific webhook",
  "app.post('/webhooks/test/:id', async (req, res) => {",
  "  const results = await trigger('test.ping',",
  "    { message:'Test from BTNG webhook engine', ts: Date.now() });",
  "  res.json({ success:true, results });",
  "});",
  "",
  "// List webhooks for a wallet",
  "app.get('/webhooks/list/:address', (req, res) => {",
  "  const list = Object.values(webhooks)",
  "    .filter(w => w.owner.toLowerCase() === req.params.address.toLowerCase());",
  "  res.json({ success:true, webhooks: list });",
  "});",
  "",
  "// Delivery history",
  "app.get('/webhooks/deliveries/:id', (req, res) => {",
  "  const hist = Object.values(deliveries)",
  "    .filter(d => d.results.some(r => r.webhookId === req.params.id))",
  "    .slice(-50);",
  "  res.json({ success:true, deliveries: hist });",
  "});",
  "",
  "// Delete webhook",
  "app.delete('/webhooks/:id', (req, res) => {",
  "  if (!webhooks[req.params.id])",
  "    return res.status(404).json({ error: 'Not found' });",
  "  delete webhooks[req.params.id];",
  "  fs.writeFileSync('./database/webhooks.json',",
  "    JSON.stringify(webhooks, null, 2));",
  "  res.json({ success: true });",
  "});",
  "",
  "// Exposed trigger for internal use (call from api-key-server events)",
  "module.exports = { trigger };",
  "",
  "app.listen(3004, () => console.log('Webhook Engine on :3004'));",
].join('\n');

const WEBHOOK_VERIFY = [
  "// Verify incoming BTNG webhook in your receiver",
  "const crypto = require('crypto');",
  "",
  "function verifyBtngWebhook(req, secret) {",
  "  const sig = req.headers['x-btng-signature'];",
  "  if (!sig) return false;",
  "  const expected = crypto",
  "    .createHmac('sha256', secret)",
  "    .update(JSON.stringify(req.body))",
  "    .digest('hex');",
  "  return crypto.timingSafeEqual(",
  "    Buffer.from(sig),",
  "    Buffer.from(expected)",
  "  );",
  "}",
  "",
  "// Express receiver example",
  "app.post('/btng/webhook', express.json(), (req, res) => {",
  "  if (!verifyBtngWebhook(req, process.env.WEBHOOK_SECRET))",
  "    return res.status(401).send('Unauthorized');",
  "  const { event, data } = req.body;",
  "  console.log('BTNG event:', event, data);",
  "  switch (event) {",
  "    case 'mining.reward':   handleReward(data);   break;",
  "    case 'node.created':    handleNode(data);     break;",
  "    case 'swap.completed':  handleSwap(data);     break;",
  "    case 'key.generated':   handleNewKey(data);   break;",
  "  }",
  "  res.sendStatus(200);",
  "});",
].join('\n');

const SDK_PACKAGE = [
  "{",
  '  "name": "@btng/sdk",',
  '  "version": "1.0.0",',
  '  "description": "Official BTNG Gold Coin Node.js SDK",',
  '  "main": "index.js",',
  '  "types": "index.d.ts",',
  '  "keywords": ["btng","blockchain","ghana","africa","crypto"],',
  '  "license": "UBL-1.0",',
  '  "dependencies": {',
  '    "axios": "^1.6.0",',
  '    "ethers": "^6.8.0",',
  '    "crypto": "^1.0.1"',
  '  }',
  "}",
].join('\n');

const SDK_INDEX = [
  "// @btng/sdk — Official BTNG Gold Coin Node.js SDK v1.0.0",
  "const axios  = require('axios');",
  "const ethers = require('ethers');",
  "",
  "class BTNGClient {",
  "  constructor(options = {}) {",
  "    this.apiKey    = options.apiKey    || process.env.BTNG_API_KEY;",
  "    this.baseUrl   = options.baseUrl   || 'https://api.btng.gold/v1';",
  "    this.oauthUrl  = options.oauthUrl  || 'https://oauth.btng.gold';",
  "    this.rpc       = options.rpc       || 'https://rpc.btng.gold';",
  "    this._token    = null;",
  "    this._provider = new ethers.JsonRpcProvider(this.rpc);",
  "    if (!this.apiKey) throw new Error('BTNG_API_KEY is required');",
  "  }",
  "",
  "  // Internal request helper",
  "  async _req(method, path, body) {",
  "    const headers = { 'x-api-key': this.apiKey,",
  "      'Content-Type': 'application/json' };",
  "    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;",
  "    const res = await axios({ method, url: this.baseUrl + path,",
  "      data: body, headers });",
  "    return res.data;",
  "  }",
  "",
  "  // --- Balances ---",
  "  async getBalance(address) {",
  "    return this._req('GET', `/balance?address=${address}`);",
  "  }",
  "",
  "  // --- Nodes ---",
  "  async getNodes(address) {",
  "    return this._req('GET', `/nodes/${address}`);",
  "  }",
  "  async createNode(address, name, type, privateKey) {",
  "    const wallet = new ethers.Wallet(privateKey, this._provider);",
  "    const msg    = `Create ${type} node: ${name}`;",
  "    const sig    = await wallet.signMessage(msg);",
  "    return this._req('POST', '/nodes/create', { address, name, type, sig });",
  "  }",
  "  async claimRewards(address) {",
  "    return this._req('POST', '/claim', { address });",
  "  }",
  "",
  "  // --- Mining ---",
  "  async getMiningStats(address) {",
  "    return this._req('GET', `/mining/stats/${address}`);",
  "  }",
  "  async startMining(address, songHash, duration) {",
  "    return this._req('POST', '/mining/start',",
  "      { address, songHash, duration });",
  "  }",
  "",
  "  // --- Swap ---",
  "  async swapAfnToBtng(address, amount) {",
  "    return this._req('POST', '/swap', { address, amount });",
  "  }",
  "",
  "  // --- Market ---",
  "  async getGoldPrice() {",
  "    return this._req('GET', '/market/gold-price');",
  "  }",
  "  async getKeyStats() {",
  "    return this._req('GET', '/key-stats');",
  "  }",
  "",
  "  // --- OAuth2 helpers ---",
  "  buildAuthUrl(clientId, redirectUri, scopes, state) {",
  "    const p = new URLSearchParams({ client_id: clientId,",
  "      redirect_uri: redirectUri, response_type: 'code',",
  "      scope: scopes.join(' '), state });",
  "    return `${this.oauthUrl}/oauth/authorize?${p}`;",
  "  }",
  "  async exchangeCode(code, clientId, clientSecret, redirectUri) {",
  "    const r = await axios.post(`${this.oauthUrl}/oauth/token`, {",
  "      grant_type: 'authorization_code',",
  "      code, client_id: clientId, client_secret: clientSecret,",
  "      redirect_uri: redirectUri });",
  "    this._token = r.data.access_token;",
  "    return r.data;",
  "  }",
  "  async refreshToken(refreshToken, clientId, clientSecret) {",
  "    const r = await axios.post(`${this.oauthUrl}/oauth/token`, {",
  "      grant_type: 'refresh_token',",
  "      refresh_token: refreshToken,",
  "      client_id: clientId, client_secret: clientSecret });",
  "    this._token = r.data.access_token;",
  "    return r.data;",
  "  }",
  "",
  "  // --- Webhooks ---",
  "  async registerWebhook(url, events, walletAddress) {",
  "    return this._req('POST', '/webhooks/register',",
  "      { url, events, walletAddress });",
  "  }",
  "  async listWebhooks(address) {",
  "    return this._req('GET', `/webhooks/list/${address}`);",
  "  }",
  "  async testWebhook(id) {",
  "    return this._req('POST', `/webhooks/test/${id}`, {});",
  "  }",
  "  async deleteWebhook(id) {",
  "    return this._req('DELETE', `/webhooks/${id}`, {});",
  "  }",
  "}",
  "",
  "module.exports = { BTNGClient };",
].join('\n');

const SDK_TYPESCRIPT = [
  "// index.d.ts — TypeScript definitions for @btng/sdk",
  "",
  "export interface BTNGClientOptions {",
  "  apiKey?:   string;",
  "  baseUrl?:  string;",
  "  oauthUrl?: string;",
  "  rpc?:      string;",
  "}",
  "export interface BalanceResult {",
  "  success: boolean; address: string; balance: string; asset: string;",
  "}",
  "export interface NodeResult {",
  "  id: string; name: string; type: string; hashRate: string;",
  "}",
  "export interface GoldPriceResult {",
  "  goldUSD: number; btngUSD: number; ghsRate: number; source: string;",
  "}",
  "export interface OAuthTokenResult {",
  "  access_token: string; token_type: string; expires_in: number;",
  "  refresh_token?: string; scope: string;",
  "}",
  "export interface WebhookResult {",
  "  success: boolean; webhookId: string; secret: string;",
  "}",
  "",
  "export declare class BTNGClient {",
  "  constructor(options?: BTNGClientOptions);",
  "  getBalance(address: string): Promise<BalanceResult>;",
  "  getNodes(address: string): Promise<{ nodes: NodeResult[] }>;",
  "  createNode(addr: string, name: string, type: string, pk: string): Promise<any>;",
  "  claimRewards(address: string): Promise<any>;",
  "  getMiningStats(address: string): Promise<any>;",
  "  startMining(addr: string, songHash: string, duration: number): Promise<any>;",
  "  swapAfnToBtng(address: string, amount: string): Promise<any>;",
  "  getGoldPrice(): Promise<GoldPriceResult>;",
  "  getKeyStats(): Promise<any>;",
  "  buildAuthUrl(clientId: string, redirectUri: string, scopes: string[], state: string): string;",
  "  exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<OAuthTokenResult>;",
  "  refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<OAuthTokenResult>;",
  "  registerWebhook(url: string, events: string[], walletAddress: string): Promise<WebhookResult>;",
  "  listWebhooks(address: string): Promise<any>;",
  "  testWebhook(id: string): Promise<any>;",
  "  deleteWebhook(id: string): Promise<any>;",
  "}",
].join('\n');

const SDK_USAGE = [
  "const { BTNGClient } = require('@btng/sdk');",
  "",
  "const btng = new BTNGClient({",
  "  apiKey: process.env.BTNG_API_KEY,",
  "  // baseUrl, oauthUrl, rpc optional",
  "});",
  "",
  "// Get BTNG balance",
  "const { balance } = await btng.getBalance('0xYourAddress');",
  "console.log('Balance:', balance, 'BTNG');",
  "",
  "// Get gold oracle price",
  "const { goldUSD, btngUSD } = await btng.getGoldPrice();",
  "console.log(`Gold $${goldUSD}/oz  BTNG $${btngUSD}`);",
  "",
  "// Get node portfolio",
  "const { nodes } = await btng.getNodes('0xYourAddress');",
  "nodes.forEach(n => console.log(n.name, n.type, n.hashRate));",
  "",
  "// OAuth2 — build consent URL",
  "const url = btng.buildAuthUrl(",
  "  'YOUR_CLIENT_ID',",
  "  'https://yourapp.com/callback',",
  "  ['read', 'nodes', 'mining'],",
  "  'random_state_xyz'",
  ");",
  "console.log('Redirect user to:', url);",
  "",
  "// OAuth2 — exchange code for tokens",
  "const tokens = await btng.exchangeCode(",
  "  req.query.code, CLIENT_ID, CLIENT_SECRET,",
  "  'https://yourapp.com/callback'",
  ");",
  "console.log('Access token:', tokens.access_token);",
  "",
  "// Register webhook",
  "const wh = await btng.registerWebhook(",
  "  'https://yourapp.com/btng-webhook',",
  "  ['mining.reward', 'node.created', 'swap.completed'],",
  "  '0xYourAddress'",
  ");",
  "console.log('Webhook ID:', wh.webhookId);",
  "console.log('Secret (save this):', wh.secret);",
].join('\n');

const PM2_COMMANDS = [
  "# Start all three servers with PM2",
  "pm2 start api-key-server.js  --name btng-api",
  "pm2 start oauth2-server.js   --name btng-oauth",
  "pm2 start webhook-server.js  --name btng-webhooks",
  "",
  "pm2 startup && pm2 save",
  "",
  "# Check status",
  "pm2 list",
  "pm2 logs btng-oauth",
  "pm2 logs btng-webhooks",
].join('\n');

// ── One-Tap Install Script ────────────────────────────────────────────────────
const INSTALL_SCRIPT = [
  '#!/usr/bin/env bash',
  '# BTNG SDK One-Tap Install Script',
  '# Usage: bash btng-setup.sh',
  '',
  'echo "Installing @btng/sdk and dotenv..."',
  'npm install @btng/sdk dotenv',
  '',
  'echo "Creating .env template..."',
  'cat > .env << ENVEOF',
  '# BTNG API Configuration',
  'BTNG_API_KEY=BTNG_YOUR_KEY_HERE',
  'BTNG_BASE_URL=https://api.btng.gold/v1',
  'BTNG_OAUTH_URL=https://oauth.btng.gold',
  'BTNG_RPC_URL=https://rpc.btng.gold',
  'ENVEOF',
  '',
  'echo "Writing connectivity test to btng-test.js..."',
  'cat > btng-test.js << JSEOF',
  "require('dotenv').config();",
  "const { BTNGClient } = require('@btng/sdk');",
  'const btng = new BTNGClient({ apiKey: process.env.BTNG_API_KEY });',
  'async function main() {',
  "  console.log('Testing BTNG SDK connection...');",
  '  const result = await btng.getGoldPrice();',
  '  console.log(JSON.stringify(result, null, 2));',
  "  if (result.goldUSD) console.log('SUCCESS: Gold =', result.goldUSD, 'USD');",
  "  else console.warn('Connected but no goldUSD field returned.');",
  '}',
  "main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });",
  'JSEOF',
  '',
  'echo "Running getGoldPrice() connectivity test..."',
  'node btng-test.js',
  '',
  'echo ""',
  'echo "Setup complete!"',
  'echo "  1. Edit .env and set BTNG_API_KEY=your_real_key"',
  'echo "  2. node btng-test.js"',
].join('\n');

// ── Code Block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, title, lang = 'javascript' }: { code: string; title: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    ExpoClipboard.setStringAsync(code).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [code]);
  return (
    <View style={cb.card}>
      <View style={cb.header}>
        <View style={cb.hLeft}>
          <View style={cb.badge}><Text style={cb.badgeText}>{lang}</Text></View>
          <Text style={cb.title} numberOfLines={1}>{title}</Text>
        </View>
        <TouchableOpacity style={[cb.copy, copied && cb.copyDone]} onPress={handleCopy} activeOpacity={0.8}>
          <MaterialIcons name={copied ? 'check-circle' : 'copy-all'} size={13} color={copied ? Colors.success : Colors.primary} />
          <Text style={[cb.copyText, copied && { color: Colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
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
  badge: { backgroundColor: Colors.primary + '22', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, flex: 1, includeFontPadding: false },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  copyText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  scroll: { maxHeight: 300 },
  code: { fontSize: 10.5, color: '#E6EDF3', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, padding: Spacing.md, includeFontPadding: false },
});

// ── Feature Card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, label, sub, color }: { icon: string; label: string; sub: string; color: string }) {
  return (
    <View style={[fc.card, { borderColor: color + '33' }]}>
      <MaterialIcons name={icon as any} size={15} color={color} />
      <Text style={[fc.label, { color }]}>{label}</Text>
      <Text style={fc.sub}>{sub}</Text>
    </View>
  );
}

const fc = StyleSheet.create({
  card: { width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 3, borderWidth: 1, gap: 4, minWidth: 130 },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  sub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});

// ── Step Row ──────────────────────────────────────────────────────────────────
function StepRow({ n, title, cmd, onCopy }: { n: string; title: string; cmd: string; onCopy: (c: string) => void }) {
  return (
    <View style={sr.row}>
      <View style={sr.num}><Text style={sr.numText}>{n}</Text></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={sr.title}>{title}</Text>
        <TouchableOpacity style={sr.cmd} onPress={() => onCopy(cmd)} activeOpacity={0.75}>
          <Text style={sr.cmdText}>{cmd}</Text>
          <MaterialIcons name="copy-all" size={11} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  num: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  numText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cmd: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0D1117', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  cmdText: { flex: 1, fontSize: 10, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ── Webhook Event Badge ───────────────────────────────────────────────────────
function EventBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[eb.chip, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <View style={[eb.dot, { backgroundColor: color }]} />
      <Text style={[eb.text, { color }]}>{label}</Text>
    </View>
  );
}

const eb = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  text: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.3, includeFontPadding: false },
});

// ── Colored JSON Renderer ────────────────────────────────────────────────────
function ColoredJSON({ data, depth }: { data: any; depth: number }) {
  if (data === null) return <Text style={cj.nullVal}>null</Text>;
  if (typeof data === 'boolean') return <Text style={cj.boolVal}>{String(data)}</Text>;
  if (typeof data === 'number') return <Text style={cj.numVal}>{data}</Text>;
  if (typeof data === 'string') return <Text style={cj.strVal}>{JSON.stringify(data)}</Text>;
  if (Array.isArray(data)) {
    if (data.length === 0) return <Text style={cj.bracket}>[]</Text>;
    return (
      <View>
        <Text style={cj.bracket}>[</Text>
        {data.map((item, i) => (
          <View key={i} style={{ paddingLeft: 12 }}>
            <ColoredJSON data={item} depth={depth + 1} />
            {i < data.length - 1 && <Text style={cj.comma}>,</Text>}
          </View>
        ))}
        <Text style={cj.bracket}>]</Text>
      </View>
    );
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return <Text style={cj.bracket}>{'{}'}</Text>;
    return (
      <View>
        <Text style={cj.bracket}>{'{'}</Text>
        {keys.map((key, i) => (
          <View key={key} style={{ paddingLeft: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Text style={cj.key}>{JSON.stringify(key)}</Text>
            <Text style={cj.colon}>: </Text>
            <ColoredJSON data={data[key]} depth={depth + 1} />
            {i < keys.length - 1 && <Text style={cj.comma}>,</Text>}
          </View>
        ))}
        <Text style={cj.bracket}>{'}'}</Text>
      </View>
    );
  }
  return <Text style={cj.strVal}>{String(data)}</Text>;
}

const cj = StyleSheet.create({
  bracket: { fontSize: 11, color: '#E6EDF3', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  key:     { fontSize: 11, color: Colors.kenteGold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  colon:   { fontSize: 11, color: '#E6EDF3', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  strVal:  { fontSize: 11, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  numVal:  { fontSize: 11, color: '#79C0FF', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  boolVal: { fontSize: 11, color: '#FF7B72', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  nullVal: { fontSize: 11, color: '#FF7B72', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  comma:   { fontSize: 11, color: '#E6EDF3', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngApiExtensionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState(0);
  const { address: walletAddress, phase: walletPhase } = useBtngWallet();
  const walletAddr = (walletPhase === 'existing' || walletPhase === 'genesis') ? (walletAddress ?? '') : '';

  const SDK_PLAY_METHODS = [
    { name: 'getBalance',       scope: 'Read',     color: '#3B82F6', httpMethod: 'GET',  endpoint: '/balance',                needsAddress: true,  needsAmount: false, desc: 'Fetch on-chain BTNG balance' },
    { name: 'getGoldPrice',     scope: 'Read',     color: '#3B82F6', httpMethod: 'GET',  endpoint: '/market/gold-price',       needsAddress: false, needsAmount: false, desc: 'Live gold oracle price USD/GHS' },
    { name: 'getKeyStats',      scope: 'Read',     color: '#3B82F6', httpMethod: 'GET',  endpoint: '/key-stats',               needsAddress: false, needsAmount: false, desc: 'API key usage & expiry info' },
    { name: 'getNodes',         scope: 'Nodes',    color: '#9945FF', httpMethod: 'GET',  endpoint: '/nodes/{address}',         needsAddress: true,  needsAmount: false, desc: 'Node portfolio for address' },
    { name: 'getMiningStats',   scope: 'Mining',   color: Colors.kenteGold, httpMethod: 'GET', endpoint: '/mining/stats/{address}', needsAddress: true, needsAmount: false, desc: 'Miner hash rate & rewards' },
    { name: 'claimRewards',     scope: 'Write',    color: '#22C55E', httpMethod: 'POST', endpoint: '/claim',                   needsAddress: true,  needsAmount: false, desc: 'Claim all pending rewards' },
    { name: 'startMining',      scope: 'Mining',   color: Colors.kenteGold, httpMethod: 'POST', endpoint: '/mining/start',  needsAddress: true,  needsAmount: false, desc: 'Prepare mine-with-music tx' },
    { name: 'swapAfnToBtng',    scope: 'Swap',     color: '#EF4444', httpMethod: 'POST', endpoint: '/swap',                    needsAddress: true,  needsAmount: true,  desc: 'Swap AFN → BTNG (2% fee)' },
    { name: 'registerWebhook',  scope: 'Webhooks', color: Colors.warning, httpMethod: 'POST', endpoint: '/webhooks/register', needsAddress: true,  needsAmount: false, desc: 'Register webhook for events' },
    { name: 'listWebhooks',     scope: 'Webhooks', color: Colors.warning, httpMethod: 'GET',  endpoint: '/webhooks/list/{address}', needsAddress: true, needsAmount: false, desc: 'List webhooks for wallet' },
    { name: 'buildAuthUrl',     scope: 'OAuth2',   color: '#9945FF', httpMethod: 'LOCAL', endpoint: null,                     needsAddress: false, needsAmount: false, desc: 'Build OAuth2 consent URL' },
    { name: 'exchangeCode',     scope: 'OAuth2',   color: '#9945FF', httpMethod: 'LOCAL', endpoint: null,                     needsAddress: false, needsAmount: false, desc: 'Exchange auth code for tokens' },
    { name: 'refreshToken',     scope: 'OAuth2',   color: '#9945FF', httpMethod: 'LOCAL', endpoint: null,                     needsAddress: false, needsAmount: false, desc: 'Rotate access token' },
    { name: 'testWebhook',      scope: 'Webhooks', color: Colors.warning, httpMethod: 'LOCAL', endpoint: null,               needsAddress: false, needsAmount: false, desc: 'Fire a test.ping event' },
  ];
  const [playMethod, setPlayMethod] = useState(SDK_PLAY_METHODS[0]);
  const [playMenuOpen, setPlayMenuOpen] = useState(false);
  const [playAddress, setPlayAddress] = useState(walletAddr);
  const [playAmount, setPlayAmount] = useState('1000');
  const [playLoading, setPlayLoading] = useState(false);
  const [playResponse, setPlayResponse] = useState<any>(null);
  const [playLatency, setPlayLatency] = useState<number | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  const runPlayground = useCallback(async () => {
    setPlayLoading(true);
    setPlayResponse(null);
    setPlayError(null);
    setPlayLatency(null);
    const BASE = 'https://api.btng.gold/v1';
    const DEMO_KEY = 'BTNG_DEMO_PLAYGROUND_KEY';
    const t0 = Date.now();
    try {
      if (playMethod.httpMethod === 'LOCAL') {
        await new Promise(r => setTimeout(r, 420 + Math.random() * 180));
        const localResponses: Record<string, any> = {
          buildAuthUrl: {
            url: `https://oauth.btng.gold/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://yourapp.com/callback&response_type=code&scope=read+nodes&state=abc123`,
            note: 'Redirect your user to this URL to begin OAuth2 flow',
          },
          exchangeCode: {
            access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnQiOiJZT1VSX0NMSUVOVF9JRCJ9.DEMO_JWT',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'btng_rt_' + Math.random().toString(36).slice(2),
            scope: 'read nodes',
          },
          refreshToken: {
            access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnQiOiJZT1VSX0NMSUVOVF9JRCJ9.REFRESHED_JWT',
            token_type: 'Bearer',
            expires_in: 3600,
          },
          testWebhook: {
            success: true,
            message: 'test.ping delivered',
            results: [{ webhookId: 'demo_wh_id', status: 'success', code: 200 }],
            timestamp: Date.now(),
          },
        };
        setPlayLatency(Date.now() - t0);
        setPlayResponse(localResponses[playMethod.name] ?? { note: 'Local method — no HTTP call needed' });
        return;
      }
      let url = BASE + playMethod.endpoint!.replace('{address}', playAddress || '0x0000000000000000000000000000000000000000');
      const options: any = { headers: { 'x-api-key': DEMO_KEY, 'Content-Type': 'application/json' } };
      if (playMethod.httpMethod === 'GET') {
        if (playMethod.needsAddress && playMethod.endpoint!.includes('?') === false && !playMethod.endpoint!.includes('{address}')) {
          url += `?address=${playAddress}`;
        }
      } else {
        options.method = 'POST';
        const body: any = {};
        if (playMethod.needsAddress) body.address = playAddress;
        if (playMethod.needsAmount) body.amount = playAmount;
        if (playMethod.name === 'startMining') {
          body.songHash = 'demo_' + Math.random().toString(36).slice(2);
          body.duration = 60;
        }
        if (playMethod.name === 'registerWebhook') {
          body.url = 'https://yourapp.com/btng-webhook';
          body.events = ['mining.reward', 'node.created'];
          body.walletAddress = playAddress;
        }
        options.body = JSON.stringify(body);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      setPlayLatency(Date.now() - t0);
      let data: any;
      try { data = await res.json(); } catch { data = { raw: await res.text?.() ?? 'no body' }; }
      setPlayResponse(data);
    } catch (err: any) {
      setPlayLatency(Date.now() - t0);
      if (err?.name === 'AbortError') {
        setPlayError('Request timed out after 6s — the API server may not be deployed yet.');
        setPlayResponse({ hint: 'Deploy api-key-server.js and set BASE_URL to your server.', docs: 'See Deploy tab for setup instructions.' });
      } else if (err?.message?.includes('Network request failed') || err?.message?.includes('Failed to fetch') || err?.message?.includes('CORS')) {
        setPlayError('Cannot reach api.btng.gold — endpoint not deployed or CORS blocked in preview.');
        setPlayResponse({
          simulation: true,
          method: playMethod.name,
          address: playAddress,
          note: 'This is a simulated response. Deploy the server to get live data.',
          ...(playMethod.name === 'getBalance' ? { success: true, balance: '1,248.0000', asset: 'BTNG', address: playAddress } :
             playMethod.name === 'getGoldPrice' ? { success: true, goldUSD: 3325.80, btngUSD: 3.326, ghsRate: 15.5, source: 'simulated' } :
             playMethod.name === 'getNodes' ? { success: true, nodes: [{ id: '1', name: 'Ghana Node Alpha', type: 'HEAVY', hashRate: '2000' }] } :
             playMethod.name === 'getMiningStats' ? { success: true, hashRate: '100', pendingRewards: '0.42', isActive: true } :
             { success: true, message: 'Simulated success' }),
        });
      } else {
        setPlayError(err?.message ?? 'Unknown error');
        setPlayResponse(null);
      }
    } finally {
      setPlayLoading(false);
    }
  }, [playMethod, playAddress, playAmount]);

  const copyCmd = useCallback((cmd: string) => {
    ExpoClipboard.setStringAsync(cmd).catch(()=>{});
    showAlert('Copied', cmd);
  }, [showAlert]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG API Extension</Text>
          <Text style={s.topSub}>OAuth2 · Webhooks · Node.js SDK</Text>
        </View>
        <View style={s.pill}><View style={s.pillDot} /><Text style={s.pillText}>v1.0</Text></View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBarContent}>
          {TABS.map((tab, i) => (
            <TouchableOpacity key={tab} style={[s.tab, activeTab === i && s.tabActive]} onPress={() => setActiveTab(i)} activeOpacity={0.8}>
              <Text style={[s.tabText, activeTab === i && s.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── OVERVIEW ── */}
        {activeTab === 0 && (
          <View style={s.section}>
            <View style={s.heroCard}>
              <View style={s.heroLeft}>
                <View style={s.heroIconWrap}><Text style={{ fontSize: 28 }}>🔐</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.heroTitle}>Production-Ready API Extension</Text>
                  <Text style={s.heroSub}>Three production-grade modules to complete the BTNG developer ecosystem</Text>
                </View>
              </View>
              <View style={s.heroBadgeRow}>
                {['OAuth2', 'Webhooks', 'SDK'].map(b => (
                  <View key={b} style={s.heroBadge}><Text style={s.heroBadgeText}>{b}</Text></View>
                ))}
              </View>
            </View>

            {[
              {
                icon: 'lock-open', color: '#9945FF', title: 'OAuth2 Server',
                port: ':3003', desc: 'Industry-standard authorization_code + refresh_token flow. Wallet-signed client registration, JWT access tokens, consent screen.',
                features: ['Client registration via EIP-191 signature', 'Authorization code flow (RFC 6749)', 'JWT access tokens (1h expiry)', '30-day refresh token rotation', 'Bearer token middleware for all API routes'],
              },
              {
                icon: 'webhook', color: Colors.kenteGold, title: 'Webhook Engine',
                port: ':3004', desc: 'Real-time event delivery with HMAC-SHA256 signature verification. Automatic retry, delivery history, and per-event filtering.',
                features: ['9 event types (mining, nodes, swap, keys)', 'HMAC-SHA256 per-webhook secret signing', 'Retry on failure with delivery log', 'Per-webhook event filter registration', 'Test ping endpoint for integration checks'],
              },
              {
                icon: 'integration-instructions', color: '#22C55E', title: 'Node.js SDK',
                port: 'npm', desc: 'Typed JavaScript/TypeScript client wrapping all 11 API endpoints plus OAuth2 helpers and webhook management.',
                features: ['Full TypeScript definitions (index.d.ts)', 'All 11 REST endpoints as async methods', 'Built-in OAuth2 flow helpers', 'Webhook CRUD management', 'Ethers.js v6 for on-chain signing'],
              },
            ].map(mod => (
              <View key={mod.title} style={[s.moduleCard, { borderColor: mod.color + '44' }]}>
                <View style={s.moduleHeader}>
                  <View style={[s.moduleIconWrap, { backgroundColor: mod.color + '18', borderColor: mod.color + '44' }]}>
                    <MaterialIcons name={mod.icon as any} size={20} color={mod.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.moduleTitleRow}>
                      <Text style={[s.moduleTitle, { color: mod.color }]}>{mod.title}</Text>
                      <View style={[s.modulePortBadge, { backgroundColor: mod.color + '18', borderColor: mod.color + '44' }]}>
                        <Text style={[s.modulePortText, { color: mod.color }]}>{mod.port}</Text>
                      </View>
                    </View>
                    <Text style={s.moduleDesc}>{mod.desc}</Text>
                  </View>
                </View>
                <View style={s.moduleFeatures}>
                  {mod.features.map(f => (
                    <View key={f} style={s.moduleFeatureRow}>
                      <MaterialIcons name="check-circle" size={11} color={mod.color} />
                      <Text style={s.moduleFeatureText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <View style={s.fileCard}>
              <View style={s.fileHeader}>
                <View style={s.fileIconWrap}><MaterialIcons name="folder" size={14} color={Colors.warning} /></View>
                <Text style={s.fileTitle}>Extension Project Structure</Text>
              </View>
              {[
                { indent: 0, icon: 'folder',            name: 'BTNG-API-Extension/',    color: Colors.warning },
                { indent: 1, icon: 'insert-drive-file', name: 'oauth2-server.js',       color: '#9945FF' },
                { indent: 1, icon: 'insert-drive-file', name: 'webhook-server.js',      color: Colors.kenteGold },
                { indent: 1, icon: 'folder',            name: 'sdk/',                    color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'index.js',               color: '#22C55E' },
                { indent: 2, icon: 'insert-drive-file', name: 'index.d.ts',             color: '#3B82F6' },
                { indent: 2, icon: 'insert-drive-file', name: 'package.json',           color: Colors.textMuted },
                { indent: 1, icon: 'folder',            name: 'database/',               color: Colors.warning },
                { indent: 2, icon: 'insert-drive-file', name: 'oauth-clients.json',     color: Colors.textMuted },
                { indent: 2, icon: 'insert-drive-file', name: 'webhooks.json',          color: Colors.textMuted },
                { indent: 1, icon: 'insert-drive-file', name: '.env',                    color: Colors.textMuted },
              ].map((item, idx) => (
                <View key={idx} style={[s.fileRow, { paddingLeft: item.indent * 14 + Spacing.sm }]}>
                  <MaterialIcons name={item.icon as any} size={12} color={item.color} />
                  <Text style={[s.fileName, { color: item.color }]}>{item.name}</Text>
                </View>
              ))}
            </View>

            <View style={s.stepsCard}>
              <View style={s.stepsHeader}>
                <View style={s.stepsIconWrap}><MaterialIcons name="rocket-launch" size={14} color={Colors.primary} /></View>
                <Text style={s.stepsTitle}>Quick Setup</Text>
              </View>
              {[
                { n:'1', title:'Install dependencies', cmd:'npm install jsonwebtoken axios express ethers' },
                { n:'2', title:'Create database folder', cmd:'mkdir -p database && echo "{}" > database/oauth-clients.json' },
                { n:'3', title:'Set environment variables', cmd:'JWT_SECRET=btng_secret  PRIVATE_KEY=0x...' },
                { n:'4', title:'Start OAuth2 server', cmd:'node oauth2-server.js' },
                { n:'5', title:'Start Webhook engine', cmd:'node webhook-server.js' },
                { n:'6', title:'PM2 — all servers persistent', cmd:'pm2 start oauth2-server.js --name btng-oauth' },
              ].map(step => (
                <StepRow key={step.n} n={step.n} title={step.title} cmd={step.cmd} onCopy={copyCmd} />
              ))}
            </View>

            <TouchableOpacity style={s.linkCard} onPress={() => router.push('/btng-api-key-generator' as any)} activeOpacity={0.85}>
              <View style={s.linkLeft}>
                <View style={s.linkIconWrap}><MaterialIcons name="vpn-key" size={20} color={Colors.primary} /></View>
                <View>
                  <Text style={s.linkTitle}>API Key Generator</Text>
                  <Text style={s.linkSub}>On-chain keys · 6 scopes · 11 endpoints</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── OAUTH2 ── */}
        {activeTab === 1 && (
          <View style={s.section}>
            <View style={[s.moduleCard, { borderColor: '#9945FF44' }]}>
              <View style={s.moduleHeader}>
                <View style={[s.moduleIconWrap, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                  <MaterialIcons name="lock-open" size={20} color="#9945FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.moduleTitle, { color: '#9945FF' }]}>OAuth2 Authorization Server</Text>
                  <Text style={s.moduleDesc}>RFC 6749 compliant · Wallet-signed client registration · JWT tokens</Text>
                </View>
                <View style={[s.modulePortBadge, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                  <Text style={[s.modulePortText, { color: '#9945FF' }]}>:3003</Text>
                </View>
              </View>
            </View>

            <View style={s.flowCard}>
              <View style={s.flowHeader}>
                <View style={s.flowIconWrap}><MaterialIcons name="alt-route" size={14} color="#9945FF" /></View>
                <Text style={s.flowTitle}>Authorization Code Flow</Text>
              </View>
              {[
                { n:'1', label:'Register App', desc:'POST /oauth/register — wallet-signed', color:'#9945FF' },
                { n:'2', label:'Redirect User', desc:'GET /oauth/authorize?client_id=…', color:'#3B82F6' },
                { n:'3', label:'Consent Screen', desc:'User approves → /oauth/approve', color:'#22C55E' },
                { n:'4', label:'Authorization Code', desc:'Redirect with ?code=…&state=…', color:Colors.kenteGold },
                { n:'5', label:'Exchange Code', desc:'POST /oauth/token (grant_type=authorization_code)', color:'#EF4444' },
                { n:'6', label:'Access Token', desc:'JWT Bearer token (1h) + refresh token (30d)', color:Colors.primary },
              ].map(step => (
                <View key={step.n} style={s.flowRow}>
                  <View style={[s.flowNum, { backgroundColor: step.color + '22', borderColor: step.color + '55' }]}>
                    <Text style={[s.flowNumText, { color: step.color }]}>{step.n}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.flowLabel}>{step.label}</Text>
                    <Text style={s.flowDesc}>{step.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={s.endCard}>
              <Text style={s.endTitle}>OAUTH2 ENDPOINTS</Text>
              {[
                { method:'POST', path:'/oauth/register',  desc:'Register new OAuth2 application' },
                { method:'GET',  path:'/oauth/authorize', desc:'Authorization / consent screen' },
                { method:'GET',  path:'/oauth/approve',   desc:'Issue authorization code after approval' },
                { method:'POST', path:'/oauth/token',     desc:'Exchange code or refresh token for access token' },
                { method:'GET',  path:'/api/user/profile',desc:'Protected route — requires Bearer token' },
              ].map(ep => {
                const mc = ep.method === 'GET' ? '#22C55E' : '#3B82F6';
                return (
                  <View key={ep.path} style={s.endRow}>
                    <View style={[s.endMethod, { backgroundColor: mc + '18', borderColor: mc + '44' }]}>
                      <Text style={[s.endMethodText, { color: mc }]}>{ep.method}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.endPath}>{ep.path}</Text>
                      <Text style={s.endDesc}>{ep.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <CodeBlock code={OAUTH2_SERVER} title="oauth2-server.js" lang="javascript" />

            <View style={s.usageCard}>
              <Text style={s.usageTitle}>Quick Client-Side Usage</Text>
              {[
                { lang:'JS', code:"const url = btng.buildAuthUrl(CLIENT_ID, REDIRECT_URI, ['read','nodes'], 'state_abc');\nwindow.location.href = url;" },
                { lang:'JS', code:"// After redirect back with ?code=...\nconst tokens = await btng.exchangeCode(code, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);\nconsole.log(tokens.access_token);" },
                { lang:'JS', code:"// Refresh when expired\nconst refreshed = await btng.refreshToken(tokens.refresh_token, CLIENT_ID, CLIENT_SECRET);\nconsole.log(refreshed.access_token);" },
              ].map((ex, i) => (
                <TouchableOpacity key={i} style={s.usageSnippet} onPress={() => { ExpoClipboard.setStringAsync(ex.code).catch(()=>{}); showAlert('Copied', 'Snippet copied.'); }} activeOpacity={0.8}>
                  <View style={s.usageSnippetHeader}>
                    <View style={s.usageLangBadge}><Text style={s.usageLangText}>{ex.lang}</Text></View>
                    <MaterialIcons name="copy-all" size={11} color={Colors.textMuted} />
                  </View>
                  <Text style={s.usageCode}>{ex.code}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── WEBHOOKS ── */}
        {activeTab === 2 && (
          <View style={s.section}>
            <View style={[s.moduleCard, { borderColor: Colors.kenteGold + '44' }]}>
              <View style={s.moduleHeader}>
                <View style={[s.moduleIconWrap, { backgroundColor: Colors.kenteGold + '18', borderColor: Colors.kenteGold + '44' }]}>
                  <MaterialIcons name="webhook" size={20} color={Colors.kenteGold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.moduleTitle, { color: Colors.kenteGold }]}>BTNG Webhook Engine</Text>
                  <Text style={s.moduleDesc}>Real-time event delivery · HMAC-SHA256 signatures · Delivery history</Text>
                </View>
                <View style={[s.modulePortBadge, { backgroundColor: Colors.kenteGold + '18', borderColor: Colors.kenteGold + '44' }]}>
                  <Text style={[s.modulePortText, { color: Colors.kenteGold }]}>:3004</Text>
                </View>
              </View>
            </View>

            <View style={s.eventsCard}>
              <View style={s.eventsHeader}>
                <View style={s.eventsIconWrap}><MaterialIcons name="bolt" size={14} color={Colors.kenteGold} /></View>
                <Text style={s.eventsTitle}>9 Event Types</Text>
              </View>
              <View style={s.eventsGrid}>
                <EventBadge label="mining.reward"     color={Colors.kenteGold} />
                <EventBadge label="node.created"      color="#9945FF" />
                <EventBadge label="node.reward"       color="#9945FF" />
                <EventBadge label="swap.completed"    color="#EF4444" />
                <EventBadge label="key.generated"     color={Colors.primary} />
                <EventBadge label="key.revoked"       color={Colors.error} />
                <EventBadge label="wallet.connected"  color="#22C55E" />
                <EventBadge label="payment.received"  color={Colors.warning} />
                <EventBadge label="test.ping"         color={Colors.textMuted} />
              </View>
            </View>

            <View style={s.endCard}>
              <Text style={s.endTitle}>WEBHOOK MANAGEMENT ENDPOINTS</Text>
              {[
                { method:'POST',   path:'/webhooks/register',      desc:'Register a new webhook URL + events' },
                { method:'GET',    path:'/webhooks/list/:address',  desc:'List all webhooks for a wallet' },
                { method:'POST',   path:'/webhooks/test/:id',       desc:'Send a test.ping event immediately' },
                { method:'GET',    path:'/webhooks/deliveries/:id', desc:'Last 50 delivery attempts + status' },
                { method:'DELETE', path:'/webhooks/:id',            desc:'Permanently remove a webhook' },
              ].map(ep => {
                const mc = ep.method === 'GET' ? '#22C55E' : ep.method === 'DELETE' ? '#EF4444' : '#3B82F6';
                return (
                  <View key={ep.path} style={s.endRow}>
                    <View style={[s.endMethod, { backgroundColor: mc + '18', borderColor: mc + '44' }]}>
                      <Text style={[s.endMethodText, { color: mc }]}>{ep.method}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.endPath}>{ep.path}</Text>
                      <Text style={s.endDesc}>{ep.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <CodeBlock code={WEBHOOK_SERVER} title="webhook-server.js" lang="javascript" />
            <CodeBlock code={WEBHOOK_VERIFY} title="receiver-verification.js" lang="javascript" />

            <View style={s.payloadCard}>
              <View style={s.payloadHeader}>
                <View style={s.payloadIconWrap}><MaterialIcons name="data-object" size={13} color={Colors.kenteGold} /></View>
                <Text style={s.payloadTitle}>Example Payload — mining.reward</Text>
              </View>
              <TouchableOpacity
                style={s.payloadBody}
                onPress={() => {
                  const ex = '{\n  "id": "a1b2c3d4",\n  "event": "mining.reward",\n  "timestamp": 1748920000000,\n  "data": {\n    "address": "0x...",\n    "nodeId": "3",\n    "amount": "0.42",\n    "asset": "BTNG"\n  }\n}';
                  ExpoClipboard.setStringAsync(ex).catch(()=>{});
                  showAlert('Copied', 'Payload example copied.');
                }}
                activeOpacity={0.8}
              >
                <Text style={s.payloadCode}>
                  {'{\n  "id": "a1b2c3d4",\n  "event": "mining.reward",\n  "timestamp": 1748920000000,\n  "data": {\n    "address": "0xYour...",\n    "nodeId": "3",\n    "amount": "0.42",\n    "asset": "BTNG"\n  }\n}'}
                </Text>
                <View style={s.payloadCopyChip}>
                  <MaterialIcons name="copy-all" size={11} color={Colors.textMuted} />
                  <Text style={s.payloadCopyText}>Copy</Text>
                </View>
              </TouchableOpacity>
              <View style={s.sigNote}>
                <MaterialIcons name="security" size={11} color={Colors.kenteGold} />
                <Text style={s.sigNoteText}>Each delivery includes <Text style={{ color: Colors.kenteGold, fontWeight: FontWeight.bold }}>X-BTNG-Signature</Text> header (HMAC-SHA256 of JSON body using your webhook secret)</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── NODE.JS SDK ── */}
        {activeTab === 3 && (
          <View style={s.section}>
            <View style={[s.moduleCard, { borderColor: '#22C55E44' }]}>
              <View style={s.moduleHeader}>
                <View style={[s.moduleIconWrap, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                  <MaterialIcons name="integration-instructions" size={20} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.moduleTitle, { color: '#22C55E' }]}>@btng/sdk</Text>
                  <Text style={s.moduleDesc}>Official Node.js SDK — TypeScript definitions · All 11 endpoints · OAuth2 + Webhooks</Text>
                </View>
                <View style={[s.modulePortBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E44' }]}>
                  <Text style={[s.modulePortText, { color: '#22C55E' }]}>v1.0.0</Text>
                </View>
              </View>
            </View>

            {/* Install */}
            <View style={s.installCard}>
              <View style={s.installHeader}>
                <View style={s.installIconWrap}><MaterialIcons name="download" size={14} color="#22C55E" /></View>
                <Text style={s.installTitle}>Install</Text>
              </View>
              {[
                { label: 'npm',  cmd: 'npm install @btng/sdk' },
                { label: 'yarn', cmd: 'yarn add @btng/sdk' },
                { label: 'env',  cmd: 'BTNG_API_KEY=BTNG_17489..._482910' },
              ].map(item => (
                <TouchableOpacity key={item.label} style={s.installRow} onPress={() => copyCmd(item.cmd)} activeOpacity={0.75}>
                  <View style={s.installLabel}><Text style={s.installLabelText}>{item.label}</Text></View>
                  <Text style={s.installCmd}>{item.cmd}</Text>
                  <MaterialIcons name="copy-all" size={12} color="#22C55E" />
                </TouchableOpacity>
              ))}
            </View>

            {/* ── One-Tap Install Script ── */}
            <View style={isc.card}>
              <View style={isc.header}>
                <View style={isc.iconWrap}>
                  <MaterialIcons name="terminal" size={20} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={isc.title}>One-Tap Install Script</Text>
                  <Text style={isc.sub}>{'bash btng-setup.sh — installs SDK, creates .env, pings getGoldPrice()'}</Text>
                </View>
                <TouchableOpacity
                  style={isc.copyAllBtn}
                  onPress={() => {
                    ExpoClipboard.setStringAsync(INSTALL_SCRIPT).catch(()=>{});
                    showAlert('Copied!', 'Paste into your terminal and run: bash btng-setup.sh');
                  }}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="copy-all" size={15} color="#22C55E" />
                  <Text style={isc.copyAllText}>Copy Script</Text>
                </TouchableOpacity>
              </View>

              <View style={isc.stepsRow}>
                {[
                  { n: '1', label: 'Install',  detail: 'npm install @btng/sdk dotenv', color: '#22C55E' },
                  { n: '2', label: '.env',     detail: 'BTNG_API_KEY placeholder',    color: '#3B82F6' },
                  { n: '3', label: 'Test',     detail: 'getGoldPrice() live ping',    color: Colors.kenteGold },
                ].map(step => (
                  <View key={step.n} style={[isc.step, { borderColor: step.color + '33' }]}>
                    <View style={[isc.stepNum, { backgroundColor: step.color + '22', borderColor: step.color + '55' }]}>
                      <Text style={[isc.stepNumText, { color: step.color }]}>{step.n}</Text>
                    </View>
                    <Text style={[isc.stepLabel, { color: step.color }]}>{step.label}</Text>
                    <Text style={isc.stepDetail}>{step.detail}</Text>
                  </View>
                ))}
              </View>

              <CodeBlock code={INSTALL_SCRIPT} title="btng-setup.sh" lang="bash" />

              <View style={isc.runCard}>
                <View style={isc.runHeader}>
                  <View style={isc.runIconWrap}>
                    <MaterialIcons name="play-circle" size={14} color="#22C55E" />
                  </View>
                  <Text style={isc.runTitle}>How to run</Text>
                </View>
                {[
                  'bash btng-setup.sh',
                  'Edit .env: BTNG_API_KEY=your_real_key',
                  'node btng-test.js',
                ].map((cmd, i) => (
                  <TouchableOpacity
                    key={i}
                    style={isc.runCmd}
                    onPress={() => { ExpoClipboard.setStringAsync(cmd).catch(()=>{}); showAlert('Copied', cmd); }}
                    activeOpacity={0.75}
                  >
                    <View style={isc.runCmdNum}><Text style={isc.runCmdNumText}>{i + 1}</Text></View>
                    <Text style={isc.runCmdText}>{cmd}</Text>
                    <MaterialIcons name="copy-all" size={11} color="#22C55E" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Method reference */}
            <View style={s.methodCard}>
              <Text style={s.methodTitle}>METHOD REFERENCE</Text>
              {[
                { group: 'Balances & Market', color: Colors.primary, methods: [
                  { name: 'getBalance(address)', ret: 'BalanceResult' },
                  { name: 'getGoldPrice()', ret: 'GoldPriceResult' },
                  { name: 'getKeyStats()', ret: 'any' },
                ]},
                { group: 'Nodes', color: '#9945FF', methods: [
                  { name: 'getNodes(address)', ret: '{ nodes[] }' },
                  { name: 'createNode(addr, name, type, pk)', ret: 'any' },
                  { name: 'claimRewards(address)', ret: 'any' },
                ]},
                { group: 'Mining & Swap', color: Colors.kenteGold, methods: [
                  { name: 'getMiningStats(address)', ret: 'any' },
                  { name: 'startMining(addr, hash, secs)', ret: 'any' },
                  { name: 'swapAfnToBtng(addr, amount)', ret: 'any' },
                ]},
                { group: 'OAuth2', color: '#3B82F6', methods: [
                  { name: 'buildAuthUrl(cid, uri, scopes, state)', ret: 'string' },
                  { name: 'exchangeCode(code, cid, csec, uri)', ret: 'OAuthTokenResult' },
                  { name: 'refreshToken(rt, cid, csec)', ret: 'OAuthTokenResult' },
                ]},
                { group: 'Webhooks', color: Colors.warning, methods: [
                  { name: 'registerWebhook(url, events, addr)', ret: 'WebhookResult' },
                  { name: 'listWebhooks(address)', ret: 'any' },
                  { name: 'testWebhook(id)', ret: 'any' },
                  { name: 'deleteWebhook(id)', ret: 'any' },
                ]},
              ].map(group => (
                <View key={group.group} style={s.methodGroup}>
                  <View style={[s.methodGroupBadge, { backgroundColor: group.color + '18', borderColor: group.color + '44' }]}>
                    <Text style={[s.methodGroupText, { color: group.color }]}>{group.group.toUpperCase()}</Text>
                  </View>
                  {group.methods.map(m => (
                    <View key={m.name} style={s.methodRow}>
                      <View style={s.methodNameWrap}>
                        <Text style={s.methodName}>{m.name}</Text>
                      </View>
                      <View style={[s.methodRet, { backgroundColor: group.color + '15', borderColor: group.color + '33' }]}>
                        <Text style={[s.methodRetText, { color: group.color }]}>{m.ret}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {/* ── SDK Playground ── */}
            <View style={pg.card}>
              <View style={pg.header}>
                <View style={pg.headerIconWrap}><MaterialIcons name="play-circle-filled" size={20} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={pg.headerTitle}>Try SDK Playground</Text>
                  <Text style={pg.headerSub}>All 14 methods · Live API calls · JSON response</Text>
                </View>
                <View style={pg.liveChip}><View style={pg.liveDot} /><Text style={pg.liveChipText}>SANDBOX</Text></View>
              </View>

              <View style={pg.fieldGroup}>
                <Text style={pg.fieldLabel}>SDK Method</Text>
                <TouchableOpacity style={[pg.methodBtn, { borderColor: playMethod.color + '66' }]} onPress={() => setPlayMenuOpen(v => !v)} activeOpacity={0.85}>
                  <View style={[pg.methodDot, { backgroundColor: playMethod.color + '25', borderColor: playMethod.color + '55' }]}>
                    <MaterialIcons name="functions" size={14} color={playMethod.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[pg.methodName, { color: playMethod.color }]}>{playMethod.name}()</Text>
                    <Text style={pg.methodDesc}>{playMethod.desc}</Text>
                  </View>
                  <View style={[pg.methodScopeBadge, { backgroundColor: playMethod.color + '18', borderColor: playMethod.color + '44' }]}>
                    <Text style={[pg.methodScopeText, { color: playMethod.color }]}>{playMethod.scope}</Text>
                  </View>
                  <MaterialIcons name={playMenuOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                {playMenuOpen && (
                  <View style={pg.methodDropdown}>
                    {SDK_PLAY_METHODS.map(m => (
                      <TouchableOpacity
                        key={m.name}
                        style={[pg.methodOption, playMethod.name === m.name && { backgroundColor: m.color + '14' }]}
                        onPress={() => { setPlayMethod(m); setPlayMenuOpen(false); setPlayResponse(null); setPlayError(null); }}
                        activeOpacity={0.8}
                      >
                        <View style={[pg.methodOptionDot, { backgroundColor: m.color + '22', borderColor: m.color + '55' }]}>
                          <View style={[pg.methodOptionInnerDot, { backgroundColor: m.color }]} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[pg.methodOptionName, { color: playMethod.name === m.name ? m.color : Colors.textPrimary }]}>{m.name}()</Text>
                          <Text style={pg.methodOptionDesc}>{m.desc}</Text>
                        </View>
                        <View style={[pg.methodOptionHttpBadge, { backgroundColor: m.httpMethod === 'GET' ? '#22C55E18' : m.httpMethod === 'LOCAL' ? '#9945FF18' : '#3B82F618', borderColor: m.httpMethod === 'GET' ? '#22C55E44' : m.httpMethod === 'LOCAL' ? '#9945FF44' : '#3B82F644' }]}>
                          <Text style={[pg.methodOptionHttpText, { color: m.httpMethod === 'GET' ? '#22C55E' : m.httpMethod === 'LOCAL' ? '#9945FF' : '#3B82F6' }]}>{m.httpMethod}</Text>
                        </View>
                        {playMethod.name === m.name && <MaterialIcons name="check-circle" size={14} color={m.color} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {playMethod.needsAddress && (
                <View style={pg.fieldGroup}>
                  <Text style={pg.fieldLabel}>Wallet Address {walletAddr ? '· auto-filled from Genesis' : '· no wallet connected'}</Text>
                  <View style={pg.inputRow}>
                    <TextInput
                      style={pg.input}
                      value={playAddress}
                      onChangeText={setPlayAddress}
                      placeholder="0x0000…0000"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {walletAddr ? (
                      <TouchableOpacity style={pg.fillBtn} onPress={() => setPlayAddress(walletAddr)} activeOpacity={0.8}>
                        <MaterialIcons name="account-balance-wallet" size={14} color={Colors.primary} />
                        <Text style={pg.fillBtnText}>Fill</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )}

              {playMethod.needsAmount && (
                <View style={pg.fieldGroup}>
                  <Text style={pg.fieldLabel}>Amount (AFN)</Text>
                  <TextInput
                    style={pg.input}
                    value={playAmount}
                    onChangeText={setPlayAmount}
                    placeholder="1000"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                </View>
              )}

              <View style={pg.endpointPreview}>
                <View style={[pg.httpMethodChip, { backgroundColor: playMethod.httpMethod === 'GET' ? '#22C55E18' : playMethod.httpMethod === 'LOCAL' ? '#9945FF18' : '#3B82F618', borderColor: playMethod.httpMethod === 'GET' ? '#22C55E44' : playMethod.httpMethod === 'LOCAL' ? '#9945FF44' : '#3B82F644' }]}>
                  <Text style={[pg.httpMethodText, { color: playMethod.httpMethod === 'GET' ? '#22C55E' : playMethod.httpMethod === 'LOCAL' ? '#9945FF' : '#3B82F6' }]}>{playMethod.httpMethod}</Text>
                </View>
                <Text style={pg.endpointUrl} numberOfLines={1}>
                  {playMethod.httpMethod === 'LOCAL'
                    ? 'local://sdk.' + playMethod.name
                    : ('https://api.btng.gold/v1' + (playMethod.endpoint ?? '')).replace('{address}', playAddress ? playAddress.slice(0, 10) + '…' : '{address}')}
                </Text>
              </View>

              <TouchableOpacity
                style={[pg.runBtn, { backgroundColor: playMethod.color }, playLoading && { opacity: 0.65 }]}
                onPress={runPlayground}
                disabled={playLoading}
                activeOpacity={0.85}
              >
                {playLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialIcons name="play-arrow" size={20} color="#fff" />}
                <Text style={pg.runBtnText}>{playLoading ? 'Running…' : 'Run ' + playMethod.name + '()'}</Text>
                {!playLoading && playLatency !== null && (
                  <View style={pg.latencyBadge}>
                    <MaterialIcons name="timer" size={10} color="rgba(255,255,255,0.8)" />
                    <Text style={pg.latencyText}>{playLatency}ms</Text>
                  </View>
                )}
              </TouchableOpacity>

              {playError && (
                <View style={pg.errorBanner}>
                  <MaterialIcons name="info" size={13} color={Colors.warning} />
                  <Text style={pg.errorText}>{playError}</Text>
                </View>
              )}

              {playResponse !== null && (
                <View style={pg.responseCard}>
                  <View style={pg.responseHeader}>
                    <View style={pg.responseHeaderLeft}>
                      <View style={pg.responseDot} />
                      <Text style={pg.responseHeaderTitle}>Response</Text>
                    </View>
                    <View style={pg.responseHeaderRight}>
                      {playLatency !== null && (
                        <View style={[pg.latencyFullBadge, { backgroundColor: playLatency < 500 ? '#22C55E22' : playLatency < 2000 ? '#F59E0B22' : '#EF444422', borderColor: playLatency < 500 ? '#22C55E55' : playLatency < 2000 ? '#F59E0B55' : '#EF444455' }]}>
                          <MaterialIcons name="timer" size={11} color={playLatency < 500 ? '#22C55E' : playLatency < 2000 ? '#F59E0B' : '#EF4444'} />
                          <Text style={[pg.latencyFullText, { color: playLatency < 500 ? '#22C55E' : playLatency < 2000 ? '#F59E0B' : '#EF4444' }]}>{playLatency}ms</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={pg.copyResponseBtn}
                        onPress={() => { ExpoClipboard.setStringAsync(JSON.stringify(playResponse, null, 2)).catch(()=>{}); showAlert('Copied', 'Response JSON copied.'); }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="copy-all" size={12} color={Colors.primary} />
                        <Text style={pg.copyResponseText}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView style={pg.responseScroll} showsVerticalScrollIndicator={false}>
                    <ColoredJSON data={playResponse} depth={0} />
                  </ScrollView>
                </View>
              )}
            </View>

            <CodeBlock code={SDK_PACKAGE}    title="package.json"     lang="json" />
            <CodeBlock code={SDK_INDEX}      title="sdk/index.js"     lang="javascript" />
            <CodeBlock code={SDK_TYPESCRIPT} title="sdk/index.d.ts"   lang="typescript" />
            <CodeBlock code={SDK_USAGE}      title="usage-example.js" lang="javascript" />
            <CodeBlock code={PM2_COMMANDS}   title="PM2 — all three servers" lang="bash" />

            <View style={s.ecoCard}>
              <View style={s.ecoHeader}>
                <View style={s.ecoIconWrap}><Text style={{ fontSize: 18 }}>₿</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.ecoTitle}>Complete BTNG Developer Ecosystem</Text>
                  <Text style={s.ecoSub}>All modules are now production-ready</Text>
                </View>
              </View>
              <View style={s.ecoGrid}>
                {[
                  { icon: 'vpn-key',             label: 'API Keys',  sub: '11 endpoints · 6 scopes', color: Colors.primary },
                  { icon: 'lock-open',            label: 'OAuth2',    sub: 'RFC 6749 · JWT tokens',   color: '#9945FF' },
                  { icon: 'webhook',              label: 'Webhooks',  sub: '9 events · HMAC signed',  color: Colors.kenteGold },
                  { icon: 'integration-instructions', label: 'SDK',  sub: 'TypeScript · All methods', color: '#22C55E' },
                ].map(item => (
                  <View key={item.label} style={[s.ecoItem, { borderColor: item.color + '33' }]}>
                    <View style={[s.ecoItemIcon, { backgroundColor: item.color + '18', borderColor: item.color + '44' }]}>
                      <MaterialIcons name={item.icon as any} size={15} color={item.color} />
                    </View>
                    <Text style={[s.ecoItemLabel, { color: item.color }]}>{item.label}</Text>
                    <Text style={s.ecoItemSub}>{item.sub}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity style={s.linkCard} onPress={() => router.push('/btng-api-key-generator' as any)} activeOpacity={0.85}>
              <View style={s.linkLeft}>
                <View style={s.linkIconWrap}><MaterialIcons name="vpn-key" size={20} color={Colors.primary} /></View>
                <View>
                  <Text style={s.linkTitle}>Back to API Key Generator</Text>
                  <Text style={s.linkSub}>On-chain keys · Smart contract · Solidity</Text>
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  pillText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  tabBarWrap: { marginBottom: Spacing.sm },
  tabBarContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  tab: { paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  tabText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.primary, fontWeight: FontWeight.heavy },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  section: { gap: Spacing.md },
  heroCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6 },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  heroIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  heroSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 15, includeFontPadding: false },
  heroBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  heroBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroBadgeText: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  moduleCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, gap: Spacing.md },
  moduleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  moduleIconWrap: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  moduleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  moduleTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  modulePortBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  modulePortText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  moduleDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3, lineHeight: 16, includeFontPadding: false },
  moduleFeatures: { gap: 5 },
  moduleFeatureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  moduleFeatureText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 15 },
  fileCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  fileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  fileIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  fileTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  fileName: { fontSize: FontSize.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  stepsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  stepsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  stepsIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  stepsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  linkCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  linkLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  linkIconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  linkSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  flowCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: '#9945FF33', gap: Spacing.sm },
  flowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  flowIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#9945FF18', borderWidth: 1, borderColor: '#9945FF44', alignItems: 'center', justifyContent: 'center' },
  flowTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  flowNum: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flowNumText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  flowLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  flowDesc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  endCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  endTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  endMethod: { borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 3, borderWidth: 1, width: 54, alignItems: 'center', flexShrink: 0 },
  endMethodText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.3, includeFontPadding: false },
  endPath: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  endDesc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  usageCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: '#9945FF33', gap: Spacing.md },
  usageTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  usageSnippet: { backgroundColor: '#0D1117', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  usageSnippetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 5, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  usageLangBadge: { backgroundColor: Colors.primary + '22', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  usageLangText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  usageCode: { fontSize: 10.5, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, padding: Spacing.md, includeFontPadding: false },
  eventsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.kenteGold + '33', gap: Spacing.md },
  eventsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eventsIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.kenteGold + '55', alignItems: 'center', justifyContent: 'center' },
  eventsTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  eventsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  payloadCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.kenteGold + '33', gap: Spacing.md },
  payloadHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  payloadIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.kenteGold + '55', alignItems: 'center', justifyContent: 'center' },
  payloadTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  payloadBody: { backgroundColor: '#0D1117', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, position: 'relative' },
  payloadCode: { fontSize: 10.5, color: '#E6EDF3', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, includeFontPadding: false, paddingRight: 24 },
  payloadCopyChip: { flexDirection: 'row', alignItems: 'center', gap: 3, position: 'absolute', top: 6, right: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  payloadCopyText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  sigNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.kenteGold + '44' },
  sigNoteText: { flex: 1, fontSize: 10, color: Colors.textSecondary, lineHeight: 14, includeFontPadding: false },
  installCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: '#22C55E44', gap: Spacing.sm },
  installHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  installIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: '#22C55E55', alignItems: 'center', justifyContent: 'center' },
  installTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  installRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#0D1117', borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  installLabel: { backgroundColor: '#22C55E22', borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#22C55E44', width: 36, alignItems: 'center' },
  installLabelText: { fontSize: 9, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  installCmd: { flex: 1, fontSize: 11, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  methodCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  methodTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  methodGroup: { gap: 6 },
  methodGroupBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, alignSelf: 'flex-start' },
  methodGroupText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  methodNameWrap: { flex: 1 },
  methodName: { fontSize: 11, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: FontWeight.semibold, includeFontPadding: false },
  methodRet: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  methodRetText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  ecoCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5 },
  ecoHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  ecoIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ecoTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  ecoSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  ecoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  ecoItem: { width: '47%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, alignItems: 'center', gap: 6, minWidth: 130 },
  ecoItemIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ecoItemLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  ecoItemSub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

// ── Playground Styles ────────────────────────────────────────────────────────
const pg = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headerIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#9945FF22', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#9945FF55' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9945FF', shadowColor: '#9945FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  liveChipText: { fontSize: 9, fontWeight: FontWeight.heavy, color: '#9945FF', letterSpacing: 0.8, includeFontPadding: false },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  methodBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5 },
  methodDot: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  methodName: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  methodDesc: { fontSize: 10, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  methodScopeBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  methodScopeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  methodDropdown: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', maxHeight: 280 },
  methodOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderBottomWidth: 1, borderBottomColor: Colors.border },
  methodOptionDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  methodOptionInnerDot: { width: 8, height: 8, borderRadius: 4 },
  methodOptionName: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  methodOptionDesc: { fontSize: 9, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  methodOptionHttpBadge: { borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  methodOptionHttpText: { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { flex: 1, backgroundColor: '#0D1117', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, color: '#7EE787', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  fillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '55', flexShrink: 0 },
  fillBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  endpointPreview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: '#0D1117', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  httpMethodChip: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  httpMethodText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  endpointUrl: { flex: 1, fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  runBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  runBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#fff', includeFontPadding: false },
  latencyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  latencyText: { fontSize: 9, fontWeight: FontWeight.heavy, color: 'rgba(255,255,255,0.85)', includeFontPadding: false },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44' },
  errorText: { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 16, includeFontPadding: false },
  responseCard: { backgroundColor: '#0D1117', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.success + '44', overflow: 'hidden' },
  responseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  responseHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  responseDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4 },
  responseHeaderTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  responseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  latencyFullBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  latencyFullText: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  copyResponseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyResponseText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  responseScroll: { maxHeight: 260, padding: Spacing.md },
});

// ── Install Script Card Styles ────────────────────────────────────────────────
const isc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: '#22C55E55', gap: Spacing.md, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#22C55E18', borderWidth: 1, borderColor: '#22C55E44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  copyAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#22C55E22', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1.5, borderColor: '#22C55E66', flexShrink: 0 },
  copyAllText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  stepsRow: { flexDirection: 'row', gap: Spacing.sm },
  step: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 5 },
  stepNum: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  stepLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, letterSpacing: 0.3, includeFontPadding: false },
  stepDetail: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, lineHeight: 12 },
  runCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#22C55E33', gap: Spacing.sm },
  runHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  runIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#22C55E18', borderWidth: 1, borderColor: '#22C55E44', alignItems: 'center', justifyContent: 'center' },
  runTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  runCmd: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#0D1117', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  runCmdNum: { width: 16, height: 16, borderRadius: 5, backgroundColor: '#22C55E22', borderWidth: 1, borderColor: '#22C55E55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  runCmdNumText: { fontSize: 9, fontWeight: FontWeight.heavy, color: '#22C55E', includeFontPadding: false },
  runCmdText: { flex: 1, fontSize: 10.5, color: '#7EE787', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});
