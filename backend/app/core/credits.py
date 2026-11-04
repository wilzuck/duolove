"""Portefeuille de crédits. Le journal CreditTransaction fait foi : (userId, reason, refId) est unique, donc une même
opération (paiement, swipe, boost) ne s'applique jamais deux fois. Le journal est écrit EN PREMIER (ON CONFLICT DO NOTHING) ;
le solde ne bouge que si l'écriture est nouvelle. L'appelant commit : si l'action échoue, le crédit n'est pas consommé."""
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import CREDIT_TYPES
from app.core.errors import AppError
from app.core.ids import new_id, utcnow
from app.models.models import CreditTransaction, CreditWallet


async def balances(db: AsyncSession, user_id: str) -> dict[str, int]:
    rows = (await db.execute(select(CreditWallet).where(CreditWallet.userId == user_id))).scalars().all()
    out = {t: 0 for t in CREDIT_TYPES}
    for r in rows:
        out[r.type.value] = r.balance
    return out


async def _journal(db: AsyncSession, user_id: str, type_: str, delta: int, reason: str, ref_id: str) -> bool:
    stmt = (
        insert(CreditTransaction)
        .values(id=new_id(), userId=user_id, type=type_, delta=delta, reason=reason, refId=ref_id, createdAt=utcnow())
        .on_conflict_do_nothing(index_elements=["userId", "reason", "refId"])
        .returning(CreditTransaction.id)
    )
    return (await db.execute(stmt)).first() is not None


async def grant(db: AsyncSession, user_id: str, type_: str, qty: int, reason: str, ref_id: str) -> bool:
    """True si le crédit a été ajouté, False si cette opération avait déjà été appliquée."""
    if not await _journal(db, user_id, type_, qty, reason, ref_id):
        return False
    stmt = insert(CreditWallet).values(id=new_id(), userId=user_id, type=type_, balance=qty, updatedAt=utcnow())
    stmt = stmt.on_conflict_do_update(index_elements=["userId", "type"], set_={"balance": CreditWallet.balance + qty, "updatedAt": utcnow()})
    await db.execute(stmt)
    return True


async def consume(db: AsyncSession, user_id: str, type_: str, qty: int, ref_id: str) -> bool:
    """Consomme `qty` crédits ; lève NO_CREDITS si le solde est insuffisant. Idempotent par `ref_id`."""
    if not await _journal(db, user_id, type_, -qty, "CONSUME", ref_id):
        return False
    res = await db.execute(
        update(CreditWallet).where(CreditWallet.userId == user_id, CreditWallet.type == type_, CreditWallet.balance >= qty)
        .values(balance=CreditWallet.balance - qty, updatedAt=utcnow())
    )
    if res.rowcount == 0:
        raise AppError(403, "NO_CREDITS", "Crédits insuffisants")
    return True


async def reverse(db: AsyncSession, user_id: str, type_: str, qty: int, ref_id: str) -> int:
    """Retire des crédits suite à un remboursement : au plus ce qui reste. Retourne la quantité retirée."""
    bal = (await db.execute(select(CreditWallet.balance).where(CreditWallet.userId == user_id, CreditWallet.type == type_))).scalar_one_or_none() or 0
    x = min(bal, qty)
    if x <= 0:
        return 0
    if not await _journal(db, user_id, type_, -x, "REFUND", ref_id):
        return 0
    res = await db.execute(
        update(CreditWallet).where(CreditWallet.userId == user_id, CreditWallet.type == type_, CreditWallet.balance >= x)
        .values(balance=CreditWallet.balance - x, updatedAt=utcnow())
    )
    if res.rowcount == 0:
        raise AppError(409, "CREDITS_CHANGED", "Solde modifié pendant le remboursement")
    return x


async def history(db: AsyncSession, user_id: str, take: int = 50):
    q = select(CreditTransaction).where(CreditTransaction.userId == user_id).order_by(CreditTransaction.createdAt.desc()).limit(take)
    return (await db.execute(q)).scalars().all()
