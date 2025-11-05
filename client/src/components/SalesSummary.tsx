import { useState } from "react";
import { formatInTimeZone } from 'date-fns-tz';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Receipt, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createExpense, getSettings } from "@/lib/localDb";
import { getBusinessDay } from "@shared/businessDay";

const EXPENSE_CATEGORIES = [
  '인건비',
  '공과금',
  '식자재',
  '소모품',
  '수리비',
  '통신비',
  '기타',
];

const PAYMENT_METHODS = [
  { value: 'cash', label: '현금' },
  { value: 'card', label: '카드' },
  { value: 'transfer', label: '계좌이체' },
] as const;

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
  onExpenseAdded?: () => void;
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
  onExpenseAdded,
}: SalesSummaryProps) {
  const { toast } = useToast();
  const entrySales = totalSales + additionalFeeSales;
  const grandTotal = entrySales + rentalRevenue;
  const netProfit = grandTotal - totalExpenses;
  
  const [isSalesOpen, setIsSalesOpen] = useState(true);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'transfer'>('cash');

  const handleAddExpense = () => {
    if (!category) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "카테고리를 선택해주세요.",
      });
      return;
    }

    if (!amount || Number(amount) <= 0) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "금액을 입력해주세요.",
      });
      return;
    }

    const finalCategory = category === '기타' && customCategory ? customCategory : category;
    const now = new Date();
    const kstNow = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const expenseDate = kstNow.split(' ')[0];
    const expenseTime = kstNow.split(' ')[1].substring(0, 5);
    
    const settings = getSettings();
    const businessDay = getBusinessDay(now, settings.businessDayStartHour);

    createExpense({
      date: expenseDate,
      time: expenseTime,
      category: finalCategory,
      amount: Number(amount),
      quantity: Number(quantity),
      paymentMethod,
      businessDay,
      notes: undefined,
    });

    toast({
      title: "지출 등록 완료",
      description: `${finalCategory} ${Number(amount).toLocaleString()}원이 등록되었습니다.`,
    });

    setCategory('');
    setCustomCategory('');
    setAmount('');
    setQuantity('1');
    setPaymentMethod('cash');
    setExpenseDialogOpen(false);
    
    if (onExpenseAdded) {
      onExpenseAdded();
    }
  };

  return (
    <div className="space-y-4">
      <Collapsible open={isSalesOpen} onOpenChange={setIsSalesOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-2 hover-elevate px-2 py-1 rounded-md cursor-pointer" data-testid="button-toggle-sales">
            <h2 className="text-lg font-semibold">매출 집계</h2>
            {isSalesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </CollapsibleTrigger>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpenseDialogOpen(true)}
            data-testid="button-quick-add-expense"
          >
            <Receipt className="h-4 w-4 mr-2" />
            지출입력
          </Button>
        </div>
        
        <CollapsibleContent>
          <Card className="mt-4">
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
        </CollapsibleContent>
      </Collapsible>

      {/* Quick Expense Input Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              빠른 지출 입력
            </DialogTitle>
            <DialogDescription>
              현재 영업일의 지출을 빠르게 등록합니다.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quick-category">카테고리</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="quick-category" data-testid="select-quick-category">
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {category === '기타' && (
              <div className="space-y-2">
                <Label htmlFor="quick-custom-category">직접 입력</Label>
                <Input
                  id="quick-custom-category"
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="카테고리명 입력"
                  data-testid="input-quick-custom-category"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="quick-amount">금액 (원)</Label>
              <Input
                id="quick-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="금액 입력"
                data-testid="input-quick-amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-quantity">수량</Label>
              <Input
                id="quick-quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                data-testid="input-quick-quantity"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-payment">결제방법</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'card' | 'cash' | 'transfer')}>
                <SelectTrigger id="quick-payment" data-testid="select-quick-payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)} data-testid="button-cancel-quick-expense">
              취소
            </Button>
            <Button onClick={handleAddExpense} data-testid="button-submit-quick-expense">
              <Plus className="h-4 w-4 mr-2" />
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
