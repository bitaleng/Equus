import { useState, useEffect } from 'react';
import { ArrowLeft, Save, CheckCircle, Calculator } from 'lucide-react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
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
} from '@/lib/localDb';
import { getBusinessDay, formatKoreanCurrency } from '@shared/businessDay';
import * as localDb from '@/lib/localDb';

export default function ClosingPage() {
  const { toast } = useToast();
  const [businessDay, setBusinessDay] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Basic information
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [openingFloat, setOpeningFloat] = useState('30000');
  const [targetFloat, setTargetFloat] = useState('30000');

  // Sales summary
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

  // Confirmation dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  useEffect(() => {
    const settings = getSettings();
    const currentBusinessDay = getBusinessDay(new Date(), settings.businessDayStartHour);
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
      setOpeningFloat(String(Number(existingClosing.openingFloat) || 0));
      setTargetFloat(String(Number(existingClosing.targetFloat) || 0));
      setActualCash(existingClosing.actualCash ? String(Number(existingClosing.actualCash)) : '');
      setBankDeposit(existingClosing.bankDeposit ? String(Number(existingClosing.bankDeposit)) : '');
      setNotes(String(existingClosing.notes || ''));
      setIsConfirmed(existingClosing.isConfirmed);
    } else {
      // Initialize with default values
      const now = new Date();
      const timeStr = now.toTimeString().substring(0, 5);
      setEndTime(timeStr);

      // Get previous closing for opening float
      const latestClosing = getLatestClosingDay();
      if (latestClosing && latestClosing.targetFloat) {
        setOpeningFloat(latestClosing.targetFloat.toString());
        setTargetFloat(latestClosing.targetFloat.toString());
      }
    }

    // Load sales summary
    const summary = localDb.getDailySummary(businessDay);
    if (summary) {
      const cashSales = Number(summary.cashSales) || 0;
      const cardSales = Number(summary.cardSales) || 0;
      const transferSales = Number(summary.transferSales) || 0;
      
      setSalesSummary({
        cashSales,
        cardSales,
        transferSales,
        totalSales: Number(summary.totalSales) || 0,
      });
    }

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
    const expected = openingFloatNum + salesSummary.cashSales - expenseSummary.cashExpenses;
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

    toast({
      title: '정산 확정 완료',
      description: '정산이 확정되었습니다. 수정이 불가능합니다.',
    });

    setConfirmDialogOpen(false);
    loadClosingData(businessDay);
  };

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
            <div>
              <h1 className="text-3xl font-bold">정산하기</h1>
              <p className="text-sm text-muted-foreground mt-1">
                영업일: {businessDay}
                {isConfirmed && <span className="ml-2 text-green-600 font-semibold">✓ 확정완료</span>}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isConfirmed} data-testid="button-save-closing">
              <Save className="h-4 w-4 mr-2" />
              저장
            </Button>
            <Button onClick={handleConfirm} disabled={isConfirmed} data-testid="button-confirm-closing">
              <CheckCircle className="h-4 w-4 mr-2" />
              확정
            </Button>
          </div>
        </div>

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
                  placeholder="30000"
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
                  placeholder="30000"
                  data-testid="input-target-float"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Summary */}
        <Card>
          <CardHeader>
            <CardTitle>매출 집계</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">현금 매출</p>
                <p className="text-xl font-semibold" data-testid="text-cash-sales">
                  {formatKoreanCurrency(salesSummary.cashSales)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">카드 매출</p>
                <p className="text-xl font-semibold" data-testid="text-card-sales">
                  {formatKoreanCurrency(salesSummary.cardSales)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">계좌이체 매출</p>
                <p className="text-xl font-semibold" data-testid="text-transfer-sales">
                  {formatKoreanCurrency(salesSummary.transferSales)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 매출</p>
                <p className="text-2xl font-bold text-primary" data-testid="text-total-sales">
                  {formatKoreanCurrency(salesSummary.totalSales)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expense Summary */}
        <Card>
          <CardHeader>
            <CardTitle>지출 집계</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">현금 지출</p>
                <p className="text-xl font-semibold text-destructive" data-testid="text-cash-expenses">
                  {formatKoreanCurrency(expenseSummary.cashExpenses)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">카드 지출</p>
                <p className="text-xl font-semibold text-destructive" data-testid="text-card-expenses">
                  {formatKoreanCurrency(expenseSummary.cardExpenses)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">계좌이체 지출</p>
                <p className="text-xl font-semibold text-destructive" data-testid="text-transfer-expenses">
                  {formatKoreanCurrency(expenseSummary.transferExpenses)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 지출</p>
                <p className="text-2xl font-bold text-destructive" data-testid="text-total-expenses">
                  {formatKoreanCurrency(expenseSummary.totalExpenses)}
                </p>
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

            <div className="mt-6 space-y-2">
              <Label htmlFor="notes">메모</Label>
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
