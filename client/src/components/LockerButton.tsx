import { Button } from "@/components/ui/button";

interface LockerButtonProps {
  number: number;
  status: 'empty' | 'in-use' | 'disabled';
  additionalFeeCount?: number; // 추가요금 발생 횟수 (0: 없음, 1: 1회, 2+: 2회 이상)
  timeType?: 'day' | 'night'; // 입실 시간대 (주간/야간)
  onClick: () => void;
}

export default function LockerButton({ number, status, additionalFeeCount = 0, timeType = 'day', onClick }: LockerButtonProps) {
  const getButtonStyles = () => {
    if (status === 'disabled') {
      return "bg-white text-white cursor-not-allowed border-2 border-muted";
    }
    if (status === 'in-use') {
      // 추가요금 2회 이상: 레드
      if (additionalFeeCount >= 2) {
        return "bg-[#FF4444] text-white border-2 border-[#CC0000]";
      }
      // 추가요금 1회: 오렌지
      if (additionalFeeCount === 1) {
        return "bg-[#FF9933] text-white border-2 border-[#FF7700]";
      }
      // 추가요금 없음: 주간/야간 구분
      if (timeType === 'day') {
        // 주간: 노란색
        return "bg-[#FFD700] text-gray-800 border-2 border-[#FFC700]";
      } else {
        // 야간: 퍼플 블루
        return "bg-[#7B68EE] text-white border-2 border-[#6A5ACD]";
      }
    }
    // 빈 락카: 흰색
    return "bg-white text-gray-700 border-2 border-gray-300 hover-elevate active-elevate-2";
  };

  const getStatusText = () => {
    if (status === 'disabled') return '퇴실완료';
    if (status === 'in-use') {
      if (additionalFeeCount >= 2) return '추가요금 2회+';
      if (additionalFeeCount === 1) return '추가요금 1회';
      return '사용중';
    }
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
