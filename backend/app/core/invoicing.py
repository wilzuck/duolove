"""Factures : numérotation continue, informations légales de l'émetteur (réglables dans l'administration) et PDF professionnel (reportlab).

Aucune mention légale n'est inventée : l'adresse, le numéro d'immatriculation et la TVA sont saisis par l'administration (Facturation) ; ce qui n'est pas renseigné
n'apparaît pas sur la facture. TVA à 0 % : « TVA non applicable »."""
from __future__ import annotations

import datetime
import io
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import SystemSetting

KEY = "billing.company"
COUNTER_KEY = "invoice.counter"
LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo.png"
FIELDS = ("legalName", "address", "city", "country", "registration", "email", "phone", "website", "footerNote")


async def company(db: AsyncSession) -> dict:
    """Émetteur de la facture : valeurs saisies en administration, sinon le nom du site et son adresse."""
    row = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    v = row if isinstance(row, dict) else {}
    s = get_settings()
    out = {k: str(v.get(k) or "").strip() for k in FIELDS}
    out["legalName"] = out["legalName"] or s.site_name
    out["website"] = out["website"] or s.app_url
    out["vatPercent"] = max(0, min(30, int(v.get("vatPercent") or 0)))
    return out


async def next_number(db: AsyncSession, now: datetime.datetime) -> str:
    """Numéro continu par année (CD-2026-000001). Compteur verrouillé le temps de la transaction : jamais de doublon ni de trou en cas de paiements simultanés."""
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == COUNTER_KEY).with_for_update())).scalar_one_or_none()
    cur = row.value if row and isinstance(row.value, dict) else {}
    n = (int(cur.get("n", 0)) + 1) if cur.get("year") == now.year else 1
    value = {"year": now.year, "n": n}
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=COUNTER_KEY, value=value))
        await db.flush()
    return f"CD-{now.year}-{n:06d}"


def money(n: int) -> str:
    return f"{int(n):,}".replace(",", " ") + " FCFA"


def totals(amount_xof: int, discount_xof: int, vat_percent: int) -> dict:
    """Montants de la facture. `amount_xof` = prix payé TTC ; la TVA, si elle s'applique, est extraite de ce prix."""
    gross = amount_xof + discount_xof
    if vat_percent > 0:
        ht = round(amount_xof / (1 + vat_percent / 100))
        return {"gross": gross, "discount": discount_xof, "ht": ht, "vat": amount_xof - ht, "vatPercent": vat_percent, "total": amount_xof}
    return {"gross": gross, "discount": discount_xof, "ht": amount_xof, "vat": 0, "vatPercent": 0, "total": amount_xof}


def render_pdf(d: dict) -> bytes:
    """PDF A4 : logo, numéro et dates, émetteur / client, lignes, remise, TVA, total, état du paiement, mentions."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    PINK, INK, MUTED, LINE, SOFT = colors.HexColor("#C2185B"), colors.HexColor("#22212B"), colors.HexColor("#6B6A76"), colors.HexColor("#EEE7EB"), colors.HexColor("#FFF0F5")
    base = ParagraphStyle("b", fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
    small = ParagraphStyle("s", parent=base, fontSize=8.5, leading=12, textColor=MUTED)
    bold = ParagraphStyle("bold", parent=base, fontName="Helvetica-Bold")
    right = ParagraphStyle("r", parent=base, alignment=TA_RIGHT)
    right_bold = ParagraphStyle("rb", parent=bold, alignment=TA_RIGHT)
    title = ParagraphStyle("t", parent=base, fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=PINK, alignment=TA_RIGHT)
    label = ParagraphStyle("l", parent=small, fontName="Helvetica-Bold", textColor=PINK, fontSize=8, leading=11)

    def esc(x) -> str:
        return str(x or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def lines(*parts) -> str:
        return "<br/>".join(esc(p) for p in parts if p)

    c, cust, t = d["seller"], d["customer"], d["totals"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm, title=f"Facture {d['number']}", author=c["legalName"])
    w = A4[0] - 36 * mm
    story = []
    logo = Image(str(LOGO), width=46 * mm, height=46 * mm * 118 / 600) if LOGO.exists() else Paragraph(esc(c["legalName"]), bold)
    head = Table([[logo, [Paragraph("FACTURE", title), Paragraph(f"N° {esc(d['number'])}", right_bold),
                          Paragraph(f"Émise le {esc(d['issuedAt'])}", right), Paragraph(f"Payée le {esc(d['paidAt'])}" if d.get("paidAt") else "", right)]]], colWidths=[w * 0.5, w * 0.5])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 6 * mm)]

    seller = [Paragraph("ÉMETTEUR", label), Paragraph(f"<b>{esc(c['legalName'])}</b>", base),
              Paragraph(lines(c["address"], ", ".join(x for x in (c["city"], c["country"]) if x), c["registration"], c["email"], c["phone"], c["website"]), small)]
    buyer = [Paragraph("FACTURÉ À", label), Paragraph(f"<b>{esc(cust['name'] or cust['email'])}</b>", base), Paragraph(lines(cust["email"], f"Membre n° {cust['memberId']}" if cust.get("memberId") else ""), small)]
    parties = Table([[seller, buyer]], colWidths=[w * 0.5, w * 0.5])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("LINEABOVE", (0, 0), (-1, 0), 0.8, PINK), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    story += [parties, Spacer(1, 7 * mm)]

    rows = [[Paragraph("<b>Description</b>", base), Paragraph("<b>Qté</b>", right), Paragraph("<b>Prix unitaire</b>", right), Paragraph("<b>Total</b>", right)]]
    for ln in d["lines"]:
        rows.append([Paragraph(esc(ln["description"]), base), Paragraph(str(ln["quantity"]), right), Paragraph(money(ln["unitXof"]), right), Paragraph(money(ln["totalXof"]), right)])
    items = Table(rows, colWidths=[w * 0.55, w * 0.1, w * 0.18, w * 0.17], repeatRows=1)
    items.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), SOFT), ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (0, -1), 6)]))
    story += [items, Spacer(1, 4 * mm)]

    tot = [[Paragraph("Sous-total", right), Paragraph(money(t["gross"]), right)]]
    if t["discount"] > 0:
        tot.append([Paragraph(esc(d.get("discountLabel") or "Remise"), right), Paragraph("− " + money(t["discount"]), right)])
    if t["vatPercent"] > 0:
        tot += [[Paragraph("Total HT", right), Paragraph(money(t["ht"]), right)], [Paragraph(f"TVA {t['vatPercent']} %", right), Paragraph(money(t["vat"]), right)]]
    tot.append([Paragraph("TOTAL À PAYER (TTC)" if t["vatPercent"] > 0 else "TOTAL À PAYER", right_bold), Paragraph(money(t["total"]), right_bold)])
    totals_tbl = Table(tot, colWidths=[w * 0.28, w * 0.2], hAlign="RIGHT")
    totals_tbl.setStyle(TableStyle([("BACKGROUND", (0, -1), (-1, -1), SOFT), ("LINEABOVE", (0, -1), (-1, -1), 0.8, PINK), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(totals_tbl)
    if t["vatPercent"] == 0:
        story += [Spacer(1, 2 * mm), Paragraph("TVA non applicable.", ParagraphStyle("na", parent=small, alignment=TA_RIGHT))]
    story.append(Spacer(1, 8 * mm))

    pay = Table([[Paragraph("PAIEMENT", label), ""],
                 [Paragraph("État", small), Paragraph("<b>Payée</b>", base)],
                 [Paragraph("Moyen", small), Paragraph(esc(d["payment"]["method"]), base)],
                 [Paragraph("Référence", small), Paragraph(esc(d["payment"]["reference"]), base)]], colWidths=[w * 0.18, w * 0.82])
    pay.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, LINE), ("BACKGROUND", (0, 0), (-1, 0), SOFT), ("SPAN", (0, 0), (1, 0)), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(pay)
    if c["footerNote"]:
        story += [Spacer(1, 6 * mm), Paragraph(esc(c["footerNote"]), small)]

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, f"{c['legalName']} · {c['website']}" + (f" · {c['registration']}" if c["registration"] else ""))
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Facture {d['number']} · page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
