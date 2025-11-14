import { useState, useEffect } from 'react';
import { ArrowLeft, Save, CheckCircle, Calculator, Calendar, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
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

export default function ClosingPage() {
  const { toast } = useToast();
  const [businessDay, setBusinessDay] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [availableBusinessDays, setAvailableBusinessDays] = useState<string[]>([]);

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

  // Sales summary (for backward compatibility)
  const [salesSummary, setSalesSummary] = useState({
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    totalSales: 0,
  });

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

  useEffect(() => {
    const settings = getSettings();
    const currentBusinessDay = getBusinessDay(new Date(), settings.businessDayStartHour);
    
    // Generate past 30 days of business days
    const pastDays = generatePastBusinessDays(30, settings.businessDayStartHour);
    setAvailableBusinessDays(pastDays);
    
    setBusinessDay(currentBusinessDay);
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
      const savedCashRegister = localStorage.getItem('cash_register');
      let calculatedFloat = 0;
      
      if (savedCashRegister) {
        try {
          const cashRegister = JSON.parse(savedCashRegister);
          calculatedFloat = (
            (cashRegister.count50000 || 0) * 50000 +
            (cashRegister.count10000 || 0) * 10000 +
            (cashRegister.count5000 || 0) * 5000 +
            (cashRegister.count1000 || 0) * 1000
          );
        } catch (error) {
          console.error('Failed to load cash register:', error);
        }
      }
      
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
    rentalTransactions.forEach(r => {
      rentalCash += r.paymentCash || 0;
      rentalCard += r.paymentCard || 0;
      rentalTransfer += r.paymentTransfer || 0;
    });
    
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
    
    setTotalEntrySales({
      cash: totalCash,
      card: totalCard,
      transfer: totalTransfer,
      total: totalCash + totalCard + totalTransfer
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
    
    // 총 매출 요약
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

    // Calculate expected cash
    const openingFloatNum = parseInt(openingFloat) || 0;
    const expected = openingFloatNum + totalCash - Number(expenses.cashTotal);
    setExpectedCash(expected);
  };

  useEffect(() => {
    // Recalculate expected cash when sales/expenses/opening float change
    const openingFloatNum = parseInt(openingFloat) || 0;
    const expected = openingFloatNum + salesSummary.cashSales - expenseSummary.cashExpenses;
    setExpectedCash(expected);
  }, [openingFloat, salesSummary, expenseSummary]);

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

  const confirmClosing = () => {
    handleSave(); // Save first
    confirmClosingDay(businessDay);
    
    // Clear daily memo from localStorage after closing is confirmed
    localStorage.removeItem('daily_memo');

    toast({
      title: '정산 확정 완료',
      description: '정산이 확정되었습니다. 수정이 불가능합니다.',
    });

    setConfirmDialogOpen(false);
    loadClosingData(businessDay);
  };

  const handleBusinessDayChange = (selectedDay: string) => {
    if (selectedDay === businessDay) return; // Skip if unchanged
    
    setBusinessDay(selectedDay);
    loadClosingData(selectedDay);
    
    toast({
      title: '영업일 변경',
      description: `${selectedDay} 영업일 데이터를 불러왔습니다.`,
    });
  };

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

  // Calculate pending closings (only for days with saved closing data)
  const pendingClosings = availableBusinessDays.filter(day => {
    const closing = getClosingDay(day);
    // Only include days that have closing data but not confirmed
    return closing && !closing.isConfirmed;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold">정산하기</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {isConfirmed && <span className="text-green-600 font-semibold">✓ 확정완료</span>}
                </p>
              </div>
              
              {/* Business Day Selector */}
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <Select value={businessDay} onValueChange={handleBusinessDayChange}>
                  <SelectTrigger className="w-[180px]" data-testid="select-business-day">
                    <SelectValue placeholder="영업일 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBusinessDays.map((day) => {
                      const closing = getClosingDay(day);
                      const isPending = !closing?.isConfirmed;
                      
                      return (
                        <SelectItem key={day} value={day} data-testid={`option-business-day-${day}`}>
                          <div className="flex items-center gap-2">
                            <span>{day}</span>
                            {closing?.isConfirmed && (
                              <Badge variant="secondary" className="text-xs">확정</Badge>
                            )}
                            {isPending && closing && (
                              <Badge variant="outline" className="text-xs">저장됨</Badge>
                            )}
                            {isPending && !closing && (
                              <Badge variant="destructive" className="text-xs">미정산</Badge>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
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

        {/* Pending Closings Warning */}
        {pendingClosings.length > 0 && (
          <Alert variant="default" className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950" data-testid="alert-pending-closings">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              <span className="font-semibold">미정산 영업일:</span> {pendingClosings.length}일
              {pendingClosings.length <= 5 && (
                <span className="ml-2 text-sm">
                  ({pendingClosings.slice(0, 5).join(', ')})
                </span>
              )}
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
                  type="number"
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
                  type="number"
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

        {/* Range Query */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Calendar className="h-5 w-5" />
              기간별 정산 조회
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="rangeStartBusinessDay">시작 영업일</Label>
                <Select value={rangeStartBusinessDay} onValueChange={setRangeStartBusinessDay}>
                  <SelectTrigger id="rangeStartBusinessDay" data-testid="select-range-start">
                    <SelectValue placeholder="시작일 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBusinessDays.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 space-y-2">
                <Label htmlFor="rangeEndBusinessDay">종료 영업일</Label>
                <Select value={rangeEndBusinessDay} onValueChange={setRangeEndBusinessDay}>
                  <SelectTrigger id="rangeEndBusinessDay" data-testid="select-range-end">
                    <SelectValue placeholder="종료일 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBusinessDays.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button onClick={handleRangeQuery} className="w-full sm:w-auto" data-testid="button-query-range">
                  <Calculator className="h-4 w-4 mr-2" />
                  조회
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Range Query Results */}
        {showRangeSummary && rangeSalesData && (
          <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
                기간별 매출 합계 ({rangeStartBusinessDay} ~ {rangeEndBusinessDay})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 입실매출 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">입실매출</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">현금</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.entrySales.cash)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">카드</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.entrySales.card)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">이체</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.entrySales.transfer)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">합계</p>
                    <p className="text-lg font-semibold text-primary">{formatKoreanCurrency(rangeSalesData.entrySales.total)}</p>
                  </div>
                </div>
              </div>

              {/* 추가요금 매출 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">추가요금 매출</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">현금</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.additionalSales.cash)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">카드</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.additionalSales.card)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">이체</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.additionalSales.transfer)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">합계</p>
                    <p className="text-lg font-semibold text-primary">{formatKoreanCurrency(rangeSalesData.additionalSales.total)}</p>
                  </div>
                </div>
              </div>

              {/* 대여물품 매출 */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">대여물품 매출</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">현금</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.rentalSales.cash)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">카드</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.rentalSales.card)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">이체</p>
                    <p className="text-lg font-semibold">{formatKoreanCurrency(rangeSalesData.rentalSales.transfer)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">합계</p>
                    <p className="text-lg font-semibold text-primary">{formatKoreanCurrency(rangeSalesData.rentalSales.total)}</p>
                  </div>
                </div>
              </div>

              {/* 총매출 */}
              <div className="space-y-3 bg-primary/5 dark:bg-primary/10 p-4 rounded-lg border border-primary/20">
                <h3 className="font-semibold text-lg border-b border-primary/20 pb-2">총 입실매출 (입실 + 추가요금)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">현금</p>
                    <p className="text-xl font-bold text-primary">{formatKoreanCurrency(rangeSalesData.totalEntrySales.cash)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">카드</p>
                    <p className="text-xl font-bold text-primary">{formatKoreanCurrency(rangeSalesData.totalEntrySales.card)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">이체</p>
                    <p className="text-xl font-bold text-primary">{formatKoreanCurrency(rangeSalesData.totalEntrySales.transfer)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">합계</p>
                    <p className="text-xl font-bold text-primary">{formatKoreanCurrency(rangeSalesData.totalEntrySales.total)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed Sales Summary */}
        <Card>
          <CardHeader>
            <CardTitle>매출 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 입실매출 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg border-b pb-2">입실매출</h3>
              
              {/* ① 일반요금합계 */}
              <div className="pl-4 space-y-1">
                <p className="text-sm font-medium">① 일반요금합계</p>
                <div className="grid grid-cols-4 gap-2 text-sm pl-2">
                  <div>
                    <span className="text-muted-foreground">현금:</span>
                    <span className="ml-1 font-medium">{formatKoreanCurrency(baseEntrySales.cash)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">카드:</span>
                    <span className="ml-1 font-medium">{formatKoreanCurrency(baseEntrySales.card)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">이체:</span>
                    <span className="ml-1 font-medium">{formatKoreanCurrency(baseEntrySales.transfer)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">합계:</span>
                    <span className="ml-1 font-semibold">{formatKoreanCurrency(baseEntrySales.total)}</span>
                  </div>
                </div>
              </div>

              {/* ② 추가요금합계 */}
              <div className="pl-4 space-y-1">
                <p className="text-sm font-medium">② 추가요금합계</p>
                <div className="grid grid-cols-4 gap-2 text-sm pl-2">
                  <div>
                    <span className="text-muted-foreground">현금:</span>
                    <span className="ml-1 font-medium">{formatKoreanCurrency(additionalFeeSales.cash)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">카드:</span>
                    <span className="ml-1 font-medium">{formatKoreanCurrency(additionalFeeSales.card)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">이체:</span>
                    <span className="ml-1 font-medium">{formatKoreanCurrency(additionalFeeSales.transfer)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">합계:</span>
                    <span className="ml-1 font-semibold">{formatKoreanCurrency(additionalFeeSales.total)}</span>
                  </div>
                </div>
              </div>

              {/* ③ 입실매출 총합 */}
              <div className="pl-4 space-y-1 bg-blue-50 dark:bg-blue-950 p-3 rounded">
                <p className="text-sm font-semibold">③ 총합 (① + ②)</p>
                <div className="grid grid-cols-4 gap-2 text-sm pl-2">
                  <div>
                    <span className="text-muted-foreground">현금:</span>
                    <span className="ml-1 font-bold">{formatKoreanCurrency(entrySales.cash)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">카드:</span>
                    <span className="ml-1 font-bold">{formatKoreanCurrency(entrySales.card)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">이체:</span>
                    <span className="ml-1 font-bold">{formatKoreanCurrency(entrySales.transfer)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">합계:</span>
                    <span className="ml-1 font-bold text-primary">{formatKoreanCurrency(entrySales.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 추가매출 (대여품목) */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg border-b pb-2">추가매출</h3>
              
              {/* ④ 대여품목 총합 (대여비 + 보증금) */}
              <div className="pl-4 space-y-1 bg-green-50 dark:bg-green-950 p-3 rounded">
                <p className="text-sm font-semibold">④ 총합 (대여비 + 보증금)</p>
                <div className="grid grid-cols-4 gap-2 text-sm pl-2">
                  <div>
                    <span className="text-muted-foreground">현금:</span>
                    <span className="ml-1 font-bold">{formatKoreanCurrency(rentalSales.cash)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">카드:</span>
                    <span className="ml-1 font-bold">{formatKoreanCurrency(rentalSales.card)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">이체:</span>
                    <span className="ml-1 font-bold">{formatKoreanCurrency(rentalSales.transfer)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">합계:</span>
                    <span className="ml-1 font-bold text-primary">{formatKoreanCurrency(rentalSales.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 총매출 */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg border-b pb-2">총매출</h3>
              <div className="pl-4 space-y-1 bg-primary/10 p-4 rounded">
                <p className="text-base font-bold">⑤ 총매출 (③ + ④)</p>
                <div className="grid grid-cols-4 gap-2 text-base pl-2">
                  <div>
                    <span className="text-muted-foreground">현금:</span>
                    <span className="ml-1 font-bold" data-testid="text-cash-sales">{formatKoreanCurrency(salesSummary.cashSales)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">카드:</span>
                    <span className="ml-1 font-bold" data-testid="text-card-sales">{formatKoreanCurrency(salesSummary.cardSales)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">이체:</span>
                    <span className="ml-1 font-bold" data-testid="text-transfer-sales">{formatKoreanCurrency(salesSummary.transferSales)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">합계:</span>
                    <span className="ml-1 font-bold text-xl text-primary" data-testid="text-total-sales">{formatKoreanCurrency(salesSummary.totalSales)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expense Summary */}
        <Card>
          <CardHeader>
            <CardTitle>지출합계</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="pl-4 space-y-1 bg-destructive/10 p-4 rounded">
              <p className="text-base font-bold">
                {rentalBreakdown && Object.keys(rentalBreakdown.breakdown).length > 0
                  ? `${String.fromCharCode(9311 + 5 + Object.keys(rentalBreakdown.breakdown).length * 2)} 지출총액`
                  : "⑤ 지출총액"
                }
              </p>
              <div className="grid grid-cols-4 gap-2 text-base pl-2">
                <div>
                  <span className="text-muted-foreground">현금:</span>
                  <span className="ml-1 font-bold text-destructive" data-testid="text-cash-expenses">{formatKoreanCurrency(expenseSummary.cashExpenses)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">카드:</span>
                  <span className="ml-1 font-bold text-destructive" data-testid="text-card-expenses">{formatKoreanCurrency(expenseSummary.cardExpenses)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">이체:</span>
                  <span className="ml-1 font-bold text-destructive" data-testid="text-transfer-expenses">{formatKoreanCurrency(expenseSummary.transferExpenses)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">합계:</span>
                  <span className="ml-1 font-bold text-xl text-destructive" data-testid="text-total-expenses">{formatKoreanCurrency(expenseSummary.totalExpenses)}</span>
                </div>
              </div>
            </div>
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
                    type="number"
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
                    type="number"
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
