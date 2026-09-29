import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { PaymentServiceError } from '../../billing/dodo.client';

export const SOMETHING_WENT_WRONG =
  'Something went wrong on our side. Please try again in a minute.';
const TOO_MANY =
  'Too many tries in a short time. Please wait a minute and try again.';

/**
 * The last word on every error, so nobody ever reads a stack trace or
 * "ThrottlerException": our own messages pass through as they are, an
 * unexpected error is logged in full and answered with a plain sentence,
 * and the admin panel also gets the payment service's own reason.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return super.catch(exception, host);
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    // A handler that answered itself (a redirect, a page) and then failed.
    if (res.headersSent) {
      this.log.error(
        `${req.method} ${req.originalUrl} failed after answering: ${String(exception)}`,
      );
      return;
    }
    const send = (status: number, message: string) =>
      res.status(status).json({ statusCode: status, message });

    if (exception instanceof PaymentServiceError) {
      const admin = req.originalUrl.startsWith('/admin/');
      return send(
        exception.getStatus(),
        admin
          ? `${exception.message} (${exception.detail})`
          : exception.message,
      );
    }
    if (exception instanceof HttpException) {
      if (exception.getStatus() === 429) {
        return send(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY);
      }
      return super.catch(exception, host);
    }
    this.log.error(
      `${req.method} ${req.originalUrl}: ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
    );
    return send(HttpStatus.INTERNAL_SERVER_ERROR, SOMETHING_WENT_WRONG);
  }
}
