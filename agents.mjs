import "dotenv/config";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import fs from "fs";
import readline from "readline";

// Credentials and config loaded from .env automatically
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-opus-4-6-v1:0";

// ── Agent Definitions ───────────────────────────────────────────────────────
const AGENTS = {
  ARCHITECT: {
    system: `You are the ARCHITECT agent in a Secure Fintech IVR system team.
Your specialty: Designing the secure bridge between Twilio (Webhooks/Studio) and AWS (Lambda/Connect).
Focus on PCI-DSS compliance, data flow architecture, and Mermaid sequence diagrams.
When producing a sequence diagram, output valid Mermaid syntax inside a \`\`\`mermaid block.
Be concise and technical. Output only what is requested — no preamble.`,
  },

  SECURITY: {
    system: `You are the SECURITY/COMPLIANCE agent in a Secure Fintech IVR system team.
Your specialty: PCI-DSS compliance, PII protection, zero-log policies, and tokenized validation.
Rules you enforce:
- Card numbers, CVV, and PINs MUST be collected via DTMF/Twilio <Pay> only — never via voice ASR or LLM context
- No sensitive data in CloudWatch logs, Lambda env vars, or API responses
- Auth results are passed as { auth_status: "success" | "fail" } tokens only
When reviewing, list specific risks and their mitigations. Be concise.`,
  },

  DEVELOPER: {
    system: `You are the DEVELOPER agent in a Secure Fintech IVR system team.
Your specialty: Node.js 20.x Lambda functions and Twilio Studio JSON configurations.
Tech stack: Node.js 20.x, AWS Lambda, DynamoDB, AWS Secrets Manager, Twilio Studio/TwiML.
When writing code: include redactSensitiveData utility, use async/await, add brief inline comments.
When writing Twilio Studio JSON: output valid JSON matching the Twilio Studio flow schema.
Output only the requested artifact — no explanation unless asked.`,
  },

  INTEGRATOR: {
    system: `You are the INTEGRATOR agent in a Secure Fintech IVR system team.
Your specialty: Amazon Connect configuration, API Gateway endpoints, warm handoff logic.
You configure: Amazon Connect Participant Service, contact flows, outbound queue transfers.
Resilience rules: if caller says "Agent" or fails auth twice → initiate warm handoff via Connect.
Output valid JSON/YAML configuration snippets when asked. Be concise.`,
  },
};

// ── Core: Invoke a single agent via AWS Bedrock ─────────────────────────────
async function runAgent(agentName, userMessage) {
  const agent = AGENTS[agentName];
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: agent.system }],
    messages: [{ role: "user", content: [{ text: userMessage }] }],
    inferenceConfig: { maxTokens: 4096 },
  });
  const response = await bedrockClient.send(command);
  return response.output.message.content[0].text;
}

// ── Orchestrator: 4-step execution protocol ─────────────────────────────────
async function orchestrate(task) {
  console.log("\n=== ORCHESTRATOR: Starting 4-step execution protocol ===\n");

  // Step 1 — Security Review
  process.stdout.write("[SECURITY/COMPLIANCE] Step 1: Security review... ");
  const securityReview = await runAgent(
    "SECURITY",
    `Task: ${task}\n\nPerform Step 1 — Security Review: Identify all sensitive data points in this task and define how each must be masked or tokenized.`
  );
  console.log("done");

  // Step 2 — Schema Design
  process.stdout.write("[ARCHITECT]           Step 2: Schema design... ");
  const schemaDesign = await runAgent(
    "ARCHITECT",
    `Task: ${task}\n\nSecurity constraints:\n${securityReview}\n\nPerform Step 2 — Schema Design: Define the JSON payload schema for the Twilio-to-AWS bridge for this task. Respect the security constraints above.`
  );
  console.log("done");

  // Step 3 — Drafting
  process.stdout.write("[DEVELOPER]           Step 3: Drafting code/config... ");
  const draft = await runAgent(
    "DEVELOPER",
    `Task: ${task}\n\nApproved schema:\n${schemaDesign}\n\nPerform Step 3 — Drafting: Write the code or configuration for this module using the schema above.`
  );
  console.log("done");

  // Step 4 — Resilience Check
  process.stdout.write("[INTEGRATOR]          Step 4: Resilience check... ");
  const resilienceCheck = await runAgent(
    "INTEGRATOR",
    `Task: ${task}\n\nDraft output:\n${draft}\n\nPerform Step 4 — Resilience Check: Define what happens when the caller says "Agent" or provides invalid input twice. Add the Amazon Connect warm handoff configuration.`
  );
  console.log("done\n");

  return {
    securityReview,
    schemaDesign,
    draft,
    resilienceCheck,
    // Convenience: final output ready to write to file or print
    summary: [
      "## Security Review\n" + securityReview,
      "## Schema Design\n"   + schemaDesign,
      "## Draft\n"           + draft,
      "## Resilience Check\n"+ resilienceCheck,
    ].join("\n\n---\n\n"),
  };
}

// ── Initial Assignment ───────────────────────────────────────────────────────
async function initializeProject() {
  console.log("=== INITIALIZING FINTECH IVR PROJECT ===\n");

  fs.mkdirSync("docs", { recursive: true });
  fs.mkdirSync("lambda", { recursive: true });
  console.log("✓ Created /docs and /lambda\n");

  // 1. Mermaid sequence diagram — ARCHITECT
  process.stdout.write("[ARCHITECT]   Generating sequence diagram... ");
  const diagram = await runAgent(
    "ARCHITECT",
    `Generate a Mermaid sequence diagram for this IVR flow:
Caller → Twilio Studio (Gather DTMF) → API Gateway → Lambda → Card Backend → Lambda → Twilio → Caller

Also include the fallback path: auth failure x2 → AWS Connect warm handoff to live IBCC agent.

Output ONLY the mermaid code block. No explanation.`
  );
  fs.writeFileSync("docs/sequence.md", `# IVR Flow — Sequence Diagram\n\n${diagram}\n`);
  console.log("done → docs/sequence.md");

  // 2. Lambda handler.js — DEVELOPER
  process.stdout.write("[DEVELOPER]   Generating Lambda handler... ");
  const lambdaCode = await runAgent(
    "DEVELOPER",
    `Write a Node.js 20.x AWS Lambda handler.js for a Card Activation and Lost/Stolen IVR flow.

Requirements:
- Export an async handler(event, context) function
- redactSensitiveData(data): masks card numbers (show last 4 only), fully masks CVV and SSN
- parseIntent(event): extracts intent from Twilio webhook POST body (cardActivation | lostStolen | unknown)
- validateAuth(tokenizedData): fetches card backend API key from AWS Secrets Manager, returns { auth_status: "success" | "fail" }
- buildTwiML(intent, authResult): returns a TwiML XML string for the caller response
- Add brief inline comments explaining each section

Output ONLY the JavaScript code.`
  );
  fs.writeFileSync("lambda/handler.js", lambdaCode);
  console.log("done → lambda/handler.js");

  // 3. Twilio Studio flow — DEVELOPER
  process.stdout.write("[DEVELOPER]   Generating Twilio Studio flow JSON... ");
  const twilioFlow = await runAgent(
    "DEVELOPER",
    `Generate a Twilio Studio flow JSON template for the "Lost/Stolen Card" IVR intent.

Include these widgets in order:
1. trigger — incomingCall trigger
2. say_greeting — <Say> "Welcome to card services. To report a lost or stolen card, press 1. For card activation, press 2."
3. gather_intent — <Gather> DTMF, timeout 5 seconds, numDigits 1
4. http_request — HTTP widget: POST to {{LAMBDA_URL}} with JSON body { intent, callSid }
5. say_result — <Say> response based on http_request response body auth_status field
6. connect_agent — Enqueue to "IBCC_Queue" for warm handoff on auth failure

Use {{LAMBDA_URL}} and {{ACCOUNT_SID}} as placeholders.

Output ONLY valid Twilio Studio flow JSON. No explanation.`
  );
  fs.writeFileSync("twilio_flow.json", twilioFlow);
  console.log("done → twilio_flow.json");

  console.log(`
=== PROJECT INITIALIZED ===
  docs/sequence.md     Mermaid sequence diagram (Twilio → Lambda → Card Backend)
  lambda/handler.js    Lambda boilerplate with redactSensitiveData utility
  twilio_flow.json     Twilio Studio Lost/Stolen flow template
`);
}

// ── Interactive REPL ─────────────────────────────────────────────────────────
async function startREPL() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('=== FINTECH IVR AGENT TEAM — INTERACTIVE MODE ===');
  console.log('Describe a feature or module to build. Type "exit" to quit.\n');

  const ask = () => {
    rl.question("You: ", async (input) => {
      const task = input.trim();
      if (!task || task.toLowerCase() === "exit") {
        console.log("Goodbye.");
        rl.close();
        return;
      }
      try {
        const result = await orchestrate(task);
        console.log("─".repeat(60));
        console.log(result.summary);
        console.log("─".repeat(60) + "\n");
      } catch (err) {
        console.error("Error:", err.message);
      }
      ask();
    });
  };

  ask();
}

// ── Entry Point ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args[0] === "--init") {
  initializeProject().catch(console.error);
} else {
  startREPL();
}
