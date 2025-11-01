import LockerButton from '../LockerButton';

export default function LockerButtonExample() {
  return (
    <div className="p-8 grid grid-cols-3 gap-4 max-w-md">
      <LockerButton number={1} status="empty" onClick={() => console.log('Locker 1 clicked')} />
      <LockerButton number={2} status="in-use" onClick={() => console.log('Locker 2 clicked')} />
      <LockerButton number={3} status="disabled" onClick={() => console.log('Locker 3 clicked')} />
    </div>
  );
}
