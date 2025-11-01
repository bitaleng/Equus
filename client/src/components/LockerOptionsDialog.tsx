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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

interface LockerOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  lockerNumber: number;
  basePrice: number;
  timeType: '주간' | '야간';
  currentNotes?: string;
  currentPaymentMethod?: 'card' | 'cash';
  discountAmount?: number;
  foreignerPrice?: number;
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
  discountAmount = 2000,
  foreignerPrice = 25000,
  onApply,
  onCheckout,
  onCancel,
}: LockerOptionsDialogProps) {
  const [selectedOption, setSelectedOption] = useState<string>("none");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>(currentNotes);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>(currentPaymentMethod);
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

  // Update notes and paymentMethod when props change
  useEffect(() => {
    setNotes(currentNotes);
    setPaymentMethod(currentPaymentMethod);
  }, [currentNotes, currentPaymentMethod]);

  const calculateFinalPrice = () => {
    if (selectedOption === "foreigner") return foreignerPrice;
    if (selectedOption === "discount") return basePrice - discountAmount;
    if (selectedOption === "custom" && customAmount) {
      return basePrice - parseInt(customAmount);
    }
    return basePrice;
  };

  const handleApply = () => {
    if (selectedOption === "custom" && customAmount) {
      onApply(selectedOption, parseInt(customAmount), notes, paymentMethod);
    } else {
      onApply(selectedOption, undefined, notes, paymentMethod);
    }
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

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-locker-options">
          <DialogHeader>
            <DialogTitle className="text-xl">락커 {lockerNumber}번 - 옵션 선택</DialogTitle>
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

            <div className="space-y-3">
              <Label className="text-sm font-semibold">할인 옵션</Label>
              <RadioGroup value={selectedOption} onValueChange={setSelectedOption}>
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover-elevate">
                  <RadioGroupItem value="none" id="none" data-testid="option-none" />
                  <Label htmlFor="none" className="flex-1 cursor-pointer">없음</Label>
                </div>
                
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover-elevate">
                  <RadioGroupItem value="discount" id="discount" data-testid="option-discount" />
                  <Label htmlFor="discount" className="flex-1 cursor-pointer">할인 ({discountAmount.toLocaleString()}원)</Label>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 p-3 rounded-lg border hover-elevate">
                    <RadioGroupItem value="custom" id="custom" data-testid="option-custom" />
                    <Label htmlFor="custom" className="flex-1 cursor-pointer">직접 입력</Label>
                  </div>
                  {selectedOption === "custom" && (
                    <Input
                      type="number"
                      placeholder="할인 금액 입력"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="ml-8"
                      data-testid="input-custom-amount"
                    />
                  )}
                </div>
                
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover-elevate">
                  <RadioGroupItem value="foreigner" id="foreigner" data-testid="option-foreigner" />
                  <Label htmlFor="foreigner" className="flex-1 cursor-pointer">외국인 ({foreignerPrice.toLocaleString()}원)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">지불방식</Label>
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'card' | 'cash')}>
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover-elevate">
                  <RadioGroupItem value="card" id="card" data-testid="payment-card" />
                  <Label htmlFor="card" className="flex-1 cursor-pointer">카드</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover-elevate">
                  <RadioGroupItem value="cash" id="cash" data-testid="payment-cash" />
                  <Label htmlFor="cash" className="flex-1 cursor-pointer">현금</Label>
                </div>
              </RadioGroup>
            </div>

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
            <Button variant="ghost" onClick={onClose} data-testid="button-close">
              닫기
            </Button>
            <Button variant="outline" onClick={handleApply} data-testid="button-apply">
              적용
            </Button>
            <Button onClick={handleCheckoutClick} className="bg-primary" data-testid="button-checkout">
              퇴실
            </Button>
            <Button variant="destructive" onClick={onCancel} data-testid="button-cancel">
              입실취소
            </Button>
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
