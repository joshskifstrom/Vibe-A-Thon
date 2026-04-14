const sid = () => "CA" + Math.random().toString(36).slice(2, 14).toUpperCase();

export function getHappyPathScript() {
  const callSid = sid();
  return [
    [0,     { type: "call_start",  callSid, from: "+1 (512) 867-5309" }],
    [700,   { type: "step",     node: "caller",  status: "active",  message: "Incoming call connected" }],
    [1100,  { type: "step",     node: "twilio",  status: "active",  message: "Studio flow triggered — playing greeting" }],
    [1500,  { type: "audio",    speaker: "IVR",  text: "Welcome to Intuit Card Services. To report a lost or stolen card, press 1. For card activation, press 2." }],
    [3400,  { type: "dtmf",     digit: "1",      message: "DTMF '1' — intent: lostStolen" }],
    [3800,  { type: "step",     node: "gateway", status: "active",  message: "POST /ivr  {intent, callSid}" }],
    [4200,  { type: "step",     node: "lambda",  status: "active",  message: "handler() invoked — Node.js 20.x" }],
    [4500,  { type: "security", level: "INFO",   message: `parseIntent(): callSid=${callSid.slice(0,10)}… intent=lostStolen attempt=1` }],
    [4700,  { type: "security", level: "REDACT", message: "redactSensitiveData(): event.body → [REDACTED — raw Twilio body]" }],
    [4900,  { type: "agent",    agent: "SECURITY",   status: "active", message: "PII check: body field redacted before CloudWatch ✓" }],
    [5100,  { type: "step",     node: "dynamo",  status: "active",  message: "PutItem: {callSid, intent, attempt:1, ttl:+24h}" }],
    [5400,  { type: "step",     node: "dynamo",  status: "success", message: "Call state tracked ✓" }],
    [5600,  { type: "agent",    agent: "ARCHITECT",  status: "active", message: "Twilio → Gateway → Lambda path nominal ✓" }],
    [5800,  { type: "security", level: "INFO",   message: "validateAuth(): requesting credentials from Secrets Manager" }],
    [6000,  { type: "step",     node: "secrets", status: "active",  message: "GetSecretValue('fintech-ivr/card-backend')" }],
    [6400,  { type: "step",     node: "secrets", status: "success", message: "apiKey + cardBackendUrl retrieved ✓" }],
    [6600,  { type: "security", level: "INFO",   message: "Outbound payload: { token, intent } — no raw card data ✓" }],
    [6800,  { type: "step",     node: "backend", status: "active",  message: "POST /validate — tokenized data only" }],
    [7500,  { type: "step",     node: "backend", status: "success", message: "{ status: 'ok' } → auth_status: success" }],
    [7700,  { type: "security", level: "SUCCESS", message: "auth_status: success — LLM context received token only, not raw card data ✓" }],
    [7900,  { type: "agent",    agent: "DEVELOPER",  status: "done",   message: "Lambda 200 OK — handler executed cleanly ✓" }],
    [8100,  { type: "step",     node: "lambda",  status: "success", message: "TwiML confirmation built" }],
    [8300,  { type: "step",     node: "gateway", status: "success", message: "Response delivered ✓" }],
    [8500,  { type: "step",     node: "twilio",  status: "success", message: "TwiML executed — playing confirmation" }],
    [8800,  { type: "audio",    speaker: "IVR",  text: "Your card has been successfully reported as lost or stolen. A replacement card will arrive in 5 to 7 business days. Thank you for calling Intuit Card Services." }],
    [10400, { type: "step",     node: "caller",  status: "success", message: "Confirmed — call ended" }],
    [10600, { type: "deflected" }],
    [10800, { type: "security", level: "SUCCESS", message: "Call deflected ✓  Amazon Connect queue not reached  Zero PII logged ✓" }],
    [11000, { type: "agent",    agent: "SECURITY",   status: "done",   message: "Zero sensitive data in logs ✓  PCI-DSS compliant ✓" }],
    [11200, { type: "agent",    agent: "ARCHITECT",  status: "done",   message: "Self-service complete — Connect untouched ✓" }],
    [11400, { type: "agent",    agent: "INTEGRATOR", status: "done",   message: "Warm handoff on standby — not triggered ✓" }],
    [11600, { type: "complete", scenario: "happy" }],
  ];
}
