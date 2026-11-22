@echo off
setlocal
cd /d "%~dp0"
echo Starting the Macropad Configurator...
python start.py
if errorlevel 1 (
  echo.
  echo Python 3 was not found, or the server stopped with an error.
  echo Install Python from https://www.python.org/downloads/ and try again.
  pause
)
