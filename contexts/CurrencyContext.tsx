import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AfricanCurrency, AFRICAN_CURRENCIES, DEFAULT_CURRENCY_CODE, formatLocalCurrency } from '@/constants/africanCurrencies';
import { useExchangeRateContext } from '@/contexts/ExchangeRateContext';

interface CurrencyContextType {
  selectedCurrency: AfricanCurrency;
  setCurrency: (code: string) => void;
  convertUSD: (usd: number) => string;
  convertUSDRaw: (usd: number) => number;
  /** Live usdRate for the selected currency */
  liveRate: number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [selectedCurrency, setSelectedCurrency] = useState<AfricanCurrency>(
    AFRICAN_CURRENCIES.find(c => c.code === DEFAULT_CURRENCY_CODE)!
  );

  const { getRate } = useExchangeRateContext();

  const setCurrency = (code: string) => {
    const found = AFRICAN_CURRENCIES.find(c => c.code === code && c.country);
    if (found) setSelectedCurrency(found);
  };

  // Use live rate if available, fall back to static
  const liveRate = getRate(selectedCurrency.code);

  // Build an ephemeral currency object with the live rate applied
  const liveCurrency: AfricanCurrency = { ...selectedCurrency, usdRate: liveRate };

  const convertUSD = (usd: number): string => {
    const amount = usd * liveRate;
    return formatLocalCurrency(amount, liveCurrency);
  };

  const convertUSDRaw = (usd: number): number => usd * liveRate;

  return (
    <CurrencyContext.Provider value={{ selectedCurrency: liveCurrency, setCurrency, convertUSD, convertUSDRaw, liveRate }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
