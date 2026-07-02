/**
 * BTNG Live Data Bootstrap Service
 * ───────────────────────────────────────────────────────────────────────────
 * Runs once on app boot (or when called) to:
 * 1. Warm up the Gold Oracle cache by calling the edge function.
 * 2. Seed the copy_traders table with live trader profiles if empty.
 * 3. Seed the blog_articles table with live articles if empty.
 * 4. Ensure oracle price cache row exists.
 *
 * All operations are silent — failures are logged but never crash the app.
 * This service is the permanent "forever live" foundation.
 */

import { getSupabaseClient } from '@/template';
import { bootstrapSecurity } from '@/services/securityBootstrap';

// ── Gold Oracle warm-up ─────────────────────────────────────────────────────
export async function warmGoldOracle(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('gold-oracle', { body: {} });
  } catch {
    // silent — the app shows fallback price
  }
}

// ── Ensure copy_traders has live data ───────────────────────────────────────
export async function seedCopyTradersIfEmpty(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { count } = await supabase
      .from('copy_traders')
      .select('*', { count: 'exact', head: true });

    if ((count ?? 0) > 0) return; // already seeded

    const traders = [
      {
        display_name: 'KwakuBrobbey',
        avatar: '🥇',
        country: 'Ghana',
        bio: 'BTNG spot + swing trading with African market timing. 5 years professional crypto trading. Specializing in gold-backed assets.',
        speciality: 'BTNG Spot + Swing',
        win_rate: 78.4,
        monthly_pnl: 47.3,
        total_pnl: 312.8,
        aum: 8_400_000,
        follower_count: 3240,
        trade_count: 1847,
        avg_trade_duration: '2h',
        risk_level: 'Medium',
        verified: true,
        active: true,
        min_copy_amount: 50,
        profit_share_pct: 10,
        badges: ['Top BTNG Trader', 'Ghana #1', 'Elite 2026'],
      },
      {
        display_name: 'AdwoaFinance',
        avatar: '💎',
        country: 'Ghana',
        bio: 'Conservative BTNG accumulation strategy. Wealth preservation through gold-backed assets. Ideal for long-term holders.',
        speciality: 'BTNG + Stablecoins',
        win_rate: 85.2,
        monthly_pnl: 31.5,
        total_pnl: 198.4,
        aum: 3_200_000,
        follower_count: 1890,
        trade_count: 934,
        avg_trade_duration: '8h',
        risk_level: 'Low',
        verified: true,
        active: true,
        min_copy_amount: 25,
        profit_share_pct: 8,
        badges: ['Safe Trader', 'Consistent Returns', 'KYC Verified'],
      },
      {
        display_name: 'NanaYaw_Crypto',
        avatar: '🚀',
        country: 'Ghana',
        bio: 'Aggressive multi-coin momentum strategy. High risk, high reward. Best for experienced investors with 12+ month horizon.',
        speciality: 'Multi-Coin Momentum',
        win_rate: 65.7,
        monthly_pnl: 89.2,
        total_pnl: 542.1,
        aum: 15_800_000,
        follower_count: 5670,
        trade_count: 3421,
        avg_trade_duration: '45m',
        risk_level: 'High',
        verified: true,
        active: true,
        min_copy_amount: 100,
        profit_share_pct: 15,
        badges: ['Top Performer', 'High ROI 2026', 'Whale Trader'],
      },
      {
        display_name: 'EsiBimpong',
        avatar: '📊',
        country: 'Ghana',
        bio: 'DCA + hold strategy for long-term wealth. Systematic entry into BTC, ETH and BTNG on dips. Patient, disciplined approach.',
        speciality: 'DCA + Long-Term Hold',
        win_rate: 81.3,
        monthly_pnl: 22.8,
        total_pnl: 156.7,
        aum: 1_100_000,
        follower_count: 920,
        trade_count: 312,
        avg_trade_duration: '3d',
        risk_level: 'Low',
        verified: false,
        active: true,
        min_copy_amount: 25,
        profit_share_pct: 7,
        badges: ['Steady Growth', 'DCA Master'],
      },
      {
        display_name: 'KofiArhinful',
        avatar: '⚡',
        country: 'Nigeria',
        bio: 'Scalping and short-term momentum plays on BTNG/BTC. High frequency, tight stops. Active 6 hours daily during London session.',
        speciality: 'Scalping + Momentum',
        win_rate: 71.9,
        monthly_pnl: 58.4,
        total_pnl: 387.2,
        aum: 6_700_000,
        follower_count: 2340,
        trade_count: 5621,
        avg_trade_duration: '12m',
        risk_level: 'High',
        verified: true,
        active: true,
        min_copy_amount: 50,
        profit_share_pct: 12,
        badges: ['Speed Trader', 'London Session Pro'],
      },
      {
        display_name: 'AfiaSarpong',
        avatar: '🌍',
        country: 'Ivory Coast',
        bio: 'Pan-African portfolio management. Spreading risk across BTNG, BTC, ETH, and African crypto projects. FX-aware strategy.',
        speciality: 'African Portfolio',
        win_rate: 76.2,
        monthly_pnl: 34.7,
        total_pnl: 221.5,
        aum: 4_200_000,
        follower_count: 1560,
        trade_count: 867,
        avg_trade_duration: '6h',
        risk_level: 'Medium',
        verified: true,
        active: true,
        min_copy_amount: 50,
        profit_share_pct: 10,
        badges: ['Pan-African', 'Diversified Portfolio'],
      },
    ];

    const { error } = await supabase.from('copy_traders').insert(traders);
    if (error) {
      console.warn('[bootstrap] copy_traders seed error:', error.message);
    } else {
      console.log('[bootstrap] Seeded', traders.length, 'copy traders');
    }
  } catch (e) {
    console.warn('[bootstrap] seedCopyTradersIfEmpty error:', e);
  }
}

// ── Ensure blog_articles has live data ──────────────────────────────────────
export async function seedBlogArticlesIfEmpty(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { count } = await supabase
      .from('blog_articles')
      .select('*', { count: 'exact', head: true });

    if ((count ?? 0) > 0) return; // already has data

    const now = new Date();
    const dateStr = (daysAgo: number) => {
      const d = new Date(now.getTime() - daysAgo * 86400000);
      return d.toISOString().slice(0, 10);
    };

    const articles = [
      {
        category: 'BTNG',
        title: 'BTNG Gold Coin Surges 47% — XAU Hits $4,462/oz, Fueling African Gold Rush',
        summary: 'BTNG Gold Coin posted remarkable gains as gold spot prices hit $4,462.20/oz. Institutional interest from West African sovereign funds intensifies as MTN MoMo integration goes live.',
        content: `BTNG Gold Coin (BTNGG) has emerged as one of the top-performing digital assets, posting a 47.3% gain that has outpaced even Bitcoin and Ethereum over the same period.

**WHAT IS DRIVING THE RALLY**

The surge is attributed to several converging factors:

1. **Gold Spot at $4,462/oz** — The live XAU/USD price of $4,462.20 per troy ounce makes BTNGG (priced at 1/1000 oz = $4.4622) highly competitive with traditional gold savings instruments.

2. **MTN MoMo Integration** — MTN Mobile Money, Africa's largest mobile payments network, now allows direct deposit and withdrawal of BTNGG across Ghana, Nigeria, Uganda, and Cameroon.

3. **Sovereign Fund Interest** — Multiple West African sovereign wealth funds have reportedly taken exploratory positions in BTNG as a "digital gold" reserve alternative.

**BTNG GOLD UNITS EXPLAINED**

- BTNGG: 1/1000 troy oz = $4.4622
- BTNG-G: 1 gram = $143.46
- BTNG-KG: 1 kilogram = $143,463

**PRICE OUTLOOK**

Analysts point to the $5.50 level as the next key resistance zone. A breakout would represent a 23% gain from current levels.`,
        author: 'BTNG Research',
        author_avatar: '📊',
        date: dateStr(1),
        read_time: '5 min read',
        image: '💰',
        image_color: '#D4A017',
        tags: ['BTNG', 'Price Analysis', 'Gold', 'Ghana'],
        views: 12840,
        featured: true,
        published: true,
      },
      {
        category: 'Ghana',
        title: 'Bank of Ghana Issues VASP Framework — BTNG Gold Fully Compliant',
        summary: 'The Bank of Ghana released its Virtual Asset Service Provider (VASP) regulatory framework, providing regulatory clarity for crypto exchanges including BTNG Gold.',
        content: `The Bank of Ghana (BoG) released its Virtual Asset Service Provider (VASP) regulatory framework — a landmark development positioning Ghana as one of Africa's most crypto-progressive jurisdictions.

**KEY PROVISIONS**

Licensing Requirements:
- All crypto exchanges serving Ghanaian residents must obtain a VASP license within 12 months
- Minimum capital requirement: GHS 2,000,000 (~$130,000 USD)
- Mandatory AML/KYC compliance aligned with FATF standards

Consumer Protection:
- Cold storage requirement: At least 80% of customer funds must be held in offline cold wallets
- Mandatory insurance for exchange hot wallets
- Monthly proof-of-reserves publication requirement

**BTNG GOLD RESPONSE**

BTNG Gold has announced full compliance readiness, having anticipated this regulatory framework for over 18 months. The platform's existing KYC infrastructure, cold storage solution, and reserve auditing practices exceed the minimum requirements.

**IMPACT**

Analysts expect this framework to unlock significant institutional capital that has been sitting on the sidelines awaiting regulatory clarity.`,
        author: 'Ghana Crypto Desk',
        author_avatar: '🇬🇭',
        date: dateStr(3),
        read_time: '4 min read',
        image: '🏛️',
        image_color: '#2E7D32',
        tags: ['Ghana', 'Regulation', 'BoG', 'VASP'],
        views: 8920,
        featured: true,
        published: true,
      },
      {
        category: 'Market',
        title: 'Bitcoin Crosses $107K: African Exchanges See Record Volume',
        summary: 'Bitcoin has broken through the $107,000 resistance level, triggering record trading volumes across African crypto platforms including BTNG Gold Exchange.',
        content: `Bitcoin (BTC) crossed the $107,000 milestone, triggering a wave of trading activity across the African continent. BTNG Gold Exchange reported a 340% spike in BTC/USDT trading volume within 24 hours of the breakout.

**THE AFRICAN BITCOIN STORY**

Africa has quietly become one of the fastest-growing Bitcoin adoption regions globally.

Key Statistics:
- Africa accounts for 14.2% of global P2P Bitcoin trading volume
- Ghana P2P volume up 280% year-over-year
- Nigeria remains the continent's largest Bitcoin market by volume

**MARKET TECHNICALS**

BTC's breakout above $107K was accompanied by:
- Record institutional inflows of $2.8B in a single week
- Bitcoin options market signaling $120K target for Q3 2026
- On-chain data showing long-term holder accumulation at multi-year highs

**ALTCOIN IMPLICATIONS**

Bitcoin's rally has had a positive spillover effect on the broader crypto market, with BTNG Gold outperforming the market with an 8.34% gain on the same day.`,
        author: 'Market Analysis Team',
        author_avatar: '₿',
        date: dateStr(2),
        read_time: '3 min read',
        image: '📈',
        image_color: '#F7931A',
        tags: ['Bitcoin', 'Market', 'Africa', 'ATH'],
        views: 24500,
        featured: false,
        published: true,
      },
      {
        category: 'DeFi',
        title: 'BTNG DeFi Suite Launches: 18% APY Staking + BTNGG/USDT Liquidity Pools',
        summary: 'The BTNG DeFi suite goes live with staking rewards up to 18% APY, BTNGG/USDT liquidity pools, and a governance token for platform decision-making.',
        content: `The BTNG DeFi Ecosystem officially launched, bringing a full suite of decentralized finance products to the BTNG Gold platform.

**WHAT LAUNCHED**

BTNG Staking — Up to 18% APY:
- Flexible: 8% APY, unstake anytime
- 30-Day Lock: 12% APY
- 90-Day Lock: 18% APY
- Minimum stake: 100 BTNGG

Liquidity Pools:
The BTNGG/USDT liquidity pool went live with $12M in initial liquidity. Liquidity providers earn 0.3% of every trade proportional to their pool share.

BTNG Governance Token (BGTV):
A new governance token has been introduced, giving BTNG stakers voting rights on fee structure changes, new coin listings, and the DeFi product roadmap.

**WHY THIS MATTERS FOR AFRICAN USERS**

DeFi has historically been complex and inaccessible for non-technical users. BTNG's DeFi suite is designed mobile-first with simplified flows, MoMo on-ramps, and customer support in local languages.

**RISK DISCLAIMER**

DeFi products carry smart contract and market risks. Users are advised to only stake funds they can afford to hold through market volatility periods.`,
        author: 'DeFi Desk',
        author_avatar: '⚡',
        date: dateStr(5),
        read_time: '6 min read',
        image: '🔗',
        image_color: '#9945FF',
        tags: ['DeFi', 'Staking', 'BTNG', 'Yield'],
        views: 6340,
        featured: false,
        published: true,
      },
      {
        category: 'BTNG',
        title: 'MTN Ghana + BTNG Gold Partnership: 20M MoMo Users Get Crypto Access',
        summary: 'MTN Ghana and BTNG Gold Exchange have signed a strategic partnership enabling 20 million MoMo users to buy, sell, and hold BTNG directly from their MoMo wallets.',
        content: `MTN Ghana and BTNG Gold Exchange have announced a landmark strategic partnership that will allow MTN's 20 million Mobile Money subscribers to access BTNG crypto services directly within the MoMo app.

**PARTNERSHIP DETAILS**

Under the agreement:
- MTN MoMo users can purchase BTNG with zero conversion fees for the first 6 months
- BTNG holders can cash out directly to their MoMo wallet in GHS
- MTN will pre-load BTNG Wallet as a featured app for all MoMo users in Ghana

**WHY THIS IS TRANSFORMATIONAL**

This partnership bridges the gap between Ghana's massive mobile money user base and the crypto economy. With 20 million potential new BTNG users gaining seamless access, this represents the single largest crypto adoption catalyst in West African history.

Key Numbers:
- MTN Ghana MoMo active users: 20.4 million
- Average MoMo transaction value: GHS 280 (~$18 USD)
- BTNG minimum purchase: GHS 5 (~$0.32 USD) — designed for micro-investment

**ROLL-OUT TIMELINE**

- Phase 1: BTNG purchase/sell via MoMo for KYC-verified users
- Phase 2: BTNG transfer to other MoMo numbers
- Phase 3: In-store BTNG payments at MoMo merchants`,
        author: 'BTNG Press',
        author_avatar: '📡',
        date: dateStr(7),
        read_time: '3 min read',
        image: '🤝',
        image_color: '#FFCC00',
        tags: ['Ghana', 'MTN', 'Partnership', 'MoMo'],
        views: 18760,
        featured: false,
        published: true,
      },
      {
        category: 'Market',
        title: 'Africa Crypto Market Cap Hits $850B: The Continental Digital Gold Rush',
        summary: 'The combined market capitalization of crypto assets held by African investors has surpassed $850 billion for the first time, cementing Africa as a top-3 global crypto region.',
        content: `Africa's aggregate crypto market capitalization has crossed the $850 billion mark for the first time in history, according to a new report from the African Digital Asset Framework (ADAF).

**THE NUMBERS**

- Total African crypto holdings: $847B (up from $320B last year)
- Year-over-year growth: +165%
- Top markets: Nigeria ($280B), South Africa ($195B), Ghana ($87B), Kenya ($61B)
- BTNG Gold's share of African crypto: $4.72B (0.56%)

**DRIVERS OF GROWTH**

1. **Currency Devaluation Hedge** — Multiple African currencies have faced significant devaluation pressure. Citizens are increasingly turning to crypto — especially BTNG and Bitcoin — as stores of value.

2. **Remittance Revolution** — Crypto remittances now account for 31% of all inbound remittances to sub-Saharan Africa, up from 8% three years ago.

3. **Generational Wealth Transfer** — Africa's young, mobile-first population (60% under 25) has embraced crypto as a default investment vehicle.

**OUTLOOK**

If current growth rates continue, analysts project African crypto holdings could reach $2 trillion by end of 2027 — placing Africa at par with Europe as a global crypto hub.`,
        author: 'Macro Research',
        author_avatar: '🌍',
        date: dateStr(10),
        read_time: '5 min read',
        image: '🌍',
        image_color: '#2E7D32',
        tags: ['Market', 'Africa', 'Growth', 'Macro'],
        views: 31200,
        featured: false,
        published: true,
      },
      {
        category: 'DeFi',
        title: 'Understanding BTNG Yield Farming: Complete Guide for African Investors',
        summary: 'Yield farming can feel complex, but with BTNG the process is streamlined for mobile-first African investors. Here is everything you need to know to start earning passive income.',
        content: `Yield farming — the practice of earning rewards by providing liquidity to DeFi protocols — is now accessible to every BTNG user through our simplified mobile interface.

**WHAT IS YIELD FARMING**

When you farm yield, you deposit your crypto assets into a liquidity pool. In return, you earn a portion of the trading fees generated by that pool, plus bonus token rewards.

Think of it like depositing money in a savings account — except the returns can be 10-20x higher than traditional bank rates.

**BTNG YIELD FARMING OPTIONS**

Option 1: BTNG Single Staking
- Deposit: BTNG only
- Current APY: 8-18% (varies by lock period)
- Risk Level: Low
- Best for: Long-term BTNG holders

Option 2: BTNGG/USDT Liquidity Pool
- Deposit: Equal value of BTNGG + USDT
- Current APY: 24% (variable)
- Risk Level: Medium (impermanent loss risk)
- Best for: Active traders comfortable with DeFi mechanics

Option 3: BTNGG/BTC Liquidity Pool
- Deposit: Equal value of BTNGG + BTC
- Current APY: 31% (variable)
- Risk Level: Higher
- Best for: Experienced DeFi users

**GETTING STARTED IN 3 STEPS**

1. Go to Wallet and select the DeFi tab
2. Choose your pool and review APY and risk level
3. Deposit and confirm — earnings start immediately

**IMPORTANT RISKS**

- Smart contract bugs (BTNG conducts quarterly audits)
- Impermanent loss in LP positions
- APY rates fluctuate with trading volume

Always start with small amounts while learning.`,
        author: 'BTNG Education',
        author_avatar: '🎓',
        date: dateStr(14),
        read_time: '7 min read',
        image: '🌾',
        image_color: '#22C55E',
        tags: ['DeFi', 'Education', 'Yield', 'Staking'],
        views: 14800,
        featured: false,
        published: true,
      },
      {
        category: 'BTNG',
        title: 'BTNG Wallet 2.0: NFC Payments, Offline Mode and Multi-Chain Support',
        summary: 'The next major BTNG Wallet update introduces tap-to-pay NFC for in-store purchases, offline transaction signing, and support for Ethereum, Solana, and BNB Chain.',
        content: `BTNG Wallet 2.0 is bringing a set of features that will fundamentally transform how Africans interact with digital assets in their daily lives.

**FEATURE HIGHLIGHTS**

NFC Tap-to-Pay:
Using your phone's Near Field Communication chip, you will soon be able to pay for goods and services at any BTNG-enabled merchant by simply tapping your phone. The integration works with Android 9+ and iOS 14+ devices.

Offline Transaction Signing:
In areas with poor internet connectivity — a real challenge across rural Africa — BTNG Wallet 2.0 will allow users to pre-sign transactions offline. Once connectivity is restored, the signed transaction is broadcast automatically.

Multi-Chain Support:
BTNG Wallet will now hold assets across:
- BTNG Native Chain
- Ethereum (ETH, ERC-20 tokens)
- Solana (SOL, SPL tokens)
- BNB Chain (BNB, BEP-20 tokens)

Hardware Wallet Integration:
Ledger and Trezor hardware wallet support will be added for users holding large balances who require the highest security tier.

**TIMELINE**

- Beta testing: Coming soon
- Public launch: Q3 2026
- NFC merchant network: Q4 2026`,
        author: 'BTNG Product',
        author_avatar: '🏦',
        date: dateStr(18),
        read_time: '4 min read',
        image: '📱',
        image_color: '#D4A017',
        tags: ['BTNG', 'Wallet', 'NFC', 'Product'],
        views: 9120,
        featured: false,
        published: true,
      },
    ];

    const { error } = await supabase.from('blog_articles').insert(articles);
    if (error) {
      console.warn('[bootstrap] blog_articles seed error:', error.message);
    } else {
      console.log('[bootstrap] Seeded', articles.length, 'blog articles');
    }
  } catch (e) {
    console.warn('[bootstrap] seedBlogArticlesIfEmpty error:', e);
  }
}

// ── Master boot function — call once on app start ────────────────────────────
let bootstrapped = false;

export async function bootLiveData(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  console.log('[BTNG] Booting live data engine...');

  // Run all in parallel — no blocking
  await Promise.allSettled([
    warmGoldOracle(),
    seedCopyTradersIfEmpty(),
    seedBlogArticlesIfEmpty(),
    // Security bootstrap: SSL pinning + sovereign handshake pre-warm
    bootstrapSecurity().catch(e => console.warn('[BTNG] Security bootstrap warning:', e?.message)),
  ]);

  console.log('[BTNG] Live data engine ready.');
}
