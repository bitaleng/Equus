import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Calendar, BarChart3, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import {
  getDailySummariesByMonth,
  getLockerLogsByBusinessDay,
  getLockerLogsByDateRange,
  getAllDailySummaries,
  getSettings,
  getCancelledSalesByMonth,
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
  business_day: string;
  total_sales: number;
  total_visitors: number;
  day_visitors: number;
  night_visitors: number;
  cancellations: number;
  total_discount: number;
}

interface CancelledSales {
  business_day: string;
  cancelled_amount: number;
  cancelled_count: number;
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

export default function SalesReportPage() {
  const [mainTab, setMainTab] = useState<"calendar" | "graph">("calendar");

  return (
    <div className="p-4 max-w-7xl mx-auto" data-testid="page-sales-report">
      <h1 className="text-2xl font-bold mb-4">매출리포트</h1>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "calendar" | "graph")}>
        <TabsList className="mb-4">
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="w-4 h-4 mr-2" />
            매출달력
          </TabsTrigger>
          <TabsTrigger value="graph" data-testid="tab-graph">
            <BarChart3 className="w-4 h-4 mr-2" />
            매출그래프
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <SalesCalendar />
        </TabsContent>

        <TabsContent value="graph">
          <SalesGraph />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SalesCalendar() {
  const [currentMonth, setCurrentMonth] = useState(getKoreaDate());
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [cancelledSales, setCancelledSales] = useState<CancelledSales[]>([]);
  const [viewType, setViewType] = useState<"sales" | "refund">("sales");

  useEffect(() => {
    const yearMonth = format(currentMonth, "yyyy-MM");
    const data = getDailySummariesByMonth(yearMonth);
    setSummaries(data as DailySummary[]);
    
    const cancelled = getCancelledSalesByMonth(yearMonth);
    setCancelledSales(cancelled as CancelledSales[]);
  }, [currentMonth]);

  const summaryMap = useMemo(() => {
    const map = new Map<string, DailySummary>();
    summaries.forEach((s) => map.set(s.business_day, s));
    return map;
  }, [summaries]);

  const cancelledMap = useMemo(() => {
    const map = new Map<string, CancelledSales>();
    cancelledSales.forEach((c) => map.set(c.business_day, c));
    return map;
  }, [cancelledSales]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  const totalSales = summaries.reduce((sum, s) => sum + (s.total_sales || 0), 0);
  const totalCancelledAmount = cancelledSales.reduce((sum, c) => sum + (c.cancelled_amount || 0), 0);

  const salesValues = summaries.filter(s => s.total_sales > 0).map(s => s.total_sales);
  const maxSales = salesValues.length > 0 ? Math.max(...salesValues) : 0;
  const minSales = salesValues.length > 0 ? Math.min(...salesValues) : 0;
  const maxDay = summaries.find(s => s.total_sales === maxSales)?.business_day;
  const minDay = summaries.find(s => s.total_sales === minSales && s.total_sales > 0)?.business_day;

  const weeklyTotals: number[] = weeks.map(week => {
    return week.reduce((sum, day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const data = summaryMap.get(dateStr);
      return sum + (data?.total_sales || 0);
    }, 0);
  });

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
                const sales = data?.total_sales || 0;
                const isMax = dateStr === maxDay && sales > 0;
                const isMin = dateStr === minDay && sales > 0 && salesValues.length > 1;
                const dayOfWeek = getDay(day);
                const isToday = formatKoreaDate(new Date()) === dateStr;

                return (
                  <div
                    key={dateStr}
                    className={`min-h-[80px] p-2 border-r last:border-r-0 ${
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
                      <div className={`text-sm mt-1 font-semibold ${isMax ? "text-red-600" : isMin ? "text-blue-600" : ""}`}>
                        {formatCurrency(sales)}
                      </div>
                    )}
                    {viewType === "refund" && (() => {
                      const cancelled = cancelledMap.get(dateStr);
                      if (cancelled && cancelled.cancelled_amount > 0) {
                        return (
                          <div className="text-sm mt-1 text-red-500">
                            -{formatCurrency(cancelled.cancelled_amount)}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                );
              })}
              <div className="min-h-[80px] p-2 bg-muted/30 flex flex-col justify-center items-center">
                <div className="text-xs text-muted-foreground">{weekIdx + 1}주</div>
                <div className="font-semibold text-sm">
                  {weeklyTotals[weekIdx] > 0 ? formatCurrency(weeklyTotals[weekIdx]) : 0}
                </div>
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
      const daySummary = (summaries as DailySummary[]).find((s) => s.business_day === dateStr);
      if (daySummary) {
        console.log(`[DailyGraph] ${dateStr} 매출:`, daySummary.total_sales);
      }
      const d = parseISO(dateStr + "T12:00:00");
      return {
        date: dateStr,
        label: format(d, "dd일(E)", { locale: ko }),
        sales: daySummary?.total_sales || 0,
      };
    });
    console.log('[DailyGraph] 최종 그래프 데이터:', data);
    setDailyData(data);
  }, [selectedDate]);

  useEffect(() => {
    if (subTab === "hourly") {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const logs = getLockerLogsByBusinessDay(dateStr);
      
      const hourlyMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) {
        hourlyMap.set(h, 0);
      }

      (logs as any[]).forEach((log) => {
        if (log.entry_time && log.final_price) {
          const entryTime = toZonedTime(new Date(log.entry_time), TIMEZONE);
          const hour = getHours(entryTime);
          hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + (log.final_price || 0));
        }
      });

      const data: any[] = [];
      for (let h = businessDayStartHour; h < 24; h++) {
        data.push({ hour: `${h}시`, sales: hourlyMap.get(h) || 0 });
      }
      for (let h = 0; h < businessDayStartHour; h++) {
        data.push({ hour: `${h}시`, sales: hourlyMap.get(h) || 0 });
      }

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
        .filter(s => s.business_day >= startStr && s.business_day <= endStr)
        .reduce((sum, s) => sum + (s.total_sales || 0), 0);

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
      const weekData = summaries.filter(s => s.business_day >= startStr && s.business_day <= endStr);

      const dayData = DAY_NAMES.slice(1).concat(DAY_NAMES[0]).map((dayName, idx) => {
        const targetDay = idx === 6 ? 0 : idx + 1;
        const daySummary = weekData.find(s => {
          const d = parseISO(s.business_day);
          return getDay(d) === targetDay;
        });
        return {
          day: dayName + "요일",
          sales: daySummary?.total_sales || 0,
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
      if (!s.business_day) return;
      const month = s.business_day.substring(0, 7);
      if (month.startsWith(selectedYear.toString())) {
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + (s.total_sales || 0));
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
      if (!s.business_day) return;
      const year = parseInt(s.business_day.substring(0, 4));
      yearlyMap.set(year, (yearlyMap.get(year) || 0) + (s.total_sales || 0));
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
