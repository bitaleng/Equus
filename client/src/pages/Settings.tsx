import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Pencil, Trash2, Lock, AlertTriangle, Database, DollarSign, Receipt, Calculator, ChevronDown, Barcode, Edit3, Download, Upload, Fingerprint, CheckCircle, XCircle, Shield, ShieldOff, Grid3X3, Smartphone, CreditCard, Key, LogOut, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import PatternLockDialog, { checkBiometricSupport, registerBiometricCredential, authenticateWithBiometric } from "@/components/PatternLockDialog";
import DeviceManagement from "@/components/DeviceManagement";
import { unregisterDevice, useLicenseInfo } from "@/components/LicenseGate";
import { isDemoMode } from "@/lib/demoMode";
import * as localDb from "@/lib/localDb";
import { getLockedRoutes, setLockedRoutes, MENU_ITEMS } from "@/lib/menuLock";
import { validateLicenseKey } from "@/lib/licenseValidation";

interface Settings {
  businessDayStartHour: number;
  dayPrice: number;
  nightPrice: number;
  discountAmount: number;
  foreignerPrice: number;
  domesticCheckpointHour: number;
  foreignerAdditionalFeePeriod: number;
  domesticAdditionalFeeMode: 'nextday' | 'nightstart';
  dayStartTime: string;     // 주간 시작 시간 (HH:mm)
  nightStartTime: string;   // 야간 시작 시간 (HH:mm)
  enableDiscountOption: boolean;   // 기본할인 옵션 활성화
  enableForeignerOption: boolean;  // 외국인요금 옵션 활성화
  enableCashReceiptVat: boolean;   // 현금영수증 부가세 옵션
  enableCardVat: boolean;          // 카드결제 부가세 자동추가
  outingTimeLimitMinutes: number;  // 1회 외출 시간 제한 (분, 0=비활성)
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

interface PricingOptionFormData {
  name: string;
  optionType: 'discount' | 'surcharge' | 'fixed';
  amount: string;
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
    domesticAdditionalFeeMode: 'nextday' as 'nextday' | 'nightstart',
    dayStartTime: '07:00',
    nightStartTime: '19:00',
    enableDiscountOption: true,
    enableForeignerOption: true,
    enableCashReceiptVat: false,
    enableCardVat: false,
    outingTimeLimitMinutes: 0,
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

  // Pricing options states
  const [pricingOptions, setPricingOptions] = useState<localDb.PricingOption[]>([]);
  const [isPricingOptionDialogOpen, setIsPricingOptionDialogOpen] = useState(false);
  const [editingPricingOption, setEditingPricingOption] = useState<localDb.PricingOption | null>(null);
  const [pricingOptionFormData, setPricingOptionFormData] = useState<PricingOptionFormData>({
    name: "",
    optionType: "discount",
    amount: "",
  });

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

  // Biometric authentication states
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isBiometricTesting, setIsBiometricTesting] = useState(false);

  // Security section states
  const [isSecuritySectionOpen, setIsSecuritySectionOpen] = useState(false);
  const [securityEnabled, setSecurityEnabled] = useState(() => {
    return localStorage.getItem("security_enabled") !== "false";
  });
  const [securityTodayStatusEnabled, setSecurityTodayStatusEnabled] = useState(() => {
    return localStorage.getItem("security_today_status_enabled") !== "false";
  });
  const [authMethodMode, setAuthMethodMode] = useState<'pattern' | 'password' | 'both'>(() => {
    return (localStorage.getItem("auth_method_mode") as 'pattern' | 'password' | 'both') || 'both';
  });
  const [lockedMenuRoutes, setLockedMenuRoutesState] = useState<string[]>(() => getLockedRoutes());
  // 비밀번호 초기화 라이센스 확인 다이얼로그
  const [showPasswordResetDialog, setShowPasswordResetDialog] = useState(false);
  const [passwordResetLicenseInput, setPasswordResetLicenseInput] = useState("");
  const [passwordResetLicenseError, setPasswordResetLicenseError] = useState("");
  
  // Screen wake lock states
  const [isScreenSectionOpen, setIsScreenSectionOpen] = useState(false);
  const [screenWakeLock, setScreenWakeLock] = useState(() => {
    const settings = localDb.getSettings();
    return settings.screenWakeLock !== false;
  });

  // Card payment app states
  const [isCardPaymentSectionOpen, setIsCardPaymentSectionOpen] = useState(false);
  const [cardPaymentAppEnabled, setCardPaymentAppEnabled] = useState(() => {
    const settings = localDb.getSettings();
    return settings.cardPaymentAppEnabled === true;
  });
  const [cardPaymentAppPackage, setCardPaymentAppPackage] = useState(() => {
    const settings = localDb.getSettings();
    return settings.cardPaymentAppPackage || 'com.tossplace.app.release';
  });
  
  // Pattern change states
  const [isPatternChangeMode, setIsPatternChangeMode] = useState(false);
  const [patternChangeStep, setPatternChangeStep] = useState<'verify' | 'new' | 'confirm'>('verify');
  const [newPattern, setNewPattern] = useState<number[]>([]);
  const [showPatternChangeDialog, setShowPatternChangeDialog] = useState(false);

  // Data reset confirmation dialog
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  
  // Database regeneration confirmation dialog
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);

  // Data management section collapsible states
  const [isDataManagementOpen, setIsDataManagementOpen] = useState(false);
  const [showDataManagementAuth, setShowDataManagementAuth] = useState(false);
  
  const [isLicenseSectionOpen, setIsLicenseSectionOpen] = useState(false);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const licenseInfo = useLicenseInfo();

  // Data export/import states
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importFileData, setImportFileData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RFID/Barcode export/import refs
  const rfidFileInputRef = useRef<HTMLInputElement>(null);
  const barcodeFileInputRef = useRef<HTMLInputElement>(null);

  // Load settings and locker groups on mount
  useEffect(() => {
    const settings = localDb.getSettings();
    setFormData(settings);
    loadLockerGroups();
    loadRevenueItems();
    loadPricingOptions();
    loadBarcodeMappings();
    loadRfidMappings();
    
    // Check NFC support
    if ('NDEFReader' in window) {
      setNfcSupported(true);
    }

    // Check biometric support
    const initBiometric = async () => {
      const available = await checkBiometricSupport();
      setBiometricAvailable(available);
      const enabled = localStorage.getItem("webauthn_enabled") === "true";
      setBiometricEnabled(enabled);
    };
    initBiometric();
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

  const loadPricingOptions = () => {
    setPricingOptions(localDb.getPricingOptions());
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
    const storedPassword = localStorage.getItem("staff_password") || "12345678";

    if (currentPassword !== storedPassword) {
      toast({
        title: "비밀번호 변경 실패",
        description: "현재 비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length !== 8) {
      toast({
        title: "비밀번호 변경 실패",
        description: "비밀번호는 정확히 8자리여야 합니다.",
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

  // Handle biometric authentication test/registration
  const handleBiometricTest = async () => {
    setIsBiometricTesting(true);
    try {
      if (biometricEnabled) {
        // Test existing biometric
        const success = await authenticateWithBiometric();
        if (success) {
          toast({
            title: "생체인증 테스트 성공",
            description: "생체인증이 정상적으로 작동합니다.",
          });
        } else {
          toast({
            title: "생체인증 테스트 실패",
            description: "인증에 실패했습니다. 다시 시도하거나 재등록해 주세요.",
            variant: "destructive",
          });
        }
      } else {
        // Register new biometric
        const success = await registerBiometricCredential();
        if (success) {
          setBiometricEnabled(true);
          toast({
            title: "생체인증 등록 완료",
            description: "생체인증이 성공적으로 등록되었습니다. 이제 잠금해제 시 생체인증을 사용할 수 있습니다.",
          });
        } else {
          toast({
            title: "생체인증 등록 실패",
            description: "생체인증 등록에 실패했습니다. 기기가 지원하는지 확인해 주세요.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      toast({
        title: "오류 발생",
        description: "생체인증 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsBiometricTesting(false);
    }
  };

  const handleBiometricReset = () => {
    localStorage.removeItem("webauthn_credential_id");
    localStorage.removeItem("webauthn_enabled");
    setBiometricEnabled(false);
    toast({
      title: "생체인증 초기화",
      description: "생체인증 등록이 해제되었습니다.",
    });
  };

  // Toggle screen wake lock
  const handleScreenWakeLockToggle = (enabled: boolean) => {
    setScreenWakeLock(enabled);
    localDb.updateSettings({ screenWakeLock: enabled });
    toast({
      title: enabled ? "화면 잠금 방지 활성화" : "화면 잠금 방지 비활성화",
      description: enabled 
        ? "앱 사용 중 화면이 자동으로 꺼지지 않습니다." 
        : "기기의 기본 화면 잠금 설정이 적용됩니다.",
    });
  };

  // Toggle today status security on/off
  const handleTodayStatusSecurityToggle = (enabled: boolean) => {
    setSecurityTodayStatusEnabled(enabled);
    localStorage.setItem("security_today_status_enabled", enabled ? "true" : "false");
    toast({
      title: enabled ? "오늘현황 잠금 활성화" : "오늘현황 잠금 해제",
      description: enabled
        ? "오늘현황·매출집계 열람 시 인증이 필요합니다."
        : "오늘현황·매출집계를 인증 없이 바로 열 수 있습니다.",
    });
  };

  // Toggle security on/off
  const handleSecurityToggle = (enabled: boolean) => {
    setSecurityEnabled(enabled);
    localStorage.setItem("security_enabled", enabled ? "true" : "false");
    toast({
      title: enabled ? "보안 기능 활성화" : "보안 기능 비활성화",
      description: enabled 
        ? "매출 정보 접근 시 인증이 필요합니다." 
        : "모든 보안 인증이 해제되었습니다. 누구나 매출 정보에 접근할 수 있습니다.",
      variant: enabled ? "default" : "destructive",
    });
  };

  const handleMenuLockToggle = (url: string, locked: boolean) => {
    const updated = locked
      ? [...lockedMenuRoutes, url]
      : lockedMenuRoutes.filter(r => r !== url);
    setLockedMenuRoutesState(updated);
    setLockedRoutes(updated);
  };

  // 비밀번호 초기화 (라이센스 키 인증 후)
  const handlePasswordResetConfirm = () => {
    setPasswordResetLicenseError("");
    const result = validateLicenseKey(passwordResetLicenseInput.trim());
    if (!result) {
      setPasswordResetLicenseError("유효하지 않은 라이센스 키입니다.");
      return;
    }
    // 만료 여부 무관하게 형식이 유효하면 초기화 허용
    localStorage.removeItem("staff_password");
    setShowPasswordResetDialog(false);
    setPasswordResetLicenseInput("");
    setPasswordResetLicenseError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast({
      title: "비밀번호 초기화",
      description: "비밀번호가 초기화되었습니다. 기본 비밀번호(12345678)가 적용됩니다.",
    });
  };

  // Auth method mode handler
  const handleAuthMethodChange = (mode: 'pattern' | 'password' | 'both') => {
    setAuthMethodMode(mode);
    localStorage.setItem("auth_method_mode", mode);
    toast({
      title: "인증 방식 변경",
      description: mode === 'pattern' ? "패턴으로만 보안 해제합니다." : mode === 'password' ? "비밀번호로만 보안 해제합니다." : "패턴 또는 비밀번호로 보안 해제합니다.",
    });
  };

  // Pattern change handlers
  const handleStartPatternChange = () => {
    setPatternChangeStep('verify');
    setNewPattern([]);
    setShowPatternChangeDialog(true);
    setIsPatternChangeMode(true);
  };

  const handlePatternChangeVerify = (success: boolean) => {
    if (success) {
      setPatternChangeStep('new');
      toast({
        title: "인증 성공",
        description: "새 패턴을 입력해주세요.",
      });
    } else {
      setShowPatternChangeDialog(false);
      setIsPatternChangeMode(false);
      toast({
        title: "인증 실패",
        description: "현재 패턴이 일치하지 않습니다.",
        variant: "destructive",
      });
    }
  };

  const handleNewPatternInput = (pattern: number[]) => {
    if (pattern.length < 4) {
      toast({
        title: "패턴이 너무 짧습니다",
        description: "최소 4개 이상의 점을 연결해주세요.",
        variant: "destructive",
      });
      return;
    }
    setNewPattern(pattern);
    setPatternChangeStep('confirm');
    toast({
      title: "패턴 확인",
      description: "새 패턴을 다시 한번 입력해주세요.",
    });
  };

  const handleConfirmPattern = (pattern: number[]) => {
    if (JSON.stringify(pattern) === JSON.stringify(newPattern)) {
      // Save new pattern
      localStorage.setItem("staff_pattern", JSON.stringify(newPattern));
      setShowPatternChangeDialog(false);
      setIsPatternChangeMode(false);
      setNewPattern([]);
      toast({
        title: "패턴 변경 완료",
        description: "새 패턴이 성공적으로 저장되었습니다.",
      });
    } else {
      toast({
        title: "패턴 불일치",
        description: "패턴이 일치하지 않습니다. 처음부터 다시 시도해주세요.",
        variant: "destructive",
      });
      setPatternChangeStep('new');
      setNewPattern([]);
    }
  };

  const handlePatternReset = () => {
    localStorage.removeItem("staff_pattern");
    toast({
      title: "패턴 초기화",
      description: "패턴이 초기화되었습니다. 기본 패턴(1-2-3-4-5)이 적용됩니다.",
    });
  };

  const handleCreateTestData = async () => {
    try {
      // Wait for test data to be created and saved
      await localDb.createAdditionalFeeTestData();
      
      // 진단: 데이터베이스 상태 확인
      const dbStatus = localDb.debugDatabaseStatus();
      console.log('[Settings] 샘플 데이터 생성 후 DB 상태:', dbStatus);
      
      toast({
        title: "테스트 데이터 생성 완료",
        description: `락커 ${dbStatus.locker_logs?.total || 0}건, 요약 ${dbStatus.daily_summaries?.total || 0}건 생성됨. 콘솔에서 상세 확인 가능.`,
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

  const handleUnregisterDevice = async () => {
    setIsUnregistering(true);
    try {
      const result = await unregisterDevice();
      if (result.success) {
        toast({
          title: "기기 등록 해제 완료",
          description: result.message,
        });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast({
          title: "등록 해제 실패",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "등록 해제 실패",
        description: "서버 연결에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsUnregistering(false);
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
        billingType: revenueItemFormData.billingType,
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

  // Pricing Options Handlers
  const handleOpenPricingOptionDialog = (option?: localDb.PricingOption) => {
    if (option) {
      setEditingPricingOption(option);
      setPricingOptionFormData({
        name: option.name,
        optionType: option.optionType,
        amount: option.amount.toString(),
      });
    } else {
      setEditingPricingOption(null);
      setPricingOptionFormData({ name: "", optionType: "discount", amount: "" });
    }
    setIsPricingOptionDialogOpen(true);
  };

  const handleSavePricingOption = () => {
    try {
      const amount = parseInt(pricingOptionFormData.amount) || 0;
      if (!pricingOptionFormData.name.trim()) {
        toast({ title: "오류", description: "옵션명을 입력해주세요.", variant: "destructive" });
        return;
      }
      if (amount <= 0) {
        toast({ title: "오류", description: "금액을 입력해주세요.", variant: "destructive" });
        return;
      }

      if (editingPricingOption) {
        localDb.updatePricingOption(editingPricingOption.id, {
          name: pricingOptionFormData.name,
          optionType: pricingOptionFormData.optionType,
          amount,
        });
        toast({ title: "수정 완료", description: "요금옵션이 수정되었습니다." });
      } else {
        localDb.createPricingOption({
          name: pricingOptionFormData.name,
          optionType: pricingOptionFormData.optionType,
          amount,
        });
        toast({ title: "추가 완료", description: "새 요금옵션이 추가되었습니다." });
      }
      loadPricingOptions();
      setIsPricingOptionDialogOpen(false);
      setEditingPricingOption(null);
      setPricingOptionFormData({ name: "", optionType: "discount", amount: "" });
    } catch (error) {
      toast({ title: "저장 실패", description: "저장 중 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  const handleDeletePricingOption = (id: string) => {
    try {
      localDb.deletePricingOption(id);
      loadPricingOptions();
      toast({ title: "삭제 완료", description: "요금옵션이 삭제되었습니다." });
    } catch (error) {
      toast({ title: "삭제 실패", description: "삭제 중 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  const getOptionTypeLabel = (type: 'discount' | 'surcharge' | 'fixed') => {
    switch (type) {
      case 'discount': return '할인';
      case 'surcharge': return '할증';
      case 'fixed': return '지정';
      default: return type;
    }
  };

  const getOptionTypeDescription = (type: 'discount' | 'surcharge' | 'fixed', amount: number) => {
    switch (type) {
      case 'discount': return `기본요금 - ${amount.toLocaleString()}원`;
      case 'surcharge': return `기본요금 + ${amount.toLocaleString()}원`;
      case 'fixed': return `${amount.toLocaleString()}원 (고정)`;
      default: return '';
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

          {/* 주간/야간 시간대 설정 */}
          <Card>
            <CardHeader>
              <CardTitle>주간/야간 시간대</CardTitle>
              <CardDescription>
                주간 요금과 야간 요금이 적용되는 시간대를 설정합니다 (분 단위 조정 가능)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dayStartTime">주간 시작 시간</Label>
                  <Input
                    id="dayStartTime"
                    type="time"
                    value={formData.dayStartTime}
                    onChange={(e) => setFormData({ ...formData, dayStartTime: e.target.value })}
                    data-testid="input-day-start-time"
                  />
                  <p className="text-xs text-muted-foreground">
                    이 시간부터 주간 요금 적용
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nightStartTime">야간 시작 시간</Label>
                  <Input
                    id="nightStartTime"
                    type="time"
                    value={formData.nightStartTime}
                    onChange={(e) => setFormData({ ...formData, nightStartTime: e.target.value })}
                    data-testid="input-night-start-time"
                  />
                  <p className="text-xs text-muted-foreground">
                    이 시간부터 야간 요금 적용
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t pt-3">
                현재 설정: 주간 {formData.dayStartTime} ~ {formData.nightStartTime} / 야간 {formData.nightStartTime} ~ 다음날 {formData.dayStartTime}
              </p>
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
                <Label htmlFor="dayPrice">주간 요금 ({formData.dayStartTime} - {formData.nightStartTime})</Label>
                <Input
                  id="dayPrice"
                  type="number"
                  value={formData.dayPrice}
                  onChange={(e) => setFormData({ ...formData, dayPrice: parseInt(e.target.value) || 0 })}
                  data-testid="input-day-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nightPrice">야간 요금 ({formData.nightStartTime} - {formData.dayStartTime})</Label>
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

          {/* 기본 옵션 요금 (레거시 호환) */}
          <Card>
            <CardHeader>
              <CardTitle>기본 옵션</CardTitle>
              <CardDescription>
                기본 할인 및 외국인 요금을 설정합니다. 필요에 따라 각 옵션을 켜거나 끌 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 기본 할인 옵션 */}
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="enableDiscountOption" className="text-sm font-medium">기본 할인 옵션</Label>
                    <p className="text-xs text-muted-foreground">입실 시 기본 할인 옵션을 표시합니다</p>
                  </div>
                  <Switch
                    id="enableDiscountOption"
                    checked={formData.enableDiscountOption}
                    onCheckedChange={(checked) => setFormData({ ...formData, enableDiscountOption: checked })}
                    data-testid="switch-enable-discount"
                  />
                </div>
                {formData.enableDiscountOption && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label htmlFor="discountAmount">할인 금액</Label>
                    <Input
                      id="discountAmount"
                      type="number"
                      value={formData.discountAmount}
                      onChange={(e) => setFormData({ ...formData, discountAmount: parseInt(e.target.value) || 0 })}
                      data-testid="input-discount"
                    />
                    <p className="text-xs text-muted-foreground">기본요금에서 차감되는 할인 금액</p>
                  </div>
                )}
              </div>

              {/* 외국인 요금 옵션 */}
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="enableForeignerOption" className="text-sm font-medium">외국인 요금 옵션</Label>
                    <p className="text-xs text-muted-foreground">입실 시 외국인 요금 체크박스를 표시합니다</p>
                  </div>
                  <Switch
                    id="enableForeignerOption"
                    checked={formData.enableForeignerOption}
                    onCheckedChange={(checked) => {
                      setFormData({ ...formData, enableForeignerOption: checked });
                    }}
                    data-testid="switch-enable-foreigner"
                  />
                </div>
                {formData.enableForeignerOption && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label htmlFor="foreignerPrice">외국인 요금</Label>
                    <Input
                      id="foreignerPrice"
                      type="number"
                      value={formData.foreignerPrice}
                      onChange={(e) => setFormData({ ...formData, foreignerPrice: parseInt(e.target.value) || 0 })}
                      data-testid="input-foreigner-price"
                    />
                    <p className="text-xs text-muted-foreground">외국인 손님에게 적용되는 고정 요금</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 부가세 설정 */}
          <Card>
            <CardHeader>
              <CardTitle>부가세 설정</CardTitle>
              <CardDescription>
                결제 시 부가세(10%) 자동 가산 옵션을 설정합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 현금영수증 부가세 옵션 */}
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="enableCashReceiptVat" className="text-sm font-medium">현금영수증 부가세</Label>
                    <p className="text-xs text-muted-foreground">현금/계좌이체 결제 시 현금영수증 체크박스를 표시하고, 체크하면 10% 부가세가 추가됩니다</p>
                  </div>
                  <Switch
                    id="enableCashReceiptVat"
                    checked={formData.enableCashReceiptVat}
                    onCheckedChange={(checked) => setFormData({ ...formData, enableCashReceiptVat: checked })}
                    data-testid="switch-enable-cash-receipt-vat"
                  />
                </div>
              </div>

              {/* 카드결제 부가세 자동추가 옵션 */}
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="enableCardVat" className="text-sm font-medium">카드결제 부가세 자동추가</Label>
                    <p className="text-xs text-muted-foreground">카드결제 버튼 클릭 시 자동으로 10% 부가세가 추가됩니다</p>
                  </div>
                  <Switch
                    id="enableCardVat"
                    checked={formData.enableCardVat}
                    onCheckedChange={(checked) => setFormData({ ...formData, enableCardVat: checked })}
                    data-testid="switch-enable-card-vat"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 추가 요금옵션 관리 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>추가 요금옵션</span>
                <Button
                  size="sm"
                  onClick={() => handleOpenPricingOptionDialog()}
                  data-testid="button-add-pricing-option"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  옵션 추가
                </Button>
              </CardTitle>
              <CardDescription>
                사용자 정의 할인/할증/지정 요금옵션을 추가합니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pricingOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  등록된 요금옵션이 없습니다. 옵션 추가 버튼을 클릭하여 추가하세요.
                </p>
              ) : (
                <div className="space-y-2">
                  {pricingOptions.map((option) => (
                    <div
                      key={option.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`pricing-option-${option.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{option.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            option.optionType === 'discount' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                            option.optionType === 'surcharge' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                          }`}>
                            {getOptionTypeLabel(option.optionType)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getOptionTypeDescription(option.optionType, option.amount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenPricingOptionDialog(option)}
                          data-testid={`button-edit-pricing-option-${option.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePricingOption(option.id)}
                          data-testid={`button-delete-pricing-option-${option.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
                <strong>할인:</strong> 기본요금에서 금액 차감 | <strong>할증:</strong> 기본요금에 금액 추가 | <strong>지정:</strong> 입력된 금액으로 고정
              </p>
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
              {/* 추가요금 체크포인트 방식 */}
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">야간전환 체크포인트 방식</Label>
                    <p className="text-xs text-muted-foreground">
                      OFF: 다음날 고정 시각(기본값) &nbsp;|&nbsp; ON: 당일/다음날 야간시작시각
                    </p>
                  </div>
                  <Switch
                    checked={formData.domesticAdditionalFeeMode === 'nightstart'}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, domesticAdditionalFeeMode: checked ? 'nightstart' : 'nextday' })
                    }
                    data-testid="switch-additional-fee-mode"
                  />
                </div>
                {formData.domesticAdditionalFeeMode === 'nightstart' ? (
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    주간 입실 → 당일 야간시작({formData.nightStartTime})에 차액(야간-주간) 추가요금<br />
                    야간 입실 → 다음날 야간시작({formData.nightStartTime})에 야간요금 추가
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    주간 입실 → 다음날 {String(formData.domesticCheckpointHour).padStart(2,'0')}:00에 차액 추가요금<br />
                    야간 입실 → 영업일+2일 {String(formData.domesticCheckpointHour).padStart(2,'0')}:00에 야간요금 추가
                  </p>
                )}
              </div>

              {/* 내국인 체크포인트 시각 (nextday 모드에서만 표시) */}
              {formData.domesticAdditionalFeeMode !== 'nightstart' && (
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
              )}
              {formData.enableForeignerOption && (
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
              )}
            </CardContent>
          </Card>

          {/* 외출 시간 제한 */}
          <Card>
            <CardHeader>
              <CardTitle>외출 시간 제한</CardTitle>
              <CardDescription>
                외출 후 미복귀 시 락카버튼을 점멸로 경보합니다 (0 = 비활성)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="outingTimeLimitMinutes">1회 외출 허용 시간</Label>
                <select
                  id="outingTimeLimitMinutes"
                  value={formData.outingTimeLimitMinutes}
                  onChange={(e) => setFormData({ ...formData, outingTimeLimitMinutes: parseInt(e.target.value) })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="select-outing-time-limit"
                >
                  <option value={0}>비활성 (무제한)</option>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
                    <option key={h} value={h * 60}>{h}시간</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  외출 버튼 클릭 후 설정된 시간이 초과되면 해당 락카버튼이 다크그레이↔레드로 점멸됩니다
                </p>
              </div>
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

          {/* 화면 설정 */}
          <Card>
            <Collapsible 
              open={isScreenSectionOpen} 
              onOpenChange={setIsScreenSectionOpen}
            >
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer hover-elevate active-elevate-2 rounded-md p-2 -m-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className={`h-5 w-5 ${screenWakeLock ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          화면 설정
                        </CardTitle>
                        <CardDescription className="mt-1">
                          화면 잠금 방지 설정
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isScreenSectionOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Smartphone className={`h-6 w-6 ${screenWakeLock ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium">화면 잠금 방지</p>
                        <p className="text-sm text-muted-foreground">
                          {screenWakeLock 
                            ? "활성화됨 (화면 켜짐 유지)" 
                            : "비활성화됨"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={screenWakeLock}
                      onCheckedChange={handleScreenWakeLockToggle}
                      data-testid="switch-screen-wakelock"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground px-1">
                    앱 사용 중 화면이 자동으로 꺼지지 않도록 합니다.
                    배터리 소모가 증가할 수 있습니다.
                  </p>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* 카드결제 앱 설정 */}
          <Card>
            <Collapsible 
              open={isCardPaymentSectionOpen} 
              onOpenChange={setIsCardPaymentSectionOpen}
            >
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer hover-elevate active-elevate-2 rounded-md p-2 -m-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className={`h-5 w-5 ${cardPaymentAppEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          카드결제 앱 연동
                        </CardTitle>
                        <CardDescription className="mt-1">
                          카드 버튼 클릭 시 결제 앱 자동 실행
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isCardPaymentSectionOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <CreditCard className={`h-6 w-6 ${cardPaymentAppEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium">카드결제 앱 연동</p>
                        <p className="text-sm text-muted-foreground">
                          {cardPaymentAppEnabled 
                            ? "활성화됨 (카드 버튼 클릭 시 앱 실행)" 
                            : "비활성화됨"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={cardPaymentAppEnabled}
                      onCheckedChange={(checked) => {
                        setCardPaymentAppEnabled(checked);
                        localDb.updateSettings({ cardPaymentAppEnabled: checked });
                        toast({
                          title: checked ? "카드결제 앱 연동 활성화" : "카드결제 앱 연동 비활성화",
                          description: checked 
                            ? "카드 버튼 클릭 시 결제 앱이 자동 실행됩니다." 
                            : "카드 버튼 클릭 시 결제 앱이 실행되지 않습니다.",
                        });
                      }}
                      data-testid="switch-card-payment-app"
                    />
                  </div>
                  
                  {cardPaymentAppEnabled && (
                    <div className="space-y-3 p-4 border rounded-lg">
                      <Label htmlFor="card-payment-package" className="text-sm font-medium">
                        앱 패키지명
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="card-payment-package"
                          value={cardPaymentAppPackage}
                          onChange={(e) => setCardPaymentAppPackage(e.target.value)}
                          placeholder="com.tossplace.app.release"
                          className="flex-1"
                          data-testid="input-card-payment-package"
                        />
                        <Button
                          variant="outline"
                          onClick={() => {
                            localDb.updateSettings({ cardPaymentAppPackage });
                            toast({
                              title: "저장 완료",
                              description: "카드결제 앱 패키지명이 저장되었습니다.",
                            });
                          }}
                          data-testid="button-save-card-payment-package"
                        >
                          저장
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        TossPOS 앱: com.tossplace.app.release (기본값)
                      </p>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${cardPaymentAppPackage};end`;
                          window.location.href = intentUrl;
                        }}
                        data-testid="button-test-card-payment-app"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        앱 실행 테스트
                      </Button>
                    </div>
                  )}
                  
                  <p className="text-sm text-muted-foreground px-1">
                    활성화하면 락커 옵션에서 카드 결제 선택 시 TossPOS 등의 결제 앱이 자동으로 실행됩니다.
                    Android 태블릿에서만 동작합니다.
                  </p>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* 보안 설정 */}
          <Card>
            <Collapsible 
              open={isSecuritySectionOpen} 
              onOpenChange={setIsSecuritySectionOpen}
            >
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer hover-elevate active-elevate-2 rounded-md p-2 -m-2">
                    <div className="flex items-center gap-2">
                      {securityEnabled ? (
                        <Shield className="h-5 w-5 text-green-500" />
                      ) : (
                        <ShieldOff className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          보안
                        </CardTitle>
                        <CardDescription className="mt-1">
                          매출 정보 보호를 위한 인증 설정
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isSecuritySectionOpen ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              
              <CollapsibleContent>
                <CardContent className="space-y-6 pt-0">
                  {/* 보안 기능 활성화/비활성화 토글 */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      {securityEnabled ? (
                        <Shield className="h-6 w-6 text-green-500" />
                      ) : (
                        <ShieldOff className="h-6 w-6 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">보안 기능</p>
                        <p className="text-sm text-muted-foreground">
                          {securityEnabled 
                            ? "매출 정보 접근 시 인증이 필요합니다" 
                            : "보안이 해제되어 누구나 매출 정보에 접근할 수 있습니다"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={securityEnabled}
                      onCheckedChange={handleSecurityToggle}
                      data-testid="switch-security-toggle"
                    />
                  </div>

                  {securityEnabled && (
                    <>
                      {/* 인증 방식 선택 */}
                      <div className="space-y-3 border-t pt-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          인증 방식
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          보안 잠금 해제 시 사용할 인증 방식을 선택하세요.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant={authMethodMode === 'pattern' ? 'default' : 'outline'}
                            className="flex-1"
                            onClick={() => handleAuthMethodChange('pattern')}
                            data-testid="button-auth-method-pattern"
                          >
                            패턴만
                          </Button>
                          <Button
                            variant={authMethodMode === 'password' ? 'default' : 'outline'}
                            className="flex-1"
                            onClick={() => handleAuthMethodChange('password')}
                            data-testid="button-auth-method-password"
                          >
                            비밀번호만
                          </Button>
                          <Button
                            variant={authMethodMode === 'both' ? 'default' : 'outline'}
                            className="flex-1"
                            onClick={() => handleAuthMethodChange('both')}
                            data-testid="button-auth-method-both"
                          >
                            둘 다
                          </Button>
                        </div>
                        {authMethodMode === 'password' && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            비밀번호 분실 시 라이센스 키로 잠금을 해제할 수 있습니다.
                          </p>
                        )}
                      </div>

                      {/* 오늘현황/매출집계 잠금 설정 */}
                      <div className="space-y-3 border-t pt-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          오늘현황 / 매출집계 잠금
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          OFF 시 임시직원이 비밀번호 없이 오늘현황·매출집계를 바로 열 수 있습니다. 나머지 관리자 메뉴 잠금에는 영향이 없습니다.
                        </p>
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <span className="text-sm font-medium">오늘현황 · 매출집계</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {securityTodayStatusEnabled ? "열람 시 인증이 필요합니다" : "인증 없이 바로 열람 가능"}
                            </p>
                          </div>
                          <Switch
                            checked={securityTodayStatusEnabled}
                            onCheckedChange={handleTodayStatusSecurityToggle}
                            data-testid="switch-today-status-lock"
                          />
                        </div>
                      </div>

                      {/* 메뉴별 잠금 설정 */}
                      <div className="space-y-3 border-t pt-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          메뉴별 잠금 설정
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          잠금 해제된 메뉴는 비밀번호 없이 바로 접근할 수 있습니다. 임시직원이 사용할 메뉴의 잠금을 해제하세요.
                        </p>
                        <div className="space-y-2">
                          {MENU_ITEMS.map((item) => (
                            <div key={item.url} className="flex items-center justify-between p-3 border rounded-lg">
                              <span className="text-sm font-medium">{item.label}</span>
                              <Switch
                                checked={lockedMenuRoutes.includes(item.url)}
                                onCheckedChange={(checked) => handleMenuLockToggle(item.url, checked)}
                                data-testid={`switch-lock-${item.url.replace('/', '')}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 패턴 변경 */}
                      <div className="space-y-3 border-t pt-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Grid3X3 className="h-4 w-4" />
                          패턴 잠금
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={handleStartPatternChange}
                            className="flex-1"
                            data-testid="button-change-pattern"
                          >
                            <Grid3X3 className="h-4 w-4 mr-2" />
                            패턴 변경
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={handlePatternReset}
                            data-testid="button-reset-pattern"
                          >
                            초기화
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          패턴 초기화 시 기본 패턴(1-2-3-4-5)이 적용됩니다.
                        </p>
                      </div>

                      {/* 비밀번호 변경 */}
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium flex items-center gap-2">
                            <Lock className="h-4 w-4" />
                            비밀번호 잠금
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPasswordResetLicenseInput("");
                              setPasswordResetLicenseError("");
                              setShowPasswordResetDialog(true);
                            }}
                            data-testid="button-reset-password"
                          >
                            초기화
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="현재 비밀번호 (기본: 12345678)"
                            maxLength={8}
                            data-testid="input-current-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="새 비밀번호 (8자리)"
                            maxLength={8}
                            data-testid="input-new-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="새 비밀번호 확인"
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
                        <p className="text-xs text-muted-foreground">
                          비밀번호 초기화 시 기본 비밀번호(12345678)가 적용됩니다.
                        </p>
                      </div>

                      {/* 생체인증 설정 */}
                      <div className="space-y-3 border-t pt-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Fingerprint className="h-4 w-4" />
                          생체인증
                        </h4>
                        
                        {/* 기기 지원 상태 */}
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          {biometricAvailable ? (
                            <>
                              <CheckCircle className="h-5 w-5 text-green-500" />
                              <div>
                                <p className="font-medium text-green-600 dark:text-green-400">생체인증 지원됨</p>
                                <p className="text-sm text-muted-foreground">이 기기에서 생체인증을 사용할 수 있습니다</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-5 w-5 text-red-500" />
                              <div>
                                <p className="font-medium text-red-600 dark:text-red-400">생체인증 미지원</p>
                                <p className="text-sm text-muted-foreground">이 기기에서는 생체인증을 사용할 수 없습니다</p>
                              </div>
                            </>
                          )}
                        </div>

                        {biometricAvailable && (
                          <>
                            <div className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium">등록 상태</p>
                                <p className="text-sm text-muted-foreground">
                                  {biometricEnabled ? "등록됨" : "미등록"}
                                </p>
                              </div>
                              <div className={`px-2 py-1 rounded text-xs font-medium ${biometricEnabled ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                                {biometricEnabled ? "활성" : "비활성"}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                onClick={handleBiometricTest}
                                disabled={isBiometricTesting}
                                variant="outline"
                                className="flex-1"
                                data-testid="button-biometric-test"
                              >
                                <Fingerprint className="h-4 w-4 mr-2" />
                                {isBiometricTesting ? "처리 중..." : biometricEnabled ? "테스트" : "등록"}
                              </Button>
                              {biometricEnabled && (
                                <Button
                                  variant="ghost"
                                  onClick={handleBiometricReset}
                                  data-testid="button-biometric-reset"
                                >
                                  해제
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* 라이선스 관리 - 데모 모드가 아닐 때만 표시 */}
          {!isDemoMode() && licenseInfo.licenseKey && (
            <Card>
              <Collapsible 
                open={isLicenseSectionOpen} 
                onOpenChange={setIsLicenseSectionOpen}
              >
                <CardHeader>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between cursor-pointer hover-elevate active-elevate-2 rounded-md p-2 -m-2">
                      <div className="flex items-center gap-2">
                        <Key className="h-5 w-5 text-green-500" />
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            라이선스 관리
                          </CardTitle>
                          <CardDescription className="mt-1">
                            라이선스 및 기기 등록 관리
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isLicenseSectionOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                </CardHeader>
                
                <CollapsibleContent>
                  <CardContent className="space-y-4 pt-0">
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3 mb-3">
                        <Key className="h-6 w-6 text-green-500" />
                        <div>
                          <p className="font-medium">라이선스 정보</p>
                          <p className="text-sm text-muted-foreground">
                            현재 기기에서 인증됨
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">라이선스 키</span>
                          <span className="font-mono">{licenseInfo.licenseKey}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">기기 ID</span>
                          <span className="font-mono text-xs">{licenseInfo.deviceId?.slice(0, 16)}...</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 border border-orange-500/50 rounded-lg bg-orange-500/5">
                      <div className="flex items-start gap-3">
                        <LogOut className="h-5 w-5 text-orange-500 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-orange-600 dark:text-orange-400 mb-1">기기 등록 해제</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            현재 기기의 라이선스 등록을 해제합니다.
                            <br />
                            <span className="text-xs">
                              • 새로운 기기에서 동일한 라이선스로 등록할 수 있습니다<br />
                              • 해제 후 이 기기에서는 앱을 사용할 수 없습니다
                            </span>
                          </p>
                          <Button
                            onClick={handleUnregisterDevice}
                            disabled={isUnregistering}
                            variant="outline"
                            className="border-orange-500 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
                            data-testid="button-unregister-device"
                          >
                            <LogOut className="h-4 w-4 mr-2" />
                            {isUnregistering ? "해제 중..." : "기기 등록 해제"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-primary mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium mb-1">라이선스 관리 (관리자)</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            새 라이선스 생성, 기기 강제 해제 등 관리 기능
                          </p>
                          <Link href="/admin/licenses">
                            <Button
                              variant="outline"
                              data-testid="button-admin-licenses"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              관리자 페이지 열기
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}

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

          {/* Smart Locker Hardware Management */}
          <DeviceManagement />

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

      {/* Pricing Option Dialog */}
      <Dialog open={isPricingOptionDialogOpen} onOpenChange={setIsPricingOptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPricingOption ? "요금옵션 수정" : "새 요금옵션 추가"}
            </DialogTitle>
            <DialogDescription>
              할인, 할증, 지정 요금옵션을 설정합니다
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pricingOptionName">옵션명</Label>
              <Input
                id="pricingOptionName"
                placeholder="예: 할인, 외국인, 심야할증"
                value={pricingOptionFormData.name}
                onChange={(e) => setPricingOptionFormData({ ...pricingOptionFormData, name: e.target.value })}
                data-testid="input-pricing-option-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricingOptionType">옵션 유형</Label>
              <Select
                value={pricingOptionFormData.optionType}
                onValueChange={(v) => setPricingOptionFormData({ ...pricingOptionFormData, optionType: v as 'discount' | 'surcharge' | 'fixed' })}
              >
                <SelectTrigger data-testid="select-pricing-option-type">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">할인 (기본요금 - 금액)</SelectItem>
                  <SelectItem value="surcharge">할증 (기본요금 + 금액)</SelectItem>
                  <SelectItem value="fixed">지정 (입력 금액 고정)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricingOptionAmount">금액 (원)</Label>
              <Input
                id="pricingOptionAmount"
                type="number"
                placeholder="예: 2000"
                value={pricingOptionFormData.amount}
                onChange={(e) => setPricingOptionFormData({ ...pricingOptionFormData, amount: e.target.value })}
                data-testid="input-pricing-option-amount"
              />
              <p className="text-xs text-muted-foreground">
                {pricingOptionFormData.optionType === 'discount' && '기본요금에서 이 금액을 차감합니다'}
                {pricingOptionFormData.optionType === 'surcharge' && '기본요금에 이 금액을 추가합니다'}
                {pricingOptionFormData.optionType === 'fixed' && '기본요금과 상관없이 이 금액으로 고정됩니다'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPricingOptionDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSavePricingOption} data-testid="button-save-pricing-option">
              {editingPricingOption ? "수정" : "추가"}
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

      {/* 비밀번호 초기화 - 라이센스 키 확인 다이얼로그 */}
      <Dialog
        open={showPasswordResetDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowPasswordResetDialog(false);
            setPasswordResetLicenseInput("");
            setPasswordResetLicenseError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>비밀번호 초기화</DialogTitle>
            <DialogDescription>
              라이센스 키를 입력하여 본인 확인 후 비밀번호를 초기화합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              type="text"
              placeholder="EQUS-XXXX-XXXX-XXXX"
              value={passwordResetLicenseInput}
              onChange={(e) => {
                setPasswordResetLicenseInput(e.target.value);
                setPasswordResetLicenseError("");
              }}
              data-testid="input-password-reset-license"
              autoFocus
            />
            {passwordResetLicenseError && (
              <p className="text-sm text-destructive">{passwordResetLicenseError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowPasswordResetDialog(false)}
              >
                취소
              </Button>
              <Button
                onClick={handlePasswordResetConfirm}
                data-testid="button-confirm-password-reset"
              >
                초기화
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pattern Change Dialog */}
      {showPatternChangeDialog && (
        <Dialog 
          open={showPatternChangeDialog} 
          onOpenChange={(open) => {
            if (!open) {
              setShowPatternChangeDialog(false);
              setIsPatternChangeMode(false);
              setPatternChangeStep('verify');
              setNewPattern([]);
            }
          }}
        >
          <DialogContent className="sm:max-w-md" data-testid="dialog-pattern-change">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Grid3X3 className="h-5 w-5" />
                {patternChangeStep === 'verify' && "현재 패턴 확인"}
                {patternChangeStep === 'new' && "새 패턴 입력"}
                {patternChangeStep === 'confirm' && "새 패턴 확인"}
              </DialogTitle>
              <DialogDescription>
                {patternChangeStep === 'verify' && "현재 사용 중인 패턴을 입력해주세요."}
                {patternChangeStep === 'new' && "새로 사용할 패턴을 입력해주세요. (최소 4개 점)"}
                {patternChangeStep === 'confirm' && "새 패턴을 다시 한번 입력해주세요."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center py-4">
              <PatternLockForChange
                onPatternComplete={(pattern) => {
                  if (patternChangeStep === 'verify') {
                    // Verify current pattern
                    const storedPattern = localStorage.getItem("staff_pattern");
                    const currentPattern = storedPattern ? JSON.parse(storedPattern) : [0, 1, 2, 4, 6];
                    if (JSON.stringify(pattern) === JSON.stringify(currentPattern)) {
                      handlePatternChangeVerify(true);
                    } else {
                      handlePatternChangeVerify(false);
                    }
                  } else if (patternChangeStep === 'new') {
                    handleNewPatternInput(pattern);
                  } else if (patternChangeStep === 'confirm') {
                    handleConfirmPattern(pattern);
                  }
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Simple Pattern Lock component for pattern change (no verification)
function PatternLockForChange({ onPatternComplete }: { onPatternComplete: (pattern: number[]) => void }) {
  const [pattern, setPattern] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const size = 3;
  const canvasSize = 200;
  const dotSize = 24;
  const padding = 30;
  
  const getDotPosition = (index: number) => {
    const row = Math.floor(index / size);
    const col = index % size;
    const spacing = (canvasSize - 2 * padding) / (size - 1);
    return {
      x: padding + col * spacing,
      y: padding + row * spacing,
    };
  };
  
  const getClosestDot = (clientX: number, clientY: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    for (let i = 0; i < size * size; i++) {
      const pos = getDotPosition(i);
      const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
      if (distance < dotSize) {
        return i;
      }
    }
    return null;
  };
  
  const addDotToPattern = (dotIndex: number) => {
    if (!pattern.includes(dotIndex)) {
      const newPattern = [...pattern, dotIndex];
      setPattern(newPattern);
    }
  };
  
  const handleStart = (x: number, y: number) => {
    setIsDrawing(true);
    const dotIndex = getClosestDot(x, y);
    if (dotIndex !== null) {
      setPattern([dotIndex]);
    }
  };
  
  const handleMove = (x: number, y: number) => {
    if (!isDrawing) return;
    setTouchPosition({ x, y });
    const dotIndex = getClosestDot(x, y);
    if (dotIndex !== null) {
      addDotToPattern(dotIndex);
    }
  };
  
  const handleEnd = () => {
    if (pattern.length > 0) {
      onPatternComplete(pattern);
      setTimeout(() => {
        setPattern([]);
      }, 300);
    }
    setIsDrawing(false);
    setTouchPosition(null);
  };
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw lines
    if (pattern.length > 1) {
      ctx.beginPath();
      const firstPos = getDotPosition(pattern[0]);
      ctx.moveTo(firstPos.x, firstPos.y);
      
      for (let i = 1; i < pattern.length; i++) {
        const pos = getDotPosition(pattern[i]);
        ctx.lineTo(pos.x, pos.y);
      }
      
      if (isDrawing && touchPosition) {
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(touchPosition.x - rect.left, touchPosition.y - rect.top);
      }
      
      ctx.strokeStyle = "hsl(var(--primary))";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    
    // Draw dots
    for (let i = 0; i < size * size; i++) {
      const pos = getDotPosition(i);
      const isSelected = pattern.includes(i);
      
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, dotSize / 2, 0, Math.PI * 2);
      
      if (isSelected) {
        ctx.fillStyle = "hsl(var(--primary))";
        ctx.fill();
      }
      ctx.strokeStyle = isSelected ? "hsl(var(--primary))" : "hsl(var(--border))";
      ctx.lineWidth = 3;
      ctx.stroke();
      
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotSize / 4, 0, Math.PI * 2);
        ctx.fillStyle = "hsl(var(--primary-foreground))";
        ctx.fill();
      }
    }
  }, [pattern, isDrawing, touchPosition]);
  
  return (
    <div className="relative" style={{ width: canvasSize, height: canvasSize }}>
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        className="touch-none"
        onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
        onMouseMove={(e) => { e.preventDefault(); handleMove(e.clientX, e.clientY); }}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) => { e.preventDefault(); handleStart(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchMove={(e) => { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchEnd={(e) => { e.preventDefault(); handleEnd(); }}
        data-testid="pattern-change-canvas"
      />
    </div>
  );
}
