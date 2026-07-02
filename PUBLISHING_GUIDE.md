# BTNG Gold Coin — App Store Publishing Guide
# John Kojo Zi · Bituncoin Gold Bank · info@bituncoin.io

---

## App Identity

| Field | Value |
|---|---|
| App Name | BTNG Gold Coin |
| Subtitle | Africa's Sovereign Digital Currency |
| Bundle ID (iOS) | com.bituncoin.btng |
| Package Name (Android) | com.bituncoin.btng |
| Version | 2.0.0 |
| Category | Finance |
| Age Rating | 17+ (Financial) |

---

## App Store Description (Short — 30 chars)

Africa's Sovereign Gold Currency

## App Store Description (Long)

BTNG Gold Coin is Africa's premier sovereign digital banking platform — a unified, gold-backed cryptocurrency and trading ecosystem serving all 54 African nations and the global diaspora.

🏅 GOLD-BACKED CURRENCY
Every BTNG Gold Coin (BTNGG) is backed by physical gold held in the Bank of Ghana Vault 001, Accra. Real value, real sovereignty.

📈 COMPLETE TRADING PLATFORM
• Spot Trading — real-time crypto markets
• P2P Marketplace — trade directly with 54 nations
• Copy Trading — follow top traders automatically
• Binary Trading — advanced position trading
• Practice Wallet — risk-free paper trading

🏦 SOVEREIGN WALLET
• BTNG Genesis Wallet — HD BIP-39 multi-account
• MTN MoMo Cash Rail — live merchant payments
• QR Code payments & NFC tap-to-pay
• Bulk payment QR export

🌍 AFRICA FREE TRADE ZONE
• AfCFTA 54-nation trade engine
• Cross-border settlement in < 5 seconds
• 0.1% fee vs 8-15% traditional transfer
• Real-time live trade dashboard

🔐 SECURITY & IDENTITY
• KYC Verification with document upload
• 2-Factor Authentication (TOTP)
• Biometric lock (Face ID / Fingerprint)
• 6-digit PIN protection
• Equity Certificates (A–Z tiers)
• Certificate Scanner & QR verification

💳 PAYMENTS
• BTNG Pay Gateway
• BTNG Gold Card (4 card types)
• MTN MoMo integration (Merchant ID: 248059)
• Cash Rail transactions with receipts

🤖 AI-POWERED BANKING
• AI Private Banker — 54 Nations financial advisor
• AI Creator Studio
• BTNG Global Panel with FX Oracle
• Africa Value Engine ($59.5T sovereign)

⛓️ BLOCKCHAIN EXPLORER
• Live BTNG Block Explorer
• Transaction search & verification
• Network peer monitoring
• RBF Inspector (Bitcoin)
• Fee Rate Estimator

📊 ADDITIONAL FEATURES
• Blog & News (BTNG Research)
• Referral System (2% commissions)
• Fee Calculator
• FX Converter (54 African currencies)
• Copy Trading with performance tracking
• Watchlist & Price Alerts

Legal Company: EKUYE DIGITAL GATEWAY TRUST LTD
Registration: CS099020624 · TIN: C0064220206
Ghana Companies Act 992 · Founded 24 June 2024
Founder: John Kojo Zi

---

## Keywords (iOS — 100 chars max)

bitcoin,gold,crypto,africa,ghana,trading,wallet,btng,fintech,momo,AfCFTA,blockchain,defi

---

## Privacy Policy URL

https://www.bituncoin.io/privacy

## Terms of Service URL

https://www.bituncoin.io/terms

## Support URL

https://www.bituncoin.io/support

## Marketing URL

https://www.bituncoin.io

---

## Step-by-Step Publishing

### Prerequisites

1. Install EAS CLI:
   npm install -g eas-cli

2. Login to Expo:
   eas login

3. Initialize project (first time):
   eas init

---

### iOS — Apple App Store

**Requirements:**
- Apple Developer Account ($99/year) at developer.apple.com
- Enroll in Apple Developer Program
- Create App ID: com.bituncoin.btng

**Step 1: Create App in App Store Connect**
1. Go to appstoreconnect.apple.com
2. Apps → "+" → New App
3. Platform: iOS
4. Name: BTNG Gold Coin
5. Bundle ID: com.bituncoin.btng
6. SKU: btng-gold-coin-2026
7. Access: Full Access

**Step 2: Fill App Information**
- Category: Finance
- Subtitle: Africa's Sovereign Digital Currency
- Description: (use text above)
- Keywords: (use keywords above)
- Support URL: https://www.bituncoin.io/support
- Privacy Policy URL: https://www.bituncoin.io/privacy

**Step 3: Build for iOS**
   eas build --platform ios --profile production

**Step 4: Submit to App Store**
   eas submit --platform ios --profile production

   OR manually upload .ipa via Transporter app

**Step 5: App Review**
- Select build in App Store Connect
- Add review notes: "BTNG Gold Coin is a crypto trading and banking app for Africa. Test account: test@btng.gold / TestPass123"
- Submit for Review (typically 1-3 days)

---

### Android — Google Play Store

**Requirements:**
- Google Play Developer Account ($25 one-time) at play.google.com/console
- Create app in Play Console

**Step 1: Create App in Play Console**
1. Go to play.google.com/console
2. All Apps → "Create app"
3. App name: BTNG Gold Coin
4. Default language: English (US)
5. App or Game: App
6. Free or Paid: Free

**Step 2: Complete Store Listing**
- Short description (80 chars): Africa's sovereign gold-backed crypto banking platform
- Full description: (use text above)
- Category: Finance
- Email: info@bituncoin.io
- Screenshots: at least 2 phone screenshots required
- Feature graphic: 1024×500px banner

**Step 3: Build Android App Bundle**
   eas build --platform android --profile production

   This produces a .aab file (Android App Bundle)

**Step 4: Submit to Play Store**
   eas submit --platform android --profile production

   OR upload .aab manually in Play Console → Production → Releases

**Step 5: Content Rating**
- Complete IARC questionnaire
- Finance apps: select "References to real currency"
- This will assign the app rating automatically

**Step 6: Data Safety Form**
- Complete the Data Safety section
- Declare: email collection, financial info, device identifiers
- Privacy policy URL: https://www.bituncoin.io/privacy

**Step 7: Release**
- Review → Release to Production
- Rollout: start at 20%, then 100%
- Review typically takes 1-7 days

---

## EAS Build Commands Reference

# Build preview APK (Android) — for testing
eas build --platform android --profile preview

# Build production AAB (Android) — for Play Store
eas build --platform android --profile production

# Build production IPA (iOS) — for App Store
eas build --platform ios --profile production

# Build both platforms simultaneously
eas build --platform all --profile production

# Submit iOS to App Store
eas submit --platform ios

# Submit Android to Play Store
eas submit --platform android

# Check build status
eas build:list

# Update OTA (over-the-air update — no new store submission needed)
eas update --channel production --message "BTNG v2.0 patch"

---

## App Store Screenshots Required

### iPhone (6.7" — required)
- 1290 × 2796 px
- Minimum 3, maximum 10

### iPhone (5.5" — required)
- 1242 × 2208 px

### iPad Pro (12.9" — if supportsTablet: true)
- 2048 × 2732 px

### Android Phone (required)
- At least 2 screenshots
- 16:9 or 9:16 aspect ratio
- Min 320px on shortest side, max 3840px

**Suggested screenshot order:**
1. Market dashboard (home screen)
2. BTNG Genesis Wallet
3. Trade screen
4. P2P Marketplace
5. BTNG Block Explorer
6. Certificate Scanner
7. Cash Rail (MoMo QR)
8. Admin Dashboard

---

## App Store Review Tips

1. Have a test account ready for reviewers
2. Mention NFC usage in review notes (Apple requires explanation)
3. Camera permission — explain QR scanning use case
4. Face ID — explain wallet security use case
5. Crypto apps: ensure compliance with local laws disclosure
6. Add a disclaimer: "Virtual currency is not legal tender"

---

## Important Notes

- The `extra.eas.projectId` in app.json must match your real Expo project ID after running `eas init`
- iOS credentials (certificates, provisioning profiles) are managed automatically by EAS when `credentialsSource: "remote"`
- For Android, you need a Google Service Account key for automated submission
- OTA updates via `eas update` can push fixes without App Store review (JS bundle only, no native changes)
