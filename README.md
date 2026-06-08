# localos-contracts

Smart contract source for LocalOS on Base. Contains LocalOSTreasury, the non-upgradable USDC treasury that receives model payments.

Website: https://localos.xyz
Docs: https://localos.xyz/docs
X: https://x.com/localos_xyz

---

## What this repo contains

Solidity contracts, Hardhat configuration, and test suite for the LocalOS payment system on Base mainnet.

```
contracts/
  LocalOSTreasury.sol   Non-upgradable USDC treasury, owner-only withdrawal
  MockUSDC.sol          Mock ERC20 token for local testing
test/
  LocalOSTreasury.test.ts   Hardhat tests for all contract functions
hardhat.config.ts       Hardhat build, network, and verification config
package.json            Dependencies: hardhat, ethers, chai, hardhat-verify
```

---

## How the payment system works

1. A user opens the Models page and connects a wallet.
2. The LocalOS API server generates a fresh one-time Ethereum address for the payment.
3. The user sends the required USDC amount to that address.
4. The backend payment worker polls Base every 15 seconds for incoming USDC on the fresh address.
5. When USDC is detected, the worker funds the fresh address with a small amount of ETH for gas, then calls transfer to move the USDC to LocalOSTreasury.
6. Access is recorded in the local SQLite database and the model unlocks immediately.

LocalOSTreasury is the final destination for all USDC collected. The owner wallet can withdraw at any time.

---

## Contract: LocalOSTreasury

Network: Base mainnet
Address: 0x9FFb768F76B657b94c0a4cC42dDAc51BB4cEfD02
Basescan: https://basescan.org/address/0x9FFb768F76B657b94c0a4cC42dDAc51BB4cEfD02
Compiler: Solidity 0.8.22
License: MIT
Pattern: non-upgradable (no proxy)
Payment token: USDC at 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

### Functions

| Function | Access | Description |
|---|---|---|
| withdrawToken(address token, address to, uint256 amount) | owner | Withdraw a specific amount of any ERC20 token to a recipient. |
| withdrawAllToken(address token, address to) | owner | Withdraw the full ERC20 balance to a recipient. |
| withdrawETH(address to, uint256 amount) | owner | Withdraw a specific amount of ETH to a recipient. |
| transferOwnership(address newOwner) | owner | Transfer contract ownership to a new address. |

### Events

| Event | Description |
|---|---|
| TokenWithdrawn(address token, address to, uint256 amount) | Emitted on ERC20 withdrawal. |
| ETHWithdrawn(address to, uint256 amount) | Emitted on ETH withdrawal. |
| OwnershipTransferred(address previousOwner, address newOwner) | Emitted on ownership transfer. |

### Constructor

```solidity
constructor(address _owner)
```

Deploys the contract and sets the owner. The owner address must not be the zero address. Ownership cannot be renounced, only transferred.

---

## Running tests

Requirements: Node.js 24, pnpm 9 or later.

Install dependencies:

```
pnpm install
```

Run the test suite against a local Hardhat network:

```
pnpm run test
```

---

## Deploying

Set environment variables:

```
DEPLOYER_PRIVATE_KEY   Private key of the deployer wallet
BASE_RPC_URL           Base mainnet RPC endpoint
BASESCAN_API_KEY       API key for contract verification on Basescan
```

Deploy to Base mainnet:

```
pnpm run deploy:mainnet
```

Verify on Basescan after deployment:

```
pnpm run verify:mainnet <deployed_address> <owner_address>
```

---

## Architecture decision

LocalOSTreasury is intentionally non-upgradable. There is no proxy, no admin key that can swap the implementation, and no upgrade function. If payment logic needs changing in the future, a new contract is deployed and the relay worker's TREASURY_ADDRESS environment variable is updated. This makes the contract simple, auditable, and trustless.

---

## Links

Main app: https://github.com/localos-dev/localos
Docs: https://github.com/localos-dev/localos-docs
Model catalog: https://github.com/localos-dev/localos-models
Website: https://localos.xyz
X: https://x.com/localos_xyz
