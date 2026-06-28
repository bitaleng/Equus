import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { 
  Key, Plus, Trash2, RefreshCw, Shield, ShieldOff, 
  Smartphone, AlertTriangle, ArrowLeft, Copy, Check, Lock, CloudOff
} from "lucide-react";
import { Link } from "wouter";
import { isStaticHosting } from "@/lib/demoMode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface License {
  id: number;
  licenseKey: string;
  customerName: string | null;
  customerContact: string | null;
  status: string;
  deviceId: string | null;
  registeredAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

const ADMIN_KEY_STORAGE = "equus_admin_key";

function getAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

function setAdminKey(key: string) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

async function adminApiRequest(method: string, url: string, data?: unknown) {
  const adminKey = getAdminKey();
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey || "",
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  
  if (response.status === 401) {
    clearAdminKey();
    throw new Error("UNAUTHORIZED");
  }
  
  return response;
}

function AdminAuthGate({ children, onAuthenticated }: { children: React.ReactNode; onAuthenticated: () => void }) {
  const [adminPassword, setAdminPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleVerify = async () => {
    setIsVerifying(true);
    setError("");
    
    try {
      const response = await fetch("/api/admin/licenses", {
        headers: {
          "X-Admin-Key": adminPassword,
        },
      });
      
      if (response.ok) {
        setAdminKey(adminPassword);
        onAuthenticated();
      } else {
        setError("관리자 비밀번호가 올바르지 않습니다.");
      }
    } catch (e) {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-md">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6" />
            라이선스 관리
          </h1>
          <p className="text-muted-foreground text-sm">관리자 인증 필요</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            관리자 인증
          </CardTitle>
          <CardDescription>
            라이선스 관리 페이지에 접근하려면 관리자 비밀번호가 필요합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adminPassword">관리자 비밀번호</Label>
            <Input
              id="adminPassword"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="비밀번호 입력"
              autoComplete="new-password"
              data-testid="input-admin-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            onClick={handleVerify}
            disabled={isVerifying || !adminPassword}
            className="w-full"
            data-testid="button-verify-admin"
          >
            {isVerifying ? "확인 중..." : "확인"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StaticHostingMessage() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/settings">
          <Button variant="ghost" className="mb-4" data-testid="button-back-settings">
            <ArrowLeft className="h-4 w-4 mr-2" />
            설정으로 돌아가기
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CloudOff className="h-8 w-8 text-muted-foreground" />
              <div>
                <CardTitle>라이센스 관리 사용 불가</CardTitle>
                <CardDescription>정적 호스팅에서는 이 기능을 사용할 수 없습니다</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              라이센스 관리 기능은 백엔드 서버가 필요합니다. 
              Netlify, Vercel 등 정적 호스팅에서는 백엔드 API가 작동하지 않습니다.
            </p>
            <p className="text-muted-foreground mt-4">
              이 기능을 사용하려면 백엔드 서버가 포함된 환경(Replit 등)에서 앱을 실행하세요.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminLicenses() {
  // 정적 호스팅(Netlify 등)에서는 백엔드 API가 없으므로 사용 불가
  const isStatic = isStaticHosting();
  
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<License | null>(null);
  const [unregisterTarget, setUnregisterTarget] = useState<License | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    // 정적 호스팅에서는 API 호출 안함
    if (isStatic) return;
    
    const savedKey = getAdminKey();
    if (savedKey) {
      fetch("/api/admin/licenses", {
        headers: { "X-Admin-Key": savedKey },
      }).then((res) => {
        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          clearAdminKey();
        }
      }).catch(() => {
        clearAdminKey();
      });
    }
  }, [isStatic]);

  const { data: licensesData, isLoading, refetch } = useQuery<{ success: boolean; licenses: License[] }>({
    queryKey: ['/api/admin/licenses'],
    queryFn: async () => {
      const res = await adminApiRequest('GET', '/api/admin/licenses');
      return res.json();
    },
    enabled: isAuthenticated && !isStatic,
  });

  const licenses = licensesData?.licenses || [];

  const createMutation = useMutation({
    mutationFn: async (data: { customerName: string; customerContact?: string }) => {
      const response = await adminApiRequest('POST', '/api/admin/licenses', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "라이선스 생성 완료",
        description: `키: ${data.license.licenseKey}`,
      });
      setIsCreateOpen(false);
      setNewCustomerName("");
      setNewCustomerContact("");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/licenses'] });
    },
    onError: (error: Error) => {
      if (error.message === "UNAUTHORIZED") {
        setIsAuthenticated(false);
        return;
      }
      toast({
        title: "생성 실패",
        description: "라이선스 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ licenseKey, status }: { licenseKey: string; status: string }) => {
      const response = await adminApiRequest('PATCH', `/api/admin/licenses/${licenseKey}`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "상태 변경 완료" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/licenses'] });
    },
    onError: (error: Error) => {
      if (error.message === "UNAUTHORIZED") {
        setIsAuthenticated(false);
        return;
      }
      toast({
        title: "변경 실패",
        variant: "destructive",
      });
    }
  });

  const unregisterMutation = useMutation({
    mutationFn: async (licenseKey: string) => {
      const response = await adminApiRequest('POST', `/api/admin/licenses/${licenseKey}/unregister`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "기기 등록 해제 완료" });
      setUnregisterTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/licenses'] });
    },
    onError: (error: Error) => {
      if (error.message === "UNAUTHORIZED") {
        setIsAuthenticated(false);
        return;
      }
      toast({
        title: "해제 실패",
        variant: "destructive",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (licenseKey: string) => {
      await adminApiRequest('DELETE', `/api/admin/licenses/${licenseKey}`);
    },
    onSuccess: () => {
      toast({ title: "라이선스 삭제 완료" });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/licenses'] });
    },
    onError: (error: Error) => {
      if (error.message === "UNAUTHORIZED") {
        setIsAuthenticated(false);
        return;
      }
      toast({
        title: "삭제 실패",
        variant: "destructive",
      });
    }
  });

  const copyToClipboard = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 정적 호스팅에서는 안내 메시지 표시
  if (isStatic) {
    return <StaticHostingMessage />;
  }

  if (!isAuthenticated) {
    return (
      <AdminAuthGate onAuthenticated={() => setIsAuthenticated(true)}>
        {null}
      </AdminAuthGate>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6" />
            라이선스 관리
          </h1>
          <p className="text-muted-foreground text-sm">관리자 전용 페이지</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>등록된 라이선스</CardTitle>
              <CardDescription>총 {licenses.length}개</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => refetch()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                새로고침
              </Button>
              <Button 
                onClick={() => setIsCreateOpen(true)}
                data-testid="button-create-license"
              >
                <Plus className="h-4 w-4 mr-2" />
                새 라이선스
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              로딩 중...
            </div>
          ) : licenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 라이선스가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>라이선스 키</TableHead>
                    <TableHead>고객명</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>기기 등록</TableHead>
                    <TableHead>생성일</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {licenses.map((license) => (
                    <TableRow key={license.id} data-testid={`row-license-${license.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {license.licenseKey}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(license.licenseKey)}
                            data-testid={`button-copy-${license.id}`}
                          >
                            {copiedKey === license.licenseKey ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{license.customerName || <span className="text-muted-foreground">-</span>}</div>
                          {license.customerContact && (
                            <div className="text-xs text-muted-foreground">{license.customerContact}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {license.status === 'active' ? (
                          <Badge variant="default" className="bg-green-500">활성</Badge>
                        ) : license.status === 'suspended' ? (
                          <Badge variant="secondary" className="bg-orange-500 text-white">일시정지</Badge>
                        ) : (
                          <Badge variant="secondary">만료</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {license.deviceId ? (
                          <div className="flex items-center gap-2">
                            <Smartphone className="h-4 w-4 text-green-500" />
                            <span className="text-xs font-mono text-muted-foreground">
                              {license.deviceId.slice(0, 12)}...
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">미등록</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(license.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleMutation.mutate({ 
                              licenseKey: license.licenseKey, 
                              status: license.status === 'active' ? 'suspended' : 'active'
                            })}
                            title={license.status === 'active' ? "일시정지" : "활성화"}
                            data-testid={`button-toggle-${license.id}`}
                          >
                            {license.status === 'active' ? (
                              <ShieldOff className="h-4 w-4 text-orange-500" />
                            ) : (
                              <Shield className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          {license.deviceId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setUnregisterTarget(license)}
                              title="기기 등록 해제"
                              data-testid={`button-unregister-${license.id}`}
                            >
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(license)}
                            title="삭제"
                            data-testid={`button-delete-${license.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 라이선스 생성</DialogTitle>
            <DialogDescription>
              새로운 라이선스 키를 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">고객명 (필수)</Label>
              <Input
                id="customerName"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="예: 에쿠스 휴게텔"
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerContact">연락처 (선택)</Label>
              <Input
                id="customerContact"
                value={newCustomerContact}
                onChange={(e) => setNewCustomerContact(e.target.value)}
                placeholder="예: 010-1234-5678"
                data-testid="input-customer-contact"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsCreateOpen(false)}
              data-testid="button-cancel-create"
            >
              취소
            </Button>
            <Button 
              onClick={() => createMutation.mutate({ 
                customerName: newCustomerName,
                customerContact: newCustomerContact || undefined
              })}
              disabled={createMutation.isPending || !newCustomerName}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? "생성 중..." : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>라이선스 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 라이선스를 삭제하시겠습니까?
              <br />
              <code className="text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                {deleteTarget?.licenseKey}
              </code>
              <br />
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.licenseKey)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unregisterTarget} onOpenChange={() => setUnregisterTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기기 등록 해제</AlertDialogTitle>
            <AlertDialogDescription>
              이 라이선스에 등록된 기기를 강제로 해제하시겠습니까?
              <br />
              <code className="text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                {unregisterTarget?.licenseKey}
              </code>
              <br />
              해제 후 해당 기기에서는 앱을 사용할 수 없게 됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-unregister">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unregisterTarget && unregisterMutation.mutate(unregisterTarget.licenseKey)}
              className="bg-orange-500 text-white hover:bg-orange-600"
              data-testid="button-confirm-unregister"
            >
              등록 해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
