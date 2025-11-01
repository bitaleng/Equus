import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ListFilter, Users, UserCheck, UserX } from "lucide-react";

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

type FilterType = 'all' | 'in_use' | 'checked_out' | 'cancelled';

export default function TodayStatusTable({ entries, onRowClick }: TodayStatusTableProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Filter entries based on selected filter
  const filteredEntries = entries.filter(entry => {
    if (filter === 'all') return true;
    if (filter === 'cancelled') return entry.cancelled;
    return entry.status === filter && !entry.cancelled;
  });

  const stats = {
    total: entries.length,
    inUse: entries.filter(e => e.status === 'in_use' && !e.cancelled).length,
    checkedOut: entries.filter(e => e.status === 'checked_out' && !e.cancelled).length,
    cancelled: entries.filter(e => e.cancelled).length,
  };

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-16 border-r flex flex-col gap-2 p-2 bg-muted/30">
        <Button
          variant={filter === 'all' ? 'default' : 'ghost'}
          size="icon"
          className="h-14 w-full flex-col gap-1"
          onClick={() => setFilter('all')}
          data-testid="filter-all"
          title="전체"
        >
          <Users className="h-4 w-4" />
          <span className="text-[10px]">{stats.total}</span>
        </Button>
        <Button
          variant={filter === 'in_use' ? 'default' : 'ghost'}
          size="icon"
          className="h-14 w-full flex-col gap-1"
          onClick={() => setFilter('in_use')}
          data-testid="filter-in-use"
          title="입실중"
        >
          <UserCheck className="h-4 w-4" />
          <span className="text-[10px]">{stats.inUse}</span>
        </Button>
        <Button
          variant={filter === 'checked_out' ? 'default' : 'ghost'}
          size="icon"
          className="h-14 w-full flex-col gap-1"
          onClick={() => setFilter('checked_out')}
          data-testid="filter-checked-out"
          title="퇴실"
        >
          <UserX className="h-4 w-4" />
          <span className="text-[10px]">{stats.checkedOut}</span>
        </Button>
        <Button
          variant={filter === 'cancelled' ? 'default' : 'ghost'}
          size="icon"
          className="h-14 w-full flex-col gap-1 text-destructive hover:text-destructive"
          onClick={() => setFilter('cancelled')}
          data-testid="filter-cancelled"
          title="취소"
        >
          <ListFilter className="h-4 w-4" />
          <span className="text-[10px]">{stats.cancelled}</span>
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">오늘 현황</h2>
            <span className="text-sm text-muted-foreground">
              {filter === 'all' && `총 방문: ${stats.total}명`}
              {filter === 'in_use' && `입실중: ${stats.inUse}명`}
              {filter === 'checked_out' && `퇴실: ${stats.checkedOut}명`}
              {filter === 'cancelled' && `취소: ${stats.cancelled}명`}
            </span>
          </div>
          <Link href="/logs">
            <Button variant="outline" size="sm" data-testid="button-view-logs">
              상세정보보기
            </Button>
          </Link>
        </div>
        
        <ScrollArea className="flex-1">
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
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {filter === 'all' ? '오늘 방문한 손님이 없습니다' : '해당하는 방문 기록이 없습니다'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry, index) => {
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
        </ScrollArea>
      </div>
    </div>
  );
}
