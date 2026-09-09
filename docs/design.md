# 디자인 근거와 구현 규칙

확인일: 2026-09-09. 출처 유형: **[원본]** 실제 Figma 노드/변수, **[문서]** 원본의 설명 텍스트, **[결정]** 구현에서 선택한 규칙.

## 원본 위치
[Pulsemetry Admin Console](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=1-4)

| 페이지 | ID | 구현 대상 프레임 |
|---|---|---|
| Foundations | 0:1 | 5:2; 색 5:6, 의미 6:2, 타이포 6:55, 간격 6:110 |
| Components | 1:2 | Badge 7:39, Button 8:48, IconButton 8:65, Switch 9:16, ProductToggle 9:23, SegmentItem 9:36, Tab 9:49, NavItem 10:21, KPICard 11:99, StatBlock 11:160, HeatmapCell 12:52, TableCell 12:77, TableHeaderCell 12:82, WidgetCard 13:79, FindingCard 14:55, Alert 14:68, StepperStep 14:97, ScenarioCard 15:87, SideNav 16:94, 전체 시트 62:80 |
| P1 개요 | 1:3 | 기본 19:4, 시나리오 결과 58:42, 저장 모달 60:80 |
| P2 팀 분석 | 1:4 | 마찰① 39:4, ② 44:22, ③ 44:1011, ④ 44:2011, 마스킹 45:94, 1024px 47:94 |
| P3 운영·보안 | 1:5 | 안정성 32:4, 컴플라이언스 32:93, 보안 32:182, 검색 전 32:271, 사유 모달 66:4, 조회 결과 67:4 |
| P4 시나리오 | 1:6 | 카탈로그 51:4, 비용 드로어 52:4, 예산 드로어 53:4, 실행 52:425, 실패 52:812, 첫 방문 54:4, 로딩 54:369, 이력 56:4, 준비 중 57:4 |
| P5 설정 | 1:7 | 조회 전용 28:4 |
| Widget States | 1:8 | 61:4 |

전체 계층은 reference/figma-*.xml에 보관. 하위 위젯 구현 전 get_design_context로 정확한 노드를 다시 읽는다. 거대한 프레임은 메타데이터로만 반환되므로 이를 코드 근거로 사용하지 않는다.

## 토큰·치수
- [원본] Pulsemetry 변수 컬렉션 VariableCollectionId:2:2, Light 2:0 / Dark 2:1.
- [원본] 46개 COLOR, FLOAT 간격/모서리/컨트롤/치수, STRING 폰트. 전체 값은 reference/figma-variables.json, CSS는 src/styles/tokens.css. `/`를 `-`로 바꾼 CSS 변수명으로 1:1 대응.
- [원본] misc/on-inverse는 surface/card 별칭. 테마별 실제 카드 색으로 해석한다.
- [원본] 배경 Light #f6f7f9 / Dark #0f1115, 카드 #ffffff / #171a21, 보더 #e2e5ea / #2a2f3a.
- [원본] 파랑 사용량/활동, 보라 공시 비용·연보라 계약, 초록 산출, 주황 마찰/대기, 빨강 이상/실패/위반, 회색 미관측/마스킹/준비 중.
- [원본] 1440px 화면, sidebar 240px, collapsed 56px, toolbar 56px, coverage 28px. 1024px P2에서 toolbar 83px.
- [문서] 12컬럼·16px 거터, 최대1440/최소1024. 카드 패딩16·radius8·border1·그림자 없음. focus 2px blue, offset2.
- [원본] Button 높이26/30/32/36, radius6. primary 배경 text/1·글자 surface/card. secondary 카드 배경/보더, ghost 링크형, disabled gray-tint.
- [원본] KPICard 기본 너비190, padding16, gap6, 주값30/1.1/-2%, label12. 위젯 제목13, caption11. KPI 증감 good=green, bad=red, neutral=gray, compare 없음=미표시.
- [원본] WidgetCard padding16/gap10/radius8. highlighted는 blue2px 및 앞 배치, dimmed는 opacity .3. 상태별 body 슬롯과 caption 유지.

## 폰트 불일치와 확정
- [문서] Foundations에는 “42dot Sans (Pretendard 프록시)”라고 적혀 있다.
- [원본] font/ui 변수는 Pretendard, 실제 11:11 노드 fontName은 Pretendard Regular, weight400, size30. get_design_context도 weight400을 반환한다. `sb`라는 스타일 이름만으로 600을 추정하지 않는다.
- [결정] 계획 당시의 42dot Sans 대신 실제 노드와 일치하는 Pretendard를 로컬 npm 패키지로 제공한다. IBM Plex Mono도 로컬 제공. 제목은 확인 화면 구성상600, 원본 KPI는400.

## 반응형
- [원본] P2 1440과1024 두 기준이 존재. 1024는56px 내비·두 줄 툴바.
- [결정] 제품 셸 1280 이상 펼침,768–1279 접힘.1280 분기점은 추정.768–1023 KPI2열/차트1열/표 내부 스크롤.768 미만 안내. 이는 1단계 이후 제품 화면 규칙이다.
- [결정] 0단계 확인 화면은 별도 개발용 구성이다.1440에서40px 바깥 여백,1024에서24px. KPI 원본 비교용190px 4열,768–1023에서2열. 상태 예시 카드는4열→2열. 개발용 확인 화면을 P1/P2 원본으로 오인하지 않는다.

## 0단계 구현·검증 범위
- 토큰 전체, 기본 Button/Badge/InfoTip/KpiCard/WidgetCard/WidgetState 구현. Badge는 기본 의미색 API이며 전체 원본16변형은 각 제품 단계에서 확장한다.
- 원본의 `i`, `⋯` 등 텍스트 글리프는 텍스트로 취급한다. 현재 구현은 이미지/벡터 아이콘을 사용하지 않으며 임의 SVG를 만들지 않았다.
- 확인 화면 문구·배치는 [결정]이며 원본 KPI 크기/색/폰트/간격을 비교 대상으로 한다.
- retry는 확인 화면에서 error→empty로 전환하는 예시이며 실제 API 재시도가 아니다.
- 실제 대시보드, 앱 셸, API와 차트는 미구현. 주요 시각 비교 결과는 검수 후 아래와 progress에 기록한다.

## 0단계 시각 검수 결과
- 원본: reference/kpi-figma.png (11:99,880×304). 구현: validation/kpi-light.png와 desktop-light.png. Light/Dark 및768px 캡처를 직접 확인했다.
- 너비190px/패딩16px/radius8px, 텍스트·의미색·비교 없음/이중 값 구성이 일치한다. 겹침이나 잘린 텍스트 없음.
- 원본 단일 KPI 높이111px, 브라우저113.78px. 브라우저 보더/폰트 메트릭에 따른 약2.8px 차이는 잔여 미세 차이로 남긴다. 원본 명시 패딩과 줄 높이를 임의로 줄이지 않았다.
- 숫자117의 너비는 원본 렌더 이미지보다 넓다. Foundations에 명시된 tabular-nums를 브라우저에 적용한 결과이며 숫자 자리수 정렬을 유지한다.
- 실제 노드에 맞는 Pretendard를 로컬 제공하여 시스템 대체 폰트 영향을 제거했다. 불필요한 전 굵기/WOFF 폰트를400·500·600 WOFF2와 mono Latin으로 줄였다.
- 확인 화면의 자체 배치는 제품 원본 비교 대상이 아니다. P1/P2 전체 화면 비교는 해당 구현 단계에서 수행한다.

## 1단계 셸 — 근거와 확정값
- [원본] get_design_context로 실제 P2 SideNav [39:5](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=39-5), FilterToolbar [39:38](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=39-38), CoverageStrip [39:82](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=39-82)를 확인. 추출 코드·이미지는 reference/shell-39-*.txt/png.
- [원본] 내비 항목 높이34, 간격2, 좌우8, radius6, 글리프14px/테두리1.5px. 로고는20px/radius5의 파란 사각형. 원본이 CSS box로 제공한 도형을 그대로 구현했으며 임의 SVG 아이콘을 추가하지 않았다.
- [원본] 펼친 사이드바240, 헤더52, 툴바56, 커버리지28. 기간 세그먼트173.2, 날짜108.3, 부서/모델80.3, 제품113.5/70.1, 단가73.5, 질문107.4, 새로고침113.6px. 공통 컨트롤 높이30.
- [원본] 원본 비교 select는 빈 상자로 제공됨. [결정] 없음/직전 기간/전주를 API enum에 맞게 채웠다. native select 팝업과 날짜 편집 패널은 구현 선택이며 별도 Figma 원본이 없다.
- [결정] 로그인·미구현 페이지 안내·커버리지 상세 설명·개발용 API 검사 화면은 기존 토큰을 사용한 자체 구성이다. 대시보드 완료 화면으로 취급하지 않는다.
- [결정] 시나리오의 숫자12는 카탈로그 구현 전 표시하지 않는다. CSV는 페이지별 데이터 구현 전 비활성. 원본 하단에 로그아웃·목업 표기를 추가했다.
- [결정] 테마는 localStorage, 인증은 메모리. 재로드 시 로그인이 필요하고 보호 경로/필터는 로그인 후 복원한다.
- [결정] 자동 새로고침은 기본 꺼짐/5분. 상대 기간의 해석은 API에 맡긴다. 사용자 지정 종료 날짜는 KST 자정 미포함. 선택 제품은 최소1개이며 둘 다 선택하면 API 빈 배열(전체). 부서·모델 UI는 단일 선택, 계약 배열 형식은 유지한다.
- [결정] 마지막 적재 시각은 실제 시각인 KST 날짜/시간으로 표시한다. 원본의 정적 “3분 전” 문구를 현재 시각처럼 표시하지 않는다.
- [결정] 1280 이상240px(수동56px 접기 가능),768–1279는56px.1024에서 툴바2줄/83px,768에서는 내용에 따라 더 줄바꿈한다.768 미만 안내는 앱 공통에서 한 번만 표시한다.

## 1단계 시각 검수
- source shell 이미지와 validation/phase-1/desktop-light.png·desktop-dark.png·viewport-1024.png·viewport-768.png를 비교.
- 내비 위치·선택 상태·중립색·제품 파랑·컨트롤 높이를 맞췄다. 초기 구현에서 기간/모델/단가 컨트롤 너비가 원본과 달라 원본 수치로 수정했다.
- 데스크톱 측정은 phase-1/results.json에 보관한다. 본문은 준비 중 안내로서 이번 비교는 셸에 한정한다.
- 남은 미세 차이: native select 화살표/팝업, 날짜·비교 텍스트 메트릭, 원본과 다른 로그인 사용자 및 적재 시각, 실제 viewport 하단에 붙는 계정 영역. 전체 P2 비교는2–3단계에서 수행한다.

## 2단계 P2 기본 영역 — 원본과 구현 선택
- [원본] P2 본문40:4. KPI40:21/33/45/57/69, 세션40:81, 프롬프트 분포40:116, 시간대41:4, 산출42:4, 비용42:83, 토큰42:186. get_design_context의 코드·설명을 reference/p2-*.txt로 보관했다. 전체 원본 캡처는 p2-desktop.png와 p2-tablet.png.
- [원본] 1440에서 본문 x240, 안쪽 좌우24, 제목 y20/h32, KPI y68/w217.6/h135.7(5열), 간격16. 1행 차트373.3×274.4(3열), 산출/비용568×437.2(2열), 토큰568×326.3. 카드 패딩16/보더1/radius8, 제목13/본문12/캡션11은 기존 공통 컴포넌트를 재사용한다.
- [원본] 세션 도넛120×120(외경 약108, 내경76), 범례 fresh/resume/continue/agents_view. 히스토그램 버킷1,2–3,4–7,8–15,16+, 중앙값4/p90 14. 비용4개 분해 차원, 토큰4개 누적 시리즈와 비율 보조 영역.
- [원본] 1024의47:168 본문을 확인하면 KPI와 모든 차트가 **1열**이다. KPI920×135.7, 세션47:245는920×218, 산출49:94는920×291.9. 앞서 적었던 768–1023 KPI2열 가정은 폐기한다.
- [결정] 1280 이상 KPI5열/차트3열·2열,768–1279는 모두1열. 1280 분기점과768 지원은 구현 선택이다. 긴 제목/툴바는 줄바꿈, 숫자 표는 카드 내부 스크롤. 768 미만 안내는 유지한다.
- [결정] API에는 부서 안 하위팀 계층이 없으므로 원본의 결제 코어/정산/결제 플랫폼을 임의 계층으로 만들지 않았다. META-FILTERS의 실제 접근 가능 팀을 선택하며 헤더 부서 필터와 같은 URL team_ids를 사용한다. 정산 n<5 팀 사례 및 상세 마찰은3단계 범위다.
- [결정] 원본의 정적 그래프 이미지는 숫자를 바꿀 수 없으므로 데이터 차트는 Recharts로 렌더한다. 원본 삭제 막대 빗금 SVG만 정확한 바이트로 public/assets/output-stripes.svg에 보관해 차트 패턴에 사용한다. 직접 만든 아이콘/SVG 경로는 없다. 빗금 에셋은 원본 light 초록이며 dark에서도 동일 색이다.
- [결정] 열 지향 DataFrame의 실제 수치로 도넛/히스토그램/누적/면적·복합 차트와 데이터 표를 만든다. 히트맵은 원본의 오른쪽 시간 잘림을 반복하지 않고 7×24 전체를 보여준다. 셀 hover·클릭·키보드 접근으로 값을 읽는다. 원본 빨간 429 표시에는 이번 단계의 오류 데이터가 없으므로 표시하지 않는다.
- [결정] 산출은 전역 종료일 기준 **완료된 최근8주**(KST 월요일 자정 경계), 나머지는 전역 기간. from/to를 명시적으로 바꿔 조회하고 부서·제품·모델·단가는 유지한다. UI 제목에 기간 예외를 표시한다.
- [결정] 차트 메뉴는 해당 위젯 새로고침과 데이터 표 보기/숨기기를 제공한다. 표는 마스킹·분모0·미관측을 숫자0과 구분한다. SQL/개인 상세 메뉴를 임의로 추가하지 않는다.
- [결정] 비교가 없으면 KPI 증감을 숨긴다. 비교값은 API의 *_compare 필드이며 도입률 차이는 pt, 비용·시간은 상대%, 인원은 명으로 계산한다. 원본의 반올림된 +8.4pt 대신11/12−10/12의 실제 계산값 +8.3pt를 표시한다.

## 2단계 시각 검수
- 원본 desktop/tablet와 실행 화면 validation/phase-2/desktop-light.png, desktop-dark.png, viewport-1024.png, viewport-768.png를 직접 비교했다.
- 1440 KPI x264/y152/w217.6/h136, 세션 행 x264/y304/w373.3/h274.4, 산출/비용568×437, 토큰568×326으로 원본과 약1px 이내의 카드 배치를 맞췄다. 측정은 phase-2/results.json.
- 첫 비교에서 세션 행 높이286, 음수 삭제 막대 누락, 목요일 주간 경계, 차트 범례/캡션 위치 차이를 발견했다. 세션 본문164.5px, sign 누적, KST 월요일, 헤더 범례와 차트 직후 캡션으로 수정했다.
- 남은 차이: API 팀 명칭/합성 시계열 모양, Recharts 자동 눈금·툴팁·숫자 폭, 히트맵24시간 압축, 개인 보호 후속 영역 안내. 1024 원본의 일부 잘린 텍스트는 줄바꿈으로 처리한다. 3단계 위젯은 완료 화면으로 가장하지 않는다.

## 3단계 P2 상세 — 원본과 구현 선택
- [원본] get_design_context 확인: 마찰 [42:224](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=42-224), 자동 승인 [44:972](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=44-972), 대기 [44:1961](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=44-1961), 거절 [44:2961](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=44-2961).
- [원본] 기능 채택 [43:22](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=43-22), 압축 [43:134](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=43-134), 품질 [43:182](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=43-182), 작은 팀 [45:1054](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=45-1054). 원문 코드는 reference/p3-*.txt에 보관.
- [원본] 1440 기준 마찰568×326.3, 기능762.7×360.6, 압축373.3×360.6, 품질1152×318.5. 기능/압축 y1389.7, 품질 y1766.3(전역 셸84 포함). 마찰 탭32px, 언어 표 헤더29.9/행30.4px, 주값28/압축22px, 최소 팀 화면1152×480/제목16px.
- [원본] 자동 승인 config+hook, 권한 대기 accept/reject의 p50→p90(평균 없음), 거절 user/config/hook 분리. 원본 빗금 SVG를 public/assets/friction-stripes.svg에 보관하여 원래640×360 크기로 재사용한다. 임의 벡터를 만들지 않았다.
- [원본] 기능은 MCP 표와 미수집 스킬/플러그인, 명령 비중, 도구 액션7종. 품질은 오류 상위8, 도구 실패율, org MCP만. project/user 서버의 실패율을 품질에 포함하지 않는다.
- [결정] 기존 WidgetCard/Badge/WidgetState/Result/DataTable와 API 프레임 변환을 재사용. 위젯 래퍼를 Widget.tsx로 추출했다. Radix 탭은 좌우/Home/End로 선택하며 로딩 중에도 탭 목록을 유지해 포커스를 잃지 않는다. 탭별 요청·캐시를 분리한다.
- [결정] 마찰 높이는 토큰 행의326px을 유지하여 탭 전환 때 아래 배치가 크게 흔들리지 않게 한다. 거절 데이터 표를 펼치면 카드가 늘어날 수 있다. 원본의 작은 Shell 행은 숫자 전체를 n<5로 가린다(원본 자동 승인 셀의 —보다 보수적).
- [결정] 1280 이상 기능/압축4:2열, 품질6열 전체.768–1279는 카드1열. 품질 내부는1024에서3영역,768에서는 MCP를 다음 행으로 배치. 표는 내부 스크롤, 장문은 줄바꿈한다. 해당 내부 분기와768 규칙은 구현 선택이다.
- [결정] 작은 팀은 모든 KPI/위젯을 제거한 안내와 정책 펼치기를 제공한다. API에 부모 부서 ID가 없으므로 원본의 ‘상위 부서’ 링크 대신 권한 범위 내 전체 팀으로 복귀한다. 새 ‘정산’은 목업의 독립 팀이며 하위 계층을 의미하지 않는다.
- [문서/결정] API의 압축 절감률은 1−Σafter/Σbefore이다. 원본 ‘평균 절감률’ 문구를 ‘토큰 합계 기준 절감률’로 정정했다. 평균 p50/p90 등 다른 집계를 추정하지 않는다. 대기 축은 최장 p90에 따라15초 단위로 확장한다.

## 3단계 시각 검수
- reference/p2-desktop.png 및 상세 get_design_context 이미지와 validation/phase-3의 desktop-light/dark, friction-0/1/2/3, features, compaction, quality, small-team 및1024/768 화면을 비교했다.
- 탭 포커스 소실, 빗금/압축 색상, 대기 박스와 시간 축 정렬, 압축 오른쪽 라벨 잘림을 수정했다. 기능 카드 초기381px·품질325px을 표/행 간격으로 줄였다. 최종 실제 수치는 phase-3/geometry.json.
- 남은 미세 차이: 합성 시계열/자동 눈금, 브라우저 폰트 숫자 폭, 표와 캡션 줄바꿈, 확장 가능한 거절 표, dark에서도 원본 light 주황 빗금. 원본 고정 부서 계층 대신 API 팀 선택·권한 범위 복귀. 실제 서버의 데이터 값/분포와 비교한 검수가 아니다.

## 4단계 P1 개요 — 원본과 구현 선택
- [원본] 기본 화면 [19:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=19-4). `get_design_context` 확인 노드: KPI 21:13/25/37/49/61/72, 비용 추세23:4, 팀별 비용23:40, 모델24:6, 산출24:49, 도입률25:24, 신뢰26:42, 헬스26:60, 거버넌스26:90. 코드/맥락14개는 reference/p4-*.txt, 전체 원본은 p1-desktop.png.
- [원본] 1440px 본문 x264/폭1152, 헤더 y104/높이26.1. KPI6열 폭178.7/높이163.5/y146.1. 비용 행762.7+373.3/높이321.9/y325.6. 모델/산출373.3+762.7/높이301.9/y663.5. 도입률1152×331.9/y981.4. 마지막3카드373.3×265.7/y1329.2. 간격16, 카드16px 패딩/radius8, 기존 토큰·Pretendard400·공통 KpiCard/WidgetCard 재사용.
- [원본] 모델 도넛132px, 신뢰 스파크110×36, 헬스 스파크44px, 도입률 셀높이32/간격4/radius4. 공시 실선·계약 점선·비교 연한 점선, 이상점 빨강. 도입률 색 구간 <45/45–55/55–65/65–75/≥75%. 작은 팀은 고정 길이 회색 빗금.
- [원본/결정] 회색 빗금 SVG 정확한 바이트를 public/assets/masked-stripes.svg에 보관. 초록 삭제 빗금은 기존 output-stripes.svg를 재사용. 데이터 차트는 원본 정적 SVG 대신 기존 Recharts로 실제 응답값을 렌더한다. UI 아이콘은 기존 공통 글리프/박스를 재사용하며 임의 벡터를 만들지 않았다.
- [결정] Widget/Result/DataTable을 src/widgets/Widget.tsx로 공용화. 헤더 범례 슬롯과 헬스 기간 override 추가. KPI와 차트의 캐시 키를 분리한다. 페이지 최초 coverage 조회 전 본문 보류, 작은 팀은 모든 KPI·위젯 제거. 팀별 막대/도입률은 공개 행은 남기고 마스킹 셀만 가린다.
- [결정] P1 태블릿 원본은 확인되지 않았다. 1280 이상6열 KPI·6열 카드 그리드,1024–1279 KPI3열/카드1열,768–1023 KPI2열/카드1열. 긴 히트맵은 내부 스크롤. 1280/1024 분기점은 구현 선택이며 P2의 태블릿 KPI1열 규칙을 P1 원본 사실로 주장하지 않는다.
- [문서/결정] 원본 통합 깊이 ‘커밋/fresh’를 API 정의 `(커밋+PR)/fresh`로 표시. API 에러율은 재시도 단위 실패율일 수 있어 원본의 단순 응답 비율 문구를 수정했다. 안전 거부는 전사 합계만; 팀 선택 또는 admin에서는 요청 자체를 제외하고 설명을 표시한다. API가 팀 필터를 무시하고 전사 값을 돌려준다고 가정하지 않는다.
- [결정] 산출·도입률은 전역 종료일 기준 완료된8주(KST 월요일), 헬스는 전역 날짜와 별도로 현재 기준 최근24h. 부서·제품·모델은 유지한다. 화면/CSV에 기간 예외 표시. 팀명 클릭은 기존 필터를 유지하고 team_ids만 바꿔 P2로 이동. 히트맵 숫자 셀은 키보드로 집중하여 title을 읽을 수 있고 팀 링크는 별도로 제공한다.
- [결정] CSV 선택 모달은 별도 Figma 원본이 없는 자체 UI. 현재 필터의 지표 하나를 선택하며 원본 API의 첫 쿼리 내보내기 계약을 따른다. 주간·헬스 기간 예외도 화면과 동일하게 적용. 오류/취소/권한/마스킹 유지. 전체 대시보드 스냅샷 CSV라고 표시하지 않는다.

## 4단계 시각 검수
- p1-desktop.png 및14개 하위 원본과 validation/phase-4의 desktop-light/dark, viewport-1024/768, small-team 캡처를 직접 비교.
- KPI x264/y146.09/폭178.66/높이164, 비용 y326.09/높이322, 모델·산출 y664.09/높이302, 도입률 y982.09/높이332, 마지막 행 y1330.09/높이266. 원본 대비 약1px 이내의 카드 배치. geometry.json 참조.
- 첫 비교 후 비용/산출/히트맵 범례를 헤더로 옮기고 KPI 의미색·신뢰 증감의 수평 배치를 맞췄다. 원본에 없는 거버넌스 증감은 제거했다. 캐시 충돌로 scalar를 시계열로 읽던 오류를 별도 키로 수정했다.
- 잔여 차이: 목업 팀3개(원본6개 이상)라 목록/히트맵 여백이 크다. 합성 그래프·눈금·스파이크값은 원본 고정 숫자와 다르다. PR은 커밋과 같은 건수 축을 사용해 별도 숨은 배율 없이 읽는다. 신뢰 스파크는 원본보다 평평하다. 브라우저 폰트 숫자 폭, 축/툴팁, 실데이터 미검증. Light 빗금은 Dark에서도 원본 바이트 그대로 사용한다.
