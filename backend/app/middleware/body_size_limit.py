"""Reject obviously oversized request bodies before they're read into memory.

Neither Starlette nor FastAPI enforce a request body size limit by default --
without this, a POST of any size to any endpoint (say, a 2GB body sent to
`/api/customers`) gets buffered into memory in full before Pydantic ever gets
a chance to reject an over-length field, which is a trivial way to exhaust
memory on the single-process server this app runs as (see
packaging/run_server.py). Multipart endpoints (file uploads) get a higher
ceiling than everything else, matching the largest per-file cap already
enforced in the upload routes themselves (expenses: 10MB, coupon banners: 5MB)
plus room for multipart framing overhead.

This is a Content-Length pre-check, not a byte-by-byte streaming counter: a
client that lies about Content-Length or uses chunked transfer-encoding
without declaring a length isn't caught here. That's an intentional scope
line for a LAN/desktop app rather than an internet-facing API -- a real
attacker on the same network already has much easier options, and every
normal HTTP client (browsers, requests, curl, axios) sets Content-Length
accurately for a buffered body, which is what every request this app's own
frontend makes actually is.
"""
from starlette.types import ASGIApp, Receive, Scope, Send

JSON_BODY_LIMIT = 2 * 1024 * 1024          # 2 MB -- generous for any JSON this app sends
MULTIPART_BODY_LIMIT = 15 * 1024 * 1024    # 15 MB -- above the largest single-file upload cap
# A restore replaces the live database with an uploaded backup file, which is
# the database plus every uploaded image/PDF the business has ever stored --
# entirely reasonable for that to exceed 15MB after a year of real use. That
# endpoint is superadmin-only already (see routers/backup.py), so a much
# higher ceiling there is "let a trusted operator restore a large file", not
# "let anyone post an unbounded body".
RESTORE_UPLOAD_LIMIT = 2 * 1024 * 1024 * 1024  # 2 GB
UNCAPPED_PATHS = {"/api/backup/restore-upload"}


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        content_type = (headers.get(b"content-type") or b"").decode("latin-1")
        if scope.get("path") in UNCAPPED_PATHS:
            limit = RESTORE_UPLOAD_LIMIT
        else:
            limit = MULTIPART_BODY_LIMIT if content_type.startswith("multipart/") else JSON_BODY_LIMIT

        if content_length is not None:
            try:
                length = int(content_length)
            except ValueError:
                length = None
            if length is not None and length > limit:
                response_started = False

                async def send_413(message):
                    nonlocal response_started
                    if message["type"] == "http.response.start":
                        response_started = True
                    await send(message)

                from starlette.responses import JSONResponse

                response = JSONResponse(
                    {"detail": f"Request body too large (max {limit // (1024 * 1024)}MB for this endpoint)."},
                    status_code=413,
                )
                await response(scope, receive, send_413)
                return

        await self.app(scope, receive, send)
