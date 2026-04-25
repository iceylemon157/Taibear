from sqlalchemy import (
    BigInteger, Column, Date, Float, ForeignKey, Integer, SmallInteger,
    String, Text, TIMESTAMP, UniqueConstraint, PrimaryKeyConstraint
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)  # Telegram user_id
    username = Column(String(255))
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    items = relationship("Item", back_populates="user")


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("url", name="uq_items_url"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    platform = Column(String(20), nullable=False)
    url = Column(Text, nullable=False)
    title = Column(Text)
    raw_metadata = Column(JSONB)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="items")
    item_places = relationship("ItemPlace", back_populates="item", cascade="all, delete-orphan")


class Place(Base):
    __tablename__ = "places"

    id = Column(Integer, primary_key=True, autoincrement=True)
    store_name = Column(String(255))
    domain = Column(String(20))
    location = Column(String(50))
    category = Column(String(50))
    vibe = Column(ARRAY(String(50)))
    address = Column(String(500))
    description = Column(Text)          # LLM 生成的景點重點摘要，可為 null
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    item_places = relationship("ItemPlace", back_populates="place")


class ItemPlace(Base):
    __tablename__ = "item_places"
    __table_args__ = (PrimaryKeyConstraint("item_id", "place_id"),)

    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=False)

    item = relationship("Item", back_populates="item_places")
    place = relationship("Place", back_populates="item_places")


class DailyUsage(Base):
    __tablename__ = "daily_usage"
    __table_args__ = (PrimaryKeyConstraint("user_id", "date"),)

    # user_id = 0 is reserved for global bot-level counters
    user_id = Column(BigInteger, nullable=False)
    date = Column(Date, nullable=False)
    llm_calls = Column(Integer, default=0, nullable=False)
    other_calls = Column(Integer, default=0, nullable=False)


class HiddenSpot(Base):
    __tablename__ = "hidden_spots"
    __table_args__ = (UniqueConstraint("google_place_id", name="uq_hidden_google_place_id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    google_place_id = Column(String(255), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    address = Column(String(500))
    lat = Column(Float)
    lng = Column(Float)
    description = Column(Text)
    category = Column(String(50))
    vibes = Column(ARRAY(String(50)), default=[])
    submitted_by = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    photos = relationship("HiddenSpotPhoto", back_populates="spot", cascade="all, delete-orphan")
    comments = relationship("HiddenSpotComment", back_populates="spot", cascade="all, delete-orphan")


class HiddenSpotPhoto(Base):
    __tablename__ = "hidden_spot_photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    spot_id = Column(Integer, ForeignKey("hidden_spots.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(Text, nullable=False)
    uploaded_by = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    spot = relationship("HiddenSpot", back_populates="photos")


class HiddenSpotComment(Base):
    __tablename__ = "hidden_spot_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    spot_id = Column(Integer, ForeignKey("hidden_spots.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    content = Column(Text, nullable=False)
    rating = Column(SmallInteger)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    spot = relationship("HiddenSpot", back_populates="comments")
