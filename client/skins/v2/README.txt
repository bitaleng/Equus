[ V2 스킨 이미지 교체 안내 ]

이 폴더에 다음 파일들을 넣으면 v2 빌드에 자동으로 적용됩니다.

필요한 파일:
  - icon-192.png   (192x192 px, PWA 아이콘)
  - icon-512.png   (512x512 px, PWA 아이콘)
  - icon-1024.png  (1024x1024 px, 스플래시 화면용)
  - favicon.png    (32x32 또는 64x64 px, 브라우저 탭 아이콘)

manifest.json 수정:
  - "name": 앱 전체 이름 (예: "스파월드 입실관리")
  - "short_name": 홈화면 아이콘 아래 표시되는 짧은 이름 (예: "스파월드")
  - "theme_color": 상단 상태바 색상 (예: "#1a3a5c")
  - "background_color": 스플래시 배경 색상 (예: "#ffffff")

.env.v2 파일 수정:
  - VITE_APP_NAME: 라이센스 인증 화면에 표시되는 앱 이름
  - VITE_APP_SHORT_NAME: 짧은 이름
  - VITE_APP_DESCRIPTION: 라이센스 인증 화면 설명 문구

빌드 방법:
  node scripts/build-and-package.js v2
  → netlify-deploy-v2.zip 생성됨
