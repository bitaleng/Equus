import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SalesSummaryProps {
  date: string;
  totalVisitors: number;
  totalSales: number;
  cancellations: number;
  foreignerCount: number;
  dayVisitors: number;
  nightVisitors: number;
}

export default function SalesSummary({
  date,
  totalVisitors,
  totalSales,
  cancellations,
  foreignerCount,
  dayVisitors,
  nightVisitors,
}: SalesSummaryProps) {
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
              <p className="text-xs text-muted-foreground uppercase tracking-wide">총 매출</p>
              <p className="text-2xl font-semibold text-primary" data-testid="text-total-sales">
                {totalSales.toLocaleString()}원
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
    </div>
  );
}
