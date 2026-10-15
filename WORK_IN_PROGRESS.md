# 수정 작업 일시 중단 기록

사용자가 노트북을 끄고 외출하기 위해 현재 작업을 중단했습니다. 돌아와서 재개 요청을 하면 아래에서 이어갑니다. 이번 수정본은 아직 검증·배포하지 않았습니다.

## 현재 기준

- 검증된 기존 미리보기 커밋: `608b15bce61e9f8f773c9f885d568c6bfcfce9d2`.
- 기존 미리보기 URL: https://80th-anniversary-create-trajectories-68rfi60ym.vercel.app
- 기존 원격 브랜치: `codex/mobile-redesign-supabase`.
- 작업 중인 수정은 별도 로컬 브랜치 `codex/mobile-revisions-wip`에 체크포인트로 저장합니다. 이 브랜치는 push하지 않습니다.
- 원격 main과 기존 미리보기는 이번 수정으로 변경하지 않았습니다.

## 사용자 결정

- 긴 세로 사진은 전체를 축소해 보여주고 그리기 버튼을 화면 안에 유지합니다.
- 공개 아카이브는 기본으로 궤적+날짜를 보이고, 호버/누르고 있기/한 번 탭 시 해당 사진을 보여줍니다. 한 번 더 탭하면 궤적으로 돌아가도록 구현 중입니다.
- 열린명조는 폰코자키로 사용 중이며 파일은 없습니다. **사용자는 무료 명조 대체를 선택하지 않고 웹폰트 정보를 확인한 뒤 적용하기로 했습니다.** 정확한 웹폰트 연결 정보가 올 때까지 임의의 다른 폰트로 완료 처리하지 않습니다.
- Panchi Mono.otf는 사용자가 제공했으며 `assets/fonts/PanchiMono.otf`에 저장했습니다.

## 변경했지만 아직 검증하지 않은 내용

- index.html: 기존 피드백 토글, 사진 바꾸기, 사진 화면 로고/저장 문구, Fin 수동 전환 버튼 제거. 링크 있는 Home 로고, 아카이브 화면 추가. 다운로드 문구 변경. 레거시 결과 상세 화면은 남김.
- styles.css: 100dvh 기반 전체 화면, 사진 비율 유지/긴 사진 축소, 버튼-사진 간격, 아카이브 6칸 페이지 레이아웃, 반응형 Info 축소 처리용 구조. Playfair Display 500 Italic과 Panchi Mono font-face 추가.
- assets/landing.svg: 글자 일부를 HTML로 옮기고 5개 화살표에 낙하 애니메이션 클래스 추가. app.js에서 랜덤 팔레트 적용.
- app.js: Home 2초 컬러 교체, Fin 800ms 이미지 교대(동작 줄이기에서는 정지), 버튼 hover/tap/drag 랜덤 컬러, 진동 API 호출, 첨부 녹음의 짧은 구간만 재생하는 WebAudio 구현. 아직 실제 청취/기기 검증하지 않음.
- 사진 선택은 showOpenFilePicker 지원 시 사용하고 그 외 type=file로 fallback. iOS Safari의 소스 선택 메뉴를 사이트 코드로 강제 생략할 수 없다는 제약을 정확히 보고해야 함.
- 날짜는 SVG 텍스트 대신 Panchi Mono를 로드한 Canvas에서 그리도록 변경. 실제 PNG 검증 필요.
- 새 아카이브 UI는 `archive.onlineList()`와 `archive.localList()`를 호출하지만 **archive.js에는 아직 구현하지 않았습니다.** 화면 동작 완료로 주장하지 않습니다.

## 새로 저장한 사용자/공식 자료

- `assets/audio/revolver-spin.mp3`: 사용자 제공 원본 사운드, 약 3.336초.
- `assets/audio/cues.json`: 분리된 타격음 후보 시작/길이. app.js에도 동일한 cue 배열이 있음.
- `assets/back-button.svg`: 첨부 Back Button.svg의 첫 화살표를 잘라 currentColor로 적용. HTML에도 동일한 path를 inline으로 사용.
- `assets/logo-*.svg`: 기존 로고를 각 링크용 viewBox로 분리.
- `assets/fonts/PlayfairDisplay-Italic.ttf`, `PlayfairDisplay-LICENSE.txt`: Google Fonts 공식 저장소의 variable italic 폰트와 라이선스.

## 재개 후 남은 작업

1. 브라우저에서 현재 UI를 먼저 실행해 런타임 오류/레이아웃 확인. 특히 문서 크기보다 큰 내부 콘텐츠를 숨겨 자른 것만으로 스크롤 없음이라고 판단하지 말 것.
2. 아카이브 adapter 목록 조회/로컬 목록 구현. 공개 목록은 사진과 궤적만 반환하고 기존 owner-only 테이블 정책은 유지. Supabase SQL에 안전한 목록 RPC와 필요하면 archive_public 컬럼을 추가할 별도 migration 준비 및 독립 PostgreSQL 테스트.
3. 기존 공유 전용 기록을 자동으로 공개 목록에 포함하지 않는 방향 검토. 신규 생성물부터 공개 아카이브에 모으되 SQL이 아직 적용되지 않았다면 기존 3장 저장이 깨지지 않도록 처리.
4. 목록 API는 관리자 키 없이 가능한 조회만 구현. SQL 적용은 사용자의 콘솔 권한이 필요하므로 파일을 테스트한 뒤 정확히 안내. 공개 키로 SQL 실행을 시도하지 말 것.
5. gallery hover/hold/tap, 작은 화면/가로 화면, 긴 사진, 버튼 드래그 시 파일 선택 억제, 800ms 교대/2초 랜덤, 사운드 cue/진동을 테스트.
6. tests/smoke.py와 tests/archive_browser.py는 이전 UI 기준이라 현재 셀렉터/흐름에 맞춰 갱신 필요. 현재 수정본의 테스트 통과를 주장하지 말 것.
7. 열린명조 웹폰트 정보를 받으면 적용. Playfair Medium Italic의 실제 로드와 모든 관련 UI 폰트 확인. iPhone Safari 진동은 지원되지 않으므로 미리보기 문제라고 오해하지 않게 설명.
8. 최종 검증 후 검증된 작업만 기존 preview 브랜치로 반영해 새 Vercel Preview URL 확인. main에 자동 병합/운영 배포하지 않음.

현재 확인한 것은 `git diff --check`, `node --check app.js`, `node --check archive.js` 통과뿐입니다. 아직 브라우저 회귀 테스트를 실행하지 않았습니다.
