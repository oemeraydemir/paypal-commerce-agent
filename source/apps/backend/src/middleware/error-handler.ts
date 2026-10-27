import { Request, Response, NextFunction } from 'express';
import { redactSecrets } from '../utils/redact';

// CRITICAL FIX #2: AppError class + centralized error handler (was missing,
// code would not compile).
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    // Restore prototype chain (TS targeting ES5/ES2015 class-extends-builtin)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Express errors (e.g. body-parser PayloadTooLarge) carry a numeric statusCode.
  const statusCode: number =
    err instanceof AppError
      ? err.statusCode
      : typeof (err as any).statusCode === 'number'
        ? (err as any).statusCode
        : 500;

  // Log error (without sensitive data). CRITICAL FIX #7: secret redaction policy
  // is enforced at the logger/stream level; never attach credentials here.
  const logData = {
    method: req.method,
    path: req.path,
    error: redactSecrets(err.message),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  };

  console.error(
    `[${logData.method}] ${logData.path} → ${statusCode}: ${logData.error}`
  );

  if (err instanceof AppError) {
    return res.status(statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  // Unexpected error (or framework error with its own statusCode, e.g. 413)
  return res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default errorHandler;
