# 게임1 최소 보안 기준

프로젝트: `yvsqivhdwzbshpapfcsy`. 이 기준은 앞으로 모든 기능 개발에 적용한다. 상세 작업 규칙은 AGENTS.md에 있다.

| 분야 | 기준 |
| --- | --- |
| 비밀 관리 | 서버 시크릿만 사용, Git/로그/게임 빌드에 비밀 금지, 프런트엔드는 publishable key |
| 데이터 접근 | 기본 접근 차단, 명시적 GRANT + RLS, 본인/타인/미인증/다른 게임 접근 테스트 |
| 게임 로직 | 재화·보상·결제는 서버에서 검증, 중복 지급과 동시성 방어 |
| API | JWT와 소유권 검증, 입력 검증, 요청 제한, 배포 도메인 CORS |
| 파일/실시간 | private bucket, 크기/형식/소유권 제한, 채널별 권한 |
| 운영 | 관리자 MFA, 테스트 환경 분리, 백업 복원 확인, 오류·이상 요청 알림 |

## 2026-10-12 적용

- Supabase migration `game1_security_baseline` 적용. 실행 SQL: docs/sql/game1_security_baseline.sql.
- 기존 `public.rls_auto_enable()`의 PUBLIC/anon/authenticated/service_role 실행 권한을 회수. 기존 RLS 자동 활성화 이벤트 트리거는 유지한다.
- `game1_private` 내부 스키마 생성, 일반 사용자 스키마 접근 차단. Data API 노출 목록에 추가하지 않는다.
- postgres가 이후 public에 생성하는 테이블/시퀀스/함수의 자동 클라이언트·service_role 권한을 회수. 앞으로 필요한 권한을 명시적으로 부여한다.
- PostgreSQL의 PUBLIC 함수 실행 기본값은 스키마별 회수로 제거되지 않아 postgres의 글로벌 기본값도 회수했다. **같은 프로젝트의 다른 게임도 이후 postgres가 만드는 함수에 EXECUTE를 명시해야 한다.** 기존 객체 권한과 시스템 auth/storage 설정은 그대로다.
- 기존 public 테이블 자동 RLS 트리거는 실패를 로그로만 남길 수 있으므로, 모든 새 테이블 SQL에도 ENABLE ROW LEVEL SECURITY를 명시하고 검사한다. game1_private에는 자동 RLS가 적용되지 않는다.
- .gitignore, 빈 시크릿 환경변수 예제, 제한된 권한의 GitHub CI 시크릿 검사 추가. 검사는 Git 작업 트리의 일부 고신뢰 패턴만 탐지하며 Git 이력/모든 비밀값을 탐지하지 않는다.

## 출시 전 아직 필요한 항목

적용 후 검증: security advisors 경고 0건. 트랜잭션 안에서 임시 public 테이블/함수를 생성해 RLS 활성화, anon/authenticated의 테이블·함수 기본 접근 차단, 내부 함수 EXECUTE 차단, private 스키마 접근 차단, 기존 RLS 이벤트 트리거 활성 상태를 확인하고 ROLLBACK했다. 로컬 시크릿 탐지 테스트 3건과 전체 작업 트리 검사는 통과했다. GitHub에서 CI가 실행되는지 여부는 push 후 별도로 확인해야 한다.

아직 앱/테이블/Edge Function이 없으므로 사용자별 RLS 정책, JWT/서버 권한 검증, 요청 제한, 결제/보상 검증, 웹 보안 헤더, 업로드 제한은 해당 기능 구현 시 작성하고 테스트해야 한다.

관리자 계정 MFA, GitHub 보호 브랜치/필수 CI 설정, Supabase Auth 이메일 확인/허용 redirect URL/요청 제한, 백업 보존·복원 훈련, 서비스 알림은 아직 확인·설정하지 않았다. 운영 출시 전에 확인한다. 같은 Supabase를 쓰는 게임은 Auth·플랫폼 시크릿·운영 장애 범위를 공유하며 접두사만으로 완전히 분리되지 않는다.

보안 작업은 시작 기준이며 보안 인증이나 침해 불가능성을 의미하지 않는다. 배포마다 기능에 맞는 검증을 실행한다.

## 점검 명령

```text
python -m unittest discover -s tests
python scripts/game1_check_secrets.py
```

DB 변경 후 Supabase security advisors와 실제 anon/authenticated 역할 권한 검사를 수행한다. 의존성을 추가하면 해당 생태계의 취약점 검사를 CI에 추가한다.

근거: [Supabase API 보안](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
