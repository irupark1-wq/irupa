# [DEV-REQ-001] 김디자인 → 프로그래머 — 디자인 제작 전 기술 질문

프로젝트: 《동그란 사이》 · 작성일 2026-10-12 · 상태: 개발자 답변 대기

> 사용자의 기존 요구: GitHub Pages + Supabase, 로그인 화면 없음. 이 결정은 00/01/02 PRD의 '플랫폼 미정' 표기보다 최신 사용자 요구로 취급하되 김PO의 문서 반영이 필요합니다. 별도 로그인 UI를 임의 추가하지 않습니다.

| 우선 | 항목 | 개발자 확인 요청 | 영향 화면 |
|---|---|---|---|
| P0 | 계정·소유권 | 익명 인증 방식, RLS, 방문/차단 권한, 기기 변경/브라우저 초기화 복구 방식은? | SCR-02~08 |
| P0 | 파츠 데이터 | 512×512 RGBA 원본 PNG만 저장할지 브러시 스트로크도 저장할지? 눈은 pair/left-right 중 어느 계약? transform 저장 범위·파일 제한·스토리지 경로는? | SCR-01 |
| P0 | 렌더러 | React + Canvas/PixiJS/Phaser 등 렌더러/좌표계와 UI 인터페이스, 목표 화면·입력 기기·캐릭터 월드 표시 크기는? | SCR-01/02/05/06 |
| P0 | 관계 projection | allowed_actions/visibility/basis_status/memories/revision 및 같은 소유자 양방향, 다른 소유자 반대 방향 제거를 어떻게 DTO로 줄 것인지? | SCR-04/07 |
| P0 | 상태·명령 | command_id와 consent_id, event_id·sequence, dirty/saving/saved/error/conflict, reconnected 로직은? | SCR-01/04/06/07 |
| P1 | 에셋 전달 | SVG·PNG·manifest JSON 지원 여부, sprite atlas/모션 기반, 해상도·압축 정책, 파일명 규칙은? | 전체 |

회신은 질문별 **확정 / 변경 제안 / 구현 검토 필요**, 실제 타입·범위, 변경 영향으로 부탁드립니다. 원본 U-01~08 변경은 김PO 승인 절차로 연결합니다.

착수 시안(비확정): 512×512 투명 PNG 레이어, 중심 피벗, 1280×720 PC 화면 예시, 2D 둥근 스티커형 아트. 이 중 플랫폼을 제외한 화면 비율·아트·파츠 수량·좌표 세부는 제안입니다.
