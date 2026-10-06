/** Error con código HTTP y un identificador estable que el frontend puede interpretar. */
export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
