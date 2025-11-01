import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Calendar } from "lucide-react";

interface LogEntry {
  id: string;
  lockerNumber: number;
  entryTime: string;
  exitTime?: string | null;
  timeType: '주간' | '야간';
  basePrice: number;
  optionType: 'none' | 'discount' | 'custom' | 'foreigner';
  optionAmount?: number;
  finalPrice: number;
  paymentMethod?: 'card' | 'cash';
  cancelled: boolean;
  notes?: string;
}

export default function LogsPage() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Fetch logs with optional date filter
  const { data, isLoading } = useQuery<{ data: LogEntry[]; nextCursor: string | null }>({
    queryKey: ['/api/logs', selectedDate],
    queryFn: async ({ queryKey }) => {
      const [_, date] = queryKey;
      const url = date ? `/api/logs?date=${date}&limit=200` : '/api/logs?limit=200';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
  });

  const logs = data?.data || [];

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const clearDateFilter = () => {
    setSelectedDate("");
  };

  const getOptionText = (log: LogEntry) => {
    if (log.optionType === 'none') return '없음';
    if (log.optionType === 'foreigner') return '외국인';
    if (log.optionType === 'discount') return '할인';
    if (log.optionType === 'custom') return `직접입력`;
    return '-';
  };

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">입출 기록 로그</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedDate 
                  ? `${selectedDate} 매출 (10:00 ~ 익일 09:59) - ${logs.length}건`
                  : `전체 누적 데이터 (${logs.length}건)`
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!showDateFilter ? (
              <Button 
                variant="outline" 
                onClick={() => setShowDateFilter(true)}
                data-testid="button-show-date-filter"
              >
                <Calendar className="h-4 w-4 mr-2" />
                날짜별 조회
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="date-filter" className="text-sm whitespace-nowrap">
                    날짜 선택
                  </Label>
                  <Input
                    id="date-filter"
                    type="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    className="w-48"
                    data-testid="input-date-filter"
                  />
                </div>
                {selectedDate && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearDateFilter}
                    data-testid="button-clear-date"
                  >
                    전체보기
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowDateFilter(false);
                    setSelectedDate("");
                  }}
                  data-testid="button-hide-date-filter"
                >
                  닫기
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="flex-1 overflow-hidden p-6">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead className="w-28">날짜</TableHead>
                <TableHead className="w-20">락커번호</TableHead>
                <TableHead className="w-24">입실시간</TableHead>
                <TableHead className="w-24">퇴실시간</TableHead>
                <TableHead className="w-20">주/야간</TableHead>
                <TableHead className="w-24">기본요금</TableHead>
                <TableHead className="w-32">옵션</TableHead>
                <TableHead className="w-24">옵션금액</TableHead>
                <TableHead className="w-28">최종요금</TableHead>
                <TableHead className="w-24">지불방식</TableHead>
                <TableHead className="w-20">입실취소</TableHead>
                <TableHead className="min-w-32">비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                    로딩중...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                    {selectedDate 
                      ? `${selectedDate}에 기록된 데이터가 없습니다`
                      : '아직 기록된 데이터가 없습니다'
                    }
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="text-sm">
                      {new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="font-semibold text-base">{log.lockerNumber}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.exitTime 
                        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                        log.timeType === '주간' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                      }`}>
                        {log.timeType}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{log.basePrice.toLocaleString()}원</TableCell>
                    <TableCell className="text-sm">{getOptionText(log)}</TableCell>
                    <TableCell className="text-sm">
                      {log.optionAmount ? `${log.optionAmount.toLocaleString()}원` : '-'}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {log.finalPrice.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.paymentMethod === 'card' ? '카드' : log.paymentMethod === 'cash' ? '현금' : '-'}
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
