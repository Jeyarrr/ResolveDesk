import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const notFound: RequestHandler = (_req, _res, next) =>
  next(new AppError(404, 'Endpoint not found'));
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  void _next;
  let status = 500,
    message = 'The request could not be completed. Please try again.';
  if (error instanceof AppError) {
    status = error.status;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    message = error.issues[0]?.message ?? 'Invalid input';
  } else {
    const e = error as { code?: string; cause?: { code?: string }; status?: number };
    const code = e.code ?? e.cause?.code;
    if (code === '23505') {
      status = 409;
      message = 'A record with that value already exists';
    } else if (code === '23503') {
      status = 409;
      message = 'This record is referenced or the selected record no longer exists';
    } else if (code === '40001' || code === '40P01') {
      status = 409;
      message = 'A concurrent change occurred. Refresh and retry.';
    } else if (e.status === 400) {
      status = 400;
      message = 'Invalid JSON request';
    } else if (e.status === 413) {
      status = 413;
      message = 'Request too large';
    } else
      console.error('Request failed', { code: code?.match(/^[A-Z0-9]{5}$/)?.[0] ?? 'INTERNAL' });
  }
  res.status(status).json({ success: false, error: { message } });
};
