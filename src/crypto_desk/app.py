from __future__ import annotations

import argparse

from flask import Flask, jsonify, render_template, request

from .engine import analyze_trade


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def home():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return jsonify({"ok": True, "service": "crypto-institutional-desk"})

    @app.post("/api/analyze")
    def analyze():
        try:
            report = analyze_trade(request.get_json(silent=True) or {})
        except (TypeError, ValueError) as error:
            return jsonify({"ok": False, "error": str(error)}), 400
        return jsonify({"ok": True, "report": report})

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    arguments = parser.parse_args()
    if arguments.host != "127.0.0.1":
        raise SystemExit("安全限制：本工具只允許綁定 127.0.0.1")
    create_app().run(host=arguments.host, port=arguments.port, debug=False)


if __name__ == "__main__":
    main()

