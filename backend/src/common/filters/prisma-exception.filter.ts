import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Turns the Prisma errors a user can cause into proper HTTP answers instead of
 * a bare 500: a missing row is a 404, a duplicate is a 409.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Prisma');

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped: Record<string, [number, string]> = {
      P2025: [HttpStatus.NOT_FOUND, 'Not found.'],
      P2002: [HttpStatus.CONFLICT, 'That already exists.'],
      P2003: [HttpStatus.BAD_REQUEST, 'A related record does not exist.'],
    };
    const hit = mapped[error.code];
    if (!hit || host.getType() !== 'http') {
      super.catch(error, host);
      return;
    }
    this.log.warn(`${error.code}: ${error.message.split('\n').pop()}`);
    const [status, message] = hit;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message });
  }
}
