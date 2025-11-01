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
import { ArrowLeft, Calendar, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Fetch logs with optional date range filter
  const { data, isLoading } = useQuery<{ data: LogEntry[]; nextCursor: string | null }>({
    queryKey: ['/api/logs', startDate, endDate],
    queryFn: async ({ queryKey }) => {
      const [_, start, end] = queryKey;
      let url = '/api/logs?limit=1000';
      
      if (start && end) {
        url = `/api/logs?startDate=${start}&endDate=${end}&limit=1000`;
      } else if (start) {
        url = `/api/logs?date=${start}&limit=1000`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
  });

  const logs = data?.data || [];

  const clearDateFilter = () => {
    setStartDate("");
    setEndDate("");
  };

  const getOptionText = (log: LogEntry) => {
    if (log.optionType === 'none') return '없음';
    if (log.optionType === 'foreigner') return '외국인';
    if (log.optionType === 'discount') return '할인';
    if (log.optionType === 'custom') return `직접입력`;
    return '-';
  };

  const exportToExcel = () => {
    const exportData = logs.map((log) => ({
      '날짜': new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      '락커번호': log.lockerNumber,
      '입실시간': new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      '퇴실시간': log.exitTime 
        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-',
      '주/야간': log.timeType,
      '기본요금': log.basePrice,
      '옵션': getOptionText(log),
      '옵션금액': log.optionAmount || '-',
      '최종요금': log.finalPrice,
      '지불방식': log.paymentMethod === 'card' ? '카드' : log.paymentMethod === 'cash' ? '현금' : '-',
      '입실취소': log.cancelled ? 'O' : '-',
      '비고': log.notes || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '매출기록');
    
    const fileName = startDate && endDate 
      ? `매출기록_${startDate}_${endDate}.xlsx`
      : `매출기록_전체.xlsx`;
    
    XLSX.writeFile(wb, fileName);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Add Korean font support (using default font for now)
    doc.setFont("helvetica");
    
    const title = startDate && endDate 
      ? `매출기록 (${startDate} ~ ${endDate})`
      : '매출기록 (전체)';
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    
    const tableData = logs.map((log) => [
      new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      log.lockerNumber.toString(),
      new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      log.exitTime 
        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-',
      log.timeType,
      log.basePrice.toLocaleString(),
      getOptionText(log),
      log.optionAmount ? log.optionAmount.toLocaleString() : '-',
      log.finalPrice.toLocaleString(),
      log.paymentMethod === 'card' ? '카드' : log.paymentMethod === 'cash' ? '현금' : '-',
      log.cancelled ? 'O' : '-',
    ]);

    autoTable(doc, {
      head: [['날짜', '락커', '입실', '퇴실', '주/야간', '기본요금', '옵션', '옵션금액', '최종요금', '지불', '취소']],
      body: tableData,
      startY: 25,
      styles: { fontSize: 8, font: 'helvetica' },
      headStyles: { fillColor: [66, 66, 66] },
    });
    
    const fileName = startDate && endDate 
      ? `매출기록_${startDate}_${endDate}.pdf`
      : `매출기록_전체.pdf`;
    
    doc.save(fileName);
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
                {startDate && endDate
                  ? `${startDate} ~ ${endDate} 매출 - ${logs.length}건`
                  : startDate
                  ? `${startDate} 매출 - ${logs.length}건`
                  : `전체 누적 데이터 (${logs.length}건)`
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {logs.length > 0 && (
              <>
                <Button 
                  variant="outline" 
                  onClick={exportToExcel}
                  data-testid="button-export-excel"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  엑셀 내보내기
                </Button>
                <Button 
                  variant="outline" 
                  onClick={exportToPDF}
                  data-testid="button-export-pdf"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF 내보내기
                </Button>
              </>
            )}
            
            {!showDateFilter ? (
              <Button 
                variant="outline" 
                onClick={() => setShowDateFilter(true)}
                data-testid="button-show-date-filter"
              >
                <Calendar className="h-4 w-4 mr-2" />
                기간 조회
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="start-date" className="text-sm whitespace-nowrap">
                    시작일
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-40"
                    data-testid="input-start-date"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="end-date" className="text-sm whitespace-nowrap">
                    종료일
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-40"
                    data-testid="input-end-date"
                  />
                </div>
                {(startDate || endDate) && (
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
                    clearDateFilter();
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
                    {startDate && endDate
                      ? `${startDate} ~ ${endDate} 기간에 기록된 데이터가 없습니다`
                      : startDate
                      ? `${startDate}에 기록된 데이터가 없습니다`
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
