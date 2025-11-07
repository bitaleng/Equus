import { Button } from "@/components/ui/button";

interface LockerButtonProps {
  number: number;
  status: 'empty' | 'in-use' | 'disabled';
  additionalFeeCount?: number; // 추가요금 발생 횟수 (0: 없음, 1: 1회, 2+: 2회 이상)
  timeType?: 'day' | 'night'; // 입실 시간대 (주간/야간)
  entryTime?: Date; // 입실 시간
  businessDayStartHour?: number; // 정산시간 (기본값: 10)
  onClick: () => void;
  isExpanded?: boolean; // 패널 접힌 상태 (true = 패널 접힘, 버튼 크게)
}

export default function LockerButton({ number, status, additionalFeeCount = 0, timeType = 'day', entryTime, businessDayStartHour = 10, onClick, isExpanded = false }: LockerButtonProps) {
  const getButtonStyles = () => {
    if (status === 'disabled') {
      return "bg-white text-white cursor-not-allowed border-2 border-muted";
    }
    if (status === 'in-use') {
      // 1순위: 추가요금 있음 -> 무조건 레드
      if (additionalFeeCount > 0) {
        return "bg-[#FF4444] text-white border-2 border-[#CC0000]";
      }
      
      // 2순위: 입실시간이 정산시간 이전인 경우 -> 그린색 (이전 영업일)
      if (entryTime) {
        const entryHour = entryTime.getHours();
        if (entryHour < businessDayStartHour) {
          return "bg-[#22C55E] text-white border-2 border-[#16A34A]";
        }
      }
      
      // 3순위: 추가요금 없음 -> 주간/야간 구분
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
      // 추가요금이 있으면 횟수만 표시
      if (additionalFeeCount > 0) return `추가 ${additionalFeeCount}회`;
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
        aspect-square w-full rounded-lg font-semibold
        transition-all duration-100
        active:scale-95
        flex flex-col items-center justify-center gap-0.5
        ${isExpanded ? 'min-h-[80px] text-lg' : 'min-h-[56px] text-base'}
        ${getButtonStyles()}
      `}
      data-testid={`locker-${number}`}
    >
      <span className={isExpanded ? "text-3xl font-bold" : "text-2xl font-bold"}>{number}</span>
      <span className={isExpanded ? "text-xs font-normal opacity-90" : "text-[10px] font-normal opacity-90"}>{getStatusText()}</span>
    </Button>
  );
}
