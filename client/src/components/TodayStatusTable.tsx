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

interface LockerEntry {
  lockerNumber: number;
  entryTime: string;
  timeType: '주간' | '야간';
  basePrice: number;
  option: string;
  finalPrice: number;
  notes?: string;
}

interface TodayStatusTableProps {
  entries: LockerEntry[];
  onRowClick?: (entry: LockerEntry) => void;
}

export default function TodayStatusTable({ entries, onRowClick }: TodayStatusTableProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">오늘 현황</h2>
          <span className="text-sm text-muted-foreground">
            사용중: {entries.length}개
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  현재 사용중인 락커가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry, index) => (
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
