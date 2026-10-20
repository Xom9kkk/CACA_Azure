import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set (see .env.example)")

app = Flask(__name__)
engine = create_engine(DATABASE_URL)


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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
