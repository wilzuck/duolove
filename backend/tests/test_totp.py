"""TOTP : vecteurs officiels de la RFC 6238 (SHA-1) et règles de tolérance / rejeu."""
import base64

from app.core import totp

# RFC 6238, annexe B : secret ASCII « 12345678901234567890 », codes à 8 chiffres ; les 6 derniers chiffres sont les nôtres.
SECRET = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
VECTORS = {59: "287082", 1111111109: "081804", 1111111111: "050471", 1234567890: "005924", 2000000000: "279037", 20000000000: "353130"}


def test_vecteurs_rfc_6238():
    for t, expected in VECTORS.items():
        assert totp.code_at(SECRET, totp.current_step(t)) == expected, t


def test_tolerance_un_pas_et_refus_au_dela():
    t = 1111111109
    step = totp.current_step(t)
    for delta in (-1, 0, 1):
        assert totp.verify(SECRET, totp.code_at(SECRET, step + delta), now=t) == step + delta
    for delta in (-2, 2):
        assert totp.verify(SECRET, totp.code_at(SECRET, step + delta), now=t) is None


def test_un_code_ne_sert_qu_une_fois_et_formats_invalides():
    t = 1111111109
    step = totp.current_step(t)
    code = totp.code_at(SECRET, step)
    assert totp.verify(SECRET, code, last_step=step, now=t) is None  # déjà utilisé
    assert totp.verify(SECRET, code, last_step=step - 1, now=t) == step
    assert totp.verify(SECRET, " " + code[:3] + " " + code[3:], now=t) == step  # espaces tolérés
    for bad in ("", "12345", "1234567", "abcdef", None):
        assert totp.verify(SECRET, bad, now=t) is None


def test_secret_uri_et_codes_de_secours():
    s = totp.new_secret()
    assert len(s) == 32 and s == s.upper() and "=" not in s
    assert totp.verify(s, totp.code_at(s, totp.current_step()))
    uri = totp.otpauth_uri(s, "a@b.com", "Crushduo")
    assert uri.startswith("otpauth://totp/Crushduo:a%40b.com?secret=") and "issuer=Crushduo" in uri
    codes = totp.new_recovery_codes()
    assert len(codes) == 10 and len(set(codes)) == 10 and all(len(c) == 9 and c[4] == "-" for c in codes)
    assert totp.recovery_hash("u1", codes[0].lower()) == totp.recovery_hash("u1", codes[0]) != totp.recovery_hash("u2", codes[0])
    assert totp.grouped("ABCDEFGH") == "ABCD EFGH"
