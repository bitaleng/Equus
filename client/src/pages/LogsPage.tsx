import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft } from "lucide-react";

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

interface LogsPageProps {
  logs?: LogEntry[];
}

export default function LogsPage({ logs = [] }: LogsPageProps) {
  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">입출 기록 로그</h1>
            <p className="text-sm text-muted-foreground mt-1">
              전체 누적 데이터 ({logs.length}건)
            </p>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="flex-1 overflow-hidden p-6">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead className="w-16">순번</TableHead>
                <TableHead className="w-20">락커번호</TableHead>
                <TableHead className="w-24">입실시간</TableHead>
                <TableHead className="w-24">퇴실시간</TableHead>
                <TableHead className="w-20">주/야간</TableHead>
                <TableHead className="w-24">기본요금</TableHead>
                <TableHead className="w-32">옵션</TableHead>
                <TableHead className="w-24">옵션금액</TableHead>
                <TableHead className="w-28">최종요금</TableHead>
                <TableHead className="w-20">입실취소</TableHead>
                <TableHead className="min-w-32">비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-12">
                    아직 기록된 데이터가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="font-medium">{log.id}</TableCell>
                    <TableCell className="font-semibold text-base">{log.lockerNumber}</TableCell>
                    <TableCell className="text-sm">{log.entryTime}</TableCell>
                    <TableCell className="text-sm">
                      {log.exitTime || '-'}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                        log.timeType === '주간' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                      }`}>
                        {log.timeType}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{log.basePrice.toLocaleString()}원</TableCell>
                    <TableCell className="text-sm">{log.option}</TableCell>
                    <TableCell className="text-sm">
                      {log.optionAmount ? `${log.optionAmount.toLocaleString()}원` : '-'}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {log.finalPrice.toLocaleString()}원
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded ${
                        log.cancelled ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                      }`}>
                        {log.cancelled ? 'O' : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}
