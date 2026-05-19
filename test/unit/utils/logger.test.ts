/**
 * Logger utility tests
 */

import { Logger, LogLevel } from '../../../src/utils/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should log debug messages when level is DEBUG', () => {
    const logger = new Logger('test', LogLevel.DEBUG);
    logger.debug('test message', { data: 'value' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEBUG'),
      expect.anything()
    );
  });

  it('should log info messages', () => {
    const logger = new Logger('test', LogLevel.INFO);
    logger.info('test message');

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      ''
    );
  });

  it('should log warn messages', () => {
    const logger = new Logger('test', LogLevel.WARN);
    logger.warn('test warning');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARN'),
      ''
    );
  });

  it('should log error messages', () => {
    const logger = new Logger('test', LogLevel.ERROR);
    const error = new Error('test error');
    logger.error('test error', error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      error
    );
  });

  it('should not log debug when level is INFO', () => {
    const logger = new Logger('test', LogLevel.INFO);
    logger.debug('debug message');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should include logger name in message', () => {
    const logger = new Logger('myLogger', LogLevel.INFO);
    logger.info('test message');

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('myLogger'),
      ''
    );
  });

  it('should allow changing log level', () => {
    const logger = new Logger('test', LogLevel.INFO);
    logger.debug('should not log');
    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockClear();
    logger.setLevel(LogLevel.DEBUG);
    logger.debug('should log');
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
