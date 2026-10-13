# Supabase (게임1 · 동그란 사이)

- 프로젝트: `yvsqivhdwzbshpapfcsy` (https://supabase.com/dashboard/project/yvsqivhdwzbshpapfcsy). **이 프로젝트 전용.** 다른 프로젝트(Restiq·SoojiN·Sigmate·Oryxa 등)의 Supabase 와 절대 섞지 않는다.
- 적용 방식: Claude(김도현)가 `migrations/NNNN_*.sql`, `functions/<name>/`, `secrets.md` 를 만들어 두면 **김PO 가 대시보드에서 직접 입력**한다. Claude 는 Supabase 에 직접 접속하지 않는다.
- 이름 규칙: DB 객체·Edge Function `game1_`, 내부 스키마 `game1_private`, secret·환경변수 `GAME1_`.
- 파일은 번호 순서대로 누적한다. 이미 적용한 파일도 지우지 않는다(이력). 적용 여부는 아래 표에 기록한다.

## 적용 기록

| 파일 | 내용 | 상태 |
|---|---|---|
| `migrations/0001_game1_security_baseline.sql` | `game1_private` 스키마, 기본 권한 회수(이전 개발자 작성) | 이전 개발자 보고로는 적용됨. **김PO 확인 필요** (아래 확인 SQL) |

## 현재 상태 확인 SQL (SQL Editor 에서 실행 후 결과를 Claude 에게 알려 주세요)

```sql
select 'schema' as kind, nspname as name from pg_namespace where nspname like 'game1%'
union all
select 'table', table_schema || '.' || table_name from information_schema.tables where table_name like 'game1_%' or table_schema like 'game1%'
union all
select 'function', n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname like 'game1_%' or n.nspname like 'game1%'
order by 1, 2;
```
