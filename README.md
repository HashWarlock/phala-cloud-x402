# Phala Cloud x402 Resource Server

A payment gateway service that enables users to top up [Phala Cloud](https://phala.com) workspace compute credits using cryptocurrency payments via the [x402 protocol](https://x402.org) using [Corbits](https://corbits.dev) Facilitator built on [Faremeter](https://github.com/Faremeter/x402).

## Overview

This server provides API endpoints that accept USDC payments on Solana and EVM networks (via x402) to add compute credits to Phala Cloud workspaces running Confidential Virtual Machines (CVMs). Users can check their workspace balance and purchase credits on-demand with crypto payments.

## Features

- **Multi-chain support**: Accept USDC payments on both Solana and EVM networks
- **Configurable networks**: Support mainnet and testnet via environment variables
- **Balance checking**: Free endpoint to check workspace credit balance
- **Automated top-ups**: Payment-gated endpoint to instantly add credits
- **Flexible configuration**: Enable/disable payment networks independently

## API Endpoints

### `GET /balance/:workspace`
Check the current balance of a Phala Cloud workspace.

**Response:**
```json
{
  "balance": 5.25,
  "workspace": "my-workspace",
  "needsTopup": false
}
```

### `POST /topup/:workspace`
Top up a workspace with compute credits (requires x402 payment).

**Payment:** USDC via x402 protocol (amount set by `TOP_UP_COST`)

**Response:**
```json
{
  "success": true,
  "newBalance": 6.25,
  "workspace": "my-workspace",
  "paidAmount": "1.00",
  "topupAmount": "1.00"
}
```

## Setup

### 1. Configure Environment Variables

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required
TOP_UP_COST=1000000  # Cost in micro-units (1000000 = 1.00 USDC)

# Network Configuration (at least one required)
EVM_RECEIVING_ADDRESS=0xYourEVMAddress
SOLANA_RECEIVING_ADDRESS=YourSolanaAddress

# Network Selection
EVM_NETWORK=base-sepolia     # or base, ethereum, etc.
SOLANA_NETWORK=devnet        # or mainnet-beta

# Phala Cloud API
PHALA_API_URL=https://cloud-api.phala.com
PHALA_CLOUD_API_KEY=your-api-key  # Optional

# Facilitor URL (default: Corbits Facilitator)
FACILITATOR_URL=
```

### 2. Run with Docker Compose

```bash
docker-compose up
```

The server will be available at `http://localhost:3000`

### 3. Run Locally

**Install dependencies:**
```bash
npm install
```

**Development mode (with hot-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### 4. Deploy to Phala Cloud
```bash
npx phala deploy
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TOP_UP_COST` | Yes | - | Amount to charge/topup (in micro-units) |
| `EVM_RECEIVING_ADDRESS` | Conditional* | - | Ethereum address to receive payments |
| `SOLANA_RECEIVING_ADDRESS` | Conditional* | - | Solana address to receive payments |
| `EVM_NETWORK` | No | `base-sepolia` | EVM network name |
| `SOLANA_NETWORK` | No | `devnet` | Solana network name |
| `PHALA_API_URL` | No | `https://cloud-api.phala.com` | Phala Cloud API endpoint |
| `PHALA_CLOUD_API_KEY` | No | - | Phala Cloud API key (if needed) |
| `LOG_LEVEL` | No | `info` | Logging level |

\* At least one receiving address (EVM or Solana) must be configured.

### Network Examples

**Mainnet Configuration:**
```env
EVM_NETWORK=base
SOLANA_NETWORK=mainnet-beta
EVM_RECEIVING_ADDRESS=0xYourMainnetAddress
SOLANA_RECEIVING_ADDRESS=YourMainnetAddress
```

**Testnet Configuration:**
```env
EVM_NETWORK=base-sepolia
SOLANA_NETWORK=devnet
EVM_RECEIVING_ADDRESS=0xYourTestnetAddress
SOLANA_RECEIVING_ADDRESS=YourDevnetAddress
```

## How It Works

1. **User checks balance** via `GET /balance/:workspace` (free)
2. **User initiates top-up** via `POST /topup/:workspace`
3. **x402 middleware** intercepts the request and requires payment
4. **User pays** with USDC via their wallet (Solana or EVM)
5. **Payment verified** by x402 protocol
6. **Credits added** to workspace via Phala Cloud API
7. **Response returned** with new balance

## Tech Stack

- **[Hono](https://hono.dev/)**: Fast, lightweight web framework
- **[x402](https://github.com/Faremeter/x402)**: HTTP 402 Payment Required protocol
- **[Phala Cloud](https://cloud.phala.com)**: Confidential computing platform
- **TypeScript**: Type-safe development
- **Pino**: High-performance logging

## License

MIT
