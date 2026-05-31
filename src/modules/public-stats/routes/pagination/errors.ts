/**
 * Thrown when a client-supplied pagination cursor (or its decoded sort field)
 * fails structural validation. The constructor accepts only a short, fixed
 * reason string chosen by server code — caller input is never interpolated, so
 * a tampered cursor value (e.g. a Steam64) can never leak through the message.
 * Mapped to a 400 response in Plan 14-03.
 */
export class BadCursorError extends Error {
  public override readonly name = "BadCursorError";

  public constructor(reason: string) {
    super(reason);
  }
}
