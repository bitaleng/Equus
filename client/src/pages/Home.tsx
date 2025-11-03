import { useState, useEffect } from "react";
import LockerButton from "@/components/LockerButton";
import LockerOptionsDialog from "@/components/LockerOptionsDialog";
import TodayStatusTable from "@/components/TodayStatusTable";
import SalesSummary from "@/components/SalesSummary";
import { getBusinessDay, getTimeType, getBasePrice, calculateAdditionalFee } from "@shared/businessDay";
import * as localDb from "@/lib/localDb";

interface LockerLog {
  id: string;
  lockerNumber: number;
  entryTime: string;
  exitTime: string | null;
  timeType: '주간' | '야간';
  basePrice: number;
  optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price';
  optionAmount?: number;
  finalPrice: number;
  notes?: string;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  status: 'in_use' | 'checked_out' | 'cancelled';
  cancelled: boolean;
}

interface DailySummary {
  businessDay: string;
  totalVisitors: number;
  totalSales: number;
  cancellations: number;
  totalDiscount: number;
  foreignerCount: number;
  foreignerSales: number;
  dayVisitors: number;
  nightVisitors: number;
}

interface LockerGroup {
  id: string;
  name: string;
  startNumber: number;
  endNumber: number;
  sortOrder: number;
}

export default function Home() {
  const [selectedLocker, setSelectedLocker] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeLockers, setActiveLockers] = useState<LockerLog[]>([]);
  const [todayAllEntries, setTodayAllEntries] = useState<LockerLog[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [lockerGroups, setLockerGroups] = useState<LockerGroup[]>([]);
  const [newLockerInfo, setNewLockerInfo] = useState<{lockerNumber: number, timeType: '주간' | '야간', basePrice: number} | null>(null);

  // Load settings from localStorage
  const settings = localDb.getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  const dayPrice = settings.dayPrice;
  const nightPrice = settings.nightPrice;
  const discountAmount = settings.discountAmount;
  const foreignerPrice = settings.foreignerPrice;

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load data on mount and set up refresh interval
  useEffect(() => {
    loadData();
    
    const interval = setInterval(() => {
      loadData();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    try {
      const businessDay = getBusinessDay(new Date(), businessDayStartHour);
      
      const activeData = localDb.getActiveLockers();
      setActiveLockers(activeData);
      
      // 디버깅: 락커 21, 45번 데이터 출력
      const locker21 = activeData.find(l => l.lockerNumber === 21);
      const locker45 = activeData.find(l => l.lockerNumber === 45);
      if (locker21) console.log('락커 21번 데이터:', locker21);
      if (locker45) console.log('락커 45번 데이터:', locker45);
      
      setTodayAllEntries(localDb.getTodayEntries(businessDay));
      setSummary(localDb.getDailySummary(businessDay));
      setLockerGroups(localDb.getLockerGroups());
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Calculate all locker numbers from groups and their states
  const lockerStates: { [key: number]: 'empty' | 'in-use' | 'disabled' } = {};
  const additionalFeeCounts: { [key: number]: number } = {};
  const lockerTimeTypes: { [key: number]: 'day' | 'night' } = {};
  
  lockerGroups.forEach(group => {
    for (let i = group.startNumber; i <= group.endNumber; i++) {
      lockerStates[i] = 'empty';
      additionalFeeCounts[i] = 0;
      lockerTimeTypes[i] = 'day';
    }
  });
  
  activeLockers.forEach(log => {
    lockerStates[log.lockerNumber] = 'in-use';
    
    // Calculate additional fee count for this locker
    const { midnightsPassed } = calculateAdditionalFee(
      log.entryTime,
      log.timeType,
      dayPrice,
      nightPrice,
      currentTime
    );
    additionalFeeCounts[log.lockerNumber] = midnightsPassed;
    
    // Store time type (convert Korean to English)
    lockerTimeTypes[log.lockerNumber] = log.timeType === '주간' ? 'day' : 'night';
  });

  const handleLockerClick = async (lockerNumber: number) => {
    const state = lockerStates[lockerNumber];
    
    if (state === 'empty') {
      const timeType = getTimeType(currentTime);
      const basePrice = getBasePrice(timeType, dayPrice, nightPrice);
      
      setNewLockerInfo({ lockerNumber, timeType, basePrice });
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
    } else if (state === 'in-use') {
      setNewLockerInfo(null);
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
    }
  };

  const selectedEntry = selectedLocker && !newLockerInfo
    ? activeLockers.find(log => log.lockerNumber === selectedLocker)
    : null;

  const handleApplyOption = async (
    option: string, 
    customAmount?: number, 
    notes?: string, 
    paymentMethod?: 'card' | 'cash' | 'transfer'
  ) => {
    // Handle new locker entry
    if (newLockerInfo) {
      const businessDay = getBusinessDay(currentTime, businessDayStartHour);
      let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' = 'none';
      let finalPrice = newLockerInfo.basePrice;
      let optionAmount: number | undefined;

      if (option === 'direct_price' && customAmount) {
        optionType = 'direct_price';
        finalPrice = customAmount;
        optionAmount = customAmount;
      } else if (option === 'foreigner') {
        optionType = 'foreigner';
        finalPrice = foreignerPrice;
      } else if (option === 'discount') {
        optionType = 'discount';
        finalPrice = Math.max(0, newLockerInfo.basePrice - discountAmount);
        optionAmount = discountAmount;
      } else if (option === 'custom' && customAmount) {
        optionType = 'custom';
        finalPrice = Math.max(0, newLockerInfo.basePrice - customAmount);
        optionAmount = customAmount;
      }

      await localDb.createEntry({
        lockerNumber: newLockerInfo.lockerNumber,
        timeType: newLockerInfo.timeType,
        basePrice: newLockerInfo.basePrice,
        finalPrice,
        businessDay,
        optionType,
        optionAmount,
        notes,
        paymentMethod,
      });

      setNewLockerInfo(null);
      setDialogOpen(false);
      loadData();
      return;
    }

    // Handle existing entry update
    if (!selectedEntry) return;

    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' = 'none';
    let finalPrice = selectedEntry.basePrice;
    let optionAmount: number | undefined;

    if (option === 'direct_price' && customAmount) {
      optionType = 'direct_price';
      finalPrice = customAmount;
      optionAmount = customAmount;
    } else if (option === 'foreigner') {
      optionType = 'foreigner';
      finalPrice = foreignerPrice;
    } else if (option === 'discount') {
      optionType = 'discount';
      finalPrice = selectedEntry.basePrice - discountAmount;
      optionAmount = discountAmount;
    } else if (option === 'custom' && customAmount) {
      optionType = 'custom';
      finalPrice = selectedEntry.basePrice - customAmount;
      optionAmount = customAmount;
    }

    localDb.updateEntry(selectedEntry.id, { 
      optionType, 
      optionAmount, 
      finalPrice, 
      notes, 
      paymentMethod 
    });
    
    loadData();
  };

  const handleCheckout = async (paymentMethod: 'card' | 'cash' | 'transfer') => {
    if (!selectedEntry) return;

    localDb.updateEntry(selectedEntry.id, { 
      status: 'checked_out',
      exitTime: new Date(),
      paymentMethod: paymentMethod,
    });
    
    loadData();
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const handleCancel = async () => {
    if (!selectedEntry) return;

    localDb.updateEntry(selectedEntry.id, { 
      status: 'cancelled',
      cancelled: true,
    });
    
    loadData();
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const todayEntries = todayAllEntries.map(log => ({
    lockerNumber: log.lockerNumber,
    entryTime: new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
    timeType: log.timeType,
    basePrice: log.basePrice,
    option: log.optionType === 'none' ? '없음' : 
            log.optionType === 'discount' ? '할인' :
            log.optionType === 'custom' ? `할인직접` :
            log.optionType === 'direct_price' ? '요금직접' :
            '외국인',
    finalPrice: log.finalPrice,
    status: log.status,
    cancelled: log.cancelled,
    notes: log.notes,
    paymentMethod: log.paymentMethod,
  }));

  return (
    <div className="h-full w-full flex bg-background">
      {/* Left Panel */}
      <div className="w-[40%] border-r flex flex-col">
        {/* Today Status */}
        <div className="flex-[3] border-b overflow-hidden">
          <TodayStatusTable
            entries={todayEntries}
            onRowClick={(entry) => {
              setSelectedLocker(entry.lockerNumber);
              setDialogOpen(true);
            }}
          />
        </div>

        {/* Sales Summary */}
        <div className="flex-[2] p-6 overflow-auto">
          <SalesSummary
            date={getBusinessDay(currentTime, businessDayStartHour)}
            totalVisitors={summary?.totalVisitors || 0}
            totalSales={summary?.totalSales || 0}
            cancellations={summary?.cancellations || 0}
            foreignerCount={summary?.foreignerCount || 0}
            dayVisitors={summary?.dayVisitors || 0}
            nightVisitors={summary?.nightVisitors || 0}
          />
        </div>
      </div>

      {/* Right Panel - Locker Grid */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">입실 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - {getTimeType(currentTime)} ({getBasePrice(getTimeType(currentTime), dayPrice, nightPrice).toLocaleString()}원)
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-white border-2 border-gray-300"></div>
              <span className="text-xs">빈칸</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-[#FFD700] border-2 border-[#FFC700]"></div>
              <span className="text-xs">주간</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-[#7B68EE] border-2 border-[#6A5ACD]"></div>
              <span className="text-xs">야간</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-[#FF9933] border-2 border-[#FF7700]"></div>
              <span className="text-xs">외상1회</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-[#FF4444] border-2 border-[#CC0000]"></div>
              <span className="text-xs">외상2회+</span>
            </div>
          </div>
        </div>

        {/* Locker Grid */}
        <div className="flex-1 overflow-auto p-6">
          {lockerGroups.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>락커 그룹이 설정되지 않았습니다.</p>
              <p className="text-sm mt-2">설정 페이지에서 락커 그룹을 추가해주세요.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {lockerGroups.map((group) => (
                <div key={group.id}>
                  <h3 className="text-lg font-semibold mb-3">{group.name}</h3>
                  <div className="grid grid-cols-8 gap-2 max-w-4xl">
                    {Array.from(
                      { length: group.endNumber - group.startNumber + 1 },
                      (_, i) => group.startNumber + i
                    ).map((num) => (
                      <LockerButton
                        key={num}
                        number={num}
                        status={lockerStates[num] || 'empty'}
                        additionalFeeCount={additionalFeeCounts[num] || 0}
                        timeType={lockerTimeTypes[num] || 'day'}
                        onClick={() => handleLockerClick(num)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Options Dialog */}
      {(selectedEntry || newLockerInfo) && (
        <LockerOptionsDialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setNewLockerInfo(null);
          }}
          lockerNumber={selectedEntry?.lockerNumber || newLockerInfo!.lockerNumber}
          basePrice={selectedEntry?.basePrice || newLockerInfo!.basePrice}
          timeType={selectedEntry?.timeType || newLockerInfo!.timeType}
          entryTime={selectedEntry?.entryTime}
          currentNotes={selectedEntry?.notes}
          currentPaymentMethod={selectedEntry?.paymentMethod}
          currentOptionType={selectedEntry?.optionType}
          currentOptionAmount={selectedEntry?.optionAmount}
          currentFinalPrice={selectedEntry?.finalPrice}
          discountAmount={discountAmount}
          foreignerPrice={foreignerPrice}
          dayPrice={dayPrice}
          nightPrice={nightPrice}
          isInUse={!!selectedEntry}
          onApply={handleApplyOption}
          onCheckout={handleCheckout}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
