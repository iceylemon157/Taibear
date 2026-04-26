import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models import Base

_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        url = os.environ["DATABASE_URL"]
        _engine = create_engine(url)
    return _engine


def init_db():
    Base.metadata.create_all(bind=get_engine())


def get_session() -> sessionmaker:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine())
    return _SessionLocal
