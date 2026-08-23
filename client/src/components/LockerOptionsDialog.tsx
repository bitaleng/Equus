import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { calculateAdditionalFee, getBusinessDay, getBasePrice, getSettlementCycleOptions, getStagedHourlyOptions, getNightstartOptions, getForeignerPrice, getDomesticAdditionalFeeModeNumber, countNightFeeStayDays } from "@shared/businessDay";
import type { DomesticAdditionalFeeMode } from "@shared/businessDay";
import * as localDb from "@/lib/localDb";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, X, Pencil, Minus, Plus, Info, Calendar as CalendarIcon, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ko } from "date-fns/locale";

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 입실~예정퇴실 기준 요금 일수 (24시간 단위 올림, 최소 1일) */
function calcLongTermStayDays(entry: Date, checkout: Date): number {
  const ms = checkout.getTime() - entry.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function formatStayDuration(entry: Date, checkout: Date): string {
  const ms = Math.max(0, checkout.getTime() - entry.getTime());
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}일`);
  if (hours > 0) parts.push(`${hours}시간`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}분`);
  return parts.join(' ');
}

function isSimpleSaleItem(item: { billingType?: string; depositAmount?: number }): boolean {
  if (item.billingType === "simple") return true;
  if (item.billingType === "rental") return false;
  return (item.depositAmount || 0) === 0;
}

/** 메모 마커: 단순판매 → [이름] 판매: / 대여형 → [이름] 대여: */
function memoActionMarker(itemName: string, isSimple: boolean): string {
  return `[${itemName}] ${isSimple ? "판매" : "대여"}:`;
}

function LabelHint({
  children,
  content,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex items-center gap-2 rounded-sm text-left cursor-help", className)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        className="z-[80] max-w-[17rem] whitespace-pre-wrap text-xs leading-relaxed"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

const LONGTERM_CALENDAR_CLASSNAMES = {
  months: "flex flex-col",
  caption_label: "text-sm font-semibold",
  table: "w-full border-collapse",
  head_cell: "text-muted-foreground rounded-md w-9 font-medium text-[11px]",
  cell: "h-9 w-9 text-center text-sm p-0 relative",
  day: "h-9 w-9 p-0 font-semibold rounded-lg aria-selected:opacity-100",
};

function formatKoreanDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const hour24 = d.getHours();
  const ampm = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${weekday}) ${ampm} ${pad(hour12)}:${pad(d.getMinutes())}`;
}

/** datetime-local과 동일한 "YYYY-MM-DDTHH:mm" 문자열을 다루는 커스텀 날짜·시간 선택기 (달력 팝오버 + 시간 입력). */
function DateTimePickerField({
  id,
  value,
  onChange,
  className,
  testId,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = datetimeLocalToDate(value);
  const [pendingDate, setPendingDate] = useState<Date | undefined>(parsed || undefined);
  const [pendingTime, setPendingTime] = useState<string>(() => {
    if (!parsed) return "12:00";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  });

  useEffect(() => {
    if (!open) return;
    const d = datetimeLocalToDate(value);
    setPendingDate(d || undefined);
    const pad = (n: number) => String(n).padStart(2, "0");
    setPendingTime(d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "12:00");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (date: Date | undefined, time: string) => {
    if (!date) return;
    const [h, m] = time.split(":").map((n) => parseInt(n, 10) || 0);
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
    onChange(toDatetimeLocalValue(next.toISOString()));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            "flex h-11 w-full items-center gap-2 rounded-xl border border-input bg-background px-3 text-left ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 locker-opt-longterm-input locker-opt-datetime-trigger",
            className
          )}
          data-testid={testId}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
          <span className="truncate">
            {parsed ? formatKoreanDateTime(parsed) : "날짜·시간 선택"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[80] w-auto rounded-2xl p-3">
        <Calendar
          mode="single"
          locale={ko}
          selected={pendingDate}
          onSelect={(d) => {
            setPendingDate(d);
            commit(d, pendingTime);
          }}
          className="rounded-xl p-0"
          classNames={LONGTERM_CALENDAR_CLASSNAMES}
        />
        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="time"
            value={pendingTime}
            onChange={(e) => {
              setPendingTime(e.target.value);
              commit(pendingDate, e.target.value);
            }}
            className="locker-opt-time-input flex-1"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isUnresolvedRentalTxn(
  txn: { itemId: string; returnCompleted?: number; depositAmount?: number },
  items: Array<{ id: string; billingType?: string; depositAmount?: number }>,
  returnCompletedItems: Set<string>
): boolean {
  if (returnCompletedItems.has(txn.itemId) || txn.returnCompleted === 1) return false;
  const item = items.find((i) => i.id === txn.itemId);
  if (item) return !isSimpleSaleItem(item);
  // 설정에서 항목이 삭제된 경우: 보증금 있으면 대여 회수 대상으로 간주
  return (txn.depositAmount || 0) > 0;
}

interface RentalItemInfo {
  itemId: string;
  itemName: string;
  rentalFee: number;
  depositAmount: number;
  depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
  paymentMethod: 'cash' | 'card' | 'transfer';
  isCashReceipt?: boolean;
  vatAppliedRentalFee?: number;
  vatAppliedDepositAmount?: number;
  quantity?: number;
}

interface LockerOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  lockerNumber: number;
  basePrice: number;
  timeType: '주간' | '야간';
  entryTime?: string;
  currentNotes?: string;
  currentPaymentMethod?: 'card' | 'cash' | 'transfer';
  currentPaymentCash?: number;
  currentPaymentCard?: number;
  currentPaymentTransfer?: number;
  currentOptionType?: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free';
  currentOptionAmount?: number;
  currentFinalPrice?: number;
  discountAmount?: number;
  foreignerPrice?: number;
  isInUse?: boolean;
  dayPrice?: number;
  nightPrice?: number;
  currentLockerLogId?: string;
  currentDeferredPayment?: boolean; // 현재 후불결제 상태
  currentCustomerMemo?: string; // 현재 손님 메모
  currentNoAdditionalFee?: boolean; // 현재 추가요금없음 상태
  currentPrepaidAdditionalFee?: number; // 현재 선지급 추가요금
  currentIsCashReceipt?: boolean; // 현재 현금영수증 발행 여부
  currentAdditionalFeePaymentMethod?: 'card' | 'cash' | 'transfer'; // 현재 추가요금 결제방식
  isOuting?: boolean; // 현재 외출 중 여부
  currentIsStaff?: boolean; // 현재 직원 입실 여부
  currentIsLongTerm?: boolean; // 현재 장기투숙 여부
  currentPlannedCheckoutAt?: string; // 장기투숙 예정 퇴실 (ISO)
  currentLongTermDailyFee?: number;
  currentLongTermDiscount?: number;
  onToggleOuting?: (newIsOuting: boolean, newMemo: string) => void; // 외출/복귀 토글 콜백
  onApply: (option: string, customAmount?: number, notes?: string, paymentMethod?: 'card' | 'cash' | 'transfer', rentalItems?: RentalItemInfo[], paymentCash?: number, paymentCard?: number, paymentTransfer?: number, deferredPayment?: boolean, customerMemo?: string, noAdditionalFee?: boolean, prepaidAdditionalFee?: number, isCashReceipt?: boolean, additionalFeePaymentMethod?: 'card' | 'cash' | 'transfer', isStaff?: boolean, editedEntryTime?: string, longTermStay?: {
    plannedCheckoutAt: string;
    dailyFee: number;
    discount: number;
    stayDays: number;
  } | null) => void;
  onCheckout: (
    paymentMethod: 'card' | 'cash' | 'transfer', 
    rentalItems?: RentalItemInfo[], 
    paymentCash?: number, 
    paymentCard?: number, 
    paymentTransfer?: number,
    additionalFeePayment?: {
      method: 'card' | 'cash' | 'transfer';
      cash?: number;
      card?: number;
      transfer?: number;
      discount?: number;
    },
    customerMemo?: string,
    refundAmount?: number,
    refundNote?: string,
    refundMethod?: 'cash' | 'card' | 'transfer',
    exitTimeISO?: string
  ) => void;
  onCancel: () => void;
  onSwap?: (fromLocker: number, toLocker: number) => void;
  onPaymentComplete?: () => void; // 후불결제 완료 시 데이터 새로고침용 콜백
  onMinimize?: () => void; // 최소화 버튼 콜백 (팝업 워크스페이스용)
}

/** DB에 저장된(VAT 포함 가능) 분리결제 금액을 입력칸용 기본금액으로 변환 */
function splitAmountsToBaseFields(
  cash: number | undefined,
  card: number | undefined,
  transfer: number | undefined,
  opts: {
    enableCardVat: boolean;
    cashHadVat: boolean;
    transferHadVat: boolean;
    expectedBaseTotal?: number;
  }
): { cash: string; card: string; transfer: string } {
  const c = cash || 0;
  const k = card || 0;
  const t = transfer || 0;
  const rawSum = c + k + t;
  const expected = opts.expectedBaseTotal;

  const strip = (cc: number, kk: number, tt: number) => {
    const bc = opts.cashHadVat && cc > 0 ? Math.round(cc / 1.1) : cc;
    const bk = opts.enableCardVat && kk > 0 ? Math.round(kk / 1.1) : kk;
    const bt = opts.transferHadVat && tt > 0 ? Math.round(tt / 1.1) : tt;
    return { bc, bk, bt, sum: bc + bk + bt };
  };

  // 이미 기본금액만 저장된 경우 (합계 ≈ 기본요금)
  if (expected != null && expected > 0 && Math.abs(rawSum - expected) <= 1) {
    return {
      cash: c > 0 ? String(c) : "",
      card: k > 0 ? String(k) : "",
      transfer: t > 0 ? String(t) : "",
    };
  }

  const normal = strip(c, k, t);
  if (expected == null || expected <= 0 || Math.abs(normal.sum - expected) <= 1) {
    return {
      cash: normal.bc > 0 ? String(normal.bc) : "",
      card: normal.bk > 0 ? String(normal.bk) : "",
      transfer: normal.bt > 0 ? String(normal.bt) : "",
    };
  }

  // 현금↔카드가 뒤바뀐 저장값 복구 (VAT 포함 카드액이 현금칸에 들어간 경우)
  const swapped = strip(k, c, t);
  if (Math.abs(swapped.sum - expected) <= 1) {
    return {
      cash: swapped.bc > 0 ? String(swapped.bc) : "",
      card: swapped.bk > 0 ? String(swapped.bk) : "",
      transfer: swapped.bt > 0 ? String(swapped.bt) : "",
    };
  }

  return {
    cash: normal.bc > 0 ? String(normal.bc) : "",
    card: normal.bk > 0 ? String(normal.bk) : "",
    transfer: normal.bt > 0 ? String(normal.bt) : "",
  };
}

/** 입력칸 기본금액 → DB 저장용(수단별 VAT 1회 적용) */
function applyVatToSplitBases(
  cashBase: number,
  cardBase: number,
  transferBase: number,
  opts: { enableCardVat: boolean; enableCashReceiptVat: boolean; isCashReceipt: boolean }
): { cash?: number; card?: number; transfer?: number } {
  let cashVal: number | undefined;
  let cardVal: number | undefined;
  let transferVal: number | undefined;

  if (opts.enableCashReceiptVat && opts.isCashReceipt) {
    if (cashBase > 0) cashVal = Math.round(cashBase * 1.1);
    if (transferBase > 0) transferVal = Math.round(transferBase * 1.1);
  } else {
    if (cashBase > 0) cashVal = cashBase;
    if (transferBase > 0) transferVal = transferBase;
  }

  if (opts.enableCardVat && cardBase > 0) {
    cardVal = Math.round(cardBase * 1.1);
  } else if (cardBase > 0) {
    cardVal = cardBase;
  }

  return { cash: cashVal, card: cardVal, transfer: transferVal };
}

export default function LockerOptionsDialog({
  open,
  onClose,
  lockerNumber,
  basePrice,
  timeType,
  entryTime,
  currentNotes = "",
  currentPaymentMethod = 'cash',
  currentPaymentCash,
  currentPaymentCard,
  currentPaymentTransfer,
  currentOptionType = 'none',
  currentOptionAmount,
  currentFinalPrice,
  discountAmount = 2000,
  foreignerPrice = 25000,
  isInUse = false,
  dayPrice = 10000,
  nightPrice = 15000,
  currentLockerLogId,
  currentDeferredPayment = false, // 현재 후불결제 상태
  currentCustomerMemo = "", // 현재 손님 메모
  currentNoAdditionalFee = false, // 현재 추가요금없음 상태
  currentPrepaidAdditionalFee = 0, // 현재 선지급 추가요금
  currentIsCashReceipt = false, // 현재 현금영수증 발행 여부
  currentAdditionalFeePaymentMethod, // 현재 추가요금 결제방식
  isOuting = false, // 현재 외출 중 여부
  currentIsStaff = false,
  currentIsLongTerm = false,
  currentPlannedCheckoutAt,
  currentLongTermDailyFee,
  currentLongTermDiscount,
  onToggleOuting,
  onApply,
  onCheckout,
  onCancel,
  onSwap,
  onPaymentComplete,
  onMinimize,
}: LockerOptionsDialogProps) {
  // Load settings
  const settings = localDb.getSettings();
  const domesticCheckpointHour = settings.domesticCheckpointHour;
  const foreignerAdditionalFeePeriod = settings.foreignerAdditionalFeePeriod;
  const domesticAdditionalFeeMode: DomesticAdditionalFeeMode =
    (settings as any).domesticAdditionalFeeMode === 'pending4'
      ? 'stagedHourly'
      : ((settings as any).domesticAdditionalFeeMode || 'nextday');
  const domesticAdditionalFeeModeNumber = getDomesticAdditionalFeeModeNumber(domesticAdditionalFeeMode);
  const nightStartHour = parseInt(((settings as any).nightStartTime || '19:00').split(':')[0], 10);
  const settlementCycleOpts = getSettlementCycleOptions(settings as any);
  const stagedHourlyOpts = getStagedHourlyOptions(settings as any);
  const nightstartOpts = getNightstartOptions(settings as any);
  const enableDiscountOption = settings.enableDiscountOption !== false; // 기본값 true
  const enableForeignerOption = settings.enableForeignerOption !== false; // 기본값 true
  const enableDirectPriceOption = settings.enableDirectPriceOption !== false; // 기본값 true
  const enableStaffOption = settings.enableStaffOption !== false; // 기본값 true
  const enableFreeEntryOption = settings.enableFreeEntryOption !== false; // 기본값 true
  const enableLongTermOption = settings.enableLongTermOption !== false; // 기본값 true
  const enableCashReceiptVat = settings.enableCashReceiptVat === true; // 기본값 false
  const enableCardVat = settings.enableCardVat === true; // 기본값 false
  const resolveForeignerPrice = (tt: '주간' | '야간') =>
    getForeignerPrice(tt, {
      foreignerSeparateDayNight: (settings as any).foreignerSeparateDayNight === true,
      foreignerPrice: foreignerPrice ?? (settings as any).foreignerPrice,
      foreignerDayPrice: (settings as any).foreignerDayPrice,
      foreignerNightPrice: (settings as any).foreignerNightPrice,
    });
  const [discountOption, setDiscountOption] = useState<string>("none");
  const [discountInputAmount, setDiscountInputAmount] = useState<string>("");
  const [isForeigner, setIsForeigner] = useState(false);
  const [isFreeEntry, setIsFreeEntry] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [isLongTerm, setIsLongTerm] = useState(false);
  const [longTermCheckoutLocal, setLongTermCheckoutLocal] = useState("");
  const [longTermDailyFee, setLongTermDailyFee] = useState("");
  const [longTermDiscount, setLongTermDiscount] = useState("");
  const [noAdditionalFee, setNoAdditionalFee] = useState(false); // 추가요금없음 (VIP 등)
  const [hasPrepaidAdditionalFee, setHasPrepaidAdditionalFee] = useState(false); // 추가요금 선지급 체크박스
  const [prepaidAdditionalFeeAmount, setPrepaidAdditionalFeeAmount] = useState<string>(""); // 추가요금 선지급 금액
  const [prepaidAdditionalFeePaymentMethod, setPrepaidAdditionalFeePaymentMethod] = useState<'card' | 'cash' | 'transfer' | null>(null); // 선지급 별도 결제방식 (null=주결제방식과 동일)
  const [isDirectPrice, setIsDirectPrice] = useState(false);
  const [directPrice, setDirectPrice] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'transfer' | null>(isInUse ? currentPaymentMethod : null);
  const [paymentCash, setPaymentCash] = useState<string>("");
  const [paymentCard, setPaymentCard] = useState<string>("");
  const [paymentTransfer, setPaymentTransfer] = useState<string>("");
  const [useSplitPayment, setUseSplitPayment] = useState(false);
  /** 기본요금보다 큰 분리결제 허용 시, 받을 총금액 입력란 사용 */
  const [splitCustomTotalEnabled, setSplitCustomTotalEnabled] = useState(false);
  const [splitCustomTotal, setSplitCustomTotal] = useState<string>("");
  const [showOverBaseConfirm, setShowOverBaseConfirm] = useState(false);
  const [pendingOverBaseField, setPendingOverBaseField] = useState<'cash' | 'card' | null>(null);
  const [pendingOverBaseValue, setPendingOverBaseValue] = useState<string>("");
  const [isDeferredPayment, setIsDeferredPayment] = useState(false); // 후불결제 여부 (신규 입실용)
  const [isCurrentlyDeferred, setIsCurrentlyDeferred] = useState(false); // 현재 락카의 후불결제 상태 (기존 입실용)
  const [customerMemo, setCustomerMemo] = useState(""); // 손님 메모
  const [isCashReceipt, setIsCashReceipt] = useState(false); // 현금영수증 발행 여부 (부가세 10% 추가)
  const [isAdditionalFeeCashReceipt, setIsAdditionalFeeCashReceipt] = useState(false); // 추가요금 현금영수증
  
  // 입실시간 소급 수정 (사용 중만)
  const [isEditingEntryTime, setIsEditingEntryTime] = useState(false);
  const [editedEntryTimeLocal, setEditedEntryTimeLocal] = useState("");
  const [entryTimeDraftISO, setEntryTimeDraftISO] = useState<string | undefined>(undefined);
  
  // Additional fee payment states
  // Default to main payment method when no specific additional fee payment method is saved
  const [additionalFeePaymentMethod, setAdditionalFeePaymentMethod] = useState<'card' | 'cash' | 'transfer'>(currentAdditionalFeePaymentMethod || currentPaymentMethod || 'cash');
  const [additionalFeePaymentCash, setAdditionalFeePaymentCash] = useState<string>("");
  const [additionalFeePaymentCard, setAdditionalFeePaymentCard] = useState<string>("");
  const [additionalFeePaymentTransfer, setAdditionalFeePaymentTransfer] = useState<string>("");
  const [useAdditionalFeeSplitPayment, setUseAdditionalFeeSplitPayment] = useState(false);
  const [additionalFeeDiscount, setAdditionalFeeDiscount] = useState<string>("");
  const [additionalFeeFullDiscount, setAdditionalFeeFullDiscount] = useState(false); // 전액 할인
  const [additionalFeePartialDiscount, setAdditionalFeePartialDiscount] = useState(false); // 일부 할인
  const [additionalFeeResolved, setAdditionalFeeResolved] = useState(false); // 추가요금 완납 처리
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  /** true면 퇴실확인 창에서 퇴실시간 지정 UI 표시 (희소 케이스) */
  const [checkoutCustomTimeMode, setCheckoutCustomTimeMode] = useState(false);
  const [checkoutTimeLocal, setCheckoutTimeLocal] = useState("");
  const [pendingCheckoutArgs, setPendingCheckoutArgs] = useState<{
    paymentMethod: 'card' | 'cash' | 'transfer';
    rentalItems: RentalItemInfo[];
    paymentCash?: number;
    paymentCard?: number;
    paymentTransfer?: number;
    additionalFeePayment?: {
      method: 'card' | 'cash' | 'transfer';
      cash?: number;
      card?: number;
      transfer?: number;
      discount?: number;
    };
    customerMemo?: string;
    refundAmount?: number;
    refundNote?: string;
    refundMethod?: 'cash' | 'card' | 'transfer';
  } | null>(null);
  // 환불 처리 states
  const [showRefund, setShowRefund] = useState(false);
  const [currentIsOuting, setCurrentIsOuting] = useState(isOuting);
  useEffect(() => { setCurrentIsOuting(isOuting); }, [isOuting]);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundNote, setRefundNote] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'transfer'>(currentPaymentMethod || 'cash');
  const [showWarningAlert, setShowWarningAlert] = useState(false);
  const [checkoutResolved, setCheckoutResolved] = useState(false);
  
  // 선지급금 취소 시 환불 방식 선택 다이얼로그
  const [showPrepaidRefundDialog, setShowPrepaidRefundDialog] = useState(false);
  const [prepaidRefundMethod, setPrepaidRefundMethod] = useState<'cash' | 'card' | 'transfer' | 'split' | null>(null);
  const [prepaidRefundIncludeVat, setPrepaidRefundIncludeVat] = useState(false); // 환불 시 부가세 포함 여부
  const [pendingPrepaidCancellation, setPendingPrepaidCancellation] = useState<{
    originalAmount: number;
    originalPaymentCash: number;
    originalPaymentCard: number;
    originalPaymentTransfer: number;
  } | null>(null);
  // 분할 환불 금액 입력 상태
  const [splitRefundCash, setSplitRefundCash] = useState<string>("");
  const [splitRefundCard, setSplitRefundCard] = useState<string>("");
  const [splitRefundTransfer, setSplitRefundTransfer] = useState<string>("");
  
  // Locker swap states
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapTargetLocker, setSwapTargetLocker] = useState<string>("");
  const [selectedSwapLocker, setSelectedSwapLocker] = useState<number | null>(null);
  const [showSwapConfirm, setShowSwapConfirm] = useState(false);
  const [swapInfo, setSwapInfo] = useState<{ targetLocker: number; willSwap: boolean } | null>(null);
  
  // Locker linking states
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedChildLockers, setSelectedChildLockers] = useState<Set<number>>(new Set());
  const [showLinkConfirm, setShowLinkConfirm] = useState(false);
  
  // Parent locker change/unlink states
  const [parentLockerNumber, setParentLockerNumber] = useState<number | null>(null);
  const [showChangeParentDialog, setShowChangeParentDialog] = useState(false);
  const [newParentLocker, setNewParentLocker] = useState<string>("");
  const [showChangeParentConfirm, setShowChangeParentConfirm] = useState(false);
  const [unlinkMode, setUnlinkMode] = useState(false); // true = unlink, false = change parent
  
  // Rental items state (담요, 롱타올) - legacy
  const [hasBlanket, setHasBlanket] = useState(false);
  const [hasLongTowel, setHasLongTowel] = useState(false);
  
  // Dynamic rental items from database
  const [availableRentalItems, setAvailableRentalItems] = useState<any[]>([]);
  const [selectedRentalItems, setSelectedRentalItems] = useState<Set<string>>(new Set());
  const [rentalItemQuantities, setRentalItemQuantities] = useState<Map<string, number>>(new Map());
  
  // User-defined pricing options from database
  const [pricingOptions, setPricingOptions] = useState<any[]>([]);
  const [depositStatuses, setDepositStatuses] = useState<Map<string, 'received' | 'refunded' | 'forfeited' | 'none'>>(new Map());
  const [rentalPaymentMethods, setRentalPaymentMethods] = useState<Map<string, 'cash' | 'card' | 'transfer'>>(new Map());
  const [rentalCashReceiptStatuses, setRentalCashReceiptStatuses] = useState<Map<string, boolean>>(new Map());
  const [currentRentalTransactions, setCurrentRentalTransactions] = useState<any[]>([]);
  const [returnCompletedItems, setReturnCompletedItems] = useState<Set<string>>(new Set());
  const [pendingReRentalItems, setPendingReRentalItems] = useState<Set<string>>(new Set());
  const [cancellingRentalItem, setCancellingRentalItem] = useState<{
    txnId: string;
    itemId: string;
    itemName: string;
    isSimple?: boolean;
  } | null>(null);
  const [showCancelEntrySalesDialog, setShowCancelEntrySalesDialog] = useState(false);
  const [pendingUncheckItem, setPendingUncheckItem] = useState<{itemId: string; itemName: string} | null>(null);
  // 직접입력 - 대여비/보증금 직접 수정
  const [rentalDirectInputEnabled, setRentalDirectInputEnabled] = useState<Set<string>>(new Set());
  const [rentalCustomFees, setRentalCustomFees] = useState<Map<string, string>>(new Map());
  const [rentalCustomDeposits, setRentalCustomDeposits] = useState<Map<string, string>>(new Map());

  // 그룹박스 접기/펼치기 상태 — 매장 선호도가 유지되도록 localStorage에 저장
  const [isFeeSectionCollapsed, setIsFeeSectionCollapsed] = useState<boolean>(
    () => localStorage.getItem('locker_opt_fee_collapsed') === 'true'
  );
  const [isRentalSectionCollapsed, setIsRentalSectionCollapsed] = useState<boolean>(
    () => localStorage.getItem('locker_opt_rental_collapsed') === 'true'
  );
  const [isMemoSectionCollapsed, setIsMemoSectionCollapsed] = useState<boolean>(
    () => localStorage.getItem('locker_opt_memo_collapsed') === 'true'
  );
  const toggleFeeSectionCollapsed = () => {
    setIsFeeSectionCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('locker_opt_fee_collapsed', String(next));
      return next;
    });
  };
  const toggleRentalSectionCollapsed = () => {
    setIsRentalSectionCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('locker_opt_rental_collapsed', String(next));
      return next;
    });
  };
  const toggleMemoSectionCollapsed = () => {
    setIsMemoSectionCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('locker_opt_memo_collapsed', String(next));
      return next;
    });
  };

  // Track if this is initial open (to show warning once per dialog open)
  const initialOpenRef = useRef(false);
  const additionalFeePaymentMethodUserChangedRef = useRef(false);
  const previousLockerRef = useRef<string | null>(null);
  const paymentFieldsInitializedRef = useRef(false);
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  
  // Auto-adjust memo textarea height
  useEffect(() => {
    if (memoTextareaRef.current) {
      memoTextareaRef.current.style.height = 'auto';
      memoTextareaRef.current.style.height = Math.max(60, memoTextareaRef.current.scrollHeight) + 'px';
    }
  }, [customerMemo]);

  // Track paid amount for new accrual detection
  const [paidAdditionalFeeAmount, setPaidAdditionalFeeAmount] = useState(0);
  
  // Reset checkoutResolved and additional fee discount when dialog opens
  // Load saved additional_fee_paid status from DB and compare with current additional fee
  useEffect(() => {
    if (open) {
      // 기존 입실 상태인 경우 DB에서 추가요금 정산 금액 로드
      if (isInUse && currentLockerLogId) {
        const paidAmount = localDb.getLockerLogAdditionalFeePaidAmount(currentLockerLogId);
        setPaidAdditionalFeeAmount(paidAmount);
        
        // 현재 추가요금 직접 계산
        // noAdditionalFee / 장기투숙이면 추가요금 완전 면제
        const isForeigner = currentOptionType === 'foreigner';
        const isFreeEntry = currentOptionType === 'free';
        let rawCurrentFee = 0;
        if (!currentNoAdditionalFee && !currentIsLongTerm) {
          const currentFeeInfo = calculateAdditionalFee(
            entryTime || '',
            timeType,
            dayPrice,
            nightPrice,
            new Date(),
            isForeigner,
            resolveForeignerPrice(timeType),
            domesticCheckpointHour,
            foreignerAdditionalFeePeriod,
            isFreeEntry,
            domesticAdditionalFeeMode,
            nightStartHour,
            settlementCycleOpts,
            stagedHourlyOpts,
            nightstartOpts
          );
          rawCurrentFee = currentFeeInfo.additionalFee;
        }
        
        // 선지급 금액 차감 적용
        const prepaidFee = currentPrepaidAdditionalFee || 0;
        const netCurrentFee = Math.max(0, rawCurrentFee - prepaidFee);
        
        console.log('[DEBUG] 다이얼로그 열림:', { logId: currentLockerLogId, rawCurrentFee, prepaidFee, netCurrentFee, paidAmount });

        // 수정저장으로 남겨 둔 추가요금 할인 복원
        const savedDiscount = localDb.getLockerLogAdditionalFeeDiscount(currentLockerLogId);
        const restoreDiscount = Math.min(Math.max(0, savedDiscount), rawCurrentFee);
        if (restoreDiscount > 0 && rawCurrentFee > 0) {
          if (restoreDiscount >= rawCurrentFee) {
            setAdditionalFeeFullDiscount(true);
            setAdditionalFeePartialDiscount(false);
            setAdditionalFeeDiscount(String(rawCurrentFee));
          } else {
            setAdditionalFeeFullDiscount(false);
            setAdditionalFeePartialDiscount(true);
            setAdditionalFeeDiscount(String(restoreDiscount));
          }
        } else {
          setAdditionalFeeFullDiscount(false);
          setAdditionalFeePartialDiscount(false);
          setAdditionalFeeDiscount("");
        }
        
        // 순 추가요금(선지급 차감 후)과 정산된 금액 비교
        if (netCurrentFee > paidAmount) {
          // 미지불 추가요금 있음
          console.log('[DEBUG] 미지불 추가요금 있음 - checkoutResolved: false');
          setCheckoutResolved(false);
          setAdditionalFeeResolved(false);
        } else if (netCurrentFee === 0 && rawCurrentFee > 0 && prepaidFee >= rawCurrentFee) {
          // 선지급이 추가요금을 완전히 커버 - 완납 상태
          console.log('[DEBUG] 선지급 완납 상태 - checkoutResolved: true');
          setCheckoutResolved(true);
          setAdditionalFeeResolved(true);
        } else if (paidAmount > 0 && netCurrentFee <= paidAmount) {
          // 이미 완납된 상태
          console.log('[DEBUG] 추가요금 완납 상태 - checkoutResolved: true');
          setCheckoutResolved(true);
          setAdditionalFeeResolved(true);
        } else if (restoreDiscount > 0 && Math.max(0, netCurrentFee - restoreDiscount) === 0 && paidAmount >= 0) {
          // 전액할인 등으로 청구액 0 + 이전에 정산 표시된 경우
          // paidAmount가 0이어도 할인으로 완납 처리된 케이스 복원
          const wasPaid = localDb.getLockerLogAdditionalFeePaid(currentLockerLogId);
          if (wasPaid) {
            setCheckoutResolved(true);
            setAdditionalFeeResolved(true);
          } else {
            setCheckoutResolved(false);
            setAdditionalFeeResolved(false);
          }
        } else {
          // 추가요금 없음
          console.log('[DEBUG] 추가요금 없음');
          setCheckoutResolved(false);
          setAdditionalFeeResolved(false);
        }
      } else {
        setPaidAdditionalFeeAmount(0);
        setCheckoutResolved(false);
        setAdditionalFeeResolved(false);
        setAdditionalFeeFullDiscount(false);
        setAdditionalFeePartialDiscount(false);
        setAdditionalFeeDiscount("");
      }
      // 추가요금없음 상태를 현재 값으로 초기화
      setNoAdditionalFee(currentNoAdditionalFee || false);
      // 선지급 추가요금 상태를 현재 값으로 초기화
      if (currentPrepaidAdditionalFee && currentPrepaidAdditionalFee > 0) {
        setHasPrepaidAdditionalFee(true);
        setPrepaidAdditionalFeeAmount(String(currentPrepaidAdditionalFee));
      } else {
        setHasPrepaidAdditionalFee(false);
        setPrepaidAdditionalFeeAmount("");
      }
      setPrepaidAdditionalFeePaymentMethod(null); // 선지급 결제방식은 항상 null로 초기화 (주결제방식 따름)
      // 현금영수증 발행 상태를 현재 값으로 초기화
      setIsCashReceipt(currentIsCashReceipt || false);
      // 추가요금 결제방식을 현재 값으로 초기화
      // 락커가 바뀌었거나 사용자가 아직 변경하지 않은 경우에만 리셋
      // (5초 주기 loadData에 의한 오버라이드 방지)
      if (previousLockerRef.current !== currentLockerLogId) {
        // 다른 락커로 전환 시 사용자 변경 플래그 초기화
        additionalFeePaymentMethodUserChangedRef.current = false;
        previousLockerRef.current = currentLockerLogId ?? null;
      }
      if (!additionalFeePaymentMethodUserChangedRef.current) {
        // Default to main payment method when no specific additional fee payment method is saved
        setAdditionalFeePaymentMethod(currentAdditionalFeePaymentMethod || currentPaymentMethod || 'cash');
      }
      initialOpenRef.current = true;
    }
  }, [open, isInUse, currentLockerLogId, entryTime, timeType, dayPrice, nightPrice, foreignerPrice, domesticCheckpointHour, foreignerAdditionalFeePeriod, currentOptionType, currentNoAdditionalFee, currentPrepaidAdditionalFee, currentIsCashReceipt, currentAdditionalFeePaymentMethod, currentPaymentMethod]);
  
    
  // Initialize payment fields when dialog opens (한번만 — loadData 주기 갱신으로 UI가 덮어씌워지지 않게)
  useEffect(() => {
    if (!open) {
      paymentFieldsInitializedRef.current = false;
      setShowOverBaseConfirm(false);
      setPendingOverBaseField(null);
      setPendingOverBaseValue("");
      return;
    }
    if (paymentFieldsInitializedRef.current) return;
    paymentFieldsInitializedRef.current = true;

    const hasExistingData = currentPaymentCash !== undefined ||
                           currentPaymentCard !== undefined ||
                           currentPaymentTransfer !== undefined;

    if (hasExistingData) {
      const paymentCount = [
        currentPaymentCash && currentPaymentCash > 0,
        currentPaymentCard && currentPaymentCard > 0,
        currentPaymentTransfer && currentPaymentTransfer > 0,
      ].filter(Boolean).length;

      setUseSplitPayment(paymentCount > 1);

      const cashHadVat = enableCashReceiptVat && currentIsCashReceipt;
      const transferHadVat = enableCashReceiptVat && currentIsCashReceipt;
      // 기대 기본요금: 입실 기본가(옵션 반영 전/후는 basePrice 근사). VAT 포함 finalPrice로 추정하지 않음
      // (잘못 추정하면 현금↔카드 뒤바뀜 복구가 실패함)
      const expectedBase = basePrice > 0 ? basePrice : undefined;

      const fields = splitAmountsToBaseFields(
        currentPaymentCash,
        currentPaymentCard,
        currentPaymentTransfer,
        {
          enableCardVat,
          cashHadVat: !!cashHadVat,
          transferHadVat: !!transferHadVat,
          expectedBaseTotal: expectedBase,
        }
      );
      setPaymentCash(fields.cash);
      setPaymentCard(fields.card);
      setPaymentTransfer(fields.transfer);
      // 저장된 분리결제 합계가 기본요금보다 크면 총금액 모드로 복원
      const restoredSum =
        (parseInt(fields.cash) || 0) +
        (parseInt(fields.card) || 0) +
        (parseInt(fields.transfer) || 0);
      if (paymentCount > 1 && restoredSum > (expectedBase || 0) && (expectedBase || 0) > 0) {
        setSplitCustomTotalEnabled(true);
        setSplitCustomTotal(String(restoredSum));
      } else {
        setSplitCustomTotalEnabled(false);
        setSplitCustomTotal("");
      }
    } else {
      setUseSplitPayment(false);
      setPaymentCash("");
      setPaymentCard("");
      setPaymentTransfer("");
      setSplitCustomTotalEnabled(false);
      setSplitCustomTotal("");
    }
  }, [open, currentPaymentCash, currentPaymentCard, currentPaymentTransfer, currentFinalPrice, basePrice, enableCashReceiptVat, currentIsCashReceipt, enableCardVat]);

  // Load rental items and pricing options from database on mount
  useEffect(() => {
    // Reload rental items and pricing options whenever dialog opens
    if (open) {
      const items = localDb.getAdditionalRevenueItems();
      setAvailableRentalItems(items);
      
      // Load user-defined pricing options
      const options = localDb.getPricingOptions();
      setPricingOptions(options);
      
      // Load current rental transactions if locker is in use
      if (isInUse && currentLockerLogId) {
        const rentals = localDb.getRentalTransactionsByLockerLog(currentLockerLogId);
        setCurrentRentalTransactions(rentals);
        
        // Auto-select checkboxes for existing rental items
        // rentals are ordered DESC (most recent first) — group by itemId, use latest state per item
        const newSelected = new Set<string>();
        const newStatuses = new Map<string, 'received' | 'refunded' | 'forfeited'>();
        const newPaymentMethods = new Map<string, 'cash' | 'card' | 'transfer'>();
        const newReturnCompleted = new Set<string>();
        const newQuantities = new Map<string, number>();
        
        // Group by itemId (first occurrence = most recent due to DESC order)
        const seenItemIds = new Set<string>();
        rentals.forEach(txn => {
          if (seenItemIds.has(txn.itemId)) return; // already handled most-recent
          seenItemIds.add(txn.itemId);
          
          const isReturned = txn.returnCompleted === 1;
          if (isReturned) {
            // Most recent transaction for this item is returned → show as 반납완료, don't auto-select
            newReturnCompleted.add(txn.itemId);
          } else {
            // Active rental → auto-select
            newSelected.add(txn.itemId);
            newStatuses.set(txn.itemId, txn.depositStatus);
            newPaymentMethods.set(txn.itemId, txn.paymentMethod || 'cash');
            const qty = Number(txn.quantity);
            newQuantities.set(txn.itemId, Number.isFinite(qty) && qty > 0 ? qty : 1);
          }
        });
        
        setSelectedRentalItems(newSelected);
        setDepositStatuses(newStatuses);
        setRentalPaymentMethods(newPaymentMethods);
        setReturnCompletedItems(newReturnCompleted);
        setRentalItemQuantities(newQuantities);
        setPendingReRentalItems(new Set());
        
        // Auto-show warning alert if there are rental items or additional fees
        // Only show once when dialog first opens
        if (initialOpenRef.current && entryTime) {
          // 반납완료되지 않은 대여형(rental) 품목만 체크 (일반판매형 제외)
          const unresolvedRentals = rentals.filter(txn => {
            const item = items.find(i => i.id === txn.itemId);
            if (item && isSimpleSaleItem(item)) {
              return false;
            }
            if (item?.billingType === 'simple') {
              return false;
            }
            return txn.returnCompleted !== 1;
          });
          const hasRentalItems = unresolvedRentals.length > 0;
          
          // Calculate additional fee to check if there are additional charges
          // noAdditionalFee가 true이면 추가요금 완전 면제
          const isCurrentlyForeigner = currentOptionType === 'foreigner';
          const isFreeEntry = currentOptionType === 'free';
          let hasUnpaidAdditionalFee = false;
          const savedPaidAmount = currentLockerLogId ? localDb.getLockerLogAdditionalFeePaidAmount(currentLockerLogId) : 0;
          const prepaidAmount = currentPrepaidAdditionalFee || 0;
          const totalPaidAmount = savedPaidAmount + prepaidAmount;
          
          if (!currentNoAdditionalFee && !currentIsLongTerm) {
            const additionalFeeCalc = calculateAdditionalFee(
              entryTime, 
              timeType, 
              dayPrice, 
              nightPrice, 
              new Date(), 
              isCurrentlyForeigner, 
              resolveForeignerPrice(timeType),
              domesticCheckpointHour,
              foreignerAdditionalFeePeriod,
              isFreeEntry,
              domesticAdditionalFeeMode,
              nightStartHour,
              settlementCycleOpts,
              stagedHourlyOpts,
              nightstartOpts
            );
            // 추가요금이 (지불된 금액 + 선지급 금액) 보다 클 때만 미지불 상태
            hasUnpaidAdditionalFee = additionalFeeCalc.additionalFee > totalPaidAmount;
          }
          
          console.log('[DEBUG] 알림창 표시 체크:', { 
            noAdditionalFee: currentNoAdditionalFee,
            savedPaidAmount,
            prepaidAmount,
            totalPaidAmount,
            hasUnpaidAdditionalFee,
            hasRentalItems 
          });
          
          if (hasRentalItems || hasUnpaidAdditionalFee) {
            // Play emergency alert sound
            playEmergencySound();
            
            // Delay to allow dialog to fully open first
            setTimeout(() => {
              setShowWarningAlert(true);
              initialOpenRef.current = false; // Mark as shown
            }, 300);
          } else {
            initialOpenRef.current = false;
          }
        }
      } else {
        setCurrentRentalTransactions([]);
        setSelectedRentalItems(new Set());
        setDepositStatuses(new Map());
        setRentalPaymentMethods(new Map());
        setRentalItemQuantities(new Map());
      }
    }
  }, [open, isInUse, currentLockerLogId, lockerNumber, entryTime, timeType, dayPrice, nightPrice, foreignerPrice, currentOptionType, domesticCheckpointHour, foreignerAdditionalFeePeriod, currentNoAdditionalFee]);

  // Load parent locker info and deferred payment status when dialog opens
  useEffect(() => {
    if (open && isInUse) {
      const lockerLog = localDb.getActiveLockers().find(log => log.lockerNumber === lockerNumber);
      if (lockerLog) {
        // 부모 락카 정보
        if (lockerLog.parentLocker) {
          setParentLockerNumber(lockerLog.parentLocker);
        } else {
          setParentLockerNumber(null);
        }
        // 후불결제 상태 로드
        setIsCurrentlyDeferred((lockerLog as any).deferredPayment || false);
      } else {
        setParentLockerNumber(null);
        setIsCurrentlyDeferred(false);
      }
    } else if (!isInUse) {
      setIsCurrentlyDeferred(false);
    }
  }, [open, isInUse, lockerNumber]);

  // Play click sound
  const playClickSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRhIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQA=');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (error) {
      console.error('Failed to play click sound:', error);
    }
  };

  // Play close sound
  const playCloseSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.error('Failed to play close sound:', error);
    }
  };

  // Play emergency alert sound
  const playEmergencySound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 1000; // 1000 Hz alert tone
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // Play twice for emphasis
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1200;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.5);
      }, 200);
    } catch (error) {
      console.error('Failed to play emergency sound:', error);
    }
  };

  // Initialize customer memo when dialog opens (separate from other state to avoid conflicts)
  // Also auto-append rental/sale time info if transactions exist
  useEffect(() => {
    if (open) {
      let baseMemo = isInUse ? (currentCustomerMemo || "") : "";

      // Auto-append rental/sale time info if not already in memo
      if (isInUse && currentLockerLogId) {
        const rentals = localDb.getRentalTransactionsByLockerLog(currentLockerLogId);
        const items = localDb.getAdditionalRevenueItems();
        rentals.forEach(txn => {
          const itemName = txn.itemName || txn.item_name || '';
          const rentalTime = txn.rentalTime || txn.rental_time;
          const returnTime = txn.returnTime || txn.return_time;
          if (rentalTime && itemName) {
            const item = items.find((i: any) => i.id === txn.itemId);
            const isSimple = item ? isSimpleSaleItem(item) : false;
            const marker = memoActionMarker(itemName, isSimple);
            const legacyRentalMarker = `[${itemName}] 대여:`;
            // 이미 판매/대여 마커가 있으면 중복 추가하지 않음
            if (baseMemo.includes(marker) || (!isSimple && baseMemo.includes(legacyRentalMarker))) {
              return;
            }
            // 단순판매인데 예전에 대여로 잘못 기록된 줄이 있으면 그대로 둠(중복 방지)
            if (isSimple && baseMemo.includes(legacyRentalMarker)) {
              return;
            }
            const rentalTimeStr = new Date(rentalTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
            let line = `${marker} ${rentalTimeStr}`;
            if (!isSimple && returnTime) {
              const returnTimeStr = new Date(returnTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
              line += ` / 반납: ${returnTimeStr}`;
            }
            baseMemo = baseMemo.trim() ? `${baseMemo}\n${line}` : line;
          }
        });
      }

      setCustomerMemo(baseMemo);
    } else {
      setCustomerMemo(""); // Only reset when dialog closes
    }
  }, [open, isInUse, currentCustomerMemo, currentLockerLogId]);

  // Initialize other state from current option data when dialog opens or closes
  useEffect(() => {
    if (open) {
      // For existing entries (isInUse), determine payment method from actual payment values
      // This handles cases where refunds changed which payment method has remaining value
      if (isInUse) {
        // Check which payment methods have values
        const hasCash = currentPaymentCash && currentPaymentCash > 0;
        const hasCard = currentPaymentCard && currentPaymentCard > 0;
        const hasTransfer = currentPaymentTransfer && currentPaymentTransfer > 0;
        const paymentCount = [hasCash, hasCard, hasTransfer].filter(Boolean).length;
        
        if (paymentCount === 1) {
          // Single payment - set the correct method
          if (hasCash) {
            setPaymentMethod('cash');
          } else if (hasCard) {
            setPaymentMethod('card');
          } else if (hasTransfer) {
            setPaymentMethod('transfer');
          }
        } else if (paymentCount > 1) {
          // Split payment - use the stored method (first payment method entered)
          setPaymentMethod(currentPaymentMethod);
        } else {
          // No payment yet - use stored method or default
          setPaymentMethod(currentPaymentMethod);
        }
      } else {
        // New entries - must select payment method
        setPaymentMethod(null);
      }
      
      // 후불결제 상태 초기화 (기존 입실인 경우)
      if (isInUse) {
        setIsCurrentlyDeferred(currentDeferredPayment || false);
        setIsDeferredPayment(currentDeferredPayment || false);
      } else {
        setIsCurrentlyDeferred(false);
        setIsDeferredPayment(false);
      }
      
      // Parse rental items from notes (legacy)
      const blanketPresent = currentNotes?.includes('담요') || false;
      const towelPresent = currentNotes?.includes('롱타올') || false;
      setHasBlanket(blanketPresent);
      setHasLongTowel(towelPresent);
      
      // Initialize option states based on current optionType / long-term
      if (currentIsLongTerm) {
        setIsLongTerm(true);
        setIsFreeEntry(false);
        setIsDirectPrice(false);
        setIsForeigner(false);
        setIsStaff(false);
        setDiscountOption("none");
        setDirectPrice("");
        setDiscountInputAmount("");
        setLongTermCheckoutLocal(
          currentPlannedCheckoutAt
            ? toDatetimeLocalValue(currentPlannedCheckoutAt)
            : ""
        );
        setLongTermDailyFee(
          currentLongTermDailyFee != null && currentLongTermDailyFee > 0
            ? String(currentLongTermDailyFee)
            : String(dayPrice)
        );
        setLongTermDiscount(
          currentLongTermDiscount != null && currentLongTermDiscount > 0
            ? String(currentLongTermDiscount)
            : ""
        );
      } else if (currentOptionType === 'free') {
        setIsLongTerm(false);
        setIsFreeEntry(true);
        setIsDirectPrice(false);
        setIsForeigner(false);
        setDiscountOption("none");
        setDirectPrice("");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'direct_price' && currentFinalPrice !== undefined) {
        setIsLongTerm(false);
        setIsFreeEntry(false);
        setIsDirectPrice(true);
        // option_amount = 사용자가 입력한 직접요금 (prepaid 미포함)
        // final_price = option_amount + prepaid → 재오픈 시 이걸 쓰면 prepaid가 누적됨
        const directPriceValue = (currentOptionAmount !== undefined && currentOptionAmount > 0)
          ? currentOptionAmount
          : currentFinalPrice;
        setDirectPrice(directPriceValue.toString());
        setIsForeigner(false);
        setDiscountOption("none");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'foreigner') {
        setIsLongTerm(false);
        setIsFreeEntry(false);
        setIsForeigner(true);
        setIsDirectPrice(false);
        // amount가 있으면 외국인 요금에 할인/할증(기본할인 또는 직접입력)이 함께 적용된 상태였다는 뜻.
        // 어느 쪽이었는지는 구분해 저장하지 않으므로, 항상 "직접입력" 경로로 금액 그대로 복원한다
        // (금액이 같으면 결과는 동일 — 기본할인이었어도 재오픈 시엔 직접입력으로 보임).
        if (currentOptionAmount !== undefined && currentOptionAmount !== 0) {
          setDiscountOption("custom");
          setDiscountInputAmount(currentOptionAmount.toString());
        } else {
          setDiscountOption("none");
          setDiscountInputAmount("");
        }
        setDirectPrice("");
      } else if (currentOptionType === 'discount') {
        setIsLongTerm(false);
        setIsFreeEntry(false);
        setDiscountOption("discount");
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
        setDiscountInputAmount("");
      } else if (currentOptionType === 'custom' && currentOptionAmount !== undefined) {
        setIsLongTerm(false);
        setIsFreeEntry(false);
        setDiscountOption("custom");
        setDiscountInputAmount(currentOptionAmount.toString());
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
      } else {
        // none or default
        setIsLongTerm(false);
        setIsFreeEntry(false);
        setDiscountOption("none");
        setIsForeigner(false);
        setIsDirectPrice(false);
        setDirectPrice("");
        setDiscountInputAmount("");
      }
    } else {
      // Reset rental items
      setHasBlanket(false);
      setHasLongTowel(false);
      setShowWarningAlert(false);
      setRentalDirectInputEnabled(new Set());
      setRentalCustomFees(new Map());
      setRentalCustomDeposits(new Map());
      
      // Reset all state when dialog closes to prevent state leakage
      setDiscountOption("none");
      setDiscountInputAmount("");
      setIsForeigner(false);
      setIsFreeEntry(false);
      setIsStaff(false);
      setIsLongTerm(false);
      setLongTermCheckoutLocal("");
      setLongTermDailyFee("");
      setLongTermDiscount("");
      setNoAdditionalFee(false); // 추가요금없음 상태도 초기화
      setHasPrepaidAdditionalFee(false); // 선지급 추가요금 상태도 초기화
      setPrepaidAdditionalFeeAmount(""); // 선지급 추가요금 금액도 초기화
      setPrepaidAdditionalFeePaymentMethod(null); // 선지급 결제방식 초기화
      setIsDirectPrice(false);
      setDirectPrice("");
      setPaymentMethod(null);
      setShowCheckoutConfirm(false);
      setIsDeferredPayment(false); // 후불결제 상태도 초기화
      additionalFeePaymentMethodUserChangedRef.current = false; // 다이얼로그 닫힐 때 리셋
      // Note: checkoutResolved is NOT reset here to preserve acknowledgement state
    }
  }, [open, currentNotes, currentPaymentMethod, currentOptionType, currentOptionAmount, currentFinalPrice, lockerNumber, checkoutResolved, currentDeferredPayment, isInUse, currentPaymentCash, currentPaymentCard, currentPaymentTransfer, currentIsLongTerm, currentPlannedCheckoutAt, currentLongTermDailyFee, currentLongTermDiscount, dayPrice]);

  // 선지급 추가요금 초기화
  useEffect(() => {
    if (open) {
      if (isInUse && currentPrepaidAdditionalFee > 0) {
        setHasPrepaidAdditionalFee(true);
        setPrepaidAdditionalFeeAmount(currentPrepaidAdditionalFee.toString());
      } else if (!isInUse) {
        setHasPrepaidAdditionalFee(false);
        setPrepaidAdditionalFeeAmount("");
      }
    }
  }, [open, isInUse, currentPrepaidAdditionalFee]);

  // 다이얼로그 열릴 때 입실시간 수정 상태 초기화
  useEffect(() => {
    if (open) {
      setIsEditingEntryTime(false);
      setEditedEntryTimeLocal(toDatetimeLocalValue(entryTime));
      setEntryTimeDraftISO(undefined);
    }
  }, [open, entryTime]);

  // 입실시간 수정 초안 기준 표시용 값
  const effectiveEntryTimeISO = entryTimeDraftISO || entryTime;
  const effectiveEntryDate = effectiveEntryTimeISO ? new Date(effectiveEntryTimeISO) : null;
  const effectiveTimeType: '주간' | '야간' =
    effectiveEntryDate && !Number.isNaN(effectiveEntryDate.getTime())
      ? localDb.getTimeTypeWithSettings(effectiveEntryDate)
      : timeType;
  const effectiveBasePrice =
    isForeigner || isStaff || isFreeEntry || isDirectPrice || isLongTerm
      ? basePrice
      : getBasePrice(effectiveTimeType, dayPrice, nightPrice);

  const longTermCheckoutDate = datetimeLocalToDate(longTermCheckoutLocal);
  const longTermStayDays =
    isLongTerm && effectiveEntryDate && longTermCheckoutDate
      ? calcLongTermStayDays(effectiveEntryDate, longTermCheckoutDate)
      : 0;
  const longTermDailyFeeNum = Math.max(0, parseInt(longTermDailyFee) || 0);
  const longTermDiscountNum = Math.max(0, parseInt(longTermDiscount) || 0);
  const longTermTotal = Math.max(
    0,
    longTermStayDays * longTermDailyFeeNum - longTermDiscountNum
  );
  const longTermDurationLabel =
    isLongTerm && effectiveEntryDate && longTermCheckoutDate && longTermStayDays > 0
      ? formatStayDuration(effectiveEntryDate, longTermCheckoutDate)
      : "";

  const buildLongTermStayPayload = () => {
    if (!isLongTerm || !longTermCheckoutDate || longTermStayDays <= 0) return null;
    return {
      plannedCheckoutAt: longTermCheckoutDate.toISOString(),
      dailyFee: longTermDailyFeeNum,
      discount: longTermDiscountNum,
      stayDays: longTermStayDays,
    };
  };

  const calculateFinalPrice = () => {
    // 우선순위 0: 장기투숙 (일수 × 일요금 − 할인)
    if (isLongTerm) {
      return longTermTotal;
    }

    // 우선순위 0.5: 직원 또는 무료입장
    if (isStaff || isFreeEntry) {
      return 0;
    }
    
    // 우선순위 1: 요금직접입력
    if (isDirectPrice && directPrice) {
      return parseInt(directPrice);
    }
    
    // 우선순위 2: 외국인 (할인 옵션이 있으면 외국인 요금에 할인 적용)
    if (isForeigner) {
      const foreignerBase = resolveForeignerPrice(effectiveTimeType);
      if (discountOption === "discount") {
        return Math.max(0, foreignerBase - discountAmount);
      }
      if (discountOption.startsWith("pricing_")) {
        const optionId = discountOption.replace("pricing_", "");
        const option = pricingOptions.find(o => o.id === optionId);
        if (option) {
          if (option.optionType === 'discount') return Math.max(0, foreignerBase - option.amount);
          if (option.optionType === 'surcharge') return foreignerBase + option.amount;
          if (option.optionType === 'fixed') return option.amount;
        }
      }
      if (discountOption === "custom" && discountInputAmount) {
        const inputAmount = parseInt(discountInputAmount);
        if (!isNaN(inputAmount)) return Math.max(0, foreignerBase + inputAmount);
      }
      return foreignerBase;
    }
    
    // 우선순위 3: 기본 할인 옵션
    if (discountOption === "discount") {
      return effectiveBasePrice - discountAmount;
    }
    
    // 우선순위 4: 사용자 정의 요금옵션 (pricing_xxx)
    if (discountOption.startsWith("pricing_")) {
      const optionId = discountOption.replace("pricing_", "");
      const option = pricingOptions.find(o => o.id === optionId);
      if (option) {
        if (option.optionType === 'discount') {
          return effectiveBasePrice - option.amount;
        } else if (option.optionType === 'surcharge') {
          return effectiveBasePrice + option.amount;
        } else if (option.optionType === 'fixed') {
          return option.amount;
        }
      }
    }
    
    // 우선순위 5: 직접입력 (음수면 할인, 양수면 할증)
    if (discountOption === "custom" && discountInputAmount) {
      const inputAmount = parseInt(discountInputAmount);
      return effectiveBasePrice + inputAmount; // 음수 입력 시 할인, 양수 입력 시 할증
    }
    
    return effectiveBasePrice;
  };

  /** 분리결제 자동완성 기준 금액 (기본요금±선지급, 또는 사용자 지정 총금액) */
  const getDefaultSplitTarget = () => {
    const prepaid = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
    return calculateFinalPrice() + prepaid;
  };

  const getSplitAutoFillTarget = () => {
    if (splitCustomTotalEnabled) {
      const custom = parseInt(splitCustomTotal) || 0;
      if (custom > 0) return custom;
    }
    return getDefaultSplitTarget();
  };

  const applySplitAutoFillFromCash = (cashStr: string, targetOverride?: number) => {
    const cashVal = parseInt(cashStr) || 0;
    const target = targetOverride ?? getSplitAutoFillTarget();
    const remaining = target - cashVal;
    if (remaining > 0) {
      setPaymentCard(String(remaining));
      setPaymentTransfer("");
    } else {
      // 0 이하: 이전 자동입력 잔액이 남지 않도록 비움
      setPaymentCard("");
      setPaymentTransfer("");
    }
  };

  const requestOrApplySplitAmount = (field: 'cash' | 'card', newValue: string) => {
    const amount = parseInt(newValue) || 0;
    const defaultTarget = getDefaultSplitTarget();

    if (!splitCustomTotalEnabled && amount > defaultTarget && defaultTarget > 0) {
      setPendingOverBaseField(field);
      setPendingOverBaseValue(newValue);
      if (field === 'cash') {
        setPaymentCash(newValue);
        setPaymentCard("");
        setPaymentTransfer("");
      } else {
        setPaymentCard(newValue);
        setPaymentTransfer("");
      }
      setShowOverBaseConfirm(true);
      return;
    }

    if (field === 'cash') {
      setPaymentCash(newValue);
      applySplitAutoFillFromCash(newValue);
    } else {
      setPaymentCard(newValue);
      const target = getSplitAutoFillTarget();
      const cashVal = parseInt(paymentCash) || 0;
      const cardVal = parseInt(newValue) || 0;
      const remaining = target - cashVal - cardVal;
      if (remaining > 0) {
        setPaymentTransfer(String(remaining));
      } else {
        setPaymentTransfer("");
      }
    }
  };

  const confirmOverBaseSplitYes = () => {
    setSplitCustomTotalEnabled(true);
    setSplitCustomTotal("");
    setPendingOverBaseField(null);
    setPendingOverBaseValue("");
    setShowOverBaseConfirm(false);
  };

  const confirmOverBaseSplitNo = () => {
    if (pendingOverBaseField === 'cash') {
      setPaymentCash("");
    } else if (pendingOverBaseField === 'card') {
      setPaymentCard("");
    }
    setPaymentCard("");
    setPaymentTransfer("");
    setPendingOverBaseField(null);
    setPendingOverBaseValue("");
    setShowOverBaseConfirm(false);
  };

  /**
   * 부가세(10%)가 적용되는지 확인
   * - 카드결제: enableCardVat가 true면 자동 적용
   * - 현금/계좌이체: enableCashReceiptVat가 true이고 isCashReceipt가 체크되면 적용
   */
  const shouldApplyVat = (method: 'card' | 'cash' | 'transfer' | null, cashReceiptChecked: boolean) => {
    if (method === 'card' && enableCardVat) {
      return true;
    }
    if ((method === 'cash' || method === 'transfer') && enableCashReceiptVat && cashReceiptChecked) {
      return true;
    }
    return false;
  };

  /**
   * 부가세(10%) 포함 최종 요금 계산
   */
  const calculateFinalPriceWithVat = () => {
    const price = calculateFinalPrice();
    if (shouldApplyVat(paymentMethod, isCashReceipt)) {
      return Math.round(price * 1.1);
    }
    return price;
  };

  /**
   * 부가세 금액 계산 (표시용)
   */
  const calculateVatAmount = () => {
    if (shouldApplyVat(paymentMethod, isCashReceipt)) {
      return Math.round(calculateFinalPrice() * 0.1);
    }
    return 0;
  };

  /**
   * 최종 요금 계산 (기본요금 + 추가요금) - 부가세 미포함 원래 금액
   * 규칙: 기본요금과 추가요금의 영업일이 다르면 기본요금을 0으로 처리
   */
  const calculateTotalPriceWithAdditionalFee = () => {
    const baseFinalPrice = calculateFinalPrice();
    
    // 추가요금이 없으면 기본요금만 반환
    if (!isInUse || additionalFeeInfo.additionalFee === 0) {
      return baseFinalPrice;
    }
    
    // 입실시간과 현재시간의 영업일 비교
    if (entryTime) {
      const bdHour = Number(settings.businessDayStartHour) || 10;
      const entryBusinessDay = getBusinessDay(new Date(entryTime), bdHour);
      const currentBusinessDay = getBusinessDay(new Date(), bdHour);
      
      // 영업일이 다르면 기본요금을 0으로 처리 (추가요금만 청구)
      if (entryBusinessDay !== currentBusinessDay) {
        return additionalFeeInfo.additionalFee;
      }
    }
    
    // 영업일이 같으면 기본요금 + 추가요금
    return baseFinalPrice + additionalFeeInfo.additionalFee;
  };

  /**
   * 화면에 표시할 최종 요금 계산 (부가세 포함)
   * - 분리결제: 부가세 미포함
   * - 단일결제: 현금영수증 체크 또는 카드결제 시 부가세 포함
   * - 추가요금도 별도 결제방식에 따라 부가세 적용
   * - 선지급금(prepaidAdditionalFee)도 최종 요금에 포함 (부가세도 함께 적용)
   */
  const calculateDisplayTotal = () => {
    // 선지급금 (입실 처리 시)
    let prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;

    // 선지급금 부가세: 선지급 결제방식 기준으로 주결제와 독립적으로 계산
    let prepaidWithVat = prepaidAmount;
    if (prepaidAmount > 0) {
      const effectivePrepaidMethod = prepaidAdditionalFeePaymentMethod || paymentMethod;
      if (shouldApplyVat(effectivePrepaidMethod, false)) {
        prepaidWithVat = Math.round(prepaidAmount * 1.1);
      }
    }

    // 분리결제 시: 합계 라인과 동일한 로직으로 버킷별 VAT 적용
    if (useSplitPayment) {
      const cashAmt = parseInt(paymentCash) || 0;
      const cardAmt = parseInt(paymentCard) || 0;
      const transferAmt = parseInt(paymentTransfer) || 0;
      const total = cashAmt + cardAmt + transferAmt;
      const cashTransferVat = (enableCashReceiptVat && isCashReceipt && (cashAmt + transferAmt) > 0)
        ? Math.round((cashAmt + transferAmt) * 0.1) : 0;
      const cardVat = (enableCardVat && cardAmt > 0)
        ? Math.round(cardAmt * 0.1) : 0;
      // 기존 입실 재오픈 시 선지급금은 이미 결제 버킷에 포함됨 → 중복 합산 방지
      // 신규 입실(isInUse=false) 또는 새로 추가된 선지급금(금액 변경)만 추가
      const prepaidAlreadyInBuckets = isInUse && prepaidAmount === currentPrepaidAdditionalFee;
      const extraPrepaid = prepaidAlreadyInBuckets ? 0 : prepaidWithVat;
      return total + cashTransferVat + cardVat + extraPrepaid;
    }

    // 부가세 적용 여부 확인 (주결제방식 기준)
    const baseVatApplied = shouldApplyVat(paymentMethod, isCashReceipt);

    // 기본요금 (부가세 적용)
    let baseFinalPrice = calculateFinalPrice();
    if (baseVatApplied) {
      baseFinalPrice = Math.round(baseFinalPrice * 1.1);
    }

    // 추가요금이 없으면 기본요금 + 선지급금 반환
    if (!isInUse || additionalFeeInfo.additionalFee === 0) {
      return baseFinalPrice + prepaidWithVat;
    }

    // 입실시간과 현재시간의 영업일 비교
    let includeBasePrice = true;
    if (entryTime) {
      const bdHour = Number(settings.businessDayStartHour) || 10;
      const entryBusinessDay = getBusinessDay(new Date(entryTime), bdHour);
      const currentBusinessDay = getBusinessDay(new Date(), bdHour);
      if (entryBusinessDay !== currentBusinessDay) {
        includeBasePrice = false;
      }
    }

    // 추가요금 할인 적용 (전액할인 체크 시 전체)
    let discountAmount = parseInt(additionalFeeDiscount) || 0;
    if (additionalFeeFullDiscount) {
      discountAmount = additionalFeeInfo.additionalFee;
    } else if (discountAmount <= 0 && currentLockerLogId) {
      discountAmount = Math.min(
        localDb.getLockerLogAdditionalFeeDiscount(currentLockerLogId) || 0,
        additionalFeeInfo.additionalFee
      );
    } else {
      discountAmount = Math.min(discountAmount, additionalFeeInfo.additionalFee);
    }
    let additionalFee = Math.max(0, additionalFeeInfo.additionalFee - discountAmount);

    // 추가요금 분리결제가 아닌 경우에만 부가세 적용
    if (!useAdditionalFeeSplitPayment) {
      const additionalFeeVatApplied = shouldApplyVat(additionalFeePaymentMethod, isAdditionalFeeCashReceipt);
      if (additionalFeeVatApplied) {
        additionalFee = Math.round(additionalFee * 1.1);
      }
    }

    // 영업일이 같으면 기본요금 + 추가요금, 다르면 추가요금만
    return includeBasePrice ? baseFinalPrice + additionalFee : additionalFee;
  };

  // Generate notes from rental items
  const generateNotes = () => {
    const parts: string[] = [];
    if (isStaff) {
      parts.push('직원');
    } else if (isFreeEntry) {
      parts.push('무료입장');
    }
    selectedRentalItems.forEach(itemId => {
      const item = availableRentalItems.find(i => i.id === itemId);
      if (item) {
        const qty = rentalItemQuantities.get(itemId) || 1;
        parts.push(isSimpleSaleItem(item) && qty > 1 ? `${item.name}×${qty}` : item.name);
      }
    });
    return parts.length > 0 ? parts.join(', ') : '';
  };

  // Generate rental item info for checkout
  const generateRentalItemInfo = (): RentalItemInfo[] => {
    const rentalItems: RentalItemInfo[] = [];
    
    selectedRentalItems.forEach(itemId => {
      const item = availableRentalItems.find(i => i.id === itemId);
      const depositStatus = depositStatuses.get(itemId);
      const rentalPaymentMethod = rentalPaymentMethods.get(itemId) || 'cash';
      const isCashReceipt = rentalCashReceiptStatuses.get(itemId) || false;
      
      if (item && depositStatus) {
        // 직접입력이 활성화된 경우 커스텀 가격 우선 적용
        const customFeeStr = rentalDirectInputEnabled.has(itemId) ? rentalCustomFees.get(itemId) : undefined;
        const customDepositStr = rentalDirectInputEnabled.has(itemId) ? rentalCustomDeposits.get(itemId) : undefined;
        const unitRentalFee = (customFeeStr !== undefined && customFeeStr !== '') ? (parseInt(customFeeStr) || 0) : (item.rentalFee || 0);
        const unitDepositAmount = (customDepositStr !== undefined && customDepositStr !== '') ? (parseInt(customDepositStr) || 0) : (item.depositAmount || 0);
        const quantity = isSimpleSaleItem(item)
          ? Math.max(1, rentalItemQuantities.get(itemId) || 1)
          : 1;
        const baseRentalFee = unitRentalFee * quantity;
        const baseDepositAmount = unitDepositAmount; // 대여 보증금은 수량 미적용
        
        // 부가세 적용 여부 확인
        const vatApplied = shouldApplyVat(rentalPaymentMethod, isCashReceipt);
        
        // 부가세가 적용되면 대여비와 보증금 모두에 적용 (단가×수량 합계 기준)
        const vatAppliedRentalFee = vatApplied ? Math.round(baseRentalFee * 1.1) : baseRentalFee;
        const vatAppliedDepositAmount = vatApplied ? Math.round(baseDepositAmount * 1.1) : baseDepositAmount;
        
        rentalItems.push({
          itemId: item.id,
          itemName: item.name,
          rentalFee: baseRentalFee,
          depositAmount: baseDepositAmount,
          depositStatus: depositStatus,
          paymentMethod: rentalPaymentMethod,
          isCashReceipt: isCashReceipt,
          vatAppliedRentalFee: vatAppliedRentalFee,
          vatAppliedDepositAmount: vatAppliedDepositAmount,
          quantity,
        });
      }
    });
    
    return rentalItems;
  };
  
  // Validate mixed payment amounts match final price
  const validateMixedPayment = (targetAmount: number): boolean => {
    // Treat empty strings and NaN as 0
    const cashVal = parseInt(paymentCash) || 0;
    const cardVal = parseInt(paymentCard) || 0;
    const transferVal = parseInt(paymentTransfer) || 0;
    
    // Check for invalid negative values
    if (cashVal < 0 || cardVal < 0 || transferVal < 0) {
      toast({
        title: "결제 금액 오류",
        description: "결제 금액은 0 이상이어야 합니다.",
        variant: "destructive",
      });
      return false;
    }
    
    const total = cashVal + cardVal + transferVal;
    
    if (total !== targetAmount) {
      toast({
        title: "결제 금액 오류",
        description: `결제 금액 합계(${total.toLocaleString()}원)가 최종 요금(${targetAmount.toLocaleString()}원)과 일치하지 않습니다.\n\n현금: ${cashVal.toLocaleString()}원\n카드: ${cardVal.toLocaleString()}원\n이체: ${transferVal.toLocaleString()}원`,
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  // 후불결제 완료 처리
  const handleCompleteDeferredPayment = () => {
    playClickSound();
    
    // 결제 방식 검증
    if (!useSplitPayment && !paymentMethod) {
      toast({
        title: "지불방식 미선택",
        description: "현금, 카드, 이체 중 하나를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    const computedFinalPrice = calculateFinalPrice();
    
    // 분리결제 검증
    if (useSplitPayment) {
      if (splitCustomTotalEnabled && !(parseInt(splitCustomTotal) > 0)) {
        toast({
          title: "총금액 미입력",
          description: "받을 총금액을 입력해 주세요.",
          variant: "destructive",
        });
        return;
      }
      if (!validateMixedPayment(getSplitAutoFillTarget())) {
        return;
      }
    }
    
    // 결제 금액 계산
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
      
      // 분리결제 시 부가세 적용
      const settings = localDb.getSettings();
      
      // 현금/이체: 현금영수증 체크 시에만 부가세 적용
      if (settings.enableCashReceiptVat && isCashReceipt) {
        if (cashVal) {
          cashVal = Math.round(cashVal * 1.1);
        }
        if (transferVal) {
          transferVal = Math.round(transferVal * 1.1);
        }
      }
      
      // 카드: 카드 부가세 설정이 ON이면 자동 적용
      if (settings.enableCardVat && cardVal) {
        cardVal = Math.round(cardVal * 1.1);
      }
    } else {
      // 단일 결제 시 부가세 적용
      const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
      if (vatApplied) {
        const priceWithVat = Math.round(computedFinalPrice * 1.1);
        if (paymentMethod === 'cash') {
          cashVal = priceWithVat;
        } else if (paymentMethod === 'card') {
          cardVal = priceWithVat;
        } else if (paymentMethod === 'transfer') {
          transferVal = priceWithVat;
        }
      } else {
        if (paymentMethod === 'cash') {
          cashVal = computedFinalPrice;
        } else if (paymentMethod === 'card') {
          cardVal = computedFinalPrice;
        } else if (paymentMethod === 'transfer') {
          transferVal = computedFinalPrice;
        }
      }
    }
    
    // DB 업데이트: 후불결제 해제 및 결제 정보 기록
    if (currentLockerLogId) {
      const result = localDb.completeDeferredPayment(currentLockerLogId, {
        paymentMethod: paymentMethod || 'cash',
        paymentCash: cashVal,
        paymentCard: cardVal,
        paymentTransfer: transferVal
      });
      
      if (result.success) {
        toast({
          title: "결제 완료",
          description: `${lockerNumber}번 락카 후불결제가 완료되었습니다. (${computedFinalPrice.toLocaleString()}원)`,
        });
        
        // 데이터 새로고침 콜백 호출 (loadData)
        if (onPaymentComplete) {
          onPaymentComplete();
        }
        
        // 다이얼로그 닫기
        // isCurrentlyDeferred는 로컬에서 리셋하지 않고 다음 열림 시 DB에서 가져옴
        playCloseSound();
        onClose();
      } else {
        toast({
          title: "결제 완료 실패",
          description: result.message,
          variant: "destructive",
        });
      }
    }
  };
  
  const handleProcessEntry = () => {
    playClickSound();

    if (isLongTerm) {
      if (!longTermCheckoutDate || longTermStayDays <= 0) {
        toast({
          title: "퇴실 예정 시각 확인",
          description: "입실보다 이후의 퇴실 날짜·시간을 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
      if (longTermDailyFeeNum <= 0) {
        toast({
          title: "1일 입장료 미입력",
          description: "1일 입장료를 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
    }
    
    // 후불결제가 아닌 경우에만 지불방식 검증 (무료입장/직원은 검증 스킵)
    if (!isDeferredPayment && !isFreeEntry && !isStaff && !useSplitPayment && !paymentMethod) {
      toast({
        title: "지불방식 미선택",
        description: "현금, 카드, 이체 중 하나를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free' | 'long_term' = 'none';
    let optionAmount: number | undefined;

    if (isLongTerm) {
      optionType = 'long_term';
      optionAmount = calculateFinalPrice();
    } else if (isStaff || isFreeEntry) {
      optionType = 'free';
      optionAmount = 0;
    } else if (isDirectPrice && directPrice) {
      optionType = 'direct_price';
      optionAmount = parseInt(directPrice);
    } else if (isForeigner) {
      if (discountOption === 'discount') {
        // 외국인 요금 + 기본할인 조합 — direct_price로 뭉개면 재오픈 시 외국인 체크가
        // 사라지고 외국인 통계에서도 빠지므로, foreigner 타입을 유지하고 할인액만 amount로 기록
        // (음수=할인 규칙은 discountOption==='custom' 재구성 경로와 동일하게 맞춤)
        optionType = 'foreigner';
        optionAmount = -discountAmount;
      } else if (discountOption === 'custom' && discountInputAmount) {
        // 외국인 요금 + 할인/할증 직접입력 조합 — 위와 동일한 이유로 foreigner 타입 유지
        optionType = 'foreigner';
        optionAmount = parseInt(discountInputAmount);
      } else if (discountOption !== 'none') {
        // 외국인 + 사용자정의 요금옵션(pricing_*) 조합은 옵션 자체를 다시 찾아 복원하기 어려우므로
        // 기존과 동일하게 최종 계산 금액으로 저장
        optionType = 'direct_price';
        optionAmount = calculateFinalPrice();
      } else {
        optionType = 'foreigner';
      }
    } else if (discountOption === 'discount') {
      optionType = 'discount';
      optionAmount = discountAmount;
    } else if (discountOption.startsWith('pricing_')) {
      // 사용자 정의 요금옵션 - direct_price로 저장 (최종 계산된 금액)
      optionType = 'direct_price';
      optionAmount = calculateFinalPrice();
    } else if (discountOption === 'custom' && discountInputAmount) {
      optionType = 'custom';
      optionAmount = parseInt(discountInputAmount);
    }

    const baseFinalPrice = calculateFinalPrice();
    const prepaidAmount = (!isLongTerm && hasPrepaidAdditionalFee) ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
    const computedFinalPrice = baseFinalPrice + prepaidAmount; // 선지급금 포함 총액
    const longTermPayload = buildLongTermStayPayload();
    const effectiveNoAdditionalFee = isLongTerm ? true : noAdditionalFee;
    
    // 선지급금 정보를 메모에 자동 기록
    let finalCustomerMemo = customerMemo;
    if (prepaidAmount > 0) {
      const checkTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      const prepaidMemoText = `[${checkTime}] 추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      // 중복 방지: 같은 금액의 선지급 기록이 있으면 추가하지 않음
      const prepaidPattern = `추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      if (!customerMemo.includes(prepaidPattern)) {
        finalCustomerMemo = customerMemo.trim() 
          ? `${customerMemo}\n${prepaidMemoText}` 
          : prepaidMemoText;
        setCustomerMemo(finalCustomerMemo);
      }
    }

    if (isLongTerm && longTermPayload) {
      const checkoutLabel = longTermCheckoutDate!.toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const longTermMemo = `장기투숙 ${longTermPayload.stayDays}일 (퇴실예정 ${checkoutLabel})`;
      if (!finalCustomerMemo.includes('장기투숙')) {
        finalCustomerMemo = finalCustomerMemo.trim()
          ? `${longTermMemo}\n${finalCustomerMemo}`
          : longTermMemo;
      }
    }
    
    // 무료입장 또는 직원일 경우 결제방식 없이 바로 처리
    if (isFreeEntry || isStaff) {
      // 비고(customerMemo)에 자동 메모 추가 (중복 방지)
      const autoLabel = isStaff ? '직원' : '무료입장';
      if (!finalCustomerMemo.includes(autoLabel)) {
        finalCustomerMemo = finalCustomerMemo.trim()
          ? `${autoLabel}\n${finalCustomerMemo}`
          : autoLabel;
      }
      console.log('[handleProcessEntry] Free/Staff entry - calling onApply with:', { optionType, isInUse, lockerNumber, noAdditionalFee, isStaff });
      const generatedNotes = generateNotes();
      const rentalItemInfo = generateRentalItemInfo();
      const prepaidFee = hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount ? parseInt(prepaidAdditionalFeeAmount) : 0;
      onApply(optionType, 0, generatedNotes, 'cash', rentalItemInfo, 0, 0, 0, false, finalCustomerMemo, effectiveNoAdditionalFee, prepaidFee, false, additionalFeePaymentMethod, isStaff, undefined, longTermPayload);
      console.log('[handleProcessEntry] onApply called, now closing dialog');
      setDialogOpen(false);
      return;
    }
    
    // Get payment breakdown
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    // 선지급 별도 결제방식 결정 (null이면 주결제방식과 동일)
    const effectivePrepaidMethod = prepaidAdditionalFeePaymentMethod || paymentMethod;
    // 선지급이 있고 주결제방식과 다른 경우 → 자동 분리결제
    const isPrepaidAutoSplit = !useSplitPayment && prepaidAmount > 0 && effectivePrepaidMethod !== paymentMethod;

    if (useSplitPayment) {
      if (prepaidAdditionalFeePaymentMethod !== null && prepaidAmount > 0 && !splitCustomTotalEnabled) {
        // 분리결제 + 선지급 별도 결제방식: 기본요금 합계만 검증하고 선지급은 자동 추가
        if (!validateMixedPayment(baseFinalPrice)) {
          return;
        }
        cashVal = parseInt(paymentCash) || undefined;
        cardVal = parseInt(paymentCard) || undefined;
        transferVal = parseInt(paymentTransfer) || undefined;
        // 선지급 금액을 지정된 결제 버킷에 자동 합산
        if (effectivePrepaidMethod === 'cash') cashVal = (cashVal || 0) + prepaidAmount;
        else if (effectivePrepaidMethod === 'card') cardVal = (cardVal || 0) + prepaidAmount;
        else if (effectivePrepaidMethod === 'transfer') transferVal = (transferVal || 0) + prepaidAmount;
      } else {
        // 분리결제 (총금액 모드 포함): 자동완성 기준 금액으로 검증
        if (splitCustomTotalEnabled && !(parseInt(splitCustomTotal) > 0)) {
          toast({
            title: "총금액 미입력",
            description: "받을 총금액을 입력해 주세요.",
            variant: "destructive",
          });
          return;
        }
        if (!validateMixedPayment(getSplitAutoFillTarget())) {
          return;
        }
        cashVal = parseInt(paymentCash) || undefined;
        cardVal = parseInt(paymentCard) || undefined;
        transferVal = parseInt(paymentTransfer) || undefined;
      }
    } else if (isPrepaidAutoSplit) {
      // 선지급 결제방식이 달라 자동 분리: 기본요금 → 주결제방식, 선지급 → prepaidMethod
      cashVal = paymentMethod === 'cash' ? baseFinalPrice
              : effectivePrepaidMethod === 'cash' ? prepaidAmount
              : undefined;
      cardVal = paymentMethod === 'card' ? baseFinalPrice
              : effectivePrepaidMethod === 'card' ? prepaidAmount
              : undefined;
      transferVal = paymentMethod === 'transfer' ? baseFinalPrice
                  : effectivePrepaidMethod === 'transfer' ? prepaidAmount
                  : undefined;
    } else {
      // Single payment method - automatically assign full amount (선지급금 포함)
      if (paymentMethod === 'cash') {
        cashVal = computedFinalPrice;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = computedFinalPrice;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = computedFinalPrice;
      }
    }

    const generatedNotes = generateNotes();
    const rentalItemInfo = generateRentalItemInfo();
    
    // 후불결제 시 결제 금액을 0원으로 처리
    if (isDeferredPayment) {
      // 후불결제: paymentMethod = cash (임시), 금액은 0원으로 기록
      const prepaidFee = (!isLongTerm && hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount) ? parseInt(prepaidAdditionalFeeAmount) : 0;
      onApply(optionType, optionAmount, generatedNotes, 'cash', rentalItemInfo, 0, 0, 0, true, finalCustomerMemo, effectiveNoAdditionalFee, prepaidFee, false, additionalFeePaymentMethod, isStaff, undefined, longTermPayload);
      setDialogOpen(false);
      return;
    }
    
    // 부가세 적용 (분리결제 또는 선지급 자동분리 시 수단별 적용)
    if (useSplitPayment || isPrepaidAutoSplit) {
      // 분리결제 시 각 결제 수단별로 부가세 적용
      const settings = localDb.getSettings();
      
      // 현금/이체: 현금영수증 체크 시에만 부가세 적용
      if (settings.enableCashReceiptVat && isCashReceipt) {
        if (cashVal) {
          cashVal = Math.round(cashVal * 1.1);
        }
        if (transferVal) {
          transferVal = Math.round(transferVal * 1.1);
        }
      }
      
      // 카드: 카드 부가세 설정이 ON이면 자동 적용
      if (settings.enableCardVat && cardVal) {
        cardVal = Math.round(cardVal * 1.1);
      }
    } else {
      // 단일 결제 시 부가세 적용
      const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
      if (vatApplied) {
        const priceWithVat = Math.round(computedFinalPrice * 1.1);
        if (paymentMethod === 'cash') {
          cashVal = priceWithVat;
        } else if (paymentMethod === 'card') {
          cardVal = priceWithVat;
        } else if (paymentMethod === 'transfer') {
          transferVal = priceWithVat;
        }
        }
    }
    
    // paymentMethod is guaranteed to be non-null here due to validation above or split payment
    const finalPaymentMethod = paymentMethod || 'cash';
    const prepaidFee = (!isLongTerm && hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount) ? parseInt(prepaidAdditionalFeeAmount) : 0;
    onApply(optionType, optionAmount, generatedNotes, finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, false, finalCustomerMemo, effectiveNoAdditionalFee, prepaidFee, isCashReceipt, additionalFeePaymentMethod, isStaff, undefined, longTermPayload);
    setDialogOpen(false);
  };

  const handleSaveChanges = () => {
    playClickSound();
    console.log('[handleSaveChanges] called', { useSplitPayment, hasExistingSplitPayment: isInUse && [currentPaymentCash && currentPaymentCash > 0, currentPaymentCard && currentPaymentCard > 0, currentPaymentTransfer && currentPaymentTransfer > 0].filter(Boolean).length > 1, paymentCash, paymentCard, paymentTransfer, hasPrepaidAdditionalFee, prepaidAdditionalFeeAmount, prepaidAdditionalFeePaymentMethod });

    if (isLongTerm) {
      if (!longTermCheckoutDate || longTermStayDays <= 0) {
        toast({
          title: "퇴실 예정 시각 확인",
          description: "입실보다 이후의 퇴실 날짜·시간을 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
      if (longTermDailyFeeNum <= 0) {
        toast({
          title: "1일 입장료 미입력",
          description: "1일 입장료를 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
    }
    
    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free' | 'long_term' = 'none';
    let optionAmount: number | undefined;

    if (isLongTerm) {
      optionType = 'long_term';
      optionAmount = calculateFinalPrice();
    } else if (isStaff || isFreeEntry) {
      optionType = 'free';
      optionAmount = 0;
    } else if (isDirectPrice && directPrice) {
      optionType = 'direct_price';
      optionAmount = parseInt(directPrice);
    } else if (isForeigner) {
      if (discountOption === 'discount') {
        // 외국인 요금 + 기본할인 조합 — direct_price로 뭉개면 재오픈 시 외국인 체크가
        // 사라지고 외국인 통계에서도 빠지므로, foreigner 타입을 유지하고 할인액만 amount로 기록
        // (음수=할인 규칙은 discountOption==='custom' 재구성 경로와 동일하게 맞춤)
        optionType = 'foreigner';
        optionAmount = -discountAmount;
      } else if (discountOption === 'custom' && discountInputAmount) {
        // 외국인 요금 + 할인/할증 직접입력 조합 — 위와 동일한 이유로 foreigner 타입 유지
        optionType = 'foreigner';
        optionAmount = parseInt(discountInputAmount);
      } else if (discountOption !== 'none') {
        // 외국인 + 사용자정의 요금옵션(pricing_*) 조합은 옵션 자체를 다시 찾아 복원하기 어려우므로
        // 기존과 동일하게 최종 계산 금액으로 저장
        optionType = 'direct_price';
        optionAmount = calculateFinalPrice();
      } else {
        optionType = 'foreigner';
      }
    } else if (discountOption === 'discount') {
      optionType = 'discount';
      optionAmount = discountAmount;
    } else if (discountOption.startsWith('pricing_')) {
      // 사용자 정의 요금옵션 - direct_price로 저장 (최종 계산된 금액)
      optionType = 'direct_price';
      optionAmount = calculateFinalPrice();
    } else if (discountOption === 'custom' && discountInputAmount) {
      optionType = 'custom';
      optionAmount = parseInt(discountInputAmount);
    }
    
    const computedFinalPrice = calculateFinalPrice();
    const longTermPayload = buildLongTermStayPayload();
    const effectiveNoAdditionalFee = isLongTerm ? true : noAdditionalFee;
    
    // 선지급금 정보를 메모에 자동 기록 (새로 선지급금을 추가하는 경우에만)
    const prepaidAmount = (!isLongTerm && hasPrepaidAdditionalFee) ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
    // 결제 버킷 할당 시 선지급금 포함 총액 (optionAmount는 기본요금만 사용)
    const totalPriceForPayment = computedFinalPrice + prepaidAmount;
    let finalCustomerMemo = customerMemo;
    if (prepaidAmount > 0 && prepaidAmount !== currentPrepaidAdditionalFee) {
      // 새로운 선지급금이 추가되거나 금액이 변경된 경우에만 메모 추가
      const checkTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      const prepaidMemoText = `[${checkTime}] 추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      // 중복 방지: 같은 금액의 선지급 기록이 있으면 추가하지 않음
      const prepaidPattern = `추가요금 ${prepaidAmount.toLocaleString()}원 선지급받음`;
      if (!customerMemo.includes(prepaidPattern)) {
        finalCustomerMemo = customerMemo.trim() 
          ? `${customerMemo}\n${prepaidMemoText}` 
          : prepaidMemoText;
        setCustomerMemo(finalCustomerMemo);
      }
    }

    if (isLongTerm && longTermPayload) {
      const checkoutLabel = longTermCheckoutDate!.toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const longTermMemo = `장기투숙 ${longTermPayload.stayDays}일 (퇴실예정 ${checkoutLabel})`;
      if (!finalCustomerMemo.includes('장기투숙')) {
        finalCustomerMemo = finalCustomerMemo.trim()
          ? `${longTermMemo}\n${finalCustomerMemo}`
          : longTermMemo;
      }
    }

    // 입실시간 수정 초안이 있으면 검증 후 전달
    let editedEntryTimeToSave: string | undefined;
    if (isInUse && entryTimeDraftISO && entryTimeDraftISO !== entryTime) {
      const draftDate = new Date(entryTimeDraftISO);
      if (Number.isNaN(draftDate.getTime())) {
        toast({
          title: "입실시간 오류",
          description: "올바른 입실시간을 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
      if (draftDate.getTime() > Date.now() + 30_000) {
        toast({
          title: "입실시간 오류",
          description: "입실시간을 미래로 설정할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }
      editedEntryTimeToSave = draftDate.toISOString();

      const oldLabel = entryTime
        ? new Date(entryTime).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        : '-';
      const newLabel = draftDate.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      const checkTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      const entryTimeMemo = `[${checkTime}] 입실시간 수정: ${oldLabel} → ${newLabel}`;
      if (!finalCustomerMemo.includes(entryTimeMemo)) {
        finalCustomerMemo = finalCustomerMemo.trim()
          ? `${finalCustomerMemo}\n${entryTimeMemo}`
          : entryTimeMemo;
        setCustomerMemo(finalCustomerMemo);
      }
    }

    // 편집 중인 datetime 입력이 열려 있으면 먼저 적용 유도
    if (isEditingEntryTime) {
      toast({
        title: "입실시간 수정 중",
        description: "입실시간 '적용'을 누른 뒤 수정저장 해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    // Get payment breakdown
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    // 기존 단일결제 데이터가 있는지 확인 (분리결제가 아닐 때만 사용)
    const hasExistingSplitPayment = isInUse && [
      currentPaymentCash && currentPaymentCash > 0,
      currentPaymentCard && currentPaymentCard > 0,
      currentPaymentTransfer && currentPaymentTransfer > 0,
    ].filter(Boolean).length > 1;
    
    const hasExistingSinglePayment = isInUse && (
      (currentPaymentCash && currentPaymentCash > 0) ||
      (currentPaymentCard && currentPaymentCard > 0) ||
      (currentPaymentTransfer && currentPaymentTransfer > 0)
    ) && !hasExistingSplitPayment;
    
    if (useSplitPayment) {
      // 분리결제: 항상 화면 입력값(기본금액)을 기준으로 VAT를 1회만 적용해 저장
      // 총금액 모드면 사용자 지정 총금액을 검증 기준으로 사용
      const splitTarget = getSplitAutoFillTarget();
      if (splitCustomTotalEnabled && !(parseInt(splitCustomTotal) > 0)) {
        toast({
          title: "총금액 미입력",
          description: "받을 총금액을 입력해 주세요.",
          variant: "destructive",
        });
        return;
      }
      if (!validateMixedPayment(splitTarget)) {
        return;
      }

      const cashBase = parseInt(paymentCash) || 0;
      const cardBase = parseInt(paymentCard) || 0;
      const transferBase = parseInt(paymentTransfer) || 0;

      if (cashBase < 0 || cardBase < 0 || transferBase < 0) {
        toast({
          title: "결제 금액 오류",
          description: "결제 금액이 0원 미만이 될 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      const settings = localDb.getSettings();
      const withVat = applyVatToSplitBases(cashBase, cardBase, transferBase, {
        enableCardVat: !!settings.enableCardVat,
        enableCashReceiptVat: !!settings.enableCashReceiptVat,
        isCashReceipt,
      });
      cashVal = withVat.cash;
      cardVal = withVat.card;
      transferVal = withVat.transfer;

      // 새 선지급금이 추가된 경우 해당 결제 버킷에 금액 합산
      const savePrepaidMethodSplit = (prepaidAdditionalFeePaymentMethod || paymentMethod || 'cash') as 'cash' | 'card' | 'transfer';
      const isNewPrepaidAddedToSplit =
        hasPrepaidAdditionalFee &&
        prepaidAmount > 0 &&
        prepaidAmount !== currentPrepaidAdditionalFee;
      if (isNewPrepaidAddedToSplit) {
        const addedPrepaid = prepaidAmount - (currentPrepaidAdditionalFee || 0);
        if (savePrepaidMethodSplit === 'cash') cashVal = (cashVal || 0) + addedPrepaid;
        else if (savePrepaidMethodSplit === 'card') cardVal = (cardVal || 0) + addedPrepaid;
        else if (savePrepaidMethodSplit === 'transfer') transferVal = (transferVal || 0) + addedPrepaid;
      }
    } else {
      // 결제방식 변경 여부 확인 (핵심!)
      const paymentMethodChanged = paymentMethod !== currentPaymentMethod;
      
      // 결제방식이 변경된 경우: 새로운 결제방식으로 금액 재할당 (우선순위 최상위, 선지급금 포함 총액)
      if (paymentMethodChanged) {
        if (paymentMethod === 'cash') {
          cashVal = totalPriceForPayment;
          cardVal = undefined;
          transferVal = undefined;
        } else if (paymentMethod === 'card') {
          cashVal = undefined;
          cardVal = totalPriceForPayment;
          transferVal = undefined;
        } else if (paymentMethod === 'transfer') {
          cashVal = undefined;
          cardVal = undefined;
          transferVal = totalPriceForPayment;
        }
        
        // 단일 결제 시 부가세 적용
        const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
        if (vatApplied) {
          const priceWithVat = Math.round(totalPriceForPayment * 1.1);
          if (paymentMethod === 'cash') {
            cashVal = priceWithVat;
          } else if (paymentMethod === 'card') {
            cardVal = priceWithVat;
          } else if (paymentMethod === 'transfer') {
            transferVal = priceWithVat;
          }
        }
      } else if (hasExistingSinglePayment && paymentMethod === currentPaymentMethod) {
        // 기존 단일결제 + 결제방식 유지: 요금 변경 시에만 재계산
        const savePrepaidMethod = (prepaidAdditionalFeePaymentMethod || paymentMethod || 'cash') as 'cash' | 'card' | 'transfer';
        const isNewPrepaidAdded =
          hasPrepaidAdditionalFee &&
          prepaidAmount > 0 &&
          prepaidAmount !== currentPrepaidAdditionalFee;

        const existingPaymentSum = (currentPaymentCash || 0) + (currentPaymentCard || 0) + (currentPaymentTransfer || 0);
        const vatOn = shouldApplyVat(paymentMethod, isCashReceipt);
        const expectedStoredTotal = vatOn
          ? Math.round(totalPriceForPayment * 1.1)
          : totalPriceForPayment;
        // VAT 포함 합계와 비교 (기본요금끼리 비교하면 항상 '변경됨'으로 오판 → VAT 중복 위험)
        const priceChangedFromExisting = existingPaymentSum !== expectedStoredTotal;

        if (isNewPrepaidAdded) {
          const addedPrepaid = prepaidAmount - (currentPrepaidAdditionalFee || 0);
          cashVal = currentPaymentCash || undefined;
          cardVal = currentPaymentCard || undefined;
          transferVal = currentPaymentTransfer || undefined;
          if (savePrepaidMethod === 'cash') cashVal = (cashVal || 0) + addedPrepaid;
          else if (savePrepaidMethod === 'card') cardVal = (cardVal || 0) + addedPrepaid;
          else if (savePrepaidMethod === 'transfer') transferVal = (transferVal || 0) + addedPrepaid;
        } else if (priceChangedFromExisting) {
          if (paymentMethod === 'cash') { cashVal = totalPriceForPayment; cardVal = undefined; transferVal = undefined; }
          else if (paymentMethod === 'card') { cashVal = undefined; cardVal = totalPriceForPayment; transferVal = undefined; }
          else if (paymentMethod === 'transfer') { cashVal = undefined; cardVal = undefined; transferVal = totalPriceForPayment; }
          if (vatOn) {
            const priceWithVat = Math.round(totalPriceForPayment * 1.1);
            if (paymentMethod === 'cash') cashVal = priceWithVat;
            else if (paymentMethod === 'card') cardVal = priceWithVat;
            else if (paymentMethod === 'transfer') transferVal = priceWithVat;
          }
        } else {
          cashVal = currentPaymentCash;
          cardVal = currentPaymentCard;
          transferVal = currentPaymentTransfer;
        }
      } else {
        // 신규 단일결제: 금액 할당 및 부가세 적용 (선지급금 포함 총액 사용)
        if (paymentMethod === 'cash') {
          cashVal = totalPriceForPayment;
          cardVal = undefined;
          transferVal = undefined;
        } else if (paymentMethod === 'card') {
          cashVal = undefined;
          cardVal = totalPriceForPayment;
          transferVal = undefined;
        } else if (paymentMethod === 'transfer') {
          cashVal = undefined;
          cardVal = undefined;
          transferVal = totalPriceForPayment;
        }
        
        // 단일 결제 시 부가세 적용
        const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
        if (vatApplied) {
          const priceWithVat = Math.round(totalPriceForPayment * 1.1);
          if (paymentMethod === 'cash') {
            cashVal = priceWithVat;
          } else if (paymentMethod === 'card') {
            cardVal = priceWithVat;
          } else if (paymentMethod === 'transfer') {
            transferVal = priceWithVat;
          }
        }
      }
    }

    const generatedNotes = generateNotes();
    const rentalItemInfo = generateRentalItemInfo();
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    // 후불결제 상태 전달 (체크 해제 시 결제 완료 처리)
    // 기존 입실 수정 시 noAdditionalFee 상태 - 체크박스의 현재 상태 사용
    const prepaidFee = (!isLongTerm && hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount) ? parseInt(prepaidAdditionalFeeAmount) : 0;

    // try-catch: onApply 및 이후 DB 작업에서 예외 발생 시에도 dialog가 항상 닫히도록 보장
    try {
      // 수정저장 시 추가요금 결제방식 처리:
      // - 사용자가 직접 Select를 변경한 경우: 변경된 값 저장
      // - 변경하지 않은 경우: DB 원본 값 유지 (null이면 undefined로 전달 → updateEntry에서 업데이트 생략)
      // 이렇게 해야 DB에 null이었던 값이 'cash'로 덮어써지는 버그 방지
      const additionalFeePaymentMethodToSave = additionalFeePaymentMethodUserChangedRef.current
        ? additionalFeePaymentMethod
        : (currentAdditionalFeePaymentMethod || undefined);
      onApply(optionType, optionAmount, generatedNotes, finalPaymentMethod, rentalItemInfo, cashVal, cardVal, transferVal, isDeferredPayment, finalCustomerMemo, effectiveNoAdditionalFee, prepaidFee, isCashReceipt, additionalFeePaymentMethodToSave, isStaff, editedEntryTimeToSave, longTermPayload);
      
      // 수정저장 후 추가요금 결제방식이 loadData 리프레시로 인해 리셋되지 않도록 잠금
      additionalFeePaymentMethodUserChangedRef.current = true;
      
      // CRITICAL: For existing entries (isInUse), save the customer memo directly to DB
      if (isInUse && currentLockerLogId) {
        localDb.updateLockerLogMemo(currentLockerLogId, finalCustomerMemo);
        // 외출 상태 저장 (수정저장 시에만 반영)
        localDb.updateLockerOuting(currentLockerLogId, currentIsOuting);
        
        // 추가요금 완납 상태 저장 (checkoutResolved 또는 additionalFeeResolved가 true인 경우)
        // 현재 추가요금 총액을 저장하여 새로운 추가요금 발생 시 감지 가능
        // ※ 할인액은 paid_amount와 별도 저장 — paid_amount는 원 추가요금(신규 발생 감지용)
        if (checkoutResolved || additionalFeeResolved) {
          // 추가요금 직접 계산 (additionalFeeInfo가 아직 정의되지 않았을 수 있음)
          // noAdditionalFee가 true이면 추가요금 0
          let currentFee = 0;
          if (!currentNoAdditionalFee && !isLongTerm && !currentIsLongTerm) {
            const isForeigner = currentOptionType === 'foreigner';
            const isFreeEntry = currentOptionType === 'free';
            const feeTt = editedEntryTimeToSave
              ? localDb.getTimeTypeWithSettings(new Date(editedEntryTimeToSave))
              : timeType;
            const feeInfo = calculateAdditionalFee(
              editedEntryTimeToSave || entryTime || '',
              feeTt,
              dayPrice,
              nightPrice,
              new Date(),
              isForeigner,
              resolveForeignerPrice(feeTt),
              domesticCheckpointHour,
              foreignerAdditionalFeePeriod,
              isFreeEntry,
              domesticAdditionalFeeMode,
              nightStartHour,
              settlementCycleOpts,
              stagedHourlyOpts,
              nightstartOpts
            );
            currentFee = feeInfo.additionalFee;
          }
          // UI 할인은 선지급 차감 후(net) 금액 기준
          const prepaidAtSave = hasPrepaidAdditionalFee
            ? (parseInt(prepaidAdditionalFeeAmount) || 0)
            : (currentPrepaidAdditionalFee || 0);
          const netFee = Math.max(0, currentFee - prepaidAtSave);
          const discountToSave = additionalFeeFullDiscount
            ? netFee
            : Math.min(Math.max(0, parseInt(additionalFeeDiscount) || 0), netFee);
          console.log('[DEBUG] 수정저장: 추가요금 완납 저장', {
            logId: currentLockerLogId,
            currentFee,
            netFee,
            discountToSave,
            checkoutResolved,
            additionalFeeResolved,
          });
          localDb.updateLockerLogAdditionalFeePaid(currentLockerLogId, true, netFee, discountToSave);

          // 할인 메모가 없으면 자동 기록
          if (discountToSave > 0) {
            let additionalFeeMemo = '';
            if (discountToSave >= netFee) {
              additionalFeeMemo = `추가요금 총 ${netFee.toLocaleString()}원 전액할인`;
            } else {
              additionalFeeMemo = `추가요금 총 ${netFee.toLocaleString()}원중 ${discountToSave.toLocaleString()}원 할인 받음`;
            }
            if (additionalFeeMemo && !finalCustomerMemo.includes(additionalFeeMemo)) {
              finalCustomerMemo = finalCustomerMemo.trim()
                ? `${finalCustomerMemo}\n${additionalFeeMemo}`
                : additionalFeeMemo;
              localDb.updateLockerLogMemo(currentLockerLogId, finalCustomerMemo);
              setCustomerMemo(finalCustomerMemo);
            }
          }
        } else {
          // 완납 전이라도 할인 입력값은 저장해 두어 재오픈 시 복원
          let currentFee = 0;
          if (!currentNoAdditionalFee && !isLongTerm && !currentIsLongTerm) {
            const feeTt = editedEntryTimeToSave
              ? localDb.getTimeTypeWithSettings(new Date(editedEntryTimeToSave))
              : timeType;
            const feeInfo = calculateAdditionalFee(
              editedEntryTimeToSave || entryTime || '',
              feeTt,
              dayPrice,
              nightPrice,
              new Date(),
              currentOptionType === 'foreigner',
              resolveForeignerPrice(feeTt),
              domesticCheckpointHour,
              foreignerAdditionalFeePeriod,
              currentOptionType === 'free',
              domesticAdditionalFeeMode,
              nightStartHour,
              settlementCycleOpts,
              stagedHourlyOpts,
              nightstartOpts
            );
            currentFee = feeInfo.additionalFee;
          }
          const prepaidAtSave = hasPrepaidAdditionalFee
            ? (parseInt(prepaidAdditionalFeeAmount) || 0)
            : (currentPrepaidAdditionalFee || 0);
          const netFee = Math.max(0, currentFee - prepaidAtSave);
          const discountToSave = additionalFeeFullDiscount
            ? netFee
            : Math.min(Math.max(0, parseInt(additionalFeeDiscount) || 0), netFee);
          localDb.updateLockerLogAdditionalFeeDiscount(currentLockerLogId, discountToSave);
        }
      }
      
      // Save return_completed status for rental items
      // Only find ACTIVE (non-returned) transactions — skip already-returned ones
      returnCompletedItems.forEach(itemId => {
        const txn = currentRentalTransactions.find(t => t.itemId === itemId && t.returnCompleted !== 1);
        if (txn) {
          localDb.updateRentalTransaction(txn.id, {
            returnCompleted: true,
            depositStatus: depositStatuses.get(itemId) || txn.depositStatus,
            paymentMethod: rentalPaymentMethods.get(itemId) || txn.paymentMethod,
            returnTime: new Date(),
          });
        }
      });
      
      // Mark as resolved to prevent warning on next open
      setCheckoutResolved(true);
    } catch (err) {
      console.error('[handleSaveChanges] 저장 중 오류 발생 (dialog는 닫힙니다):', err);
    }

    // 항상 dialog 닫기 (예외 발생 여부와 무관)
    playCloseSound();
    setTimeout(() => setDialogOpen(false), 100);
  };

  const handleCheckoutClick = (options?: { customExitTime?: boolean }) => {
    playClickSound();
    const customExitTime = !!options?.customExitTime;
    
    // NOTE: Warning check removed - warning already shows when dialog first opens
    // Redundant check was causing infinite loop when user clicked checkout after warning close
    
    // 기본요금과 추가요금을 독립적으로 처리
    const baseFinalPrice = calculateFinalPrice();
    // 선지급금이 이미 분리결제 필드에 합산되어 있으므로, 검증 시 선지급금 포함해야 함
    const prepaidAmount = hasPrepaidAdditionalFee ? (parseInt(prepaidAdditionalFeeAmount) || 0) : 0;
    const computedFinalPrice = baseFinalPrice + prepaidAmount;
    
    // 기본요금 결제 검증 및 할당 (선지급금 포함)
    let cashVal: number | undefined;
    let cardVal: number | undefined;
    let transferVal: number | undefined;
    
    if (useSplitPayment) {
      // Validate mixed payment amounts for split payment (선지급금 포함 전체 금액 검증)
      if (!validateMixedPayment(computedFinalPrice)) {
        return;
      }
      cashVal = parseInt(paymentCash) || undefined;
      cardVal = parseInt(paymentCard) || undefined;
      transferVal = parseInt(paymentTransfer) || undefined;
      
      // 분리결제 시 부가세 적용
      const settings = localDb.getSettings();
      
      // 현금/이체: 현금영수증 체크 시에만 부가세 적용
      if (settings.enableCashReceiptVat && isCashReceipt) {
        if (cashVal) {
          cashVal = Math.round(cashVal * 1.1);
        }
        if (transferVal) {
          transferVal = Math.round(transferVal * 1.1);
        }
      }
      
      // 카드: 카드 부가세 설정이 ON이면 자동 적용
      if (settings.enableCardVat && cardVal) {
        cardVal = Math.round(cardVal * 1.1);
      }
    } else {
      // Single payment method - automatically assign full amount (기본요금만)
      // 부가세 적용
      const vatApplied = shouldApplyVat(paymentMethod, isCashReceipt);
      const priceToAssign = vatApplied 
        ? Math.round(computedFinalPrice * 1.1) 
        : computedFinalPrice;
      
      if (paymentMethod === 'cash') {
        cashVal = priceToAssign;
        cardVal = undefined;
        transferVal = undefined;
      } else if (paymentMethod === 'card') {
        cashVal = undefined;
        cardVal = priceToAssign;
        transferVal = undefined;
      } else if (paymentMethod === 'transfer') {
        cashVal = undefined;
        cardVal = undefined;
        transferVal = priceToAssign;
      }
    }
    
    // Prepare and validate additional fee payment info (if there's an additional fee)
    let additionalFeePayment: typeof additionalFeeInfo.additionalFee extends 0 ? undefined : {
      method: 'card' | 'cash' | 'transfer';
      cash?: number;
      card?: number;
      transfer?: number;
      discount?: number;
    } | undefined = undefined;
    
    if (additionalFeeInfo.additionalFee > 0) {
      // 할인 적용된 추가요금 계산 (UI → 없으면 DB에 저장된 수정저장 할인)
      let discountAmount = parseInt(additionalFeeDiscount) || 0;
      if (additionalFeeFullDiscount) {
        discountAmount = additionalFeeInfo.additionalFee;
      } else if (discountAmount <= 0 && currentLockerLogId) {
        discountAmount = Math.min(
          localDb.getLockerLogAdditionalFeeDiscount(currentLockerLogId) || 0,
          additionalFeeInfo.additionalFee
        );
      } else {
        discountAmount = Math.min(discountAmount, additionalFeeInfo.additionalFee);
      }
      const discountedAdditionalFee = Math.max(0, additionalFeeInfo.additionalFee - discountAmount);
      
      if (useAdditionalFeeSplitPayment) {
        // 추가요금 분리결제 검증 (할인 적용된 금액 기준)
        let addCashVal = parseInt(additionalFeePaymentCash) || 0;
        let addCardVal = parseInt(additionalFeePaymentCard) || 0;
        let addTransferVal = parseInt(additionalFeePaymentTransfer) || 0;
        const addTotal = addCashVal + addCardVal + addTransferVal;
        
        if (addTotal !== discountedAdditionalFee) {
          toast({
            title: "결제 금액 오류",
            description: `추가요금 분리결제 합계(${addTotal.toLocaleString()}원)가 할인 적용된 추가요금(${discountedAdditionalFee.toLocaleString()}원)과 일치하지 않습니다.`,
            variant: "destructive",
          });
          return;
        }
        
        // 분리결제 시 부가세 적용
        const settings = localDb.getSettings();
        
        // 현금/이체: 현금영수증 체크 시에만 부가세 적용
        if (settings.enableCashReceiptVat && isAdditionalFeeCashReceipt) {
          if (addCashVal > 0) {
            addCashVal = Math.round(addCashVal * 1.1);
          }
          if (addTransferVal > 0) {
            addTransferVal = Math.round(addTransferVal * 1.1);
          }
        }
        
        // 카드: 카드 부가세 설정이 ON이면 자동 적용
        if (settings.enableCardVat && addCardVal > 0) {
          addCardVal = Math.round(addCardVal * 1.1);
        }
        
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: addCashVal > 0 ? addCashVal : undefined,
          card: addCardVal > 0 ? addCardVal : undefined,
          transfer: addTransferVal > 0 ? addTransferVal : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      } else {
        // 추가요금 단일결제 (할인 적용된 금액 사용)
        // 부가세 적용
        const additionalFeeVatApplied = shouldApplyVat(additionalFeePaymentMethod, isAdditionalFeeCashReceipt);
        const finalAdditionalFee = additionalFeeVatApplied 
          ? Math.round(discountedAdditionalFee * 1.1) 
          : discountedAdditionalFee;
        
        additionalFeePayment = {
          method: additionalFeePaymentMethod,
          cash: additionalFeePaymentMethod === 'cash' ? finalAdditionalFee : undefined,
          card: additionalFeePaymentMethod === 'card' ? finalAdditionalFee : undefined,
          transfer: additionalFeePaymentMethod === 'transfer' ? finalAdditionalFee : undefined,
          discount: discountAmount > 0 ? discountAmount : undefined,
        };
      }
    }
    
    // paymentMethod should be set for existing entries (isInUse)
    const finalPaymentMethod = paymentMethod || 'cash';
    
    // Check if there are any rental items
    const parsedRefundAmountClick = showRefund ? (parseInt(refundAmount) || 0) : 0;
    const finalRefundNoteClick = showRefund && parsedRefundAmountClick > 0 ? refundNote : undefined;

    const rentalItemInfo = generateRentalItemInfo();
    const checkoutArgs = {
      paymentMethod: finalPaymentMethod as 'card' | 'cash' | 'transfer',
      rentalItems: rentalItemInfo,
      paymentCash: cashVal,
      paymentCard: cardVal,
      paymentTransfer: transferVal,
      additionalFeePayment,
      customerMemo,
      refundAmount: parsedRefundAmountClick > 0 ? parsedRefundAmountClick : undefined,
      refundNote: finalRefundNoteClick,
      refundMethod: (parsedRefundAmountClick > 0 ? refundMethod : undefined) as 'cash' | 'card' | 'transfer' | undefined,
    };

    // 일반 퇴실: 대여품만 있으면 확인창, 없으면 즉시 퇴실(현재시각)
    // 퇴실시간 지정: 확인창에서 시각 선택 (희소 케이스)
    if (customExitTime || selectedRentalItems.size > 0) {
      setPendingCheckoutArgs(checkoutArgs);
      setCheckoutCustomTimeMode(customExitTime);
      setCheckoutTimeLocal(toDatetimeLocalValue(new Date().toISOString()));
      setShowCheckoutConfirm(true);
    } else {
      onCheckout(
        checkoutArgs.paymentMethod,
        checkoutArgs.rentalItems,
        checkoutArgs.paymentCash,
        checkoutArgs.paymentCard,
        checkoutArgs.paymentTransfer,
        checkoutArgs.additionalFeePayment,
        checkoutArgs.customerMemo,
        checkoutArgs.refundAmount,
        checkoutArgs.refundNote,
        checkoutArgs.refundMethod
      );
    }
  };

  const confirmCheckout = () => {
    if (!pendingCheckoutArgs) return;

    let exitTimeISO: string | undefined;
    if (checkoutCustomTimeMode) {
      const exitDate = datetimeLocalToDate(checkoutTimeLocal);
      if (!exitDate) {
        toast({
          title: "퇴실시간 오류",
          description: "퇴실 날짜·시간을 선택해 주세요.",
          variant: "destructive",
        });
        return;
      }
      const entryDate = effectiveEntryTimeISO ? new Date(effectiveEntryTimeISO) : null;
      if (entryDate && exitDate.getTime() < entryDate.getTime()) {
        toast({
          title: "퇴실시간 오류",
          description: "퇴실시간은 입실시간 이후여야 합니다.",
          variant: "destructive",
        });
        return;
      }
      const now = new Date();
      if (exitDate.getTime() > now.getTime() + 60_000) {
        toast({
          title: "퇴실시간 오류",
          description: "미래 시각으로는 퇴실할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }
      exitTimeISO = exitDate.toISOString();
    }

    playCloseSound();
    setShowCheckoutConfirm(false);

    let memoToSave = pendingCheckoutArgs.customerMemo;
    if (exitTimeISO) {
      const exitDate = new Date(exitTimeISO);
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - exitDate.getTime());
      if (diffMs > 60_000) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const exitLabel = `${exitDate.getFullYear()}-${pad(exitDate.getMonth() + 1)}-${pad(exitDate.getDate())} ${pad(exitDate.getHours())}:${pad(exitDate.getMinutes())}`;
        const note = `[${stamp}] 퇴실시간 소급 지정: ${exitLabel}`;
        memoToSave = memoToSave?.trim() ? `${memoToSave.trim()}\n${note}` : note;
      }
    }

    onCheckout(
      pendingCheckoutArgs.paymentMethod,
      pendingCheckoutArgs.rentalItems,
      pendingCheckoutArgs.paymentCash,
      pendingCheckoutArgs.paymentCard,
      pendingCheckoutArgs.paymentTransfer,
      pendingCheckoutArgs.additionalFeePayment,
      memoToSave,
      pendingCheckoutArgs.refundAmount,
      pendingCheckoutArgs.refundNote,
      pendingCheckoutArgs.refundMethod,
      exitTimeISO
    );
    setPendingCheckoutArgs(null);
    setCheckoutCustomTimeMode(false);
  };

  const handleWarningResolved = () => {
    playClickSound();
    setShowWarningAlert(false);
    setCheckoutResolved(true);
  };

  const handleWarningClose = () => {
    playClickSound();
    setShowWarningAlert(false);
    setCheckoutResolved(false);
  };

  const handleCancelClick = () => {
    playClickSound();

    // 최신 대여/판매 거래 확인 (입실취소 전)
    let salesOrRentals = currentRentalTransactions;
    if (currentLockerLogId) {
      salesOrRentals = localDb.getRentalTransactionsByLockerLog(currentLockerLogId);
      setCurrentRentalTransactions(salesOrRentals);
    }

    if (salesOrRentals.length > 0) {
      setShowCancelEntrySalesDialog(true);
      return;
    }

    onCancel();
  };

  const handleCancelEntryKeepSales = () => {
    playClickSound();
    setShowCancelEntrySalesDialog(false);
    onCancel();
  };

  const handleCancelEntryGoHandleSales = () => {
    playClickSound();
    setShowCancelEntrySalesDialog(false);
    toast({
      title: "판매/대여를 먼저 처리해 주세요",
      description: "판매취소·대여취소 또는 반납완료 후 다시 입실취소를 눌러 주세요. 매출을 유지하려면 다음 확인에서 '아니요'를 선택하세요.",
    });
  };

  const handleCloseClick = () => {
    playCloseSound();
    setTimeout(() => setDialogOpen(false), 100);
  };

  const setDialogOpen = (open: boolean) => {
    if (!open) {
      // 다이얼로그 닫힐 때 현금영수증 상태 리셋
      setIsCashReceipt(false);
      setIsAdditionalFeeCashReceipt(false);
      playCloseSound();
      onClose();
    }
  };

  // Locker swap handlers
  const handleSwapClick = () => {
    playClickSound();
    setSwapTargetLocker("");
    setSelectedSwapLocker(null);
    setShowSwapDialog(true);
  };

  const handleSwapSubmit = () => {
    const targetNumber = parseInt(swapTargetLocker);
    
    // 유효성 검사 - 설정된 락카 그룹 번호만 허용
    const groups = localDb.getLockerGroups();
    const configuredNumbers = new Set<number>();
    groups.forEach((g: any) => {
      for (let i = g.startNumber; i <= g.endNumber; i++) {
        configuredNumbers.add(i);
      }
    });

    if (isNaN(targetNumber) || !configuredNumbers.has(targetNumber)) {
      toast({
        title: "오류",
        description: "시스템 설정에 등록된 락카 번호만 입력할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    if (targetNumber === lockerNumber) {
      toast({
        title: "오류",
        description: "같은 락카 번호입니다.",
        variant: "destructive",
      });
      return;
    }

    // 목표 락카가 사용 중인지 확인
    const activeLockers = localDb.getActiveLockers();
    const targetInUse = activeLockers.some((locker: any) => locker.lockerNumber === targetNumber);

    setSwapInfo({
      targetLocker: targetNumber,
      willSwap: targetInUse,
    });
    
    setShowSwapDialog(false);
    setShowSwapConfirm(true);
  };

  const handleSwapConfirm = () => {
    if (!swapInfo || !onSwap) return;

    playClickSound();
    // 메모에 자동으로 정보 추가
    const newMemo = `[락카교체] ${lockerNumber}번 → ${swapInfo.targetLocker}번으로 교체됨`;
    setCustomerMemo(newMemo);
    
    onSwap(lockerNumber, swapInfo.targetLocker);
    setShowSwapConfirm(false);
    onClose();
  };

  // Locker linking handlers
  const handleLinkClick = () => {
    playClickSound();
    // Pre-select already linked child lockers
    const currentChildren = localDb.getChildLockers(lockerNumber);
    const currentChildNumbers = currentChildren.map((c: any) => c.lockerNumber);
    setSelectedChildLockers(new Set(currentChildNumbers));
    setShowLinkDialog(true);
  };

  const handleLinkSubmit = () => {
    playClickSound();
    setShowLinkDialog(false);
    setShowLinkConfirm(true);
  };

  const handleLinkConfirm = async () => {
    playClickSound();
    
    try {
      const childLockerNumbers = Array.from(selectedChildLockers);
      // 0개 선택 시 모든 자식 락카 연결 해제
      const result = localDb.setParentChildLinks(lockerNumber, childLockerNumbers);
      
      if (result.success) {
        let newMemo: string;
        if (childLockerNumbers.length === 0) {
          newMemo = `[락카묶기 해제] ${lockerNumber}번 부모 락카의 모든 묶기 해제`;
        } else {
          const childList = childLockerNumbers.join(", ");
          newMemo = `[락카묶기] ${lockerNumber}번 부모 락카로 ${childList}번과 함께 묶음`;
        }
        setCustomerMemo(newMemo);
        
        toast({
          title: childLockerNumbers.length === 0 ? "묶기 해제 완료" : "락카묶기 완료",
          description: result.message,
        });
        setShowLinkConfirm(false);
        setSelectedChildLockers(new Set());
        // 페이지 리로드 없이 닫기 → Home.onClose에서 loadData()로 화면 갱신
        onClose();
      } else {
        toast({
          variant: "destructive",
          title: "락카묶기 실패",
          description: result.message,
        });
        // Keep dialog open so user can adjust selections
        setShowLinkConfirm(false);
      }
    } catch (error) {
      console.error('Link error:', error);
      toast({
        variant: "destructive",
        title: "락카묶기 실패",
        description: "락카묶기 중 오류가 발생했습니다.",
      });
      setShowLinkConfirm(false);
    }
  };

  const toggleChildLocker = (childNumber: number) => {
    setSelectedChildLockers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(childNumber)) {
        newSet.delete(childNumber);
      } else {
        newSet.add(childNumber);
      }
      return newSet;
    });
  };

  // Parent locker change/unlink handlers
  const handleChangeParentClick = () => {
    playClickSound();
    setNewParentLocker("");
    setUnlinkMode(false);
    setShowChangeParentDialog(true);
  };

  // 자식 락카에서 직접 묶기 해제 (확인창 바로 표시)
  const handleUnlinkFromParent = () => {
    playClickSound();
    setUnlinkMode(true);
    setShowChangeParentConfirm(true);
  };

  const handleChangeParentSubmit = () => {
    playClickSound();
    
    // Check if user wants to unlink (empty input)
    if (!newParentLocker.trim()) {
      setUnlinkMode(true);
      setShowChangeParentConfirm(true);
      return;
    }

    const targetNumber = parseInt(newParentLocker.trim());
    
    if (isNaN(targetNumber) || targetNumber < 1) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "유효한 락카 번호를 입력하세요.",
      });
      return;
    }

    if (targetNumber === lockerNumber) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "자기 자신을 부모 락카로 설정할 수 없습니다.",
      });
      return;
    }

    setUnlinkMode(false);
    setShowChangeParentConfirm(true);
  };

  const handleChangeParentConfirm = () => {
    playClickSound();
    
    try {
      if (unlinkMode) {
        // Unlink from parent
        const result = localDb.unlinkChildLocker(lockerNumber);
        
        if (result.success) {
          toast({
            title: "연결 해제 완료",
            description: result.message,
          });
          setShowChangeParentDialog(false);
          setShowChangeParentConfirm(false);
          setNewParentLocker("");
          onClose();
        } else {
          toast({
            variant: "destructive",
            title: "연결 해제 실패",
            description: result.message,
          });
          setShowChangeParentConfirm(false);
        }
      } else {
        // Change to new parent
        const targetNumber = parseInt(newParentLocker);
        const result = localDb.changeChildParent(lockerNumber, targetNumber);
        
        if (result.success) {
          toast({
            title: "부모 락카 변경 완료",
            description: result.message,
          });
          setShowChangeParentDialog(false);
          setShowChangeParentConfirm(false);
          setNewParentLocker("");
          onClose();
        } else {
          toast({
            variant: "destructive",
            title: "부모 락카 변경 실패",
            description: result.message,
          });
          setShowChangeParentConfirm(false);
        }
      }
    } catch (error) {
      console.error('Change parent error:', error);
      toast({
        variant: "destructive",
        title: unlinkMode ? "연결 해제 실패" : "부모 락카 변경 실패",
        description: "처리 중 오류가 발생했습니다.",
      });
      setShowChangeParentConfirm(false);
    }
  };

  // Calculate additional fee if entry time exists
  // noAdditionalFee / 장기투숙이면 추가요금 완전 면제
  const isCurrentlyForeigner = currentOptionType === 'foreigner';
  const isCurrentlyFreeEntry = currentOptionType === 'free';
  const rawAdditionalFeeInfo = effectiveEntryTimeISO && isInUse
    ? (currentNoAdditionalFee || noAdditionalFee || isLongTerm || currentIsLongTerm
        ? { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0, feeDetails: [] as Array<{ label: string; amount: number }> }
        : calculateAdditionalFee(effectiveEntryTimeISO, effectiveTimeType, dayPrice, nightPrice, new Date(), isCurrentlyForeigner, resolveForeignerPrice(effectiveTimeType), domesticCheckpointHour, foreignerAdditionalFeePeriod, isCurrentlyFreeEntry, domesticAdditionalFeeMode, nightStartHour, settlementCycleOpts, stagedHourlyOpts, nightstartOpts))
    : { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0, feeDetails: [] as Array<{ label: string; amount: number }> };
  
  // 선지급 금액 차감 적용 - 다이얼로그에서 입력 중인 값 우선 사용 (미리보기)
  // hasPrepaidAdditionalFee가 true이고 금액이 입력되어 있으면 입력값 사용, 아니면 저장된 값 사용
  const effectivePrepaidAmount = hasPrepaidAdditionalFee && prepaidAdditionalFeeAmount 
    ? parseInt(prepaidAdditionalFeeAmount) || 0 
    : (currentPrepaidAdditionalFee || 0);
  const netAdditionalFee = Math.max(0, rawAdditionalFeeInfo.additionalFee - effectivePrepaidAmount);
  const additionalFeeInfo = {
    ...rawAdditionalFeeInfo,
    additionalFee: netAdditionalFee,
    prepaidAmount: effectivePrepaidAmount,
    rawAdditionalFee: rawAdditionalFeeInfo.additionalFee,
  };
  const nightFeeStayDays =
    !isCurrentlyForeigner
      ? countNightFeeStayDays(
          additionalFeeInfo.feeDetails,
          dayPrice,
          nightPrice,
          domesticAdditionalFeeMode
        )
      : null;
  const additionalFeeCountLabel =
    nightFeeStayDays != null
      ? `추가 요금 (${additionalFeeInfo.additionalFeeCount}회 · ${nightFeeStayDays}일)`
      : `추가 요금 (${additionalFeeInfo.additionalFeeCount}회)`;
  
  // Note: Additional fee comparison is now done in the dialog open useEffect above
  // This separate useEffect is no longer needed as we calculate fees directly when dialog opens

  // Format entry date and time
  const formatEntryDateTime = (entryTimeValue?: string) => {
    if (!entryTimeValue) return null;
    const date = new Date(entryTimeValue);
    if (Number.isNaN(date.getTime())) return null;
    const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    return { dateStr, timeStr };
  };

  const entryDateTime = formatEntryDateTime(effectiveEntryTimeISO);
  const maxEntryTimeLocal = toDatetimeLocalValue(new Date().toISOString());

  const applyEntryTimeDraft = () => {
    const parsed = datetimeLocalToDate(editedEntryTimeLocal);
    if (!parsed) {
      toast({
        title: "입실시간 오류",
        description: "올바른 날짜와 시간을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (parsed.getTime() > Date.now() + 30_000) {
      toast({
        title: "입실시간 오류",
        description: "입실시간을 미래로 설정할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    setEntryTimeDraftISO(parsed.toISOString());
    setIsEditingEntryTime(false);
    toast({
      title: "입실시간 변경 예정",
      description: "수정저장을 누르면 반영됩니다.",
    });
  };

  const cancelEntryTimeEdit = () => {
    setIsEditingEntryTime(false);
    setEditedEntryTimeLocal(toDatetimeLocalValue(effectiveEntryTimeISO));
  };

  return (
    <>
      {/* Main Popup Card - No Dialog wrapper for multi-popup support */}
      {open && (
        <div className="locker-options-container flex flex-col h-full overflow-hidden min-w-0" data-testid="dialog-locker-options">
          {/* Header */}
          <div className="locker-opt-header flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="locker-opt-badge flex items-center justify-center shrink-0 rounded-2xl font-bold tabular-nums">
                {lockerNumber}
              </div>
              <div className="min-w-0">
                <h2 className="locker-opt-title font-semibold truncate tracking-tight">
                  락커 {lockerNumber}번
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {isInUse ? '옵션 수정 · 사용 중' : '신규 입실'}
                </p>
              </div>
            </div>
            <div className="locker-opt-window-controls flex items-center shrink-0">
              {onMinimize && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onMinimize}
                  className="locker-opt-window-btn h-7 w-7 rounded-lg"
                  title="최소화"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseClick}
                className="locker-opt-window-btn h-7 w-7 rounded-lg"
                title="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          
          {/* Content - scrollable */}
          <div className="locker-opt-body flex-1 overflow-y-auto min-w-0">
          <div className="locker-opt-stack">
            {/* 입실 정보 섹션 */}
            <div className="locker-opt-section locker-opt-section-hero">
              {/* 입실 날짜/시간 표시 (사용중일 때만) */}
              {isInUse && entryDateTime && (
                <>
                  {!isEditingEntryTime ? (
                    <>
                      <div className="locker-opt-row locker-opt-row-plain">
                        <span className="locker-opt-row-label">입실 날짜</span>
                        <span className="locker-opt-row-value">{entryDateTime.dateStr}</span>
                      </div>
                      <div className="locker-opt-row locker-opt-row-highlight">
                        <span className="locker-opt-row-label">입실 시간</span>
                        <div className="flex items-center gap-2">
                          <span className="locker-opt-entry-time">{entryDateTime.timeStr}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              setEditedEntryTimeLocal(toDatetimeLocalValue(effectiveEntryTimeISO));
                              setIsEditingEntryTime(true);
                            }}
                            data-testid="button-edit-entry-time"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            수정
                          </Button>
                        </div>
                      </div>
                      {entryTimeDraftISO && entryTimeDraftISO !== entryTime && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 text-right">
                          입실시간 변경 예정 · 수정저장 시 반영
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="edit-entry-time" className="text-sm text-muted-foreground">
                          입실시간 수정
                        </Label>
                        <span className="text-[11px] text-muted-foreground">미래 시각 불가</span>
                      </div>
                      <Input
                        id="edit-entry-time"
                        type="datetime-local"
                        value={editedEntryTimeLocal}
                        max={maxEntryTimeLocal}
                        onChange={(e) => setEditedEntryTimeLocal(e.target.value)}
                        className="h-10"
                        data-testid="input-edit-entry-time"
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={cancelEntryTimeEdit}>
                          취소
                        </Button>
                        <Button type="button" size="sm" onClick={applyEntryTimeDraft} data-testid="button-apply-entry-time-draft">
                          적용
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              <div className="locker-opt-row locker-opt-row-plain">
                <span className="locker-opt-row-label">시간대</span>
                <span className="locker-opt-row-value">
                  {effectiveTimeType}
                  {effectiveTimeType !== timeType && (
                    <span className="ml-1 text-xs text-amber-600">(변경 예정)</span>
                  )}
                </span>
              </div>
              <div className="locker-opt-row locker-opt-row-plain">
                <span className="locker-opt-row-label">{isLongTerm ? '장기투숙 요금' : '기본 요금'}</span>
                <span className="locker-opt-row-value locker-opt-row-value-strong">
                  {(isLongTerm ? longTermTotal : effectiveBasePrice).toLocaleString()}원
                  {!isLongTerm && effectiveBasePrice !== basePrice && !isForeigner && !isDirectPrice && !isFreeEntry && !isStaff && (
                    <span className="ml-1 text-xs font-normal text-amber-600">(변경 예정)</span>
                  )}
                </span>
              </div>
              
              {/* 대여 물품 회수 안내 — 단순판매형·반납완료 제외 */}
              {isInUse && currentRentalTransactions.filter(txn =>
                isUnresolvedRentalTxn(txn, availableRentalItems, returnCompletedItems)
              ).length > 0 && (
                <div className="text-sm bg-red-50 dark:bg-red-950 p-2 rounded border border-red-200 dark:border-red-800">
                  <span className="text-red-700 dark:text-red-300 font-semibold">
                    {currentRentalTransactions
                      .filter(txn => isUnresolvedRentalTxn(txn, availableRentalItems, returnCompletedItems))
                      .map(txn => {
                        if (txn.depositAmount > 0) {
                          return `${txn.itemName} 회수 (보증금 ${txn.depositAmount.toLocaleString()}원)`;
                        }
                        return `${txn.itemName} 회수`;
                      }).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* 요금·옵션 */}
            <div className="locker-opt-section locker-opt-section-options space-y-3">
            <button
              type="button"
              className="locker-opt-collapse-header"
              onClick={toggleFeeSectionCollapsed}
              data-testid="button-toggle-fee-section"
            >
              <Label className="text-sm font-semibold cursor-pointer">요금 종류</Label>
              {isFeeSectionCollapsed ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {!isFeeSectionCollapsed && (
            <>
            {!isStaff && !isLongTerm && (enableDirectPriceOption || isDirectPrice) && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="direct-price" 
                  checked={isDirectPrice}
                  onCheckedChange={(checked) => {
                    const on = checked as boolean;
                    setIsDirectPrice(on);
                    if (on) setIsLongTerm(false);
                  }}
                  data-testid="checkbox-direct-price"
                />
                <Label htmlFor="direct-price" className="text-sm font-semibold cursor-pointer">
                  요금 직접 입력
                </Label>
              </div>
              {isDirectPrice && (
                <Input
                  type="text"
                  placeholder="최종 요금 입력"
                  value={directPrice}
                  onChange={(e) => setDirectPrice(e.target.value)}
                  className="locker-opt-direct-price-input"
                  data-testid="input-direct-price"
                />
              )}
            </div>
            )}

            {/* 외국인 체크박스 - 설정에서 활성화된 경우에만 표시 */}
            {(enableForeignerOption || isForeigner) && !isDirectPrice && !isFreeEntry && !isStaff && !isLongTerm && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="foreigner" 
                  checked={isForeigner}
                  onCheckedChange={(checked) => setIsForeigner(checked as boolean)}
                  data-testid="checkbox-foreigner"
                />
                <Label htmlFor="foreigner" className="text-sm font-semibold cursor-pointer">
                  {((settings as any).foreignerSeparateDayNight
                    ? `외국인 (주간 ${resolveForeignerPrice('주간').toLocaleString()} / 야간 ${resolveForeignerPrice('야간').toLocaleString()}원)`
                    : `외국인 (${resolveForeignerPrice(effectiveTimeType).toLocaleString()}원)`)}
                </Label>
              </div>
            )}

            {/* 직원 체크박스 - 신규 입실에서만 표시 */}
            {(enableStaffOption || isStaff) && !isInUse && !isDirectPrice && !isForeigner && !isFreeEntry && !isLongTerm && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="is-staff" 
                  checked={isStaff}
                  onCheckedChange={(checked) => {
                    setIsStaff(checked as boolean);
                    if (checked) {
                      setDiscountOption("none");
                      setDiscountInputAmount("");
                      setIsLongTerm(false);
                    }
                  }}
                  data-testid="checkbox-is-staff"
                />
                <Label htmlFor="is-staff" className="text-sm font-semibold cursor-pointer text-pink-600 dark:text-pink-400">
                  직원 (0원)
                </Label>
              </div>
            )}

            {/* 무료입장 체크박스 - 신규 입실에서만 표시 */}
            {(enableFreeEntryOption || isFreeEntry) && !isInUse && !isDirectPrice && !isForeigner && !isStaff && !isLongTerm && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="free-entry" 
                  checked={isFreeEntry}
                  onCheckedChange={(checked) => {
                    setIsFreeEntry(checked as boolean);
                    if (checked) {
                      setDiscountOption("none");
                      setDiscountInputAmount("");
                      setIsLongTerm(false);
                    } else {
                      // 무료입장 해제 시 추가요금없음도 해제
                      setNoAdditionalFee(false);
                    }
                  }}
                  data-testid="checkbox-free-entry"
                />
                <Label htmlFor="free-entry" className="text-sm font-semibold cursor-pointer text-green-600 dark:text-green-400">
                  무료입장 (0원)
                </Label>
              </div>
            )}

            {/* 장기투숙 */}
            {(enableLongTermOption || isLongTerm) && !isDirectPrice && !isForeigner && !isStaff && !isFreeEntry && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="long-term-stay"
                    checked={isLongTerm}
                    onCheckedChange={(checked) => {
                      const on = checked as boolean;
                      setIsLongTerm(on);
                      if (on) {
                        setIsDirectPrice(false);
                        setIsForeigner(false);
                        setIsStaff(false);
                        setIsFreeEntry(false);
                        setNoAdditionalFee(true);
                        setHasPrepaidAdditionalFee(false);
                        setDiscountOption("none");
                        setDiscountInputAmount("");
                        // 기본: 입실 + 1일, 일요금=주간요금
                        if (!longTermCheckoutLocal) {
                          const base = effectiveEntryDate || new Date();
                          const def = new Date(base.getTime() + 24 * 60 * 60 * 1000);
                          setLongTermCheckoutLocal(toDatetimeLocalValue(def.toISOString()));
                        }
                        if (!longTermDailyFee) {
                          setLongTermDailyFee(String(dayPrice));
                        }
                      }
                    }}
                    data-testid="checkbox-long-term"
                  />
                  <Label htmlFor="long-term-stay" className="text-sm font-semibold cursor-pointer text-teal-700 dark:text-teal-400">
                    장기투숙
                  </Label>
                </div>
                {isLongTerm && (
                  <div className="ml-6 space-y-3 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/30 p-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="long-term-checkout" className="text-xs">퇴실 예정 날짜·시간</Label>
                        <LabelHint
                          content={
                            "입실보다 이후 시각을 입력하면 투숙 일수가 자동 계산됩니다 (24시간 단위 올림).\n" +
                            "장기투숙은 주·야간 요금·추가요금 로직을 적용하지 않습니다.\n" +
                            "예정 퇴실 30분 전부터 락커에 「퇴실경고」가 표시됩니다."
                          }
                        >
                          <Info className="h-3.5 w-3.5 text-teal-600/70 dark:text-teal-400/70" />
                        </LabelHint>
                      </div>
                      <DateTimePickerField
                        id="long-term-checkout"
                        value={longTermCheckoutLocal}
                        onChange={setLongTermCheckoutLocal}
                        testId="input-long-term-checkout"
                      />
                      {longTermStayDays > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          투숙 <strong>{longTermStayDays}일</strong>
                          {longTermDurationLabel ? ` · 실제 체류 ${longTermDurationLabel}` : ''}
                          {' '}(요금은 24시간 단위 올림)
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="long-term-daily-fee" className="text-xs">1일 입장료 (원)</Label>
                        <Input
                          id="long-term-daily-fee"
                          type="text"
                          inputMode="numeric"
                          value={longTermDailyFee}
                          onChange={(e) => setLongTermDailyFee(e.target.value.replace(/[^\d]/g, ''))}
                          className="locker-opt-longterm-input"
                          data-testid="input-long-term-daily-fee"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="long-term-discount" className="text-xs">할인금액 (원)</Label>
                        <Input
                          id="long-term-discount"
                          type="text"
                          inputMode="numeric"
                          value={longTermDiscount}
                          onChange={(e) => setLongTermDiscount(e.target.value.replace(/[^\d]/g, ''))}
                          placeholder="0"
                          className="locker-opt-longterm-input"
                          data-testid="input-long-term-discount"
                        />
                      </div>
                    </div>
                    <div className="rounded-md bg-white/70 dark:bg-black/20 px-3 py-2 border border-teal-200/80 dark:border-teal-800/80 space-y-1">
                      <p className="text-[10px] font-semibold text-teal-800/80 dark:text-teal-300/80">계산식</p>
                      <div className="flex justify-between text-xs text-teal-900 dark:text-teal-100">
                        <span>{longTermStayDays || 0}일 × {longTermDailyFeeNum.toLocaleString()}원</span>
                        <span>{(longTermStayDays * longTermDailyFeeNum).toLocaleString()}원</span>
                      </div>
                      {longTermDiscountNum > 0 && (
                        <div className="flex justify-between text-xs text-teal-900 dark:text-teal-100">
                          <span>할인</span>
                          <span>-{longTermDiscountNum.toLocaleString()}원</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-teal-800 dark:text-teal-200 border-t border-teal-200 dark:border-teal-700 pt-1 mt-1">
                        <span>총 금액</span>
                        <span>{longTermTotal.toLocaleString()}원</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* 추가요금없음 체크박스 - 무료입장 선택 시에만 표시 (VIP, 지인 등) */}
            {!isInUse && isFreeEntry && !isLongTerm && (
              <div className="flex items-center space-x-2 ml-6">
                <Checkbox 
                  id="no-additional-fee" 
                  checked={noAdditionalFee}
                  onCheckedChange={(checked) => setNoAdditionalFee(checked as boolean)}
                  data-testid="checkbox-no-additional-fee"
                />
                <Label htmlFor="no-additional-fee" className="text-sm font-semibold cursor-pointer text-purple-600 dark:text-purple-400">
                  추가요금없음 (VIP/지인)
                </Label>
              </div>
            )}

            {/* 추가요금 선지급 체크박스 - 무료입장/직원/추가요금없음/장기투숙이 아닌 경우에만 표시 */}
            {!isFreeEntry && !isStaff && !noAdditionalFee && !isLongTerm && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="prepaid-additional-fee" 
                    checked={hasPrepaidAdditionalFee}
                    onCheckedChange={(checked) => {
                      if (!checked && isInUse && currentPrepaidAdditionalFee > 0) {
                        // 기존 입실 중인 상태에서 선지급금을 취소하는 경우
                        // 분리결제인 경우에만 환불 방식 선택 다이얼로그 표시
                        const hasSplitPayment = [
                          currentPaymentCash && currentPaymentCash > 0,
                          currentPaymentCard && currentPaymentCard > 0,
                          currentPaymentTransfer && currentPaymentTransfer > 0,
                        ].filter(Boolean).length > 1;
                        
                        // 라이브 상태 값이 있으면 사용, 없으면 props 사용
                        // 참고: 분리결제 필드에는 기본 금액(VAT 제외)이 표시됨
                        const liveCashBase = paymentCash !== "" ? parseInt(paymentCash) || 0 : (currentPaymentCash || 0);
                        const liveCardBase = paymentCard !== "" ? parseInt(paymentCard) || 0 : (currentPaymentCard || 0);
                        const liveTransferBase = paymentTransfer !== "" ? parseInt(paymentTransfer) || 0 : (currentPaymentTransfer || 0);
                        
                        // 환불 다이얼로그에서는 VAT 포함 금액으로 표시해야 함
                        // 현금/이체: enableCashReceiptVat && isCashReceipt인 경우 VAT 적용
                        // 카드: enableCardVat인 경우 VAT 적용
                        const cashWithVat = (enableCashReceiptVat && isCashReceipt && liveCashBase > 0) 
                          ? Math.round(liveCashBase * 1.1) : liveCashBase;
                        const cardWithVat = (enableCardVat && liveCardBase > 0) 
                          ? Math.round(liveCardBase * 1.1) : liveCardBase;
                        const transferWithVat = (enableCashReceiptVat && isCashReceipt && liveTransferBase > 0) 
                          ? Math.round(liveTransferBase * 1.1) : liveTransferBase;
                        
                        // 기본 환불 금액 = 선지급 금액 그대로
                        const basePrepaidAmount = currentPrepaidAdditionalFee;
                        
                        if (hasSplitPayment) {
                          // 분리결제: 환불 방식 선택 다이얼로그 표시
                          // VAT 포함 금액으로 저장 (환불 다이얼로그에서 VAT 포함 금액으로 표시)
                          setPendingPrepaidCancellation({
                            originalAmount: basePrepaidAmount, // 기본 선지급 금액 (VAT 미적용)
                            originalPaymentCash: cashWithVat,   // VAT 포함 금액
                            originalPaymentCard: cardWithVat,   // VAT 포함 금액
                            originalPaymentTransfer: transferWithVat, // VAT 포함 금액
                          });
                          setShowPrepaidRefundDialog(true);
                          return; // 체크박스 상태 변경 보류
                        } else {
                          // 단일결제: 결제수단에서 자동 차감 (기본 금액 기준)
                          let newCashBase = liveCashBase;
                          let newCardBase = liveCardBase;
                          let newTransferBase = liveTransferBase;
                          
                          // 환불은 기본 금액(선지급 원금)에서 차감
                          // 분리결제 필드에는 기본 금액이 표시되므로 기본 금액에서 차감
                          if (newCashBase > 0 || cashWithVat > 0) {
                            // 현금에서 차감 (기본 금액 기준)
                            newCashBase = Math.max(0, liveCashBase - basePrepaidAmount);
                          } else if (newCardBase > 0 || cardWithVat > 0) {
                            // 카드에서 차감 (기본 금액 기준)
                            newCardBase = Math.max(0, liveCardBase - basePrepaidAmount);
                          } else if (newTransferBase > 0 || transferWithVat > 0) {
                            // 이체에서 차감 (기본 금액 기준)
                            newTransferBase = Math.max(0, liveTransferBase - basePrepaidAmount);
                          }
                          
                          // 환불 금액 계산 (메모용 - VAT 포함 여부에 따라)
                          let refundAmount = basePrepaidAmount;
                          if (liveCashBase > 0 && enableCashReceiptVat && isCashReceipt) {
                            refundAmount = Math.round(basePrepaidAmount * 1.1);
                          } else if (liveCardBase > 0 && enableCardVat) {
                            refundAmount = Math.round(basePrepaidAmount * 1.1);
                          } else if (liveTransferBase > 0 && enableCashReceiptVat && isCashReceipt) {
                            refundAmount = Math.round(basePrepaidAmount * 1.1);
                          }
                          
                          // 결제금액 상태 업데이트 (기본 금액으로 설정)
                          setPaymentCash(String(newCashBase));
                          setPaymentCard(String(newCardBase));
                          setPaymentTransfer(String(newTransferBase));
                          
                          // 선지급금 취소 메모 추가
                          const cancelTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                          const cancelMemoText = `[${cancelTime}] 선지급금 ${basePrepaidAmount.toLocaleString()}원 취소 (환불: ${refundAmount.toLocaleString()}원)`;
                          const updatedMemo = customerMemo.trim() 
                            ? `${customerMemo}\n${cancelMemoText}` 
                            : cancelMemoText;
                          setCustomerMemo(updatedMemo);
                          
                          setHasPrepaidAdditionalFee(false);
                          setPrepaidAdditionalFeeAmount("");
                        }
                      } else {
                        setHasPrepaidAdditionalFee(checked as boolean);
                        if (!checked) {
                          setPrepaidAdditionalFeeAmount("");
                        }
                      }
                    }}
                    data-testid="checkbox-prepaid-additional-fee"
                  />
                  <Label htmlFor="prepaid-additional-fee" className="text-sm font-semibold cursor-pointer text-blue-600 dark:text-blue-400">
                    추가요금 선지급
                  </Label>
                </div>
                {hasPrepaidAdditionalFee && (
                  <div className="ml-6 space-y-2">
                    <Input
                      type="text"
                      placeholder="선지급 금액 입력 (예: 5000)"
                      value={prepaidAdditionalFeeAmount}
                      onChange={(e) => setPrepaidAdditionalFeeAmount(e.target.value)}
                      className="w-full locker-opt-prepaid-input"
                      data-testid="input-prepaid-additional-fee"
                    />
                    {/* 선지급 결제방식 선택 — 기본값은 주결제방식과 동일하게 자동 선택되고, 다르게 쓰려면 직접 눌러 바꾸면 된다 */}
                    <div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={(prepaidAdditionalFeePaymentMethod || paymentMethod) === 'cash' ? "default" : "outline"}
                          onClick={() => setPrepaidAdditionalFeePaymentMethod('cash')}
                          data-testid="btn-prepaid-method-cash"
                          className="text-xs"
                        >
                          현금
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={(prepaidAdditionalFeePaymentMethod || paymentMethod) === 'card' ? "default" : "outline"}
                          onClick={() => setPrepaidAdditionalFeePaymentMethod('card')}
                          data-testid="btn-prepaid-method-card"
                          className="text-xs"
                        >
                          카드
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={(prepaidAdditionalFeePaymentMethod || paymentMethod) === 'transfer' ? "default" : "outline"}
                          onClick={() => setPrepaidAdditionalFeePaymentMethod('transfer')}
                          data-testid="btn-prepaid-method-transfer"
                          className="text-xs"
                        >
                          이체
                        </Button>
                      </div>
                      {prepaidAdditionalFeeAmount && (prepaidAdditionalFeePaymentMethod || paymentMethod) !== paymentMethod && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          기본요금 → {paymentMethod === 'cash' ? '현금' : paymentMethod === 'card' ? '카드' : '이체'} /
                          선지급 {parseInt(prepaidAdditionalFeeAmount).toLocaleString()}원 → {prepaidAdditionalFeePaymentMethod === 'cash' ? '현금' : prepaidAdditionalFeePaymentMethod === 'card' ? '카드' : '이체'} (자동 분리결제)
                        </p>
                      )}
                      {prepaidAdditionalFeeAmount && (prepaidAdditionalFeePaymentMethod || paymentMethod) === paymentMethod && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {parseInt(prepaidAdditionalFeeAmount).toLocaleString()}원 선지급
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 요금 옵션 Select */}
            {!isDirectPrice && !isFreeEntry && !isStaff && !isLongTerm && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">요금 옵션</Label>
                <Select value={discountOption} onValueChange={setDiscountOption}>
                  <SelectTrigger data-testid="select-discount-option">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">없음 (정가)</SelectItem>
                    {/* 기본할인 - 설정에서 활성화된 경우에만 표시 */}
                    {enableDiscountOption && (
                      <SelectItem value="discount">기본할인 (-{discountAmount.toLocaleString()}원)</SelectItem>
                    )}
                    {/* 사용자 정의 요금옵션 */}
                    {pricingOptions.map((opt) => (
                      <SelectItem key={opt.id} value={`pricing_${opt.id}`}>
                        {opt.name} ({opt.optionType === 'discount' ? '-' : opt.optionType === 'surcharge' ? '+' : ''}{opt.amount.toLocaleString()}원{opt.optionType === 'fixed' ? ' 고정' : ''})
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">직접입력</SelectItem>
                  </SelectContent>
                </Select>
                {discountOption === "custom" && (
                  <Input
                    type="text"
                    placeholder="할인/할증 금액 입력 (음수=할인)"
                    value={discountInputAmount}
                    onChange={(e) => setDiscountInputAmount(e.target.value)}
                    className="locker-opt-custom-discount-input"
                    data-testid="input-custom-discount"
                  />
                )}
              </div>
            )}
            </>
            )}

            </div>

            {/* 후불결제 상태 배너 - 사용중이고 후불결제 상태인 경우 */}
            {isInUse && isCurrentlyDeferred && (
              <div className="locker-opt-banner locker-opt-banner-warning">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-amber-900 dark:text-amber-100">
                      미결제 금액: {calculateFinalPrice().toLocaleString()}원
                    </p>
                    <p className="text-sm text-amber-800/90 dark:text-amber-200/90 mt-1">
                      후불결제 대기 중 - 아래에서 결제 방식을 선택 후 결제 완료 버튼을 눌러주세요.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 지불방식 - 무료입장/직원일 때는 숨김 */}
            {!isFreeEntry && !isStaff && (
            <div className="locker-opt-section locker-opt-section-payment space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">지불방식</Label>
                <div className="flex items-center gap-4">
                  {/* 후불결제 옵션 - 입실 시에만 표시 (후불결제 상태가 아닐 때) */}
                  {!isInUse && (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="deferred-payment" 
                        checked={isDeferredPayment}
                        onCheckedChange={(checked) => {
                          setIsDeferredPayment(checked as boolean);
                          // 후불결제 선택 시 지불방식 관련 상태 초기화
                          if (checked) {
                            setPaymentMethod(null);
                            setUseSplitPayment(false);
                            setPaymentCash("");
                            setPaymentCard("");
                            setPaymentTransfer("");
                            setSplitCustomTotalEnabled(false);
                            setSplitCustomTotal("");
                          }
                        }}
                        data-testid="checkbox-deferred-payment"
                      />
                      <Label htmlFor="deferred-payment" className="text-sm cursor-pointer font-normal text-orange-600 dark:text-orange-400">
                        후불결제 (미수)
                      </Label>
                    </div>
                  )}
                  
                  {/* 분리결제 옵션 - 후불결제가 아닐 때 또는 후불결제 상태인 경우 표시 */}
                  {(!isDeferredPayment || isCurrentlyDeferred) && (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="split-payment" 
                        checked={useSplitPayment}
                        onCheckedChange={(checked) => {
                          setUseSplitPayment(checked as boolean);
                          setPaymentCash("");
                          setPaymentCard("");
                          setPaymentTransfer("");
                          setSplitCustomTotalEnabled(false);
                          setSplitCustomTotal("");
                          setShowOverBaseConfirm(false);
                        }}
                        data-testid="checkbox-split-payment"
                      />
                      <Label htmlFor="split-payment" className="text-sm cursor-pointer font-normal">
                        분리결제
                      </Label>
                    </div>
                  )}
                </div>
              </div>

              {/* 후불결제 안내 */}
              {isDeferredPayment && (
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    결제 없이 입실 처리됩니다. 매출에 0원으로 기록됩니다.
                  </p>
                </div>
              )}
              
              {(!isDeferredPayment || isCurrentlyDeferred) && useSplitPayment ? (
                <>
                  {splitCustomTotalEnabled && (
                    <div className="space-y-1.5 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5">
                      <Label htmlFor="split-custom-total" className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                        받을 총금액 (기본요금 초과)
                      </Label>
                      <Input
                        id="split-custom-total"
                        type="text"
                        inputMode="numeric"
                        placeholder="예: 35000"
                        value={splitCustomTotal}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, "");
                          setSplitCustomTotal(v);
                          const target = parseInt(v) || 0;
                          if (target > 0) {
                            applySplitAutoFillFromCash(paymentCash, target);
                          } else {
                            setPaymentCard("");
                            setPaymentTransfer("");
                          }
                        }}
                        data-testid="input-split-custom-total"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground">
                        총금액을 입력한 뒤 현금·카드·이체를 나누면, 남은 금액이 자동으로 채워집니다.
                        (기본요금 {getDefaultSplitTarget().toLocaleString()}원)
                      </p>
                    </div>
                  )}
                  <div className="locker-opt-split-grid">
                    <div>
                      <Label htmlFor="payment-cash" className="text-xs text-muted-foreground">현금</Label>
                      <Input
                        id="payment-cash"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={paymentCash}
                        onChange={(e) => {
                          const newCash = e.target.value.replace(/[^\d]/g, "");
                          requestOrApplySplitAmount('cash', newCash);
                        }}
                        data-testid="input-payment-cash"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment-card" className="text-xs text-muted-foreground">카드</Label>
                      <Input
                        id="payment-card"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={paymentCard}
                        onChange={(e) => {
                          const newCard = e.target.value.replace(/[^\d]/g, "");
                          requestOrApplySplitAmount('card', newCard);
                        }}
                        data-testid="input-payment-card"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="payment-transfer" className="text-xs text-muted-foreground">이체</Label>
                      <Input
                        id="payment-transfer"
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={paymentTransfer}
                        onChange={(e) => setPaymentTransfer(e.target.value.replace(/[^\d]/g, ""))}
                        data-testid="input-payment-transfer"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  {(() => {
                    const cashVal = parseInt(paymentCash) || 0;
                    const cardVal = parseInt(paymentCard) || 0;
                    const transferVal = parseInt(paymentTransfer) || 0;
                    const total = cashVal + cardVal + transferVal;
                    
                    // 분리결제 부가세 계산
                    const cashTransferVal = cashVal + transferVal;
                    const cashTransferVat = (enableCashReceiptVat && isCashReceipt && cashTransferVal > 0) 
                      ? Math.round(cashTransferVal * 0.1) : 0;
                    const cardVat = (enableCardVat && cardVal > 0) 
                      ? Math.round(cardVal * 0.1) : 0;
                    const totalWithVat = total + cashTransferVat + cardVat;
                    
                    return (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm font-semibold">합계</span>
                        <div className="text-right">
                          <span className="text-lg font-bold">{total.toLocaleString()}원</span>
                          {(cashTransferVat > 0 || cardVat > 0) && (
                            <span className="text-sm text-blue-600 dark:text-blue-400 ml-2">
                              (+부가세 {(cashTransferVat + cardVat).toLocaleString()}원 = {totalWithVat.toLocaleString()}원)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* 분리결제 현금영수증 체크박스 - 현금/이체 금액이 있을 때 표시 */}
                  {enableCashReceiptVat && ((parseInt(paymentCash) || 0) > 0 || (parseInt(paymentTransfer) || 0) > 0) && (
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox 
                        id="split-cash-receipt" 
                        checked={isCashReceipt}
                        onCheckedChange={(checked) => setIsCashReceipt(checked as boolean)}
                        data-testid="checkbox-split-cash-receipt"
                      />
                      <Label htmlFor="split-cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                        현금/이체 현금영수증 발행 (+10% 부가세)
                      </Label>
                    </div>
                  )}

                  {/* 분리결제 카드 부가세 안내 */}
                  {enableCardVat && (parseInt(paymentCard) || 0) > 0 && (
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        카드결제 금액에 부가세 10%가 자동으로 추가됩니다
                      </p>
                    </div>
                  )}
                </>
              ) : (!isDeferredPayment || isCurrentlyDeferred) ? (
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    className={`flex-1 h-11 text-base font-semibold rounded-xl ${paymentMethod === 'cash' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setPaymentMethod('cash')}
                    data-testid="button-payment-cash"
                  >
                    현금
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'card' ? 'default' : 'outline'}
                    className={`flex-1 h-11 text-base font-semibold rounded-xl ${paymentMethod === 'card' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => {
                      setPaymentMethod('card');
                      const cardSettings = localDb.getSettings();
                      if (cardSettings.cardPaymentAppEnabled && cardSettings.cardPaymentAppPackage) {
                        const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${cardSettings.cardPaymentAppPackage};end`;
                        window.location.href = intentUrl;
                      }
                    }}
                    data-testid="button-payment-card"
                  >
                    카드
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'transfer' ? 'default' : 'outline'}
                    className={`flex-1 h-11 text-base font-semibold rounded-xl ${paymentMethod === 'transfer' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setPaymentMethod('transfer')}
                    data-testid="button-payment-transfer"
                  >
                    이체
                  </Button>
                </div>
              ) : null}
              
              {/* 현금영수증 체크박스 - 현금/계좌이체 선택 시에만 표시 (분리결제 아닐 때) */}
              {enableCashReceiptVat && !useSplitPayment && (paymentMethod === 'cash' || paymentMethod === 'transfer') && (
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="cash-receipt" 
                    checked={isCashReceipt}
                    onCheckedChange={(checked) => setIsCashReceipt(checked as boolean)}
                    data-testid="checkbox-cash-receipt"
                  />
                  <Label htmlFor="cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                    현금영수증 발행 (+10% 부가세)
                  </Label>
                </div>
              )}

              {/* 카드결제 부가세 안내 */}
              {enableCardVat && paymentMethod === 'card' && !useSplitPayment && (
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    카드결제 시 부가세 10%가 자동으로 추가됩니다
                  </p>
                </div>
              )}
            </div>
            )}

            {/* 선지급 금액이 추가요금을 완전히 커버한 경우 */}
            {isInUse && additionalFeeInfo.prepaidAmount > 0 && additionalFeeInfo.rawAdditionalFee > 0 && additionalFeeInfo.additionalFee === 0 && (
              <div className="p-4 border rounded-[1.25rem] bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-700 dark:text-green-300 font-semibold inline-flex items-center gap-1.5">
                    {!isCurrentlyForeigner && (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-green-700 px-1.5 text-[11px] font-bold text-white"
                        title={`추가요금 방식 ${domesticAdditionalFeeModeNumber}번`}
                      >
                        {domesticAdditionalFeeModeNumber}
                      </span>
                    )}
                    {additionalFeeCountLabel}
                  </span>
                  <span className="font-bold text-green-700 dark:text-green-300">{additionalFeeInfo.rawAdditionalFee.toLocaleString()}원</span>
                </div>
                {Array.isArray((additionalFeeInfo as any).feeDetails) && (additionalFeeInfo as any).feeDetails.length > 0 && (
                  <div className="rounded-md bg-white/60 dark:bg-black/20 px-3 py-2 space-y-1 mb-2 border border-green-200/80 dark:border-green-800/80">
                    <p className="text-[10px] font-semibold text-green-700/80 dark:text-green-300/80 mb-0.5">계산 내역</p>
                    {((additionalFeeInfo as any).feeDetails as Array<{ label: string; amount: number }>).map((d, idx) => (
                      <div key={`${d.label}-${idx}`} className="flex justify-between text-xs text-green-800/90 dark:text-green-200/90">
                        <span>{d.label}</span>
                        <span className="font-medium">+{d.amount.toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-700 dark:text-green-300">선지급 차감</span>
                  <span className="font-bold text-green-700 dark:text-green-300">-{additionalFeeInfo.prepaidAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-sm border-t border-green-300 dark:border-green-700 pt-1">
                  <span className="text-green-700 dark:text-green-300 font-semibold">추가 결제 필요</span>
                  <span className="font-bold text-green-700 dark:text-green-300">0원 (완납)</span>
                </div>
              </div>
            )}

            {/* 추가요금 섹션 - 추가요금이 있을 때만 표시 */}
            {isInUse && additionalFeeInfo.additionalFee > 0 && (
              <div className="space-y-3 p-4 border rounded-[1.25rem] bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
                <div className="flex justify-between text-sm">
                  <span className="text-orange-700 dark:text-orange-300 font-semibold inline-flex items-center gap-1.5">
                    {!isCurrentlyForeigner && (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-orange-600 px-1.5 text-[11px] font-bold text-white"
                        title={`추가요금 방식 ${domesticAdditionalFeeModeNumber}번`}
                      >
                        {domesticAdditionalFeeModeNumber}
                      </span>
                    )}
                    {additionalFeeCountLabel}
                  </span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">+{additionalFeeInfo.rawAdditionalFee.toLocaleString()}원</span>
                </div>
                {/* 추가요금 계산 내역 (모든 방식 공통) */}
                {Array.isArray((additionalFeeInfo as any).feeDetails) && (additionalFeeInfo as any).feeDetails.length > 0 && (
                  <div className="rounded-md bg-white/70 dark:bg-black/20 px-3 py-2 space-y-1 border border-orange-200/80 dark:border-orange-800/80">
                    <p className="text-[10px] font-semibold text-orange-700/80 dark:text-orange-300/80 mb-0.5">계산 내역</p>
                    {((additionalFeeInfo as any).feeDetails as Array<{ label: string; amount: number }>).map((d, idx) => (
                      <div key={`${d.label}-${idx}`} className="flex justify-between text-xs text-orange-800/90 dark:text-orange-200/90">
                        <span>{d.label}</span>
                        <span className="font-medium">+{d.amount.toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* 선지급 금액이 있지만 추가요금이 남아있는 경우 */}
                {additionalFeeInfo.prepaidAmount > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
                      <span>선지급 차감</span>
                      <span className="font-bold">-{additionalFeeInfo.prepaidAmount.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-orange-300 dark:border-orange-700 pt-2">
                      <span className="text-orange-700 dark:text-orange-300 font-semibold">추가 결제 필요</span>
                      <span className="font-bold text-orange-700 dark:text-orange-300">+{additionalFeeInfo.additionalFee.toLocaleString()}원</span>
                    </div>
                  </>
                )}

                {/* 추가요금 지불방식 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-orange-700 dark:text-orange-300">지불방식</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="additional-fee-split-payment" 
                        checked={useAdditionalFeeSplitPayment}
                        onCheckedChange={(checked) => {
                          setUseAdditionalFeeSplitPayment(checked as boolean);
                          // 분리결제 토글 시 현금영수증 상태 리셋
                          setIsAdditionalFeeCashReceipt(false);
                          if (checked) {
                            setAdditionalFeePaymentCash("");
                            setAdditionalFeePaymentCard("");
                            setAdditionalFeePaymentTransfer("");
                          }
                        }}
                        data-testid="checkbox-additional-fee-split-payment"
                      />
                      <Label htmlFor="additional-fee-split-payment" className="text-xs cursor-pointer font-normal text-orange-700 dark:text-orange-300">
                        분리결제
                      </Label>
                    </div>
                  </div>

                  {useAdditionalFeeSplitPayment ? (
                    <>
                      <div className="locker-opt-split-grid">
                        <div>
                          <Label htmlFor="additional-fee-payment-cash" className="text-xs text-muted-foreground">현금</Label>
                          <Input
                            id="additional-fee-payment-cash"
                            type="text"
                            placeholder="0"
                            value={additionalFeePaymentCash}
                            onChange={(e) => {
                              const newCash = e.target.value;
                              setAdditionalFeePaymentCash(newCash);
                              
                              const cashVal = parseInt(newCash) || 0;
                              const remaining = additionalFeeInfo.additionalFee - cashVal;
                              
                              if (remaining > 0) {
                                setAdditionalFeePaymentCard(String(remaining));
                                setAdditionalFeePaymentTransfer("");
                              } else if (remaining === 0) {
                                setAdditionalFeePaymentCard("");
                                setAdditionalFeePaymentTransfer("");
                              }
                            }}
                            data-testid="input-additional-fee-payment-cash"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="additional-fee-payment-card" className="text-xs text-muted-foreground">카드</Label>
                          <Input
                            id="additional-fee-payment-card"
                            type="text"
                            placeholder="0"
                            value={additionalFeePaymentCard}
                            onChange={(e) => {
                              const newCard = e.target.value;
                              setAdditionalFeePaymentCard(newCard);
                              
                              const cashVal = parseInt(additionalFeePaymentCash) || 0;
                              const cardVal = parseInt(newCard) || 0;
                              const remaining = additionalFeeInfo.additionalFee - cashVal - cardVal;
                              
                              if (remaining > 0) {
                                setAdditionalFeePaymentTransfer(String(remaining));
                              } else if (remaining === 0) {
                                setAdditionalFeePaymentTransfer("");
                              }
                            }}
                            data-testid="input-additional-fee-payment-card"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="additional-fee-payment-transfer" className="text-xs text-muted-foreground">이체</Label>
                          <Input
                            id="additional-fee-payment-transfer"
                            type="text"
                            placeholder="0"
                            value={additionalFeePaymentTransfer}
                            onChange={(e) => setAdditionalFeePaymentTransfer(e.target.value)}
                            data-testid="input-additional-fee-payment-transfer"
                            className="mt-1"
                          />
                        </div>
                      </div>
                      {(() => {
                        const cashVal = parseInt(additionalFeePaymentCash) || 0;
                        const cardVal = parseInt(additionalFeePaymentCard) || 0;
                        const transferVal = parseInt(additionalFeePaymentTransfer) || 0;
                        const total = cashVal + cardVal + transferVal;
                        
                        // 추가요금 분리결제 부가세 계산
                        const cashTransferVal = cashVal + transferVal;
                        const cashTransferVat = (enableCashReceiptVat && isAdditionalFeeCashReceipt && cashTransferVal > 0) 
                          ? Math.round(cashTransferVal * 0.1) : 0;
                        const cardVat = (enableCardVat && cardVal > 0) 
                          ? Math.round(cardVal * 0.1) : 0;
                        const totalWithVat = total + cashTransferVat + cardVat;
                        
                        return (
                          <div className="flex items-center justify-between pt-2 border-t border-orange-200 dark:border-orange-800">
                            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">합계</span>
                            <div className="text-right">
                              <span className="text-lg font-bold text-orange-700 dark:text-orange-300">{total.toLocaleString()}원</span>
                              {(cashTransferVat > 0 || cardVat > 0) && (
                                <span className="text-sm text-blue-600 dark:text-blue-400 ml-2">
                                  (+부가세 {(cashTransferVat + cardVat).toLocaleString()}원 = {totalWithVat.toLocaleString()}원)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* 추가요금 분리결제 현금영수증 체크박스 */}
                      {enableCashReceiptVat && ((parseInt(additionalFeePaymentCash) || 0) > 0 || (parseInt(additionalFeePaymentTransfer) || 0) > 0) && (
                        <div className="flex items-center space-x-2 pt-2">
                          <Checkbox 
                            id="additional-fee-split-cash-receipt" 
                            checked={isAdditionalFeeCashReceipt}
                            onCheckedChange={(checked) => setIsAdditionalFeeCashReceipt(checked as boolean)}
                            data-testid="checkbox-additional-fee-split-cash-receipt"
                          />
                          <Label htmlFor="additional-fee-split-cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                            현금/이체 현금영수증 발행 (+10% 부가세)
                          </Label>
                        </div>
                      )}

                      {/* 추가요금 분리결제 카드 부가세 안내 */}
                      {enableCardVat && (parseInt(additionalFeePaymentCard) || 0) > 0 && (
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            카드결제 금액에 부가세 10%가 자동으로 추가됩니다
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <Select value={additionalFeePaymentMethod} onValueChange={(value) => {
                        setAdditionalFeePaymentMethod(value as 'card' | 'cash' | 'transfer');
                        additionalFeePaymentMethodUserChangedRef.current = true;
                        // 결제 방식 변경 시 현금영수증 체크 해제
                        setIsAdditionalFeeCashReceipt(false);
                        if (value === 'card') {
                          const cardSettings = localDb.getSettings();
                          if (cardSettings.cardPaymentAppEnabled && cardSettings.cardPaymentAppPackage) {
                            const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${cardSettings.cardPaymentAppPackage};end`;
                            window.location.href = intentUrl;
                          }
                        }
                      }}>
                        <SelectTrigger data-testid="select-additional-fee-payment-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">현금</SelectItem>
                          <SelectItem value="card">카드</SelectItem>
                          <SelectItem value="transfer">계좌이체</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* 추가요금 현금영수증 체크박스 */}
                      {enableCashReceiptVat && (additionalFeePaymentMethod === 'cash' || additionalFeePaymentMethod === 'transfer') && (
                        <div className="flex items-center space-x-2 pt-2">
                          <Checkbox 
                            id="additional-fee-cash-receipt" 
                            checked={isAdditionalFeeCashReceipt}
                            onCheckedChange={(checked) => setIsAdditionalFeeCashReceipt(checked as boolean)}
                            data-testid="checkbox-additional-fee-cash-receipt"
                          />
                          <Label htmlFor="additional-fee-cash-receipt" className="text-sm cursor-pointer font-normal text-blue-600 dark:text-blue-400">
                            현금영수증 발행 (+10% 부가세)
                          </Label>
                        </div>
                      )}

                      {/* 추가요금 카드결제 부가세 안내 */}
                      {enableCardVat && additionalFeePaymentMethod === 'card' && (
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            카드결제 시 부가세 10%가 자동으로 추가됩니다
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 추가요금 할인 섹션 */}
                <div className="space-y-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                  <Label className="text-sm font-semibold text-orange-700 dark:text-orange-300">추가요금 할인</Label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="additional-fee-full-discount" 
                        checked={additionalFeeFullDiscount}
                        onCheckedChange={(checked) => {
                          setAdditionalFeeFullDiscount(checked as boolean);
                          if (checked) {
                            setAdditionalFeePartialDiscount(false);
                            setAdditionalFeeDiscount(String(additionalFeeInfo.additionalFee));
                          } else {
                            setAdditionalFeeDiscount("");
                          }
                        }}
                        data-testid="checkbox-additional-fee-full-discount"
                      />
                      <Label htmlFor="additional-fee-full-discount" className="text-sm cursor-pointer font-normal text-red-600 dark:text-red-400">
                        전액 할인
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="additional-fee-partial-discount" 
                        checked={additionalFeePartialDiscount}
                        onCheckedChange={(checked) => {
                          setAdditionalFeePartialDiscount(checked as boolean);
                          if (checked) {
                            setAdditionalFeeFullDiscount(false);
                            setAdditionalFeeDiscount("");
                          } else {
                            setAdditionalFeeDiscount("");
                          }
                        }}
                        data-testid="checkbox-additional-fee-partial-discount"
                      />
                      <Label htmlFor="additional-fee-partial-discount" className="text-sm cursor-pointer font-normal text-red-600 dark:text-red-400">
                        일부 할인
                      </Label>
                    </div>
                  </div>
                  
                  {/* 일부 할인 금액 입력 */}
                  {additionalFeePartialDiscount && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="할인 금액 입력"
                        value={additionalFeeDiscount}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          if (value <= additionalFeeInfo.additionalFee) {
                            setAdditionalFeeDiscount(e.target.value);
                          }
                        }}
                        className="flex-1"
                        data-testid="input-additional-fee-discount"
                      />
                      <span className="text-sm text-muted-foreground">원</span>
                    </div>
                  )}
                  
                  {/* 할인 적용 후 최종 추가요금 표시 */}
                  {(additionalFeeFullDiscount || (additionalFeePartialDiscount && additionalFeeDiscount)) && (
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-orange-700 dark:text-orange-300">할인 적용 후 추가요금</span>
                      <span className="font-bold text-orange-700 dark:text-orange-300">
                        {(additionalFeeInfo.additionalFee - (parseInt(additionalFeeDiscount) || 0)).toLocaleString()}원
                      </span>
                    </div>
                  )}
                </div>

                {/* 추가요금완납 버튼 */}
                <Button
                  type="button"
                  className={`w-full h-12 text-base font-semibold border rounded-xl ${
                    additionalFeeResolved 
                      ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed border-white' 
                      : 'bg-[hsl(232_92%_58%)] hover:bg-[hsl(232_92%_52%)] text-white border-white'
                  }`}
                  onClick={() => {
                    // 추가요금 정보를 메모에 자동 기록
                    let additionalFeeMemo = '';
                    
                    if (additionalFeeFullDiscount) {
                      // 전액할인인 경우
                      additionalFeeMemo = `추가요금 총 ${additionalFeeInfo.additionalFee.toLocaleString()}원 전액할인`;
                    } else if (additionalFeePartialDiscount) {
                      // 일부할인인 경우
                      const discountAmount = parseInt(additionalFeeDiscount) || 0;
                      if (discountAmount > 0) {
                        additionalFeeMemo = `추가요금 총 ${additionalFeeInfo.additionalFee.toLocaleString()}원중 ${discountAmount.toLocaleString()}원 할인 받음`;
                      }
                    }
                    
                    // 할인이 있는 경우에만 메모에 추가
                    if (additionalFeeMemo) {
                      const updatedMemo = customerMemo.trim() 
                        ? `${customerMemo}\n${additionalFeeMemo}` 
                        : additionalFeeMemo;
                      setCustomerMemo(updatedMemo);
                    }
                    
                    setAdditionalFeeResolved(true);
                    setCheckoutResolved(true);
                    toast({
                      title: "추가요금 완납",
                      description: "추가요금이 완납 처리되었습니다. 퇴실 버튼이 활성화됩니다.",
                    });
                  }}
                  disabled={additionalFeeResolved}
                  data-testid="button-additional-fee-complete"
                >
                  {additionalFeeResolved ? '추가요금 완납됨 ✓' : '추가요금완납'}
                </Button>
              </div>
            )}

            {/* 최종 요금 (부가세 포함) — 설명은 라벨 호버/클릭 시에만 */}
            <div className="locker-opt-section locker-opt-section-final">
              <div className="locker-opt-final-total">
                <LabelHint
                  className="font-semibold"
                  content={(() => {
                    const lines = ["표시 금액은 부가세가 적용된 최종 요금입니다."];
                    if (isInUse && entryTime && additionalFeeInfo.additionalFee > 0) {
                      const bdHour = Number(settings.businessDayStartHour) || 10;
                      const entryBd = getBusinessDay(new Date(entryTime), bdHour);
                      const currentBd = getBusinessDay(new Date(), bdHour);
                      if (entryBd !== currentBd) {
                        lines.push("입실 영업일과 달라 기본요금(이미 수납)은 최종에서 제외합니다.");
                        const vatOn =
                          !useAdditionalFeeSplitPayment &&
                          shouldApplyVat(additionalFeePaymentMethod, isAdditionalFeeCashReceipt);
                        if (vatOn) {
                          lines.push("카드/현금영수증 부가세 10%가 추가요금에 포함됩니다.");
                        }
                      }
                    }
                    return lines.join("\n");
                  })()}
                >
                  최종 요금
                </LabelHint>
                <span className="font-bold text-xl text-primary">{calculateDisplayTotal().toLocaleString()}원</span>
              </div>
            </div>

            {/* 추가매출 항목 - 버튼형 선택 */}
            {availableRentalItems.length > 0 && (
              <div className="locker-opt-section locker-opt-section-rental space-y-3">
                <button
                  type="button"
                  className="locker-opt-collapse-header"
                  onClick={toggleRentalSectionCollapsed}
                  data-testid="button-toggle-rental-section"
                >
                  <Label className="text-sm font-semibold cursor-pointer">추가매출 항목 (선택사항)</Label>
                  {isRentalSectionCollapsed ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {!isRentalSectionCollapsed && (
                <div className="space-y-3">
                  {availableRentalItems.map((item) => {
                    const itemId = item.id;
                    const isChecked = selectedRentalItems.has(itemId);
                    const depositStatus = depositStatuses.get(itemId);
                    const isSimple = isSimpleSaleItem(item);
                    const quantity = rentalItemQuantities.get(itemId) || 1;
                    
                    // Check if this specific item is actively rented (not returned)
                    const isAlreadyRented = currentRentalTransactions.some(
                      txn => txn.itemId === itemId && txn.returnCompleted !== 1
                    );

                    const selectItem = () => {
                      const newSelected = new Set(selectedRentalItems);
                      newSelected.add(itemId);
                      const newStatuses = new Map(depositStatuses);
                      const newPaymentMethods = new Map(rentalPaymentMethods);
                      const newQuantities = new Map(rentalItemQuantities);

                      if (isSimple || item.depositAmount === 0) {
                        newStatuses.set(itemId, 'none');
                      } else if (!isAlreadyRented) {
                        newStatuses.set(itemId, 'received');
                      } else {
                        const existingTransaction = currentRentalTransactions.find(txn => txn.itemId === itemId);
                        if (existingTransaction) {
                          newStatuses.set(itemId, existingTransaction.depositStatus);
                          newPaymentMethods.set(itemId, existingTransaction.paymentMethod || 'cash');
                        }
                      }

                      if (!newPaymentMethods.has(itemId)) {
                        newPaymentMethods.set(itemId, 'cash');
                      }
                      if (isSimple && !newQuantities.has(itemId)) {
                        newQuantities.set(itemId, 1);
                      }

                      setDepositStatuses(newStatuses);
                      setRentalPaymentMethods(newPaymentMethods);
                      setRentalItemQuantities(newQuantities);

                      if (!isAlreadyRented) {
                        const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                        const marker = memoActionMarker(item.name, isSimple);
                        setCustomerMemo(prev => {
                          if (prev.includes(marker)) {
                            if (isSimple) return prev;
                            return prev.split('\n').map(line => {
                              if (!line.startsWith(marker)) return line;
                              const lastSlashIdx = line.lastIndexOf(' / ');
                              const lastSeg = lastSlashIdx >= 0 ? line.slice(lastSlashIdx + 3) : line;
                              if (lastSeg.includes('대여취소:')) {
                                return `${line} / 재대여: ${nowTimeStr}`;
                              }
                              return line;
                            }).join('\n');
                          }
                          const newLine = `${marker} ${nowTimeStr}`;
                          return prev.trim() ? `${prev}\n${newLine}` : newLine;
                        });
                      }

                      setSelectedRentalItems(newSelected);
                    };

                    const deselectItem = () => {
                      // 단순판매·신규 선택은 확인 없이 바로 해제
                      if (!isAlreadyRented && isSimple) {
                        const newSelected = new Set(selectedRentalItems);
                        newSelected.delete(itemId);
                        setSelectedRentalItems(newSelected);
                        const newQuantities = new Map(rentalItemQuantities);
                        newQuantities.delete(itemId);
                        setRentalItemQuantities(newQuantities);
                        const newStatuses = new Map(depositStatuses);
                        const newPaymentMethods = new Map(rentalPaymentMethods);
                        newStatuses.delete(itemId);
                        newPaymentMethods.delete(itemId);
                        setDepositStatuses(newStatuses);
                        setRentalPaymentMethods(newPaymentMethods);
                        // 신규 판매 선택 취소 시 메모의 해당 판매 줄 제거
                        const marker = memoActionMarker(item.name, true);
                        setCustomerMemo(prev =>
                          prev
                            .split('\n')
                            .filter(line => !line.startsWith(marker))
                            .join('\n')
                            .trim()
                        );
                        return;
                      }
                      if (!isAlreadyRented) {
                        setPendingUncheckItem({ itemId, itemName: item.name });
                        return;
                      }
                      const newSelected = new Set(selectedRentalItems);
                      newSelected.delete(itemId);
                      setSelectedRentalItems(newSelected);
                      const newQuantities = new Map(rentalItemQuantities);
                      newQuantities.delete(itemId);
                      setRentalItemQuantities(newQuantities);
                    };

                    const unitFee = item.rentalFee || 0;
                    const priceLabel = isSimple
                      ? `${unitFee.toLocaleString()}원`
                      : (item.depositAmount || 0) === 0
                        ? `대여 ${unitFee.toLocaleString()}원`
                        : `대여 ${unitFee.toLocaleString()}원 · 보증금 ${(item.depositAmount || 0).toLocaleString()}원`;
                    
                    return (
                      <div key={itemId} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <Button
                              type="button"
                              size="sm"
                              variant={isChecked ? "default" : "outline"}
                              className={`h-9 px-3 text-sm font-medium ${
                                isChecked
                                  ? "shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              onClick={() => {
                                if (isChecked) {
                                  deselectItem();
                                } else {
                                  selectItem();
                                }
                              }}
                              data-testid={`button-rental-item-${itemId}`}
                            >
                              <span className="truncate">{item.name}</span>
                              <span className={`ml-2 text-xs ${isChecked ? "opacity-90" : "opacity-70"}`}>
                                {priceLabel}
                              </span>
                            </Button>

                            {isChecked && isSimple && (
                              <div
                                className="inline-flex items-center gap-1 rounded-md border bg-background px-1 py-0.5"
                                data-testid={`quantity-controls-${itemId}`}
                              >
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    const current = rentalItemQuantities.get(itemId) || 1;
                                    if (current <= 1) {
                                      deselectItem();
                                      return;
                                    }
                                    const next = new Map(rentalItemQuantities);
                                    next.set(itemId, current - 1);
                                    setRentalItemQuantities(next);
                                  }}
                                  data-testid={`button-qty-minus-${itemId}`}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <span
                                  className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums"
                                  data-testid={`text-qty-${itemId}`}
                                >
                                  {quantity}
                                </span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    if (!isChecked) {
                                      selectItem();
                                      return;
                                    }
                                    const current = rentalItemQuantities.get(itemId) || 1;
                                    const next = new Map(rentalItemQuantities);
                                    next.set(itemId, Math.min(99, current + 1));
                                    setRentalItemQuantities(next);
                                  }}
                                  data-testid={`button-qty-plus-${itemId}`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                                {quantity > 1 && (
                                  <span className="pr-1 text-xs text-muted-foreground tabular-nums">
                                    = {(unitFee * quantity).toLocaleString()}원
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* 취소 버튼 - 이미 저장된 거래이고 반납완료 안 된 항목만 */}
                          {isAlreadyRented && !returnCompletedItems.has(itemId) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive shrink-0"
                              onClick={() => {
                                const txn = currentRentalTransactions.find(t => t.itemId === itemId);
                                if (txn) {
                                  setCancellingRentalItem({
                                    txnId: txn.id,
                                    itemId: itemId,
                                    itemName: item.name,
                                    isSimple,
                                  });
                                }
                              }}
                              data-testid={`button-cancel-rental-${itemId}`}
                            >
                              <X className="h-3 w-3 mr-1" />
                              {isSimple ? "판매 취소" : "대여 취소"}
                            </Button>
                          )}
                        </div>
                        
                        {/* 반납완료 + 재대여 버튼 - DB에서 로드된 반납완료 항목 (체크박스 미선택 상태) */}
                        {returnCompletedItems.has(itemId) && !isChecked && (
                          <div className="ml-6 flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                              ✓ 반납완료
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400"
                              onClick={() => {
                                // 재대여: returnCompleted 해제, 신규 대여로 처리
                                const newReturn = new Set(returnCompletedItems);
                                newReturn.delete(itemId);
                                setReturnCompletedItems(newReturn);
                                
                                const newSelected = new Set(selectedRentalItems);
                                newSelected.add(itemId);
                                setSelectedRentalItems(newSelected);
                                
                                const newPending = new Set(pendingReRentalItems);
                                newPending.add(itemId);
                                setPendingReRentalItems(newPending);

                                const newQuantities = new Map(rentalItemQuantities);
                                newQuantities.set(itemId, 1);
                                setRentalItemQuantities(newQuantities);
                                
                                // 보증금 상태 초기화 (신규 대여)
                                const newStatuses = new Map(depositStatuses);
                                if ((item.depositAmount || 0) === 0) {
                                  newStatuses.set(itemId, 'none');
                                } else {
                                  newStatuses.set(itemId, 'received');
                                }
                                setDepositStatuses(newStatuses);
                                
                                // 결제방식 기본값 설정
                                const newPaymentMethods = new Map(rentalPaymentMethods);
                                if (!newPaymentMethods.has(itemId)) {
                                  newPaymentMethods.set(itemId, 'cash');
                                }
                                setRentalPaymentMethods(newPaymentMethods);
                                
                                // 메모에 재대여 시각 기록
                                const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                const marker = `[${item.name}] 대여:`;
                                setCustomerMemo(prev => {
                                  if (prev.includes(marker)) {
                                    return prev.split('\n').map(line => {
                                      if (!line.startsWith(marker)) return line;
                                      return `${line} / 재대여: ${nowTimeStr}`;
                                    }).join('\n');
                                  }
                                  const newLine = `${marker} 재대여: ${nowTimeStr}`;
                                  return prev.trim() ? `${prev}\n${newLine}` : newLine;
                                });
                              }}
                              data-testid={`button-rerental-${itemId}`}
                            >
                              재대여
                            </Button>
                          </div>
                        )}
                        
                        {/* 대여 물품 옵션 - 체크박스 선택된 경우에만 표시 */}
                        {isChecked && (
                          <div className="ml-6 space-y-3">
                            {/* 직접입력 - 신규 대여 항목만 (이미 대여 중이거나 반납완료된 경우 제외) */}
                            {!isAlreadyRented && !returnCompletedItems.has(itemId) && (
                              <div className="space-y-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className={`text-xs ${rentalDirectInputEnabled.has(itemId) ? 'bg-orange-50 border-orange-400 text-orange-700 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-400' : 'text-muted-foreground'}`}
                                  onClick={() => {
                                    const newEnabled = new Set(rentalDirectInputEnabled);
                                    if (newEnabled.has(itemId)) {
                                      newEnabled.delete(itemId);
                                      const newFees = new Map(rentalCustomFees);
                                      const newDeposits = new Map(rentalCustomDeposits);
                                      newFees.delete(itemId);
                                      newDeposits.delete(itemId);
                                      setRentalCustomFees(newFees);
                                      setRentalCustomDeposits(newDeposits);
                                    } else {
                                      newEnabled.add(itemId);
                                      const newFees = new Map(rentalCustomFees);
                                      const newDeposits = new Map(rentalCustomDeposits);
                                      newFees.set(itemId, String(item.rentalFee || 0));
                                      newDeposits.set(itemId, String(item.depositAmount || 0));
                                      setRentalCustomFees(newFees);
                                      setRentalCustomDeposits(newDeposits);
                                    }
                                    setRentalDirectInputEnabled(newEnabled);
                                  }}
                                  data-testid={`button-direct-input-${itemId}`}
                                >
                                  ✎ 직접입력{rentalDirectInputEnabled.has(itemId) ? ' (ON)' : ''}
                                </Button>
                                {rentalDirectInputEnabled.has(itemId) && (
                                  <div className="grid grid-cols-2 gap-2 p-2 bg-orange-50/50 dark:bg-orange-900/20 rounded-md border border-orange-200 dark:border-orange-800">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">
                                        {isSimpleSaleItem(item) ? "가격 (원)" : "대여비 (원)"}
                                      </Label>
                                      <Input
                                        type="number"
                                        value={rentalCustomFees.get(itemId) ?? String(item.rentalFee || 0)}
                                        onChange={(e) => {
                                          const newFees = new Map(rentalCustomFees);
                                          newFees.set(itemId, e.target.value);
                                          setRentalCustomFees(newFees);
                                        }}
                                        className="h-8 text-sm"
                                        min={0}
                                        data-testid={`input-custom-rental-fee-${itemId}`}
                                      />
                                    </div>
                                    {(item.depositAmount || 0) > 0 && (
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">보증금 (원)</Label>
                                        <Input
                                          type="number"
                                          value={rentalCustomDeposits.get(itemId) ?? String(item.depositAmount || 0)}
                                          onChange={(e) => {
                                            const newDeposits = new Map(rentalCustomDeposits);
                                            newDeposits.set(itemId, e.target.value);
                                            setRentalCustomDeposits(newDeposits);
                                          }}
                                          className="h-8 text-sm"
                                          min={0}
                                          data-testid={`input-custom-deposit-${itemId}`}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 반납완료 표시 + 반납취소 버튼 */}
                            {returnCompletedItems.has(itemId) && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                                  ✓ 반납완료 ({(item.depositAmount || 0) === 0 ? '처리완료' : depositStatus === 'refunded' ? '환급' : depositStatus === 'forfeited' ? '몰수' : '처리됨'})
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs text-muted-foreground h-6 px-2"
                                  onClick={() => {
                                    const newReturn = new Set(returnCompletedItems);
                                    newReturn.delete(itemId);
                                    setReturnCompletedItems(newReturn);
                                    const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                    setCustomerMemo(prev => {
                                      const rentalMarker = `[${item.name}] 대여:`;
                                      if (prev.includes(rentalMarker)) {
                                        return prev.split('\n').map(line => {
                                          if (!line.startsWith(rentalMarker)) return line;
                                          const lastSlashIdx = line.lastIndexOf(' / ');
                                          const lastSeg = lastSlashIdx >= 0 ? line.slice(lastSlashIdx + 3) : line;
                                          // 마지막 세그먼트가 반납 상태(반납취소 없음)인 경우만 반납취소 기록
                                          if (lastSeg.includes('반납:') && !lastSeg.includes('반납취소:')) {
                                            return `${line}, 반납취소: ${nowTimeStr}`;
                                          }
                                          return line;
                                        }).join('\n');
                                      }
                                      const cancelLine = `[${item.name}] 반납취소: ${nowTimeStr}`;
                                      return prev.trim() ? `${prev}\n${cancelLine}` : cancelLine;
                                    });
                                  }}
                                  data-testid={`button-return-cancel-${itemId}`}
                                >
                                  반납취소
                                </Button>
                              </div>
                            )}
                            
                            {/* 보증금 처리 - 반납완료되지 않은 경우에만 표시 (보증금 유무 상관없음) */}
                            {!returnCompletedItems.has(itemId) && (
                            <div className="space-y-2">
                              {/* 보증금이 있는 경우에만 보증금 처리 섹션 표시 */}
                              {(item.depositAmount || 0) > 0 && (
                                <>
                                  <Label htmlFor={`deposit-status-${itemId}`} className="text-xs text-muted-foreground">
                                    보증금 처리
                                    {item.depositAmount > 0 && depositStatus === 'received' && (!isInUse || !isAlreadyRented) && (
                                      <span className="ml-2 text-xs font-semibold text-orange-600 dark:text-orange-400">
                                        ⚠ 보증금 받음
                                      </span>
                                    )}
                                  </Label>
                                  <Select 
                                    value={depositStatus} 
                                    onValueChange={(value) => {
                                      const newStatuses = new Map(depositStatuses);
                                      newStatuses.set(itemId, value as 'received' | 'refunded' | 'forfeited' | 'none');
                                      setDepositStatuses(newStatuses);
                                    }}
                                  >
                                    <SelectTrigger 
                                      id={`deposit-status-${itemId}`} 
                                      data-testid={`select-deposit-${itemId}`}
                                      className={!depositStatus ? 'border-orange-500' : ''}
                                    >
                                      <SelectValue placeholder="보증금 처리를 선택하세요" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {/* 보증금 있음 - '받음' 옵션 (신규 입실 또는 아직 대여하지 않은 항목) */}
                                      {item.depositAmount > 0 && (!isInUse || !isAlreadyRented) && (
                                        <SelectItem value="received">받음 (입실 시)</SelectItem>
                                      )}
                                      
                                      {/* 보증금 있음 - '환급'/'몰수' 옵션 (이미 대여 중인 항목만) */}
                                      {item.depositAmount > 0 && isInUse && isAlreadyRented && (
                                        <>
                                          <SelectItem value="refunded">환급 (매출 없음)</SelectItem>
                                          <SelectItem value="forfeited">몰수 (매출 기록)</SelectItem>
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  {!depositStatus && (
                                    <p className="text-xs text-orange-600 dark:text-orange-400">
                                      {isInUse && isAlreadyRented ? '⚠️ 퇴실 전에 보증금 상태(환급/몰수)를 선택해주세요' : '⚠️ 보증금 상태를 선택해주세요'}
                                    </p>
                                  )}
                                </>
                              )}
                              
                              {/* 반납완료 버튼 - 대여형(rental)만 표시, 일반판매형(simple)은 제외 */}
                              {/* 대여형: 보증금 없는 경우 또는 보증금 처리(환급/몰수) 선택 시 표시 */}
                              {item.billingType !== 'simple' && ((item.depositAmount || 0) === 0 || (isInUse && isAlreadyRented && (depositStatus === 'refunded' || depositStatus === 'forfeited'))) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 text-blue-600 border-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-400 dark:hover:bg-blue-950"
                                  onClick={() => {
                                    const newReturnCompleted = new Set(returnCompletedItems);
                                    newReturnCompleted.add(itemId);
                                    setReturnCompletedItems(newReturnCompleted);
                                    // 반납 시각을 메모에 자동 기록
                                    const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                    setCustomerMemo(prev => {
                                      const rentalMarker = `[${item.name}] 대여:`;
                                      if (prev.includes(rentalMarker)) {
                                        return prev.split('\n').map(line => {
                                          if (!line.startsWith(rentalMarker)) return line;
                                          const lastSlashIdx = line.lastIndexOf(' / ');
                                          const lastSeg = lastSlashIdx >= 0 ? line.slice(lastSlashIdx + 3) : line;
                                          // 마지막 상태가 반납 전(반납 없거나 반납취소)이면 반납 기록
                                          if (!lastSeg.includes('반납:') || lastSeg.includes('반납취소:')) {
                                            return `${line} / 반납: ${nowTimeStr}`;
                                          }
                                          return line;
                                        }).join('\n');
                                      }
                                      const returnLine = `[${item.name}] 반납: ${nowTimeStr}`;
                                      return prev.trim() ? `${prev}\n${returnLine}` : returnLine;
                                    });
                                  }}
                                  data-testid={`button-return-complete-${itemId}`}
                                >
                                  반납완료
                                </Button>
                              )}
                            </div>
                            )}

                            {/* 결제방식 - 반납완료되지 않은 경우에만 표시 */}
                            {!returnCompletedItems.has(itemId) && (
                            <div className="space-y-2">
                              <Label htmlFor={`rental-payment-${itemId}`} className="text-xs text-muted-foreground">
                                결제방식
                              </Label>
                              <Select 
                                value={rentalPaymentMethods.get(itemId) || 'cash'} 
                                onValueChange={(value) => {
                                  const newMethods = new Map(rentalPaymentMethods);
                                  newMethods.set(itemId, value as 'cash' | 'card' | 'transfer');
                                  setRentalPaymentMethods(newMethods);
                                  // 결제방식 변경 시 현금영수증 체크 해제
                                  const newCashReceiptStatuses = new Map(rentalCashReceiptStatuses);
                                  newCashReceiptStatuses.set(itemId, false);
                                  setRentalCashReceiptStatuses(newCashReceiptStatuses);
                                  if (value === 'card') {
                                    const cardSettings = localDb.getSettings();
                                    if (cardSettings.cardPaymentAppEnabled && cardSettings.cardPaymentAppPackage) {
                                      const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${cardSettings.cardPaymentAppPackage};end`;
                                      window.location.href = intentUrl;
                                    }
                                  }
                                }}
                              >
                                <SelectTrigger 
                                  id={`rental-payment-${itemId}`} 
                                  data-testid={`select-rental-payment-${itemId}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="cash">현금</SelectItem>
                                  <SelectItem value="card">카드</SelectItem>
                                  <SelectItem value="transfer">계좌이체</SelectItem>
                                </SelectContent>
                              </Select>
                              
                              {/* 현금영수증 체크박스 - 현금 또는 계좌이체 선택 시 표시 */}
                              {(rentalPaymentMethods.get(itemId) === 'cash' || rentalPaymentMethods.get(itemId) === 'transfer' || (!rentalPaymentMethods.get(itemId) && 'cash' === 'cash')) && settings.enableCashReceiptVat && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Checkbox
                                    id={`rental-cash-receipt-${itemId}`}
                                    checked={rentalCashReceiptStatuses.get(itemId) || false}
                                    onCheckedChange={(checked) => {
                                      const newStatuses = new Map(rentalCashReceiptStatuses);
                                      newStatuses.set(itemId, checked === true);
                                      setRentalCashReceiptStatuses(newStatuses);
                                    }}
                                    data-testid={`checkbox-rental-cash-receipt-${itemId}`}
                                  />
                                  <Label 
                                    htmlFor={`rental-cash-receipt-${itemId}`}
                                    className="text-xs text-muted-foreground cursor-pointer"
                                  >
                                    현금영수증 발행 (+10% 부가세)
                                  </Label>
                                </div>
                              )}
                              
                              {/* 카드 결제 부가세 안내 */}
                              {rentalPaymentMethods.get(itemId) === 'card' && settings.enableCardVat && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                  (+10% 부가세 포함)
                                </p>
                              )}
                            </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {/* 손님 메모 입력 */}
            <div
              className={`locker-opt-section locker-opt-section-memo ${
                customerMemo && customerMemo.trim() ? 'locker-opt-memo-active animate-memo-gradient' : ''
              }`}
            >
              <div
                className="locker-opt-collapse-header"
                role="button"
                tabIndex={0}
                onClick={toggleMemoSectionCollapsed}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleMemoSectionCollapsed();
                  }
                }}
                data-testid="button-toggle-memo-section"
              >
                <div
                  className={`flex items-center gap-2 w-fit ${
                    customerMemo && customerMemo.trim()
                      ? "ml-2 rounded-full bg-white pl-2.5 pr-2.5 py-1 dark:bg-transparent dark:rounded-none dark:pl-0 dark:pr-0 dark:py-0"
                      : ""
                  }`}
                >
                  <LabelHint
                    className={`text-sm font-semibold ${
                      customerMemo && customerMemo.trim() ? "text-gray-700 dark:text-white" : ""
                    }`}
                    content={"손님에 관한 특별한 인상이나 특이사항을 기록하세요.\n예: 야간요금 냈으므로 추가요금 발생 시 전액할인"}
                  >
                    손님 메모
                  </LabelHint>
                </div>
                {isMemoSectionCollapsed ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              {!isMemoSectionCollapsed && (
              <div className="locker-opt-memo-input-shell">
                <Textarea
                  ref={memoTextareaRef}
                  id="customer-memo"
                  placeholder=""
                  value={customerMemo}
                  onChange={(e) => setCustomerMemo(e.target.value)}
                  className="locker-opt-memo-input overflow-hidden"
                  data-testid="input-customer-memo"
                />
              </div>
              )}
            </div>
          </div>

          {/* 환불 처리 섹션 (퇴실 시에만 표시) */}
          {isInUse && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowRefund(v => !v); if (showRefund) { setRefundAmount(""); setRefundNote(""); setRefundMethod(currentPaymentMethod || 'cash'); } }}
                  className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${showRefund ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400' : 'bg-white border-border text-muted-foreground hover-elevate dark:bg-zinc-800'}`}
                  data-testid="button-toggle-refund"
                >
                  <RotateCcw className="w-4 h-4" />
                  환불 처리
                  {showRefund && <span className="text-xs">(ON)</span>}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const timeStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
                    const newIsOuting = !currentIsOuting;
                    const label = newIsOuting ? `[${timeStr}] 외출` : `[${timeStr}] 복귀`;
                    const newMemo = customerMemo.trim() ? `${customerMemo}\n${label}` : label;
                    setCustomerMemo(newMemo);
                    setCurrentIsOuting(newIsOuting);
                  }}
                  className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${currentIsOuting ? 'bg-[#374151] border-[#1F2937] text-white' : 'bg-white border-border text-muted-foreground hover-elevate dark:bg-zinc-800'}`}
                  data-testid="button-toggle-outing"
                >
                  {currentIsOuting ? '복귀' : '외출'}
                </button>
              </div>
              {showRefund && (
                <div className="mt-2 p-3 rounded-md border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-red-700 dark:text-red-400 w-20 shrink-0">환불 금액</Label>
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        min="0"
                        step="100"
                        placeholder="0"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="pr-7 text-right"
                        data-testid="input-refund-amount"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-red-700 dark:text-red-400 w-20 shrink-0">환불 수단</Label>
                    <div className="flex gap-1.5">
                      {(['cash', 'card', 'transfer'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRefundMethod(m)}
                          className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${refundMethod === m ? 'bg-red-600 border-red-600 text-white' : 'border-border text-muted-foreground hover-elevate'}`}
                          data-testid={`button-refund-method-${m}`}
                        >
                          {m === 'cash' ? '현금' : m === 'card' ? '카드' : '이체'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium text-red-700 dark:text-red-400 w-20 shrink-0">환불 사유</Label>
                    <Input
                      type="text"
                      placeholder="환불 사유 (선택)"
                      value={refundNote}
                      onChange={(e) => setRefundNote(e.target.value)}
                      className="flex-1"
                      data-testid="input-refund-note"
                    />
                  </div>
                  {refundAmount && parseInt(refundAmount) > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      퇴실 시 {parseInt(refundAmount).toLocaleString()}원이 {refundMethod === 'cash' ? '현금' : refundMethod === 'card' ? '카드' : '이체'}으로 환불 처리되어 당일 매출에서 차감됩니다.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          </div>

          {/* Footer: 창 너비에 맞춰 버튼이 줄바꿈 */}
          <div className="locker-opt-footer shrink-0" data-testid="locker-options-footer">
            {isInUse ? (
              <div className="locker-opt-footer-actions">
                  <Button variant="destructive" className="locker-opt-footer-btn" onClick={handleCancelClick} data-testid="button-cancel">
                    입실취소
                  </Button>
                  <Button variant="secondary" className="locker-opt-footer-btn" onClick={handleSwapClick} data-testid="button-swap">
                    락카교체
                  </Button>
                  {!parentLockerNumber && (
                    <Button variant="secondary" className="locker-opt-footer-btn" onClick={handleLinkClick} data-testid="button-link">
                      락카묶기
                    </Button>
                  )}
                  {parentLockerNumber && (
                    <Button variant="secondary" className="locker-opt-footer-btn" onClick={handleUnlinkFromParent} data-testid="button-unlink">
                      묶기 해제
                    </Button>
                  )}
                  <Button variant="outline" className="locker-opt-footer-btn bg-white dark:bg-zinc-800" onClick={handleSaveChanges} data-testid="button-save">
                    수정저장
                  </Button>
                  {isCurrentlyDeferred && (
                    <Button
                      onClick={handleCompleteDeferredPayment}
                      className="locker-opt-footer-btn locker-opt-footer-btn-accent"
                      data-testid="button-complete-payment"
                      disabled={!useSplitPayment && !paymentMethod}
                    >
                      결제 완료
                    </Button>
                  )}
                  {(() => {
                    const checkoutDisabled = (() => {
                      if (isCurrentlyDeferred) {
                        return true;
                      }
                      const hasUnresolvedAdditionalFees = additionalFeeInfo.additionalFee > 0 && !checkoutResolved;
                      const hasUnresolvedRentalItems = Array.from(selectedRentalItems).some(itemId => {
                        const item = availableRentalItems.find(i => i.id === itemId);
                        if (item && isSimpleSaleItem(item)) {
                          return false;
                        }
                        if (item?.billingType === 'simple') {
                          return false;
                        }
                        return !returnCompletedItems.has(itemId);
                      });
                      return hasUnresolvedAdditionalFees || hasUnresolvedRentalItems;
                    })();
                    const checkoutTitle = isCurrentlyDeferred ? "후불결제 완료 후 퇴실 가능" : undefined;

                    return (
                      <>
                        <Button
                          className="locker-opt-footer-btn locker-opt-footer-btn-primary"
                          onClick={() => handleCheckoutClick({ customExitTime: true })}
                          data-testid="button-checkout-custom-time"
                          disabled={checkoutDisabled}
                          title={checkoutTitle ?? "실제 퇴실시각을 지정해 퇴실합니다"}
                        >
                          퇴실시간 지정
                        </Button>
                        <Button
                          onClick={() => handleCheckoutClick()}
                          className="locker-opt-footer-btn locker-opt-footer-btn-primary"
                          data-testid="button-checkout"
                          disabled={checkoutDisabled}
                          title={checkoutTitle}
                        >
                          퇴실
                        </Button>
                      </>
                    );
                  })()}
              </div>
            ) : (
              <div className="locker-opt-footer-actions">
                <Button variant="ghost" className="locker-opt-footer-btn" onClick={handleCloseClick} data-testid="button-close-new">
                  취소
                </Button>
                <Button onClick={handleProcessEntry} className="locker-opt-footer-btn locker-opt-footer-btn-primary" data-testid="button-process-entry">
                  입실
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 입실취소 시 대여/판매 매출 확인 */}
      <AlertDialog
        open={showOverBaseConfirm}
        onOpenChange={(open) => {
          if (!open) {
            if (pendingOverBaseField) confirmOverBaseSplitNo();
            else setShowOverBaseConfirm(false);
          }
        }}
      >
        <AlertDialogContent data-testid="dialog-split-over-base-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>기본요금보다 큰 금액을 분리결제하실건가요?</AlertDialogTitle>
            <AlertDialogDescription>
              현재 기본요금은 {getDefaultSplitTarget().toLocaleString()}원입니다.
              {pendingOverBaseValue
                ? ` 입력하신 금액은 ${parseInt(pendingOverBaseValue || "0").toLocaleString()}원입니다.`
                : ""}
              <br />
              <br />
              예를 누르면 받을 총금액을 따로 입력한 뒤, 그 총금액을 기준으로 현금·카드·이체를 나눌 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={confirmOverBaseSplitNo} data-testid="button-split-over-base-no">
              아니요
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmOverBaseSplitYes} data-testid="button-split-over-base-yes">
              예
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelEntrySalesDialog} onOpenChange={setShowCancelEntrySalesDialog}>
        <AlertDialogContent data-testid="dialog-cancel-entry-sales">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">판매·대여 매출 확인</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  이 손님에게 <strong className="text-foreground">판매 또는 대여 매출</strong>이 있습니다.
                  입실취소 전에 판매취소·대여취소를 하시겠습니까?
                </p>
                <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
                  {(currentLockerLogId
                    ? localDb.getRentalTransactionsByLockerLog(currentLockerLogId)
                    : currentRentalTransactions
                  ).map((txn: any) => {
                    const item = availableRentalItems.find((i) => i.id === txn.itemId);
                    const isSimple = item ? isSimpleSaleItem(item) : (txn.depositAmount || 0) === 0;
                    const returned = txn.returnCompleted === 1 || returnCompletedItems.has(txn.itemId);
                    return (
                      <div key={txn.id} className="flex justify-between gap-2 text-foreground">
                        <span>
                          {isSimple ? "판매" : "대여"} · {txn.itemName}
                          {!isSimple && returned ? " (반납완료)" : ""}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {(txn.revenue ?? txn.rentalFee ?? 0).toLocaleString()}원
                        </span>
                      </div>
                    );
                  })}
                </div>
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  <li>
                    <strong className="text-foreground">예</strong> — 락카 창에서 판매취소·대여취소(또는 반납완료)를 직접 처리합니다.
                  </li>
                  <li>
                    <strong className="text-foreground">아니요</strong> — 판매·대여 매출은 정산에 남기고 입실만 취소합니다.
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="button-cancel-entry-keep-sales"
              onClick={handleCancelEntryKeepSales}
            >
              아니요
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-cancel-entry-handle-sales"
              onClick={handleCancelEntryGoHandleSales}
            >
              예
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Warning Alert for rental items and additional fees */}
      <AlertDialog open={showWarningAlert} onOpenChange={setShowWarningAlert}>
        <AlertDialogContent data-testid="dialog-warning-alert">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-600">확인 필요</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {/* 반납완료되지 않은 대여형(rental) 품목만 표시 (일반판매형 제외, DB에서 이미 반납된 것도 제외) */}
              {/* 반납완료되지 않은 대여형(rental) 품목만 표시 (단순판매형 제외) */}
              {currentRentalTransactions.filter(txn =>
                isUnresolvedRentalTxn(txn, availableRentalItems, returnCompletedItems)
              ).length > 0 && (
                <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-md border border-orange-200 dark:border-orange-800 space-y-2">
                  <p className="font-semibold text-orange-700 dark:text-orange-300 mb-2">대여 물품 회수:</p>
                  {currentRentalTransactions
                    .filter(txn =>
                      isUnresolvedRentalTxn(txn, availableRentalItems, returnCompletedItems)
                    )
                    .map((txn) => {
                      const status = depositStatuses.get(txn.itemId) || txn.depositStatus;
                      return (
                        <div key={txn.id} className="flex items-start gap-2">
                          <span className="text-2xl">📦</span>
                          <div className="flex-1">
                            <p className="font-medium text-orange-700 dark:text-orange-300">
                              {txn.itemName} 회수하세요
                            </p>
                            {txn.depositAmount > 0 && (
                              <p className="text-sm text-orange-600 dark:text-orange-400 mt-0.5">
                                {status === 'refunded' && `보증금 ${txn.depositAmount.toLocaleString()}원 환급하세요`}
                                {status === 'received' && `회수완료시 보증금을 돌려주세요 (보증금 ${txn.depositAmount.toLocaleString()}원)`}
                                {status === 'forfeited' && `보증금 ${txn.depositAmount.toLocaleString()}원 몰수 (분실/훼손)`}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              {additionalFeeInfo.additionalFee > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800">
                  <p className="font-semibold text-red-700 dark:text-red-300 mb-1">미지급 추가요금:</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">
                    {additionalFeeInfo.additionalFee.toLocaleString()}원 ({additionalFeeInfo.additionalFeeCount}회)
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleWarningClose} data-testid="button-warning-close">
              닫기
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 대여/판매 취소 확인 다이얼로그 */}
      <AlertDialog open={!!cancellingRentalItem} onOpenChange={(open) => { if (!open) setCancellingRentalItem(null); }}>
        <AlertDialogContent data-testid="dialog-cancel-rental-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancellingRentalItem?.isSimple ? "판매 취소" : "대여 취소"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>{cancellingRentalItem?.itemName}</strong>
                {cancellingRentalItem?.isSimple ? " 판매를 취소하시겠습니까?" : " 대여를 취소하시겠습니까?"}
              </p>
              <p className="text-sm text-muted-foreground">
                {cancellingRentalItem?.isSimple ? (
                  <>판매 기록이 삭제되며 판매 금액이 청구되지 않습니다.</>
                ) : (
                  <>
                    대여 기록이 삭제되며 대여금·보증금이 청구되지 않습니다.<br/>
                    이미 받은 보증금이 있다면 직접 환불해 주세요.
                  </>
                )}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-rental-close">닫기</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-cancel-rental-confirm"
              onClick={() => {
                if (!cancellingRentalItem) return;
                localDb.deleteRentalTransaction(cancellingRentalItem.txnId);
                setCurrentRentalTransactions(prev => prev.filter(t => t.id !== cancellingRentalItem.txnId));
                const { itemId, isSimple } = cancellingRentalItem;
                const newSelected = new Set(selectedRentalItems);
                newSelected.delete(itemId);
                setSelectedRentalItems(newSelected);
                const newStatuses = new Map(depositStatuses);
                newStatuses.delete(itemId);
                setDepositStatuses(newStatuses);
                const newMethods = new Map(rentalPaymentMethods);
                newMethods.delete(itemId);
                setRentalPaymentMethods(newMethods);
                const newReturn = new Set(returnCompletedItems);
                newReturn.delete(itemId);
                setReturnCompletedItems(newReturn);
                const newQuantities = new Map(rentalItemQuantities);
                newQuantities.delete(itemId);
                setRentalItemQuantities(newQuantities);
                // 메모에 취소 시각 기록
                const cancelTimeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                const cancelItemName = cancellingRentalItem.itemName;
                const actionLabel = isSimple ? "판매" : "대여";
                const cancelLabel = isSimple ? "판매취소" : "대여취소";
                setCustomerMemo(prev => {
                  const marker = `[${cancelItemName}] ${actionLabel}:`;
                  if (prev.includes(marker)) {
                    return prev.split('\n').map(line => {
                      if (!line.startsWith(marker)) return line;
                      const lastSlashIdx = line.lastIndexOf(' / ');
                      const lastSeg = lastSlashIdx >= 0 ? line.slice(lastSlashIdx + 3) : line;
                      if (!lastSeg.includes(`${cancelLabel}:`)) {
                        return `${line}, ${cancelLabel}: ${cancelTimeStr}`;
                      }
                      return line;
                    }).join('\n');
                  }
                  // 예전 메모 형식([이름] 대여:)도 단순판매 취소 시 이어서 기록
                  const legacyMarker = `[${cancelItemName}] 대여:`;
                  if (isSimple && prev.includes(legacyMarker)) {
                    return prev.split('\n').map(line => {
                      if (!line.startsWith(legacyMarker)) return line;
                      const lastSlashIdx = line.lastIndexOf(' / ');
                      const lastSeg = lastSlashIdx >= 0 ? line.slice(lastSlashIdx + 3) : line;
                      if (!lastSeg.includes("판매취소:") && !lastSeg.includes("대여취소:")) {
                        return `${line}, 판매취소: ${cancelTimeStr}`;
                      }
                      return line;
                    }).join('\n');
                  }
                  const cancelLine = `[${cancelItemName}] ${cancelLabel}: ${cancelTimeStr}`;
                  return prev.trim() ? `${prev}\n${cancelLine}` : cancelLine;
                });
                setCancellingRentalItem(null);
              }}
            >
              {cancellingRentalItem?.isSimple ? "판매 취소 확인" : "대여 취소 확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 대여 체크 해제 확인 다이얼로그 (신규 체크 후 해제 시) */}
      <AlertDialog open={!!pendingUncheckItem} onOpenChange={(open) => { if (!open) setPendingUncheckItem(null); }}>
        <AlertDialogContent data-testid="dialog-uncheck-rental-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>대여 취소</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>{pendingUncheckItem?.itemName}</strong> 대여를 취소하시겠습니까?
              </p>
              <p className="text-sm text-muted-foreground">
                취소 시각이 메모에 기록됩니다.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-uncheck-rental-close">
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-uncheck-rental-confirm"
              onClick={() => {
                if (!pendingUncheckItem) return;
                const { itemId, itemName } = pendingUncheckItem;
                const newSelected = new Set(selectedRentalItems);
                newSelected.delete(itemId);
                setSelectedRentalItems(newSelected);
                const newStatuses = new Map(depositStatuses);
                const newPaymentMethods = new Map(rentalPaymentMethods);
                const newDirectInput = new Set(rentalDirectInputEnabled);
                const newQuantities = new Map(rentalItemQuantities);
                newStatuses.delete(itemId);
                newPaymentMethods.delete(itemId);
                newDirectInput.delete(itemId);
                newQuantities.delete(itemId);
                setDepositStatuses(newStatuses);
                setRentalPaymentMethods(newPaymentMethods);
                setRentalDirectInputEnabled(newDirectInput);
                setRentalItemQuantities(newQuantities);
                // 메모에 대여취소 시각 기록
                const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                setCustomerMemo(prev => {
                  const marker = `[${itemName}] 대여:`;
                  if (prev.includes(marker)) {
                    return prev.split('\n').map(line => {
                      if (!line.startsWith(marker)) return line;
                      const lastSlashIdx = line.lastIndexOf(' / ');
                      const lastSeg = lastSlashIdx >= 0 ? line.slice(lastSlashIdx + 3) : line;
                      // 마지막 세그먼트가 취소 상태가 아닌 경우만 취소 기록
                      if (!lastSeg.includes('대여취소:')) {
                        return `${line}, 대여취소: ${nowTimeStr}`;
                      }
                      return line;
                    }).join('\n');
                  }
                  const cancelLine = `[${itemName}] 대여취소: ${nowTimeStr}`;
                  return prev.trim() ? `${prev}\n${cancelLine}` : cancelLine;
                });
                setPendingUncheckItem(null);
              }}
            >
              대여 취소 확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCheckoutConfirm} onOpenChange={(open) => {
        setShowCheckoutConfirm(open);
        if (!open) {
          setPendingCheckoutArgs(null);
          setCheckoutCustomTimeMode(false);
        }
      }}>
        <AlertDialogContent data-testid="dialog-checkout-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {checkoutCustomTimeMode ? "퇴실시간 지정 퇴실" : "퇴실 확인"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {(pendingCheckoutArgs?.rentalItems?.length ?? 0) > 0 && (
                  <>
                    <p>다음 대여 물품을 확인하셨습니까?</p>
                    <div className="p-3 bg-muted rounded-md border">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{currentNotes || generateNotes()}</p>
                    </div>
                  </>
                )}
                {checkoutCustomTimeMode && (
                  <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="checkout-exit-time" className="text-sm text-foreground font-medium">
                        퇴실 날짜·시간
                      </Label>
                      <span className="text-[11px] text-muted-foreground">입실 이후 · 기본 현재시각</span>
                    </div>
                    <Input
                      id="checkout-exit-time"
                      type="datetime-local"
                      value={checkoutTimeLocal}
                      min={toDatetimeLocalValue(effectiveEntryTimeISO)}
                      max={toDatetimeLocalValue(new Date().toISOString())}
                      onChange={(e) => setCheckoutTimeLocal(e.target.value)}
                      className="h-10"
                      data-testid="input-checkout-exit-time"
                    />
                    <p className="text-xs text-muted-foreground">
                      이미 나간 손님을 뒤늦게 처리할 때 실제 퇴실 시각으로 지정합니다.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-checkout-cancel">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmCheckout();
              }}
              data-testid="button-checkout-confirm"
            >
              확인 및 퇴실
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Locker swap picker dialog */}
      <Dialog open={showSwapDialog} onOpenChange={setShowSwapDialog}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto" data-testid="dialog-swap-input">
          <DialogHeader>
            <DialogTitle>락카 교체 — {lockerNumber}번</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 안내 */}
            <div className="text-sm bg-orange-50 dark:bg-orange-950 p-3 rounded-md border border-orange-200 dark:border-orange-800">
              <p className="text-orange-700 dark:text-orange-300">
                <span className="font-semibold">빈 락카 선택:</span> 현재 락카 내용이 대상 락카로 이동합니다.<br/>
                <span className="font-semibold">사용중 락카 선택:</span> 두 락카의 내용이 서로 교환됩니다.
              </p>
            </div>

            {/* 범례 */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-white border-2 border-gray-300" />
                <span>빈 락카</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-[#FFD700] border-2 border-[#FFC700]" />
                <span>사용중</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-blue-500 border-2 border-blue-600 ring-2 ring-blue-300" />
                <span>선택됨</span>
              </div>
            </div>

            {/* 선택 상태 표시 */}
            <div className={`text-sm font-semibold text-center py-2 rounded-md transition-all duration-200 ${
              selectedSwapLocker
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'bg-muted text-muted-foreground'
            }`}>
              {selectedSwapLocker
                ? `✓ ${selectedSwapLocker}번 락카 선택됨 — 교체하기 버튼을 눌러 진행하세요`
                : '교체할 락카를 터치하여 선택하세요'}
            </div>

            {/* 버튼 그리드 */}
            <div className="grid grid-cols-5 gap-2">
              {(() => {
                const activeLockersList = localDb.getActiveLockers();
                const activeNumbers = new Set(activeLockersList.map((l: any) => l.lockerNumber));
                const groups = localDb.getLockerGroups();
                const configuredNumbers: number[] = [];
                groups.forEach((g: any) => {
                  for (let i = g.startNumber; i <= g.endNumber; i++) {
                    configuredNumbers.push(i);
                  }
                });

                return configuredNumbers.map(num => {
                  const isCurrent = num === lockerNumber;
                  const isInUse = activeNumbers.has(num);
                  const isSelected = selectedSwapLocker === num;

                  let btnClass = '';
                  let statusLabel = '';
                  if (isCurrent) {
                    btnClass = 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border-2 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50';
                    statusLabel = '현재';
                  } else if (isSelected) {
                    btnClass = 'bg-blue-500 text-white border-2 border-blue-600 ring-4 ring-blue-300 dark:ring-blue-700 scale-105 shadow-lg';
                    statusLabel = isInUse ? '교환' : '이동';
                  } else if (isInUse) {
                    btnClass = 'bg-[#FFD700] text-gray-800 border-2 border-[#FFC700] hover-elevate active-elevate-2';
                    statusLabel = '사용중';
                  } else {
                    btnClass = 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-2 border-gray-300 dark:border-gray-600 hover-elevate active-elevate-2';
                  }

                  return (
                    <button
                      key={num}
                      disabled={isCurrent}
                      data-testid={`button-swap-locker-${num}`}
                      onClick={() => {
                        if (isCurrent) return;
                        const audio = new Audio('data:audio/wav;base64,UklGRhIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQA=');
                        audio.volume = 0.3;
                        audio.play().catch(() => {});
                        setSelectedSwapLocker(num);
                        setSwapTargetLocker(String(num));
                      }}
                      className={`
                        h-14 rounded-lg font-bold text-sm
                        flex flex-col items-center justify-center gap-0.5
                        transition-all duration-150 active:scale-95
                        ${btnClass}
                      `}
                    >
                      <span className="text-base font-bold leading-none">{num}</span>
                      {statusLabel && (
                        <span className="text-[10px] font-normal opacity-85 leading-none">{statusLabel}</span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSwapDialog(false)} data-testid="button-swap-cancel">
              취소
            </Button>
            <Button
              onClick={handleSwapSubmit}
              disabled={!selectedSwapLocker}
              className="bg-orange-600 dark:bg-orange-700"
              data-testid="button-swap-submit"
            >
              교체하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Locker swap confirmation dialog */}
      <AlertDialog open={showSwapConfirm} onOpenChange={setShowSwapConfirm}>
        <AlertDialogContent data-testid="dialog-swap-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-600">
              {swapInfo?.willSwap ? '락카 교환 확인' : '락카 이동 확인'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {swapInfo && (
                <>
                  <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-md border border-orange-200 dark:border-orange-800">
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      {swapInfo.willSwap
                        ? `${lockerNumber}번과 ${swapInfo.targetLocker}번 락카의 모든 내용(입실시간, 요금, 대여품목 등)이 서로 교환됩니다.`
                        : `${lockerNumber}번 락카의 모든 내용(입실시간, 요금, 대여품목 등)이 ${swapInfo.targetLocker}번 락카로 이동하고, ${lockerNumber}번은 빈 락카가 됩니다.`
                      }
                    </p>
                  </div>
                  <p className="font-medium">계속하시겠습니까?</p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-swap-confirm-cancel">취소</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSwapConfirm} 
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-swap-confirm-ok"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Locker linking selection dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto" data-testid="dialog-link-select">
          <DialogHeader>
            <DialogTitle>락카묶기 - {lockerNumber}번 자식 락카 관리</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              짐이 많은 손님을 위해 빈 락카를 추가로 묶을 수 있습니다. 
              묶인 락카는 요금 없이 사용되며, 부모 락카 퇴실 시 자동으로 해제됩니다.
            </p>
            
            <div className="text-sm font-semibold">
              현재 {selectedChildLockers.size}개 선택됨
            </div>

            <div className="grid grid-cols-5 gap-2">
              {(() => {
                // Get all active locker numbers
                const activeLockers = localDb.getActiveLockers();
                const activeNumbers = new Set(activeLockers.map((l: any) => l.lockerNumber));
                
                // Get currently linked children
                const currentChildren = localDb.getChildLockers(lockerNumber);
                const currentChildNumbers = new Set(currentChildren.map((c: any) => c.lockerNumber));
                
                // Get all locker groups - only show configured locker numbers
                const groups = localDb.getLockerGroups();
                const configuredNumbers: number[] = [];
                groups.forEach((g: any) => {
                  for (let i = g.startNumber; i <= g.endNumber; i++) {
                    configuredNumbers.push(i);
                  }
                });

                // Generate available locker numbers (vacant OR already linked children)
                // Only from configured numbers, not a fixed 1-N range
                const availableLockers: number[] = [];
                for (const i of configuredNumbers) {
                  if (i !== lockerNumber) {
                    // Include if vacant OR already a child of this parent
                    if (!activeNumbers.has(i) || currentChildNumbers.has(i)) {
                      availableLockers.push(i);
                    }
                  }
                }
                
                return availableLockers.map(num => {
                  const isLinkedChild = currentChildNumbers.has(num);
                  return (
                    <Button
                      key={num}
                      type="button"
                      variant={selectedChildLockers.has(num) ? "default" : "outline"}
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleChildLocker(num);
                      }}
                      data-testid={`button-child-locker-${num}`}
                      className={`h-10 ${isLinkedChild ? 'border-blue-500 border-2' : ''}`}
                      title={isLinkedChild ? '현재 연결된 자식 락카' : '빈 락카'}
                    >
                      {num}
                      {isLinkedChild && <span className="ml-1 text-xs">✓</span>}
                    </Button>
                  );
                });
              })()}
            </div>

            <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
              <span className="font-semibold">✓ 표시:</span> 현재 연결된 자식 락카입니다. 선택 해제하면 연결이 해제됩니다.
            </div>

            {selectedChildLockers.size === 0 && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-md border border-red-200 dark:border-red-800">
                선택된 락카가 없습니다. 확인 시 현재 연결된 모든 묶기가 해제됩니다.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)} data-testid="button-link-cancel">
              취소
            </Button>
            <Button onClick={handleLinkSubmit} data-testid="button-link-submit">
              묶기 확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Locker linking confirmation dialog */}
      <AlertDialog open={showLinkConfirm} onOpenChange={setShowLinkConfirm}>
        <AlertDialogContent data-testid="dialog-link-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className={selectedChildLockers.size === 0 ? "text-red-600" : "text-blue-600"}>
              {selectedChildLockers.size === 0 ? "묶기 해제 확인" : "락카묶기 확인"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className={`p-4 rounded-md border ${selectedChildLockers.size === 0 ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"}`}>
                <p className={`text-sm ${selectedChildLockers.size === 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                  {selectedChildLockers.size === 0 ? (
                    <>
                      {lockerNumber}번 락카의 모든 자식 락카 묶기를 해제합니다.
                      <br/><br/>
                      • 해제된 자식 락카는 독립된 락카로 전환됩니다<br/>
                      • 기존 입실 정보는 유지됩니다
                    </>
                  ) : (
                    <>
                      {lockerNumber}번 락카에 {Array.from(selectedChildLockers).join(', ')}번 락카를 묶습니다.
                      <br/><br/>
                      • 묶인 락카는 요금 없이 사용됩니다<br/>
                      • {lockerNumber}번 퇴실 시 자동으로 함께 퇴실됩니다
                    </>
                  )}
                </p>
              </div>
              <p className="font-medium">계속하시겠습니까?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-link-confirm-cancel">취소</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleLinkConfirm} 
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-link-confirm-ok"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Parent locker change/unlink dialog */}
      <Dialog open={showChangeParentDialog} onOpenChange={setShowChangeParentDialog}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-change-parent">
          <DialogHeader>
            <DialogTitle>부모 락카 변경/해제 - {lockerNumber}번</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                현재 {lockerNumber}번 락카는 {parentLockerNumber}번 부모 락카에 연결되어 있습니다.
              </p>
            </div>
            
            <p className="text-sm text-muted-foreground">
              • 새로운 부모 락카 번호를 입력하면 해당 락카로 변경됩니다<br/>
              • 빈 칸으로 두고 확인하면 부모 락카 연결이 해제됩니다
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="new-parent-locker">새 부모 락카 번호 (빈 칸 = 연결 해제)</Label>
              <Input
                id="new-parent-locker"
                type="text"
                value={newParentLocker}
                onChange={(e) => setNewParentLocker(e.target.value)}
                placeholder="빈 칸으로 두면 연결 해제"
                data-testid="input-new-parent-locker"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeParentDialog(false)} data-testid="button-change-parent-cancel">
              취소
            </Button>
            <Button onClick={handleChangeParentSubmit} data-testid="button-change-parent-submit">
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parent locker change/unlink confirmation dialog */}
      <AlertDialog open={showChangeParentConfirm} onOpenChange={setShowChangeParentConfirm}>
        <AlertDialogContent data-testid="dialog-change-parent-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-blue-600">
              {unlinkMode ? "부모 락카 연결 해제 확인" : "부모 락카 변경 확인"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {unlinkMode ? (
                    <>
                      {lockerNumber}번 락카의 부모 락카({parentLockerNumber}번) 연결을 해제합니다.
                      <br/><br/>
                      • {lockerNumber}번은 독립된 락카로 전환됩니다<br/>
                      • 기존 입실 정보는 유지됩니다
                    </>
                  ) : (
                    <>
                      {lockerNumber}번 락카의 부모를 {parentLockerNumber}번에서 {newParentLocker}번으로 변경합니다.
                      <br/><br/>
                      • {newParentLocker}번 퇴실 시 {lockerNumber}번도 함께 퇴실됩니다<br/>
                      • 기존 입실 정보는 유지됩니다
                    </>
                  )}
                </p>
              </div>
              <p className="font-medium">계속하시겠습니까?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-change-parent-confirm-cancel">취소</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleChangeParentConfirm} 
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-change-parent-confirm-ok"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 선지급금 취소 시 환불 방식 선택 다이얼로그 */}
      <AlertDialog open={showPrepaidRefundDialog} onOpenChange={setShowPrepaidRefundDialog}>
        <AlertDialogContent data-testid="dialog-prepaid-refund">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-blue-600">선지급금 환불 방식 선택</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {(() => {
                // 기본 선지급 금액
                const basePrepaidAmount = pendingPrepaidCancellation?.originalAmount || 0;
                const vatIncludedAmount = Math.round(basePrepaidAmount * 1.1);
                const cashPayment = pendingPrepaidCancellation?.originalPaymentCash || 0;
                const cardPayment = pendingPrepaidCancellation?.originalPaymentCard || 0;
                const transferPayment = pendingPrepaidCancellation?.originalPaymentTransfer || 0;
                
                // 현재 선택에 따른 환불 금액
                const currentRefundAmount = prepaidRefundIncludeVat ? vatIncludedAmount : basePrepaidAmount;
                
                // 환불 가능 여부 (결제금액이 환불금액 이상인지)
                const cashEligible = cashPayment >= currentRefundAmount && cashPayment > 0;
                const cardEligible = cardPayment >= currentRefundAmount && cardPayment > 0;
                const transferEligible = transferPayment >= currentRefundAmount && transferPayment > 0;
                const noEligibleMethods = !cashEligible && !cardEligible && !transferEligible;
                
                // VAT 포함 시 환불 가능한 수단이 있는지
                const anyEligibleWithVat = (cashPayment >= vatIncludedAmount) || 
                                           (cardPayment >= vatIncludedAmount) || 
                                           (transferPayment >= vatIncludedAmount);
                
                return (
                  <>
                    <p>
                      선지급금 {basePrepaidAmount.toLocaleString()}원을 
                      취소합니다. 어떤 결제 수단에서 차감할지 선택해주세요.
                    </p>
                    
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">현재 결제 내역:</p>
                      <div className="locker-opt-split-grid text-sm">
                        {cashPayment > 0 && (
                          <div className="text-blue-600 dark:text-blue-400">
                            현금: {cashPayment.toLocaleString()}원
                          </div>
                        )}
                        {cardPayment > 0 && (
                          <div className="text-blue-600 dark:text-blue-400">
                            카드: {cardPayment.toLocaleString()}원
                          </div>
                        )}
                        {transferPayment > 0 && (
                          <div className="text-blue-600 dark:text-blue-400">
                            이체: {transferPayment.toLocaleString()}원
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 부가세 포함 여부 선택 */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">환불 금액 선택:</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={!prepaidRefundIncludeVat ? 'default' : 'outline'}
                          onClick={() => {
                            setPrepaidRefundIncludeVat(false);
                            setPrepaidRefundMethod(null); // 환불 수단 초기화
                          }}
                          className={`flex-1 ${!prepaidRefundIncludeVat ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                          data-testid="button-refund-no-vat"
                        >
                          {basePrepaidAmount.toLocaleString()}원
                        </Button>
                        {anyEligibleWithVat && (
                          <Button
                            type="button"
                            variant={prepaidRefundIncludeVat ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundIncludeVat(true);
                              setPrepaidRefundMethod(null); // 환불 수단 초기화
                            }}
                            className={`flex-1 ${prepaidRefundIncludeVat ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-with-vat"
                          >
                            {vatIncludedAmount.toLocaleString()}원 (VAT 포함)
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">환불 받을 결제 수단:</p>
                      <div className="flex gap-2 flex-wrap">
                        {cashEligible && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'cash' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('cash');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'cash' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-cash"
                          >
                            현금
                          </Button>
                        )}
                        {cardEligible && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'card' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('card');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'card' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-card"
                          >
                            카드
                          </Button>
                        )}
                        {transferEligible && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'transfer' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('transfer');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'transfer' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-transfer"
                          >
                            이체
                          </Button>
                        )}
                        {/* 분할 환불 버튼 - 환불 금액이 개별 결제수단보다 큰 경우 */}
                        {noEligibleMethods && (cashPayment > 0 || cardPayment > 0 || transferPayment > 0) && (
                          <Button
                            type="button"
                            variant={prepaidRefundMethod === 'split' ? 'default' : 'outline'}
                            onClick={() => {
                              setPrepaidRefundMethod('split');
                              setSplitRefundCash("");
                              setSplitRefundCard("");
                              setSplitRefundTransfer("");
                            }}
                            className={`flex-1 ${prepaidRefundMethod === 'split' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                            data-testid="button-refund-split"
                          >
                            분할 환불
                          </Button>
                        )}
                      </div>
                      {noEligibleMethods && prepaidRefundMethod !== 'split' && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          환불 금액({currentRefundAmount.toLocaleString()}원)보다 큰 결제 수단이 없습니다.
                          '분할 환불'을 선택하여 각 결제수단별로 환불 금액을 지정할 수 있습니다.
                        </p>
                      )}
                    </div>

                    {/* 분할 환불 입력 UI */}
                    {prepaidRefundMethod === 'split' && pendingPrepaidCancellation && (() => {
                      const splitCashVal = parseInt(splitRefundCash) || 0;
                      const splitCardVal = parseInt(splitRefundCard) || 0;
                      const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                      const splitTotal = splitCashVal + splitCardVal + splitTransferVal;
                      
                      // 분할취소: 기본금액(선지급금)을 분배하면 됨
                      const isValidSplit = splitTotal === basePrepaidAmount;
                      
                      // 각 결제방식별 VAT 적용 여부
                      const cashHadVat = enableCashReceiptVat && isCashReceipt;
                      const cardHadVat = enableCardVat;
                      const transferHadVat = enableCashReceiptVat && isCashReceipt;
                      
                      // 각 결제방식별 실제 환불될 금액 (VAT 포함 시)
                      const actualCashRefund = cashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                      const actualCardRefund = cardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                      const actualTransferRefund = transferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                      
                      // 각 결제방식별 최대 환불 가능 기본금액 (VAT 역산)
                      const maxCashBase = cashHadVat ? Math.floor(cashPayment / 1.1) : cashPayment;
                      const maxCardBase = cardHadVat ? Math.floor(cardPayment / 1.1) : cardPayment;
                      const maxTransferBase = transferHadVat ? Math.floor(transferPayment / 1.1) : transferPayment;
                      
                      // 초과 체크 (실제 환불금액이 결제금액을 초과하는지)
                      const isCashOverLimit = actualCashRefund > cashPayment;
                      const isCardOverLimit = actualCardRefund > cardPayment;
                      const isTransferOverLimit = actualTransferRefund > transferPayment;
                      const hasOverLimit = isCashOverLimit || isCardOverLimit || isTransferOverLimit;
                      
                      return (
                        <div className="space-y-3 p-3 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                            선지급금 {basePrepaidAmount.toLocaleString()}원을 결제수단별로 분배 입력
                          </p>
                          <div className="locker-opt-split-grid">
                            {cashPayment > 0 && (
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  현금 (최대 {maxCashBase.toLocaleString()})
                                  {cashHadVat && <span className="text-blue-500 ml-1">+VAT</span>}
                                </Label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  value={splitRefundCash}
                                  onChange={(e) => setSplitRefundCash(e.target.value)}
                                  className={`text-sm ${isCashOverLimit ? 'border-red-500' : ''}`}
                                  data-testid="input-split-refund-cash"
                                />
                                {splitCashVal > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    실제 차감: {actualCashRefund.toLocaleString()}원
                                  </p>
                                )}
                              </div>
                            )}
                            {cardPayment > 0 && (
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  카드 (최대 {maxCardBase.toLocaleString()})
                                  {cardHadVat && <span className="text-blue-500 ml-1">+VAT</span>}
                                </Label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  value={splitRefundCard}
                                  onChange={(e) => setSplitRefundCard(e.target.value)}
                                  className={`text-sm ${isCardOverLimit ? 'border-red-500' : ''}`}
                                  data-testid="input-split-refund-card"
                                />
                                {splitCardVal > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    실제 차감: {actualCardRefund.toLocaleString()}원
                                  </p>
                                )}
                              </div>
                            )}
                            {transferPayment > 0 && (
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  이체 (최대 {maxTransferBase.toLocaleString()})
                                  {transferHadVat && <span className="text-blue-500 ml-1">+VAT</span>}
                                </Label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  value={splitRefundTransfer}
                                  onChange={(e) => setSplitRefundTransfer(e.target.value)}
                                  className={`text-sm ${isTransferOverLimit ? 'border-red-500' : ''}`}
                                  data-testid="input-split-refund-transfer"
                                />
                                {splitTransferVal > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    실제 차감: {actualTransferRefund.toLocaleString()}원
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className={`${isValidSplit && !hasOverLimit ? 'text-green-600' : 'text-amber-600'}`}>
                              분배 합계: {splitTotal.toLocaleString()}원
                            </span>
                            {hasOverLimit && (
                              <span className="text-red-600">결제 금액 초과!</span>
                            )}
                            {!isValidSplit && !hasOverLimit && (
                              <span className="text-amber-600">
                                {splitTotal < basePrepaidAmount 
                                  ? `${(basePrepaidAmount - splitTotal).toLocaleString()}원 더 필요` 
                                  : `${(splitTotal - basePrepaidAmount).toLocaleString()}원 초과`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {prepaidRefundMethod && prepaidRefundMethod !== 'split' && pendingPrepaidCancellation && (
                      <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          {prepaidRefundMethod === 'cash' && '현금'}
                          {prepaidRefundMethod === 'card' && '카드'}
                          {prepaidRefundMethod === 'transfer' && '이체'}
                          에서 {currentRefundAmount.toLocaleString()}원을 환불합니다.
                          {prepaidRefundIncludeVat && (
                            <span className="text-xs ml-1">(VAT 10% 포함)</span>
                          )}
                        </p>
                      </div>
                    )}
                    
                    {prepaidRefundMethod === 'split' && pendingPrepaidCancellation && (() => {
                      const splitCashVal = parseInt(splitRefundCash) || 0;
                      const splitCardVal = parseInt(splitRefundCard) || 0;
                      const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                      const splitTotal = splitCashVal + splitCardVal + splitTransferVal;
                      const isValidSplit = splitTotal === basePrepaidAmount;
                      
                      // 각 결제방식별 VAT 적용 여부
                      const cashHadVat = enableCashReceiptVat && isCashReceipt;
                      const cardHadVat = enableCardVat;
                      const transferHadVat = enableCashReceiptVat && isCashReceipt;
                      
                      // 각 결제방식별 실제 환불될 금액 (VAT 포함 시)
                      const actualCashRefund = cashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                      const actualCardRefund = cardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                      const actualTransferRefund = transferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                      const totalActualRefund = actualCashRefund + actualCardRefund + actualTransferRefund;
                      
                      // 초과 체크 (실제 환불금액이 결제금액을 초과하는지)
                      const isCashOverLimit = actualCashRefund > cashPayment;
                      const isCardOverLimit = actualCardRefund > cardPayment;
                      const isTransferOverLimit = actualTransferRefund > transferPayment;
                      const hasOverLimit = isCashOverLimit || isCardOverLimit || isTransferOverLimit;
                      
                      if (isValidSplit && !hasOverLimit) {
                        const parts = [];
                        if (splitCashVal > 0) {
                          parts.push(`현금 ${actualCashRefund.toLocaleString()}원${cashHadVat ? '(VAT포함)' : ''}`);
                        }
                        if (splitCardVal > 0) {
                          parts.push(`카드 ${actualCardRefund.toLocaleString()}원${cardHadVat ? '(VAT포함)' : ''}`);
                        }
                        if (splitTransferVal > 0) {
                          parts.push(`이체 ${actualTransferRefund.toLocaleString()}원${transferHadVat ? '(VAT포함)' : ''}`);
                        }
                        
                        return (
                          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                            <p className="text-sm text-green-700 dark:text-green-300">
                              {parts.join(' + ')} = 총 {totalActualRefund.toLocaleString()}원 환불
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setShowPrepaidRefundDialog(false);
                setPrepaidRefundMethod(null);
                setPrepaidRefundIncludeVat(false);
                setPendingPrepaidCancellation(null);
              }}
              data-testid="button-prepaid-refund-cancel"
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (prepaidRefundMethod && pendingPrepaidCancellation) {
                  // 선지급금 취소 처리
                  // 기본 선지급 금액
                  const basePrepaidAmount = pendingPrepaidCancellation.originalAmount;
                  
                  // 사용자가 선택한 VAT 포함 여부에 따라 환불 금액 계산
                  const refundAmount = prepaidRefundIncludeVat 
                    ? Math.round(basePrepaidAmount * 1.1) 
                    : basePrepaidAmount;
                  
                  // 원래 결제 금액에서 VAT가 적용되었는지 확인
                  // 카드: enableCardVat가 true면 VAT 적용됨
                  // 현금/이체: enableCashReceiptVat && isCashReceipt가 true면 VAT 적용됨
                  const originalCashHadVat = enableCashReceiptVat && isCashReceipt;
                  const originalCardHadVat = enableCardVat;
                  const originalTransferHadVat = enableCashReceiptVat && isCashReceipt;
                  
                  // 원래 결제 금액을 기본 금액으로 변환 (VAT 제거)
                  // 분리결제창에서는 기본 금액을 입력하면 VAT를 다시 계산하므로
                  const originalCashBase = originalCashHadVat 
                    ? Math.round(pendingPrepaidCancellation.originalPaymentCash / 1.1) 
                    : pendingPrepaidCancellation.originalPaymentCash;
                  const originalCardBase = originalCardHadVat 
                    ? Math.round(pendingPrepaidCancellation.originalPaymentCard / 1.1) 
                    : pendingPrepaidCancellation.originalPaymentCard;
                  const originalTransferBase = originalTransferHadVat 
                    ? Math.round(pendingPrepaidCancellation.originalPaymentTransfer / 1.1) 
                    : pendingPrepaidCancellation.originalPaymentTransfer;
                  
                  // 환불할 기본 금액 (선지급 원금)
                  let newCashBase = originalCashBase;
                  let newCardBase = originalCardBase;
                  let newTransferBase = originalTransferBase;
                  let refundMethodName = '';
                  
                  if (prepaidRefundMethod === 'split') {
                    // 분할 환불 처리
                    // 사용자가 입력한 금액은 기본금액(선지급금 분배)
                    const splitCashVal = parseInt(splitRefundCash) || 0;
                    const splitCardVal = parseInt(splitRefundCard) || 0;
                    const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                    
                    // 각 결제방식에서 차감할 기본금액 = 사용자 입력값
                    // (사용자가 기본금액을 분배했으므로 직접 차감)
                    newCashBase = Math.max(0, originalCashBase - splitCashVal);
                    newCardBase = Math.max(0, originalCardBase - splitCardVal);
                    newTransferBase = Math.max(0, originalTransferBase - splitTransferVal);
                    
                    // 환불 내역 텍스트 생성 (실제 환불 금액 = 기본금액 + VAT)
                    const actualCashRefund = originalCashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                    const actualCardRefund = originalCardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                    const actualTransferRefund = originalTransferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                    
                    const parts = [];
                    if (splitCashVal > 0) parts.push(`현금 ${actualCashRefund.toLocaleString()}원${originalCashHadVat ? '(VAT포함)' : ''}`);
                    if (splitCardVal > 0) parts.push(`카드 ${actualCardRefund.toLocaleString()}원${originalCardHadVat ? '(VAT포함)' : ''}`);
                    if (splitTransferVal > 0) parts.push(`이체 ${actualTransferRefund.toLocaleString()}원${originalTransferHadVat ? '(VAT포함)' : ''}`);
                    refundMethodName = parts.join('+');
                  } else if (prepaidRefundMethod === 'cash') {
                    newCashBase = Math.max(0, originalCashBase - basePrepaidAmount);
                    refundMethodName = '현금';
                  } else if (prepaidRefundMethod === 'card') {
                    newCardBase = Math.max(0, originalCardBase - basePrepaidAmount);
                    refundMethodName = '카드';
                  } else if (prepaidRefundMethod === 'transfer') {
                    newTransferBase = Math.max(0, originalTransferBase - basePrepaidAmount);
                    refundMethodName = '이체';
                  }
                  
                  // 모든 결제금액 상태 업데이트 (기본 금액으로 설정, VAT는 분리결제창에서 다시 계산됨)
                  setPaymentCash(newCashBase > 0 ? String(newCashBase) : "0");
                  setPaymentCard(newCardBase > 0 ? String(newCardBase) : "0");
                  setPaymentTransfer(newTransferBase > 0 ? String(newTransferBase) : "0");
                  
                  // 선지급금 취소 메모 추가
                  const cancelTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                  const vatNote = prepaidRefundIncludeVat ? ', VAT포함' : '';
                  const cancelMemoText = `[${cancelTime}] 선지급금 ${basePrepaidAmount.toLocaleString()}원 취소 (${refundMethodName} 환불${vatNote})`;
                  const updatedMemo = customerMemo.trim() 
                    ? `${customerMemo}\n${cancelMemoText}` 
                    : cancelMemoText;
                  setCustomerMemo(updatedMemo);
                  
                  // 선지급금 체크박스 해제 및 금액 초기화
                  setHasPrepaidAdditionalFee(false);
                  setPrepaidAdditionalFeeAmount("");
                  
                  // 분리결제 활성화 (새로운 금액으로)
                  setUseSplitPayment(true);
                }
                
                // 다이얼로그 닫기
                setShowPrepaidRefundDialog(false);
                setPrepaidRefundMethod(null);
                setPrepaidRefundIncludeVat(false);
                setPendingPrepaidCancellation(null);
                setSplitRefundCash("");
                setSplitRefundCard("");
                setSplitRefundTransfer("");
              }}
              disabled={(() => {
                if (!prepaidRefundMethod) return true;
                if (prepaidRefundMethod === 'split') {
                  // 분할 환불 시 유효성 검사
                  const splitCashVal = parseInt(splitRefundCash) || 0;
                  const splitCardVal = parseInt(splitRefundCard) || 0;
                  const splitTransferVal = parseInt(splitRefundTransfer) || 0;
                  const splitTotal = splitCashVal + splitCardVal + splitTransferVal;
                  const basePrepaidAmount = pendingPrepaidCancellation?.originalAmount || 0;
                  
                  // 분할취소: 기본금액(선지급금)을 분배해야 함
                  const isValidSplit = splitTotal === basePrepaidAmount;
                  
                  // 각 결제방식별 VAT 적용 여부
                  const cashHadVat = enableCashReceiptVat && isCashReceipt;
                  const cardHadVat = enableCardVat;
                  const transferHadVat = enableCashReceiptVat && isCashReceipt;
                  
                  // 실제 환불 금액 계산 (VAT 포함 시)
                  const actualCashRefund = cashHadVat ? Math.round(splitCashVal * 1.1) : splitCashVal;
                  const actualCardRefund = cardHadVat ? Math.round(splitCardVal * 1.1) : splitCardVal;
                  const actualTransferRefund = transferHadVat ? Math.round(splitTransferVal * 1.1) : splitTransferVal;
                  
                  const cashPayment = pendingPrepaidCancellation?.originalPaymentCash || 0;
                  const cardPayment = pendingPrepaidCancellation?.originalPaymentCard || 0;
                  const transferPayment = pendingPrepaidCancellation?.originalPaymentTransfer || 0;
                  
                  // 실제 환불 금액이 결제 금액을 초과하면 안됨
                  const hasOverLimit = actualCashRefund > cashPayment || 
                                       actualCardRefund > cardPayment || 
                                       actualTransferRefund > transferPayment;
                  
                  return !isValidSplit || hasOverLimit;
                }
                return false;
              })()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-prepaid-refund-confirm"
            >
              환불 확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
