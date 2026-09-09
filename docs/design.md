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

## 5단계 P3/P5 — 원본과 구현 선택
- [원본] `get_design_context`로 [안정성32:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=32-4), [컴플라이언스32:93](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=32-93), [보안32:182](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=32-182), [검색 전32:271](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=32-271), [사유66:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=66-4), [결과67:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=67-4)를 읽었다. 실제 코드/이미지를 확인했으며 텍스트는 reference/p5-*.txt에 보관했다.
- [원본] P5 [28:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=28-4)는 metadata로 구조를 확인한 뒤 계약29:4, 팀·구성원30:4, 정책30:199를 각각 get_design_context로 읽었다. 메타데이터만으로 구현하지 않았다.
- [원본] P3 1440px 본문 좌우24, x264/848, 568px 2열/간격16. 안정성 카드235.9px, 첫 행 y152, 도구 표1152px. 탭 높이30(내부26), 제목18/본문12/표11–12.5. 오류 빨강/red2/red3, 지연 파랑, 재시도·정책 마찰 주황. 도구 실패율 막대0–10%, 임계5% 점선. 공통 토큰/Widget/Result/표/쿼리 훅 재사용.
- [원본] 보안은 안전 거부 카테고리 막대, 모델 행별 429 원, 도메인만 보이는 불일치 표, 정책 추세와 옆 러버스탬프 지표. 컴플라이언스는 설치2:1 커버리지, 훅1:1 정책, 전체 폭 MCP. 검색 전 안내360px, 사유 모달520×325.3/패딩20/textarea74.5px, 검색 컨트롤36px. 세션 결과는 메타1:2.5 타임라인.
- [원본] 설정 상단56px/커버리지28px. 섹션 시작 y104/624.1/1078.7. 계약762.7+373.3/높이455.8, 팀470.7+665.3/약410px, 정책373.3+762.7/303.4px. 섹션 간격32. 게이지와 막대는 API 수치에서 CSS/기존 Recharts로 렌더한다. 새 UI 아이콘 에셋이나 임의 SVG 경로는 만들지 않았다.
- [결정] 설정 헤더는 전역 필터 대신 섹션 앵커3개/조회 전용 안내. 설정은 현행 계약/명부/정책 조회이며 분석 기간 필터와 별도다. 원본 할인 백분율은 API의 `discount_rate` 정의와 충돌하므로 **공시 대비 배율**로 표시(0.8 → 80%, 20% 할인). 활성 약정의 시작일과 contract_id를 사용한다. 전사 소진률은 owner에게만 제공하며 admin에게 자기 팀 비용을 전사 약정 비율처럼 보여주지 않는다.
- [결정] P3 owner 전용 유지. 명세의 SESSION-EVENTS admin 허용과 overview/Figma owner 전용이 충돌한다. 설정 이메일도 owner + 감사 사유로 제한한다. 권한의 서버 확정은 api.md에 남겼다. 사유/대상/개인 응답은 URL·브라우저 저장소·React Query 캐시에 넣지 않는다. 사유10–500자·네이티브 dialog/Escape/포커스 복원·취소·조회 종료 제공.
- [결정] 원본의 고정 감사 ID/사용자 이메일/턴·스팬 합계는 응답 계약에 없으므로 만들어 표시하지 않는다. 타임라인은 현재 페이지 이벤트 시간순, parent_id 메타 표시, 안전한 필드만 사용. 토큰·비용은 llm_call 로그만. 별도 lookup 선택기를 추가하고 tool_use_id를 API call_id에 매핑한다. 설정 이메일 검색은 API가 검색을 제공하지 않아 **현재 페이지** 범위로 명시한다.
- [결정] 원본에 있지만 API 미제공인 미설치 인원/구버전 기준/manifest 버전별 잔존·배포 간격/프라이버시 상세/레지스트리 출처/약정 예상 소진일은 추정 수치로 채우지 않는다. manifest signals false는 준비 중이라고 단정하지 않고 OFF로 표시한다. 실제 합성 데이터는 팀3개/설치 샘플12개/명부 샘플12개다.
- [결정] 안전 거부만 전사 필터 override, 다른 보안 지표는 선택 범위를 유지한다. 카드에 전사 고정을 표시한다. 안정성4차트는 최근24h/1h, 도구 표는 전역 기간. 429는 전역 기간/1h, 다른 추세는 전역 기간/1d. 설치는 팀+무활동30/60/90/전체·cursor 적용; API가 제품/모델/기간 파라미터를 제공하지 않는다.
- [결정] P3/P5 태블릿 원본 없음. ≥1280 6컬럼,768–1279 모든 카드1열. 세션 메타/타임라인과 팀/명부도1열. 표 내부 스크롤, 긴 메타 줄바꿈. 원본에서 확인된 반응형이라고 주장하지 않는다.

## 5단계 시각 검수
- Figma9개 응답 이미지를 실제로 보고 phase-5의 stability-light/dark, compliance, security, audit-modal, session-results, settings-locked/members/dark,1024/768 캡처와 비교했다.
- 수정: TTFT percentile 필드가 하나의 선으로 합쳐짐 → p50/p90 분리; 범례를 카드 헤더로 이동; 오류 3계열을 원본 red/red2/red3 토큰 사용; 실패율 주황·5% 초과 빨강/임계선; 429를 모델별 점으로 변경; 러버스탬프를 추세 옆에 배치; 훅 실행/차단을 이중 축 복합 차트로 결합; 정책 요약 높이 축소; 약정 게이지 중심 위치/구성원 팀 열 수정.
- 안정성 최종 측정은 phase-5/geometry.json. x264/848·폭568 일치, y153.39(원본152), 높이241.875(원본235.9), 둘째 행411.27/도구669.14. 본문 설명 두 줄/브라우저 글꼴 때문에 행마다 약6px 늘어나는 잔여 차이가 있다.
- 잔여 차이: 합성 곡선·정확한 숫자/자동 눈금, 소규모 명부·팀 개수, API 미제공 필드, 안전한 메타를 줄바꿈하는 타임라인 행 높이와 페이지별 시간축, 설정 사유 게이트·배포 이력 추가. 원본의 완전한 스팬 트리/사용자 필드는 계약 확장 없이 가장하지 않는다. 실제 백엔드의 값이나 정책 배포 상태를 확인한 검수는 아니다.

## 6단계 P4 카탈로그·실행 — 원본과 구현 선택
- [원본] design-to-code 스킬 후 get_design_context로 [카탈로그51:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=51-4), [비용 드로어52:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=52-4), [예산53:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=53-4), [실행52:425](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=52-425), [실패52:812](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=52-812), [첫 방문54:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=54-4), [로딩54:369](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=54-369), [준비 중57:4](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=57-4)를 확인. 응답 이미지8개를 직접 확인했고 텍스트는 reference/p6-*.txt 보관. 이력56:4는7단계로 넘겼다.
- [원본] 1440 기준 셸240/헤더56/커버리지28. 본문 x264, 카테고리 y104, 카드 시작 y215/폭272/높이122.2/간격16/3열. 카탈로그 폭848, 보조 패널 x1136/폭280/간격24. 카드 padding14/radius8, 제목13.5/line1.35, 설명12/코드11.5/태그10. 카테고리28px·radius14, 검색340×32.
- [원본] 오른쪽 드로어 x960/폭480, 화면 전체 높이, scrim35%. 내부 좌우20px, 제목15, 지표 행·기간·숫자/팀 입력, 하단 실행·기본값. 실행 대기→쿼리→판정→완료, 취소/백그라운드, 실패 사유/request_id/재시도. 새 이미지·아이콘 에셋은 없으며 기존 Button/Badge/토큰/Pretendard/문자 글리프를 재사용했다. 임의 SVG를 작성하지 않았다.
- [문서] 카탈로그46개·8카테고리는 첨부 overview §6-2. UI는 API의 categories/items/featured/availability/params_schema를 읽는다. source에서 확인한10개 질문과 민감정보 질문의 제목·상황은 원본을 반영; 다른 질문의 상황 문구는 API 목업을 위한 작성이며 Figma에서 확인한 문구가 아니다.
- [결정] 헤더 검색은46개 API 반환 목록을 제목·상황·ID로 필터링, / 단축키. 추천을 먼저 정렬하고 카테고리 건수는 응답에서 계산. 준비 중 카드는 설명을 열 수 있으나 실행 버튼 없음. 부분 가능은 실행 허용+지표 주의사항 표시. 첫 방문은 sessionStorage의 안내 확인 여부만 저장한다.
- [결정] 전역 분석 기간을 드로어 초기값으로 복사하고 실행 후에는 입력 스냅샷 유지. S8-2만 최소3개월 문서 요구에 맞춰90일 초기값. 기간 직접 입력은 접이식 보조 UI(원본에 없음). 예산은 실제 META의3팀, USD/토큰(M) 둘 중 하나만 입력. API에 없는 현재 소진률/예상 시간/정확한 쿼리 개수를 만들지 않고 분석 지표 개수만 표시한다.
- [결정] JSON Schema는 기본 객체/숫자/정수/문자열/날짜/enum/배열 입력 지원. 원본 외 시나리오의 구체적인 기본값·범위·파라미터 중첩 구조는 목업 가정(api.md). 원본과 overview의 지표 목록이 다르면 API 문서 목록을 사용한다. 예: S1-3은 cost/cost_anomaly/api_retry_attempts이며 원본의 cost 그룹3행과 다르다.
- [결정] 네이티브 dialog를 사용해 포커스 잠금/복원·Escape 지원. POST 전송 중 닫기는 중복 실행/응답 유실을 줄이기 위해 비활성. 실행 후 닫기/페이지 이동은 서버 실행을 취소하지 않고 앱 셸의 메모리에서 상태 폴링 유지. 취소는 명시적인 별도 동작. 최근 실행은 현재 로그인 세션의 활성 실행 전부+종료8개이며 영구 이력으로 표시하지 않는다.
- [결정] 원본 오른쪽의 고정 과거 실행/저장 리포트 데이터는 만들지 않았다. 결과 상세/자동 페이지 이동/강조/저장·이력은7단계. 현재 완료 안내와 반환 result를 메모리에 보존한다. 역할 충돌 때문에 기존 P3 owner 정책에 따라 admin의 P3 대상/전사 refusals 시나리오 실행을 제한한다.
- [반응형 가정] P4 태블릿 원본 미확인. ≥1280 본문+280px 보조열,900–1279 카드3열/보조패널 하단2열,768–899 카드2열/보조패널1열. 900 미만 첫 방문 추천은1열, 드로어480px 유지/본문 내부 스크롤. 셸의 기존56px 접기·768 미만 안내 유지.

## 6단계 시각 검수
- 8개 원본 이미지와 validation/phase-6의 catalog-light/dark, welcome, cost-drawer, budget-drawer, running, failed, succeeded, unavailable, catalog-loading/error/empty, viewport-1024/768을 직접 비교했다.
- 초기 카드 높이145px/시작y223·검색 라벨 줄바꿈 발견 → 설명1줄+말줄임(전체 title 제공), 간격/배지/본문 위쪽 여백 정리. 최종 geometry.json: **x264/y215/w272/h122.1875**, 원본272×122.2와 사실상 일치. 드로어는480px, 지표 행 padding7/배지16/헤더 padding16으로 원본 밀도에 맞췄다.
- 남은 차이: 실제 META3팀·합성 카탈로그 설명/지표 정의, 세션 내 실행만 보이는 보조패널, 직접 기간 입력 UI, 원본 미제공 파라미터 폼. 긴 카드 설명/태그는 카드 내부에서 잘릴 수 있으며 드로어에서 전체 내용을 확인한다. 진행 막대는 서버 progress 값만, 단계는 status/판정 label로 표현하며 쿼리 번호를 전체 단계로 오해하지 않는다.

## 7단계 결과·저장·이력 (2026-09-09)

### 원본에서 확인한 사실
- 파일: https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console
- L4 결과 `58:42`, 적용 배너 `58:131`, 판정 패널 `59:298`. L5 전체 `60:80`, 저장 모달 `60:737`. 이력 `56:4`.
- 전체 결과/저장 노드는 큰 화면이라 get_design_context가 sparse metadata를 반환했다. 배너/판정/모달은 하위 노드의 **전체 design context와 이미지**를 다시 읽었다. 이력은 전체 code context+이미지 확인. L4 전체 screenshot도 별도 확인. reference/p7-*.txt에 원문 보존.
- L4 1440px: 기존 셸240/헤더56/커버리지28 유지. 적용 배너 x240/y84/w1200/h36, blue-tint 배경/하단 blue1px. 본문 패딩24, 배너 아래20px.
- 주요 비용 위젯 x264/y182.1/w512/h321.9, 팀별 비용 x792/w248, 사이16px. 판정 패널 x1056/y140/w360/h652, radius8/padding16, 헤더69.8px·하단57px. 판정 카드 padding12/radius8, 정보·주의·이상 배지 및 근거/권장/위젯 이동.
- L5 모달 x480/y140/w480/h446.9, padding20/radius8, 입력438×34, 메모438×49, 기간 선택438×53. 고정 결과/상대식 재실행의 라디오 선택, 같은 테넌트 관리자 공유 안내. Figma는 상대식 선택 상태이며 YAML 기본값은 fixed이다.
- 이력은 상하2개 카드(실행 이력/저장 리포트), 실행 시각/시나리오/파라미터/상태/실행자/findings/작업 열. 저장 표는 이름/시나리오/기간 모드/메모/저장/작업. 기존 Pretendard/IBM Plex Mono 및 공통 토큰 사용.
- 공통 Button/Badge/WidgetCard의 highlighted, 기존 DataFrame 어댑터/series/format/DataTable·Recharts 설정을 재사용. 이번 노드에는 별도 다운로드할 제품 이미지/아이콘이 없으며 문자를 아이콘 에셋으로 임의 대체하지 않았다.

### 문서 근거와 구현 결정·가정
- [API 문서] `frames`는 metric_id→QueryResult. 위젯 쿼리별 ref/단가/차원과의 정확한 대응은 보장되지 않는다. overview §7 표의39개 지표→위젯 대응을 widgetMap.json으로 추출; cost_anomaly→W1.2는 RUN-GET 예제 근거. cost는 frame_type으로 P1 scalar/W1.1, timeseries/W1.2, table/W1.3을 구분하는 **구현 가정**이다.
- [결정] `/runs/{run_id}`는 대상 페이지 이름·적용 필터·반환 프레임·판정을 보여주는 결과 전용 뷰. 완료된 열린 드로어만 자동 이동; 백그라운드 실행은 사용자 페이지를 이동시키지 않는다. 해제하면 대상 P1/P2/P3 등 일반 페이지로 적용 필터를 유지하며 이동.
- [결정] 결과 헤더는 실행 시점 필터를 표시하며 변경 컨트롤을 잠근다. 실행 프레임과 현재 조건을 섞지 않기 위해 해제 후 필터를 편집한다. 결과 페이지는 커버리지까지 포함해 QRY를 재호출하지 않는다. 원본의 현재 커버리지 숫자 대신 실행 시점 결과임을 표시.
- [결정] 가용 프레임의 주요 위젯을 먼저 배치하고 blue2px로 강조. 동일 지표의 여러 table 프레임은 함께 표시, timeseries/scalar는 구분. 다중 수치 필드·문자 위주 프레임은 서로 다른 값을 한 선으로 연결하지 않고 정제된 표로 표시. 데이터 표는 결과 화면에서 바로 펼칠 수 있다.
- [차이] 원본은 나머지 KPI/대시보드를 opacity .3으로 표시하지만 API가 해당 프레임을 주지 않으면 이를 임의 값이나 새 QRY로 채우지 않는다. 따라서 이번 결과 뷰는 **반환된 지표만** 렌더하며, 매핑된 결과가 없는 강조 ID는 데이터 없음 안내. 기존 전체 대시보드는 해제로 접근한다. 서버가 쿼리 차원별 프레임 식별을 제공하면 기존 대시보드와 더욱 정밀하게 매핑 가능.
- [차이] 합성 데이터의 기간·팀3개·판정 문구·건수는 Figma의7팀/2026-09-03 사건/이상1·주의1·정보1 숫자를 재현한 실제 판정이 아니다. 날짜는 목업 실행 시각을 기준으로 절대 해석한다. 작은 팀의 수치·막대 및 관련 판정 근거는 숨긴다.
- [결정] 고정 저장을 기본 선택(YAML 기본값). 상대 기간이 없는 실행은 상대식 옵션 비활성. 저장 성공 토스트/링크, 실패 시 입력과 request_id 유지. 삭제는 실제 삭제 대상을 표시하는 공통 네이티브 모달, Tab 순환/Escape/원래 버튼 포커스 복원 제공.
- [가정] 이력은10개 단위 커서 페이지 이동. 원본의 최근30일 문구는 RUN-LIST 계약에 날짜 필터가 없어 표시하지 않는다. 삭제는 사용자 요청을 구체화하는 제품 확인 모달이며 작업자 추가 승인을 요구하지 않는다.

### 반응형·시각 검수
- [가정] ≥1280px 결과 본문+360px 판정 패널. 900–1279px 판정을 아래로 옮기고 판정 카드2열. 768–899px 결과/판정 모두1열. 기존 셸은1279px 이하56px 사이드바. 표는 카드 내부 스크롤, 페이지 가로 스크롤 없음.
- 모달480px, 데스크톱top140, 899px 이하top80, 높이는 viewport−80 제한. 판정 패널은 데스크톱에서 스크롤에 따라 고정하고 내부 내용만 스크롤. reduced-motion 환경은 기존 전역 규칙 적용.
- 실제 캡처: docs/validation/phase-7의 result-light/dark/1024/768, save-fixed/relative, history, not-found, states, shell. geometry.json에 비용·팀 비용·판정 패널 위치/크기 기록.
- 비교 후 수정: 1024px의 본문 패딩16과 결과 margin−24 불일치로8px 넘침 → margin−16; 중복 blue outline 제거 및 공통 highlighted 재사용; 주요 위젯 비율512:248; UUID가 축 라벨에 노출돼 줄바꿈되던 부분을 팀 이름으로 변경; 차트 높이·모달 제목 간격 축소; 활성 이력 탭만 밑줄.
- 남은 차이는 데이터 계약 및 위의 반환 프레임 전용 화면 결정에 따른 차이. 원본의 임의 과거 실행/저장 항목 수치를 만들지 않았다. 8단계에서 전체 페이지 통합 검수를 진행한다.


## 8단계 통합 검수 — 원본·수정·잔여 차이
- [원본] 툴바 [39:38](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=39-38), 팀 선택 [40:6](https://www.figma.com/design/RWMkxrA8NVqfHfM3Fi16m0/Pulsemetry-Admin-Console?node-id=40-6)을 get_design_context로 재확인. reference/p8-toolbar-39-38.txt, p8-teams-40-6.txt. 기존 원본 p1-desktop/p2-desktop/p2-tablet 및 이전 단계 노드 수치를 비교 근거로 재사용.
- [원본/수정] 팀 선택 바 32px, 버튼26px, 바 border1/radius6, 안쪽 간격2, 버튼 radius4. 선택 배경 text/1·글자 misc/on-inverse, 비선택 글자 text/2. 구현의 흰 배경/파란 선택 글자를 원본 토큰으로 수정하고 비선택 색을 명시해 Dark에서도 읽을 수 있게 했다. 팀 이름·개수·전체 선택은 API 권한/계층 차이에 따른 기존 결정 유지, 원본234px 너비를 강제하지 않음.
- [실측] 1440 셸 sidebar240/toolbar56/coverage28. P1 KPI x264/y146.09/w178.66/h164(원본 h163.5), 비용762.66×322, 도입률1152×332. P2 세션373.33×274.375/y304, 산출568×437, 토큰568×326, 기능762.66×363.05(원본360.6), 품질1152×319/y1768.42(원본y1766.3). 주요 그리드 유지, 약0–3px 차이는 폰트/표 높이에 따른 미세 차이로 남김.
- [검수] validation/phase-8의 개요·팀·운영·설정·시나리오·결과/저장 캡처와 Light/Dark 실행 화면을 확인. P2 전체 완료 화면은 team-details/desktop-*.png를 사용(기본 teams 검사는 아래쪽 상세 위젯을 아직 로드하지 않은 캡처일 수 있음). 합성 그래프 모양/서버 팀 수/눈금 차이는 원본과의 픽셀 일치로 주장하지 않는다.
- [결정/접근성] 기존 리포트 포커스 처리를 components/dialogFocus.ts로 공유. 네이티브 모달의 inert 동작을 유지하며 Tab/Shift+Tab 경계 순환, 열기 전 버튼 보존, 종료 후 복원. 시나리오/감사/리포트에 적용, CSV는 순환 처리 재사용. 기간 팝오버 Escape/취소/적용 후 트리거 복귀, 페이지별 document.title, 결과 위젯 이동 시 reduced-motion 선호 반영. 새 시각 디자인을 추정한 것이 아닌 상호작용 결정이다.
- [반응형] 기존 페이지별 1280/1024/768 규칙 유지. owner/admin의 접근 가능한 P1–P5, Light/Dark,1440/1024/768 조합54개에서 가로 넘침 없음. 결과/이력 반응형은 check:reports, P2 원본 태블릿/상세 상태는 check:team-details로 별도 검증. 768 미만은 지원 안내 유지.
- [한계] headless Chromium의 키보드·포커스·스크린샷 검수이며 전체 WCAG 인증/스크린리더 실기기/Firefox/Safari 검증이 아님. L4 반환 프레임 전용 뷰와 비관련 대시보드 생략, 동적 자료/차트 차이는7단계 결정 유지.
