"""Indicateur de saisie facultatif (préférence du membre) et nouvelle question de personnalité « destination »."""
import secrets

import sqlalchemy as sa
from alembic import op

revision = "0006_typing_pref_travel_prompt"
down_revision = "0005_chat_enrichment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Profile", sa.Column("typingIndicator", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    # Ajout unique au catalogue existant (l'administration reste libre de la désactiver ou de la modifier ensuite).
    op.execute(sa.text(
        'INSERT INTO "ProfilePrompt" (id, slug, "textFr", "textEn", active, "sortOrder") '
        "VALUES (:id, 'travel-destination', :fr, :en, true, 8) ON CONFLICT (slug) DO NOTHING"
    ).bindparams(id=secrets.token_hex(12), fr="Si je devais voyager, ma prochaine destination serait…", en="If I had to travel, my next destination would be…"))


def downgrade() -> None:
    op.execute(sa.text('DELETE FROM "ProfilePrompt" WHERE slug = \'travel-destination\''))
    op.drop_column("Profile", "typingIndicator")
