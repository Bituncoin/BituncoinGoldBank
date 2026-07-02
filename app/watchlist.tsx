import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { MiniChart } from '@/components';
import { COINS, CHART_POINTS_24H, PRICE_HISTORY_7D } from '@/constants/mockData';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';
import { ActivityIndicator } from 'react-native';

type TabType = 'watchlist' | 'alerts' | 'history';

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const {
    watchlist, alerts, alertHistory, activeNotification,
    addToWatchlist, removeFromWatchlist, isWatched,
    addAlert, removeAlert, dismissNotification, clearAlertHistory,
  } = useWatchlist();

  const { selectedCurrency, convertUSDRaw } = useCurrency();
  const { loading: ratesLoading, lastUpdated: ratesUpdated } = useExchangeRateContext();
  const showLocalConversion = selectedCurrency.code !== 'USD';
  const rateTimestamp = ratesUpdated
    ? ratesUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const [activeTab, setActiveTab] = useState<TabType>('watchlist');
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [showAddCoin, setShowAddCoin] = useState(false);
  const [alertCoin, setAlertCoin] = useState(COINS[0]);
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertPrice, setAlertPrice] = useState('');

  // Notification slide-in animation
  const notifAnim = useRef(new Animated.Value(-120)).current;
  const notifOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (activeNotification) {
      Animated.parallel([
        Animated.spring(notifAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(notifOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      // Auto-dismiss after 5s
      const t = setTimeout(() => handleDismissNotif(), 5000);
      return () => clearTimeout(t);
    }
  }, [activeNotification]);

  const handleDismissNotif = () => {
    Animated.parallel([
      Animated.timing(notifAnim, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(notifOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => dismissNotification());
  };

  const watchedCoins = COINS.filter(c => isWatched(c.id));
  const unwatchedCoins = COINS.filter(c => !isWatched(c.id));

  const handleAddAlert = () => {
    const price = parseFloat(alertPrice);
    if (!price || price <= 0) {
      showAlert('Invalid Price', 'Please enter a valid target price.');
      return;
    }
    addAlert(alertCoin.id, alertCondition, price);
    setAlertPrice('');
    setShowAddAlert(false);
    showAlert('Alert Set', `You will be notified when ${alertCoin.symbol} goes ${alertCondition} $${price.toLocaleString()}.`);
  };

  const handleRemoveAlert = (alertId: string, symbol: string) => {
    showAlert('Remove Alert', `Delete price alert for ${symbol}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeAlert(alertId) },
    ]);
  };

  const handleRemoveFromWatchlist = (coinId: string, symbol: string) => {
    showAlert('Remove', `Remove ${symbol} from your watchlist?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFromWatchlist(coinId) },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Floating Price Alert Notification */}
      {activeNotification ? (
        <Animated.View style={[
          styles.notifToast,
          { top: insets.top + Spacing.sm },
          { transform: [{ translateY: notifAnim }], opacity: notifOpacity },
        ]}>
          <View style={styles.notifIcon}>
            <Text style={styles.notifCoinLogo}>{activeNotification.coinLogo}</Text>
          </View>
          <View style={styles.notifBody}>
            <Text style={styles.notifTitle}>Price Alert Triggered!</Text>
            <Text style={styles.notifMsg}>
              {activeNotification.coinSymbol} is {activeNotification.condition === 'above' ? 'above' : 'below'}{' '}
              ${activeNotification.targetPrice.toLocaleString()}
            </Text>
            <Text style={styles.notifPrice}>Now: ${activeNotification.currentPrice.toLocaleString()}</Text>
          </View>
          <TouchableOpacity onPress={handleDismissNotif} style={styles.notifClose}>
            <MaterialIcons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Watchlist</Text>
          <Text style={styles.subtitle}>{watchedCoins.length} coins tracked</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => activeTab === 'alerts' ? setShowAddAlert(true) : setShowAddCoin(true)}
        >
          <MaterialIcons name="add" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Live Rate Pill */}
      {showLocalConversion && (
        <View style={styles.liveRateBar}>
          <Text style={styles.liveRateBarLabel}>
            Prices in {selectedCurrency.flag} {selectedCurrency.code}
          </Text>
          <View style={styles.liveRatePill}>
            {ratesLoading ? (
              <ActivityIndicator size="small" color={Colors.success} style={{ transform: [{ scale: 0.55 }] }} />
            ) : (
              <View style={styles.liveDot} />
            )}
            <Text style={styles.liveRateText}>
              {rateTimestamp ? `Live · ${rateTimestamp}` : 'Live'}
            </Text>
          </View>
        </View>
      )}

      {/* Summary Strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryVal}>{watchedCoins.length}</Text>
          <Text style={styles.summaryLabel}>Watching</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={styles.summaryVal}>{alerts.filter(a => a.status === 'active').length}</Text>
          <Text style={styles.summaryLabel}>Active Alerts</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={styles.summaryVal}>{alertHistory.length}</Text>
          <Text style={styles.summaryLabel}>Triggered</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={[styles.summaryVal, { color: Colors.success }]}>
            {watchedCoins.filter(c => c.change24h > 0).length}↑
          </Text>
          <Text style={styles.summaryLabel}>Gaining</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['watchlist', 'alerts', 'history'] as TabType[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'watchlist' ? 'Watchlist' : t === 'alerts' ? 'Price Alerts' : 'History'}
            </Text>
            {t === 'alerts' && alerts.filter(a => a.status === 'active').length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{alerts.filter(a => a.status === 'active').length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ─── WATCHLIST TAB ─── */}
        {activeTab === 'watchlist' && (
          <>
            {watchedCoins.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="bookmark-border" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No coins watched</Text>
                <Text style={styles.emptyDesc}>Tap + to add coins to your watchlist and track their performance.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddCoin(true)}>
                  <MaterialIcons name="add" size={16} color={Colors.bg} />
                  <Text style={styles.emptyBtnText}>Add Coins</Text>
                </TouchableOpacity>
              </View>
            ) : (
              watchedCoins.map(coin => {
                const isPos = coin.change24h >= 0;
                const chartData = coin.id === 'btng' ? PRICE_HISTORY_7D : CHART_POINTS_24H.map(p => p * (coin.price / 4.72));
                return (
                  <TouchableOpacity
                    key={coin.id}
                    style={styles.watchCard}
                    activeOpacity={0.82}
                    onPress={() => router.push('/trade')}
                  >
                    {/* Left: Coin info */}
                    <View style={styles.watchLeft}>
                      <View style={[styles.coinLogoCircle, { borderColor: coin.color + '66' }]}>
                        <Text style={[styles.coinLogoText, { color: coin.color }]}>{coin.logo}</Text>
                      </View>
                      <View style={styles.watchInfo}>
                        <View style={styles.watchNameRow}>
                          <Text style={styles.watchSymbol}>{coin.symbol}</Text>
                          <MaterialIcons name="trending-up" size={12} color={isPos ? Colors.success : Colors.error}
                            style={{ transform: [{ scaleY: isPos ? 1 : -1 }] }} />
                        </View>
                        <Text style={styles.watchName}>{coin.name}</Text>
                        {coin.isOwned && (
                          <Text style={styles.watchBalance}>{coin.balance} {coin.symbol}</Text>
                        )}
                      </View>
                    </View>

                    {/* Center: Mini chart */}
                    <View style={styles.watchChart}>
                      <MiniChart
                        data={chartData}
                        width={80}
                        height={40}
                        color={isPos ? Colors.success : Colors.error}
                        showFill={false}
                      />
                    </View>

                    {/* Right: Price + actions */}
                    <View style={styles.watchRight}>
                      <Text style={styles.watchPrice}>
                        ${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(3)}
                      </Text>
                      {showLocalConversion && (() => {
                        const localPrice = convertUSDRaw(coin.price);
                        return (
                          <View style={styles.localPriceBadge}>
                            <Text style={styles.localPriceFlag}>{selectedCurrency.flag}</Text>
                            <Text style={styles.localPriceText}>
                              {selectedCurrency.symbol}{localPrice >= 1000
                                ? localPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })
                                : localPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                          </View>
                        );
                      })()}
                      <View style={[styles.changePill, { backgroundColor: isPos ? Colors.successBg : Colors.errorBg }]}>
                        <Text style={[styles.changeText, { color: isPos ? Colors.success : Colors.error }]}>
                          {isPos ? '+' : ''}{coin.change24h.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={styles.watchActions}>
                        <TouchableOpacity
                          style={styles.watchActionBtn}
                          onPress={() => { setAlertCoin(coin); setShowAddAlert(true); }}
                        >
                          <MaterialIcons name="notifications-none" size={14} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.watchActionBtn}
                          onPress={() => handleRemoveFromWatchlist(coin.id, coin.symbol)}
                        >
                          <MaterialIcons name="bookmark" size={14} color={Colors.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* Add More section */}
            {unwatchedCoins.length > 0 && watchedCoins.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Add More Coins</Text>
                <View style={styles.addMoreGrid}>
                  {unwatchedCoins.map(coin => (
                    <TouchableOpacity
                      key={coin.id}
                      style={styles.addCoinChip}
                      onPress={() => addToWatchlist(coin.id)}
                    >
                      <Text style={[styles.addCoinLogo, { color: coin.color }]}>{coin.logo}</Text>
                      <Text style={styles.addCoinSymbol}>{coin.symbol}</Text>
                      <MaterialIcons name="add" size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* ─── ALERTS TAB ─── */}
        {activeTab === 'alerts' && (
          <>
            <TouchableOpacity style={styles.createAlertBanner} onPress={() => setShowAddAlert(true)} activeOpacity={0.85}>
              <View style={styles.createAlertIcon}>
                <MaterialIcons name="add-alert" size={22} color={Colors.primary} />
              </View>
              <View style={styles.createAlertInfo}>
                <Text style={styles.createAlertTitle}>Create Price Alert</Text>
                <Text style={styles.createAlertDesc}>Get notified when any coin hits your target price</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={Colors.primary} />
            </TouchableOpacity>

            {alerts.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="notifications-off" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No alerts set</Text>
                <Text style={styles.emptyDesc}>Set price alerts to be notified when coins reach your target price.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Active Alerts ({alerts.filter(a => a.status === 'active').length})</Text>
                {alerts.filter(a => a.status === 'active').map(alert => {
                  const coin = COINS.find(c => c.id === alert.coinId);
                  if (!coin) return null;
                  const dist = ((alert.targetPrice - coin.price) / coin.price) * 100;
                  const isAbove = alert.condition === 'above';
                  return (
                    <View key={alert.id} style={styles.alertCard}>
                      <View style={[styles.alertIconWrap, { backgroundColor: isAbove ? Colors.successBg : Colors.errorBg }]}>
                        <MaterialIcons
                          name={isAbove ? 'arrow-upward' : 'arrow-downward'}
                          size={18}
                          color={isAbove ? Colors.success : Colors.error}
                        />
                      </View>
                      <View style={styles.alertInfo}>
                        <View style={styles.alertNameRow}>
                          <Text style={[styles.alertCoinLogo, { color: coin.color }]}>{coin.logo}</Text>
                          <Text style={styles.alertCoinName}>{alert.coinSymbol}</Text>
                          <View style={[styles.alertCondBadge, {
                            backgroundColor: isAbove ? Colors.successBg : Colors.errorBg,
                            borderColor: isAbove ? Colors.success + '44' : Colors.error + '44',
                          }]}>
                            <Text style={[styles.alertCondText, { color: isAbove ? Colors.success : Colors.error }]}>
                              {isAbove ? '▲ Above' : '▼ Below'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.alertTarget}>
                          Target: <Text style={styles.alertTargetVal}>${alert.targetPrice.toLocaleString()}</Text>
                        </Text>
                        <Text style={styles.alertCurrent}>
                          Current: ${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(3)}
                          {'  '}
                          <Text style={{ color: Math.abs(dist) < 5 ? Colors.warning : Colors.textMuted }}>
                            ({dist > 0 ? '+' : ''}{dist.toFixed(1)}% away)
                          </Text>
                        </Text>
                        <Text style={styles.alertDate}>Set {alert.createdAt}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.alertDeleteBtn}
                        onPress={() => handleRemoveAlert(alert.id, alert.coinSymbol)}
                      >
                        <MaterialIcons name="delete-outline" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {alerts.filter(a => a.status === 'triggered').length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Triggered Alerts</Text>
                    {alerts.filter(a => a.status === 'triggered').map(alert => (
                      <View key={alert.id} style={[styles.alertCard, styles.alertCardTriggered]}>
                        <View style={[styles.alertIconWrap, { backgroundColor: Colors.primaryGlow }]}>
                          <MaterialIcons name="check" size={18} color={Colors.primary} />
                        </View>
                        <View style={styles.alertInfo}>
                          <Text style={styles.alertCoinName}>{alert.coinSymbol} — {alert.condition} ${alert.targetPrice}</Text>
                          <Text style={styles.alertDate}>Triggered {alert.triggeredAt}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.alertDeleteBtn}
                          onPress={() => removeAlert(alert.id)}
                        >
                          <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ─── HISTORY TAB ─── */}
        {activeTab === 'history' && (
          <>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionLabel}>Alert History ({alertHistory.length})</Text>
              {alertHistory.length > 0 && (
                <TouchableOpacity onPress={() => showAlert('Clear History', 'Remove all alert history?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear All', style: 'destructive', onPress: clearAlertHistory },
                ])}>
                  <Text style={styles.clearBtn}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            {alertHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="history" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No alert history</Text>
                <Text style={styles.emptyDesc}>Triggered price alerts will appear here.</Text>
              </View>
            ) : (
              alertHistory.map(h => {
                const isAbove = h.condition === 'above';
                return (
                  <View key={h.id} style={styles.historyCard}>
                    <View style={[styles.historyIconWrap, { backgroundColor: Colors.primaryGlow }]}>
                      <Text style={styles.historyLogo}>{h.coinLogo}</Text>
                    </View>
                    <View style={styles.historyInfo}>
                      <View style={styles.historyNameRow}>
                        <Text style={styles.historySymbol}>{h.coinSymbol}</Text>
                        <View style={[styles.historyCondBadge, {
                          backgroundColor: isAbove ? Colors.successBg : Colors.errorBg,
                        }]}>
                          <Text style={[styles.historyCondText, { color: isAbove ? Colors.success : Colors.error }]}>
                            {isAbove ? '▲ Above' : '▼ Below'} ${h.targetPrice.toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.historyPrice}>
                        Hit ${h.currentPrice.toLocaleString()} — target ${h.targetPrice.toLocaleString()}
                      </Text>
                      <Text style={styles.historyDate}>{h.triggeredAt}</Text>
                    </View>
                    <View style={[styles.historyTriggered, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <MaterialIcons name="notifications-active" size={14} color={Colors.primary} />
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ─── ADD ALERT MODAL ─── */}
      <Modal visible={showAddAlert} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddAlert(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Set Price Alert</Text>

            {/* Coin Selector */}
            <Text style={styles.modalLabel}>Coin</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coinPickerScroll} contentContainerStyle={styles.coinPickerContent}>
              {COINS.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.coinPickChip, alertCoin.id === c.id && styles.coinPickChipActive]}
                  onPress={() => setAlertCoin(c)}
                >
                  <Text style={[styles.coinPickLogo, { color: c.color }]}>{c.logo}</Text>
                  <Text style={[styles.coinPickText, alertCoin.id === c.id && { color: Colors.bg }]}>{c.symbol}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Current Price Info */}
            <View style={styles.currentPriceRow}>
              <Text style={styles.modalLabel}>Current Price</Text>
              <Text style={[styles.modalCurrent, { color: Colors.primary }]}>
                ${alertCoin.price >= 1000 ? alertCoin.price.toLocaleString() : alertCoin.price.toFixed(4)}
              </Text>
            </View>

            {/* Condition */}
            <Text style={styles.modalLabel}>Condition</Text>
            <View style={styles.condRow}>
              <TouchableOpacity
                style={[styles.condBtn, alertCondition === 'above' && styles.condBtnActive]}
                onPress={() => setAlertCondition('above')}
              >
                <MaterialIcons name="arrow-upward" size={16} color={alertCondition === 'above' ? Colors.bg : Colors.success} />
                <Text style={[styles.condText, alertCondition === 'above' && { color: Colors.bg }]}>Price Goes Above</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.condBtn, alertCondition === 'below' && styles.condBtnBelowActive]}
                onPress={() => setAlertCondition('below')}
              >
                <MaterialIcons name="arrow-downward" size={16} color={alertCondition === 'below' ? Colors.bg : Colors.error} />
                <Text style={[styles.condText, alertCondition === 'below' && { color: Colors.bg }]}>Price Goes Below</Text>
              </TouchableOpacity>
            </View>

            {/* Target Price */}
            <Text style={styles.modalLabel}>Target Price (USD)</Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.priceInputDollar}>$</Text>
              <TextInput
                style={styles.priceInput}
                value={alertPrice}
                onChangeText={setAlertPrice}
                placeholder={alertCoin.price >= 1000 ? alertCoin.price.toLocaleString() : alertCoin.price.toFixed(3)}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                autoFocus
              />
            </View>

            {/* Quick presets */}
            <View style={styles.presets}>
              {[-10, -5, +5, +10].map(pct => {
                const preset = alertCoin.price * (1 + pct / 100);
                return (
                  <TouchableOpacity key={pct} style={styles.presetBtn} onPress={() => setAlertPrice(
                    preset >= 1000 ? preset.toFixed(0) : preset.toFixed(3)
                  )}>
                    <Text style={[styles.presetText, { color: pct < 0 ? Colors.error : Colors.success }]}>
                      {pct > 0 ? '+' : ''}{pct}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleAddAlert}>
              <MaterialIcons name="add-alert" size={18} color={Colors.bg} />
              <Text style={styles.modalConfirmText}>Set Alert</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── ADD COIN MODAL ─── */}
      <Modal visible={showAddCoin} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddCoin(false)} />
        <View style={[styles.modalSheet, { maxHeight: '60%' }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Add to Watchlist</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {COINS.map(coin => {
              const watched = isWatched(coin.id);
              return (
                <TouchableOpacity
                  key={coin.id}
                  style={styles.coinPickRow}
                  onPress={() => {
                    watched ? removeFromWatchlist(coin.id) : addToWatchlist(coin.id);
                  }}
                >
                  <View style={[styles.coinPickCircle, { borderColor: coin.color + '66' }]}>
                    <Text style={[styles.coinPickCircleLogo, { color: coin.color }]}>{coin.logo}</Text>
                  </View>
                  <View style={styles.coinPickInfo}>
                    <Text style={styles.coinPickSymbol}>{coin.symbol}</Text>
                    <Text style={styles.coinPickName}>{coin.name}</Text>
                  </View>
                  <Text style={styles.coinPickPrice}>
                    ${coin.price >= 1000 ? coin.price.toLocaleString() : coin.price.toFixed(3)}
                  </Text>
                  <View style={[styles.bookmarkIcon, watched && styles.bookmarkIconActive]}>
                    <MaterialIcons
                      name={watched ? 'bookmark' : 'bookmark-border'}
                      size={20}
                      color={watched ? Colors.primary : Colors.textMuted}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // Notification Toast
  notifToast: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 999,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCoinLogo: { fontSize: 22 },
  notifBody: { flex: 1, gap: 2 },
  notifTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  notifMsg: { fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  notifPrice: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  notifClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, textAlign: 'center', includeFontPadding: false },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  // Summary Strip
  summaryStrip: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  summaryStat: { flex: 1, alignItems: 'center', gap: 3 },
  summaryVal: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  summaryDivider: { width: 1, backgroundColor: Colors.border },

  // Tabs
  tabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  tab: { flex: 1, paddingVertical: Spacing.sm + 2, alignItems: 'center', borderRadius: Radius.md, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive: { color: Colors.bg },
  tabBadge: { backgroundColor: Colors.error, borderRadius: Radius.full, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, color: '#fff', fontWeight: FontWeight.bold, includeFontPadding: false },

  scrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },

  // Live rate bar
  liveRateBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: Spacing.xl, marginBottom: Spacing.sm,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.border,
  },
  liveRateBarLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  liveRatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveRateText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  // Local price badge on watch card
  localPriceBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '33' },
  localPriceFlag: { fontSize: 11 },
  localPriceText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Watch Cards
  watchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  watchLeft: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coinLogoCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bgElevated, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  coinLogoText: { fontSize: 20 },
  watchInfo: { flex: 1, gap: 2 },
  watchNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  watchSymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  watchName: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  watchBalance: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium, includeFontPadding: false },
  watchChart: { flex: 1.5, alignItems: 'center' },
  watchRight: { flex: 1.5, alignItems: 'flex-end', gap: 4 },
  watchPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  changePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  changeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  watchActions: { flexDirection: 'row', gap: 6 },
  watchActionBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },

  // Add More
  sectionLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.5, paddingTop: Spacing.sm, includeFontPadding: false },
  addMoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  addCoinChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  addCoinLogo: { fontSize: 16 },
  addCoinSymbol: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, includeFontPadding: false, maxWidth: 260 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  emptyBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Alert Cards
  createAlertBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44', gap: Spacing.md },
  createAlertIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  createAlertInfo: { flex: 1, gap: 3 },
  createAlertTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  createAlertDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  alertCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  alertCardTriggered: { opacity: 0.65 },
  alertIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  alertInfo: { flex: 1, gap: 3 },
  alertNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  alertCoinLogo: { fontSize: 16 },
  alertCoinName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  alertCondBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  alertCondText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  alertTarget: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  alertTargetVal: { fontWeight: FontWeight.bold, color: Colors.textPrimary },
  alertCurrent: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  alertDate: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  alertDeleteBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.errorBg, alignItems: 'center', justifyContent: 'center' },

  // History
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.sm },
  clearBtn: { fontSize: FontSize.sm, color: Colors.error, fontWeight: FontWeight.semibold, includeFontPadding: false },
  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  historyIconWrap: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  historyLogo: { fontSize: 22 },
  historyInfo: { flex: 1, gap: 3 },
  historyNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  historySymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  historyCondBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  historyCondText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  historyPrice: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  historyDate: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  historyTriggered: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  // Modals
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,6,8,0.75)' },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  modalCurrent: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  currentPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  coinPickerScroll: { marginHorizontal: -Spacing.xl },
  coinPickerContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  coinPickChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  coinPickChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  coinPickLogo: { fontSize: 16 },
  coinPickText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  condRow: { flexDirection: 'row', gap: Spacing.sm },
  condBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.lg, paddingVertical: Spacing.md, borderWidth: 1, borderColor: Colors.success + '44' },
  condBtnActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  condBtnBelowActive: { backgroundColor: Colors.error, borderColor: Colors.error },
  condText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },

  priceInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 56 },
  priceInputDollar: { fontSize: FontSize.xl, color: Colors.primary, fontWeight: FontWeight.bold, marginRight: 6, includeFontPadding: false },
  priceInput: { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },

  presets: { flexDirection: 'row', gap: Spacing.sm },
  presetBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  presetText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },

  modalConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md + 4, marginTop: Spacing.sm },
  modalConfirmText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Add Coin Modal
  coinPickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 4, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md },
  coinPickCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bgElevated, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  coinPickCircleLogo: { fontSize: 20 },
  coinPickInfo: { flex: 1, gap: 2 },
  coinPickSymbol: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  coinPickName: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  coinPickPrice: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  bookmarkIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  bookmarkIconActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
});
