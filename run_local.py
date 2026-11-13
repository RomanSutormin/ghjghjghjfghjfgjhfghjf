"""Serve the desktop on loopback and open it in the default browser."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import webbrowser


def main() -> None:
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    address, port = server.server_address
    url = f"http://{address}:{port}/"
    print(f"Рабочий стол запущен: {url}", flush=True)
    print("Остановить сервер: Ctrl+C в этом окне.", flush=True)
    Timer(0.4, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
