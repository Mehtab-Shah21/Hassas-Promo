import type { Business } from "../api/types";

// Mirrors backend/app/services/pdf.py's _currency_symbol() so the app UI and
// the generated PDF always agree on how a business's currency is labeled.
const SYMBOLS: Record<string, string> = {
  AED: "AED",
  SAR: "SAR",
  USD: "$",
  EUR: "€",
  GBP: "£",
  QAR: "QAR",
  KWD: "KWD",
  BHD: "BHD",
  OMR: "OMR",
};

export function currencyLabel(business: Pick<Business, "base_currency" | "currency_display"> | null | undefined): string {
  if (!business) return "";
  if (business.currency_display === "code") return business.base_currency;
  return SYMBOLS[business.base_currency] ?? business.base_currency;
}
