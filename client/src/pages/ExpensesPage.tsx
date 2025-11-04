import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { ArrowLeft, Plus, Pencil, Trash2, Calendar, Clock, DollarSign } from 'lucide-react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  createExpense,
  getExpensesByBusinessDay,
  getExpenseSummaryByBusinessDay,
  updateExpense,
  deleteExpense,
  getSettings,
} from '@/lib/localDb';
import { getBusinessDay, formatKoreanCurrency } from '@shared/businessDay';

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

interface Expense {
  id: string;
  date: string;
  time: string;
  category: string;
  amount: number;
  quantity: number;
  paymentMethod: 'card' | 'cash' | 'transfer';
  businessDay: string;
  notes: string | null;
  createdAt: string;
}

export default function ExpensesPage() {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState({ cashTotal: 0, cardTotal: 0, transferTotal: 0, total: 0 });
  const [businessDay, setBusinessDay] = useState('');

  // Form state
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'transfer'>('cash');
  const [notes, setNotes] = useState('');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCustomCategory, setEditCustomCategory] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<'card' | 'cash' | 'transfer'>('cash');
  const [editNotes, setEditNotes] = useState('');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  useEffect(() => {
    const settings = getSettings();
    const currentBusinessDay = getBusinessDay(new Date(), settings.businessDayStartHour);
    setBusinessDay(currentBusinessDay);

    const now = new Date();
    const kstNow = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    setDate(kstNow.split(' ')[0]);
    setTime(kstNow.split(' ')[1].substring(0, 5));

    loadExpenses(currentBusinessDay);
  }, []);

  const loadExpenses = (businessDay: string) => {
    const expenseList = getExpensesByBusinessDay(businessDay);
    setExpenses(expenseList);

    const expenseSummary = getExpenseSummaryByBusinessDay(businessDay);
    setSummary({
      cashTotal: Number(expenseSummary.cashTotal),
      cardTotal: Number(expenseSummary.cardTotal),
      transferTotal: Number(expenseSummary.transferTotal),
      total: Number(expenseSummary.total),
    });
  };

  const handleAddExpense = () => {
    const finalCategory = category === 'custom' ? customCategory : category;

    if (!finalCategory.trim()) {
      toast({
        title: '카테고리 입력 필요',
        description: '지출 카테고리를 선택하거나 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: '금액 입력 오류',
        description: '올바른 금액을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const quantityNum = parseInt(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      toast({
        title: '수량 입력 오류',
        description: '올바른 수량을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    createExpense({
      date,
      time,
      category: finalCategory,
      amount: amountNum,
      quantity: quantityNum,
      paymentMethod,
      businessDay,
      notes: notes.trim() || undefined,
    });

    toast({
      title: '지출 등록 완료',
      description: `${finalCategory} 지출이 등록되었습니다.`,
    });

    // Reset form
    setCategory('');
    setCustomCategory('');
    setAmount('');
    setQuantity('1');
    setNotes('');

    loadExpenses(businessDay);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setEditDate(expense.date);
    setEditTime(expense.time);
    
    // Check if category is one of predefined categories
    if (EXPENSE_CATEGORIES.includes(expense.category)) {
      setEditCategory(expense.category);
      setEditCustomCategory('');
    } else {
      setEditCategory('custom');
      setEditCustomCategory(expense.category);
    }
    
    setEditAmount(expense.amount.toString());
    setEditQuantity(expense.quantity.toString());
    setEditPaymentMethod(expense.paymentMethod);
    setEditNotes(expense.notes || '');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingExpense) return;

    const finalCategory = editCategory === 'custom' ? editCustomCategory : editCategory;

    if (!finalCategory.trim()) {
      toast({
        title: '카테고리 입력 필요',
        description: '지출 카테고리를 선택하거나 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const amountNum = parseInt(editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: '금액 입력 오류',
        description: '올바른 금액을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const quantityNum = parseInt(editQuantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      toast({
        title: '수량 입력 오류',
        description: '올바른 수량을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    updateExpense(editingExpense.id, {
      date: editDate,
      time: editTime,
      category: finalCategory,
      amount: amountNum,
      quantity: quantityNum,
      paymentMethod: editPaymentMethod,
      notes: editNotes.trim() || undefined,
    });

    toast({
      title: '지출 수정 완료',
      description: '지출 정보가 수정되었습니다.',
    });

    setEditDialogOpen(false);
    setEditingExpense(null);
    loadExpenses(businessDay);
  };

  const handleDeleteExpense = (expense: Expense) => {
    setDeletingExpense(expense);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!deletingExpense) return;

    deleteExpense(deletingExpense.id);

    toast({
      title: '지출 삭제 완료',
      description: '지출이 삭제되었습니다.',
    });

    setDeleteDialogOpen(false);
    setDeletingExpense(null);
    loadExpenses(businessDay);
  };

  const getPaymentMethodLabel = (method: string) => {
    return PAYMENT_METHODS.find(m => m.value === method)?.label || method;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">지출관리</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">현금 지출</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-cash-total">
                {formatKoreanCurrency(summary.cashTotal)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">카드 지출</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-card-total">
                {formatKoreanCurrency(summary.cardTotal)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">계좌이체 지출</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-transfer-total">
                {formatKoreanCurrency(summary.transferTotal)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 지출</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-expenses">
                {formatKoreanCurrency(summary.total)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Expense Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              지출 등록
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">날짜</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  data-testid="input-expense-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">시간</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  data-testid="input-expense-time"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">카테고리</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">직접 입력</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {category === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="customCategory">카테고리 입력</Label>
                  <Input
                    id="customCategory"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="예: 마케팅비"
                    data-testid="input-custom-category"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="amount">금액</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10000"
                  data-testid="input-expense-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">수량</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                  data-testid="input-expense-quantity"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">결제방법</Label>
                <Select value={paymentMethod} onValueChange={(val) => setPaymentMethod(val as any)}>
                  <SelectTrigger data-testid="select-payment-method">
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

              <div className="space-y-2 md:col-span-2 lg:col-span-4">
                <Label htmlFor="notes">메모 (선택)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="추가 정보를 입력하세요"
                  rows={2}
                  data-testid="input-expense-notes"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={handleAddExpense} data-testid="button-add-expense">
                <Plus className="h-4 w-4 mr-2" />
                지출 등록
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Expense List */}
        <Card>
          <CardHeader>
            <CardTitle>오늘의 지출 내역 ({businessDay})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">날짜/시간</th>
                    <th className="text-left p-2">카테고리</th>
                    <th className="text-right p-2">금액</th>
                    <th className="text-center p-2">수량</th>
                    <th className="text-center p-2">결제방법</th>
                    <th className="text-left p-2">메모</th>
                    <th className="text-center p-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center p-8 text-muted-foreground">
                        등록된 지출이 없습니다
                      </td>
                    </tr>
                  ) : (
                    expenses.map((expense) => (
                      <tr key={expense.id} className="border-b hover-elevate" data-testid={`row-expense-${expense.id}`}>
                        <td className="p-2">
                          <div className="flex flex-col">
                            <span className="text-sm">{expense.date}</span>
                            <span className="text-xs text-muted-foreground">{expense.time}</span>
                          </div>
                        </td>
                        <td className="p-2">{expense.category}</td>
                        <td className="p-2 text-right font-semibold">
                          {formatKoreanCurrency(expense.amount)}
                        </td>
                        <td className="p-2 text-center">{expense.quantity}</td>
                        <td className="p-2 text-center">
                          <span className="text-xs px-2 py-1 rounded-full bg-muted">
                            {getPaymentMethodLabel(expense.paymentMethod)}
                          </span>
                        </td>
                        <td className="p-2 text-sm text-muted-foreground">
                          {expense.notes || '-'}
                        </td>
                        <td className="p-2">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditExpense(expense)}
                              data-testid={`button-edit-${expense.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteExpense(expense)}
                              data-testid={`button-delete-${expense.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지출 수정</DialogTitle>
            <DialogDescription>
              지출 정보를 수정하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editDate">날짜</Label>
                <Input
                  id="editDate"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  data-testid="input-edit-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editTime">시간</Label>
                <Input
                  id="editTime"
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  data-testid="input-edit-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="editCategory">카테고리</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger data-testid="select-edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">직접 입력</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editCategory === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="editCustomCategory">카테고리 입력</Label>
                <Input
                  id="editCustomCategory"
                  value={editCustomCategory}
                  onChange={(e) => setEditCustomCategory(e.target.value)}
                  data-testid="input-edit-custom-category"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editAmount">금액</Label>
                <Input
                  id="editAmount"
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  data-testid="input-edit-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editQuantity">수량</Label>
                <Input
                  id="editQuantity"
                  type="number"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  data-testid="input-edit-quantity"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="editPaymentMethod">결제방법</Label>
              <Select value={editPaymentMethod} onValueChange={(val) => setEditPaymentMethod(val as any)}>
                <SelectTrigger data-testid="select-edit-payment-method">
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

            <div className="space-y-2">
              <Label htmlFor="editNotes">메모</Label>
              <Textarea
                id="editNotes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                data-testid="input-edit-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              취소
            </Button>
            <Button onClick={handleSaveEdit} data-testid="button-save-edit">
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지출 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 지출을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} data-testid="button-confirm-delete">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
