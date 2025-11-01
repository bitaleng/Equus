import { useState, useEffect } from "react";
import LockerButton from "@/components/LockerButton";
import LockerOptionsDialog from "@/components/LockerOptionsDialog";
import TodayStatusTable from "@/components/TodayStatusTable";
import SalesSummary from "@/components/SalesSummary";
import { Checkbox } from "@/components/ui/checkbox";

interface LockerEntry {
  lockerNumber: number;
  entryTime: string;
  timeType: '주간' | '야간';
  basePrice: number;
  option: string;
  optionAmount?: number;
  finalPrice: number;
  notes?: string;
}

interface LogEntry {
  id: number;
  lockerNumber: number;
  entryTime: string;
  exitTime?: string;
  timeType: '주간' | '야간';
  basePrice: number;
  option: string;
  optionAmount?: number;
  finalPrice: number;
  cancelled: boolean;
  notes?: string;
}

export default function Home() {
  const [lockerStates, setLockerStates] = useState<{ [key: number]: 'empty' | 'in-use' | 'disabled' }>(() => {
    const states: { [key: number]: 'empty' | 'in-use' | 'disabled' } = {};
    for (let i = 1; i <= 80; i++) {
      states[i] = 'empty';
    }
    return states;
  });

  const [todayEntries, setTodayEntries] = useState<LockerEntry[]>([]);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [nextLogId, setNextLogId] = useState(1);
  const [selectedLocker, setSelectedLocker] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // todo: remove mock functionality
  useEffect(() => {
    const mockData: LockerEntry[] = [
      {
        lockerNumber: 5,
        entryTime: '09:30',
        timeType: '주간',
        basePrice: 10000,
        option: '없음',
        finalPrice: 10000,
      },
      {
        lockerNumber: 12,
        entryTime: '10:15',
        timeType: '주간',
        basePrice: 10000,
        option: '할인',
        optionAmount: 2000,
        finalPrice: 8000,
        notes: '단골손님',
      },
      {
        lockerNumber: 23,
        entryTime: '11:00',
        timeType: '주간',
        basePrice: 10000,
        option: '외국인',
        finalPrice: 25000,
      },
    ];
    setTodayEntries(mockData);
    
    const mockLogs: LogEntry[] = mockData.map((entry, index) => ({
      id: index + 1,
      ...entry,
      cancelled: false,
    }));
    setAllLogs(mockLogs);
    setNextLogId(mockData.length + 1);
    
    const newStates = { ...lockerStates };
    mockData.forEach(entry => {
      newStates[entry.lockerNumber] = 'in-use';
    });
    setLockerStates(newStates);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Share logs data with LogsPage via localStorage
  useEffect(() => {
    localStorage.setItem('lockerLogs', JSON.stringify(allLogs));
  }, [allLogs]);

  const getTimeType = (): '주간' | '야간' => {
    const hour = currentTime.getHours();
    return (hour >= 7 && hour < 19) ? '주간' : '야간';
  };

  const getBasePrice = () => {
    return getTimeType() === '주간' ? 10000 : 13000;
  };

  const handleLockerClick = (lockerNumber: number) => {
    const state = lockerStates[lockerNumber];
    
    if (state === 'empty') {
      const timeType = getTimeType();
      const basePrice = getBasePrice();
      const entryTime = currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      const newEntry: LockerEntry = {
        lockerNumber,
        entryTime,
        timeType,
        basePrice,
        option: '없음',
        finalPrice: basePrice,
      };
      
      setTodayEntries([...todayEntries, newEntry]);
      
      const newLog: LogEntry = {
        id: nextLogId,
        ...newEntry,
        cancelled: false,
      };
      setAllLogs([...allLogs, newLog]);
      setNextLogId(nextLogId + 1);
      
      setLockerStates({ ...lockerStates, [lockerNumber]: 'in-use' });
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
    } else if (state === 'in-use') {
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
    }
  };

  const handleApplyOption = (option: string, customAmount?: number) => {
    if (selectedLocker === null) return;

    const entry = todayEntries.find(e => e.lockerNumber === selectedLocker);
    if (!entry) return;

    let finalPrice = entry.basePrice;
    let optionText = '없음';

    if (option === 'foreigner') {
      finalPrice = 25000;
      optionText = '외국인';
    } else if (option === 'discount') {
      finalPrice = entry.basePrice - 2000;
      optionText = '할인';
    } else if (option === 'custom' && customAmount) {
      finalPrice = entry.basePrice - customAmount;
      optionText = `할인(${customAmount.toLocaleString()}원)`;
    }

    const updatedEntries = todayEntries.map(e =>
      e.lockerNumber === selectedLocker
        ? { ...e, option: optionText, finalPrice, optionAmount: customAmount }
        : e
    );
    setTodayEntries(updatedEntries);

    const updatedLogs = allLogs.map(log =>
      log.lockerNumber === selectedLocker && !log.exitTime
        ? { ...log, option: optionText, finalPrice, optionAmount: customAmount }
        : log
    );
    setAllLogs(updatedLogs);
  };

  const handleCheckout = () => {
    if (selectedLocker === null) return;

    const exitTime = currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    const updatedLogs = allLogs.map(log =>
      log.lockerNumber === selectedLocker && !log.exitTime
        ? { ...log, exitTime }
        : log
    );
    setAllLogs(updatedLogs);

    setTodayEntries(todayEntries.filter(e => e.lockerNumber !== selectedLocker));
    setLockerStates({ ...lockerStates, [selectedLocker]: 'empty' });
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const handleCancel = () => {
    if (selectedLocker === null) return;

    const updatedLogs = allLogs.map(log =>
      log.lockerNumber === selectedLocker && !log.exitTime
        ? { ...log, cancelled: true }
        : log
    );
    setAllLogs(updatedLogs);

    setTodayEntries(todayEntries.filter(e => e.lockerNumber !== selectedLocker));
    setLockerStates({ ...lockerStates, [selectedLocker]: 'empty' });
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const toggleLockerDisabled = (lockerNumber: number) => {
    const currentState = lockerStates[lockerNumber];
    if (currentState === 'empty') {
      setLockerStates({ ...lockerStates, [lockerNumber]: 'disabled' });
    } else if (currentState === 'disabled') {
      setLockerStates({ ...lockerStates, [lockerNumber]: 'empty' });
    }
  };

  const calculateSummary = () => {
    const completedToday = allLogs.filter(log => log.exitTime && !log.cancelled);
    const totalVisitors = completedToday.length;
    const totalSales = completedToday.reduce((sum, log) => sum + log.finalPrice, 0);
    const cancellations = allLogs.filter(log => log.cancelled).length;
    const totalDiscount = completedToday.reduce((sum, log) => {
      if (log.option.includes('할인')) {
        return sum + (log.optionAmount || 2000);
      }
      return sum;
    }, 0);
    const foreignerCount = completedToday.filter(log => log.option === '외국인').length;
    const foreignerSales = completedToday.filter(log => log.option === '외국인').reduce((sum, log) => sum + log.finalPrice, 0);

    return {
      totalVisitors,
      totalSales,
      cancellations,
      totalDiscount,
      foreignerCount,
      foreignerSales,
    };
  };

  const summary = calculateSummary();
  const selectedEntry = selectedLocker ? todayEntries.find(e => e.lockerNumber === selectedLocker) : null;

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
            date={currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '')}
            {...summary}
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
              {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - {getTimeType()} ({getBasePrice().toLocaleString()}원)
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
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted/50"></div>
              <span className="text-sm">빈락카</span>
            </div>
          </div>
        </div>

        {/* Locker Grid */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-8 gap-2 max-w-4xl mx-auto">
            {Array.from({ length: 80 }, (_, i) => i + 1).map((num) => (
              <div key={num} className="relative">
                <LockerButton
                  number={num}
                  status={lockerStates[num]}
                  onClick={() => handleLockerClick(num)}
                />
                {lockerStates[num] === 'empty' && (
                  <div className="absolute -bottom-1 -right-1">
                    <Checkbox
                      id={`disable-${num}`}
                      checked={false}
                      onCheckedChange={() => toggleLockerDisabled(num)}
                      className="w-4 h-4 bg-background border-2"
                      data-testid={`checkbox-disable-${num}`}
                    />
                  </div>
                )}
                {lockerStates[num] === 'disabled' && (
                  <div className="absolute -bottom-1 -right-1">
                    <Checkbox
                      id={`enable-${num}`}
                      checked={true}
                      onCheckedChange={() => toggleLockerDisabled(num)}
                      className="w-4 h-4"
                      data-testid={`checkbox-enable-${num}`}
                    />
                  </div>
                )}
              </div>
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
