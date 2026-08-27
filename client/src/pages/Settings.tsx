import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Pencil, Trash2, Lock, AlertTriangle, Database, DollarSign, Receipt, Calculator, ChevronDown, ChevronUp, Barcode, Edit3, Download, Upload, Fingerprint, CheckCircle, XCircle, Shield, ShieldOff, Grid3X3, Smartphone, CreditCard, Key, LogOut, ExternalLink, Ban, Users, Camera, ImageIcon, X, Moon, Layers, FolderOpen, Sparkles, CalendarClock, Wallet, CalendarDays } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TimePickerButton } from "@/components/TimePickerButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DomesticAdditionalFeeMode } from "@shared/businessDay";
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
import { useTheme } from "@/hooks/useTheme";
import PatternLockDialog, { checkBiometricSupport, registerBiometricCredential, authenticateWithBiometric } from "@/components/PatternLockDialog";
import DeviceManagement from "@/components/DeviceManagement";
import { unregisterDevice, useLicenseInfo } from "@/components/LicenseGate";
import { isDemoMode } from "@/lib/demoMode";
import * as localDb from "@/lib/localDb";
import {
  buildArchiveFilename,
  canPickArchiveDirectory,
  canPickClosingBackupFile,
  clampAutoArchiveKeepMonths,
  clearAutoArchiveDirectory,
  clearClosingBackupFile,
  getAutoArchiveDirectoryName,
  getAutoArchiveKeepRange,
  getArchiveBackupPrefix,
  getClosingBackupFileName,
  pickAutoArchiveDirectory,
  pickClosingBackupFile,
  runAutoArchiveIfNeeded,
} from "@/lib/autoArchive";
import { getLockedRoutes, setLockedRoutes, MENU_ITEMS } from "@/lib/menuLock";
import { validateLicenseKey } from "@/lib/licenseValidation";

interface Settings {
  businessDayStartHour: number;
  dayPrice: number;
  nightPrice: number;
  discountAmount: number;
  foreignerPrice: number;
  /** true면 외국인 주간/야간 요금 분리 */
  foreignerSeparateDayNight: boolean;
  foreignerDayPrice: number;
  foreignerNightPrice: number;
  domesticCheckpointHour: number;
  foreignerAdditionalFeePeriod: number;
  domesticAdditionalFeeMode: DomesticAdditionalFeeMode;
  /** 모드2: 야간전환 N시간 이전 입실 → 1회차 야간요금 전체 */
  nightstartFullNightMinHoursBeforeNight: number;
  settlementCycleFirstDelayHours: number;
  settlementCycleSecondDelayHours: number;
  settlementCycleFirstFeeAmount: number;
  settlementCycleSecondFeeAmount: number;
  stagedFirstDelayHours: number;
  stagedFirstFeeAmount: number;
  stagedSecondEnabled: boolean;
  stagedSecondApplyHour: number;
  stagedSecondFeeAmount: number;
  /** 2차: 야간전환보다 최소 이 시간(시) 이전 주간 입실만 부과 */
  stagedSecondMinHoursBeforeNight: number;
  stagedThirdApplyHour: number;
  stagedThirdHourOffset: number;
  stagedThirdUnitAmount: number;
  dayStartTime: string;     // 주간 시작 시간 (HH:mm)
  nightStartTime: string;   // 야간 시작 시간 (HH:mm)
  enableDiscountOption: boolean;   // 기본할인 옵션 활성화
  enableForeignerOption: boolean;  // 외국인요금 옵션 활성화
  enableDirectPriceOption: boolean; // 요금 직접 입력 옵션 활성화
  enableStaffOption: boolean;      // 직원 입실 옵션 활성화
  enableFreeEntryOption: boolean;  // 무료입장 옵션 활성화
  enableLongTermOption: boolean;   // 장기투숙 옵션 활성화
  enableCashReceiptVat: boolean;   // 현금영수증 부가세 옵션
  enableCardVat: boolean;          // 카드결제 부가세 자동추가
  outingTimeLimitMinutes: number;         // 1회 외출 시간 제한 - 평일 (분, 0=비활성)
  outingTimeLimitWeekendMinutes: number;  // 1회 외출 시간 제한 - 휴일(금/토/일/공휴일) (분, 0=비활성)
  /** true면 락카 스택 기본 접기(마지막 선택만 펼침), false면 모두 펼침 */
  lockerStackDefaultCollapsed: boolean;
  /** 락카옵션창(처리중인 고객 패널) 배경 스타일: glass=모노유리, basic=불투명 단색 */
  lockerWorkspaceStyle: 'glass' | 'basic';
  autoArchiveEnabled: boolean;
  autoArchiveKeepMonths: number;
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

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 요일 배열을 "월~목" 처럼 연속 구간은 묶고, 불연속이면 "월·수·금" 처럼 나열 */
function formatDaysKorean(days: number[]): string {
  if (days.length === 0) return "-";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "매일";
  // 연속 구간 탐지
  const ranges: [number, number][] = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
    ranges.push([start, prev]);
    start = sorted[i]; prev = sorted[i];
  }
  ranges.push([start, prev]);
  return ranges.map(([s, e]) => s === e ? DOW_LABELS[s] : `${DOW_LABELS[s]}~${DOW_LABELS[e]}`).join("·");
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
    foreignerSeparateDayNight: false,
    foreignerDayPrice: 25000,
    foreignerNightPrice: 25000,
    domesticCheckpointHour: 1,
    foreignerAdditionalFeePeriod: 24,
    domesticAdditionalFeeMode: 'nextday' as DomesticAdditionalFeeMode,
    nightstartFullNightMinHoursBeforeNight: 6,
    settlementCycleFirstDelayHours: 0,
    settlementCycleSecondDelayHours: 0,
    settlementCycleFirstFeeAmount: 5000,
    settlementCycleSecondFeeAmount: 10000,
    stagedFirstDelayHours: 3,
    stagedFirstFeeAmount: 3000,
    stagedSecondEnabled: true,
    stagedSecondApplyHour: 0,
    stagedSecondFeeAmount: 10000,
    stagedSecondMinHoursBeforeNight: 6,
    stagedThirdApplyHour: 12,
    stagedThirdHourOffset: 2,
    stagedThirdUnitAmount: 1000,
    dayStartTime: '07:00',
    nightStartTime: '19:00',
    enableDiscountOption: true,
    enableForeignerOption: true,
    enableDirectPriceOption: true,
    enableStaffOption: true,
    enableFreeEntryOption: true,
    enableLongTermOption: true,
    enableCashReceiptVat: false,
    enableCardVat: false,
    outingTimeLimitMinutes: 0,
    outingTimeLimitWeekendMinutes: 0,
    lockerStackDefaultCollapsed: false,
    lockerWorkspaceStyle: 'glass',
    autoArchiveEnabled: false,
    autoArchiveKeepMonths: 2,
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
  const [securitySalesTabEnabled, setSecuritySalesTabEnabled] = useState(() => {
    return localStorage.getItem("security_sales_tab_enabled") !== "false";
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
  const { isDark, setTheme } = useTheme();

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

  // 락카사용설정 states
  const [isLockerUsageDialogOpen, setIsLockerUsageDialogOpen] = useState(false);
  const [tempDisabledLockers, setTempDisabledLockers] = useState<Set<number>>(new Set());

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

  // 오래된 데이터 정리 (구간 백업 → 삭제)
  const [archiveThroughDate, setArchiveThroughDate] = useState("");
  const [archiveRange, setArchiveRange] = useState<{ oldest: string | null; newest: string | null }>({
    oldest: null,
    newest: null,
  });
  const [archivePreview, setArchivePreview] = useState<ReturnType<typeof localDb.previewArchivePurge> | null>(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveMergeConfirmOpen, setArchiveMergeConfirmOpen] = useState(false);
  const [archiveMergeFileData, setArchiveMergeFileData] = useState<string | null>(null);
  const [archiveMergePreview, setArchiveMergePreview] = useState<ReturnType<typeof localDb.previewArchiveMerge> | null>(null);
  const [isMergingArchive, setIsMergingArchive] = useState(false);
  const archiveFileInputRef = useRef<HTMLInputElement>(null);
  const [autoArchiveFolderName, setAutoArchiveFolderName] = useState<string | null>(null);
  const [isAutoArchiving, setIsAutoArchiving] = useState(false);
  const [closingBackupFileName, setClosingBackupFileName] = useState<string | null>(null);

  // RFID/Barcode export/import refs
  const rfidFileInputRef = useRef<HTMLInputElement>(null);
  const barcodeFileInputRef = useRef<HTMLInputElement>(null);

  // 직원관리 states
  const [staffList, setStaffList] = useState<localDb.Staff[]>([]);
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<localDb.Staff | null>(null);
  const [showResignedStaff, setShowResignedStaff] = useState(false);
  const [staffFormData, setStaffFormData] = useState({
    name: "", phone: "", address: "", hireDate: "", hourlyPay: 0, notes: "", pin: "", isActive: true, photo: "", partTimeHours: 0, resignDate: "",
  });
  const [staffPhotoPreview, setStaffPhotoPreview] = useState<string>("");
  const staffFileInputRef = useRef<HTMLInputElement>(null);
  const staffCameraInputRef = useRef<HTMLInputElement>(null);

  // 근무다이어리: 파트타임 설정 (같은 요일·시간 슬롯에 근무자를 여러 명 묶어서 관리)
  const [templateGroups, setTemplateGroups] = useState<localDb.TemplateGroup[]>([]);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null); // null=새 파트타임 추가, 있으면 그 그룹의 요일·시간·이름 수정
  const [templateForm, setTemplateForm] = useState<{
    label: string; staffIds: string[]; daysOfWeek: number[]; startTime: string; endTime: string;
  }>({ label: "", staffIds: [], daysOfWeek: [], startTime: "", endTime: "" });
  // 기존 파트타임 그룹에 근무자 한 명 추가
  const [addMemberGroupId, setAddMemberGroupId] = useState<string | null>(null);
  const [addMemberStaffId, setAddMemberStaffId] = useState<string>("");
  // 파트타임 삭제/근무자 제외 확인 (모바일 PWA 환경에서 window.confirm이 제대로 뜨지 않는 경우가 있어 다이얼로그로 대체)
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ templateId: string; memberCount: number; staffName: string } | null>(null);

  // 근무다이어리: 요일·시간별 시급
  const [wageTiers, setWageTiers] = useState<localDb.WageTier[]>([]);
  const [isTierDialogOpen, setIsTierDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<localDb.WageTier | null>(null);
  const [tierForm, setTierForm] = useState<{
    name: string; daysOfWeek: number[]; includeHolidays: boolean; startTime: string; endTime: string; hourlyRate: string;
  }>({ name: "", daysOfWeek: [], includeHolidays: false, startTime: "", endTime: "", hourlyRate: "" });

  // 근무다이어리: 근무자별 주급지급일
  const [staffPaydays, setStaffPaydays] = useState<localDb.StaffPayday[]>([]);

  // Load settings and locker groups on mount
  useEffect(() => {
    const settings = localDb.getSettings();
    const dayP = settings.dayPrice ?? 10000;
    const nightP = settings.nightPrice ?? 15000;
    const foreignerP = settings.foreignerPrice ?? 25000;
    setFormData({
      ...settings,
      foreignerPrice: foreignerP,
      foreignerSeparateDayNight: settings.foreignerSeparateDayNight === true,
      foreignerDayPrice: settings.foreignerDayPrice ?? foreignerP,
      foreignerNightPrice: settings.foreignerNightPrice ?? foreignerP,
      domesticAdditionalFeeMode: (
        settings.domesticAdditionalFeeMode === 'pending4'
          ? 'stagedHourly'
          : (settings.domesticAdditionalFeeMode || 'nextday')
      ) as DomesticAdditionalFeeMode,
      nightstartFullNightMinHoursBeforeNight: settings.nightstartFullNightMinHoursBeforeNight ?? 6,
      settlementCycleFirstDelayHours: settings.settlementCycleFirstDelayHours ?? 0,
      settlementCycleSecondDelayHours: settings.settlementCycleSecondDelayHours ?? 0,
      settlementCycleFirstFeeAmount:
        settings.settlementCycleFirstFeeAmount ?? Math.max(0, nightP - dayP),
      settlementCycleSecondFeeAmount:
        settings.settlementCycleSecondFeeAmount ?? dayP,
      stagedFirstDelayHours: settings.stagedFirstDelayHours ?? 3,
      stagedFirstFeeAmount:
        settings.stagedFirstFeeAmount ?? Math.max(0, nightP - dayP),
      stagedSecondEnabled: settings.stagedSecondEnabled !== false,
      stagedSecondApplyHour: settings.stagedSecondApplyHour ?? 0,
      stagedSecondFeeAmount: settings.stagedSecondFeeAmount ?? dayP,
      stagedSecondMinHoursBeforeNight: settings.stagedSecondMinHoursBeforeNight ?? 6,
      stagedThirdApplyHour: settings.stagedThirdApplyHour ?? 12,
      stagedThirdHourOffset: settings.stagedThirdHourOffset ?? 2,
      stagedThirdUnitAmount: settings.stagedThirdUnitAmount ?? 1000,
      enableDiscountOption: settings.enableDiscountOption !== false,
      enableForeignerOption: settings.enableForeignerOption !== false,
      enableDirectPriceOption: settings.enableDirectPriceOption !== false,
      enableStaffOption: settings.enableStaffOption !== false,
      enableFreeEntryOption: settings.enableFreeEntryOption !== false,
      enableLongTermOption: settings.enableLongTermOption !== false,
      lockerStackDefaultCollapsed: settings.lockerStackDefaultCollapsed === true,
      lockerWorkspaceStyle: settings.lockerWorkspaceStyle === 'basic' ? 'basic' : 'glass',
      autoArchiveEnabled: settings.autoArchiveEnabled === true,
      autoArchiveKeepMonths: clampAutoArchiveKeepMonths(settings.autoArchiveKeepMonths),
    });
    loadLockerGroups();
    loadRevenueItems();
    loadPricingOptions();
    loadBarcodeMappings();
    loadRfidMappings();
    setStaffList(localDb.getAllStaff());
    setTemplateGroups(localDb.getTemplateGroups(false));
    setWageTiers(localDb.getAllWageTiers());
    setStaffPaydays(localDb.getAllStaffPaydays());
    void getAutoArchiveDirectoryName().then((name) => {
      if (name) setAutoArchiveFolderName(name);
    });
    void getClosingBackupFileName().then((name) => {
      if (name) setClosingBackupFileName(name);
    });
    
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
    const foreignerSeparate = formData.foreignerSeparateDayNight === true;
    const foreignerSame = Math.max(0, formData.foreignerPrice || 0);
    const foreignerDay = foreignerSeparate
      ? Math.max(0, formData.foreignerDayPrice || 0)
      : foreignerSame;
    const foreignerNight = foreignerSeparate
      ? Math.max(0, formData.foreignerNightPrice || 0)
      : foreignerSame;
    const validatedData = {
      ...formData,
      domesticCheckpointHour: Math.max(0, Math.min(23, formData.domesticCheckpointHour)),
      foreignerAdditionalFeePeriod: Math.max(1, formData.foreignerAdditionalFeePeriod),
      foreignerSeparateDayNight: foreignerSeparate,
      foreignerPrice: foreignerSeparate ? foreignerNight : foreignerSame, // 하위호환: 단일값은 야간(또는 동일값)
      foreignerDayPrice: foreignerDay,
      foreignerNightPrice: foreignerNight,
      nightstartFullNightMinHoursBeforeNight: Math.max(0, formData.nightstartFullNightMinHoursBeforeNight || 0),
      settlementCycleFirstDelayHours: Math.max(0, formData.settlementCycleFirstDelayHours || 0),
      settlementCycleSecondDelayHours: Math.max(0, formData.settlementCycleSecondDelayHours || 0),
      settlementCycleFirstFeeAmount: Math.max(0, formData.settlementCycleFirstFeeAmount || 0),
      settlementCycleSecondFeeAmount: Math.max(0, formData.settlementCycleSecondFeeAmount || 0),
      stagedFirstDelayHours: Math.max(0, formData.stagedFirstDelayHours || 0),
      stagedFirstFeeAmount: Math.max(0, formData.stagedFirstFeeAmount || 0),
      stagedSecondEnabled: formData.stagedSecondEnabled !== false,
      stagedSecondApplyHour: Math.max(0, Math.min(23, formData.stagedSecondApplyHour || 0)),
      stagedSecondFeeAmount: Math.max(0, formData.stagedSecondFeeAmount || 0),
      stagedSecondMinHoursBeforeNight: Math.max(0, formData.stagedSecondMinHoursBeforeNight || 0),
      stagedThirdApplyHour: Math.max(0, Math.min(23, formData.stagedThirdApplyHour ?? 12)),
      stagedThirdHourOffset: Math.max(0, formData.stagedThirdHourOffset ?? 2),
      stagedThirdUnitAmount: Math.max(0, formData.stagedThirdUnitAmount || 0),
      lockerStackDefaultCollapsed: formData.lockerStackDefaultCollapsed === true,
      lockerWorkspaceStyle: (formData.lockerWorkspaceStyle === 'basic' ? 'basic' : 'glass') as 'glass' | 'basic',
      autoArchiveEnabled: formData.autoArchiveEnabled === true,
      autoArchiveKeepMonths: clampAutoArchiveKeepMonths(formData.autoArchiveKeepMonths),
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
      title: enabled ? "오늘현황 탭 잠금 활성화" : "오늘현황 탭 잠금 해제",
      description: enabled
        ? "오늘현황 탭 열람 시 인증이 필요합니다."
        : "오늘현황 탭을 인증 없이 바로 열 수 있습니다.",
    });
  };

  // Toggle sales tab security on/off
  const handleSalesTabSecurityToggle = (enabled: boolean) => {
    setSecuritySalesTabEnabled(enabled);
    localStorage.setItem("security_sales_tab_enabled", enabled ? "true" : "false");
    toast({
      title: enabled ? "매출집계 탭 잠금 활성화" : "매출집계 탭 잠금 해제",
      description: enabled
        ? "매출집계 탭 열람 시 인증이 필요합니다."
        : "매출집계 탭을 인증 없이 바로 열 수 있습니다.",
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
      // 샘플 생성 직전에 현재 폼 설정을 저장해야 요금/모드/추가요금 옵션이 반영됨
      const validatedData = {
        ...formData,
        domesticCheckpointHour: Math.max(0, Math.min(23, formData.domesticCheckpointHour)),
        foreignerAdditionalFeePeriod: Math.max(1, formData.foreignerAdditionalFeePeriod),
        foreignerSeparateDayNight: formData.foreignerSeparateDayNight === true,
        foreignerPrice: formData.foreignerSeparateDayNight
          ? Math.max(0, formData.foreignerNightPrice || 0)
          : Math.max(0, formData.foreignerPrice || 0),
        foreignerDayPrice: formData.foreignerSeparateDayNight
          ? Math.max(0, formData.foreignerDayPrice || 0)
          : Math.max(0, formData.foreignerPrice || 0),
        foreignerNightPrice: formData.foreignerSeparateDayNight
          ? Math.max(0, formData.foreignerNightPrice || 0)
          : Math.max(0, formData.foreignerPrice || 0),
        nightstartFullNightMinHoursBeforeNight: Math.max(0, formData.nightstartFullNightMinHoursBeforeNight || 0),
        settlementCycleFirstDelayHours: Math.max(0, formData.settlementCycleFirstDelayHours || 0),
        settlementCycleSecondDelayHours: Math.max(0, formData.settlementCycleSecondDelayHours || 0),
        settlementCycleFirstFeeAmount: Math.max(0, formData.settlementCycleFirstFeeAmount || 0),
        settlementCycleSecondFeeAmount: Math.max(0, formData.settlementCycleSecondFeeAmount || 0),
        stagedFirstDelayHours: Math.max(0, formData.stagedFirstDelayHours || 0),
        stagedFirstFeeAmount: Math.max(0, formData.stagedFirstFeeAmount || 0),
        stagedSecondEnabled: formData.stagedSecondEnabled !== false,
        stagedSecondApplyHour: Math.max(0, Math.min(23, formData.stagedSecondApplyHour || 0)),
        stagedSecondFeeAmount: Math.max(0, formData.stagedSecondFeeAmount || 0),
        stagedSecondMinHoursBeforeNight: Math.max(0, formData.stagedSecondMinHoursBeforeNight || 0),
        stagedThirdApplyHour: Math.max(0, Math.min(23, formData.stagedThirdApplyHour ?? 12)),
        stagedThirdHourOffset: Math.max(0, formData.stagedThirdHourOffset ?? 2),
        stagedThirdUnitAmount: Math.max(0, formData.stagedThirdUnitAmount || 0),
      };
      localDb.updateSettings(validatedData);
      setFormData(validatedData);

      await localDb.createAdditionalFeeTestData(validatedData);
      
      // 진단: 데이터베이스 상태 확인
      const dbStatus = localDb.debugDatabaseStatus();
      console.log('[Settings] 샘플 데이터 생성 후 DB 상태:', dbStatus);
      
      toast({
        title: "테스트 데이터 생성 완료",
        description: `현재 설정(요금·추가요금 모드) 반영. 락커 ${dbStatus.locker_logs?.total || 0}건 생성. 콘솔에서 상세 확인.`,
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

  // 직원관리 핸들러
  const handleAddStaff = () => {
    setEditingStaff(null);
    setStaffFormData({ name: "", phone: "", address: "", hireDate: "", hourlyPay: 0, notes: "", pin: "", isActive: true, photo: "", partTimeHours: 0, resignDate: "" });
    setStaffPhotoPreview("");
    setIsStaffDialogOpen(true);
  };

  const handleEditStaff = (staff: localDb.Staff) => {
    setEditingStaff(staff);
    setStaffFormData({ name: staff.name, phone: staff.phone, address: staff.address, hireDate: staff.hireDate, hourlyPay: staff.hourlyPay, notes: staff.notes, pin: staff.pin, isActive: staff.isActive, photo: staff.photo || "", partTimeHours: staff.partTimeHours || 0, resignDate: staff.resignDate || "" });
    setStaffPhotoPreview(staff.photo || "");
    setIsStaffDialogOpen(true);
  };

  const handleDeleteStaff = (id: string, name: string) => {
    if (!confirm(`"${name}" 직원을 삭제하시겠습니까?\n모든 근무 기록도 함께 삭제됩니다.`)) return;
    localDb.deleteStaff(id);
    setStaffList(localDb.getAllStaff());
    toast({ title: "직원이 삭제되었습니다." });
  };

  const handleSaveStaff = () => {
    if (!staffFormData.name.trim()) {
      toast({ title: "이름을 입력해주세요.", variant: "destructive" }); return;
    }
    const dataToSave = { ...staffFormData, photo: staffPhotoPreview };
    if (editingStaff) {
      localDb.updateStaff(editingStaff.id, dataToSave);
      toast({ title: "직원 정보가 수정되었습니다." });
    } else {
      localDb.createStaff({ ...dataToSave, partTimeHours: 0 });
      toast({ title: "직원이 등록되었습니다." });
    }
    setStaffList(localDb.getAllStaff());
    setIsStaffDialogOpen(false);
  };

  // 근무다이어리: 파트타임 설정 핸들러
  const handleAddTemplate = () => {
    setEditingGroupId(null);
    setTemplateForm({ label: "", staffIds: staffList[0] ? [staffList[0].id] : [], daysOfWeek: [], startTime: "", endTime: "" });
    setIsTemplateDialogOpen(true);
  };

  const handleEditTemplateGroup = (g: localDb.TemplateGroup) => {
    setEditingGroupId(g.groupId);
    setTemplateForm({ label: g.label, staffIds: g.members.map(m => m.staffId), daysOfWeek: g.daysOfWeek, startTime: g.startTime, endTime: g.endTime });
    setIsTemplateDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!editingGroupId && templateForm.staffIds.length === 0) { toast({ title: "근무자를 한 명 이상 선택해주세요.", variant: "destructive" }); return; }
    if (templateForm.daysOfWeek.length === 0) { toast({ title: "요일을 하나 이상 선택해주세요.", variant: "destructive" }); return; }
    if (!templateForm.startTime || !templateForm.endTime) { toast({ title: "시작·종료 시간을 선택해주세요.", variant: "destructive" }); return; }
    const label = templateForm.label || `파트타임${templateGroups.length + 1}`;
    if (editingGroupId) {
      localDb.updateTemplateGroup(editingGroupId, {
        label,
        daysOfWeek: templateForm.daysOfWeek,
        startTime: templateForm.startTime,
        endTime: templateForm.endTime,
      });
      toast({ title: "파트타임 설정이 수정되었습니다." });
    } else {
      const [firstStaffId, ...restStaffIds] = templateForm.staffIds;
      const firstId = localDb.createPartTimeTemplate({
        label, staffId: firstStaffId, daysOfWeek: templateForm.daysOfWeek,
        startTime: templateForm.startTime, endTime: templateForm.endTime, isActive: true,
      });
      const firstRow = localDb.getAllPartTimeTemplates(false).find(t => t.id === firstId);
      const groupId = firstRow?.groupId ?? firstId;
      restStaffIds.forEach(staffId => localDb.addStaffToGroup(groupId, staffId));
      toast({ title: "파트타임이 추가되었습니다." });
    }
    setTemplateGroups(localDb.getTemplateGroups(false));
    setIsTemplateDialogOpen(false);
  };

  const handleDeleteTemplateGroup = (groupId: string) => {
    setDeleteGroupTarget(groupId);
  };

  const handleConfirmDeleteTemplateGroup = () => {
    if (!deleteGroupTarget) return;
    localDb.deleteTemplateGroup(deleteGroupTarget);
    setTemplateGroups(localDb.getTemplateGroups(false));
    toast({ title: "파트타임 설정이 삭제되었습니다." });
    setDeleteGroupTarget(null);
  };

  const handleRemoveTemplateMember = (templateId: string, memberCount: number, staffName: string) => {
    setRemoveMemberTarget({ templateId, memberCount, staffName });
  };

  const handleConfirmRemoveMember = () => {
    if (!removeMemberTarget) return;
    localDb.deletePartTimeTemplate(removeMemberTarget.templateId);
    setTemplateGroups(localDb.getTemplateGroups(false));
    toast({ title: removeMemberTarget.memberCount <= 1 ? "파트타임 설정이 삭제되었습니다." : "근무자가 제외되었습니다." });
    setRemoveMemberTarget(null);
  };

  const handleOpenAddMember = (groupId: string) => {
    setAddMemberGroupId(groupId);
    setAddMemberStaffId("");
  };

  const handleSaveAddMember = () => {
    if (!addMemberGroupId || !addMemberStaffId) return;
    localDb.addStaffToGroup(addMemberGroupId, addMemberStaffId);
    setTemplateGroups(localDb.getTemplateGroups(false));
    setAddMemberGroupId(null);
    toast({ title: "근무자가 추가되었습니다." });
  };

  // 근무다이어리: 요일·시간별 시급 핸들러
  const handleAddTier = () => {
    setEditingTier(null);
    setTierForm({ name: "", daysOfWeek: [], includeHolidays: false, startTime: "", endTime: "", hourlyRate: "" });
    setIsTierDialogOpen(true);
  };

  const handleEditTier = (t: localDb.WageTier) => {
    setEditingTier(t);
    setTierForm({ name: t.name, daysOfWeek: t.daysOfWeek, includeHolidays: t.includeHolidays, startTime: t.startTime, endTime: t.endTime, hourlyRate: String(t.hourlyRate) });
    setIsTierDialogOpen(true);
  };

  const handleSaveTier = () => {
    if (!tierForm.name.trim()) { toast({ title: "시급 구간 이름을 입력해주세요.", variant: "destructive" }); return; }
    if (tierForm.daysOfWeek.length === 0 && !tierForm.includeHolidays) { toast({ title: "요일을 하나 이상 선택하거나 공휴일 포함을 켜주세요.", variant: "destructive" }); return; }
    if (!tierForm.startTime || !tierForm.endTime) { toast({ title: "시작·종료 시간을 선택해주세요.", variant: "destructive" }); return; }
    const rate = parseInt(tierForm.hourlyRate.replace(/[^0-9]/g, "")) || 0;
    const data = {
      name: tierForm.name,
      daysOfWeek: tierForm.daysOfWeek,
      includeHolidays: tierForm.includeHolidays,
      startTime: tierForm.startTime,
      endTime: tierForm.endTime,
      hourlyRate: rate,
    };
    if (editingTier) {
      localDb.updateWageTier(editingTier.id, data);
      toast({ title: "시급 구간이 수정되었습니다." });
    } else {
      localDb.createWageTier(data);
      toast({ title: "시급 구간이 추가되었습니다." });
    }
    setWageTiers(localDb.getAllWageTiers());
    setIsTierDialogOpen(false);
  };

  const handleDeleteTier = (id: string) => {
    if (!confirm("이 시급 구간을 삭제하시겠습니까?")) return;
    localDb.deleteWageTier(id);
    setWageTiers(localDb.getAllWageTiers());
    toast({ title: "시급 구간이 삭제되었습니다." });
  };

  const handleMoveTier = (id: string, direction: "up" | "down") => {
    const idx = wageTiers.findIndex(t => t.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= wageTiers.length) return;
    localDb.swapWageTierOrder(wageTiers[idx].id, wageTiers[swapIdx].id);
    setWageTiers(localDb.getAllWageTiers());
  };

  // 근무다이어리: 근무자별 주급지급일 핸들러
  const handleSavePayday = (staffId: string, data: { dayOfWeek: number; time: string; isEnabled: boolean }) => {
    localDb.upsertStaffPayday({ staffId, ...data });
    setStaffPaydays(localDb.getAllStaffPaydays());
  };

  const handleStaffPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 300;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          setStaffPhotoPreview(dataUrl);
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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

  const refreshArchiveRange = () => {
    try {
      setArchiveRange(localDb.getOperationalDateRange());
    } catch (e) {
      console.warn('archive range', e);
    }
  };

  const updateArchivePreview = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setArchivePreview(null);
      return;
    }
    try {
      setArchivePreview(localDb.previewArchivePurge(date));
    } catch {
      setArchivePreview(null);
    }
  };

  /** 저장 위치 선택(지원 브라우저) 또는 다운로드 폴더로 저장 */
  const saveJsonFile = async (filename: string, content: string): Promise<boolean> => {
    const anyWindow = window as Window & {
      showSaveFilePicker?: (options?: any) => Promise<FileSystemFileHandle>;
    };
    if (typeof anyWindow.showSaveFilePicker === 'function') {
      try {
        const handle = await anyWindow.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'JSON',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
      } catch (err: any) {
        if (err?.name === 'AbortError') return false;
        console.warn('showSaveFilePicker failed, falling back to download', err);
      }
    }

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  };

  const getSkinBackupPrefix = () => localDb.BACKUP_PREFIX;

  // Export database to JSON file
  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const result = localDb.exportDatabase();

      if (!result.success || !result.data) {
        throw new Error(result.error || '데이터 내보내기 실패');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const saved = await saveJsonFile(
        `${getSkinBackupPrefix()}-backup-${timestamp}.json`,
        result.data
      );
      if (!saved) {
        toast({ title: "저장 취소", description: "파일 저장이 취소되었습니다." });
        return;
      }

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

  const handleOpenArchiveConfirm = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveThroughDate)) {
      toast({
        title: "날짜를 선택하세요",
        description: "백업 후 삭제할 마지막 영업일을 입력해 주세요.",
        variant: "destructive",
      });
      return;
    }
    const preview = localDb.previewArchivePurge(archiveThroughDate);
    setArchivePreview(preview);
    if (preview.total === 0) {
      toast({
        title: "대상 없음",
        description: "해당 날짜까지 삭제할 데이터가 없습니다.",
        variant: "destructive",
      });
      return;
    }
    setArchiveConfirmOpen(true);
  };

  const handleArchiveBackupAndPurge = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveThroughDate)) return;
    setIsArchiving(true);
    try {
      const exported = localDb.exportArchiveThrough(archiveThroughDate);
      if (!exported.success || !exported.data) {
        throw new Error(exported.error || '구간 백업 실패');
      }

      const filename = buildArchiveFilename(exported.archiveFrom, archiveThroughDate);
      const saved = await saveJsonFile(filename, exported.data);
      if (!saved) {
        toast({
          title: "백업 취소",
          description: "파일 저장이 취소되어 삭제를 진행하지 않았습니다.",
        });
        return;
      }

      const purged = localDb.purgeDataThrough(archiveThroughDate);
      if (!purged.success) {
        throw new Error(
          purged.error ||
            '백업은 저장되었지만 삭제에 실패했습니다. 백업 파일을 확인한 뒤 다시 시도하세요.'
        );
      }

      setArchiveConfirmOpen(false);
      refreshArchiveRange();
      updateArchivePreview(archiveThroughDate);
      toast({
        title: "구간 정리 완료",
        description: `${archiveThroughDate}까지 ${purged.deleted.toLocaleString()}건을 백업한 뒤 삭제했습니다. 앱이 더 가볍게 동작합니다.`,
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      console.error('Archive purge error:', error);
      toast({
        title: "정리 실패",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handlePickAutoArchiveFolder = async () => {
    const result = await pickAutoArchiveDirectory();
    if (!result.ok) {
      if (result.error === 'cancelled') return;
      toast({
        title: "폴더 지정 실패",
        description: result.error || "폴더를 지정하지 못했습니다.",
        variant: "destructive",
      });
      return;
    }
    setAutoArchiveFolderName(result.name || '지정됨');
    toast({
      title: "자동 백업 폴더 지정",
      description: result.name
        ? `「${result.name}」 폴더에 자동 백업 파일을 저장합니다.`
        : "선택한 폴더에 자동 백업 파일을 저장합니다.",
    });
  };

  const handleClearAutoArchiveFolder = async () => {
    await clearAutoArchiveDirectory();
    setAutoArchiveFolderName(null);
    toast({
      title: "폴더 지정 해제",
      description: "자동 백업 폴더를 해제했습니다. 다시 지정하기 전에는 자동 백업이 실행되지 않습니다.",
    });
  };

  const handlePickClosingBackupFile = async () => {
    const result = await pickClosingBackupFile();
    if (!result.ok) {
      if (result.error === 'cancelled') return;
      toast({
        title: "파일 지정 실패",
        description: result.error || "파일을 지정하지 못했습니다.",
        variant: "destructive",
      });
      return;
    }
    setClosingBackupFileName(result.name || '지정됨');
    toast({
      title: "마감 백업 파일 지정",
      description: result.name
        ? `앞으로 마감 확정 시 「${result.name}」 파일 하나를 계속 덮어씁니다.`
        : "지정한 파일을 마감마다 덮어씁니다.",
    });
  };

  const handleClearClosingBackupFile = async () => {
    await clearClosingBackupFile();
    setClosingBackupFileName(null);
    toast({
      title: "마감 백업 파일 지정 해제",
      description: "이제부터 마감 확정 시 영업일자가 포함된 새 파일로 다운로드됩니다.",
    });
  };

  const handleRunAutoArchiveNow = async () => {
    setIsAutoArchiving(true);
    try {
      localDb.updateSettings({
        autoArchiveEnabled: formData.autoArchiveEnabled === true,
        autoArchiveKeepMonths: clampAutoArchiveKeepMonths(formData.autoArchiveKeepMonths),
      });
      const result = await runAutoArchiveIfNeeded({ force: true });
      if (result.status === 'purged') {
        refreshArchiveRange();
        toast({
          title: "자동 백업 완료",
          description: result.message,
        });
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      if (result.status === 'nothing') {
        toast({
          title: "백업할 데이터 없음",
          description: result.message || "남겨둘 기간 이전의 데이터가 없습니다.",
        });
        return;
      }
      toast({
        title: result.status === 'skipped' ? "실행하지 않음" : "자동 백업 실패",
        description: result.message || "자동 백업을 실행하지 못했습니다.",
        variant: result.status === 'skipped' ? undefined : "destructive",
      });
    } finally {
      setIsAutoArchiving(false);
    }
  };

  const handleArchiveMergeFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const preview = localDb.previewArchiveMerge(content);
      if (!preview.success) {
        toast({
          title: "아카이브 파일 확인 실패",
          description: preview.error || "올바른 구간 아카이브 JSON이 아닙니다.",
          variant: "destructive",
        });
        return;
      }
      if (!preview.total) {
        toast({
          title: "데이터 없음",
          description: "아카이브에 합칠 기록이 없습니다.",
          variant: "destructive",
        });
        return;
      }
      setArchiveMergeFileData(content);
      setArchiveMergePreview(preview);
      setArchiveMergeConfirmOpen(true);
    };
    reader.onerror = () => {
      toast({
        title: "파일 읽기 실패",
        description: "파일을 읽는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    };
    reader.readAsText(file);

    if (archiveFileInputRef.current) {
      archiveFileInputRef.current.value = '';
    }
  };

  const handleConfirmArchiveMerge = () => {
    if (!archiveMergeFileData) return;
    setIsMergingArchive(true);
    try {
      const result = localDb.mergeArchiveDatabase(archiveMergeFileData);
      if (!result.success) {
        throw new Error(result.error || '아카이브 병합 실패');
      }
      toast({
        title: "아카이브 불러오기 완료",
        description: result.message || "과거 데이터를 합쳤습니다.",
      });
      setArchiveMergeConfirmOpen(false);
      setArchiveMergeFileData(null);
      setArchiveMergePreview(null);
      refreshArchiveRange();
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Archive merge error:', error);
      toast({
        title: "불러오기 실패",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsMergingArchive(false);
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
                  type="text"
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
                  type="text"
                  value={formData.dayPrice}
                  onChange={(e) => setFormData({ ...formData, dayPrice: parseInt(e.target.value) || 0 })}
                  data-testid="input-day-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nightPrice">야간 요금 ({formData.nightStartTime} - {formData.dayStartTime})</Label>
                <Input
                  id="nightPrice"
                  type="text"
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
                락카옵션창에 표시할 요금 옵션을 켜거나 끌 수 있습니다. 꺼도 이미 해당 옵션으로 입실한 기록은 그대로 유지됩니다.
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
                      type="text"
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
                  <div className="space-y-3 pt-2 border-t">
                    <div className="space-y-2">
                      <Label className="text-sm">외국인 요금 방식</Label>
                      <RadioGroup
                        value={formData.foreignerSeparateDayNight ? 'separate' : 'same'}
                        onValueChange={(v) => {
                          const separate = v === 'separate';
                          setFormData({
                            ...formData,
                            foreignerSeparateDayNight: separate,
                            // 분리로 전환 시 기존 단일값을 주·야간 초기값으로 채움
                            ...(separate
                              ? {
                                  foreignerDayPrice: formData.foreignerDayPrice || formData.foreignerPrice,
                                  foreignerNightPrice: formData.foreignerNightPrice || formData.foreignerPrice,
                                }
                              : {
                                  foreignerPrice:
                                    formData.foreignerNightPrice ||
                                    formData.foreignerDayPrice ||
                                    formData.foreignerPrice,
                                }),
                          });
                        }}
                        className="grid grid-cols-2 gap-2"
                      >
                        <label
                          htmlFor="foreigner-fee-same"
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm ${
                            !formData.foreignerSeparateDayNight
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                        >
                          <RadioGroupItem value="same" id="foreigner-fee-same" />
                          주야간 동일
                        </label>
                        <label
                          htmlFor="foreigner-fee-separate"
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm ${
                            formData.foreignerSeparateDayNight
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                        >
                          <RadioGroupItem value="separate" id="foreigner-fee-separate" />
                          주야간 분리
                        </label>
                      </RadioGroup>
                    </div>

                    {!formData.foreignerSeparateDayNight ? (
                      <div className="space-y-2">
                        <Label htmlFor="foreignerPrice">외국인 요금 (주·야간 동일)</Label>
                        <Input
                          id="foreignerPrice"
                          type="text"
                          inputMode="numeric"
                          value={formData.foreignerPrice}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFormData({
                              ...formData,
                              foreignerPrice: val,
                              foreignerDayPrice: val,
                              foreignerNightPrice: val,
                            });
                          }}
                          data-testid="input-foreigner-price"
                        />
                        <p className="text-xs text-muted-foreground">예: 25,000원</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="foreignerDayPrice">외국인 주간 요금</Label>
                          <Input
                            id="foreignerDayPrice"
                            type="text"
                            inputMode="numeric"
                            value={formData.foreignerDayPrice}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                foreignerDayPrice: parseInt(e.target.value) || 0,
                              })
                            }
                            data-testid="input-foreigner-day-price"
                          />
                          <p className="text-xs text-muted-foreground">예: 20,000원</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="foreignerNightPrice">외국인 야간 요금</Label>
                          <Input
                            id="foreignerNightPrice"
                            type="text"
                            inputMode="numeric"
                            value={formData.foreignerNightPrice}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                foreignerNightPrice: parseInt(e.target.value) || 0,
                              })
                            }
                            data-testid="input-foreigner-night-price"
                          />
                          <p className="text-xs text-muted-foreground">예: 25,000원</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 요금 직접 입력 */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label htmlFor="enableDirectPriceOption" className="text-sm font-medium">요금 직접 입력</Label>
                  <p className="text-xs text-muted-foreground">입실 시 요금을 직접 입력하는 옵션을 표시합니다</p>
                </div>
                <Switch
                  id="enableDirectPriceOption"
                  checked={formData.enableDirectPriceOption}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableDirectPriceOption: checked })}
                  data-testid="switch-enable-direct-price"
                />
              </div>

              {/* 직원 */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label htmlFor="enableStaffOption" className="text-sm font-medium">직원 입실</Label>
                  <p className="text-xs text-muted-foreground">신규 입실 시 직원(0원) 옵션을 표시합니다</p>
                </div>
                <Switch
                  id="enableStaffOption"
                  checked={formData.enableStaffOption}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableStaffOption: checked })}
                  data-testid="switch-enable-staff"
                />
              </div>

              {/* 무료입장 */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label htmlFor="enableFreeEntryOption" className="text-sm font-medium">무료입장</Label>
                  <p className="text-xs text-muted-foreground">신규 입실 시 무료입장(0원) 옵션을 표시합니다</p>
                </div>
                <Switch
                  id="enableFreeEntryOption"
                  checked={formData.enableFreeEntryOption}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableFreeEntryOption: checked })}
                  data-testid="switch-enable-free-entry"
                />
              </div>

              {/* 장기투숙 */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label htmlFor="enableLongTermOption" className="text-sm font-medium">장기투숙</Label>
                  <p className="text-xs text-muted-foreground">입실 시 장기투숙 옵션을 표시합니다</p>
                </div>
                <Switch
                  id="enableLongTermOption"
                  checked={formData.enableLongTermOption}
                  onCheckedChange={(checked) => setFormData({ ...formData, enableLongTermOption: checked })}
                  data-testid="switch-enable-long-term"
                />
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
                4가지 부과 기준 중 하나만 선택합니다. 선택한 로직만 적용되고 나머지는 무시됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RadioGroup
                value={formData.domesticAdditionalFeeMode}
                onValueChange={(value) => {
                  const mode = value as DomesticAdditionalFeeMode;
                  const next = { ...formData, domesticAdditionalFeeMode: mode };
                  if (mode === 'nightstart') {
                    if (next.nightstartFullNightMinHoursBeforeNight == null) {
                      next.nightstartFullNightMinHoursBeforeNight = 6;
                    }
                  }
                  if (mode === 'settlementCycle') {
                    if (next.settlementCycleFirstFeeAmount == null) {
                      next.settlementCycleFirstFeeAmount = Math.max(0, formData.nightPrice - formData.dayPrice);
                    }
                    if (next.settlementCycleSecondFeeAmount == null) {
                      next.settlementCycleSecondFeeAmount = formData.dayPrice;
                    }
                  }
                  if (mode === 'stagedHourly') {
                    if (next.stagedFirstFeeAmount == null) {
                      next.stagedFirstFeeAmount = Math.max(0, formData.nightPrice - formData.dayPrice);
                    }
                    if (next.stagedSecondFeeAmount == null) {
                      next.stagedSecondFeeAmount = formData.dayPrice;
                    }
                    if (next.stagedSecondMinHoursBeforeNight == null) {
                      next.stagedSecondMinHoursBeforeNight = 6;
                    }
                  }
                  setFormData(next);
                }}
                className="space-y-3"
                data-testid="radio-additional-fee-mode"
              >
                {/* 모드1: 다음날 고정시각 */}
                <label
                  htmlFor="fee-mode-nextday"
                  className={`block cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    formData.domesticAdditionalFeeMode === 'nextday'
                      ? 'border-sky-500 bg-sky-50/80 dark:bg-sky-950/30'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="nextday" id="fee-mode-nextday" className="mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-sky-600 px-1.5 text-[11px] font-bold text-white">1</span>
                        <span className="text-sm font-semibold">다음날 고정시각</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        주간 입실 → 다음날 지정 시각에 차액(야간−주간) 부과<br />
                        야간 입실 → 영업일+2일 지정 시각에 야간요금 부과 · 이후 24시간마다 반복
                      </p>
                      {formData.domesticAdditionalFeeMode === 'nextday' && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label htmlFor="domesticCheckpointHour" className="text-xs">체크포인트 시간 (0–23시)</Label>
                          <Input
                            id="domesticCheckpointHour"
                            type="text"
                            inputMode="numeric"
                            value={formData.domesticCheckpointHour}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setFormData({ ...formData, domesticCheckpointHour: isNaN(val) ? 0 : val });
                            }}
                            data-testid="input-domestic-checkpoint"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            예: 1 → 매일 01:00 (기본값)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </label>

                {/* 모드2: 야간전환 체크포인트 */}
                <label
                  htmlFor="fee-mode-nightstart"
                  className={`block cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    formData.domesticAdditionalFeeMode === 'nightstart'
                      ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/30'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="nightstart" id="fee-mode-nightstart" className="mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-amber-600 px-1.5 text-[11px] font-bold text-white">2</span>
                        <span className="text-sm font-semibold">야간전환 체크포인트</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        주간 입실 → 당일 야간시작({formData.nightStartTime})에 1회차 부과<br />
                        · 야간전환보다 N시간 이전 입실 → <strong>야간요금 전체</strong><br />
                        · 야간 직전(N시간 미만) 입실 → <strong>차액(야간−주간)</strong><br />
                        야간 입실 → 다음날 야간시작에 야간요금 · 이후 24시간마다 야간요금 반복
                      </p>
                      {formData.domesticAdditionalFeeMode === 'nightstart' && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-xs">야간요금 전체 부과 기준 (야간전환 N시간 이전, 시)</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={formData.nightstartFullNightMinHoursBeforeNight}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setFormData({
                                ...formData,
                                nightstartFullNightMinHoursBeforeNight: isNaN(val) ? 0 : Math.max(0, val),
                              });
                            }}
                            data-testid="input-nightstart-full-night-hours"
                          />
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            주간 입실이 야간전환({formData.nightStartTime || '19:00'})보다 이 시간 이상 이전이면 1회차에 야간요금 전체를,
                            그보다 늦게 들어오면 차액만 부과합니다.
                            {(() => {
                              const nightH = parseInt(String(formData.nightStartTime || '19:00').split(':')[0], 10) || 19;
                              const n = formData.nightstartFullNightMinHoursBeforeNight || 0;
                              const cutoff = (nightH - n + 24) % 24;
                              return (
                                <>
                                  {' '}현재 설정: 대략 <strong>{cutoff}시 이전</strong> 주간 입실 → 야간요금 전체.
                                </>
                              );
                            })()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </label>

                {/* 모드3: 정산·야간 순환 */}
                <label
                  htmlFor="fee-mode-settlement"
                  className={`block cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    formData.domesticAdditionalFeeMode === 'settlementCycle'
                      ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="settlementCycle" id="fee-mode-settlement" className="mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-emerald-600 px-1.5 text-[11px] font-bold text-white">3</span>
                        <span className="text-sm font-semibold">정산·야간 순환</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        1차(야간전환+N): 기본 야간−주간 차액 · 2차(정산+N): 기본 주간요금 · 이후 1↔2 무한 반복<br />
                        정산 전 주간 입실 → 야간전환까지 무료, 야간전환 시 야간요금 1회 후 동일 순환
                      </p>
                      {formData.domesticAdditionalFeeMode === 'settlementCycle' && (
                        <div className="space-y-4 pt-3 border-t">
                          <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-background/60 p-3 space-y-3">
                            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">1차 추가요금 (야간전환 기준)</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">적용 지연 (시간)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.settlementCycleFirstDelayHours}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      settlementCycleFirstDelayHours: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-settlement-first-delay"
                                />
                                <p className="text-[11px] text-muted-foreground">0 = 야간전환 직후</p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">부과 금액 (원)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.settlementCycleFirstFeeAmount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      settlementCycleFirstFeeAmount: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-settlement-first-fee"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                  권장: 야간−주간 = {(formData.nightPrice - formData.dayPrice).toLocaleString()}원
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-md border border-teal-200 dark:border-teal-800 bg-background/60 p-3 space-y-3">
                            <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">2차 추가요금 (정산시간 기준)</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">적용 지연 (시간)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.settlementCycleSecondDelayHours}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      settlementCycleSecondDelayHours: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-settlement-second-delay"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                  0 = 정산({formData.businessDayStartHour}시) 직후
                                </p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">부과 금액 (원)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.settlementCycleSecondFeeAmount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      settlementCycleSecondFeeAmount: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-settlement-second-fee"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                  권장: 주간요금 = {formData.dayPrice.toLocaleString()}원
                                </p>
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFormData({
                                ...formData,
                                settlementCycleFirstFeeAmount: Math.max(0, formData.nightPrice - formData.dayPrice),
                                settlementCycleSecondFeeAmount: formData.dayPrice,
                              });
                            }}
                          >
                            권장 금액으로 맞추기 (야간−주간 / 주간요금)
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </label>

                {/* 모드4: 단계별(1·2·3차) */}
                <label
                  htmlFor="fee-mode-staged"
                  className={`block cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    formData.domesticAdditionalFeeMode === 'stagedHourly'
                      ? 'border-violet-500 bg-violet-50/80 dark:bg-violet-950/30'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="stagedHourly" id="fee-mode-staged" className="mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-violet-600 px-1.5 text-[11px] font-bold text-white">4</span>
                        <span className="text-sm font-semibold">단계별 1·2·3차 (시간당)</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        1차: 야간전환+N · 2차: 지정 시각(ON/OFF, 주간·야간전환 N시간 이전 입실만) · 3차: 다음 정산 이후 기준시각부터 매시간 누적<br />
                        <span className="text-muted-foreground">※ 3차가 시작되면 1·2차는 더하지 않고 3차만 적용됩니다.</span>
                        정산 전 주간 입실 → 야간전환까지 무료, 야간전환 시 야간요금 후 동일 파이프라인
                      </p>
                      {formData.domesticAdditionalFeeMode === 'stagedHourly' && (
                        <div className="space-y-4 pt-3 border-t">
                          {/* 1차 */}
                          <div className="rounded-md border border-violet-200 dark:border-violet-800 bg-background/60 p-3 space-y-3">
                            <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">1차 추가요금 (야간전환 기준)</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">적용 지연 (시간)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.stagedFirstDelayHours}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      stagedFirstDelayHours: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-staged-first-delay"
                                />
                                <p className="text-[11px] text-muted-foreground">0 = 야간전환({formData.nightStartTime}) 직후</p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">부과 금액 (원)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.stagedFirstFeeAmount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      stagedFirstFeeAmount: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-staged-first-fee"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                  권장: 야간−주간 = {(formData.nightPrice - formData.dayPrice).toLocaleString()}원
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* 2차 */}
                          <div className="rounded-md border border-fuchsia-200 dark:border-fuchsia-800 bg-background/60 p-3 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-fuchsia-800 dark:text-fuchsia-300">2차 추가요금 (지정 시각)</p>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground">적용</Label>
                                <Switch
                                  checked={formData.stagedSecondEnabled}
                                  onCheckedChange={(checked) =>
                                    setFormData({ ...formData, stagedSecondEnabled: checked })
                                  }
                                  data-testid="switch-staged-second-enabled"
                                />
                              </div>
                            </div>
                            {formData.stagedSecondEnabled && (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">적용 시각 (0–23시)</Label>
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      value={formData.stagedSecondApplyHour}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setFormData({
                                          ...formData,
                                          stagedSecondApplyHour: isNaN(val) ? 0 : Math.max(0, Math.min(23, val)),
                                        });
                                      }}
                                      data-testid="input-staged-second-hour"
                                    />
                                    <p className="text-[11px] text-muted-foreground">예: 0 = 자정</p>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">부과 금액 (원)</Label>
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      value={formData.stagedSecondFeeAmount}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setFormData({
                                          ...formData,
                                          stagedSecondFeeAmount: isNaN(val) ? 0 : Math.max(0, val),
                                        });
                                      }}
                                      data-testid="input-staged-second-fee"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs">최소 입실 선행시간 (야간전환 기준, 시)</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    value={formData.stagedSecondMinHoursBeforeNight}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      setFormData({
                                        ...formData,
                                        stagedSecondMinHoursBeforeNight: isNaN(val) ? 0 : Math.max(0, val),
                                      });
                                    }}
                                    data-testid="input-staged-second-min-hours"
                                  />
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    주간 입실이 야간전환({formData.nightStartTime || '19:00'})보다
                                    이 시간 이상 이전일 때만 2차 부과.
                                    야간 직전 입실·야간 입실은 2차 면제.
                                    {(() => {
                                      const nightH = parseInt(String(formData.nightStartTime || '19:00').split(':')[0], 10) || 19;
                                      const n = formData.stagedSecondMinHoursBeforeNight || 0;
                                      const cutoff = (nightH - n + 24) % 24;
                                      return (
                                        <>
                                          {' '}현재 설정: 대략 <strong>{cutoff}시 이전</strong> 주간 입실만 2차 대상.
                                        </>
                                      );
                                    })()}
                                  </p>
                                </div>
                              </div>
                            )}
                            {!formData.stagedSecondEnabled && (
                              <p className="text-[11px] text-muted-foreground">OFF — 2차 추가요금을 건너뜁니다</p>
                            )}
                          </div>

                          {/* 3차 */}
                          <div className="rounded-md border border-indigo-200 dark:border-indigo-800 bg-background/60 p-3 space-y-3">
                            <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                              3차 추가요금 (다음 정산 이후 · 시간당)
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              다음 정산({formData.businessDayStartHour}시) 이후, 기준 시각부터<br />
                              <strong>(경과시간 + 가산시간) × 단위금액</strong> 으로 누적됩니다.
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">기준 시각 (시)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.stagedThirdApplyHour}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      stagedThirdApplyHour: isNaN(val) ? 0 : Math.max(0, Math.min(23, val)),
                                    });
                                  }}
                                  data-testid="input-staged-third-hour"
                                />
                                <p className="text-[11px] text-muted-foreground">예: 12 = 정오</p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">가산시간 (+N)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.stagedThirdHourOffset}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      stagedThirdHourOffset: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-staged-third-offset"
                                />
                                <p className="text-[11px] text-muted-foreground">예: 2</p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">단위금액 (원)</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  value={formData.stagedThirdUnitAmount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setFormData({
                                      ...formData,
                                      stagedThirdUnitAmount: isNaN(val) ? 0 : Math.max(0, val),
                                    });
                                  }}
                                  data-testid="input-staged-third-unit"
                                />
                                <p className="text-[11px] text-muted-foreground">예: 1000</p>
                              </div>
                            </div>
                            <p className="text-[11px] rounded bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1.5 text-indigo-900 dark:text-indigo-200">
                              미리보기: 기준 시각 도래 시{' '}
                              <strong>
                                {(formData.stagedThirdHourOffset * formData.stagedThirdUnitAmount).toLocaleString()}원
                              </strong>
                              , 1시간 후{' '}
                              <strong>
                                {((formData.stagedThirdHourOffset + 1) * formData.stagedThirdUnitAmount).toLocaleString()}원
                              </strong>
                              {' '}(누적)
                            </p>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFormData({
                                ...formData,
                                stagedFirstDelayHours: 3,
                                stagedFirstFeeAmount: Math.max(0, formData.nightPrice - formData.dayPrice),
                                stagedSecondEnabled: true,
                                stagedSecondApplyHour: 0,
                                stagedSecondFeeAmount: formData.dayPrice,
                                stagedSecondMinHoursBeforeNight: 6,
                                stagedThirdApplyHour: 12,
                                stagedThirdHourOffset: 2,
                                stagedThirdUnitAmount: 1000,
                              });
                            }}
                          >
                            예시값으로 맞추기 (야간+3h / 자정 / 정오·+2×1000)
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              </RadioGroup>

              {formData.enableForeignerOption && (
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="foreignerAdditionalFeePeriod">외국인 추가요금 주기 (시간 단위)</Label>
                <Input
                  id="foreignerAdditionalFeePeriod"
                  type="text"
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
                외출 후 미복귀 시 락카버튼을 점멸로 경보합니다 (0 = 비활성) · 금·토·일·공휴일은 별도 설정 가능
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="outingTimeLimitMinutes">평일 외출 허용 시간</Label>
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
                  <p className="text-xs text-muted-foreground">월~목 적용</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outingTimeLimitWeekendMinutes">휴일 외출 허용 시간</Label>
                  <select
                    id="outingTimeLimitWeekendMinutes"
                    value={formData.outingTimeLimitWeekendMinutes}
                    onChange={(e) => setFormData({ ...formData, outingTimeLimitWeekendMinutes: parseInt(e.target.value) })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="select-outing-time-limit-weekend"
                  >
                    <option value={0}>비활성 (무제한)</option>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
                      <option key={h} value={h * 60}>{h}시간</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">금·토·일·공휴일 적용</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                외출 버튼 클릭 후 설정된 시간이 초과되면 해당 락카버튼이 다크그레이↔레드로 점멸됩니다
              </p>
            </CardContent>
          </Card>

          {/* 다중락카옵션모드 */}
          <Card data-testid="card-locker-stack-mode">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                다중락카옵션모드
              </CardTitle>
              <CardDescription>
                여러 락카를 연속 선택할 때 옵션창을 어떻게 쌓아 보여줄지 정합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={formData.lockerStackDefaultCollapsed ? "collapsed" : "expanded"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    lockerStackDefaultCollapsed: value === "collapsed",
                  })
                }
                className="grid gap-3"
                data-testid="radio-locker-stack-default"
              >
                <div className="flex items-start space-x-3 rounded-lg border bg-muted/20 px-4 py-3">
                  <RadioGroupItem value="expanded" id="locker-stack-expanded" className="mt-1" />
                  <Label htmlFor="locker-stack-expanded" className="flex-1 cursor-pointer space-y-1 font-normal">
                    <span className="block font-medium text-foreground">펼침모드</span>
                    <span className="block text-sm text-muted-foreground">
                      선택한 모든 락카 옵션창을 펼친 상태로 표시합니다. (기존과 동일)
                    </span>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border bg-muted/20 px-4 py-3">
                  <RadioGroupItem value="collapsed" id="locker-stack-collapsed" className="mt-1" />
                  <Label htmlFor="locker-stack-collapsed" className="flex-1 cursor-pointer space-y-1 font-normal">
                    <span className="block font-medium text-foreground">접힘모드</span>
                    <span className="block text-sm text-muted-foreground">
                      가장 나중에 선택한 락카만 펼치고, 이전에 선택한 락카는 접습니다.
                      락카를 1개만 선택한 경우에도 해당 옵션창은 펼쳐집니다.
                    </span>
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                변경 후 아래 <span className="font-medium text-foreground">저장</span> 버튼을 눌러야 적용됩니다.
                처리중인 고객 창이 2개 이상일 때는 헤더의 일괄 펼치기/일괄 접기로도 조절할 수 있습니다.
              </p>
            </CardContent>
          </Card>

          {/* 락카옵션창 배경 스타일 */}
          <Card data-testid="card-locker-workspace-style">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                락카옵션창 배경 스타일
              </CardTitle>
              <CardDescription>
                처리중인 고객 창의 배경을 유리 느낌으로 할지, 불투명 단색으로 할지 정합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={formData.lockerWorkspaceStyle === 'basic' ? 'basic' : 'glass'}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    lockerWorkspaceStyle: value === 'basic' ? 'basic' : 'glass',
                  })
                }
                className="grid gap-3"
                data-testid="radio-locker-workspace-style"
              >
                <div className="flex items-start space-x-3 rounded-lg border bg-muted/20 px-4 py-3">
                  <RadioGroupItem value="glass" id="workspace-style-glass" className="mt-1" />
                  <Label htmlFor="workspace-style-glass" className="flex-1 cursor-pointer space-y-1 font-normal">
                    <span className="block font-medium text-foreground">글래스 스타일</span>
                    <span className="block text-sm text-muted-foreground">
                      반투명 모노유리 느낌(블러 효과). 뒤쪽 화면이 은은하게 비칩니다. (기존과 동일)
                    </span>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border bg-muted/20 px-4 py-3">
                  <RadioGroupItem value="basic" id="workspace-style-basic" className="mt-1" />
                  <Label htmlFor="workspace-style-basic" className="flex-1 cursor-pointer space-y-1 font-normal">
                    <span className="block font-medium text-foreground">기본 스타일</span>
                    <span className="block text-sm text-muted-foreground">
                      불투명한 단색 배경. 뒤쪽이 비치지 않아 메뉴에만 집중할 수 있습니다.
                    </span>
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                변경 후 아래 <span className="font-medium text-foreground">저장</span> 버튼을 눌러야 적용됩니다.
              </p>
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

          {/* 락카사용설정 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Ban className="h-5 w-5" />
                    락카사용설정
                  </CardTitle>
                  <CardDescription>
                    고장·청소 등으로 사용할 수 없는 락카를 지정합니다 (회색으로 표시되고 클릭 불가)
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    try {
                      const saved = localStorage.getItem('out_of_service_lockers');
                      setTempDisabledLockers(saved ? new Set<number>(JSON.parse(saved)) : new Set<number>());
                    } catch {
                      setTempDisabledLockers(new Set<number>());
                    }
                    setIsLockerUsageDialogOpen(true);
                  }}
                  size="sm"
                  data-testid="button-open-locker-usage"
                >
                  사용불가 설정
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                try {
                  const saved = localStorage.getItem('out_of_service_lockers');
                  const disabled: number[] = saved ? JSON.parse(saved) : [];
                  if (disabled.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground">현재 사용불가로 지정된 락카가 없습니다.</p>
                    );
                  }
                  return (
                    <div className="flex flex-wrap gap-2">
                      {disabled.sort((a, b) => a - b).map(num => (
                        <span key={num} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-200 text-gray-500 text-sm dark:bg-gray-700 dark:text-gray-400">
                          <Ban className="w-3 h-3" />
                          {num}번
                        </span>
                      ))}
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}
            </CardContent>
          </Card>

          {/* 락카사용설정 다이얼로그 */}
          <Dialog open={isLockerUsageDialogOpen} onOpenChange={setIsLockerUsageDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  락카 사용불가 설정
                </DialogTitle>
                <DialogDescription>
                  사용불가로 지정할 락카를 클릭하세요. 다시 클릭하면 해제됩니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-2">
                {lockerGroups.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">락커 그룹이 설정되지 않았습니다.</p>
                ) : (
                  lockerGroups.map((group) => (
                    <div key={group.id}>
                      <h4 className="text-sm font-semibold mb-3 text-muted-foreground">{group.name}</h4>
                      <div className="grid grid-cols-10 gap-2">
                        {Array.from(
                          { length: group.endNumber - group.startNumber + 1 },
                          (_, i) => group.startNumber + i
                        ).map((num) => {
                          const isDisabled = tempDisabledLockers.has(num);
                          return (
                            <button
                              key={num}
                              onClick={() => {
                                setTempDisabledLockers(prev => {
                                  const next = new Set(prev);
                                  if (next.has(num)) {
                                    next.delete(num);
                                  } else {
                                    next.add(num);
                                  }
                                  return next;
                                });
                              }}
                              className={`
                                aspect-square rounded-lg font-semibold text-sm border-2 transition-all duration-100
                                flex flex-col items-center justify-center gap-0.5
                                ${isDisabled
                                  ? 'bg-gray-300 text-gray-500 border-gray-400 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                                }
                              `}
                              data-testid={`locker-usage-${num}`}
                            >
                              <span className="text-base font-bold">{num}</span>
                              {isDisabled && <span className="text-[9px] font-normal">사용불가</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsLockerUsageDialogOpen(false)}
                  data-testid="button-locker-usage-cancel"
                >
                  취소
                </Button>
                <Button
                  onClick={() => {
                    const arr = Array.from(tempDisabledLockers);
                    localStorage.setItem('out_of_service_lockers', JSON.stringify(arr));
                    window.dispatchEvent(new StorageEvent('storage', {
                      key: 'out_of_service_lockers',
                      newValue: JSON.stringify(arr),
                    }));
                    setIsLockerUsageDialogOpen(false);
                    toast({ title: "저장 완료", description: `사용불가 락카 ${arr.length}개가 설정되었습니다.` });
                  }}
                  data-testid="button-locker-usage-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  저장
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                          다크 모드 · 화면 잠금 방지
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
                      <Moon className={`h-6 w-6 ${isDark ? 'text-blue-400' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium">다크 모드</p>
                        <p className="text-sm text-muted-foreground">
                          {isDark ? "어두운 화면 (눈의 피로 완화)" : "밝은 화면"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isDark}
                      onCheckedChange={(enabled) => setTheme(enabled ? "dark" : "light")}
                      data-testid="switch-dark-mode"
                    />
                  </div>
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
                <CardContent className="pt-0">
                  <div className="space-y-4">
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
                  </div>
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

                      {/* 탭별 잠금 설정 */}
                      <div className="space-y-3 border-t pt-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          탭별 잠금 설정
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          탭 모드에서 각 탭의 잠금을 개별로 설정합니다. OFF 시 인증 없이 바로 접근 가능합니다.
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <span className="text-sm font-medium">오늘현황 탭</span>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {securityTodayStatusEnabled ? "열람 시 인증 필요" : "인증 없이 바로 열람"}
                              </p>
                            </div>
                            <Switch
                              checked={securityTodayStatusEnabled}
                              onCheckedChange={handleTodayStatusSecurityToggle}
                              data-testid="switch-today-status-lock"
                            />
                          </div>
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <span className="text-sm font-medium">매출집계 탭</span>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {securitySalesTabEnabled ? "열람 시 인증 필요" : "인증 없이 바로 열람"}
                              </p>
                            </div>
                            <Switch
                              checked={securitySalesTabEnabled}
                              onCheckedChange={handleSalesTabSecurityToggle}
                              data-testid="switch-sales-tab-lock"
                            />
                          </div>
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
                            autoComplete="new-password"
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
                            autoComplete="new-password"
                            data-testid="input-new-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="새 비밀번호 확인"
                            autoComplete="new-password"
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
                      </div>
                    </div>
                    
                    <div className="p-4 border border-orange-500/50 rounded-lg bg-orange-500/5">
                      <div className="flex items-start gap-3">
                        <LogOut className="h-5 w-5 text-orange-500 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-orange-600 dark:text-orange-400 mb-1">라이선스 삭제</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            이 기기에 저장된 라이선스를 삭제합니다.
                            <br />
                            <span className="text-xs">
                              • 삭제 후 다시 키를 입력하면 사용할 수 있습니다<br />
                              • 다른 기기에서도 같은 키로 사용할 수 있습니다
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
                            {isUnregistering ? "삭제 중..." : "라이선스 삭제"}
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

              <div className="p-4 border border-sky-500/50 rounded-lg bg-sky-500/5">
                <div className="flex items-start gap-3">
                  <FolderOpen className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="font-medium text-sky-700 dark:text-sky-400 mb-1">자동 백업</h4>
                      <p className="text-sm text-muted-foreground">
                        앱을 켤 때, 오늘이 속한 달을 포함해 지정한 개월만 남기고 그 이전 데이터를
                        지정 폴더에 아카이브한 뒤 삭제합니다. 파일은 「아카이브 불러오기」로 다시 합칠 수 있습니다.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">자동 백업 사용</p>
                        <p className="text-xs text-muted-foreground">폴더를 지정해야 실제로 실행됩니다</p>
                      </div>
                      <Switch
                        checked={formData.autoArchiveEnabled}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, autoArchiveEnabled: checked }))
                        }
                        data-testid="switch-auto-archive"
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="auto-archive-keep-months">남겨둘 기간 (개월)</Label>
                        <Input
                          id="auto-archive-keep-months"
                          type="number"
                          min={1}
                          max={24}
                          value={formData.autoArchiveKeepMonths}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              autoArchiveKeepMonths: clampAutoArchiveKeepMonths(e.target.value),
                            }))
                          }
                          className="w-[120px]"
                          data-testid="input-auto-archive-keep-months"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground pb-2">
                        {(() => {
                          const range = getAutoArchiveKeepRange(formData.autoArchiveKeepMonths);
                          return `오늘 기준 ${range.keepFromYm} ~ ${range.keepToYm}만 남기고, ${range.throughDate} 이전은 백업 후 삭제합니다.`;
                        })()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePickAutoArchiveFolder}
                        disabled={!canPickArchiveDirectory()}
                        data-testid="button-pick-auto-archive-folder"
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        백업 폴더 지정
                      </Button>
                      {autoArchiveFolderName && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleClearAutoArchiveFolder}
                          data-testid="button-clear-auto-archive-folder"
                        >
                          지정 해제
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRunAutoArchiveNow}
                        disabled={isAutoArchiving || !autoArchiveFolderName}
                        data-testid="button-run-auto-archive-now"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {isAutoArchiving ? "처리 중..." : "지금 실행"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {canPickArchiveDirectory()
                        ? autoArchiveFolderName
                          ? `지정된 폴더: ${autoArchiveFolderName}`
                          : "아직 폴더가 없습니다. Chrome/Edge에서 폴더를 지정하세요."
                        : "이 브라우저는 폴더 지정을 지원하지 않습니다. PC Chrome/Edge에서 지정하세요."}
                      <br />
                      · 파일명 예: {getArchiveBackupPrefix()}-archive-2025-12-03-to-2026-06-30.json
                      <br />
                      · 위 설정을 저장해야 다음 실행부터 자동으로 적용됩니다
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-emerald-500/50 rounded-lg bg-emerald-500/5">
                <div className="flex items-start gap-3">
                  <FolderOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                        마감 백업 파일 위치 (선택)
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        마감을 확정할 때마다 전체 데이터를 자동으로 백업합니다. 아래에서 파일을 하나
                        지정해두면 마감마다 그 파일 하나를 계속 덮어써서 용량이 쌓이지 않습니다.
                        지정하지 않으면(또는 지원하지 않는 기기라면) 영업일자가 들어간 새 파일로
                        매번 다운로드 폴더에 저장됩니다.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePickClosingBackupFile}
                        disabled={!canPickClosingBackupFile()}
                        data-testid="button-pick-closing-backup-file"
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        덮어쓸 파일 지정
                      </Button>
                      {closingBackupFileName && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleClearClosingBackupFile}
                          data-testid="button-clear-closing-backup-file"
                        >
                          지정 해제
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {canPickClosingBackupFile()
                        ? closingBackupFileName
                          ? `지정된 파일: ${closingBackupFileName} (마감마다 덮어씀)`
                          : "아직 지정된 파일이 없습니다. 지정하기 전까지는 마감마다 새 파일로 다운로드됩니다."
                        : "이 브라우저(안드로이드 태블릿 등)는 파일 지정을 지원하지 않아, 마감마다 새 파일로 다운로드됩니다. PC Chrome/Edge에서는 지정할 수 있습니다."}
                    </p>
                    <p className="text-xs text-muted-foreground border-t pt-2 mt-1">
                      💡 클라우드에도 이중 백업하려면: PC는 「구글 드라이브 데스크톱」을 설치한 뒤 위
                      파일을 그 동기화 폴더 안으로 지정하면 구글이 자동으로 업로드합니다. 안드로이드는
                      구글 드라이브 앱의 폴더 자동 업로드 기능을 다운로드 폴더에 연결해두면 됩니다.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-amber-500/50 rounded-lg bg-amber-500/5">
                <div className="flex items-start gap-3">
                  <Download className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="font-medium text-amber-700 dark:text-amber-400 mb-1">오래된 데이터 정리</h4>
                      <p className="text-sm text-muted-foreground">
                        선택한 영업일까지 데이터를 JSON으로 백업한 뒤, 같은 구간을 앱에서 삭제합니다.
                        이후 날짜만 남겨 앱을 가볍게 유지할 수 있습니다.
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        현재 데이터 기간:{" "}
                        {archiveRange.oldest && archiveRange.newest
                          ? `${archiveRange.oldest} ~ ${archiveRange.newest}`
                          : "기록 없음"}
                        <br />
                        · 입실 중(사용 중) 락커는 삭제하지 않습니다
                        <br />
                        · PC Chrome/Edge에서는 저장 폴더를 고를 수 있고, 그 외에는 다운로드 폴더로 저장됩니다
                        <br />
                        · 아카이브는 아래 &quot;아카이브 불러오기&quot;로 현재 데이터에 다시 합칠 수 있습니다
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="archive-through-date">이 날짜까지 백업 후 삭제</Label>
                        <Input
                          id="archive-through-date"
                          type="date"
                          value={archiveThroughDate}
                          onChange={(e) => {
                            const v = e.target.value;
                            setArchiveThroughDate(v);
                            updateArchivePreview(v);
                          }}
                          className="w-[180px]"
                          data-testid="input-archive-through-date"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          refreshArchiveRange();
                          updateArchivePreview(archiveThroughDate);
                        }}
                        data-testid="button-refresh-archive-preview"
                      >
                        건수 새로고침
                      </Button>
                      <Button
                        type="button"
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={handleOpenArchiveConfirm}
                        disabled={isArchiving || !archiveThroughDate}
                        data-testid="button-archive-purge"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {isArchiving ? "처리 중..." : "백업 후 삭제"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-amber-600 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                        onClick={() => archiveFileInputRef.current?.click()}
                        disabled={isMergingArchive}
                        data-testid="button-archive-merge"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {isMergingArchive ? "불러오는 중..." : "아카이브 불러오기"}
                      </Button>
                      <input
                        ref={archiveFileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleArchiveMergeFileSelect}
                        className="hidden"
                        data-testid="input-archive-merge-file"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                        onClick={() => window.open('/backup-tool.html', '_blank')}
                        data-testid="button-open-backup-tool"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        백업파일 도구 열기
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      백업파일이 다른 버전(구버전 등)과 호환되지 않거나, 빠진 구간을 병합용 파일로
                      바꿔야 할 때 「백업파일 도구」에서 손으로 편집하지 않고 안전하게 변환할 수 있습니다.
                    </p>
                    {archivePreview && (
                      <p className="text-xs text-muted-foreground">
                        대상 {archivePreview.total.toLocaleString()}건
                        {archivePreview.protectedInUse > 0
                          ? ` (입실 중 ${archivePreview.protectedInUse}건은 유지)`
                          : ""}
                        {archivePreview.total > 0
                          ? ` · 삭제 후 ${archiveThroughDate} 다음 날부터의 기록만 남습니다`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-4 border border-primary/50 rounded-lg bg-primary/5">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-primary mb-1">샘플 데이터 생성</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      현재 화면의 요금·정산·추가요금 모드 설정을 저장한 뒤, 그 설정대로 테스트 락커 데이터를 생성합니다.
                      (생성 전 별도 저장 버튼을 누르지 않아도 됩니다)
                      <br />
                      <span className="text-xs">
                        3·4번 방식에서는 정산 이전 입실(예: 정산 9시 → 8시 입실, 야간전환 시 야간요금) 시나리오 락커(#3·#4)도 포함됩니다.
                      </span>
                    </p>
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
                💡 팁: 데이터가 많아져 느려지면 위의 &quot;오래된 데이터 정리&quot;로 구간 백업 후 삭제하세요.
              </p>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Smart Locker Hardware Management */}
          <DeviceManagement />

          {/* 직원관리 (파트타임 설정·요일·시간별 시급·주급지급일을 서브 카테고리로 포함) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle>직원관리</CardTitle>
                    <CardDescription className="mt-0.5">근무 직원 등록과 파트타임 스케줄·시급·주급지급일을 관리합니다</CardDescription>
                  </div>
                </div>
                <Button size="sm" onClick={handleAddStaff} data-testid="button-add-staff">
                  <Plus className="h-4 w-4 mr-1" />
                  직원 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {staffList.filter(s => s.isActive).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">등록된 직원이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {staffList.filter(s => s.isActive).map(staff => (
                    <div key={staff.id} className="flex items-center justify-between gap-2 p-3 border rounded-md">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{staff.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {staff.phone && `${staff.phone}`}
                            {staff.phone && staff.hireDate && ` · `}
                            {staff.hireDate && `입사 ${staff.hireDate}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => handleEditStaff(staff)} data-testid={`button-edit-staff-${staff.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteStaff(staff.id, staff.name)} data-testid={`button-delete-staff-${staff.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 퇴사한 직원 — 없어도 항목 자체는 항상 보이고, 필요할 때만 펼쳐서 확인 */}
              <Collapsible open={showResignedStaff} onOpenChange={setShowResignedStaff}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover-elevate rounded-md px-2 py-1.5 -mx-2"
                    data-testid="button-toggle-resigned-staff"
                  >
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      퇴사한 직원 ({staffList.filter(s => !s.isActive).length}명)
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showResignedStaff ? "" : "-rotate-90"}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 pt-2">
                    {staffList.filter(s => !s.isActive).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">퇴사한 직원이 없습니다.</p>
                    ) : (
                      staffList.filter(s => !s.isActive).map(staff => (
                        <div key={staff.id} className="flex items-center justify-between gap-2 p-3 border rounded-md bg-muted/20">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{staff.name}</span>
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">퇴사</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {staff.hireDate && `입사 ${staff.hireDate}`}
                              {staff.hireDate && staff.resignDate && ` · `}
                              {staff.resignDate && `퇴사 ${staff.resignDate}`}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" onClick={() => handleEditStaff(staff)} data-testid={`button-edit-staff-${staff.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteStaff(staff.id, staff.name)} data-testid={`button-delete-staff-${staff.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* 서브 카테고리: 파트타임 설정 */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-medium flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    파트타임 설정
                  </h4>
                  <Button size="sm" onClick={handleAddTemplate} disabled={staffList.length === 0} data-testid="button-add-template">
                    <Plus className="h-4 w-4 mr-1" />
                    파트타임 추가
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">요일별 반복되는 근무 슬롯을 등록합니다. 같은 요일·시간에 근무자를 여러 명 묶을 수 있습니다. 근무다이어리 달력에 자동으로 반영됩니다.</p>
                {staffList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">먼저 위에서 직원을 등록해주세요.</p>
                ) : templateGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">등록된 파트타임이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {templateGroups.map((g, i) => {
                      const availableToAdd = staffList.filter(s => !g.members.some(m => m.staffId === s.id));
                      return (
                        <div key={g.groupId} className="p-3 border rounded-md space-y-2" data-testid={`group-template-${g.groupId}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-sm">
                              <span className="font-medium">{g.label || `파트타임${i + 1}`}</span>
                              <span className="text-muted-foreground"> · {formatDaysKorean(g.daysOfWeek)} · </span>
                              <span className="font-mono">{g.startTime}~{g.endTime}</span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="icon" variant="ghost" onClick={() => handleEditTemplateGroup(g)} data-testid={`button-edit-template-${g.groupId}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDeleteTemplateGroup(g.groupId)} data-testid={`button-delete-template-${g.groupId}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-muted-foreground mr-0.5">근무자</span>
                            {g.members.map(m => {
                              const staff = staffList.find(s => s.id === m.staffId);
                              return (
                                <span key={m.templateId} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border bg-muted/40 text-xs">
                                  {staff?.name ?? "(삭제됨)"}
                                  <button
                                    onClick={() => handleRemoveTemplateMember(m.templateId, g.members.length, staff?.name ?? "")}
                                    className="rounded-full hover-elevate p-0.5"
                                    data-testid={`button-remove-member-${m.templateId}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })}
                            {availableToAdd.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={() => handleOpenAddMember(g.groupId)}
                                data-testid={`button-add-member-${g.groupId}`}
                              >
                                <Plus className="h-3 w-3 mr-0.5" />
                                근무자 추가
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 서브 카테고리: 요일·시간별 시급 */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-medium flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    요일·시간별 시급
                  </h4>
                  <Button size="sm" onClick={handleAddTier} data-testid="button-add-tier">
                    <Plus className="h-4 w-4 mr-1" />
                    시급 구간 추가
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  위에 있는 구간이 먼저 적용됩니다(우선순위). 예: "휴일야간"을 "평일야간"보다 위에 두면 금·토요일 밤에는 자동으로 휴일야간 시급이 적용됩니다.
                </p>
                {wageTiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">등록된 시급 구간이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {wageTiers.map((t, i) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 p-3 border rounded-md flex-wrap">
                        <div className="text-sm">
                          <span className="text-xs text-muted-foreground mr-1">#{i + 1}</span>
                          <span className="font-medium">{t.name}</span>
                          <span className="text-muted-foreground"> · {formatDaysKorean(t.daysOfWeek)}{t.includeHolidays ? "+공휴일" : ""} · </span>
                          <span className="font-mono">{t.startTime}~{t.endTime}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className="font-semibold text-primary">₩{t.hourlyRate.toLocaleString()}/h</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" onClick={() => handleMoveTier(t.id, "up")} disabled={i === 0} data-testid={`button-tier-up-${t.id}`}>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleMoveTier(t.id, "down")} disabled={i === wageTiers.length - 1} data-testid={`button-tier-down-${t.id}`}>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleEditTier(t)} data-testid={`button-edit-tier-${t.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDeleteTier(t.id)} data-testid={`button-delete-tier-${t.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 서브 카테고리: 근무자별 주급지급일 */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="font-medium flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  근무자별 주급지급일
                </h4>
                <p className="text-xs text-muted-foreground">지급 요일·시각 30분 전에 근무다이어리에서 알림이 표시됩니다.</p>
                {staffList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">먼저 위에서 직원을 등록해주세요.</p>
                ) : (
                  <div className="space-y-2">
                    {staffList.map(staff => {
                      const payday = staffPaydays.find(p => p.staffId === staff.id);
                      const dayOfWeek = payday?.dayOfWeek ?? 4;
                      const time = payday?.time ?? "22:00";
                      const isEnabled = payday?.isEnabled ?? false;
                      return (
                        <div key={staff.id} className="flex items-center gap-3 p-3 border rounded-md flex-wrap">
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked) => handleSavePayday(staff.id, { dayOfWeek, time, isEnabled: checked })}
                            data-testid={`switch-payday-${staff.id}`}
                          />
                          <span className="font-medium text-sm w-16 shrink-0">{staff.name}</span>
                          <Select
                            value={String(dayOfWeek)}
                            onValueChange={(v) => handleSavePayday(staff.id, { dayOfWeek: parseInt(v), time, isEnabled })}
                          >
                            <SelectTrigger className="w-24" data-testid={`select-payday-dow-${staff.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DOW_LABELS.map((label, idx) => (
                                <SelectItem key={idx} value={String(idx)}>{label}요일</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="w-32">
                            <TimePickerButton
                              value={time}
                              onChange={(v) => handleSavePayday(staff.id, { dayOfWeek, time: v, isEnabled })}
                              label={`${staff.name} 주급지급 시각`}
                              testId={`input-payday-time-${staff.id}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
                  type="text"
                  value={groupFormData.startNumber}
                  onChange={(e) => setGroupFormData({ ...groupFormData, startNumber: parseInt(e.target.value) || 1 })}
                  data-testid="input-start-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-number">종료 번호</Label>
                <Input
                  id="end-number"
                  type="text"
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
                    type="text"
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
                    type="text"
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
                  type="text"
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
                type="text"
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

      {/* Archive backup + purge Confirmation */}
      <AlertDialog open={archiveConfirmOpen} onOpenChange={(open) => !isArchiving && setArchiveConfirmOpen(open)}>
        <AlertDialogContent data-testid="dialog-archive-purge-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              오래된 데이터 백업 후 삭제
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">{archiveThroughDate}</strong>까지의 운영 데이터를
                  먼저 파일로 저장한 뒤, 앱에서 삭제합니다.
                </p>
                {archivePreview && (
                  <p>
                    대상 약 <strong className="text-foreground">{archivePreview.total.toLocaleString()}</strong>건
                    {archivePreview.protectedInUse > 0
                      ? ` (입실 중 ${archivePreview.protectedInUse}건은 삭제하지 않음)`
                      : ""}
                  </p>
                )}
                <p>
                  저장 위치를 묻는 창이 뜨면 원하는 폴더를 선택하세요.
                  (지원되지 않으면 다운로드 폴더로 저장됩니다)
                </p>
                <p className="text-destructive font-medium">
                  파일 저장을 취소하면 삭제도 진행되지 않습니다. 삭제 후에는 앱에 해당 구간 데이터가 남지 않습니다.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleArchiveBackupAndPurge();
              }}
              disabled={isArchiving}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-archive-purge-confirm"
            >
              {isArchiving ? "처리 중..." : "백업 후 삭제 실행"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive merge Confirmation */}
      <AlertDialog
        open={archiveMergeConfirmOpen}
        onOpenChange={(open) => {
          if (isMergingArchive) return;
          setArchiveMergeConfirmOpen(open);
          if (!open) {
            setArchiveMergeFileData(null);
            setArchiveMergePreview(null);
          }
        }}
      >
        <AlertDialogContent data-testid="dialog-archive-merge-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-amber-600" />
              아카이브 불러오기 확인
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  구간 아카이브를 <strong className="text-foreground">현재 데이터에 합칩니다.</strong>
                  지금 있는 입실·설정은 지우지 않습니다.
                </p>
                {archiveMergePreview?.success && (
                  <>
                    <p>
                      구간:{" "}
                      {archiveMergePreview.archiveFrom
                        ? `${archiveMergePreview.archiveFrom} ~ ${archiveMergePreview.archiveThrough || "?"}`
                        : `~${archiveMergePreview.archiveThrough || "?"}`}
                      {archiveMergePreview.exportDate
                        ? ` · 백업 시각 ${new Date(archiveMergePreview.exportDate).toLocaleString('ko-KR')}`
                        : ""}
                    </p>
                    <p>
                      파일 내 약{" "}
                      <strong className="text-foreground">
                        {(archiveMergePreview.total || 0).toLocaleString()}
                      </strong>
                      건 (이미 있는 동일 기록은 건너뜀)
                    </p>
                  </>
                )}
                <p className="text-amber-700 dark:text-amber-400">
                  합치면 DB가 다시 커져 앱이 조금 느려질 수 있습니다. 확인 후 다시 &quot;백업 후 삭제&quot;로 가볍게 만들 수 있습니다.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMergingArchive}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmArchiveMerge();
              }}
              disabled={isMergingArchive}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-archive-merge-confirm"
            >
              {isMergingArchive ? "불러오는 중..." : "합쳐서 불러오기"}
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
          refreshArchiveRange();
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
              placeholder="XXXX-XXXX-XXXX-XXXX"
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

      {/* 직원 추가/수정 Dialog */}
      <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "직원 정보 수정" : "직원 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">

            {/* 직원 사진 */}
            <div className="space-y-2">
              <Label>직원 사진</Label>
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {staffPhotoPreview ? (
                    <div className="relative">
                      <img
                        src={staffPhotoPreview}
                        alt="직원 사진"
                        className="w-20 h-20 rounded-full object-cover border-2 border-border"
                        data-testid="img-staff-photo-preview"
                      />
                      <button
                        type="button"
                        onClick={() => setStaffPhotoPreview("")}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        data-testid="button-remove-staff-photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => staffFileInputRef.current?.click()}
                    data-testid="button-upload-staff-photo"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    파일 선택
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => staffCameraInputRef.current?.click()}
                    data-testid="button-camera-staff-photo"
                  >
                    <Camera className="h-3.5 w-3.5 mr-1.5" />
                    카메라 촬영
                  </Button>
                  <p className="text-xs text-muted-foreground">최대 300×300px로 자동 조정</p>
                </div>
              </div>
              <input
                ref={staffFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleStaffPhotoFile}
                data-testid="input-staff-photo-file"
              />
              <input
                ref={staffCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleStaffPhotoFile}
                data-testid="input-staff-photo-camera"
              />
            </div>

            <div className="border-t pt-3" />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="staff-name">이름 *</Label>
                <Input
                  id="staff-name"
                  value={staffFormData.name}
                  onChange={e => setStaffFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="직원 이름"
                  data-testid="input-staff-name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="staff-phone">전화번호</Label>
                <Input
                  id="staff-phone"
                  type="text"
                  value={staffFormData.phone}
                  onChange={e => setStaffFormData(f => ({ ...f, phone: e.target.value }))}
                  placeholder="010-0000-0000"
                  data-testid="input-staff-phone"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="staff-hire-date">입사일</Label>
                <Input
                  id="staff-hire-date"
                  type="date"
                  value={staffFormData.hireDate}
                  onChange={e => setStaffFormData(f => ({ ...f, hireDate: e.target.value }))}
                  data-testid="input-staff-hire-date"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="staff-resign-date">퇴사일 (선택)</Label>
                <Input
                  id="staff-resign-date"
                  type="date"
                  value={staffFormData.resignDate}
                  onChange={e => setStaffFormData(f => ({ ...f, resignDate: e.target.value, isActive: !e.target.value }))}
                  data-testid="input-staff-resign-date"
                />
              </div>
            </div>
            {staffFormData.resignDate && (
              <p className="text-xs text-muted-foreground -mt-2">
                {staffFormData.resignDate} 이후로는 근무다이어리에 근무가 표시되지 않고, 직원 목록에서 "퇴사한 직원"으로 분류됩니다.
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="staff-address">주소</Label>
              <Input
                id="staff-address"
                type="text"
                value={staffFormData.address}
                onChange={e => setStaffFormData(f => ({ ...f, address: e.target.value }))}
                placeholder="주소 입력"
                data-testid="input-staff-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="staff-pin">PIN (4자리)</Label>
                <Input
                  id="staff-pin"
                  type="text"
                  maxLength={4}
                  value={staffFormData.pin}
                  onChange={e => setStaffFormData(f => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  placeholder="0000"
                  data-testid="input-staff-pin"
                />
              </div>
              <div className="space-y-1">
                <Label>재직 상태</Label>
                <div className="flex items-center h-9">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      staffFormData.isActive
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid="text-staff-active-status"
                  >
                    {staffFormData.isActive ? "재직 중" : "퇴사"}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-notes">메모</Label>
              <Input
                id="staff-notes"
                type="text"
                value={staffFormData.notes}
                onChange={e => setStaffFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="특이사항 입력"
                data-testid="input-staff-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStaffDialogOpen(false)}>취소</Button>
            <Button onClick={handleSaveStaff} data-testid="button-save-staff">
              {editingStaff ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파트타임 설정 다이얼로그 */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroupId ? "파트타임 수정" : "파트타임 추가"}</DialogTitle>
            <DialogDescription>
              {editingGroupId
                ? "이름·요일·시간을 수정합니다. 근무자는 목록의 근무자 칩에서 추가·제외할 수 있습니다."
                : "요일별로 반복되는 근무 슬롯을 등록하세요. 같은 요일·시간에 근무자를 여러 명 선택하면 한 슬롯에 함께 묶여 등록됩니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>이름 (선택)</Label>
              <Input
                value={templateForm.label}
                onChange={(e) => setTemplateForm(f => ({ ...f, label: e.target.value }))}
                placeholder={`예: 파트타임${templateGroups.length + 1}`}
                data-testid="input-template-label"
              />
            </div>
            {!editingGroupId && (
              <div className="space-y-2">
                <Label>근무자 (여러 명 선택 가능)</Label>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  value={templateForm.staffIds}
                  onValueChange={(v: string[]) => setTemplateForm(f => ({ ...f, staffIds: v }))}
                  className="flex-wrap justify-start"
                >
                  {staffList.map(s => (
                    <ToggleGroupItem key={s.id} value={s.id} data-testid={`toggle-template-staff-${s.id}`}>{s.name}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
            <div className="space-y-2">
              <Label>요일 (여러 개 선택 가능)</Label>
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={templateForm.daysOfWeek.map(String)}
                onValueChange={(v: string[]) => setTemplateForm(f => ({ ...f, daysOfWeek: v.map(Number) }))}
                className="flex-wrap justify-start"
              >
                {DOW_LABELS.map((label, idx) => (
                  <ToggleGroupItem key={idx} value={String(idx)} data-testid={`toggle-template-dow-${idx}`}>{label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>시작 시간</Label>
                <TimePickerButton value={templateForm.startTime} onChange={(v) => setTemplateForm(f => ({ ...f, startTime: v }))} label="시작 시간" testId="input-template-start" />
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <TimePickerButton value={templateForm.endTime} onChange={(v) => setTemplateForm(f => ({ ...f, endTime: v }))} label="종료 시간" testId="input-template-end" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>취소</Button>
            <Button onClick={handleSaveTemplate} data-testid="button-save-template">
              {editingGroupId ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파트타임 근무자 추가 다이얼로그 */}
      <Dialog open={!!addMemberGroupId} onOpenChange={(o) => !o && setAddMemberGroupId(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>근무자 추가</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={addMemberStaffId} onValueChange={setAddMemberStaffId}>
              <SelectTrigger data-testid="select-add-member-staff"><SelectValue placeholder="근무자 선택" /></SelectTrigger>
              <SelectContent>
                {staffList
                  .filter(s => !templateGroups.find(g => g.groupId === addMemberGroupId)?.members.some(m => m.staffId === s.id))
                  .map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberGroupId(null)}>취소</Button>
            <Button onClick={handleSaveAddMember} disabled={!addMemberStaffId} data-testid="button-save-add-member">추가</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파트타임 그룹 전체 삭제 확인 */}
      <AlertDialog open={!!deleteGroupTarget} onOpenChange={(o) => !o && setDeleteGroupTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>파트타임 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 파트타임을 삭제하시겠습니까?<br />
              등록된 근무자 전원이 함께 제거되고, 지금까지 근무다이어리에 기록된 대체근무 내역도 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteTemplateGroup} data-testid="button-confirm-delete-template-group">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 파트타임 근무자 제외 확인 */}
      <AlertDialog open={!!removeMemberTarget} onOpenChange={(o) => !o && setRemoveMemberTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removeMemberTarget && removeMemberTarget.memberCount <= 1 ? "파트타임 삭제" : "근무자 제외"}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeMemberTarget && removeMemberTarget.memberCount <= 1 ? (
                <>이 파트타임을 삭제하시겠습니까?<br />지금까지 근무다이어리에 기록된 대체근무 내역도 함께 삭제됩니다.</>
              ) : (
                <>{removeMemberTarget?.staffName}님을 이 파트타임에서 제외하시겠습니까?<br />지금까지 근무다이어리에 기록된 이 근무자의 대체근무 내역도 함께 삭제됩니다.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemoveMember} data-testid="button-confirm-remove-member">
              {removeMemberTarget && removeMemberTarget.memberCount <= 1 ? "삭제" : "제외"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 요일·시간별 시급 다이얼로그 */}
      <Dialog open={isTierDialogOpen} onOpenChange={setIsTierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTier ? "시급 구간 수정" : "시급 구간 추가"}</DialogTitle>
            <DialogDescription>목록에서 위에 있을수록 먼저 적용됩니다(우선순위).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                value={tierForm.name}
                onChange={(e) => setTierForm(f => ({ ...f, name: e.target.value }))}
                placeholder="예: 주간, 평일야간, 휴일야간"
                data-testid="input-tier-name"
              />
            </div>
            <div className="space-y-2">
              <Label>적용 요일</Label>
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={tierForm.daysOfWeek.map(String)}
                onValueChange={(v: string[]) => setTierForm(f => ({ ...f, daysOfWeek: v.map(Number) }))}
                className="flex-wrap justify-start"
              >
                {DOW_LABELS.map((label, idx) => (
                  <ToggleGroupItem key={idx} value={String(idx)} data-testid={`toggle-tier-dow-${idx}`}>{label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">공휴일도 포함</Label>
                <p className="text-xs text-muted-foreground">요일과 상관없이 공휴일이면 이 시급 적용</p>
              </div>
              <Switch
                checked={tierForm.includeHolidays}
                onCheckedChange={(checked) => setTierForm(f => ({ ...f, includeHolidays: checked }))}
                data-testid="switch-tier-holidays"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>시작 시간</Label>
                <TimePickerButton value={tierForm.startTime} onChange={(v) => setTierForm(f => ({ ...f, startTime: v }))} label="시작 시간" testId="input-tier-start" />
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <TimePickerButton value={tierForm.endTime} onChange={(v) => setTierForm(f => ({ ...f, endTime: v }))} label="종료 시간" testId="input-tier-end" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>시급 (원)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={tierForm.hourlyRate}
                onChange={(e) => setTierForm(f => ({ ...f, hourlyRate: e.target.value.replace(/[^0-9]/g, "") }))}
                placeholder="예: 14000"
                data-testid="input-tier-rate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTierDialogOpen(false)}>취소</Button>
            <Button onClick={handleSaveTier} data-testid="button-save-tier">
              {editingTier ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Simple Pattern Lock component for pattern change (no verification)
function PatternLockForChange({ onPatternComplete }: { onPatternComplete: (pattern: number[]) => void }) {
  const { isDark } = useTheme();
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

    const idleStroke = isDark ? "#475569" : "hsl(var(--border))";
    const activeStroke = isDark ? "#2563EB" : "hsl(var(--primary))";
    const innerFill = isDark ? "#FFFFFF" : "hsl(var(--primary-foreground))";
    
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
      
      ctx.strokeStyle = activeStroke;
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
        ctx.fillStyle = activeStroke;
        ctx.fill();
      }
      ctx.strokeStyle = isSelected ? activeStroke : idleStroke;
      ctx.lineWidth = 3;
      ctx.stroke();
      
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotSize / 4, 0, Math.PI * 2);
        ctx.fillStyle = innerFill;
        ctx.fill();
      }
    }
  }, [pattern, isDrawing, touchPosition, isDark]);
  
  return (
    <div
      className={isDark ? "relative rounded-2xl bg-slate-100 p-3 shadow-inner" : "relative"}
      style={{ width: canvasSize + (isDark ? 24 : 0), height: canvasSize + (isDark ? 24 : 0) }}
    >
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
