import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export type CashRegisterCounts = {
  count50000: number;
  count10000: number;
  count5000: number;
  count1000: number;
};

export const CASH_REGISTER_STORAGE_KEY = "cash_register";

export const EMPTY_CASH_REGISTER: CashRegisterCounts = {
  count50000: 0,
  count10000: 0,
  count5000: 0,
  count1000: 0,
};

export function calcCashRegisterTotal(cashRegister: CashRegisterCounts): number {
  return (
    cashRegister.count50000 * 50000 +
    cashRegister.count10000 * 10000 +
    cashRegister.count5000 * 5000 +
    cashRegister.count1000 * 1000
  );
}

export function loadCashRegister(): CashRegisterCounts {
  const saved = localStorage.getItem(CASH_REGISTER_STORAGE_KEY);
  if (!saved) return { ...EMPTY_CASH_REGISTER };
  try {
    const parsed = JSON.parse(saved) as Partial<CashRegisterCounts>;
    return {
      count50000: parsed.count50000 || 0,
      count10000: parsed.count10000 || 0,
      count5000: parsed.count5000 || 0,
      count1000: parsed.count1000 || 0,
    };
  } catch {
    return { ...EMPTY_CASH_REGISTER };
  }
}

export function saveCashRegister(cashRegister: CashRegisterCounts): void {
  localStorage.setItem(CASH_REGISTER_STORAGE_KEY, JSON.stringify(cashRegister));
}

interface CashRegisterInputProps {
  disabled?: boolean;
  onTotalChange?: (total: number) => void;
  showSaveButton?: boolean;
  onSaved?: (total: number) => void;
}

export function CashRegisterInput({
  disabled = false,
  onTotalChange,
  showSaveButton = true,
  onSaved,
}: CashRegisterInputProps) {
  const { toast } = useToast();
  const [cashRegister, setCashRegister] = useState<CashRegisterCounts>(EMPTY_CASH_REGISTER);

  useEffect(() => {
    setCashRegister(loadCashRegister());
  }, []);

  const total = calcCashRegisterTotal(cashRegister);

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  const handleSave = () => {
    saveCashRegister(cashRegister);
    onSaved?.(total);
    toast({ title: "시재금 저장 완료", description: "시재금이 성공적으로 저장되었습니다." });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {[
          { key: "count50000" as const, label: "5만원권", unit: 50000 },
          { key: "count10000" as const, label: "1만원권", unit: 10000 },
          { key: "count5000" as const, label: "5천원권", unit: 5000 },
          { key: "count1000" as const, label: "1천원권", unit: 1000 },
        ].map(({ key, label, unit }) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{label}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={key}
                type="text"
                min="0"
                value={cashRegister[key]}
                onChange={(e) =>
                  setCashRegister({ ...cashRegister, [key]: parseInt(e.target.value) || 0 })
                }
                placeholder="매수"
                disabled={disabled}
                data-testid={`input-${key}`}
              />
              <span className="text-sm text-muted-foreground min-w-[100px] text-right tabular-nums">
                {(cashRegister[key] * unit).toLocaleString()}원
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-4 border-t">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>시재금 총합</span>
          <span className="text-primary tabular-nums" data-testid="text-cash-register-total">
            {total.toLocaleString()}원
          </span>
        </div>
      </div>
      {showSaveButton && (
        <Button
          onClick={handleSave}
          className="w-full"
          disabled={disabled}
          data-testid="button-save-cash-register"
        >
          <Save className="h-4 w-4 mr-2" />
          시재금 저장
        </Button>
      )}
    </div>
  );
}
