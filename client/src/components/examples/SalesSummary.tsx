import SalesSummary from '../SalesSummary';

export default function SalesSummaryExample() {
  return (
    <div className="p-8 max-w-md">
      <SalesSummary
        date="2025-11-01"
        totalVisitors={45}
        totalSales={520000}
        cancellations={2}
        totalDiscount={8000}
        foreignerCount={3}
        foreignerSales={75000}
      />
    </div>
  );
}
