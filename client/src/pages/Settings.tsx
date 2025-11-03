import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Pencil, Trash2, Lock, AlertTriangle, Database } from "lucide-react";
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

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Data reset confirmation dialog
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // Load settings and locker groups on mount
  useEffect(() => {
    const settings = localDb.getSettings();
    setFormData(settings);
    loadLockerGroups();
  }, []);

  const loadLockerGroups = () => {
    setLockerGroups(localDb.getLockerGroups());
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                데이터 관리
              </CardTitle>
              <CardDescription>
                입실 기록과 매출 정보를 관리합니다
              </CardDescription>
            </CardHeader>
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
    </div>
  );
}
