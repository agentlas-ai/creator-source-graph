@echo off
setlocal
set "creator_graph_dir=%~dp0"
if exist "%creator_graph_dir%runtime\node.exe" (
  "%creator_graph_dir%runtime\node.exe" "%creator_graph_dir%cli.mjs" install --host both
) else (
  node "%creator_graph_dir%cli.mjs" install --host both
)
if errorlevel 1 pause
