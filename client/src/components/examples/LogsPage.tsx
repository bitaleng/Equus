import LogsPage from '../../pages/LogsPage';

const mockLogs = [
  {
    id: 1,
    lockerNumber: 5,
    entryTime: '09:30',
    exitTime: '11:45',
    timeType: '주간' as const,
    basePrice: 10000,
    option: '없음',
    finalPrice: 10000,
    cancelled: false,
  },
  {
    id: 2,
    lockerNumber: 12,
    entryTime: '10:15',
    exitTime: '12:30',
    timeType: '주간' as const,
    basePrice: 10000,
    option: '할인',
    optionAmount: 2000,
    finalPrice: 8000,
    cancelled: false,
    notes: '단골손님',
  },
  {
    id: 3,
    lockerNumber: 23,
    entryTime: '11:00',
    timeType: '주간' as const,
    basePrice: 10000,
    option: '외국인',
    finalPrice: 25000,
    cancelled: false,
  },
  {
    id: 4,
    lockerNumber: 7,
    entryTime: '14:20',
    exitTime: '14:25',
    timeType: '주간' as const,
    basePrice: 10000,
    option: '없음',
    finalPrice: 10000,
    cancelled: true,
    notes: '실수로 입력',
  },
];

export default function LogsPageExample() {
  return <LogsPage logs={mockLogs} />;
}
