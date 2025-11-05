import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert amount to Korean notation (e.g., 10000 => "1만", 5000 => "5천")
function formatKoreanAmount(amount: number): string {
  if (amount === 0) return "";
  
  const man = Math.floor(amount / 10000);
  const cheon = Math.floor((amount % 10000) / 1000);
  
  let result = "";
  if (man > 0) {
    result += `${man}만`;
  }
  if (cheon > 0) {
    result += `${cheon}천`;
  }
  
  return result || `${amount}`;
}

// Format payment method for display
// Returns format like "현1만/카5천" for mixed payments
// For rental items (single payment), returns simple text like "현금", "카드", "이체"
export function formatPaymentMethod(
  paymentMethod?: 'card' | 'cash' | 'transfer',
  paymentCash?: number | null,
  paymentCard?: number | null,
  paymentTransfer?: number | null
): string {
  const parts: string[] = [];
  
  // Check if this is actually mixed payment data (has positive values)
  // Treat null and undefined the same way
  const cashVal = paymentCash ?? 0;
  const cardVal = paymentCard ?? 0;
  const transferVal = paymentTransfer ?? 0;
  
  const hasMixedPaymentData = cashVal > 0 || cardVal > 0 || transferVal > 0;
  
  if (hasMixedPaymentData) {
    // Include payment method with amounts for mixed payments
    if (cashVal > 0) {
      parts.push(`현${formatKoreanAmount(cashVal)}`);
    }
    if (cardVal > 0) {
      parts.push(`카${formatKoreanAmount(cardVal)}`);
    }
    if (transferVal > 0) {
      parts.push(`이${formatKoreanAmount(transferVal)}`);
    }
    
    // If all are 0, this is a free entry
    if (parts.length === 0) {
      return '무료';
    }
    
    return parts.join('/');
  }
  
  // Single payment method - return simple text
  switch (paymentMethod) {
    case 'cash': return '현금';
    case 'card': return '카드';
    case 'transfer': return '이체';
    default: return '현금';
  }
}
