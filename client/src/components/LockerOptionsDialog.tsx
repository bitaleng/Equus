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
import { calculateAdditionalFee } from "@shared/businessDay";
import * as localDb from "@/lib/localDb";

interface RentalItemInfo {
  itemId: string;
  itemName: string;
  rentalFee: number;
  depositAmount: number;
  depositStatus: 'received' | 'refunded' | 'forfeited';
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
  currentOptionType?: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price';
  currentOptionAmount?: number;
  currentFinalPrice?: number;
  discountAmount?: number;
  foreignerPrice?: number;
  isInUse?: boolean;
  dayPrice?: number;
  nightPrice?: number;
  onApply: (option: string, customAmount?: number, notes?: string, paymentMethod?: 'card' | 'cash' | 'transfer') => void;
  onCheckout: (paymentMethod: 'card' | 'cash' | 'transfer', rentalItems?: RentalItemInfo[]) => void;
  onCancel: () => void;
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
  currentOptionType = 'none',
  currentOptionAmount,
  currentFinalPrice,
  discountAmount = 2000,
  foreignerPrice = 25000,
  isInUse = false,
  dayPrice = 10000,
  nightPrice = 15000,
  onApply,
  onCheckout,
  onCancel,
}: LockerOptionsDialogProps) {
  const [discountOption, setDiscountOption] = useState<string>("none");
  const [discountInputAmount, setDiscountInputAmount] = useState<string>("");
  const [isForeigner, setIsForeigner] = useState(false);
  const [isDirectPrice, setIsDirectPrice] = useState(false);
  const [directPrice, setDirectPrice] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'transfer'>(currentPaymentMethod);
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [showWarningAlert, setShowWarningAlert] = useState(false);
  const [checkoutResolved, setCheckoutResolved] = useState(false);
  
  // Rental items state (담요, 롱타올) - legacy
  const [hasBlanket, setHasBlanket] = useState(false);
  const [hasLongTowel, setHasLongTowel] = useState(false);
  
  // Dynamic rental items from database
  const [availableRentalItems, setAvailableRentalItems] = useState<any[]>([]);
  const [selectedRentalItems, setSelectedRentalItems] = useState<Set<string>>(new Set());
  const [depositStatuses, setDepositStatuses] = useState<Map<string, 'received' | 'refunded' | 'forfeited'>>(new Map());
  
  // Track previous locker number to reset checkoutResolved only when changing lockers
  const previousLockerRef = useRef<number | null>(null);

  // Load rental items from database on mount
  useEffect(() => {
    const items = localDb.getAdditionalRevenueItems();
    setAvailableRentalItems(items);
  }, []);

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
      // Reset checkoutResolved only when opening a different locker
      if (previousLockerRef.current !== lockerNumber) {
        setCheckoutResolved(false);
        previousLockerRef.current = lockerNumber;
      }
      
      setPaymentMethod(currentPaymentMethod);
      
      // Parse rental items from notes
      const blanketPresent = currentNotes?.includes('담요') || false;
      const towelPresent = currentNotes?.includes('롱타올') || false;
      setHasBlanket(blanketPresent);
      setHasLongTowel(towelPresent);
      
      // Auto-show warning alert if there are rental items or additional fees (only if not resolved yet)
      if (isInUse && !checkoutResolved) {
        const hasRentalItems = blanketPresent || towelPresent;
        const hasAdditionalFee = additionalFeeInfo.additionalFee > 0;
        
        if (hasRentalItems || hasAdditionalFee) {
          // Play emergency alert sound
          playEmergencySound();
          
          // Delay to allow dialog to fully open first
          setTimeout(() => setShowWarningAlert(true), 300);
        }
      }
      
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
      setPaymentMethod('card');
      setShowCheckoutConfirm(false);
      // Note: checkoutResolved is NOT reset here to preserve acknowledgement state
    }
  }, [open, currentNotes, currentPaymentMethod, currentOptionType, currentOptionAmount, currentFinalPrice, lockerNumber, checkoutResolved]);

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

  // Generate notes from rental items
  const generateNotes = () => {
    const items: string[] = [];
    if (hasBlanket) items.push('담요');
    if (hasLongTowel) items.push('롱타올');
    return items.length > 0 ? items.join(', ') : '';
  };

  // Generate rental item info for checkout
  const generateRentalItemInfo = (): RentalItemInfo[] => {
    const rentalItems: RentalItemInfo[] = [];
    
    selectedRentalItems.forEach(itemId => {
      const item = availableRentalItems.find(i => i.id === itemId);
      const depositStatus = depositStatuses.get(itemId);
      
      if (item && depositStatus) {
        rentalItems.push({
          itemId: item.id,
          itemName: item.name,
          rentalFee: item.rental_fee,
          depositAmount: item.deposit_amount,
          depositStatus: depositStatus,
        });
      }
    });
    
    return rentalItems;
  };

  const handleProcessEntry = () => {
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

    const generatedNotes = generateNotes();
    onApply(optionType, optionAmount, generatedNotes, paymentMethod);
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

    const generatedNotes = generateNotes();
    onApply(optionType, optionAmount, generatedNotes, paymentMethod);
    
    // Mark as resolved to prevent warning on next open
    setCheckoutResolved(true);
    
    // Auto-close dialog after save
    playCloseSound();
    setTimeout(() => setDialogOpen(false), 100);
  };

  const handleCheckoutClick = () => {
    playClickSound();
    
    // Check if there are rental items or additional fees
    const hasRentalItems = selectedRentalItems.size > 0;
    const hasAdditionalFee = additionalFeeInfo.additionalFee > 0;
    
    if ((hasRentalItems || hasAdditionalFee) && !checkoutResolved) {
      setShowWarningAlert(true);
      return;
    }
    
    // Check if there are any rental items
    if (selectedRentalItems.size > 0) {
      setShowCheckoutConfirm(true);
    } else {
      const rentalItemInfo = generateRentalItemInfo();
      onCheckout(paymentMethod, rentalItemInfo);
    }
  };

  const confirmCheckout = () => {
    playCloseSound(); // Use a more distinctive sound for checkout
    setShowCheckoutConfirm(false);
    const rentalItemInfo = generateRentalItemInfo();
    onCheckout(paymentMethod, rentalItemInfo);
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

  // Calculate additional fee if entry time exists
  const isCurrentlyForeigner = currentOptionType === 'foreigner';
  const additionalFeeInfo = entryTime && isInUse
    ? calculateAdditionalFee(entryTime, timeType, dayPrice, nightPrice, new Date(), isCurrentlyForeigner, foreignerPrice)
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
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-locker-options">
          <DialogHeader>
            <DialogTitle className="text-xl">락커 {lockerNumber}번 - {isInUse ? '옵션 수정' : '입실 처리'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              {/* 입실 날짜/시간 표시 (사용중일 때만) */}
              {isInUse && entryDateTime && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">입실 날짜</span>
                    <span className="font-medium">{entryDateTime.dateStr}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">입실 시간</span>
                    <span className="font-medium">{entryDateTime.timeStr}</span>
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
              
              {/* 추가요금 표시 */}
              {isInUse && additionalFeeInfo.additionalFee > 0 && (
                <div className="flex justify-between text-sm bg-orange-50 dark:bg-orange-950 p-2 rounded">
                  <span className="text-orange-700 dark:text-orange-300 font-semibold">추가 요금 ({additionalFeeInfo.additionalFeeCount}회)</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">+{additionalFeeInfo.additionalFee.toLocaleString()}원</span>
                </div>
              )}
              
              <div className="flex justify-between text-base pt-2 border-t">
                <span className="font-medium">최종 요금</span>
                <span className="font-bold text-lg text-primary">{calculateFinalPrice().toLocaleString()}원</span>
              </div>
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

            {/* 지불방식 Select */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">지불방식</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'card' | 'cash' | 'transfer')}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">카드</SelectItem>
                  <SelectItem value="cash">현금</SelectItem>
                  <SelectItem value="transfer">이체</SelectItem>
                </SelectContent>
              </Select>
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
                                  // Do NOT set default deposit status - require explicit selection
                                } else {
                                  newSelected.delete(itemId);
                                  // Remove deposit status
                                  const newStatuses = new Map(depositStatuses);
                                  newStatuses.delete(itemId);
                                  setDepositStatuses(newStatuses);
                                }
                                setSelectedRentalItems(newSelected);
                              }}
                              data-testid={`checkbox-rental-${itemId}`}
                            />
                            <Label htmlFor={`rental-${itemId}`} className="text-sm cursor-pointer font-normal">
                              {item.name} (대여비: {item.rental_fee.toLocaleString()}원, 보증금: {item.deposit_amount.toLocaleString()}원)
                            </Label>
                          </div>
                        </div>
                        
                        {/* 보증금 상태 드롭다운 - 체크박스 선택된 경우에만 표시 */}
                        {isChecked && isInUse && (
                          <div className="ml-6 space-y-2">
                            <Label htmlFor={`deposit-status-${itemId}`} className="text-xs text-muted-foreground">
                              보증금 상태
                            </Label>
                            <Select 
                              value={depositStatus} 
                              onValueChange={(value) => {
                                const newStatuses = new Map(depositStatuses);
                                newStatuses.set(itemId, value as 'received' | 'refunded' | 'forfeited');
                                setDepositStatuses(newStatuses);
                              }}
                            >
                              <SelectTrigger 
                                id={`deposit-status-${itemId}`} 
                                data-testid={`select-deposit-${itemId}`}
                                className={!depositStatus ? 'border-orange-500' : ''}
                              >
                                <SelectValue placeholder="보증금 상태를 선택하세요" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="received">받음 (매출 기록)</SelectItem>
                                <SelectItem value="refunded">환불 (매출 없음)</SelectItem>
                                <SelectItem value="forfeited">미반환 (매출 기록)</SelectItem>
                              </SelectContent>
                            </Select>
                            {!depositStatus && (
                              <p className="text-xs text-orange-600 dark:text-orange-400">
                                ⚠️ 퇴실 전에 보증금 상태를 선택해주세요
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {isInUse ? (
              <>
                <Button variant="destructive" onClick={handleCancelClick} data-testid="button-cancel">
                  입실취소
                </Button>
                <Button variant="outline" onClick={handleSaveChanges} data-testid="button-save">
                  수정저장
                </Button>
                <Button 
                  onClick={handleCheckoutClick} 
                  className="bg-primary" 
                  data-testid="button-checkout"
                  disabled={(() => {
                    // Check if any selected rental item has no deposit status
                    const hasUnresolvedDeposits = Array.from(selectedRentalItems).some(itemId => {
                      const status = depositStatuses.get(itemId);
                      return !status; // Require explicit deposit status selection
                    });
                    
                    // Check if there are additional fees or rental items but not resolved yet
                    const hasIssues = selectedRentalItems.size > 0 || additionalFeeInfo.additionalFee > 0;
                    
                    return (hasIssues && !checkoutResolved) || hasUnresolvedDeposits;
                  })()}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning Alert for rental items and additional fees */}
      <AlertDialog open={showWarningAlert} onOpenChange={setShowWarningAlert}>
        <AlertDialogContent data-testid="dialog-warning-alert">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-600">⚠️ 확인 필요</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {(hasBlanket || hasLongTowel) && (
                <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-md border border-orange-200 dark:border-orange-800">
                  <p className="font-semibold text-orange-700 dark:text-orange-300 mb-1">대여 물품:</p>
                  <p className="text-sm text-orange-600 dark:text-orange-400">
                    {[hasBlanket && '담요', hasLongTowel && '롱타올'].filter(Boolean).join(', ')}
                  </p>
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
              <p className="text-sm text-muted-foreground mt-2">
                위 내용을 확인하고 해결하셨으면 '해결' 버튼을 눌러주세요.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleWarningClose} data-testid="button-warning-close">
              닫기
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleWarningResolved} className="bg-green-600 hover:bg-green-700" data-testid="button-warning-resolved">
              해결
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
    </>
  );
}
