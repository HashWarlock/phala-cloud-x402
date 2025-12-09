import "dotenv/config";
import { default as express } from "express";
import { createMiddleware } from "@faremeter/middleware/express";
import { evm } from "@faremeter/info";
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

type solNetworkType = "devnet" | "testnet" | "mainnet-beta";

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

const splTokenName = "USDC";

const usdcInfo = lookupKnownSPLToken(solanaNetwork as solNetworkType, splTokenName);
if (!usdcInfo) {
  throw new Error(`couldn't look up SPLToken ${splTokenName} on ${solanaNetwork}!`);
}

const app = express();

// Helper function to build payment accepts array
const buildPaymentAccepts = () => {
  const accepts: any[] = [];

  if (SOLANA_RECEIVING_ADDRESS) {
    logger.info({
      msg: "Adding Solana payment option",
      network: solanaNetwork,
      amount: TOP_UP_COST,
      payTo: SOLANA_RECEIVING_ADDRESS,
    });
    accepts.push([
      xSolanaSettlement({
        network: solanaNetwork as solNetworkType,
        asset: "USDC",
        amount: TOP_UP_COST,
        payTo: SOLANA_RECEIVING_ADDRESS,
      }),
      x402Exact({
        network: solanaNetwork as solNetworkType,
        asset: "USDC",
        amount: TOP_UP_COST,
        payTo: SOLANA_RECEIVING_ADDRESS,
      }),
    ]);
  }

  if (EVM_RECEIVING_ADDRESS) {
    logger.info({
      msg: "Adding EVM payment option",
      network: evmNetwork,
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

  return accepts;
};

// Free endpoint - balance check
app.get("/balance/:workspace", async (req, res) => {
  try {
    const workspace = req.params.workspace;
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
    res.json({
      balance: data.balance ?? 0,
      workspace,
      needsTopup: (data.balance ?? 0) < 1.1,
    });
  } catch (error) {
    res.status(500).json({
      error: "Balance check failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Paid endpoint - topup
app.get(
  "/topup/:workspace",
  createMiddleware({
    facilitatorURL,
    accepts: buildPaymentAccepts(),
  }),
  async (req, res) => {
    try {
      const workspace = req.params.workspace;

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
      res.json({
        success: true,
        newBalance: data.balance ?? 0,
        workspace,
        paidAmount: TOP_UP_COST,
        topupAmount: TOP_UP_COST,
      });
    } catch (error) {
      res.status(500).json({
        error: "Topup failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

const port = 3000;
app.listen(port, () => {
  const url = DSTACK_APP_ID && DSTACK_GATEWAY_DOMAIN
    ? `https://${DSTACK_APP_ID}-${port}.${DSTACK_GATEWAY_DOMAIN}`
    : `http://localhost:${port}`;
  console.log(`Server is running on ${url}`);
})
