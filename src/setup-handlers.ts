/**
 * Global error handlers — imported first (before any module with top-level
 * await) so that unhandled exceptions / rejections are always logged to
 * stderr instead of silently crashing the process.
 */

process.on("uncaughtException", (err) => {
  console.error("connector-contacts uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("connector-contacts unhandledRejection:", reason);
});
