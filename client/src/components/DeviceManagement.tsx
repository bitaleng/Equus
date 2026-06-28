import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useHardwareDevices } from "@/hooks/useLockerSystem";
import { Plus, Trash2, Edit3, Wifi, WifiOff, Server, ChevronDown } from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface DeviceFormData {
  deviceId: string;
  name: string;
  ipAddress: string;
  sharedSecret: string;
}

export default function DeviceManagement() {
  const { toast } = useToast();
  const { devices, isLoading, registerDevice, updateDevice, deleteDevice, isRegistering, isUpdating, isDeleting } = useHardwareDevices();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<number | null>(null);
  
  const [formData, setFormData] = useState<DeviceFormData>({
    deviceId: "",
    name: "",
    ipAddress: "",
    sharedSecret: "",
  });

  const resetForm = () => {
    setFormData({
      deviceId: "",
      name: "",
      ipAddress: "",
      sharedSecret: "",
    });
    setEditingDevice(null);
  };

  const handleOpenDialog = (device?: any) => {
    if (device) {
      setEditingDevice(device);
      setFormData({
        deviceId: device.deviceId,
        name: device.name || "",
        ipAddress: device.ipAddress || "",
        sharedSecret: "",
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingDevice) {
        await updateDevice({
          id: editingDevice.id,
          name: formData.name || undefined,
          ipAddress: formData.ipAddress || undefined,
          sharedSecret: formData.sharedSecret || undefined,
        });
        toast({
          title: "디바이스 수정 완료",
          description: `${formData.name || formData.deviceId} 디바이스가 수정되었습니다.`,
        });
      } else {
        if (!formData.deviceId || !formData.sharedSecret) {
          toast({
            title: "입력 오류",
            description: "디바이스 ID와 공유 비밀키는 필수입니다.",
            variant: "destructive",
          });
          return;
        }
        await registerDevice({
          deviceId: formData.deviceId,
          name: formData.name,
          ipAddress: formData.ipAddress || undefined,
          sharedSecret: formData.sharedSecret,
        });
        toast({
          title: "디바이스 등록 완료",
          description: `${formData.name || formData.deviceId} 디바이스가 등록되었습니다.`,
        });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: "오류 발생",
        description: error.message || "디바이스 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (deviceToDelete === null) return;
    try {
      await deleteDevice(deviceToDelete);
      toast({
        title: "디바이스 삭제 완료",
        description: "디바이스가 삭제되었습니다.",
      });
      setDeleteConfirmOpen(false);
      setDeviceToDelete(null);
    } catch (error: any) {
      toast({
        title: "삭제 오류",
        description: error.message || "디바이스 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const confirmDelete = (deviceId: number) => {
    setDeviceToDelete(deviceId);
    setDeleteConfirmOpen(true);
  };

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="pb-3">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">스마트 락커 하드웨어</CardTitle>
                </div>
                <ChevronDown 
                  className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
                />
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  락커 하드웨어 컨트롤러를 등록하고 관리합니다.
                </p>
                <Button 
                  size="sm" 
                  onClick={() => handleOpenDialog()}
                  data-testid="button-add-device"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  디바이스 추가
                </Button>
              </div>

              {isLoading ? (
                <div className="text-center py-4 text-muted-foreground">
                  로딩 중...
                </div>
              ) : devices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>등록된 하드웨어 디바이스가 없습니다.</p>
                  <p className="text-xs mt-1">위의 버튼을 클릭하여 디바이스를 추가하세요.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {devices.map((device: any) => (
                    <div 
                      key={device.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`device-item-${device.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {device.isOnline ? (
                          <Wifi className="h-5 w-5 text-green-500" />
                        ) : (
                          <WifiOff className="h-5 w-5 text-gray-400" />
                        )}
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {device.name || device.deviceId}
                            <Badge variant={device.isOnline ? "default" : "secondary"} className="text-xs">
                              {device.isOnline ? "온라인" : "오프라인"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ID: {device.deviceId}
                            {device.ipAddress && ` | IP: ${device.ipAddress}`}
                          </div>
                          {device.lastHeartbeat && (
                            <div className="text-xs text-muted-foreground">
                              마지막 연결: {new Date(device.lastHeartbeat).toLocaleString('ko-KR')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenDialog(device)}
                          data-testid={`button-edit-device-${device.id}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => confirmDelete(device.id)}
                          data-testid={`button-delete-device-${device.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-device-form">
          <DialogHeader>
            <DialogTitle>
              {editingDevice ? "디바이스 수정" : "디바이스 등록"}
            </DialogTitle>
            <DialogDescription>
              {editingDevice 
                ? "디바이스 정보를 수정합니다." 
                : "새로운 하드웨어 컨트롤러를 등록합니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="deviceId">디바이스 ID</Label>
              <Input
                id="deviceId"
                value={formData.deviceId}
                onChange={(e) => setFormData(prev => ({ ...prev, deviceId: e.target.value }))}
                placeholder="locker-controller-01"
                disabled={!!editingDevice}
                data-testid="input-device-id"
              />
              <p className="text-xs text-muted-foreground mt-1">
                하드웨어에 설정된 고유 식별자
              </p>
            </div>
            <div>
              <Label htmlFor="deviceName">디바이스 이름</Label>
              <Input
                id="deviceName"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="1층 락커 컨트롤러"
                data-testid="input-device-name"
              />
            </div>
            <div>
              <Label htmlFor="ipAddress">IP 주소 (선택)</Label>
              <Input
                id="ipAddress"
                value={formData.ipAddress}
                onChange={(e) => setFormData(prev => ({ ...prev, ipAddress: e.target.value }))}
                placeholder="192.168.1.100"
                data-testid="input-device-ip"
              />
            </div>
            <div>
              <Label htmlFor="sharedSecret">
                공유 비밀키 {editingDevice && "(변경 시에만 입력)"}
              </Label>
              <Input
                id="sharedSecret"
                type="password"
                value={formData.sharedSecret}
                onChange={(e) => setFormData(prev => ({ ...prev, sharedSecret: e.target.value }))}
                placeholder={editingDevice ? "••••••••" : "비밀키 입력"}
                autoComplete="new-password"
                data-testid="input-device-secret"
              />
              <p className="text-xs text-muted-foreground mt-1">
                HMAC 인증에 사용되는 비밀키
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              data-testid="button-device-cancel"
            >
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isRegistering || isUpdating}
              data-testid="button-device-submit"
            >
              {isRegistering || isUpdating ? "처리 중..." : editingDevice ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent data-testid="dialog-device-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>디바이스 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 디바이스를 삭제하시겠습니까? 연결된 락커 정보도 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-device-delete-cancel">
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-device-delete-confirm"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
