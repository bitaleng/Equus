import { useState } from 'react';
import LockerOptionsDialog from '../LockerOptionsDialog';
import { Button } from '@/components/ui/button';

export default function LockerOptionsDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>옵션 다이얼로그 열기</Button>
      <LockerOptionsDialog
        open={open}
        onClose={() => setOpen(false)}
        lockerNumber={15}
        basePrice={10000}
        timeType="주간"
        onApply={(option, customAmount) => {
          console.log('Applied:', option, customAmount);
          setOpen(false);
        }}
        onCheckout={() => {
          console.log('Checkout');
          setOpen(false);
        }}
        onCancel={() => {
          console.log('Cancelled');
          setOpen(false);
        }}
      />
    </div>
  );
}
