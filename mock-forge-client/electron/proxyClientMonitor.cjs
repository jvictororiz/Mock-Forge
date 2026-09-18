'use strict';

const LOG_PREFIX = '[MockForge proxy][client-disconnect]';

function isUpstreamSuccess(status) {
  return typeof status === 'number' && status >= 200 && status < 300;
}

function logMismatch(payload) {
  console.warn(`${LOG_PREFIX} traffic_success_but_client_lost_connection ${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
    hint: 'upstream_returned_success_but_device_may_have_errored_traffic_will_still_show_2xx',
  })}`);
}

function attachClientDisconnectMonitor(clientReq, clientRes, context) {
  const state = {
    phase: 'request',
    headersSent: false,
    bytesWrittenToClient: 0,
    bytesReceivedFromUpstream: 0,
    upstreamStatus: null,
    upstreamComplete: false,
    pendingWrites: 0,
    drainCallback: null,
    clientDisconnected: false,
    disconnectReason: null,
    disconnectError: null,
    mismatchLogged: false,
    startedAt: Date.now(),
  };

  const snapshot = () => ({
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    clientIp: context.clientIp,
    userAgent: context.userAgent,
    route: context.route,
    phase: state.phase,
    headersSent: state.headersSent,
    bytesWrittenToClient: state.bytesWrittenToClient,
    bytesReceivedFromUpstream: state.bytesReceivedFromUpstream,
    upstreamStatus: state.upstreamStatus,
    upstreamComplete: state.upstreamComplete,
    pendingWrites: state.pendingWrites,
    disconnectReason: state.disconnectReason,
    disconnectError: state.disconnectError,
    bytesNotDelivered: Math.max(
      0,
      state.bytesReceivedFromUpstream - state.bytesWrittenToClient,
    ),
    durationMs: Date.now() - state.startedAt,
  });

  const tryDrain = () => {
    if (!state.upstreamComplete || state.pendingWrites > 0 || !state.drainCallback) {
      return;
    }
    const callback = state.drainCallback;
    state.drainCallback = null;
    callback();
  };

  const tryLogMismatch = () => {
    if (state.mismatchLogged || !state.clientDisconnected || !state.headersSent) return;
    if (!isUpstreamSuccess(state.upstreamStatus)) return;

    state.mismatchLogged = true;
    logMismatch(snapshot());
  };

  const reportDisconnect = (reason, error) => {
    if (state.clientDisconnected) return;
    state.clientDisconnected = true;
    state.disconnectReason = reason;
    if (error) {
      state.disconnectError = {
        code: error.code,
        message: error.message,
      };
    }
    tryLogMismatch();
  };

  clientReq.on('aborted', () => {
    reportDisconnect('client-request-aborted');
  });

  clientRes.on('error', (err) => {
    reportDisconnect('client-response-error', err);
  });

  clientRes.on('close', () => {
    if (state.upstreamComplete || state.clientDisconnected) return;
    if (!state.headersSent) return;
    reportDisconnect('client-response-closed-during-stream');
  });

  return {
    markHeadersSent(upstreamStatus) {
      state.phase = 'response-headers';
      state.headersSent = true;
      state.upstreamStatus = upstreamStatus ?? state.upstreamStatus;
    },
    markUpstreamChunk(byteLength) {
      state.phase = 'response-body';
      state.bytesReceivedFromUpstream += byteLength;
    },
    markClientWrite(byteLength) {
      state.bytesWrittenToClient += byteLength;
    },
    markClientWriteError(err) {
      reportDisconnect('client-write-failed', err);
    },
    markUpstreamComplete(upstreamStatus) {
      state.upstreamComplete = true;
      state.upstreamStatus = upstreamStatus ?? state.upstreamStatus;
      state.phase = 'complete';
      tryLogMismatch();
      tryDrain();
    },
    finishWhenDrained(callback) {
      state.drainCallback = callback;
      tryDrain();
    },
    writeToClient(chunk) {
      if (!chunk || clientRes.writableEnded || clientRes.destroyed) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      state.pendingWrites += 1;

      try {
        clientRes.write(buffer, (err) => {
          state.pendingWrites = Math.max(0, state.pendingWrites - 1);
          if (err) {
            this.markClientWriteError(err);
          } else {
            this.markClientWrite(buffer.length);
          }
          tryDrain();
        });
      } catch (err) {
        state.pendingWrites = Math.max(0, state.pendingWrites - 1);
        this.markClientWriteError(err);
        tryDrain();
      }
    },
    getDisconnectSnapshot() {
      return {
        clientDisconnected: state.clientDisconnected,
        disconnectReason: state.disconnectReason,
        bytesNotDelivered: Math.max(
          0,
          state.bytesReceivedFromUpstream - state.bytesWrittenToClient,
        ),
        pendingWrites: state.pendingWrites,
      };
    },
    getFullSnapshot() {
      return snapshot();
    },
  };
}

module.exports = {
  attachClientDisconnectMonitor,
  LOG_PREFIX,
};
