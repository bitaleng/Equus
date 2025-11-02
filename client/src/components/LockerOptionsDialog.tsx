import { useState, useEffect } from "react";
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

interface LockerOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  lockerNumber: number;
  basePrice: number;
  timeType: '주간' | '야간';
  currentNotes?: string;
  currentPaymentMethod?: 'card' | 'cash';
  currentOptionType?: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price';
  currentOptionAmount?: number;
  currentFinalPrice?: number;
  discountAmount?: number;
  foreignerPrice?: number;
  isInUse?: boolean;
  onApply: (option: string, customAmount?: number, notes?: string, paymentMethod?: 'card' | 'cash') => void;
  onCheckout: () => void;
  onCancel: () => void;
}

export default function LockerOptionsDialog({
  open,
  onClose,
  lockerNumber,
  basePrice,
  timeType,
  currentNotes = "",
  currentPaymentMethod = 'card',
  currentOptionType = 'none',
  currentOptionAmount,
  currentFinalPrice,
  discountAmount = 2000,
  foreignerPrice = 25000,
  isInUse = false,
  onApply,
  onCheckout,
  onCancel,
}: LockerOptionsDialogProps) {
  const [discountOption, setDiscountOption] = useState<string>("none");
  const [discountInputAmount, setDiscountInputAmount] = useState<string>("");
  const [isForeigner, setIsForeigner] = useState(false);
  const [isDirectPrice, setIsDirectPrice] = useState(false);
  const [directPrice, setDirectPrice] = useState<string>("");
  const [notes, setNotes] = useState<string>(currentNotes);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>(currentPaymentMethod);
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

  // Initialize state from current option data when dialog opens
  useEffect(() => {
    if (open) {
      setNotes(currentNotes);
      setPaymentMethod(currentPaymentMethod);
      
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
    }
  }, [open, currentNotes, currentPaymentMethod, currentOptionType, currentOptionAmount, currentFinalPrice]);

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

  const handleProcessEntry = () => {
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

    onApply(optionType, optionAmount, notes, paymentMethod);
    setDialogOpen(false);
  };

  const handleSaveChanges = () => {
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

    onApply(optionType, optionAmount, notes, paymentMethod);
  };

  const handleCheckoutClick = () => {
    if (notes && notes.trim()) {
      setShowCheckoutConfirm(true);
    } else {
      onCheckout();
    }
  };

  const confirmCheckout = () => {
    setShowCheckoutConfirm(false);
    onCheckout();
  };

  const setDialogOpen = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-locker-options">
          <DialogHeader>
            <DialogTitle className="text-xl">락커 {lockerNumber}번 - {isInUse ? '옵션 수정' : '입실 처리'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">시간대</span>
                <span className="font-medium">{timeType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">기본 요금</span>
                <span className="font-semibold">{basePrice.toLocaleString()}원</span>
              </div>
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
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'card' | 'cash')}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">카드</SelectItem>
                  <SelectItem value="cash">현금</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 비고 */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-semibold">비고 (선택사항)</Label>
              <Textarea
                id="notes"
                placeholder="예: 담요 빌렸음, 귀중품 보관함 사용 등"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                rows={2}
                data-testid="input-notes"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {isInUse ? (
              <>
                <Button variant="ghost" onClick={onClose} data-testid="button-close">
                  닫기
                </Button>
                <Button variant="destructive" onClick={onCancel} data-testid="button-cancel">
                  입실취소
                </Button>
                <Button variant="outline" onClick={handleSaveChanges} data-testid="button-save">
                  수정저장
                </Button>
                <Button onClick={handleCheckoutClick} className="bg-primary" data-testid="button-checkout">
                  퇴실
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose} data-testid="button-close-new">
                  취소
                </Button>
                <Button onClick={handleProcessEntry} className="bg-primary" data-testid="button-process-entry">
                  입실처리
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCheckoutConfirm} onOpenChange={setShowCheckoutConfirm}>
        <AlertDialogContent data-testid="dialog-checkout-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>퇴실 확인</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>다음 비고 내용을 확인하셨습니까?</p>
              <div className="p-3 bg-muted rounded-md border">
                <p className="text-sm text-foreground whitespace-pre-wrap">{notes}</p>
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
