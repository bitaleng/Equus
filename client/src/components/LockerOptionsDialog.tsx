import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { calculateAdditionalFee, getBusinessDay } from "@shared/businessDay";
import * as localDb from "@/lib/localDb";
import { useToast } from "@/hooks/use-toast";

interface RentalItemInfo {
  itemId: string;
  itemName: string;
  rentalFee: number;
  depositAmount: number;
  depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
  paymentMethod: 'cash' | 'card' | 'transfer';
}

interface LockerOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  lockerNumber: number;
  basePrice: number;
  timeType: '주간' | '야간';
  entryTime?: string;
  currentNotes?: string;
  currentPaymentMethod?: 'card' | 'cash' | 'transfer';
  currentPaymentCash?: number;
  currentPaymentCard?: number;
  currentPaymentTransfer?: number;
  currentOptionType?: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price';
  currentOptionAmount?: number;
  currentFinalPrice?: number;
  discountAmount?: number;
  foreignerPrice?: number;
  isInUse?: boolean;
  dayPrice?: number;
  nightPrice?: number;
  currentLockerLogId?: string;
  currentDeferredPayment?: boolean; // 현재 후불결제 상태
  currentCustomerMemo?: string; // 현재 손님 메모
  onApply: (option: string, customAmount?: number, notes?: string, paymentMethod?: 'card' | 'cash' | 'transfer', rentalItems?: RentalItemInfo[], paymentCash?: number, paymentCard?: number, paymentTransfer?: number, deferredPayment?: boolean, customerMemo?: string) => void;
  onCheckout: (
    paymentMethod: 'card' | 'cash' | 'transfer', 
    rentalItems?: RentalItemInfo[], 
    paymentCash?: number, 
    paymentCard?: number, 
    paymentTransfer?: number,
    additionalFeePayment?: {
      method: 'card' | 'cash' | 'transfer';
      cash?: number;
      card?: number;
      transfer?: number;
      discount?: number;
    }
  ) => void;
  onCancel: () => void;
  onSwap?: (fromLocker: number, toLocker: number) => void;
  onPaymentComplete?: () => void; // 후불결제 완료 시 데이터 새로고침용 콜백
}

export default function LockerOptionsDialog({
  open,
  onClose,
  lockerNumber,
  basePrice,
  timeType,
  entryTime,
  currentNotes = "",
  currentPaymentMethod = 'cash',
  currentPaymentCash,
  currentPaymentCard,
  currentPaymentTransfer,
  currentOptionType = 'none',
  currentOptionAmount,
  currentFinalPrice,
  discountAmount = 2000,
  foreignerPrice = 25000,
  isInUse = false,
  dayPrice = 10000,
  nightPrice = 15000,
  currentLockerLogId,
  currentDeferredPayment = false, // 현재 후불결제 상태
  currentCustomerMemo = "", // 현재 손님 메모
  onApply,
  onCheckout,
  onCancel,
  onSwap,
  onPaymentComplete,
}: LockerOptionsDialogProps) {
  // Load settings
  const settings = localDb.getSettings();
  const domesticCheckpointHour = settings.domesticCheckpointHour;
  const foreignerAdditionalFeePeriod = settings.foreignerAdditionalFeePeriod;
  const [discountOption, setDiscountOption] = useState<string>("none");
  const [discountInputAmount, setDiscountInputAmount] = useState<string>("");
  const [isForeigner, setIsForeigner] = useState(false);
  const [isDirectPrice, setIsDirectPrice] = useState(false);
  const [directPrice, setDirectPrice] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'transfer' | null>(isInUse ? currentPaymentMethod : null);
  const [paymentCash, setPaymentCash] = useState<string>("");
  const [paymentCard, setPaymentCard] = useState<string>("");
  const [paymentTransfer, setPaymentTransfer] = useState<string>("");
  const [useSplitPayment, setUseSplitPayment] = useState(false);
  const [isDeferredPayment, setIsDeferredPayment] = useState(false); // 후불결제 여부 (신규 입실용)
  const [isCurrentlyDeferred, setIsCurrentlyDeferred] = useState(false); // 현재 락카의 후불결제 상태 (기존 입실용)
  const [customerMemo, setCustomerMemo] = useState(""); // 손님 메모
  
  // Additional fee payment states
  const [additionalFeePaymentMethod, setAdditionalFeePaymentMethod] = useState<'card' | 'cash' | 'transfer'>('cash');
  const [additionalFeePaymentCash, setAdditionalFeePaymentCash] = useState<string>("");
  const [additionalFeePaymentCard, setAdditionalFeePaymentCard] = useState<string>("");
  const [additionalFeePaymentTransfer, setAdditionalFeePaymentTransfer] = useState<string>("");
  const [useAdditionalFeeSplitPayment, setUseAdditionalFeeSplitPayment] = useState(false);
  const [additionalFeeDiscount, setAdditionalFeeDiscount] = useState<string>("");
  const [additionalFeeFullDiscount, setAdditionalFeeFullDiscount] = useState(false); // 전액 할인
  const [additionalFeePartialDiscount, setAdditionalFeePartialDiscount] = useState(false); // 일부 할인
  const [additionalFeeResolved, setAdditionalFeeResolved] = useState(false); // 추가요금 완납 처리
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [showWarningAlert, setShowWarningAlert] = useState(false);
  const [checkoutResolved, setCheckoutResolved] = useState(false);
  
  // Locker swap states
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapTargetLocker, setSwapTargetLocker] = useState<string>("");
  const [showSwapConfirm, setShowSwapConfirm] = useState(false);
  const [swapInfo, setSwapInfo] = useState<{ targetLocker: number; willSwap: boolean } | null>(null);
  
  // Locker linking states
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedChildLockers, setSelectedChildLockers] = useState<Set<number>>(new Set());
  const [showLinkConfirm, setShowLinkConfirm] = useState(false);
  
  // Parent locker change/unlink states
  const [parentLockerNumber, setParentLockerNumber] = useState<number | null>(null);
  const [showChangeParentDialog, setShowChangeParentDialog] = useState(false);
  const [newParentLocker, setNewParentLocker] = useState<string>("");
  const [showChangeParentConfirm, setShowChangeParentConfirm] = useState(false);
  const [unlinkMode, setUnlinkMode] = useState(false); // true = unlink, false = change parent
  
  // Rental items state (담요, 롱타올) - legacy
  const [hasBlanket, setHasBlanket] = useState(false);
  const [hasLongTowel, setHasLongTowel] = useState(false);
  
  // Dynamic rental items from database
  const [availableRentalItems, setAvailableRentalItems] = useState<any[]>([]);
  const [selectedRentalItems, setSelectedRentalItems] = useState<Set<string>>(new Set());
  const [depositStatuses, setDepositStatuses] = useState<Map<string, 'received' | 'refunded' | 'forfeited' | 'none'>>(new Map());
  const [rentalPaymentMethods, setRentalPaymentMethods] = useState<Map<string, 'cash' | 'card' | 'transfer'>>(new Map());
  const [currentRentalTransactions, setCurrentRentalTransactions] = useState<any[]>([]);
  const [returnCompletedItems, setReturnCompletedItems] = useState<Set<string>>(new Set());
  
  // Track if this is initial open (to show warning once per dialog open)
  const initialOpenRef = useRef(false);
  const previousLockerRef = useRef<number | null>(null);
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  
  // Auto-adjust memo textarea height
  useEffect(() => {
    if (memoTextareaRef.current) {
      memoTextareaRef.current.style.height = 'auto';
      memoTextareaRef.current.style.height = Math.max(60, memoTextareaRef.current.scrollHeight) + 'px';
    }
  }, [customerMemo]);

  // Reset checkoutResolved and additional fee discount when dialog opens
  useEffect(() => {
    if (open) {
      setCheckoutResolved(false);
      setAdditionalFeeResolved(false);
      setAdditionalFeeFullDiscount(false);
      setAdditionalFeePartialDiscount(false);
      setAdditionalFeeDiscount("");
      initialOpenRef.current = true;
    }
  }, [open]);
  
  // Initialize payment fields when dialog opens
  useEffect(() => {
    if (open) {
      // Calculate final price for auto-fill
      const computedFinalPrice = currentFinalPrice || basePrice;
      
      // Load existing payment data if available (check for undefined, not truthy)
      // This allows 0 values to be preserved
      const hasExistingData = currentPaymentCash !== undefined || 
                             currentPaymentCard !== undefined || 
                             currentPaymentTransfer !== undefined;
      
      if (hasExistingData) {
        // Check if this is a split payment (multiple payment methods used)
        const paymentCount = [
          currentPaymentCash && currentPaymentCash > 0,
          currentPaymentCard && currentPaymentCard > 0,
          currentPaymentTransfer && currentPaymentTransfer > 0,
        ].filter(Boolean).length;
        
        setUseSplitPayment(paymentCount > 1);
        setPaymentCash(currentPaymentCash !== undefined ? String(currentPaymentCash) : "");
        setPaymentCard(currentPaymentCard !== undefined ? String(currentPaymentCard) : "");
        setPaymentTransfer(currentPaymentTransfer !== undefined ? String(currentPaymentTransfer) : "");
      } else {
        // For new entries, default to single payment method (no split payment)
        setUseSplitPayment(false);
        setPaymentCash("");
        setPaymentCard("");
        setPaymentTransfer("");
      }
    }
  }, [open, currentPaymentCash, currentPaymentCard, currentPaymentTransfer, currentFinalPrice, basePrice]);

  // Load rental items from database on mount
  useEffect(() => {
    // Reload rental items whenever dialog opens
    if (open) {
      const items = localDb.getAdditionalRevenueItems();
      setAvailableRentalItems(items);
      
      // Load current rental transactions if locker is in use
      if (isInUse && currentLockerLogId) {
        const rentals = localDb.getRentalTransactionsByLockerLog(currentLockerLogId);
        setCurrentRentalTransactions(rentals);
        
        // Auto-select checkboxes for existing rental items
        const newSelected = new Set<string>();
        const newStatuses = new Map<string, 'received' | 'refunded' | 'forfeited'>();
        const newPaymentMethods = new Map<string, 'cash' | 'card' | 'transfer'>();
        const newReturnCompleted = new Set<string>();
        
        rentals.forEach(txn => {
          newSelected.add(txn.itemId);
          newStatuses.set(txn.itemId, txn.depositStatus);
          newPaymentMethods.set(txn.itemId, txn.paymentMethod || 'cash');
          // Load return_completed status
          if (txn.return_completed === 1 || txn.returnCompleted === 1) {
            newReturnCompleted.add(txn.itemId);
          }
        });
        
        setSelectedRentalItems(newSelected);
        setDepositStatuses(newStatuses);
        setRentalPaymentMethods(newPaymentMethods);
        setReturnCompletedItems(newReturnCompleted);
        
        // Auto-show warning alert if there are rental items or additional fees
        // Only show once when dialog first opens
        if (initialOpenRef.current && !checkoutResolved && entryTime) {
          // 반납완료되지 않은 대여품목만 체크
          const unresolvedRentals = rentals.filter(txn => 
            txn.return_completed !== 1 && txn.returnCompleted !== 1
          );
          const hasRentalItems = unresolvedRentals.length > 0;
          
          // Calculate additional fee to check if there are additional charges
          const isCurrentlyForeigner = currentOptionType === 'foreigner';
          const additionalFeeCalc = calculateAdditionalFee(
            entryTime, 
            timeType, 
            dayPrice, 
            nightPrice, 
            new Date(), 
            isCurrentlyForeigner, 
            foreignerPrice,
            domesticCheckpointHour,
            foreignerAdditionalFeePeriod
          );
          const hasAdditionalFee = additionalFeeCalc.additionalFee > 0;
          
          if (hasRentalItems || hasAdditionalFee) {
            // Play emergency alert sound
            playEmergencySound();
            
            // Delay to allow dialog to fully open first
            setTimeout(() => {
              setShowWarningAlert(true);
              initialOpenRef.current = false; // Mark as shown
            }, 300);
          } else {
            initialOpenRef.current = false;
          }
        }
      } else {
        setCurrentRentalTransactions([]);
        setSelectedRentalItems(new Set());
        setDepositStatuses(new Map());
        setRentalPaymentMethods(new Map());
      }
    }
  }, [open, isInUse, currentLockerLogId, lockerNumber, entryTime, timeType, dayPrice, nightPrice, foreignerPrice, currentOptionType, checkoutResolved]);

  // Load parent locker info and deferred payment status when dialog opens
  useEffect(() => {
    if (open && isInUse) {
      const lockerLog = localDb.getActiveLockers().find(log => log.lockerNumber === lockerNumber);
      if (lockerLog) {
        // 부모 락카 정보
        if (lockerLog.parentLocker) {
          setParentLockerNumber(lockerLog.parentLocker);
        } else {
          setParentLockerNumber(null);
        }
        // 후불결제 상태 로드
        setIsCurrentlyDeferred((lockerLog as any).deferredPayment || false);
      } else {
        setParentLockerNumber(null);
        setIsCurrentlyDeferred(false);
      }
    } else if (!isInUse) {
      setIsCurrentlyDeferred(false);
    }
  }, [open, isInUse, lockerNumber]);

  // Play click sound
  const playClickSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRhIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQA=');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (error) {
      console.error('Failed to play click sound:', error);
    }
  };

  // Play close sound
  const playCloseSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.error('Failed to play close sound:', error);
    }
  };

  // Play emergency alert sound
  const playEmergencySound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 1000; // 1000 Hz alert tone
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // Play twice for emphasis
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1200;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.5);
      }, 200);
    } catch (error) {
      console.error('Failed to play emergency sound:', error);
    }
  };

  // Initialize state from current option data when dialog opens or closes
  useEffect(() => {
    if (open) {
      // For existing entries (isInUse), use current payment method. For new entries, set to null (must select)
      setPaymentMethod(isInUse ? currentPaymentMethod : null);
      
      // 후불결제 상태 초기화 (기존 입실인 경우)
      if (isInUse) {
        setIsCurrentlyDeferred(currentDeferredPayment || false);
        setIsDeferredPayment(currentDeferredPayment || false);
        setCustomerMemo(currentCustomerMemo || "");
      } else {
        setIsCurrentlyDeferred(false);
        setIsDeferredPayment(false);
        setCustomerMemo("");
      }
      
      // Parse rental items from notes (legacy)
      const blanketPresent = currentNotes?.includes('담요') || false;
      const towelPresent = currentNotes?.includes('롱타올') || false;
      setHasBlanket(blanketPresent);
      setHasLongTowel(towelPresent);
      
      // Initialize option states based on current optionType
      if (currentOptionType === 'direct_price' && currentFinalPrice !== undefined) {
        setIsDirectPrice(true);
        setDirectPrice(currentFinalPrice.toString());
        setIsForeigner(false);
        setDiscountOption("none");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'foreigner') {
        setIsForeigner(true);
        setIsDirectPrice(false);
        setDiscountOption("none");
        setDirectPrice("");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'discount') {
        setDiscountOption("discount");
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'custom' && currentOptionAmount !== undefined) {
        setDiscountOption("custom");
        setDiscountInputAmount(currentOptionAmount.toString());
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
      } else {
        // none or default
        setDiscountOption("none");
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
        setDiscountInputAmount("");
      }
    } else {
      // Reset rental items
      setHasBlanket(false);
      setHasLongTowel(false);
      setShowWarningAlert(false);
      
      // Reset all state when dialog closes to prevent state leakage
      setDiscountOption("none");
      setDiscountInputAmount("");
      setIsForeigner(false);
      setIsDirectPrice(false);
      setDirectPrice("");
      setPaymentMethod(null);
      setShowCheckoutConfirm(false);
      setIsDeferredPayment(false); // 후불결제 상태도 초기화
      setCustomerMemo(""); // 손님 메모 초기화
      // Note: checkoutResolved is NOT reset here to preserve acknowledgement state
    }
  }, [open, currentNotes, currentPaymentMethod, currentOptionType, currentOptionAmount, currentFinalPrice, lockerNumber, checkoutResolved, currentDeferredPayment, currentCustomerMemo, isInUse]);

  const calculateFinalPrice = () => {
    // 우선순위 1: 요금직접입력
    if (isDirectPrice && directPrice) {
      return parseInt(directPrice);
    }
    
    // 우선순위 2: 외국인
    if (isForeigner) {
      return foreignerPrice;
    }
    
    // 우선순위 3: 할인 옵션
    if (discountOption === "discount") {
      return basePrice - discountAmount;
    }
    if (discountOption === "custom" && discountInputAmount) {
      return basePrice - parseInt(discountInputAmount);
    }
    
    return basePrice;
  };

  /**
   * 최종 요금 계산 (기본요금 + 추가요금)
   * 규칙: 기본요금과 추가요금의 영업일이 다르면 기본요금을 0으로 처리
   */
  const calculateTotalPriceWithAdditionalFee = () => {
    const baseFinalPrice = calculateFinalPrice();
    
    // 추가요금이 없으면 기본요금만 반환
    if (!isInUse || additionalFeeInfo.additionalFee === 0) {
      return baseFinalPrice;
    }
    
    // 입실시간과 현재시간의 영업일 비교
    if (entryTime) {
      const entryBusinessDay = getBusinessDay(new Date(entryTime));
      const currentBusinessDay = getBusinessDay(new Date());
      
      // 영업일이 다르면 기본요금을 0으로 처리 (추가요금만 청구)
      if (entryBusinessDay !== currentBusinessDay) {
        return additionalFeeInfo.additionalFee;
      }
    }
    
    // 영업일이 같으면 기본요금 + 추가요금
    return baseFinalPrice + additionalFeeInfo.additionalFee;
  };

  // Generate notes from rental items
  const generateNotes = () => {
    const items: string[] = [];
    selectedRentalItems.forEach(itemId => {
      const item = availableRentalItems.find(i => i.id === itemId);
      if (item) {
        items.push(item.name);
      }
    });
    return items.length > 0 ? items.join(', ') : '';
  };

  // Generate rental item info for checkout
  const generateRentalItemInfo = (): RentalItemInfo[] => {
    const rentalItems: RentalItemInfo[] = [];
    
    selectedRentalItems.forEach(itemId => {
      const item = availableRentalItems.find(i => i.id === itemId);
      const depositStatus = depositStatuses.get(itemId);
      const rentalPaymentMethod = rentalPaymentMethods.get(itemId) || 'cash'; // Default to cash if not set
      
      if (item && depositStatus) {
        rentalItems.push({
          itemId: item.id,
          itemName: item.name,
          rentalFee: item.rentalFee || 0,
          depositAmount: item.depositAmount || 0,
          depositStatus: depositStatus,
          paymentMethod: rentalPaymentMethod,
        });
      }
    });
    
    return rentalItems;
  };
  
  // Validate mixed payment amounts match final price
  const validateMixedPayment = (targetAmount: number): boolean => {
    // Treat empty strings and NaN as 0
    const cashVal = parseInt(paymentCash) || 0;
    const cardVal = parseInt(paymentCard) || 0;
    const transferVal = parseInt(paymentTransfer) || 0;
    
    // Check for invalid negative values
    if (cashVal < 0 || cardVal < 0 || transferVal < 0) {
      toast({
        title: "결제 금액 오류",
        description: "결제 금액은 0 이상이어야 합니다.",
        variant: "destructive",
      });
      return false;
    }
    
    const total = cashVal + cardVal + transferVal;
    
    if (total !== targetAmount) {
      toast({
        title: "결제 금액 오류",
        description: `결제 금액 합계(${total.toLocaleString()}원)가 최종 요금(${targetAmount.toLocaleString()}원)과 일치하지 않습니다.\n\n현금: ${cashVal.toLocaleString()}원\n카드: ${cardVal.toLocaleString()}원\n이체: ${transferVal.toLocaleString()}원`,
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  // 후불결제 완료 처리
  const handleCompleteDeferredPayment = () => {
    playClickSound();
    
    // 결제 방식 검증
    if (!useSplitPayment && !paymentMethod) {
      toast({
        title: "지불방식 미선택",
        description: "현금, 카드, 이체 중 하나를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    const computedFinalPrice = calculateFinalPrice();
    
    // 분리결제 검증
    if (useSplitPayment && !validateMixedPayment(computedFinalPrice)) {
      return;
    }
    
    // 결제 금액 계산
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
    } else {
      if (paymentMethod === 'cash') {
        cashVal = computedFinalPrice;
      } else if (paymentMethod === 'card') {
        cardVal = computedFinalPrice;
      } else if (paymentMethod === 'transfer') {
        transferVal = computedFinalPrice;
      }
    }
    
    // DB 업데이트: 후불결제 해제 및 결제 정보 기록
    if (currentLockerLogId) {
      const result = localDb.completeDeferredPayment(currentLockerLogId, {
        paymentMethod: paymentMethod || 'cash',
        paymentCash: cashVal,
        paymentCard: cardVal,
        paymentTransfer: transferVal
      });
      
      if (result.success) {
        toast({
          title: "결제 완료",
          description: `${lockerNumber}번 락카 후불결제가 완료되었습니다. (${computedFinalPrice.toLocaleString()}원)`,
        });
        
        // 데이터 새로고침 콜백 호출 (loadData)
        if (onPaymentComplete) {
          onPaymentComplete();
        }
        
        // 다이얼로그 닫기
        // isCurrentlyDeferred는 로컬에서 리셋하지 않고 다음 열림 시 DB에서 가져옴
        playCloseSound();
        onClose();
      } else {
        toast({
          title: "결제 완료 실패",
          description: result.message,
          variant: "destructive",
        });
      }
    }
  };
  
  const handleProcessEntry = () => {
    playClickSound();
    
    // 후불결제가 아닌 경우에만 지불방식 검증
    if (!isDeferredPayment && !useSplitPayment && !paymentMethod) {
      toast({
        title: "지불방식 미선택",
        description: "현금, 카드, 이체 중 하나를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' = 'none';
    let optionAmount: number | undefined;

    if (isDirectPrice && directPrice) {
      optionType = 'direct_price';
      optionAmount = parseInt(directPrice);
    } else if (isForeigner) {
      optionType = 'foreigner';
    } else if (discountOption === 'discount') {
      optionType = 'discount';
      optionAmount = discountAmount;
    } else if (discountOption === 'custom' && discountInputAmount) {
      optionType = 'custom';
      optionAmount = parseInt(discountInputAmount);
    }
    
    const computedFinalPrice = calculateFinalPrice();
    
    // Get payment breakdown
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      // Validate mixed payment amounts for split payment
      if (!validateMixedPayment(computedFinalPrice)) {
        return;
      }
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
    } else {
      // Single payment method - automatically assign full amount
      if (paymentMethod === 'cash') {
        cashVal = computedFinalPrice;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = computedFinalPrice;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = computedFinalPrice;
      }
    }

    const generatedNotes = generateNotes();
    const rentalItemInfo = generateRentalItemInfo();
    
    // 후불결제 시 결제 금액을 0원으로 처리
    if (isDeferredPayment) {
      // 후불결제: paymentMethod = cash (임시), 금액은 0원으로 기록
      onApply(optionType, optionAmount, generatedNotes, 'cash', rentalItemInfo, 0, 0, 0, true, customerMemo);
      setDialogOpen(false);
      return;
    }
    
    // paymentMethod is guaranteed to be non-null here due to validation above or split payment
    const finalPaymentMethod = paymentMethod || 'cash';
    onApply(optionType, optionAmount, generatedNotes, finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, false, customerMemo);
    setDialogOpen(false);
  };

  const handleSaveChanges = () => {
    playClickSound();
    
    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' = 'none';
    let optionAmount: number | undefined;

    if (isDirectPrice && directPrice) {
      optionType = 'direct_price';
      optionAmount = parseInt(directPrice);
    } else if (isForeigner) {
      optionType = 'foreigner';
    } else if (discountOption === 'discount') {
      optionType = 'discount';
      optionAmount = discountAmount;
    } else if (discountOption === 'custom' && discountInputAmount) {
      optionType = 'custom';
      optionAmount = parseInt(discountInputAmount);
    }
    
    const computedFinalPrice = calculateFinalPrice();
    
    // Get payment breakdown
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      // Validate mixed payment amounts for split payment
      if (!validateMixedPayment(computedFinalPrice)) {
        return;
      }
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
    } else {
      // Single payment method - automatically assign full amount
      if (paymentMethod === 'cash') {
        cashVal = computedFinalPrice;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = computedFinalPrice;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = computedFinalPrice;
      }
    }

    const generatedNotes = generateNotes();
    const rentalItemInfo = generateRentalItemInfo();
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    // 후불결제 상태 전달 (체크 해제 시 결제 완료 처리)
    onApply(optionType, optionAmount, generatedNotes, finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, isDeferredPayment, customerMemo);
    
    // Save return_completed status for rental items
    returnCompletedItems.forEach(itemId => {
      const txn = currentRentalTransactions.find(t => t.itemId === itemId);
      if (txn) {
        localDb.updateRentalTransaction(txn.id, {
          returnCompleted: true,
          depositStatus: depositStatuses.get(itemId) || txn.depositStatus,
          paymentMethod: rentalPaymentMethods.get(itemId) || txn.paymentMethod,
          returnTime: new Date(),
        });
      }
    });
    
    // Mark as resolved to prevent warning on next open
    setCheckoutResolved(true);
    
    // Auto-close dialog after save
    playCloseSound();
    setTimeout(() => setDialogOpen(false), 100);
  };

  const handleCheckoutClick = () => {
    playClickSound();
    
    // NOTE: Warning check removed - warning already shows when dialog first opens
    // Redundant check was causing infinite loop when user clicked checkout after warning close
    
    // 기본요금과 추가요금을 독립적으로 처리
    const computedFinalPrice = calculateFinalPrice();
    
    // 기본요금 결제 검증 및 할당 (기본요금만)
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      // Validate mixed payment amounts for split payment (기본요금만)
      if (!validateMixedPayment(computedFinalPrice)) {
        return;
      }
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
    } else {
      // Single payment method - automatically assign full amount (기본요금만)
      if (paymentMethod === 'cash') {
        cashVal = computedFinalPrice;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = computedFinalPrice;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = computedFinalPrice;
      }
    }
    
    // Prepare and validate additional fee payment info (if there's an additional fee)
    let additionalFeePayment: typeof additionalFeeInfo.additionalFee extends 0 ? undefined : {
      method: 'card' | 'cash' | 'transfer';
      cash?: number;
      card?: number;
      transfer?: number;
      discount?: number;
    } | undefined = undefined;
    
    if (additionalFeeInfo.additionalFee > 0) {
      // 할인 적용된 추가요금 계산
      const discountAmount = parseInt(additionalFeeDiscount) || 0;
      const discountedAdditionalFee = Math.max(0, additionalFeeInfo.additionalFee - discountAmount);
      
      if (useAdditionalFeeSplitPayment) {
        // 추가요금 분리결제 검증 (할인 적용된 금액 기준)
        const addCashVal = parseInt(additionalFeePaymentCash) || 0;
        const addCardVal = parseInt(additionalFeePaymentCard) || 0;
        const addTransferVal = parseInt(additionalFeePaymentTransfer) || 0;
        const addTotal = addCashVal + addCardVal + addTransferVal;
        
        if (addTotal !== discountedAdditionalFee) {
          toast({
            title: "결제 금액 오류",
            description: `추가요금 분리결제 합계(${addTotal.toLocaleString()}원)가 할인 적용된 추가요금(${discountedAdditionalFee.toLocaleString()}원)과 일치하지 않습니다.`,
            variant: "destructive",
          });
          return;
        }
        
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: addCashVal > 0 ? addCashVal : undefined,
          card: addCardVal > 0 ? addCardVal : undefined,
          transfer: addTransferVal > 0 ? addTransferVal : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      } else {
        // 추가요금 단일결제 (할인 적용된 금액 사용)
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: additionalFeePaymentMethod === 'cash' ? discountedAdditionalFee : undefined,
          card: additionalFeePaymentMethod === 'card' ? discountedAdditionalFee : undefined,
          transfer: additionalFeePaymentMethod === 'transfer' ? discountedAdditionalFee : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      }
    }
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    
    // Check if there are any rental items
    if (selectedRentalItems.size > 0) {
      setShowCheckoutConfirm(true);
    } else {
      const rentalItemInfo = generateRentalItemInfo();
      onCheckout(finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, additionalFeePayment);
    }
  };

  const confirmCheckout = () => {
    playCloseSound(); // Use a more distinctive sound for checkout
    setShowCheckoutConfirm(false);
    const rentalItemInfo = generateRentalItemInfo();
    
    // 기본요금과 추가요금을 독립적으로 처리
    const computedFinalPrice = calculateFinalPrice();
    
    // 기본요금 결제 할당 (기본요금만)
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
    } else {
      // Single payment method - automatically assign full amount (기본요금만)
      if (paymentMethod === 'cash') {
        cashVal = computedFinalPrice;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = computedFinalPrice;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = computedFinalPrice;
      }
    }
    
    // Prepare and validate additional fee payment info (if there's an additional fee)
    let additionalFeePayment: typeof additionalFeeInfo.additionalFee extends 0 ? undefined : {
      method: 'card' | 'cash' | 'transfer';
      cash?: number;
      card?: number;
      transfer?: number;
      discount?: number;
    } | undefined = undefined;
    
    if (additionalFeeInfo.additionalFee > 0) {
      // 할인 적용된 추가요금 계산
      const discountAmount = parseInt(additionalFeeDiscount) || 0;
      const discountedAdditionalFee = Math.max(0, additionalFeeInfo.additionalFee - discountAmount);
      
      if (useAdditionalFeeSplitPayment) {
        // 추가요금 분리결제 (할인 적용된 금액 기준)
        const addCashVal = parseInt(additionalFeePaymentCash) || 0;
        const addCardVal = parseInt(additionalFeePaymentCard) || 0;
        const addTransferVal = parseInt(additionalFeePaymentTransfer) || 0;
        
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: addCashVal > 0 ? addCashVal : undefined,
          card: addCardVal > 0 ? addCardVal : undefined,
          transfer: addTransferVal > 0 ? addTransferVal : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      } else {
        // 추가요금 단일결제 (할인 적용된 금액 사용)
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: additionalFeePaymentMethod === 'cash' ? discountedAdditionalFee : undefined,
          card: additionalFeePaymentMethod === 'card' ? discountedAdditionalFee : undefined,
          transfer: additionalFeePaymentMethod === 'transfer' ? discountedAdditionalFee : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      }
    }
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    onCheckout(finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, additionalFeePayment);
  };

  const handleWarningResolved = () => {
    playClickSound();
    setShowWarningAlert(false);
    setCheckoutResolved(true);
  };

  const handleWarningClose = () => {
    playClickSound();
    setShowWarningAlert(false);
    setCheckoutResolved(false);
  };

  const handleCancelClick = () => {
    playClickSound();
    onCancel();
  };

  const handleCloseClick = () => {
    playCloseSound();
    setTimeout(() => setDialogOpen(false), 100);
  };

  const setDialogOpen = (open: boolean) => {
    if (!open) {
      playCloseSound();
      onClose();
    }
  };

  // Locker swap handlers
  const handleSwapClick = () => {
    playClickSound();
    setSwapTargetLocker("");
    setShowSwapDialog(true);
  };

  const handleSwapSubmit = () => {
    const targetNumber = parseInt(swapTargetLocker);
    
    // 유효성 검사
    if (isNaN(targetNumber) || targetNumber < 1 || targetNumber > 200) {
      toast({
        title: "오류",
        description: "유효한 락카 번호를 입력해주세요 (1-200)",
        variant: "destructive",
      });
      return;
    }

    if (targetNumber === lockerNumber) {
      toast({
        title: "오류",
        description: "같은 락카 번호입니다.",
        variant: "destructive",
      });
      return;
    }

    // 목표 락카가 사용 중인지 확인
    const activeLockers = localDb.getActiveLockers();
    const targetInUse = activeLockers.some((locker: any) => locker.lockerNumber === targetNumber);

    setSwapInfo({
      targetLocker: targetNumber,
      willSwap: targetInUse,
    });
    
    setShowSwapDialog(false);
    setShowSwapConfirm(true);
  };

  const handleSwapConfirm = () => {
    if (!swapInfo || !onSwap) return;

    playClickSound();
    // 메모에 자동으로 정보 추가
    const newMemo = `[락카교체] ${lockerNumber}번 → ${swapInfo.targetLocker}번으로 교체됨`;
    setCustomerMemo(newMemo);
    
    onSwap(lockerNumber, swapInfo.targetLocker);
    setShowSwapConfirm(false);
    onClose();
  };

  // Locker linking handlers
  const handleLinkClick = () => {
    playClickSound();
    // Pre-select already linked child lockers
    const currentChildren = localDb.getChildLockers(lockerNumber);
    const currentChildNumbers = currentChildren.map((c: any) => c.lockerNumber);
    setSelectedChildLockers(new Set(currentChildNumbers));
    setShowLinkDialog(true);
  };

  const handleLinkSubmit = () => {
    if (selectedChildLockers.size === 0) {
      toast({
        variant: "destructive",
        title: "선택 오류",
        description: "묶을 락카를 최소 1개 이상 선택해주세요.",
      });
      return;
    }

    playClickSound();
    setShowLinkDialog(false);
    setShowLinkConfirm(true);
  };

  const handleLinkConfirm = async () => {
    playClickSound();
    
    try {
      const childLockerNumbers = Array.from(selectedChildLockers);
      const result = localDb.setParentChildLinks(lockerNumber, childLockerNumbers);
      
      if (result.success) {
        // 메모에 자동으로 정보 추가
        const childList = childLockerNumbers.join(", ");
        const newMemo = `[락카묶기] ${lockerNumber}번 부모 락카로 ${childList}번과 함께 묶음`;
        setCustomerMemo(newMemo);
        
        toast({
          title: "락카묶기 완료",
          description: result.message,
        });
        setShowLinkConfirm(false);
        setSelectedChildLockers(new Set());
        onClose();
        // Refresh page to show updated locker states
        window.location.reload();
      } else {
        toast({
          variant: "destructive",
          title: "락카묶기 실패",
          description: result.message,
        });
        // Keep dialog open so user can adjust selections
        setShowLinkConfirm(false);
      }
    } catch (error) {
      console.error('Link error:', error);
      toast({
        variant: "destructive",
        title: "락카묶기 실패",
        description: "락카묶기 중 오류가 발생했습니다.",
      });
      setShowLinkConfirm(false);
    }
  };

  const toggleChildLocker = (childNumber: number) => {
    setSelectedChildLockers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(childNumber)) {
        newSet.delete(childNumber);
      } else {
        newSet.add(childNumber);
      }
      return newSet;
    });
  };

  // Parent locker change/unlink handlers
  const handleChangeParentClick = () => {
    playClickSound();
    setNewParentLocker("");
    setUnlinkMode(false);
    setShowChangeParentDialog(true);
  };

  const handleChangeParentSubmit = () => {
    playClickSound();
    
    // Check if user wants to unlink (empty input)
    if (!newParentLocker.trim()) {
      setUnlinkMode(true);
      setShowChangeParentConfirm(true);
      return;
    }

    const targetNumber = parseInt(newParentLocker.trim());
    
    if (isNaN(targetNumber) || targetNumber < 1) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "유효한 락카 번호를 입력하세요.",
      });
      return;
    }

    if (targetNumber === lockerNumber) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "자기 자신을 부모 락카로 설정할 수 없습니다.",
      });
      return;
    }

    setUnlinkMode(false);
    setShowChangeParentConfirm(true);
  };

  const handleChangeParentConfirm = () => {
    playClickSound();
    
    try {
      if (unlinkMode) {
        // Unlink from parent
        const result = localDb.unlinkChildLocker(lockerNumber);
        
        if (result.success) {
          toast({
            title: "연결 해제 완료",
            description: result.message,
          });
          setShowChangeParentDialog(false);
          setShowChangeParentConfirm(false);
          setNewParentLocker("");
          onClose();
          window.location.reload();
        } else {
          toast({
            variant: "destructive",
            title: "연결 해제 실패",
            description: result.message,
          });
          setShowChangeParentConfirm(false);
        }
      } else {
        // Change to new parent
        const targetNumber = parseInt(newParentLocker);
        const result = localDb.changeChildParent(lockerNumber, targetNumber);
        
        if (result.success) {
          toast({
            title: "부모 락카 변경 완료",
            description: result.message,
          });
          setShowChangeParentDialog(false);
          setShowChangeParentConfirm(false);
          setNewParentLocker("");
          onClose();
          window.location.reload();
        } else {
          toast({
            variant: "destructive",
            title: "부모 락카 변경 실패",
            description: result.message,
          });
          setShowChangeParentConfirm(false);
        }
      }
    } catch (error) {
      console.error('Change parent error:', error);
      toast({
        variant: "destructive",
        title: unlinkMode ? "연결 해제 실패" : "부모 락카 변경 실패",
        description: "처리 중 오류가 발생했습니다.",
      });
      setShowChangeParentConfirm(false);
    }
  };

  // Calculate additional fee if entry time exists
  const isCurrentlyForeigner = currentOptionType === 'foreigner';
  const additionalFeeInfo = entryTime && isInUse
    ? calculateAdditionalFee(entryTime, timeType, dayPrice, nightPrice, new Date(), isCurrentlyForeigner, foreignerPrice, domesticCheckpointHour, foreignerAdditionalFeePeriod)
    : { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0 };

  // Format entry date and time
  const formatEntryDateTime = (entryTime?: string) => {
    if (!entryTime) return null;
    const date = new Date(entryTime);
    const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    return { dateStr, timeStr };
  };

  const entryDateTime = formatEntryDateTime(entryTime);

  return (
    <>
      {/* Main Popup Card - No Dialog wrapper for multi-popup support */}
      {open && (
        <div className="flex flex-col h-full bg-background rounded-lg overflow-hidden" data-testid="dialog-locker-options">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
            <h2 className="text-xl font-semibold">
              락커 {lockerNumber}번 - {isInUse ? '옵션 수정' : '입실 처리'}
            </h2>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleCloseClick}
              className="h-8 w-8"
            >
              ✕
            </Button>
          </div>
          
          {/* Content - scrollable */}
          <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-4 py-4">
            {/* 입실 정보 섹션 */}
            <div className="space-y-2">
              {/* 입실 날짜/시간 표시 (사용중일 때만) */}
              {isInUse && entryDateTime && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">입실 날짜</span>
                    <span className="font-medium">{entryDateTime.dateStr}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">입실 시간</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{entryDateTime.timeStr}</span>
                  </div>
                </>
              )}
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">시간대</span>
                <span className="font-medium">{timeType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">기본 요금</span>
                <span className="font-semibold">{basePrice.toLocaleString()}원</span>
              </div>
              
              {/* 대여 물품 안내 - 반납완료된 항목 제외 */}
              {isInUse && currentRentalTransactions.filter(txn => 
                !returnCompletedItems.has(txn.itemId)
              ).length > 0 && (
                <div className="text-sm bg-red-50 dark:bg-red-950 p-2 rounded border border-red-200 dark:border-red-800">
                  <span className="text-red-700 dark:text-red-300 font-semibold">
                    {currentRentalTransactions
                      .filter(txn => !returnCompletedItems.has(txn.itemId))
                      .map(txn => {
                        if (txn.depositAmount > 0) {
                          return `${txn.itemName} 회수 (보증금 ${txn.depositAmount.toLocaleString()}원 있음)`;
                        } else {
                          return `${txn.itemName} 회수 (보증금 ${txn.depositAmount.toLocaleString()}원 없음)`;
                        }
                      }).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* 요금직접입력 체크박스 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="direct-price" 
                  checked={isDirectPrice}
                  onCheckedChange={(checked) => setIsDirectPrice(checked as boolean)}
                  data-testid="checkbox-direct-price"
                />
                <Label htmlFor="direct-price" className="text-sm font-semibold cursor-pointer">
                  요금 직접 입력
                </Label>
              </div>
              {isDirectPrice && (
                <Input
                  type="number"
                  placeholder="최종 요금 입력"
                  value={directPrice}
                  onChange={(e) => setDirectPrice(e.target.value)}
                  data-testid="input-direct-price"
                />
              )}
            </div>

            {/* 외국인 체크박스 */}
            {!isDirectPrice && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="foreigner" 
                  checked={isForeigner}
                  onCheckedChange={(checked) => setIsForeigner(checked as boolean)}
                  data-testid="checkbox-foreigner"
                />
                <Label htmlFor="foreigner" className="text-sm font-semibold cursor-pointer">
                  외국인 ({foreignerPrice.toLocaleString()}원)
                </Label>
              </div>
            )}

            {/* 할인 옵션 Select */}
            {!isDirectPrice && !isForeigner && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">할인 옵션</Label>
                <Select value={discountOption} onValueChange={setDiscountOption}>
                  <SelectTrigger data-testid="select-discount-option">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">없음</SelectItem>
                    <SelectItem value="discount">할인 ({discountAmount.toLocaleString()}원)</SelectItem>
                    <SelectItem value="custom">할인 직접입력</SelectItem>
                  </SelectContent>
                </Select>
                {discountOption === "custom" && (
                  <Input
                    type="number"
                    placeholder="할인 금액 입력"
                    value={discountInputAmount}
                    onChange={(e) => setDiscountInputAmount(e.target.value)}
                    data-testid="input-custom-discount"
                  />
                )}
              </div>
            )}

            {/* 후불결제 상태 배너 - 사용중이고 후불결제 상태인 경우 */}
            {isInUse && isCurrentlyDeferred && (
              <div className="p-4 rounded-lg bg-gradient-to-r from-yellow-100 via-pink-100 to-purple-100 dark:from-yellow-950 dark:via-pink-950 dark:to-purple-950 border-2 border-pink-300 dark:border-pink-700 animate-pulse">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-pink-700 dark:text-pink-300">
                      미결제 금액: {calculateFinalPrice().toLocaleString()}원
                    </p>
                    <p className="text-sm text-pink-600 dark:text-pink-400 mt-1">
                      후불결제 대기 중 - 아래에서 결제 방식을 선택 후 결제 완료 버튼을 눌러주세요.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 지불방식 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">지불방식</Label>
                <div className="flex items-center gap-4">
                  {/* 후불결제 옵션 - 입실 시에만 표시 (후불결제 상태가 아닐 때) */}
                  {!isInUse && (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="deferred-payment" 
                        checked={isDeferredPayment}
                        onCheckedChange={(checked) => {
                          setIsDeferredPayment(checked as boolean);
                          // 후불결제 선택 시 지불방식 관련 상태 초기화
                          if (checked) {
                            setPaymentMethod(null);
                            setUseSplitPayment(false);
                            setPaymentCash("");
                            setPaymentCard("");
                            setPaymentTransfer("");
                          }
                        }}
                        data-testid="checkbox-deferred-payment"
                      />
                      <Label htmlFor="deferred-payment" className="text-sm cursor-pointer font-normal text-orange-600 dark:text-orange-400">
                        후불결제 (미수)
                      </Label>
                    </div>
                  )}
                  
                  {/* 분리결제 옵션 - 후불결제가 아닐 때 또는 후불결제 상태인 경우 표시 */}
                  {(!isDeferredPayment || isCurrentlyDeferred) && (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="split-payment" 
                        checked={useSplitPayment}
                        onCheckedChange={(checked) => {
                          setUseSplitPayment(checked as boolean);
                          // When switching to split payment, clear all fields
                          if (checked) {
                            setPaymentCash("");
                            setPaymentCard("");
                            setPaymentTransfer("");
                          }
                        }}
                        data-testid="checkbox-split-payment"
                      />
                      <Label htmlFor="split-payment" className="text-sm cursor-pointer font-normal">
                        분리결제
                      </Label>
                    </div>
                  )}
                </div>
              </div>

              {/* 후불결제 안내 */}
              {isDeferredPayment && (
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    결제 없이 입실 처리됩니다. 매출에 0원으로 기록됩니다.
                  </p>
                </div>
              )}
              
              {(!isDeferredPayment || isCurrentlyDeferred) && useSplitPayment ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="payment-cash" className="text-xs text-muted-foreground">현금</Label>
                      <Input
                        id="payment-cash"
                        type="number"
                        placeholder="0"
                        value={paymentCash}
                        onChange={(e) => {
                          const newCash = e.target.value;
                          setPaymentCash(newCash);
                          
                          // Auto-fill card with remaining amount
                          const computedFinalPrice = calculateFinalPrice();
                          const cashVal = parseInt(newCash) || 0;
                          const remaining = computedFinalPrice - cashVal;
                          
                          if (remaining > 0) {
                            setPaymentCard(String(remaining));
                            setPaymentTransfer("");
                          } else if (remaining === 0) {
                            setPaymentCard("");
                            setPaymentTransfer("");
                          }
                        }}
                        data-testid="input-payment-cash"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment-card" className="text-xs text-muted-foreground">카드</Label>
                      <Input
                        id="payment-card"
                        type="number"
                        placeholder="0"
                        value={paymentCard}
                        onChange={(e) => {
                          const newCard = e.target.value;
                          setPaymentCard(newCard);
                          
                          // Auto-fill transfer with remaining amount
                          const computedFinalPrice = calculateFinalPrice();
                          const cashVal = parseInt(paymentCash) || 0;
                          const cardVal = parseInt(newCard) || 0;
                          const remaining = computedFinalPrice - cashVal - cardVal;
                          
                          if (remaining > 0) {
                            setPaymentTransfer(String(remaining));
                          } else if (remaining === 0) {
                            setPaymentTransfer("");
                          }
                        }}
                        data-testid="input-payment-card"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment-transfer" className="text-xs text-muted-foreground">이체</Label>
                      <Input
                        id="payment-transfer"
                        type="number"
                        placeholder="0"
                        value={paymentTransfer}
                        onChange={(e) => setPaymentTransfer(e.target.value)}
                        data-testid="input-payment-transfer"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  {(() => {
                    const cashVal = parseInt(paymentCash) || 0;
                    const cardVal = parseInt(paymentCard) || 0;
                    const transferVal = parseInt(paymentTransfer) || 0;
                    const total = cashVal + cardVal + transferVal;
                    
                    return (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm font-semibold">합계</span>
                        <span className="text-lg font-bold">{total.toLocaleString()}원</span>
                      </div>
                    );
                  })()}
                </>
              ) : (!isDeferredPayment || isCurrentlyDeferred) ? (
                <div className="flex gap-9">
                  <Button
                    type="button"
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    className={`flex-1 h-12 text-base font-semibold ${paymentMethod === 'cash' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setPaymentMethod('cash')}
                    data-testid="button-payment-cash"
                  >
                    현금
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'card' ? 'default' : 'outline'}
                    className={`flex-1 h-12 text-base font-semibold ${paymentMethod === 'card' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setPaymentMethod('card')}
                    data-testid="button-payment-card"
                  >
                    카드
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'transfer' ? 'default' : 'outline'}
                    className={`flex-1 h-12 text-base font-semibold ${paymentMethod === 'transfer' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setPaymentMethod('transfer')}
                    data-testid="button-payment-transfer"
                  >
                    이체
                  </Button>
                </div>
              ) : null}
            </div>

            {/* 추가요금 섹션 - 추가요금이 있을 때만 표시 */}
            {isInUse && additionalFeeInfo.additionalFee > 0 && (
              <div className="space-y-3 p-4 border rounded-lg bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700 dark:text-orange-300 font-semibold">추가 요금 ({additionalFeeInfo.additionalFeeCount}회)</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">+{additionalFeeInfo.additionalFee.toLocaleString()}원</span>
                </div>

                {/* 추가요금 지불방식 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-orange-700 dark:text-orange-300">지불방식</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="additional-fee-split-payment" 
                        checked={useAdditionalFeeSplitPayment}
                        onCheckedChange={(checked) => {
                          setUseAdditionalFeeSplitPayment(checked as boolean);
                          if (checked) {
                            setAdditionalFeePaymentCash("");
                            setAdditionalFeePaymentCard("");
                            setAdditionalFeePaymentTransfer("");
                          }
                        }}
                        data-testid="checkbox-additional-fee-split-payment"
                      />
                      <Label htmlFor="additional-fee-split-payment" className="text-xs cursor-pointer font-normal text-orange-700 dark:text-orange-300">
                        분리결제
                      </Label>
                    </div>
                  </div>

                  {useAdditionalFeeSplitPayment ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label htmlFor="additional-fee-payment-cash" className="text-xs text-muted-foreground">현금</Label>
                          <Input
                            id="additional-fee-payment-cash"
                            type="number"
                            placeholder="0"
                            value={additionalFeePaymentCash}
                            onChange={(e) => {
                              const newCash = e.target.value;
                              setAdditionalFeePaymentCash(newCash);
                              
                              const cashVal = parseInt(newCash) || 0;
                              const remaining = additionalFeeInfo.additionalFee - cashVal;
                              
                              if (remaining > 0) {
                                setAdditionalFeePaymentCard(String(remaining));
                                setAdditionalFeePaymentTransfer("");
                              } else if (remaining === 0) {
                                setAdditionalFeePaymentCard("");
                                setAdditionalFeePaymentTransfer("");
                              }
                            }}
                            data-testid="input-additional-fee-payment-cash"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="additional-fee-payment-card" className="text-xs text-muted-foreground">카드</Label>
                          <Input
                            id="additional-fee-payment-card"
                            type="number"
                            placeholder="0"
                            value={additionalFeePaymentCard}
                            onChange={(e) => {
                              const newCard = e.target.value;
                              setAdditionalFeePaymentCard(newCard);
                              
                              const cashVal = parseInt(additionalFeePaymentCash) || 0;
                              const cardVal = parseInt(newCard) || 0;
                              const remaining = additionalFeeInfo.additionalFee - cashVal - cardVal;
                              
                              if (remaining > 0) {
                                setAdditionalFeePaymentTransfer(String(remaining));
                              } else if (remaining === 0) {
                                setAdditionalFeePaymentTransfer("");
                              }
                            }}
                            data-testid="input-additional-fee-payment-card"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="additional-fee-payment-transfer" className="text-xs text-muted-foreground">이체</Label>
                          <Input
                            id="additional-fee-payment-transfer"
                            type="number"
                            placeholder="0"
                            value={additionalFeePaymentTransfer}
                            onChange={(e) => setAdditionalFeePaymentTransfer(e.target.value)}
                            data-testid="input-additional-fee-payment-transfer"
                            className="mt-1"
                          />
                        </div>
                      </div>
                      {(() => {
                        const cashVal = parseInt(additionalFeePaymentCash) || 0;
                        const cardVal = parseInt(additionalFeePaymentCard) || 0;
                        const transferVal = parseInt(additionalFeePaymentTransfer) || 0;
                        const total = cashVal + cardVal + transferVal;
                        
                        return (
                          <div className="flex items-center justify-between pt-2 border-t border-orange-200 dark:border-orange-800">
                            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">합계</span>
                            <span className="text-lg font-bold text-orange-700 dark:text-orange-300">{total.toLocaleString()}원</span>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <Select value={additionalFeePaymentMethod} onValueChange={(value) => setAdditionalFeePaymentMethod(value as 'card' | 'cash' | 'transfer')}>
                      <SelectTrigger data-testid="select-additional-fee-payment-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">현금</SelectItem>
                        <SelectItem value="card">카드</SelectItem>
                        <SelectItem value="transfer">계좌이체</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* 현금영수증 발급 체크박스 */}
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="additional-fee-receipt" 
                    data-testid="checkbox-additional-fee-receipt"
                  />
                  <Label htmlFor="additional-fee-receipt" className="text-xs cursor-pointer font-normal text-orange-600 dark:text-orange-400">
                    현금영수증 발급 (+10% 부가세)
                  </Label>
                </div>

                {/* 추가요금 할인 섹션 */}
                <div className="space-y-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                  <Label className="text-sm font-semibold text-orange-700 dark:text-orange-300">추가요금 할인</Label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="additional-fee-full-discount" 
                        checked={additionalFeeFullDiscount}
                        onCheckedChange={(checked) => {
                          setAdditionalFeeFullDiscount(checked as boolean);
                          if (checked) {
                            setAdditionalFeePartialDiscount(false);
                            setAdditionalFeeDiscount(String(additionalFeeInfo.additionalFee));
                          } else {
                            setAdditionalFeeDiscount("");
                          }
                        }}
                        data-testid="checkbox-additional-fee-full-discount"
                      />
                      <Label htmlFor="additional-fee-full-discount" className="text-sm cursor-pointer font-normal text-red-600 dark:text-red-400">
                        전액 할인
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="additional-fee-partial-discount" 
                        checked={additionalFeePartialDiscount}
                        onCheckedChange={(checked) => {
                          setAdditionalFeePartialDiscount(checked as boolean);
                          if (checked) {
                            setAdditionalFeeFullDiscount(false);
                            setAdditionalFeeDiscount("");
                          } else {
                            setAdditionalFeeDiscount("");
                          }
                        }}
                        data-testid="checkbox-additional-fee-partial-discount"
                      />
                      <Label htmlFor="additional-fee-partial-discount" className="text-sm cursor-pointer font-normal text-red-600 dark:text-red-400">
                        일부 할인
                      </Label>
                    </div>
                  </div>
                  
                  {/* 일부 할인 금액 입력 */}
                  {additionalFeePartialDiscount && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="할인 금액 입력"
                        value={additionalFeeDiscount}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          if (value <= additionalFeeInfo.additionalFee) {
                            setAdditionalFeeDiscount(e.target.value);
                          }
                        }}
                        className="flex-1"
                        data-testid="input-additional-fee-discount"
                      />
                      <span className="text-sm text-muted-foreground">원</span>
                    </div>
                  )}
                  
                  {/* 할인 적용 후 최종 추가요금 표시 */}
                  {(additionalFeeFullDiscount || (additionalFeePartialDiscount && additionalFeeDiscount)) && (
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-orange-700 dark:text-orange-300">할인 적용 후 추가요금</span>
                      <span className="font-bold text-orange-700 dark:text-orange-300">
                        {(additionalFeeInfo.additionalFee - (parseInt(additionalFeeDiscount) || 0)).toLocaleString()}원
                      </span>
                    </div>
                  )}
                </div>

                {/* 추가요금완납 버튼 */}
                <Button
                  type="button"
                  className={`w-full h-12 text-base font-semibold ${
                    additionalFeeResolved 
                      ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                  onClick={() => {
                    setAdditionalFeeResolved(true);
                    setCheckoutResolved(true);
                    toast({
                      title: "추가요금 완납",
                      description: "추가요금이 완납 처리되었습니다. 퇴실 버튼이 활성화됩니다.",
                    });
                  }}
                  disabled={additionalFeeResolved}
                  data-testid="button-additional-fee-complete"
                >
                  {additionalFeeResolved ? '추가요금 완납됨 ✓' : '추가요금완납'}
                </Button>
              </div>
            )}

            {/* 최종 요금 - 구분선 아래 */}
            <div className="flex justify-between text-base pt-4 border-t-2">
              <span className="font-semibold">최종 요금</span>
              <span className="font-bold text-xl text-primary">{calculateTotalPriceWithAdditionalFee().toLocaleString()}원</span>
            </div>

            {/* 비고 - 대여 물품 체크박스 */}
            {availableRentalItems.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">대여 물품 (선택사항)</Label>
                <div className="space-y-3">
                  {availableRentalItems.map((item) => {
                    const itemId = item.id;
                    const isChecked = selectedRentalItems.has(itemId);
                    const depositStatus = depositStatuses.get(itemId);
                    
                    // Check if this specific item is already rented
                    const isAlreadyRented = currentRentalTransactions.some(txn => txn.itemId === itemId);
                    
                    return (
                      <div key={itemId} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox 
                              id={`rental-${itemId}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedRentalItems);
                                if (checked) {
                                  newSelected.add(itemId);
                                  // Automatically set depositStatus based on deposit amount and rental status
                                  const newStatuses = new Map(depositStatuses);
                                  const newPaymentMethods = new Map(rentalPaymentMethods);
                                  
                                  if (item.depositAmount === 0) {
                                    // No deposit - set to 'none'
                                    newStatuses.set(itemId, 'none');
                                  } else if (!isAlreadyRented) {
                                    // New rental (not already rented) - set to 'received' by default
                                    newStatuses.set(itemId, 'received');
                                  } else {
                                    // If already rented, keep existing status from currentRentalTransactions
                                    const existingTransaction = currentRentalTransactions.find(txn => txn.itemId === itemId);
                                    if (existingTransaction) {
                                      newStatuses.set(itemId, existingTransaction.depositStatus);
                                      newPaymentMethods.set(itemId, existingTransaction.paymentMethod || 'cash');
                                    }
                                  }
                                  
                                  // Set default payment method if not already set
                                  if (!newPaymentMethods.has(itemId)) {
                                    newPaymentMethods.set(itemId, 'cash');
                                  }
                                  
                                  setDepositStatuses(newStatuses);
                                  setRentalPaymentMethods(newPaymentMethods);
                                } else {
                                  newSelected.delete(itemId);
                                  // Remove deposit status and payment method only if NOT already rented
                                  // (keep status for already rented items)
                                  if (!isAlreadyRented) {
                                    const newStatuses = new Map(depositStatuses);
                                    const newPaymentMethods = new Map(rentalPaymentMethods);
                                    newStatuses.delete(itemId);
                                    newPaymentMethods.delete(itemId);
                                    setDepositStatuses(newStatuses);
                                    setRentalPaymentMethods(newPaymentMethods);
                                  }
                                }
                                setSelectedRentalItems(newSelected);
                              }}
                              data-testid={`checkbox-rental-${itemId}`}
                            />
                            <Label htmlFor={`rental-${itemId}`} className="text-sm cursor-pointer font-normal">
                              {item.name} {(item.depositAmount || 0) === 0 
                                ? `(가격: ${item.rentalFee?.toLocaleString() ?? '0'}원)`
                                : `(대여비: ${item.rentalFee?.toLocaleString() ?? '0'}원, 보증금: ${item.depositAmount?.toLocaleString() ?? '0'}원)`
                              }
                            </Label>
                          </div>
                        </div>
                        
                        {/* 대여 물품 옵션 - 체크박스 선택된 경우에만 표시 */}
                        {isChecked && (
                          <div className="ml-6 space-y-3">
                            {/* 반납완료 표시 */}
                            {returnCompletedItems.has(itemId) && (
                              <div className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                                ✓ 반납완료 ({(item.depositAmount || 0) === 0 ? '처리완료' : depositStatus === 'refunded' ? '환급' : depositStatus === 'forfeited' ? '몰수' : '처리됨'})
                              </div>
                            )}
                            
                            {/* 보증금 처리 - 반납완료되지 않은 경우에만 표시 (보증금 유무 상관없음) */}
                            {!returnCompletedItems.has(itemId) && (
                            <div className="space-y-2">
                              {/* 보증금이 있는 경우에만 보증금 처리 섹션 표시 */}
                              {(item.depositAmount || 0) > 0 && (
                                <>
                                  <Label htmlFor={`deposit-status-${itemId}`} className="text-xs text-muted-foreground">
                                    보증금 처리
                                    {item.depositAmount > 0 && depositStatus === 'received' && (!isInUse || !isAlreadyRented) && (
                                      <span className="ml-2 text-xs font-semibold text-orange-600 dark:text-orange-400">
                                        ⚠ 보증금 받음
                                      </span>
                                    )}
                                  </Label>
                                  <Select 
                                    value={depositStatus} 
                                    onValueChange={(value) => {
                                      const newStatuses = new Map(depositStatuses);
                                      newStatuses.set(itemId, value as 'received' | 'refunded' | 'forfeited' | 'none');
                                      setDepositStatuses(newStatuses);
                                    }}
                                  >
                                    <SelectTrigger 
                                      id={`deposit-status-${itemId}`} 
                                      data-testid={`select-deposit-${itemId}`}
                                      className={!depositStatus ? 'border-orange-500' : ''}
                                    >
                                      <SelectValue placeholder="보증금 처리를 선택하세요" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {/* 보증금 있음 - '받음' 옵션 (신규 입실 또는 아직 대여하지 않은 항목) */}
                                      {item.depositAmount > 0 && (!isInUse || !isAlreadyRented) && (
                                        <SelectItem value="received">받음 (입실 시)</SelectItem>
                                      )}
                                      
                                      {/* 보증금 있음 - '환급'/'몰수' 옵션 (이미 대여 중인 항목만) */}
                                      {item.depositAmount > 0 && isInUse && isAlreadyRented && (
                                        <>
                                          <SelectItem value="refunded">환급 (매출 없음)</SelectItem>
                                          <SelectItem value="forfeited">몰수 (매출 기록)</SelectItem>
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  {!depositStatus && (
                                    <p className="text-xs text-orange-600 dark:text-orange-400">
                                      {isInUse && isAlreadyRented ? '⚠️ 퇴실 전에 보증금 상태(환급/몰수)를 선택해주세요' : '⚠️ 보증금 상태를 선택해주세요'}
                                    </p>
                                  )}
                                </>
                              )}
                              
                              {/* 반납완료 버튼 - 보증금 없는 경우 또는 보증금 처리(환급/몰수) 선택 시 표시 */}
                              {((item.depositAmount || 0) === 0 || (isInUse && isAlreadyRented && (depositStatus === 'refunded' || depositStatus === 'forfeited'))) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 text-blue-600 border-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-400 dark:hover:bg-blue-950"
                                  onClick={() => {
                                    const newReturnCompleted = new Set(returnCompletedItems);
                                    newReturnCompleted.add(itemId);
                                    setReturnCompletedItems(newReturnCompleted);
                                  }}
                                  data-testid={`button-return-complete-${itemId}`}
                                >
                                  반납완료
                                </Button>
                              )}
                            </div>
                            )}

                            {/* 결제방식 - 반납완료되지 않은 경우에만 표시 */}
                            {!returnCompletedItems.has(itemId) && (
                            <div className="space-y-2">
                              <Label htmlFor={`rental-payment-${itemId}`} className="text-xs text-muted-foreground">
                                결제방식
                              </Label>
                              <Select 
                                value={rentalPaymentMethods.get(itemId) || 'cash'} 
                                onValueChange={(value) => {
                                  const newMethods = new Map(rentalPaymentMethods);
                                  newMethods.set(itemId, value as 'cash' | 'card' | 'transfer');
                                  setRentalPaymentMethods(newMethods);
                                }}
                              >
                                <SelectTrigger 
                                  id={`rental-payment-${itemId}`} 
                                  data-testid={`select-rental-payment-${itemId}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="cash">현금</SelectItem>
                                  <SelectItem value="card">카드</SelectItem>
                                  <SelectItem value="transfer">계좌이체</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* 손님 메모 입력 */}
            <div className={`mt-4 rounded-lg ${customerMemo && customerMemo.trim() ? 'animate-memo-gradient p-3' : 'bg-muted/30 border p-3'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="customer-memo" className={`text-sm font-semibold flex items-center gap-2 ${customerMemo && customerMemo.trim() ? 'text-white' : ''}`}>
                  <span className="text-base">📝</span> 손님 메모
                </Label>
                {customerMemo && (
                  <span className={`text-xs ${customerMemo && customerMemo.trim() ? 'text-white/80' : 'text-muted-foreground'}`}>(저장됨)</span>
                )}
              </div>
              <Textarea
                ref={memoTextareaRef}
                id="customer-memo"
                placeholder="손님에 관한 특별한 인상이나 특이사항을 기록하세요. 예: 야간요금 냈으므로 추가요금발생시 전액할인"
                value={customerMemo}
                onChange={(e) => setCustomerMemo(e.target.value)}
                className="min-h-[60px] resize-none text-sm bg-white dark:bg-gray-900 border-0 overflow-hidden"
                data-testid="input-customer-memo"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/10">
            {isInUse ? (
              <>
                <Button variant="destructive" onClick={handleCancelClick} data-testid="button-cancel">
                  입실취소
                </Button>
                <Button variant="secondary" onClick={handleSwapClick} data-testid="button-swap">
                  락카교체
                </Button>
                {!parentLockerNumber && (
                  <Button variant="secondary" onClick={handleLinkClick} data-testid="button-link">
                    락카묶기
                  </Button>
                )}
                <Button variant="outline" onClick={handleSaveChanges} data-testid="button-save">
                  수정저장
                </Button>
                {/* 후불결제 완료 버튼 - 후불결제 상태인 경우만 표시 */}
                {isCurrentlyDeferred && (
                  <Button 
                    onClick={handleCompleteDeferredPayment} 
                    className="bg-gradient-to-r from-yellow-500 to-pink-500 hover:from-yellow-600 hover:to-pink-600 text-white font-bold"
                    data-testid="button-complete-payment"
                    disabled={!useSplitPayment && !paymentMethod}
                  >
                    결제 완료
                  </Button>
                )}
                <Button 
                  onClick={handleCheckoutClick} 
                  className="bg-primary" 
                  data-testid="button-checkout"
                  disabled={(() => {
                    // 후불결제 상태인 경우 퇴실 비활성화 (결제 완료 먼저 필요)
                    if (isCurrentlyDeferred) {
                      return true;
                    }
                    
                    // 대여품목 중 '보증금이 있는' 것만 체크
                    const hasUnresolvedRentalWithDeposit = currentRentalTransactions.some(txn => {
                      // Skip if item is not selected anymore (user unchecked it)
                      if (!selectedRentalItems.has(txn.itemId)) {
                        return false;
                      }
                      // Skip items that are already return-completed
                      if (returnCompletedItems.has(txn.itemId)) {
                        return false;
                      }
                      // ONLY check items WITH deposit
                      if (txn.depositAmount === 0) {
                        return false;
                      }
                      // If transaction is in 'received' state and has deposit, must be updated to 'refunded' or 'forfeited'
                      if (txn.depositStatus === 'received') {
                        const newStatus = depositStatuses.get(txn.itemId);
                        return !newStatus || newStatus === 'received';
                      }
                      return false;
                    });
                    
                    // Check if any newly selected rental item WITH deposit has invalid deposit status for checkout
                    const hasUnresolvedNewRentalWithDeposit = Array.from(selectedRentalItems).some(itemId => {
                      // Skip if item is already return-completed
                      if (returnCompletedItems.has(itemId)) {
                        return false;
                      }
                      // Skip if item is already in currentRentalTransactions
                      if (currentRentalTransactions.some(txn => txn.itemId === itemId)) {
                        return false;
                      }
                      // Find the item to check if it has deposit
                      const item = availableRentalItems.find((r: any) => r.id === itemId);
                      // ONLY check items WITH deposit
                      if (!item || item.depositAmount === 0) {
                        return false;
                      }
                      const status = depositStatuses.get(itemId);
                      // For checkout, require 'refunded' or 'forfeited' (not 'received')
                      return !status || status === 'received';
                    });
                    
                    // Check if there are additional fees (only additional fees block checkout, not rental items without deposit)
                    const hasUnresolvedAdditionalFees = additionalFeeInfo.additionalFee > 0;
                    
                    return hasUnresolvedRentalWithDeposit || hasUnresolvedNewRentalWithDeposit || (hasUnresolvedAdditionalFees && !checkoutResolved);
                  })()}
                  title={isCurrentlyDeferred ? "후불결제 완료 후 퇴실 가능" : undefined}
                >
                  퇴실
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={handleCloseClick} data-testid="button-close-new">
                  취소
                </Button>
                <Button onClick={handleProcessEntry} className="bg-primary" data-testid="button-process-entry">
                  입실
                </Button>
              </>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Warning Alert for rental items and additional fees */}
      <AlertDialog open={showWarningAlert} onOpenChange={setShowWarningAlert}>
        <AlertDialogContent data-testid="dialog-warning-alert">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-600">확인 필요</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {/* 반납완료되지 않은 대여품목만 표시 */}
              {currentRentalTransactions.filter(txn => !returnCompletedItems.has(txn.itemId)).length > 0 && (
                <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-md border border-orange-200 dark:border-orange-800 space-y-2">
                  <p className="font-semibold text-orange-700 dark:text-orange-300 mb-2">대여 물품 회수:</p>
                  {currentRentalTransactions
                    .filter(txn => !returnCompletedItems.has(txn.itemId))
                    .map((txn) => {
                      const status = depositStatuses.get(txn.itemId) || txn.depositStatus;
                      return (
                        <div key={txn.id} className="flex items-start gap-2">
                          <span className="text-2xl">📦</span>
                          <div className="flex-1">
                            <p className="font-medium text-orange-700 dark:text-orange-300">
                              {txn.itemName} 회수하세요
                            </p>
                            {txn.depositAmount > 0 && (
                              <p className="text-sm text-orange-600 dark:text-orange-400 mt-0.5">
                                {status === 'refunded' && `보증금 ${txn.depositAmount.toLocaleString()}원 환급하세요`}
                                {status === 'received' && `보증금 ${txn.depositAmount.toLocaleString()}원 받으세요 (아직 처리 안됨)`}
                                {status === 'forfeited' && `보증금 ${txn.depositAmount.toLocaleString()}원 몰수 (분실/훼손)`}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              {additionalFeeInfo.additionalFee > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800">
                  <p className="font-semibold text-red-700 dark:text-red-300 mb-1">미지급 추가요금:</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">
                    {additionalFeeInfo.additionalFee.toLocaleString()}원 ({additionalFeeInfo.additionalFeeCount}회)
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleWarningClose} data-testid="button-warning-close">
              닫기
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCheckoutConfirm} onOpenChange={setShowCheckoutConfirm}>
        <AlertDialogContent data-testid="dialog-checkout-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>퇴실 확인</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>다음 대여 물품을 확인하셨습니까?</p>
              <div className="p-3 bg-muted rounded-md border">
                <p className="text-sm text-foreground whitespace-pre-wrap">{currentNotes || generateNotes()}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-checkout-cancel">취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCheckout} data-testid="button-checkout-confirm">
              확인 및 퇴실
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Locker swap input dialog */}
      <AlertDialog open={showSwapDialog} onOpenChange={setShowSwapDialog}>
        <AlertDialogContent data-testid="dialog-swap-input">
          <AlertDialogHeader>
            <AlertDialogTitle>락카 교체</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>교체할 락카 번호를 입력하세요.</p>
              <div className="space-y-2">
                <Label htmlFor="swap-target">교체 대상 락카 번호</Label>
                <Input
                  id="swap-target"
                  type="number"
                  min="1"
                  max="200"
                  value={swapTargetLocker}
                  onChange={(e) => setSwapTargetLocker(e.target.value)}
                  placeholder="락카 번호 입력 (1-200)"
                  data-testid="input-swap-target"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSwapSubmit();
                    }
                  }}
                />
              </div>
              <div className="text-sm bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-blue-700 dark:text-blue-300">
                  • 빈 락카로 교체 시: 현재 락카의 내용이 대상 락카로 이동합니다.<br/>
                  • 사용중인 락카로 교체 시: 두 락카의 내용이 서로 교환됩니다.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-swap-cancel">취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleSwapSubmit} data-testid="button-swap-submit">
              다음
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Locker swap confirmation dialog */}
      <AlertDialog open={showSwapConfirm} onOpenChange={setShowSwapConfirm}>
        <AlertDialogContent data-testid="dialog-swap-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-600">
              {swapInfo?.willSwap ? '락카 교환 확인' : '락카 이동 확인'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {swapInfo && (
                <>
                  <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-md border border-orange-200 dark:border-orange-800">
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      {swapInfo.willSwap
                        ? `${lockerNumber}번과 ${swapInfo.targetLocker}번 락카의 모든 내용(입실시간, 요금, 대여품목 등)이 서로 교환됩니다.`
                        : `${lockerNumber}번 락카의 모든 내용(입실시간, 요금, 대여품목 등)이 ${swapInfo.targetLocker}번 락카로 이동하고, ${lockerNumber}번은 빈 락카가 됩니다.`
                      }
                    </p>
                  </div>
                  <p className="font-medium">계속하시겠습니까?</p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-swap-confirm-cancel">취소</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSwapConfirm} 
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-swap-confirm-ok"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Locker linking selection dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto" data-testid="dialog-link-select">
          <DialogHeader>
            <DialogTitle>락카묶기 - {lockerNumber}번 자식 락카 관리</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              짐이 많은 손님을 위해 빈 락카를 추가로 묶을 수 있습니다. 
              묶인 락카는 요금 없이 사용되며, 부모 락카 퇴실 시 자동으로 해제됩니다.
            </p>
            
            <div className="text-sm font-semibold">
              현재 {selectedChildLockers.size}개 선택됨
            </div>

            <div className="grid grid-cols-5 gap-2">
              {(() => {
                // Get all active locker numbers
                const activeLockers = localDb.getActiveLockers();
                const activeNumbers = new Set(activeLockers.map((l: any) => l.lockerNumber));
                
                // Get currently linked children
                const currentChildren = localDb.getChildLockers(lockerNumber);
                const currentChildNumbers = new Set(currentChildren.map((c: any) => c.lockerNumber));
                
                // Get all locker groups to determine total range
                const groups = localDb.getLockerGroups();
                const maxLocker = Math.max(...groups.map((g: any) => g.endNumber), 80);
                
                // Generate available locker numbers (vacant OR already linked children)
                const availableLockers: number[] = [];
                for (let i = 1; i <= maxLocker; i++) {
                  if (i !== lockerNumber) {
                    // Include if vacant OR already a child of this parent
                    if (!activeNumbers.has(i) || currentChildNumbers.has(i)) {
                      availableLockers.push(i);
                    }
                  }
                }
                
                return availableLockers.map(num => {
                  const isLinkedChild = currentChildNumbers.has(num);
                  return (
                    <Button
                      key={num}
                      variant={selectedChildLockers.has(num) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleChildLocker(num)}
                      data-testid={`button-child-locker-${num}`}
                      className={`h-10 ${isLinkedChild ? 'border-blue-500 border-2' : ''}`}
                      title={isLinkedChild ? '현재 연결된 자식 락카' : '빈 락카'}
                    >
                      {num}
                      {isLinkedChild && <span className="ml-1 text-xs">✓</span>}
                    </Button>
                  );
                });
              })()}
            </div>

            <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
              <span className="font-semibold">✓ 표시:</span> 현재 연결된 자식 락카입니다. 선택 해제하면 연결이 해제됩니다.
            </div>

            {selectedChildLockers.size === 0 && (
              <div className="text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 p-3 rounded-md border border-orange-200 dark:border-orange-800">
                최소 1개 이상의 락카를 선택해주세요
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)} data-testid="button-link-cancel">
              취소
            </Button>
            <Button onClick={handleLinkSubmit} data-testid="button-link-submit">
              묶기 확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Locker linking confirmation dialog */}
      <AlertDialog open={showLinkConfirm} onOpenChange={setShowLinkConfirm}>
        <AlertDialogContent data-testid="dialog-link-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-blue-600">락카묶기 확인</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {lockerNumber}번 락카에 {Array.from(selectedChildLockers).join(', ')}번 락카를 묶습니다.
                  <br/><br/>
                  • 묶인 락카는 요금 없이 사용됩니다<br/>
                  • {lockerNumber}번 퇴실 시 자동으로 함께 퇴실됩니다
                </p>
              </div>
              <p className="font-medium">계속하시겠습니까?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-link-confirm-cancel">취소</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleLinkConfirm} 
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-link-confirm-ok"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Parent locker change/unlink dialog */}
      <Dialog open={showChangeParentDialog} onOpenChange={setShowChangeParentDialog}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-change-parent">
          <DialogHeader>
            <DialogTitle>부모 락카 변경/해제 - {lockerNumber}번</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                현재 {lockerNumber}번 락카는 {parentLockerNumber}번 부모 락카에 연결되어 있습니다.
              </p>
            </div>
            
            <p className="text-sm text-muted-foreground">
              • 새로운 부모 락카 번호를 입력하면 해당 락카로 변경됩니다<br/>
              • 빈 칸으로 두고 확인하면 부모 락카 연결이 해제됩니다
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="new-parent-locker">새 부모 락카 번호 (빈 칸 = 연결 해제)</Label>
              <Input
                id="new-parent-locker"
                type="number"
                value={newParentLocker}
                onChange={(e) => setNewParentLocker(e.target.value)}
                placeholder="빈 칸으로 두면 연결 해제"
                data-testid="input-new-parent-locker"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeParentDialog(false)} data-testid="button-change-parent-cancel">
              취소
            </Button>
            <Button onClick={handleChangeParentSubmit} data-testid="button-change-parent-submit">
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parent locker change/unlink confirmation dialog */}
      <AlertDialog open={showChangeParentConfirm} onOpenChange={setShowChangeParentConfirm}>
        <AlertDialogContent data-testid="dialog-change-parent-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-blue-600">
              {unlinkMode ? "부모 락카 연결 해제 확인" : "부모 락카 변경 확인"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {unlinkMode ? (
                    <>
                      {lockerNumber}번 락카의 부모 락카({parentLockerNumber}번) 연결을 해제합니다.
                      <br/><br/>
                      • {lockerNumber}번은 독립된 락카로 전환됩니다<br/>
                      • 기존 입실 정보는 유지됩니다
                    </>
                  ) : (
                    <>
                      {lockerNumber}번 락카의 부모를 {parentLockerNumber}번에서 {newParentLocker}번으로 변경합니다.
                      <br/><br/>
                      • {newParentLocker}번 퇴실 시 {lockerNumber}번도 함께 퇴실됩니다<br/>
                      • 기존 입실 정보는 유지됩니다
                    </>
                  )}
                </p>
              </div>
              <p className="font-medium">계속하시겠습니까?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-change-parent-confirm-cancel">취소</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleChangeParentConfirm} 
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-change-parent-confirm-ok"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
