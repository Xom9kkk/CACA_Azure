import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from sqlalchemy import create_engine, text

load_dotenv()

app = Flask(__name__)
engine = create_engine(os.getenv("DATABASE_URL"))


@app.route("/")
def index():
    return """
    <h1>Event Booking App</h1>
    <p>The application is running!</p>
    <button onclick="checkHealth()">Check database connection</button>
    <p id="result"></p>
    <script>
        async function checkHealth() {
            const result = document.getElementById("result");
            result.textContent = "Checking...";
            const response = await fetch("/health");
            const data = await response.json();
            result.textContent = data.database === "connected"
                ? "✅ Database is connected"
                : "❌ Database is not connected: " + data.error;
        }
    </script>
    """


@app.route("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return jsonify(status="ok", database="connected")
    except Exception as e:
        return jsonify(status="error", database="disconnected", error=str(e)), 503


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
