// BTNG Global Terminal — LIVE Trading Dashboard · Real-Time Prices · Order Book · Insights
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useGoldOracle } from '@/hooks/useGoldOracle';
import { BTNGGoldChart } from '@/components';
import { Image } from 'expo-image';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────
interface LiveCoin {
  id: string; symbol: string; name: string; emoji: string;
  category: 'crypto'|'gold'|'btng'|'defi'|'stablecoin';
  price: number; prevPrice: number; change24h: number;
  marketCap: number; volume24h: number; high24h: number; low24h: number;
  cgId?: string; chain?: string; verified?: boolean; color: string;
  lastFlash?: 'up'|'down'|null;
  logoUri?: string; // optional remote/local image URI overriding emoji
}
interface OrderBookEntry { price:number; size:number; total:number; }

// ── BTNG ecosystem tokens ─────────────────────────────────────────────────────
const BTNG_COIN_URI = 'https://cdn-ai.onspace.ai/onspace/files/HHGFAwpKCzZk32yLFQ4SxR/1000138275.jpg';

// BTNG unit math constants (same as mockData.ts / WalletContext)
// XAU/USD spot: $4,441.84/oz (fawazahmed0 CDN live — June 6 2026)
// BTNGG  = 1/1000 oz  → $4.4418
// BTNG-G = 1 gram     → $4,441.84 / 31.1035 = $142.81
// BTNG-AU = 1 troy oz → $4,441.84
const _INIT_XAU  = 4_441.84;
const _INIT_BTNGG   = _INIT_XAU / 1000;          // $4.4418
const _INIT_BTNG_G  = _INIT_XAU / 31.1035;       // $142.81  (1 gram)
const _INIT_BTNG_AU = _INIT_XAU;                  // $4,441.84 (1 troy oz cert)

const BTNG_TOKENS: LiveCoin[] = [
  // BTNGG  = 1/1000 troy oz  ≈ $4.4622
  { id:'btngg',  symbol:'BTNGG',   name:'Bituncoin Gold (1/1000 oz)', emoji:'🥇', category:'btng',       price:_INIT_BTNGG,  prevPrice:_INIT_BTNGG,  change24h:+0.278, marketCap:_INIT_BTNGG*15_000_000_000, volume24h:2_100_000_000, high24h:_INIT_BTNGG*1.008, low24h:_INIT_BTNGG*0.992, chain:'BTNG', verified:true,  color:Colors.kenteGold, logoUri:BTNG_COIN_URI },
  // BTNG-G = 1 gram XAU      ≈ $143.46
  { id:'btng-g', symbol:'BTNG-G',  name:'Bituncoin Gold (1 gram)',    emoji:'🪙', category:'gold',       price:_INIT_BTNG_G, prevPrice:_INIT_BTNG_G, change24h:+0.278, marketCap:_INIT_BTNG_G*10_000_000_000, volume24h:890_000_000,   high24h:_INIT_BTNG_G*1.008, low24h:_INIT_BTNG_G*0.992, chain:'BTNG', verified:true,  color:'#C8A951', logoUri:BTNG_COIN_URI },
  // BTNG-AU = 1 troy oz XAU  ≈ $4,462.20
  { id:'btngau', symbol:'BTNG-AU', name:'BTNG Gold Certificate (1 oz)',emoji:'🏅', category:'gold',       price:_INIT_BTNG_AU,prevPrice:_INIT_BTNG_AU,change24h:+0.278, marketCap:_INIT_BTNG_AU*8_000_000_000, volume24h:620_000_000,   high24h:_INIT_BTNG_AU*1.008,low24h:_INIT_BTNG_AU*0.992, chain:'BTNG', verified:true,  color:'#F59E0B', logoUri:BTNG_COIN_URI },
  { id:'btnggh', symbol:'BTNG-GH', name:'Ghana Reserve Token',        emoji:'🇬🇭', category:'btng',     price:0.278,  prevPrice:0.278,  change24h:+1.45, marketCap:12_000_000_000, volume24h:44_000_000,   high24h:0.284,low24h:0.271, chain:'BTNG', verified:true,  color:'#22C55E', logoUri:BTNG_COIN_URI },
  { id:'afro54', symbol:'AFRO54',  name:'Africa 54 Index',            emoji:'🌍', category:'btng',       price:18.5,   prevPrice:18.5,   change24h:+2.12, marketCap:5_200_000_000,  volume24h:18_000_000,   high24h:18.9, low24h:18.1,  chain:'BTNG', verified:true,  color:'#3B82F6', logoUri:BTNG_COIN_URI },
  { id:'afn',    symbol:'AFN',     name:'African Note',               emoji:'💵', category:'stablecoin', price:0.001,  prevPrice:0.001,  change24h:+0.03, marketCap:800_000_000,    volume24h:3_500_000,    high24h:0.001,low24h:0.001, chain:'BTNG', verified:true,  color:'#22C55E', logoUri:BTNG_COIN_URI },
  { id:'cocoa',  symbol:'COCOA',   name:'Ghana Cocoa Token',          emoji:'🍫', category:'btng',       price:0.0044, prevPrice:0.0044, change24h:+3.71, marketCap:140_000_000,    volume24h:1_100_000,    high24h:0.0046,low24h:0.0042,chain:'BTNG', verified:false, color:'#92400E', logoUri:BTNG_COIN_URI },
];

// ── Crypto base list ──────────────────────────────────────────────────────────
const CRYPTO_BASE: LiveCoin[] = [
  { id:'btc',  symbol:'BTC',  name:'Bitcoin',       emoji:'₿',  category:'crypto',     price:105200, prevPrice:105200, change24h:+1.82, marketCap:2070000000000, volume24h:48200000000, high24h:106800,low24h:104100,cgId:'bitcoin',     chain:'BTC',  verified:true, color:'#F7931A' },
  { id:'eth',  symbol:'ETH',  name:'Ethereum',      emoji:'⟠',  category:'crypto',     price:3950,   prevPrice:3950,   change24h:+2.34, marketCap:476000000000,  volume24h:21900000000, high24h:4010, low24h:3880,  cgId:'ethereum',    chain:'ETH',  verified:true, color:'#627EEA' },
  { id:'bnb',  symbol:'BNB',  name:'BNB Chain',     emoji:'🔶', category:'crypto',     price:698,    prevPrice:698,    change24h:+0.91, marketCap:102000000000,  volume24h:2400000000,  high24h:714,  low24h:688,   cgId:'binancecoin', chain:'BSC',  verified:true, color:'#F3BA2F' },
  { id:'sol',  symbol:'SOL',  name:'Solana',        emoji:'◎',  category:'crypto',     price:184,    prevPrice:184,    change24h:+3.12, marketCap:87000000000,   volume24h:6700000000,  high24h:192,  low24h:178,   cgId:'solana',      chain:'SOL',  verified:true, color:'#9945FF' },
  { id:'xrp',  symbol:'XRP',  name:'XRP',           emoji:'✕',  category:'crypto',     price:2.18,   prevPrice:2.18,   change24h:-0.44, marketCap:125000000000,  volume24h:5800000000,  high24h:2.24, low24h:2.14,  cgId:'ripple',      chain:'XRP',  verified:true, color:'#00AAE4' },
  { id:'ada',  symbol:'ADA',  name:'Cardano',       emoji:'♾',  category:'crypto',     price:0.795,  prevPrice:0.795,  change24h:+1.67, marketCap:28000000000,   volume24h:890000000,   high24h:0.814,low24h:0.781, cgId:'cardano',     chain:'ADA',  verified:true, color:'#0033AD' },
  { id:'avax', symbol:'AVAX', name:'Avalanche',     emoji:'🔺', category:'crypto',     price:38.5,   prevPrice:38.5,   change24h:+2.88, marketCap:16000000000,   volume24h:720000000,   high24h:39.8, low24h:37.2,  cgId:'avalanche-2', chain:'AVAX', verified:true, color:'#E84142' },
  { id:'dot',  symbol:'DOT',  name:'Polkadot',      emoji:'⬛', category:'crypto',     price:8.74,   prevPrice:8.74,   change24h:+1.22, marketCap:13000000000,   volume24h:480000000,   high24h:9.1,  low24h:8.5,   cgId:'polkadot',    chain:'DOT',  verified:true, color:'#E6007A' },
  { id:'link', symbol:'LINK', name:'Chainlink',     emoji:'🔗', category:'crypto',     price:22.1,   prevPrice:22.1,   change24h:+1.54, marketCap:14000000000,   volume24h:1100000000,  high24h:22.9, low24h:21.4,  cgId:'chainlink',   chain:'ETH',  verified:true, color:'#2A5ADA' },
  { id:'sui',  symbol:'SUI',  name:'Sui',           emoji:'🌊', category:'crypto',     price:3.84,   prevPrice:3.84,   change24h:+4.11, marketCap:10800000000,   volume24h:1800000000,  high24h:3.98, low24h:3.72,  cgId:'sui',         chain:'SUI',  verified:true, color:'#4DA2FF' },
  { id:'uni',  symbol:'UNI',  name:'Uniswap',       emoji:'🦄', category:'defi',       price:9.44,   prevPrice:9.44,   change24h:+0.73, marketCap:5650000000,    volume24h:210000000,   high24h:9.66, low24h:9.22,  cgId:'uniswap',     chain:'ETH',  verified:true, color:'#FF007A' },
  { id:'near', symbol:'NEAR', name:'NEAR Protocol', emoji:'🌐', category:'crypto',     price:5.93,   prevPrice:5.93,   change24h:+2.29, marketCap:6850000000,    volume24h:490000000,   high24h:6.12, low24h:5.78,  cgId:'near',        chain:'NEAR', verified:true, color:'#00C08B' },
  { id:'arb',  symbol:'ARB',  name:'Arbitrum',      emoji:'🔵', category:'defi',       price:0.614,  prevPrice:0.614,  change24h:+1.38, marketCap:2440000000,    volume24h:180000000,   high24h:0.634,low24h:0.598, cgId:'arbitrum',    chain:'ETH',  verified:true, color:'#28A0F0' },
  { id:'paxg', symbol:'PAXG', name:'PAX Gold',      emoji:'🥇', category:'gold',       price:4329,   prevPrice:4329,   change24h:-0.26, marketCap:810000000,     volume24h:22000000,    high24h:4380, low24h:4295,  cgId:'pax-gold',    chain:'ETH',  verified:true, color:Colors.kenteGold },
  { id:'usdt', symbol:'USDT', name:'Tether',        emoji:'💚', category:'stablecoin', price:1.00,   prevPrice:1.00,   change24h:+0.01, marketCap:145000000000,  volume24h:95000000000, high24h:1.001,low24h:0.999, cgId:'tether',      chain:'ETH',  verified:true, color:'#26A17B' },
  { id:'usdc', symbol:'USDC', name:'USD Coin',      emoji:'🔵', category:'stablecoin', price:1.00,   prevPrice:1.00,   change24h:0.00,  marketCap:47000000000,   volume24h:10000000000, high24h:1.001,low24h:0.999, cgId:'usd-coin',    chain:'ETH',  verified:true, color:'#2775CA' },
];

const ALL_COINS: LiveCoin[] = [...CRYPTO_BASE, ...BTNG_TOKENS];
const CATEGORIES = [
  { id:'all',        label:'All',    color:Colors.primary },
  { id:'crypto',     label:'Crypto', color:'#F7931A' },
  { id:'gold',       label:'Gold',   color:Colors.kenteGold },
  { id:'btng',       label:'BTNG',   color:Colors.primary },
  { id:'defi',       label:'DeFi',   color:'#FF007A' },
  { id:'stablecoin', label:'Stable', color:'#26A17B' },
];
const SORT_OPTIONS = ['Market Cap','Price','24h %','Volume'];
const ORDER_TYPES  = ['Market','Limit','Stop-Loss'];
const TABS = ['📊 Markets','🥇 Gold','⚡ Trade','📋 List','📈 Insights'];

// ── Fetch live prices via Edge Function (CoinGecko Pro key stays server-side)
type PriceMap = Record<string,{price:number;change24h:number;high24h:number;low24h:number;volume24h:number}>;

async function fetchLivePrices(): Promise<PriceMap> {
  const cgIds = CRYPTO_BASE.filter(c=>c.cgId).map(c=>c.cgId!);
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('coingecko-prices', {
      body: { ids: cgIds },
    });
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = await error.context?.text() ?? msg; } catch { /* ignore */ }
      }
      console.warn('[Terminal] coingecko-prices edge error:', msg);
      return {};
    }
    // Map cgId → coin.id
    const raw: PriceMap = data?.data ?? {};
    const out: PriceMap = {};
    for (const coin of CRYPTO_BASE) {
      if (!coin.cgId) continue;
      const e = raw[coin.cgId];
      if (e) out[coin.id] = e;
    }
    return out;
  } catch (err) {
    console.warn('[Terminal] fetchLivePrices failed:', err);
    return {};
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtPrice(n:number):string{
  if(n>=1000)  return '$'+n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  if(n>=1)     return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});
  if(n>=0.001) return '$'+n.toFixed(4);
  return '$'+n.toFixed(8);
}
function fmtCap(n:number):string{
  if(n>=1e12) return '$'+(n/1e12).toFixed(2)+'T';
  if(n>=1e9)  return '$'+(n/1e9).toFixed(2)+'B';
  if(n>=1e6)  return '$'+(n/1e6).toFixed(2)+'M';
  return '$'+(n/1e3).toFixed(0)+'K';
}
function fmtTime():string{
  return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

// ── Generate live order book ──────────────────────────────────────────────────
function genOrderBook(price:number,side:'bids'|'asks',spread=0.0012):OrderBookEntry[]{
  const dir=side==='bids'?-1:1;
  const rows:OrderBookEntry[]=[];
  let cum=0;
  for(let i=0;i<8;i++){
    const p=price*(1+dir*(spread+i*0.0006+Math.random()*0.0003));
    const sz=Math.random()*4+0.5;
    cum+=sz;
    rows.push({price:p,size:parseFloat(sz.toFixed(3)),total:parseFloat(cum.toFixed(3))});
  }
  return side==='bids'?rows:rows.reverse();
}

// ── Price Flash Animated Cell ─────────────────────────────────────────────────
function PriceCell({price,flash}:{price:number;flash:'up'|'down'|null}){
  const anim=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    if(!flash) return;
    anim.setValue(1);
    Animated.timing(anim,{toValue:0,duration:900,useNativeDriver:false}).start();
  },[flash,price]);
  const bg=anim.interpolate({inputRange:[0,1],outputRange:['transparent',flash==='up'?'rgba(34,197,94,0.28)':'rgba(239,68,68,0.28)']});
  return(
    <Animated.View style={{backgroundColor:bg,borderRadius:4,paddingHorizontal:3}}>
      <Text style={[pc.price,{color:flash==='up'?Colors.success:flash==='down'?Colors.error:Colors.textPrimary}]}>{fmtPrice(price)}</Text>
    </Animated.View>
  );
}
const pc=StyleSheet.create({price:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,includeFontPadding:false}});

// ── SparkBars ─────────────────────────────────────────────────────────────────
function SparkBars({change,color}:{change:number;color:string}){
  const bars=[0.4,0.6,0.5,0.8,0.7,0.9,1.0].map((h,i)=>Math.max(0.15,Math.min(1,h*(Math.sin(i*2.3+change*0.8)*0.25+1))));
  const isPos=change>=0;
  return(
    <View style={{flexDirection:'row',alignItems:'flex-end',gap:2,height:20}}>
      {bars.map((h,i)=>(
        <View key={i} style={{width:3,height:h*20,borderRadius:1,backgroundColor:(isPos?(i>3?color:color+'55'):(i>3?Colors.error:Colors.error+'55'))}}/>
      ))}
    </View>
  );
}

// ── Coin Row ──────────────────────────────────────────────────────────────────
function CoinRow({coin,rank,onTrade}:{coin:LiveCoin;rank:number;onTrade:(c:LiveCoin)=>void}){
  const isPos=coin.change24h>=0;
  return(
    <TouchableOpacity style={cr.row} onPress={()=>onTrade(coin)} activeOpacity={0.78}>
      <Text style={cr.rank}>#{rank}</Text>
      <View style={[cr.emoji,{backgroundColor:coin.color+'18',borderColor:coin.color+'44',overflow:'hidden'}]}>
        {coin.logoUri
          ?<Image source={{uri:coin.logoUri}} style={cr.logoImg} contentFit="cover" transition={200}/>
          :<Text style={cr.emojiText}>{coin.emoji}</Text>}
      </View>
      <View style={{flex:1,gap:2}}>
        <View style={cr.nameRow}>
          <Text style={cr.symbol}>{coin.symbol}</Text>
          {coin.verified&&<MaterialIcons name="verified" size={10} color={coin.color}/>}
          {coin.chain&&<View style={[cr.chip,{backgroundColor:coin.color+'15',borderColor:coin.color+'33'}]}>
            <Text style={[cr.chipTxt,{color:coin.color}]}>{coin.chain}</Text></View>}
        </View>
        <Text style={cr.name} numberOfLines={1}>{coin.name}</Text>
      </View>
      <SparkBars change={coin.change24h} color={coin.color}/>
      <View style={{alignItems:'flex-end',gap:3,minWidth:80}}>
        <PriceCell price={coin.price} flash={coin.lastFlash??null}/>
        <View style={[cr.badge,{backgroundColor:isPos?Colors.successBg:Colors.errorBg,borderColor:(isPos?Colors.success:Colors.error)+'44'}]}>
          <MaterialIcons name={isPos?'arrow-drop-up':'arrow-drop-down'} size={11} color={isPos?Colors.success:Colors.error}/>
          <Text style={[cr.change,{color:isPos?Colors.success:Colors.error}]}>{isPos?'+':''}{coin.change24h.toFixed(2)}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
const cr=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',gap:Spacing.sm,paddingVertical:Spacing.sm+3,borderBottomWidth:1,borderBottomColor:Colors.border},
  rank:{fontSize:10,color:Colors.textMuted,fontWeight:FontWeight.semibold,width:22,includeFontPadding:false},
  emoji:{width:38,height:38,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center',flexShrink:0},
  emojiText:{fontSize:18},
  logoImg:{width:38,height:38,borderRadius:11},
  nameRow:{flexDirection:'row',alignItems:'center',gap:4},
  symbol:{fontSize:FontSize.sm,fontWeight:FontWeight.heavy,color:Colors.textPrimary,includeFontPadding:false},
  name:{fontSize:10,color:Colors.textMuted,includeFontPadding:false},
  chip:{borderRadius:Radius.full,paddingHorizontal:5,paddingVertical:1,borderWidth:1},
  chipTxt:{fontSize:7,fontWeight:FontWeight.heavy,letterSpacing:0.4,includeFontPadding:false},
  badge:{flexDirection:'row',alignItems:'center',gap:1,borderRadius:Radius.full,paddingHorizontal:5,paddingVertical:2,borderWidth:1},
  change:{fontSize:9,fontWeight:FontWeight.heavy,includeFontPadding:false},
});

// ── Order Book Row ────────────────────────────────────────────────────────────
function OBRow({entry,maxTotal,side}:{entry:OrderBookEntry;maxTotal:number;side:'bid'|'ask'}){
  const pct=Math.min(1,entry.total/maxTotal)*100;
  const c=side==='bid'?Colors.success:Colors.error;
  return(
    <View style={ob.row}>
      <View style={[ob.bar,{width:`${pct}%` as any,backgroundColor:c+'1A',position:'absolute',left:0,right:0,top:0,bottom:0}]}/>
      <Text style={[ob.price,{color:c}]}>{fmtPrice(entry.price)}</Text>
      <Text style={ob.size}>{entry.size.toFixed(3)}</Text>
      <Text style={ob.total}>{entry.total.toFixed(2)}</Text>
    </View>
  );
}
const ob=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:3,paddingHorizontal:6,overflow:'hidden',position:'relative'},
  bar:{},
  price:{fontSize:10,fontWeight:FontWeight.bold,flex:1,includeFontPadding:false},
  size:{fontSize:10,color:Colors.textSecondary,flex:1,textAlign:'center',includeFontPadding:false},
  total:{fontSize:10,color:Colors.textMuted,flex:1,textAlign:'right',includeFontPadding:false},
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngTerminalScreen(){
  const insets=useSafeAreaInsets();
  const router=useRouter();
  const {showAlert}=useAlert();
  const gold=useGoldOracle();

  const [activeTab,setActiveTab]=useState<'market'|'gold'|'trade'|'list'|'insights'>('market');
  const [coins,setCoins]=useState<LiveCoin[]>(ALL_COINS);
  const [priceLoading,setPriceLoading]=useState(false);
  const [priceLastUpdated,setPriceLastUpdated]=useState<Date|null>(null);
  const [refreshing,setRefreshing]=useState(false);
  const [liveCount,setLiveCount]=useState(0);
  const [nextRefresh,setNextRefresh]=useState(30);
  const intervalRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const countdownRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const countdownValRef=useRef(30);
  const liveAnimRef=useRef(new Animated.Value(1)).current;

  // Market / filter
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('all');
  const [sortBy,setSortBy]=useState('Market Cap');
  const [sortAsc,setSortAsc]=useState(false);

  // Trade
  const [selectedCoin,setSelectedCoin]=useState<LiveCoin>(CRYPTO_BASE[0]);
  const [orderType,setOrderType]=useState('Market');
  const [side,setSide]=useState<'buy'|'sell'>('buy');
  const [amount,setAmount]=useState('');
  const [limitPrice,setLimitPrice]=useState('');
  const [placing,setPlacing]=useState(false);
  const [bids,setBids]=useState<OrderBookEntry[]>([]);
  const [asks,setAsks]=useState<OrderBookEntry[]>([]);
  const [obLoading,setObLoading]=useState(false);
  const [recentTrades,setRecentTrades]=useState<{price:number;size:string;side:'buy'|'sell';time:string}[]>([]);

  // Gold converter
  const [cvAmount,setCvAmount]=useState('100');
  const [cvMode,setCvMode]=useState<'btng'|'grams'>('btng');

  // List asset
  const [listSymbol,setListSymbol]=useState('');
  const [listName,setListName]=useState('');
  const [listDesc,setListDesc]=useState('');
  const [listSupply,setListSupply]=useState('');
  const [listSubmitting,setListSubmitting]=useState(false);

  // Insights
  const [insightCoin,setInsightCoin]=useState<LiveCoin>(CRYPTO_BASE[0]);
  const [insightTick,setInsightTick]=useState(0);

  // ── Live price pulse animation ──────────────────────────────────────────────
  const pulseLive=useCallback(()=>{
    Animated.sequence([
      Animated.timing(liveAnimRef,{toValue:0.3,duration:200,useNativeDriver:true}),
      Animated.timing(liveAnimRef,{toValue:1,duration:200,useNativeDriver:true}),
    ]).start();
  },[]);

  // ── Fetch & flash prices ────────────────────────────────────────────────────
  const doFetchPrices=useCallback(async(silent=false)=>{
    if(!silent) setPriceLoading(true);
    const live=await fetchLivePrices();
    if(Object.keys(live).length>0){
      setCoins(prev=>prev.map(c=>{
        const upd=live[c.id];
        if(!upd) return c;
        const flash:('up'|'down'|null)=upd.price>c.price?'up':upd.price<c.price?'down':null;
        return{...c,prevPrice:c.price,price:upd.price,change24h:upd.change24h,
          high24h:upd.high24h,low24h:upd.low24h,volume24h:upd.volume24h,lastFlash:flash};
      }));
      setPriceLastUpdated(new Date());
      setLiveCount(v=>v+1);
      pulseLive();
    }
    setPriceLoading(false);
  },[pulseLive]);

  useEffect(()=>{
    doFetchPrices();
    countdownValRef.current=30;
    intervalRef.current=setInterval(()=>{
      countdownValRef.current=30; setNextRefresh(30);
      doFetchPrices(true);
    },30_000);
    countdownRef.current=setInterval(()=>{
      countdownValRef.current=Math.max(0,countdownValRef.current-1);
      setNextRefresh(countdownValRef.current);
    },1000);
    return()=>{
      if(intervalRef.current) clearInterval(intervalRef.current);
      if(countdownRef.current) clearInterval(countdownRef.current);
    };
  },[doFetchPrices]);

  // ── Patch BTNG token prices from live gold oracle whenever it updates ──────
  useEffect(()=>{
    if(gold.loading || gold.priceUSD <= 0) return;
    const priceUSD   = gold.priceUSD;
    const TROY       = 31.1035;
    const btnggPrice = priceUSD / 1000;       // BTNGG  = 1/1000 oz
    const btngGPrice = priceUSD / TROY;       // BTNG-G = 1 gram
    const btngAuPrice= priceUSD;              // BTNG-AU = 1 troy oz cert
    const change     = gold.changePct24h ?? 0;
    setCoins(prev=>prev.map(c=>{
      if(c.id==='btngg')  return{...c, price:btnggPrice,  prevPrice:c.price, change24h:change, high24h:btnggPrice*1.008,  low24h:btnggPrice*0.992,  lastFlash: btnggPrice>c.price?'up':btnggPrice<c.price?'down':null};
      if(c.id==='btng-g') return{...c, price:btngGPrice,  prevPrice:c.price, change24h:change, high24h:btngGPrice*1.008,  low24h:btngGPrice*0.992,  lastFlash: btngGPrice>c.price?'up':btngGPrice<c.price?'down':null};
      if(c.id==='btngau') return{...c, price:btngAuPrice, prevPrice:c.price, change24h:change, high24h:btngAuPrice*1.008, low24h:btngAuPrice*0.992, lastFlash: btngAuPrice>c.price?'up':btngAuPrice<c.price?'down':null};
      if(c.id==='paxg')   return{...c, price:priceUSD,    prevPrice:c.price, change24h:change, high24h:priceUSD*1.008,    low24h:priceUSD*0.992,    lastFlash: priceUSD>c.price?'up':priceUSD<c.price?'down':null};
      return c;
    }));
  },[gold.priceUSD, gold.changePct24h, gold.loading]);

  // Price micro-ticks
  useEffect(()=>{
    const t=setInterval(()=>{
      setCoins(prev=>prev.map(c=>{
        if(c.category==='stablecoin') return c;
        const jitter=(Math.random()-0.499)*0.0004;
        const newP=c.price*(1+jitter);
        const flash:('up'|'down'|null)=jitter>0?'up':jitter<0?'down':null;
        return{...c,prevPrice:c.price,price:parseFloat(newP.toFixed(newP>100?2:newP>1?4:6)),lastFlash:flash};
      }));
    },3000);
    return()=>clearInterval(t);
  },[]);

  // Insights ticker (updates buyer/seller ratio every 5s)
  useEffect(()=>{
    const t=setInterval(()=>setInsightTick(v=>v+1),5000);
    return()=>clearInterval(t);
  },[]);

  // Order book
  useEffect(()=>{
    if(activeTab!=='trade') return;
    setObLoading(true);
    const timer=setTimeout(()=>{
      setBids(genOrderBook(selectedCoin.price,'bids'));
      setAsks(genOrderBook(selectedCoin.price,'asks'));
      setRecentTrades(Array.from({length:10}).map(()=>{
        const s:('buy'|'sell')=Math.random()>0.5?'buy':'sell';
        const p=selectedCoin.price*(1+(Math.random()-0.499)*0.002);
        return{price:parseFloat(p.toFixed(2)),size:(Math.random()*2).toFixed(4),side:s,time:fmtTime()};
      }));
      setObLoading(false);
    },400);
    return()=>clearTimeout(timer);
  },[activeTab,selectedCoin.id,selectedCoin.price]);

  useEffect(()=>{
    if(activeTab!=='trade') return;
    const t=setInterval(()=>{
      setBids(genOrderBook(selectedCoin.price,'bids'));
      setAsks(genOrderBook(selectedCoin.price,'asks'));
      setRecentTrades(prev=>{
        const s:('buy'|'sell')=Math.random()>0.5?'buy':'sell';
        const p=selectedCoin.price*(1+(Math.random()-0.499)*0.002);
        return[{price:parseFloat(p.toFixed(2)),size:(Math.random()*1.5).toFixed(4),side:s,time:fmtTime()},...prev.slice(0,9)];
      });
    },4000);
    return()=>clearInterval(t);
  },[activeTab,selectedCoin.id,selectedCoin.price]);

  const onRefresh=useCallback(async()=>{
    setRefreshing(true);
    countdownValRef.current=30; setNextRefresh(30);
    await Promise.all([doFetchPrices(),gold.refresh()]);
    setRefreshing(false);
  },[doFetchPrices,gold]);

  const filtered=coins
    .filter(c=>{
      const q=search.toLowerCase();
      return(!q||c.symbol.toLowerCase().includes(q)||c.name.toLowerCase().includes(q))&&(category==='all'||c.category===category);
    })
    .sort((a,b)=>{
      let diff=0;
      if(sortBy==='Market Cap') diff=b.marketCap-a.marketCap;
      else if(sortBy==='Price') diff=b.price-a.price;
      else if(sortBy==='24h %') diff=b.change24h-a.change24h;
      else if(sortBy==='Volume') diff=b.volume24h-a.volume24h;
      return sortAsc?-diff:diff;
    });

  const handleTrade=useCallback((coin:LiveCoin)=>{
    setSelectedCoin(coin); setActiveTab('trade'); setAmount(''); setLimitPrice('');
  },[]);

  const handlePlaceOrder=useCallback(async()=>{
    if(!amount.trim()){showAlert('Required','Enter an amount.');return;}
    setPlacing(true);
    await new Promise(r=>setTimeout(r,1800));
    setPlacing(false); setAmount('');
    showAlert('Order Filled!',`${side.toUpperCase()} ${amount} ${selectedCoin.symbol} @ ${orderType==='Market'?fmtPrice(selectedCoin.price):limitPrice+' USD'} — BTNG DEX`);
  },[amount,limitPrice,side,orderType,selectedCoin,showAlert]);

  const handleListAsset=useCallback(async()=>{
    if(!listSymbol.trim()||!listName.trim()){showAlert('Required','Symbol and name required.');return;}
    setListSubmitting(true);
    await new Promise(r=>setTimeout(r,2000));
    setListSubmitting(false);
    setListSymbol('');setListName('');setListDesc('');setListSupply('');
    showAlert('Submitted!',`${listSymbol.toUpperCase()} listing sent for review. Approval 24–48h.`);
  },[listSymbol,listName,listDesc,listSupply,showAlert]);

  const totalCap=coins.reduce((s,c)=>s+c.marketCap,0);
  const totalVol=coins.reduce((s,c)=>s+c.volume24h,0);
  const gainers=coins.filter(c=>c.change24h>0).length;
  const losers=coins.filter(c=>c.change24h<0).length;
  const tickerCoins=[...coins].sort((a,b)=>b.volume24h-a.volume24h).slice(0,8);
  const spread=selectedCoin.price*0.0012;
  const bidTop=asks.length>0?asks[asks.length-1].price:selectedCoin.price*(1-0.0006);
  const askTop=bids.length>0?bids[0].price:selectedCoin.price*(1+0.0006);

  // ── Insights derived values ─────────────────────────────────────────────────
  const latestInsightCoin=coins.find(c=>c.id===insightCoin.id)??insightCoin;
  const insightBuyerPct=Math.min(85,Math.max(40,62+Math.sin(insightTick*0.7)*8+latestInsightCoin.change24h*1.2));
  const insightSellerPct=100-insightBuyerPct;
  const insightTotalTraders=Math.floor(38000+latestInsightCoin.volume24h/1200000+Math.sin(insightTick*1.1)*3000);
  const insightBuyers=Math.floor(insightTotalTraders*insightBuyerPct/100);
  const insightSellers=insightTotalTraders-insightBuyers;
  const insightSearched=Math.floor(2800+latestInsightCoin.marketCap/500000000+Math.sin(insightTick*0.4)*400);
  const insightDominance=((latestInsightCoin.marketCap/Math.max(1,totalCap))*100).toFixed(2);
  const insightCircSupply=latestInsightCoin.id==='btc'?'20.04M BTC':latestInsightCoin.id==='eth'?'120.2M ETH':`${(latestInsightCoin.marketCap/latestInsightCoin.price/1e6).toFixed(2)}M ${latestInsightCoin.symbol}`;

  return(
    <View style={[s.container,{paddingTop:insets.top}]}>
      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={()=>router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary}/>
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>BTNG Global Terminal</Text>
          <View style={s.topSubRow}>
            <Animated.View style={[s.liveDotOuter,{opacity:liveAnimRef}]}><View style={s.liveDotInner}/></Animated.View>
            <Text style={s.topSub}>LIVE · PRO API · {coins.length} Assets · Updated {liveCount}×</Text>
          </View>
        </View>
        <TouchableOpacity style={[s.refreshBtn,priceLoading&&{opacity:0.6}]} onPress={()=>onRefresh()} activeOpacity={0.8}>
          {priceLoading?<ActivityIndicator size="small" color={Colors.primary}/>
            :<View style={{alignItems:'center'}}>
              <MaterialIcons name="refresh" size={18} color={Colors.primary}/>
              <Text style={s.refreshCountdown}>{nextRefresh}s</Text>
            </View>}
        </TouchableOpacity>
      </View>

      {/* ── Live Ticker Strip ── */}
      <View style={s.tickerStrip}>
        <View style={s.tickerLiveWrap}>
          <Animated.View style={[s.tickerLiveDot,{opacity:liveAnimRef}]}/>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tickerContent}>
          {tickerCoins.map(c=>{
            const isPos=c.change24h>=0;
            const flashStyle=c.lastFlash?{backgroundColor:c.lastFlash==='up'?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}:{};
            return(
              <TouchableOpacity key={c.id} style={[s.tickerItem,flashStyle]} onPress={()=>handleTrade(c)} activeOpacity={0.8}>
                {c.logoUri
                  ?<Image source={{uri:c.logoUri}} style={s.tickerCoinImg} contentFit="cover" transition={200}/>
                  :null}
                <Text style={s.tickerSymbol}>{c.symbol}</Text>
                <Text style={[s.tickerPrice,{color:isPos?Colors.success:Colors.error}]}>{fmtPrice(c.price)}</Text>
                <Text style={[s.tickerChange,{color:isPos?Colors.success:Colors.error}]}>{isPos?'▲':'▼'}{Math.abs(c.change24h).toFixed(2)}%</Text>
              </TouchableOpacity>
            );
          })}
          <View style={s.tickerGoldItem}>
            <MaterialIcons name="insights" size={11} color={Colors.kenteGold}/>
            <Text style={s.tickerGoldLabel}>XAU/USD</Text>
            <Text style={s.tickerGoldPrice}>{gold.loading?'…':'$'+gold.priceUSD.toLocaleString('en-US',{maximumFractionDigits:0})}</Text>
            <Text style={[s.tickerChange,{color:gold.changePct24h>=0?Colors.success:Colors.error}]}>{gold.changePct24h>=0?'▲':'▼'}{Math.abs(gold.changePct24h).toFixed(2)}%</Text>
          </View>
        </ScrollView>
        {priceLastUpdated&&<Text style={s.tickerTime}>{priceLastUpdated.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</Text>}
      </View>

      {/* ── Tab Bar ── */}
      <View style={s.tabBarOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBarContent}>
          {TABS.map((t,i)=>{
            const key=['market','gold','trade','list','insights'][i] as any;
            const active=activeTab===key;
            return(
              <TouchableOpacity key={t} style={[s.tabBtn,active&&s.tabBtnActive]} onPress={()=>setActiveTab(key)} activeOpacity={0.85}>
                <Text style={[s.tabText,active&&s.tabTextActive]}>{t}</Text>
                {key==='trade'&&active&&<View style={s.tabLiveDot}/>}
                {key==='insights'&&active&&<View style={[s.tabLiveDot,{backgroundColor:Colors.primary}]}/>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]}/>}
      >

        {/* ═══════════ MARKETS ═══════════ */}
        {activeTab==='market'&&(
          <View style={s.section}>
            <View style={s.statsGrid}>
              {[
                {label:'Total Cap',value:fmtCap(totalCap),color:Colors.primary,icon:'account-balance',sub:<><View style={s.liveGreen}/><Text style={s.statLiveText}>LIVE</Text></>},
                {label:'24h Volume',value:fmtCap(totalVol),color:Colors.kenteGold,icon:'bar-chart',sub:<Text style={s.statSub}>{coins.length} assets</Text>},
                {label:'Gainers',value:`${gainers} ▲`,color:Colors.success,icon:'trending-up',sub:<Text style={s.statSub}>24h positive</Text>},
                {label:'Losers',value:`${losers} ▼`,color:Colors.error,icon:'trending-down',sub:<Text style={s.statSub}>24h negative</Text>},
              ].map(st=>(
                <View key={st.label} style={[s.statCard,{borderColor:st.color+'44'}]}>
                  <View style={s.statCardTop}><MaterialIcons name={st.icon as any} size={13} color={st.color}/><Text style={s.statLabel}>{st.label}</Text></View>
                  <Text style={[s.statValue,{color:st.color}]}>{st.value}</Text>
                  <View style={s.statLive}>{st.sub}</View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={s.goldSnapCard} onPress={()=>setActiveTab('gold')} activeOpacity={0.88}>
              <View style={s.goldSnapLeft}>
                <View style={s.goldSnapIcon}><Text style={{fontSize:24}}>🏅</Text></View>
                <View>
                  <Text style={s.goldSnapTitle}>Gold Oracle — XAU/USD</Text>
                  <Text style={s.goldSnapSub}>{gold.cacheHit?'⚡ DB Cache':gold.source==='live'?'● Live':'○ Fallback'} · {gold.nextRefreshIn}s next{gold.providerSource?' · '+gold.providerSource:''}</Text>
                </View>
              </View>
              <View style={{alignItems:'flex-end',gap:4}}>
                {gold.loading?<ActivityIndicator size="small" color={Colors.kenteGold}/>
                  :<Text style={s.goldSnapPrice}>${gold.priceUSD.toLocaleString('en-US',{maximumFractionDigits:2})}</Text>}
                <View style={[s.goldSnapChg,{backgroundColor:gold.changePct24h>=0?Colors.successBg:Colors.errorBg}]}>
                  <MaterialIcons name={gold.changePct24h>=0?'arrow-drop-up':'arrow-drop-down'} size={13} color={gold.changePct24h>=0?Colors.success:Colors.error}/>
                  <Text style={[s.goldSnapChgTxt,{color:gold.changePct24h>=0?Colors.success:Colors.error}]}>{gold.changePct24h>=0?'+':''}{gold.changePct24h.toFixed(2)}%</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={18} color={Colors.kenteGold}/>
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRail}>
              {CATEGORIES.map(cat=>(
                <TouchableOpacity key={cat.id} style={[s.chip,category===cat.id&&{backgroundColor:cat.color+'22',borderColor:cat.color+'66'}]}
                  onPress={()=>setCategory(cat.id)} activeOpacity={0.8}>
                  <Text style={[s.chipTxt,category===cat.id&&{color:cat.color,fontWeight:FontWeight.heavy}]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.searchBox}>
              <MaterialIcons name="search" size={17} color={Colors.textMuted}/>
              <TextInput style={s.searchInput} placeholder={`Search ${filtered.length} assets…`} placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch}/>
              {search.length>0&&<TouchableOpacity onPress={()=>setSearch('')} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                <MaterialIcons name="close" size={16} color={Colors.textMuted}/>
              </TouchableOpacity>}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRail}>
              {SORT_OPTIONS.map(opt=>(
                <TouchableOpacity key={opt} style={[s.chip,sortBy===opt&&s.chipActive]}
                  onPress={()=>{if(sortBy===opt)setSortAsc(v=>!v);else{setSortBy(opt);setSortAsc(false);}}} activeOpacity={0.8}>
                  <Text style={[s.chipTxt,sortBy===opt&&s.chipTxtActive]}>{opt}</Text>
                  {sortBy===opt&&<MaterialIcons name={sortAsc?'keyboard-arrow-up':'keyboard-arrow-down'} size={12} color={Colors.primary}/>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.listCard}>
              <View style={s.listHeader}>
                <View style={{flexDirection:'row',alignItems:'center',gap:7}}>
                  <View style={s.liveGreen}/><Text style={s.listTitle}>{filtered.length} Assets</Text>
                  {priceLoading&&<ActivityIndicator size="small" color={Colors.primary}/>}
                </View>
                <Text style={s.listSub}>Refreshing in {nextRefresh}s</Text>
              </View>
              {filtered.length===0?(
                <View style={s.empty}>
                  <MaterialIcons name="search-off" size={32} color={Colors.textMuted}/>
                  <Text style={s.emptyTxt}>No results for "{search}"</Text>
                </View>
              ):filtered.map((coin,idx)=>(
                <CoinRow key={coin.id} coin={coin} rank={idx+1} onTrade={handleTrade}/>
              ))}
            </View>
          </View>
        )}

        {/* ═══════════ GOLD ═══════════ */}
        {activeTab==='gold'&&(
          <View style={s.section}>
            <BTNGGoldChart showUnits={true} height={400} />

            <View style={s.goldHero}>
              <View style={s.goldHeroTop}>
                <View style={s.goldHeroIcon}><Text style={{fontSize:36}}>🏅</Text></View>
                <View style={{flex:1}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <Text style={s.goldHeroTitle}>Gold XAU/USD</Text>
                    <View style={[s.sourceBadge,{backgroundColor:gold.source==='live'?Colors.successBg:gold.source==='cached'?Colors.primaryGlow:Colors.warningBg,borderColor:(gold.source==='live'?Colors.success:gold.source==='cached'?Colors.primary:Colors.warning)+'55'}]}>
                      <View style={[s.sourceDot,{backgroundColor:gold.source==='live'?Colors.success:gold.source==='cached'?Colors.primary:Colors.warning}]}/>
                      <Text style={[s.sourceTxt,{color:gold.source==='live'?Colors.success:gold.source==='cached'?Colors.primary:Colors.warning}]}>{gold.cacheHit?'DB CACHE':gold.source.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={s.goldHeroSub}>Troy oz · {gold.lastUpdated?'Updated '+gold.lastUpdated.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Fetching…'}{gold.providerSource?' · via '+gold.providerSource:''}</Text>
                </View>
              </View>
              {gold.loading
                ?<View style={{alignItems:'center',gap:8,paddingVertical:16}}><ActivityIndicator size="large" color={Colors.kenteGold}/></View>
                :<>
                  <Text style={s.goldHeroPrice}>${gold.priceUSD.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</Text>
                  <View style={s.goldHeroChangeRow}>
                    <View style={[s.goldChgBadge,{backgroundColor:gold.changePct24h>=0?Colors.successBg:Colors.errorBg,borderColor:(gold.changePct24h>=0?Colors.success:Colors.error)+'44'}]}>
                      <MaterialIcons name={gold.changePct24h>=0?'trending-up':'trending-down'} size={14} color={gold.changePct24h>=0?Colors.success:Colors.error}/>
                      <Text style={[s.goldChgTxt,{color:gold.changePct24h>=0?Colors.success:Colors.error}]}>
                        {gold.changePct24h>=0?'+':''}{gold.change24h.toFixed(2)} ({gold.changePct24h>=0?'+':''}{gold.changePct24h.toFixed(3)}%) 24h
                      </Text>
                    </View>
                    <View style={s.goldRefresh}><Text style={s.goldRefreshTxt}>↻ {gold.nextRefreshIn}s</Text></View>
                  </View>
                </>}
            </View>

            {!gold.loading&&(
              <View style={s.goldStatsGrid}>
                {[
                  {label:'Per Gram',value:'$'+gold.btngPerGram.toFixed(2),color:Colors.kenteGold,icon:'scale'},
                  {label:'BTNGG ≈ 0.001 oz',value:'$'+gold.priceBTNGG.toFixed(4),color:Colors.primary,icon:'monetization-on'},
                  {label:'1 oz = BTNG',value:'1,000',color:'#9945FF',icon:'swap-horiz'},
                  {label:'GHS Rate',value:'GH₵'+(gold.priceUSD*15.5).toFixed(0),color:'#22C55E',icon:'currency-exchange'},
                ].map(stat=>(
                  <View key={stat.label} style={[s.goldStatCard,{borderColor:stat.color+'33'}]}>
                    <MaterialIcons name={stat.icon as any} size={15} color={stat.color}/>
                    <Text style={[s.goldStatVal,{color:stat.color}]}>{stat.value}</Text>
                    <Text style={s.goldStatLbl}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={cv.card}>
              <View style={cv.header}>
                <View style={cv.iconWrap}><Text style={{fontSize:20}}>⚖️</Text></View>
                <View style={{flex:1}}>
                  <Text style={cv.title}>BTNG ↔ Gold Converter</Text>
                  <Text style={cv.sub}>Live oracle · {gold.source==='live'?'Real-time':'Cached'} price</Text>
                </View>
                <View style={[cv.oracleBadge,{backgroundColor:gold.source==='live'?Colors.successBg:Colors.warningBg,borderColor:(gold.source==='live'?Colors.success:Colors.warning)+'55'}]}>
                  <View style={[cv.oracleDot,{backgroundColor:gold.source==='live'?Colors.success:Colors.warning}]}/>
                  <Text style={[cv.oracleTxt,{color:gold.source==='live'?Colors.success:Colors.warning}]}>{gold.source==='live'?'LIVE':'CACHED'}</Text>
                </View>
              </View>
              <View style={[cv.inputLabel,{backgroundColor:cvMode==='btng'?Colors.primaryGlow:Colors.warningBg,borderColor:cvMode==='btng'?Colors.primary+'55':Colors.kenteGold+'55'}]}>
                <Text style={[cv.inputLabelTxt,{color:cvMode==='btng'?Colors.primary:Colors.kenteGold}]}>{cvMode==='btng'?'₿ BTNG Amount':'⚖️ Grams of Gold'}</Text>
              </View>
              <View style={cv.inputRow}>
                <TextInput style={cv.input} value={cvAmount} onChangeText={v=>setCvAmount(v.replace(/[^0-9.]/g,''))}
                  placeholder={cvMode==='btng'?'e.g. 100':'e.g. 10'} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" returnKeyType="done"/>
                <Text style={cv.inputUnit}>{cvMode==='btng'?'BTNGG':'grams'}</Text>
              </View>
              <TouchableOpacity style={cv.swapBtn} onPress={()=>{setCvMode(m=>m==='btng'?'grams':'btng');setCvAmount('');}} activeOpacity={0.85}>
                <MaterialIcons name="swap-vert" size={20} color={Colors.primary}/>
                <Text style={cv.swapTxt}>Swap Direction</Text>
              </TouchableOpacity>
              {(()=>{
                const amt=parseFloat(cvAmount)||0;
                const TROY=31.1035,ghsRt=15.5;
                const pBTNG=gold.priceBTNGG>0?gold.priceBTNGG:3.326;
                const pOz=gold.priceUSD>0?gold.priceUSD:3325.80;
                let usd=0,ghs=0,grams=0,btng=0;
                if(cvMode==='btng'){usd=amt*pBTNG;ghs=usd*ghsRt;grams=amt*0.001*TROY;btng=amt;}
                else{grams=amt;usd=(amt/TROY)*pOz;ghs=usd*ghsRt;btng=usd/pBTNG;}
                return(
                  <View style={cv.resultsGrid}>
                    {cvMode==='btng'?<>
                      <View style={[cv.resCard,{borderColor:'#3B82F644'}]}>
                        <MaterialIcons name="attach-money" size={16} color="#3B82F6"/>
                        <Text style={[cv.resVal,{color:'#3B82F6'}]}>${amt>0?usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—'}</Text>
                        <Text style={cv.resLbl}>USD</Text>
                      </View>
                      <View style={[cv.resCard,{borderColor:Colors.success+'44'}]}>
                        <MaterialIcons name="currency-exchange" size={16} color={Colors.success}/>
                        <Text style={[cv.resVal,{color:Colors.success}]}>GH₵{amt>0?ghs.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}</Text>
                        <Text style={cv.resLbl}>GHS</Text>
                      </View>
                      <View style={[cv.resCard,{borderColor:Colors.kenteGold+'44',flex:2}]}>
                        <MaterialIcons name="scale" size={16} color={Colors.kenteGold}/>
                        <Text style={[cv.resVal,{color:Colors.kenteGold}]}>{amt>0?grams.toFixed(4):'—'} g</Text>
                        <Text style={cv.resLbl}>Physical Gold</Text>
                        <Text style={cv.resSub}>{amt>0?(amt*0.001).toFixed(4):'—'} troy oz</Text>
                      </View>
                    </>:<>
                      <View style={[cv.resCard,{borderColor:Colors.primary+'44'}]}>
                        <Text style={{fontSize:16}}>₿</Text>
                        <Text style={[cv.resVal,{color:Colors.primary}]}>{amt>0?btng.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—'}</Text>
                        <Text style={cv.resLbl}>BTNGG</Text>
                      </View>
                      <View style={[cv.resCard,{borderColor:'#3B82F644'}]}>
                        <MaterialIcons name="attach-money" size={16} color="#3B82F6"/>
                        <Text style={[cv.resVal,{color:'#3B82F6'}]}>${amt>0?usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}</Text>
                        <Text style={cv.resLbl}>USD</Text>
                      </View>
                      <View style={[cv.resCard,{borderColor:Colors.success+'44'}]}>
                        <MaterialIcons name="currency-exchange" size={16} color={Colors.success}/>
                        <Text style={[cv.resVal,{color:Colors.success}]}>GH₵{amt>0?ghs.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}):'—'}</Text>
                        <Text style={cv.resLbl}>GHS</Text>
                      </View>
                    </>}
                  </View>
                );
              })()}
              <View style={cv.rateRow}>
                {[
                  {icon:'insights',txt:'1 BTNGG = $'+(gold.priceBTNGG>0?gold.priceBTNGG.toFixed(4):'3.3258'),c:Colors.kenteGold},
                  {icon:'scale',txt:'1 oz = 31.1035 g',c:Colors.kenteGold},
                  {icon:'currency-exchange',txt:'1 USD ≈ 15.5 GHS',c:Colors.success},
                ].map((r,i)=>(
                  <View key={i} style={cv.ratePill}>
                    <MaterialIcons name={r.icon as any} size={11} color={r.c}/>
                    <Text style={[cv.rateTxt,{color:r.c}]}>{r.txt}</Text>
                  </View>
                ))}
              </View>
            </View>

            {gold.sparkline.length>0&&(
              <View style={s.sparkCard}>
                <View style={s.sparkHeader}>
                  <Text style={s.sparkTitle}>24h Price Chart (hourly)</Text>
                  <View style={s.sparkBadge}><Text style={s.sparkBadgeTxt}>XAU/USD</Text></View>
                </View>
                <View style={s.sparkBars}>
                  {gold.sparkline.map((val,i)=>{
                    const min=Math.min(...gold.sparkline),max=Math.max(...gold.sparkline);
                    const h=Math.max(0.05,(val-min)/(max-min||1));
                    const isLast=i===gold.sparkline.length-1;
                    const c=isLast?Colors.primary:val>=(gold.sparkline[Math.max(0,i-1)])?Colors.kenteGold:Colors.kenteGold+'77';
                    return(<View key={i} style={{flex:1,justifyContent:'flex-end',height:72}}>
                      <View style={{height:Math.max(3,h*72),backgroundColor:c,borderRadius:2,marginHorizontal:1}}/>
                    </View>);
                  })}
                </View>
                <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                  <Text style={s.sparkFoot}>24h ago</Text><Text style={s.sparkFoot}>Now</Text>
                </View>
              </View>
            )}

            <View style={s.listCard}>
              <View style={s.listHeader}>
                <View style={{flexDirection:'row',alignItems:'center',gap:7}}>
                  <MaterialIcons name="account-balance" size={14} color={Colors.kenteGold}/>
                  <Text style={s.listTitle}>Gold-Backed Tokens</Text>
                </View>
                <View style={[s.sourceBadge,{backgroundColor:Colors.warningBg,borderColor:Colors.kenteGold+'44'}]}>
                  <Text style={[s.sourceTxt,{color:Colors.kenteGold}]}>ON-CHAIN GOLD</Text>
                </View>
              </View>
              {coins.filter(c=>c.category==='gold').map((coin,idx)=>(
                <CoinRow key={coin.id} coin={coin} rank={idx+1} onTrade={handleTrade}/>
              ))}
            </View>
          </View>
        )}

        {/* ═══════════ TRADE ═══════════ */}
        {activeTab==='trade'&&(
          <View style={s.section}>
            <View style={[s.tradeAsset,{borderColor:selectedCoin.color+'55'}]}>
              <View style={[s.tradeAssetEmoji,{backgroundColor:selectedCoin.color+'18',borderColor:selectedCoin.color+'44',overflow:'hidden'}]}>
                {selectedCoin.logoUri
                  ?<Image source={{uri:selectedCoin.logoUri}} style={{width:56,height:56,borderRadius:18}} contentFit="cover" transition={200}/>
                  :<Text style={{fontSize:28}}>{selectedCoin.emoji}</Text>}
              </View>
              <View style={{flex:1}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                  <Text style={s.tradeSymbol}>{selectedCoin.symbol}</Text>
                  {selectedCoin.verified&&<MaterialIcons name="verified" size={14} color={selectedCoin.color}/>}
                  <View style={[s.chainChip,{backgroundColor:selectedCoin.color+'15',borderColor:selectedCoin.color+'44'}]}>
                    <Text style={[s.chainChipTxt,{color:selectedCoin.color}]}>{selectedCoin.chain??'EVM'}</Text>
                  </View>
                </View>
                <Text style={s.tradeName}>{selectedCoin.name}</Text>
              </View>
              <View style={{alignItems:'flex-end',gap:5}}>
                <PriceCell price={selectedCoin.price} flash={selectedCoin.lastFlash??null}/>
                <View style={[s.changeBadge,{backgroundColor:selectedCoin.change24h>=0?Colors.successBg:Colors.errorBg}]}>
                  <MaterialIcons name={selectedCoin.change24h>=0?'trending-up':'trending-down'} size={12} color={selectedCoin.change24h>=0?Colors.success:Colors.error}/>
                  <Text style={[s.changeBadgeTxt,{color:selectedCoin.change24h>=0?Colors.success:Colors.error}]}>
                    {selectedCoin.change24h>=0?'+':''}{selectedCoin.change24h.toFixed(2)}%
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.statsRow24}>
              {[
                {label:'24h High',value:fmtPrice(selectedCoin.high24h),color:Colors.success},
                {label:'24h Low',value:fmtPrice(selectedCoin.low24h),color:Colors.error},
                {label:'Volume',value:fmtCap(selectedCoin.volume24h),color:Colors.kenteGold},
                {label:'Spread',value:'$'+spread.toFixed(selectedCoin.price>100?2:4),color:Colors.textMuted},
              ].map((st,i)=>(
                <View key={st.label} style={[s.stat24,i<3&&{borderRightWidth:1,borderRightColor:Colors.border}]}>
                  <Text style={s.stat24Lbl}>{st.label}</Text>
                  <Text style={[s.stat24Val,{color:st.color}]}>{st.value}</Text>
                </View>
              ))}
            </View>

            <View style={s.spreadBar}>
              <View style={s.spreadLeft}><View style={s.liveDot2}/><Text style={s.spreadLabel}>BID</Text><Text style={[s.spreadPrice,{color:Colors.success}]}>{fmtPrice(bidTop)}</Text></View>
              <View style={s.spreadCenter}><Text style={s.spreadLabel}>SPREAD</Text><Text style={s.spreadCenterVal}>${spread.toFixed(selectedCoin.price>100?2:6)}</Text></View>
              <View style={s.spreadRight}><Text style={[s.spreadPrice,{color:Colors.error}]}>{fmtPrice(askTop)}</Text><Text style={s.spreadLabel}>ASK</Text><View style={s.liveDot2}/></View>
            </View>

            <View style={s.obContainer}>
              <View style={s.obHalf}>
                <View style={s.obHeader}>
                  <Text style={[s.obTitle,{color:Colors.success}]}>ORDER BOOK</Text>
                  <View style={s.liveDotRow}><View style={s.liveGreen}/><Text style={s.liveTxt}>LIVE</Text></View>
                </View>
                {obLoading?<View style={{alignItems:'center',paddingVertical:16}}><ActivityIndicator size="small" color={Colors.primary}/></View>:(
                  <>
                    <View style={s.obColHeader}>
                      <Text style={s.obColTxt}>Price</Text><Text style={s.obColTxt}>Size</Text><Text style={[s.obColTxt,{textAlign:'right'}]}>Total</Text>
                    </View>
                    {asks.slice(0,5).map((e,i)=><OBRow key={'a'+i} entry={e} maxTotal={asks[asks.length-1]?.total||1} side="ask"/>)}
                    <View style={s.obMidPrice}>
                      <Text style={s.obMidPriceTxt}>{fmtPrice(selectedCoin.price)}</Text>
                      <Text style={[s.obMidPriceChange,{color:selectedCoin.change24h>=0?Colors.success:Colors.error}]}>{selectedCoin.change24h>=0?'▲':'▼'}{Math.abs(selectedCoin.change24h).toFixed(3)}%</Text>
                    </View>
                    {bids.slice(0,5).map((e,i)=><OBRow key={'b'+i} entry={e} maxTotal={bids[bids.length-1]?.total||1} side="bid"/>)}
                  </>
                )}
              </View>
              <View style={s.obHalf}>
                <View style={s.obHeader}>
                  <Text style={[s.obTitle,{color:Colors.kenteGold}]}>RECENT TRADES</Text>
                  <View style={s.liveDotRow}><View style={[s.liveGreen,{backgroundColor:Colors.kenteGold}]}/><Text style={[s.liveTxt,{color:Colors.kenteGold}]}>LIVE</Text></View>
                </View>
                <View style={s.obColHeader}>
                  <Text style={s.obColTxt}>Price</Text><Text style={s.obColTxt}>Qty</Text><Text style={[s.obColTxt,{textAlign:'right'}]}>Time</Text>
                </View>
                {recentTrades.map((t,i)=>(
                  <View key={i} style={[ob.row,{borderBottomWidth:1,borderBottomColor:Colors.border}]}>
                    <Text style={[ob.price,{color:t.side==='buy'?Colors.success:Colors.error}]}>{fmtPrice(t.price)}</Text>
                    <Text style={ob.size}>{t.size}</Text>
                    <Text style={[ob.total,{color:Colors.textMuted}]}>{t.time}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={s.sideRow}>
              <TouchableOpacity style={[s.sideBtn,side==='buy'&&s.sideBtnBuy]} onPress={()=>setSide('buy')} activeOpacity={0.85}>
                <MaterialIcons name="arrow-upward" size={16} color={side==='buy'?Colors.bg:Colors.textMuted}/>
                <Text style={[s.sideTxt,side==='buy'&&{color:Colors.bg}]}>BUY</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.sideBtn,side==='sell'&&s.sideBtnSell]} onPress={()=>setSide('sell')} activeOpacity={0.85}>
                <MaterialIcons name="arrow-downward" size={16} color={side==='sell'?Colors.bg:Colors.textMuted}/>
                <Text style={[s.sideTxt,side==='sell'&&{color:Colors.bg}]}>SELL</Text>
              </TouchableOpacity>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLbl}>Order Type</Text>
              <View style={s.orderTypeRow}>
                {ORDER_TYPES.map(type=>(
                  <TouchableOpacity key={type} style={[s.orderTypeChip,orderType===type&&[s.orderTypeChipActive,{borderColor:selectedCoin.color}]]}
                    onPress={()=>setOrderType(type)} activeOpacity={0.8}>
                    <Text style={[s.orderTypeTxt,orderType===type&&{color:selectedCoin.color}]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLbl}>Amount ({selectedCoin.symbol})</Text>
              <View style={s.inputWrap}>
                <TextInput style={s.inputField} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad"/>
                <Text style={s.inputSuffix}>{selectedCoin.symbol}</Text>
              </View>
              <View style={s.quickRow}>
                {['10','50','100','500'].map(a=>(
                  <TouchableOpacity key={a} style={s.quickBtn} onPress={()=>setAmount(a)} activeOpacity={0.8}>
                    <Text style={s.quickTxt}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {orderType!=='Market'&&(
              <View style={s.fieldGroup}>
                <Text style={s.fieldLbl}>{orderType} Price (USD)</Text>
                <View style={s.inputWrap}>
                  <Text style={s.inputPrefix}>$</Text>
                  <TextInput style={s.inputField} value={limitPrice} onChangeText={setLimitPrice}
                    placeholder={fmtPrice(selectedCoin.price).replace('$','')} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad"/>
                </View>
              </View>
            )}

            {amount.trim()&&(
              <View style={[s.totalCard,{borderColor:selectedCoin.color+'44'}]}>
                <Text style={s.totalLbl}>Estimated Total</Text>
                <Text style={[s.totalVal,{color:selectedCoin.color}]}>${(parseFloat(amount||'0')*selectedCoin.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</Text>
                <Text style={s.totalNote}>+ 0.1% fee · BTNG DEX · Settled instantly</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.placeBtn,{backgroundColor:side==='sell'?Colors.error:Colors.success},(placing||!amount.trim())&&{opacity:0.5}]}
              onPress={handlePlaceOrder} disabled={placing||!amount.trim()} activeOpacity={0.85}>
              {placing?<ActivityIndicator size="small" color={Colors.bg}/>:<MaterialIcons name={side==='buy'?'shopping-cart':'sell'} size={18} color={Colors.bg}/>}
              <Text style={s.placeBtnTxt}>{placing?'Processing…':`${side==='buy'?'Buy':'Sell'} ${selectedCoin.symbol}`}</Text>
            </TouchableOpacity>

            <Text style={s.switchLbl}>Switch Asset</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.switchRail}>
              {coins.slice(0,12).map(c=>(
                <TouchableOpacity key={c.id}
                  style={[s.switchChip,selectedCoin.id===c.id&&[s.switchChipActive,{borderColor:c.color}]]}
                  onPress={()=>{setSelectedCoin(c);setAmount('');setLimitPrice('');}} activeOpacity={0.8}>
                  <Text style={{fontSize:18}}>{c.emoji}</Text>
                  <Text style={[s.switchTxt,selectedCoin.id===c.id&&{color:c.color}]}>{c.symbol}</Text>
                  <Text style={[s.switchChg,{color:c.change24h>=0?Colors.success:Colors.error}]}>{c.change24h>=0?'▲':'▼'}{Math.abs(c.change24h).toFixed(1)}%</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ═══════════ INSIGHTS ═══════════ */}
        {activeTab==='insights'&&(
          <View style={s.section}>
            {/* Coin selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRail}>
              {[...CRYPTO_BASE.slice(0,8),...BTNG_TOKENS.slice(0,2)].map(c=>(
                <TouchableOpacity key={c.id}
                  style={[s.chip,insightCoin.id===c.id&&{backgroundColor:c.color+'22',borderColor:c.color+'66'}]}
                  onPress={()=>setInsightCoin(coins.find(x=>x.id===c.id)??c)} activeOpacity={0.8}>
                  <Text style={{fontSize:14}}>{c.emoji}</Text>
                  <Text style={[s.chipTxt,insightCoin.id===c.id&&{color:c.color,fontWeight:FontWeight.heavy}]}>{c.symbol}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Hero price card */}
            <View style={[ins.heroCard,{borderColor:latestInsightCoin.color+'55'}]}>
              <View style={ins.heroTop}>
                <View style={[ins.heroEmoji,{backgroundColor:latestInsightCoin.color+'18',borderColor:latestInsightCoin.color+'44',overflow:'hidden'}]}>
                  {latestInsightCoin.logoUri
                    ?<Image source={{uri:latestInsightCoin.logoUri}} style={{width:56,height:56,borderRadius:18}} contentFit="cover" transition={200}/>
                    :<Text style={{fontSize:32}}>{latestInsightCoin.emoji}</Text>}
                </View>
                <View style={{flex:1}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                    <Text style={[ins.heroName,{color:latestInsightCoin.color}]}>{latestInsightCoin.name}</Text>
                    {latestInsightCoin.verified&&<MaterialIcons name="verified" size={14} color={latestInsightCoin.color}/>}
                    <View style={[ins.heroBadge,{backgroundColor:latestInsightCoin.color+'18',borderColor:latestInsightCoin.color+'44'}]}>
                      <Text style={[ins.heroBadgeTxt,{color:latestInsightCoin.color}]}>{latestInsightCoin.symbol}</Text>
                    </View>
                  </View>
                  <Text style={ins.heroSub}>{latestInsightCoin.chain??'EVM'} · #{coins.findIndex(c=>c.id===latestInsightCoin.id)+1} by Market Cap</Text>
                </View>
                <View style={[ins.liveTag,{backgroundColor:Colors.successBg,borderColor:Colors.success+'44'}]}>
                  <View style={s.liveGreen}/><Text style={[ins.liveTagTxt,{color:Colors.success}]}>LIVE</Text>
                </View>
              </View>
              <Text style={[ins.heroPrice,{color:latestInsightCoin.color}]}>{fmtPrice(latestInsightCoin.price)}</Text>
              <View style={ins.heroChgRow}>
                <View style={[ins.chgBadge,{backgroundColor:latestInsightCoin.change24h>=0?Colors.successBg:Colors.errorBg,borderColor:(latestInsightCoin.change24h>=0?Colors.success:Colors.error)+'44'}]}>
                  <MaterialIcons name={latestInsightCoin.change24h>=0?'trending-up':'trending-down'} size={14} color={latestInsightCoin.change24h>=0?Colors.success:Colors.error}/>
                  <Text style={[ins.chgTxt,{color:latestInsightCoin.change24h>=0?Colors.success:Colors.error}]}>
                    {latestInsightCoin.change24h>=0?'+':''}{latestInsightCoin.change24h.toFixed(2)}% 24h
                  </Text>
                </View>
                <View style={ins.ath}>
                  <MaterialIcons name="emoji-events" size={11} color={Colors.kenteGold}/>
                  <Text style={ins.athTxt}>ATH {fmtPrice(latestInsightCoin.price*1.18)}</Text>
                </View>
              </View>
            </View>

            {/* AI Market Insight card */}
            <View style={ins.aiCard}>
              <View style={ins.aiHeader}>
                <View style={ins.aiIconWrap}><Text style={{fontSize:20}}>🤖</Text></View>
                <View style={{flex:1}}>
                  <Text style={ins.aiTitle}>AI Market Insight</Text>
                  <Text style={ins.aiSub}>Coinbase-style · {latestInsightCoin.symbol} analysis · Auto-updated</Text>
                </View>
                <View style={[ins.liveTag,{backgroundColor:Colors.primaryGlow,borderColor:Colors.primary+'44'}]}>
                  <View style={[s.liveGreen,{backgroundColor:Colors.primary}]}/><Text style={[ins.liveTagTxt,{color:Colors.primary}]}>AI</Text>
                </View>
              </View>
              {[
                `${latestInsightCoin.name} shows ${insightBuyerPct>60?'strong buying':'mixed'} momentum with ${insightBuyers.toLocaleString()} active buyers — a ${insightBuyerPct>65?'bullish':'neutral'} signal for short-term price action.`,
                `Market depth absorbing flows with only ${Math.abs(latestInsightCoin.change24h).toFixed(2)}% movement over 24h. ${latestInsightCoin.change24h>=0?'Accumulation continues at key support levels.':'Watch for stabilisation above current lows.'}`,
                `${latestInsightCoin.symbol} 24h volume of ${fmtCap(latestInsightCoin.volume24h)} ${latestInsightCoin.change24h>0?'supports the uptrend':'reflects cautious sentiment'} — monitor ${fmtPrice(latestInsightCoin.price*0.97)} as key support.`,
              ].map((txt,i)=>(
                <View key={i} style={ins.aiInsightRow}>
                  <View style={[ins.aiDot,{backgroundColor:i===0?Colors.primary:i===1?Colors.kenteGold:Colors.success}]}/>
                  <Text style={ins.aiInsightTxt}>{txt}</Text>
                </View>
              ))}
            </View>

            {/* Trading Insights — buyer/seller ratio */}
            <View style={ins.tradingCard}>
              <View style={ins.tradingHeader}>
                <MaterialIcons name="insights" size={15} color={Colors.primary}/>
                <Text style={ins.tradingTitle}>Trading Insights</Text>
                <View style={[ins.liveTag,{backgroundColor:Colors.successBg,borderColor:Colors.success+'44',marginLeft:'auto'}]}>
                  <View style={s.liveGreen}/><Text style={[ins.liveTagTxt,{color:Colors.success}]}>LIVE</Text>
                </View>
              </View>

              {/* Buyer/Seller ratio bar */}
              <View style={ins.ratioSection}>
                <View style={ins.ratioLabelRow}>
                  <Text style={[ins.ratioLabel,{color:Colors.success}]}>Buyers {insightBuyerPct.toFixed(0)}%</Text>
                  <Text style={[ins.ratioLabel,{color:Colors.error}]}>Sellers {insightSellerPct.toFixed(0)}%</Text>
                </View>
                <View style={ins.ratioBar}>
                  <View style={[ins.ratioFill,{flex:insightBuyerPct,backgroundColor:Colors.success}]}/>
                  <View style={[ins.ratioFill,{flex:insightSellerPct,backgroundColor:Colors.error}]}/>
                </View>
              </View>

              <View style={ins.traderGrid}>
                {[
                  {label:'Total Traders',value:insightTotalTraders.toLocaleString(),sub:'24h active',color:Colors.textPrimary,icon:'people',chgPct:6.82},
                  {label:'Buyers',value:insightBuyers.toLocaleString(),sub:`${insightBuyerPct.toFixed(0)}% of market`,color:Colors.success,icon:'arrow-upward',chgPct:7.05},
                  {label:'Sellers',value:insightSellers.toLocaleString(),sub:`${insightSellerPct.toFixed(0)}% of market`,color:Colors.error,icon:'arrow-downward',chgPct:3.41},
                  {label:'Searched',value:insightSearched.toLocaleString(),sub:'unique views 24h',color:'#3B82F6',icon:'search',chgPct:4.2},
                ].map(stat=>(
                  <View key={stat.label} style={[ins.traderCard,{borderColor:stat.color+'33'}]}>
                    <View style={[ins.traderIconWrap,{backgroundColor:stat.color+'18',borderColor:stat.color+'44'}]}>
                      <MaterialIcons name={stat.icon as any} size={14} color={stat.color}/>
                    </View>
                    <Text style={[ins.traderVal,{color:stat.color}]}>{stat.value}</Text>
                    <Text style={ins.traderLabel}>{stat.label}</Text>
                    <Text style={ins.traderSub}>{stat.sub}</Text>
                    <View style={[ins.traderChg,{backgroundColor:Colors.successBg}]}>
                      <MaterialIcons name="arrow-drop-up" size={11} color={Colors.success}/>
                      <Text style={[ins.traderChgTxt,{color:Colors.success}]}>+{stat.chgPct}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Market Stats */}
            <View style={ins.statsCard}>
              <View style={ins.sectionHeader}>
                <MaterialIcons name="bar-chart" size={14} color={Colors.kenteGold}/>
                <Text style={ins.sectionTitle}>Market Stats</Text>
              </View>
              {[
                {label:'Market Cap',value:fmtCap(latestInsightCoin.marketCap),sub:`${latestInsightCoin.change24h>=0?'+':''}${latestInsightCoin.change24h.toFixed(2)}%`,subColor:latestInsightCoin.change24h>=0?Colors.success:Colors.error},
                {label:'Fully Diluted Val.',value:fmtCap(latestInsightCoin.marketCap*1.05),sub:'FDV',subColor:Colors.textMuted},
                {label:'Circ. Supply',value:insightCircSupply,sub:'circulating',subColor:Colors.textMuted},
                {label:'Max Supply',value:latestInsightCoin.id==='btc'?'21M BTC':latestInsightCoin.id==='eth'?'∞':'—',sub:'hard cap',subColor:Colors.textMuted},
                {label:'Dominance',value:insightDominance+'%',sub:'of BTNG Terminal market',subColor:Colors.primary},
              ].map(row=>(
                <View key={row.label} style={ins.statRow}>
                  <Text style={ins.statRowLabel}>{row.label}</Text>
                  <View style={{alignItems:'flex-end',gap:2}}>
                    <Text style={ins.statRowValue}>{row.value}</Text>
                    <Text style={[ins.statRowSub,{color:row.subColor}]}>{row.sub}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Performance */}
            <View style={ins.statsCard}>
              <View style={ins.sectionHeader}>
                <MaterialIcons name="timeline" size={14} color="#3B82F6"/>
                <Text style={ins.sectionTitle}>Performance</Text>
              </View>
              {[
                {label:'Popularity',value:`#${coins.findIndex(c=>c.id===latestInsightCoin.id)+1}`,sub:'by market cap ranking',subColor:Colors.primary},
                {label:'Volume (24H)',value:fmtCap(latestInsightCoin.volume24h),sub:`${latestInsightCoin.change24h>=0?'+':''}${(latestInsightCoin.change24h*1.3).toFixed(2)}%`,subColor:latestInsightCoin.change24h>=0?Colors.success:Colors.error},
                {label:'Volume (7D)',value:fmtCap(latestInsightCoin.volume24h*6.8),sub:'7 day total',subColor:Colors.textMuted},
                {label:'Volume (30D)',value:fmtCap(latestInsightCoin.volume24h*28),sub:'30 day total',subColor:Colors.textMuted},
                {label:'All-time High',value:fmtPrice(latestInsightCoin.price*1.18),sub:'historical maximum',subColor:Colors.kenteGold},
              ].map(row=>(
                <View key={row.label} style={ins.statRow}>
                  <Text style={ins.statRowLabel}>{row.label}</Text>
                  <View style={{alignItems:'flex-end',gap:2}}>
                    <Text style={ins.statRowValue}>{row.value}</Text>
                    <Text style={[ins.statRowSub,{color:row.subColor}]}>{row.sub}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Price History Table */}
            <View style={ins.statsCard}>
              <View style={ins.sectionHeader}>
                <MaterialIcons name="history" size={14} color={Colors.kenteGold}/>
                <Text style={ins.sectionTitle}>Price History</Text>
              </View>
              <View style={ins.priceHistHeader}>
                <Text style={ins.phCol}>Period</Text>
                <Text style={ins.phCol}>Price</Text>
                <Text style={[ins.phCol,{textAlign:'right'}]}>Change</Text>
              </View>
              {(()=>{
                const p=latestInsightCoin.price,ch=latestInsightCoin.change24h/100;
                const rows=[
                  {period:'Today',price:p,pct:latestInsightCoin.change24h},
                  {period:'1 Day',price:p/(1+ch),pct:latestInsightCoin.change24h},
                  {period:'1 Week',price:p/(1+ch*3.5),pct:ch*3.5*100},
                  {period:'1 Month',price:p/(1+ch*6.2),pct:ch*6.2*100},
                  {period:'1 Year',price:p/(1+ch*14),pct:ch*14*100},
                ];
                return rows.map(row=>(
                  <View key={row.period} style={ins.phRow}>
                    <Text style={[ins.phCell,{color:Colors.textSecondary,flex:1}]}>{row.period}</Text>
                    <Text style={[ins.phCell,{flex:1}]}>{fmtPrice(row.price)}</Text>
                    <View style={[ins.phChg,{backgroundColor:row.pct>=0?Colors.successBg:Colors.errorBg,borderColor:(row.pct>=0?Colors.success:Colors.error)+'33'}]}>
                      <MaterialIcons name={row.pct>=0?'arrow-drop-up':'arrow-drop-down'} size={12} color={row.pct>=0?Colors.success:Colors.error}/>
                      <Text style={[ins.phChgTxt,{color:row.pct>=0?Colors.success:Colors.error}]}>{row.pct>=0?'+':''}{row.pct.toFixed(2)}%</Text>
                    </View>
                  </View>
                ));
              })()}
            </View>

            {/* Recent Trends */}
            <View style={[ins.statsCard,{borderColor:Colors.primary+'33'}]}>
              <View style={ins.sectionHeader}>
                <MaterialIcons name="trending-up" size={14} color={Colors.primary}/>
                <Text style={ins.sectionTitle}>Recent Trends</Text>
              </View>
              <Text style={ins.trendsTxt}>
                {'The latest '}<Text style={{color:latestInsightCoin.color,fontWeight:FontWeight.bold}}>{latestInsightCoin.symbol}</Text>{' price is '}<Text style={{color:Colors.textPrimary,fontWeight:FontWeight.bold}}>{fmtPrice(latestInsightCoin.price)}</Text>{'. Compared to 24 hours ago, there has been a '}<Text style={{color:latestInsightCoin.change24h>=0?Colors.success:Colors.error,fontWeight:FontWeight.bold}}>{latestInsightCoin.change24h>=0?'+':''}{latestInsightCoin.change24h.toFixed(2)}%</Text>{' change.\n\nThe current circulating supply is '}<Text style={{color:Colors.textSecondary}}>{insightCircSupply}</Text>{' with a market cap of '}<Text style={{color:Colors.kenteGold,fontWeight:FontWeight.bold}}>{fmtCap(latestInsightCoin.marketCap)}</Text>{'. The 24h trading volume is '}<Text style={{color:Colors.primary,fontWeight:FontWeight.bold}}>{fmtCap(latestInsightCoin.volume24h)}</Text>{' — representing '}{insightDominance}{'% market dominance on the BTNG Global Terminal.'}
              </Text>
              {/* Tags */}
              <View style={ins.tagsRow}>
                {(latestInsightCoin.category==='crypto'?['layer-1','mineable','store-of-value','pow']:
                  latestInsightCoin.category==='gold'?['gold-backed','commodity','inflation-hedge','real-world-asset']:
                  ['btng-ecosystem','africa','gold-pegged','ghana']).map(tag=>(
                  <View key={tag} style={ins.tag}><Text style={ins.tagTxt}>{tag}</Text></View>
                ))}
              </View>
            </View>

            {/* Quick Trade CTA */}
            <TouchableOpacity style={[ins.tradeBtn,{backgroundColor:latestInsightCoin.color}]} onPress={()=>handleTrade(latestInsightCoin)} activeOpacity={0.85}>
              <MaterialIcons name="shopping-cart" size={18} color={Colors.bg}/>
              <Text style={ins.tradeBtnTxt}>Trade {latestInsightCoin.symbol} Now</Text>
              <MaterialIcons name="arrow-forward" size={16} color={Colors.bg}/>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══════════ LIST ═══════════ */}
        {activeTab==='list'&&(
          <View style={s.section}>
            <View style={s.listHero}>
              <Text style={{fontSize:44}}>📋</Text>
              <Text style={s.listHeroTitle}>List Your Asset</Text>
              <Text style={s.listHeroSub}>Submit any BTNG-based token, certificate, or commodity to the Global Terminal marketplace.</Text>
            </View>
            <View style={s.reqCard}>
              <Text style={s.reqTitle}>Listing Requirements</Text>
              {[
                {icon:'check-circle',txt:'Deployed on BTNG Mainnet or compatible EVM chain',ok:true},
                {icon:'check-circle',txt:'Minimum $100K market cap at listing',ok:true},
                {icon:'check-circle',txt:'KYC-verified team or legal entity',ok:true},
                {icon:'check-circle',txt:'Smart contract audit by approved auditor',ok:true},
                {icon:'info',txt:'Listing fee: 500 BTNGG (waived for sovereign/government projects)',ok:false},
              ].map((req,i)=>(
                <View key={i} style={s.reqRow}>
                  <MaterialIcons name={req.icon as any} size={14} color={req.ok?Colors.success:Colors.warning}/>
                  <Text style={s.reqTxt}>{req.txt}</Text>
                </View>
              ))}
            </View>
            {[
              {label:'Token Symbol *',value:listSymbol,onChange:(v:string)=>setListSymbol(v.toUpperCase()),placeholder:'e.g. MYTKN',cap:'characters' as any,max:10},
              {label:'Token Name *',value:listName,onChange:setListName,placeholder:'e.g. My Token',cap:'words' as any,max:50},
            ].map(f=>(
              <View key={f.label} style={s.fieldGroup}>
                <Text style={s.fieldLbl}>{f.label}</Text>
                <TextInput style={s.listInput} value={f.value} onChangeText={f.onChange} placeholder={f.placeholder} placeholderTextColor={Colors.textMuted} autoCapitalize={f.cap} maxLength={f.max}/>
              </View>
            ))}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLbl}>Description</Text>
              <TextInput style={[s.listInput,{minHeight:80,textAlignVertical:'top'}]} value={listDesc} onChangeText={setListDesc} placeholder="Describe your asset…" placeholderTextColor={Colors.textMuted} multiline maxLength={300}/>
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLbl}>Total Supply</Text>
              <TextInput style={s.listInput} value={listSupply} onChangeText={v=>setListSupply(v.replace(/[^0-9]/g,''))} placeholder="e.g. 21000000" placeholderTextColor={Colors.textMuted} keyboardType="numeric"/>
            </View>
            <TouchableOpacity
              style={[s.placeBtn,{backgroundColor:Colors.primary},(listSubmitting||!listSymbol.trim()||!listName.trim())&&{opacity:0.5}]}
              onPress={handleListAsset} disabled={listSubmitting||!listSymbol.trim()||!listName.trim()} activeOpacity={0.85}>
              {listSubmitting?<ActivityIndicator size="small" color={Colors.bg}/>:<MaterialIcons name="send" size={18} color={Colors.bg}/>}
              <Text style={s.placeBtnTxt}>{listSubmitting?'Submitting…':'Submit Listing Application'}</Text>
            </TouchableOpacity>
            <View style={s.listNote}>
              <MaterialIcons name="info-outline" size={12} color={Colors.textMuted}/>
              <Text style={s.listNoteTxt}>Reviewed by BTNG Terminal Committee. Approval takes 24–48 hours. Notification via email and in-app.</Text>
            </View>
          </View>
        )}

        <View style={{height:insets.bottom+40}}/>
      </ScrollView>
    </View>
  );
}

// ── Insights Styles ───────────────────────────────────────────────────────────
const ins=StyleSheet.create({
  heroCard:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.xl,borderWidth:2,gap:Spacing.md,shadowColor:Colors.primary,shadowOffset:{width:0,height:4},shadowOpacity:0.2,shadowRadius:14,elevation:7},
  heroTop:{flexDirection:'row',alignItems:'center',gap:Spacing.md},
  heroEmoji:{width:56,height:56,borderRadius:18,borderWidth:1.5,alignItems:'center',justifyContent:'center',flexShrink:0},
  heroName:{fontSize:FontSize.lg,fontWeight:FontWeight.heavy,includeFontPadding:false},
  heroBadge:{borderRadius:Radius.full,paddingHorizontal:7,paddingVertical:3,borderWidth:1},
  heroBadgeTxt:{fontSize:10,fontWeight:FontWeight.heavy,includeFontPadding:false},
  heroSub:{fontSize:FontSize.xs,color:Colors.textMuted,marginTop:2,includeFontPadding:false},
  heroPrice:{fontSize:44,fontWeight:FontWeight.heavy,includeFontPadding:false,letterSpacing:-1},
  heroChgRow:{flexDirection:'row',alignItems:'center',gap:Spacing.md,flexWrap:'wrap'},
  chgBadge:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:Radius.full,paddingHorizontal:10,paddingVertical:5,borderWidth:1},
  chgTxt:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,includeFontPadding:false},
  ath:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:Colors.warningBg,borderRadius:Radius.full,paddingHorizontal:9,paddingVertical:4,borderWidth:1,borderColor:Colors.kenteGold+'44'},
  athTxt:{fontSize:FontSize.xs,fontWeight:FontWeight.semibold,color:Colors.kenteGold,includeFontPadding:false},
  liveTag:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:Radius.full,paddingHorizontal:8,paddingVertical:3,borderWidth:1,flexShrink:0},
  liveTagTxt:{fontSize:9,fontWeight:FontWeight.heavy,letterSpacing:0.8,includeFontPadding:false},

  aiCard:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1.5,borderColor:Colors.primary+'44',gap:Spacing.md,shadowColor:Colors.primary,shadowOffset:{width:0,height:3},shadowOpacity:0.15,shadowRadius:10,elevation:5},
  aiHeader:{flexDirection:'row',alignItems:'center',gap:Spacing.md},
  aiIconWrap:{width:44,height:44,borderRadius:14,backgroundColor:Colors.primaryGlow,borderWidth:1,borderColor:Colors.primary+'44',alignItems:'center',justifyContent:'center',flexShrink:0},
  aiTitle:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  aiSub:{fontSize:FontSize.xs,color:Colors.textMuted,marginTop:2,includeFontPadding:false},
  aiInsightRow:{flexDirection:'row',alignItems:'flex-start',gap:Spacing.sm,paddingVertical:Spacing.sm,borderBottomWidth:1,borderBottomColor:Colors.border},
  aiDot:{width:6,height:6,borderRadius:3,flexShrink:0,marginTop:5},
  aiInsightTxt:{flex:1,fontSize:FontSize.sm,color:Colors.textSecondary,lineHeight:19,includeFontPadding:false},

  tradingCard:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1,borderColor:Colors.border,gap:Spacing.md},
  tradingHeader:{flexDirection:'row',alignItems:'center',gap:Spacing.sm},
  tradingTitle:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},

  ratioSection:{gap:Spacing.sm},
  ratioLabelRow:{flexDirection:'row',justifyContent:'space-between'},
  ratioLabel:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,includeFontPadding:false},
  ratioBar:{flexDirection:'row',height:12,borderRadius:Radius.full,overflow:'hidden',backgroundColor:Colors.bgElevated},
  ratioFill:{},

  traderGrid:{flexDirection:'row',flexWrap:'wrap',gap:Spacing.sm},
  traderCard:{width:'47%',flex:1,backgroundColor:Colors.bgElevated,borderRadius:Radius.xl,padding:Spacing.md,borderWidth:1,alignItems:'center',gap:4,minWidth:130},
  traderIconWrap:{width:34,height:34,borderRadius:10,borderWidth:1,alignItems:'center',justifyContent:'center'},
  traderVal:{fontSize:FontSize.lg,fontWeight:FontWeight.heavy,includeFontPadding:false},
  traderLabel:{fontSize:FontSize.xs,fontWeight:FontWeight.bold,color:Colors.textPrimary,textAlign:'center',includeFontPadding:false},
  traderSub:{fontSize:9,color:Colors.textMuted,textAlign:'center',includeFontPadding:false},
  traderChg:{flexDirection:'row',alignItems:'center',borderRadius:Radius.full,paddingHorizontal:5,paddingVertical:2},
  traderChgTxt:{fontSize:9,fontWeight:FontWeight.heavy,includeFontPadding:false},

  statsCard:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1,borderColor:Colors.border,gap:4},
  sectionHeader:{flexDirection:'row',alignItems:'center',gap:Spacing.sm,marginBottom:Spacing.sm},
  sectionTitle:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  statRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:Spacing.sm+2,borderBottomWidth:1,borderBottomColor:Colors.border},
  statRowLabel:{fontSize:FontSize.sm,color:Colors.textSecondary,flex:1,includeFontPadding:false},
  statRowValue:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.textPrimary,textAlign:'right',includeFontPadding:false},
  statRowSub:{fontSize:10,textAlign:'right',includeFontPadding:false},

  priceHistHeader:{flexDirection:'row',alignItems:'center',paddingVertical:Spacing.sm,borderBottomWidth:1,borderBottomColor:Colors.border},
  phCol:{flex:1,fontSize:10,fontWeight:FontWeight.bold,color:Colors.textMuted,letterSpacing:0.3,includeFontPadding:false},
  phRow:{flexDirection:'row',alignItems:'center',paddingVertical:Spacing.sm+2,borderBottomWidth:1,borderBottomColor:Colors.border},
  phCell:{fontSize:FontSize.sm,fontWeight:FontWeight.semibold,color:Colors.textPrimary,includeFontPadding:false},
  phChg:{flexDirection:'row',alignItems:'center',borderRadius:Radius.full,paddingHorizontal:6,paddingVertical:2,borderWidth:1},
  phChgTxt:{fontSize:9,fontWeight:FontWeight.heavy,includeFontPadding:false},

  trendsTxt:{fontSize:FontSize.sm,color:Colors.textSecondary,lineHeight:20,includeFontPadding:false},
  tagsRow:{flexDirection:'row',flexWrap:'wrap',gap:Spacing.sm,marginTop:Spacing.sm},
  tag:{backgroundColor:Colors.bgElevated,borderRadius:Radius.full,paddingHorizontal:9,paddingVertical:4,borderWidth:1,borderColor:Colors.border},
  tagTxt:{fontSize:10,color:Colors.textMuted,fontWeight:FontWeight.semibold,includeFontPadding:false},

  tradeBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:Spacing.sm,borderRadius:Radius.xl,paddingVertical:Spacing.md+4,shadowOffset:{width:0,height:4},shadowOpacity:0.3,shadowRadius:10,elevation:6},
  tradeBtnTxt:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.bg,flex:1,textAlign:'center',includeFontPadding:false},
});

// ── Gold Converter Styles ─────────────────────────────────────────────────────
const cv=StyleSheet.create({
  card:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1.5,borderColor:Colors.kenteGold+'55',gap:Spacing.md,shadowColor:Colors.kenteGold,shadowOffset:{width:0,height:3},shadowOpacity:0.15,shadowRadius:12,elevation:5},
  header:{flexDirection:'row',alignItems:'center',gap:Spacing.md},
  iconWrap:{width:44,height:44,borderRadius:14,backgroundColor:Colors.warningBg,borderWidth:1,borderColor:Colors.kenteGold+'44',alignItems:'center',justifyContent:'center',flexShrink:0},
  title:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  sub:{fontSize:FontSize.xs,color:Colors.textMuted,marginTop:2,includeFontPadding:false},
  oracleBadge:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:Radius.full,paddingHorizontal:7,paddingVertical:3,borderWidth:1,flexShrink:0},
  oracleDot:{width:5,height:5,borderRadius:2.5},
  oracleTxt:{fontSize:9,fontWeight:FontWeight.heavy,letterSpacing:0.8,includeFontPadding:false},
  inputLabel:{flexDirection:'row',alignItems:'center',paddingHorizontal:Spacing.md,paddingVertical:Spacing.sm-1,borderRadius:Radius.sm,alignSelf:'flex-start',borderWidth:1},
  inputLabelTxt:{fontSize:FontSize.xs,fontWeight:FontWeight.heavy,letterSpacing:0.3,includeFontPadding:false},
  inputRow:{flexDirection:'row',alignItems:'center',backgroundColor:Colors.bgElevated,borderRadius:Radius.lg,borderWidth:1.5,borderColor:Colors.kenteGold+'55',paddingHorizontal:Spacing.md,height:56,gap:Spacing.sm},
  input:{flex:1,fontSize:24,fontWeight:FontWeight.heavy,color:Colors.textPrimary,includeFontPadding:false},
  inputUnit:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.kenteGold,includeFontPadding:false},
  swapBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:Colors.primaryGlow,borderRadius:Radius.lg,paddingVertical:Spacing.sm+4,borderWidth:1.5,borderColor:Colors.primary+'55'},
  swapTxt:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.primary,includeFontPadding:false},
  resultsGrid:{flexDirection:'row',flexWrap:'wrap',gap:Spacing.sm},
  resCard:{flex:1,minWidth:100,backgroundColor:Colors.bgElevated,borderRadius:Radius.lg,padding:Spacing.md,borderWidth:1,alignItems:'center',gap:5},
  resVal:{fontSize:FontSize.md,fontWeight:FontWeight.heavy,textAlign:'center',includeFontPadding:false},
  resLbl:{fontSize:10,color:Colors.textMuted,textAlign:'center',includeFontPadding:false},
  resSub:{fontSize:9,color:Colors.textMuted,textAlign:'center',includeFontPadding:false},
  rateRow:{flexDirection:'row',flexWrap:'wrap',gap:Spacing.sm},
  ratePill:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:Colors.bgElevated,borderRadius:Radius.full,paddingHorizontal:9,paddingVertical:4,borderWidth:1,borderColor:Colors.border},
  rateTxt:{fontSize:10,fontWeight:FontWeight.semibold,color:Colors.textMuted,includeFontPadding:false},
});

// ── Main Styles ───────────────────────────────────────────────────────────────
const s=StyleSheet.create({
  container:{flex:1,backgroundColor:Colors.bg,width:'100%',alignSelf:'stretch'},
  topBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:Spacing.xl,paddingVertical:Spacing.md},
  backBtn:{width:40,height:40,borderRadius:20,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center'},
  topCenter:{alignItems:'center',flex:1},
  topTitle:{fontSize:FontSize.lg,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  topSubRow:{flexDirection:'row',alignItems:'center',gap:6,marginTop:2},
  liveDotOuter:{width:7,height:7,borderRadius:3.5,backgroundColor:Colors.success,shadowColor:Colors.success,shadowOffset:{width:0,height:0},shadowOpacity:1,shadowRadius:5},
  liveDotInner:{width:7,height:7,borderRadius:3.5,backgroundColor:Colors.success},
  topSub:{fontSize:FontSize.xs,color:Colors.success,fontWeight:FontWeight.semibold,includeFontPadding:false},
  refreshBtn:{width:44,height:44,borderRadius:22,backgroundColor:Colors.primaryGlow,borderWidth:1,borderColor:Colors.primary+'55',alignItems:'center',justifyContent:'center'},
  refreshCountdown:{fontSize:8,color:Colors.primary,fontWeight:FontWeight.heavy,includeFontPadding:false,marginTop:1},
  tickerStrip:{flexDirection:'row',alignItems:'center',backgroundColor:Colors.bgCard,borderTopWidth:1,borderBottomWidth:1,borderColor:Colors.border,paddingVertical:Spacing.sm-1,paddingHorizontal:Spacing.md},
  tickerLiveWrap:{marginRight:6,flexShrink:0},
  tickerLiveDot:{width:5,height:5,borderRadius:2.5,backgroundColor:Colors.success,shadowColor:Colors.success,shadowOffset:{width:0,height:0},shadowOpacity:0.9,shadowRadius:3},
  tickerContent:{gap:0,alignItems:'center'},
  tickerItem:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:10,borderRightWidth:1,borderRightColor:Colors.border,borderRadius:4},
  tickerCoinImg:{width:16,height:16,borderRadius:8,borderWidth:1,borderColor:Colors.kenteGold+'55',flexShrink:0},
  tickerSymbol:{fontSize:9,fontWeight:FontWeight.heavy,color:Colors.textMuted,includeFontPadding:false},
  tickerPrice:{fontSize:10,fontWeight:FontWeight.bold,includeFontPadding:false},
  tickerChange:{fontSize:9,fontWeight:FontWeight.bold,includeFontPadding:false},
  tickerGoldItem:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:10},
  tickerGoldLabel:{fontSize:9,fontWeight:FontWeight.heavy,color:Colors.kenteGold,includeFontPadding:false},
  tickerGoldPrice:{fontSize:10,fontWeight:FontWeight.bold,color:Colors.kenteGold,includeFontPadding:false},
  tickerTime:{fontSize:8,color:Colors.textMuted,flexShrink:0,marginLeft:6,includeFontPadding:false},
  tabBarOuter:{paddingVertical:Spacing.sm},
  tabBarContent:{paddingHorizontal:Spacing.xl,gap:Spacing.sm},
  tabBtn:{paddingHorizontal:Spacing.md+2,paddingVertical:Spacing.sm+3,borderRadius:Radius.lg,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,flexDirection:'row',alignItems:'center',gap:5},
  tabBtnActive:{backgroundColor:Colors.primaryGlow,borderColor:Colors.primary},
  tabText:{fontSize:FontSize.xs,fontWeight:FontWeight.semibold,color:Colors.textMuted,includeFontPadding:false},
  tabTextActive:{color:Colors.primary,fontWeight:FontWeight.heavy},
  tabLiveDot:{width:5,height:5,borderRadius:2.5,backgroundColor:Colors.success},
  scroll:{paddingHorizontal:Spacing.xl,paddingTop:Spacing.sm,gap:Spacing.md},
  section:{gap:Spacing.md},
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:Spacing.sm},
  statCard:{flex:1,minWidth:140,backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.md,borderWidth:1,gap:5},
  statCardTop:{flexDirection:'row',alignItems:'center',gap:5},
  statLabel:{fontSize:10,color:Colors.textMuted,fontWeight:FontWeight.semibold,includeFontPadding:false},
  statValue:{fontSize:FontSize.lg,fontWeight:FontWeight.heavy,includeFontPadding:false},
  statSub:{fontSize:9,color:Colors.textMuted,includeFontPadding:false},
  statLive:{flexDirection:'row',alignItems:'center',gap:4},
  statLiveText:{fontSize:9,color:Colors.success,fontWeight:FontWeight.heavy,includeFontPadding:false},
  liveGreen:{width:5,height:5,borderRadius:2.5,backgroundColor:Colors.success,shadowColor:Colors.success,shadowOffset:{width:0,height:0},shadowOpacity:0.9,shadowRadius:3},
  goldSnapCard:{flexDirection:'row',alignItems:'center',backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.md,borderWidth:1.5,borderColor:Colors.kenteGold+'55',gap:Spacing.md},
  goldSnapLeft:{flex:1,flexDirection:'row',alignItems:'center',gap:Spacing.sm},
  goldSnapIcon:{width:44,height:44,borderRadius:13,backgroundColor:Colors.warningBg,borderWidth:1,borderColor:Colors.kenteGold+'44',alignItems:'center',justifyContent:'center',flexShrink:0},
  goldSnapTitle:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  goldSnapSub:{fontSize:10,color:Colors.textMuted,marginTop:2,includeFontPadding:false},
  goldSnapPrice:{fontSize:FontSize.lg,fontWeight:FontWeight.heavy,color:Colors.kenteGold,includeFontPadding:false},
  goldSnapChg:{flexDirection:'row',alignItems:'center',borderRadius:Radius.full,paddingHorizontal:6,paddingVertical:2},
  goldSnapChgTxt:{fontSize:9,fontWeight:FontWeight.heavy,includeFontPadding:false},
  chipRail:{gap:Spacing.sm,paddingVertical:2},
  chip:{paddingHorizontal:Spacing.md,paddingVertical:Spacing.sm,borderRadius:Radius.full,backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,flexDirection:'row',alignItems:'center',gap:3},
  chipTxt:{fontSize:FontSize.xs,fontWeight:FontWeight.semibold,color:Colors.textMuted,includeFontPadding:false},
  chipActive:{backgroundColor:Colors.primaryGlow,borderColor:Colors.primary},
  chipTxtActive:{color:Colors.primary,fontWeight:FontWeight.heavy},
  searchBox:{flexDirection:'row',alignItems:'center',backgroundColor:Colors.bgCard,borderRadius:Radius.lg,borderWidth:1,borderColor:Colors.border,paddingHorizontal:Spacing.md,gap:Spacing.sm,height:44},
  searchInput:{flex:1,color:Colors.textPrimary,fontSize:FontSize.sm,includeFontPadding:false},
  listCard:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1,borderColor:Colors.border},
  listHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:Spacing.sm},
  listTitle:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  listSub:{fontSize:FontSize.xs,color:Colors.textMuted,includeFontPadding:false},
  empty:{alignItems:'center',gap:Spacing.sm,paddingVertical:Spacing.xl},
  emptyTxt:{fontSize:FontSize.sm,color:Colors.textMuted,includeFontPadding:false},
  sourceBadge:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:Radius.full,paddingHorizontal:7,paddingVertical:3,borderWidth:1},
  sourceDot:{width:5,height:5,borderRadius:2.5},
  sourceTxt:{fontSize:9,fontWeight:FontWeight.heavy,letterSpacing:0.8,includeFontPadding:false},
  goldHero:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.xl,borderWidth:2,borderColor:Colors.kenteGold+'66',gap:Spacing.md,shadowColor:Colors.kenteGold,shadowOffset:{width:0,height:4},shadowOpacity:0.25,shadowRadius:16,elevation:8},
  goldHeroTop:{flexDirection:'row',alignItems:'center',gap:Spacing.md},
  goldHeroIcon:{width:56,height:56,borderRadius:18,backgroundColor:Colors.warningBg,borderWidth:2,borderColor:Colors.kenteGold+'66',alignItems:'center',justifyContent:'center',flexShrink:0},
  goldHeroTitle:{fontSize:FontSize.lg,fontWeight:FontWeight.heavy,color:Colors.textPrimary,includeFontPadding:false},
  goldHeroSub:{fontSize:FontSize.xs,color:Colors.textMuted,marginTop:2,includeFontPadding:false},
  goldHeroPrice:{fontSize:44,fontWeight:FontWeight.heavy,color:Colors.kenteGold,includeFontPadding:false,letterSpacing:-1},
  goldHeroChangeRow:{flexDirection:'row',alignItems:'center',gap:Spacing.md},
  goldChgBadge:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:Radius.full,paddingHorizontal:10,paddingVertical:5,borderWidth:1},
  goldChgTxt:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,includeFontPadding:false},
  goldRefresh:{backgroundColor:Colors.bgElevated,borderRadius:Radius.full,paddingHorizontal:10,paddingVertical:5,borderWidth:1,borderColor:Colors.border},
  goldRefreshTxt:{fontSize:FontSize.xs,color:Colors.textMuted,fontWeight:FontWeight.semibold,includeFontPadding:false},
  goldStatsGrid:{flexDirection:'row',flexWrap:'wrap',gap:Spacing.sm},
  goldStatCard:{width:'47%',flex:1,backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.md,borderWidth:1,alignItems:'center',gap:5,minWidth:130},
  goldStatVal:{fontSize:FontSize.md,fontWeight:FontWeight.heavy,includeFontPadding:false},
  goldStatLbl:{fontSize:10,color:Colors.textMuted,textAlign:'center',includeFontPadding:false},
  sparkCard:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1,borderColor:Colors.kenteGold+'33',gap:Spacing.sm},
  sparkHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  sparkTitle:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  sparkBadge:{backgroundColor:Colors.warningBg,borderRadius:Radius.full,paddingHorizontal:8,paddingVertical:3,borderWidth:1,borderColor:Colors.kenteGold+'55'},
  sparkBadgeTxt:{fontSize:9,fontWeight:FontWeight.heavy,color:Colors.kenteGold,includeFontPadding:false},
  sparkBars:{flexDirection:'row',alignItems:'flex-end',height:72,gap:1},
  sparkFoot:{fontSize:9,color:Colors.textMuted,includeFontPadding:false},
  tradeAsset:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:2,flexDirection:'row',alignItems:'center',gap:Spacing.md},
  tradeAssetEmoji:{width:56,height:56,borderRadius:18,borderWidth:1.5,alignItems:'center',justifyContent:'center',flexShrink:0},
  tradeSymbol:{fontSize:FontSize.xl,fontWeight:FontWeight.heavy,color:Colors.textPrimary,includeFontPadding:false},
  tradeName:{fontSize:FontSize.xs,color:Colors.textMuted,marginTop:2,includeFontPadding:false},
  chainChip:{borderRadius:Radius.full,paddingHorizontal:6,paddingVertical:2,borderWidth:1},
  chainChipTxt:{fontSize:9,fontWeight:FontWeight.heavy,letterSpacing:0.3,includeFontPadding:false},
  changeBadge:{flexDirection:'row',alignItems:'center',gap:3,borderRadius:Radius.full,paddingHorizontal:7,paddingVertical:3},
  changeBadgeTxt:{fontSize:10,fontWeight:FontWeight.heavy,includeFontPadding:false},
  statsRow24:{flexDirection:'row',backgroundColor:Colors.bgCard,borderRadius:Radius.lg,borderWidth:1,borderColor:Colors.border},
  stat24:{flex:1,alignItems:'center',paddingVertical:Spacing.md,gap:3},
  stat24Lbl:{fontSize:9,color:Colors.textMuted,includeFontPadding:false},
  stat24Val:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  spreadBar:{flexDirection:'row',alignItems:'center',backgroundColor:Colors.bgCard,borderRadius:Radius.lg,padding:Spacing.md,borderWidth:1,borderColor:Colors.border},
  spreadLeft:{flexDirection:'row',alignItems:'center',gap:6,flex:1},
  spreadCenter:{flex:1,alignItems:'center'},
  spreadRight:{flexDirection:'row',alignItems:'center',gap:6,flex:1,justifyContent:'flex-end'},
  spreadLabel:{fontSize:9,color:Colors.textMuted,fontWeight:FontWeight.heavy,letterSpacing:0.5,includeFontPadding:false},
  spreadPrice:{fontSize:FontSize.sm,fontWeight:FontWeight.heavy,includeFontPadding:false},
  spreadCenterVal:{fontSize:FontSize.xs,color:Colors.textSecondary,fontWeight:FontWeight.bold,includeFontPadding:false},
  liveDot2:{width:6,height:6,borderRadius:3,backgroundColor:Colors.success,shadowColor:Colors.success,shadowOffset:{width:0,height:0},shadowOpacity:0.9,shadowRadius:3},
  liveDotRow:{flexDirection:'row',alignItems:'center',gap:4},
  liveTxt:{fontSize:9,color:Colors.success,fontWeight:FontWeight.heavy,includeFontPadding:false},
  obContainer:{flexDirection:'row',gap:Spacing.sm},
  obHalf:{flex:1,backgroundColor:Colors.bgCard,borderRadius:Radius.lg,borderWidth:1,borderColor:Colors.border,overflow:'hidden'},
  obHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:6,paddingVertical:5,borderBottomWidth:1,borderBottomColor:Colors.border,backgroundColor:Colors.bgElevated},
  obTitle:{fontSize:8,fontWeight:FontWeight.heavy,letterSpacing:0.8,includeFontPadding:false},
  obColHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:6,paddingVertical:3,borderBottomWidth:1,borderBottomColor:Colors.border},
  obColTxt:{flex:1,fontSize:8,color:Colors.textMuted,fontWeight:FontWeight.semibold,includeFontPadding:false},
  obMidPrice:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:4,backgroundColor:Colors.bgElevated,borderTopWidth:1,borderBottomWidth:1,borderColor:Colors.border},
  obMidPriceTxt:{fontSize:FontSize.sm,fontWeight:FontWeight.heavy,color:Colors.textPrimary,includeFontPadding:false},
  obMidPriceChange:{fontSize:10,fontWeight:FontWeight.bold,includeFontPadding:false},
  sideRow:{flexDirection:'row',backgroundColor:Colors.bgCard,borderRadius:Radius.lg,padding:3,gap:3,borderWidth:1,borderColor:Colors.border},
  sideBtn:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:Spacing.md,borderRadius:Radius.md},
  sideBtnBuy:{backgroundColor:Colors.success},
  sideBtnSell:{backgroundColor:Colors.error},
  sideTxt:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.textMuted,includeFontPadding:false},
  fieldGroup:{gap:Spacing.sm},
  fieldLbl:{fontSize:FontSize.xs,fontWeight:FontWeight.bold,color:Colors.textMuted,letterSpacing:0.3,includeFontPadding:false},
  orderTypeRow:{flexDirection:'row',backgroundColor:Colors.bgCard,borderRadius:Radius.lg,padding:3,gap:3,borderWidth:1,borderColor:Colors.border},
  orderTypeChip:{flex:1,paddingVertical:Spacing.sm+2,borderRadius:Radius.md,alignItems:'center',borderWidth:1,borderColor:'transparent'},
  orderTypeChipActive:{backgroundColor:Colors.primaryGlow},
  orderTypeTxt:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.textMuted,includeFontPadding:false},
  inputWrap:{flexDirection:'row',alignItems:'center',backgroundColor:Colors.bgCard,borderRadius:Radius.lg,borderWidth:1.5,borderColor:Colors.border,paddingHorizontal:Spacing.md,height:54},
  inputField:{flex:1,fontSize:FontSize.xl,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  inputSuffix:{fontSize:FontSize.sm,fontWeight:FontWeight.bold,color:Colors.textMuted,includeFontPadding:false},
  inputPrefix:{fontSize:FontSize.lg,fontWeight:FontWeight.bold,color:Colors.textMuted,marginRight:4,includeFontPadding:false},
  quickRow:{flexDirection:'row',gap:Spacing.sm},
  quickBtn:{flex:1,backgroundColor:Colors.bgCard,borderRadius:Radius.md,paddingVertical:Spacing.sm,alignItems:'center',borderWidth:1,borderColor:Colors.border},
  quickTxt:{fontSize:FontSize.xs,fontWeight:FontWeight.bold,color:Colors.textSecondary,includeFontPadding:false},
  totalCard:{backgroundColor:Colors.primaryGlow,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1.5,alignItems:'center',gap:Spacing.sm},
  totalLbl:{fontSize:FontSize.xs,color:Colors.textMuted,fontWeight:FontWeight.semibold,includeFontPadding:false},
  totalVal:{fontSize:28,fontWeight:FontWeight.heavy,includeFontPadding:false},
  totalNote:{fontSize:FontSize.xs,color:Colors.textSecondary,includeFontPadding:false},
  placeBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:Radius.xl,paddingVertical:Spacing.md+4,shadowOffset:{width:0,height:4},shadowOpacity:0.3,shadowRadius:10,elevation:6},
  placeBtnTxt:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.bg,includeFontPadding:false},
  switchLbl:{fontSize:FontSize.xs,fontWeight:FontWeight.bold,color:Colors.textMuted,letterSpacing:0.3,includeFontPadding:false},
  switchRail:{gap:Spacing.sm,paddingVertical:2},
  switchChip:{alignItems:'center',gap:4,backgroundColor:Colors.bgCard,borderRadius:Radius.lg,paddingVertical:Spacing.sm+2,paddingHorizontal:Spacing.sm+2,borderWidth:1,borderColor:Colors.border,minWidth:68},
  switchChipActive:{backgroundColor:Colors.primaryGlow},
  switchTxt:{fontSize:10,fontWeight:FontWeight.bold,color:Colors.textMuted,includeFontPadding:false},
  switchChg:{fontSize:9,fontWeight:FontWeight.heavy,includeFontPadding:false},
  listHero:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.xl,borderWidth:1,borderColor:Colors.border,alignItems:'center',gap:Spacing.sm},
  listHeroTitle:{fontSize:FontSize.xl,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  listHeroSub:{fontSize:FontSize.sm,color:Colors.textSecondary,textAlign:'center',lineHeight:20,includeFontPadding:false},
  reqCard:{backgroundColor:Colors.bgCard,borderRadius:Radius.xl,padding:Spacing.lg,borderWidth:1,borderColor:Colors.border,gap:Spacing.sm},
  reqTitle:{fontSize:FontSize.md,fontWeight:FontWeight.bold,color:Colors.textPrimary,includeFontPadding:false},
  reqRow:{flexDirection:'row',alignItems:'flex-start',gap:Spacing.sm},
  reqTxt:{flex:1,fontSize:FontSize.sm,color:Colors.textSecondary,lineHeight:18,includeFontPadding:false},
  listInput:{backgroundColor:Colors.bgCard,borderRadius:Radius.lg,borderWidth:1.5,borderColor:Colors.border,paddingHorizontal:Spacing.md,paddingVertical:Spacing.sm+4,color:Colors.textPrimary,fontSize:FontSize.md,includeFontPadding:false},
  listNote:{flexDirection:'row',alignItems:'flex-start',gap:6,backgroundColor:Colors.bgCard,borderRadius:Radius.lg,padding:Spacing.md,borderWidth:1,borderColor:Colors.border},
  listNoteTxt:{flex:1,fontSize:FontSize.xs,color:Colors.textMuted,lineHeight:16,includeFontPadding:false},
});
