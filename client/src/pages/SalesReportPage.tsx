import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Calendar, BarChart3, TrendingUp, TrendingDown, RefreshCw, Users, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import {
  getDailySummariesByMonth,
  getLockerLogsByBusinessDay,
  getLockerLogsByDateRange,
  getAllDailySummaries,
  getSettings,
  getCancelledSalesByMonth,
  getDailyPaymentBreakdownByMonth,
  getClosingDays,
  getVisitorStatsByMonth,
} from "@/lib/localDb";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, startOfWeek, endOfWeek, subWeeks, parseISO, getHours, addDays, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

const TIMEZONE = "Asia/Seoul";
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

interface DailySummary {
  businessDay: string;
  totalSales: number;
  totalVisitors: number;
  dayVisitors: number;
  nightVisitors: number;
  cancellations: number;
  totalDiscount: number;
}

interface CancelledSales {
  businessDay: string;
  cancelledAmount: number;
  cancelledCount: number;
}

interface PaymentBreakdown {
  businessDay: string;
  cash: number;
  card: number;
  transfer: number;
}

interface ClosingDay {
  businessDay: string;
  bankDeposit: number | null;
  isConfirmed: boolean;
}

interface VisitorStats {
  businessDay: string;
  totalVisitors: number;
  actualVisitors: number;
  cancelledVisitors: number;
  freeVisitors: number;
}

// Helper to get current date in Korea timezone
function getKoreaDate(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

// Helper to format date to YYYY-MM-DD in Korea timezone
function formatKoreaDate(date: Date): string {
  const koreaDate = toZonedTime(date, TIMEZONE);
  return format(koreaDate, "yyyy-MM-dd");
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

function calculateCurrentBusinessDay(): string {
  const now = toZonedTime(new Date(), TIMEZONE);
  const hour = now.getHours();
  if (hour < 10) {
    const yesterday = subDays(now, 1);
    return format(yesterday, "yyyy-MM-dd");
  }
  return format(now, "yyyy-MM-dd");
}

export default function SalesReportPage() {
  const [mainTab, setMainTab] = useState<"calendar" | "graph" | "visitors">("calendar");

  return (
    <div className="p-4 max-w-7xl mx-auto" data-testid="page-sales-report">
      <h1 className="text-2xl font-bold mb-4">매출리포트</h1>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "calendar" | "graph" | "visitors")}>
        <TabsList className="mb-4">
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="w-4 h-4 mr-2" />
            매출달력
          </TabsTrigger>
          <TabsTrigger value="graph" data-testid="tab-graph">
            <BarChart3 className="w-4 h-4 mr-2" />
            매출그래프
          </TabsTrigger>
          <TabsTrigger value="visitors" data-testid="tab-visitors">
            <Users className="w-4 h-4 mr-2" />
            방문인원
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <SalesCalendar />
        </TabsContent>

        <TabsContent value="graph">
          <SalesGraph />
        </TabsContent>

        <TabsContent value="visitors">
          <VisitorGraph />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SalesCalendar() {
  const [currentMonth, setCurrentMonth] = useState(getKoreaDate());
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [cancelledSales, setCancelledSales] = useState<CancelledSales[]>([]);
  const [paymentBreakdowns, setPaymentBreakdowns] = useState<PaymentBreakdown[]>([]);
  const [closingDays, setClosingDays] = useState<ClosingDay[]>([]);
  const [visitorStats, setVisitorStats] = useState<VisitorStats[]>([]);
  const [currentBusinessDay, setCurrentBusinessDay] = useState<string>("");
  const [viewType, setViewType] = useState<"sales" | "refund">("sales");

  useEffect(() => {
    const yearMonth = format(currentMonth, "yyyy-MM");
    const data = getDailySummariesByMonth(yearMonth);
    setSummaries(data as DailySummary[]);
    
    const cancelled = getCancelledSalesByMonth(yearMonth);
    setCancelledSales(cancelled as CancelledSales[]);
    
    const breakdowns = getDailyPaymentBreakdownByMonth(yearMonth);
    setPaymentBreakdowns(breakdowns as PaymentBreakdown[]);
    
    const closings = getClosingDays();
    setClosingDays(closings as ClosingDay[]);
    
    const visitors = getVisitorStatsByMonth(yearMonth);
    setVisitorStats(visitors as VisitorStats[]);
    
    setCurrentBusinessDay(calculateCurrentBusinessDay());
  }, [currentMonth]);

  const summaryMap = useMemo(() => {
    const map = new Map<string, DailySummary>();
    summaries.forEach((s) => map.set(s.businessDay, s));
    return map;
  }, [summaries]);

  const cancelledMap = useMemo(() => {
    const map = new Map<string, CancelledSales>();
    cancelledSales.forEach((c) => map.set(c.businessDay, c));
    return map;
  }, [cancelledSales]);

  const paymentMap = useMemo(() => {
    const map = new Map<string, PaymentBreakdown>();
    paymentBreakdowns.forEach((p) => map.set(p.businessDay, p));
    return map;
  }, [paymentBreakdowns]);

  const closingMap = useMemo(() => {
    const map = new Map<string, ClosingDay>();
    closingDays.forEach((c) => map.set(c.businessDay, c));
    return map;
  }, [closingDays]);

  const visitorMap = useMemo(() => {
    const map = new Map<string, VisitorStats>();
    visitorStats.forEach((v) => map.set(v.businessDay, v));
    return map;
  }, [visitorStats]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  const totalSales = summaries.reduce((sum, s) => sum + (s.totalSales || 0), 0);
  const totalCancelledAmount = cancelledSales.reduce((sum, c) => sum + (c.cancelledAmount || 0), 0);

  const salesValues = summaries.filter(s => s.totalSales > 0).map(s => s.totalSales);
  const maxSales = salesValues.length > 0 ? Math.max(...salesValues) : 0;
  const minSales = salesValues.length > 0 ? Math.min(...salesValues) : 0;
  const maxDay = summaries.find(s => s.totalSales === maxSales)?.businessDay;
  const minDay = summaries.find(s => s.totalSales === minSales && s.totalSales > 0)?.businessDay;

  const weeklyTotals = weeks.map(week => {
    return week.reduce((acc, day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const data = summaryMap.get(dateStr);
      const payment = paymentMap.get(dateStr);
      const closing = closingMap.get(dateStr);
      const visitor = visitorMap.get(dateStr);
      return {
        total: acc.total + (data?.totalSales || 0),
        cash: acc.cash + (payment?.cash || 0),
        card: acc.card + (payment?.card || 0),
        transfer: acc.transfer + (payment?.transfer || 0),
        bankDeposit: acc.bankDeposit + (closing?.bankDeposit || 0),
        hasClosing: acc.hasClosing || !!closing,
        totalVisitors: acc.totalVisitors + (visitor?.totalVisitors || 0),
        actualVisitors: acc.actualVisitors + (visitor?.actualVisitors || 0),
        cancelledVisitors: acc.cancelledVisitors + (visitor?.cancelledVisitors || 0),
        freeVisitors: acc.freeVisitors + (visitor?.freeVisitors || 0),
      };
    }, { total: 0, cash: 0, card: 0, transfer: 0, bankDeposit: 0, hasClosing: false, totalVisitors: 0, actualVisitors: 0, cancelledVisitors: 0, freeVisitors: 0 });
  });

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3'
      });

      // 한글 폰트 로드
      try {
        const fontResponse = await fetch('/fonts/NotoSansKR-Regular.ttf');
        if (fontResponse.ok) {
          const fontArrayBuffer = await fontResponse.arrayBuffer();
          const fontBytes = new Uint8Array(fontArrayBuffer);
          let fontBase64 = '';
          for (let i = 0; i < fontBytes.length; i++) {
            fontBase64 += String.fromCharCode(fontBytes[i]);
          }
          fontBase64 = btoa(fontBase64);
          doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
          doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
          doc.setFont('NotoSansKR', 'normal');
        }
      } catch (fontError) {
        console.warn('폰트 로드 실패:', fontError);
      }

      const pageWidth = 420;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    const headerHeight = 20;
    const dayHeaderHeight = 10;
    const colCount = 8;
    const colWidth = contentWidth / colCount;
    const rowCount = weeks.length;
    const availableHeight = pageHeight - margin * 2 - headerHeight - dayHeaderHeight;
    const rowHeight = Math.min(availableHeight / rowCount, 35);

    doc.setFontSize(18);
    doc.text(`${format(currentMonth, "yyyy년 M월")} 매출달력`, pageWidth / 2, margin + 8, { align: "center" });

    doc.setFontSize(12);
    const totalLabel = viewType === "sales" ? "실매출금액" : "취소금액";
    const totalValue = viewType === "sales" ? totalSales : totalCancelledAmount;
    doc.text(`총 ${totalLabel}: ${formatCurrency(totalValue)}원`, pageWidth - margin, margin + 8, { align: "right" });

    const tableStartY = margin + headerHeight;
    doc.setLineWidth(0.3);
    doc.setDrawColor(100, 100, 100);

    doc.setFillColor(240, 240, 240);
    doc.rect(margin, tableStartY, contentWidth, dayHeaderHeight, 'F');
    doc.rect(margin, tableStartY, contentWidth, dayHeaderHeight, 'S');

    doc.setFontSize(10);
    const dayColors: { [key: number]: [number, number, number] } = {
      0: [220, 38, 38],
      6: [59, 130, 246]
    };

    DAY_NAMES.forEach((dayName, idx) => {
      const x = margin + idx * colWidth + colWidth / 2;
      const y = tableStartY + dayHeaderHeight / 2 + 3;
      if (dayColors[idx]) {
        doc.setTextColor(...dayColors[idx]);
      } else {
        doc.setTextColor(0, 0, 0);
      }
      doc.text(dayName, x, y, { align: "center" });
    });

    doc.setTextColor(0, 0, 0);
    const weeklyX = margin + 7 * colWidth + colWidth / 2;
    doc.text("주간총계", weeklyX, tableStartY + dayHeaderHeight / 2 + 3, { align: "center" });

    for (let i = 0; i <= colCount; i++) {
      const x = margin + i * colWidth;
      doc.line(x, tableStartY, x, tableStartY + dayHeaderHeight + rowCount * rowHeight);
    }
    doc.line(margin, tableStartY, margin + contentWidth, tableStartY);
    doc.line(margin, tableStartY + dayHeaderHeight, margin + contentWidth, tableStartY + dayHeaderHeight);

    weeks.forEach((week, weekIdx) => {
      const rowY = tableStartY + dayHeaderHeight + weekIdx * rowHeight;

      week.forEach((day, dayIdx) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
        const data = summaryMap.get(dateStr);
        const sales = data?.totalSales || 0;
        const isMax = dateStr === maxDay && sales > 0;
        const isMin = dateStr === minDay && sales > 0 && salesValues.length > 1;
        const dayOfWeek = getDay(day);
        const payment = paymentMap.get(dateStr);
        const visitor = visitorMap.get(dateStr);
        const closing = closingMap.get(dateStr);

        const cellX = margin + dayIdx * colWidth;
        const cellY = rowY;
        const padding = 2;

        if (!isCurrentMonth) {
          doc.setFillColor(248, 248, 248);
          doc.rect(cellX, cellY, colWidth, rowHeight, 'F');
        }

        doc.setFontSize(9);
        if (dayOfWeek === 0) {
          doc.setTextColor(220, 38, 38);
        } else if (dayOfWeek === 6) {
          doc.setTextColor(59, 130, 246);
        } else {
          doc.setTextColor(isCurrentMonth ? 0 : 150, isCurrentMonth ? 0 : 150, isCurrentMonth ? 0 : 150);
        }
        let dayText = format(day, "d");
        if (isMax) dayText += " 최고";
        if (isMin) dayText += " 최저";
        doc.text(dayText, cellX + padding, cellY + padding + 4);

        let textY = cellY + padding + 9;

        if (viewType === "sales" && sales > 0) {
          doc.setFontSize(8);
          if (isMax) {
            doc.setTextColor(220, 38, 38);
          } else if (isMin) {
            doc.setTextColor(59, 130, 246);
          } else {
            doc.setTextColor(0, 0, 0);
          }
          doc.text(formatCurrency(sales), cellX + padding, textY);
          textY += 4;

          if (payment) {
            doc.setFontSize(6);
            doc.setTextColor(100, 100, 100);
            if (payment.cash > 0) {
              doc.text(`현금 ${formatCurrency(payment.cash)}`, cellX + padding, textY);
              textY += 3;
            }
            if (payment.card > 0) {
              doc.text(`카드 ${formatCurrency(payment.card)}`, cellX + padding, textY);
              textY += 3;
            }
            if (payment.transfer > 0) {
              doc.text(`이체 ${formatCurrency(payment.transfer)}`, cellX + padding, textY);
              textY += 3;
            }
          }

          if (closing && closing.isConfirmed) {
            doc.setFontSize(6);
            doc.setTextColor(22, 163, 74);
            doc.text(`은행입금: ${closing.bankDeposit ? formatCurrency(closing.bankDeposit) : 0}`, cellX + padding, textY);
            textY += 3;
          }
        }

        if (viewType === "sales" && visitor && visitor.totalVisitors > 0 && textY < cellY + rowHeight - 2) {
          doc.setFontSize(5);
          doc.setTextColor(147, 51, 234);
          doc.text(`방문:${visitor.totalVisitors}(실:${visitor.actualVisitors},취:${visitor.cancelledVisitors},무:${visitor.freeVisitors})`, cellX + padding, textY);
        }

        if (viewType === "refund") {
          const cancelled = cancelledMap.get(dateStr);
          if (cancelled && cancelled.cancelledAmount > 0) {
            doc.setFontSize(8);
            doc.setTextColor(220, 38, 38);
            doc.text(`-${formatCurrency(cancelled.cancelledAmount)}`, cellX + padding, textY);
          }
        }
      });

      const weeklyTotal = weeklyTotals[weekIdx];
      const weeklyColX = margin + 7 * colWidth;
      doc.setFillColor(245, 245, 245);
      doc.rect(weeklyColX, rowY, colWidth, rowHeight, 'F');

      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`${weekIdx + 1}주`, weeklyColX + colWidth / 2, rowY + 5, { align: "center" });

      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(weeklyTotal.total > 0 ? formatCurrency(weeklyTotal.total) : "0", weeklyColX + colWidth / 2, rowY + 10, { align: "center" });

      if (weeklyTotal.total > 0 && viewType === "sales") {
        let weeklyTextY = rowY + 14;
        doc.setFontSize(6);
        doc.setTextColor(100, 100, 100);
        if (weeklyTotal.cash > 0) {
          doc.text(`현금 ${formatCurrency(weeklyTotal.cash)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
          weeklyTextY += 3;
        }
        if (weeklyTotal.card > 0) {
          doc.text(`카드 ${formatCurrency(weeklyTotal.card)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
          weeklyTextY += 3;
        }
        if (weeklyTotal.transfer > 0) {
          doc.text(`이체 ${formatCurrency(weeklyTotal.transfer)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
          weeklyTextY += 3;
        }
        if (weeklyTotal.hasClosing && weeklyTextY < rowY + rowHeight - 2) {
          doc.setTextColor(22, 163, 74);
          doc.text(`은행입금 ${formatCurrency(weeklyTotal.bankDeposit)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
          weeklyTextY += 3;
        }
        if (weeklyTotal.totalVisitors > 0 && weeklyTextY < rowY + rowHeight - 2) {
          doc.setTextColor(147, 51, 234);
          doc.text(`방문:${weeklyTotal.totalVisitors}명`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
        }
      }
    });

    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    for (let i = 0; i <= colCount; i++) {
      const x = margin + i * colWidth;
      doc.line(x, tableStartY + dayHeaderHeight, x, tableStartY + dayHeaderHeight + rowCount * rowHeight);
    }
    for (let i = 0; i <= rowCount; i++) {
      const y = tableStartY + dayHeaderHeight + i * rowHeight;
      doc.line(margin, y, margin + contentWidth, y);
    }

      const fileName = `sales_calendar_${format(currentMonth, "yyyy-MM")}_${viewType === "sales" ? "sales" : "cancel"}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('PDF 생성 오류:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} data-testid="button-prev-month">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-lg font-semibold" data-testid="text-current-month">
              {format(currentMonth, "yyyy년 M월")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} data-testid="button-next-month">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold" data-testid="text-total-sales">
              총 {viewType === "sales" ? "실매출금액" : "취소금액"}: {formatCurrency(viewType === "sales" ? totalSales : totalCancelledAmount)}원
            </span>
            <div className="flex gap-2">
              <Button
                variant={viewType === "sales" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("sales")}
                data-testid="button-view-sales"
              >
                실매출금액
              </Button>
              <Button
                variant={viewType === "refund" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("refund")}
                data-testid="button-view-refund"
              >
                취소금액
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToPDF}
                data-testid="button-export-pdf"
              >
                <FileDown className="w-4 h-4 mr-1" />
                PDF
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-8 bg-muted/50">
            {DAY_NAMES.map((day, idx) => (
              <div
                key={day}
                className={`py-2 text-center font-medium text-sm border-b ${
                  idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : ""
                }`}
              >
                {day}
              </div>
            ))}
            <div className="py-2 text-center font-medium text-sm border-b bg-muted/80">주간총계</div>
          </div>

          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-8 border-b last:border-b-0">
              {week.map((day, dayIdx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const data = summaryMap.get(dateStr);
                const sales = data?.totalSales || 0;
                const isMax = dateStr === maxDay && sales > 0;
                const isMin = dateStr === minDay && sales > 0 && salesValues.length > 1;
                const dayOfWeek = getDay(day);
                const isToday = formatKoreaDate(new Date()) === dateStr;

                const payment = paymentMap.get(dateStr);

                return (
                  <div
                    key={dateStr}
                    className={`min-h-[100px] p-2 border-r last:border-r-0 ${
                      !isCurrentMonth ? "bg-muted/30 text-muted-foreground" : ""
                    } ${isToday ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                    data-testid={`calendar-day-${dateStr}`}
                  >
                    <div className={`text-sm font-medium ${
                      dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : ""
                    }`}>
                      {format(day, "d")}
                      {isMax && <span className="ml-1 text-red-500 text-xs">최고</span>}
                      {isMin && <span className="ml-1 text-blue-500 text-xs">최저</span>}
                    </div>
                    {sales > 0 && viewType === "sales" && (
                      <>
                        <div className={`text-sm mt-1 font-semibold ${isMax ? "text-red-600" : isMin ? "text-blue-600" : ""}`}>
                          {formatCurrency(sales)}
                        </div>
                        {payment && (
                          <div className="mt-1 text-[10px] text-muted-foreground leading-tight space-y-0.5">
                            {payment.cash > 0 && <div>현금 {formatCurrency(payment.cash)}</div>}
                            {payment.card > 0 && <div>카드 {formatCurrency(payment.card)}</div>}
                            {payment.transfer > 0 && <div>이체 {formatCurrency(payment.transfer)}</div>}
                          </div>
                        )}
                        {(() => {
                          const closing = closingMap.get(dateStr);
                          const isCurrentDay = dateStr === currentBusinessDay;
                          if (isCurrentDay && (!closing || !closing.isConfirmed)) {
                            return <div className="mt-1 text-[10px] text-orange-500">은행입금: 정산전</div>;
                          }
                          if (closing && closing.isConfirmed) {
                            return (
                              <div className="mt-1 text-[10px] text-green-600">
                                은행입금: {closing.bankDeposit ? formatCurrency(closing.bankDeposit) : 0}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    )}
                    {viewType === "sales" && (() => {
                      const visitor = visitorMap.get(dateStr);
                      if (visitor && visitor.totalVisitors > 0) {
                        return (
                          <div className={`mt-1 text-[10px] text-purple-600 dark:text-purple-400 ${sales > 0 ? 'border-t border-muted pt-0.5' : ''}`}>
                            방문:{visitor.totalVisitors}명(실:{visitor.actualVisitors}, 취:{visitor.cancelledVisitors}, 무:{visitor.freeVisitors})
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {viewType === "refund" && (() => {
                      const cancelled = cancelledMap.get(dateStr);
                      if (cancelled && cancelled.cancelledAmount > 0) {
                        return (
                          <div className="text-sm mt-1 text-red-500">
                            -{formatCurrency(cancelled.cancelledAmount)}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                );
              })}
              <div className="min-h-[100px] p-2 bg-muted/30 flex flex-col justify-center items-center">
                <div className="text-xs text-muted-foreground">{weekIdx + 1}주</div>
                <div className="font-semibold text-sm">
                  {weeklyTotals[weekIdx].total > 0 ? formatCurrency(weeklyTotals[weekIdx].total) : 0}
                </div>
                {weeklyTotals[weekIdx].total > 0 && viewType === "sales" && (
                  <div className="mt-1 text-[10px] text-muted-foreground leading-tight space-y-0.5 text-center">
                    {weeklyTotals[weekIdx].cash > 0 && <div>현금 {formatCurrency(weeklyTotals[weekIdx].cash)}</div>}
                    {weeklyTotals[weekIdx].card > 0 && <div>카드 {formatCurrency(weeklyTotals[weekIdx].card)}</div>}
                    {weeklyTotals[weekIdx].transfer > 0 && <div>이체 {formatCurrency(weeklyTotals[weekIdx].transfer)}</div>}
                    {weeklyTotals[weekIdx].hasClosing && (
                      <div className="text-green-600 dark:text-green-400 font-medium pt-0.5 border-t border-muted mt-0.5">
                        은행입금 {formatCurrency(weeklyTotals[weekIdx].bankDeposit)}
                      </div>
                    )}
                  </div>
                )}
                {viewType === "sales" && weeklyTotals[weekIdx].totalVisitors > 0 && (
                  <div className={`text-[10px] text-purple-600 dark:text-purple-400 text-center ${weeklyTotals[weekIdx].total > 0 ? 'mt-1 pt-0.5 border-t border-muted' : 'mt-1'}`}>
                    방문:{weeklyTotals[weekIdx].totalVisitors}명
                    <div>(실:{weeklyTotals[weekIdx].actualVisitors}, 취:{weeklyTotals[weekIdx].cancelledVisitors}, 무:{weeklyTotals[weekIdx].freeVisitors})</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SalesGraph() {
  const [graphType, setGraphType] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-graph">
          <RefreshCw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>
      <Tabs value={graphType} onValueChange={(v) => setGraphType(v as any)}>
        <TabsList>
          <TabsTrigger value="daily" data-testid="tab-graph-daily">일간</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-graph-weekly">주간</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-graph-monthly">월간</TabsTrigger>
          <TabsTrigger value="yearly" data-testid="tab-graph-yearly">연간</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <DailyGraph key={`daily-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="weekly">
          <WeeklyGraph key={`weekly-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="monthly">
          <MonthlyGraph key={`monthly-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="yearly">
          <YearlyGraph key={`yearly-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DailyGraph() {
  const [subTab, setSubTab] = useState<"daily" | "hourly">("daily");
  const [selectedDate, setSelectedDate] = useState(getKoreaDate());
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour || 10;

  useEffect(() => {
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(selectedDate, i);
      dates.push(format(d, "yyyy-MM-dd"));
    }

    console.log('[DailyGraph] 조회할 날짜 범위:', dates);
    
    const data = dates.map((dateStr) => {
      const summaries = getDailySummariesByMonth(dateStr.substring(0, 7));
      console.log(`[DailyGraph] ${dateStr.substring(0, 7)} 월 데이터:`, summaries.length, '건');
      const daySummary = (summaries as DailySummary[]).find((s) => s.businessDay === dateStr);
      if (daySummary) {
        console.log(`[DailyGraph] ${dateStr} 매출:`, daySummary.totalSales);
      }
      const d = parseISO(dateStr + "T12:00:00");
      return {
        date: dateStr,
        label: format(d, "dd일(E)", { locale: ko }),
        sales: daySummary?.totalSales || 0,
      };
    });
    console.log('[DailyGraph] 최종 그래프 데이터:', data);
    setDailyData(data);
  }, [selectedDate]);

  useEffect(() => {
    if (subTab === "hourly") {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const logs = getLockerLogsByBusinessDay(dateStr);
      
      console.log(`[HourlyGraph] ${dateStr} 영업일 로그:`, logs.length, '건');
      
      const hourlyMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) {
        hourlyMap.set(h, 0);
      }

      (logs as any[]).forEach((log) => {
        if (log.entryTime && log.finalPrice) {
          const entryTime = toZonedTime(new Date(log.entryTime), TIMEZONE);
          const hour = getHours(entryTime);
          hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + (log.finalPrice || 0));
        }
      });

      // 영업일 기준 순서대로 표시 (10시~23시, 익일0시~익일9시)
      const data: any[] = [];
      for (let h = businessDayStartHour; h < 24; h++) {
        data.push({ hour: `${h}시`, sales: hourlyMap.get(h) || 0, isNextDay: false });
      }
      for (let h = 0; h < businessDayStartHour; h++) {
        data.push({ hour: `익일${h}시`, sales: hourlyMap.get(h) || 0, isNextDay: true });
      }

      console.log(`[HourlyGraph] 시간대별 데이터:`, data.filter(d => d.sales > 0));
      setHourlyData(data);
    }
  }, [subTab, selectedDate, businessDayStartHour]);

  const totalSales = dailyData.reduce((sum, d) => sum + d.sales, 0);
  const currentDaySales = dailyData.find(d => d.date === format(selectedDate, "yyyy-MM-dd"))?.sales || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">일별/시간별 매출</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">기간선택</span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium" data-testid="text-selected-date">
              {format(selectedDate, "yyyy. M. d(E)", { locale: ko })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">실매출</div>
              <div className="text-2xl font-bold">{formatCurrency(currentDaySales)}원</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">7일 합계</div>
              <div className="text-2xl font-bold">{formatCurrency(totalSales)}원</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "daily" | "hourly")}>
          <TabsList>
            <TabsTrigger value="daily">일별</TabsTrigger>
            <TabsTrigger value="hourly">시간대별</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="mt-4">
            <div className="text-sm text-muted-foreground mb-2">(천원단위)</div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]} />
                  <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="hourly" className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">영업일선택</span>
                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))} data-testid="button-hourly-prev-day">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium" data-testid="text-hourly-selected-date">
                  {format(selectedDate, "yyyy. M. d(E)", { locale: ko })}
                </span>
                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))} data-testid="button-hourly-next-day">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                정산기준: {format(selectedDate, "M/d")} {businessDayStartHour}:00 ~ 익일 {businessDayStartHour}:00
              </div>
            </div>
            <div className="text-sm text-muted-foreground mb-2">(천원단위)</div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]} />
                  <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function WeeklyGraph() {
  const [subTab, setSubTab] = useState<"weekly" | "dayOfWeek">("weekly");
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [dayOfWeekData, setDayOfWeekData] = useState<any[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => startOfWeek(getKoreaDate(), { weekStartsOn: 1 }));

  useEffect(() => {
    const weeks: any[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = subWeeks(selectedWeekStart, i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const startStr = format(weekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");
      
      const summaries = getAllDailySummaries() as DailySummary[];
      const weekSales = summaries
        .filter(s => s.businessDay >= startStr && s.businessDay <= endStr)
        .reduce((sum, s) => sum + (s.totalSales || 0), 0);

      weeks.push({
        week: format(weekStart, "M/d") + "~" + format(weekEnd, "M/d"),
        sales: weekSales,
      });
    }
    setWeeklyData(weeks);
  }, [selectedWeekStart]);

  useEffect(() => {
    if (subTab === "dayOfWeek") {
      const weekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 1 });
      const startStr = format(selectedWeekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");

      const summaries = getAllDailySummaries() as DailySummary[];
      const weekData = summaries.filter(s => s.businessDay >= startStr && s.businessDay <= endStr);

      const dayData = DAY_NAMES.slice(1).concat(DAY_NAMES[0]).map((dayName, idx) => {
        const targetDay = idx === 6 ? 0 : idx + 1;
        const daySummary = weekData.find(s => {
          const d = parseISO(s.businessDay);
          return getDay(d) === targetDay;
        });
        return {
          day: dayName + "요일",
          sales: daySummary?.totalSales || 0,
        };
      });

      setDayOfWeekData(dayData);
    }
  }, [subTab, selectedWeekStart]);

  const totalWeekSales = weeklyData.reduce((sum, w) => sum + w.sales, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">주간/요일별 매출</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSelectedWeekStart(d => subWeeks(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium">
              {format(selectedWeekStart, "yyyy.M.d(E)", { locale: ko })}~{format(endOfWeek(selectedWeekStart, { weekStartsOn: 1 }), "M.d(E)", { locale: ko })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedWeekStart(d => addDays(d, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">실매출(4주 동안)</div>
              <div className="text-2xl font-bold">{formatCurrency(totalWeekSales)}원</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "weekly" | "dayOfWeek")}>
          <TabsList>
            <TabsTrigger value="weekly">주별</TabsTrigger>
            <TabsTrigger value="dayOfWeek">요일별</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="mt-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]} />
                  <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="dayOfWeek" className="mt-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayOfWeekData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]} />
                  <Bar dataKey="sales" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function MonthlyGraph() {
  const [selectedYear, setSelectedYear] = useState(getKoreaDate().getFullYear());
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => {
    const summaries = getAllDailySummaries() as DailySummary[];
    const monthlyMap = new Map<string, number>();

    summaries.forEach((s) => {
      if (!s.businessDay) return;
      const month = s.businessDay.substring(0, 7);
      if (month.startsWith(selectedYear.toString())) {
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + (s.totalSales || 0));
      }
    });

    const data = [];
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${selectedYear}-${m.toString().padStart(2, "0")}`;
      data.push({
        month: `${m}월`,
        sales: monthlyMap.get(monthKey) || 0,
      });
    }
    setMonthlyData(data);
  }, [selectedYear]);

  const totalYearSales = monthlyData.reduce((sum, m) => sum + m.sales, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">월별 매출</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSelectedYear(y => y - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium">{selectedYear}년</span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedYear(y => y + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{selectedYear}년 총 매출</div>
            <div className="text-2xl font-bold">{formatCurrency(totalYearSales)}원</div>
          </CardContent>
        </Card>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"} />
              <Tooltip formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]} />
              <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function YearlyGraph() {
  const [yearlyData, setYearlyData] = useState<any[]>([]);

  useEffect(() => {
    const summaries = getAllDailySummaries() as DailySummary[];
    const yearlyMap = new Map<number, number>();

    summaries.forEach((s) => {
      if (!s.businessDay) return;
      const year = parseInt(s.businessDay.substring(0, 4));
      yearlyMap.set(year, (yearlyMap.get(year) || 0) + (s.totalSales || 0));
    });

    const years = Array.from(yearlyMap.keys()).sort();
    const data = years.map((year) => ({
      year: `${year}년`,
      sales: yearlyMap.get(year) || 0,
    }));

    if (data.length === 0) {
      const currentYear = getKoreaDate().getFullYear();
      for (let y = currentYear - 2; y <= currentYear; y++) {
        data.push({ year: `${y}년`, sales: 0 });
      }
    }

    setYearlyData(data);
  }, []);

  const totalSales = yearlyData.reduce((sum, y) => sum + y.sales, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">연도별 매출</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">전체 기간 총 매출</div>
            <div className="text-2xl font-bold">{formatCurrency(totalSales)}원</div>
          </CardContent>
        </Card>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"} />
              <Tooltip formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]} />
              <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} dot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// 방문인원수 그래프 컴포넌트
function VisitorGraph() {
  const [graphType, setGraphType] = useState<"daily" | "weekly" | "monthly" | "yearly" | "hourly">("daily");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-visitor-graph">
          <RefreshCw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>
      <Tabs value={graphType} onValueChange={(v) => setGraphType(v as any)}>
        <TabsList>
          <TabsTrigger value="daily" data-testid="tab-visitor-daily">일간</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-visitor-weekly">주간</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-visitor-monthly">월간</TabsTrigger>
          <TabsTrigger value="yearly" data-testid="tab-visitor-yearly">연간</TabsTrigger>
          <TabsTrigger value="hourly" data-testid="tab-visitor-hourly">시간대별</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <DailyVisitorGraph key={`daily-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="weekly">
          <WeeklyVisitorGraph key={`weekly-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="monthly">
          <MonthlyVisitorGraph key={`monthly-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="yearly">
          <YearlyVisitorGraph key={`yearly-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="hourly">
          <HourlyVisitorGraph key={`hourly-visitor-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DailyVisitorGraph() {
  const [selectedDate, setSelectedDate] = useState(getKoreaDate());
  const [dailyData, setDailyData] = useState<any[]>([]);

  useEffect(() => {
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(selectedDate, i);
      dates.push(format(d, "yyyy-MM-dd"));
    }

    const data = dates.map((dateStr) => {
      const visitors = getVisitorStatsByMonth(dateStr.substring(0, 7)) as VisitorStats[];
      const dayData = visitors.find((v) => v.businessDay === dateStr);
      const d = parseISO(dateStr + "T12:00:00");
      return {
        date: dateStr,
        label: format(d, "dd일(E)", { locale: ko }),
        total: dayData?.totalVisitors || 0,
        actual: dayData?.actualVisitors || 0,
        cancelled: dayData?.cancelledVisitors || 0,
        free: dayData?.freeVisitors || 0,
      };
    });
    setDailyData(data);
  }, [selectedDate]);

  const totalVisitors = dailyData.reduce((sum, d) => sum + d.total, 0);
  const actualVisitors = dailyData.reduce((sum, d) => sum + d.actual, 0);
  const currentDayData = dailyData.find(d => d.date === format(selectedDate, "yyyy-MM-dd"));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">일별 방문인원</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">기간선택</span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium">
              {format(selectedDate, "yyyy. M. d(E)", { locale: ko })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">당일 총방문</div>
              <div className="text-2xl font-bold">{currentDayData?.total || 0}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">당일 실제방문</div>
              <div className="text-2xl font-bold text-green-600">{currentDayData?.actual || 0}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">7일 총합</div>
              <div className="text-2xl font-bold">{totalVisitors}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">7일 실제방문</div>
              <div className="text-2xl font-bold text-green-600">{actualVisitors}명</div>
            </CardContent>
          </Card>
        </div>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                  return [`${value}명`, labels[name] || name];
                }} 
              />
              <Legend formatter={(value) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                return labels[value] || value;
              }} />
              <Bar dataKey="actual" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="cancelled" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="free" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyVisitorGraph() {
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => startOfWeek(getKoreaDate(), { weekStartsOn: 1 }));

  useEffect(() => {
    const weeks: any[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = subWeeks(selectedWeekStart, i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const startStr = format(weekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");
      
      const startMonth = format(weekStart, "yyyy-MM");
      const endMonth = format(weekEnd, "yyyy-MM");
      
      let allVisitors = getVisitorStatsByMonth(startMonth) as VisitorStats[];
      if (startMonth !== endMonth) {
        const endMonthVisitors = getVisitorStatsByMonth(endMonth) as VisitorStats[];
        allVisitors = [...allVisitors, ...endMonthVisitors];
      }
      
      const weekData = allVisitors.filter(v => v.businessDay >= startStr && v.businessDay <= endStr);
      
      const total = weekData.reduce((sum, v) => sum + v.totalVisitors, 0);
      const actual = weekData.reduce((sum, v) => sum + v.actualVisitors, 0);
      const cancelled = weekData.reduce((sum, v) => sum + v.cancelledVisitors, 0);
      const free = weekData.reduce((sum, v) => sum + v.freeVisitors, 0);

      weeks.push({
        label: `${format(weekStart, "M/d")}~${format(weekEnd, "M/d")}`,
        total, actual, cancelled, free
      });
    }
    setWeeklyData(weeks);
  }, [selectedWeekStart]);

  const totalVisitors = weeklyData.reduce((sum, w) => sum + w.total, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">주간 방문인원</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSelectedWeekStart(d => subWeeks(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium">
              {format(selectedWeekStart, "yyyy. M. d", { locale: ko })} 주
            </span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedWeekStart(d => addDays(d, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">4주간 총 방문</div>
            <div className="text-2xl font-bold">{totalVisitors}명</div>
          </CardContent>
        </Card>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                return [`${value}명`, labels[name] || name];
              }} />
              <Legend formatter={(value) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                return labels[value] || value;
              }} />
              <Bar dataKey="actual" stackId="a" fill="#22c55e" />
              <Bar dataKey="cancelled" stackId="a" fill="#ef4444" />
              <Bar dataKey="free" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyVisitorGraph() {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState(getKoreaDate().getFullYear());

  useEffect(() => {
    const months: any[] = [];
    for (let m = 1; m <= 12; m++) {
      const yearMonth = `${selectedYear}-${String(m).padStart(2, '0')}`;
      const visitors = getVisitorStatsByMonth(yearMonth) as VisitorStats[];
      
      const total = visitors.reduce((sum, v) => sum + v.totalVisitors, 0);
      const actual = visitors.reduce((sum, v) => sum + v.actualVisitors, 0);
      const cancelled = visitors.reduce((sum, v) => sum + v.cancelledVisitors, 0);
      const free = visitors.reduce((sum, v) => sum + v.freeVisitors, 0);

      months.push({ label: `${m}월`, total, actual, cancelled, free });
    }
    setMonthlyData(months);
  }, [selectedYear]);

  const totalVisitors = monthlyData.reduce((sum, m) => sum + m.total, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">월별 방문인원</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSelectedYear(y => y - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium">{selectedYear}년</span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedYear(y => y + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{selectedYear}년 총 방문</div>
            <div className="text-2xl font-bold">{totalVisitors}명</div>
          </CardContent>
        </Card>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                return [`${value}명`, labels[name] || name];
              }} />
              <Legend formatter={(value) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                return labels[value] || value;
              }} />
              <Bar dataKey="actual" stackId="a" fill="#22c55e" />
              <Bar dataKey="cancelled" stackId="a" fill="#ef4444" />
              <Bar dataKey="free" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function YearlyVisitorGraph() {
  const [yearlyData, setYearlyData] = useState<any[]>([]);

  useEffect(() => {
    const currentYear = getKoreaDate().getFullYear();
    const years: any[] = [];
    
    for (let y = currentYear - 2; y <= currentYear; y++) {
      let total = 0, actual = 0, cancelled = 0, free = 0;
      
      for (let m = 1; m <= 12; m++) {
        const yearMonth = `${y}-${String(m).padStart(2, '0')}`;
        const visitors = getVisitorStatsByMonth(yearMonth) as VisitorStats[];
        total += visitors.reduce((sum, v) => sum + v.totalVisitors, 0);
        actual += visitors.reduce((sum, v) => sum + v.actualVisitors, 0);
        cancelled += visitors.reduce((sum, v) => sum + v.cancelledVisitors, 0);
        free += visitors.reduce((sum, v) => sum + v.freeVisitors, 0);
      }
      
      years.push({ label: `${y}년`, total, actual, cancelled, free });
    }
    
    setYearlyData(years);
  }, []);

  const totalVisitors = yearlyData.reduce((sum, y) => sum + y.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">연도별 방문인원</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">전체 기간 총 방문</div>
            <div className="text-2xl font-bold">{totalVisitors}명</div>
          </CardContent>
        </Card>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료", total: "총방문" };
                return [`${value}명`, labels[name] || name];
              }} />
              <Legend formatter={(value) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료", total: "총방문" };
                return labels[value] || value;
              }} />
              <Line type="monotone" dataKey="actual" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="cancelled" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="free" stroke="#a855f7" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function HourlyVisitorGraph() {
  const [selectedDate, setSelectedDate] = useState(getKoreaDate());
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour || 10;

  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const logs = getLockerLogsByBusinessDay(dateStr) as any[];
    
    const hourlyMap = new Map<number, { actual: number; cancelled: number; free: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { actual: 0, cancelled: 0, free: 0 });
    }

    logs.forEach((log) => {
      if (log.entryTime) {
        const entryTime = toZonedTime(new Date(log.entryTime), TIMEZONE);
        const hour = getHours(entryTime);
        const entry = hourlyMap.get(hour)!;
        
        if (log.cancelled) {
          entry.cancelled++;
        } else if (log.optionType === 'free') {
          entry.free++;
        } else {
          entry.actual++;
        }
      }
    });

    const data: any[] = [];
    for (let h = businessDayStartHour; h < 24; h++) {
      const entry = hourlyMap.get(h)!;
      data.push({ hour: `${h}시`, ...entry, isNextDay: false });
    }
    for (let h = 0; h < businessDayStartHour; h++) {
      const entry = hourlyMap.get(h)!;
      data.push({ hour: `익일${h}시`, ...entry, isNextDay: true });
    }

    setHourlyData(data);
  }, [selectedDate, businessDayStartHour]);

  const totalVisitors = hourlyData.reduce((sum, h) => sum + h.actual + h.cancelled + h.free, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">시간대별 방문인원</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">영업일선택</span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium">
              {format(selectedDate, "yyyy. M. d(E)", { locale: ko })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Card className="bg-muted/30 flex-1">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">당일 총 방문</div>
              <div className="text-2xl font-bold">{totalVisitors}명</div>
            </CardContent>
          </Card>
          <div className="text-xs text-muted-foreground ml-4">
            정산기준: {format(selectedDate, "M/d")} {businessDayStartHour}:00 ~ 익일 {businessDayStartHour}:00
          </div>
        </div>

        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                return [`${value}명`, labels[name] || name];
              }} />
              <Legend formatter={(value) => {
                const labels: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료" };
                return labels[value] || value;
              }} />
              <Bar dataKey="actual" stackId="a" fill="#22c55e" />
              <Bar dataKey="cancelled" stackId="a" fill="#ef4444" />
              <Bar dataKey="free" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
