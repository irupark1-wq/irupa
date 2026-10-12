@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "GAME1_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%GAME1_NODE%" set "GAME1_NODE=C:\Program Files\nodejs\node.exe"
if not exist "%GAME1_NODE%" set "GAME1_NODE=node"
echo 동그란 사이 로컬 테스트 버전을 시작합니다.
echo 브라우저에서 http://127.0.0.1:4173 을 열어주세요.
echo 이 창을 닫으면 테스트 서버가 종료됩니다.
"%GAME1_NODE%" scripts\game1_build_prototype.mjs
if errorlevel 1 goto done
"%GAME1_NODE%" scripts\game1_prototype_server.mjs
:done
pause
