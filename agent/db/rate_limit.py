from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from .models import DailyUsage

USER_LLM_LIMIT = 30
USER_OTHER_LIMIT = 1000
BOT_LLM_LIMIT = 200
BOT_USER_ID = 0  # sentinel for global bot counters


def _get_or_create(db: Session, user_id: int) -> DailyUsage:
    today = date.today()
    row = db.get(DailyUsage, (user_id, today))
    if not row:
        stmt = (
            insert(DailyUsage)
            .values(user_id=user_id, date=today, llm_calls=0, other_calls=0)
            .on_conflict_do_nothing()
        )
        db.execute(stmt)
        db.flush()
        row = db.get(DailyUsage, (user_id, today))
        if not row:
            row = DailyUsage(user_id=user_id, date=today, llm_calls=0, other_calls=0)
            db.add(row)
            db.flush()
    return row


def check_and_increment_llm(db: Session, user_id: int) -> tuple[bool, str]:
    """
    Check both user and bot-level LLM limits, then increment if allowed.
    Returns (allowed, reason_if_denied).
    """
    bot_row = _get_or_create(db, BOT_USER_ID)
    if bot_row.llm_calls >= BOT_LLM_LIMIT:
        return False, f"Bot 今日 LLM 用量已達上限（{BOT_LLM_LIMIT} 次），請明天再試。"

    user_row = _get_or_create(db, user_id)
    if user_row.llm_calls >= USER_LLM_LIMIT:
        return False, f"你今日的收藏分析已達上限（{USER_LLM_LIMIT} 次），請明天再試。"

    user_row.llm_calls += 1
    bot_row.llm_calls += 1
    db.commit()
    return True, ""


def check_and_increment_other(db: Session, user_id: int) -> tuple[bool, str]:
    """Check user-level operation limit, then increment if allowed."""
    row = _get_or_create(db, user_id)
    if row.other_calls >= USER_OTHER_LIMIT:
        return False, f"你今日的操作已達上限（{USER_OTHER_LIMIT} 次），請明天再試。"

    row.other_calls += 1
    db.commit()
    return True, ""
