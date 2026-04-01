from __future__ import annotations

import argparse
import http.server
import socketserver
from pathlib import Path


class CorsRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve a directory with permissive CORS headers.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--dir", dest="directory", default=".")
    args = parser.parse_args()

    root = Path(args.directory).resolve()
    handler = lambda *handler_args, **handler_kwargs: CorsRequestHandler(  # noqa: E731
        *handler_args,
        directory=str(root),
        **handler_kwargs,
    )

    with socketserver.TCPServer((args.host, args.port), handler) as httpd:
        print(f"Serving {root} on http://{args.host}:{args.port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
