import TodayStatusTable from '../TodayStatusTable';

const mockEntries = [
  {
    lockerNumber: 5,
    entryTime: '09:30',
    timeType: '주간' as const,
    basePrice: 10000,
    option: '없음',
    finalPrice: 10000,
  },
  {
    lockerNumber: 12,
    entryTime: '10:15',
    timeType: '주간' as const,
    basePrice: 10000,
    option: '할인',
    finalPrice: 8000,
    notes: '단골손님',
  },
  {
    lockerNumber: 23,
    entryTime: '11:00',
    timeType: '주간' as const,
    basePrice: 10000,
    option: '외국인',
    finalPrice: 25000,
  },
];

export default function TodayStatusTableExample() {
  return (
    <div className="p-8 h-96">
      <TodayStatusTable 
        entries={mockEntries}
        onRowClick={(entry) => console.log('Clicked entry:', entry)}
      />
    </div>
  );
}
