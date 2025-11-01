import { Button } from "@/components/ui/button";

interface LockerButtonProps {
  number: number;
  status: 'empty' | 'in-use' | 'disabled';
  onClick: () => void;
}

export default function LockerButton({ number, status, onClick }: LockerButtonProps) {
  const getButtonStyles = () => {
    if (status === 'disabled') {
      return "bg-muted/50 text-muted-foreground cursor-not-allowed border-2 border-border";
    }
    if (status === 'in-use') {
      return "bg-primary text-primary-foreground border-2 border-primary-border";
    }
    return "bg-background text-foreground border-2 border-border hover-elevate active-elevate-2";
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
        ${getButtonStyles()}
      `}
      data-testid={`locker-${number}`}
    >
      {number}
    </Button>
  );
}
