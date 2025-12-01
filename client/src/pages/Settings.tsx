import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Pencil, Trash2, Lock, AlertTriangle, Database, DollarSign, Receipt, Calculator, ChevronDown, Barcode, Edit3, Download, Upload } from "lucide-react";
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
  domesticCheckpointHour: number;
  foreignerAdditionalFeePeriod: number;
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
  billingType: 'rental' | 'simple';  // 'rental' = 대여형(대여비+보증금), 'simple' = 단순판매형(금액만)
  rentalFee: string;
  depositAmount: string;
}

export default function Settings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState<Settings>({
    businessDayStartHour: 10,
    dayPrice: 10000,
    nightPrice: 15000,
    discountAmount: 2000,
    foreignerPrice: 25000,
    domesticCheckpointHour: 1,
    foreignerAdditionalFeePeriod: 24,
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
    billingType: "rental",
    rentalFee: "",
    depositAmount: "",
  });
  
  const [revenueItems, setRevenueItems] = useState<AdditionalRevenueItem[]>([]);

  // Barcode mappings states
  const [barcodeMappings, setBarcodeMappings] = useState<Array<{
    id: string;
    barcode: string;
    lockerNumber: number;
    createdAt: string;
    updatedAt: string;
  }>>([]);
  const [isBarcodeScanMode, setIsBarcodeScanMode] = useState(false);
  const [scanningLockerNumber, setScanningLockerNumber] = useState<number | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [selectedBarcodeLocker, setSelectedBarcodeLocker] = useState<number | null>(null);
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");
  const [manualLockerNumber, setManualLockerNumber] = useState<number | null>(null);

  // RFID mappings states
  const [rfidMappings, setRfidMappings] = useState<Array<{
    id: string;
    rfidUid: string;
    lockerNumber: number;
    createdAt: string;
    updatedAt: string;
  }>>([]);
  const [manualRfidInput, setManualRfidInput] = useState("");
  const [manualRfidLockerNumber, setManualRfidLockerNumber] = useState<number | null>(null);
  const [isNfcScanning, setIsNfcScanning] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const rfidInputRef = useRef<HTMLInputElement>(null);

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

  // Data export/import states
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importFileData, setImportFileData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RFID/Barcode export/import refs
  const rfidFileInputRef = useRef<HTMLInputElement>(null);
  const barcodeFileInputRef = useRef<HTMLInputElement>(null);

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
    loadBarcodeMappings();
    loadRfidMappings();
    
    // Load cash register from localStorage
    const savedCashRegister = localStorage.getItem('cash_register');
    if (savedCashRegister) {
      try {
        setCashRegister(JSON.parse(savedCashRegister));
      } catch (error) {
        console.error('Failed to load cash register data:', error);
      }
    }
    
    // Check NFC support
    if ('NDEFReader' in window) {
      setNfcSupported(true);
    }
  }, []);

  // Auto-focus RFID input when locker number is selected
  useEffect(() => {
    if (manualRfidLockerNumber && rfidInputRef.current) {
      rfidInputRef.current.focus();
      rfidInputRef.current.select();
    }
  }, [manualRfidLockerNumber]);

  const loadLockerGroups = () => {
    setLockerGroups(localDb.getLockerGroups());
  };

  const loadRevenueItems = () => {
    setRevenueItems(localDb.getAdditionalRevenueItems());
  };

  const loadBarcodeMappings = () => {
    setBarcodeMappings(localDb.getAllBarcodeMappings());
  };

  const loadRfidMappings = () => {
    setRfidMappings(localDb.getAllRfidMappings());
  };

  const handleStartBarcodeScan = (lockerNumber: number) => {
    setScanningLockerNumber(lockerNumber);
    setScannedBarcode("");
    setIsBarcodeScanMode(true);
    
    toast({
      title: "스캔 대기 중",
      description: `${lockerNumber}번 락카 키의 바코드를 스캔해주세요 (5초 대기)`,
    });
  };

  const handleBarcodeScanned = (barcode: string) => {
    if (!scanningLockerNumber) return;
    
    const success = localDb.saveBarcodeMapping(barcode, scanningLockerNumber);
    
    if (success) {
      loadBarcodeMappings();
      toast({
        title: "바코드 등록 완료",
        description: `${scanningLockerNumber}번 락카에 바코드가 등록되었습니다.`,
      });
    } else {
      toast({
        title: "바코드 등록 실패",
        description: "바코드 등록 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
    
    setIsBarcodeScanMode(false);
    setScanningLockerNumber(null);
    setScannedBarcode("");
  };


  const handleManualBarcodeRegister = () => {
    if (!manualLockerNumber || manualLockerNumber <= 0 || !manualBarcodeInput.trim()) {
      toast({
        title: "입력 필요",
        description: "락카 번호와 바코드를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const success = localDb.saveBarcodeMapping(manualBarcodeInput.trim(), manualLockerNumber);
    
    if (success) {
      loadBarcodeMappings();
      setManualBarcodeInput("");
      setManualLockerNumber(null);
      toast({
        title: "바코드 등록 완료",
        description: `${manualLockerNumber}번 락카에 바코드가 등록되었습니다.`,
      });
    } else {
      toast({
        title: "바코드 등록 실패",
        description: "이미 등록된 바코드이거나 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBarcodeMapping = (id: string, lockerNumber: number) => {
    if (confirm(`${lockerNumber}번 락카의 바코드 매핑을 삭제하시겠습니까?`)) {
      const success = localDb.deleteBarcodeMappingById(id);
      
      if (success) {
        loadBarcodeMappings();
        toast({
          title: "바코드 삭제 완료",
          description: "바코드 매핑이 삭제되었습니다.",
        });
      } else {
        toast({
          title: "바코드 삭제 실패",
          description: "바코드 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleManualRfidRegister = () => {
    if (!manualRfidLockerNumber || manualRfidLockerNumber <= 0 || !manualRfidInput.trim()) {
      toast({
        title: "입력 필요",
        description: "락카 번호와 RFID UID를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const success = localDb.saveRfidMapping(manualRfidInput.trim(), manualRfidLockerNumber);
    
    if (success) {
      loadRfidMappings();
      setManualRfidInput("");
      setManualRfidLockerNumber(null);
      toast({
        title: "RFID 등록 완료",
        description: `${manualRfidLockerNumber}번 락카에 RFID가 등록되었습니다.`,
      });
    } else {
      toast({
        title: "RFID 등록 실패",
        description: "이미 등록된 RFID이거나 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleNfcScan = async () => {
    if (!manualRfidLockerNumber || manualRfidLockerNumber <= 0) {
      toast({
        title: "락카 번호 선택 필요",
        description: "먼저 락카 번호를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!('NDEFReader' in window)) {
      toast({
        title: "NFC 미지원",
        description: "이 브라우저는 Web NFC API를 지원하지 않습니다. USB RFID 리더기를 사용하세요.",
        variant: "destructive",
      });
      return;
    }

    setIsNfcScanning(true);
    
    try {
      const ndef = new (window as any).NDEFReader();
      
      toast({
        title: "NFC 스캔 준비 중",
        description: `${manualRfidLockerNumber}번 락카키를 스마트폰 후면에 가져다 대세요 (5초 대기)`,
      });

      // Set timeout for scan
      const timeoutId = setTimeout(() => {
        setIsNfcScanning(false);
        toast({
          title: "스캔 시간 초과",
          description: "NFC 스캔이 시간 초과되었습니다. 다시 시도해주세요.",
          variant: "destructive",
        });
      }, 5000);

      await ndef.scan();

      ndef.addEventListener("reading", ({ serialNumber }: any) => {
        clearTimeout(timeoutId);
        setIsNfcScanning(false);
        
        // Convert serial number to UID format
        const uid = serialNumber.toUpperCase().replace(/:/g, "");
        setManualRfidInput(uid);
        
        toast({
          title: "NFC 스캔 완료",
          description: `UID: ${uid}`,
        });
      });

      ndef.addEventListener("readingerror", () => {
        clearTimeout(timeoutId);
        setIsNfcScanning(false);
        toast({
          title: "NFC 읽기 실패",
          description: "NFC 태그를 읽을 수 없습니다. 다시 시도해주세요.",
          variant: "destructive",
        });
      });

    } catch (error: any) {
      setIsNfcScanning(false);
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "NFC 권한 거부",
          description: "NFC 사용 권한이 필요합니다. 브라우저 설정에서 NFC 권한을 허용해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "NFC 스캔 실패",
          description: `오류: ${error.message || '알 수 없는 오류'}`,
          variant: "destructive",
        });
      }
    }
  };

  const handleDeleteRfidMapping = (id: string, lockerNumber: number) => {
    if (confirm(`${lockerNumber}번 락카의 RFID 매핑을 삭제하시겠습니까?`)) {
      const success = localDb.deleteRfidMappingById(id);
      
      if (success) {
        loadRfidMappings();
        toast({
          title: "RFID 삭제 완료",
          description: "RFID 매핑이 삭제되었습니다.",
        });
      } else {
        toast({
          title: "RFID 삭제 실패",
          description: "RFID 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  // RFID export/import handlers
  const handleExportRfidMappings = () => {
    try {
      const result = localDb.exportRfidMappings();
      if (!result.success || !result.data) {
        throw new Error(result.error || 'RFID 내보내기 실패');
      }
      
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      link.href = url;
      link.download = `rfid-mappings-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "RFID 내보내기 완료",
        description: `${rfidMappings.length}개의 RFID 매핑이 저장되었습니다.`,
      });
    } catch (error) {
      toast({
        title: "내보내기 실패",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleImportRfidMappings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = localDb.importRfidMappings(content);
      
      if (result.success) {
        loadRfidMappings();
        toast({
          title: "RFID 가져오기 완료",
          description: result.message,
        });
      } else {
        toast({
          title: "가져오기 실패",
          description: result.error,
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Barcode export/import handlers
  const handleExportBarcodeMappings = () => {
    try {
      const result = localDb.exportBarcodeMappings();
      if (!result.success || !result.data) {
        throw new Error(result.error || '바코드 내보내기 실패');
      }
      
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      link.href = url;
      link.download = `barcode-mappings-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "바코드 내보내기 완료",
        description: `${barcodeMappings.length}개의 바코드 매핑이 저장되었습니다.`,
      });
    } catch (error) {
      toast({
        title: "내보내기 실패",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleImportBarcodeMappings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = localDb.importBarcodeMappings(content);
      
      if (result.success) {
        loadBarcodeMappings();
        toast({
          title: "바코드 가져오기 완료",
          description: result.message,
        });
      } else {
        toast({
          title: "가져오기 실패",
          description: result.error,
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Barcode scan listener
  useEffect(() => {
    if (!isBarcodeScanMode) return;
    
    let barcodeBuffer = '';
    let lastKeyTime = 0;
    let scanTimeout: NodeJS.Timeout | null = null;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      const now = Date.now();
      
      // Reset buffer if more than 100ms has passed
      if (now - lastKeyTime > 100) {
        barcodeBuffer = '';
      }
      
      // Enter key = scan complete
      if (e.key === 'Enter' && barcodeBuffer.length > 0) {
        handleBarcodeScanned(barcodeBuffer);
        e.preventDefault();
        return;
      }
      
      // Add character to buffer
      if (e.key.length === 1) {
        barcodeBuffer += e.key;
        lastKeyTime = now;
        setScannedBarcode(barcodeBuffer);
      }
    };
    
    // Auto-cancel after 5 seconds
    scanTimeout = setTimeout(() => {
      if (isBarcodeScanMode) {
        setIsBarcodeScanMode(false);
        setScanningLockerNumber(null);
        setScannedBarcode("");
        toast({
          title: "스캔 취소",
          description: "시간이 초과되어 스캔이 취소되었습니다.",
          variant: "destructive",
        });
      }
    }, 5000);
    
    document.addEventListener('keypress', handleKeyPress);
    
    return () => {
      document.removeEventListener('keypress', handleKeyPress);
      if (scanTimeout) clearTimeout(scanTimeout);
    };
  }, [isBarcodeScanMode, scanningLockerNumber]);

  const handleSave = () => {
    // Validate and clamp settings before saving
    const validatedData = {
      ...formData,
      domesticCheckpointHour: Math.max(0, Math.min(23, formData.domesticCheckpointHour)),
      foreignerAdditionalFeePeriod: Math.max(1, formData.foreignerAdditionalFeePeriod),
    };
    
    localDb.updateSettings(validatedData);
    setFormData(validatedData); // Update form with validated values
    
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

  const handleCreateTestData = async () => {
    try {
      // Wait for test data to be created and saved
      await localDb.createAdditionalFeeTestData();
      
      toast({
        title: "테스트 데이터 생성 완료",
        description: "다양한 상태의 락커 데이터가 생성되었습니다. 홈 페이지로 이동합니다.",
      });
      
      // Navigate to home instead of reloading (preserves business day context)
      setTimeout(() => {
        setLocation("/");
      }, 500);
    } catch (error) {
      console.error('Test data creation error:', error);
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

  const handleRecalculateBusinessDays = () => {
    try {
      const updatedCount = localDb.recalculateAllBusinessDays();
      toast({
        title: "영업일 재계산 완료",
        description: `${updatedCount}개의 기록이 재계산되었습니다. 정산 페이지에서 확인하세요.`,
      });
    } catch (error) {
      toast({
        title: "재계산 실패",
        description: "영업일 재계산 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  // Export database to JSON file
  const handleExportData = () => {
    setIsExporting(true);
    try {
      const result = localDb.exportDatabase();
      
      if (!result.success || !result.data) {
        throw new Error(result.error || '데이터 내보내기 실패');
      }
      
      // Create download link
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      link.href = url;
      link.download = `equus-backup-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "데이터 내보내기 완료",
        description: "모든 데이터가 파일로 저장되었습니다. 다른 태블릿으로 전송하여 사용할 수 있습니다.",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "내보내기 실패",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection for import
  const handleImportFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportFileData(content);
      setImportConfirmOpen(true);
    };
    reader.onerror = () => {
      toast({
        title: "파일 읽기 실패",
        description: "파일을 읽는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    };
    reader.readAsText(file);
    
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Confirm and execute import
  const handleConfirmImport = () => {
    if (!importFileData) return;
    
    setIsImporting(true);
    try {
      const result = localDb.importDatabase(importFileData);
      
      if (!result.success) {
        throw new Error(result.error || '데이터 가져오기 실패');
      }
      
      toast({
        title: "데이터 복원 완료",
        description: result.message || "데이터를 성공적으로 복원했습니다.",
      });
      
      setImportConfirmOpen(false);
      setImportFileData(null);
      
      // Reload page to reflect imported data
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "가져오기 실패",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
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
    setRevenueItemFormData({ name: "", billingType: "rental", rentalFee: "", depositAmount: "" });
    setIsRevenueItemDialogOpen(true);
  };

  const handleEditRevenueItem = (item: AdditionalRevenueItem) => {
    setEditingRevenueItem(item);
    // Determine billingType based on existing data
    const hasBothFees = (item.rentalFee || 0) > 0 || (item.depositAmount || 0) > 0;
    const billingType = hasBothFees && (item.depositAmount || 0) > 0 ? "rental" : "simple";
    setRevenueItemFormData({
      name: item.name,
      billingType: billingType,
      rentalFee: String(item.rentalFee || 0),
      depositAmount: String(item.depositAmount || 0),
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
      // 단순판매형인 경우 rentalFee에 금액을 저장하고 depositAmount는 0
      const data = {
        name: revenueItemFormData.name,
        rentalFee: parseInt(revenueItemFormData.rentalFee) || 0,
        depositAmount: revenueItemFormData.billingType === 'simple' ? 0 : (parseInt(revenueItemFormData.depositAmount) || 0),
      };
      
      if (editingRevenueItem) {
        localDb.updateAdditionalRevenueItem(editingRevenueItem.id, data);
        toast({
          title: "항목 수정 완료",
          description: "추가매출 항목이 수정되었습니다.",
        });
      } else {
        localDb.createAdditionalRevenueItem(data);
        toast({
          title: "항목 생성 완료",
          description: "새 추가매출 항목이 생성되었습니다.",
        });
      }
      loadRevenueItems();
      setIsRevenueItemDialogOpen(false);
      setEditingRevenueItem(null);
      setRevenueItemFormData({ name: "", billingType: "rental", rentalFee: "", depositAmount: "" });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: "항목 저장 중 오류가 발생했습니다.",
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

          {/* 추가요금 설정 */}
          <Card>
            <CardHeader>
              <CardTitle>추가요금 설정</CardTitle>
              <CardDescription>
                내국인 및 외국인 추가요금 계산 기준을 설정합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="domesticCheckpointHour">내국인 추가요금 체크포인트 시간 (0-23시)</Label>
                <Input
                  id="domesticCheckpointHour"
                  type="number"
                  min="0"
                  max="23"
                  value={formData.domesticCheckpointHour}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFormData({ ...formData, domesticCheckpointHour: isNaN(val) ? 0 : val });
                  }}
                  data-testid="input-domestic-checkpoint"
                />
                <p className="text-xs text-muted-foreground">
                  예: 1시 = 매일 01:00에 내국인 추가요금 발생 (기본값: 1시)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="foreignerAdditionalFeePeriod">외국인 추가요금 주기 (시간 단위)</Label>
                <Input
                  id="foreignerAdditionalFeePeriod"
                  type="number"
                  min="1"
                  value={formData.foreignerAdditionalFeePeriod}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFormData({ ...formData, foreignerAdditionalFeePeriod: isNaN(val) ? 1 : val });
                  }}
                  data-testid="input-foreigner-period"
                />
                <p className="text-xs text-muted-foreground">
                  예: 24시간 = 입실 시각 기준 24시간마다 추가요금 발생 (기본값: 24시간)
                </p>
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
                  {revenueItems.map((item) => {
                    // 단순판매형: 보증금이 0이고 대여비만 있는 경우
                    const isSimpleType = (item.depositAmount || 0) === 0;
                    return (
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
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              isSimpleType 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {isSimpleType ? '단순판매' : '대여형'}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {isSimpleType ? (
                              <>가격: ₩{item.rentalFee?.toLocaleString() ?? '0'}</>
                            ) : (
                              <>대여비: ₩{item.rentalFee?.toLocaleString() ?? '0'} | 보증금: ₩{item.depositAmount?.toLocaleString() ?? '0'}</>
                            )}
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
                    );
                  })}
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

          {/* 바코드 관리 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Barcode className="h-5 w-5" />
                    바코드 관리
                  </CardTitle>
                  <CardDescription>
                    락카키 바코드를 스캔하여 락카번호와 매핑할 수 있습니다
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportBarcodeMappings}
                    disabled={barcodeMappings.length === 0}
                    data-testid="button-export-barcode"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    내보내기
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => barcodeFileInputRef.current?.click()}
                    data-testid="button-import-barcode"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    가져오기
                  </Button>
                  <input
                    ref={barcodeFileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportBarcodeMappings}
                    className="hidden"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isBarcodeScanMode && (
                <div className="mb-4 p-4 bg-primary/10 border border-primary rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-primary">
                        {scanningLockerNumber}번 락카 바코드 스캔 대기 중...
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        락카키의 바코드를 스캔해주세요 {scannedBarcode && `(${scannedBarcode})`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsBarcodeScanMode(false);
                        setScanningLockerNumber(null);
                        setScannedBarcode("");
                      }}
                      data-testid="button-cancel-scan"
                    >
                      취소
                    </Button>
                  </div>
                </div>
              )}

              {/* 자동 스캔 모드 */}
              <div className="mb-6">
                <h4 className="font-medium mb-3">자동 스캔 등록</h4>
                <Label htmlFor="locker-select">락카 번호 선택</Label>
                <div className="flex gap-2 mt-2">
                  <select
                    id="locker-select"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedBarcodeLocker || ""}
                    onChange={(e) => setSelectedBarcodeLocker(e.target.value ? parseInt(e.target.value) : null)}
                    data-testid="select-locker-number"
                  >
                    <option value="" disabled>락카 번호를 선택하세요</option>
                    {lockerGroups.flatMap(group => 
                      Array.from({ length: group.endNumber - group.startNumber + 1 }, (_, i) => group.startNumber + i)
                    ).map(num => (
                      <option key={num} value={num}>{num}번</option>
                    ))}
                  </select>
                  <Button
                    onClick={() => {
                      if (selectedBarcodeLocker) {
                        handleStartBarcodeScan(selectedBarcodeLocker);
                      } else {
                        toast({
                          title: "락카 번호 선택 필요",
                          description: "락카 번호를 먼저 선택해주세요.",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={isBarcodeScanMode}
                    data-testid="button-start-scan"
                  >
                    <Barcode className="h-4 w-4 mr-2" />
                    스캔 시작
                  </Button>
                </div>
              </div>

              {/* 수동 입력 모드 */}
              <div className="mb-6 p-4 border rounded-lg bg-muted/50">
                <h4 className="font-medium mb-3">수동 입력 등록 (바코드 테스트용)</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="manual-locker-select">락카 번호 선택</Label>
                    <select
                      id="manual-locker-select"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1"
                      value={manualLockerNumber || ""}
                      onChange={(e) => setManualLockerNumber(e.target.value ? parseInt(e.target.value) : null)}
                      data-testid="select-manual-locker-number"
                    >
                      <option value="" disabled>락카 번호를 선택하세요</option>
                      {lockerGroups.flatMap(group => 
                        Array.from({ length: group.endNumber - group.startNumber + 1 }, (_, i) => group.startNumber + i)
                      ).map(num => (
                        <option key={num} value={num}>{num}번</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="manual-barcode-input">바코드 입력</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="manual-barcode-input"
                        type="text"
                        placeholder="바코드를 입력하세요"
                        value={manualBarcodeInput}
                        onChange={(e) => setManualBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleManualBarcodeRegister();
                          }
                        }}
                        data-testid="input-manual-barcode"
                      />
                      <Button
                        onClick={handleManualBarcodeRegister}
                        data-testid="button-manual-register"
                      >
                        등록
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">등록된 바코드 ({barcodeMappings.length}개)</h4>
                {barcodeMappings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    등록된 바코드가 없습니다
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {barcodeMappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`barcode-${mapping.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{mapping.lockerNumber}번</span>
                            <span className="text-sm text-muted-foreground font-mono">
                              {mapping.barcode}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteBarcodeMapping(mapping.id, mapping.lockerNumber)}
                          data-testid={`button-delete-barcode-${mapping.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* RFID 관리 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Barcode className="h-5 w-5" />
                    RFID 관리
                  </CardTitle>
                  <CardDescription>
                    락카키 RFID 태그를 등록하여 락카번호와 매핑할 수 있습니다 (13.56MHz NFC)
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportRfidMappings}
                    disabled={rfidMappings.length === 0}
                    data-testid="button-export-rfid"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    내보내기
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rfidFileInputRef.current?.click()}
                    data-testid="button-import-rfid"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    가져오기
                  </Button>
                  <input
                    ref={rfidFileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportRfidMappings}
                    className="hidden"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 수동 입력 모드 */}
              <div className="mb-6 p-4 border rounded-lg bg-muted/50">
                <h4 className="font-medium mb-3">RFID UID 등록</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  USB RFID 리더기로 스캔한 UID가 자동으로 입력되거나, Web NFC로 스캔하거나, 수동으로 입력할 수 있습니다
                </p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="manual-rfid-locker-select">락카 번호 선택</Label>
                    <select
                      id="manual-rfid-locker-select"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1"
                      value={manualRfidLockerNumber || ""}
                      onChange={(e) => setManualRfidLockerNumber(e.target.value ? parseInt(e.target.value) : null)}
                      data-testid="select-manual-rfid-locker-number"
                    >
                      <option value="" disabled>락카 번호를 선택하세요</option>
                      {lockerGroups.flatMap(group => 
                        Array.from({ length: group.endNumber - group.startNumber + 1 }, (_, i) => group.startNumber + i)
                      ).map(num => (
                        <option key={num} value={num}>{num}번</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="manual-rfid-input">RFID UID 입력</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="manual-rfid-input"
                        ref={rfidInputRef}
                        type="text"
                        placeholder="RFID UID를 입력하세요 (예: 04A1B2C3D4E5F6)"
                        value={manualRfidInput}
                        onChange={(e) => setManualRfidInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleManualRfidRegister();
                          }
                        }}
                        disabled={isNfcScanning}
                        data-testid="input-manual-rfid"
                      />
                      {nfcSupported && (
                        <Button
                          variant="outline"
                          onClick={handleNfcScan}
                          disabled={isNfcScanning || !manualRfidLockerNumber}
                          data-testid="button-nfc-scan"
                        >
                          {isNfcScanning ? "스캔 중..." : "NFC 스캔"}
                        </Button>
                      )}
                      <Button
                        onClick={handleManualRfidRegister}
                        disabled={isNfcScanning}
                        data-testid="button-manual-rfid-register"
                      >
                        등록
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">등록된 RFID ({rfidMappings.length}개)</h4>
                {rfidMappings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    등록된 RFID가 없습니다
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {rfidMappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`rfid-${mapping.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{mapping.lockerNumber}번</span>
                            <span className="text-sm text-muted-foreground font-mono">
                              {mapping.rfidUid}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRfidMapping(mapping.id, mapping.lockerNumber)}
                          data-testid={`button-delete-rfid-${mapping.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
              {/* Data Backup/Restore Section */}
              <div className="p-4 border border-green-500/50 rounded-lg bg-green-500/5">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-green-600 dark:text-green-400 mb-1">데이터 백업 및 복원</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      모든 데이터를 파일로 내보내거나 다른 태블릿에서 백업한 데이터를 가져올 수 있습니다.
                      <br />
                      <span className="text-xs">
                        • 입실 기록, 매출 정보, 시스템 설정, 대여품목, 바코드/RFID 맵핑 등 모든 데이터 포함<br />
                        • 다른 태블릿으로 데이터 이동 시 사용<br />
                        • 카카오톡, 이메일, USB 등으로 백업 파일 전송 가능
                      </span>
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={handleExportData}
                        disabled={isExporting}
                        data-testid="button-export-data"
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {isExporting ? "내보내는 중..." : "데이터 내보내기"}
                      </Button>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        variant="outline"
                        data-testid="button-import-data"
                        className="border-green-600 text-green-600 hover:bg-green-500/10 dark:text-green-400"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {isImporting ? "가져오는 중..." : "데이터 가져오기"}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportFileSelect}
                        className="hidden"
                        data-testid="input-import-file"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border border-primary/50 rounded-lg bg-primary/5">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-primary mb-1">샘플 데이터 생성</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      다양한 시나리오의 테스트 데이터를 자동으로 생성합니다.
                      <br />
                      <span className="text-xs">
                        • 현재 사용 중인 락커 (5-10개, 다양한 상태 포함)<br />
                        • 추가요금 시나리오 (그린/옐로우/블루/레드 색상 테스트)<br />
                        • 추가 사용 중 락커 (5-15개, 오늘 입실 데이터)<br />
                        • 락커 #1-80 랜덤 데이터
                      </span>
                    </p>
                    <Button
                      onClick={handleCreateTestData}
                      data-testid="button-create-test-data"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      샘플 데이터 생성
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border border-blue-500/50 rounded-lg bg-blue-500/5">
                <div className="flex items-start gap-3">
                  <Calculator className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-1">영업일 재계산</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      모든 입실/대여 기록의 영업일을 입실시각 기준으로 재계산합니다.
                      <br />
                      <span className="text-xs">
                        정산 금액이 실제와 맞지 않을 때 사용하세요. 기록은 삭제되지 않으며 영업일만 재계산됩니다.
                      </span>
                    </p>
                    <Button
                      onClick={handleRecalculateBusinessDays}
                      data-testid="button-recalculate-business-days"
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      <Calculator className="h-4 w-4 mr-2" />
                      영업일 재계산 실행
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
              {editingRevenueItem ? "추가매출 항목 수정" : "새 추가매출 항목 추가"}
            </DialogTitle>
            <DialogDescription>
              추가매출 항목의 이름과 청구 유형을 설정하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="revenue-item-name">항목 이름</Label>
              <Input
                id="revenue-item-name"
                value={revenueItemFormData.name}
                onChange={(e) => setRevenueItemFormData({ ...revenueItemFormData, name: e.target.value })}
                placeholder="예: 롱타올, 담요, 음료수"
                data-testid="input-revenue-item-name"
              />
            </div>

            {/* 청구 유형 선택 */}
            <div className="space-y-3">
              <Label>청구 유형</Label>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    revenueItemFormData.billingType === 'rental' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-muted hover:border-primary/50'
                  }`}
                  onClick={() => setRevenueItemFormData({ ...revenueItemFormData, billingType: 'rental' })}
                  data-testid="button-billing-type-rental"
                >
                  <div className="font-medium text-sm">대여형</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    대여비 + 보증금 (담요, 롱타올 등)
                  </div>
                </div>
                <div
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    revenueItemFormData.billingType === 'simple' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-muted hover:border-primary/50'
                  }`}
                  onClick={() => setRevenueItemFormData({ ...revenueItemFormData, billingType: 'simple', depositAmount: '0' })}
                  data-testid="button-billing-type-simple"
                >
                  <div className="font-medium text-sm">단순판매형</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    금액만 (음료수, 과자 등)
                  </div>
                </div>
              </div>
            </div>

            {/* 대여형: 대여비 + 보증금 입력 */}
            {revenueItemFormData.billingType === 'rental' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rental-fee">대여비 (원)</Label>
                  <Input
                    id="rental-fee"
                    type="number"
                    value={revenueItemFormData.rentalFee}
                    onChange={(e) => setRevenueItemFormData({ 
                      ...revenueItemFormData, 
                      rentalFee: e.target.value 
                    })}
                    placeholder="0"
                    data-testid="input-rental-fee"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deposit-amount">보증금 (원)</Label>
                  <Input
                    id="deposit-amount"
                    type="number"
                    value={revenueItemFormData.depositAmount}
                    onChange={(e) => setRevenueItemFormData({ 
                      ...revenueItemFormData, 
                      depositAmount: e.target.value 
                    })}
                    placeholder="0"
                    data-testid="input-deposit-amount"
                  />
                </div>
              </div>
            )}

            {/* 단순판매형: 금액만 입력 */}
            {revenueItemFormData.billingType === 'simple' && (
              <div className="space-y-2">
                <Label htmlFor="simple-price">판매가격 (원)</Label>
                <Input
                  id="simple-price"
                  type="number"
                  value={revenueItemFormData.rentalFee}
                  onChange={(e) => setRevenueItemFormData({ 
                    ...revenueItemFormData, 
                    rentalFee: e.target.value 
                  })}
                  placeholder="0"
                  data-testid="input-simple-price"
                />
              </div>
            )}
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

      {/* Import Confirmation Dialog */}
      <AlertDialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <AlertDialogContent data-testid="dialog-import-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              데이터 가져오기 확인
            </AlertDialogTitle>
            <AlertDialogDescription>
              백업 파일의 데이터를 가져오면 <strong className="text-orange-600 dark:text-orange-400">현재 태블릿의 모든 데이터가 삭제되고</strong> 백업 파일의 데이터로 교체됩니다.
              <br />
              <br />
              <strong className="text-destructive">이 작업은 되돌릴 수 없습니다.</strong>
              <br />
              <br />
              계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={isImporting}
              data-testid="button-import-cancel"
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmImport}
              disabled={isImporting}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-import-confirm"
            >
              {isImporting ? "가져오는 중..." : "확인"}
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
