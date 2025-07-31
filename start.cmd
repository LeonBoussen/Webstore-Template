@echo off

REM Start backend in a cmd promt with title
start cmd /c "title backend && cd back && py server.py"

REM Start frontend in a cmd promt with title
start cmd /c "title frontend && cd front && npm run dev"