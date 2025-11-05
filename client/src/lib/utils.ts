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

// Combine two payment sets by summing matching payment methods
// Example: base (cash=10000, card=5000) + additional (card=5000) = (cash=10000, card=10000)
export function combinePayments(
  payment1: { cash?: number; card?: number; transfer?: number },
  payment2: { cash?: number; card?: number; transfer?: number }
): { cash?: number; card?: number; transfer?: number } {
  const cash1 = payment1.cash ?? 0;
  const card1 = payment1.card ?? 0;
  const transfer1 = payment1.transfer ?? 0;
  
  const cash2 = payment2.cash ?? 0;
  const card2 = payment2.card ?? 0;
  const transfer2 = payment2.transfer ?? 0;
  
  const result: { cash?: number; card?: number; transfer?: number } = {};
  
  const totalCash = cash1 + cash2;
  const totalCard = card1 + card2;
  const totalTransfer = transfer1 + transfer2;
  
  if (totalCash > 0) result.cash = totalCash;
  if (totalCard > 0) result.card = totalCard;
  if (totalTransfer > 0) result.transfer = totalTransfer;
  
  return result;
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
