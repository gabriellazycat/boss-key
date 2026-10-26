@echo off
title BOSS KEY
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias ^(so na primeira vez^)...
  call npm install
  if errorlevel 1 (
    echo Falha no npm install.
    pause
    exit /b 1
  )
)

echo Iniciando o servidor...
start "BOSS KEY - servidor" cmd /k npm run dev

echo Aguardando o servidor subir...
timeout /t 5 /nobreak >nul

start "" http://localhost:5173
echo.
echo Jogo aberto no navegador: http://localhost:5173
echo Para encerrar, feche a janela "BOSS KEY - servidor".
timeout /t 3 /nobreak >nul
