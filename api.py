import os
import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from models import CATEGORIES, Booking, Event, as_utc, new_code, seats_taken, utcnow

api = Blueprint("api", __name__, url_prefix="/api")

EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
MAX_AHEAD = timedelta(days=5 * 365)


@api.before_request
def ensure_db():
    if not current_app.extensions["init_db"]():
        return error("Database is not available", 503)


@api.errorhandler(OperationalError)
def db_unavailable(e):
    current_app.logger.warning("Database error: %s", e)
    return error("Database is not available", 503)


def session():
    return current_app.extensions["Session"]()


def error(message, status=400):
    return jsonify(error=message), status


def event_to_dict(event, taken):
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description or "",
        "category": event.category,
        "starts_at": as_utc(event.starts_at).isoformat(),
        "location": event.location,
        "price": float(event.price),
        "capacity": event.capacity,
        "seats_taken": taken,
        "seats_left": max(event.capacity - taken, 0),
    }


def text_field(data, name, max_len, required=True):
    value = data.get(name)
    if value is None and not required:
        return ""
    if not isinstance(value, str) or (required and not value.strip()):
        raise ValueError(f"{name} is required")
    value = value.strip()
    if len(value) > max_len:
        raise ValueError(f"{name} must be at most {max_len} characters")
    return value


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def parse_event_payload(data, *, min_capacity=1):
    if not isinstance(data, dict):
        raise ValueError("Invalid JSON body")

    title = text_field(data, "title", 120)
    description = text_field(data, "description", 2000, required=False)
    location = text_field(data, "location", 120)

    category = data.get("category")
    if category not in CATEGORIES:
        raise ValueError("category must be one of: " + ", ".join(CATEGORIES))

    try:
        starts_at = datetime.fromisoformat(data.get("starts_at"))
        if starts_at.tzinfo is not None:
            starts_at = starts_at.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        starts_at = None
    if starts_at is None or starts_at.tzinfo is None:
        raise ValueError("starts_at must be an ISO date with timezone")
    if starts_at <= utcnow():
        raise ValueError("Event must start in the future")
    if starts_at > utcnow() + MAX_AHEAD:
        raise ValueError("Event must start within 5 years")

    price = data.get("price")
    if not is_number(price) or not 0 <= price <= 100000:
        raise ValueError("price must be a number between 0 and 100000")

    capacity = data.get("capacity")
    if not isinstance(capacity, int) or isinstance(capacity, bool) or not 1 <= capacity <= 10000:
        raise ValueError("capacity must be a whole number between 1 and 10000")
    if capacity < min_capacity:
        raise ValueError(f"Capacity cannot be below {min_capacity} booked seats")

    return {
        "title": title, "description": description, "category": category,
        "starts_at": starts_at, "location": location, "price": price, "capacity": capacity,
    }


@api.get("/events")
def list_events():
    with session() as s:
        taken = (
            select(Booking.event_id, func.sum(Booking.tickets).label("taken"))
            .group_by(Booking.event_id)
            .subquery()
        )
        rows = s.execute(
            select(Event, func.coalesce(taken.c.taken, 0))
            .outerjoin(taken, taken.c.event_id == Event.id)
            .where(Event.starts_at > utcnow())
            .order_by(Event.starts_at)
        ).all()
        return jsonify([event_to_dict(event, int(t)) for event, t in rows])


@api.get("/events/<int:event_id>")
def get_event(event_id):
    with session() as s:
        event = s.get(Event, event_id)
        if event is None:
            return error("Event not found", 404)
        return jsonify(event_to_dict(event, seats_taken(s, event_id)))


@api.post("/events")
def create_event():
    try:
        fields = parse_event_payload(request.get_json(silent=True))
    except ValueError as e:
        return error(str(e))
    with session() as s:
        event = Event(**fields)
        s.add(event)
        s.commit()
        return jsonify(event_to_dict(event, 0)), 201


@api.put("/events/<int:event_id>")
def update_event(event_id):
    with session() as s:
        event = s.get(Event, event_id, with_for_update=True)
        if event is None:
            return error("Event not found", 404)
        taken = seats_taken(s, event_id)
        try:
            fields = parse_event_payload(request.get_json(silent=True), min_capacity=taken)
        except ValueError as e:
            return error(str(e))
        for key, value in fields.items():
            setattr(event, key, value)
        s.commit()
        return jsonify(event_to_dict(event, taken))


@api.post("/events/<int:event_id>/bookings")
def create_booking(event_id):
    data = request.get_json(silent=True)
    try:
        if not isinstance(data, dict):
            raise ValueError("Invalid JSON body")
        name = text_field(data, "name", 80)
        email = text_field(data, "email", 120)
        if not EMAIL_RE.fullmatch(email):
            raise ValueError("email is not valid")
        tickets = data.get("tickets")
        if not isinstance(tickets, int) or isinstance(tickets, bool) or not 1 <= tickets <= 5:
            raise ValueError("tickets must be between 1 and 5")
    except ValueError as e:
        return error(str(e))

    with session() as s:
        event = s.get(Event, event_id, with_for_update=True)
        if event is None:
            return error("Event not found", 404)
        if as_utc(event.starts_at) <= utcnow():
            return error("Event has already started")
        left = event.capacity - seats_taken(s, event_id)
        if tickets > left:
            return error("Sold out" if left <= 0 else f"Only {left} seats left", 409)

        code = new_code()
        for _ in range(10):
            if not s.scalar(select(Booking.id).where(Booking.code == code)):
                break
            code = new_code()
        s.add(Booking(event_id=event_id, name=name, email=email, tickets=tickets, code=code))
        s.commit()
        taken = event.capacity - left + tickets
        return jsonify(code=code, tickets=tickets, event=event_to_dict(event, taken)), 201


def region_from_host(host):
    # e.g. eventbooking-app.politeforest-0f266ae4.switzerlandnorth.azurecontainerapps.io
    parts = (host or "").split(":")[0].split(".")
    if len(parts) > 3 and parts[-2:] == ["azurecontainerapps", "io"]:
        return parts[-3]
    return "local"


@api.get("/info")
def info():
    # Express environments don't set CONTAINER_APP_* variables, so the region
    # comes from the public host name and the replica from the container host name
    return jsonify(
        region=region_from_host(request.headers.get("X-Forwarded-Host") or request.host),
        replica=os.getenv("CONTAINER_APP_REPLICA_NAME") or os.getenv("HOSTNAME") or "local",
    )


@api.delete("/events/<int:event_id>")
def delete_event(event_id):
    with session() as s:
        event = s.get(Event, event_id)
        if event is None:
            return error("Event not found", 404)
        s.delete(event)
        s.commit()
        return "", 204
