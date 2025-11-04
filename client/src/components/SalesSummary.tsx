import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  totalExpenses: number;
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
  totalExpenses,
}: SalesSummaryProps) {
  const entrySales = totalSales + additionalFeeSales;
  const grandTotal = entrySales + rentalRevenue;
  const netProfit = grandTotal - totalExpenses;
  
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">매출 집계</h2>
      
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
              <p className="text-xs text-muted-foreground uppercase tracking-wide">총 수입</p>
              <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400" data-testid="text-grand-total">
                {grandTotal.toLocaleString()}원
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">입실매출 (추가요금 포함)</p>
              <p className="text-lg font-medium" data-testid="text-entry-sales">
                {entrySales.toLocaleString()}원
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">대여 매출</p>
              <p className="text-lg font-medium" data-testid="text-rental-revenue">
                {rentalRevenue.toLocaleString()}원
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">총 지출</p>
              <p className="text-lg font-medium text-red-600 dark:text-red-400" data-testid="text-total-expenses">
                {totalExpenses.toLocaleString()}원
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">순매출</p>
              <p className="text-2xl font-semibold text-primary" data-testid="text-net-profit">
                {netProfit.toLocaleString()}원
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">취소 건수</p>
              <p className="text-lg font-medium" data-testid="text-cancellations">{cancellations}건</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">외국인 수</p>
              <p className="text-lg font-medium" data-testid="text-foreigner-count">{foreignerCount}명</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">주간 방문수</p>
              <p className="text-lg font-medium" data-testid="text-day-visitors">{dayVisitors}명</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">야간 방문수</p>
              <p className="text-lg font-medium" data-testid="text-night-visitors">{nightVisitors}명</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
