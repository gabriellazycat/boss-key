@echo off
rem Abre o BOSS KEY em Godot. Usa o .exe exportado se existir; senao roda o projeto com o Godot instalado.
cd /d "%~dp0godot"
if exist "build\BossKey.exe" (
  start "" "build\BossKey.exe"
) else (
  where godot >nul 2>nul && (start "" godot --path .) || (
    echo Godot 4.7 nao encontrado. Instale com: winget install GodotEngine.GodotEngine
    pause
  )
)
