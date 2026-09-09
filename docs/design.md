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
