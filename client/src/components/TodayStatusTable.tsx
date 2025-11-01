import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">오늘 현황</h2>
        <span className="text-sm text-muted-foreground">
          사용중: {entries.length}개
        </span>
      </div>
      
      <ScrollArea className="flex-1">
        <Table>
          <TableHeader className="sticky top-0 bg-muted/50">
            <TableRow>
              <TableHead className="w-16">번호</TableHead>
              <TableHead className="w-20">입실시간</TableHead>
              <TableHead className="w-16">구분</TableHead>
              <TableHead className="w-20">기본요금</TableHead>
              <TableHead className="w-20">옵션</TableHead>
              <TableHead className="w-20">최종요금</TableHead>
              <TableHead>비고</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                  <TableCell className="font-medium">{entry.lockerNumber}</TableCell>
                  <TableCell className="text-sm">{entry.entryTime}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded ${
                      entry.timeType === '주간' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                    }`}>
                      {entry.timeType}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{entry.basePrice.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.option}</TableCell>
                  <TableCell className="font-semibold">{entry.finalPrice.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.notes || '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
