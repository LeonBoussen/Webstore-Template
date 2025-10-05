@echo off

REM Start backend in a cmd promt with title
start cmd /c "title backend && cd back && py server.py && pause" 

REM Start frontend in a cmd promt with title
start cmd /c "title frontend && cd front && npm run dev && pause"

start brave http://localhost:5173/