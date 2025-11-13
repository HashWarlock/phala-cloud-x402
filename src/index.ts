import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { hono as middleware } from "@faremeter/middleware";
import { solana, evm } from "@faremeter/info";
import pino from "pino";

// Setup logger
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

// Environment variables
const {
  TOP_UP_COST,
  EVM_RECEIVING_ADDRESS,
  SOLANA_RECEIVING_ADDRESS,
  EVM_NETWORK,
  SOLANA_NETWORK,
  PHALA_CLOUD_API_KEY,
  DSTACK_APP_ID,
  DSTACK_GATEWAY_DOMAIN,
  FACILITATOR_URL,
} = process.env;

// Validate required environment variables
if (!TOP_UP_COST) {
  throw new Error("TOP_UP_COST is required");
}

if (!PHALA_CLOUD_API_KEY) {
  throw new Error("PHALA_CLOUD_API_KEY is required");
}

if (!EVM_RECEIVING_ADDRESS && !SOLANA_RECEIVING_ADDRESS) {
  throw new Error("At least one of EVM_RECEIVING_ADDRESS or SOLANA_RECEIVING_ADDRESS is required");
}

// Set network defaults
const evmNetwork = EVM_NETWORK || "base-sepolia";
const solanaNetwork = SOLANA_NETWORK || "devnet";
const phalaApiUrl = process.env.PHALA_API_URL || "https://cloud-api.phala.com";
const facilitatorURL = FACILITATOR_URL || "https://facilitator.corbits.io";

const app = new Hono();

// Helper function to build payment accepts array
const buildPaymentAccepts = () => {
  const accepts: any[] = [];

  if (SOLANA_RECEIVING_ADDRESS) {
    accepts.push(
      solana.x402Exact({
        network: solanaNetwork as any,
        asset: "USDC",
        amount: TOP_UP_COST,
        payTo: SOLANA_RECEIVING_ADDRESS,
      })
    );
  }

  if (EVM_RECEIVING_ADDRESS) {
    accepts.push(
      evm.x402Exact({
        network: evmNetwork as any,
        asset: "USDC",
        amount: TOP_UP_COST,
        payTo: EVM_RECEIVING_ADDRESS as `0x${string}`,
      })
    );
  }

  return accepts;
};

// Free endpoint - balance check
app.get("/balance/:workspace", async (c) => {
  try {

    const workspace = c.req.param("workspace");
    const response = await fetch(
      `${phalaApiUrl}/api/v1/workspaces/${workspace}/x402`,
      {
        headers: { "x-api-key": PHALA_CLOUD_API_KEY },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Phala API error: ${response.status} - ${errorText}`);
      throw new Error(`Phala API: ${response.status}`);
    }

    const data = (await response.json()) as { balance?: number };
    return c.json({
      balance: data.balance ?? 0,
      workspace,
      needsTopup: (data.balance ?? 0) < 1.1,
    });
  } catch (error) {
    return c.json(
      {
        error: "Balance check failed",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Paid endpoint - topup
app.post(
  "/topup/:workspace",
  await middleware.createMiddleware({
    facilitatorURL,
    accepts: buildPaymentAccepts(),
  }),
  async (c) => {
    try {
      const workspace = c.req.param("workspace");

      logger.info(
        `Topping up workspace ${workspace} with ${TOP_UP_COST} CVM credits`
      );

      const response = await fetch(
        `${phalaApiUrl}/api/v1/workspaces/${workspace}/x402`,
        {
          method: "POST",
          headers: {
            "x-api-key": PHALA_CLOUD_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({ amount: TOP_UP_COST }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Phala topup error: ${response.status} - ${errorText}`);
        throw new Error(`Phala topup: ${response.status}`);
      }

      const data = (await response.json()) as { balance?: number };
      return c.json({
        success: true,
        newBalance: data.balance ?? 0,
        workspace,
        paidAmount: TOP_UP_COST,
        topupAmount: TOP_UP_COST,
      });
    } catch (error) {
      return c.json(
        {
          error: "Topup failed",
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  }
);

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  const url = `https://${DSTACK_APP_ID}-${info.port}.${DSTACK_GATEWAY_DOMAIN}` || `http://localhost:${info.port}`
  console.log(`Server is running on ${url}`)
})
