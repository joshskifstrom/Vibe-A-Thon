const sid = () => "CA" + Math.random().toString(36).slice(2, 14).toUpperCase();

// Caller's opening sentence broken into word-by-word chunks for live transcript effect
const CALLER_PHRASE = [
  "Hey,", "I", "think", "I", "left", "my", "card",
  "at", "a", "gas", "station", "and", "I'm", "panicking."
];

export function getIntelligentFlowScript() {
  const callSid = sid();

  // Build word-by-word transcript events starting at t=1800ms, 160ms per word
  const wordEvents = CALLER_PHRASE.map((word, i) => [
    1800 + i * 160,
    { type: "caller_word", word, final: i === CALLER_PHRASE.length - 1 },
  ]);

  return [
    [0,    { type: "call_start", callSid, from: "+1 (512) 867-5309" }],
    [700,  { type: "step", node: "caller",        status: "active",  message: "Call connected" }],
    [1100, { type: "step", node: "twilio",        status: "active",  message: "Studio flow — <Start><Stream> to Conversation Intelligence" }],

    // Intelligence engine spins up while caller begins speaking
    [1400, { type: "step", node: "intelligence",  status: "active",  message: "Streaming audio — Language Operators listening…" }],

    // Caller speech — word events injected above
    ...wordEvents,

    // Language Operator fires at ~3.0s — before caller even finishes
    [3000, { type: "intent_detected", intent: "lost_stolen", confidence: 0.94, trigger_phrase: "left my card…I'm panicking" }],
    [3100, { type: "step", node: "intelligence",  status: "success", message: "Language Operator fired: INTENT=lost_stolen  CONFIDENCE=0.94" }],
    [3200, { type: "security", level: "INFO",     message: "Early intent detection — skipping main menu DTMF gather" }],
    [3300, { type: "agent",  agent: "SECURITY",   status: "active",  message: "High-priority flag: card security event detected early" }],
    [3400, { type: "skip_menu" }],

    // Flow jumps directly to security Lambda — no menu, no DTMF
    [3700, { type: "step", node: "gateway",       status: "active",  message: "POST /ivr  {intent: lostStolen, source: intelligence}" }],
    [4000, { type: "step", node: "lambda",        status: "active",  message: "handler() — early intent path (no DTMF required)" }],
    [4200, { type: "security", level: "INFO",     message: "parseIntent(): lostStolen  source=conversation_intelligence  attempt=1" }],
    [4400, { type: "security", level: "REDACT",   message: "redactSensitiveData(): body → [REDACTED]  speech transcript not logged" }],
    [4500, { type: "agent",  agent: "ARCHITECT",  status: "active",  message: "Intelligence → Gateway → Lambda path established ✓" }],
    [4700, { type: "step", node: "dynamo",        status: "active",  message: "PutItem: {callSid, intent, source: intelligence, attempt:1}" }],
    [5000, { type: "step", node: "dynamo",        status: "success" }],
    [5200, { type: "step", node: "secrets",       status: "active",  message: "GetSecretValue('fintech-ivr/card-backend')" }],
    [5500, { type: "step", node: "secrets",       status: "success" }],
    [5700, { type: "security", level: "INFO",     message: "Outbound payload: { token, intent } — speech text never sent to backend ✓" }],
    [5900, { type: "step", node: "backend",       status: "active",  message: "POST /validate — tokenized data only" }],
    [6500, { type: "step", node: "backend",       status: "success", message: "{ status: 'ok' } → auth_status: success" }],
    [6700, { type: "security", level: "SUCCESS",  message: "auth_status: success — card block initiated" }],
    [6900, { type: "agent",  agent: "DEVELOPER",  status: "done",    message: "Lambda 200 OK — intelligence path clean ✓" }],
    [7100, { type: "step", node: "lambda",        status: "success", message: "TwiML — high-priority confirmation" }],
    [7300, { type: "step", node: "twilio",        status: "success", message: "Playing confirmation — no menu was heard" }],
    [7600, { type: "audio", speaker: "IVR",       text: "We detected your card may be at risk. Your card has been immediately blocked. A replacement will be rush-shipped in 1 to 2 business days. Your case number is IVR-8423." }],
    [9600, { type: "step", node: "caller",        status: "success", message: "Confirmed — call ended" }],
    [9800, { type: "deflected" }],
    [10000,{ type: "security", level: "SUCCESS",  message: "68% faster than DTMF flow ✓  No menu played  Zero speech data logged ✓" }],
    [10200,{ type: "agent",  agent: "SECURITY",   status: "done",    message: "Speech transcript not persisted — only intent token logged ✓" }],
    [10400,{ type: "agent",  agent: "ARCHITECT",  status: "done",    message: "Conversation Intelligence path: end-to-end ✓" }],
    [10600,{ type: "agent",  agent: "INTEGRATOR", status: "done",    message: "Connect not needed — self-service in <10s ✓" }],
    [10800,{ type: "complete", scenario: "intelligence" }],
  ];
}
