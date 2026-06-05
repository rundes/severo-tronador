@echo off
cd /d "%~dp0"
".venv\Scripts\python.exe" -u worker.py >> worker.log 2>&1
