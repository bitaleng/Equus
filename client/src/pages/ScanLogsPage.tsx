import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileSpreadsheet, FileText, Filter, AlertTriangle } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as localDb from "@/lib/localDb";
import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";

interface ScanLog {
  id: string;
  lockerNumber: number;
  scanTime: string;
  businessDay: string;
  processed: number;
}

export default function ScanLogsPage() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [useTimeFilter, setUseTimeFilter] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lockerNumberFilter, setLockerNumberFilter] = useState<string>("");
  const [processedFilter, setProcessedFilter] = useState<string>("all");

  // Load scan logs
  useEffect(() => {
    loadScanLogs();
  }, [startDate, endDate, useTimeFilter]);

  useEffect(() => {
    loadScanLogs();
  }, []);

  const loadScanLogs = () => {
    setIsLoading(true);
    try {
      let fetchedLogs: ScanLog[] = [];

      if (useTimeFilter && startDate && endDate) {
        const startISO = new Date(startDate).toISOString();
        const endISO = new Date(endDate + 'T23:59:59.999').toISOString();
        fetchedLogs = localDb.getScanLogs(startISO, endISO);
      } else {
        fetchedLogs = localDb.getScanLogs();
      }

      setLogs(fetchedLogs);
    } catch (error) {
      console.error("Failed to load scan logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Apply filters
  const filteredLogs = logs.filter(log => {
    // Locker number filter
    if (lockerNumberFilter && !log.lockerNumber.toString().includes(lockerNumberFilter)) {
      return false;
    }

    // Processed filter
    if (processedFilter === "processed" && log.processed !== 1) {
      return false;
    }
    if (processedFilter === "unprocessed" && log.processed !== 0) {
      return false;
    }

    return true;
  });

  // Calculate statistics
  const totalScans = filteredLogs.length;
  const processedScans = filteredLogs.filter(log => log.processed === 1).length;
  const unprocessedScans = filteredLogs.filter(log => log.processed === 0).length;

  // Format datetime in KST
  const formatDateTime = (isoString: string): string => {
    const date = parseISO(isoString);
    const kstDate = toZonedTime(date, 'Asia/Seoul');
    return format(kstDate, 'yyyy-MM-dd HH:mm:ss');
  };

  // Export to Excel
  const exportToExcel = () => {
    const data = filteredLogs.map(log => ({
      '락카번호': log.lockerNumber,
      '스캔시간': formatDateTime(log.scanTime),
      '영업일': log.businessDay,
      '처리여부': log.processed ? '처리됨' : '미처리',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '스캔기록');

    const filename = `scan_logs_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.text('바코드 스캔 기록', 14, 15);
    doc.setFontSize(10);
    doc.text(`생성일시: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`, 14, 22);
    doc.text(`총 스캔: ${totalScans}건 | 처리: ${processedScans}건 | 미처리: ${unprocessedScans}건`, 14, 28);

    const tableData = filteredLogs.map(log => [
      log.lockerNumber,
      formatDateTime(log.scanTime),
      log.businessDay,
      log.processed ? '처리됨' : '미처리',
    ]);

    autoTable(doc, {
      head: [['락카번호', '스캔시간', '영업일', '처리여부']],
      body: tableData,
      startY: 35,
      styles: { font: 'helvetica', fontSize: 9 },
      headStyles: { fillColor: [66, 66, 66] },
    });

    const filename = `scan_logs_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
    doc.save(filename);
  };

  return (
    <div className="flex flex-col h-screen bg-background" data-testid="page-scan-logs">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">스캔정보</h1>
            <p className="text-sm text-muted-foreground">바코드 스캔 기록 조회</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDateFilter(!showDateFilter)}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-4 h-4 mr-2" />
            필터
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            data-testid="button-export-excel"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToPDF}
            data-testid="button-export-pdf"
          >
            <FileText className="w-4 h-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showDateFilter && (
        <Card className="m-4">
          <CardHeader>
            <CardTitle>필터 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="locker-filter">락카번호</Label>
                <Input
                  id="locker-filter"
                  type="number"
                  placeholder="락카번호 입력"
                  value={lockerNumberFilter}
                  onChange={(e) => setLockerNumberFilter(e.target.value)}
                  data-testid="input-locker-filter"
                />
              </div>

              <div className="space-y-2">
                <Label>처리여부</Label>
                <select
                  className="w-full h-9 px-3 border rounded-md"
                  value={processedFilter}
                  onChange={(e) => setProcessedFilter(e.target.value)}
                  data-testid="select-processed-filter"
                >
                  <option value="all">전체</option>
                  <option value="processed">처리됨</option>
                  <option value="unprocessed">미처리</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>
                  <input
                    type="checkbox"
                    checked={useTimeFilter}
                    onChange={(e) => setUseTimeFilter(e.target.checked)}
                    className="mr-2"
                    data-testid="checkbox-use-time-filter"
                  />
                  날짜 범위 필터
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={!useTimeFilter}
                    data-testid="input-start-date"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={!useTimeFilter}
                    data-testid="input-end-date"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">총 스캔</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-scans">{totalScans}건</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">처리됨</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="stat-processed-scans">{processedScans}건</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              미처리
              {unprocessedScans > 0 && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="stat-unprocessed-scans">{unprocessedScans}건</div>
          </CardContent>
        </Card>
      </div>

      {/* Scan Logs Table */}
      <div className="flex-1 px-4 pb-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>스캔 기록 ({filteredLogs.length}건)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-400px)]">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">로딩 중...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">스캔 기록이 없습니다.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">락카번호</TableHead>
                      <TableHead className="w-48">스캔시간</TableHead>
                      <TableHead className="w-32">영업일</TableHead>
                      <TableHead className="w-24">처리여부</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        className={log.processed === 0 ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                        data-testid={`scan-log-${log.id}`}
                      >
                        <TableCell className="font-medium" data-testid={`locker-${log.lockerNumber}`}>
                          {log.lockerNumber}번
                        </TableCell>
                        <TableCell data-testid={`scan-time-${log.id}`}>
                          {formatDateTime(log.scanTime)}
                        </TableCell>
                        <TableCell data-testid={`business-day-${log.id}`}>
                          {log.businessDay}
                        </TableCell>
                        <TableCell data-testid={`processed-${log.id}`}>
                          {log.processed === 1 ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">
                              처리됨
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
                              미처리
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
