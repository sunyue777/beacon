export const USD_FX_RATES = {
  USD: 1,
  SGD: 1.35,
  HKD: 7.8,
  JPY: 156
} as const;

export type SupportedCurrency = keyof typeof USD_FX_RATES;

export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return currency in USD_FX_RATES;
}

export function toUsd(value: number, currency: string) {
  return value / fxRate(currency);
}

export function fromUsd(value: number, currency: string) {
  return value * fxRate(currency);
}

export function roundCurrency(value: number, currency: string) {
  if (currency === "JPY") {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

function fxRate(currency: string) {
  return isSupportedCurrency(currency) ? USD_FX_RATES[currency] : 1;
}
