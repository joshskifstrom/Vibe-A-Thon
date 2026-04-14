import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import https from "https";

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// ── Utility: Redact sensitive data before any logging ────────────────────────
// PCI-DSS: card numbers, CVV, and SSN must NEVER appear in CloudWatch logs
export function redactSensitiveData(data) {
  if (typeof data !== "object" || data === null) return data;
  const redacted = { ...data };

  if (redacted.cardNumber) {
    // Show last 4 digits only
    redacted.cardNumber = "****-****-****-" + String(redacted.cardNumber).slice(-4);
  }
  if (redacted.cvv)      redacted.cvv = "***";
  if (redacted.ssn)      redacted.ssn = "***-**-" + String(redacted.ssn).slice(-4);
  if (redacted.pin)      redacted.pin = "****";
  if (redacted.body)     redacted.body = "[REDACTED — raw Twilio body]";

  return redacted;
}

// ── Parse intent from Twilio webhook POST body ───────────────────────────────
// Twilio sends application/x-www-form-urlencoded
export function parseIntent(event) {
  const params = new URLSearchParams(event.body || "");

  const digits  = params.get("Digits")  || "";
  const callSid = params.get("CallSid") || "";
  const speech  = (params.get("SpeechResult") || "").toLowerCase();

  // Detect warm-handoff trigger word via speech ("agent", "representative", etc.)
  const wantsAgent = /\b(agent|representative|human|operator|help)\b/.test(speech);

  const intentMap = { "1": "lostStolen", "2": "cardActivation" };
  const intent = wantsAgent ? "warmHandoff" : (intentMap[digits] || "unknown");

  return { intent, callSid, digits, attempt: parseInt(params.get("attempt") || "1", 10) };
}

// ── Validate auth against card backend ──────────────────────────────────────
// Returns ONLY { auth_status: "success" | "fail" } — raw backend data never leaves this fn
export async function validateAuth(tokenizedData) {
  // Pull API key and backend URL from Secrets Manager — never from env vars
  const secretRes = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.CARD_BACKEND_SECRET_NAME })
  );
  const { apiKey, cardBackendUrl } = JSON.parse(secretRes.SecretString);

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      token:  tokenizedData.token,
      intent: tokenizedData.intent,
    });
    const url = new URL(cardBackendUrl);

    const req = https.request(
      {
        hostname: url.hostname,
        path:     url.pathname,
        method:   "POST",
        headers:  {
          "Content-Type":   "application/json",
          "x-api-key":      apiKey,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(raw);
            // Tokenized result only — never return raw backend payload
            resolve({ auth_status: result.status === "ok" ? "success" : "fail" });
          } catch {
            resolve({ auth_status: "fail" });
          }
        });
      }
    );
    req.on("error", () => resolve({ auth_status: "fail" }));
    req.write(payload);
    req.end();
  });
}

// ── Write handoff context to DynamoDB before transferring to Connect ─────────
// Connect's Contact Flow Lambda reads this by caller phone number for screen pop
export async function writeHandoffContext(callerPhone, callSid, intent, authSummary) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE,
      Item: {
        // Keyed by caller phone so Connect Contact Flow can look it up on pickup
        pk:          { S: `HANDOFF#${callerPhone}` },
        callSid:     { S: callSid },
        intent:      { S: intent },
        authSummary: { S: authSummary },         // e.g. "failed_2_attempts" or "agent_requested"
        timestamp:   { S: new Date().toISOString() },
        ttl:         { N: String(Math.floor(Date.now() / 1000) + 3600) }, // 1hr TTL
      },
    })
  );
}

// ── Build TwiML response ─────────────────────────────────────────────────────
export function buildTwiML(intent, authResult, attemptCount) {
  const { auth_status } = authResult;

  // Warm handoff — dial Intuit's existing Amazon Connect inbound number.
  // The call re-enters Connect exactly as it does today (Twilio → Connect → IBCC queue → agent).
  // Context written to DynamoDB beforehand so the agent gets a screen pop via Connect Contact Flow.
  if (intent === "warmHandoff" || (auth_status === "fail" && attemptCount >= 2)) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">
    I'm unable to verify your identity. Please hold while I transfer you to an agent.
  </Say>
  <Dial>${process.env.CONNECT_INBOUND_NUMBER}</Dial>
</Response>`;
  }

  // Auth success
  if (auth_status === "success") {
    const msg = intent === "lostStolen"
      ? "Your card has been successfully reported as lost or stolen. A replacement will arrive in 5 to 7 business days."
      : "Your card has been successfully activated. You may now use it for purchases.";
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">${msg}</Say>
  <Hangup/>
</Response>`;
  }

  // Auth fail — retry (attempt < 2)
  const nextAttempt = attemptCount + 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">
    I'm sorry, I could not verify your card details. Please try again.
  </Say>
  <Redirect method="POST">${process.env.LAMBDA_URL}?attempt=${nextAttempt}</Redirect>
</Response>`;
}

// ── Track call state in DynamoDB ─────────────────────────────────────────────
async function trackCallState(callSid, intent, attempt) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE,
      Item: {
        callSid:   { S: callSid },
        intent:    { S: intent },
        attempt:   { N: String(attempt) },
        timestamp: { S: new Date().toISOString() },
        ttl:       { N: String(Math.floor(Date.now() / 1000) + 86400) }, // 24hr TTL
      },
    })
  );
}

// ── Main Lambda handler ──────────────────────────────────────────────────────
export const handler = async (event) => {
  // Safe to log — body is redacted
  console.log("IVR request:", JSON.stringify(redactSensitiveData(event)));

  const xmlHeaders = { "Content-Type": "text/xml" };

  try {
    const { intent, callSid, attempt } = parseIntent(event);

    // Unrecognised input
    if (intent === "unknown") {
      return {
        statusCode: 200,
        headers: xmlHeaders,
        body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">
    I did not understand your selection. Please call back and try again.
  </Say>
  <Hangup/>
</Response>`,
      };
    }

    // Immediate warm handoff if caller said "Agent" — write context then dial Connect
    const callerPhone = new URLSearchParams(event.body || "").get("From") || "unknown";
    if (intent === "warmHandoff") {
      await trackCallState(callSid, intent, attempt);
      await writeHandoffContext(callerPhone, callSid, intent, "agent_requested");
      return {
        statusCode: 200,
        headers: xmlHeaders,
        body: buildTwiML("warmHandoff", { auth_status: "fail" }, 2),
      };
    }

    // Track state before validation
    await trackCallState(callSid, intent, attempt);

    // Tokenized data — digits collected via DTMF only, never ASR
    const tokenizedData = {
      intent,
      token: new URLSearchParams(event.body || "").get("Digits") || "",
    };

    // Validate — returns only auth_status token
    const authResult = await validateAuth(tokenizedData);

    // If this attempt triggers warm handoff, write context for agent screen pop first
    if (authResult.auth_status === "fail" && attempt >= 2) {
      await writeHandoffContext(callerPhone, callSid, intent, "failed_2_attempts");
    }

    return {
      statusCode: 200,
      headers: xmlHeaders,
      body: buildTwiML(intent, authResult, attempt),
    };
  } catch (err) {
    // Log message only — never log stack trace that might contain event data
    console.error("Handler error:", err.message);
    return {
      statusCode: 200,
      headers: xmlHeaders,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">
    We are experiencing technical difficulties. Please try again later.
  </Say>
  <Hangup/>
</Response>`,
    };
  }
};
