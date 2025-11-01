import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import LockerButton from "@/components/LockerButton";
import LockerOptionsDialog from "@/components/LockerOptionsDialog";
import TodayStatusTable from "@/components/TodayStatusTable";
import SalesSummary from "@/components/SalesSummary";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getBusinessDay, getTimeType, getBasePrice } from "@shared/businessDay";

interface LockerLog {
  id: string;
  lockerNumber: number;
  entryTime: string;
  exitTime: string | null;
  timeType: '주간' | '야간';
  basePrice: number;
  optionType: 'none' | 'discount' | 'custom' | 'foreigner';
  optionAmount?: number;
  finalPrice: number;
  status: 'in_use' | 'checked_out' | 'cancelled';
  cancelled: boolean;
  notes?: string;
}

interface DailySummary {
  businessDay: string;
  totalVisitors: number;
  totalSales: number;
  cancellations: number;
  totalDiscount: number;
  foreignerCount: number;
  foreignerSales: number;
}

export default function Home() {
  const [selectedLocker, setSelectedLocker] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active lockers
  const { data: activeLockers = [] } = useQuery<LockerLog[]>({
    queryKey: ['/api/lockers/active'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch today's summary
  const { data: summary } = useQuery<DailySummary>({
    queryKey: ['/api/daily-summary/today'],
    refetchInterval: 10000,
  });

  // Create entry mutation
  const createEntryMutation = useMutation({
    mutationFn: async (lockerNumber: number) => {
      const timeType = getTimeType(currentTime);
      const basePrice = getBasePrice(timeType);
      const businessDay = getBusinessDay(currentTime);
      
      const res = await apiRequest('POST', '/api/entries', {
        lockerNumber,
        timeType,
        basePrice,
        finalPrice: basePrice,
        businessDay,
        optionType: 'none',
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lockers/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-summary/today'] });
    },
  });

  // Update entry mutation
  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, update }: { id: string; update: any }) => {
      const res = await apiRequest('PATCH', `/api/entries/${id}`, update);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lockers/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-summary/today'] });
    },
  });

  const lockerStates: { [key: number]: 'empty' | 'in-use' | 'disabled' } = {};
  for (let i = 1; i <= 80; i++) {
    lockerStates[i] = 'empty';
  }
  activeLockers.forEach(log => {
    lockerStates[log.lockerNumber] = 'in-use';
  });

  const handleLockerClick = async (lockerNumber: number) => {
    const state = lockerStates[lockerNumber];
    
    if (state === 'empty') {
      await createEntryMutation.mutateAsync(lockerNumber);
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
    } else if (state === 'in-use') {
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
    }
  };

  const selectedEntry = selectedLocker 
    ? activeLockers.find(log => log.lockerNumber === selectedLocker)
    : null;

  const handleApplyOption = async (option: string, customAmount?: number) => {
    if (!selectedEntry) return;

    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' = 'none';
    let finalPrice = selectedEntry.basePrice;
    let optionAmount: number | undefined;

    if (option === 'foreigner') {
      optionType = 'foreigner';
      finalPrice = 25000;
    } else if (option === 'discount') {
      optionType = 'discount';
      finalPrice = selectedEntry.basePrice - 2000;
      optionAmount = 2000;
    } else if (option === 'custom' && customAmount) {
      optionType = 'custom';
      finalPrice = selectedEntry.basePrice - customAmount;
      optionAmount = customAmount;
    }

    await updateEntryMutation.mutateAsync({
      id: selectedEntry.id,
      update: { optionType, optionAmount, finalPrice },
    });
  };

  const handleCheckout = async () => {
    if (!selectedEntry) return;

    await updateEntryMutation.mutateAsync({
      id: selectedEntry.id,
      update: { 
        status: 'checked_out',
        exitTime: new Date(),
      },
    });
    
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const handleCancel = async () => {
    if (!selectedEntry) return;

    await updateEntryMutation.mutateAsync({
      id: selectedEntry.id,
      update: { 
        status: 'cancelled',
        cancelled: true,
      },
    });
    
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const todayEntries = activeLockers.map(log => ({
    lockerNumber: log.lockerNumber,
    entryTime: new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
    timeType: log.timeType,
    basePrice: log.basePrice,
    option: log.optionType === 'none' ? '없음' : 
            log.optionType === 'discount' ? '할인' :
            log.optionType === 'custom' ? `할인(${log.optionAmount?.toLocaleString()}원)` :
            '외국인',
    finalPrice: log.finalPrice,
    notes: log.notes,
  }));

  return (
    <div className="h-screen w-full flex bg-background">
      {/* Left Panel */}
      <div className="w-[40%] border-r flex flex-col">
        {/* Today Status */}
        <div className="flex-[3] p-6 border-b">
          <TodayStatusTable
            entries={todayEntries}
            onRowClick={(entry) => {
              setSelectedLocker(entry.lockerNumber);
              setDialogOpen(true);
            }}
          />
        </div>

        {/* Sales Summary */}
        <div className="flex-[2] p-6">
          <SalesSummary
            date={getBusinessDay(currentTime)}
            totalVisitors={summary?.totalVisitors || 0}
            totalSales={summary?.totalSales || 0}
            cancellations={summary?.cancellations || 0}
            totalDiscount={summary?.totalDiscount || 0}
            foreignerCount={summary?.foreignerCount || 0}
            foreignerSales={summary?.foreignerSales || 0}
          />
        </div>
      </div>

      {/* Right Panel - Locker Grid */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">락커 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - {getTimeType(currentTime)} ({getBasePrice(getTimeType(currentTime)).toLocaleString()}원)
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-background border-2 border-border"></div>
              <span className="text-sm">비어있음</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary"></div>
              <span className="text-sm">사용중</span>
            </div>
          </div>
        </div>

        {/* Locker Grid */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-8 gap-2 max-w-4xl mx-auto">
            {Array.from({ length: 80 }, (_, i) => i + 1).map((num) => (
              <LockerButton
                key={num}
                number={num}
                status={lockerStates[num]}
                onClick={() => handleLockerClick(num)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Options Dialog */}
      {selectedEntry && (
        <LockerOptionsDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          lockerNumber={selectedEntry.lockerNumber}
          basePrice={selectedEntry.basePrice}
          timeType={selectedEntry.timeType}
          onApply={handleApplyOption}
          onCheckout={handleCheckout}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
