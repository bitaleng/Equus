/** store-profile-admin / store-manifest / store-icon 공용 JSON 응답 헬퍼 (license-bind.ts와 동일한 컨벤션). */
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}
