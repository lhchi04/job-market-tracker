import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { documentClient, requireEnv } from "./client";
import { loadReport } from "./store";

const TABLE = requireEnv("TABLE_NAME");

export const handler = async (): Promise<APIGatewayProxyStructuredResultV2> => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await loadReport(documentClient, TABLE)),
});
