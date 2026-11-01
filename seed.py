from datetime import timedelta

from sqlalchemy import func, select

from models import Booking, Event, new_code

DEMO_EVENTS = [
    # (days from now, hour, title, category, location, price, capacity, booked, description)
    (3, 20, "Acoustic Night", "Music", "Platform 3, Kraków", 120, 50, 34,
     "Guitars, candles and warm tea by the fire. Bring your own mug - gates close 15 minutes before start."),
    (8, 10, "Cloud Hackathon 24h", "Tech", "WSB Merito", 0, 80, 20,
     "Twenty-four hours, one generator, unlimited coffee. Build something that survives the surface."),
    (12, 12, "Mushroom Market", "Food", "Central Hall, Warszawa", 45, 200, 180,
     "Traders from every station bring their best harvest. Tastings, soups and the famous fried caps."),
    (15, 18, "Charcoal & Canvas", "Art", "Old Depot Gallery", 30, 50, 42,
     "Draw the tunnels by lamplight. Paper and charcoal provided, steady hands not guaranteed."),
    (18, 9, "Tunnel Run 5K", "Sport", "Line 2 service tunnel", 25, 150, 61,
     "Five kilometres through the old service line. Headlamps mandatory, rats optional."),
    (21, 22, "Generator Rave", "Party", "Depot B, Kraków", 60, 100, 100,
     "Bass powered by three diesel generators. Dance until the fuel runs out."),
    (25, 14, "Vinyl Swap Meet", "Music", "Platform 1 kiosk", 0, 40, 12,
     "Trade records salvaged from the surface. A working turntable is waiting for you."),
]

DEMO_NAMES = ["Anna", "Marek", "Olena", "Piotr", "Dmytro", "Kasia", "Ivan", "Zofia"]


def seed_if_empty(session, now):
    if session.scalar(select(func.count(Event.id))):
        return False

    used_codes = set()
    for days, hour, title, category, location, price, capacity, booked, description in DEMO_EVENTS:
        starts_at = (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
        event = Event(
            title=title, description=description, category=category, starts_at=starts_at,
            location=location, price=price, capacity=capacity,
        )
        left, i = booked, 0
        while left > 0:
            tickets = min(5, left)
            code = new_code()
            while code in used_codes:
                code = new_code()
            used_codes.add(code)
            name = DEMO_NAMES[i % len(DEMO_NAMES)]
            event.bookings.append(Booking(
                name=name, email=f"{name.lower()}{i}@example.com", tickets=tickets, code=code,
            ))
            left -= tickets
            i += 1
        session.add(event)

    session.commit()
    return True
