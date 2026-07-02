/**
 * BTNGGoldCoin Bank — Control Panel
 * React Native port of the localhost:8090 HTML dashboard
 */
import React, { useState, useCallback, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert, getSupabaseClient } from '@/template';

// ─── Design tokens (matching HTML dashboard) ──────────────────────────────────
const GOLD  = '#f0c040';
const DARK  = '#0a0a1a';
const CARD  = '#16213e';
const INP   = '#2a2a4e';
const GREEN = '#4CAF50';
const RED   = '#ff4444';
const BLUE  = '#2196F3';
const MUTED = '#a0a0a0';
const FEE   = 0.001;

const RESERVES = { ecoverline: 30_000_000_000_000, gold: 29_500_000_000_000, total: 59_500_000_000_000 };

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tx { id:string; type:'send'|'receive'; from:string; to:string; amount:number; fee:number; timestamp:number; status:string; signature:string; }
interface Wallet { accountNumber:string; address:string; publicKey:string; privateKey:string; mnemonic:string; pin:string; password:string; balance:number; transactions:Tx[]; }

const walletDB = new Map<string, Wallet>();

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmtN = (v:number) => v.toLocaleString('en-US', { maximumFractionDigits:6 });
const trunc = (s:string, n=22) => s.length > n ? s.slice(0,n)+'…' : s;
const nowStr = () => new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const WORDS = ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','accident','account','accuse','achieve','acid','acoustic','acquire','across','action','actor','africa','agent','agree','ahead','aim','airport','aisle','alarm','album','alcohol','alert','alien','all','alley','allow','almost','alone','alpha','already','also','alter','always','amazing','among','amount'];
const mkMnemonic = () => Array.from({length:24},()=>WORDS[Math.floor(Math.random()*WORDS.length)]).join(' ');
const mkPassword = () => { const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'; return Array.from({length:20},()=>c[Math.floor(Math.random()*c.length)]).join(''); };

async function createWallet(name:string, email:string, country:string, deposit:number): Promise<Wallet> {
  const c = country.toUpperCase().slice(0,2)||'GH';
  const mn = mkMnemonic();
  const nonce = Math.random().toString(36).slice(2)+Date.now().toString(16);
  const priv = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`BTNG-PRIV-${mn}-${nonce}`);
  const pub  = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`BTNG-PUB-${priv}`);
  const addr = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pub);
  const address = `BTNG-GOLD-${c}-${addr.slice(0,32).toUpperCase()}`;
  const acct    = `BTNG-${Date.now().toString().slice(-8)}${addr.slice(32,40).toUpperCase()}`;
  const txs: Tx[] = [];
  let balance = 0;
  if (deposit > 0) {
    const sig = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${deposit}|Genesis|${priv}|${Date.now()}`);
    txs.push({ id:`BTNG-RX-${Date.now()}-GENESIS`, type:'receive', from:'Genesis Reserve Fund', to:address, amount:deposit, fee:0, timestamp:Date.now(), status:'confirmed', signature:sig.slice(0,64).toUpperCase() });
    balance = deposit;
  }
  const w:Wallet = { accountNumber:acct, address, publicKey:pub.toUpperCase(), privateKey:priv.toUpperCase(), mnemonic:mn, pin:String(Math.floor(100000+Math.random()*900000)), password:mkPassword(), balance, transactions:txs };
  walletDB.set(acct, w);
  return w;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({label, bg}:{label:string; bg:string}) {
  return <View style={{borderRadius:12,paddingHorizontal:10,paddingVertical:3,backgroundColor:bg}}><Text style={{fontSize:11,fontWeight:'700',color:'#fff',includeFontPadding:false as any}}>{label}</Text></View>;
}

function KV({k, v, hide=false}:{k:string; v:string; hide?:boolean}) {
  const [vis, setVis] = useState(!hide);
  const [cp, setCp]   = useState(false);
  const copy = () => { Clipboard.setStringAsync(v).catch(()=>{}); setCp(true); setTimeout(()=>setCp(false),1500); };
  return (
    <View style={kv.row}>
      <Text style={kv.k}>{k}:</Text>
      <Text style={[kv.v, !vis&&{color:MUTED}]} numberOfLines={2} selectable>{vis ? v : '•'.repeat(Math.min(v.length,28))}</Text>
      <View style={{flexDirection:'row',gap:3}}>
        {hide && <TouchableOpacity onPress={()=>setVis(!vis)} style={kv.ic} hitSlop={{top:6,bottom:6,left:6,right:6}}><MaterialIcons name={vis?'visibility-off':'visibility'} size={10} color={MUTED}/></TouchableOpacity>}
        <TouchableOpacity onPress={copy} style={[kv.ic,cp&&{backgroundColor:GREEN+'33'}]} hitSlop={{top:6,bottom:6,left:6,right:6}}><MaterialIcons name={cp?'check':'copy-all'} size={10} color={cp?GREEN:MUTED}/></TouchableOpacity>
      </View>
    </View>
  );
}
const kv = StyleSheet.create({
  row:{flexDirection:'row',alignItems:'flex-start',gap:5,paddingVertical:4,borderBottomWidth:1,borderBottomColor:'#ffffff11'},
  k:  {width:80,fontSize:10,fontWeight:'700',color:GOLD,includeFontPadding:false as any,flexShrink:0,paddingTop:1},
  v:  {flex:1,fontSize:10,color:GREEN,fontFamily:Platform.OS==='ios'?'Menlo':'monospace',lineHeight:14,includeFontPadding:false as any},
  ic: {width:18,height:18,borderRadius:4,backgroundColor:'#ffffff11',alignItems:'center',justifyContent:'center'},
});

function TxCard({tx}:{tx:Tx}) {
  const send = tx.type==='send';
  const dt = new Date(tx.timestamp);
  return (
    <View style={[txc.row,{borderLeftColor:send?RED:GREEN}]}>
      <View style={{flex:1,gap:2}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
          <Text style={{fontSize:10,fontWeight:'700',color:send?RED:GREEN,includeFontPadding:false as any}}>{send?'▲ SENT':'▼ RECV'}</Text>
          <Text style={txc.id} numberOfLines={1}>{trunc(tx.id,18)}</Text>
          <View style={{borderRadius:8,paddingHorizontal:5,paddingVertical:1,backgroundColor:GREEN+'22'}}><Text style={{fontSize:8,fontWeight:'700',color:GREEN,includeFontPadding:false as any}}>{tx.status}</Text></View>
        </View>
        <Text style={txc.addr} numberOfLines={1}>{send?`→ ${tx.to}`:`← ${tx.from}`}</Text>
        <Text style={txc.time}>{dt.toLocaleDateString('en-GB')} {dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</Text>
      </View>
      <Text style={{fontSize:13,fontWeight:'700',color:send?RED:GREEN,includeFontPadding:false as any,flexShrink:0}}>{send?'-':'+'}{fmtN(tx.amount)}</Text>
    </View>
  );
}
const txc = StyleSheet.create({
  row: {flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8,paddingHorizontal:8,borderLeftWidth:3,backgroundColor:DARK,borderRadius:6,marginVertical:2},
  id:  {flex:1,fontSize:9,color:MUTED,fontFamily:Platform.OS==='ios'?'Menlo':'monospace',includeFontPadding:false as any},
  addr:{fontSize:9,color:MUTED,fontFamily:Platform.OS==='ios'?'Menlo':'monospace',includeFontPadding:false as any},
  time:{fontSize:9,color:'#555',includeFontPadding:false as any},
});

const Field = ({ph,val,set,kb='default',sec=false,max}:{ph:string;val:string;set:(t:string)=>void;kb?:any;sec?:boolean;max?:number}) => (
  <TextInput style={fi.f} placeholder={ph} placeholderTextColor={MUTED} value={val} onChangeText={set} keyboardType={kb} autoCapitalize="none" autoCorrect={false} secureTextEntry={sec} maxLength={max} />
);
const fi = StyleSheet.create({ f:{backgroundColor:INP,borderWidth:1,borderColor:GOLD+'33',borderRadius:6,paddingHorizontal:12,paddingVertical:10,fontSize:13,color:'#fff',marginVertical:4,includeFontPadding:false as any} });

const Btn = ({label,onPress,bg=GOLD,fg='#1a1a2e',loading=false,disabled=false}:{label:string;onPress:()=>void;bg?:string;fg?:string;loading?:boolean;disabled?:boolean}) => (
  <TouchableOpacity style={[bi.b,{backgroundColor:bg},(loading||disabled)&&{opacity:0.5}]} onPress={onPress} disabled={loading||disabled} activeOpacity={0.85}>
    {loading&&<ActivityIndicator size="small" color={fg}/>}
    <Text style={[bi.t,{color:fg}]}>{label}</Text>
  </TouchableOpacity>
);
const bi = StyleSheet.create({ b:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:6,paddingVertical:12,paddingHorizontal:16,marginVertical:6}, t:{fontSize:15,fontWeight:'700',includeFontPadding:false as any} });

const Crd = ({title,children}:{title?:string;children:React.ReactNode}) => (
  <View style={{backgroundColor:CARD,borderRadius:12,borderWidth:1,borderColor:GOLD+'22',padding:18,marginBottom:14}}>
    {title&&<Text style={{fontSize:17,fontWeight:'700',color:GOLD,marginBottom:12,includeFontPadding:false as any}}>{title}</Text>}
    {children}
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BTNGControlPanelScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => { const s = Dimensions.addEventListener('change',({window})=>setDims(window)); return ()=>s?.remove(); },[]);
  const wide = dims.width >= 768;

  // create
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState(user?.email??'');
  const [cPhone, setCPhone] = useState('');
  const [cCountry, setCCountry] = useState('GH');
  const [cDep, setCDep] = useState('');
  const [cLoading, setCLoading] = useState(false);
  const [created, setCreated] = useState<Wallet|null>(null);
  // lookup
  const [lookAcct, setLookAcct] = useState('');
  const [viewed, setViewed] = useState<Wallet|null>(null);
  // send
  const [sAcct, setSAcct] = useState(''); const [sTo, setSTo] = useState(''); const [sAmt, setSAmt] = useState(''); const [sKey, setSKey] = useState('');
  const [sLoad, setSLoad] = useState(false); const [sTx, setSTx] = useState<Tx|null>(null);
  // receive
  const [rAcct, setRAcct] = useState(''); const [rFrom, setRFrom] = useState(''); const [rAmt, setRAmt] = useState('');
  const [rLoad, setRLoad] = useState(false); const [rTx, setRTx] = useState<Tx|null>(null);
  // notifs + feed
  const [notifs, setNotifs] = useState<{id:string;msg:string;t:string}[]>([]);
  const [feed,   setFeed]   = useState<Tx[]>([]);
  const addN = useCallback((msg:string) => setNotifs(p=>[{id:Date.now().toString(),msg,t:nowStr()},...p].slice(0,15)),[]);
  const addF = useCallback((tx:Tx) => setFeed(p=>[tx,...p].slice(0,80)),[]);

  const doCreate = useCallback(async()=>{
    if(!cName.trim()){showAlert('Required','Enter full name.');return;}
    setCLoading(true); setCreated(null);
    try {
      const w = await createWallet(cName.trim(), cEmail.trim(), cCountry.trim(), parseFloat(cDep)>0?parseFloat(cDep):0);
      setCreated(w); setLookAcct(w.accountNumber); setViewed({...w});
      addN(`Wallet created: ${w.accountNumber}`);
      if(w.transactions.length>0) addF(w.transactions[0]);
      if(user?.id) { const sb=getSupabaseClient(); await sb.from('btng_wallets').insert({user_id:user.id,btng_id:w.accountNumber,wallet_address:w.address,asset:'BTNGG',balance:w.balance,gold_backed_ghs:w.balance*134.5,tier:'Bronze',source:'control_panel',looked_up_at:new Date().toISOString()}); }
    } catch(e:any){showAlert('Error',e.message);}
    finally{setCLoading(false);}
  },[cName,cEmail,cPhone,cCountry,cDep,user,showAlert,addN,addF]);

  const doLookup = useCallback(()=>{
    const w=walletDB.get(lookAcct.trim());
    if(!w){showAlert('Not Found','Wallet not found. Create one first.');return;}
    setViewed({...w}); addN(`Wallet loaded: ${w.accountNumber}`);
  },[lookAcct,showAlert,addN]);

  const doSend = useCallback(async()=>{
    const w=walletDB.get(sAcct.trim());
    if(!w){showAlert('Not Found','Account not found.');return;}
    const amt=parseFloat(sAmt);
    if(!sTo.trim()||!amt||amt<=0||!sKey.trim()){showAlert('Required','Fill all fields.');return;}
    if(sKey.trim().toUpperCase()!==w.privateKey){showAlert('Auth Failed','Invalid private key.');return;}
    if(amt>w.balance){showAlert('Insufficient','Not enough balance.');return;}
    setSLoad(true); setSTx(null);
    try {
      const fee=parseFloat((amt*FEE).toFixed(8));
      const sig=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${amt}|${sTo}|${w.privateKey}|${Date.now()}`);
      const tx:Tx={id:`BTNG-TX-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`,type:'send',from:w.address,to:sTo.trim(),amount:amt,fee,timestamp:Date.now(),status:'confirmed',signature:sig.slice(0,64).toUpperCase()};
      w.balance=parseFloat((w.balance-amt-fee).toFixed(8)); w.transactions.unshift(tx); walletDB.set(w.accountNumber,w);
      setSTx(tx); if(viewed?.accountNumber===w.accountNumber) setViewed({...w});
      addF(tx); addN(`💰 Sent ${fmtN(amt)} from ${w.accountNumber}`);
      if(user?.id){const sb=getSupabaseClient();await sb.from('trade_history').insert({user_id:user.id,type:'send',coin:'BTNGG',coin_name:'BTNG Gold Coin',amount:amt,price:0,total_usd:0,fee,status:'completed',note:`control_panel|to=${tx.to}`});}
    } catch(e:any){showAlert('Failed',e.message);}
    finally{setSLoad(false);}
  },[sAcct,sTo,sAmt,sKey,viewed,user,showAlert,addF,addN]);

  const doReceive = useCallback(async()=>{
    const w=walletDB.get(rAcct.trim());
    if(!w){showAlert('Not Found','Account not found.');return;}
    const amt=parseFloat(rAmt);
    if(!rFrom.trim()||!amt||amt<=0){showAlert('Required','Fill all fields.');return;}
    setRLoad(true); setRTx(null);
    try {
      const sig=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${amt}|${rFrom}|${w.privateKey}|${Date.now()}`);
      const tx:Tx={id:`BTNG-RX-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`,type:'receive',from:rFrom.trim(),to:w.address,amount:amt,fee:0,timestamp:Date.now(),status:'confirmed',signature:sig.slice(0,64).toUpperCase()};
      w.balance=parseFloat((w.balance+amt).toFixed(8)); w.transactions.unshift(tx); walletDB.set(w.accountNumber,w);
      setRTx(tx); if(viewed?.accountNumber===w.accountNumber) setViewed({...w});
      addF(tx); addN(`📥 Received ${fmtN(amt)} to ${w.accountNumber}`);
      if(user?.id){const sb=getSupabaseClient();await sb.from('trade_history').insert({user_id:user.id,type:'receive',coin:'BTNGG',coin_name:'BTNG Gold Coin',amount:amt,price:0,total_usd:0,fee:0,status:'completed',note:`control_panel|from=${tx.from}`});}
    } catch(e:any){showAlert('Failed',e.message);}
    finally{setRLoad(false);}
  },[rAcct,rFrom,rAmt,viewed,user,showAlert,addF,addN]);

  return (
    <View style={{flex:1,backgroundColor:DARK,paddingTop:insets.top}}>
      {/* Header */}
      <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingBottom:12,borderBottomWidth:2,borderBottomColor:GOLD}}>
        <TouchableOpacity onPress={()=>router.back()} style={{width:40,height:40,borderRadius:20,backgroundColor:'#ffffff11',alignItems:'center',justifyContent:'center'}}>
          <MaterialIcons name="arrow-back" size={20} color="#fff"/>
        </TouchableOpacity>
        <View style={{flex:1,alignItems:'center',gap:3}}>
          <Text style={{fontSize:22,fontWeight:'700',color:GOLD,includeFontPadding:false as any}}>🏛️ BTNGGoldCoin Bank</Text>
          <Text style={{fontSize:12,color:MUTED,includeFontPadding:false as any}}>Complete Sovereign African Banking System</Text>
          <View style={{flexDirection:'row',gap:6,marginTop:2}}>
            <Badge label="● LIVE" bg={GREEN}/>
            <Badge label="VERIFIED" bg={BLUE}/>
            <Badge label="59.5T COVER" bg={GREEN}/>
          </View>
        </View>
        <View style={{width:40}}/>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding:14,paddingBottom:insets.bottom+40}}>
        {/* Cover Banner */}
        <View style={{backgroundColor:'#1a1a3e',borderRadius:12,borderWidth:1,borderColor:GOLD+'44',padding:18,marginBottom:14,alignItems:'center'}}>
          <Text style={{fontSize:22,fontWeight:'700',color:GOLD,includeFontPadding:false as any,textAlign:'center'}}>${RESERVES.total.toLocaleString('en-US')}</Text>
          <Text style={{fontSize:12,color:MUTED,marginTop:3,includeFontPadding:false as any}}>Total Sovereign Cover</Text>
          <View style={{flexDirection:'row',gap:12,marginTop:12,flexWrap:'wrap',justifyContent:'center'}}>
            {[{label:'📊 Ecoverline Data',v:RESERVES.ecoverline},{label:'🥇 Gold Reserve',v:RESERVES.gold}].map(item=>(
              <View key={item.label} style={{backgroundColor:DARK,borderRadius:8,paddingHorizontal:16,paddingVertical:10,alignItems:'center',gap:2}}>
                <Text style={{fontSize:13,fontWeight:'700',color:GREEN,includeFontPadding:false as any}}>${item.v.toLocaleString('en-US')}</Text>
                <Text style={{fontSize:10,color:MUTED,includeFontPadding:false as any}}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Notifications */}
        {notifs.length>0 && (
          <Crd title="🔔 Live Network Events">
            <ScrollView style={{maxHeight:100}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {notifs.map(n=>(
                <View key={n.id} style={{flexDirection:'row',alignItems:'center',gap:7,backgroundColor:DARK,borderRadius:5,borderLeftWidth:3,borderLeftColor:GOLD,paddingHorizontal:10,paddingVertical:5,marginBottom:3}}>
                  <Text style={{flex:1,fontSize:11,color:MUTED,includeFontPadding:false as any}} numberOfLines={1}>{n.msg}</Text>
                  <Text style={{fontSize:9,color:'#555',includeFontPadding:false as any}}>{n.t}</Text>
                </View>
              ))}
            </ScrollView>
          </Crd>
        )}

        {/* Create + Dashboard row */}
        <View style={wide?{flexDirection:'row',gap:14}:{}}>
          <View style={wide?{flex:1}:{}}>
            <Crd title="📱 Create New Wallet">
              <Field ph="Full Name *" val={cName} set={setCName}/>
              <Field ph="Email" val={cEmail} set={setCEmail} kb="email-address"/>
              <Field ph="Phone" val={cPhone} set={setCPhone} kb="phone-pad"/>
              <Field ph="Country Code (GH, NG, ZA, KE)" val={cCountry} set={setCCountry} max={2}/>
              <Field ph="Initial Deposit (optional)" val={cDep} set={setCDep} kb="decimal-pad"/>
              <Btn label={cLoading?'🔐 Generating Keys…':'🚀 Create Wallet'} onPress={doCreate} loading={cLoading}/>
              {created && (
                <View style={{backgroundColor:DARK,borderRadius:8,padding:12,marginTop:8,borderWidth:1,borderColor:GREEN+'44',gap:2}}>
                  <Text style={{fontSize:14,fontWeight:'700',color:GREEN,marginBottom:5,includeFontPadding:false as any}}>✅ Wallet Created!</Text>
                  <KV k="Account No." v={created.accountNumber}/>
                  <KV k="Address" v={created.address}/>
                  <KV k="Public Key" v={created.publicKey}/>
                  <KV k="Private Key" v={created.privateKey} hide/>
                  <KV k="Mnemonic" v={created.mnemonic} hide/>
                  <KV k="PIN" v={created.pin} hide/>
                  <KV k="Password" v={created.password} hide/>
                  <KV k="Balance" v={`${fmtN(created.balance)} BTNGG`}/>
                  <View style={{backgroundColor:'#8B000033',borderWidth:1,borderColor:'#ff000066',borderRadius:6,padding:9,marginTop:6}}>
                    <Text style={{fontSize:11,color:'#ff6b6b',lineHeight:15,includeFontPadding:false as any}}>⚠️ SAVE CREDENTIALS NOW — SHOWN ONLY ONCE. Never share your private key. Store mnemonic offline securely.</Text>
                  </View>
                </View>
              )}
            </Crd>
          </View>

          <View style={wide?{flex:1}:{}}>
            <Crd title="💼 Wallet Dashboard">
              <View style={{flexDirection:'row',gap:8,marginBottom:10}}>
                <TextInput style={[fi.f,{flex:1,marginVertical:0}]} placeholder="Account Number" placeholderTextColor={MUTED} value={lookAcct} onChangeText={setLookAcct} autoCapitalize="none" autoCorrect={false}/>
                <TouchableOpacity onPress={doLookup} style={{width:48,height:48,borderRadius:6,backgroundColor:GOLD,alignItems:'center',justifyContent:'center',marginTop:2}} activeOpacity={0.85}>
                  <MaterialIcons name="search" size={22} color="#1a1a2e"/>
                </TouchableOpacity>
              </View>
              {viewed ? (
                <>
                  <Text style={{fontSize:30,fontWeight:'700',color:GOLD,textAlign:'center',paddingVertical:10,includeFontPadding:false as any}}>{fmtN(viewed.balance)}</Text>
                  <Text style={{fontSize:12,color:MUTED,textAlign:'center',marginBottom:10,includeFontPadding:false as any}}>BTNGG Balance (Total Cover: $59.5T)</Text>
                  <View style={{backgroundColor:DARK,borderRadius:8,padding:12,gap:2,marginBottom:8}}>
                    <KV k="Address" v={viewed.address}/>
                    <KV k="Public Key" v={viewed.publicKey}/>
                    <KV k="Private Key" v={viewed.privateKey} hide/>
                    <KV k="Tx Count" v={String(viewed.transactions.length)}/>
                  </View>
                  {viewed.transactions.length>0 && (
                    <>
                      <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:5}}>
                        <Text style={{fontSize:11,color:MUTED,includeFontPadding:false as any}}>Recent Transactions</Text>
                        <Text style={{fontSize:11,color:MUTED,includeFontPadding:false as any}}>{viewed.transactions.length} total</Text>
                      </View>
                      <ScrollView style={{maxHeight:180}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {viewed.transactions.slice(0,10).map(tx=><TxCard key={tx.id} tx={tx}/>)}
                      </ScrollView>
                    </>
                  )}
                </>
              ) : (
                <View style={{alignItems:'center',paddingVertical:36,gap:10}}>
                  <MaterialIcons name="account-balance-wallet" size={44} color="#333"/>
                  <Text style={{fontSize:13,color:'#555',includeFontPadding:false as any}}>Enter an account number to view wallet</Text>
                </View>
              )}
            </Crd>
          </View>
        </View>

        {/* Send + Receive row */}
        <View style={wide?{flexDirection:'row',gap:14}:{}}>
          <View style={wide?{flex:1}:{}}>
            <Crd title="💰 Send Funds">
              <Field ph="Account Number" val={sAcct} set={setSAcct}/>
              <Field ph="Recipient Address" val={sTo} set={setSTo}/>
              <Field ph="Amount (BTNGG)" val={sAmt} set={setSAmt} kb="decimal-pad"/>
              <Field ph="Private Key" val={sKey} set={setSKey} sec/>
              {parseFloat(sAmt)>0 && (
                <View style={{backgroundColor:'#1a1a2e',borderRadius:6,paddingHorizontal:12,paddingVertical:7,marginVertical:3}}>
                  <Text style={{fontSize:11,color:'#ff9800',includeFontPadding:false as any}}>Fee: {fmtN(parseFloat(sAmt)*FEE)} BTNGG (0.1%) · Total: {fmtN(parseFloat(sAmt)*1.001)} BTNGG</Text>
                </View>
              )}
              <Btn label={sLoad?'Broadcasting…':'📤 Send Funds'} onPress={doSend} loading={sLoad} bg={RED} fg="#fff"/>
              {sTx && (
                <View style={{backgroundColor:DARK,borderRadius:8,padding:12,marginTop:6,borderWidth:1,borderColor:RED+'44',gap:2}}>
                  <Text style={{fontSize:13,fontWeight:'700',color:RED,marginBottom:5,includeFontPadding:false as any}}>✅ Sent!</Text>
                  <KV k="Tx ID" v={sTx.id}/><KV k="Amount" v={`${fmtN(sTx.amount)} BTNGG`}/><KV k="Fee" v={`${fmtN(sTx.fee)} BTNGG`}/><KV k="To" v={sTx.to}/><KV k="Signature" v={sTx.signature} hide/>
                </View>
              )}
            </Crd>
          </View>

          <View style={wide?{flex:1}:{}}>
            <Crd title="📥 Receive Funds">
              <Field ph="Account Number" val={rAcct} set={setRAcct}/>
              <Field ph="Sender Address" val={rFrom} set={setRFrom}/>
              <Field ph="Amount (BTNGG)" val={rAmt} set={setRAmt} kb="decimal-pad"/>
              <Btn label={rLoad?'Processing…':'📥 Receive Funds'} onPress={doReceive} loading={rLoad} bg={GREEN} fg="#fff"/>
              {rTx && (
                <View style={{backgroundColor:DARK,borderRadius:8,padding:12,marginTop:6,borderWidth:1,borderColor:GREEN+'44',gap:2}}>
                  <Text style={{fontSize:13,fontWeight:'700',color:GREEN,marginBottom:5,includeFontPadding:false as any}}>✅ Received!</Text>
                  <KV k="Tx ID" v={rTx.id}/><KV k="Amount" v={`+${fmtN(rTx.amount)} BTNGG`}/><KV k="From" v={rTx.from}/><KV k="Signature" v={rTx.signature} hide/>
                </View>
              )}
            </Crd>
          </View>
        </View>

        {/* Live Transactions Feed */}
        <Crd title="📊 Live Transactions">
          {feed.length===0 ? (
            <View style={{alignItems:'center',paddingVertical:28}}>
              <MaterialIcons name="receipt-long" size={36} color="#333"/>
              <Text style={{fontSize:13,color:'#555',marginTop:10,includeFontPadding:false as any}}>Waiting for transactions...</Text>
            </View>
          ) : (
            <ScrollView style={{maxHeight:400}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {feed.map(tx=><TxCard key={tx.id} tx={tx}/>)}
            </ScrollView>
          )}
        </Crd>
      </ScrollView>
    </View>
  );
}
