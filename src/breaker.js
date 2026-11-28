// src/breaker.js: wraps a function in a circuit breaker and logs every state change
const CircuitBreaker = require("opossum");

function createBreaker(action, name) {
  const breaker = new CircuitBreaker(action, {
    timeout: false,               // off here: the action already gives up after 500 ms
    volumeThreshold: 10,          // judge only after at least 10 calls...
    errorThresholdPercentage: 50, // ...then open if more than 50% of them failed
    rollingCountTimeout: 10000,   // "recent calls" means the last 10 seconds
    resetTimeout: 10000,          // once open, wait 10 s before letting a test call through
  });

  breaker.on("open", () =>
    console.log(`[breaker] OPEN: calls to ${name} are failing, refusing calls for 10 s`));
  breaker.on("halfOpen", () =>
    console.log(`[breaker] HALF-OPEN: letting one test call through to ${name}`));
  breaker.on("close", () =>
    console.log(`[breaker] CLOSED: ${name} answered, calls go through again`));

  return breaker;
}

// "closed", "open" or "halfOpen", for the stats endpoint
function stateOf(breaker) {
  if (breaker.opened) return "open";
  if (breaker.halfOpen) return "halfOpen";
  return "closed";
}

module.exports = { createBreaker, stateOf };
