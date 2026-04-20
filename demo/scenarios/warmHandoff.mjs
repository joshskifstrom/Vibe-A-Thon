const sid = () => "CA" + Math.random().toString(36).slice(2, 14).toUpperCase();

export function getWarmHandoffScript() {
  const callSid  = sid();
  const callerPhone = "+1 (512) 867-5309";
  return [
    [0,     { type: "call_start",  callSid, from: callerPhone }],
    [700,   { type: "step",     node: "caller",  status: "active",  message: "Incoming call connected" }],
    [1100,  { type: "step",     node: "twilio",  status: "active",  message: "Studio flow triggered" }],
    [1500,  { type: "audio",    speaker: "IVR",  text: "Welcome to Intuit Card Services. How can I help you today?" }],
    [2200,  { type: "caller_word", word: "My",      final: false }],
    [2360,  { type: "caller_word", word: "card",    final: false }],
    [2520,  { type: "caller_word", word: "was",     final: false }],
    [2680,  { type: "caller_word", word: "stolen.", final: true  }],
    [2900,  { type: "audio",    speaker: "IVR",  text: "I'm sorry to hear that. Let me verify your identity." }],

    // ── Attempt 1 ────────────────────────────────────────────────────────────
    [3400,  { type: "step",     node: "gateway", status: "active",  message: "POST /ivr  {attempt: 1}" }],
    [4200,  { type: "step",     node: "lambda",  status: "active",  message: "handler() invoked — attempt 1" }],
    [4500,  { type: "security", level: "INFO",   message: "parseIntent(): lostStolen  attempt=1" }],
    [4700,  { type: "security", level: "REDACT", message: "redactSensitiveData(): body → [REDACTED]" }],
    [4900,  { type: "agent",    agent: "SECURITY",   status: "active", message: "Monitoring auth attempt 1 of 2" }],
    [5100,  { type: "step",     node: "dynamo",  status: "active",  message: "PutItem: attempt 1" }],
    [5400,  { type: "step",     node: "dynamo",  status: "success" }],
    [5600,  { type: "step",     node: "secrets", status: "active",  message: "Fetching API key" }],
    [5900,  { type: "step",     node: "secrets", status: "success" }],
    [6100,  { type: "step",     node: "backend", status: "active",  message: "POST /validate — attempt 1" }],
    [6800,  { type: "step",     node: "backend", status: "fail",    message: "{ status: 'fail' } → auth_status: fail" }],
    [7000,  { type: "security", level: "INFO",   message: "Auth failed — attempt 1 of 2. Retry permitted." }],
    [7200,  { type: "step",     node: "lambda",  status: "active",  message: "buildTwiML(): retry prompt" }],
    [7400,  { type: "step",     node: "twilio",  status: "active",  message: "Playing retry prompt" }],
    [7600,  { type: "audio",    speaker: "IVR",  text: "I wasn't able to verify your identity. Could you please confirm your details once more?" }],
    [8000,  { type: "caller_word", word: "Sure,",    final: false }],
    [8160,  { type: "caller_word", word: "it's",     final: false }],
    [8320,  { type: "caller_word", word: "the",      final: false }],
    [8480,  { type: "caller_word", word: "Visa",     final: false }],
    [8640,  { type: "caller_word", word: "ending",   final: false }],
    [8800,  { type: "caller_word", word: "in",       final: false }],
    [8960,  { type: "caller_word", word: "4242.",    final: true  }],

    // ── Attempt 2 ────────────────────────────────────────────────────────────
    [9300,  { type: "step",     node: "gateway", status: "active",  message: "POST /ivr  {attempt: 2}" }],
    [9600,  { type: "step",     node: "lambda",  status: "active",  message: "handler() invoked — attempt 2" }],
    [9800,  { type: "security", level: "INFO",   message: "parseIntent(): lostStolen  attempt=2 (final)" }],
    [10000, { type: "step",     node: "dynamo",  status: "active",  message: "PutItem: attempt 2" }],
    [10300, { type: "step",     node: "dynamo",  status: "success" }],
    [10500, { type: "step",     node: "secrets", status: "active",  message: "Fetching API key" }],
    [10800, { type: "step",     node: "secrets", status: "success" }],
    [11000, { type: "step",     node: "backend", status: "active",  message: "POST /validate — attempt 2" }],
    [11700, { type: "step",     node: "backend", status: "fail",    message: "{ status: 'fail' } → auth_status: fail (2/2)" }],

    // ── Warm handoff triggered ────────────────────────────────────────────────
    [11300, { type: "security", level: "INFO",   message: "2 consecutive failures — warm handoff policy triggered" }],
    [11500, { type: "agent",    agent: "INTEGRATOR", status: "active", message: "Warm handoff triggered — writing context to DynamoDB" }],
    [11700, { type: "security", level: "INFO",   message: `writeHandoffContext(): HANDOFF#${callerPhone} → {intent, authSummary: failed_2_attempts}` }],
    [11900, { type: "step",     node: "dynamo",  status: "active",  message: `PutItem: HANDOFF#${callerPhone}  authSummary=failed_2_attempts  ttl:+1h` }],
    [12200, { type: "step",     node: "dynamo",  status: "success", message: "Handoff context saved ✓" }],
    [12400, { type: "step",     node: "lambda",  status: "success", message: "TwiML: <Dial> Connect inbound number" }],
    [12600, { type: "audio",    speaker: "IVR",  text: "I'm unable to verify your identity. Please hold while I transfer you to an agent." }],
    [13200, { type: "step",     node: "twilio",  status: "active",  message: "Dialing Amazon Connect inbound number…" }],

    // ── Amazon Connect ────────────────────────────────────────────────────────
    [13800, { type: "step",     node: "connect", status: "active",  message: "Call received — Contact Flow executing" }],
    [14100, { type: "agent",    agent: "ARCHITECT",  status: "done",   message: "Twilio → Connect bridge established ✓" }],
    [14400, { type: "step",     node: "connect", status: "active",  message: "Invoking context_lookup Lambda" }],
    [14700, { type: "step",     node: "dynamo",  status: "active",  message: `GetItem: HANDOFF#${callerPhone}` }],
    [15000, { type: "step",     node: "dynamo",  status: "success", message: "Context retrieved ✓" }],
    [15200, { type: "security", level: "SUCCESS", message: "Contact Attributes: intent=lostStolen  authSummary=failed_2_attempts  callSid=" + callSid.slice(0,10) + "…" }],
    [15500, { type: "step",     node: "connect", status: "success", message: "Routing to IBCC Queue — agent screen pop ready ✓" }],
    [15700, { type: "step",     node: "twilio",  status: "success" }],
    [15900, { type: "step",     node: "caller",  status: "active",  message: "On hold — connecting to live agent" }],
    [16100, { type: "agent",    agent: "INTEGRATOR", status: "done",   message: "Agent receiving: intent=lostStolen, 2 auth failures ✓" }],
    [16300, { type: "agent",    agent: "SECURITY",   status: "done",   message: "Zero PII in logs ✓  Handoff context secure ✓" }],
    [16500, { type: "handoff" }],
    [16700, { type: "complete", scenario: "handoff" }],
  ];
}
