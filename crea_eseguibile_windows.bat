@echo off
REM ===========================================================================
REM Crea l'app "Cielo di Einstein@Home" per Windows, con il collegamento sul Desktop.
REM (c) 2026 Edoardo Battistel
REM Uso: doppio clic su questo file (serve Python 3 con numpy e Pillow).
REM ===========================================================================
cd /d "%~dp0"
echo === 1/4  Ambiente Python ===
if not exist .venv-build (python -m venv .venv-build)
.venv-build\Scripts\python -m pip install --upgrade pip pyinstaller numpy pillow || goto errore
echo === 2/4  Icona ===
if not exist web\cielo_einstein.ico (.venv-build\Scripts\python crea_icona.py || goto errore)
echo === 3/4  Creazione dell'eseguibile ===
.venv-build\Scripts\python -m PyInstaller --noconfirm --clean --onefile --noconsole ^
    --name CieloEinstein --icon web\cielo_einstein.ico --add-data "web;web" ^
    --hidden-import dati_cielo --hidden-import numpy ^
    --exclude-module astropy --exclude-module matplotlib --exclude-module scipy ^
    --exclude-module tkinter --exclude-module PIL cielo_einstein.py || goto errore
echo === 4/4  Autotest e collegamento sul Desktop ===
del autotest.txt 2>nul
dist\CieloEinstein.exe --autotest
findstr /C:"AUTOTEST SUPERATO" autotest.txt >nul || (type autotest.txt & echo AUTOTEST FALLITO & goto errore)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Cielo di Einstein@Home.lnk');$s.TargetPath='%CD%\dist\CieloEinstein.exe';$s.IconLocation='%CD%\web\cielo_einstein.ico';$s.WorkingDirectory='%CD%\dist';$s.Save()"
rmdir /s /q build 2>nul
del CieloEinstein.spec 2>nul
echo.
echo FATTO: sul Desktop c'e' "Cielo di Einstein@Home".
pause
exit /b 0
:errore
echo.
echo Qualcosa non ha funzionato: guarda i messaggi qui sopra.
pause
exit /b 1
