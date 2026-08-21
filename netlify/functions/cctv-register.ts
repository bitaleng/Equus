type CctvRegistration = {
  viewerUrl?: string;
  remoteUrl?: string;
  screenUrl?: string;
  token?: string;
  event?: string;
  installationId?: string;
  timestamp?: string;
  source?: string;
  appOrigin?: string;
  installed?: boolean;
};

const ALLOWED_EVENTS = new Set([
  "stream_started",
  "token_ready",
  "stream_stopped",
  "pwa_installed",
  "first_pwa_launch",
  "app_launch",
]);

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validate(body: CctvRegistration): string | null {
  if (!isHttpUrl(body.viewerUrl) || !isHttpUrl(body.remoteUrl)) {
    return "올바른 접속 URL이 필요합니다.";
  }
  if (body.screenUrl && !isHttpUrl(body.screenUrl)) {
    return "올바른 원격화면 URL이 필요합니다.";
  }
  if (
    typeof body.token !== "string" ||
    !/^[A-Z0-9]{20}$/.test(body.token)
  ) {
    return "올바른 CCTV 토큰이 필요합니다.";
  }
  if (typeof body.event !== "string" || !ALLOWED_EVENTS.has(body.event)) {
    return "지원하지 않는 이벤트입니다.";
  }
  if (body.installationId && body.installationId.length > 100) {
    return "설치 ID가 너무 깁니다.";
  }
  return null;
}

function discordPayload(body: CctvRegistration) {
  const eventLabels: Record<string, string> = {
    pwa_installed: "PWA 설치 완료",
    first_pwa_launch: "설치된 PWA 최초 실행",
    app_launch: "앱 실행(재시작 포함)",
    stream_started: "감시 시작",
    stream_stopped: "감시 중단",
    token_ready: "접속 주소 준비",
  };

  return {
    content:
      `[CCTV] ${eventLabels[body.event || ""] || body.event}\n` +
      `토큰: ${body.token || ""}\n` +
      `오프라인 시: 설치된 앱 → /cctv/view · /cctv/remote · /screen/view 에서 토큰 입력`,
    embeds: [
      {
        title: "카운터 카메라 접속 정보",
        description: eventLabels[body.event || ""] || body.event,
        fields: [
          { name: "영상 보기", value: body.viewerUrl },
          { name: "원격 제어", value: body.remoteUrl },
          ...(body.screenUrl ? [{ name: "원격화면 (사용자 화면)", value: body.screenUrl }] : []),
          { name: "토큰", value: body.token || "없음" },
          {
            name: "설치 ID",
            value: body.installationId || "없음",
            inline: true,
          },
          {
            name: "오프라인 접속",
            value: "사이트 다운 시 설치된 PWA에서 /cctv/view · /cctv/remote · /screen/view 열고 토큰 입력",
          },
        ],
        timestamp: body.timestamp || new Date().toISOString(),
      },
    ],
  };
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const notifyUrl = process.env.CCTV_NOTIFY_URL;
  if (!notifyUrl) {
    return Response.json(
      { error: "CCTV_NOTIFY_URL is not configured" },
      { status: 503 }
    );
  }

  let body: CctvRegistration;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  try {
    const isDiscord = /disc(?:ord|ordapp)\.com\/api\/webhooks/.test(notifyUrl);
    const response = await fetch(notifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isDiscord ? discordPayload(body) : body),
    });

    if (!response.ok) {
      return Response.json(
        { error: `Notification endpoint returned ${response.status}` },
        { status: 502 }
      );
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Notification delivery failed" },
      { status: 502 }
    );
  }
}
