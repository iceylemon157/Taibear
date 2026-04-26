"""
db/user_loader.py — Build UserPreference from shared PostgreSQL.
Used by Agent API /search when tg_user_id is provided.
"""
from db.engine import get_session
from db.models import User
from agent.models import Reel, UserPreference


def load_preference_from_db(tg_user_id: int) -> UserPreference:
    """
    Query the shared DB for a Telegram user's saved places and build a UserPreference.
    Returns an empty UserPreference if the user is not found — never raises.
    """
    Session = get_session()
    with Session() as db:
        user = db.get(User, tg_user_id)
        if user is None:
            return UserPreference()

        seen_tags: dict[str, None] = {}
        reels: list[Reel] = []

        for item in user.items:
            item_vibes: dict[str, None] = {}
            descriptions: list[str] = []

            for ip in item.item_places:
                place = ip.place
                if place.description:
                    descriptions.append(place.description)
                for tag in (place.vibe or []):
                    seen_tags[tag] = None
                    item_vibes[tag] = None

            reels.append(Reel(
                url=item.url,
                text_content=" ".join(descriptions),
                auto_tags=list(item_vibes),
            ))

        return UserPreference(
            user_id=str(tg_user_id),
            display_name=user.username or "",
            selected_tags=list(seen_tags),
            reels=reels,
        )
