"""Erreurs métier à code stable et format de réponse unique : { error: { code, message, details? } }."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("http")


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str | None = None, details: object = None):
        super().__init__(code)
        self.status, self.code, self.message, self.details = status, code, message or code, details


def bad_request(code: str, message: str | None = None, details: object = None) -> AppError:
    return AppError(400, code, message, details)


def unauthorized(code: str = "UNAUTHORIZED", message: str | None = None) -> AppError:
    return AppError(401, code, message)


def forbidden(code: str = "FORBIDDEN", message: str | None = None) -> AppError:
    return AppError(403, code, message)


def not_found(code: str = "NOT_FOUND", message: str | None = None) -> AppError:
    return AppError(404, code, message)


def conflict(code: str, message: str | None = None) -> AppError:
    return AppError(409, code, message)


_DEFAULT = {400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED",
            409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE", 429: "RATE_LIMITED"}


def _body(code: str, message: str, details: object = None) -> dict:
    err: dict = {"code": code, "message": message}
    if details is not None:
        err["details"] = details
    return {"error": err}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app(_: Request, e: AppError):
        return JSONResponse(_body(e.code, e.message, e.details), status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        details = [{"path": ".".join(str(p) for p in err["loc"][1:]), "code": _code(err)} for err in e.errors()]
        return JSONResponse(_body("VALIDATION_ERROR", "Données invalides", details), status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        code = _DEFAULT.get(e.status_code, "ERROR")
        return JSONResponse(_body(code, str(e.detail) if e.detail else code), status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _any(request: Request, e: Exception):
        log.error("erreur non gérée : %s", type(e).__name__, extra={"skip_tracking": True})  # aucun détail ni trace renvoyés au client
        from app.core import errortrack

        await errortrack.record_safe(source="api", path=request.url.path, method=request.method, status=500,
                                     user_agent=request.headers.get("user-agent"), **errortrack.exception_fields(e))
        return JSONResponse(_body("INTERNAL_ERROR", "Erreur interne"), status_code=500)


def _code(err: dict) -> str:
    msg = str(err.get("msg", ""))
    # Nos validateurs lèvent ValueError("<code>") → pydantic préfixe « Value error, ».
    if msg.startswith("Value error, "):
        return msg.removeprefix("Value error, ")
    return str(err.get("type", "invalid"))
