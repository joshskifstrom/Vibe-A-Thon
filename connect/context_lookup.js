import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });

// Invoked by Amazon Connect Contact Flow on every inbound call.
// Reads the handoff context written by the Twilio Lambda before warm transfer.
// Returns Contact Attributes that appear on the agent's screen pop.
export const handler = async (event) => {
  const callerPhone = event?.Details?.ContactData?.CustomerEndpoint?.Address || "";

  if (!callerPhone) {
    return { intent: "unknown", authSummary: "no_caller_id", callSid: "", timestamp: "" };
  }

  try {
    const result = await dynamo.send(
      new GetItemCommand({
        TableName: process.env.DYNAMODB_TABLE,
        Key: { pk: { S: `HANDOFF#${callerPhone}` } },
      })
    );

    if (!result.Item) {
      // Caller came directly to Connect — no IVR context
      return { intent: "unknown", authSummary: "direct_call", callSid: "", timestamp: "" };
    }

    // Map DynamoDB item to Connect Contact Attributes
    return {
      intent:      result.Item.intent?.S      || "unknown",
      authSummary: result.Item.authSummary?.S || "unknown",
      callSid:     result.Item.callSid?.S     || "",
      timestamp:   result.Item.timestamp?.S   || "",
    };
  } catch (err) {
    console.error("context_lookup error:", err.message);
    return { intent: "unknown", authSummary: "lookup_error", callSid: "", timestamp: "" };
  }
};
