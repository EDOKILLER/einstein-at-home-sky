#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CIELO DI EINSTEIN@HOME - la sfera celeste di Einstein@Home, con oggetti veri
============================================================================
© 2026 Edoardo Battistel

Una versione più ricca del salvaschermo di Einstein@Home: sfera celeste 3D che ruota,
con la Terra al centro (girata come adesso, con LIGO, Virgo, KAGRA, GEO600, Arecibo,
Parkes e il satellite Fermi), costellazioni, Via Lattea, pulsar radio e gamma, magnetar,
resti di supernova, quasar e le zone di cielo degli eventi di onde gravitazionali.
Clic su un oggetto: scheda con i dati e una breve spiegazione.

A ogni avvio la pagina si apre subito con i dati già pronti e i cataloghi si aggiornano
in sottofondo; quando i dati nuovi sono pronti la pagina li carica da sola. La prima volta
la pagina mostra a che punto è la preparazione. Avviato dall'icona non serve il terminale:
i messaggi vanno in <dati>/cielo_einstein.log e il programma si chiude da solo qualche
minuto dopo che si è chiusa la finestra.

Avvio:  python3 cielo_einstein.py                   apre la pagina (finestra a sé, se c'è Chrome)
        python3 cielo_einstein.py --salvaschermo    parte già in modalità salvaschermo
        python3 cielo_einstein.py --prepara         rifà i dati subito (--riscarica: riscarica tutto)
        python3 cielo_einstein.py --senza-aggiornare
        python3 cielo_einstein.py --resta-aperto    non si chiude quando si chiude la finestra
        python3 cielo_einstein.py --cartella <dir>  dove tenere dati e cataloghi
        python3 cielo_einstein.py --autotest        prova senza rete
"""

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dati_cielo as DC  # noqa: E402

NOME = "Cielo di Einstein@Home"
VERSIONE = "1.1"
COPYRIGHT = "© 2026 Edoardo Battistel"
FILE_CONFIG = Path.home() / ".cielo_einstein.json"
CARTELLA_PROGRAMMA = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
VERSIONE_THREE = "0.160.0"
FILE_THREE = {
    "three.module.js": f"https://cdn.jsdelivr.net/npm/three@{VERSIONE_THREE}/build/three.module.js",
    "OrbitControls.js": f"https://cdn.jsdelivr.net/npm/three@{VERSIONE_THREE}/examples/jsm/controls/OrbitControls.js",
}
PORTA = 8790
ETA_AGGIORNAMENTO_ORE = 1        # all'avvio si riscaricano i cataloghi più vecchi di così


# =============================================================================
# UTILITÀ
# =============================================================================
def carica_json(p, predefinito):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return predefinito


def salva_json(p, d):
    tmp = Path(str(p) + ".tmp")
    tmp.write_text(json.dumps(d, indent=1, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def cartella_dati(cfg):
    if cfg.get("cartella"):
        return Path(cfg["cartella"]).expanduser()
    for n in ("Scrivania", "Desktop"):
        if (Path.home() / n / "Astronomia").is_dir():
            return Path.home() / n / "Astronomia" / "Cielo_Einstein"
    return Path.home() / "Cielo_Einstein"


def ambiente_pulito():
    """L'eseguibile di PyInstaller cambia LD_LIBRARY_PATH: il browser lanciato con quello
    può non partire. Si rimette il valore originale."""
    env = dict(os.environ)
    if getattr(sys, "frozen", False):
        for k in ("LD_LIBRARY_PATH", "LD_PRELOAD"):
            orig = env.pop(k + "_ORIG", None)
            if orig is not None:
                env[k] = orig
            else:
                env.pop(k, None)
    return env


def trova_chrome():
    for n in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"):
        w = shutil.which(n)
        if w:
            return w
    if sys.platform.startswith("win"):
        for base in (os.environ.get("PROGRAMFILES", ""), os.environ.get("PROGRAMFILES(X86)", ""),
                     os.environ.get("LOCALAPPDATA", "")):
            for rel in (r"Google\Chrome\Application\chrome.exe", r"Microsoft\Edge\Application\msedge.exe"):
                p = Path(base) / rel
                if base and p.is_file():
                    return str(p)
    return None


def apri_browser(url, schermo_intero=False, finestra=True):
    """Apre la pagina: in una finestra a sé (Chrome/Chromium/Edge, modalità app) se c'è,
    altrimenti nel browser predefinito."""
    chrome = trova_chrome() if finestra else None
    if chrome:
        arg = [chrome, f"--app={url}", "--new-window"] + (["--start-fullscreen"] if schermo_intero else [])
        try:
            subprocess.Popen(arg, env=ambiente_pulito(), start_new_session=True,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except OSError:
            pass
    if sys.platform.startswith("linux") and shutil.which("xdg-open"):
        try:
            subprocess.Popen(["xdg-open", url], env=ambiente_pulito(), start_new_session=True,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except OSError:
            pass
    webbrowser.open(url)


def gia_aperto():
    import urllib.request
    for porta in range(PORTA, PORTA + 20):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{porta}/api/info", timeout=0.5) as r:
                if json.loads(r.read()).get("nome") == NOME:
                    return f"http://127.0.0.1:{porta}/"
        except Exception:  # noqa: BLE001
            continue
    return None


def prepara_three(cartella_lib):
    """Three.js: copia da Via Lattea 3D se c'è già, altrimenti lo scarica (solo la prima volta)."""
    cartella_lib.mkdir(parents=True, exist_ok=True)
    vicini = [Path.home() / n / "Astronomia" / "Atlante_celeste" / "Via_lattea" / "lib" for n in ("Scrivania", "Desktop")]
    for nome, url in FILE_THREE.items():
        p = cartella_lib / nome
        if p.exists() and p.stat().st_size > 1000:
            continue
        for v in vicini:
            if (v / nome).is_file():
                shutil.copyfile(v / nome, p)
                break
        else:
            print(f"Scarico {nome}…", flush=True)
            dati = DC.scarica(url, timeout=120)
            if nome == "OrbitControls.js":
                dati = dati.replace(b"from 'three'", b"from './three.module.js'").replace(
                    b'from "three"', b"from './three.module.js'")
            p.write_bytes(dati)


# =============================================================================
# AGGIORNAMENTO DEI CATALOGHI IN SOTTOFONDO
# =============================================================================
class Stato:
    lock = threading.Lock()
    aggiornando = False
    messaggio = ""
    creato = ""
    ultimo_contatto = 0.0          # ultima richiesta della pagina (per chiudersi quando la finestra è chiusa)


_log_originale = DC._log


def _log(t):
    """I messaggi della preparazione finiscono anche nella pagina (barra in alto)."""
    _log_originale(t)
    with Stato.lock:
        if Stato.aggiornando:
            Stato.messaggio = str(t)


DC._log = _log


def aggiorna_in_sottofondo(dati, ritardo=3, completo=False, riscarica=False):
    """completo=False: aggiornamento all'avvio (riscarica i cataloghi più vecchi di
    ETA_AGGIORNAMENTO_ORE). completo=True: prima preparazione (la pagina aspetta)."""
    def lavoro():
        time.sleep(ritardo)                  # prima lascia aprire la pagina
        with Stato.lock:
            Stato.aggiornando = True
            Stato.messaggio = "scarico i cataloghi…" if completo else "aggiorno i cataloghi…"
        try:
            print("\nPreparo i cataloghi…\n" if completo else
                  "\nAggiorno i cataloghi in sottofondo (la pagina resta utilizzabile)…\n", flush=True)
            d, nuovi = DC.prepara(dati, riscarica=riscarica, forza=completo,
                                  max_eta_ore=DC.MAX_ETA_ORE if completo else ETA_AGGIORNAMENTO_ORE)
            with Stato.lock:
                Stato.creato = d["creato"]
                Stato.messaggio = f"cataloghi aggiornati ({nuovi} file nuovi)" if nuovi else "cataloghi già aggiornati"
        except Exception as e:  # noqa: BLE001
            with Stato.lock:
                Stato.messaggio = (f"preparazione non riuscita ({type(e).__name__}): serve Internet la prima volta"
                                   if completo else f"aggiornamento non riuscito ({type(e).__name__}): restano i dati di prima")
            print(f"Aggiornamento non riuscito: {e}")
        finally:
            with Stato.lock:
                Stato.aggiornando = False
            print(f"\n{Stato.messaggio}.", flush=True)
    t = threading.Thread(target=lavoro, daemon=True)
    t.start()
    return t


def guardiano(srv, attesa=180):
    """Chiude il programma quando la pagina non si fa più sentire da `attesa` secondi
    (finestra chiusa). Le pagine in sottofondo chiedono lo stato almeno una volta al minuto."""
    def lavoro():
        while True:
            time.sleep(10)
            with Stato.lock:
                fermo = Stato.ultimo_contatto and time.time() - Stato.ultimo_contatto > attesa and not Stato.aggiornando
            if fermo:
                print("\nLa pagina è stata chiusa: chiudo il Cielo di Einstein@Home.", flush=True)
                srv.shutdown()
                return
    threading.Thread(target=lavoro, daemon=True).start()


# =============================================================================
# SERVER LOCALE
# =============================================================================
class Gestore(SimpleHTTPRequestHandler):
    dati = Path(".")

    def log_message(self, *a):
        pass

    def _mappa(self, percorso):
        p = urllib.parse.unquote(urllib.parse.urlparse(percorso).path)
        if p in ("/", "/index.html"):
            return CARTELLA_PROGRAMMA / "web" / "index.html"
        for pref, base in (("/web/", CARTELLA_PROGRAMMA / "web"), ("/lib/", self.dati / "lib")):
            if p.startswith(pref):
                f = (base / p[len(pref):]).resolve()
                if base.resolve() in f.parents:
                    return f
        if p == "/dati/dati.json":
            return self.dati / "dati.json"
        return None

    def translate_path(self, path):
        f = self._mappa(path)
        return str(f) if f else "/nonesiste"

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _json(self, d, codice=200):
        b = json.dumps(d, ensure_ascii=False).encode()
        self.send_response(codice)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/api/info"):
            return self._json({"nome": NOME, "versione": VERSIONE, "copyright": COPYRIGHT})
        if self.path.startswith("/api/stato"):
            with Stato.lock:
                Stato.ultimo_contatto = time.time()
                return self._json({"aggiornando": Stato.aggiornando, "messaggio": Stato.messaggio,
                                   "creato": Stato.creato})
        return super().do_GET()


def avvia_server(dati, host="127.0.0.1", porte=20):
    Gestore.dati = Path(dati)
    for porta in range(PORTA, PORTA + porte):
        try:
            return ThreadingHTTPServer((host, porta), Gestore), porta
        except OSError:
            continue
    raise OSError("nessuna porta libera")


# =============================================================================
# PRINCIPALE
# =============================================================================
def scrivi_registro(dati):
    """Avviato dall'icona (senza terminale): i messaggi vanno in <dati>/cielo_einstein.log."""
    try:
        if sys.stdout is not None and sys.stdout.isatty():
            return
    except (AttributeError, ValueError):
        pass
    dati.mkdir(parents=True, exist_ok=True)
    f = open(dati / "cielo_einstein.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115
    sys.stdout = sys.stderr = f
    print(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} =====")


def main():
    arg = sys.argv[1:]
    cfg = carica_json(FILE_CONFIG, {})
    if "--cartella" in arg:
        cfg["cartella"] = arg[arg.index("--cartella") + 1]
        salva_json(FILE_CONFIG, cfg)
    dati = cartella_dati(cfg)
    scrivi_registro(dati)
    print(f"{NOME} {VERSIONE}  —  {COPYRIGHT}")
    salvaschermo = "--salvaschermo" in arg
    gia = gia_aperto()
    if gia:                                  # già in funzione: riapre solo la pagina
        print(f"È già aperto: riapro la pagina {gia}")
        if "--senza-browser" not in arg:
            apri_browser(gia + ("?salvaschermo=1" if salvaschermo else ""), salvaschermo)
        time.sleep(2)
        return
    print(f"Dati e cataloghi: {dati}")
    dati.mkdir(parents=True, exist_ok=True)
    esistenti = carica_json(dati / "dati.json", {})
    da_preparare = "--prepara" in arg or esistenti.get("versione", 0) < DC.VERSIONE_DATI
    Stato.creato = esistenti.get("creato", "")
    try:
        prepara_three(dati / "lib")
    except Exception as e:  # noqa: BLE001
        print(f"\nNon riesco a scaricare Three.js ({type(e).__name__}): serve Internet solo la prima volta.")
        return
    srv, porta = avvia_server(dati)
    url = f"http://127.0.0.1:{porta}/"
    print(f"\nPagina 3D: {url}\n(Si chiude da solo qualche minuto dopo che hai chiuso la finestra; oppure Ctrl+C.)")
    if "--senza-browser" not in arg:
        threading.Timer(0.8, lambda: apri_browser(url + ("?salvaschermo=1" if salvaschermo else ""),
                                                  salvaschermo)).start()
    if da_preparare:
        if (dati / "dati.json").exists() and esistenti.get("versione", 0) < DC.VERSIONE_DATI:
            (dati / "dati.json").unlink()            # formato vecchio: la pagina aspetta i dati nuovi
        aggiorna_in_sottofondo(dati, ritardo=0, completo=True, riscarica="--riscarica" in arg)
    elif "--senza-aggiornare" not in arg:
        aggiorna_in_sottofondo(dati)
    if "--resta-aperto" not in arg:
        guardiano(srv)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nChiuso.")


# =============================================================================
# AUTOTEST (senza rete)
# =============================================================================
def scrivi_fits(colonne, intest=None):
    """FITS minimo con una tabella binaria (per le prove). colonne: [(nome, tform, array)]."""
    import numpy as np

    def blocco(carte):
        s = "".join(c.ljust(80)[:80] for c in carte + ["END"])
        return (s + " " * (-len(s) % 2880)).encode("ascii")

    def carta(k, v):
        if isinstance(v, bool):
            v = "T" if v else "F"
        elif isinstance(v, str):
            v = "'" + v.ljust(8) + "'"
        return f"{k:<8}= {str(v):>20}"
    prim = blocco([carta("SIMPLE", True), carta("BITPIX", 8), carta("NAXIS", 0), carta("EXTEND", True)])
    tipi = {"K": ">i8", "D": ">f8", "E": ">f4", "J": ">i4"}
    n = len(colonne[0][2])
    campi = []
    for nome, tf, a in colonne:
        campi.append((nome, f"S{tf[:-1]}" if tf.endswith("A") else tipi[tf]))
    rec = np.zeros(n, dtype=campi)
    for nome, tf, a in colonne:
        rec[nome] = a
    carte = [carta("XTENSION", "BINTABLE"), carta("BITPIX", 8), carta("NAXIS", 2), carta("NAXIS1", rec.dtype.itemsize),
             carta("NAXIS2", n), carta("PCOUNT", 0), carta("GCOUNT", 1), carta("TFIELDS", len(colonne))]
    for i, (nome, tf, _) in enumerate(colonne, 1):
        carte += [carta(f"TTYPE{i}", nome), carta(f"TFORM{i}", tf)]
    for k, v in (intest or {}).items():
        carte.append(carta(k, v))
    d = rec.tobytes()
    return prim + blocco(carte) + d + b"\0" * (-len(d) % 2880)


def autotest():
    import gzip
    import io
    import tarfile
    import tempfile
    import urllib.request
    import numpy as np
    ok = True

    def v(c, t):
        nonlocal ok
        print(("[ok] " if c else "[ERRORE] ") + t)
        ok &= bool(c)

    # HEALPix: le due numerazioni danno gli stessi centri
    for ns in (1, 4, 16):
        i = np.arange(12 * ns * ns)
        a = sorted(zip(*(np.round(x, 5) for x in DC.nest_ang(ns, i))))
        b = sorted(zip(*(np.round(x, 5) for x in DC.ring_ang(ns, i))))
        v(np.allclose(np.array(a), np.array(b), atol=1e-4), f"HEALPix nest e ring coincidono (nside {ns})")
    l, b = DC.galattiche(266.405, -28.936)
    v((l < 0.2 or l > 359.8) and abs(b) < 0.2, "centro galattico in coordinate galattiche")
    v(abs(DC.sessag("05:34:31.97", ore=True) - 83.6332) < 1e-3 and abs(DC.sessag("-45:10:35") + 45.1764) < 1e-3,
      "coordinate sessagesimali")

    d = Path(tempfile.mkdtemp(prefix="cielo_einstein_"))
    cache = d / "cache"
    (cache / "gw").mkdir(parents=True)
    # --- ATNF finto
    db = ("PSRJ     J0534+2200   jpb+15\nPSRB     B0531+21    cdt69\nRAJ      05:34:31.973  5e-3 jpb+15\n"
          "DECJ     +22:00:52.06  6e-2 jpb+15\nF0       29.946923  1e-9 jpb+15\nDM       56.77118\nDIST_A   2.0\n"
          "TYPE     HE[cdt69]\nASSOC    SNR:Crab[cdt69]\n@-----\n"
          "PSRJ     J1808-2024\nRAJ      18:08:39.337\nDECJ     -20:24:39.85\nP0       7.55592\nDM       0\n"
          "TYPE     AXP[kds+98]\n@-----\n"
          "PSRJ     J0437-4715\nRAJ      04:37:15.9\nDECJ     -47:15:09.2\nP0       0.005757\nDM       2.64\n"
          "PX       6.37\nBINARY   T2\n@-----\n"
          "PSRJ     J1640+2224\nELONG    243.98896\nELAT     44.05852\nP0       0.00316\nDM       18.4\n@-----\n")
    tb = io.BytesIO()
    with tarfile.open(fileobj=tb, mode="w:gz") as t:
        x = db.encode()
        ti = tarfile.TarInfo("psrcat_tar/psrcat.db")
        ti.size = len(x)
        t.addfile(ti, io.BytesIO(x))
    (cache / "psrcat_pkg.tar.gz").write_bytes(tb.getvalue())
    # --- 4FGL finto (FITS)
    (cache / "gll_psc.fit").write_bytes(scrivi_fits([
        ("Source_Name", "18A", np.array([b"4FGL J0534.5+2200", b"4FGL J0437.2-4715", b"4FGL J1000.0+1000",
                                         b"4FGL J0633.9+1746"])),
        ("RAJ2000", "E", np.array([83.63, 69.31, 150.0, 98.48])),
        ("DEJ2000", "E", np.array([22.01, -47.25, 10.0, 17.77])),
        ("CLASS1", "5A", np.array([b"PSR", b"PSR", b"", b"PSR"])),
        ("ASSOC1", "28A", np.array([b"PSR J0534+2200", b"PSR J0437-4715", b"", b"PSR J0633+1746"]))],
        {"EXTNAME": "LAT_Point_Source_Catalog"}))
    # --- VizieR finti
    (cache / "vizier_green.tsv").write_text(
        "#RESOURCE=yCat_7297\n_RAJ2000\t_DEJ2000\tSNR\tMajDiam\ttype\tNames\ndeg\tdeg\t\tarcmin\t\t\n"
        "--------\t--------\t---\t---\t---\t---\n350.85\t58.815\tG111.7-2.1\t5\tS\tCassiopeia A\n"
        "83.633\t22.0145\tG184.6-5.8\t7\tF\tCrab Nebula\n")
    (cache / "vizier_quasar.tsv").write_text(
        "_RAJ2000\t_DEJ2000\tName\tz\tVmag\tCl\ndeg\tdeg\t\t\tmag\t\n---\t---\t---\t---\t---\t---\n"
        "187.2779\t2.0524\t3C 273\t0.158\t12.86\tQ\n")
    # --- onde gravitazionali: un evento con mappa multi-ordine finta
    gw = {"events": {"GW200129_065458-v1": {"commonName": "GW200129_065458", "GPS": 1264316116.4, "version": 1,
                                             "gracedb_id": "S200129m", "p_astro": 0.99, "mass_1_source": 34.5,
                                             "mass_2_source": 29.0, "luminosity_distance": 900.0,
                                             "catalog.shortName": "GWTC-3-confident"},
                     "GW170817-v3": {"commonName": "GW170817", "GPS": 1187008882.4, "version": 3,
                                     "gracedb_id": "G298048", "mass_1_source": 1.46, "mass_2_source": 1.27,
                                     "luminosity_distance": 40.0}}}
    (cache / "gwtc.json").write_text(json.dumps(gw))
    (cache / "gw" / "S200129m_files.json").write_text(json.dumps(
        {"bayestar.multiorder.fits": "https://x/bayestar.multiorder.fits",
         "bayestar.multiorder.fits,0": "https://x/0", "bayestar.png": "https://x/p"}))
    ordine = 3
    ns = 2 ** ordine
    ipix = np.arange(12 * ns * ns)
    ra, de = DC.nest_ang(ns, ipix)
    dist = np.degrees(np.arccos(np.clip(np.sin(np.radians(de)) * np.sin(np.radians(-10)) + np.cos(np.radians(de))
                                        * np.cos(np.radians(-10)) * np.cos(np.radians(ra - 120)), -1, 1)))
    dens = np.exp(-(dist / 12.0) ** 2)
    dens /= (dens * 4 * np.pi / len(dens)).sum()
    (cache / "gw" / "S200129m_bayestar.multiorder.fits").write_bytes(gzip.compress(scrivi_fits(
        [("UNIQ", "K", 4 * ns * ns + ipix), ("PROBDENSITY", "D", dens)], {"ORDERING": "NUNIQ"})))
    # --- cielo di fondo e Terra
    (cache / "stars.6.json").write_text(json.dumps({"features": [
        {"id": 32349, "properties": {"mag": -1.44, "bv": 0.0}, "geometry": {"coordinates": [101.29, -16.72]}},
        {"id": 1, "properties": {"mag": 6.5, "bv": 1}, "geometry": {"coordinates": [0, 0]}}]}))
    (cache / "starnames.json").write_text(json.dumps({"32349": {"name": "Sirius", "it": "Sirio"}}))
    (cache / "constellations.json").write_text(json.dumps({"features": [
        {"id": "Ori", "properties": {"name": "Orion", "rank": 1}, "geometry": {"coordinates": [83, 3]}}]}))
    (cache / "constellations.lines.json").write_text(json.dumps({"features": [
        {"id": "Ori", "geometry": {"coordinates": [[[88.79, 7.41], [-81.28, 6.35]]]}}]}))
    (cache / "mw.json").write_text(json.dumps({"features": [
        {"id": "ol1", "geometry": {"type": "MultiPolygon", "coordinates": [[[[0, 60], [90, 30], [180, -60], [0, 60]]]]}}]}))
    (cache / "land-110m.json").write_text(json.dumps({
        "type": "Topology", "transform": {"scale": [0.1, 0.1], "translate": [-180, -90]},
        "arcs": [[[1800, 900], [100, 0], [0, 100], [-100, 0], [0, -100]]],
        "objects": {"land": {"type": "GeometryCollection", "geometries": [{"type": "Polygon", "arcs": [[0]]}]}}}))
    DC.scarica = lambda *a, **k: (_ for _ in ()).throw(OSError("niente rete"))
    dati, _ = DC.prepara(d, max_eta_ore=1e9)
    P = {r[0]: r for r in dati["pulsar"]["righe"]}
    v(len(P) == 4 and abs(P["J0534+2200"][4] - 0.033392) < 1e-5, "pulsar ATNF lette (periodo da F0)")
    v(abs(P["J1640+2224"][2] - 250.07) < 0.05 and abs(P["J1640+2224"][3] - 22.40) < 0.05,
      "pulsar con sole coordinate eclittiche")
    v(P["J0534+2200"][11] == 1 and P["J0437-4715"][11] == 1, "pulsar gamma riconosciute da 4FGL")
    v(P["J1808-2024"][12] == 1, "magnetar riconosciuta (tipo AXP)")
    v(abs(P["J0437-4715"][6] - 0.157) < 0.01 and P["J0437-4715"][7] == 0, "distanza dalla parallasse")
    F = {r[0]: r for r in dati["fermi"]["righe"]}
    v("4FGL J1000.0+1000" in F and "4FGL J0633.9+1746" in F and "4FGL J0534.5+2200" not in F,
      "Fermi: senza identificazione + pulsar gamma non in ATNF")
    v(len(dati["snr"]["righe"]) == 2 and dati["quasar"]["righe"][0][0] == "3C 273", "resti di supernova e quasar")
    O = {e["nome"]: e for e in dati["onde"]}
    e = O.get("GW200129_065458", {})
    v(e and abs(e["picco"][0] - 120) < 12 and abs(e["picco"][1] + 10) < 12, "mappa GW: punto più probabile giusto")
    v(e and 700 < e["area"] < 1400 and len(e["punti"]) == DC.MAX_PUNTI_GW, f"mappa GW: area al 90 % ({e.get('area')} gradi²)")
    v("GW170817" in O and O["GW170817"]["picco"] == [197.45, -23.38], "GW170817 con la sua galassia")
    v(len(dati["stelle"]) == 1 and dati["stelle"][0][4] == "Sirio", "stelle con i nomi")
    v(dati["costellazioni"][0]["linee"][0][1][0] == 278.72, "linee delle costellazioni")
    v(len(dati["terra"]) == 1 and len(dati["terra"][0]) == 5, "contorni della Terra (TopoJSON)")
    # server
    lib = d / "lib"
    lib.mkdir()
    (lib / "three.module.js").write_text("export {};")
    srv, porta = avvia_server(d)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{porta}"
    v(b"Cielo di Einstein" in urllib.request.urlopen(base + "/").read(), "pagina servita")
    v(json.loads(urllib.request.urlopen(base + "/dati/dati.json").read())["versione"] == DC.VERSIONE_DATI, "dati serviti")
    v(json.loads(urllib.request.urlopen(base + "/api/info").read())["nome"] == NOME, "api/info")
    try:
        urllib.request.urlopen(base + "/web/../cielo_einstein.py")
        v(False, "file fuori da web/ non serviti")
    except Exception:  # noqa: BLE001
        v(True, "file fuori da web/ non serviti")
    # aggiornamento in sottofondo (senza rete: restano i dati di prima)
    aggiorna_in_sottofondo(d, ritardo=0).join(60)
    st = json.loads(urllib.request.urlopen(base + "/api/stato").read())
    v(not st["aggiornando"] and st["creato"], f"aggiornamento in sottofondo ({st['messaggio']})")
    srv.shutdown()
    prima = (d / "dati.json").read_text(encoding="utf-8")
    DC.prepara(d, max_eta_ore=1e9)
    v((d / "dati.json").read_text(encoding="utf-8") == prima, "nessun file nuovo: dati.json non riscritto")
    (cache / "vizier_green.tsv").unlink()
    dd, _ = DC.prepara(d, max_eta_ore=1e9, forza=True)
    v(len(dd["snr"]["righe"]) == 2 and "precedenti" in dd["fonti"]["snr"], "strato non scaricato: tenuti i dati di prima")
    print("AUTOTEST SUPERATO" if ok else "AUTOTEST FALLITO")
    return d if ok else None


if __name__ == "__main__":
    if "--autotest" in sys.argv:
        if sys.stdout is None:               # eseguibile Windows senza console: risultato in autotest.txt
            sys.stdout = sys.stderr = open("autotest.txt", "w", encoding="utf-8")  # noqa: SIM115
        sys.exit(0 if autotest() else 1)
    main()
