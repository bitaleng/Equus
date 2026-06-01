---
name: IndexedDB storage migration
description: saveDatabase() was blocking UI with LZString compression; migrated to async IndexedDB storage
---

# IndexedDB 저장소 전환

## 배경
`saveDatabase()`가 LZString 압축(동기, CPU집약)으로 메인 스레드를 1-2초 블로킹.
버튼 hover 색상 변경조차 지연되는 증상 발생.

## 해결 방법
- PRIMARY: IndexedDB (`hotel_idb`) - 비동기, binary 직접 저장, 압축 불필요
- FALLBACK: localStorage (LZString 압축) - IndexedDB 실패 시 (사생활 보호 모드 등)
- BEFOREUNLOAD: 페이지 닫힐 때만 localStorage 동기 저장 (안전망)

## 초기화 순서
1. IndexedDB에서 로드 시도
2. 없으면 localStorage에서 로드 (기존 사용자 자동 마이그레이션)
3. 없으면 새 DB 생성

**Why:** localStorage + LZString은 동기 API라 DB 크기에 비례해 UI를 블로킹. IndexedDB는 비동기라 메인 스레드를 점유하지 않음.

**How to apply:** `_saveToIDB()`, `_loadFromIDB()` 헬퍼 함수 사용. `saveDatabase()`는 fire-and-forget. 새 기능에서 DB 저장이 필요하면 `saveDatabaseDebounced()` 호출.
