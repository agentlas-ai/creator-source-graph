@echo off
setlocal
set "creator_graph_dir=%~dp0"
if exist "%creator_graph_dir%runtime\node.exe" (
  "%creator_graph_dir%runtime\node.exe" "%creator_graph_dir%launch.mjs"
) else (
  node "%creator_graph_dir%launch.mjs"
)
if errorlevel 1 pause
