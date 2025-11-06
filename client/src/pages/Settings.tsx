import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Pencil, Trash2, Lock, AlertTriangle, Database, DollarSign, Receipt, Calculator, ChevronDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import PatternLockDialog from "@/components/PatternLockDialog";
import * as localDb from "@/lib/localDb";

interface Settings {
  businessDayStartHour: number;
  dayPrice: number;
  nightPrice: number;
  discountAmount: number;
  foreignerPrice: number;
}

interface LockerGroup {
  id: string;
  name: string;
  startNumber: number;
  endNumber: number;
  sortOrder: number;
}

interface LockerGroupFormData {
  name: string;
  startNumber: number;
  endNumber: number;
  sortOrder: number;
}

interface AdditionalRevenueItem {
  id: string;
  name: string;
  rentalFee: number;
  depositAmount: number;
  sortOrder: number;
  isDefault: number;
}

interface RevenueItemFormData {
  name: string;
  rentalFee: number;
  depositAmount: number;
}

export default function Settings() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Settings>({
    businessDayStartHour: 10,
    dayPrice: 10000,
    nightPrice: 15000,
    discountAmount: 2000,
    foreignerPrice: 25000,
  });

  // Locker group dialog states
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LockerGroup | null>(null);
  const [groupFormData, setGroupFormData] = useState<LockerGroupFormData>({
    name: "",
    startNumber: 1,
    endNumber: 80,
    sortOrder: 0,
  });
  
  const [lockerGroups, setLockerGroups] = useState<LockerGroup[]>([]);

  // Additional revenue items dialog states
  const [isRevenueItemDialogOpen, setIsRevenueItemDialogOpen] = useState(false);
  const [editingRevenueItem, setEditingRevenueItem] = useState<AdditionalRevenueItem | null>(null);
  const [revenueItemFormData, setRevenueItemFormData] = useState<RevenueItemFormData>({
    name: "",
    rentalFee: 1000,
    depositAmount: 5000,
  });
  
  const [revenueItems, setRevenueItems] = useState<AdditionalRevenueItem[]>([]);

  // Expense categories dialog states
  const [isExpenseCategoryDialogOpen, setIsExpenseCategoryDialogOpen] = useState(false);
  const [editingExpenseCategory, setEditingExpenseCategory] = useState<{ id: string; name: string; sortOrder: number } | null>(null);
  const [expenseCategoryFormData, setExpenseCategoryFormData] = useState({ name: "" });
  const [expenseCategories, setExpenseCategories] = useState<{ id: string; name: string; sortOrder: number }[]>([]);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Data reset confirmation dialog
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  
  // Database regeneration confirmation dialog
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);

  // Data management section collapsible states
  const [isDataManagementOpen, setIsDataManagementOpen] = useState(false);
  const [showDataManagementAuth, setShowDataManagementAuth] = useState(false);

  // Cash register (시재금) states
  const [cashRegister, setCashRegister] = useState({
    count50000: 0,
    count10000: 0,
    count5000: 0,
    count1000: 0,
  });

  // Load settings and locker groups on mount
  useEffect(() => {
    const settings = localDb.getSettings();
    setFormData(settings);
    loadLockerGroups();
    loadRevenueItems();
    loadExpenseCategories();
    
    // Load cash register from localStorage
    const savedCashRegister = localStorage.getItem('cash_register');
    if (savedCashRegister) {
      try {
        setCashRegister(JSON.parse(savedCashRegister));
      } catch (error) {
        console.error('Failed to load cash register data:', error);
      }
    }
  }, []);

  const loadLockerGroups = () => {
    setLockerGroups(localDb.getLockerGroups());
  };

  const loadRevenueItems = () => {
    setRevenueItems(localDb.getAdditionalRevenueItems());
  };

  const loadExpenseCategories = () => {
    setExpenseCategories(localDb.getExpenseCategories());
  };

  const handleSave = () => {
    localDb.updateSettings(formData);
    toast({
      title: "설정 저장 완료",
      description: "시스템 설정이 성공적으로 저장되었습니다.",
    });
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setGroupFormData({ name: "", startNumber: 1, endNumber: 80, sortOrder: lockerGroups.length });
    setIsGroupDialogOpen(true);
  };

  const handleEditGroup = (group: LockerGroup) => {
    setEditingGroup(group);
    setGroupFormData({
      name: group.name,
      startNumber: group.startNumber,
      endNumber: group.endNumber,
      sortOrder: group.sortOrder,
    });
    setIsGroupDialogOpen(true);
  };

  const handleDeleteGroup = (id: string) => {
    if (confirm("정말로 이 락커 그룹을 삭제하시겠습니까?")) {
      try {
        localDb.deleteLockerGroup(id);
        loadLockerGroups();
        toast({
          title: "그룹 삭제 완료",
          description: "락커 그룹이 삭제되었습니다.",
        });
      } catch (error) {
        toast({
          title: "그룹 삭제 실패",
          description: "그룹 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSaveGroup = () => {
    try {
      if (editingGroup) {
        localDb.updateLockerGroup(editingGroup.id, groupFormData);
        toast({
          title: "그룹 수정 완료",
          description: "락커 그룹이 수정되었습니다.",
        });
      } else {
        localDb.createLockerGroup(groupFormData);
        toast({
          title: "그룹 생성 완료",
          description: "새 락커 그룹이 생성되었습니다.",
        });
      }
      loadLockerGroups();
      setIsGroupDialogOpen(false);
      setEditingGroup(null);
      setGroupFormData({ name: "", startNumber: 1, endNumber: 80, sortOrder: 0 });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: "그룹 저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleChangePassword = () => {
    const storedPassword = localStorage.getItem("staff_password") || "1234";

    if (currentPassword !== storedPassword) {
      toast({
        title: "비밀번호 변경 실패",
        description: "현재 비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 4) {
      toast({
        title: "비밀번호 변경 실패",
        description: "새 비밀번호는 최소 4자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "비밀번호 변경 실패",
        description: "새 비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    localStorage.setItem("staff_password", newPassword);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    
    toast({
      title: "비밀번호 변경 완료",
      description: "비밀번호가 성공적으로 변경되었습니다.",
    });
  };

  const handleCreateTestData = () => {
    try {
      localDb.createTestData();
      toast({
        title: "테스트 데이터 생성 완료",
        description: "과거 7일치 랜덤 데이터가 락커 #1~80에 생성되었습니다.",
      });
    } catch (error) {
      toast({
        title: "생성 실패",
        description: "테스트 데이터 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleResetData = () => {
    try {
      localDb.clearAllData();
      toast({
        title: "데이터 초기화 완료",
        description: "모든 입실 기록과 매출 정보가 삭제되었습니다.",
      });
      setIsResetDialogOpen(false);
    } catch (error) {
      toast({
        title: "초기화 실패",
        description: "데이터 초기화 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleRegenerateDatabase = () => {
    try {
      const success = localDb.forceRegenerateDatabase();
      if (success) {
        toast({
          title: "데이터베이스 재생성 완료",
          description: "데이터베이스가 성공적으로 재생성되었습니다. 모든 데이터가 삭제되었습니다.",
        });
        setIsRegenerateDialogOpen(false);
        // Reload page to re-initialize database
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        toast({
          title: "재생성 실패",
          description: "데이터베이스 재생성 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "재생성 실패",
        description: "데이터베이스 재생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleSaveCashRegister = () => {
    localStorage.setItem('cash_register', JSON.stringify(cashRegister));
    toast({
      title: "시재금 저장 완료",
      description: "시재금이 성공적으로 저장되었습니다.",
    });
  };

  const calculateCashTotal = () => {
    return (
      cashRegister.count50000 * 50000 +
      cashRegister.count10000 * 10000 +
      cashRegister.count5000 * 5000 +
      cashRegister.count1000 * 1000
    );
  };

  const handleAddRevenueItem = () => {
    setEditingRevenueItem(null);
    setRevenueItemFormData({ name: "", rentalFee: 1000, depositAmount: 5000 });
    setIsRevenueItemDialogOpen(true);
  };

  const handleEditRevenueItem = (item: AdditionalRevenueItem) => {
    setEditingRevenueItem(item);
    setRevenueItemFormData({
      name: item.name,
      rentalFee: item.rentalFee,
      depositAmount: item.depositAmount,
    });
    setIsRevenueItemDialogOpen(true);
  };

  const handleDeleteRevenueItem = (id: string) => {
    if (confirm("정말로 이 대여 항목을 삭제하시겠습니까?")) {
      try {
        localDb.deleteAdditionalRevenueItem(id);
        loadRevenueItems();
        toast({
          title: "항목 삭제 완료",
          description: "대여 항목이 삭제되었습니다.",
        });
      } catch (error) {
        toast({
          title: "항목 삭제 실패",
          description: "항목 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSaveRevenueItem = () => {
    try {
      if (editingRevenueItem) {
        localDb.updateAdditionalRevenueItem(editingRevenueItem.id, revenueItemFormData);
        toast({
          title: "항목 수정 완료",
          description: "대여 항목이 수정되었습니다.",
        });
      } else {
        localDb.createAdditionalRevenueItem(revenueItemFormData);
        toast({
          title: "항목 생성 완료",
          description: "새 대여 항목이 생성되었습니다.",
        });
      }
      loadRevenueItems();
      setIsRevenueItemDialogOpen(false);
      setEditingRevenueItem(null);
      setRevenueItemFormData({ name: "", rentalFee: 1000, depositAmount: 5000 });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: "항목 저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleAddExpenseCategory = () => {
    setEditingExpenseCategory(null);
    setExpenseCategoryFormData({ name: "" });
    setIsExpenseCategoryDialogOpen(true);
  };

  const handleEditExpenseCategory = (category: { id: string; name: string; sortOrder: number }) => {
    setEditingExpenseCategory(category);
    setExpenseCategoryFormData({ name: category.name });
    setIsExpenseCategoryDialogOpen(true);
  };

  const handleDeleteExpenseCategory = (id: string) => {
    if (confirm("정말로 이 지출 카테고리를 삭제하시겠습니까?")) {
      try {
        localDb.deleteExpenseCategory(id);
        loadExpenseCategories();
        toast({
          title: "카테고리 삭제 완료",
          description: "지출 카테고리가 삭제되었습니다.",
        });
      } catch (error) {
        toast({
          title: "카테고리 삭제 실패",
          description: "카테고리 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSaveExpenseCategory = () => {
    try {
      if (!expenseCategoryFormData.name.trim()) {
        toast({
          title: "저장 실패",
          description: "카테고리 이름을 입력하세요.",
          variant: "destructive",
        });
        return;
      }

      if (editingExpenseCategory) {
        localDb.updateExpenseCategory(editingExpenseCategory.id, { name: expenseCategoryFormData.name });
        toast({
          title: "카테고리 수정 완료",
          description: "지출 카테고리가 수정되었습니다.",
        });
      } else {
        localDb.createExpenseCategory({ name: expenseCategoryFormData.name });
        toast({
          title: "카테고리 생성 완료",
          description: "새 지출 카테고리가 생성되었습니다.",
        });
      }
      loadExpenseCategories();
      setIsExpenseCategoryDialogOpen(false);
      setEditingExpenseCategory(null);
      setExpenseCategoryFormData({ name: "" });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: "카테고리 저장 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-6">
        <h1 className="text-2xl font-semibold">시스템 설정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          매출집계 시간과 요금을 설정할 수 있습니다
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* 매출집계 시간 */}
          <Card>
            <CardHeader>
              <CardTitle>매출집계 시간</CardTitle>
              <CardDescription>
                영업일 시작 시간을 설정합니다 (기본: 오전 10시)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="businessDayStartHour">영업일 시작 시간 (0-23)</Label>
                <Input
                  id="businessDayStartHour"
                  type="number"
                  min="0"
                  max="23"
                  value={formData.businessDayStartHour}
                  onChange={(e) => setFormData({ ...formData, businessDayStartHour: parseInt(e.target.value) || 0 })}
                  data-testid="input-business-hour"
                />
                <p className="text-xs text-muted-foreground">
                  예: 10 입력 시 오전 10시부터 다음날 오전 10시까지가 한 영업일입니다
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 기본 요금 설정 */}
          <Card>
            <CardHeader>
              <CardTitle>기본 요금</CardTitle>
              <CardDescription>
                주간 및 야간 기본 입장 요금을 설정합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dayPrice">주간 요금 (7:00 - 19:00)</Label>
                <Input
                  id="dayPrice"
                  type="number"
                  value={formData.dayPrice}
                  onChange={(e) => setFormData({ ...formData, dayPrice: parseInt(e.target.value) || 0 })}
                  data-testid="input-day-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nightPrice">야간 요금 (19:00 - 7:00)</Label>
                <Input
                  id="nightPrice"
                  type="number"
                  value={formData.nightPrice}
                  onChange={(e) => setFormData({ ...formData, nightPrice: parseInt(e.target.value) || 0 })}
                  data-testid="input-night-price"
                />
              </div>
            </CardContent>
          </Card>

          {/* 할인 및 외국인 요금 */}
          <Card>
            <CardHeader>
              <CardTitle>옵션 요금</CardTitle>
              <CardDescription>
                할인 금액 및 외국인 요금을 설정합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="discountAmount">할인 금액</Label>
                <Input
                  id="discountAmount"
                  type="number"
                  value={formData.discountAmount}
                  onChange={(e) => setFormData({ ...formData, discountAmount: parseInt(e.target.value) || 0 })}
                  data-testid="input-discount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="foreignerPrice">외국인 요금</Label>
                <Input
                  id="foreignerPrice"
                  type="number"
                  value={formData.foreignerPrice}
                  onChange={(e) => setFormData({ ...formData, foreignerPrice: parseInt(e.target.value) || 0 })}
                  data-testid="input-foreigner-price"
                />
              </div>
            </CardContent>
          </Card>

          {/* 시재금 관리 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                시재금 관리
              </CardTitle>
              <CardDescription>
                지폐 단위별 매수를 입력하여 시재금을 관리합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="count50000">5만원권</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="count50000"
                      type="number"
                      min="0"
                      value={cashRegister.count50000}
                      onChange={(e) => setCashRegister({ ...cashRegister, count50000: parseInt(e.target.value) || 0 })}
                      placeholder="매수"
                      data-testid="input-count-50000"
                    />
                    <span className="text-sm text-muted-foreground min-w-[100px] text-right">
                      {(cashRegister.count50000 * 50000).toLocaleString()}원
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="count10000">1만원권</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="count10000"
                      type="number"
                      min="0"
                      value={cashRegister.count10000}
                      onChange={(e) => setCashRegister({ ...cashRegister, count10000: parseInt(e.target.value) || 0 })}
                      placeholder="매수"
                      data-testid="input-count-10000"
                    />
                    <span className="text-sm text-muted-foreground min-w-[100px] text-right">
                      {(cashRegister.count10000 * 10000).toLocaleString()}원
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="count5000">5천원권</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="count5000"
                      type="number"
                      min="0"
                      value={cashRegister.count5000}
                      onChange={(e) => setCashRegister({ ...cashRegister, count5000: parseInt(e.target.value) || 0 })}
                      placeholder="매수"
                      data-testid="input-count-5000"
                    />
                    <span className="text-sm text-muted-foreground min-w-[100px] text-right">
                      {(cashRegister.count5000 * 5000).toLocaleString()}원
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="count1000">1천원권</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="count1000"
                      type="number"
                      min="0"
                      value={cashRegister.count1000}
                      onChange={(e) => setCashRegister({ ...cashRegister, count1000: parseInt(e.target.value) || 0 })}
                      placeholder="매수"
                      data-testid="input-count-1000"
                    />
                    <span className="text-sm text-muted-foreground min-w-[100px] text-right">
                      {(cashRegister.count1000 * 1000).toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>시재금 총합</span>
                  <span className="text-primary">{calculateCashTotal().toLocaleString()}원</span>
                </div>
              </div>
              <Button onClick={handleSaveCashRegister} className="w-full" data-testid="button-save-cash-register">
                <Save className="h-4 w-4 mr-2" />
                시재금 저장
              </Button>
            </CardContent>
          </Card>

          {/* 추가매출 항목 관리 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    추가매출 항목 관리
                  </CardTitle>
                  <CardDescription>
                    대여 상품(롱타올, 담요 등)을 추가하거나 수정할 수 있습니다
                  </CardDescription>
                </div>
                <Button onClick={handleAddRevenueItem} size="sm" data-testid="button-add-revenue-item">
                  <Plus className="h-4 w-4 mr-2" />
                  항목 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {revenueItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  등록된 대여 항목이 없습니다
                </p>
              ) : (
                <div className="space-y-3">
                  {revenueItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`revenue-item-${item.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{item.name}</h4>
                          {item.isDefault === 1 && (
                            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                              기본
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          대여비: ₩{item.rentalFee?.toLocaleString() ?? '0'} | 
                          보증금: ₩{item.depositAmount?.toLocaleString() ?? '0'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditRevenueItem(item)}
                          data-testid={`button-edit-revenue-${item.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRevenueItem(item.id)}
                          data-testid={`button-delete-revenue-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 지출 카테고리 관리 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    지출 카테고리 관리
                  </CardTitle>
                  <CardDescription>
                    지출 항목의 카테고리를 추가하거나 삭제할 수 있습니다
                  </CardDescription>
                </div>
                <Button onClick={handleAddExpenseCategory} size="sm" data-testid="button-add-expense-category">
                  <Plus className="h-4 w-4 mr-2" />
                  카테고리 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {expenseCategories.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  등록된 지출 카테고리가 없습니다
                </p>
              ) : (
                <div className="space-y-3">
                  {expenseCategories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`expense-category-${category.id}`}
                    >
                      <div>
                        <h4 className="font-medium">{category.name}</h4>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditExpenseCategory(category)}
                          data-testid={`button-edit-category-${category.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteExpenseCategory(category.id)}
                          data-testid={`button-delete-category-${category.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 락커 그룹 관리 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>락커 그룹 관리</CardTitle>
                  <CardDescription>
                    락커 번호 그룹을 추가하거나 수정할 수 있습니다
                  </CardDescription>
                </div>
                <Button onClick={handleAddGroup} size="sm" data-testid="button-add-group">
                  <Plus className="h-4 w-4 mr-2" />
                  그룹 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lockerGroups.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  등록된 락커 그룹이 없습니다
                </p>
              ) : (
                <div className="space-y-3">
                  {lockerGroups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`group-${group.id}`}
                    >
                      <div>
                        <h4 className="font-medium">{group.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {group.startNumber}번 ~ {group.endNumber}번 ({group.endNumber - group.startNumber + 1}개)
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditGroup(group)}
                          data-testid={`button-edit-${group.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteGroup(group.id)}
                          data-testid={`button-delete-${group.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 비밀번호 변경 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                비밀번호 변경
              </CardTitle>
              <CardDescription>
                시스템 로그인 비밀번호를 변경합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">현재 비밀번호</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력하세요"
                  data-testid="input-current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">새 비밀번호</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호 (최소 4자)"
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호를 다시 입력하세요"
                  data-testid="input-confirm-password"
                />
              </div>
              <Button 
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
                className="w-full"
                data-testid="button-change-password"
              >
                <Lock className="h-4 w-4 mr-2" />
                비밀번호 변경
              </Button>
            </CardContent>
          </Card>

          {/* 데이터 관리 */}
          <Card>
            <Collapsible 
              open={isDataManagementOpen} 
              onOpenChange={(open) => {
                if (open && !isDataManagementOpen) {
                  // Trying to open - require authentication
                  setShowDataManagementAuth(true);
                } else {
                  // Closing - no authentication needed
                  setIsDataManagementOpen(false);
                }
              }}
            >
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer hover-elevate active-elevate-2 rounded-md p-2 -m-2">
                    <div className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          데이터 관리
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        </CardTitle>
                        <CardDescription className="mt-1">
                          입실 기록과 매출 정보를 관리합니다 (보안 잠금)
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronDown 
                      className={`h-5 w-5 text-muted-foreground transition-transform ${isDataManagementOpen ? 'transform rotate-180' : ''}`}
                    />
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
              <div className="p-4 border border-primary/50 rounded-lg bg-primary/5">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-primary mb-1">테스트 데이터 생성</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      과거 7일치 랜덤 테스트 데이터를 생성합니다.
                      <br />
                      <span className="text-xs">
                        • 락커 번호: #1~80<br />
                        • 기간: 현재 기준 과거 7일<br />
                        • 하루당 10~30건 랜덤 생성<br />
                        • 주간/야간 모두 포함 (현재 시간대 고려)<br />
                        • 지불방식: 카드/현금/이체 랜덤<br />
                        • 옵션: 일반/할인/외국인 랜덤
                      </span>
                    </p>
                    <Button
                      onClick={handleCreateTestData}
                      data-testid="button-create-test-data"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      테스트 데이터 생성
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border border-orange-500/50 rounded-lg bg-orange-500/5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-orange-600 dark:text-orange-400 mb-1">데이터베이스 강제 재생성</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      데이터베이스 오류 발생 시 사용하세요. 모든 테이블을 삭제하고 새로 생성합니다.
                      <br />
                      <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                        ⚠️ 경고: 모든 데이터가 영구적으로 삭제됩니다!
                      </span>
                    </p>
                    <Button
                      variant="outline"
                      className="border-orange-500 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
                      onClick={() => setIsRegenerateDialogOpen(true)}
                      data-testid="button-regenerate-database"
                    >
                      <Database className="h-4 w-4 mr-2" />
                      데이터베이스 강제 재생성
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-destructive mb-1">데이터 초기화</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      모든 입실 기록과 매출 정보를 삭제합니다. 시스템 설정과 락커 그룹 설정은 유지됩니다.
                    </p>
                    <Button
                      variant="destructive"
                      onClick={() => setIsResetDialogOpen(true)}
                      data-testid="button-reset-data"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      모든 데이터 초기화
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 참고: 1년 이상 된 데이터는 자동으로 삭제됩니다.
              </p>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} size="lg" data-testid="button-save-settings">
              <Save className="h-4 w-4 mr-2" />
              설정 저장
            </Button>
          </div>
        </div>
      </div>

      {/* Locker Group Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "락커 그룹 수정" : "새 락커 그룹 추가"}
            </DialogTitle>
            <DialogDescription>
              락커 그룹의 이름과 번호 범위를 설정하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">그룹 이름</Label>
              <Input
                id="group-name"
                value={groupFormData.name}
                onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                placeholder="예: 1층 락커"
                data-testid="input-group-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-number">시작 번호</Label>
                <Input
                  id="start-number"
                  type="number"
                  value={groupFormData.startNumber}
                  onChange={(e) => setGroupFormData({ ...groupFormData, startNumber: parseInt(e.target.value) || 1 })}
                  data-testid="input-start-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-number">종료 번호</Label>
                <Input
                  id="end-number"
                  type="number"
                  value={groupFormData.endNumber}
                  onChange={(e) => setGroupFormData({ ...groupFormData, endNumber: parseInt(e.target.value) || 1 })}
                  data-testid="input-end-number"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsGroupDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveGroup} data-testid="button-save-group">
              {editingGroup ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revenue Item Dialog */}
      <Dialog 
        open={isRevenueItemDialogOpen} 
        onOpenChange={(open) => {
          setIsRevenueItemDialogOpen(open);
          if (!open) {
            // Reload items when dialog closes
            loadRevenueItems();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRevenueItem ? "대여 항목 수정" : "새 대여 항목 추가"}
            </DialogTitle>
            <DialogDescription>
              대여 항목의 이름, 대여비, 보증금을 설정하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="revenue-item-name">항목 이름</Label>
              <Input
                id="revenue-item-name"
                value={revenueItemFormData.name}
                onChange={(e) => setRevenueItemFormData({ ...revenueItemFormData, name: e.target.value })}
                placeholder="예: 롱타올, 담요"
                data-testid="input-revenue-item-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rental-fee">대여비 (원)</Label>
                <Input
                  id="rental-fee"
                  type="number"
                  value={revenueItemFormData.rentalFee}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setRevenueItemFormData({ 
                      ...revenueItemFormData, 
                      rentalFee: isNaN(parsed) ? 0 : parsed 
                    });
                  }}
                  data-testid="input-rental-fee"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit-amount">보증금 (원)</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  value={revenueItemFormData.depositAmount}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setRevenueItemFormData({ 
                      ...revenueItemFormData, 
                      depositAmount: isNaN(parsed) ? 0 : parsed 
                    });
                  }}
                  data-testid="input-deposit-amount"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRevenueItemDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveRevenueItem} data-testid="button-save-revenue-item">
              {editingRevenueItem ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Category Dialog */}
      <Dialog 
        open={isExpenseCategoryDialogOpen} 
        onOpenChange={(open) => {
          setIsExpenseCategoryDialogOpen(open);
          if (!open) {
            loadExpenseCategories();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingExpenseCategory ? "카테고리 수정" : "새 지출 카테고리 추가"}
            </DialogTitle>
            <DialogDescription>
              지출 카테고리 이름을 입력하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">카테고리 이름</Label>
              <Input
                id="category-name"
                value={expenseCategoryFormData.name}
                onChange={(e) => setExpenseCategoryFormData({ name: e.target.value })}
                placeholder="예: 수도광열비, 임대료, 소모품"
                data-testid="input-category-name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsExpenseCategoryDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveExpenseCategory} data-testid="button-save-category">
              {editingExpenseCategory ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Database Regeneration Confirmation Dialog */}
      <AlertDialog open={isRegenerateDialogOpen} onOpenChange={setIsRegenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              데이터베이스 강제 재생성 확인
            </AlertDialogTitle>
            <AlertDialogDescription>
              정말로 데이터베이스를 강제로 재생성하시겠습니까?
              <br />
              <br />
              <strong className="text-orange-600 dark:text-orange-400">⚠️ 경고: 모든 데이터가 영구적으로 삭제됩니다!</strong>
              <br />
              <br />
              이 기능은 데이터베이스 오류가 발생했을 때만 사용하세요.
              <br />
              • 모든 입실 기록 삭제
              <br />
              • 모든 매출 정보 삭제
              <br />
              • 모든 락커 그룹 삭제
              <br />
              • 모든 시스템 설정 초기화
              <br />
              <br />
              <strong className="text-destructive">이 작업은 되돌릴 수 없습니다.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerateDatabase}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              data-testid="button-confirm-regenerate"
            >
              재생성
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Data Reset Confirmation Dialog */}
      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              데이터 초기화 확인
            </AlertDialogTitle>
            <AlertDialogDescription>
              정말로 모든 입실 기록과 매출 정보를 삭제하시겠습니까?
              <br />
              <br />
              <strong className="text-destructive">이 작업은 되돌릴 수 없습니다.</strong>
              <br />
              시스템 설정과 락커 그룹 설정은 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetData}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-reset"
            >
              초기화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Data Management Authentication Dialog */}
      <PatternLockDialog
        open={showDataManagementAuth}
        onOpenChange={setShowDataManagementAuth}
        onPatternCorrect={() => {
          setIsDataManagementOpen(true);
          setShowDataManagementAuth(false);
        }}
        title="데이터 관리 잠금 해제"
        description="데이터 관리 기능을 사용하려면 인증이 필요합니다."
        testId="dialog-data-management-auth"
      />
    </div>
  );
}
