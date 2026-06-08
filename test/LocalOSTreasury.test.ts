import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { LocalOSTreasury } from "../typechain-types";
import { Contract } from "ethers";

describe("LocalOSTreasury", function () {
  let treasury: LocalOSTreasury;
  let usdc: Contract;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let recipient: SignerWithAddress;
  let attacker: SignerWithAddress;

  const USDC_100 = 100_000_000n; // 100 USDC (6 decimals)
  const USDC_50  = 50_000_000n;
  const USDC_15  = 15_000_000n;

  beforeEach(async () => {
    [owner, user1, recipient, attacker] = await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Mint USDC to user1 (simulates payment arriving from user)
    await (usdc as any).mint(user1.address, USDC_100);

    // Deploy LocalOSTreasury with owner
    const TreasuryFactory = await ethers.getContractFactory("LocalOSTreasury");
    treasury = (await TreasuryFactory.deploy(owner.address)) as unknown as LocalOSTreasury;
    await treasury.waitForDeployment();
  });

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", () => {
    it("sets the owner correctly", async () => {
      expect(await treasury.owner()).to.equal(owner.address);
    });

    it("reverts if deployed with zero address as owner", async () => {
      const TreasuryFactory = await ethers.getContractFactory("LocalOSTreasury");
      await expect(
        TreasuryFactory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("LocalOSTreasury: zero address");
    });

    it("starts with zero ETH balance", async () => {
      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(0n);
    });
  });

  // ── receive ETH ─────────────────────────────────────────────────────────────

  describe("receive ETH", () => {
    it("accepts plain ETH transfers", async () => {
      const addr = await treasury.getAddress();
      await user1.sendTransaction({ to: addr, value: ethers.parseEther("0.1") });
      expect(await ethers.provider.getBalance(addr)).to.equal(ethers.parseEther("0.1"));
    });

    it("accumulates multiple ETH transfers", async () => {
      const addr = await treasury.getAddress();
      await user1.sendTransaction({ to: addr, value: ethers.parseEther("0.1") });
      await owner.sendTransaction({ to: addr, value: ethers.parseEther("0.05") });
      expect(await ethers.provider.getBalance(addr)).to.equal(ethers.parseEther("0.15"));
    });
  });

  // ── withdrawToken ───────────────────────────────────────────────────────────

  describe("withdrawToken", () => {
    beforeEach(async () => {
      // Simulate USDC arriving at treasury (relay deposit)
      await (usdc as any).mint(await treasury.getAddress(), USDC_100);
    });

    it("sends correct USDC amount to recipient", async () => {
      const addr = await treasury.getAddress();
      const usdcAddr = await usdc.getAddress();

      const before = await usdc.balanceOf(recipient.address);
      await treasury.withdrawToken(usdcAddr, recipient.address, USDC_50);
      const after = await usdc.balanceOf(recipient.address);

      expect(after - before).to.equal(USDC_50);
      expect(await usdc.balanceOf(addr)).to.equal(USDC_100 - USDC_50);
    });

    it("emits TokenWithdrawn event", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(treasury.withdrawToken(usdcAddr, recipient.address, USDC_15))
        .to.emit(treasury, "TokenWithdrawn")
        .withArgs(usdcAddr, recipient.address, USDC_15);
    });

    it("reverts if called by non-owner", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(
        treasury.connect(attacker).withdrawToken(usdcAddr, attacker.address, USDC_15)
      ).to.be.revertedWith("LocalOSTreasury: not owner");
    });

    it("reverts if recipient is zero address", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(
        treasury.withdrawToken(usdcAddr, ethers.ZeroAddress, USDC_15)
      ).to.be.revertedWith("LocalOSTreasury: zero address");
    });

    it("reverts if amount is zero", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(
        treasury.withdrawToken(usdcAddr, recipient.address, 0n)
      ).to.be.revertedWith("LocalOSTreasury: zero amount");
    });

    it("reverts if amount exceeds balance", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(
        treasury.withdrawToken(usdcAddr, recipient.address, USDC_100 + 1n)
      ).to.be.reverted;
    });
  });

  // ── withdrawAllToken ────────────────────────────────────────────────────────

  describe("withdrawAllToken", () => {
    beforeEach(async () => {
      await (usdc as any).mint(await treasury.getAddress(), USDC_100);
    });

    it("sends full token balance to recipient", async () => {
      const addr = await treasury.getAddress();
      const usdcAddr = await usdc.getAddress();

      const before = await usdc.balanceOf(recipient.address);
      await treasury.withdrawAllToken(usdcAddr, recipient.address);
      const after = await usdc.balanceOf(recipient.address);

      expect(after - before).to.equal(USDC_100);
      expect(await usdc.balanceOf(addr)).to.equal(0n);
    });

    it("emits TokenWithdrawn with full balance", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(treasury.withdrawAllToken(usdcAddr, recipient.address))
        .to.emit(treasury, "TokenWithdrawn")
        .withArgs(usdcAddr, recipient.address, USDC_100);
    });

    it("reverts if token balance is zero", async () => {
      const usdcAddr = await usdc.getAddress();
      await treasury.withdrawAllToken(usdcAddr, recipient.address);
      await expect(
        treasury.withdrawAllToken(usdcAddr, recipient.address)
      ).to.be.revertedWith("LocalOSTreasury: zero balance");
    });

    it("reverts if called by non-owner", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(
        treasury.connect(attacker).withdrawAllToken(usdcAddr, attacker.address)
      ).to.be.revertedWith("LocalOSTreasury: not owner");
    });

    it("reverts if recipient is zero address", async () => {
      const usdcAddr = await usdc.getAddress();
      await expect(
        treasury.withdrawAllToken(usdcAddr, ethers.ZeroAddress)
      ).to.be.revertedWith("LocalOSTreasury: zero address");
    });
  });

  // ── withdrawETH ─────────────────────────────────────────────────────────────

  describe("withdrawETH", () => {
    const ONE_ETH = ethers.parseEther("1.0");
    const HALF_ETH = ethers.parseEther("0.5");

    beforeEach(async () => {
      const addr = await treasury.getAddress();
      await owner.sendTransaction({ to: addr, value: ONE_ETH });
    });

    it("sends correct ETH amount to recipient", async () => {
      const addr = await treasury.getAddress();
      const before = await ethers.provider.getBalance(recipient.address);
      await treasury.withdrawETH(recipient.address as any, HALF_ETH);
      const after = await ethers.provider.getBalance(recipient.address);

      expect(after - before).to.equal(HALF_ETH);
      expect(await ethers.provider.getBalance(addr)).to.equal(ONE_ETH - HALF_ETH);
    });

    it("emits ETHWithdrawn event", async () => {
      await expect(treasury.withdrawETH(recipient.address as any, HALF_ETH))
        .to.emit(treasury, "ETHWithdrawn")
        .withArgs(recipient.address, HALF_ETH);
    });

    it("reverts if amount exceeds balance", async () => {
      await expect(
        treasury.withdrawETH(recipient.address as any, ONE_ETH + 1n)
      ).to.be.revertedWith("LocalOSTreasury: insufficient ETH");
    });

    it("reverts if amount is zero", async () => {
      await expect(
        treasury.withdrawETH(recipient.address as any, 0n)
      ).to.be.revertedWith("LocalOSTreasury: zero amount");
    });

    it("reverts if recipient is zero address", async () => {
      await expect(
        treasury.withdrawETH(ethers.ZeroAddress as any, HALF_ETH)
      ).to.be.revertedWith("LocalOSTreasury: zero address");
    });

    it("reverts if called by non-owner", async () => {
      await expect(
        treasury.connect(attacker).withdrawETH(attacker.address as any, HALF_ETH)
      ).to.be.revertedWith("LocalOSTreasury: not owner");
    });
  });

  // ── transferOwnership ───────────────────────────────────────────────────────

  describe("transferOwnership", () => {
    it("transfers ownership to new address", async () => {
      await treasury.transferOwnership(user1.address);
      expect(await treasury.owner()).to.equal(user1.address);
    });

    it("emits OwnershipTransferred event", async () => {
      await expect(treasury.transferOwnership(user1.address))
        .to.emit(treasury, "OwnershipTransferred")
        .withArgs(owner.address, user1.address);
    });

    it("new owner can withdraw after transfer", async () => {
      const usdcAddr = await usdc.getAddress();
      await (usdc as any).mint(await treasury.getAddress(), USDC_50);

      await treasury.transferOwnership(user1.address);
      await expect(
        treasury.connect(user1).withdrawToken(usdcAddr, user1.address, USDC_50)
      ).to.not.be.reverted;
    });

    it("old owner cannot withdraw after transfer", async () => {
      const usdcAddr = await usdc.getAddress();
      await (usdc as any).mint(await treasury.getAddress(), USDC_50);

      await treasury.transferOwnership(user1.address);
      await expect(
        treasury.withdrawToken(usdcAddr, recipient.address, USDC_50)
      ).to.be.revertedWith("LocalOSTreasury: not owner");
    });

    it("reverts if new owner is zero address", async () => {
      await expect(
        treasury.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("LocalOSTreasury: zero address");
    });

    it("reverts if called by non-owner", async () => {
      await expect(
        treasury.connect(attacker).transferOwnership(attacker.address)
      ).to.be.revertedWith("LocalOSTreasury: not owner");
    });
  });

  // ── Multi-token scenario ────────────────────────────────────────────────────

  describe("Multi-token scenario", () => {
    it("holds multiple ERC20 tokens simultaneously", async () => {
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const token2 = await MockUSDC.deploy();
      await token2.waitForDeployment();

      const addr = await treasury.getAddress();
      await (usdc as any).mint(addr, USDC_100);
      await (token2 as any).mint(addr, USDC_50);

      expect(await usdc.balanceOf(addr)).to.equal(USDC_100);
      expect(await token2.balanceOf(addr)).to.equal(USDC_50);
    });

    it("withdrawing one token does not affect another", async () => {
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const token2 = await MockUSDC.deploy();
      await token2.waitForDeployment();

      const addr = await treasury.getAddress();
      const usdcAddr = await usdc.getAddress();
      const t2Addr = await token2.getAddress();

      await (usdc as any).mint(addr, USDC_100);
      await (token2 as any).mint(addr, USDC_50);

      await treasury.withdrawAllToken(usdcAddr, recipient.address);

      expect(await usdc.balanceOf(addr)).to.equal(0n);
      expect(await token2.balanceOf(addr)).to.equal(USDC_50);
    });
  });

  // ── Relay scenario (simulates full payment flow) ────────────────────────────

  describe("Relay scenario", () => {
    it("simulates full fresh-wallet relay: mint to treasury then owner withdraws", async () => {
      const addr = await treasury.getAddress();
      const usdcAddr = await usdc.getAddress();

      // Fresh wallet receives USDC from user and forwards to treasury
      await (usdc as any).mint(addr, USDC_15);
      expect(await usdc.balanceOf(addr)).to.equal(USDC_15);

      // Owner withdraws to their own wallet
      await treasury.withdrawToken(usdcAddr, owner.address, USDC_15);
      expect(await usdc.balanceOf(owner.address)).to.equal(USDC_15);
      expect(await usdc.balanceOf(addr)).to.equal(0n);
    });

    it("accumulates multiple payments then withdraws all at once", async () => {
      const addr = await treasury.getAddress();
      const usdcAddr = await usdc.getAddress();

      // 3 users pay — each relayed to treasury
      await (usdc as any).mint(addr, USDC_15);
      await (usdc as any).mint(addr, USDC_15);
      await (usdc as any).mint(addr, USDC_15);

      expect(await usdc.balanceOf(addr)).to.equal(USDC_15 * 3n);

      // Owner sweeps all
      await treasury.withdrawAllToken(usdcAddr, owner.address);
      expect(await usdc.balanceOf(owner.address)).to.equal(USDC_15 * 3n);
      expect(await usdc.balanceOf(addr)).to.equal(0n);
    });
  });
});
