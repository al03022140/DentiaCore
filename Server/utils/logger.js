const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fsExtra = require('fs-extra');
const config = require('../config/env');

const logsDir = config.ops.logsDir
  ? path.resolve(config.ops.logsDir)
  : path.join(__dirname, '../logs');

fsExtra.ensureDirSync(logsDir);

const logFormat = format.printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const baseMessage = stack || message;
  return `${timestamp} [${level}] ${baseMessage}${metaString}`;
});

const logger = createLogger({
  level: config.ops.logLevel || (config.isProd ? 'info' : 'debug'),
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ level, message, stack, ...meta }) => {
          const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[${level}] ${stack || message}${metaString}`;
        })
      )
    }),
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'dent-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: config.ops.logMaxFiles || '14d'
    })
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: config.ops.logMaxFiles || '30d'
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: config.ops.logMaxFiles || '30d'
    })
  ],
  exitOnError: false
});

logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
