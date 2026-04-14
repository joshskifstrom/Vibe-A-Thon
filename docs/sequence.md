# IVR Flow — Sequence Diagram

## Current State (Before This Project)
```
Customer → Twilio (PSTN inbound) → Amazon Connect → IBCC Queue → Live Agent
```
Every call reaches a live agent. No self-service. No call deflection.

---

## New Flow (With AI IVR Layer)

```mermaid
sequenceDiagram
    participant C as Customer
    participant T as Twilio Studio
    participant G as API Gateway
    participant L as Lambda (Node.js 20.x)
    participant S as Secrets Manager
    participant DB as DynamoDB
    participant CB as Card Backend
    participant AC as Amazon Connect (existing)
    participant A as Live IBCC Agent

    C->>T: Incoming call (PSTN)
    Note over T: Twilio intercepts before routing to Connect
    T->>C: <Say> Greeting + <Gather> DTMF intent

    C->>T: DTMF 1 (Lost/Stolen) or 2 (Activate)
    T->>G: POST /ivr { intent, callSid }
    G->>L: Invoke handler(event)

    L->>DB: PutItem { callSid, intent, attempt: 1 }

    L-->>G: TwiML — collect card digits via DTMF
    G-->>T: TwiML response
    T->>C: <Gather> card digits

    C->>T: DTMF digits
    T->>G: POST /ivr { token, callSid, attempt }
    G->>L: Invoke handler(event)

    L->>S: GetSecretValue(card-backend-api-key)
    S-->>L: { apiKey, cardBackendUrl }

    L->>CB: POST /validate { token, intent }
    CB-->>L: { status: "ok" | "fail" }

    Note over L: Returns auth_status token only

    alt auth_status == "success"
        L-->>T: TwiML <Say> confirmation + <Hangup/>
        T->>C: "Your card has been reported/activated."
        Note over C,T: Call deflected — agent never involved
    else auth_status == "fail" AND attempt == 1
        L-->>T: TwiML <Say> retry + <Redirect>
        T->>C: "Details not recognized. Please try again."
    else auth_status == "fail" AND attempt >= 2  OR  caller said "Agent"
        L->>DB: PutItem HANDOFF#{callerPhone} { intent, authSummary, callSid }
        Note over DB: Context saved for agent screen pop
        L-->>T: TwiML <Dial> CONNECT_INBOUND_NUMBER
        T->>AC: Twilio dials Connect inbound number
        Note over AC: Call enters Connect exactly as it does today
        AC->>A: Routes to IBCC Queue → agent picks up
        AC->>L: Contact Flow Lambda: GetItem HANDOFF#{callerPhone}
        L-->>AC: { intent, authSummary } → Contact Attributes
        Note over A: Screen pop: intent + auth context visible
        A->>C: Live agent with full context
    end
```

## What Changes vs. Today

| | Before | After |
|---|---|---|
| Every call → agent | ✅ | ❌ (self-service first) |
| Call deflection rate | 0% | ~60–70% (self-service success) |
| Warm handoff path | Twilio → Connect (direct) | Twilio → IVR → Connect (same endpoint) |
| Agent has call context | ❌ | ✅ (screen pop via DynamoDB) |
| PII in logs | Risk | Zero (redacted before logging) |

## Data Redaction Policy

| Field       | Collected Via      | Logged  | Passed to LLM     |
|-------------|-------------------|---------|-------------------|
| Card Number | DTMF / Twilio Pay | NEVER   | NEVER             |
| CVV         | DTMF / Twilio Pay | NEVER   | NEVER             |
| Caller Phone| Twilio header     | YES     | HANDOFF key only  |
| Auth Result | Lambda token      | NEVER   | `auth_status` only|
| Call SID    | Twilio header     | YES     | YES               |
| Intent      | DTMF digit        | YES     | YES               |
