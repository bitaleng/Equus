import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, DollarSign } from "lucide-react";

export default function CashRegisterPage() {
  const { toast } = useToast();
  const [cashRegister, setCashRegister] = useState({
    count50000: 0,
    count10000: 0,
    count5000: 0,
    count1000: 0,
  });

  useEffect(() => {
    const saved = localStorage.getItem('cash_register');
    if (saved) {
      try { setCashRegister(JSON.parse(saved)); }
      catch { /* ignore */ }
    }
  }, []);

  const total =
    cashRegister.count50000 * 50000 +
    cashRegister.count10000 * 10000 +
    cashRegister.count5000 * 5000 +
    cashRegister.count1000 * 1000;

  const handleSave = () => {
    localStorage.setItem('cash_register', JSON.stringify(cashRegister));
    toast({ title: "시재금 저장 완료", description: "시재금이 성공적으로 저장되었습니다." });
  };

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            시재금 관리
          </CardTitle>
          <CardDescription>지폐 단위별 매수를 입력하여 시재금을 관리합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'count50000' as const, label: '5만원권', unit: 50000 },
              { key: 'count10000' as const, label: '1만원권', unit: 10000 },
              { key: 'count5000'  as const, label: '5천원권', unit: 5000  },
              { key: 'count1000'  as const, label: '1천원권', unit: 1000  },
            ].map(({ key, label, unit }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={key}
                    type="number"
                    min="0"
                    value={cashRegister[key]}
                    onChange={(e) => setCashRegister({ ...cashRegister, [key]: parseInt(e.target.value) || 0 })}
                    placeholder="매수"
                    data-testid={`input-${key}`}
                  />
                  <span className="text-sm text-muted-foreground min-w-[100px] text-right">
                    {(cashRegister[key] * unit).toLocaleString()}원
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>시재금 총합</span>
              <span className="text-primary">{total.toLocaleString()}원</span>
            </div>
          </div>
          <Button onClick={handleSave} className="w-full" data-testid="button-save-cash-register">
            <Save className="h-4 w-4 mr-2" />
            시재금 저장
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
