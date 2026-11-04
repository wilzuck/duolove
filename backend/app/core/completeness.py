"""Score de complétude du profil (0–100), documenté dans docs/PRD.md."""


def compute_completeness(*, bio: str, occupation: str | None, interest_count: int, photo_count: int, intent: str) -> int:
    s = 30  # identité de base (obligatoire à l'inscription)
    if len(bio.strip()) >= 40:
        s += 15
    if occupation:
        s += 5
    if interest_count >= 3:
        s += 15
    if photo_count >= 1:
        s += 20
    if photo_count >= 3:
        s += 10
    if intent != "UNSURE":
        s += 5
    return min(100, s)


def completeness_level(score: int) -> str:
    return "INCOMPLETE" if score < 50 else "IN_PROGRESS" if score < 80 else "COMPLETE"
