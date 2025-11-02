import { Button } from "@/components/ui/button";

interface LockerButtonProps {
  number: number;
  status: 'empty' | 'in-use' | 'disabled';
  onClick: () => void;
}

export default function LockerButton({ number, status, onClick }: LockerButtonProps) {
  const getButtonStyles = () => {
    if (status === 'disabled') {
      return "bg-white text-white cursor-not-allowed border-2 border-muted";
    }
    if (status === 'in-use') {
      return "bg-[#FF6B4A] text-white border-2 border-[#FF5733]";
    }
    return "bg-[#A8C8E8] text-white border-2 border-[#88B8D8] hover-elevate active-elevate-2";
  };

  const getStatusText = () => {
    if (status === 'disabled') return '퇴실완료';
    if (status === 'in-use') return '사용중';
    return '비어있음';
  };

  const handleClick = () => {
    if (status !== 'disabled') {
      const audio = new Audio('data:audio/wav;base64,UklGRhIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQA=');
      audio.volume = 0.3;
      audio.play().catch(() => {});
      onClick();
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={status === 'disabled'}
      className={`
        aspect-square w-full min-h-[56px] rounded-lg font-semibold text-base
        transition-all duration-100
        active:scale-95
        flex flex-col items-center justify-center gap-0.5
        ${getButtonStyles()}
      `}
      data-testid={`locker-${number}`}
    >
      <span className="text-lg font-bold">{number}</span>
      <span className="text-[10px] font-normal opacity-90">{getStatusText()}</span>
    </Button>
  );
}
