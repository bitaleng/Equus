import { useState, useEffect, useMemo, useRef, type ReactElement } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Calendar, BarChart3, TrendingUp, TrendingDown, RefreshCw, Users, FileDown, FileSpreadsheet, ListTree, Rows3 } from "lucide-react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
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
  getDiscountTotalsByMonth,
  getDailyDiscountBreakdownByMonth,
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
  extendedGuestCount: number;
}

interface DailyDiscount {
  businessDay: string;
  entryDiscount: number;
  additionalDiscount: number;
  totalDiscount: number;
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

/**
 * Recharts ResponsiveContainer(width=100%)가 중첩 Tabs 안에서
 * 부모 너비를 잘못 재측정하며 가로가 점점 줄어드는 문제를 막습니다.
 * 부모의 실제 픽셀 너비를 측정해 고정폭으로 그립니다.
 * touch-action: pan-y 로 차트 위에서도 세로 스크롤이 동작합니다.
 */
function ChartFrame({
  children,
  height = 300,
}: {
  children: ReactElement;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) {
        setWidth((prev) => (prev === next ? prev : next));
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="w-full min-w-0"
      style={{ height, touchAction: "pan-y" }}
      data-testid="chart-frame"
    >
      {width > 0 ? (
        <ResponsiveContainer width={width} height={height} debounce={50}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

const VISITOR_LEGEND_LABELS: Record<string, string> = { actual: "실제방문", cancelled: "취소", free: "무료", total: "총방문" };
const VISITOR_COLORS = { actual: "hsl(var(--primary))", cancelled: "#ef4444", free: "#a855f7" };

function VisitorLegend({ payload }: any) {
  if (!payload) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 pt-1">
      {payload.map((entry: any) => (
        <div key={entry.value} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-xs text-muted-foreground">{VISITOR_LEGEND_LABELS[entry.value] || entry.value}</span>
        </div>
      ))}
    </div>
  );
}

const visitorTooltipContentStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--popover))",
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.25)",
  fontSize: 12,
  padding: "8px 12px",
};
const visitorTooltipLabelStyle = { color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: 4 };
const visitorAxisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const visitorCursorStyle = { fill: "hsl(var(--primary) / 0.08)" };

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
    <div className="h-full min-h-0 w-full flex flex-col" data-testid="page-sales-report">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="w-full max-w-7xl mx-auto p-4 pb-10">
          <h1 className="text-2xl font-bold mb-4">매출리포트</h1>

          <Tabs
            value={mainTab}
            onValueChange={(v) => setMainTab(v as "calendar" | "graph" | "visitors")}
            className="w-full min-w-0"
          >
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

            <TabsContent value="calendar" className="w-full min-w-0 mt-0">
              <SalesCalendar />
            </TabsContent>

            <TabsContent value="graph" className="w-full min-w-0 mt-0">
              <SalesGraph />
            </TabsContent>

            <TabsContent value="visitors" className="w-full min-w-0 mt-0">
              <VisitorGraph />
            </TabsContent>
          </Tabs>
        </div>
      </div>
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
  const [discountTotals, setDiscountTotals] = useState({
    entryDiscount: 0,
    additionalDiscount: 0,
    totalDiscount: 0,
  });
  const [dailyDiscounts, setDailyDiscounts] = useState<DailyDiscount[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

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

    setDiscountTotals(getDiscountTotalsByMonth(yearMonth));
    setDailyDiscounts(getDailyDiscountBreakdownByMonth(yearMonth) as DailyDiscount[]);
    
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

  const discountMap = useMemo(() => {
    const map = new Map<string, DailyDiscount>();
    dailyDiscounts.forEach((d) => map.set(d.businessDay, d));
    return map;
  }, [dailyDiscounts]);

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

  const totalCash = paymentBreakdowns.reduce((sum, p) => sum + (p.cash || 0), 0);
  const totalCard = paymentBreakdowns.reduce((sum, p) => sum + (p.card || 0), 0);
  const totalTransfer = paymentBreakdowns.reduce((sum, p) => sum + (p.transfer || 0), 0);

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
      const discount = discountMap.get(dateStr);
      const cancelled = cancelledMap.get(dateStr);
      return {
        total: acc.total + (data?.totalSales || 0),
        cancelledAmount: acc.cancelledAmount + (cancelled?.cancelledAmount || 0),
        cash: acc.cash + (payment?.cash || 0),
        card: acc.card + (payment?.card || 0),
        transfer: acc.transfer + (payment?.transfer || 0),
        bankDeposit: acc.bankDeposit + (closing?.bankDeposit || 0),
        hasClosing: acc.hasClosing || !!closing,
        totalVisitors: acc.totalVisitors + (visitor?.totalVisitors || 0),
        actualVisitors: acc.actualVisitors + (visitor?.actualVisitors || 0),
        cancelledVisitors: acc.cancelledVisitors + (visitor?.cancelledVisitors || 0),
        freeVisitors: acc.freeVisitors + (visitor?.freeVisitors || 0),
        extendedGuestCount: acc.extendedGuestCount + (visitor?.extendedGuestCount || 0),
        entryDiscount: acc.entryDiscount + (discount?.entryDiscount || 0),
        additionalDiscount: acc.additionalDiscount + (discount?.additionalDiscount || 0),
      };
    }, { total: 0, cancelledAmount: 0, cash: 0, card: 0, transfer: 0, bankDeposit: 0, hasClosing: false, totalVisitors: 0, actualVisitors: 0, cancelledVisitors: 0, freeVisitors: 0, extendedGuestCount: 0, entryDiscount: 0, additionalDiscount: 0 });
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

      // A3 가로: 420 x 297mm
      const pageWidth = 420;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const headerHeight = 25;
      const dayHeaderHeight = 16;
      const colCount = 8;
      const colWidth = contentWidth / colCount;
      const rowCount = weeks.length;
      // 페이지 세로의 90%를 채우도록 셀 높이 계산
      const availableHeight = (pageHeight * 0.90) - margin - headerHeight - dayHeaderHeight;
      const rowHeight = availableHeight / rowCount;

      // 제목 (크고 굵게)
      doc.setFontSize(28);
      doc.text(`${format(currentMonth, "yyyy년 M월")} 매출달력`, pageWidth / 2, margin + 12, { align: "center" });

      // 총 매출금액
      doc.setFontSize(20);
      const totalLabel = viewType === "sales" ? "실매출금액" : "취소금액";
      const totalValue = viewType === "sales" ? totalSales : totalCancelledAmount;
      doc.text(`총 ${totalLabel}: ${formatCurrency(totalValue)}원`, pageWidth - margin, margin + 12, { align: "right" });

      if (viewType === "sales" && (discountTotals.entryDiscount > 0 || discountTotals.additionalDiscount > 0)) {
        doc.setFontSize(11);
        doc.setTextColor(80, 80, 80);
        const discountLine = [
          discountTotals.entryDiscount > 0 ? `입실할인 ${formatCurrency(discountTotals.entryDiscount)}원` : null,
          discountTotals.additionalDiscount > 0 ? `추가할인 ${formatCurrency(discountTotals.additionalDiscount)}원` : null,
          `할인합계 ${formatCurrency(discountTotals.totalDiscount)}원`,
        ].filter(Boolean).join("  ·  ");
        doc.text(discountLine, pageWidth - margin, margin + 20, { align: "right" });
        doc.setTextColor(0, 0, 0);
      }

      const tableStartY = margin + headerHeight;
      doc.setLineWidth(0.5);
      doc.setDrawColor(80, 80, 80);

      // 요일 헤더 배경
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, tableStartY, contentWidth, dayHeaderHeight, 'F');
      doc.rect(margin, tableStartY, contentWidth, dayHeaderHeight, 'S');

      // 요일 텍스트 (크게)
      doc.setFontSize(16);
      const dayColors: { [key: number]: [number, number, number] } = {
        0: [220, 38, 38],
        6: [59, 130, 246]
      };

      DAY_NAMES.forEach((dayName, idx) => {
        const x = margin + idx * colWidth + colWidth / 2;
        const y = tableStartY + dayHeaderHeight / 2 + 5;
        if (dayColors[idx]) {
          doc.setTextColor(...dayColors[idx]);
        } else {
          doc.setTextColor(0, 0, 0);
        }
        doc.text(dayName, x, y, { align: "center" });
      });

      doc.setTextColor(0, 0, 0);
      const weeklyX = margin + 7 * colWidth + colWidth / 2;
      doc.text("주간총계", weeklyX, tableStartY + dayHeaderHeight / 2 + 5, { align: "center" });

      // 세로 그리드 선
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
          const dayDiscount = discountMap.get(dateStr);

          const cellX = margin + dayIdx * colWidth;
          const cellY = rowY;
          const padding = 3;

          if (!isCurrentMonth) {
            doc.setFillColor(245, 245, 245);
            doc.rect(cellX, cellY, colWidth, rowHeight, 'F');
          }

          // 날짜 숫자 (크고 굵게 - 2배)
          doc.setFontSize(18);
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
          doc.text(dayText, cellX + padding, cellY + padding + 7);

          let textY = cellY + padding + 15;

          if (viewType === "sales" && sales > 0) {
            // 총 매출액
            doc.setFontSize(14);
            if (isMax) {
              doc.setTextColor(220, 38, 38);
            } else if (isMin) {
              doc.setTextColor(59, 130, 246);
            } else {
              doc.setTextColor(0, 0, 0);
            }
            doc.text(formatCurrency(sales), cellX + padding, textY);
            textY += 6;

            // 결제방식별 매출
            if (payment) {
              doc.setFontSize(10);
              doc.setTextColor(80, 80, 80);
              if (payment.cash > 0) {
                doc.text(`현금 ${formatCurrency(payment.cash)}`, cellX + padding, textY);
                textY += 4;
              }
              if (payment.card > 0) {
                doc.text(`카드 ${formatCurrency(payment.card)}`, cellX + padding, textY);
                textY += 4;
              }
              if (payment.transfer > 0) {
                doc.text(`이체 ${formatCurrency(payment.transfer)}`, cellX + padding, textY);
                textY += 4;
              }
            }

            if (dayDiscount && dayDiscount.totalDiscount > 0) {
              doc.setFontSize(10);
              if (dayDiscount.entryDiscount > 0) {
                doc.setTextColor(225, 29, 72); // rose
                doc.text(`입실할인 ${formatCurrency(dayDiscount.entryDiscount)}`, cellX + padding, textY);
                textY += 4;
              }
              if (dayDiscount.additionalDiscount > 0) {
                doc.setTextColor(234, 88, 12); // orange
                doc.text(`추가할인 ${formatCurrency(dayDiscount.additionalDiscount)}`, cellX + padding, textY);
                textY += 4;
              }
            }

            // 은행입금 (항상 표시, 조건 제거)
            if (closing && closing.isConfirmed) {
              doc.setFontSize(10);
              doc.setTextColor(22, 163, 74);
              doc.text(`은행입금: ${closing.bankDeposit ? formatCurrency(closing.bankDeposit) : 0}`, cellX + padding, textY);
              textY += 4;
            }

            // 방문인원 (항상 표시, 조건 제거)
            if (visitor && visitor.totalVisitors > 0) {
              doc.setFontSize(9);
              doc.setTextColor(147, 51, 234);
              const extSuffix = visitor.extendedGuestCount > 0 ? `,연장:${visitor.extendedGuestCount}` : '';
              doc.text(`방문:${visitor.totalVisitors}(실:${visitor.actualVisitors},취:${visitor.cancelledVisitors},무:${visitor.freeVisitors}${extSuffix})`, cellX + padding, textY);
            }
          }

          if (viewType === "refund") {
            const cancelled = cancelledMap.get(dateStr);
            if (cancelled && cancelled.cancelledAmount > 0) {
              doc.setFontSize(14);
              doc.setTextColor(220, 38, 38);
              doc.text(`-${formatCurrency(cancelled.cancelledAmount)}`, cellX + padding, textY);
            }
          }
        });

        // 주간총계 컬럼
        const weeklyTotal = weeklyTotals[weekIdx];
        const weeklyColX = margin + 7 * colWidth;
        doc.setFillColor(240, 240, 240);
        doc.rect(weeklyColX, rowY, colWidth, rowHeight, 'F');

        // 주차 표시 (크게)
        doc.setFontSize(12);
        doc.setTextColor(80, 80, 80);
        doc.text(`${weekIdx + 1}주`, weeklyColX + colWidth / 2, rowY + 8, { align: "center" });

        // 주간 총 매출 (크게)
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text(weeklyTotal.total > 0 ? formatCurrency(weeklyTotal.total) : "0", weeklyColX + colWidth / 2, rowY + 17, { align: "center" });

        if (weeklyTotal.total > 0 && viewType === "sales") {
          let weeklyTextY = rowY + 24;
          doc.setFontSize(10);
          doc.setTextColor(80, 80, 80);
          if (weeklyTotal.cash > 0) {
            doc.text(`현금 ${formatCurrency(weeklyTotal.cash)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
            weeklyTextY += 4;
          }
          if (weeklyTotal.card > 0) {
            doc.text(`카드 ${formatCurrency(weeklyTotal.card)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
            weeklyTextY += 4;
          }
          if (weeklyTotal.transfer > 0) {
            doc.text(`이체 ${formatCurrency(weeklyTotal.transfer)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
            weeklyTextY += 4;
          }
          if (weeklyTotal.entryDiscount > 0 || weeklyTotal.additionalDiscount > 0) {
            if (weeklyTotal.entryDiscount > 0) {
              doc.setTextColor(225, 29, 72);
              doc.text(`입실할인 ${formatCurrency(weeklyTotal.entryDiscount)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
              weeklyTextY += 4;
            }
            if (weeklyTotal.additionalDiscount > 0) {
              doc.setTextColor(234, 88, 12);
              doc.text(`추가할인 ${formatCurrency(weeklyTotal.additionalDiscount)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
              weeklyTextY += 4;
            }
            doc.setTextColor(80, 80, 80);
          }
          // 은행입금 (항상 표시)
          if (weeklyTotal.hasClosing) {
            doc.setTextColor(22, 163, 74);
            doc.text(`은행입금 ${formatCurrency(weeklyTotal.bankDeposit)}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
            weeklyTextY += 4;
          }
          // 방문인원 (항상 표시)
          if (weeklyTotal.totalVisitors > 0) {
            doc.setTextColor(147, 51, 234);
            const weeklyExtSuffix = weeklyTotal.extendedGuestCount > 0 ? ` · 연장:${weeklyTotal.extendedGuestCount}` : '';
            doc.text(`방문:${weeklyTotal.totalVisitors}명${weeklyExtSuffix}`, weeklyColX + colWidth / 2, weeklyTextY, { align: "center" });
          }
        }
      });

      // 테이블 그리드 선 그리기
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.5);
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

  // 일별/주간총계/월합계 3개 시트로 구성된 엑셀 내보내기 — 지불방식(현금/카드/이체)별 매출 포함
  const exportToExcel = () => {
    try {
      const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const dailyRows = monthDays.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const data = summaryMap.get(dateStr);
        const payment = paymentMap.get(dateStr);
        const visitor = visitorMap.get(dateStr);
        const cancelled = cancelledMap.get(dateStr);
        const discount = discountMap.get(dateStr);
        return {
          "날짜": dateStr,
          "요일": DAY_NAMES[getDay(day)],
          "총매출": data?.totalSales || 0,
          "현금": payment?.cash || 0,
          "카드": payment?.card || 0,
          "이체": payment?.transfer || 0,
          "방문인원": visitor?.totalVisitors || 0,
          "실사용인원": visitor?.actualVisitors || 0,
          "취소인원": visitor?.cancelledVisitors || 0,
          "무료입장인원": visitor?.freeVisitors || 0,
          "연장객": visitor?.extendedGuestCount || 0,
          "취소금액": cancelled?.cancelledAmount || 0,
          "입실할인": discount?.entryDiscount || 0,
          "추가할인": discount?.additionalDiscount || 0,
        };
      });

      const weeklyRows = weeks.map((week, idx) => {
        const wt = weeklyTotals[idx];
        const first = format(week[0], "yyyy-MM-dd");
        const last = format(week[6], "yyyy-MM-dd");
        return {
          "주차": `${idx + 1}주`,
          "기간": `${first} ~ ${last}`,
          "매출합계": wt.total,
          "현금": wt.cash,
          "카드": wt.card,
          "이체": wt.transfer,
          "방문인원": wt.totalVisitors,
          "연장객": wt.extendedGuestCount,
          "취소금액": wt.cancelledAmount,
          "입실할인": wt.entryDiscount,
          "추가할인": wt.additionalDiscount,
        };
      });

      const monthlyRows = [
        { "항목": "총매출", "금액": totalSales },
        { "항목": "현금", "금액": totalCash },
        { "항목": "카드", "금액": totalCard },
        { "항목": "이체", "금액": totalTransfer },
        { "항목": "취소금액", "금액": totalCancelledAmount },
        { "항목": "입실할인", "금액": discountTotals.entryDiscount },
        { "항목": "추가할인", "금액": discountTotals.additionalDiscount },
        { "항목": "할인합계", "금액": discountTotals.totalDiscount },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyRows), "일별매출");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyRows), "주간총계");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), "월합계");

      XLSX.writeFile(wb, `매출달력_${format(currentMonth, "yyyy-MM")}.xlsx`);
    } catch (error) {
      console.error('엑셀 생성 오류:', error);
      alert('엑셀 생성 중 오류가 발생했습니다.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 space-y-3">
        {/* 1행: 월 이동 + PDF 아이콘만 심플하게 */}
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={exportToExcel}
              title="엑셀로 내보내기 (일별·주간총계·월합계)"
              data-testid="button-export-excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={exportToPDF}
              title="PDF로 내보내기"
              data-testid="button-export-pdf"
            >
              <FileDown className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 2행: 보기 전환 버튼 */}
        <div className="flex items-center gap-2">
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
            variant={showDetail ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDetail((v) => !v)}
            data-testid="button-toggle-calendar-detail"
          >
            {showDetail ? <Rows3 className="w-4 h-4 mr-1" /> : <ListTree className="w-4 h-4 mr-1" />}
            상세보기
          </Button>
          <span className="text-xs text-muted-foreground ml-1">
            날짜 칸에 커서를 올리거나(태블릿은 터치) 눌러보면 상세 내역이 크게 표시됩니다.
          </span>
        </div>

        {/* 3행: 여백 */}
        <div className="h-1" />

        {/* 4행: 총액 + 지불방식별 금액 (우측 정렬) */}
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-lg font-bold tabular-nums" data-testid="text-total-sales">
            총 {viewType === "sales" ? "실매출금액" : "취소금액"}: {formatCurrency(viewType === "sales" ? totalSales : totalCancelledAmount)}원
          </span>
          {viewType === "sales" && (totalCash > 0 || totalCard > 0 || totalTransfer > 0) && (
            <div className="flex gap-3 text-sm text-muted-foreground tabular-nums">
              {totalCash > 0 && <span>현금 {formatCurrency(totalCash)}원</span>}
              {totalCard > 0 && <span>카드 {formatCurrency(totalCard)}원</span>}
              {totalTransfer > 0 && <span>이체 {formatCurrency(totalTransfer)}원</span>}
            </div>
          )}
          {viewType === "sales" && (discountTotals.entryDiscount > 0 || discountTotals.additionalDiscount > 0) && (
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-sm tabular-nums" data-testid="text-discount-totals">
              {discountTotals.entryDiscount > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-medium">
                  입실할인 {formatCurrency(discountTotals.entryDiscount)}원
                </span>
              )}
              {discountTotals.additionalDiscount > 0 && (
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  추가할인 {formatCurrency(discountTotals.additionalDiscount)}원
                </span>
              )}
              <span className="text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                할인합계 {formatCurrency(discountTotals.totalDiscount)}원
              </span>
            </div>
          )}
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
                const dayDiscount = discountMap.get(dateStr);
                const visitor = visitorMap.get(dateStr);
                const cancelled = cancelledMap.get(dateStr);
                const closing = closingMap.get(dateStr);
                const isCurrentDay = dateStr === currentBusinessDay;
                const hasAnyDetail = viewType === "sales"
                  ? Boolean(payment || (dayDiscount && dayDiscount.totalDiscount > 0) || (visitor && visitor.totalVisitors > 0) || sales > 0)
                  : Boolean(cancelled && cancelled.cancelledAmount > 0);

                const dateLabel = (
                  <div className={`flex items-center gap-1 text-sm font-semibold ${
                    dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : ""
                  }`}>
                    <span>{format(day, "d")}</span>
                    {isMax && <span className="status-badge status-badge-nodot bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0.5">최고</span>}
                    {isMin && <span className="status-badge status-badge-nodot bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 py-0.5">최저</span>}
                  </div>
                );

                const detailBody = (
                  <div className="space-y-1.5">
                    {viewType === "sales" && sales > 0 && (
                      <div className={`text-lg font-bold tabular-nums ${isMax ? "text-red-600" : isMin ? "text-blue-600" : ""}`}>
                        {formatCurrency(sales)}원
                      </div>
                    )}
                    {viewType === "sales" && payment && (payment.cash > 0 || payment.card > 0 || payment.transfer > 0) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                        {payment.cash > 0 && <span>현금 {formatCurrency(payment.cash)}</span>}
                        {payment.card > 0 && <span>카드 {formatCurrency(payment.card)}</span>}
                        {payment.transfer > 0 && <span>이체 {formatCurrency(payment.transfer)}</span>}
                      </div>
                    )}
                    {viewType === "sales" && dayDiscount && dayDiscount.totalDiscount > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
                        {dayDiscount.entryDiscount > 0 && (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">
                            입실할인 {formatCurrency(dayDiscount.entryDiscount)}
                          </span>
                        )}
                        {dayDiscount.additionalDiscount > 0 && (
                          <span className="text-orange-600 dark:text-orange-400 font-medium">
                            추가할인 {formatCurrency(dayDiscount.additionalDiscount)}
                          </span>
                        )}
                      </div>
                    )}
                    {viewType === "sales" && sales > 0 && (
                      isCurrentDay && (!closing || !closing.isConfirmed) ? (
                        <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          은행입금 정산전
                        </div>
                      ) : closing && closing.isConfirmed ? (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                          은행입금 {closing.bankDeposit ? formatCurrency(closing.bankDeposit) : 0}원
                        </div>
                      ) : null
                    )}
                    {viewType === "sales" && visitor && visitor.totalVisitors > 0 && (
                      <div className="text-[11px] text-purple-600 dark:text-purple-400 tabular-nums">
                        방문 {visitor.totalVisitors}명 (실 {visitor.actualVisitors} · 취 {visitor.cancelledVisitors} · 무 {visitor.freeVisitors})
                        {visitor.extendedGuestCount > 0 && <> · 연장 {visitor.extendedGuestCount}</>}
                      </div>
                    )}
                    {viewType === "refund" && cancelled && cancelled.cancelledAmount > 0 && (
                      <div className="text-lg font-bold text-red-500 tabular-nums">
                        -{formatCurrency(cancelled.cancelledAmount)}원
                      </div>
                    )}
                  </div>
                );

                const compactBody = (
                  <div className="space-y-0.5">
                    {viewType === "sales" && sales > 0 && (
                      <div className={`text-sm font-bold tabular-nums ${isMax ? "text-red-600" : isMin ? "text-blue-600" : ""}`}>
                        {formatCurrency(sales)}
                      </div>
                    )}
                    {viewType === "sales" && visitor && visitor.totalVisitors > 0 && (
                      <div className="text-[11px] text-purple-600 dark:text-purple-400 tabular-nums">
                        방문 {visitor.totalVisitors}명
                        {visitor.extendedGuestCount > 0 && <> · 연장 {visitor.extendedGuestCount}</>}
                      </div>
                    )}
                    {viewType === "refund" && cancelled && cancelled.cancelledAmount > 0 && (
                      <div className="text-sm font-bold text-red-500 tabular-nums">
                        -{formatCurrency(cancelled.cancelledAmount)}
                      </div>
                    )}
                  </div>
                );

                return (
                  <Popover
                    key={dateStr}
                    open={expandedDate === dateStr}
                    onOpenChange={(open) => setExpandedDate(open ? dateStr : null)}
                  >
                    <PopoverTrigger asChild>
                      <div
                        className={`min-h-[100px] p-2 border-r last:border-r-0 cursor-pointer transition-colors ${
                          !isCurrentMonth ? "bg-muted/30 text-muted-foreground" : ""
                        } ${isToday ? "bg-blue-50 dark:bg-blue-900/20" : ""} ${
                          hasAnyDetail ? "hover:bg-accent/60" : ""
                        }`}
                        onMouseEnter={() => hasAnyDetail && setExpandedDate(dateStr)}
                        onMouseLeave={() => setExpandedDate((cur) => (cur === dateStr ? null : cur))}
                        onClick={() => hasAnyDetail && setExpandedDate(dateStr)}
                        data-testid={`calendar-day-${dateStr}`}
                      >
                        {dateLabel}
                        <div className="mt-1">{showDetail ? detailBody : compactBody}</div>
                      </div>
                    </PopoverTrigger>
                    {hasAnyDetail && (
                      <PopoverContent
                        className="w-72 z-[100]"
                        onMouseEnter={() => setExpandedDate(dateStr)}
                        onMouseLeave={() => setExpandedDate(null)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{format(day, "M월 d일 (EEE)", { locale: ko })}</span>
                          {isMax && <span className="status-badge status-badge-nodot bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0.5">최고</span>}
                          {isMin && <span className="status-badge status-badge-nodot bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 py-0.5">최저</span>}
                        </div>
                        {detailBody}
                      </PopoverContent>
                    )}
                  </Popover>
                );
              })}
              <div className="min-h-[100px] p-2 bg-muted/30 flex flex-col justify-center items-center">
                <div className="text-xs text-muted-foreground">{weekIdx + 1}주</div>
                {viewType === "sales" ? (
                  <div className="font-semibold text-sm tabular-nums">
                    {weeklyTotals[weekIdx].total > 0 ? formatCurrency(weeklyTotals[weekIdx].total) : 0}
                  </div>
                ) : (
                  <div className="font-semibold text-sm text-red-500 tabular-nums">
                    {weeklyTotals[weekIdx].cancelledAmount > 0 ? `-${formatCurrency(weeklyTotals[weekIdx].cancelledAmount)}` : 0}
                  </div>
                )}
                {!showDetail && viewType === "sales" && weeklyTotals[weekIdx].totalVisitors > 0 && (
                  <div className="text-[11px] text-purple-600 dark:text-purple-400 tabular-nums">
                    방문 {weeklyTotals[weekIdx].totalVisitors}명
                    {weeklyTotals[weekIdx].extendedGuestCount > 0 && <> · 연장 {weeklyTotals[weekIdx].extendedGuestCount}</>}
                  </div>
                )}
                {showDetail && viewType === "sales" && (
                  <div className="mt-1 space-y-1 text-center">
                    {(weeklyTotals[weekIdx].cash > 0 || weeklyTotals[weekIdx].card > 0 || weeklyTotals[weekIdx].transfer > 0) && (
                      <div className="flex flex-wrap justify-center gap-x-2 text-[11px] text-muted-foreground tabular-nums">
                        {weeklyTotals[weekIdx].cash > 0 && <span>현금 {formatCurrency(weeklyTotals[weekIdx].cash)}</span>}
                        {weeklyTotals[weekIdx].card > 0 && <span>카드 {formatCurrency(weeklyTotals[weekIdx].card)}</span>}
                        {weeklyTotals[weekIdx].transfer > 0 && <span>이체 {formatCurrency(weeklyTotals[weekIdx].transfer)}</span>}
                      </div>
                    )}
                    {(weeklyTotals[weekIdx].entryDiscount > 0 || weeklyTotals[weekIdx].additionalDiscount > 0) && (
                      <div className="flex flex-wrap justify-center gap-x-2 text-[11px] tabular-nums">
                        {weeklyTotals[weekIdx].entryDiscount > 0 && (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">
                            입실할인 {formatCurrency(weeklyTotals[weekIdx].entryDiscount)}
                          </span>
                        )}
                        {weeklyTotals[weekIdx].additionalDiscount > 0 && (
                          <span className="text-orange-600 dark:text-orange-400 font-medium">
                            추가할인 {formatCurrency(weeklyTotals[weekIdx].additionalDiscount)}
                          </span>
                        )}
                      </div>
                    )}
                    {weeklyTotals[weekIdx].hasClosing && (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                        은행입금 {formatCurrency(weeklyTotals[weekIdx].bankDeposit)}원
                      </div>
                    )}
                    {weeklyTotals[weekIdx].totalVisitors > 0 && (
                      <div className="text-[11px] text-purple-600 dark:text-purple-400 tabular-nums">
                        방문 {weeklyTotals[weekIdx].totalVisitors}명 (실 {weeklyTotals[weekIdx].actualVisitors} · 취 {weeklyTotals[weekIdx].cancelledVisitors} · 무 {weeklyTotals[weekIdx].freeVisitors})
                        {weeklyTotals[weekIdx].extendedGuestCount > 0 && <> · 연장 {weeklyTotals[weekIdx].extendedGuestCount}</>}
                      </div>
                    )}
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
    <div className="w-full min-w-0 space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-graph">
          <RefreshCw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>
      <Tabs value={graphType} onValueChange={(v) => setGraphType(v as any)} className="w-full min-w-0">
        <TabsList>
          <TabsTrigger value="daily" data-testid="tab-graph-daily">일간</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-graph-weekly">주간</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-graph-monthly">월간</TabsTrigger>
          <TabsTrigger value="yearly" data-testid="tab-graph-yearly">연간</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="w-full min-w-0">
          <DailyGraph key={`daily-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="weekly" className="w-full min-w-0">
          <WeeklyGraph key={`weekly-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="monthly" className="w-full min-w-0">
          <MonthlyGraph key={`monthly-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="yearly" className="w-full min-w-0">
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
    <Card className="w-full min-w-0">
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

        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "daily" | "hourly")} className="w-full min-w-0">
          <TabsList>
            <TabsTrigger value="daily">일별</TabsTrigger>
            <TabsTrigger value="hourly">시간대별</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="mt-4 w-full min-w-0">
            <div className="text-sm text-muted-foreground mb-2">(천원단위)</div>
            <ChartFrame>
                <BarChart data={dailyData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={visitorAxisTick} />
                  <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip
                    cursor={visitorCursorStyle}
                    contentStyle={visitorTooltipContentStyle}
                    labelStyle={visitorTooltipLabelStyle}
                    formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]}
                  />
                  <Bar dataKey="sales" fill={VISITOR_COLORS.actual} radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ChartFrame>
          </TabsContent>

          <TabsContent value="hourly" className="mt-4 w-full min-w-0">
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
            <ChartFrame>
                <BarChart data={hourlyData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={visitorAxisTick} />
                  <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip
                    cursor={visitorCursorStyle}
                    contentStyle={visitorTooltipContentStyle}
                    labelStyle={visitorTooltipLabelStyle}
                    formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]}
                  />
                  <Bar dataKey="sales" fill={VISITOR_COLORS.actual} radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ChartFrame>
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
    <Card className="w-full min-w-0">
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

        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "weekly" | "dayOfWeek")} className="w-full min-w-0">
          <TabsList>
            <TabsTrigger value="weekly">주별</TabsTrigger>
            <TabsTrigger value="dayOfWeek">요일별</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="mt-4 w-full min-w-0">
            <ChartFrame>
                <LineChart data={weeklyData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tick={visitorAxisTick} />
                  <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                    contentStyle={visitorTooltipContentStyle}
                    labelStyle={visitorTooltipLabelStyle}
                    formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]}
                  />
                  <Line type="monotone" dataKey="sales" stroke={VISITOR_COLORS.actual} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: VISITOR_COLORS.actual }} activeDot={{ r: 5 }} />
                </LineChart>
              </ChartFrame>
          </TabsContent>

          <TabsContent value="dayOfWeek" className="mt-4 w-full min-w-0">
            <ChartFrame>
                <BarChart data={dayOfWeekData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={visitorAxisTick} />
                  <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} tickFormatter={(v) => (v / 1000).toFixed(0)} />
                  <Tooltip
                    cursor={visitorCursorStyle}
                    contentStyle={visitorTooltipContentStyle}
                    labelStyle={visitorTooltipLabelStyle}
                    formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]}
                  />
                  <Bar dataKey="sales" fill={VISITOR_COLORS.actual} radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ChartFrame>
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
    <Card className="w-full min-w-0">
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

        <ChartFrame>
            <LineChart data={monthlyData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={visitorAxisTick} />
              <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={36} tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"} />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                contentStyle={visitorTooltipContentStyle}
                labelStyle={visitorTooltipLabelStyle}
                formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]}
              />
              <Line type="monotone" dataKey="sales" stroke={VISITOR_COLORS.actual} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: VISITOR_COLORS.actual }} activeDot={{ r: 5 }} />
            </LineChart>
          </ChartFrame>
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
    <Card className="w-full min-w-0">
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

        <ChartFrame>
            <LineChart data={yearlyData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" axisLine={false} tickLine={false} tick={visitorAxisTick} />
              <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={36} tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"} />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                contentStyle={visitorTooltipContentStyle}
                labelStyle={visitorTooltipLabelStyle}
                formatter={(value: number) => [`${formatCurrency(value)}원`, "매출"]}
              />
              <Line type="monotone" dataKey="sales" stroke={VISITOR_COLORS.actual} strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0, fill: VISITOR_COLORS.actual }} activeDot={{ r: 6 }} />
            </LineChart>
          </ChartFrame>
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
    <div className="w-full min-w-0 space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-visitor-graph">
          <RefreshCw className="w-4 h-4 mr-2" />
          새로고침
        </Button>
      </div>
      <Tabs value={graphType} onValueChange={(v) => setGraphType(v as any)} className="w-full min-w-0">
        <TabsList>
          <TabsTrigger value="daily" data-testid="tab-visitor-daily">일간</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-visitor-weekly">주간</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-visitor-monthly">월간</TabsTrigger>
          <TabsTrigger value="yearly" data-testid="tab-visitor-yearly">연간</TabsTrigger>
          <TabsTrigger value="hourly" data-testid="tab-visitor-hourly">시간대별</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="w-full min-w-0">
          <DailyVisitorGraph key={`daily-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="weekly" className="w-full min-w-0">
          <WeeklyVisitorGraph key={`weekly-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="monthly" className="w-full min-w-0">
          <MonthlyVisitorGraph key={`monthly-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="yearly" className="w-full min-w-0">
          <YearlyVisitorGraph key={`yearly-visitor-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="hourly" className="w-full min-w-0">
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
        extended: dayData?.extendedGuestCount || 0,
      };
    });
    setDailyData(data);
  }, [selectedDate]);

  const totalVisitors = dailyData.reduce((sum, d) => sum + d.total, 0);
  const actualVisitors = dailyData.reduce((sum, d) => sum + d.actual, 0);
  const extendedGuests = dailyData.reduce((sum, d) => sum + d.extended, 0);
  const currentDayData = dailyData.find(d => d.date === format(selectedDate, "yyyy-MM-dd"));

  return (
    <Card className="w-full min-w-0">
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">당일 총방문</div>
              <div className="text-2xl font-bold">{currentDayData?.total || 0}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">당일 실제방문</div>
              <div className="text-2xl font-bold text-primary">{currentDayData?.actual || 0}명</div>
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
              <div className="text-2xl font-bold text-primary">{actualVisitors}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">7일 연장객</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{extendedGuests}명</div>
            </CardContent>
          </Card>
        </div>

        <ChartFrame>
            <BarChart data={dailyData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={visitorAxisTick} />
              <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} />
              <Tooltip
                cursor={visitorCursorStyle}
                contentStyle={visitorTooltipContentStyle}
                labelStyle={visitorTooltipLabelStyle}
                formatter={(value: number, name: string) => {
                  return [`${value}명`, VISITOR_LEGEND_LABELS[name] || name];
                }}
              />
              <Legend content={<VisitorLegend />} />
              <Bar dataKey="actual" stackId="a" fill={VISITOR_COLORS.actual} radius={[0, 0, 0, 0]} maxBarSize={40} />
              <Bar dataKey="cancelled" stackId="a" fill={VISITOR_COLORS.cancelled} radius={[0, 0, 0, 0]} maxBarSize={40} />
              <Bar dataKey="free" stackId="a" fill={VISITOR_COLORS.free} radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ChartFrame>
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
      const extended = weekData.reduce((sum, v) => sum + (v.extendedGuestCount || 0), 0);

      weeks.push({
        label: `${format(weekStart, "M/d")}~${format(weekEnd, "M/d")}`,
        total, actual, cancelled, free, extended
      });
    }
    setWeeklyData(weeks);
  }, [selectedWeekStart]);

  const totalVisitors = weeklyData.reduce((sum, w) => sum + w.total, 0);
  const extendedGuests = weeklyData.reduce((sum, w) => sum + w.extended, 0);

  return (
    <Card className="w-full min-w-0">
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
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">4주간 총 방문</div>
              <div className="text-2xl font-bold">{totalVisitors}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">4주간 연장객</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{extendedGuests}명</div>
            </CardContent>
          </Card>
        </div>

        <ChartFrame>
            <BarChart data={weeklyData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={visitorAxisTick} />
              <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} />
              <Tooltip
                cursor={visitorCursorStyle}
                contentStyle={visitorTooltipContentStyle}
                labelStyle={visitorTooltipLabelStyle}
                formatter={(value: number, name: string) => {
                  return [`${value}명`, VISITOR_LEGEND_LABELS[name] || name];
                }}
              />
              <Legend content={<VisitorLegend />} />
              <Bar dataKey="actual" stackId="a" fill={VISITOR_COLORS.actual} maxBarSize={40} />
              <Bar dataKey="cancelled" stackId="a" fill={VISITOR_COLORS.cancelled} maxBarSize={40} />
              <Bar dataKey="free" stackId="a" fill={VISITOR_COLORS.free} radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ChartFrame>
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
      const extended = visitors.reduce((sum, v) => sum + (v.extendedGuestCount || 0), 0);

      months.push({ label: `${m}월`, total, actual, cancelled, free, extended });
    }
    setMonthlyData(months);
  }, [selectedYear]);

  const totalVisitors = monthlyData.reduce((sum, m) => sum + m.total, 0);
  const extendedGuests = monthlyData.reduce((sum, m) => sum + m.extended, 0);

  return (
    <Card className="w-full min-w-0">
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
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{selectedYear}년 총 방문</div>
              <div className="text-2xl font-bold">{totalVisitors}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{selectedYear}년 연장객</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{extendedGuests}명</div>
            </CardContent>
          </Card>
        </div>

        <ChartFrame>
            <BarChart data={monthlyData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={visitorAxisTick} />
              <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} />
              <Tooltip
                cursor={visitorCursorStyle}
                contentStyle={visitorTooltipContentStyle}
                labelStyle={visitorTooltipLabelStyle}
                formatter={(value: number, name: string) => {
                  return [`${value}명`, VISITOR_LEGEND_LABELS[name] || name];
                }}
              />
              <Legend content={<VisitorLegend />} />
              <Bar dataKey="actual" stackId="a" fill={VISITOR_COLORS.actual} maxBarSize={40} />
              <Bar dataKey="cancelled" stackId="a" fill={VISITOR_COLORS.cancelled} maxBarSize={40} />
              <Bar dataKey="free" stackId="a" fill={VISITOR_COLORS.free} radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ChartFrame>
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
      let total = 0, actual = 0, cancelled = 0, free = 0, extended = 0;

      for (let m = 1; m <= 12; m++) {
        const yearMonth = `${y}-${String(m).padStart(2, '0')}`;
        const visitors = getVisitorStatsByMonth(yearMonth) as VisitorStats[];
        total += visitors.reduce((sum, v) => sum + v.totalVisitors, 0);
        actual += visitors.reduce((sum, v) => sum + v.actualVisitors, 0);
        cancelled += visitors.reduce((sum, v) => sum + v.cancelledVisitors, 0);
        free += visitors.reduce((sum, v) => sum + v.freeVisitors, 0);
        extended += visitors.reduce((sum, v) => sum + (v.extendedGuestCount || 0), 0);
      }
      
      years.push({ label: `${y}년`, total, actual, cancelled, free, extended });
    }

    setYearlyData(years);
  }, []);

  const totalVisitors = yearlyData.reduce((sum, y) => sum + y.total, 0);
  const extendedGuests = yearlyData.reduce((sum, y) => sum + y.extended, 0);

  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <CardTitle className="text-lg">연도별 방문인원</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">전체 기간 총 방문</div>
              <div className="text-2xl font-bold">{totalVisitors}명</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">전체 기간 연장객</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{extendedGuests}명</div>
            </CardContent>
          </Card>
        </div>

        <ChartFrame>
            <LineChart data={yearlyData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={visitorAxisTick} />
              <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} />
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                contentStyle={visitorTooltipContentStyle}
                labelStyle={visitorTooltipLabelStyle}
                formatter={(value: number, name: string) => {
                  return [`${value}명`, VISITOR_LEGEND_LABELS[name] || name];
                }}
              />
              <Legend content={<VisitorLegend />} />
              <Line type="monotone" dataKey="actual" stroke={VISITOR_COLORS.actual} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: VISITOR_COLORS.actual }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="cancelled" stroke={VISITOR_COLORS.cancelled} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: VISITOR_COLORS.cancelled }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="free" stroke={VISITOR_COLORS.free} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: VISITOR_COLORS.free }} activeDot={{ r: 5 }} />
            </LineChart>
          </ChartFrame>
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
    <Card className="w-full min-w-0">
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

        <ChartFrame>
            <BarChart data={hourlyData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={visitorAxisTick} />
              <YAxis axisLine={false} tickLine={false} tick={visitorAxisTick} width={28} />
              <Tooltip
                cursor={visitorCursorStyle}
                contentStyle={visitorTooltipContentStyle}
                labelStyle={visitorTooltipLabelStyle}
                formatter={(value: number, name: string) => {
                  return [`${value}명`, VISITOR_LEGEND_LABELS[name] || name];
                }}
              />
              <Legend content={<VisitorLegend />} />
              <Bar dataKey="actual" stackId="a" fill={VISITOR_COLORS.actual} maxBarSize={28} />
              <Bar dataKey="cancelled" stackId="a" fill={VISITOR_COLORS.cancelled} maxBarSize={28} />
              <Bar dataKey="free" stackId="a" fill={VISITOR_COLORS.free} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ChartFrame>
      </CardContent>
    </Card>
  );
}
