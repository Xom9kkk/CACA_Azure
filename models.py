import secrets
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

CATEGORIES = ["Music", "Tech", "Sport", "Art", "Food", "Party"]


def utcnow():
    return datetime.now(timezone.utc)


def as_utc(dt):
    # SQLite returns naive datetimes, PostgreSQL returns aware ones
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(20))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    location: Mapped[str] = mapped_column(String(120))
    price: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    capacity: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(120))
    tickets: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(12), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    event: Mapped[Event] = relationship(back_populates="bookings")


def seats_taken(session, event_id):
    query = select(func.coalesce(func.sum(Booking.tickets), 0)).where(Booking.event_id == event_id)
    return session.scalar(query)


def new_code():
    return "EVT-" + secrets.token_hex(2).upper()
