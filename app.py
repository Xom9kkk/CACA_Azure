import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from api import api
from models import Base, utcnow
from seed import seed_if_empty

load_dotenv()


def create_app(database_url=None, *, engine_kwargs=None, seed=True):
    database_url = database_url or os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set (see .env.example)")

    app = Flask(__name__)
    engine = create_engine(database_url, pool_pre_ping=True, **(engine_kwargs or {}))
    Session = sessionmaker(engine, expire_on_commit=False)
    app.extensions["engine"] = engine
    app.extensions["Session"] = Session

    # The database may be stopped when the app boots, so tables are created
    # on the first request that finds it reachable.
    ready = False

    def init_db():
        nonlocal ready
        if ready:
            return True
        try:
            Base.metadata.create_all(engine)
            if seed:
                with Session() as session:
                    seed_if_empty(session, utcnow())
            ready = True
        except OperationalError as e:
            app.logger.warning("Database is not available: %s", e)
        return ready

    app.extensions["init_db"] = init_db
    init_db()

    app.register_blueprint(api)

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/health")
    def health():
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return jsonify(status="ok", db="connected")
        except Exception as e:
            return jsonify(status="error", db="disconnected", error=str(e)), 503

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000)
