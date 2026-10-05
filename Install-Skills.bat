@echo off
setlocal
set "creator_graph_dir=%~dp0"
set "creator_skill_default="
if "%~1"=="" set "creator_skill_default=--host both"
if exist "%creator_graph_dir%runtime\node.exe" (
  "%creator_graph_dir%runtime\node.exe" "%creator_graph_dir%cli.mjs" install %creator_skill_default% %*
) else (
  node "%creator_graph_dir%cli.mjs" install %creator_skill_default% %*
)
if errorlevel 1 pause
