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
import { RotateCcw, X } from "lucide-react";

interface RentalItemInfo {
  itemId: string;
  itemName: string;
  rentalFee: number;
  depositAmount: number;
  depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
  paymentMethod: 'cash' | 'card' | 'transfer';
  isCashReceipt?: boolean;
  vatAppliedRentalFee?: number;
  vatAppliedDepositAmount?: number;
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
  currentOptionType?: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free';
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
  currentNoAdditionalFee?: boolean; // 현재 추가요금없음 상태
  currentPrepaidAdditionalFee?: number; // 현재 선지급 추가요금
  currentIsCashReceipt?: boolean; // 현재 현금영수증 발행 여부
  currentAdditionalFeePaymentMethod?: 'card' | 'cash' | 'transfer'; // 현재 추가요금 결제방식
  isOuting?: boolean; // 현재 외출 중 여부
  currentIsStaff?: boolean; // 현재 직원 입실 여부
  onToggleOuting?: (newIsOuting: boolean, newMemo: string) => void; // 외출/복귀 토글 콜백
  onApply: (option: string, customAmount?: number, notes?: string, paymentMethod?: 'card' | 'cash' | 'transfer', rentalItems?: RentalItemInfo[], paymentCash?: number, paymentCard?: number, paymentTransfer?: number, deferredPayment?: boolean, customerMemo?: string, noAdditionalFee?: boolean, prepaidAdditionalFee?: number, isCashReceipt?: boolean, additionalFeePaymentMethod?: 'card' | 'cash' | 'transfer', isStaff?: boolean) => void;
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
    },
    customerMemo?: string,
    refundAmount?: number,
    refundNote?: string,
    refundMethod?: 'cash' | 'card' | 'transfer'
  ) => void;
  onCancel: () => void;
  onSwap?: (fromLocker: number, toLocker: number) => void;
  onPaymentComplete?: () => void; // 후불결제 완료 시 데이터 새로고침용 콜백
  onMinimize?: () => void; // 최소화 버튼 콜백 (팝업 워크스페이스용)
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
  currentNoAdditionalFee = false, // 현재 추가요금없음 상태
  currentPrepaidAdditionalFee = 0, // 현재 선지급 추가요금
  currentIsCashReceipt = false, // 현재 현금영수증 발행 여부
  currentAdditionalFeePaymentMethod, // 현재 추가요금 결제방식
  isOuting = false, // 현재 외출 중 여부
  onToggleOuting,
  onApply,
  onCheckout,
  onCancel,
  onSwap,
  onPaymentComplete,
  onMinimize,
}: LockerOptionsDialogProps) {
  // Load settings
  const settings = localDb.getSettings();
  const domesticCheckpointHour = settings.domesticCheckpointHour;
  const foreignerAdditionalFeePeriod = settings.foreignerAdditionalFeePeriod;
  const domesticAdditionalFeeMode: 'nextday' | 'nightstart' = (settings as any).domesticAdditionalFeeMode || 'nextday';
  const nightStartHour = parseInt(((settings as any).nightStartTime || '19:00').split(':')[0], 10);
  const enableDiscountOption = settings.enableDiscountOption !== false; // 기본값 true
  const enableForeignerOption = settings.enableForeignerOption !== false; // 기본값 true
  const enableCashReceiptVat = settings.enableCashReceiptVat === true; // 기본값 false
  const enableCardVat = settings.enableCardVat === true; // 기본값 false
  const [discountOption, setDiscountOption] = useState<string>("none");
  const [discountInputAmount, setDiscountInputAmount] = useState<string>("");
  const [isForeigner, setIsForeigner] = useState(false);
  const [isFreeEntry, setIsFreeEntry] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [noAdditionalFee, setNoAdditionalFee] = useState(false); // 추가요금없음 (VIP 등)
  const [hasPrepaidAdditionalFee, setHasPrepaidAdditionalFee] = useState(false); // 추가요금 선지급 체크박스
  const [prepaidAdditionalFeeAmount, setPrepaidAdditionalFeeAmount] = useState<string>(""); // 추가요금 선지급 금액
  const [prepaidAdditionalFeePaymentMethod, setPrepaidAdditionalFeePaymentMethod] = useState<'card' | 'cash' | 'transfer' | null>(null); // 선지급 별도 결제방식 (null=주결제방식과 동일)
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
  const [isCashReceipt, setIsCashReceipt] = useState(false); // 현금영수증 발행 여부 (부가세 10% 추가)
  const [isAdditionalFeeCashReceipt, setIsAdditionalFeeCashReceipt] = useState(false); // 추가요금 현금영수증
  
  // Additional fee payment states
  // Default to main payment method when no specific additional fee payment method is saved
  const [additionalFeePaymentMethod, setAdditionalFeePaymentMethod] = useState<'card' | 'cash' | 'transfer'>(currentAdditionalFeePaymentMethod || currentPaymentMethod || 'cash');
  const [additionalFeePaymentCash, setAdditionalFeePaymentCash] = useState<string>("");
  const [additionalFeePaymentCard, setAdditionalFeePaymentCard] = useState<string>("");
  const [additionalFeePaymentTransfer, setAdditionalFeePaymentTransfer] = useState<string>("");
  const [useAdditionalFeeSplitPayment, setUseAdditionalFeeSplitPayment] = useState(false);
  const [additionalFeeDiscount, setAdditionalFeeDiscount] = useState<string>("");
  const [additionalFeeFullDiscount, setAdditionalFeeFullDiscount] = useState(false); // 전액 할인
  const [additionalFeePartialDiscount, setAdditionalFeePartialDiscount] = useState(false); // 일부 할인
  const [additionalFeeResolved, setAdditionalFeeResolved] = useState(false); // 추가요금 완납 처리
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  // 환불 처리 states
  const [showRefund, setShowRefund] = useState(false);
  const [currentIsOuting, setCurrentIsOuting] = useState(isOuting);
  useEffect(() => { setCurrentIsOuting(isOuting); }, [isOuting]);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundNote, setRefundNote] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'transfer'>(currentPaymentMethod || 'cash');
  const [showWarningAlert, setShowWarningAlert] = useState(false);
  const [checkoutResolved, setCheckoutResolved] = useState(false);
  
  // 선지급금 취소 시 환불 방식 선택 다이얼로그
  const [showPrepaidRefundDialog, setShowPrepaidRefundDialog] = useState(false);
  const [prepaidRefundMethod, setPrepaidRefundMethod] = useState<'cash' | 'card' | 'transfer' | 'split' | null>(null);
  const [prepaidRefundIncludeVat, setPrepaidRefundIncludeVat] = useState(false); // 환불 시 부가세 포함 여부
  const [pendingPrepaidCancellation, setPendingPrepaidCancellation] = useState<{
    originalAmount: number;
    originalPaymentCash: number;
    originalPaymentCard: number;
    originalPaymentTransfer: number;
  } | null>(null);
  // 분할 환불 금액 입력 상태
  const [splitRefundCash, setSplitRefundCash] = useState<string>("");
  const [splitRefundCard, setSplitRefundCard] = useState<string>("");
  const [splitRefundTransfer, setSplitRefundTransfer] = useState<string>("");
  
  // Locker swap states
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapTargetLocker, setSwapTargetLocker] = useState<string>("");
  const [selectedSwapLocker, setSelectedSwapLocker] = useState<number | null>(null);
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
  
  // User-defined pricing options from database
  const [pricingOptions, setPricingOptions] = useState<any[]>([]);
  const [depositStatuses, setDepositStatuses] = useState<Map<string, 'received' | 'refunded' | 'forfeited' | 'none'>>(new Map());
  const [rentalPaymentMethods, setRentalPaymentMethods] = useState<Map<string, 'cash' | 'card' | 'transfer'>>(new Map());
  const [rentalCashReceiptStatuses, setRentalCashReceiptStatuses] = useState<Map<string, boolean>>(new Map());
  const [currentRentalTransactions, setCurrentRentalTransactions] = useState<any[]>([]);
  const [returnCompletedItems, setReturnCompletedItems] = useState<Set<string>>(new Set());
  const [cancellingRentalItem, setCancellingRentalItem] = useState<{txnId: string; itemId: string; itemName: string} | null>(null);
  
  // Track if this is initial open (to show warning once per dialog open)
  const initialOpenRef = useRef(false);
  const additionalFeePaymentMethodUserChangedRef = useRef(false);
  const previousLockerRef = useRef<string | null>(null);
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  
  // Auto-adjust memo textarea height
  useEffect(() => {
    if (memoTextareaRef.current) {
      memoTextareaRef.current.style.height = 'auto';
      memoTextareaRef.current.style.height = Math.max(60, memoTextareaRef.current.scrollHeight) + 'px';
    }
  }, [customerMemo]);

  // Track paid amount for new accrual detection
  const [paidAdditionalFeeAmount, setPaidAdditionalFeeAmount] = useState(0);
  
  // Reset checkoutResolved and additional fee discount when dialog opens
  // Load saved additional_fee_paid status from DB and compare with current additional fee
  useEffect(() => {
    if (open) {
      // 기존 입실 상태인 경우 DB에서 추가요금 정산 금액 로드
      if (isInUse && currentLockerLogId) {
        const paidAmount = localDb.getLockerLogAdditionalFeePaidAmount(currentLockerLogId);
        setPaidAdditionalFeeAmount(paidAmount);
        
        // 현재 추가요금 직접 계산
        // noAdditionalFee가 true이면 추가요금 완전 면제
        const isForeigner = currentOptionType === 'foreigner';
        const isFreeEntry = currentOptionType === 'free';
        let rawCurrentFee = 0;
        if (!currentNoAdditionalFee) {
          const currentFeeInfo = calculateAdditionalFee(
            entryTime || '',
            timeType,
            dayPrice,
            nightPrice,
            new Date(),
            isForeigner,
            foreignerPrice,
            domesticCheckpointHour,
            foreignerAdditionalFeePeriod,
            isFreeEntry,
            domesticAdditionalFeeMode,
            nightStartHour
          );
          rawCurrentFee = currentFeeInfo.additionalFee;
        }
        
        // 선지급 금액 차감 적용
        const prepaidFee = currentPrepaidAdditionalFee || 0;
        const netCurrentFee = Math.max(0, rawCurrentFee - prepaidFee);
        
        console.log('[DEBUG] 다이얼로그 열림:', { logId: currentLockerLogId, rawCurrentFee, prepaidFee, netCurrentFee, paidAmount });
        
        // 순 추가요금(선지급 차감 후)과 정산된 금액 비교
        if (netCurrentFee > paidAmount) {
          // 미지불 추가요금 있음
          console.log('[DEBUG] 미지불 추가요금 있음 - checkoutResolved: false');
          setCheckoutResolved(false);
          setAdditionalFeeResolved(false);
        } else if (netCurrentFee === 0 && rawCurrentFee > 0 && prepaidFee >= rawCurrentFee) {
          // 선지급이 추가요금을 완전히 커버 - 완납 상태
          console.log('[DEBUG] 선지급 완납 상태 - checkoutResolved: true');
          setCheckoutResolved(true);
          setAdditionalFeeResolved(true);
        } else if (paidAmount > 0 && netCurrentFee <= paidAmount) {
          // 이미 완납된 상태
          console.log('[DEBUG] 추가요금 완납 상태 - checkoutResolved: true');
          setCheckoutResolved(true);
          setAdditionalFeeResolved(true);
        } else {
          // 추가요금 없음
          console.log('[DEBUG] 추가요금 없음');
          setCheckoutResolved(false);
          setAdditionalFeeResolved(false);
        }
      } else {
        setPaidAdditionalFeeAmount(0);
        setCheckoutResolved(false);
        setAdditionalFeeResolved(false);
      }
      setAdditionalFeeFullDiscount(false);
      setAdditionalFeePartialDiscount(false);
      setAdditionalFeeDiscount("");
      // 추가요금없음 상태를 현재 값으로 초기화
      setNoAdditionalFee(currentNoAdditionalFee || false);
      // 선지급 추가요금 상태를 현재 값으로 초기화
      if (currentPrepaidAdditionalFee && currentPrepaidAdditionalFee > 0) {
        setHasPrepaidAdditionalFee(true);
        setPrepaidAdditionalFeeAmount(String(currentPrepaidAdditionalFee));
      } else {
        setHasPrepaidAdditionalFee(false);
        setPrepaidAdditionalFeeAmount("");
      }
      setPrepaidAdditionalFeePaymentMethod(null); // 선지급 결제방식은 항상 null로 초기화 (주결제방식 따름)
      // 현금영수증 발행 상태를 현재 값으로 초기화
      setIsCashReceipt(currentIsCashReceipt || false);
      // 추가요금 결제방식을 현재 값으로 초기화
      // 락커가 바뀌었거나 사용자가 아직 변경하지 않은 경우에만 리셋
      // (5초 주기 loadData에 의한 오버라이드 방지)
      if (previousLockerRef.current !== currentLockerLogId) {
        // 다른 락커로 전환 시 사용자 변경 플래그 초기화
        additionalFeePaymentMethodUserChangedRef.current = false;
        previousLockerRef.current = currentLockerLogId ?? null;
      }
      if (!additionalFeePaymentMethodUserChangedRef.current) {
        // Default to main payment method when no specific additional fee payment method is saved
        setAdditionalFeePaymentMethod(currentAdditionalFeePaymentMethod || currentPaymentMethod || 'cash');
      }
      initialOpenRef.current = true;
    }
  }, [open, isInUse, currentLockerLogId, entryTime, timeType, dayPrice, nightPrice, foreignerPrice, domesticCheckpointHour, foreignerAdditionalFeePeriod, currentOptionType, currentNoAdditionalFee, currentPrepaidAdditionalFee, currentIsCashReceipt, currentAdditionalFeePaymentMethod, currentPaymentMethod]);
  
    
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
        
        // 분리결제창에서 VAT를 다시 적용하므로, DB에 저장된 VAT 포함 금액을 기본 금액으로 변환
        // 현금/이체: enableCashReceiptVat && currentIsCashReceipt인 경우 VAT가 포함되어 있음
        // 카드: enableCardVat인 경우 VAT가 포함되어 있음
        const cashHadVat = enableCashReceiptVat && currentIsCashReceipt;
        const cardHadVat = enableCardVat;
        const transferHadVat = enableCashReceiptVat && currentIsCashReceipt;
        
        // VAT 포함 금액을 기본 금액으로 변환 (VAT 제거)
        const baseCash = (cashHadVat && currentPaymentCash) 
          ? Math.round(currentPaymentCash / 1.1) 
          : currentPaymentCash;
        const baseCard = (cardHadVat && currentPaymentCard) 
          ? Math.round(currentPaymentCard / 1.1) 
          : currentPaymentCard;
        const baseTransfer = (transferHadVat && currentPaymentTransfer) 
          ? Math.round(currentPaymentTransfer / 1.1) 
          : currentPaymentTransfer;
        
        setPaymentCash(baseCash !== undefined ? String(baseCash) : "");
        setPaymentCard(baseCard !== undefined ? String(baseCard) : "");
        setPaymentTransfer(baseTransfer !== undefined ? String(baseTransfer) : "");
      } else {
        // For new entries, default to single payment method (no split payment)
        setUseSplitPayment(false);
        setPaymentCash("");
        setPaymentCard("");
        setPaymentTransfer("");
      }
    }
  }, [open, currentPaymentCash, currentPaymentCard, currentPaymentTransfer, currentFinalPrice, basePrice, enableCashReceiptVat, currentIsCashReceipt, enableCardVat]);

  // Load rental items and pricing options from database on mount
  useEffect(() => {
    // Reload rental items and pricing options whenever dialog opens
    if (open) {
      const items = localDb.getAdditionalRevenueItems();
      setAvailableRentalItems(items);
      
      // Load user-defined pricing options
      const options = localDb.getPricingOptions();
      setPricingOptions(options);
      
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
        if (initialOpenRef.current && entryTime) {
          // 반납완료되지 않은 대여형(rental) 품목만 체크 (일반판매형 제외)
          const unresolvedRentals = rentals.filter(txn => {
            const item = items.find(i => i.id === txn.itemId);
            // 일반판매형(simple)은 반납 불필요하므로 제외
            if (item?.billingType === 'simple') {
              return false;
            }
            return txn.return_completed !== 1 && txn.returnCompleted !== 1;
          });
          const hasRentalItems = unresolvedRentals.length > 0;
          
          // Calculate additional fee to check if there are additional charges
          // noAdditionalFee가 true이면 추가요금 완전 면제
          const isCurrentlyForeigner = currentOptionType === 'foreigner';
          const isFreeEntry = currentOptionType === 'free';
          let hasUnpaidAdditionalFee = false;
          const savedPaidAmount = currentLockerLogId ? localDb.getLockerLogAdditionalFeePaidAmount(currentLockerLogId) : 0;
          const prepaidAmount = currentPrepaidAdditionalFee || 0;
          const totalPaidAmount = savedPaidAmount + prepaidAmount;
          
          if (!currentNoAdditionalFee) {
            const additionalFeeCalc = calculateAdditionalFee(
              entryTime, 
              timeType, 
              dayPrice, 
              nightPrice, 
              new Date(), 
              isCurrentlyForeigner, 
              foreignerPrice,
              domesticCheckpointHour,
              foreignerAdditionalFeePeriod,
              isFreeEntry,
              domesticAdditionalFeeMode,
              nightStartHour
            );
            // 추가요금이 (지불된 금액 + 선지급 금액) 보다 클 때만 미지불 상태
            hasUnpaidAdditionalFee = additionalFeeCalc.additionalFee > totalPaidAmount;
          }
          
          console.log('[DEBUG] 알림창 표시 체크:', { 
            noAdditionalFee: currentNoAdditionalFee,
            savedPaidAmount,
            prepaidAmount,
            totalPaidAmount,
            hasUnpaidAdditionalFee,
            hasRentalItems 
          });
          
          if (hasRentalItems || hasUnpaidAdditionalFee) {
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
  }, [open, isInUse, currentLockerLogId, lockerNumber, entryTime, timeType, dayPrice, nightPrice, foreignerPrice, currentOptionType, domesticCheckpointHour, foreignerAdditionalFeePeriod, currentNoAdditionalFee]);

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

  // Initialize customer memo when dialog opens (separate from other state to avoid conflicts)
  useEffect(() => {
    if (open) {
      if (isInUse) {
        setCustomerMemo(currentCustomerMemo || "");
      } else {
        setCustomerMemo("");
      }
    } else {
      setCustomerMemo(""); // Only reset when dialog closes
    }
  }, [open, isInUse, currentCustomerMemo]);

  // Initialize other state from current option data when dialog opens or closes
  useEffect(() => {
    if (open) {
      // For existing entries (isInUse), determine payment method from actual payment values
      // This handles cases where refunds changed which payment method has remaining value
      if (isInUse) {
        // Check which payment methods have values
        const hasCash = currentPaymentCash && currentPaymentCash > 0;
        const hasCard = currentPaymentCard && currentPaymentCard > 0;
        const hasTransfer = currentPaymentTransfer && currentPaymentTransfer > 0;
        const paymentCount = [hasCash, hasCard, hasTransfer].filter(Boolean).length;
        
        if (paymentCount === 1) {
          // Single payment - set the correct method
          if (hasCash) {
            setPaymentMethod('cash');
          } else if (hasCard) {
            setPaymentMethod('card');
          } else if (hasTransfer) {
            setPaymentMethod('transfer');
          }
        } else if (paymentCount > 1) {
          // Split payment - use the stored method (first payment method entered)
          setPaymentMethod(currentPaymentMethod);
        } else {
          // No payment yet - use stored method or default
          setPaymentMethod(currentPaymentMethod);
        }
      } else {
        // New entries - must select payment method
        setPaymentMethod(null);
      }
      
      // 후불결제 상태 초기화 (기존 입실인 경우)
      if (isInUse) {
        setIsCurrentlyDeferred(currentDeferredPayment || false);
        setIsDeferredPayment(currentDeferredPayment || false);
      } else {
        setIsCurrentlyDeferred(false);
        setIsDeferredPayment(false);
      }
      
      // Parse rental items from notes (legacy)
      const blanketPresent = currentNotes?.includes('담요') || false;
      const towelPresent = currentNotes?.includes('롱타올') || false;
      setHasBlanket(blanketPresent);
      setHasLongTowel(towelPresent);
      
      // Initialize option states based on current optionType
      if (currentOptionType === 'free') {
        setIsFreeEntry(true);
        setIsDirectPrice(false);
        setIsForeigner(false);
        setDiscountOption("none");
        setDirectPrice("");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'direct_price' && currentFinalPrice !== undefined) {
        setIsFreeEntry(false);
        setIsDirectPrice(true);
        // option_amount = 사용자가 입력한 직접요금 (prepaid 미포함)
        // final_price = option_amount + prepaid → 재오픈 시 이걸 쓰면 prepaid가 누적됨
        const directPriceValue = (currentOptionAmount !== undefined && currentOptionAmount > 0)
          ? currentOptionAmount
          : currentFinalPrice;
        setDirectPrice(directPriceValue.toString());
        setIsForeigner(false);
        setDiscountOption("none");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'foreigner') {
        setIsFreeEntry(false);
        setIsForeigner(true);
        setIsDirectPrice(false);
        setDiscountOption("none");
        setDirectPrice("");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'discount') {
        setIsFreeEntry(false);
        setDiscountOption("discount");
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'custom' && currentOptionAmount !== undefined) {
        setIsFreeEntry(false);
        setDiscountOption("custom");
        setDiscountInputAmount(currentOptionAmount.toString());
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
      } else {
        // none or default
        setIsFreeEntry(false);
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
      setIsFreeEntry(false);
      setNoAdditionalFee(false); // 추가요금없음 상태도 초기화
      setHasPrepaidAdditionalFee(false); // 선지급 추가요금 상태도 초기화
      setPrepaidAdditionalFeeAmount(""); // 선지급 추가요금 금액도 초기화
      setPrepaidAdditionalFeePaymentMethod(null); // 선지급 결제방식 초기화
      setIsDirectPrice(false);
      setDirectPrice("");
      setPaymentMethod(null);
      setShowCheckoutConfirm(false);
      setIsDeferredPayment(false); // 후불결제 상태도 초기화
      additionalFeePaymentMethodUserChangedRef.current = false; // 다이얼로그 닫힐 때 리셋
      // Note: checkoutResolved is NOT reset here to preserve acknowledgement state
    }
  }, [open, currentNotes, currentPaymentMethod, currentOptionType, currentOptionAmount, currentFinalPrice, lockerNumber, checkoutResolved, currentDeferredPayment, isInUse, currentPaymentCash, currentPaymentCard, currentPaymentTransfer]);

  // 선지급 추가요금 초기화
  useEffect(() => {
    if (open) {
      if (isInUse && currentPrepaidAdditionalFee > 0) {
        setHasPrepaidAdditionalFee(true);
        setPrepaidAdditionalFeeAmount(currentPrepaidAdditionalFee.toString());
      } else if (!isInUse) {
        setHasPrepaidAdditionalFee(false);
        setPrepaidAdditionalFeeAmount("");
      }
    }
  }, [open, isInUse, currentPrepaidAdditionalFee]);

  const calculateFinalPrice = () => {
    // 우선순위 0: 직원 또는 무료입장
    if (isStaff || isFreeEntry) {
      return 0;
    }
    
    // 우선순위 1: 요금직접입력
    if (isDirectPrice && directPrice) {
      return parseInt(directPrice);
    }
    
    // 우선순위 2: 외국인 (할인 옵션이 있으면 외국인 요금에 할인 적용)
    if (isForeigner) {
      const foreignerBase = foreignerPrice;
      if (discountOption === "discount") {
        return Math.max(0, foreignerBase - discountAmount);
      }
      if (discountOption.startsWith("pricing_")) {
        const optionId = discountOption.replace("pricing_", "");
        const option = pricingOptions.find(o => o.id === optionId);
        if (option) {
          if (option.optionType === 'discount') return Math.max(0, foreignerBase - option.amount);
          if (option.optionType === 'surcharge') return foreignerBase + option.amount;
          if (option.optionType === 'fixed') return option.amount;
        }
      }
      if (discountOption === "custom" && discountInputAmount) {
        const inputAmount = parseInt(discountInputAmount);
        if (!isNaN(inputAmount)) return Math.max(0, foreignerBase + inputAmount);
      }
      return foreignerBase;
    }
    
    // 우선순위 3: 기본 할인 옵션
    if (discountOption === "discount") {
      return basePrice - discountAmount;
    }
    
    // 우선순위 4: 사용자 정의 요금옵션 (pricing_xxx)
    if (discountOption.startsWith("pricing_")) {
      const optionId = discountOption.replace("pricing_", "");
      const option = pricingOptions.find(o => o.id === optionId);
      if (option) {
        if (option.optionType === 'discount') {
          return basePrice - option.amount;
        } else if (option.optionType === 'surcharge') {
          return basePrice + option.amount;
        } else if (option.optionType === 'fixed') {
          return option.amount;
        }
      }
    }
    
    // 우선순위 5: 직접입력 (음수면 할인, 양수면 할증)
    if (discountOption === "custom" && discountInputAmount) {
      const inputAmount = parseInt(discountInputAmount);
      return basePrice + inputAmount; // 음수 입력 시 할인, 양수 입력 시 할증
    }
    
    return basePrice;
  };

  /**
   * 부가세(10%)가 적용되는지 확인
   * - 카드결제: enableCardVat가 true면 자동 적용
   * - 현금/계좌이체: enableCashReceiptVat가 true이고 isCashReceipt가 체크되면 적용
   */
  const shouldApplyVat = (method: 'card' | 'cash' | 'transfer' | null, cashReceiptChecked: boolean) => {
    if (method === 'card' && enableCardVat) {
      return true;
    }
    if ((method === 'cash' || method === 'transfer') && enableCashReceiptVat && cashReceiptChecked) {
      return true;
    }
    return false;
  };

  /**
   * 부가세(10%) 포함 최종 요금 계산
   */
  const calculateFinalPriceWithVat = () => {
    const price = calculateFinalPrice();
    if (shouldApplyVat(paymentMethod, isCashReceipt)) {
      return Math.round(price * 1.1);
    }
    return price;
  };

  /**
   * 부가세 금액 계산 (표시용)
   */
  const calculateVatAmount = () => {
    if (shouldApplyVat(paymentMethod, isCashReceipt)) {
      return Math.round(calculateFinalPrice() * 0.1);
    }
    return 0;
  };

  /**
   * 최종 요금 계산 (기본요금 + 추가요금) - 부가세 미포함 원래 금액
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

  /**
   * 화면에 표시할 최종 요금 계산 (부가세 포함)
   * - 분리결제: 부가세 미포함
   * - 단일결제: 현금영수증 체크 또는 카드결제 시 부가세 포함
   * - 추가요금도 별도 결제방식에 따라 부가세 적용
   * - 선지급금(prepaidAdditionalFee)도 최종 요금에 포함 (부가세도 함께 적용)
   */
  const calculateDisplayTotal = () => {
    // 선지급금 (입실 처리 시)
    let prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;

    // 선지급금 부가세: 선지급 결제방식 기준으로 주결제와 독립적으로 계산
    let prepaidWithVat = prepaidAmount;
    if (prepaidAmount > 0) {
      const effectivePrepaidMethod = prepaidAdditionalFeePaymentMethod || paymentMethod;
      if (shouldApplyVat(effectivePrepaidMethod, false)) {
        prepaidWithVat = Math.round(prepaidAmount * 1.1);
      }
    }

    // 분리결제 시: 합계 라인과 동일한 로직으로 버킷별 VAT 적용
    if (useSplitPayment) {
      const cashAmt = parseInt(paymentCash) || 0;
      const cardAmt = parseInt(paymentCard) || 0;
      const transferAmt = parseInt(paymentTransfer) || 0;
      const total = cashAmt + cardAmt + transferAmt;
      const cashTransferVat = (enableCashReceiptVat && isCashReceipt && (cashAmt + transferAmt) > 0)
        ? Math.round((cashAmt + transferAmt) * 0.1) : 0;
      const cardVat = (enableCardVat && cardAmt > 0)
        ? Math.round(cardAmt * 0.1) : 0;
      return total + cashTransferVat + cardVat + prepaidWithVat;
    }

    // 부가세 적용 여부 확인 (주결제방식 기준)
    const baseVatApplied = shouldApplyVat(paymentMethod, isCashReceipt);

    // 기본요금 (부가세 적용)
    let baseFinalPrice = calculateFinalPrice();
    if (baseVatApplied) {
      baseFinalPrice = Math.round(baseFinalPrice * 1.1);
    }

    // 추가요금이 없으면 기본요금 + 선지급금 반환
    if (!isInUse || additionalFeeInfo.additionalFee === 0) {
      return baseFinalPrice + prepaidWithVat;
    }

    // 입실시간과 현재시간의 영업일 비교
    let includeBasePrice = true;
    if (entryTime) {
      const entryBusinessDay = getBusinessDay(new Date(entryTime));
      const currentBusinessDay = getBusinessDay(new Date());
      if (entryBusinessDay !== currentBusinessDay) {
        includeBasePrice = false;
      }
    }

    // 추가요금 할인 적용
    const discountAmount = parseInt(additionalFeeDiscount) || 0;
    let additionalFee = Math.max(0, additionalFeeInfo.additionalFee - discountAmount);

    // 추가요금 분리결제가 아닌 경우에만 부가세 적용
    if (!useAdditionalFeeSplitPayment) {
      const additionalFeeVatApplied = shouldApplyVat(additionalFeePaymentMethod, isAdditionalFeeCashReceipt);
      if (additionalFeeVatApplied) {
        additionalFee = Math.round(additionalFee * 1.1);
      }
    }

    // 영업일이 같으면 기본요금 + 추가요금, 다르면 추가요금만
    return includeBasePrice ? baseFinalPrice + additionalFee : additionalFee;
  };

  // Generate notes from rental items
  const generateNotes = () => {
    const parts: string[] = [];
    if (isStaff) {
      parts.push('직원');
    } else if (isFreeEntry) {
      parts.push('무료입장');
    }
    selectedRentalItems.forEach(itemId => {
      const item = availableRentalItems.find(i => i.id === itemId);
      if (item) {
        parts.push(item.name);
      }
    });
    return parts.length > 0 ? parts.join(', ') : '';
  };

  // Generate rental item info for checkout
  const generateRentalItemInfo = (): RentalItemInfo[] => {
    const rentalItems: RentalItemInfo[] = [];
    const settings = localDb.getSettings();
    
    selectedRentalItems.forEach(itemId => {
      const item = availableRentalItems.find(i => i.id === itemId);
      const depositStatus = depositStatuses.get(itemId);
      const rentalPaymentMethod = rentalPaymentMethods.get(itemId) || 'cash';
      const isCashReceipt = rentalCashReceiptStatuses.get(itemId) || false;
      
      if (item && depositStatus) {
        const baseRentalFee = item.rentalFee || 0;
        const baseDepositAmount = item.depositAmount || 0;
        
        // 부가세 적용 여부 확인
        const vatApplied = shouldApplyVat(rentalPaymentMethod, isCashReceipt);
        
        // 부가세가 적용되면 대여비와 보증금 모두에 적용
        const vatAppliedRentalFee = vatApplied ? Math.round(baseRentalFee * 1.1) : baseRentalFee;
        const vatAppliedDepositAmount = vatApplied ? Math.round(baseDepositAmount * 1.1) : baseDepositAmount;
        
        rentalItems.push({
          itemId: item.id,
          itemName: item.name,
          rentalFee: baseRentalFee,
          depositAmount: baseDepositAmount,
          depositStatus: depositStatus,
          paymentMethod: rentalPaymentMethod,
          isCashReceipt: isCashReceipt,
          vatAppliedRentalFee: vatAppliedRentalFee,
          vatAppliedDepositAmount: vatAppliedDepositAmount,
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
      
      // 분리결제 시 부가세 적용
      const settings = localDb.getSettings();
      
      // 현금/이체: 현금영수증 체크 시에만 부가세 적용
      if (settings.enableCashReceiptVat && isCashReceipt) {
        if (cashVal) {
          cashVal = Math.round(cashVal * 1.1);
        }
        if (transferVal) {
          transferVal = Math.round(transferVal * 1.1);
        }
      }
      
      // 카드: 카드 부가세 설정이 ON이면 자동 적용
      if (settings.enableCardVat && cardVal) {
        cardVal = Math.round(cardVal * 1.1);
      }
    } else {
      // 단일 결제 시 부가세 적용
      const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
      if (vatApplied) {
        const priceWithVat = Math.round(computedFinalPrice * 1.1);
        if (paymentMethod === 'cash') {
          cashVal = priceWithVat;
        } else if (paymentMethod === 'card') {
          cardVal = priceWithVat;
        } else if (paymentMethod === 'transfer') {
          transferVal = priceWithVat;
        }
      } else {
        if (paymentMethod === 'cash') {
          cashVal = computedFinalPrice;
        } else if (paymentMethod === 'card') {
          cardVal = computedFinalPrice;
        } else if (paymentMethod === 'transfer') {
          transferVal = computedFinalPrice;
        }
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
    
    // 후불결제가 아닌 경우에만 지불방식 검증 (무료입장/직원은 검증 스킵)
    if (!isDeferredPayment && !isFreeEntry && !isStaff && !useSplitPayment && !paymentMethod) {
      toast({
        title: "지불방식 미선택",
        description: "현금, 카드, 이체 중 하나를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free' = 'none';
    let optionAmount: number | undefined;

    if (isStaff || isFreeEntry) {
      optionType = 'free';
      optionAmount = 0;
    } else if (isDirectPrice && directPrice) {
      optionType = 'direct_price';
      optionAmount = parseInt(directPrice);
    } else if (isForeigner) {
      if (discountOption !== 'none') {
        // 외국인 요금에 할인 옵션 적용 시 최종 계산 금액으로 저장 (handleSaveChanges와 동일)
        optionType = 'direct_price';
        optionAmount = calculateFinalPrice();
      } else {
        optionType = 'foreigner';
      }
    } else if (discountOption === 'discount') {
      optionType = 'discount';
      optionAmount = discountAmount;
    } else if (discountOption.startsWith('pricing_')) {
      // 사용자 정의 요금옵션 - direct_price로 저장 (최종 계산된 금액)
      optionType = 'direct_price';
      optionAmount = calculateFinalPrice();
    } else if (discountOption === 'custom' && discountInputAmount) {
      optionType = 'custom';
      optionAmount = parseInt(discountInputAmount);
    }
    
    const baseFinalPrice = calculateFinalPrice();
    const prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
    const computedFinalPrice = baseFinalPrice + prepaidAmount; // 선지급금 포함 총액
    
    // 선지급금 정보를 메모에 자동 기록
    let finalCustomerMemo = customerMemo;
    if (prepaidAmount > 0) {
      const checkTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      const prepaidMemoText = `[${checkTime}] 추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      // 중복 방지: 같은 금액의 선지급 기록이 있으면 추가하지 않음
      const prepaidPattern = `추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      if (!customerMemo.includes(prepaidPattern)) {
        finalCustomerMemo = customerMemo.trim() 
          ? `${customerMemo}\n${prepaidMemoText}` 
          : prepaidMemoText;
        setCustomerMemo(finalCustomerMemo);
      }
    }
    
    // 무료입장 또는 직원일 경우 결제방식 없이 바로 처리
    if (isFreeEntry || isStaff) {
      // 비고(customerMemo)에 자동 메모 추가 (중복 방지)
      const autoLabel = isStaff ? '직원' : '무료입장';
      if (!finalCustomerMemo.includes(autoLabel)) {
        finalCustomerMemo = finalCustomerMemo.trim()
          ? `${autoLabel}\n${finalCustomerMemo}`
          : autoLabel;
      }
      console.log('[handleProcessEntry] Free/Staff entry - calling onApply with:', { optionType, isInUse, lockerNumber, noAdditionalFee, isStaff });
      const generatedNotes = generateNotes();
      const rentalItemInfo = generateRentalItemInfo();
      const prepaidFee = hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount ? parseInt(prepaidAdditionalFeeAmount) : 0;
      onApply(optionType, 0, generatedNotes, 'cash', rentalItemInfo, 0, 0, 0, false, finalCustomerMemo, noAdditionalFee, prepaidFee, false, additionalFeePaymentMethod, isStaff);
      console.log('[handleProcessEntry] onApply called, now closing dialog');
      setDialogOpen(false);
      return;
    }
    
    // Get payment breakdown
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    // 선지급 별도 결제방식 결정 (null이면 주결제방식과 동일)
    const effectivePrepaidMethod = prepaidAdditionalFeePaymentMethod || paymentMethod;
    // 선지급이 있고 주결제방식과 다른 경우 → 자동 분리결제
    const isPrepaidAutoSplit = !useSplitPayment && prepaidAmount > 0 && effectivePrepaidMethod !== paymentMethod;

    if (useSplitPayment) {
      if (prepaidAdditionalFeePaymentMethod !== null && prepaidAmount > 0) {
        // 분리결제 + 선지급 별도 결제방식: 기본요금 합계만 검증하고 선지급은 자동 추가
        if (!validateMixedPayment(baseFinalPrice)) {
          return;
        }
        cashVal = parseInt(paymentCash) || undefined;
        cardVal = parseInt(paymentCard) || undefined;
        transferVal = parseInt(paymentTransfer) || undefined;
        // 선지급 금액을 지정된 결제 버킷에 자동 합산
        if (effectivePrepaidMethod === 'cash') cashVal = (cashVal || 0) + prepaidAmount;
        else if (effectivePrepaidMethod === 'card') cardVal = (cardVal || 0) + prepaidAmount;
        else if (effectivePrepaidMethod === 'transfer') transferVal = (transferVal || 0) + prepaidAmount;
      } else {
        // 기존 분리결제: 선지급 포함 전체 금액 검증
        if (!validateMixedPayment(computedFinalPrice)) {
          return;
        }
        cashVal = parseInt(paymentCash) || undefined;
        cardVal = parseInt(paymentCard) || undefined;
        transferVal = parseInt(paymentTransfer) || undefined;
      }
    } else if (isPrepaidAutoSplit) {
      // 선지급 결제방식이 달라 자동 분리: 기본요금 → 주결제방식, 선지급 → prepaidMethod
      cashVal = paymentMethod === 'cash' ? baseFinalPrice
              : effectivePrepaidMethod === 'cash' ? prepaidAmount
              : undefined;
      cardVal = paymentMethod === 'card' ? baseFinalPrice
              : effectivePrepaidMethod === 'card' ? prepaidAmount
              : undefined;
      transferVal = paymentMethod === 'transfer' ? baseFinalPrice
                  : effectivePrepaidMethod === 'transfer' ? prepaidAmount
                  : undefined;
    } else {
      // Single payment method - automatically assign full amount (선지급금 포함)
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
      const prepaidFee = hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount ? parseInt(prepaidAdditionalFeeAmount) : 0;
      onApply(optionType, optionAmount, generatedNotes, 'cash', rentalItemInfo, 0, 0, 0, true, finalCustomerMemo, noAdditionalFee, prepaidFee, false, additionalFeePaymentMethod, isStaff);
      setDialogOpen(false);
      return;
    }
    
    // 부가세 적용 (분리결제 또는 선지급 자동분리 시 수단별 적용)
    if (useSplitPayment || isPrepaidAutoSplit) {
      // 분리결제 시 각 결제 수단별로 부가세 적용
      const settings = localDb.getSettings();
      
      // 현금/이체: 현금영수증 체크 시에만 부가세 적용
      if (settings.enableCashReceiptVat && isCashReceipt) {
        if (cashVal) {
          cashVal = Math.round(cashVal * 1.1);
        }
        if (transferVal) {
          transferVal = Math.round(transferVal * 1.1);
        }
      }
      
      // 카드: 카드 부가세 설정이 ON이면 자동 적용
      if (settings.enableCardVat && cardVal) {
        cardVal = Math.round(cardVal * 1.1);
      }
    } else {
      // 단일 결제 시 부가세 적용
      const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
      if (vatApplied) {
        const priceWithVat = Math.round(computedFinalPrice * 1.1);
        if (paymentMethod === 'cash') {
          cashVal = priceWithVat;
        } else if (paymentMethod === 'card') {
          cardVal = priceWithVat;
        } else if (paymentMethod === 'transfer') {
          transferVal = priceWithVat;
        }
        // optionAmount도 부가세 포함 금액으로 업데이트 (direct_price인 경우)
        if (optionType === 'direct_price') {
          optionAmount = priceWithVat;
        }
      }
    }
    
    // paymentMethod is guaranteed to be non-null here due to validation above or split payment
    const finalPaymentMethod = paymentMethod || 'cash';
    const prepaidFee = hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount ? parseInt(prepaidAdditionalFeeAmount) : 0;
    onApply(optionType, optionAmount, generatedNotes, finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, false, finalCustomerMemo, noAdditionalFee, prepaidFee, isCashReceipt, additionalFeePaymentMethod, isStaff);
    setDialogOpen(false);
  };

  const handleSaveChanges = () => {
    playClickSound();
    console.log('[handleSaveChanges] called', { useSplitPayment, hasExistingSplitPayment: isInUse && [currentPaymentCash && currentPaymentCash > 0, currentPaymentCard && currentPaymentCard > 0, currentPaymentTransfer && currentPaymentTransfer > 0].filter(Boolean).length > 1, paymentCash, paymentCard, paymentTransfer, hasPrepaidAdditionalFee, prepaidAdditionalFeeAmount, prepaidAdditionalFeePaymentMethod });
    
    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free' = 'none';
    let optionAmount: number | undefined;

    if (isStaff || isFreeEntry) {
      optionType = 'free';
      optionAmount = 0;
    } else if (isDirectPrice && directPrice) {
      optionType = 'direct_price';
      optionAmount = parseInt(directPrice);
    } else if (isForeigner) {
      if (discountOption !== 'none') {
        // 외국인 요금에 할인 옵션 적용 시 최종 계산 금액으로 저장
        optionType = 'direct_price';
        optionAmount = calculateFinalPrice();
      } else {
        optionType = 'foreigner';
      }
    } else if (discountOption === 'discount') {
      optionType = 'discount';
      optionAmount = discountAmount;
    } else if (discountOption.startsWith('pricing_')) {
      // 사용자 정의 요금옵션 - direct_price로 저장 (최종 계산된 금액)
      optionType = 'direct_price';
      optionAmount = calculateFinalPrice();
    } else if (discountOption === 'custom' && discountInputAmount) {
      optionType = 'custom';
      optionAmount = parseInt(discountInputAmount);
    }
    
    const computedFinalPrice = calculateFinalPrice();
    
    // 선지급금 정보를 메모에 자동 기록 (새로 선지급금을 추가하는 경우에만)
    const prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
    // 결제 버킷 할당 시 선지급금 포함 총액 (optionAmount는 기본요금만 사용)
    const totalPriceForPayment = computedFinalPrice + prepaidAmount;
    let finalCustomerMemo = customerMemo;
    if (prepaidAmount > 0 && prepaidAmount !== currentPrepaidAdditionalFee) {
      // 새로운 선지급금이 추가되거나 금액이 변경된 경우에만 메모 추가
      const checkTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      const prepaidMemoText = `[${checkTime}] 추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      // 중복 방지: 같은 금액의 선지급 기록이 있으면 추가하지 않음
      const prepaidPattern = `추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      if (!customerMemo.includes(prepaidPattern)) {
        finalCustomerMemo = customerMemo.trim() 
          ? `${customerMemo}\n${prepaidMemoText}` 
          : prepaidMemoText;
        setCustomerMemo(finalCustomerMemo);
      }
    }
    
    // Get payment breakdown
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    // 기존 분리결제 데이터가 있는지 확인 (isInUse이고 여러 결제 수단에 값이 있음)
    const hasExistingSplitPayment = isInUse && [
      currentPaymentCash && currentPaymentCash > 0,
      currentPaymentCard && currentPaymentCard > 0,
      currentPaymentTransfer && currentPaymentTransfer > 0,
    ].filter(Boolean).length > 1;
    
    // 기존 단일결제 데이터가 있는지 확인
    const hasExistingSinglePayment = isInUse && (
      (currentPaymentCash && currentPaymentCash > 0) ||
      (currentPaymentCard && currentPaymentCard > 0) ||
      (currentPaymentTransfer && currentPaymentTransfer > 0)
    ) && !hasExistingSplitPayment;
    
    // 선지급금 환불로 인해 결제금액이 수정되었는지 확인
    // 환불 처리 시 모든 결제금액 상태가 설정됨 (빈 문자열이 아님)
    const paymentModifiedByRefund = paymentCash !== "" && paymentCard !== "" && paymentTransfer !== "";
    
    
    if (useSplitPayment) {
      if (hasExistingSplitPayment && paymentModifiedByRefund) {
        // 환불로 인해 결제금액이 수정된 경우 수정된 값 사용
        // 분리결제 필드에는 기본 금액(VAT 미포함)이 표시되므로 VAT를 다시 적용해야 함
        let cashBase = parseInt(paymentCash) || 0;
        let cardBase = parseInt(paymentCard) || 0;
        let transferBase = parseInt(paymentTransfer) || 0;
        
        // 음수가 되지 않는지만 확인
        if (cashBase < 0 || cardBase < 0 || transferBase < 0) {
          toast({
            title: "결제 금액 오류",
            description: "결제 금액이 0원 미만이 될 수 없습니다.",
            variant: "destructive",
          });
          return;
        }
        
        // 기본 금액에 VAT 적용하여 저장
        const settings = localDb.getSettings();
        
        // 현금/이체: 현금영수증 체크 시에만 부가세 적용
        if (settings.enableCashReceiptVat && isCashReceipt) {
          if (cashBase > 0) {
            cashVal = Math.round(cashBase * 1.1);
          }
          if (transferBase > 0) {
            transferVal = Math.round(transferBase * 1.1);
          }
        } else {
          cashVal = cashBase > 0 ? cashBase : undefined;
          transferVal = transferBase > 0 ? transferBase : undefined;
        }
        
        // 카드: 카드 부가세 설정이 ON이면 자동 적용
        if (settings.enableCardVat && cardBase > 0) {
          cardVal = Math.round(cardBase * 1.1);
        } else {
          cardVal = cardBase > 0 ? cardBase : undefined;
        }

        // 새 선지급금이 추가된 경우 해당 결제 버킷에 금액 합산
        const savePrepaidMethodSplitR = (prepaidAdditionalFeePaymentMethod || paymentMethod || 'cash') as 'cash' | 'card' | 'transfer';
        const isNewPrepaidAddedSplitR =
          hasPrepaidAdditionalFee &&
          prepaidAmount > 0 &&
          prepaidAmount !== currentPrepaidAdditionalFee;
        if (isNewPrepaidAddedSplitR) {
          const addedPrepaid = prepaidAmount - (currentPrepaidAdditionalFee || 0);
          if (savePrepaidMethodSplitR === 'cash') cashVal = (cashVal || 0) + addedPrepaid;
          else if (savePrepaidMethodSplitR === 'card') cardVal = (cardVal || 0) + addedPrepaid;
          else if (savePrepaidMethodSplitR === 'transfer') transferVal = (transferVal || 0) + addedPrepaid;
        }
      } else if (hasExistingSplitPayment && !paymentModifiedByRefund) {
        // 기존 분리결제가 있고 환불 수정이 없으면 기존 값 사용
        // 단, 새 선지급금이 추가된 경우 해당 결제 버킷에 금액 합산
        const savePrepaidMethodSplit = prepaidAdditionalFeePaymentMethod || paymentMethod;
        const isNewPrepaidAddedToSplit =
          hasPrepaidAdditionalFee &&
          prepaidAmount > 0 &&
          prepaidAmount !== currentPrepaidAdditionalFee;

        if (isNewPrepaidAddedToSplit) {
          const addedPrepaid = prepaidAmount - (currentPrepaidAdditionalFee || 0);
          cashVal = currentPaymentCash || undefined;
          cardVal = currentPaymentCard || undefined;
          transferVal = currentPaymentTransfer || undefined;
          if (savePrepaidMethodSplit === 'cash') cashVal = (cashVal || 0) + addedPrepaid;
          else if (savePrepaidMethodSplit === 'card') cardVal = (cardVal || 0) + addedPrepaid;
          else if (savePrepaidMethodSplit === 'transfer') transferVal = (transferVal || 0) + addedPrepaid;
        } else {
          cashVal = currentPaymentCash;
          cardVal = currentPaymentCard;
          transferVal = currentPaymentTransfer;
        }
      } else {
        // 신규 분리결제: 검증 수행 (선지급금 포함 총액으로 검증)
        if (!validateMixedPayment(totalPriceForPayment)) {
          return;
        }
        cashVal = parseInt(paymentCash) || undefined;
        cardVal = parseInt(paymentCard) || undefined;
        transferVal = parseInt(paymentTransfer) || undefined;
        
        // 분리결제 시 부가세 적용
        const settings = localDb.getSettings();
        
        // 현금/이체: 현금영수증 체크 시에만 부가세 적용
        if (settings.enableCashReceiptVat && isCashReceipt) {
          if (cashVal) {
            cashVal = Math.round(cashVal * 1.1);
          }
          if (transferVal) {
            transferVal = Math.round(transferVal * 1.1);
          }
        }
        
        // 카드: 카드 부가세 설정이 ON이면 자동 적용
        if (settings.enableCardVat && cardVal) {
          cardVal = Math.round(cardVal * 1.1);
        }
      }
    } else {
      // 결제방식 변경 여부 확인 (핵심!)
      const paymentMethodChanged = paymentMethod !== currentPaymentMethod;
      
      // 결제방식이 변경된 경우: 새로운 결제방식으로 금액 재할당 (우선순위 최상위, 선지급금 포함 총액)
      if (paymentMethodChanged) {
        if (paymentMethod === 'cash') {
          cashVal = totalPriceForPayment;
          cardVal = undefined;
          transferVal = undefined;
        } else if (paymentMethod === 'card') {
          cashVal = undefined;
          cardVal = totalPriceForPayment;
          transferVal = undefined;
        } else if (paymentMethod === 'transfer') {
          cashVal = undefined;
          cardVal = undefined;
          transferVal = totalPriceForPayment;
        }
        
        // 단일 결제 시 부가세 적용
        const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
        if (vatApplied) {
          const priceWithVat = Math.round(totalPriceForPayment * 1.1);
          if (paymentMethod === 'cash') {
            cashVal = priceWithVat;
          } else if (paymentMethod === 'card') {
            cardVal = priceWithVat;
          } else if (paymentMethod === 'transfer') {
            transferVal = priceWithVat;
          }
          // optionAmount는 기본요금만 (direct_price인 경우)
          if (optionType === 'direct_price') {
            optionAmount = Math.round(computedFinalPrice * 1.1);
          }
        }
      } else if (hasExistingSinglePayment && paymentModifiedByRefund) {
        // 환불로 인해 결제금액이 수정된 경우, 또는 단순히 paymentCard/Transfer 초기값이 "0"이어서
        // paymentModifiedByRefund가 true로 평가된 경우 모두 이 분기에서 처리
        let cashBase = parseInt(paymentCash) || 0;
        let cardBase = parseInt(paymentCard) || 0;
        let transferBase = parseInt(paymentTransfer) || 0;
        
        // 음수가 되지 않는지만 확인
        if (cashBase < 0 || cardBase < 0 || transferBase < 0) {
          toast({
            title: "결제 금액 오류",
            description: "결제 금액이 0원 미만이 될 수 없습니다.",
            variant: "destructive",
          });
          return;
        }
        
        // 기본 금액에 VAT 적용하여 저장
        const settings = localDb.getSettings();
        
        // 현금/이체: 현금영수증 체크 시에만 부가세 적용
        if (settings.enableCashReceiptVat && isCashReceipt) {
          if (cashBase > 0) {
            cashVal = Math.round(cashBase * 1.1);
          }
          if (transferBase > 0) {
            transferVal = Math.round(transferBase * 1.1);
          }
        } else {
          cashVal = cashBase > 0 ? cashBase : undefined;
          transferVal = transferBase > 0 ? transferBase : undefined;
        }
        
        // 카드: 카드 부가세 설정이 ON이면 자동 적용
        if (settings.enableCardVat && cardBase > 0) {
          cardVal = Math.round(cardBase * 1.1);
        } else {
          cardVal = cardBase > 0 ? cardBase : undefined;
        }

        // 새 선지급금이 추가된 경우 해당 결제 버킷에 금액 추가
        // (동일 결제방식이든 다른 결제방식이든 모두 처리)
        // paymentCard="0"/paymentTransfer="0" 초기값으로 인해 이 분기로 오는 경우 포함
        const savePrepaidMethodR = (prepaidAdditionalFeePaymentMethod || paymentMethod || 'cash') as 'cash' | 'card' | 'transfer';
        const isNewPrepaidR =
          hasPrepaidAdditionalFee &&
          prepaidAmount > 0 &&
          prepaidAmount !== currentPrepaidAdditionalFee;
        if (isNewPrepaidR) {
          const addedPrepaid = prepaidAmount - (currentPrepaidAdditionalFee || 0);
          if (savePrepaidMethodR === 'cash') cashVal = (cashVal || 0) + addedPrepaid;
          else if (savePrepaidMethodR === 'card') cardVal = (cardVal || 0) + addedPrepaid;
          else if (savePrepaidMethodR === 'transfer') transferVal = (transferVal || 0) + addedPrepaid;
        }
      } else if (hasExistingSinglePayment && !paymentModifiedByRefund && paymentMethod === currentPaymentMethod) {
        // 기존 단일결제가 있고 환불 수정이 없고 결제방식도 변경되지 않았으면 기존 값 사용
        // 단, 요금이 변경된 경우(직접입력 등)에는 새 금액으로 결제 재계산
        const savePrepaidMethod = (prepaidAdditionalFeePaymentMethod || paymentMethod || 'cash') as 'cash' | 'card' | 'transfer';
        const isNewPrepaidAdded =
          hasPrepaidAdditionalFee &&
          prepaidAmount > 0 &&
          prepaidAmount !== currentPrepaidAdditionalFee;

        // 기존 결제 합계와 새 계산 요금 비교 → 요금이 바뀐 경우 결제액도 재계산 (선지급금 포함 총액 비교)
        const existingPaymentSum = (currentPaymentCash || 0) + (currentPaymentCard || 0) + (currentPaymentTransfer || 0);
        const priceChangedFromExisting = totalPriceForPayment !== existingPaymentSum;

        if (isNewPrepaidAdded) {
          const addedPrepaid = prepaidAmount - (currentPrepaidAdditionalFee || 0);
          cashVal = currentPaymentCash || undefined;
          cardVal = currentPaymentCard || undefined;
          transferVal = currentPaymentTransfer || undefined;
          if (savePrepaidMethod === 'cash') cashVal = (cashVal || 0) + addedPrepaid;
          else if (savePrepaidMethod === 'card') cardVal = (cardVal || 0) + addedPrepaid;
          else if (savePrepaidMethod === 'transfer') transferVal = (transferVal || 0) + addedPrepaid;
        } else if (priceChangedFromExisting) {
          // 요금이 변경됨 → 새 금액으로 결제 재할당 (부가세 포함, 선지급금 포함 총액 사용)
          if (paymentMethod === 'cash') { cashVal = totalPriceForPayment; cardVal = undefined; transferVal = undefined; }
          else if (paymentMethod === 'card') { cashVal = undefined; cardVal = totalPriceForPayment; transferVal = undefined; }
          else if (paymentMethod === 'transfer') { cashVal = undefined; cardVal = undefined; transferVal = totalPriceForPayment; }
          const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
          if (vatApplied) {
            const priceWithVat = Math.round(totalPriceForPayment * 1.1);
            if (paymentMethod === 'cash') cashVal = priceWithVat;
            else if (paymentMethod === 'card') cardVal = priceWithVat;
            else if (paymentMethod === 'transfer') transferVal = priceWithVat;
            if (optionType === 'direct_price') optionAmount = Math.round(computedFinalPrice * 1.1);
          }
        } else {
          cashVal = currentPaymentCash;
          cardVal = currentPaymentCard;
          transferVal = currentPaymentTransfer;
        }
      } else {
        // 신규 단일결제: 금액 할당 및 부가세 적용 (선지급금 포함 총액 사용)
        if (paymentMethod === 'cash') {
          cashVal = totalPriceForPayment;
          cardVal = undefined;
          transferVal = undefined;
        } else if (paymentMethod === 'card') {
          cashVal = undefined;
          cardVal = totalPriceForPayment;
          transferVal = undefined;
        } else if (paymentMethod === 'transfer') {
          cashVal = undefined;
          cardVal = undefined;
          transferVal = totalPriceForPayment;
        }
        
        // 단일 결제 시 부가세 적용
        const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
        if (vatApplied) {
          const priceWithVat = Math.round(totalPriceForPayment * 1.1);
          if (paymentMethod === 'cash') {
            cashVal = priceWithVat;
          } else if (paymentMethod === 'card') {
            cardVal = priceWithVat;
          } else if (paymentMethod === 'transfer') {
            transferVal = priceWithVat;
          }
          // optionAmount는 기본요금만 (direct_price인 경우)
          if (optionType === 'direct_price') {
            optionAmount = Math.round(computedFinalPrice * 1.1);
          }
        }
      }
    }

    const generatedNotes = generateNotes();
    const rentalItemInfo = generateRentalItemInfo();
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    // 후불결제 상태 전달 (체크 해제 시 결제 완료 처리)
    // 기존 입실 수정 시 noAdditionalFee 상태 - 체크박스의 현재 상태 사용
    const prepaidFee = hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount ? parseInt(prepaidAdditionalFeeAmount) : 0;

    // 사용자가 명시적으로 변경한 경우에만 추가요금 결제방식 저장
    // 변경하지 않은 경우 undefined → updateEntry에서 기존 DB 값 보존 (기본값 'cash'로 덮어쓰기 방지)
    const finalAdditionalFeePaymentMethod = additionalFeePaymentMethodUserChangedRef.current
      ? additionalFeePaymentMethod
      : undefined;

    // try-catch: onApply 및 이후 DB 작업에서 예외 발생 시에도 dialog가 항상 닫히도록 보장
    try {
      onApply(optionType, optionAmount, generatedNotes, finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, isDeferredPayment, finalCustomerMemo, noAdditionalFee, prepaidFee, isCashReceipt, finalAdditionalFeePaymentMethod, isStaff);
      
      // 수정저장 후 추가요금 결제방식이 loadData 리프레시로 인해 리셋되지 않도록 잠금
      additionalFeePaymentMethodUserChangedRef.current = true;
      
      // CRITICAL: For existing entries (isInUse), save the customer memo directly to DB
      if (isInUse && currentLockerLogId) {
        localDb.updateLockerLogMemo(currentLockerLogId, finalCustomerMemo);
        // 외출 상태 저장 (수정저장 시에만 반영)
        localDb.updateLockerOuting(currentLockerLogId, currentIsOuting);
        
        // 추가요금 완납 상태 저장 (checkoutResolved 또는 additionalFeeResolved가 true인 경우)
        // 현재 추가요금 총액을 저장하여 새로운 추가요금 발생 시 감지 가능
        if (checkoutResolved || additionalFeeResolved) {
          // 추가요금 직접 계산 (additionalFeeInfo가 아직 정의되지 않았을 수 있음)
          // noAdditionalFee가 true이면 추가요금 0
          let currentFee = 0;
          if (!currentNoAdditionalFee) {
            const isForeigner = currentOptionType === 'foreigner';
            const isFreeEntry = currentOptionType === 'free';
            const feeInfo = calculateAdditionalFee(
              entryTime || '',
              timeType,
              dayPrice,
              nightPrice,
              new Date(),
              isForeigner,
              foreignerPrice,
              domesticCheckpointHour,
              foreignerAdditionalFeePeriod,
              isFreeEntry,
              domesticAdditionalFeeMode,
              nightStartHour
            );
            currentFee = feeInfo.additionalFee;
          }
          console.log('[DEBUG] 수정저장: 추가요금 완납 저장', { logId: currentLockerLogId, currentFee, checkoutResolved, additionalFeeResolved });
          localDb.updateLockerLogAdditionalFeePaid(currentLockerLogId, true, currentFee);
        }
      }
      
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
    } catch (err) {
      console.error('[handleSaveChanges] 저장 중 오류 발생 (dialog는 닫힙니다):', err);
    }

    // 항상 dialog 닫기 (예외 발생 여부와 무관)
    playCloseSound();
    setTimeout(() => setDialogOpen(false), 100);
  };

  const handleCheckoutClick = () => {
    playClickSound();
    
    // NOTE: Warning check removed - warning already shows when dialog first opens
    // Redundant check was causing infinite loop when user clicked checkout after warning close
    
    // 기본요금과 추가요금을 독립적으로 처리
    const baseFinalPrice = calculateFinalPrice();
    // 선지급금이 이미 분리결제 필드에 합산되어 있으므로, 검증 시 선지급금 포함해야 함
    const prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
    const computedFinalPrice = baseFinalPrice + prepaidAmount;
    
    // 기본요금 결제 검증 및 할당 (선지급금 포함)
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      // Validate mixed payment amounts for split payment (선지급금 포함 전체 금액 검증)
      if (!validateMixedPayment(computedFinalPrice)) {
        return;
      }
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
      
      // 분리결제 시 부가세 적용
      const settings = localDb.getSettings();
      
      // 현금/이체: 현금영수증 체크 시에만 부가세 적용
      if (settings.enableCashReceiptVat && isCashReceipt) {
        if (cashVal) {
          cashVal = Math.round(cashVal * 1.1);
        }
        if (transferVal) {
          transferVal = Math.round(transferVal * 1.1);
        }
      }
      
      // 카드: 카드 부가세 설정이 ON이면 자동 적용
      if (settings.enableCardVat && cardVal) {
        cardVal = Math.round(cardVal * 1.1);
      }
    } else {
      // Single payment method - automatically assign full amount (기본요금만)
      // 부가세 적용
      const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
      const priceToAssign = vatApplied 
        ? Math.round(computedFinalPrice * 1.1) 
        : computedFinalPrice;
      
      if (paymentMethod === 'cash') {
        cashVal = priceToAssign;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = priceToAssign;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = priceToAssign;
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
        let addCashVal = parseInt(additionalFeePaymentCash) || 0;
        let addCardVal = parseInt(additionalFeePaymentCard) || 0;
        let addTransferVal = parseInt(additionalFeePaymentTransfer) || 0;
        const addTotal = addCashVal + addCardVal + addTransferVal;
        
        if (addTotal !== discountedAdditionalFee) {
          toast({
            title: "결제 금액 오류",
            description: `추가요금 분리결제 합계(${addTotal.toLocaleString()}원)가 할인 적용된 추가요금(${discountedAdditionalFee.toLocaleString()}원)과 일치하지 않습니다.`,
            variant: "destructive",
          });
          return;
        }
        
        // 분리결제 시 부가세 적용
        const settings = localDb.getSettings();
        
        // 현금/이체: 현금영수증 체크 시에만 부가세 적용
        if (settings.enableCashReceiptVat && isAdditionalFeeCashReceipt) {
          if (addCashVal > 0) {
            addCashVal = Math.round(addCashVal * 1.1);
          }
          if (addTransferVal > 0) {
            addTransferVal = Math.round(addTransferVal * 1.1);
          }
        }
        
        // 카드: 카드 부가세 설정이 ON이면 자동 적용
        if (settings.enableCardVat && addCardVal > 0) {
          addCardVal = Math.round(addCardVal * 1.1);
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
        // 부가세 적용
        const additionalFeeVatApplied = shouldApplyVat(additionalFeePaymentMethod, isAdditionalFeeCashReceipt);
        const finalAdditionalFee = additionalFeeVatApplied 
          ? Math.round(discountedAdditionalFee * 1.1) 
          : discountedAdditionalFee;
        
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: additionalFeePaymentMethod === 'cash' ? finalAdditionalFee : undefined,
          card: additionalFeePaymentMethod === 'card' ? finalAdditionalFee : undefined,
          transfer: additionalFeePaymentMethod === 'transfer' ? finalAdditionalFee : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      }
    }
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    
    // Check if there are any rental items
    const parsedRefundAmountClick = showRefund ? (parseInt(refundAmount) || 0) : 0;
    const finalRefundNoteClick = showRefund && parsedRefundAmountClick > 0 ? refundNote : undefined;

    if (selectedRentalItems.size > 0) {
      setShowCheckoutConfirm(true);
    } else {
      const rentalItemInfo = generateRentalItemInfo();
      onCheckout(
        finalPaymentMethod,
        rentalItemInfo,
        cashVal,
        cardVal,
        transferVal,
        additionalFeePayment,
        customerMemo,
        parsedRefundAmountClick > 0 ? parsedRefundAmountClick : undefined,
        finalRefundNoteClick,
        parsedRefundAmountClick > 0 ? refundMethod : undefined
      );
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
      
      // 분리결제 시 부가세 적용
      const settings = localDb.getSettings();
      
      // 현금/이체: 현금영수증 체크 시에만 부가세 적용
      if (settings.enableCashReceiptVat && isCashReceipt) {
        if (cashVal) {
          cashVal = Math.round(cashVal * 1.1);
        }
        if (transferVal) {
          transferVal = Math.round(transferVal * 1.1);
        }
      }
      
      // 카드: 카드 부가세 설정이 ON이면 자동 적용
      if (settings.enableCardVat && cardVal) {
        cardVal = Math.round(cardVal * 1.1);
      }
    } else {
      // Single payment method - automatically assign full amount (기본요금만)
      // 부가세 적용
      const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
      const priceToAssign = vatApplied 
        ? Math.round(computedFinalPrice * 1.1) 
        : computedFinalPrice;
      
      if (paymentMethod === 'cash') {
        cashVal = priceToAssign;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = priceToAssign;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = priceToAssign;
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
        let addCashVal = parseInt(additionalFeePaymentCash) || 0;
        let addCardVal = parseInt(additionalFeePaymentCard) || 0;
        let addTransferVal = parseInt(additionalFeePaymentTransfer) || 0;
        
        // 분리결제 시 부가세 적용
        const settings = localDb.getSettings();
        
        // 현금/이체: 현금영수증 체크 시에만 부가세 적용
        if (settings.enableCashReceiptVat && isAdditionalFeeCashReceipt) {
          if (addCashVal > 0) {
            addCashVal = Math.round(addCashVal * 1.1);
          }
          if (addTransferVal > 0) {
            addTransferVal = Math.round(addTransferVal * 1.1);
          }
        }
        
        // 카드: 카드 부가세 설정이 ON이면 자동 적용
        if (settings.enableCardVat && addCardVal > 0) {
          addCardVal = Math.round(addCardVal * 1.1);
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
        // 부가세 적용
        const additionalFeeVatApplied = shouldApplyVat(additionalFeePaymentMethod, isAdditionalFeeCashReceipt);
        const finalAdditionalFee = additionalFeeVatApplied 
          ? Math.round(discountedAdditionalFee * 1.1) 
          : discountedAdditionalFee;
        
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: additionalFeePaymentMethod === 'cash' ? finalAdditionalFee : undefined,
          card: additionalFeePaymentMethod === 'card' ? finalAdditionalFee : undefined,
          transfer: additionalFeePaymentMethod === 'transfer' ? finalAdditionalFee : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      }
    }
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    const parsedRefundAmount = showRefund ? (parseInt(refundAmount) || 0) : 0;
    const finalRefundNote = showRefund && parsedRefundAmount > 0 ? refundNote : undefined;
    onCheckout(
      finalPaymentMethod,
      rentalItemInfo,
      cashVal,
      cardVal,
      transferVal,
      additionalFeePayment,
      customerMemo,
      parsedRefundAmount > 0 ? parsedRefundAmount : undefined,
      finalRefundNote,
      parsedRefundAmount > 0 ? refundMethod : undefined
    );
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
      // 다이얼로그 닫힐 때 현금영수증 상태 리셋
      setIsCashReceipt(false);
      setIsAdditionalFeeCashReceipt(false);
      playCloseSound();
      onClose();
    }
  };

  // Locker swap handlers
  const handleSwapClick = () => {
    playClickSound();
    setSwapTargetLocker("");
    setSelectedSwapLocker(null);
    setShowSwapDialog(true);
  };

  const handleSwapSubmit = () => {
    const targetNumber = parseInt(swapTargetLocker);
    
    // 유효성 검사 - 설정된 락카 그룹 번호만 허용
    const groups = localDb.getLockerGroups();
    const configuredNumbers = new Set<number>();
    groups.forEach((g: any) => {
      for (let i = g.startNumber; i <= g.endNumber; i++) {
        configuredNumbers.add(i);
      }
    });

    if (isNaN(targetNumber) || !configuredNumbers.has(targetNumber)) {
      toast({
        title: "오류",
        description: "시스템 설정에 등록된 락카 번호만 입력할 수 있습니다.",
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
    playClickSound();
    setShowLinkDialog(false);
    setShowLinkConfirm(true);
  };

  const handleLinkConfirm = async () => {
    playClickSound();
    
    try {
      const childLockerNumbers = Array.from(selectedChildLockers);
      // 0개 선택 시 모든 자식 락카 연결 해제
      const result = localDb.setParentChildLinks(lockerNumber, childLockerNumbers);
      
      if (result.success) {
        let newMemo: string;
        if (childLockerNumbers.length === 0) {
          newMemo = `[락카묶기 해제] ${lockerNumber}번 부모 락카의 모든 묶기 해제`;
        } else {
          const childList = childLockerNumbers.join(", ");
          newMemo = `[락카묶기] ${lockerNumber}번 부모 락카로 ${childList}번과 함께 묶음`;
        }
        setCustomerMemo(newMemo);
        
        toast({
          title: childLockerNumbers.length === 0 ? "묶기 해제 완료" : "락카묶기 완료",
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

  // 자식 락카에서 직접 묶기 해제 (확인창 바로 표시)
  const handleUnlinkFromParent = () => {
    playClickSound();
    setUnlinkMode(true);
    setShowChangeParentConfirm(true);
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
  // noAdditionalFee가 true이면 추가요금 완전 면제
  const isCurrentlyForeigner = currentOptionType === 'foreigner';
  const isCurrentlyFreeEntry = currentOptionType === 'free';
  const rawAdditionalFeeInfo = entryTime && isInUse
    ? (currentNoAdditionalFee 
        ? { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0 }
        : calculateAdditionalFee(entryTime, timeType, dayPrice, nightPrice, new Date(), isCurrentlyForeigner, foreignerPrice, domesticCheckpointHour, foreignerAdditionalFeePeriod, isCurrentlyFreeEntry, domesticAdditionalFeeMode, nightStartHour))
    : { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0 };
  
  // 선지급 금액 차감 적용 - 다이얼로그에서 입력 중인 값 우선 사용 (미리보기)
  // hasPrepaidAdditionalFee가 true이고 금액이 입력되어 있으면 입력값 사용, 아니면 저장된 값 사용
  const effectivePrepaidAmount = hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount 
    ? parseInt(prepaidAdditionalFeeAmount) || 0 
    : (currentPrepaidAdditionalFee || 0);
  const netAdditionalFee = Math.max(0, rawAdditionalFeeInfo.additionalFee - effectivePrepaidAmount);
  const additionalFeeInfo = {
    ...rawAdditionalFeeInfo,
    additionalFee: netAdditionalFee,
    prepaidAmount: effectivePrepaidAmount,
    rawAdditionalFee: rawAdditionalFeeInfo.additionalFee,
  };
  
  // Note: Additional fee comparison is now done in the dialog open useEffect above
  // This separate useEffect is no longer needed as we calculate fees directly when dialog opens

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
            <div className="flex items-center gap-4">
              {/* 큰 원형 락카번호 배지 */}
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-500 text-white text-3xl font-bold shadow-md">
                {lockerNumber}
              </div>
              <h2 className="text-xl font-semibold">
                락커 {lockerNumber}번 - {isInUse ? '옵션 수정' : '입실 처리'}
              </h2>
            </div>
            <div className="flex gap-1">
              {onMinimize && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={onMinimize}
                  className="h-8 w-8"
                  title="최소화"
                >
                  _
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleCloseClick}
                className="h-8 w-8"
                title="닫기"
              >
                ✕
              </Button>
            </div>
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

            {/* 요금직접입력 체크박스 - 직원일 때는 숨김 */}
            {!isStaff && (
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
                  type="text"
                  placeholder="최종 요금 입력"
                  value={directPrice}
                  onChange={(e) => setDirectPrice(e.target.value)}
                  data-testid="input-direct-price"
                />
              )}
            </div>
            )}

            {/* 외국인 체크박스 - 설정에서 활성화된 경우에만 표시 */}
            {enableForeignerOption && !isDirectPrice && !isFreeEntry && !isStaff && (
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

            {/* 직원 체크박스 - 신규 입실에서만 표시 */}
            {!isInUse && !isDirectPrice && !isForeigner && !isFreeEntry && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="is-staff" 
                  checked={isStaff}
                  onCheckedChange={(checked) => {
                    setIsStaff(checked as boolean);
                    if (checked) {
                      setDiscountOption("none");
                      setDiscountInputAmount("");
                    }
                  }}
                  data-testid="checkbox-is-staff"
                />
                <Label htmlFor="is-staff" className="text-sm font-semibold cursor-pointer text-pink-600 dark:text-pink-400">
                  직원 (0원)
                </Label>
              </div>
            )}

            {/* 무료입장 체크박스 - 신규 입실에서만 표시 */}
            {!isInUse && !isDirectPrice && !isForeigner && !isStaff && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="free-entry" 
                  checked={isFreeEntry}
                  onCheckedChange={(checked) => {
                    setIsFreeEntry(checked as boolean);
                    if (checked) {
                      setDiscountOption("none");
                      setDiscountInputAmount("");
                    } else {
                      // 무료입장 해제 시 추가요금없음도 해제
                      setNoAdditionalFee(false);
                    }
                  }}
                  data-testid="checkbox-free-entry"
                />
                <Label htmlFor="free-entry" className="text-sm font-semibold cursor-pointer text-green-600 dark:text-green-400">
                  무료입장 (0원)
                </Label>
              </div>
            )}
            
            {/* 추가요금없음 체크박스 - 무료입장 선택 시에만 표시 (VIP, 지인 등) */}
            {!isInUse && isFreeEntry && (
              <div className="flex items-center space-x-2 ml-6">
                <Checkbox 
                  id="no-additional-fee" 
                  checked={noAdditionalFee}
                  onCheckedChange={(checked) => setNoAdditionalFee(checked as boolean)}
                  data-testid="checkbox-no-additional-fee"
                />
                <Label htmlFor="no-additional-fee" className="text-sm font-semibold cursor-pointer text-purple-600 dark:text-purple-400">
                  추가요금없음 (VIP/지인)
                </Label>
              </div>
            )}

            {/* 추가요금 선지급 체크박스 - 무료입장/직원/추가요금없음이 아닌 경우에만 표시 */}
            {!isFreeEntry && !isStaff && !noAdditionalFee && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="prepaid-additional-fee" 
                    checked={hasPrepaidAdditionalFee}
                    onCheckedChange={(checked) => {
                      if (!checked && isInUse && currentPrepaidAdditionalFee > 0) {
                        // 기존 입실 중인 상태에서 선지급금을 취소하는 경우
                        // 분리결제인 경우에만 환불 방식 선택 다이얼로그 표시
                        const hasSplitPayment = [
                          currentPaymentCash && currentPaymentCash > 0,
                          currentPaymentCard && currentPaymentCard > 0,
                          currentPaymentTransfer && currentPaymentTransfer > 0,
                        ].filter(Boolean).length > 1;
                        
                        // 라이브 상태 값이 있으면 사용, 없으면 props 사용
                        // 참고: 분리결제 필드에는 기본 금액(VAT 제외)이 표시됨
                        const liveCashBase = paymentCash !== "" ? parseInt(paymentCash) || 0 : (currentPaymentCash || 0);
                        const liveCardBase = paymentCard !== "" ? parseInt(paymentCard) || 0 : (currentPaymentCard || 0);
                        const liveTransferBase = paymentTransfer !== "" ? parseInt(paymentTransfer) || 0 : (currentPaymentTransfer || 0);
                        
                        // 환불 다이얼로그에서는 VAT 포함 금액으로 표시해야 함
                        // 현금/이체: enableCashReceiptVat && isCashReceipt인 경우 VAT 적용
                        // 카드: enableCardVat인 경우 VAT 적용
                        const cashWithVat = (enableCashReceiptVat && isCashReceipt && liveCashBase > 0) 
                          ? Math.round(liveCashBase * 1.1) : liveCashBase;
                        const cardWithVat = (enableCardVat && liveCardBase > 0) 
                          ? Math.round(liveCardBase * 1.1) : liveCardBase;
                        const transferWithVat = (enableCashReceiptVat && isCashReceipt && liveTransferBase > 0) 
                          ? Math.round(liveTransferBase * 1.1) : liveTransferBase;
                        
                        // 기본 환불 금액 = 선지급 금액 그대로
                        const basePrepaidAmount = currentPrepaidAdditionalFee;
                        
                        if (hasSplitPayment) {
                          // 분리결제: 환불 방식 선택 다이얼로그 표시
                          // VAT 포함 금액으로 저장 (환불 다이얼로그에서 VAT 포함 금액으로 표시)
                          setPendingPrepaidCancellation({
                            originalAmount: basePrepaidAmount, // 기본 선지급 금액 (VAT 미적용)
                            originalPaymentCash: cashWithVat,   // VAT 포함 금액
                            originalPaymentCard: cardWithVat,   // VAT 포함 금액
                            originalPaymentTransfer: transferWithVat, // VAT 포함 금액
                          });
                          setShowPrepaidRefundDialog(true);
                          return; // 체크박스 상태 변경 보류
                        } else {
                          // 단일결제: 결제수단에서 자동 차감 (기본 금액 기준)
                          let newCashBase = liveCashBase;
                          let newCardBase = liveCardBase;
                          let newTransferBase = liveTransferBase;
                          
                          // 환불은 기본 금액(선지급 원금)에서 차감
                          // 분리결제 필드에는 기본 금액이 표시되므로 기본 금액에서 차감
                          if (newCashBase > 0 || cashWithVat > 0) {
                            // 현금에서 차감 (기본 금액 기준)
                            newCashBase = Math.max(0, liveCashBase - basePrepaidAmount);
                          } else if (newCardBase > 0 || cardWithVat > 0) {
                            // 카드에서 차감 (기본 금액 기준)
                            newCardBase = Math.max(0, liveCardBase - basePrepaidAmount);
                          } else if (newTransferBase > 0 || transferWithVat > 0) {
                            // 이체에서 차감 (기본 금액 기준)
                            newTransferBase = Math.max(0, liveTransferBase - basePrepaidAmount);
                          }
                          
                          // 환불 금액 계산 (메모용 - VAT 포함 여부에 따라)
                          let refundAmount = basePrepaidAmount;
                          if (liveCashBase > 0 && enableCashReceiptVat && isCashReceipt) {
                            refundAmount = Math.round(basePrepaidAmount * 1.1);
                          } else if (liveCardBase > 0 && enableCardVat) {
                            refundAmount = Math.round(basePrepaidAmount * 1.1);
                          } else if (liveTransferBase > 0 && enableCashReceiptVat && isCashReceipt) {
                            refundAmount = Math.round(basePrepaidAmount * 1.1);
                          }
                          
                          // 결제금액 상태 업데이트 (기본 금액으로 설정)
                          setPaymentCash(String(newCashBase));
                          setPaymentCard(String(newCardBase));
                          setPaymentTransfer(String(newTransferBase));
                          
                          // 선지급금 취소 메모 추가
                          const cancelTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                          const cancelMemoText = `[${cancelTime}] 선지급금 ${basePrepaidAmount.toLocaleString()}원 취소 (환불: ${refundAmount.toLocaleString()}원)`;
                          const updatedMemo = customerMemo.trim() 
                            ? `${customerMemo}\n${cancelMemoText}` 
                            : cancelMemoText;
                          setCustomerMemo(updatedMemo);
                          
                          setHasPrepaidAdditionalFee(false);
                          setPrepaidAdditionalFeeAmount("");
                        }
                      } else {
                        setHasPrepaidAdditionalFee(checked as boolean);
                        if (!checked) {
                          setPrepaidAdditionalFeeAmount("");
                        }
                      }
                    }}
                    data-testid="checkbox-prepaid-additional-fee"
                  />
                  <Label htmlFor="prepaid-additional-fee" className="text-sm font-semibold cursor-pointer text-blue-600 dark:text-blue-400">
                    추가요금 선지급 (야간요금/장기이용 미리 결제)
                  </Label>
                </div>
                {hasPrepaidAdditionalFee && (
                  <div className="ml-6 space-y-2">
                    <Input
                      type="text"
                      placeholder="선지급 금액 입력 (예: 5000)"
                      value={prepaidAdditionalFeeAmount}
                      onChange={(e) => setPrepaidAdditionalFeeAmount(e.target.value)}
                      className="w-full"
                      data-testid="input-prepaid-additional-fee"
                    />
                    {/* 선지급 결제방식 선택 (주결제방식과 다른 경우에만 필요) */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">선지급 결제방식 <span className="text-blue-500">(주결제방식과 다를 때 선택)</span></p>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={prepaidAdditionalFeePaymentMethod === null ? "default" : "outline"}
                          onClick={() => setPrepaidAdditionalFeePaymentMethod(null)}
                          data-testid="btn-prepaid-method-same"
                          className="text-xs"
                        >
                          주결제방식과 동일
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={prepaidAdditionalFeePaymentMethod === 'cash' ? "default" : "outline"}
                          onClick={() => setPrepaidAdditionalFeePaymentMethod('cash')}
                          data-testid="btn-prepaid-method-cash"
                          className="text-xs"
                        >
                          현금
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={prepaidAdditionalFeePaymentMethod === 'card' ? "default" : "outline"}
                          onClick={() => setPrepaidAdditionalFeePaymentMethod('card')}
                          data-testid="btn-prepaid-method-card"
                          className="text-xs"
                        >
                          카드
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={prepaidAdditionalFeePaymentMethod === 'transfer' ? "default" : "outline"}
                          onClick={() => setPrepaidAdditionalFeePaymentMethod('transfer')}
                          data-testid="btn-prepaid-method-transfer"
                          className="text-xs"
                        >
                          이체
                        </Button>
                      </div>
                      {prepaidAdditionalFeePaymentMethod !== null && prepaidAdditionalFeeAmount && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          기본요금 → {paymentMethod === 'cash' ? '현금' : paymentMethod === 'card' ? '카드' : '이체'} /
                          선지급 {parseInt(prepaidAdditionalFeeAmount).toLocaleString()}원 → {prepaidAdditionalFeePaymentMethod === 'cash' ? '현금' : prepaidAdditionalFeePaymentMethod === 'card' ? '카드' : '이체'} (자동 분리결제)
                        </p>
                      )}
                      {!prepaidAdditionalFeePaymentMethod && prepaidAdditionalFeeAmount && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {parseInt(prepaidAdditionalFeeAmount).toLocaleString()}원 선지급
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 요금 옵션 Select */}
            {!isDirectPrice && !isFreeEntry && !isStaff && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">요금 옵션</Label>
                <Select value={discountOption} onValueChange={setDiscountOption}>
                  <SelectTrigger data-testid="select-discount-option">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">없음 (정가)</SelectItem>
                    {/* 기본할인 - 설정에서 활성화된 경우에만 표시 */}
                    {enableDiscountOption && (
                      <SelectItem value="discount">기본할인 (-{discountAmount.toLocaleString()}원)</SelectItem>
                    )}
                    {/* 사용자 정의 요금옵션 */}
                    {pricingOptions.map((opt) => (
                      <SelectItem key={opt.id} value={`pricing_${opt.id}`}>
                        {opt.name} ({opt.optionType === 'discount' ? '-' : opt.optionType === 'surcharge' ? '+' : ''}{opt.amount.toLocaleString()}원{opt.optionType === 'fixed' ? ' 고정' : ''})
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">직접입력</SelectItem>
                  </SelectContent>
                </Select>
                {discountOption === "custom" && (
                  <Input
                    type="text"
                    placeholder="할인/할증 금액 입력 (음수=할인)"
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

            {/* 지불방식 - 무료입장/직원일 때는 숨김 */}
            {!isFreeEntry && !isStaff && (
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
                        type="text"
                        placeholder="0"
                        value={paymentCash}
                        onChange={(e) => {
                          const newCash = e.target.value;
                          setPaymentCash(newCash);
                          
                          // Auto-fill card with remaining amount (선지급금 포함)
                          const baseFinalPrice = calculateFinalPrice();
                          const prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
                          const computedFinalPrice = baseFinalPrice + prepaidAmount;
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
                        type="text"
                        placeholder="0"
                        value={paymentCard}
                        onChange={(e) => {
                          const newCard = e.target.value;
                          setPaymentCard(newCard);
                          
                          // Auto-fill transfer with remaining amount (선지급금 포함)
                          const baseFinalPrice = calculateFinalPrice();
                          const prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
                          const computedFinalPrice = baseFinalPrice + prepaidAmount;
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
                        type="text"
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
                    
                    // 분리결제 부가세 계산
                    const cashTransferVal = cashVal + transferVal;
                    const cashTransferVat = (enableCashReceiptVat && isCashReceipt && cashTransferVal > 0) 
                      ? Math.round(cashTransferVal * 0.1) : 0;
                    const cardVat = (enableCardVat && cardVal > 0) 
                      ? Math.round(cardVal * 0.1) : 0;
                    const totalWithVat = total + cashTransferVat + cardVat;
                    
                    return (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm font-semibold">합계</span>
                        <div className="text-right">
                          <span className="text-lg font-bold">{total.toLocaleString()}원</span>
                          {(cashTransferVat > 0 || cardVat > 0) && (
                            <span className="text-sm text-blue-600 dark:text-blue-400 ml-2">
                              (+부가세 {(cashTransferVat + cardVat).toLocaleString()}원 = {totalWithVat.toLocaleString()}원)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* 분리결제 현금영수증 체크박스 - 현금/이체 금액이 있을 때 표시 */}
                  {enableCashReceiptVat && ((parseInt(paymentCash) || 0) > 0 || (parseInt(paymentTransfer) || 0) > 0) && (
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox 
                        id="split-cash-receipt" 
                        checked={isCashReceipt}
                        onCheckedChange={(checked) => setIsCashReceipt(checked as boolean)}
                        data-testid="checkbox-split-cash-receipt"
                      />
                      <Label htmlFor="split-cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                        현금/이체 현금영수증 발행 (+10% 부가세)
                      </Label>
                    </div>
                  )}

                  {/* 분리결제 카드 부가세 안내 */}
                  {enableCardVat && (parseInt(paymentCard) || 0) > 0 && (
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        카드결제 금액에 부가세 10%가 자동으로 추가됩니다
                      </p>
                    </div>
                  )}
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
                    onClick={() => {
                      setPaymentMethod('card');
                      const cardSettings = localDb.getSettings();
                      if (cardSettings.cardPaymentAppEnabled && cardSettings.cardPaymentAppPackage) {
                        const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${cardSettings.cardPaymentAppPackage};end`;
                        window.location.href = intentUrl;
                      }
                    }}
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
              
              {/* 현금영수증 체크박스 - 현금/계좌이체 선택 시에만 표시 (분리결제 아닐 때) */}
              {enableCashReceiptVat && !useSplitPayment && (paymentMethod === 'cash' || paymentMethod === 'transfer') && (
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="cash-receipt" 
                    checked={isCashReceipt}
                    onCheckedChange={(checked) => setIsCashReceipt(checked as boolean)}
                    data-testid="checkbox-cash-receipt"
                  />
                  <Label htmlFor="cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                    현금영수증 발행 (+10% 부가세)
                  </Label>
                </div>
              )}

              {/* 카드결제 부가세 안내 */}
              {enableCardVat && paymentMethod === 'card' && !useSplitPayment && (
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    카드결제 시 부가세 10%가 자동으로 추가됩니다
                  </p>
                </div>
              )}
            </div>
            )}

            {/* 선지급 금액이 추가요금을 완전히 커버한 경우 */}
            {isInUse && additionalFeeInfo.prepaidAmount > 0 && additionalFeeInfo.rawAdditionalFee > 0 && additionalFeeInfo.additionalFee === 0 && (
              <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-700 dark:text-green-300 font-semibold">추가 요금 ({additionalFeeInfo.additionalFeeCount}회)</span>
                  <span className="font-bold text-green-700 dark:text-green-300">{additionalFeeInfo.rawAdditionalFee.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-700 dark:text-green-300">선지급 차감</span>
                  <span className="font-bold text-green-700 dark:text-green-300">-{additionalFeeInfo.prepaidAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-sm border-t border-green-300 dark:border-green-700 pt-1">
                  <span className="text-green-700 dark:text-green-300 font-semibold">추가 결제 필요</span>
                  <span className="font-bold text-green-700 dark:text-green-300">0원 (완납)</span>
                </div>
              </div>
            )}

            {/* 추가요금 섹션 - 추가요금이 있을 때만 표시 */}
            {isInUse && additionalFeeInfo.additionalFee > 0 && (
              <div className="space-y-3 p-4 border rounded-lg bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700 dark:text-orange-300 font-semibold">추가 요금 ({additionalFeeInfo.additionalFeeCount}회)</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">+{additionalFeeInfo.rawAdditionalFee.toLocaleString()}원</span>
                </div>
                {/* 선지급 금액이 있지만 추가요금이 남아있는 경우 */}
                {additionalFeeInfo.prepaidAmount > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
                      <span>선지급 차감</span>
                      <span className="font-bold">-{additionalFeeInfo.prepaidAmount.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-orange-300 dark:border-orange-700 pt-2">
                      <span className="text-orange-700 dark:text-orange-300 font-semibold">추가 결제 필요</span>
                      <span className="font-bold text-orange-700 dark:text-orange-300">+{additionalFeeInfo.additionalFee.toLocaleString()}원</span>
                    </div>
                  </>
                )}

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
                          // 분리결제 토글 시 현금영수증 상태 리셋
                          setIsAdditionalFeeCashReceipt(false);
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
                            type="text"
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
                            type="text"
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
                            type="text"
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
                        
                        // 추가요금 분리결제 부가세 계산
                        const cashTransferVal = cashVal + transferVal;
                        const cashTransferVat = (enableCashReceiptVat && isAdditionalFeeCashReceipt && cashTransferVal > 0) 
                          ? Math.round(cashTransferVal * 0.1) : 0;
                        const cardVat = (enableCardVat && cardVal > 0) 
                          ? Math.round(cardVal * 0.1) : 0;
                        const totalWithVat = total + cashTransferVat + cardVat;
                        
                        return (
                          <div className="flex items-center justify-between pt-2 border-t border-orange-200 dark:border-orange-800">
                            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">합계</span>
                            <div className="text-right">
                              <span className="text-lg font-bold text-orange-700 dark:text-orange-300">{total.toLocaleString()}원</span>
                              {(cashTransferVat > 0 || cardVat > 0) && (
                                <span className="text-sm text-blue-600 dark:text-blue-400 ml-2">
                                  (+부가세 {(cashTransferVat + cardVat).toLocaleString()}원 = {totalWithVat.toLocaleString()}원)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* 추가요금 분리결제 현금영수증 체크박스 */}
                      {enableCashReceiptVat && ((parseInt(additionalFeePaymentCash) || 0) > 0 || (parseInt(additionalFeePaymentTransfer) || 0) > 0) && (
                        <div className="flex items-center space-x-2 pt-2">
                          <Checkbox 
                            id="additional-fee-split-cash-receipt" 
                            checked={isAdditionalFeeCashReceipt}
                            onCheckedChange={(checked) => setIsAdditionalFeeCashReceipt(checked as boolean)}
                            data-testid="checkbox-additional-fee-split-cash-receipt"
                          />
                          <Label htmlFor="additional-fee-split-cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                            현금/이체 현금영수증 발행 (+10% 부가세)
                          </Label>
                        </div>
                      )}

                      {/* 추가요금 분리결제 카드 부가세 안내 */}
                      {enableCardVat && (parseInt(additionalFeePaymentCard) || 0) > 0 && (
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            카드결제 금액에 부가세 10%가 자동으로 추가됩니다
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <Select value={additionalFeePaymentMethod} onValueChange={(value) => {
                        setAdditionalFeePaymentMethod(value as 'card' | 'cash' | 'transfer');
                        additionalFeePaymentMethodUserChangedRef.current = true;
                        // 결제 방식 변경 시 현금영수증 체크 해제
                        setIsAdditionalFeeCashReceipt(false);
                        if (value === 'card') {
                          const cardSettings = localDb.getSettings();
                          if (cardSettings.cardPaymentAppEnabled && cardSettings.cardPaymentAppPackage) {
                            const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${cardSettings.cardPaymentAppPackage};end`;
                            window.location.href = intentUrl;
                          }
                        }
                      }}>
                        <SelectTrigger data-testid="select-additional-fee-payment-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">현금</SelectItem>
                          <SelectItem value="card">카드</SelectItem>
                          <SelectItem value="transfer">계좌이체</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* 추가요금 현금영수증 체크박스 */}
                      {enableCashReceiptVat && (additionalFeePaymentMethod === 'cash' || additionalFeePaymentMethod === 'transfer') && (
                        <div className="flex items-center space-x-2 pt-2">
                          <Checkbox 
                            id="additional-fee-cash-receipt" 
                            checked={isAdditionalFeeCashReceipt}
                            onCheckedChange={(checked) => setIsAdditionalFeeCashReceipt(checked as boolean)}
                            data-testid="checkbox-additional-fee-cash-receipt"
                          />
                          <Label htmlFor="additional-fee-cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                            현금영수증 발행 (+10% 부가세)
                          </Label>
                        </div>
                      )}

                      {/* 추가요금 카드결제 부가세 안내 */}
                      {enableCardVat && additionalFeePaymentMethod === 'card' && (
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            카드결제 시 부가세 10%가 자동으로 추가됩니다
                          </p>
                        </div>
                      )}
                    </>
                  )}
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
                        type="text"
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
                    // 추가요금 정보를 메모에 자동 기록
                    let additionalFeeMemo = '';
                    
                    if (additionalFeeFullDiscount) {
                      // 전액할인인 경우
                      additionalFeeMemo = `추가요금 총 ${additionalFeeInfo.additionalFee.toLocaleString()}원 전액할인`;
                    } else if (additionalFeePartialDiscount) {
                      // 일부할인인 경우
                      const discountAmount = parseInt(additionalFeeDiscount) || 0;
                      if (discountAmount > 0) {
                        additionalFeeMemo = `추가요금 총 ${additionalFeeInfo.additionalFee.toLocaleString()}원중 ${discountAmount.toLocaleString()}원 할인 받음`;
                      }
                    }
                    
                    // 할인이 있는 경우에만 메모에 추가
                    if (additionalFeeMemo) {
                      const updatedMemo = customerMemo.trim() 
                        ? `${customerMemo}\n${additionalFeeMemo}` 
                        : additionalFeeMemo;
                      setCustomerMemo(updatedMemo);
                    }
                    
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

            {/* 최종 요금 - 구분선 아래 (부가세 포함) */}
            <div className="flex justify-between text-base pt-4 border-t-2">
              <span className="font-semibold">최종 요금</span>
              <span className="font-bold text-xl text-primary">{calculateDisplayTotal().toLocaleString()}원</span>
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
                        <div className="flex items-center justify-between gap-2">
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
                          {/* 대여 취소 버튼 - 이미 대여 중이고 반납완료 안 된 항목만 */}
                          {isAlreadyRented && !returnCompletedItems.has(itemId) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive shrink-0"
                              onClick={() => {
                                const txn = currentRentalTransactions.find(t => t.itemId === itemId);
                                if (txn) {
                                  setCancellingRentalItem({ txnId: txn.id, itemId: itemId, itemName: item.name });
                                }
                              }}
                              data-testid={`button-cancel-rental-${itemId}`}
                            >
                              <X className="h-3 w-3 mr-1" />
                              대여 취소
                            </Button>
                          )}
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
                              
                              {/* 반납완료 버튼 - 대여형(rental)만 표시, 일반판매형(simple)은 제외 */}
                              {/* 대여형: 보증금 없는 경우 또는 보증금 처리(환급/몰수) 선택 시 표시 */}
                              {item.billingType !== 'simple' && ((item.depositAmount || 0) === 0 || (isInUse && isAlreadyRented && (depositStatus === 'refunded' || depositStatus === 'forfeited'))) && (
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
                                  // 결제방식 변경 시 현금영수증 체크 해제
                                  const newCashReceiptStatuses = new Map(rentalCashReceiptStatuses);
                                  newCashReceiptStatuses.set(itemId, false);
                                  setRentalCashReceiptStatuses(newCashReceiptStatuses);
                                  if (value === 'card') {
                                    const cardSettings = localDb.getSettings();
                                    if (cardSettings.cardPaymentAppEnabled && cardSettings.cardPaymentAppPackage) {
                                      const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${cardSettings.cardPaymentAppPackage};end`;
                                      window.location.href = intentUrl;
                                    }
                                  }
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
                              
                              {/* 현금영수증 체크박스 - 현금 또는 계좌이체 선택 시 표시 */}
                              {(rentalPaymentMethods.get(itemId) === 'cash' || rentalPaymentMethods.get(itemId) === 'transfer' || (!rentalPaymentMethods.get(itemId) && 'cash' === 'cash')) && settings.enableCashReceiptVat && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Checkbox
                                    id={`rental-cash-receipt-${itemId}`}
                                    checked={rentalCashReceiptStatuses.get(itemId) || false}
                                    onCheckedChange={(checked) => {
                                      const newStatuses = new Map(rentalCashReceiptStatuses);
                                      newStatuses.set(itemId, checked === true);
                                      setRentalCashReceiptStatuses(newStatuses);
                                    }}
                                    data-testid={`checkbox-rental-cash-receipt-${itemId}`}
                                  />
                                  <Label 
                                    htmlFor={`rental-cash-receipt-${itemId}`}
                                    className="text-xs text-muted-foreground cursor-pointer"
                                  >
                                    현금영수증 발행 (+10% 부가세)
                                  </Label>
                                </div>
                              )}
                              
                              {/* 카드 결제 부가세 안내 */}
                              {rentalPaymentMethods.get(itemId) === 'card' && settings.enableCardVat && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                  (+10% 부가세 포함)
                                </p>
                              )}
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

          {/* 환불 처리 섹션 (퇴실 시에만 표시) */}
          {isInUse && (
            <div className="mx-6 mb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowRefund(v => !v); if (showRefund) { setRefundAmount(""); setRefundNote(""); setRefundMethod(currentPaymentMethod || 'cash'); } }}
                  className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${showRefund ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400' : 'border-border text-muted-foreground hover-elevate'}`}
                  data-testid="button-toggle-refund"
                >
                  <RotateCcw className="w-4 h-4" />
                  환불 처리
                  {showRefund && <span className="text-xs">(ON)</span>}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const timeStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
                    const newIsOuting = !currentIsOuting;
                    const label = newIsOuting ? `[${timeStr}] 외출` : `[${timeStr}] 복귀`;
                    const newMemo = customerMemo.trim() ? `${customerMemo}\n${label}` : label;
                    setCustomerMemo(newMemo);
                    setCurrentIsOuting(newIsOuting);
                  }}
                  className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${currentIsOuting ? 'bg-[#374151] border-[#1F2937] text-white' : 'border-border text-muted-foreground hover-elevate'}`}
                  data-testid="button-toggle-outing"
                >
                  {currentIsOuting ? '복귀' : '외출'}
                </button>
              </div>
              {showRefund && (
                <div className="mt-2 p-3 rounded-md border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-red-700 dark:text-red-400 w-20 shrink-0">환불 금액</Label>
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        min="0"
                        step="100"
                        placeholder="0"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="pr-7 text-right"
                        data-testid="input-refund-amount"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-red-700 dark:text-red-400 w-20 shrink-0">환불 수단</Label>
                    <div className="flex gap-1.5">
                      {(['cash', 'card', 'transfer'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRefundMethod(m)}
                          className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${refundMethod === m ? 'bg-red-600 border-red-600 text-white' : 'border-border text-muted-foreground hover-elevate'}`}
                          data-testid={`button-refund-method-${m}`}
                        >
                          {m === 'cash' ? '현금' : m === 'card' ? '카드' : '이체'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-red-700 dark:text-red-400 w-20 shrink-0">환불 사유</Label>
                    <Input
                      type="text"
                      placeholder="환불 사유 (선택)"
                      value={refundNote}
                      onChange={(e) => setRefundNote(e.target.value)}
                      className="flex-1"
                      data-testid="input-refund-note"
                    />
                  </div>
                  {refundAmount && parseInt(refundAmount) > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      퇴실 시 {parseInt(refundAmount).toLocaleString()}원이 {refundMethod === 'cash' ? '현금' : refundMethod === 'card' ? '카드' : '이체'}으로 환불 처리되어 당일 매출에서 차감됩니다.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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
                {parentLockerNumber && (
                  <Button variant="secondary" onClick={handleUnlinkFromParent} data-testid="button-unlink">
                    묶기 해제
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
                    
                    // 추가요금 처리 여부 체크 (추가요금만 있으면 요금 결제만 하면 됨)
                    const hasUnresolvedAdditionalFees = additionalFeeInfo.additionalFee > 0 && !checkoutResolved;
                    
                    // 선택된 대여품목 중 반납완료되지 않은 것이 있는지 체크
                    // 대여형(rental)만 반납완료가 필요, 일반판매형(simple)은 반납 불필요
                    const hasUnresolvedRentalItems = Array.from(selectedRentalItems).some(itemId => {
                      const item = availableRentalItems.find(i => i.id === itemId);
                      // 일반판매형(simple)은 반납완료 불필요 - 항상 false 반환
                      if (item?.billingType === 'simple') {
                        return false;
                      }
                      // 대여형(rental)만 반납완료 체크
                      return !returnCompletedItems.has(itemId);
                    });
                    
                    // 추가요금 있거나 반납완료되지 않은 대여품목 있으면 비활성화
                    return hasUnresolvedAdditionalFees || hasUnresolvedRentalItems;
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
              {/* 반납완료되지 않은 대여형(rental) 품목만 표시 (일반판매형 제외) */}
              {currentRentalTransactions.filter(txn => {
                const item = availableRentalItems.find(i => i.id === txn.itemId);
                return item?.billingType !== 'simple' && !returnCompletedItems.has(txn.itemId);
              }).length > 0 && (
                <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-md border border-orange-200 dark:border-orange-800 space-y-2">
                  <p className="font-semibold text-orange-700 dark:text-orange-300 mb-2">대여 물품 회수:</p>
                  {currentRentalTransactions
                    .filter(txn => {
                      const item = availableRentalItems.find(i => i.id === txn.itemId);
                      return item?.billingType !== 'simple' && !returnCompletedItems.has(txn.itemId);
                    })
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

      {/* 대여 취소 확인 다이얼로그 */}
      <AlertDialog open={!!cancellingRentalItem} onOpenChange={(open) => { if (!open) setCancellingRentalItem(null); }}>
        <AlertDialogContent data-testid="dialog-cancel-rental-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>대여 취소</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>{cancellingRentalItem?.itemName}</strong> 대여를 취소하시겠습니까?
              </p>
              <p className="text-sm text-muted-foreground">
                대여 기록이 삭제되며 대여금·보증금이 청구되지 않습니다.<br/>
                이미 받은 보증금이 있다면 직접 환불해 주세요.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-rental-close">닫기</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-cancel-rental-confirm"
              onClick={() => {
                if (!cancellingRentalItem) return;
                localDb.deleteRentalTransaction(cancellingRentalItem.txnId);
                setCurrentRentalTransactions(prev => prev.filter(t => t.id !== cancellingRentalItem.txnId));
                const { itemId } = cancellingRentalItem;
                const newSelected = new Set(selectedRentalItems);
                newSelected.delete(itemId);
                setSelectedRentalItems(newSelected);
                const newStatuses = new Map(depositStatuses);
                newStatuses.delete(itemId);
                setDepositStatuses(newStatuses);
                const newMethods = new Map(rentalPaymentMethods);
                newMethods.delete(itemId);
                setRentalPaymentMethods(newMethods);
                const newReturn = new Set(returnCompletedItems);
                newReturn.delete(itemId);
                setReturnCompletedItems(newReturn);
                setCancellingRentalItem(null);
              }}
            >
              대여 취소 확인
            </AlertDialogAction>
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

      {/* Locker swap picker dialog */}
      <Dialog open={showSwapDialog} onOpenChange={setShowSwapDialog}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto" data-testid="dialog-swap-input">
          <DialogHeader>
            <DialogTitle>락카 교체 — {lockerNumber}번</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 안내 */}
            <div className="text-sm bg-orange-50 dark:bg-orange-950 p-3 rounded-md border border-orange-200 dark:border-orange-800">
              <p className="text-orange-700 dark:text-orange-300">
                <span className="font-semibold">빈 락카 선택:</span> 현재 락카 내용이 대상 락카로 이동합니다.<br/>
                <span className="font-semibold">사용중 락카 선택:</span> 두 락카의 내용이 서로 교환됩니다.
              </p>
            </div>

            {/* 범례 */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-white border-2 border-gray-300" />
                <span>빈 락카</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-[#FFD700] border-2 border-[#FFC700]" />
                <span>사용중</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-blue-500 border-2 border-blue-600 ring-2 ring-blue-300" />
                <span>선택됨</span>
              </div>
            </div>

            {/* 선택 상태 표시 */}
            <div className={`text-sm font-semibold text-center py-2 rounded-md transition-all duration-200 ${
              selectedSwapLocker
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'bg-muted text-muted-foreground'
            }`}>
              {selectedSwapLocker
                ? `✓ ${selectedSwapLocker}번 락카 선택됨 — 교체하기 버튼을 눌러 진행하세요`
                : '교체할 락카를 터치하여 선택하세요'}
            </div>

            {/* 버튼 그리드 */}
            <div className="grid grid-cols-5 gap-2">
              {(() => {
                const activeLockersList = localDb.getActiveLockers();
                const activeNumbers = new Set(activeLockersList.map((l: any) => l.lockerNumber));
                const groups = localDb.getLockerGroups();
                const configuredNumbers: number[] = [];
                groups.forEach((g: any) => {
                  for (let i = g.startNumber; i <= g.endNumber; i++) {
                    configuredNumbers.push(i);
                  }
                });

                return configuredNumbers.map(num => {
                  const isCurrent = num === lockerNumber;
                  const isInUse = activeNumbers.has(num);
                  const isSelected = selectedSwapLocker === num;

                  let btnClass = '';
                  let statusLabel = '';
                  if (isCurrent) {
                    btnClass = 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-2 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50';
                    statusLabel = '현재';
                  } else if (isSelected) {
                    btnClass = 'bg-blue-500 text-white border-2 border-blue-600 ring-4 ring-blue-300 dark:ring-blue-700 scale-105 shadow-lg';
                    statusLabel = isInUse ? '교환' : '이동';
                  } else if (isInUse) {
                    btnClass = 'bg-[#FFD700] text-gray-800 border-2 border-[#FFC700] hover-elevate active-elevate-2';
                    statusLabel = '사용중';
                  } else {
                    btnClass = 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-2 border-gray-300 dark:border-gray-600 hover-elevate active-elevate-2';
                  }

                  return (
                    <button
                      key={num}
                      disabled={isCurrent}
                      data-testid={`button-swap-locker-${num}`}
                      onClick={() => {
                        if (isCurrent) return;
                        const audio = new Audio('data:audio/wav;base64,UklGRhIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQA=');
                        audio.volume = 0.3;
                        audio.play().catch(() => {});
                        setSelectedSwapLocker(num);
                        setSwapTargetLocker(String(num));
                      }}
                      className={`
                        h-14 rounded-lg font-bold text-sm
                        flex flex-col items-center justify-center gap-0.5
                        transition-all duration-150 active:scale-95
                        ${btnClass}
                      `}
                    >
                      <span className="text-base font-bold leading-none">{num}</span>
                      {statusLabel && (
                        <span className="text-[10px] font-normal opacity-85 leading-none">{statusLabel}</span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSwapDialog(false)} data-testid="button-swap-cancel">
              취소
            </Button>
            <Button
              onClick={handleSwapSubmit}
              disabled={!selectedSwapLocker}
              className="bg-orange-600 dark:bg-orange-700"
              data-testid="button-swap-submit"
            >
              교체하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                
                // Get all locker groups - only show configured locker numbers
                const groups = localDb.getLockerGroups();
                const configuredNumbers: number[] = [];
                groups.forEach((g: any) => {
                  for (let i = g.startNumber; i <= g.endNumber; i++) {
                    configuredNumbers.push(i);
                  }
                });

                // Generate available locker numbers (vacant OR already linked children)
                // Only from configured numbers, not a fixed 1-N range
                const availableLockers: number[] = [];
                for (const i of configuredNumbers) {
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
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-md border border-red-200 dark:border-red-800">
                선택된 락카가 없습니다. 확인 시 현재 연결된 모든 묶기가 해제됩니다.
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
            <AlertDialogTitle className={selectedChildLockers.size === 0 ? "text-red-600" : "text-blue-600"}>
              {selectedChildLockers.size === 0 ? "묶기 해제 확인" : "락카묶기 확인"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className={`p-4 rounded-md border ${selectedChildLockers.size === 0 ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"}`}>
                <p className={`text-sm ${selectedChildLockers.size === 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                  {selectedChildLockers.size === 0 ? (
                    <>
                      {lockerNumber}번 락카의 모든 자식 락카 묶기를 해제합니다.
                      <br/><br/>
                      • 해제된 자식 락카는 독립된 락카로 전환됩니다<br/>
                      • 기존 입실 정보는 유지됩니다
                    </>
                  ) : (
                    <>
                      {lockerNumber}번 락카에 {Array.from(selectedChildLockers).join(', ')}번 락카를 묶습니다.
                      <br/><br/>
                      • 묶인 락카는 요금 없이 사용됩니다<br/>
                      • {lockerNumber}번 퇴실 시 자동으로 함께 퇴실됩니다
                    </>
                  )}
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
                type="text"
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

      {/* 선지급금 취소 시 환불 방식 선택 다이얼로그 */}
      <AlertDialog open={showPrepaidRefundDialog} onOpenChange={setShowPrepaidRefundDialog}>
        <AlertDialogContent data-testid="dialog-prepaid-refund">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-blue-600">선지급금 환불 방식 선택</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {(() => {
                // 기본 선지급 금액
                const basePrepaidAmount = pendingPrepaidCancellation?.originalAmount || 0;
                const vatIncludedAmount = Math.round(basePrepaidAmount * 1.1);
                const cashPayment = pendingPrepaidCancellation?.originalPaymentCash || 0;
                const cardPayment = pendingPrepaidCancellation?.originalPaymentCard || 0;
                const transferPayment = pendingPrepaidCancellation?.originalPaymentTransfer || 0;
                
                // 현재 선택에 따른 환불 금액
                const currentRefundAmount = prepaidRefundIncludeVat ? vatIncludedAmount : basePrepaidAmount;
                
                // 환불 가능 여부 (결제금액이 환불금액 이상인지)
                const cashEligible = cashPayment >= currentRefundAmount && cashPayment > 0;
                const cardEligible = cardPayment >= currentRefundAmount && cardPayment > 0;
                const transferEligible = transferPayment >= currentRefundAmount && transferPayment > 0;
                const noEligibleMethods = !cashEligible && !cardEligible && !transferEligible;
                
                // VAT 포함 시 환불 가능한 수단이 있는지
                const anyEligibleWithVat = (cashPayment >= vatIncludedAmount) || 
                                           (cardPayment >= vatIncludedAmount) || 
                                           (transferPayment >= vatIncludedAmount);
                
                return (
                  <>
                    <p>
                      선지급금 {basePrepaidAmount.toLocaleString()}원을 
                      취소합니다. 어떤 결제 수단에서 차감할지 선택해주세요.
                    </p>
                    
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">현재 결제 내역:</p>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        {cashPayment > 0 && (
                          <div className="text-blue-600 dark:text-blue-400">
                            현금: {cashPayment.toLocaleString()}원
                          </div>
                        )}
                        {cardPayment > 0 && (
                          <div className="text-blue-600 dark:text-blue-400">
                            카드: {cardPayment.toLocaleString()}원
                          </div>
                        )}
                        {transferPayment > 0 && (
                          <div className="text-blue-600 dark:text-blue-400">
                            이체: {transferPayment.toLocaleString()}원
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 부가세 포함 여부 선택 */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">환불 금액 선택:</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={!prepaidRefundIncludeVat ? 'default' : 'outline'}
                          onClick={() => {
                            setPrepaidRefundIncludeVat(false);
                            setPrepaidRefundMethod(null); // 환불 수단 초기화
                          }}
                          className={`flex-1 ${!prepaidRefundIncludeVat ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                          data-testid="button-refund-no-vat"
                        >
                          {basePrepaidAmount.toLocaleString()}원
                        </Button>
                        {anyEligibleWithVat && (
                          <Button
                            type="button"
                            variant={prepaidRefundIncludeVat ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundIncludeVat(true);
                              setPrepaidRefundMethod(null); // 환불 수단 초기화
                            }}
                            className={`flex-1 ${prepaidRefundIncludeVat ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-with-vat"
                          >
                            {vatIncludedAmount.toLocaleString()}원 (VAT 포함)
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">환불 받을 결제 수단:</p>
                      <div className="flex gap-2 flex-wrap">
                        {cashEligible && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'cash' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('cash');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'cash' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-cash"
                          >
                            현금
                          </Button>
                        )}
                        {cardEligible && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'card' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('card');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'card' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-card"
                          >
                            카드
                          </Button>
                        )}
                        {transferEligible && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'transfer' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('transfer');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'transfer' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-transfer"
                          >
                            이체
                          </Button>
                        )}
                        {/* 분할 환불 버튼 - 환불 금액이 개별 결제수단보다 큰 경우 */}
                        {noEligibleMethods && (cashPayment > 0 || cardPayment > 0 || transferPayment > 0) && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'split' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('split');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'split' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-split"
                          >
                            분할 환불
                          </Button>
                        )}
                      </div>
                      {noEligibleMethods && prepaidRefundMethod !== 'split' && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          환불 금액({currentRefundAmount.toLocaleString()}원)보다 큰 결제 수단이 없습니다.
                          '분할 환불'을 선택하여 각 결제수단별로 환불 금액을 지정할 수 있습니다.
                        </p>
                      )}
                    </div>

                    {/* 분할 환불 입력 UI */}
                    {prepaidRefundMethod === 'split' && pendingPrepaidCancellation && (() => {
                      const splitCashVal = parseInt(splitRefundCash) || 0;
                      const splitCardVal = parseInt(splitRefundCard) || 0;
                      const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                      const splitTotal = splitCashVal + splitCardVal + splitTransferVal;
                      
                      // 분할취소: 기본금액(선지급금)을 분배하면 됨
                      const isValidSplit = splitTotal === basePrepaidAmount;
                      
                      // 각 결제방식별 VAT 적용 여부
                      const cashHadVat = enableCashReceiptVat && isCashReceipt;
                      const cardHadVat = enableCardVat;
                      const transferHadVat = enableCashReceiptVat && isCashReceipt;
                      
                      // 각 결제방식별 실제 환불될 금액 (VAT 포함 시)
                      const actualCashRefund = cashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                      const actualCardRefund = cardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                      const actualTransferRefund = transferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                      
                      // 각 결제방식별 최대 환불 가능 기본금액 (VAT 역산)
                      const maxCashBase = cashHadVat ? Math.floor(cashPayment / 1.1) : cashPayment;
                      const maxCardBase = cardHadVat ? Math.floor(cardPayment / 1.1) : cardPayment;
                      const maxTransferBase = transferHadVat ? Math.floor(transferPayment / 1.1) : transferPayment;
                      
                      // 초과 체크 (실제 환불금액이 결제금액을 초과하는지)
                      const isCashOverLimit = actualCashRefund > cashPayment;
                      const isCardOverLimit = actualCardRefund > cardPayment;
                      const isTransferOverLimit = actualTransferRefund > transferPayment;
                      const hasOverLimit = isCashOverLimit || isCardOverLimit || isTransferOverLimit;
                      
                      return (
                        <div className="space-y-3 p-3 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                            선지급금 {basePrepaidAmount.toLocaleString()}원을 결제수단별로 분배 입력
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {cashPayment > 0 && (
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  현금 (최대 {maxCashBase.toLocaleString()})
                                  {cashHadVat && <span className="text-blue-500 ml-1">+VAT</span>}
                                </Label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  value={splitRefundCash}
                                  onChange={(e) => setSplitRefundCash(e.target.value)}
                                  className={`text-sm ${isCashOverLimit ? 'border-red-500' : ''}`}
                                  data-testid="input-split-refund-cash"
                                />
                                {splitCashVal > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    실제 차감: {actualCashRefund.toLocaleString()}원
                                  </p>
                                )}
                              </div>
                            )}
                            {cardPayment > 0 && (
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  카드 (최대 {maxCardBase.toLocaleString()})
                                  {cardHadVat && <span className="text-blue-500 ml-1">+VAT</span>}
                                </Label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  value={splitRefundCard}
                                  onChange={(e) => setSplitRefundCard(e.target.value)}
                                  className={`text-sm ${isCardOverLimit ? 'border-red-500' : ''}`}
                                  data-testid="input-split-refund-card"
                                />
                                {splitCardVal > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    실제 차감: {actualCardRefund.toLocaleString()}원
                                  </p>
                                )}
                              </div>
                            )}
                            {transferPayment > 0 && (
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  이체 (최대 {maxTransferBase.toLocaleString()})
                                  {transferHadVat && <span className="text-blue-500 ml-1">+VAT</span>}
                                </Label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  value={splitRefundTransfer}
                                  onChange={(e) => setSplitRefundTransfer(e.target.value)}
                                  className={`text-sm ${isTransferOverLimit ? 'border-red-500' : ''}`}
                                  data-testid="input-split-refund-transfer"
                                />
                                {splitTransferVal > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    실제 차감: {actualTransferRefund.toLocaleString()}원
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className={`${isValidSplit && !hasOverLimit ? 'text-green-600' : 'text-amber-600'}`}>
                              분배 합계: {splitTotal.toLocaleString()}원
                            </span>
                            {hasOverLimit && (
                              <span className="text-red-600">결제 금액 초과!</span>
                            )}
                            {!isValidSplit && !hasOverLimit && (
                              <span className="text-amber-600">
                                {splitTotal < basePrepaidAmount 
                                  ? `${(basePrepaidAmount - splitTotal).toLocaleString()}원 더 필요` 
                                  : `${(splitTotal - basePrepaidAmount).toLocaleString()}원 초과`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {prepaidRefundMethod && prepaidRefundMethod !== 'split' && pendingPrepaidCancellation && (
                      <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          {prepaidRefundMethod === 'cash' && '현금'}
                          {prepaidRefundMethod === 'card' && '카드'}
                          {prepaidRefundMethod === 'transfer' && '이체'}
                          에서 {currentRefundAmount.toLocaleString()}원을 환불합니다.
                          {prepaidRefundIncludeVat && (
                            <span className="text-xs ml-1">(VAT 10% 포함)</span>
                          )}
                        </p>
                      </div>
                    )}
                    
                    {prepaidRefundMethod === 'split' && pendingPrepaidCancellation && (() => {
                      const splitCashVal = parseInt(splitRefundCash) || 0;
                      const splitCardVal = parseInt(splitRefundCard) || 0;
                      const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                      const splitTotal = splitCashVal + splitCardVal + splitTransferVal;
                      const isValidSplit = splitTotal === basePrepaidAmount;
                      
                      // 각 결제방식별 VAT 적용 여부
                      const cashHadVat = enableCashReceiptVat && isCashReceipt;
                      const cardHadVat = enableCardVat;
                      const transferHadVat = enableCashReceiptVat && isCashReceipt;
                      
                      // 각 결제방식별 실제 환불될 금액 (VAT 포함 시)
                      const actualCashRefund = cashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                      const actualCardRefund = cardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                      const actualTransferRefund = transferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                      const totalActualRefund = actualCashRefund + actualCardRefund + actualTransferRefund;
                      
                      // 초과 체크 (실제 환불금액이 결제금액을 초과하는지)
                      const isCashOverLimit = actualCashRefund > cashPayment;
                      const isCardOverLimit = actualCardRefund > cardPayment;
                      const isTransferOverLimit = actualTransferRefund > transferPayment;
                      const hasOverLimit = isCashOverLimit || isCardOverLimit || isTransferOverLimit;
                      
                      if (isValidSplit && !hasOverLimit) {
                        const parts = [];
                        if (splitCashVal > 0) {
                          parts.push(`현금 ${actualCashRefund.toLocaleString()}원${cashHadVat ? '(VAT포함)' : ''}`);
                        }
                        if (splitCardVal > 0) {
                          parts.push(`카드 ${actualCardRefund.toLocaleString()}원${cardHadVat ? '(VAT포함)' : ''}`);
                        }
                        if (splitTransferVal > 0) {
                          parts.push(`이체 ${actualTransferRefund.toLocaleString()}원${transferHadVat ? '(VAT포함)' : ''}`);
                        }
                        
                        return (
                          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                            <p className="text-sm text-green-700 dark:text-green-300">
                              {parts.join(' + ')} = 총 {totalActualRefund.toLocaleString()}원 환불
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setShowPrepaidRefundDialog(false);
                setPrepaidRefundMethod(null);
                setPrepaidRefundIncludeVat(false);
                setPendingPrepaidCancellation(null);
              }}
              data-testid="button-prepaid-refund-cancel"
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (prepaidRefundMethod && pendingPrepaidCancellation) {
                  // 선지급금 취소 처리
                  // 기본 선지급 금액
                  const basePrepaidAmount = pendingPrepaidCancellation.originalAmount;
                  
                  // 사용자가 선택한 VAT 포함 여부에 따라 환불 금액 계산
                  const refundAmount = prepaidRefundIncludeVat 
                    ? Math.round(basePrepaidAmount * 1.1) 
                    : basePrepaidAmount;
                  
                  // 원래 결제 금액에서 VAT가 적용되었는지 확인
                  // 카드: enableCardVat가 true면 VAT 적용됨
                  // 현금/이체: enableCashReceiptVat && isCashReceipt가 true면 VAT 적용됨
                  const originalCashHadVat = enableCashReceiptVat && isCashReceipt;
                  const originalCardHadVat = enableCardVat;
                  const originalTransferHadVat = enableCashReceiptVat && isCashReceipt;
                  
                  // 원래 결제 금액을 기본 금액으로 변환 (VAT 제거)
                  // 분리결제창에서는 기본 금액을 입력하면 VAT를 다시 계산하므로
                  const originalCashBase = originalCashHadVat 
                    ? Math.round(pendingPrepaidCancellation.originalPaymentCash / 1.1) 
                    : pendingPrepaidCancellation.originalPaymentCash;
                  const originalCardBase = originalCardHadVat 
                    ? Math.round(pendingPrepaidCancellation.originalPaymentCard / 1.1) 
                    : pendingPrepaidCancellation.originalPaymentCard;
                  const originalTransferBase = originalTransferHadVat 
                    ? Math.round(pendingPrepaidCancellation.originalPaymentTransfer / 1.1) 
                    : pendingPrepaidCancellation.originalPaymentTransfer;
                  
                  // 환불할 기본 금액 (선지급 원금)
                  let newCashBase = originalCashBase;
                  let newCardBase = originalCardBase;
                  let newTransferBase = originalTransferBase;
                  let refundMethodName = '';
                  
                  if (prepaidRefundMethod === 'split') {
                    // 분할 환불 처리
                    // 사용자가 입력한 금액은 기본금액(선지급금 분배)
                    const splitCashVal = parseInt(splitRefundCash) || 0;
                    const splitCardVal = parseInt(splitRefundCard) || 0;
                    const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                    
                    // 각 결제방식에서 차감할 기본금액 = 사용자 입력값
                    // (사용자가 기본금액을 분배했으므로 직접 차감)
                    newCashBase = Math.max(0, originalCashBase - splitCashVal);
                    newCardBase = Math.max(0, originalCardBase - splitCardVal);
                    newTransferBase = Math.max(0, originalTransferBase - splitTransferVal);
                    
                    // 환불 내역 텍스트 생성 (실제 환불 금액 = 기본금액 + VAT)
                    const actualCashRefund = originalCashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                    const actualCardRefund = originalCardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                    const actualTransferRefund = originalTransferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                    
                    const parts = [];
                    if (splitCashVal > 0) parts.push(`현금 ${actualCashRefund.toLocaleString()}원${originalCashHadVat ? '(VAT포함)' : ''}`);
                    if (splitCardVal > 0) parts.push(`카드 ${actualCardRefund.toLocaleString()}원${originalCardHadVat ? '(VAT포함)' : ''}`);
                    if (splitTransferVal > 0) parts.push(`이체 ${actualTransferRefund.toLocaleString()}원${originalTransferHadVat ? '(VAT포함)' : ''}`);
                    refundMethodName = parts.join('+');
                  } else if (prepaidRefundMethod === 'cash') {
                    newCashBase = Math.max(0, originalCashBase - basePrepaidAmount);
                    refundMethodName = '현금';
                  } else if (prepaidRefundMethod === 'card') {
                    newCardBase = Math.max(0, originalCardBase - basePrepaidAmount);
                    refundMethodName = '카드';
                  } else if (prepaidRefundMethod === 'transfer') {
                    newTransferBase = Math.max(0, originalTransferBase - basePrepaidAmount);
                    refundMethodName = '이체';
                  }
                  
                  // 모든 결제금액 상태 업데이트 (기본 금액으로 설정, VAT는 분리결제창에서 다시 계산됨)
                  setPaymentCash(newCashBase > 0 ? String(newCashBase) : "0");
                  setPaymentCard(newCardBase > 0 ? String(newCardBase) : "0");
                  setPaymentTransfer(newTransferBase > 0 ? String(newTransferBase) : "0");
                  
                  // 선지급금 취소 메모 추가
                  const cancelTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                  const vatNote = prepaidRefundIncludeVat ? ', VAT포함' : '';
                  const cancelMemoText = `[${cancelTime}] 선지급금 ${basePrepaidAmount.toLocaleString()}원 취소 (${refundMethodName} 환불${vatNote})`;
                  const updatedMemo = customerMemo.trim() 
                    ? `${customerMemo}\n${cancelMemoText}` 
                    : cancelMemoText;
                  setCustomerMemo(updatedMemo);
                  
                  // 선지급금 체크박스 해제 및 금액 초기화
                  setHasPrepaidAdditionalFee(false);
                  setPrepaidAdditionalFeeAmount("");
                  
                  // 분리결제 활성화 (새로운 금액으로)
                  setUseSplitPayment(true);
                }
                
                // 다이얼로그 닫기
                setShowPrepaidRefundDialog(false);
                setPrepaidRefundMethod(null);
                setPrepaidRefundIncludeVat(false);
                setPendingPrepaidCancellation(null);
                setSplitRefundCash("");
                setSplitRefundCard("");
                setSplitRefundTransfer("");
              }}
              disabled={(() => {
                if (!prepaidRefundMethod) return true;
                if (prepaidRefundMethod === 'split') {
                  // 분할 환불 시 유효성 검사
                  const splitCashVal = parseInt(splitRefundCash) || 0;
                  const splitCardVal = parseInt(splitRefundCard) || 0;
                  const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                  const splitTotal = splitCashVal + splitCardVal + splitTransferVal;
                  const basePrepaidAmount = pendingPrepaidCancellation?.originalAmount || 0;
                  
                  // 분할취소: 기본금액(선지급금)을 분배해야 함
                  const isValidSplit = splitTotal === basePrepaidAmount;
                  
                  // 각 결제방식별 VAT 적용 여부
                  const cashHadVat = enableCashReceiptVat && isCashReceipt;
                  const cardHadVat = enableCardVat;
                  const transferHadVat = enableCashReceiptVat && isCashReceipt;
                  
                  // 실제 환불 금액 계산 (VAT 포함 시)
                  const actualCashRefund = cashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                  const actualCardRefund = cardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                  const actualTransferRefund = transferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                  
                  const cashPayment = pendingPrepaidCancellation?.originalPaymentCash || 0;
                  const cardPayment = pendingPrepaidCancellation?.originalPaymentCard || 0;
                  const transferPayment = pendingPrepaidCancellation?.originalPaymentTransfer || 0;
                  
                  // 실제 환불 금액이 결제 금액을 초과하면 안됨
                  const hasOverLimit = actualCashRefund > cashPayment || 
                                       actualCardRefund > cardPayment || 
                                       actualTransferRefund > transferPayment;
                  
                  return !isValidSplit || hasOverLimit;
                }
                return false;
              })()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-prepaid-refund-confirm"
            >
              환불 확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
