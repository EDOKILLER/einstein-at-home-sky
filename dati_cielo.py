# -*- coding: utf-8 -*-
"""
CIELO DI EINSTEIN@HOME - PREPARAZIONE DEI DATI
==============================================
© 2026 Edoardo Battistel

Scarica i cataloghi e prepara dati.json per la pagina 3D:
  - pulsar radio e magnetar      ATNF Pulsar Catalogue (psrcat_pkg.tar.gz; riserva: VizieR B/psr)
  - pulsar gamma e sorgenti      Fermi-LAT 4FGL-DR4 (FITS del FSSC; riserva: VizieR 4FGL-DR3)
    gamma senza identificazione
  - resti di supernova           catalogo di Green (VizieR VII/297)
  - quasar brillanti             Véron-Cetty & Véron 13a ed. (VizieR VII/258), V < 16,5
  - onde gravitazionali          GWOSC (catalogo GWTC) + mappe di cielo di GraceDB
  - stelle, costellazioni,       d3-celestial (stelle fino alla magnitudine 6, linee, nomi,
    Via Lattea                   contorni della Via Lattea)
  - continenti                   world-atlas (Natural Earth 1:110 milioni)

Ogni file scaricato resta in <cartella>/cache: si riscarica solo se è più vecchio di
MAX_ETA_ORE (o con riscarica=True). Se un catalogo non si può scaricare si usa la copia
in cache; se non c'è nemmeno quella, quello strato manca e la pagina lo dice.

Niente astropy: i file FITS (4FGL, mappe delle onde gravitazionali) si leggono con
leggi_fits() qui sotto, e HEALPix è calcolato a mano (nest e ring). Serve solo numpy.
"""

import gzip
import io
import json
import math
import os
import re
import tarfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

VERSIONE_DATI = 1
MAX_ETA_ORE = 20                 # un catalogo scaricato da meno di così non si riscarica
UA = "CieloEinstein/1.0 (programma personale di Edoardo Battistel; Python urllib)"

URL_ATNF = ["https://www.atnf.csiro.au/research/pulsar/psrcat/downloads/psrcat_pkg.tar.gz"]
URL_4FGL = [f"https://fermi.gsfc.nasa.gov/ssc/data/access/lat/14yr_catalog/gll_psc_v{v}.fit"
            for v in (35, 34, 33, 32)]
# prima lo specchio di Harvard: da casa di Edoardo Strasburgo (CDS) non si raggiunge
URL_VIZIER = ["https://vizier.cfa.harvard.edu/viz-bin/asu-tsv", "https://vizier.cds.unistra.fr/viz-bin/asu-tsv"]
URL_GWOSC = "https://gwosc.org/eventapi/jsonfull/GWTC/"
URL_GRACEDB = "https://gracedb.ligo.org/api/superevents/{}/files/"
URL_CELESTIAL = "https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/"
URL_TERRA = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json"

MAG_STELLE = 5.8
V_QUASAR = 16.5
MAX_PUNTI_GW = 450


def _log(t):
    print(f"[{datetime.now():%H:%M:%S}] {t}", flush=True)


# =============================================================================
# SCARICAMENTO CON CACHE
# =============================================================================
def scarica(url, dati=None, timeout=90, tentativi=3):
    err = None
    for k in range(tentativi):
        try:
            req = urllib.request.Request(url, data=dati, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 404, 410):
                raise
            err = e
        except Exception as e:  # noqa: BLE001 - rete, SSL, timeout…
            err = e
        time.sleep(2 * (k + 1))
    raise err


class Cache:
    """File scaricati in <cartella>/cache, riusati se recenti (o se la rete manca)."""

    def __init__(self, cartella, riscarica=False, max_eta_ore=MAX_ETA_ORE):
        self.dir = Path(cartella) / "cache"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.riscarica = riscarica
        self.max_eta = max_eta_ore * 3600
        self.nuovi = 0

    def prendi(self, nome, urls, timeout=120, recente=None, valida=None):
        """Bytes del file `nome`: dalla cache se è recente, altrimenti dal primo URL che risponde.
        recente=False: usa sempre la copia in cache se c'è (file che non cambiano, come le mappe GW)."""
        p = self.dir / nome
        eta = time.time() - p.stat().st_mtime if p.exists() else None
        if eta is not None and not self.riscarica and (recente is False or eta < self.max_eta):
            return p.read_bytes()
        err = None
        for u in ([urls] if isinstance(urls, str) else urls):
            try:
                b = scarica(u, timeout=timeout)
                if valida and not valida(b):
                    raise ValueError("contenuto inatteso")
                tmp = p.with_suffix(p.suffix + ".tmp")
                tmp.write_bytes(b)
                os.replace(tmp, p)
                self.nuovi += 1
                return b
            except Exception as e:  # noqa: BLE001
                err = e
        if p.exists():
            _log(f"   {nome}: non scaricato ({type(err).__name__}), uso la copia del "
                 f"{datetime.fromtimestamp(p.stat().st_mtime):%d/%m/%Y}")
            return p.read_bytes()
        raise err


# =============================================================================
# LETTURA DI FILE FITS (tabelle binarie), SENZA ASTROPY
# =============================================================================
_TIPI_FITS = {"L": "i1", "B": "u1", "I": ">i2", "J": ">i4", "K": ">i8", "E": ">f4", "D": ">f8",
              "C": ">c8", "M": ">c16"}


def _valore_fits(v):
    v = v.strip()
    if v.startswith("'"):
        return v[1:v.rfind("'")].replace("''", "'").rstrip()
    if v in ("T", "F"):
        return v == "T"
    try:
        return int(v)
    except ValueError:
        try:
            return float(v.replace("D", "E"))
        except ValueError:
            return v


def _intestazione(b, pos):
    h = {}
    while True:
        blocco = b[pos:pos + 2880]
        if len(blocco) < 2880:
            raise ValueError("FITS troncato")
        pos += 2880
        fine = False
        for i in range(0, 2880, 80):
            c = blocco[i:i + 80].decode("ascii", "replace")
            k = c[:8].strip()
            if k == "END":
                fine = True
                break
            if c[8:10] == "= ":
                v = c[10:]
                if not v.lstrip().startswith("'") and "/" in v:
                    v = v[:v.index("/")]
                elif v.lstrip().startswith("'"):
                    m = re.match(r"\s*('(?:[^']|'')*')", v)
                    v = m.group(1) if m else v
                h[k] = _valore_fits(v)
        if fine:
            return h, pos


def leggi_fits(b, estensione=None):
    """Prima tabella binaria (o quella con EXTNAME = estensione) di un FITS (anche .gz).
    Restituisce (intestazione, {colonna: array numpy})."""
    if b[:2] == b"\x1f\x8b":
        b = gzip.decompress(b)
    pos = 0
    while pos < len(b):
        h, pos = _intestazione(b, pos)
        naxis = [h.get(f"NAXIS{i}", 0) for i in range(1, h.get("NAXIS", 0) + 1)]
        n = abs(h.get("BITPIX", 8)) // 8 * h.get("GCOUNT", 1) * (h.get("PCOUNT", 0) + (math.prod(naxis) if naxis else 0))
        if h.get("XTENSION") == "BINTABLE" and (estensione is None or h.get("EXTNAME") == estensione):
            nomi, formati, off = [], [], 0
            for i in range(1, h["TFIELDS"] + 1):
                m = re.match(r"(\d*)([LXBIJKAEDCMPQ])", str(h[f"TFORM{i}"]).strip())
                r, t = int(m.group(1) or 1), m.group(2)
                if t == "A":
                    dt, larg = f"S{r}", r
                elif t == "X":
                    dt, larg = f"V{(r + 7) // 8}", (r + 7) // 8
                elif t in "PQ":
                    larg = 8 if t == "P" else 16
                    dt = f"V{larg}"
                else:
                    dt = (_TIPI_FITS[t], (r,)) if r > 1 else _TIPI_FITS[t]
                    larg = np.dtype(_TIPI_FITS[t]).itemsize * r
                if r == 0:
                    continue
                nomi.append(h.get(f"TTYPE{i}", f"COL{i}"))
                formati.append((dt, off))
                off += larg
            dtype = np.dtype({"names": nomi, "formats": [f[0] for f in formati], "offsets": [f[1] for f in formati],
                              "itemsize": h["NAXIS1"]})
            tab = np.frombuffer(b, dtype=dtype, count=h["NAXIS2"], offset=pos)
            col = {}
            for k in nomi:
                a = tab[k]
                if a.dtype.kind == "S":
                    a = np.char.strip(np.char.decode(a, "ascii", "replace"))
                elif a.dtype.kind in "iuf":
                    a = a.astype(a.dtype.newbyteorder("="))
                col[k] = a
            return h, col
        pos += -(-n // 2880) * 2880
    raise ValueError("nessuna tabella binaria nel FITS")


# =============================================================================
# HEALPIX (centri dei pixel), NEST E RING
# =============================================================================
_JRLL = np.array([2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4])
_JPLL = np.array([1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7])


def _compatta(x):
    x = x & np.uint64(0x5555555555555555)
    for s, m in ((1, 0x3333333333333333), (2, 0x0F0F0F0F0F0F0F0F), (4, 0x00FF00FF00FF00FF),
                 (8, 0x0000FFFF0000FFFF), (16, 0x00000000FFFFFFFF)):
        x = (x | (x >> np.uint64(s))) & np.uint64(m)
    return x


def nest_ang(nside, ipix):
    """(ra, dec) in gradi dei centri dei pixel NESTED. nside può essere un array."""
    ipix = np.asarray(ipix, dtype=np.int64)
    nside = np.broadcast_to(np.asarray(nside, dtype=np.int64), ipix.shape)
    npface = nside * nside
    faccia = ipix // npface
    ipf = (ipix % npface).astype(np.uint64)
    ix = _compatta(ipf).astype(np.int64)
    iy = _compatta(ipf >> np.uint64(1)).astype(np.int64)
    jrt, jpt = ix + iy, ix - iy
    jr = _JRLL[faccia] * nside - jrt - 1
    nl4 = 4 * nside
    z = np.empty(ipix.shape)
    nr = np.empty(ipix.shape, dtype=np.int64)
    kshift = np.zeros(ipix.shape, dtype=np.int64)
    a = jr < nside
    nr[a] = jr[a]
    z[a] = 1 - nr[a] ** 2 / (3.0 * npface[a])
    c = jr > 3 * nside
    nr[c] = nl4[c] - jr[c]
    z[c] = nr[c] ** 2 / (3.0 * npface[c]) - 1
    e = ~(a | c)
    nr[e] = nside[e]
    z[e] = (2 * nside[e] - jr[e]) * 2.0 / (3.0 * nside[e])
    kshift[e] = (jr[e] - nside[e]) & 1
    jp = (_JPLL[faccia] * nr + jpt + 1 + kshift) // 2
    jp = np.where(jp > nl4, jp - nl4, jp)
    jp = np.where(jp < 1, jp + nl4, jp)
    phi = (jp - (kshift + 1) * 0.5) * (np.pi / 2 / nr)
    return np.degrees(phi) % 360, np.degrees(np.arcsin(np.clip(z, -1, 1)))


def ring_ang(nside, ipix):
    ipix = np.asarray(ipix, dtype=np.int64)
    n = int(nside)
    npix, ncap = 12 * n * n, 2 * n * (n - 1)
    z = np.empty(ipix.shape)
    phi = np.empty(ipix.shape)
    a = ipix < ncap
    ir = np.floor((1 + np.sqrt(1 + 2 * ipix[a])) / 2).astype(np.int64)
    ip = ipix[a] + 1 - 2 * ir * (ir - 1)
    z[a] = 1 - ir ** 2 / (3.0 * n * n)
    phi[a] = (ip - 0.5) * np.pi / (2 * ir)
    c = ipix >= npix - ncap
    q = npix - ipix[c]
    ir = np.floor((1 + np.sqrt(2 * q - 1)) / 2).astype(np.int64)
    ip = 4 * ir + 1 - (q - 2 * ir * (ir - 1))
    z[c] = -1 + ir ** 2 / (3.0 * n * n)
    phi[c] = (ip - 0.5) * np.pi / (2 * ir)
    e = ~(a | c)
    q = ipix[e] - ncap
    ir = q // (4 * n) + n
    ip = q % (4 * n) + 1
    fodd = np.where((ir + n) & 1, 1.0, 0.5)
    z[e] = (2 * n - ir) * 2.0 / (3.0 * n)
    phi[e] = (ip - fodd) * np.pi / (2 * n)
    return np.degrees(phi) % 360, np.degrees(np.arcsin(np.clip(z, -1, 1)))


def regione_cielo(h, col, rng):
    """Dalla mappa di probabilità (multi-ordine o piatta) ricava: area al 90 %, punto più
    probabile e fino a MAX_PUNTI_GW punti [ra, dec, livello] (livello 1 = dentro il 50 %)."""
    if "UNIQ" in col:
        uniq = col["UNIQ"].astype(np.int64)
        ordine = (np.floor(np.log2(uniq / 4.0) / 2)).astype(np.int64)
        nside = 2 ** ordine
        ipix = uniq - 4 * nside * nside
        area = 4 * np.pi / (12.0 * nside * nside)
        dens = col["PROBDENSITY"].astype(float)
        prob = dens * area
        ra, dec = nest_ang(nside, ipix)
    else:
        prob = np.ravel(col.get("PROB", col.get("PROBABILITY", next(iter(col.values()))))).astype(float)
        nside = int(h.get("NSIDE") or round(math.sqrt(len(prob) / 12)))
        if str(h.get("ORDERING", "RING")).upper().startswith("NEST"):
            ra_f, dec_f = lambda i: nest_ang(nside, i), None
        else:
            ra_f = lambda i: ring_ang(nside, i)  # noqa: E731
        area = np.full(len(prob), 4 * np.pi / len(prob))
        dens = prob / area
        ra = dec = None
    ordine_p = np.argsort(dens)[::-1]                # dalla densità più alta
    cum = np.cumsum(prob[ordine_p])
    cum /= cum[-1]
    n90 = int(np.searchsorted(cum, 0.9)) + 1
    n50 = int(np.searchsorted(cum, 0.5)) + 1
    dentro = ordine_p[:n90]
    a_dentro = area[dentro]
    area90 = float(a_dentro.sum() * (180 / np.pi) ** 2)
    k = MAX_PUNTI_GW                                  # sempre lo stesso numero di punti (con ripetizioni se i pixel sono pochi)
    scelti_idx = rng.choice(len(dentro), size=k, replace=len(dentro) < k, p=a_dentro / a_dentro.sum())
    scelti = dentro[scelti_idx]
    livello = (scelti_idx < n50).astype(int)
    if ra is None:
        r_s, d_s = ra_f(scelti)
        r_p, d_p = ra_f(ordine_p[:1])
    else:
        r_s, d_s = ra[scelti], dec[scelti]
        r_p, d_p = ra[ordine_p[:1]], dec[ordine_p[:1]]
    # un po' di dispersione dentro il pixel, così i punti non sono allineati sulla griglia
    lato = np.degrees(np.sqrt(area[scelti]))
    d_s = np.clip(d_s + rng.uniform(-0.5, 0.5, k) * lato, -90, 90)
    r_s = (r_s + rng.uniform(-0.5, 0.5, k) * lato / np.maximum(np.cos(np.radians(d_s)), 0.05)) % 360
    punti = [[round(float(a), 2), round(float(b), 2), int(c)] for a, b, c in zip(r_s, d_s, livello)]
    return round(area90), [round(float(r_p[0]), 2), round(float(d_p[0]), 2)], punti


# =============================================================================
# COORDINATE
# =============================================================================
def sessag(v, ore=False):
    """'05:34:31.97', '05 34 31.97', '+22:00:52' oppure decimale -> gradi."""
    s = str(v).strip()
    if not s:
        return None
    if re.search(r"[:\s]", s):
        p = re.split(r"[:\s]+", s)
        neg = p[0].startswith("-")
        x = abs(float(p[0])) + (float(p[1]) / 60 if len(p) > 1 and p[1] else 0) + (float(p[2]) / 3600 if len(p) > 2 and p[2] else 0)
        x = -x if neg else x
        return x * 15 if ore else x
    return float(s) * (15 if ore else 1)


_GAL = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
                 [+0.4941094279, -0.4448296300, +0.7469822445],
                 [-0.8676661490, -0.1980763734, +0.4559837762]])


def galattiche(ra, dec):
    a, d = math.radians(ra), math.radians(dec)
    v = _GAL @ np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])
    return math.degrees(math.atan2(v[1], v[0])) % 360, math.degrees(math.asin(max(-1, min(1, v[2]))))


def da_eclittiche(lon, lat):
    e, l, b = math.radians(23.4392911), math.radians(lon), math.radians(lat)
    x = math.cos(b) * math.cos(l)
    y = math.cos(b) * math.sin(l) * math.cos(e) - math.sin(b) * math.sin(e)
    z = math.cos(b) * math.sin(l) * math.sin(e) + math.sin(b) * math.cos(e)
    return math.degrees(math.atan2(y, x)) % 360, math.degrees(math.asin(max(-1, min(1, z))))


def _num(x):
    try:
        f = float(str(x).strip().split()[0])
        return f if math.isfinite(f) else None
    except (ValueError, IndexError):
        return None


# =============================================================================
# VIZIER (tabelle TSV)
# =============================================================================
def leggi_tsv(testo):
    """Tutte le tabelle di una risposta asu-tsv: lista di liste di dizionari."""
    tabelle, righe, intest, fase = [], [], None, 0
    for r in testo.splitlines():
        if r.startswith("#"):
            if intest and righe:
                tabelle.append(righe)
            righe, intest, fase = [], None, 0
            continue
        if not r.strip():
            if intest and righe:
                tabelle.append(righe)
                righe, intest, fase = [], None, 0
            continue
        if intest is None:
            intest = [c.strip() for c in r.split("\t")]
            fase = 1
            continue
        if fase in (1, 2) and set(r.replace("\t", "").strip()) <= set("-"):
            fase = 3
            continue
        if fase == 1:
            fase = 2                                   # riga delle unità
            continue
        if fase == 3:
            v = r.split("\t")
            righe.append({k: (v[i].strip() if i < len(v) else "") for i, k in enumerate(intest)})
    if intest and righe:
        tabelle.append(righe)
    return tabelle


def vizier(cache, nome, sorgente, vincoli=None, richieste=()):
    par = [("-source", sorgente), ("-out.all", ""), ("-out.add", "_RAJ,_DEJ"), ("-oc.form", "d"),
           ("-out.max", "unlimited")] + list((vincoli or {}).items())
    urls = [u + "?" + urllib.parse.urlencode(par) for u in URL_VIZIER]
    b = cache.prendi(nome, urls, timeout=180, valida=lambda b: b"\t" in b)
    tab = leggi_tsv(b.decode("utf-8", "replace"))
    for t in tab:                                      # la prima tabella con le colonne che servono
        if all(any(c in t[0] for c in alt) for alt in richieste):
            return t
    if not tab:
        raise ValueError(f"VizieR {sorgente}: nessuna riga")
    return tab[0]


def colonna(riga, *nomi):
    for n in nomi:
        if n in riga and riga[n] != "":
            return riga[n]
    low = {k.lower(): v for k, v in riga.items()}
    for n in nomi:
        if n.lower() in low and low[n.lower()] != "":
            return low[n.lower()]
    return ""


def posizione(r, ra_ore=True):
    ra = colonna(r, "_RAJ2000", "_RA", "_RA.icrs")
    de = colonna(r, "_DEJ2000", "_DE", "_DE.icrs")
    if ra and de:
        return float(ra), float(de)
    ra = sessag(colonna(r, "RAJ2000", "RA_ICRS", "RAJ"), ore=ra_ore)
    de = sessag(colonna(r, "DEJ2000", "DE_ICRS", "DECJ"))
    return ra, de


# =============================================================================
# PULSAR (ATNF)
# =============================================================================
def leggi_psrcat(testo):
    tutte, cur = [], {}
    for r in testo.splitlines():
        if r.startswith("@"):
            if cur:
                tutte.append(cur)
            cur = {}
            continue
        if not r.strip() or r.startswith("#"):
            continue
        p = r.split()
        cur[p[0]] = p[1] if len(p) > 1 else ""
    if cur:
        tutte.append(cur)
    return tutte


def pulsar_atnf(cache):
    try:
        b = cache.prendi("psrcat_pkg.tar.gz", URL_ATNF, timeout=180)
        with tarfile.open(fileobj=io.BytesIO(b), mode="r:gz") as t:
            m = next(m for m in t.getmembers() if m.name.endswith("psrcat.db"))
            testo = t.extractfile(m).read().decode("latin-1")
        grezze = leggi_psrcat(testo)
        fonte = "ATNF Pulsar Catalogue (psrcat.db)"
    except Exception as e:  # noqa: BLE001
        _log(f"   ATNF non disponibile ({type(e).__name__}: {e}); provo VizieR B/psr")
        grezze = []
        for r in vizier(cache, "vizier_atnf.tsv", "B/psr/psr", richieste=(("PSRJ", "Name"),)):
            ra, de = posizione(r)
            grezze.append({"PSRJ": colonna(r, "PSRJ", "Name"), "PSRB": colonna(r, "PSRB"), "_ra": ra, "_dec": de,
                           "P0": colonna(r, "P0", "Period"), "DM": colonna(r, "DM"), "DIST": colonna(r, "Dist", "DIST"),
                           "TYPE": colonna(r, "Type", "TYPE"), "ASSOC": colonna(r, "Assoc", "ASSOC"),
                           "BINARY": colonna(r, "Binary", "BINARY")})
        fonte = "ATNF Pulsar Catalogue (copia VizieR B/psr)"
    pulsar = []
    for g in grezze:
        nome = g.get("PSRJ") or g.get("NAME")
        if not nome:
            continue
        try:
            ra = g["_ra"] if "_ra" in g else sessag(g.get("RAJ", ""), ore=True)
            de = g["_dec"] if "_dec" in g else sessag(g.get("DECJ", ""))
            if (ra is None or de is None) and _num(g.get("ELONG")) is not None and _num(g.get("ELAT")) is not None:
                ra, de = da_eclittiche(_num(g["ELONG"]), _num(g["ELAT"]))   # alcune pulsar hanno solo queste
        except ValueError:
            continue
        if ra is None or de is None:
            continue
        p0 = _num(g.get("P0"))
        if p0 is None and _num(g.get("F0")):
            p0 = 1 / _num(g.get("F0"))
        dm = _num(g.get("DM"))
        dist, stato = None, 2
        if _num(g.get("DIST_A")):
            dist, stato = _num(g["DIST_A"]), 0
        elif _num(g.get("PX")) and _num(g["PX"]) > 0.05:
            dist, stato = 1 / _num(g["PX"]), 0
        elif _num(g.get("DIST")):
            dist, stato = _num(g["DIST"]), 1
        elif _num(g.get("DIST_DM")):
            dist, stato = _num(g["DIST_DM"]), 1
        elif dm:
            dist, stato = min(dm / 30.0, 30.0), 2      # stima grossolana: 0,03 elettroni/cm³
        tipo = re.sub(r"\[[^\]]*\]", "", g.get("TYPE", "") or "")
        assoc = re.sub(r"\[[^\]]*\]", "", g.get("ASSOC", "") or "")
        pulsar.append({"nome": nome if nome.startswith(("J", "B")) else "J" + nome, "b": g.get("PSRB", ""),
                       "ra": ra, "dec": de, "p": p0, "dm": dm, "dist": dist, "stato": stato, "tipo": tipo,
                       "assoc": assoc, "bin": re.sub(r"\[[^\]]*\]", "", g.get("BINARY", "") or ""),
                       "gamma": 0})
    _log(f"Pulsar ATNF: {len(pulsar)} (magnetar: {sum('AXP' in p['tipo'] for p in pulsar)})")
    return pulsar, fonte


# =============================================================================
# FERMI-LAT 4FGL
# =============================================================================
def sorgenti_fermi(cache):
    try:
        b = cache.prendi("gll_psc.fit", URL_4FGL, timeout=300, valida=lambda b: b[:6] == b"SIMPLE")
        h, c = leggi_fits(b, "LAT_Point_Source_Catalog")
        righe = [{"nome": str(c["Source_Name"][i]), "ra": float(c["RAJ2000"][i]), "dec": float(c["DEJ2000"][i]),
                  "classe": str(c["CLASS1"][i]).strip(), "assoc": str(c["ASSOC1"][i]).strip()}
                 for i in range(len(c["Source_Name"]))]
        fonte = "Fermi-LAT 4FGL-DR4 (" + str(h.get("CDS-NAME") or h.get("EXTNAME") or "FSSC") + ")"
    except Exception as e:  # noqa: BLE001
        _log(f"   4FGL-DR4 non disponibile ({type(e).__name__}: {e}); provo VizieR 4FGL-DR3")
        righe = []
        for r in vizier(cache, "vizier_4fgl.tsv", "J/ApJS/260/53", richieste=(("Class1", "CLASS1"),)):
            ra, de = posizione(r)
            righe.append({"nome": "4FGL " + colonna(r, "4FGL", "Name", "Source_Name").replace("4FGL ", ""),
                          "ra": ra, "dec": de, "classe": colonna(r, "Class1", "CLASS1"),
                          "assoc": colonna(r, "Assoc1", "ASSOC1")})
        fonte = "Fermi-LAT 4FGL-DR3 (VizieR J/ApJS/260/53)"
    _log(f"Sorgenti Fermi-LAT: {len(righe)}")
    return righe, fonte


# =============================================================================
# ONDE GRAVITAZIONALI
# =============================================================================
GW170817 = {"punti": [[197.45, -23.38, 1]], "picco": [197.45, -23.38], "area": 0,
            "nota": "Posizione esatta: la galassia NGC 4993, trovata dai telescopi dopo l'allarme (kilonova AT 2017gfo)."}


def da_gps(gps):
    salti = 18 if gps > 1167264018 else 17
    return datetime(1980, 1, 6, tzinfo=timezone.utc) + timedelta(seconds=gps - salti)


def scegli_mappa(files):
    nomi = [n for n in (files if isinstance(files, (dict, list)) else []) if "," not in n]
    pref = ("Publication", "Bilby", "LALInference", "RapidPE", "bayestar", "")
    for multi in (True, False):
        for p in pref:
            for n in sorted(nomi):
                if p in n and (n.endswith(".multiorder.fits") if multi else n.endswith(".fits.gz")) and "volume" not in n:
                    return n
    return None


def onde_gravitazionali(cache):
    js = json.loads(cache.prendi("gwtc.json", URL_GWOSC, timeout=180))
    eventi = {}
    for chiave, e in js.get("events", {}).items():
        nome = e.get("commonName") or chiave.split("-v")[0]
        if (e.get("p_astro") is not None and e["p_astro"] < 0.5) or not nome.startswith("GW"):
            continue
        if nome not in eventi or (e.get("version") or 0) > (eventi[nome].get("version") or 0):
            eventi[nome] = e
    rng = np.random.default_rng(17)
    out, senza = [], 0
    for k, (nome, e) in enumerate(sorted(eventi.items(), key=lambda x: x[1].get("GPS") or 0)):
        gid = str(e.get("gracedb_id") or "")
        reg = None
        if nome == "GW170817":
            reg = GW170817
        elif gid.startswith("S"):
            try:
                files = json.loads(cache.prendi(f"gw/{gid}_files.json", URL_GRACEDB.format(gid), recente=False))
                mappa = scegli_mappa(files)
                if mappa:
                    url = files[mappa] if isinstance(files, dict) else URL_GRACEDB.format(gid) + mappa
                    b = cache.prendi(f"gw/{gid}_{mappa}", url, timeout=300, recente=False)
                    h, c = leggi_fits(b)
                    area, picco, punti = regione_cielo(h, c, rng)
                    reg = {"punti": punti, "picco": picco, "area": area, "mappa": mappa}
                time.sleep(0.2)
            except Exception as ex:  # noqa: BLE001
                _log(f"   {nome} ({gid}): mappa non disponibile ({type(ex).__name__})")
        if reg is None:
            senza += 1
            continue
        m1, m2 = e.get("mass_1_source"), e.get("mass_2_source")
        out.append({"nome": nome, "gracedb": gid, "data": da_gps(float(e.get("GPS") or 0)).strftime("%Y-%m-%d %H:%M"),
                    "catalogo": (e.get("catalog.shortName") or ""), "m1": m1, "m2": m2,
                    "mtot": e.get("total_mass_source"), "mfin": e.get("final_mass_source"),
                    "dist": e.get("luminosity_distance"), "snr": e.get("network_matched_filter_snr"),
                    "z": e.get("redshift"), **reg})
        if (k + 1) % 20 == 0:
            print(f"\r   onde gravitazionali {k + 1}/{len(eventi)}   ", end="", flush=True)
    print()
    _log(f"Onde gravitazionali: {len(out)} eventi con la mappa del cielo ({senza} senza mappa pubblica)")
    return out


# =============================================================================
# STELLE, COSTELLAZIONI, VIA LATTEA, TERRA
# =============================================================================
def _ra(lon):
    return round(lon % 360, 3)


def cielo_di_fondo(cache):
    stelle_js = json.loads(cache.prendi("stars.6.json", URL_CELESTIAL + "stars.6.json"))
    nomi = {}
    try:
        nomi = json.loads(cache.prendi("starnames.json", URL_CELESTIAL + "starnames.json"))
    except Exception:  # noqa: BLE001
        pass
    stelle = []
    for f in stelle_js["features"]:
        m = f["properties"].get("mag")
        if m is None or m > MAG_STELLE:
            continue
        lon, lat = f["geometry"]["coordinates"]
        n = nomi.get(str(f.get("id")), {})
        nome = n.get("it") or n.get("name") or "" if isinstance(n, dict) else ""
        bv = f["properties"].get("bv")
        stelle.append([_ra(lon), round(lat, 3), round(m, 2), round(float(bv), 2) if bv not in (None, "") else 0.6, nome])
    cost_js = json.loads(cache.prendi("constellations.json", URL_CELESTIAL + "constellations.json"))
    linee_js = json.loads(cache.prendi("constellations.lines.json", URL_CELESTIAL + "constellations.lines.json"))
    linee = {f["id"]: f["geometry"]["coordinates"] for f in linee_js["features"]}
    costellazioni = []
    for f in cost_js["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        costellazioni.append({"id": f["id"], "nome": p.get("it") or p.get("name") or f["id"], "latino": p.get("name", ""),
                              "ra": _ra(lon), "dec": round(lat, 2), "rank": int(p.get("rank") or 3),
                              "linee": [[[_ra(a), round(b, 2)] for a, b in l] for l in linee.get(f["id"], [])]})
    mw = json.loads(cache.prendi("mw.json", URL_CELESTIAL + "mw.json"))
    via_lattea = []
    for f in mw["features"]:
        liv = int(re.sub(r"\D", "", str(f.get("id"))) or 1)
        g = f["geometry"]
        polig = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        via_lattea.append({"livello": liv, "poligoni": [[[[round(a, 2), round(b, 2)] for a, b in anello] for anello in pol]
                                                        for pol in polig]})
    _log(f"Cielo di fondo: {len(stelle)} stelle, {len(costellazioni)} costellazioni, "
         f"{len(via_lattea)} livelli della Via Lattea")
    return stelle, costellazioni, via_lattea


def terra(cache):
    """Contorni dei continenti (TopoJSON di world-atlas decodificato a mano)."""
    t = json.loads(cache.prendi("land-110m.json", URL_TERRA))
    sx, sy = t["transform"]["scale"]
    tx, ty = t["transform"]["translate"]
    archi = []
    for a in t["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append([round(x * sx + tx, 2), round(y * sy + ty, 2)])
        archi.append(pts)

    def anello(indici):
        out = []
        for i in indici:
            pts = archi[i] if i >= 0 else archi[~i][::-1]
            out.extend(pts if not out else pts[1:])
        return out

    anelli = []

    def geom(g):
        if g["type"] == "GeometryCollection":
            for x in g["geometries"]:
                geom(x)
        elif g["type"] == "Polygon":
            anelli.extend(anello(r) for r in g["arcs"][:1])
        elif g["type"] == "MultiPolygon":
            for pol in g["arcs"]:
                anelli.extend(anello(r) for r in pol[:1])
    for o in t["objects"].values():
        geom(o)
    _log(f"Terra: {len(anelli)} contorni di continenti e isole")
    return anelli


# =============================================================================
# PREPARAZIONE
# =============================================================================
def _parte(nome, funzione, fonti, predefinito):
    try:
        return funzione()
    except Exception as e:  # noqa: BLE001
        _log(f"!! {nome}: non disponibile ({type(e).__name__}: {e})")
        fonti[nome] = f"non disponibile ({type(e).__name__})"
        if isinstance(predefinito, tuple) and predefinito and predefinito[-1] == "":
            return predefinito[:-1] + (fonti[nome],)     # la fonte resta «non disponibile»
        return predefinito


def prepara(cartella, riscarica=False, max_eta_ore=MAX_ETA_ORE, forza=False):
    """Scarica (se serve) e prepara <cartella>/dati.json. Restituisce (dati, file_nuovi_scaricati)."""
    cartella = Path(cartella)
    cartella.mkdir(parents=True, exist_ok=True)
    cache = Cache(cartella, riscarica, max_eta_ore)
    (cache.dir / "gw").mkdir(exist_ok=True)
    t0 = time.time()
    fonti = {}
    pulsar, fonti["pulsar"] = _parte("pulsar", lambda: pulsar_atnf(cache), fonti, ([], ""))
    fermi, fonti["fermi"] = _parte("fermi", lambda: sorgenti_fermi(cache), fonti, ([], ""))
    # pulsar gamma: le sorgenti 4FGL di classe PSR/MSP, unite alle pulsar ATNF con lo stesso nome
    per_nome = {}
    for p in pulsar:
        per_nome[p["nome"].replace("PSR", "").strip()] = p
        if p["b"]:
            per_nome[p["b"]] = p
    gamma_sole, n_gamma = [], 0
    for s in fermi:
        if s["classe"].lower() not in ("psr", "msp"):
            continue
        n_gamma += 1
        chiave = re.sub(r"^PSR\s*", "", s["assoc"]).strip()
        p = per_nome.get(chiave) or per_nome.get(chiave.replace(" ", ""))
        if p:
            p["gamma"] = 1
            p["fermi"] = s["nome"]
        else:
            gamma_sole.append(s)
    _log(f"Pulsar gamma: {n_gamma} ({n_gamma - len(gamma_sole)} unite alle pulsar ATNF)")
    righe_psr = [[p["nome"], p["b"], round(p["ra"], 5), round(p["dec"], 5), p["p"] and float(f"{p['p']:.6g}"),
                  p["dm"] and round(p["dm"], 2), p["dist"] and round(p["dist"], 3), p["stato"], p["tipo"], p["assoc"],
                  p["bin"], p["gamma"], 1 if "AXP" in p["tipo"] else 0, p.get("fermi", "")] for p in pulsar]
    righe_fermi = [[s["nome"], round(s["ra"], 4), round(s["dec"], 4), s["classe"], s["assoc"]] for s in fermi
                   if not s["classe"] or s in gamma_sole]

    def snr():
        out = []
        for r in vizier(cache, "vizier_green.tsv", "VII/297", richieste=(("SNR",),)):
            ra, de = posizione(r)
            if ra is None:
                continue
            out.append([colonna(r, "SNR", "Name", "GName"), round(ra, 4), round(de, 4), _num(colonna(r, "MajDiam", "Diam")),
                        colonna(r, "type", "Type"), colonna(r, "Names", "OName")])
        _log(f"Resti di supernova (Green): {len(out)}")
        return out, "Green, catalogo dei resti di supernova galattici (VizieR VII/297)"
    righe_snr, fonti["snr"] = _parte("snr", snr, fonti, ([], ""))

    def quasar():
        try:
            tab = vizier(cache, "vizier_quasar.tsv", "VII/258/vv10", {"Vmag": f"<{V_QUASAR}"}, (("z",),))
        except Exception:  # noqa: BLE001
            tab = [r for r in vizier(cache, "vizier_quasar_tutti.tsv", "VII/258/vv10", None, (("z",),))
                   if (_num(colonna(r, "Vmag")) or 99) < V_QUASAR]
        out = []
        for r in tab:
            ra, de = posizione(r)
            v, cl = _num(colonna(r, "Vmag")), colonna(r, "Cl")
            if ra is None or v is None or v >= V_QUASAR or (cl and cl.upper() not in ("Q", "")):
                continue
            out.append([colonna(r, "Name"), round(ra, 4), round(de, 4), _num(colonna(r, "z")), v])
        _log(f"Quasar con V < {V_QUASAR}: {len(out)}")
        return out, "Véron-Cetty & Véron, 13a edizione (VizieR VII/258)"
    righe_qso, fonti["quasar"] = _parte("quasar", quasar, fonti, ([], ""))
    onde = _parte("onde", lambda: onde_gravitazionali(cache), fonti, [])
    fonti.setdefault("onde", "GWOSC (GWTC) e mappe del cielo di GraceDB")
    stelle, costellazioni, via_lattea = _parte("cielo", lambda: cielo_di_fondo(cache), fonti, ([], [], []))
    fonti.setdefault("cielo", "d3-celestial (Olaf Frohn): stelle, costellazioni, Via Lattea")
    continenti = _parte("terra", lambda: terra(cache), fonti, [])
    fonti.setdefault("terra", "Natural Earth 1:110m (world-atlas)")
    vecchi = {}
    try:
        vecchi = json.loads((cartella / "dati.json").read_text(encoding="utf-8"))
        if vecchi.get("versione") != VERSIONE_DATI:
            vecchi = {}
    except (OSError, ValueError):
        pass
    if vecchi and cache.nuovi == 0 and not riscarica and not forza:
        _log("Nessun file nuovo: i dati restano quelli di prima")
        return vecchi, 0
    if not righe_psr and not righe_fermi and not stelle and not vecchi:
        raise OSError("nessun catalogo scaricato: serve Internet almeno la prima volta")
    dati = {
        "versione": VERSIONE_DATI, "creato": datetime.now().strftime("%Y-%m-%d %H:%M"), "fonti": fonti,
        "pulsar": {"campi": ["nome", "nome_b", "ra", "dec", "periodo", "dm", "dist_kpc", "stato_dist", "tipo",
                             "assoc", "binaria", "gamma", "magnetar", "fermi"], "righe": righe_psr},
        "fermi": {"campi": ["nome", "ra", "dec", "classe", "assoc"], "righe": righe_fermi},
        "snr": {"campi": ["nome", "ra", "dec", "diametro", "tipo", "altri_nomi"], "righe": righe_snr},
        "quasar": {"campi": ["nome", "ra", "dec", "z", "vmag"], "righe": righe_qso},
        "onde": onde, "stelle": stelle, "costellazioni": costellazioni, "via_lattea": via_lattea,
        "terra": continenti,
    }
    # uno strato non scaricato (e senza copia in cache): si tiene quello dei dati di prima
    for parte, chiavi in (("pulsar", ["pulsar"]), ("fermi", ["fermi"]), ("snr", ["snr"]), ("quasar", ["quasar"]),
                          ("onde", ["onde"]), ("cielo", ["stelle", "costellazioni", "via_lattea"]), ("terra", ["terra"])):
        if str(fonti.get(parte, "")).startswith("non disponibile") and vecchi:
            for k in chiavi:
                dati[k] = vecchi.get(k, dati[k])
            fonti[parte] = (vecchi.get("fonti") or {}).get(parte, fonti[parte]) + " (dati precedenti)"
            _log(f"   {parte}: tengo i dati di prima")
    tmp = cartella / "dati.json.tmp"
    tmp.write_text(json.dumps(dati, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, cartella / "dati.json")
    _log(f"Pronto: dati.json ({(cartella / 'dati.json').stat().st_size / 1e6:.1f} MB) in "
         f"{time.time() - t0:.0f} s, {cache.nuovi} file scaricati")
    return dati, cache.nuovi


if __name__ == "__main__":
    import sys
    prepara(sys.argv[1] if len(sys.argv) > 1 else "Cielo_Einstein", riscarica="--riscarica" in sys.argv)
