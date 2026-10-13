> 2026-10-13: 메인 개발자 Claude(김도현). 작업 규칙 [CLAUDE.md](CLAUDE.md), 인수인계 [00_클로드_인수인계](docs/planning/00_클로드_인수인계_2026-10-13.md), **문서번호·목록 [docs/00_문서대장.md](docs/00_문서대장.md)**, 기준 기획 PO-13, 개발계획 [DEV-19](docs/planning/DEV-19_전체개발계획_v1.0.md). 다른 프로젝트와 계정 완전 별개.

# irupa

게임1 《동그란 사이》 개발 저장소. **공개 주소: https://neinom.com** (GitHub Pages, `.github/workflows/pages.yml` 이 `prototype/` 을 배포). Supabase 프로젝트: `yvsqivhdwzbshpapfcsy` (SQL·함수는 `supabase/` 폴더에 누적, 적용은 PO 가 직접).

모든 개발은 [AGENTS.md](AGENTS.md)의 보안 규칙과 [SECURITY.md](SECURITY.md)의 최소 기준을 따른다. 로컬 작업 폴더는 `C:\claude\donggeuran`.

전체 제작 계획과 디자이너 요청서는 [개발 인계 패키지](docs/planning/00_인계_읽는순서.md)에서 시작한다.

최신 실행본은 자율 생활 시제품입니다. `게임1_테스트시작.cmd`를 실행한 후 http://127.0.0.1:4173 에서 내 월드를 엽니다. 폰들이 스스로 이동·휴식·대화·작업합니다. 재실행 후에는 `생활 재개`를 눌러 주세요. 배치·생활 속도·정지·관계·기억을 확인할 수 있습니다. 친구 방문은 로컬 대역 시험이며 실제 온라인 초대는 미연결입니다.

최신 변경/팀 질문 회신/남은 게이트: [자율 생활 통합 개발 회신](docs/planning/replies/11_자율생활_공간공존_통합개발회신.md). Node 24 이상, `npm test` 114개 통과. 전체 출시·온라인 보안 게이트는 아직 미완료입니다.

2026-10-13 UI 전체 화면 게임형 재구성(디자인 v1.0): [회신 13](docs/planning/replies/13_UI_앱형_재구성_디자인v1.0.md), [디자이너 회신 v1.4(케이티정)](docs/planning/동그란사이_케이티정_디자이너_회신_v1.4.md), [케이티정 리뷰 반영](docs/planning/replies/14_케이티정_리뷰반영_UI수정.md).

2026-10-13 디자이너 합성 시안 3장 수신(docs/reference/design-20261013-b): 시안 기준으로 개발이 맞춤(세로 단일 비율), 분리 납품 안내는 [디자이너 회신 v1.4](docs/planning/동그란사이_케이티정_디자이너_회신_v1.4.md).

2026-10-13 디자이너 확정 시안 2장 수신(docs/reference/design-20261013-c, 가로·세로). 승인 및 조각 파일 체크리스트: [디자이너 회신 v1.4](docs/planning/동그란사이_케이티정_디자이너_회신_v1.4.md).

2026-10-13 디자이너 조각 파일 8장 수신·적용(스킨 v1, prototype/skin.css + assets/): [회신 15](docs/planning/replies/15_디자이너_조각파일_적용.md).

2026-10-13 다국어(ko·en·ja, i18n.js)와 모션 연출(fx.css) 추가: [회신 16](docs/planning/replies/16_다국어_모션_추가.md). 디자이너 추가 요청: [회신 v1.5 다국어](docs/planning/동그란사이_케이티정_디자이너_회신_v1.5_다국어.md).

2026-10-13 제목 명판 영어(Little Circles)·일본어(まるい縁) 수신·적용(assets/brand/title-en.png, title-ja.png).
