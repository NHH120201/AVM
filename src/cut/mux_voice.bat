@echo off
REM Usage: mux_voice <topic> <YYYY-MM-DD>
setlocal

set topic=%1
set date=%2

if "%topic%"=="" (
  echo Usage: mux_voice ^<topic^> ^<YYYY-MM-DD^>
  goto :eof
)

if "%date%"=="" (
  echo No date provided.
  goto :eof
)

set base=C:\Users\Admin\.openclaw\workspace\AVM\Video\EditVideo\FullNoSubVideo
set video=%base%\%topic%\%date%\%topic%.mp4
set audio=C:\Users\Admin\.openclaw\workspace\AVM\Audio\%topic%_voice.wav
set out=%base%\%topic%\%date%\%topic%_final.mp4

echo Video: "%video%"
echo Audio: "%audio%"
echo Output: "%out%"

if not exist "%video%" (
  echo Video file not found: "%video%"
  goto :eof
)

if not exist "%audio%" (
  echo Audio file not found: "%audio%"
  goto :eof
)

ffmpeg -y -i "%video%" -i "%audio%" -c:v copy -c:a aac -b:a 192k "%out%"

if exist "%out%" (
  echo Generated "%out%"
) else (
  echo Failed to generate "%out%"
)

endlocal
