import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { X } from "lucide-react";

interface LockerEntry {
  lockerNumber: number;
  entryTime: string;
  timeType: '주간' | '야간';
  basePrice: number;
  option: string;
  finalPrice: number;
  status: 'in_use' | 'checked_out' | 'cancelled';
  cancelled: boolean;
  notes?: string;
}

interface TodayStatusTableProps {
  entries: LockerEntry[];
  onRowClick?: (entry: LockerEntry) => void;
}

export default function TodayStatusTable({ entries, onRowClick }: TodayStatusTableProps) {
  const [lockerNumberInput, setLockerNumberInput] = useState("");
  const [filteredLockerNumber, setFilteredLockerNumber] = useState<number | null>(null);

  const handleLockerUsageFilter = () => {
    const num = parseInt(lockerNumberInput);
    if (!isNaN(num) && num > 0) {
      setFilteredLockerNumber(num);
    }
  };

  const clearFilter = () => {
    setFilteredLockerNumber(null);
    setLockerNumberInput("");
  };

  // Filter entries based on locker number
  const displayedEntries = filteredLockerNumber !== null
    ? entries.filter(e => e.lockerNumber === filteredLockerNumber)
    : entries;

  // Count usage for filtered locker
  const usageCount = filteredLockerNumber !== null
    ? entries.filter(e => e.lockerNumber === filteredLockerNumber && !e.cancelled).length
    : 0;

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">오늘 현황</h2>
          <span className="text-sm text-muted-foreground">
            총 방문: {entries.length}명 (사용중: {entries.filter(e => e.status === 'in_use' && !e.cancelled).length}개)
          </span>
          {filteredLockerNumber !== null && (
            <span className="text-sm font-semibold text-primary">
              락커 {filteredLockerNumber}번 사용: {usageCount}회
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="락커번호"
            value={lockerNumberInput}
            onChange={(e) => setLockerNumberInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLockerUsageFilter()}
            className="w-24 h-9"
            data-testid="input-locker-number-filter"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLockerUsageFilter}
            data-testid="button-locker-usage"
          >
            락카사용회수
          </Button>
          {filteredLockerNumber !== null && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={clearFilter}
              data-testid="button-clear-filter"
              className="h-9 w-9"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <Link href="/logs">
            <Button variant="outline" size="sm" data-testid="button-view-logs">
              상세정보보기
            </Button>
          </Link>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarGutter: 'stable' }}>
        <Table>
          <TableHeader className="sticky top-0 bg-muted/50">
            <TableRow>
              <TableHead className="w-20">번호</TableHead>
              <TableHead className="w-24">입실시간</TableHead>
              <TableHead className="w-20">구분</TableHead>
              <TableHead className="w-24">옵션</TableHead>
              <TableHead className="w-28">최종요금</TableHead>
              <TableHead className="w-24">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {filteredLockerNumber !== null 
                    ? `락커 ${filteredLockerNumber}번 사용 기록이 없습니다`
                    : '오늘 방문한 손님이 없습니다'
                  }
                </TableCell>
              </TableRow>
            ) : (
              displayedEntries.map((entry, index) => {
                const statusText = entry.cancelled ? '취소' : entry.status === 'in_use' ? '입실중' : '퇴실';
                const statusColor = entry.cancelled 
                  ? 'bg-destructive/10 text-destructive' 
                  : entry.status === 'in_use' 
                  ? 'bg-primary/10 text-primary' 
                  : 'bg-muted text-muted-foreground';
                
                return (
                  <TableRow
                    key={index}
                    className="hover-elevate cursor-pointer"
                    onClick={() => onRowClick?.(entry)}
                    data-testid={`row-entry-${entry.lockerNumber}`}
                  >
                    <TableCell className="font-semibold text-base">{entry.lockerNumber}</TableCell>
                    <TableCell className="text-sm">{entry.entryTime}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                        entry.timeType === '주간' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                      }`}>
                        {entry.timeType}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{entry.option}</TableCell>
                    <TableCell className="font-semibold text-base">{entry.finalPrice.toLocaleString()}원</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${statusColor}`}>
                        {statusText}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
