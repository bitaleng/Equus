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
export function formatPaymentMethod(
  paymentMethod?: 'card' | 'cash' | 'transfer',
  paymentCash?: number,
  paymentCard?: number,
  paymentTransfer?: number
): string {
  const parts: string[] = [];
  
  // If mixed payment values exist, use them
  if (paymentCash || paymentCard || paymentTransfer) {
    if (paymentCash) {
      parts.push(`현${formatKoreanAmount(paymentCash)}`);
    }
    if (paymentCard) {
      parts.push(`카${formatKoreanAmount(paymentCard)}`);
    }
    if (paymentTransfer) {
      parts.push(`이${formatKoreanAmount(paymentTransfer)}`);
    }
    
    return parts.join('/');
  }
  
  // Fallback to legacy single payment method
  switch (paymentMethod) {
    case 'cash': return '현금';
    case 'card': return '카드';
    case 'transfer': return '이체';
    default: return '현금';
  }
}
