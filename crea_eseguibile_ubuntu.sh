#!/usr/bin/env bash
# =============================================================================
# Crea il programma "Cielo di Einstein@Home" per Ubuntu nella cartella CieloEinstein
# (accanto a questo script), con l'icona sulla Scrivania e nel menu.  © 2026 Edoardo Battistel
#
# Uso:  cd ~/Claude/Astropy/programma_cielo_einstein/versione_1.1
#       bash crea_eseguibile_ubuntu.sh
# =============================================================================
set -e
cd "$(dirname "$(readlink -f "$0")")"

for f in cielo_einstein.py dati_cielo.py crea_icona.py web/index.html web/app.js; do
    [ -f "$f" ] || { echo "ERRORE: manca $f in questa cartella ($(pwd))."; exit 1; }
done

echo "=== 1/5  Ambiente Python per la compilazione ==="
VENV="$HOME/Claude/Astropy/venv_compila"
if [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c "import PyInstaller" 2>/dev/null; then
    PY="$VENV/bin/python"
    echo "Uso l'ambiente già pronto: $VENV"
else
    echo "Ambiente $VENV non trovato: ne creo uno temporaneo (serve Internet)."
    [ -d .venv-build ] || python3 -m venv --system-site-packages .venv-build
    .venv-build/bin/python -m pip install --upgrade pip pyinstaller
    PY="$(pwd)/.venv-build/bin/python"
fi
"$PY" -c "import PIL, numpy" 2>/dev/null || {
    echo "Mancano Pillow o numpy: sudo apt install python3-pil python3-numpy"; exit 1; }

echo "=== 2/5  Icona ==="
[ -f web/cielo_einstein.png ] && [ -f web/cielo_einstein.ico ] || "$PY" crea_icona.py

echo "=== 3/5  Creazione dell'eseguibile (un minuto circa) ==="
"$PY" -m PyInstaller --noconfirm --clean --onefile --console \
    --name CieloEinstein \
    --add-data "web:web" \
    --hidden-import dati_cielo \
    --hidden-import numpy \
    --exclude-module astropy \
    --exclude-module matplotlib \
    --exclude-module scipy \
    --exclude-module tkinter \
    --exclude-module PIL \
    cielo_einstein.py

echo "=== 4/5  Verifica dell'eseguibile (autotest, senza rete) ==="
if ! ./dist/CieloEinstein --autotest > autotest.txt 2>&1; then
    cat autotest.txt
    echo
    echo "L'autotest è FALLITO: i dettagli sono in $(pwd)/autotest.txt"
    echo "L'app non è stata installata. Invia autotest.txt per la correzione."
    rm -rf build CieloEinstein.spec
    exit 1
fi
grep -E "^\[(ok|ERRORE)\]|AUTOTEST" autotest.txt

echo "=== 5/5  Cartella del programma e icona sulla Scrivania ==="
# Il programma è tutto nella cartella CieloEinstein (accanto a questo script):
#   CieloEinstein/CieloEinstein          il programma (non serve Python)
#   CieloEinstein/cielo_einstein.png     l'icona
#   CieloEinstein/LEGGIMI.txt
# L'icona sulla Scrivania (e nel menu delle applicazioni) avvia il programma da lì.
# I cataloghi restano in ~/Scrivania/Astronomia/Cielo_Einstein (come prima).
PROG="$(pwd)/CieloEinstein"
mkdir -p "$PROG"
cp dist/CieloEinstein "$PROG/CieloEinstein"
chmod +x "$PROG/CieloEinstein"
cp web/cielo_einstein.png "$PROG/cielo_einstein.png"
cp LEGGIMI.txt "$PROG/LEGGIMI.txt"

# eventuale installazione vecchia in ~/.local/bin (non più usata)
rm -f "$HOME/.local/bin/CieloEinstein"

# Terminal=false: si apre solo la finestra della sfera celeste. I messaggi vanno in
# Cielo_Einstein/cielo_einstein.log; il programma si chiude da solo qualche minuto
# dopo che si è chiusa la finestra. Tasto destro sull'icona: «Salvaschermo».
DESKTOP_FILE="$PROG/cielo-einstein.desktop"
cat > "$DESKTOP_FILE" <<EOD
[Desktop Entry]
Type=Application
Name=Cielo di Einstein@Home
Comment=Sfera celeste 3D con pulsar, onde gravitazionali e osservatori - © 2026 Edoardo Battistel
Exec="$PROG/CieloEinstein"
Path=$PROG
Icon=$PROG/cielo_einstein.png
Terminal=false
StartupNotify=true
Categories=Science;Astronomy;Education;
Keywords=einstein;boinc;pulsar;onde gravitazionali;cielo;3D;salvaschermo;
Actions=salvaschermo;aggiorna;

[Desktop Action salvaschermo]
Name=Salvaschermo
Exec="$PROG/CieloEinstein" --salvaschermo

[Desktop Action aggiorna]
Name=Riscarica tutti i cataloghi
Exec="$PROG/CieloEinstein" --prepara --riscarica
EOD
chmod +x "$DESKTOP_FILE"

SCRIVANIA="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Scrivania")"
mkdir -p "$SCRIVANIA"
cp "$DESKTOP_FILE" "$SCRIVANIA/cielo-einstein.desktop"
chmod +x "$SCRIVANIA/cielo-einstein.desktop"
gio set "$SCRIVANIA/cielo-einstein.desktop" metadata::trusted true 2>/dev/null || true
# anche nel menu delle applicazioni (stesso collegamento)
mkdir -p "$HOME/.local/share/applications"
cp "$DESKTOP_FILE" "$HOME/.local/share/applications/cielo-einstein.desktop"
update-desktop-database -q "$HOME/.local/share/applications" 2>/dev/null || true

rm -rf build dist CieloEinstein.spec .venv-build

echo
echo "FATTO."
echo "  Programma:    $PROG/"
echo "  Avvio:        doppio clic sull'icona «Cielo di Einstein@Home» sulla Scrivania"
echo "                (la prima volta: tasto destro -> 'Consenti avvio'), oppure dal menu."
echo "  Cataloghi:    a ogni avvio si aggiornano da soli in sottofondo."
echo "  Salvaschermo: tasto destro sull'icona nel menu/dock -> 'Salvaschermo', oppure tasto S."
