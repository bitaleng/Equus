import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";

interface SalesSummaryProps {
  date: string;
  totalVisitors: number;
  totalSales: number;
  cancellations: number;
  foreignerCount: number;
  dayVisitors: number;
  nightVisitors: number;
  additionalFeeSales: number;
  rentalRevenue: number;
}

export default function SalesSummary({
  date,
  totalVisitors,
  totalSales,
  cancellations,
  foreignerCount,
  dayVisitors,
  nightVisitors,
  additionalFeeSales,
  rentalRevenue,
}: SalesSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger 
          className="w-full flex items-center justify-between p-3 rounded-md hover-elevate border border-border bg-card cursor-pointer"
          data-testid="button-toggle-sales-summary"
        >
          <h2 className="text-lg font-semibold">매출 집계</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              총 {totalSales.toLocaleString()}원
            </span>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium text-muted-foreground">
                {date}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">총 방문인원</p>
                  <p className="text-2xl font-semibold" data-testid="text-total-visitors">{totalVisitors}명</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">총 매출</p>
                  <p className="text-2xl font-semibold text-primary" data-testid="text-total-sales">
                    {totalSales.toLocaleString()}원
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">추가요금 매출</p>
                  <p className="text-xl font-medium text-destructive" data-testid="text-additional-fee-sales">
                    {additionalFeeSales.toLocaleString()}원
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">대여 매출</p>
                  <p className="text-xl font-medium text-primary" data-testid="text-rental-revenue">
                    {rentalRevenue.toLocaleString()}원
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">취소 건수</p>
                  <p className="text-xl font-medium" data-testid="text-cancellations">{cancellations}건</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">외국인 수</p>
                  <p className="text-xl font-medium" data-testid="text-foreigner-count">{foreignerCount}명</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">주간 방문수</p>
                  <p className="text-xl font-medium" data-testid="text-day-visitors">{dayVisitors}명</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">야간 방문수</p>
                  <p className="text-xl font-medium" data-testid="text-night-visitors">{nightVisitors}명</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
