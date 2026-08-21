import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CashRegisterInput } from "@/components/CashRegisterInput";
import { DollarSign } from "lucide-react";

export default function CashRegisterPage() {
  return (
    <div className="h-full overflow-y-auto p-4 max-w-xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            시재금 관리
          </CardTitle>
          <CardDescription>지폐 단위별 매수를 입력하여 시재금을 관리합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <CashRegisterInput />
        </CardContent>
      </Card>
    </div>
  );
}
