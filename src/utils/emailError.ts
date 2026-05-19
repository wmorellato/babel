/**
 * Email Service Error
 */

import { BabelError } from './errorHandler';

export class EmailError extends BabelError {
  constructor(message: string) {
    super(message, 'EMAIL_ERROR');
    this.name = 'EmailError';
  }
}
