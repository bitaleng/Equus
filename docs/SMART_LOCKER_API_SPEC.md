# 스마트 락커 하드웨어 API 규격서

## 개요

이 문서는 휴게텔 입실관리 시스템과 스마트 락커 하드웨어 컨트롤러 간의 통신 규격을 정의합니다.

**시스템 구성:**
```
[락커 하드웨어] ←→ [하드웨어 컨트롤러] ←→ [서버] ←→ [관리자 앱]
                         ↑
                    이 문서의 대상
```

---

## 1. 연결 정보

### 서버 주소
- **REST API**: `https://{서버주소}/api/`
- **WebSocket**: `wss://{서버주소}/ws/devices`

### 인증 방식
모든 API 요청은 **HMAC-SHA256 서명**으로 인증됩니다.

---

## 2. 인증 헤더

모든 API 요청에 다음 헤더를 포함해야 합니다:

| 헤더 이름 | 설명 | 예시 |
|-----------|------|------|
| `X-Device-Id` | 등록된 디바이스 ID | `locker-controller-01` |
| `X-Timestamp` | Unix 타임스탬프 (밀리초) | `1701936000000` |
| `X-Signature` | HMAC-SHA256 서명 | `a1b2c3d4e5...` |

### 서명 생성 방법

```
메시지 = 디바이스ID + 타임스탬프 + 요청본문(JSON)
서명 = HMAC-SHA256(메시지, 공유비밀키)
```

**예시 (의사코드):**
```javascript
deviceId = "locker-controller-01"
timestamp = "1701936000000"
body = '{"lockerNumber":1,"eventType":"key_removed"}'
sharedSecret = "your-secret-key-here"

message = deviceId + timestamp + body
// message = "locker-controller-011701936000000{\"lockerNumber\":1,\"eventType\":\"key_removed\"}"

signature = HMAC_SHA256(message, sharedSecret)
// signature = "a1b2c3d4e5f6..."  (16진수 문자열)
```

**주의사항:**
- 타임스탬프는 서버 시간 기준 ±5분 이내여야 함
- 요청 본문이 없는 경우 빈 문자열 `{}` 사용

---

## 3. 디바이스 등록

하드웨어 컨트롤러를 사용하기 전에 관리자가 앱에서 등록해야 합니다.

**등록 시 필요한 정보:**
| 항목 | 설명 |
|------|------|
| 디바이스 ID | 고유 식별자 (예: `locker-ctrl-floor1`) |
| 디바이스 이름 | 표시용 이름 (예: `1층 락커 컨트롤러`) |
| IP 주소 | 선택사항 |
| 공유 비밀키 | HMAC 인증용 비밀키 (32자 이상 권장) |

---

## 4. REST API 엔드포인트

### 4.1 하트비트 (Heartbeat)

컨트롤러가 온라인 상태임을 서버에 알립니다. **30초마다** 호출 권장.

```
POST /api/devices/{deviceId}/heartbeat
```

**요청 본문:**
```json
{
  "status": "online",
  "firmwareVersion": "1.0.0",
  "lockerCount": 40
}
```

**응답:**
```json
{
  "success": true,
  "serverTime": "2024-12-07T04:00:00.000Z"
}
```

---

### 4.2 이벤트 보고

락커 상태 변화를 서버에 보고합니다.

```
POST /api/devices/{deviceId}/events
```

**요청 본문:**
```json
{
  "lockerNumber": 15,
  "eventType": "key_removed",
  "timestamp": "2024-12-07T04:05:30.000Z",
  "metadata": {}
}
```

**이벤트 타입 목록:**

| eventType | 설명 |
|-----------|------|
| `door_opened` | 락커 문이 열림 |
| `door_closed` | 락커 문이 닫힘 |
| `key_inserted` | 열쇠가 삽입됨 |
| `key_removed` | 열쇠가 제거됨 |
| `lock_engaged` | 잠금 장치 활성화 |
| `lock_released` | 잠금 장치 해제 |
| `error` | 오류 발생 |

**응답:**
```json
{
  "success": true,
  "eventId": 12345
}
```

---

### 4.3 명령 폴링

서버에서 대기 중인 명령을 가져옵니다. **5초마다** 호출 권장.

```
GET /api/devices/{deviceId}/commands/pending
```

**응답:**
```json
{
  "commands": [
    {
      "id": 101,
      "lockerNumber": 15,
      "commandType": "unlock_shoe",
      "issuedAt": "2024-12-07T04:10:00.000Z"
    }
  ]
}
```

**명령 타입 목록:**

| commandType | 설명 |
|-------------|------|
| `unlock_shoe` | 신발 락커 잠금 해제 |
| `lock_shoe` | 신발 락커 잠금 |
| `unlock_wardrobe` | 옷장 락커 잠금 해제 |
| `lock_wardrobe` | 옷장 락커 잠금 |
| `lock_all` | 모든 락커 잠금 |
| `sync_state` | 상태 동기화 요청 |

---

### 4.4 명령 완료 보고

명령 실행 결과를 서버에 보고합니다.

```
POST /api/devices/{deviceId}/commands/{commandId}/complete
```

**요청 본문 (성공):**
```json
{
  "status": "completed",
  "executedAt": "2024-12-07T04:10:05.000Z"
}
```

**요청 본문 (실패):**
```json
{
  "status": "failed",
  "errorMessage": "Lock mechanism jammed",
  "executedAt": "2024-12-07T04:10:05.000Z"
}
```

---

### 4.5 락커 상태 동기화

모든 락커의 현재 상태를 서버에 보고합니다.

```
POST /api/devices/{deviceId}/sync
```

**요청 본문:**
```json
{
  "lockers": [
    {
      "lockerNumber": 1,
      "lockState": "locked",
      "doorState": "closed",
      "hasKey": true
    },
    {
      "lockerNumber": 2,
      "lockState": "unlocked",
      "doorState": "open",
      "hasKey": false
    }
  ]
}
```

**상태 값:**

| 필드 | 가능한 값 |
|------|----------|
| `lockState` | `locked`, `unlocked` |
| `doorState` | `closed`, `open` |
| `hasKey` | `true`, `false` |

---

## 5. WebSocket 연결 (선택사항)

실시간 명령 수신을 위해 WebSocket 연결을 사용할 수 있습니다.

### 연결
```
wss://{서버주소}/ws/devices?deviceId={디바이스ID}&signature={서명}
```

### 서버 → 컨트롤러 메시지

**명령 전송:**
```json
{
  "type": "command",
  "data": {
    "id": 101,
    "lockerNumber": 15,
    "commandType": "unlock_shoe"
  }
}
```

### 컨트롤러 → 서버 메시지

**이벤트 보고:**
```json
{
  "type": "event",
  "data": {
    "lockerNumber": 15,
    "eventType": "key_removed",
    "timestamp": "2024-12-07T04:05:30.000Z"
  }
}
```

**하트비트:**
```json
{
  "type": "heartbeat",
  "data": {
    "status": "online"
  }
}
```

---

## 6. 락커 운영 흐름

### 입실 과정
```
1. 관리자가 앱에서 손님 입실 처리
2. 서버가 unlock_shoe 명령 발행
3. 컨트롤러가 신발 락커 잠금 해제
4. 손님이 열쇠 꺼냄 → key_removed 이벤트
5. 서버가 lock_shoe 명령 발행 (빈 락커 잠금)
6. 손님이 옷장 사용 후 열쇠 반납
```

### 퇴실 과정
```
1. 관리자가 앱에서 퇴실 처리
2. 서버가 unlock_wardrobe 명령 발행
3. 손님이 옷장에서 짐 꺼냄
4. 손님이 신발 락커에 열쇠 반납 → key_inserted 이벤트
5. 서버가 lock_all 명령 발행
```

---

## 7. 오류 코드

| 코드 | 설명 |
|------|------|
| 401 | 인증 실패 (서명 오류, 타임스탬프 만료) |
| 404 | 디바이스 또는 락커를 찾을 수 없음 |
| 409 | 명령 충돌 (이미 처리된 명령) |
| 500 | 서버 내부 오류 |

---

## 8. 하드웨어 요구사항

### 필수 기능
- [ ] HTTPS/WSS 통신 지원
- [ ] HMAC-SHA256 서명 생성
- [ ] JSON 파싱/생성
- [ ] 실시간 시계 (NTP 동기화 권장)

### 권장 사양
- WiFi 또는 이더넷 연결
- 비휘발성 메모리 (설정 저장용)
- 워치독 타이머 (자동 복구)

---

## 9. 연락처

기술 문의: [여기에 연락처 기입]

문서 버전: 1.0
최종 수정: 2024년 12월
