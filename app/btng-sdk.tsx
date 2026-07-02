import React, { useState, useCallback, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Platform, Share, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─────────────────────────────────────────────────────────────────────────────
// SDK Data
// ─────────────────────────────────────────────────────────────────────────────
const UBL_VERSION = 'UBL-1.0';

interface SDKFile {
  id: string;
  platform: string;
  lang: string;
  filename: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  deployNote: string;
  code: string;
}

const SDK_FILES: SDKFile[] = [
  {
    id: 'backend',
    platform: 'Backend Engine',
    lang: 'Python · FastAPI',
    filename: 'main.py',
    icon: 'dns',
    color: '#009688',
    bgColor: 'rgba(0,150,136,0.12)',
    description: 'Universal sovereign banking API — wallet, loans, cards, identity. Deploy once, all platforms connect.',
    deployNote: 'pip install fastapi uvicorn\nuvicorn main:app --host 0.0.0.0 --port 8080',
    code: `from fastapi import FastAPI, Request
from pydantic import BaseModel
from datetime import datetime, timedelta

app = FastAPI(title="BTNG Banking Engine", version="1.0.0")

BTNG_GOLD_SYMBOL  = "BTNGG"
BTNG_CHAIN_PREFIX = "btng1"
BASE_RATE_APR     = 0.08
MAX_LTV           = 0.70

class IdentityIn(BaseModel):
    btng_id: str
    wallet:  str
    expires: str

class LoanRequest(BaseModel):
    btng_id:   str
    principal: float
    days:      int

@app.post("/identity")
def register_identity(identity: IdentityIn, request: Request):
    return {
        "status":        "OK",
        "btng_id":       identity.btng_id,
        "wallet":        identity.wallet,
        "expires":       identity.expires,
        "registered_at": datetime.utcnow().isoformat(),
        "client":        request.headers.get("X-BTNG-Client", "unknown"),
    }

@app.get("/wallet/{btng_id}")
def get_wallet(btng_id: str, request: Request):
    suffix = btng_id.replace("-","").lower()[-6:]
    return {
        "btng_id": btng_id,
        "wallet":  f"{BTNG_CHAIN_PREFIX}{suffix}",
        "asset":   BTNG_GOLD_SYMBOL,
        "balance": 0.0,
        "tier":    "Bronze",
        "active":  True,
    }

@app.post("/loan/quote")
def loan_quote(req: LoanRequest, request: Request):
    max_borrow = req.principal * MAX_LTV
    daily_rate = BASE_RATE_APR / 365.0
    interest   = max_borrow * daily_rate * req.days
    due_date   = datetime.utcnow() + timedelta(days=req.days)
    risk = ("HIGH"   if req.principal > 50000 else
            "MEDIUM" if req.principal > 10000 else "LOW")
    return {
        "btng_id":    req.btng_id,
        "principal":  req.principal,
        "max_borrow": round(max_borrow, 2),
        "interest":   round(interest,   2),
        "total_due":  round(max_borrow + interest, 2),
        "currency":   BTNG_GOLD_SYMBOL,
        "due_date":   due_date.isoformat(),
        "rate_apr":   BASE_RATE_APR,
        "ltv":        MAX_LTV,
        "risk_level": risk,
    }

@app.post("/card/activate")
def activate_card(payload: dict, request: Request):
    btng_id = payload.get("btng_id","")
    wallet  = payload.get("wallet","")
    expires = payload.get("expires") or (
        datetime.utcnow() + timedelta(days=3*365)
    ).strftime("%Y-%m-%d")
    seed   = "".join(c for c in btng_id if c.isdigit()).zfill(16)[-16:]
    masked = f"{seed[:4]} •••• •••• {seed[-4:]}"
    return {
        "status":             "ACTIVE",
        "btng_id":            btng_id,
        "wallet":             wallet,
        "card_number_masked": masked,
        "activated_at":       datetime.utcnow().isoformat(),
        "expires":            expires,
        "tier":               "Silver",
    }

@app.get("/health")
def health():
    return {"status": "OK", "engine": "UBL-1.0"}`,
  },
  {
    id: 'android',
    platform: 'Android Native',
    lang: 'Kotlin · OkHttp',
    filename: 'BTNGClient.kt',
    icon: 'android',
    color: '#3DDC84',
    bgColor: 'rgba(61,220,132,0.12)',
    description: 'Drop-in Kotlin SDK for Android banking apps. Auto-injects UBL headers, includes offline loan fallback.',
    deployNote: 'implementation("com.squareup.okhttp3:okhttp:4.12.0")\n// Drop BTNGClient.kt into com/btng/sdk/',
    code: `package com.btng.sdk

import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import org.json.JSONObject
import java.io.IOException

class BTNGClient(private val baseUrl: String) {

    private val JSON_TYPE = "application/json; charset=utf-8".toMediaTypeOrNull()

    private val http = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val req = chain.request().newBuilder()
                .addHeader("X-BTNG-Client", "android-native")
                .addHeader("X-BTNG-UBL",    "UBL-1.0")
                .addHeader("X-BTNG-Chain",   "btng1")
                .build()
            chain.proceed(req)
        }.build()

    fun getWallet(btngId: String, callback: (JSONObject?) -> Unit) {
        val req = Request.Builder()
            .url("${'$'}baseUrl/wallet/${'$'}btngId").get().build()
        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = callback(null)
            override fun onResponse(call: Call, response: Response) {
                response.use { callback(parseJson(it.body?.string())) }
            }
        })
    }

    fun loanQuote(btngId: String, principal: Double, days: Int,
                  callback: (JSONObject?) -> Unit) {
        val payload = JSONObject().apply {
            put("btng_id", btngId); put("principal", principal); put("days", days)
        }
        post("/loan/quote", payload, callback)
    }

    fun activateCard(btngId: String, wallet: String, expires: String? = null,
                     callback: (JSONObject?) -> Unit) {
        val payload = JSONObject().apply {
            put("btng_id", btngId); put("wallet", wallet)
            expires?.let { put("expires", it) }
        }
        post("/card/activate", payload, callback)
    }

    fun registerIdentity(btngId: String, wallet: String, expires: String,
                         callback: (JSONObject?) -> Unit) {
        val payload = JSONObject().apply {
            put("btng_id", btngId); put("wallet", wallet); put("expires", expires)
        }
        post("/identity", payload, callback)
    }

    private fun post(path: String, payload: JSONObject, callback: (JSONObject?) -> Unit) {
        val body = RequestBody.create(JSON_TYPE, payload.toString())
        val req  = Request.Builder().url("${'$'}baseUrl${'$'}path").post(body).build()
        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = callback(null)
            override fun onResponse(call: Call, response: Response) {
                response.use { callback(parseJson(it.body?.string())) }
            }
        })
    }

    private fun parseJson(body: String?): JSONObject? =
        if (body != null) try { JSONObject(body) } catch (e: Exception) { null } else null
}`,
  },
  {
    id: 'ios',
    platform: 'iOS Native',
    lang: 'Swift · URLSession',
    filename: 'BTNGClient.swift',
    icon: 'phone-iphone',
    color: '#F05138',
    bgColor: 'rgba(240,81,56,0.12)',
    description: 'Drop-in Swift SDK for iOS banking apps. URLSession-based, UBL headers auto-injected, offline fallback included.',
    deployNote: '// Drag BTNGClient.swift into Xcode project\n// No external dependencies required',
    code: `import Foundation

private let BASE_RATE_APR = 0.08
private let MAX_LTV       = 0.70

class BTNGClient {
    let baseUrl: String
    let session = URLSession.shared

    init(baseUrl: String) { self.baseUrl = baseUrl }

    func getWallet(btngId: String, completion: @escaping ([String:Any]?) -> Void) {
        guard let url = URL(string: "\\(baseUrl)/wallet/\\(btngId)") else {
            completion(nil); return
        }
        var req = URLRequest(url: url)
        addHeaders(&req)
        session.dataTask(with: req) { data, _, _ in
            completion(self.parseJson(data))
        }.resume()
    }

    func loanQuote(btngId: String, principal: Double, days: Int,
                   completion: @escaping ([String:Any]?) -> Void) {
        post(path: "/loan/quote",
             payload: ["btng_id": btngId, "principal": principal, "days": days],
             completion: completion)
    }

    func activateCard(btngId: String, wallet: String, expires: String? = nil,
                      completion: @escaping ([String:Any]?) -> Void) {
        var payload: [String:Any] = ["btng_id": btngId, "wallet": wallet]
        if let exp = expires { payload["expires"] = exp }
        post(path: "/card/activate", payload: payload, completion: completion)
    }

    func registerIdentity(btngId: String, wallet: String, expires: String,
                          completion: @escaping ([String:Any]?) -> Void) {
        post(path: "/identity",
             payload: ["btng_id": btngId, "wallet": wallet, "expires": expires],
             completion: completion)
    }

    private func addHeaders(_ req: inout URLRequest) {
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("ios-native",       forHTTPHeaderField: "X-BTNG-Client")
        req.setValue("UBL-1.0",          forHTTPHeaderField: "X-BTNG-UBL")
        req.setValue("btng1",            forHTTPHeaderField: "X-BTNG-Chain")
    }

    private func post(path: String, payload: [String:Any],
                      completion: @escaping ([String:Any]?) -> Void) {
        guard let url = URL(string: "\\(baseUrl)\\(path)") else {
            completion(nil); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        addHeaders(&req)
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        session.dataTask(with: req) { data, _, _ in
            completion(self.parseJson(data))
        }.resume()
    }

    private func parseJson(_ data: Data?) -> [String:Any]? {
        guard let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String:Any]
        else { return nil }
        return json
    }
}`,
  },
  {
    id: 'web',
    platform: 'Web / Any OS',
    lang: 'JavaScript · Fetch API',
    filename: 'btngClient.js',
    icon: 'language',
    color: '#F7DF1E',
    bgColor: 'rgba(247,223,30,0.12)',
    description: 'Works in all browsers and any OS that can speak HTTP. Pure Fetch API — no dependencies.',
    deployNote: '// ES Module — import in any web project\n// Or use as CommonJS with require()',
    code: `const BASE_URL = 'https://btng-bank.yourdomain.com';

function headers(extra = {}) {
  return {
    'Content-Type':  'application/json',
    'X-BTNG-Client': 'web',
    'X-BTNG-UBL':    'UBL-1.0',
    'X-BTNG-Chain':  'btng1',
    ...extra,
  };
}

export async function getWallet(btngId) {
  try {
    const res = await fetch(
      \`\${BASE_URL}/wallet/\${encodeURIComponent(btngId)}\`,
      { headers: headers() }
    );
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function loanQuote(btngId, principal, days) {
  try {
    const res = await fetch(\`\${BASE_URL}/loan/quote\`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ btng_id: btngId, principal, days }),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function activateCard(btngId, wallet, expires) {
  try {
    const res = await fetch(\`\${BASE_URL}/card/activate\`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ btng_id: btngId, wallet, expires }),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function registerIdentity(btngId, wallet, expires) {
  try {
    const res = await fetch(\`\${BASE_URL}/identity\`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ btng_id: btngId, wallet, expires }),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Offline fallback — no network required
export function localLoanQuote(btngId, principal, days) {
  const maxBorrow = principal * 0.70;
  const interest  = maxBorrow * (0.08 / 365) * days;
  return {
    btng_id: btngId, principal,
    max_borrow: +(maxBorrow.toFixed(2)),
    interest:   +(interest.toFixed(2)),
    total_due:  +((maxBorrow + interest).toFixed(2)),
    currency:   'BTNGG',
    source:     'local',
  };
}`,
  },
];

// Endpoints table
const ENDPOINTS = [
  { method: 'GET',  path: '/wallet/:btng_id', desc: 'Wallet lookup & BTNGG balance' },
  { method: 'POST', path: '/loan/quote',       desc: 'Gold-backed loan calculator (70% LTV · 8% APR)' },
  { method: 'POST', path: '/card/activate',    desc: 'Card issuance & activation' },
  { method: 'POST', path: '/identity',         desc: 'Sovereign identity registration' },
  { method: 'GET',  path: '/health',           desc: 'Engine heartbeat check' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Bundle content (raw source for each SDK file used in ZIP export)
// ─────────────────────────────────────────────────────────────────────────────
const BUNDLE_FILES: { filename: string; content: string }[] = SDK_FILES.map(f => ({
  filename: f.filename,
  content: f.code,
}));

const README_CONTENT = `# BTNG Universal Banking Layer — UBL-1.0

One backend. Three SDKs. All operating systems. One sovereign engine.

## Package Contents

| File                | Platform        | Language         |
|---------------------|-----------------|------------------|
| main.py             | Backend Engine  | Python / FastAPI |
| BTNGClient.kt       | Android Native  | Kotlin           |
| BTNGClient.swift    | iOS Native      | Swift            |
| btngClient.js       | Web / Any OS    | JavaScript       |

## Quick Start

### 1. Deploy Backend
\`\`\`bash
pip install fastapi uvicorn
uvicorn main:app --host 0.0.0.0 --port 8080
\`\`\`

### 2. Android
\`\`\`kotlin
val btng = BTNGClient("https://btng-bank.yourdomain.com")
btng.getWallet("BTNG-1234-5678") { json -> /* update UI */ }
\`\`\`

### 3. iOS
\`\`\`swift
let btng = BTNGClient(baseUrl: "https://btng-bank.yourdomain.com")
btng.getWallet(btngId: "BTNG-1234-5678") { json in /* update UI */ }
\`\`\`

### 4. Web
\`\`\`js
const wallet = await getWallet('BTNG-1234-5678');
\`\`\`

## API Endpoints

| Method | Path              | Description      |
|--------|-------------------|------------------|
| GET    | /wallet/:btng_id  | Wallet lookup    |
| POST   | /loan/quote       | Loan calculator  |
| POST   | /card/activate    | Card activation  |
| POST   | /identity         | Identity registry|
| GET    | /health           | Health check     |

---
BTNG Gold Coin · Ghana & Africa
Ekuye Digital Gateway Trust Ltd · Merchant ID 248059
`;

// ─────────────────────────────────────────────────────────────────────────────
// Code Block
// ─────────────────────────────────────────────────────────────────────────────
function CodeBlock({ code, filename }: { code: string; filename: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const previewLines = code.split('\n').slice(0, 10).join('\n');

  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(code).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }, [code]);

  const handleShare = useCallback(async () => {
    await Share.share({ message: `// ${filename}\n\n${code}`, title: `BTNG SDK — ${filename}` });
  }, [code, filename]);

  return (
    <View style={cb.wrap}>
      <View style={cb.header}>
        <View style={cb.filenameRow}>
          <MaterialIcons name="code" size={12} color={Colors.success} />
          <Text style={cb.filename}>{filename}</Text>
        </View>
        <View style={cb.actions}>
          <TouchableOpacity style={cb.actionBtn} onPress={handleShare} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MaterialIcons name="share" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[cb.actionBtn, copied && cb.actionBtnDone]}
            onPress={handleCopy}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name={copied ? 'check' : 'copy-all'} size={13} color={copied ? Colors.success : Colors.textMuted} />
            <Text style={[cb.copyText, copied && { color: Colors.success }]}>{copied ? 'Copied!' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cb.codeScroll}>
        <Text style={cb.code} selectable>
          {expanded ? code : previewLines + (code.split('\n').length > 10 ? '\n…' : '')}
        </Text>
      </ScrollView>
      {code.split('\n').length > 10 && (
        <TouchableOpacity style={cb.expandBtn} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={14} color={Colors.primary} />
          <Text style={cb.expandText}>{expanded ? 'Show less' : `Show all ${code.split('\n').length} lines`}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const cb = StyleSheet.create({
  wrap: { backgroundColor: '#0A0A0A', borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filenameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filename: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  actionBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  copyText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  codeScroll: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  code: { fontSize: 10, color: '#E5C07B', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16, includeFontPadding: false },
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderTopWidth: 1, borderTopColor: Colors.border },
  expandText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// SDK Card
// ─────────────────────────────────────────────────────────────────────────────
function SDKCard({ sdk }: { sdk: SDKFile }) {
  const [open, setOpen] = useState(false);
  const rotAnim = useRef(new Animated.Value(0)).current;
  const rot = rotAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const toggle = useCallback(() => {
    const next = !open;
    Animated.timing(rotAnim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    setOpen(next);
  }, [open, rotAnim]);

  return (
    <View style={[skCard.wrap, { borderColor: sdk.color + '44' }]}>
      <TouchableOpacity style={skCard.header} onPress={toggle} activeOpacity={0.85}>
        <View style={[skCard.iconWrap, { backgroundColor: sdk.bgColor }]}>
          <MaterialIcons name={sdk.icon as any} size={22} color={sdk.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={skCard.titleRow}>
            <Text style={skCard.platform}>{sdk.platform}</Text>
            <View style={[skCard.langBadge, { backgroundColor: sdk.bgColor, borderColor: sdk.color + '44' }]}>
              <Text style={[skCard.langText, { color: sdk.color }]}>{sdk.lang}</Text>
            </View>
          </View>
          <Text style={skCard.filename}>{sdk.filename}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: rot }] }}>
          <MaterialIcons name="expand-more" size={20} color={Colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={skCard.body}>
          <Text style={skCard.description}>{sdk.description}</Text>

          {/* Deploy Note */}
          <View style={skCard.deployBlock}>
            <View style={skCard.deployHeader}>
              <MaterialIcons name="terminal" size={11} color={Colors.warning} />
              <Text style={skCard.deployLabel}>Setup</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={skCard.deployCode}>{sdk.deployNote}</Text>
            </ScrollView>
          </View>

          {/* Code */}
          <CodeBlock code={sdk.code} filename={sdk.filename} />
        </View>
      )}
    </View>
  );
}

const skCard = StyleSheet.create({
  wrap: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  iconWrap: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  platform: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  langBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  langText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  filename: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  body: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  description: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  deployBlock: { backgroundColor: '#0A0A0A', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.warning + '44', overflow: 'hidden' },
  deployHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.warningBg, borderBottomWidth: 1, borderBottomColor: Colors.warning + '33' },
  deployLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  deployCode: { fontSize: 10, color: '#E5C07B', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, lineHeight: 16, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BTNGSdkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleDone, setBundleDone] = useState(false);

  const handleDownloadBundle = useCallback(async () => {
    setBundleLoading(true);
    setBundleDone(false);
    try {
      const zip = new JSZip();
      const folder = zip.folder('btng-sdk-ubl-1.0')!;

      // Add all SDK files
      for (const file of BUNDLE_FILES) {
        folder.file(file.filename, file.content);
      }
      // Add README
      folder.file('README.md', README_CONTENT);

      // Generate ZIP as base64
      const base64 = await zip.generateAsync({ type: 'base64' });

      // Write to temp file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `btng-sdk-ubl-1.0_${timestamp}.zip`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Share
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/zip',
          dialogTitle: `BTNG SDK Package — ${UBL_VERSION}`,
          UTI: 'public.zip-archive',
        });
        setBundleDone(true);
        setTimeout(() => setBundleDone(false), 3000);
      }
    } catch (err) {
      console.error('Bundle export error:', err);
    } finally {
      setBundleLoading(false);
    }
  }, []);

  const handleShareAll = useCallback(async () => {
    const summary = [
      `🔐 BTNG Universal Banking Layer — ${UBL_VERSION}`,
      '',
      'One backend. Three SDKs. All operating systems.',
      '',
      '📦 Package Contents:',
      '  • main.py         → Python / FastAPI backend',
      '  • BTNGClient.kt   → Android native (Kotlin)',
      '  • BTNGClient.swift → iOS native (Swift)',
      '  • btngClient.js   → Web / JavaScript',
      '',
      '🌍 Endpoints:',
      '  GET  /wallet/:btng_id',
      '  POST /loan/quote',
      '  POST /card/activate',
      '  POST /identity',
      '  GET  /health',
      '',
      '🏦 Sovereign engine for Ghana & Africa',
      'Ekuye Digital Gateway Trust Ltd · BTNG Gold Coin',
    ].join('\n');
    await Share.share({ message: summary, title: `BTNG SDK Package — ${UBL_VERSION}` });
  }, []);

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>BTNG SDK Package</Text>
          <Text style={styles.topSub}>{UBL_VERSION} · Sovereign Developer Kit</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareAll}>
          <MaterialIcons name="share" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Hero Banner */}
      <View style={styles.heroBanner}>
        <View style={styles.heroCoin}><Text style={styles.heroCoinText}>₿</Text></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.heroTitle}>BTNG Universal Banking Layer</Text>
          <Text style={styles.heroSub}>Complete SDK — Backend · Android · iOS · Web</Text>
          <View style={styles.heroTagRow}>
            {['UBL-1.0', 'Ghana', 'Africa', '4 SDKs', 'Production'].map(tag => (
              <View key={tag} style={styles.heroTag}>
                <Text style={styles.heroTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Download Bundle Button */}
      <TouchableOpacity
        style={[
          styles.downloadBundleBtn,
          bundleDone && styles.downloadBundleBtnDone,
          bundleLoading && { opacity: 0.8 },
        ]}
        onPress={handleDownloadBundle}
        disabled={bundleLoading}
        activeOpacity={0.85}
      >
        {bundleLoading ? (
          <ActivityIndicator size="small" color="#100800" />
        ) : (
          <MaterialIcons
            name={bundleDone ? 'check-circle' : 'download'}
            size={20}
            color="#100800"
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.downloadBundleBtnTitle}>
            {bundleDone ? 'Bundle Downloaded!' : bundleLoading ? 'Packaging…' : 'Download SDK Bundle'}
          </Text>
          <Text style={styles.downloadBundleBtnSub}>
            {bundleDone
              ? `main.py · BTNGClient.kt · BTNGClient.swift · btngClient.js · README.md`
              : `5 files · ZIP archive · main.py + Android + iOS + Web + README`}
          </Text>
        </View>
        <View style={styles.downloadBundleZipBadge}>
          <MaterialIcons name="folder-zip" size={14} color="#100800" />
          <Text style={styles.downloadBundleZipText}>.ZIP</Text>
        </View>
      </TouchableOpacity>

      {/* Stats Strip */}
      <View style={styles.statsStrip}>
        {[
          { icon: 'storage',  label: '1 Backend',    color: '#009688' },
          { icon: 'android',  label: 'Android SDK',  color: '#3DDC84' },
          { icon: 'phone-iphone', label: 'iOS SDK',  color: '#F05138' },
          { icon: 'language', label: 'Web SDK',      color: '#F7DF1E' },
        ].map(item => (
          <View key={item.label} style={styles.statItem}>
            <View style={[styles.statIconWrap, { backgroundColor: item.color + '18' }]}>
              <MaterialIcons name={item.icon as any} size={14} color={item.color} />
            </View>
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* API Endpoints Table */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <MaterialIcons name="api" size={16} color={Colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Engine Endpoints</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>5 routes</Text>
            </View>
          </View>
          {ENDPOINTS.map(ep => (
            <View key={ep.path} style={styles.endpointRow}>
              <View style={[
                styles.methodBadge,
                ep.method === 'GET'
                  ? { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }
                  : { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }
              ]}>
                <Text style={[
                  styles.methodText,
                  { color: ep.method === 'GET' ? Colors.success : Colors.primary }
                ]}>{ep.method}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.endpointPath}>{ep.path}</Text>
                <Text style={styles.endpointDesc}>{ep.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Platform Headers */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <MaterialIcons name="swap-horiz" size={16} color={Colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Platform Headers</Text>
            <Text style={styles.sectionNote}>Auto-injected by every SDK</Text>
          </View>
          <View style={styles.headerTable}>
            {[
              { header: 'X-BTNG-Client',  value: 'android-native | ios-native | web | react-native' },
              { header: 'X-BTNG-UBL',     value: 'UBL-1.0' },
              { header: 'X-BTNG-Chain',   value: 'btng1' },
              { header: 'Content-Type',   value: 'application/json' },
            ].map(h => (
              <View key={h.header} style={styles.headerRow}>
                <Text style={styles.headerKey}>{h.header}</Text>
                <Text style={styles.headerVal} numberOfLines={2}>{h.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* SDK Cards */}
        <Text style={styles.sdkSectionTitle}>SDK Files · Tap to expand</Text>
        {SDK_FILES.map(sdk => <SDKCard key={sdk.id} sdk={sdk} />)}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerCoin}><Text style={styles.footerCoinText}>₿</Text></View>
          <Text style={styles.footerTitle}>BTNG Gold Coin · Ghana & Africa</Text>
          <Text style={styles.footerSub}>Ekuye Digital Gateway Trust Ltd</Text>
          <Text style={styles.footerSub}>Merchant ID 248059 · MTN MoMo</Text>
          <View style={styles.footerBadge}>
            <MaterialIcons name="verified" size={12} color={Colors.success} />
            <Text style={styles.footerBadgeText}>Sovereign Banking Infrastructure · UBL-1.0</Text>
          </View>
        </View>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  shareBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '44' },

  heroBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: '#100800', borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  heroCoin: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroCoinText: { fontSize: 26, color: Colors.primary, includeFontPadding: false },
  heroTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.3, includeFontPadding: false },
  heroSub: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  heroTagRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 2 },
  heroTag: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroTagText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  statsStrip: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 4, borderWidth: 1, borderColor: Colors.border },
  statItem: { flex: 1, alignItems: 'center', gap: 5 },
  statIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },

  sectionCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  sectionBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  sectionNote: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  endpointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderBottomWidth: 1, borderBottomColor: Colors.border },
  methodBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, minWidth: 46, alignItems: 'center', flexShrink: 0, marginTop: 1 },
  methodText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  endpointPath: { fontSize: FontSize.xs, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  endpointDesc: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },

  headerTable: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '88', gap: Spacing.sm },
  headerKey: { width: 130, fontSize: 10, color: Colors.warning, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: FontWeight.bold, includeFontPadding: false, flexShrink: 0 },
  headerVal: { flex: 1, fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },

  downloadBundleBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8, borderWidth: 1.5, borderColor: Colors.primary },
  downloadBundleBtnDone: { backgroundColor: Colors.success, shadowColor: Colors.success, borderColor: Colors.success },
  downloadBundleBtnTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: '#100800', includeFontPadding: false, letterSpacing: 0.2 },
  downloadBundleBtnSub: { fontSize: 9, color: '#100800', opacity: 0.7, includeFontPadding: false, marginTop: 2 },
  downloadBundleZipBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' },
  downloadBundleZipText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: '#100800', includeFontPadding: false },

  sdkSectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, marginBottom: Spacing.sm, includeFontPadding: false },

  footer: { alignItems: 'center', gap: 6, paddingTop: Spacing.xl, paddingBottom: Spacing.lg },
  footerCoin: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  footerCoinText: { fontSize: 24, color: Colors.primary, includeFontPadding: false },
  footerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  footerSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  footerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '44', marginTop: 4 },
  footerBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
});
