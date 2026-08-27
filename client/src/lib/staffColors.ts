// 직원별 고정 색상 팔레트 — 직원근무일지(근무자 선택 버튼)와 근무다이어리(겹침 시각화)에서 공통으로 사용
export const STAFF_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#06B6D4", "#EC4899", "#F97316", "#6366F1", "#14B8A6",
];

export function getStaffColor(index: number): string {
  return STAFF_COLORS[index % STAFF_COLORS.length];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

/** 감산혼합(물감을 섞듯) — 두 색을 곱해서 섞은 색. 여러 색은 순서대로 접어서 섞으면 됨. */
export function multiplyBlend(hexA: string, hexB: string): string {
  const [ra, ga, ba] = hexToRgb(hexA);
  const [rb, gb, bb] = hexToRgb(hexB);
  return rgbToHex([(ra * rb) / 255, (ga * gb) / 255, (ba * bb) / 255]);
}

export function multiplyBlendAll(hexes: string[]): string {
  if (hexes.length === 0) return "#ffffff";
  return hexes.reduce((acc, h) => multiplyBlend(acc, h));
}
