# slicer — 디자이너 시트 자르기

1. `cd tools/slicer && npm install` (sharp 0.33.5, 이 폴더에만 설치)
2. 시트를 `docs/reference/design-YYYYMMDD-*/` 에 넣고 `analyze.mjs` 의 `REF`/`sheets` 를 맞춘 뒤 `ATH=160 node analyze.mjs 6` → 행별 성분 좌표 출력
3. `export.mjs` 에 이름 매핑을 적고 `node export.mjs` → `prototype/assets/` 에 PNG 저장
4. 검은 배경으로 온 파일은 `export-title.mjs` 방식(검은색 flood-fill)으로

경로는 스크립트 상단 상수에 절대 경로로 적혀 있으니 레포 위치가 바뀌면 고친다.
