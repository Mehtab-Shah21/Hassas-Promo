// A FastAPI error body's `detail` is a plain string for handler-raised
// HTTPExceptions, but for a 422 (request validation failure) it's an array
// of { loc, msg, type } objects instead — rendering that directly as JSX
// crashes React ("Objects are not valid as a React child"). Every catch
// block that surfaces `detail` to the user should go through this instead
// of reading `err.response.data.detail` directly.
export function getErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d)))
      .join("; ");
  }
  return fallback;
}
