# 오프라인 라이선스 시스템 가이드

## 개요

He's / EQUS 입실관리매니저는 **서버 없이** 동작하는 오프라인 라이선스 시스템을 사용합니다.
인터넷 연결이나 라이선스 서버 없이도 키 유효성 검사가 클라이언트 측에서만 이루어집니다.

---

## 라이선스 키 형식

```
EQUS-XXXX-XXXX-XXXX    (V1 에쿠스)
HIZZ-XXXX-XXXX-XXXX    (V2 히즈)
```

| 세그먼트 | 내용 |
|----------|------|
| `EQUS` / `HIZZ` | 스킨 식별자 |
| `XXXX` (2번째) | 고객 코드 (4자리) |
| `XXXX` (3번째) | 만료일 인코딩 (36진수) |
| `XXXX` (4번째) | HMAC-SHA256 서명 앞 8자리 |

---

## 라이선스 키 생성 방법

1. `license-generator.html` 파일을 **로컬에서** 브라우저로 엽니다
   - 인터넷 연결 불필요
   - 더블클릭으로 실행 가능
2. 고객 코드 입력 (예: A001)
3. 만료일 선택
4. 스킨 선택 (V1 에쿠스 / V2 히즈)
5. 생성 버튼 클릭 → 라이선스 키 복사

---

## 라이선스 검증 원리

```
서명 대상 데이터 = "고객코드" + "만료일(인코딩)"
서명 = HMAC-SHA256(데이터, 내장_시크릿).앞8자리.대문자
```

- 시크릿 키는 `client/src/lib/licenseValidation.ts` 내부에 난독화되어 있습니다
- 동일한 시크릿이 `license-generator.html`에도 포함됩니다
- 서버 호출 없이 브라우저에서 직접 검증합니다

---

## 데모(체험) 모드 — 사이트 분리

정식 Netlify 사이트와 **체험 전용 Netlify 사이트**를 분리합니다.

### 정식 빌드 (`netlify-v1.zip` / `netlify-v2.zip`)
- 라이선스 키 필수
- `?demo=true` 를 붙여도 체험 모드로 진입되지 않습니다

### 체험 빌드 (`netlify-v1-demo.zip` / `netlify-v2-demo.zip`)
```powershell
.\build-netlify.ps1 -Skin v1 -Demo
.\build-netlify.ps1 -Skin v2 -Demo
```
- 별도 Netlify 사이트에만 배포
- 접속만 하면 7일 체험 (비밀번호 `12345678`)
- PWA 홈 화면 설치 차단
- Discord CCTV 자동 전송·라이선스 생성기 제외
- 매장 상시 운영용으로 사용 불가

---

## 만료 경고

라이선스 만료 30일 전부터 경고 메시지가 표시됩니다.

---

## 주의사항

- `license-generator.html`과 `licenseValidation.ts`의 시크릿은 절대 외부에 공개하지 마세요
- 시크릿이 유출되면 누구든 유효한 라이선스 키를 생성할 수 있습니다
- 유출 시 `licenseValidation.ts`와 `license-generator.html` 양쪽의 시크릿을 동시에 변경해야 합니다
