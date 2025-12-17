import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { hono as middleware } from "@faremeter/middleware";
import { solana, evm } from "@faremeter/info";
import {
  lookupKnownSPLToken,
  x402Exact,
  xSolanaSettlement,
} from "@faremeter/info/solana";
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

// Log configuration at startup
logger.info({
  msg: "Starting x402 payment server",
  config: {
    topUpCost: TOP_UP_COST,
    evmNetwork,
    solanaNetwork,
    phalaApiUrl,
    facilitatorURL,
    evmReceivingAddress: EVM_RECEIVING_ADDRESS || "not configured",
    solanaReceivingAddress: SOLANA_RECEIVING_ADDRESS || "not configured",
  },
});

const splTokenName = "USDC";

const usdcInfo = lookupKnownSPLToken(solanaNetwork as any, splTokenName);
if (!usdcInfo) {
  throw new Error(`couldn't look up SPLToken ${splTokenName} on ${solanaNetwork}!`);
}
logger.info({ msg: "USDC token info loaded", usdcInfo });

const app = new Hono();

// Helper function to build payment accepts array
const buildPaymentAccepts = () => {
  logger.info({ msg: "Building payment accepts array" });
  const accepts: any[] = [];

  if (SOLANA_RECEIVING_ADDRESS) {
    logger.info({
      msg: "Adding Solana payment options",
      network: solanaNetwork,
      asset: "USDC",
      amount: TOP_UP_COST,
      payTo: SOLANA_RECEIVING_ADDRESS,
    });
    accepts.push(
      solana.x402Exact({
        network: solanaNetwork as any,
        asset: "USDC",
        amount: TOP_UP_COST,
        payTo: SOLANA_RECEIVING_ADDRESS,
      }),
      solana.xSolanaSettlement({
        network: solanaNetwork as any,
        asset: "USDC",
        amount: TOP_UP_COST,
        payTo: SOLANA_RECEIVING_ADDRESS,
      })
    );
  }

  if (EVM_RECEIVING_ADDRESS) {
    logger.info({
      msg: "Adding EVM payment option",
      network: evmNetwork,
      asset: "USDC",
      amount: TOP_UP_COST,
      payTo: EVM_RECEIVING_ADDRESS,
    });
    accepts.push(
      evm.x402Exact({
        network: evmNetwork as any,
        asset: "USDC",
        amount: TOP_UP_COST,
        payTo: EVM_RECEIVING_ADDRESS as `0x${string}`,
      })
    );
  }

  logger.info({ msg: "Payment accepts built", totalOptions: accepts.length });
  return accepts;
};

// Free endpoint - balance check
app.get("/balance/:workspace", async (c) => {
  const workspace = c.req.param("workspace");
  logger.info({ msg: "Balance check request received", workspace });

  try {
    const url = `${phalaApiUrl}/api/v1/workspaces/${workspace}/x402`;
    logger.info({ msg: "Fetching balance from Phala API", url });

    const response = await fetch(url, {
      headers: { "x-api-key": PHALA_CLOUD_API_KEY },
    });

    logger.info({
      msg: "Phala API response received",
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({
        msg: "Phala API error",
        workspace,
        status: response.status,
        errorText,
      });
      throw new Error(`Phala API: ${response.status}`);
    }

    const data = (await response.json()) as { balance?: number };
    const balance = data.balance ?? 0;

    logger.info({
      msg: "Balance check successful",
      workspace,
      balance,
    });

    return c.json({
      balance,
      workspace,
    });
  } catch (error) {
    logger.error({
      msg: "Balance check failed",
      workspace,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

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
logger.info({ msg: "Creating payment middleware", facilitatorURL });
const paymentAccepts = buildPaymentAccepts();
logger.info({ msg: "Payment accepts configuration", paymentAccepts });

app.get(
  "/topup/:workspace",
  await middleware.createMiddleware({
    facilitatorURL,
    accepts: paymentAccepts,
  }),
  async (c) => {
    const workspace = c.req.param("workspace");
    logger.info({
      msg: "Topup request received (payment verified)",
      workspace,
      topUpCost: TOP_UP_COST,
    });

    try {
      const url = `${phalaApiUrl}/api/v1/workspaces/${workspace}/x402`;
      const adjustedAmount = Number(TOP_UP_COST) / 1_000_000;
      const body = { amount: adjustedAmount };

      logger.info({
        msg: "Adjusted topup amount for Phala API",
        rawAmount: TOP_UP_COST,
        adjustedAmount,
      });

      logger.info({
        msg: "Sending topup request to Phala API",
        url,
        body,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": PHALA_CLOUD_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      logger.info({
        msg: "Phala topup API response received",
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          msg: "Phala topup API error",
          workspace,
          status: response.status,
          errorText,
        });
        throw new Error(`Phala topup: ${response.status}`);
      }

      const data = (await response.json()) as { balance?: number };
      const newBalance = data.balance ?? 0;

      logger.info({
        msg: "Topup successful",
        workspace,
        topupAmount: TOP_UP_COST,
        newBalance,
      });

      return c.json({
        success: true,
        newBalance,
        workspace,
        paidAmount: TOP_UP_COST,
        topupAmount: TOP_UP_COST,
      });
    } catch (error) {
      logger.error({
        msg: "Topup failed",
        workspace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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

logger.info({ msg: "Starting HTTP server", port: 3000 });

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  const url = DSTACK_APP_ID && DSTACK_GATEWAY_DOMAIN
    ? `https://${DSTACK_APP_ID}-${info.port}.${DSTACK_GATEWAY_DOMAIN}`
    : `http://localhost:${info.port}`;

  logger.info({
    msg: "Server started successfully",
    port: info.port,
    url,
    endpoints: [
      `GET ${url}/balance/:workspace`,
      `GET ${url}/topup/:workspace`,
    ],
  });
})
