# 서울대학교 미술대학 80주년 · 궤적 그리기

첨부된 Figma SVG와 프로토타입 영상을 바탕으로 구현한 모바일 중심 정적 웹사이트입니다. 패키지 설치나 빌드가 필요 없습니다.

## 실행

```sh
cd /workspace/80th-Anniversary
python3 -m http.server 8001 --bind 0.0.0.0
```

브라우저로 정적 서버에 접속합니다. 배포는 기존 Vercel의 정적 사이트 구성을 사용할 수 있습니다. 촬영·공유·클립보드는 실제 휴대폰의 HTTPS 사이트에서 확인합니다.

## 화면과 기능

- 랜딩 → 8색 컬러 홈 → 사진 촬영/선택 → 그리기 애니메이션 → 완성 결과.
- 홈 배경을 좌우로 움직이면 컬러 패턴이 순환합니다. Info의 대형 화살표와 그리기·다운로드·다시하기 버튼은 지정된 팔레트에서 선택됩니다.
- 사진의 색 면적과 위치·선 구조를 분석해 8방향의 화살표 조합을 만듭니다. 색 면적 기준은 3%이며 검출이 약하면 가장 많이 검출된 색 하나, 검출색이 없는 흰색·검정색이면 기본 파랑을 사용합니다. 중간 밝기의 회색도 8색 중 하나로 분석합니다.
- 궤적+한국 시간 생성 날짜 이미지와 사진·벡터 포스터 글자가 합쳐진 이미지를 각각 1206×1560px PNG로 만듭니다.
- 이미지 다운로드 후 결과 페이지에서 사진과 궤적을 나란한 순서로 볼 수 있습니다. 결과 페이지에서도 두 PNG를 각각 저장할 수 있습니다.
- 사진(긴 변 최대 2400px JPEG), 궤적 PNG, 포스터 PNG를 IndexedDB에 자동 보관합니다. 온라인 미연결 상태는 같은 브라우저에서만 다시 볼 수 있습니다.
- Supabase 설정 후에는 세 파일을 Storage에 자동 업로드하고 데이터베이스에 결과 정보를 저장합니다. 온라인 저장 완료 후에는 다른 기기에서도 결과 링크를 열 수 있습니다.
- 모바일을 우선하며 데스크톱에서는 최대 480px의 모바일 화면을 중앙에 제공합니다.
- 짧은 효과음, 지원 기기에서 진동, 켜기/끄기, 동작 줄이기 설정을 지원합니다. iOS Safari의 웹 진동은 지원되지 않습니다.

## Supabase 연결

[설정 안내](SUPABASE_SETUP.md)에 따라 익명 로그인을 켜고 `supabase/setup.sql`을 실행합니다. 사용자 제공 공개 URL과 Publishable Key는 `supabase-config.js`에 적용되어 있습니다. 설정 전에도 사진 분석과 다운로드, 같은 브라우저의 결과 다시보기는 작동합니다. 서비스 계정이나 비공개 키는 사용하지 않습니다.

## 고정 팔레트

| 색상 | 불투명도 |
| --- | --- |
| `#0099FF` | 50% |
| `#FF0095` | 50% |
| `#C800FF` | 50% |
| `#508D47` | 70% |
| `#B8A391` | 100% |
| `#C6C7C9` | 70% |
| `#FAC119` | 100% |
| `#753245` | 70% |

## 파일

- `index.html`, `styles.css`: 화면, 모바일 레이아웃과 접근성 구조.
- `app.js`: 사진 입력, 화면 이동, 피드백, PNG 생성, 저장 UI.
- `core.js`: 사진 분석과 색·방향 계산.
- `archive.js`: IndexedDB와 Supabase REST 저장 어댑터.
- `assets/`: 제공된 SVG에서 분리한 글자·로고·화살표·처리 프레임. 예시 사진과 예시 날짜는 포함하지 않습니다.
- `supabase-config.js`, `supabase/setup.sql`: Supabase 공개 연결 설정, 테이블·이미지 버킷·접근 정책.
- `tests/`: 실제 브라우저의 로컬 생성·다운로드·기록 복구 및 색상 분석 검증.

## 검증

```sh
node --test tests/core.test.cjs
python3 tests/smoke.py http://127.0.0.1:8001
python3 tests/archive_browser.py http://127.0.0.1:8001
```

Python 브라우저 테스트는 Playwright와 `/usr/bin/chromium`을 사용합니다. 로컬 테스트는 공개 Supabase 설정을 테스트 안에서 비활성화합니다. 아카이브 테스트는 Supabase REST 요청을 모의 처리하여 업로드 중간 실패·재시도·세 파일 완료 후 결과 행 저장·새 브라우저의 결과 조회를 검사합니다. 실제 Supabase 서비스나 배포된 접근 정책 검증을 대신하지 않습니다.

SQL 문법과 접근 정책도 독립 PostgreSQL 환경에서 검증할 수 있습니다. 앱 실행에는 아래 테스트 의존성이 필요하지 않습니다.

```sh
npm install --prefix /tmp/80th-sql-tests --package-lock=false --no-audit --no-fund @electric-sql/pglite@0.3.14
NODE_PATH=/tmp/80th-sql-tests/node_modules node --test tests/sql_policies.cjs
```

이 검증은 이 앱의 SQL과 소유자/방문자 권한을 확인하며, 실제 Supabase Storage 서비스의 파일 검증이나 콘솔 적용 여부는 별도로 확인해야 합니다.

실제 Supabase 저장과 새 브라우저 조회·다운로드 검증 결과 및 테스트 자료 정리 방법은 [VERIFICATION.md](VERIFICATION.md)에 기록했습니다. 운영 사이트에는 아직 배포하지 않았습니다.
