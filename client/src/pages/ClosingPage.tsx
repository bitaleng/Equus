import { useState, useEffect, type ReactNode } from 'react';
import { ArrowLeft, Save, CheckCircle, Calculator, Calendar as CalendarIcon, AlertCircle, FileSpreadsheet, FileText, FileBarChart2 } from 'lucide-react';
import { Link } from 'wouter';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ko } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  createClosingDay,
  getClosingDay,
  updateClosingDay,
  confirmClosingDay,
  getLatestClosingDay,
  getSettings,
  getDetailedSalesByBusinessDay,
  getRentalRevenueBreakdownByBusinessDay,
  getDetailedSalesByBusinessDayRange,
} from '@/lib/localDb';
import { getBusinessDay, formatKoreanCurrency } from '@shared/businessDay';
import * as localDb from '@/lib/localDb';
import { downloadClosingBackup } from '@/lib/autoArchive';
import { cn } from '@/lib/utils';
import { toYmd, ymdToLocalDate } from '@/components/BusinessDayPicker';
import { CashRegisterInput, calcCashRegisterTotal, loadCashRegister } from '@/components/CashRegisterInput';

// Helper function to generate past business days
function generatePastBusinessDays(count: number, businessDayStartHour: number): string[] {
  const days: string[] = [];
  const today = new Date();
  
  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const businessDay = getBusinessDay(date, businessDayStartHour);
    if (!days.includes(businessDay)) {
      days.push(businessDay);
    }
  }
  
  return days;
}

function ClosingRangeDatePicker({
  id,
  value,
  placeholder,
  onChange,
  testId,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (ymd: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? ymdToLocalDate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !value && "text-muted-foreground"
          )}
          data-testid={testId}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ko}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(toYmd(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type PayBreakdown = { cash: number; card: number; transfer: number; total: number };

function PayTiles({
  cash,
  card,
  transfer,
  total,
  emphasize = false,
  tone = "default",
  testIds,
}: PayBreakdown & {
  emphasize?: boolean;
  tone?: "default" | "primary" | "danger";
  testIds?: { cash?: string; card?: string; transfer?: string; total?: string };
}) {
  const items = [
    { label: "현금", value: cash, testId: testIds?.cash },
    { label: "카드", value: card, testId: testIds?.card },
    { label: "이체", value: transfer, testId: testIds?.transfer },
    { label: "합계", value: total, testId: testIds?.total, isTotal: true },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-lg border px-3 py-2.5 bg-background/90",
            item.isTotal && tone === "primary" && "border-primary/40 bg-primary/10",
            item.isTotal && tone === "danger" && "border-destructive/40 bg-destructive/10",
            item.isTotal && tone === "default" && "border-primary/20 bg-primary/5"
          )}
        >
          <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
          <p
            data-testid={item.testId}
            className={cn(
              "mt-0.5 font-semibold tabular-nums leading-tight",
              emphasize ? "text-lg" : "text-sm",
              item.isTotal && tone === "danger" ? "text-destructive" : item.isTotal ? "text-primary" : "text-foreground"
            )}
          >
            {formatKoreanCurrency(item.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function SalesGroup({
  title,
  total,
  accent = "slate",
  children,
}: {
  title: string;
  total?: number;
  accent?: "slate" | "blue" | "green" | "primary" | "orange";
  children: ReactNode;
}) {
  const wrap = {
    slate: "border-border bg-muted/20",
    blue: "border-blue-200/80 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20",
    green: "border-border bg-muted/20",
    primary: "border-blue-200/80 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20",
    orange: "border-blue-200/80 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20",
  }[accent];
  const head = {
    slate: "bg-zinc-500 text-white dark:bg-zinc-600 dark:text-white",
    blue: "bg-blue-600 text-white dark:bg-blue-700",
    green: "bg-zinc-500 text-white dark:bg-zinc-600 dark:text-white",
    primary: "bg-blue-600 text-white dark:bg-blue-700",
    orange: "bg-blue-600 text-white dark:bg-blue-700",
  }[accent];
  return (
    <div className={cn("rounded-xl border overflow-hidden shadow-sm", wrap)}>
      <div className={cn("flex items-center justify-between gap-3 px-4 py-2.5", head)}>
        <h3 className="font-semibold text-sm tracking-tight">{title}</h3>
        {total != null && (
          <span className="text-sm font-bold tabular-nums opacity-95">{formatKoreanCurrency(total)}</span>
        )}
      </div>
      <div className="p-3 sm:p-4 space-y-4">{children}</div>
    </div>
  );
}

function SalesSubLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-muted-foreground">{children}</p>;
}

export default function ClosingPage() {
  const { toast } = useToast();
  const [businessDay, setBusinessDay] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [availableBusinessDays, setAvailableBusinessDays] = useState<string[]>([]);
  
  // 년/월/일 분리 선택을 위한 상태
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDay, setSelectedDay] = useState('');

  // Basic information
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [targetFloat, setTargetFloat] = useState('');

  // Detailed sales breakdown
  const [baseEntrySales, setBaseEntrySales] = useState({
    cash: 0, card: 0, transfer: 0, total: 0
  });
  const [additionalFeeSales, setAdditionalFeeSales] = useState({
    cash: 0, card: 0, transfer: 0, total: 0
  });
  const [entrySales, setEntrySales] = useState({
    cash: 0, card: 0, transfer: 0, total: 0
  });
  const [rentalSales, setRentalSales] = useState({
    cash: 0, card: 0, transfer: 0, total: 0
  });
  const [totalEntrySales, setTotalEntrySales] = useState({
    cash: 0, card: 0, transfer: 0, total: 0
  });
  const [rentalBreakdown, setRentalBreakdown] = useState<{
    breakdown: any;
    totals: any;
  } | null>(null);
  
  // 항목별 추가매출 상세
  const [rentalItemBreakdown, setRentalItemBreakdown] = useState<{
    [itemName: string]: { cash: number; card: number; transfer: number; total: number };
  }>({});

  // Sales summary (for backward compatibility)
  const [salesSummary, setSalesSummary] = useState({
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    totalSales: 0,
  });

  // Refund summary
  const [refundSummary, setRefundSummary] = useState({ total: 0, count: 0, cash: 0, card: 0, transfer: 0 });

  // Expense summary
  const [expenseSummary, setExpenseSummary] = useState({
    cashExpenses: 0,
    cardExpenses: 0,
    transferExpenses: 0,
    totalExpenses: 0,
  });

  // Actual cash and reconciliation
  const [actualCash, setActualCash] = useState('');
  const [expectedCash, setExpectedCash] = useState(0);
  const [discrepancy, setDiscrepancy] = useState(0);
  const [bankDeposit, setBankDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [memo, setMemo] = useState('');

  // Confirmation dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Range query states
  const [rangeStartBusinessDay, setRangeStartBusinessDay] = useState('');
  const [rangeEndBusinessDay, setRangeEndBusinessDay] = useState('');
  const [rangeSalesData, setRangeSalesData] = useState<{
    entrySales: { cash: number; card: number; transfer: number; total: number };
    additionalSales: { cash: number; card: number; transfer: number; total: number };
    rentalSales: { cash: number; card: number; transfer: number; total: number };
    totalEntrySales: { cash: number; card: number; transfer: number; total: number };
  } | null>(null);
  const [showRangeSummary, setShowRangeSummary] = useState(false);

  // 기간별 정산 보고서 (매출·지출 요약 + 일별 매출 추이 그래프)
  const [showReport, setShowReport] = useState(false);
  const [reportExpenseSummary, setReportExpenseSummary] = useState<{
    cashTotal: number;
    cardTotal: number;
    transferTotal: number;
    total: number;
  } | null>(null);
  const [reportDailyTrend, setReportDailyTrend] = useState<
    { businessDay: string; totalSales: number }[]
  >([]);

  useEffect(() => {
    const settings = getSettings();
    const currentBusinessDay = getBusinessDay(new Date(), settings.businessDayStartHour);
    
    // Generate past 30 days of business days
    const pastDays = generatePastBusinessDays(30, settings.businessDayStartHour);
    setAvailableBusinessDays(pastDays);
    
    setBusinessDay(currentBusinessDay);
    
    // 년/월/일 분리 초기화
    const [year, month, day] = currentBusinessDay.split('-');
    setSelectedYear(year);
    setSelectedMonth(month);
    setSelectedDay(day);
    
    loadClosingData(currentBusinessDay);
  }, []);

  useEffect(() => {
    // Calculate expected cash and discrepancy when relevant values change
    if (actualCash) {
      const actualAmount = parseInt(actualCash);
      const diff = actualAmount - expectedCash;
      setDiscrepancy(diff);
    }
  }, [actualCash, expectedCash]);

  const loadClosingData = (businessDay: string) => {
    // Check if closing already exists
    const existingClosing = getClosingDay(businessDay);

    if (existingClosing) {
      // Load existing closing data
      setStartTime(String(existingClosing.startTime || ''));
      setEndTime(String(existingClosing.endTime || ''));
      setOpeningFloat(existingClosing.openingFloat != null ? String(existingClosing.openingFloat) : '');
      setTargetFloat(existingClosing.targetFloat != null ? String(existingClosing.targetFloat) : '');
      setActualCash(existingClosing.actualCash != null ? String(existingClosing.actualCash) : '');
      setBankDeposit(existingClosing.bankDeposit != null ? String(existingClosing.bankDeposit) : '');
      setNotes(String(existingClosing.notes || ''));
      setMemo(String(existingClosing.memo || ''));
      setIsConfirmed(existingClosing.isConfirmed);
    } else {
      // Initialize with default values
      const settings = getSettings();
      const startHour = settings.businessDayStartHour;
      setStartTime(`${String(startHour).padStart(2, '0')}:00`);
      
      // Set end time to same as start time (next day's business day start hour)
      setEndTime(`${String(startHour).padStart(2, '0')}:00`);

      // Get opening float from cash register settings
      const calculatedFloat = calcCashRegisterTotal(loadCashRegister());
      
      // If cash register has value, use it; otherwise use previous closing
      if (calculatedFloat > 0) {
        setOpeningFloat(calculatedFloat.toString());
        setTargetFloat(calculatedFloat.toString());
      } else {
        // Fallback to previous closing
        const latestClosing = getLatestClosingDay();
        if (latestClosing && latestClosing.targetFloat) {
          setOpeningFloat(latestClosing.targetFloat.toString());
          setTargetFloat(latestClosing.targetFloat.toString());
        } else {
          // Default to empty string if no previous closing exists (allows user to type freely)
          setOpeningFloat('');
          setTargetFloat('');
        }
      }
      
      // Load memo from localStorage for new closing
      const dailyMemo = localStorage.getItem('daily_memo') || '';
      setMemo(dailyMemo);
    }

    // ========================================
    // Home과 동일한 실시간 매출 계산 방식
    // ========================================
    const settings = getSettings();
    const bdStartHour = settings.businessDayStartHour;
    
    // 1. 오늘 입실한 기록 (entry_time 기준)
    const entries = localDb.getEntriesByEntryTime(businessDay, bdStartHour);
    
    // 2. 오늘 퇴실한 추가요금 (checkout_time 기준)
    const additionalFeeEvents = localDb.getAdditionalFeeEventsByBusinessDayRange(businessDay, bdStartHour);
    
    // 3. 렌탈 거래 (rental_time 기준)
    const rentalTransactions = localDb.getRentalTransactionsByBusinessDayRange(businessDay, bdStartHour);
    
    // 1) 입실 기본 요금 집계 (결제수단별)
    // IMPORTANT: finalPrice now only contains base entry price (additional fees stored separately in additional_fee_events)
    let entryCash = 0, entryCard = 0, entryTransfer = 0;
    entries.filter(e => !e.cancelled).forEach(e => {
      const cashPayment = e.paymentCash || 0;
      const cardPayment = e.paymentCard || 0;
      const transferPayment = e.paymentTransfer || 0;
      
      // Payment amounts already reflect base price only (additional fees tracked separately)
      entryCash += cashPayment;
      entryCard += cardPayment;
      entryTransfer += transferPayment;
    });
    
    setBaseEntrySales({
      cash: Math.round(entryCash),
      card: Math.round(entryCard),
      transfer: Math.round(entryTransfer),
      total: Math.round(entryCash + entryCard + entryTransfer)
    });
    
    // 2) 추가요금 집계 (결제수단별)
    // All additional fees now come from additional_fee_events table
    // This ensures payment method independence from entry payments
    let additionalCash = 0, additionalCard = 0, additionalTransfer = 0;
    
    // All additional fees (from additional_fee_events table)
    additionalFeeEvents.forEach(e => {
      additionalCash += (e as any).paymentCash || 0;
      additionalCard += (e as any).paymentCard || 0;
      additionalTransfer += (e as any).paymentTransfer || 0;
    });
    
    setAdditionalFeeSales({
      cash: Math.round(additionalCash),
      card: Math.round(additionalCard),
      transfer: Math.round(additionalTransfer),
      total: Math.round(additionalCash + additionalCard + additionalTransfer)
    });
    
    // 3) 입실 매출 총합 (입실 기본 + 추가요금)
    const entryTotalCash = Math.round(entryCash + additionalCash);
    const entryTotalCard = Math.round(entryCard + additionalCard);
    const entryTotalTransfer = Math.round(entryTransfer + additionalTransfer);
    
    setEntrySales({
      cash: entryTotalCash,
      card: entryTotalCard,
      transfer: entryTotalTransfer,
      total: entryTotalCash + entryTotalCard + entryTotalTransfer
    });
    
    // 4) 렌탈 매출 집계 (revenue 기준으로 환급 제외)
    let rentalCash = 0, rentalCard = 0, rentalTransfer = 0;
    
    // 항목별 매출 집계
    const itemBreakdown: { [itemName: string]: { cash: number; card: number; transfer: number; total: number } } = {};
    
    rentalTransactions.forEach(r => {
      const cash = r.paymentCash || 0;
      const card = r.paymentCard || 0;
      const transfer = r.paymentTransfer || 0;
      
      rentalCash += cash;
      rentalCard += card;
      rentalTransfer += transfer;
      
      // 항목별 집계
      const itemName = r.itemName || '기타';
      if (!itemBreakdown[itemName]) {
        itemBreakdown[itemName] = { cash: 0, card: 0, transfer: 0, total: 0 };
      }
      itemBreakdown[itemName].cash += cash;
      itemBreakdown[itemName].card += card;
      itemBreakdown[itemName].transfer += transfer;
      itemBreakdown[itemName].total += cash + card + transfer;
    });
    
    // 반올림 처리
    Object.keys(itemBreakdown).forEach(key => {
      itemBreakdown[key].cash = Math.round(itemBreakdown[key].cash);
      itemBreakdown[key].card = Math.round(itemBreakdown[key].card);
      itemBreakdown[key].transfer = Math.round(itemBreakdown[key].transfer);
      itemBreakdown[key].total = Math.round(itemBreakdown[key].total);
    });
    
    setRentalItemBreakdown(itemBreakdown);
    
    setRentalSales({
      cash: Math.round(rentalCash),
      card: Math.round(rentalCard),
      transfer: Math.round(rentalTransfer),
      total: Math.round(rentalCash + rentalCard + rentalTransfer)
    });
    
    // 5) 총 매출 (입실 매출 + 렌탈 매출)
    const totalCash = Math.round(entryCash + additionalCash + rentalCash);
    const totalCard = Math.round(entryCard + additionalCard + rentalCard);
    const totalTransfer = Math.round(entryTransfer + additionalTransfer + rentalTransfer);
    
    // 6) 환불 합계 (매출 차감)
    const refund = localDb.getRefundSummaryByBusinessDay(businessDay, bdStartHour);
    setRefundSummary(refund);
    
    // 환불 차감된 실제 총 매출
    const netTotalCash = totalCash;
    const netTotalCard = totalCard;
    const netTotalTransfer = totalTransfer;
    const grossTotal = netTotalCash + netTotalCard + netTotalTransfer;
    const netTotal = Math.max(0, grossTotal - refund.total);
    
    setTotalEntrySales({
      cash: netTotalCash,
      card: netTotalCard,
      transfer: netTotalTransfer,
      total: grossTotal  // gross before refund; refund shown separately below
    });
    
    // 렌탈 상세 분석 (기존 데이터와 호환)
    setRentalBreakdown({
      breakdown: {},
      totals: {
        grandTotal: {
          cash: Math.round(rentalCash),
          card: Math.round(rentalCard),
          transfer: Math.round(rentalTransfer)
        }
      }
    });
    
    // 총 매출 요약 (환불 차감 전 원래 매출로 salesSummary 설정 - 하단 UI에서 별도로 환불 표시)
    setSalesSummary({
      cashSales: totalCash,
      cardSales: totalCard,
      transferSales: totalTransfer,
      totalSales: totalCash + totalCard + totalTransfer,
    });

    // Load expense summary
    const expenses = localDb.getExpenseSummaryByBusinessDay(businessDay);
    setExpenseSummary({
      cashExpenses: Number(expenses.cashTotal),
      cardExpenses: Number(expenses.cardTotal),
      transferExpenses: Number(expenses.transferTotal),
      totalExpenses: Number(expenses.total),
    });

    // Calculate expected cash (현금 환불만 현금 지출로 차감, 카드/이체 환불은 해당 수단에서 차감)
    const openingFloatNum = parseInt(openingFloat) || 0;
    const expected = openingFloatNum + totalCash - Number(expenses.cashTotal) - refund.cash;
    setExpectedCash(expected);
  };

  useEffect(() => {
    // Recalculate expected cash when sales/expenses/opening float change (현금 환불만 차감)
    const openingFloatNum = parseInt(openingFloat) || 0;
    const expected = openingFloatNum + salesSummary.cashSales - expenseSummary.cashExpenses - refundSummary.cash;
    setExpectedCash(expected);
  }, [openingFloat, salesSummary, expenseSummary, refundSummary]);

  const handleSave = () => {
    const openingFloatNum = parseInt(openingFloat);
    const targetFloatNum = parseInt(targetFloat);

    if (isNaN(openingFloatNum) || openingFloatNum < 0) {
      toast({
        title: '입력 오류',
        description: '올바른 시재금을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (isNaN(targetFloatNum) || targetFloatNum < 0) {
      toast({
        title: '입력 오류',
        description: '올바른 목표 시재금을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const existingClosing = getClosingDay(businessDay);

    const closingData = {
      businessDay,
      startTime: startTime || '10:00',
      endTime,
      openingFloat: openingFloatNum,
      targetFloat: targetFloatNum,
      actualCash: actualCash ? parseInt(actualCash) : undefined,
      expectedCash,
      discrepancy,
      bankDeposit: bankDeposit ? parseInt(bankDeposit) : undefined,
      notes: notes.trim() || undefined,
      memo: memo.trim() || undefined,
    };

    if (existingClosing) {
      updateClosingDay(businessDay, closingData);
      toast({
        title: '정산 저장 완료',
        description: '정산 정보가 저장되었습니다.',
      });
    } else {
      createClosingDay(closingData);
      toast({
        title: '정산 생성 완료',
        description: '새 정산이 생성되었습니다.',
      });
    }

    loadClosingData(businessDay);
  };

  const handleConfirm = () => {
    setConfirmDialogOpen(true);
  };

  const confirmClosing = async () => {
    handleSave(); // Save first
    confirmClosingDay(businessDay);

    // Clear daily memo from localStorage after closing is confirmed
    localStorage.removeItem('daily_memo');

    toast({
      title: '정산 확정 완료',
      description: '정산이 확정되었습니다. 수정이 불가능합니다.',
    });

    // 마감 확정 시 전체 데이터를 자동 백업 (지정 파일이 있으면 덮어쓰기, 없으면 다운로드)
    const backup = await downloadClosingBackup(businessDay);
    if (!backup.success && backup.message) {
      toast({
        title: '자동 백업 실패',
        description: `${backup.message} 설정 메뉴에서 수동으로 내보내기 해주세요.`,
        variant: 'destructive',
      });
    }

    setConfirmDialogOpen(false);
    loadClosingData(businessDay);
  };

  const handleBusinessDayChange = (newBusinessDay: string) => {
    if (newBusinessDay === businessDay) return; // Skip if unchanged
    
    setBusinessDay(newBusinessDay);
    
    // 년/월/일 상태도 업데이트
    const [year, month, day] = newBusinessDay.split('-');
    setSelectedYear(year);
    setSelectedMonth(month);
    setSelectedDay(day);
    
    loadClosingData(newBusinessDay);
    
    toast({
      title: '영업일 변경',
      description: `${newBusinessDay} 영업일 데이터를 불러왔습니다.`,
    });
  };

  // 년/월/일 분리 선택 관련 함수들
  const availableYears = Array.from(new Set(availableBusinessDays.map(d => d.split('-')[0]))).sort((a, b) => b.localeCompare(a));
  
  const availableMonths = Array.from(new Set(
    availableBusinessDays
      .filter(d => d.startsWith(selectedYear))
      .map(d => d.split('-')[1])
  )).sort((a, b) => b.localeCompare(a));
  
  const availableDays = Array.from(new Set(
    availableBusinessDays
      .filter(d => d.startsWith(`${selectedYear}-${selectedMonth}`))
      .map(d => d.split('-')[2])
  )).sort((a, b) => b.localeCompare(a));

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    // 해당 년도에서 가장 최근 월/일 자동 선택
    const daysInYear = availableBusinessDays.filter(d => d.startsWith(year));
    if (daysInYear.length > 0) {
      const latestDay = daysInYear[0]; // 가장 최근 날짜
      const [, month, day] = latestDay.split('-');
      setSelectedMonth(month);
      setSelectedDay(day);
      handleBusinessDayChange(latestDay);
    }
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    // 해당 월에서 가장 최근 일 자동 선택
    const daysInMonth = availableBusinessDays.filter(d => d.startsWith(`${selectedYear}-${month}`));
    if (daysInMonth.length > 0) {
      const latestDay = daysInMonth[0]; // 가장 최근 날짜
      const [, , day] = latestDay.split('-');
      setSelectedDay(day);
      handleBusinessDayChange(latestDay);
    }
  };

  const handleDayChange = (day: string) => {
    setSelectedDay(day);
    const newBusinessDay = `${selectedYear}-${selectedMonth}-${day}`;
    if (availableBusinessDays.includes(newBusinessDay)) {
      handleBusinessDayChange(newBusinessDay);
    }
  };

  // 현재 선택된 영업일의 상태 확인
  const currentClosing = getClosingDay(businessDay);

  const handleRangeQuery = () => {
    if (!rangeStartBusinessDay || !rangeEndBusinessDay) {
      toast({
        title: '기간 선택 필요',
        description: '시작일과 종료일을 모두 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (rangeStartBusinessDay > rangeEndBusinessDay) {
      toast({
        title: '날짜 오류',
        description: '시작일이 종료일보다 늦을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const data = getDetailedSalesByBusinessDayRange(rangeStartBusinessDay, rangeEndBusinessDay);
    setRangeSalesData(data);
    setShowRangeSummary(true);

    toast({
      title: '기간별 조회 완료',
      description: `${rangeStartBusinessDay} ~ ${rangeEndBusinessDay} 기간의 매출을 조회했습니다.`,
    });
  };

  // 기간별 정산 보고서: 매출(지불방식별)·지출 요약 + 일별 매출 추이 그래프
  const handleGenerateReport = () => {
    if (!rangeStartBusinessDay || !rangeEndBusinessDay) {
      toast({
        title: '기간 선택 필요',
        description: '시작일과 종료일을 모두 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (rangeStartBusinessDay > rangeEndBusinessDay) {
      toast({
        title: '날짜 오류',
        description: '시작일이 종료일보다 늦을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const sales = getDetailedSalesByBusinessDayRange(rangeStartBusinessDay, rangeEndBusinessDay);
    setRangeSalesData(sales);

    const expenses = localDb.getExpenseSummaryByBusinessDayRange(rangeStartBusinessDay, rangeEndBusinessDay);
    setReportExpenseSummary(expenses);

    const allSummaries = localDb.getAllDailySummaries() as { businessDay: string; totalSales: number }[];
    const trend = allSummaries
      .filter((s) => s.businessDay >= rangeStartBusinessDay && s.businessDay <= rangeEndBusinessDay)
      .map((s) => ({ businessDay: s.businessDay, totalSales: s.totalSales || 0 }))
      .sort((a, b) => a.businessDay.localeCompare(b.businessDay));
    setReportDailyTrend(trend);

    setShowReport(true);

    toast({
      title: '보고서 생성 완료',
      description: `${rangeStartBusinessDay} ~ ${rangeEndBusinessDay} 기간의 정산 보고서를 생성했습니다.`,
    });
  };

  // 기간별 정산 보고서를 엑셀로 내보내기 (선택된 영업일 하나가 아니라 조회한 기간 전체)
  const handleExportReportExcel = () => {
    if (!rangeSalesData || !reportExpenseSummary) return;

    const netProfit = rangeSalesData.totalEntrySales.total - reportExpenseSummary.total;

    const data: (string | number)[][] = [
      ['정산 보고서 (기간별)', '', '', '', ''],
      ['기간', `${rangeStartBusinessDay} ~ ${rangeEndBusinessDay}`, '', '', ''],
      ['', '', '', '', ''],
      ['매출 내역', '현금', '카드', '계좌이체', '합계'],
      ['입실매출', rangeSalesData.entrySales.cash, rangeSalesData.entrySales.card, rangeSalesData.entrySales.transfer, rangeSalesData.entrySales.total],
      ['추가요금 매출', rangeSalesData.additionalSales.cash, rangeSalesData.additionalSales.card, rangeSalesData.additionalSales.transfer, rangeSalesData.additionalSales.total],
      ['대여물품 매출', rangeSalesData.rentalSales.cash, rangeSalesData.rentalSales.card, rangeSalesData.rentalSales.transfer, rangeSalesData.rentalSales.total],
      ['총매출', rangeSalesData.totalEntrySales.cash, rangeSalesData.totalEntrySales.card, rangeSalesData.totalEntrySales.transfer, rangeSalesData.totalEntrySales.total],
      ['', '', '', '', ''],
      ['지출 내역', '현금', '카드', '계좌이체', '합계'],
      ['지출합계', reportExpenseSummary.cashTotal, reportExpenseSummary.cardTotal, reportExpenseSummary.transferTotal, reportExpenseSummary.total],
      ['', '', '', '', ''],
      ['순수익 (총매출 - 지출)', netProfit, '', '', ''],
      ['', '', '', '', ''],
      ['일별 매출 추이', '', '', '', ''],
      ['영업일', '매출', '', '', ''],
      ...reportDailyTrend.map((d) => [d.businessDay, d.totalSales, '', '', '']),
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '정산보고서');
    XLSX.writeFile(wb, `정산보고서_${rangeStartBusinessDay}_${rangeEndBusinessDay}.xlsx`);

    toast({
      title: '엑셀 내보내기 완료',
      description: `정산보고서_${rangeStartBusinessDay}_${rangeEndBusinessDay}.xlsx 파일이 다운로드되었습니다.`,
    });
  };

  // 기간별 정산 보고서를 PDF로 내보내기
  const handleExportReportPDF = () => {
    if (!rangeSalesData || !reportExpenseSummary) return;

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text(`Settlement Report (${rangeStartBusinessDay} ~ ${rangeEndBusinessDay})`, 14, 20);

    const salesData = [
      ['Entry Sales', rangeSalesData.entrySales.cash.toLocaleString(), rangeSalesData.entrySales.card.toLocaleString(), rangeSalesData.entrySales.transfer.toLocaleString(), rangeSalesData.entrySales.total.toLocaleString()],
      ['Additional Fee', rangeSalesData.additionalSales.cash.toLocaleString(), rangeSalesData.additionalSales.card.toLocaleString(), rangeSalesData.additionalSales.transfer.toLocaleString(), rangeSalesData.additionalSales.total.toLocaleString()],
      ['Rental', rangeSalesData.rentalSales.cash.toLocaleString(), rangeSalesData.rentalSales.card.toLocaleString(), rangeSalesData.rentalSales.transfer.toLocaleString(), rangeSalesData.rentalSales.total.toLocaleString()],
      ['Total Sales', rangeSalesData.totalEntrySales.cash.toLocaleString(), rangeSalesData.totalEntrySales.card.toLocaleString(), rangeSalesData.totalEntrySales.transfer.toLocaleString(), rangeSalesData.totalEntrySales.total.toLocaleString()],
    ];

    autoTable(doc, {
      head: [['Category', 'Cash', 'Card', 'Transfer', 'Total']],
      body: salesData,
      startY: 28,
      theme: 'grid',
      headStyles: { fillColor: [66, 139, 202] },
    });

    const finalY1 = (doc as any).lastAutoTable.finalY;

    const expenseData = [
      ['Cash', reportExpenseSummary.cashTotal.toLocaleString()],
      ['Card', reportExpenseSummary.cardTotal.toLocaleString()],
      ['Transfer', reportExpenseSummary.transferTotal.toLocaleString()],
      ['Total', reportExpenseSummary.total.toLocaleString()],
    ];

    autoTable(doc, {
      head: [['Expenses', 'Amount']],
      body: expenseData,
      startY: finalY1 + 10,
      theme: 'grid',
      headStyles: { fillColor: [217, 83, 79] },
    });

    const finalY2 = (doc as any).lastAutoTable.finalY;

    doc.setFontSize(12);
    doc.text(
      `Net Profit: ${(rangeSalesData.totalEntrySales.total - reportExpenseSummary.total).toLocaleString()}`,
      14,
      finalY2 + 10
    );

    if (reportDailyTrend.length > 0) {
      autoTable(doc, {
        head: [['Date', 'Sales']],
        body: reportDailyTrend.map((d) => [d.businessDay, d.totalSales.toLocaleString()]),
        startY: finalY2 + 16,
        theme: 'grid',
        headStyles: { fillColor: [100, 100, 100] },
      });
    }

    doc.save(`정산보고서_${rangeStartBusinessDay}_${rangeEndBusinessDay}.pdf`);

    toast({
      title: 'PDF 내보내기 완료',
      description: `정산보고서_${rangeStartBusinessDay}_${rangeEndBusinessDay}.pdf 파일이 다운로드되었습니다.`,
    });
  };

  // Export to Excel
  const handleExportExcel = () => {
    const data = [
      ['정산 보고서', '', '', '', ''],
      ['영업일', businessDay, '', '', ''],
      ['시작 시간', startTime, '종료 시간', endTime, ''],
      ['', '', '', '', ''],
      ['매출 내역', '현금', '카드', '계좌이체', '합계'],
      ['입실 기본요금', baseEntrySales.cash, baseEntrySales.card, baseEntrySales.transfer, baseEntrySales.total],
      ['추가요금', additionalFeeSales.cash, additionalFeeSales.card, additionalFeeSales.transfer, additionalFeeSales.total],
      ['입실 총합', entrySales.cash, entrySales.card, entrySales.transfer, entrySales.total],
      ['대여수익', rentalSales.cash, rentalSales.card, rentalSales.transfer, rentalSales.total],
      ['매출 총합', totalEntrySales.cash, totalEntrySales.card, totalEntrySales.transfer, totalEntrySales.total],
      ['', '', '', '', ''],
      ['지출 내역', '', '', '', ''],
      ['현금 지출', expenseSummary.cashExpenses, '', '', ''],
      ['카드 지출', expenseSummary.cardExpenses, '', '', ''],
      ['계좌이체 지출', expenseSummary.transferExpenses, '', '', ''],
      ['지출 총합', expenseSummary.totalExpenses, '', '', ''],
      ['', '', '', '', ''],
      ['시재금 현황', '', '', '', ''],
      ['시재금 (시작)', parseInt(openingFloat) || 0, '', '', ''],
      ['목표 시재금', parseInt(targetFloat) || 0, '', '', ''],
      ['예상 현금', expectedCash, '', '', ''],
      ['실제 현금', parseInt(actualCash) || 0, '', '', ''],
      ['과부족', discrepancy, '', '', ''],
      ['은행 입금액', parseInt(bankDeposit) || 0, '', '', ''],
      ['', '', '', '', ''],
      ['순수익', totalEntrySales.total - expenseSummary.totalExpenses, '', '', ''],
    ];

    if (memo) {
      data.push(['', '', '', '', '']);
      data.push(['일일 메모', memo, '', '', '']);
    }
    if (notes) {
      data.push(['정산 메모', notes, '', '', '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '정산');
    XLSX.writeFile(wb, `정산_${businessDay}.xlsx`);

    toast({
      title: '엑셀 내보내기 완료',
      description: `정산_${businessDay}.xlsx 파일이 다운로드되었습니다.`,
    });
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text(`Settlement Report - ${businessDay}`, 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Hours: ${startTime} - ${endTime}`, 14, 30);
    
    // Sales Table
    const salesData = [
      ['Entry Base', baseEntrySales.cash.toLocaleString(), baseEntrySales.card.toLocaleString(), baseEntrySales.transfer.toLocaleString(), baseEntrySales.total.toLocaleString()],
      ['Additional Fee', additionalFeeSales.cash.toLocaleString(), additionalFeeSales.card.toLocaleString(), additionalFeeSales.transfer.toLocaleString(), additionalFeeSales.total.toLocaleString()],
      ['Entry Total', entrySales.cash.toLocaleString(), entrySales.card.toLocaleString(), entrySales.transfer.toLocaleString(), entrySales.total.toLocaleString()],
      ['Rental', rentalSales.cash.toLocaleString(), rentalSales.card.toLocaleString(), rentalSales.transfer.toLocaleString(), rentalSales.total.toLocaleString()],
      ['Total Sales', totalEntrySales.cash.toLocaleString(), totalEntrySales.card.toLocaleString(), totalEntrySales.transfer.toLocaleString(), totalEntrySales.total.toLocaleString()],
    ];

    autoTable(doc, {
      head: [['Category', 'Cash', 'Card', 'Transfer', 'Total']],
      body: salesData,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [66, 139, 202] },
    });

    const finalY1 = (doc as any).lastAutoTable.finalY;

    // Expense Table
    const expenseData = [
      ['Cash', expenseSummary.cashExpenses.toLocaleString()],
      ['Card', expenseSummary.cardExpenses.toLocaleString()],
      ['Transfer', expenseSummary.transferExpenses.toLocaleString()],
      ['Total', expenseSummary.totalExpenses.toLocaleString()],
    ];

    autoTable(doc, {
      head: [['Expenses', 'Amount']],
      body: expenseData,
      startY: finalY1 + 10,
      theme: 'grid',
      headStyles: { fillColor: [217, 83, 79] },
    });

    const finalY2 = (doc as any).lastAutoTable.finalY;

    // Cash Register Table
    const cashData = [
      ['Opening Float', (parseInt(openingFloat) || 0).toLocaleString()],
      ['Target Float', (parseInt(targetFloat) || 0).toLocaleString()],
      ['Expected Cash', expectedCash.toLocaleString()],
      ['Actual Cash', (parseInt(actualCash) || 0).toLocaleString()],
      ['Discrepancy', discrepancy.toLocaleString()],
      ['Bank Deposit', (parseInt(bankDeposit) || 0).toLocaleString()],
    ];

    autoTable(doc, {
      head: [['Cash Register', 'Amount']],
      body: cashData,
      startY: finalY2 + 10,
      theme: 'grid',
      headStyles: { fillColor: [91, 192, 222] },
    });

    let finalY = (doc as any).lastAutoTable.finalY;

    // Net Profit
    doc.setFontSize(14);
    doc.text(`Net Profit: ${(totalEntrySales.total - expenseSummary.totalExpenses).toLocaleString()} KRW`, 14, finalY + 15);
    finalY += 25;

    // Memos section
    if (memo || notes) {
      const memoData: string[][] = [];
      if (memo) {
        memoData.push(['Daily Memo', memo.substring(0, 100) + (memo.length > 100 ? '...' : '')]);
      }
      if (notes) {
        memoData.push(['Settlement Notes', notes.substring(0, 100) + (notes.length > 100 ? '...' : '')]);
      }
      
      autoTable(doc, {
        head: [['Type', 'Content']],
        body: memoData,
        startY: finalY,
        theme: 'grid',
        headStyles: { fillColor: [92, 184, 92] },
        columnStyles: { 1: { cellWidth: 120 } },
      });
    }

    doc.save(`정산_${businessDay}.pdf`);

    toast({
      title: 'PDF 내보내기 완료',
      description: `정산_${businessDay}.pdf 파일이 다운로드되었습니다.`,
    });
  };

  // Calculate pending closings (only for days with saved closing data)
  const pendingClosings = availableBusinessDays.filter(day => {
    const closing = getClosingDay(day);
    // Only include days that have closing data but not confirmed
    return closing && !closing.isConfirmed;
  });

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="container max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">정산하기</h1>
          </div>

          <div className="flex items-center justify-end gap-0.5 pl-14">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                  onClick={handleExportExcel}
                  data-testid="button-export-excel"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="sr-only">엑셀로 내보내기</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>엑셀로 내보내기</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                  onClick={handleExportPDF}
                  data-testid="button-export-pdf"
                >
                  <FileText className="h-4 w-4" />
                  <span className="sr-only">PDF로 내보내기</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDF로 내보내기</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pl-14">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedYear} onValueChange={handleYearChange}>
                <SelectTrigger className="w-[85px]" data-testid="select-year">
                  <SelectValue placeholder="년" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}년
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedMonth} onValueChange={handleMonthChange}>
                <SelectTrigger className="w-[70px]" data-testid="select-month">
                  <SelectValue placeholder="월" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {parseInt(month)}월
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedDay} onValueChange={handleDayChange}>
                <SelectTrigger className="w-[70px]" data-testid="select-day">
                  <SelectValue placeholder="일" />
                </SelectTrigger>
                <SelectContent>
                  {availableDays.map((day) => (
                    <SelectItem key={day} value={day}>
                      {parseInt(day)}일
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentClosing?.isConfirmed ? (
                <Badge variant="secondary" className="text-xs whitespace-nowrap">확정</Badge>
              ) : currentClosing ? (
                <Badge variant="outline" className="text-xs whitespace-nowrap">저장됨</Badge>
              ) : (
                <Badge variant="destructive" className="text-xs whitespace-nowrap">미정산</Badge>
              )}
              {isConfirmed && (
                <span className="text-sm text-green-600 font-semibold">✓ 확정완료</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline"
                onClick={() => {
                  const bankDepositAmount = (parseInt(actualCash) || 0) - (parseInt(targetFloat) || 0);
                  toast({
                    title: '은행입금액 계산',
                    description: `입금할 금액: ${formatKoreanCurrency(bankDepositAmount)}`,
                    duration: 5000,
                  });
                }} 
                disabled={!actualCash || isConfirmed} 
                data-testid="button-calculate-bank-deposit"
              >
                <Calculator className="h-4 w-4 mr-2" />
                은행입금액
              </Button>
              <Button onClick={handleSave} disabled={isConfirmed} data-testid="button-save-closing">
                <Save className="h-4 w-4 mr-2" />
                저장
              </Button>
              <Button onClick={handleConfirm} disabled={isConfirmed} data-testid="button-confirm-closing">
                <CheckCircle className="h-4 w-4 mr-2" />
                정산확정
              </Button>
            </div>
          </div>
        </div>

        {/* Pending Closings Warning */}
        {pendingClosings.length > 0 && (
          <Alert variant="default" className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950" data-testid="alert-pending-closings">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              <span className="font-semibold">저장됨 미확정 정산:</span> {pendingClosings.length}일
              {pendingClosings.length <= 5 && (
                <span className="ml-2 text-sm">
                  ({pendingClosings.slice(0, 5).join(', ')})
                </span>
              )}
              <span className="ml-2 text-sm opacity-80">— 해당 날짜를 선택 후 [정산확정]을 눌러 완료하세요</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              정산 기본 정보
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">시작 시간</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isConfirmed}
                  data-testid="input-start-time"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">종료 시간</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={isConfirmed}
                  data-testid="input-end-time"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="openingFloat">시재금</Label>
                <Input
                  id="openingFloat"
                  type="text"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  disabled={isConfirmed}
                  placeholder="0"
                  data-testid="input-opening-float"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetFloat">목표 시재금</Label>
                <Input
                  id="targetFloat"
                  type="text"
                  value={targetFloat}
                  onChange={(e) => setTargetFloat(e.target.value)}
                  disabled={isConfirmed}
                  placeholder="0"
                  data-testid="input-target-float"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cash Register Input */}
        <Card>
          <CardHeader>
            <CardTitle>시재금 입력</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              지폐 단위별 매수를 입력하면 시재금·목표 시재금에 자동 반영됩니다. (시재금관리 메뉴와 동일)
            </p>
            <CashRegisterInput
              disabled={isConfirmed}
              onSaved={(total) => {
                if (total > 0) {
                  setOpeningFloat(total.toString());
                  setTargetFloat((prev) => prev || total.toString());
                }
              }}
            />
          </CardContent>
        </Card>

        {/* Range Query */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <CalendarIcon className="h-5 w-5" />
              기간별 정산 조회
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="rangeStartBusinessDay">시작 영업일</Label>
                <ClosingRangeDatePicker
                  id="rangeStartBusinessDay"
                  value={rangeStartBusinessDay}
                  placeholder="시작일 선택"
                  onChange={setRangeStartBusinessDay}
                  testId="select-range-start"
                />
              </div>

              <div className="flex-1 space-y-2">
                <Label htmlFor="rangeEndBusinessDay">종료 영업일</Label>
                <ClosingRangeDatePicker
                  id="rangeEndBusinessDay"
                  value={rangeEndBusinessDay}
                  placeholder="종료일 선택"
                  onChange={setRangeEndBusinessDay}
                  testId="select-range-end"
                />
              </div>

              <div className="flex items-end gap-2">
                <Button onClick={handleRangeQuery} className="w-full sm:w-auto" data-testid="button-query-range">
                  <Calculator className="h-4 w-4 mr-2" />
                  조회
                </Button>
                <Button
                  onClick={handleGenerateReport}
                  variant="outline"
                  className="w-full sm:w-auto border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:text-blue-300"
                  data-testid="button-generate-report"
                >
                  <FileBarChart2 className="h-4 w-4 mr-2" />
                  보고서 조회
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Period Report: 매출·지출 요약 + 일별 매출 추이 그래프 */}
        {showReport && rangeSalesData && reportExpenseSummary && (
          <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/40">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <FileBarChart2 className="h-5 w-5" />
                  정산 보고서 ({rangeStartBusinessDay} ~ {rangeEndBusinessDay})
                </CardTitle>
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                        onClick={handleExportReportExcel}
                        data-testid="button-export-report-excel"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span className="sr-only">보고서 엑셀로 내보내기</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>보고서 엑셀로 내보내기</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={handleExportReportPDF}
                        data-testid="button-export-report-pdf"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="sr-only">보고서 PDF로 내보내기</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>보고서 PDF로 내보내기</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <SalesGroup title="총매출" total={rangeSalesData.totalEntrySales.total} accent="blue">
                <PayTiles {...rangeSalesData.totalEntrySales} emphasize tone="primary" />
              </SalesGroup>
              <SalesGroup title="지출합계" total={reportExpenseSummary.total} accent="slate">
                <PayTiles
                  cash={reportExpenseSummary.cashTotal}
                  card={reportExpenseSummary.cardTotal}
                  transfer={reportExpenseSummary.transferTotal}
                  total={reportExpenseSummary.total}
                  emphasize
                  tone="danger"
                />
              </SalesGroup>
              <div className="rounded-lg border border-primary/20 bg-background/70 p-3 flex items-center justify-between">
                <span className="text-sm font-semibold">순수익 (총매출 - 지출)</span>
                <span className="text-lg font-bold text-primary tabular-nums" data-testid="text-report-net-profit">
                  {formatKoreanCurrency(rangeSalesData.totalEntrySales.total - reportExpenseSummary.total)}
                </span>
              </div>

              <div>
                <SalesSubLabel>일별 매출 추이</SalesSubLabel>
                {reportDailyTrend.length > 0 ? (
                  <div className="mt-2 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportDailyTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="businessDay"
                          tickFormatter={(v: string) => v.slice(5)}
                          fontSize={11}
                        />
                        <YAxis
                          tickFormatter={(v: number) => `${Math.round(v / 10000)}만`}
                          fontSize={11}
                          width={40}
                        />
                        <RechartsTooltip
                          formatter={(value: number) => [`${formatKoreanCurrency(value)}`, "매출"]}
                          labelFormatter={(label: string) => label}
                        />
                        <Bar dataKey="totalSales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">이 기간에는 매출 데이터가 없습니다.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Range Query Results */}
        {showRangeSummary && rangeSalesData && (
          <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
                기간별 매출 합계 ({rangeStartBusinessDay} ~ {rangeEndBusinessDay})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SalesGroup title="입실매출" total={rangeSalesData.entrySales.total} accent="slate">
                <PayTiles {...rangeSalesData.entrySales} />
              </SalesGroup>
              <SalesGroup title="추가요금 매출" total={rangeSalesData.additionalSales.total} accent="slate">
                <PayTiles {...rangeSalesData.additionalSales} />
              </SalesGroup>
              <SalesGroup title="대여물품 매출" total={rangeSalesData.rentalSales.total} accent="slate">
                <PayTiles {...rangeSalesData.rentalSales} />
              </SalesGroup>
              <SalesGroup title="총 입실매출 (입실 + 추가요금)" total={rangeSalesData.totalEntrySales.total} accent="blue">
                <PayTiles {...rangeSalesData.totalEntrySales} emphasize tone="primary" />
              </SalesGroup>
            </CardContent>
          </Card>
        )}

        {/* Detailed Sales Summary */}
        <Card>
          <CardHeader>
            <CardTitle>매출 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SalesGroup title="입실매출" total={entrySales.total} accent="slate">
              <div className="space-y-2">
                <SalesSubLabel>일반요금</SalesSubLabel>
                <PayTiles {...baseEntrySales} />
              </div>
              <div className="space-y-2">
                <SalesSubLabel>추가요금</SalesSubLabel>
                <PayTiles {...additionalFeeSales} />
              </div>
              <div className="rounded-lg border border-blue-200/70 dark:border-blue-800 bg-background/70 p-3 space-y-2">
                <SalesSubLabel>입실 총합 (일반 + 추가)</SalesSubLabel>
                <PayTiles {...entrySales} emphasize />
              </div>
            </SalesGroup>

            <SalesGroup title="추가매출" total={rentalSales.total} accent="slate">
              {Object.keys(rentalItemBreakdown).length > 0 ? (
                Object.entries(rentalItemBreakdown).map(([itemName, sales]) => (
                  <div key={itemName} className="space-y-2">
                    <SalesSubLabel>{itemName}</SalesSubLabel>
                    <PayTiles cash={sales.cash} card={sales.card} transfer={sales.transfer} total={sales.total} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">해당 영업일에 추가매출 항목이 없습니다.</p>
              )}
              <div className="rounded-lg border border-emerald-200/70 dark:border-emerald-800 bg-background/70 p-3 space-y-2">
                <SalesSubLabel>추가매출 총합 (대여비 + 보증금)</SalesSubLabel>
                <PayTiles {...rentalSales} emphasize />
              </div>
            </SalesGroup>

            <SalesGroup title="총매출" total={salesSummary.totalSales} accent="blue">
              <PayTiles
                cash={salesSummary.cashSales}
                card={salesSummary.cardSales}
                transfer={salesSummary.transferSales}
                total={salesSummary.totalSales}
                emphasize
                tone="primary"
                testIds={{
                  cash: "text-cash-sales",
                  card: "text-card-sales",
                  transfer: "text-transfer-sales",
                  total: "text-total-sales",
                }}
              />
              {refundSummary.total > 0 && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <SalesSubLabel>환불 차감 ({refundSummary.count}건)</SalesSubLabel>
                    <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums" data-testid="text-refund-total">
                      -{formatKoreanCurrency(refundSummary.total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-red-200 dark:border-red-800 pt-2">
                    <span className="text-sm font-semibold">순 매출</span>
                    <span className="text-lg font-bold text-primary tabular-nums" data-testid="text-net-sales">
                      {formatKoreanCurrency(Math.max(0, salesSummary.totalSales - refundSummary.total))}
                    </span>
                  </div>
                </div>
              )}
            </SalesGroup>
          </CardContent>
        </Card>

        {/* Expense Summary */}
        <Card>
          <CardHeader>
            <CardTitle>지출합계</CardTitle>
          </CardHeader>
          <CardContent>
            <PayTiles
              cash={expenseSummary.cashExpenses}
              card={expenseSummary.cardExpenses}
              transfer={expenseSummary.transferExpenses}
              total={expenseSummary.totalExpenses}
              emphasize
              tone="danger"
              testIds={{
                cash: "text-cash-expenses",
                card: "text-card-expenses",
                transfer: "text-transfer-expenses",
                total: "text-total-expenses",
              }}
            />
          </CardContent>
        </Card>

        {/* Cash Reconciliation */}
        <Card>
          <CardHeader>
            <CardTitle>현금 정산</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label>시재금</Label>
                  <p className="text-2xl font-semibold" data-testid="text-opening-float-display">
                    {formatKoreanCurrency(parseInt(openingFloat) || 0)}
                  </p>
                </div>

                <div>
                  <Label>현금 매출</Label>
                  <p className="text-2xl font-semibold text-green-600">
                    + {formatKoreanCurrency(salesSummary.cashSales)}
                  </p>
                </div>

                <div>
                  <Label>현금 지출</Label>
                  <p className="text-2xl font-semibold text-red-600">
                    - {formatKoreanCurrency(expenseSummary.cashExpenses)}
                  </p>
                </div>

                {refundSummary.cash > 0 && (
                  <div>
                    <Label>현금 환불 지출</Label>
                    <p className="text-2xl font-semibold text-red-600">
                      - {formatKoreanCurrency(refundSummary.cash)}
                    </p>
                    {(refundSummary.card > 0 || refundSummary.transfer > 0) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {refundSummary.card > 0 && `카드환불 ${formatKoreanCurrency(refundSummary.card)} `}
                        {refundSummary.transfer > 0 && `이체환불 ${formatKoreanCurrency(refundSummary.transfer)}`}
                        (현금정산 미포함)
                      </p>
                    )}
                  </div>
                )}
                {refundSummary.total > 0 && refundSummary.cash === 0 && (
                  <div>
                    <Label className="text-muted-foreground">환불 지출 (비현금)</Label>
                    <p className="text-sm text-muted-foreground">
                      카드/이체 환불 {formatKoreanCurrency(refundSummary.total)} — 현금정산 미포함
                    </p>
                  </div>
                )}

                <div className="border-t pt-4">
                  <Label>예상 현금</Label>
                  <p className="text-3xl font-bold text-primary" data-testid="text-expected-cash">
                    {formatKoreanCurrency(expectedCash)}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="actualCash">실제 현금</Label>
                  <Input
                    id="actualCash"
                    type="text"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    disabled={isConfirmed}
                    placeholder="실제 현금 금액을 입력하세요"
                    data-testid="input-actual-cash"
                  />
                </div>

                <div>
                  <Label>과부족</Label>
                  <p
                    className={`text-3xl font-bold ${
                      discrepancy > 0 ? 'text-green-600' : discrepancy < 0 ? 'text-red-600' : ''
                    }`}
                    data-testid="text-discrepancy"
                  >
                    {discrepancy > 0 && '+'}{formatKoreanCurrency(discrepancy)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {discrepancy > 0 ? '(현금 초과)' : discrepancy < 0 ? '(현금 부족)' : '(일치)'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bankDeposit">은행 입금액</Label>
                  <Input
                    id="bankDeposit"
                    type="text"
                    value={bankDeposit}
                    onChange={(e) => setBankDeposit(e.target.value)}
                    disabled={isConfirmed}
                    placeholder="은행에 입금한 금액"
                    data-testid="input-bank-deposit"
                  />
                </div>
              </div>
            </div>

            {memo && (
              <div className="mt-6 space-y-2">
                <Label>일일 메모 (오늘 현황에서 작성)</Label>
                <div className="p-3 bg-muted rounded-md text-sm" data-testid="text-daily-memo-display">
                  {memo}
                </div>
              </div>
            )}
            
            <div className="mt-6 space-y-2">
              <Label htmlFor="notes">정산 메모</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isConfirmed}
                placeholder="정산 관련 메모를 입력하세요"
                rows={3}
                data-testid="input-closing-notes"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정산 확정</AlertDialogTitle>
            <AlertDialogDescription>
              정산을 확정하시겠습니까? 확정 후에는 수정이 불가능합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm">취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClosing} data-testid="button-confirm-closing-dialog">
              확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
