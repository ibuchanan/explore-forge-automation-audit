import {
  type ProblemDetails,
  type Result,
  err,
  ok,
  problemDetails,
} from "@forge-ahead/errors";
import {
  createForgeLogger,
  defineLogObjectSummaryPolicy,
} from "@forge-ahead/logging";

export const log = createForgeLogger({ name: "automation-rule" });

export const errorPolicy = defineLogObjectSummaryPolicy({
  kind: "actionProblem",
  fields: { type: "type", status: "status", detail: "detail" },
});

type Fields = Record<string, unknown>;
type Failure = { status: number; message: string };
type JsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

/** Log a failure and return it as Problem Details; the log message is the (static) problem message. */
export function fail(
  level: "warn" | "error",
  status: number,
  message: string,
  fields: Fields,
): Result<never, ProblemDetails> {
  log[level](fields, message);
  return err(problemDetails(status, message));
}

const FORGE_AUTH_CODES = new Set([
  "NEEDS_AUTHENTICATION_ERR",
  "AUTH_TYPE_UNAVAILABLE",
]);

function classifyError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && FORGE_AUTH_CODES.has(code)
    ? code
    : "UNCLASSIFIED";
}

/**
 * Send a request, check the status and parse the JSON body, logging each
 * stage under `${op}.*`. Raw errors, messages and upstream bodies are never
 * logged or returned because they can contain secrets. The body is returned
 * unvalidated: callers must check the shape of `T`.
 */
export async function requestJson<T>(
  send: () => Promise<JsonResponse>,
  call: {
    op: string;
    label: string;
    fields: Fields;
    failures: {
      request: Failure;
      http: (status: number) => Failure;
      json: Failure;
    };
  },
): Promise<Result<T | null, ProblemDetails>> {
  const { op, label, fields, failures } = call;
  const failed = (stage: string, failure: Failure, extra: Fields) =>
    fail("error", failure.status, failure.message, {
      event: `${op}.failed`,
      stage,
      ...fields,
      ...extra,
    });

  log.info({ event: `${op}.started`, ...fields }, `${label} started`);
  let response: JsonResponse;
  try {
    response = await send();
  } catch (error) {
    return failed("request", failures.request, {
      errorCode: classifyError(error),
    });
  }
  const { status } = response;
  log.info({ event: `${op}.response`, status }, `${label} responded`);
  if (!response.ok) return failed("http", failures.http(status), { status });
  try {
    return ok((await response.json()) as T | null);
  } catch {
    return failed("json", failures.json, { status });
  }
}
