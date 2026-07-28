import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

let requestCounter = 0;

// Socket statistics
const socketStats = {
  opened: 0,
  closed: 0,
  destroyed: 0,
  active: 0,
  keepAliveReused: 0,
  maxConcurrent: 0
};

export function getSocketStats() {
  return { ...socketStats };
}

/**
 * Connection Lifecycle Middleware
 *
 * Logs every HTTP request with its socket lifecycle:
 * - request id
 * - connection open
 * - headers sent
 * - response finished
 * - socket closed
 * - who closed connection
 * - close reason
 */
export function createConnectionLifecycleMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = ++requestCounter;
    const socketId = `${req.socket.remotePort || "?"}`;
    const startTime = Date.now();

    socketStats.active++;
    socketStats.opened++;
    if (socketStats.active > socketStats.maxConcurrent) {
      socketStats.maxConcurrent = socketStats.active;
    }

    // Log the request start
    logger.info(`[CONN] #${requestId} socket=${socketId} OPEN ${req.method} ${req.path}`, {
      requestId,
      socketId,
      method: req.method,
      path: req.path,
      event: "open",
      activeSockets: socketStats.active
    });

    // Track when headers are sent
    const onFinish = () => {
      const duration = Date.now() - startTime;
      logger.info(`[CONN] #${requestId} socket=${socketId} FINISH status=${res.statusCode} duration=${duration}ms`, {
        requestId,
        socketId,
        statusCode: res.statusCode,
        durationMs: duration,
        event: "finish"
      });
    };
    res.on("finish", onFinish);

    // Track socket close events from the underlying connection
    const sock = req.socket;
    const onClose = (hadError: boolean) => {
      const duration = Date.now() - startTime;
      socketStats.active--;
      socketStats.closed++;
      if (hadError) socketStats.destroyed++;
      logger.info(`[CONN] #${requestId} socket=${socketId} CLOSE hadError=${hadError} duration=${duration}ms`, {
        requestId,
        socketId,
        hadError,
        durationMs: duration,
        event: "close",
        activeSockets: socketStats.active
      });
      cleanup();
    };

    const cleanup = () => {
      sock.removeListener("close", onClose);
      res.removeListener("finish", onFinish);
    };
    sock.on("close", onClose);

    // Track aborted requests
    req.on("close", () => {
      if (!res.writableEnded) {
        const duration = Date.now() - startTime;
        logger.warn(`[CONN] #${requestId} socket=${socketId} ABORTED duration=${duration}ms — possible ERR_CONNECTION_CLOSED`, {
          requestId,
          socketId,
          durationMs: duration,
          event: "aborted"
        });
      }
    });

    next();
  };
}
