import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { SOMETHING_WENT_WRONG } from './all-exceptions.filter';

/**
 * Turns the Prisma errors a user can cause into proper HTTP answers instead of
 * a bare 500: a missing row is a 404, a duplicate is a 409. Any other database
 * error is logged in full and answered with a plain sentence.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Prisma');

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      super.catch(error, host);
      return;
    }
    const mapped: Record<string, [number, string]> = {
      P2025: [
        HttpStatus.NOT_FOUND,
        'That is not there any more. Refresh the page and try again.',
      ],
      P2002: [HttpStatus.CONFLICT, 'That already exists.'],
      P2003: [
        HttpStatus.BAD_REQUEST,
        'Something that goes with it is gone. Refresh the page and try again.',
      ],
    };
    const hit = mapped[error.code];
    if (hit) this.log.warn(`${error.code}: ${error.message.split('\n').pop()}`);
    else this.log.error(error);
    const [status, message] = hit ?? [
      HttpStatus.INTERNAL_SERVER_ERROR,
      SOMETHING_WENT_WRONG,
    ];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message });
  }
}
