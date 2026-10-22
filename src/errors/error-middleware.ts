import type { NextFunction, Request, Response } from "express";

import { resolveMessage } from "../i18n/index";
import type { I18nConfig } from "../i18n/types";
import type { TomRequest } from "../types";
import { DomainError } from "./domain-error";
import type { ErrorCode } from "./error-codes";
import { INTERNAL, INVALID_INPUT, MALFORMED_REQUEST, PAYLOAD_TOO_LARGE, UNPROCESSABLE } from "./error-codes";

const STATUS_MAP: Record<ErrorCode, number> = {
  M_INVALID_PARAM: 400,
  M_UNAUTHORIZED: 401,
  M_FORBIDDEN: 403,
  M_NOT_FOUND: 404,
  M_TERMS_NOT_SIGNED: 403,
  M_INVALID_PEPPER: 400,
  M_UNKNOWN: 500,
  M_SERVICE_UNAVAILABLE: 503,
  M_BAD_GATEWAY: 502,
  M_UNPROCESSABLE: 422,
  M_PAYLOAD_TOO_LARGE: 413,
  M_MALFORMED_REQUEST: 400,
};

/**
 * HTTP statuses that describe a rejected client request. They must never be
 * reported as an internal error: a 413 tells the caller to shrink the
 * payload, a 400 tells it to fix the payload.
 */
const REJECTED_REQUEST_STATUSES = new Set([
  400,
  405,
  406,
  408,
  409,
  411,
  413,
  414,
  415,
  422,
  431,
]);

const HTTP_STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
  400: MALFORMED_REQUEST,
  413: PAYLOAD_TOO_LARGE,
  415: INVALID_INPUT,
  422: UNPROCESSABLE,
};

/**
 * Extracts the HTTP status carried by a transport-level error.
 *
 * Body parsers (and Express itself) reject oversized, malformed or badly
 * encoded payloads with an error that already carries the status describing
 * the failure. That status must be honoured instead of being replaced by a
 * generic 500.
 *
 * @param err - The rejected error.
 * @returns The HTTP status, or `undefined` for an application error.
 */
export function httpErrorStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) {
    return undefined;
  }
  const candidate = err as {
    status?: unknown;
    statusCode?: unknown;
  };
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : undefined;
  if (status === undefined || !REJECTED_REQUEST_STATUSES.has(status)) {
    return undefined;
  }

  return status;
}

export function errorMiddleware(i18nConfig: I18nConfig) {
  // Express error callback contract: void return is framework-mandated
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof DomainError) {
      const status = STATUS_MAP[err.code] ?? 500;
      const locale = req.headers["accept-language"]?.split(",")[0] ?? i18nConfig.locale;

      res.status(status).json({
        errcode: err.code,
        error: resolveMessage(locale, err.message, err.context),
      });
      return;
    }

    const rejectedStatus = httpErrorStatus(err);
    if (rejectedStatus !== undefined) {
      const locale = req.headers["accept-language"]?.split(",")[0] ?? i18nConfig.locale;
      const code = HTTP_STATUS_TO_ERROR_CODE[rejectedStatus] ?? INVALID_INPUT;
      // The raw error message may quote the rejected payload. Log the error
      // kind only, never its text.
      (req as TomRequest).log?.warn("request rejected", {
        status: rejectedStatus,
        kind:
          (
            err as {
              type?: unknown;
            }
          ).type ?? "http",
      });
      res.status(rejectedStatus).json({
        errcode: code,
        error: resolveMessage(locale, code),
      });
      return;
    }

    // Infrastructure failure — log full stack, return opaque 500
    const message = err instanceof Error ? err.message : String(err);
    (req as TomRequest).log?.error("unhandled error", {
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });

    res.status(500).json({
      errcode: INTERNAL,
      error: resolveMessage(i18nConfig.locale, INTERNAL),
    });
  };
}
