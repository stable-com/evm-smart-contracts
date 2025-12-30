import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { LiquidityPool, MockERC20 } from '../../typechain-types';

describe('LiquidityPool Unit Tests', function () {
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let maintainer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let crossChainModule: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let pauser: SignerWithAddress;
  let manager: SignerWithAddress;
  let backend: SignerWithAddress;

  let liquidityPool: LiquidityPool;
  let usdt: MockERC20;
  let usdc: MockERC20;
  let fdusd: MockERC20;
  let permit2: any;
  let permit2Address: string;

  const INITIAL_SUPPLY = ethers.parseUnits('1000000', 6);
  const DEPOSIT_AMOUNT = ethers.parseUnits('10000', 6);
  const SWAP_AMOUNT = ethers.parseUnits('100', 6);
  const USDT_DECIMALS = 6;
  const USDC_DECIMALS = 6;
  const FDUSD_DECIMALS = 18;
  const FDUSD_INITIAL_SUPPLY = ethers.parseUnits('1000000', 18);
  const FDUSD_DEPOSIT_AMOUNT = ethers.parseUnits('10000', 18);
  const FDUSD_SWAP_AMOUNT = ethers.parseUnits('100', 18);

  const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const UPGRADER_ROLE = ethers.id('UPGRADER_ROLE');
  const PAUSER_ROLE = ethers.id('PAUSER_ROLE');
  const POOL_MANAGER_ROLE = ethers.id('POOL_MANAGER_ROLE');
  const ROUTING_MODULE_ROLE = ethers.id('ROUTING_MODULE_ROLE');
  const CROSS_CHAIN_MANAGER_ROLE = ethers.id('CROSS_CHAIN_MANAGER_ROLE');

  async function toDeadline(expirationSecs: number): Promise<bigint> {
    const block = await ethers.provider.getBlock('latest');
    return BigInt(block!.timestamp) + BigInt(expirationSecs);
  }

  async function getNextNonce(
    liquidityPool: LiquidityPool,
    user: SignerWithAddress,
  ): Promise<bigint> {
    const currentNonce = await liquidityPool.lastNonce(user.address);
    return currentNonce + 1n;
  }

  before(async function () {
    [owner, admin, maintainer, user1, user2, crossChainModule, upgrader, pauser, manager, backend] =
      await ethers.getSigners();

    const Permit2 = await ethers.getContractFactory('Permit2');
    permit2 = await Permit2.deploy();
    await permit2.waitForDeployment();
    permit2Address = await permit2.getAddress();

    const MockERC20 = await ethers.getContractFactory('MockERC20');

    usdt = (await MockERC20.deploy(
      'Tether USD',
      'USDT',
      USDT_DECIMALS,
      INITIAL_SUPPLY,
    )) as unknown as MockERC20;
    await usdt.waitForDeployment();

    usdc = (await MockERC20.deploy(
      'USD Coin',
      'USDC',
      USDC_DECIMALS,
      INITIAL_SUPPLY,
    )) as unknown as MockERC20;
    await usdc.waitForDeployment();

    fdusd = (await MockERC20.deploy(
      'First Digital USD',
      'FDUSD',
      FDUSD_DECIMALS,
      FDUSD_INITIAL_SUPPLY,
    )) as unknown as MockERC20;
    await fdusd.waitForDeployment();

    const LiquidityPool = await ethers.getContractFactory('LiquidityPool');

    liquidityPool = (await upgrades.deployProxy(
      LiquidityPool,
      [admin.address, manager.address, maintainer.address, permit2Address],
      { initializer: 'initialize' },
    )) as unknown as LiquidityPool;

    await liquidityPool.waitForDeployment();

    await liquidityPool.connect(admin).grantRole(UPGRADER_ROLE, upgrader.address);
    await liquidityPool.connect(admin).grantRole(ROUTING_MODULE_ROLE, crossChainModule.address);
    await liquidityPool.connect(admin).grantRole(CROSS_CHAIN_MANAGER_ROLE, backend.address);

    await usdt.transfer(user1.address, INITIAL_SUPPLY / 4n);
    await usdt.transfer(user2.address, INITIAL_SUPPLY / 4n);
    await usdt.transfer(admin.address, INITIAL_SUPPLY / 4n);
    await usdc.transfer(user1.address, INITIAL_SUPPLY / 4n);
    await usdc.transfer(user2.address, INITIAL_SUPPLY / 4n);
    await usdc.transfer(admin.address, INITIAL_SUPPLY / 4n);
    await fdusd.transfer(user1.address, FDUSD_INITIAL_SUPPLY / 4n);
    await fdusd.transfer(user2.address, FDUSD_INITIAL_SUPPLY / 4n);
    await fdusd.transfer(admin.address, FDUSD_INITIAL_SUPPLY / 4n);

    const maxAmount = ethers.MaxUint256;
    await usdt.connect(user1).approve(permit2Address, maxAmount);
    await usdt.connect(user2).approve(permit2Address, maxAmount);
    await usdt.connect(admin).approve(permit2Address, maxAmount);
    await usdc.connect(user1).approve(permit2Address, maxAmount);
    await usdc.connect(user2).approve(permit2Address, maxAmount);
    await usdc.connect(admin).approve(permit2Address, maxAmount);
    await fdusd.connect(user1).approve(permit2Address, maxAmount);
    await fdusd.connect(user2).approve(permit2Address, maxAmount);
    await fdusd.connect(admin).approve(permit2Address, maxAmount);
  });

  // ========= 1. INITIALIZATION TESTS =========
  describe('Initialization', function () {
    describe('initialize()', function () {
      it('should initialize with correct parameters', async function () {
        expect(await liquidityPool.permit2()).to.equal(permit2Address);
        expect(await liquidityPool.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
        expect(await liquidityPool.maintainer()).to.equal(maintainer.address);
      });

      it('should not allow re-initialization', async function () {
        expect(
          liquidityPool.initialize(
            admin.address,
            manager.address,
            maintainer.address,
            permit2Address,
          ),
        ).to.be.revertedWithCustomError(liquidityPool, 'InvalidInitialization()');
      });
    });
  });

  // ========= 2. ADMIN FUNCTIONS TESTS =========
  describe('Admin Functions', function () {
    describe('pause()', function () {
      it('should allow PAUSER_ROLE to pause the contract', async function () {
        await liquidityPool.connect(admin).grantRole(PAUSER_ROLE, pauser.address);

        await expect(liquidityPool.connect(pauser).pause())
          .to.emit(liquidityPool, 'Paused')
          .withArgs(pauser.address);

        expect(await liquidityPool.paused()).to.be.true;
      });

      it('should not allow non-PAUSER_ROLE to pause', async function () {
        await expect(liquidityPool.connect(user1).pause())
          .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
          .withArgs(user1.address, PAUSER_ROLE);
      });

      it('should not allow pausing when already paused', async function () {
        await expect(liquidityPool.connect(pauser).pause()).to.be.revertedWithCustomError(
          liquidityPool,
          'EnforcedPause',
        );
      });
    });

    describe('unpause()', function () {
      it('should allow PAUSER_ROLE to unpause the contract', async function () {
        await expect(liquidityPool.connect(pauser).unpause())
          .to.emit(liquidityPool, 'Unpaused')
          .withArgs(pauser.address);
        expect(await liquidityPool.paused()).to.be.false;
      });

      it('should not allow non-PAUSER_ROLE to unpause', async function () {
        await expect(liquidityPool.connect(user1).unpause())
          .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
          .withArgs(user1.address, PAUSER_ROLE);
      });

      it('should not allow unpausing when not paused', async function () {
        await expect(liquidityPool.connect(pauser).unpause()).to.be.revertedWithCustomError(
          liquidityPool,
          'ExpectedPause',
        );
      });
    });

    describe('setupToken()', function () {
      let newToken: MockERC20;

      before(async function () {
        const MockERC20 = await ethers.getContractFactory('MockERC20');
        newToken = (await MockERC20.deploy(
          'Test Token',
          'TEST',
          18,
          ethers.parseUnits('1000000', 18),
        )) as unknown as MockERC20;
        await newToken.waitForDeployment();
      });

      it('should setup USDT token atomically with all parameters', async function () {
        const token = await usdt.getAddress();
        const X = ethers.parseUnits('1000', 6);
        const Y = ethers.parseUnits('2000', 6);
        const Z = ethers.parseUnits('200', 6);
        const protocolFee = 10000; // 1% fee rate

        await expect(liquidityPool.connect(manager).setupToken(token, true, X, Y, Z, protocolFee))
          .to.emit(liquidityPool, 'TokenSetup')
          .withArgs(token, true, USDT_DECIMALS, X, Y, Z, protocolFee);

        expect(await liquidityPool.isWhitelisted(token)).to.be.true;
        expect(await liquidityPool.tokenDecimals(token)).to.equal(USDT_DECIMALS);
        expect(await liquidityPool.protocolFeeByToken(token)).to.equal(protocolFee);
        const thresholds = await liquidityPool.liquidityThresholds(token);
        expect(thresholds.X).to.equal(X);
        expect(thresholds.Y).to.equal(Y);
        expect(thresholds.Z).to.equal(Z);
      });

      it('should setup USDC token atomically', async function () {
        const token = await usdc.getAddress();
        const X = ethers.parseUnits('1000', 6);
        const Y = ethers.parseUnits('2000', 6);
        const Z = ethers.parseUnits('200', 6);
        const protocolFee = 20000; // 2% fee rate

        await expect(liquidityPool.connect(manager).setupToken(token, true, X, Y, Z, protocolFee))
          .to.emit(liquidityPool, 'TokenSetup')
          .withArgs(token, true, USDC_DECIMALS, X, Y, Z, protocolFee);

        expect(await liquidityPool.isWhitelisted(token)).to.be.true;
        expect(await liquidityPool.tokenDecimals(token)).to.equal(USDC_DECIMALS);
        expect(await liquidityPool.protocolFeeByToken(token)).to.equal(protocolFee);
      });

      it('should setup FDUSD token atomically', async function () {
        const token = await fdusd.getAddress();
        const X = ethers.parseUnits('1000', 18);
        const Y = ethers.parseUnits('2000', 18);
        const Z = ethers.parseUnits('200', 18);
        const protocolFee = 10000; // 1% fee rate

        await expect(liquidityPool.connect(manager).setupToken(token, true, X, Y, Z, protocolFee))
          .to.emit(liquidityPool, 'TokenSetup')
          .withArgs(token, true, FDUSD_DECIMALS, X, Y, Z, protocolFee);

        expect(await liquidityPool.isWhitelisted(token)).to.be.true;
        expect(await liquidityPool.tokenDecimals(token)).to.equal(FDUSD_DECIMALS);
      });

      it('should allow updating only thresholds by calling setupToken with new thresholds', async function () {
        const token = await usdt.getAddress();
        const oldX = ethers.parseUnits('1000', 6);
        const oldY = ethers.parseUnits('2000', 6);
        const oldZ = ethers.parseUnits('200', 6);
        const oldFee = 10000; // 1% fee rate

        // New thresholds
        const newX = ethers.parseUnits('500', 6);
        const newY = ethers.parseUnits('1500', 6);
        const newZ = ethers.parseUnits('100', 6);

        await liquidityPool.connect(manager).setupToken(token, true, newX, newY, newZ, oldFee);

        const thresholds = await liquidityPool.liquidityThresholds(token);
        expect(thresholds.X).to.equal(newX);
        expect(thresholds.Y).to.equal(newY);
        expect(thresholds.Z).to.equal(newZ);
        expect(await liquidityPool.protocolFeeByToken(token)).to.equal(oldFee);
      });

      it('should allow updating only protocol fee by calling setupToken with new fee', async function () {
        const token = await usdt.getAddress();
        const currentX = ethers.parseUnits('500', 6);
        const currentY = ethers.parseUnits('1500', 6);
        const currentZ = ethers.parseUnits('100', 6);
        const newFee = 100000; // 10% fee rate

        await liquidityPool.connect(manager).setupToken(token, true, currentX, currentY, currentZ, newFee);

        expect(await liquidityPool.protocolFeeByToken(token)).to.equal(newFee);
        const thresholds = await liquidityPool.liquidityThresholds(token);
        expect(thresholds.X).to.equal(currentX);
      });

      it('should allow disabling token by setting status to false', async function () {
        const token = await newToken.getAddress();
        const X = ethers.parseUnits('1000', 18);
        const Y = ethers.parseUnits('2000', 18);
        const Z = ethers.parseUnits('200', 18);
        const protocolFee = 0;

        // First enable
        await liquidityPool.connect(manager).setupToken(token, true, X, Y, Z, protocolFee);
        expect(await liquidityPool.isWhitelisted(token)).to.be.true;

        // Then disable
        await liquidityPool.connect(manager).setupToken(token, false, X, Y, Z, protocolFee);
        expect(await liquidityPool.isWhitelisted(token)).to.be.false;
        expect(await liquidityPool.tokenDecimals(token)).to.equal(18);
      });

      it('should reject invalid thresholds (Y <= X)', async function () {
        const token = await usdt.getAddress();

        await expect(
          liquidityPool
            .connect(manager)
            .setupToken(
              token,
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('500', 6),
              ethers.parseUnits('200', 6),
              0,
            ),
        ).to.be.revertedWithCustomError(liquidityPool, 'InvalidThresholdsConfig');
      });

      it('should reject invalid thresholds (Z = 0)', async function () {
        const token = await usdt.getAddress();

        await expect(
          liquidityPool
            .connect(manager)
            .setupToken(
              token,
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('5000', 6),
              0,
              0,
            ),
        ).to.be.revertedWithCustomError(liquidityPool, 'InvalidThresholdsConfig');
      });

      it('should reject invalid thresholds (Z > Y-X)', async function () {
        const token = await usdt.getAddress();

        await expect(
          liquidityPool
            .connect(manager)
            .setupToken(
              token,
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('5000', 6),
              ethers.parseUnits('5000', 6),
              0,
            ),
        ).to.be.revertedWithCustomError(liquidityPool, 'InvalidThresholdsConfig');
      });

      it('should reject invalid fee rate (protocolFee > MAX_PROTOCOL_FEE)', async function () {
        const token = await usdt.getAddress();
        const MAX_PROTOCOL_FEE = 100_000; // 10%

        await expect(
          liquidityPool
            .connect(manager)
            .setupToken(
              token,
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('5000', 6),
              ethers.parseUnits('500', 6),
              MAX_PROTOCOL_FEE + 1, // 10.0001% - invalid!
            ),
        ).to.be.revertedWithCustomError(liquidityPool, 'InvalidFeeRate');
      });

      it('should accept valid fee rate equal to MAX_PROTOCOL_FEE (10%)', async function () {
        const token = await newToken.getAddress();
        const MAX_PROTOCOL_FEE = 100_000; // 10%

        await expect(
          liquidityPool.connect(manager).setupToken(
            token,
            true,
            ethers.parseUnits('1000', 18),
            ethers.parseUnits('5000', 18),
            ethers.parseUnits('500', 18),
            MAX_PROTOCOL_FEE, // exactly 10% - valid edge case
          ),
        ).to.not.be.reverted;

        expect(await liquidityPool.protocolFeeByToken(token)).to.equal(MAX_PROTOCOL_FEE);
      });
    });
  });

  // ========= 3. LIQUIDITY MANAGEMENT TESTS =========
  describe('Liquidity Management', function () {
    describe('depositLiquidity()', function () {
      before(async function () {
        await usdt.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
        await usdc.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
        await fdusd.connect(admin).approve(await liquidityPool.getAddress(), FDUSD_DEPOSIT_AMOUNT);
      });

      it('should allow admin to deposit USDT', async function () {
        const usdtAddress = await usdt.getAddress();

        await expect(liquidityPool.connect(admin).depositLiquidity(usdtAddress, DEPOSIT_AMOUNT))
          .to.emit(liquidityPool, 'LiquidityDeposited')
          .withArgs(usdtAddress, DEPOSIT_AMOUNT, admin.address);

        const finalBalance = await usdt.balanceOf(await liquidityPool.getAddress());
        expect(finalBalance).to.equal(DEPOSIT_AMOUNT);
      });

      it('should allow admin to deposit USDC', async function () {
        const usdcAddress = await usdc.getAddress();

        await expect(liquidityPool.connect(admin).depositLiquidity(usdcAddress, DEPOSIT_AMOUNT))
          .to.emit(liquidityPool, 'LiquidityDeposited')
          .withArgs(usdcAddress, DEPOSIT_AMOUNT, admin.address);

        const finalBalance = await usdc.balanceOf(await liquidityPool.getAddress());
        expect(finalBalance).to.equal(DEPOSIT_AMOUNT);
      });

      it('should allow admin to deposit FDUSD', async function () {
        const fdusdAddress = await fdusd.getAddress();

        await expect(
          liquidityPool.connect(admin).depositLiquidity(fdusdAddress, FDUSD_DEPOSIT_AMOUNT),
        )
          .to.emit(liquidityPool, 'LiquidityDeposited')
          .withArgs(fdusdAddress, FDUSD_DEPOSIT_AMOUNT, admin.address);

        const finalBalance = await fdusd.balanceOf(await liquidityPool.getAddress());
        expect(finalBalance).to.equal(FDUSD_DEPOSIT_AMOUNT);
      });
    });

    describe('withdrawLiquidity()', function () {
      before(async function () {
        await usdt.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
        await liquidityPool
          .connect(admin)
          .depositLiquidity(await usdt.getAddress(), DEPOSIT_AMOUNT);
      });

      it('should withdraw exactly DEPOSIT_AMOUNT USDT', async function () {
        const balanceBefore = await usdt.balanceOf(admin.address);
        await liquidityPool
          .connect(admin)
          .withdrawLiquidity(await usdt.getAddress(), DEPOSIT_AMOUNT);
        const balanceAfter = await usdt.balanceOf(admin.address);

        expect(balanceAfter - balanceBefore).to.equal(DEPOSIT_AMOUNT);
      });
    });

    describe('withdrawNative()', function () {
      it('should allow POOL_MANAGER_ROLE to withdraw native tokens', async function () {
        // Send native tokens to the contract using Hardhat's setBalance
        const liquidityPoolAddress = await liquidityPool.getAddress();
        const initialBalance = ethers.parseEther('2.0');

        await ethers.provider.send('hardhat_setBalance', [
          liquidityPoolAddress,
          ethers.toQuantity(initialBalance),
        ]);

        const contractBalanceBefore = await ethers.provider.getBalance(liquidityPoolAddress);
        expect(contractBalanceBefore).to.equal(initialBalance);

        const recipientBalanceBefore = await ethers.provider.getBalance(user2.address);
        const withdrawAmount = ethers.parseEther('1.0');

        await expect(liquidityPool.connect(manager).withdrawNative(user2.address, withdrawAmount))
          .to.emit(liquidityPool, 'NativeWithdrawn')
          .withArgs(user2.address, withdrawAmount, manager.address);

        const recipientBalanceAfter = await ethers.provider.getBalance(user2.address);
        expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(withdrawAmount);

        const contractBalanceAfter = await ethers.provider.getBalance(liquidityPoolAddress);
        expect(contractBalanceBefore - contractBalanceAfter).to.equal(withdrawAmount);
      });

      it('should reject withdrawal by non-POOL_MANAGER_ROLE', async function () {
        const withdrawAmount = ethers.parseEther('0.1');

        await expect(liquidityPool.connect(user1).withdrawNative(user2.address, withdrawAmount))
          .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
          .withArgs(user1.address, POOL_MANAGER_ROLE);
      });

      it('should reject withdrawal to zero address', async function () {
        const withdrawAmount = ethers.parseEther('0.1');

        await expect(
          liquidityPool.connect(manager).withdrawNative(ethers.ZeroAddress, withdrawAmount),
        ).to.be.revertedWith('Invalid recipient');
      });

      it('should reject withdrawal of zero amount', async function () {
        await expect(
          liquidityPool.connect(manager).withdrawNative(user2.address, 0),
        ).to.be.revertedWith('Amount must be greater than 0');
      });

      it('should reject withdrawal amount exceeding balance', async function () {
        const liquidityPoolAddress = await liquidityPool.getAddress();
        const contractBalance = await ethers.provider.getBalance(liquidityPoolAddress);
        const excessAmount = contractBalance + ethers.parseEther('10.0');

        await expect(
          liquidityPool.connect(manager).withdrawNative(user2.address, excessAmount),
        ).to.be.revertedWith('Insufficient balance');
      });
    });

    // ========= 4. LOCAL SWAP TESTS =========
    describe('Local Swap Functions', function () {
      before(async function () {
        await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT);
        await usdc.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT);
        await fdusd.connect(user1).approve(await liquidityPool.getAddress(), FDUSD_SWAP_AMOUNT);
      });

      describe('singleChainSwap()', function () {
        it('should execute successful swap USDT to USDC', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await usdc.balanceOf(user1.address);
          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);
          const balanceAfter = await usdc.balanceOf(user1.address);
          expect(balanceAfter - balanceBefore).to.equal(SWAP_AMOUNT);
        });

        it('should execute successful swap USDC to FDUSD', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdc.getAddress(),
            tokenOut: await fdusd.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await fdusd.balanceOf(user1.address);
          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);
          const balanceAfter = await fdusd.balanceOf(user1.address);
          expect(balanceAfter - balanceBefore).to.equal(FDUSD_SWAP_AMOUNT);
        });

        it('should execute successful swap FDUSD to USDT', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const params = {
            chainId: 31337n,
            amountIn: FDUSD_SWAP_AMOUNT,
            tokenIn: await fdusd.getAddress(),
            tokenOut: await usdt.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await usdt.balanceOf(user1.address);

          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);

          const balanceAfter = await usdt.balanceOf(user1.address);
          expect(balanceAfter - balanceBefore).to.equal(SWAP_AMOUNT);
        });

        it('should revert swap if pool balance after swap < X (USDT->USDC)', async function () {
          const swapAmount = ethers.parseUnits('9001', 6);
          const deadline = await toDeadline(3600);

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), swapAmount);

          let params = {
            amountIn: swapAmount,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            chainId: 31337n,
            recipient: user1.address,
            deadline: deadline,
            nonce: await getNextNonce(liquidityPool, user1),
          };

          let signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            params.nonce,
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, 0n),
          ).to.be.revertedWithCustomError(liquidityPool, 'InsufficientReserves');
        });

        it('should revert swap if pool balance after swap < X (USDC->FDUSD)', async function () {
          const swapAmount = ethers.parseUnits('9001', 6);
          const deadline = await toDeadline(3600);

          await usdc.connect(user1).approve(await liquidityPool.getAddress(), swapAmount);

          let params = {
            amountIn: swapAmount,
            tokenIn: await usdc.getAddress(),
            tokenOut: await fdusd.getAddress(),
            chainId: 31337n,
            recipient: user1.address,
            deadline: deadline,
            nonce: await getNextNonce(liquidityPool, user1),
          };

          let signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            params.nonce,
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, 0n),
          ).to.be.revertedWithCustomError(liquidityPool, 'InsufficientReserves');
        });

        it('should revert swap if pool balance after swap < X (FDUSD->USDT)', async function () {
          const swapAmount = ethers.parseUnits('9001', 18);
          const deadline = await toDeadline(3600);

          await fdusd.connect(user1).approve(await liquidityPool.getAddress(), swapAmount);

          let params = {
            amountIn: swapAmount,
            tokenIn: await fdusd.getAddress(),
            tokenOut: await usdt.getAddress(),
            chainId: 31337n,
            recipient: user1.address,
            deadline: deadline,
            nonce: await getNextNonce(liquidityPool, user1),
          };

          let signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            params.nonce,
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, 0n),
          ).to.be.revertedWithCustomError(liquidityPool, 'InsufficientReserves');
        });

        it('should get available liquidity - deposit and lock scenario', async function () {
          let availableLiquidity = await liquidityPool.getAvailableLiquidity(
            await usdt.getAddress(),
          );
          expect(availableLiquidity).to.gt(0);

          const secretHash = ethers.keccak256(ethers.toUtf8Bytes('test_secret'));
          const untilTs = Math.floor(Date.now() / 1000) + 3600;

          const lockAmount = ethers.parseUnits('100', 6);
          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(secretHash, await usdt.getAddress(), lockAmount, untilTs);

          const newAvailableLiquidity = await liquidityPool.getAvailableLiquidity(
            await usdt.getAddress(),
          );
          expect(newAvailableLiquidity).to.equal(availableLiquidity - lockAmount);
        });

        it('should revert if tokenOut is not whitelisted', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const MockERC20 = await ethers.getContractFactory('MockERC20');
          const nonWhitelistedToken = await MockERC20.deploy(
            'Non Whitelisted Token',
            'NWT',
            18,
            ethers.parseUnits('1000000', 18),
          );
          await nonWhitelistedToken.waitForDeployment();

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await nonWhitelistedToken.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          await expect(liquidityPool.connect(user1).singleChainSwap(params, signature, 0n))
            .to.be.revertedWithCustomError(liquidityPool, 'NotWhitelisted')
            .withArgs(await nonWhitelistedToken.getAddress());
        });

        it('should revert if nonce is invalid (too low)', async function () {
          const deadline = await toDeadline(3600);
          const currentNonce = await liquidityPool.lastNonce(user1.address);
          const invalidNonce = currentNonce;

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: invalidNonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            invalidNonce,
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, 0n),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidNonce');
        });

        it('should revert if amountOut exceeds maxAmountOut (InsufficientReserves) - Y-Z check', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const swapAmount = ethers.parseUnits('8201', 6);

          const params = {
            chainId: 31337n,
            amountIn: swapAmount,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );
          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, 0n),
          ).to.be.revertedWithCustomError(liquidityPool, 'InsufficientReserves');
        });

        describe('singleChainSwapWithPermit()', function () {
          it('should execute successful swap USDT to USDC with permit', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const permitDeadline = await toDeadline(3600);
            const fee = ethers.parseUnits('1', 6);
            const totalAmount = SWAP_AMOUNT + fee;

            const domain = {
              name: await usdt.name(),
              version: '1',
              chainId: 31337n,
              verifyingContract: await usdt.getAddress(),
            };

            const types = {
              Permit: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ],
            };

            const values = {
              owner: user1.address,
              spender: await liquidityPool.getAddress(),
              value: totalAmount,
              nonce: await usdt.nonces(user1.address),
              deadline: permitDeadline,
            };

            const permitSignature = await user1.signTypedData(domain, types, values);
            const permitSig = ethers.Signature.from(permitSignature);

            // Create user signature for SwapWithPermit
            const poolDomain = {
              name: 'LiquidityPool',
              version: '1',
              chainId: 31337n,
              verifyingContract: await liquidityPool.getAddress(),
            };

            const userSigTypes = {
              SwapWithPermit: [
                { name: 'nonce', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'recipient', type: 'address' },
              ],
            };

            const userSigMessage = {
              nonce: nonce,
              fee: fee,
              recipient: user1.address,
            };

            const userSignature = await user1.signTypedData(poolDomain, userSigTypes, userSigMessage);

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdt.getAddress(),
                tokenOut: await usdc.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit: {
                deadline: permitDeadline,
                v: permitSig.v,
                r: permitSig.r,
                s: permitSig.s,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            const balanceBefore = await usdc.balanceOf(user1.address);
            await (liquidityPool.connect(backend) as any).singleChainSwapWithPermit(
              params,
              maintainerSignature,
            );
            const balanceAfter = await usdc.balanceOf(user1.address);
            expect(balanceAfter - balanceBefore).to.equal(SWAP_AMOUNT);
          });

          it('should execute successful swap USDC to FDUSD with permit', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const permitDeadline = await toDeadline(3600);
            const fee = ethers.parseUnits('1', 6);
            const totalAmount = SWAP_AMOUNT + fee;

            const domain = {
              name: await usdc.name(),
              version: '1',
              chainId: 31337n,
              verifyingContract: await usdc.getAddress(),
            };

            const types = {
              Permit: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ],
            };

            const values = {
              owner: user1.address,
              spender: await liquidityPool.getAddress(),
              value: totalAmount,
              nonce: await usdc.nonces(user1.address),
              deadline: permitDeadline,
            };

            const permitSignature = await user1.signTypedData(domain, types, values);
            const permitSig = ethers.Signature.from(permitSignature);

            // Create user signature for SwapWithPermit
            const poolDomain = {
              name: 'LiquidityPool',
              version: '1',
              chainId: 31337n,
              verifyingContract: await liquidityPool.getAddress(),
            };

            const userSigTypes = {
              SwapWithPermit: [
                { name: 'nonce', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'recipient', type: 'address' },
              ],
            };

            const userSigMessage = {
              nonce: nonce,
              fee: fee,
              recipient: user1.address,
            };

            const userSignature = await user1.signTypedData(poolDomain, userSigTypes, userSigMessage);

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdc.getAddress(),
                tokenOut: await fdusd.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit: {
                deadline: permitDeadline,
                v: permitSig.v,
                r: permitSig.r,
                s: permitSig.s,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            const balanceBefore = await fdusd.balanceOf(user1.address);
            await (liquidityPool.connect(backend) as any).singleChainSwapWithPermit(
              params,
              maintainerSignature,
            );
            const balanceAfter = await fdusd.balanceOf(user1.address);
            expect(balanceAfter - balanceBefore).to.equal(FDUSD_SWAP_AMOUNT);
          });

          it('should revert if permit deadline expired', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const permitDeadline = await toDeadline(-3600); // Expired deadline
            const fee = ethers.parseUnits('1', 6);
            const totalAmount = SWAP_AMOUNT + fee;

            // Create permit signature using EIP-712
            const domain = {
              name: await usdt.name(),
              version: '1',
              chainId: 31337n,
              verifyingContract: await usdt.getAddress(),
            };

            const types = {
              Permit: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ],
            };

            const values = {
              owner: user1.address,
              spender: await liquidityPool.getAddress(),
              value: totalAmount,
              nonce: await usdt.nonces(user1.address),
              deadline: permitDeadline,
            };

            const permitSignature = await user1.signTypedData(domain, types, values);
            const permitSig = ethers.Signature.from(permitSignature);

            // Create user signature for SwapWithPermit
            const poolDomain = {
              name: 'LiquidityPool',
              version: '1',
              chainId: 31337n,
              verifyingContract: await liquidityPool.getAddress(),
            };

            const userSigTypes = {
              SwapWithPermit: [
                { name: 'nonce', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'recipient', type: 'address' },
              ],
            };

            const userSigMessage = {
              nonce: nonce,
              fee: fee,
              recipient: user1.address,
            };

            const userSignature = await user1.signTypedData(poolDomain, userSigTypes, userSigMessage);

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdt.getAddress(),
                tokenOut: await usdc.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit: {
                deadline: permitDeadline,
                v: permitSig.v,
                r: permitSig.r,
                s: permitSig.s,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            await expect(
              (liquidityPool.connect(backend) as any).singleChainSwapWithPermit(
                params,
                maintainerSignature,
              ),
            ).to.be.revertedWith('SafePermit: permit failed and insufficient allowance');
          });

          it('should revert if permit signature is invalid', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const permitDeadline = await toDeadline(3600);
            const fee = ethers.parseUnits('1', 6);
            const totalAmount = SWAP_AMOUNT + fee;

            // Create permit signature with wrong signer using EIP-712
            const domain = {
              name: await usdt.name(),
              version: '1',
              chainId: 31337n,
              verifyingContract: await usdt.getAddress(),
            };

            const types = {
              Permit: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ],
            };

            const values = {
              owner: user1.address,
              spender: await liquidityPool.getAddress(),
              value: totalAmount,
              nonce: await usdt.nonces(user1.address),
              deadline: permitDeadline,
            };

            const permitSignature = await user2.signTypedData(domain, types, values);
            const permitSig = ethers.Signature.from(permitSignature);

            // Create user signature for SwapWithPermit (valid signature, but permit will fail)
            const poolDomain = {
              name: 'LiquidityPool',
              version: '1',
              chainId: 31337n,
              verifyingContract: await liquidityPool.getAddress(),
            };

            const userSigTypes = {
              SwapWithPermit: [
                { name: 'nonce', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'recipient', type: 'address' },
              ],
            };

            const userSigMessage = {
              nonce: nonce,
              fee: fee,
              recipient: user1.address,
            };

            const userSignature = await user1.signTypedData(poolDomain, userSigTypes, userSigMessage);

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdt.getAddress(),
                tokenOut: await usdc.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit: {
                deadline: permitDeadline,
                v: permitSig.v,
                r: permitSig.r,
                s: permitSig.s,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            await expect(
              (liquidityPool.connect(backend) as any).singleChainSwapWithPermit(
                params,
                maintainerSignature,
              ),
            ).to.be.revertedWith('SafePermit: permit failed and insufficient allowance');
          });
        });

        describe('singleChainSwapWithPermit2()', function () {
          it('should execute successful swap USDT to USDC with Permit2', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const fee = ethers.parseUnits('1', 6);
            const totalAmount = SWAP_AMOUNT + fee;

            const currentAllowance = await permit2.allowance(
              user1.address,
              await usdt.getAddress(),
              await liquidityPool.getAddress(),
            );
            const permit2Nonce = BigInt(currentAllowance.nonce);

            const currentTime = Math.floor(Date.now() / 1000);
            const expiration = await toDeadline(3600);
            const sigDeadline = await toDeadline(3600);

            const permitDetails = {
              token: await usdt.getAddress(),
              amount: BigInt(totalAmount),
              expiration: expiration,
              nonce: permit2Nonce,
            };

            const permitSingle = {
              details: permitDetails,
              spender: await liquidityPool.getAddress(),
              sigDeadline: sigDeadline,
            };

            const chainId = (await ethers.provider.getNetwork()).chainId;
            const domain = {
              name: 'Permit2',
              version: '1',
              chainId: Number(chainId),
              verifyingContract: permit2Address,
            };

            const types = {
              PermitDetails: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint160' },
                { name: 'expiration', type: 'uint48' },
                { name: 'nonce', type: 'uint48' },
              ],
              PermitSingle: [
                { name: 'details', type: 'PermitDetails' },
                { name: 'spender', type: 'address' },
                { name: 'sigDeadline', type: 'uint256' },
              ],
            };

            const values = {
              details: {
                token: await usdt.getAddress(),
                amount: BigInt(totalAmount),
                expiration: expiration,
                nonce: permit2Nonce,
              },
              spender: await liquidityPool.getAddress(),
              sigDeadline: sigDeadline,
            } as const;

            const permit2Signature = await user1.signTypedData(domain, types, values);
            const permit2Data = ethers.AbiCoder.defaultAbiCoder().encode(
              [
                'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
              ],
              [values],
            );

            // Create user signature for SwapWithPermit2
            const poolDomain = {
              name: 'LiquidityPool',
              version: '1',
              chainId: 31337n,
              verifyingContract: await liquidityPool.getAddress(),
            };

            const userSigTypes = {
              SwapWithPermit2: [
                { name: 'nonce', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'recipient', type: 'address' },
              ],
            };

            const userSigMessage = {
              nonce: nonce,
              fee: fee,
              recipient: user1.address,
            };

            const userSignature = await user1.signTypedData(poolDomain, userSigTypes, userSigMessage);

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdt.getAddress(),
                tokenOut: await usdc.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit2: {
                permit2Data: permit2Data,
                permit2Signature: permit2Signature,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            const balanceBefore = await usdc.balanceOf(user1.address);
            await (liquidityPool.connect(backend) as any).singleChainSwapWithPermit2(
              params,
              maintainerSignature,
            );
            const balanceAfter = await usdc.balanceOf(user1.address);
            expect(balanceAfter - balanceBefore).to.equal(SWAP_AMOUNT);
          });

          it('should execute successful swap USDC to FDUSD with Permit2', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const fee = ethers.parseUnits('1', 6);
            const totalAmount = SWAP_AMOUNT + fee;

            const currentAllowance = await permit2.allowance(
              user1.address,
              await usdc.getAddress(),
              await liquidityPool.getAddress(),
            );
            const permit2Nonce = BigInt(currentAllowance.nonce);

            const currentTime = Math.floor(Date.now() / 1000);
            const expiration = await toDeadline(3600);
            const sigDeadline = await toDeadline(3600);

            const permitDetails = {
              token: await usdc.getAddress(),
              amount: BigInt(totalAmount),
              expiration: expiration,
              nonce: permit2Nonce,
            };

            const permitSingle = {
              details: permitDetails,
              spender: await liquidityPool.getAddress(),
              sigDeadline: sigDeadline,
            };

            const chainId = (await ethers.provider.getNetwork()).chainId;
            const domain = {
              name: 'Permit2',
              version: '1',
              chainId: Number(chainId),
              verifyingContract: permit2Address,
            };

            const types = {
              PermitDetails: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint160' },
                { name: 'expiration', type: 'uint48' },
                { name: 'nonce', type: 'uint48' },
              ],
              PermitSingle: [
                { name: 'details', type: 'PermitDetails' },
                { name: 'spender', type: 'address' },
                { name: 'sigDeadline', type: 'uint256' },
              ],
            };

            const values = {
              details: {
                token: await usdc.getAddress(),
                amount: BigInt(totalAmount),
                expiration: expiration,
                nonce: permit2Nonce,
              },
              spender: await liquidityPool.getAddress(),
              sigDeadline: sigDeadline,
            } as const;

            const permit2Signature = await user1.signTypedData(domain, types, values);
            const permit2Data = ethers.AbiCoder.defaultAbiCoder().encode(
              [
                'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
              ],
              [values],
            );

            const userSignature = await createSwapWithPermit2UserSignature(
              user1,
              nonce,
              fee,
              liquidityPool,
              user1.address,
            );

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdc.getAddress(),
                tokenOut: await fdusd.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit2: {
                permit2Data: permit2Data,
                permit2Signature: permit2Signature,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            const balanceBefore = await fdusd.balanceOf(user1.address);
            await (liquidityPool.connect(backend) as any).singleChainSwapWithPermit2(
              params,
              maintainerSignature,
            );
            const balanceAfter = await fdusd.balanceOf(user1.address);
            expect(balanceAfter - balanceBefore).to.equal(FDUSD_SWAP_AMOUNT);
          });

          it('should revert if Permit2 signature deadline expired', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const fee = ethers.parseUnits('1', 6);
            const totalAmount = SWAP_AMOUNT + fee;

            const currentAllowance = await permit2.allowance(
              user1.address,
              await usdt.getAddress(),
              await liquidityPool.getAddress(),
            );
            const permit2Nonce = BigInt(currentAllowance.nonce);

            const currentTime = Math.floor(Date.now() / 1000);
            const expiration = BigInt(currentTime + 3600);
            const sigDeadline = await toDeadline(-3600);

            const permitDetails = {
              token: await usdt.getAddress(),
              amount: BigInt(totalAmount),
              expiration: expiration,
              nonce: permit2Nonce,
            };

            const permitSingle = {
              details: permitDetails,
              spender: await liquidityPool.getAddress(),
              sigDeadline: sigDeadline,
            };

            const chainId = (await ethers.provider.getNetwork()).chainId;
            const domain = {
              name: 'Permit2',
              version: '1',
              chainId: Number(chainId),
              verifyingContract: permit2Address,
            };

            const types = {
              PermitDetails: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint160' },
                { name: 'expiration', type: 'uint48' },
                { name: 'nonce', type: 'uint48' },
              ],
              PermitSingle: [
                { name: 'details', type: 'PermitDetails' },
                { name: 'spender', type: 'address' },
                { name: 'sigDeadline', type: 'uint256' },
              ],
            };

            const values = {
              details: {
                token: await usdt.getAddress(),
                amount: BigInt(totalAmount),
                expiration: expiration,
                nonce: permit2Nonce,
              },
              spender: await liquidityPool.getAddress(),
              sigDeadline: sigDeadline,
            } as const;

            const permit2Signature = await user1.signTypedData(domain, types, values);
            const permit2Data = ethers.AbiCoder.defaultAbiCoder().encode(
              [
                'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
              ],
              [values],
            );

            const userSignature = await createSwapWithPermit2UserSignature(
              user1,
              nonce,
              fee,
              liquidityPool,
              user1.address,
            );

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdt.getAddress(),
                tokenOut: await usdc.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit2: {
                permit2Data: permit2Data,
                permit2Signature: permit2Signature,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            await expect(
              (liquidityPool.connect(backend) as any).singleChainSwapWithPermit2(
                params,
                maintainerSignature,
              ),
            ).to.be.revertedWith('SafePermit: Permit2 failed and insufficient allowance');
          });
        });

        describe('Access Control for Permit Functions', function () {
          it('should not allow non-CROSS_CHAIN_MANAGER_ROLE to call singleChainSwapWithPermit', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const permitDeadline = await toDeadline(3600);
            const fee = ethers.parseUnits('1', 6);

            const userSignature = await createSwapWithPermitUserSignature(
              user1,
              nonce,
              fee,
              liquidityPool,
              user1.address,
            );

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdt.getAddress(),
                tokenOut: await usdc.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit: {
                deadline: permitDeadline,
                v: 27,
                r: ethers.ZeroHash,
                s: ethers.ZeroHash,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            await expect(
              (liquidityPool.connect(user1) as any).singleChainSwapWithPermit(
                params,
                maintainerSignature,
              ),
            )
              .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
              .withArgs(user1.address, CROSS_CHAIN_MANAGER_ROLE);
          });

          it('should not allow non-CROSS_CHAIN_MANAGER_ROLE to call singleChainSwapWithPermit2', async function () {
            const deadline = await toDeadline(3600);
            const nonce = await getNextNonce(liquidityPool, user1);
            const fee = ethers.parseUnits('1', 6);

            const userSignature = await createSwapWithPermit2UserSignature(
              user1,
              nonce,
              fee,
              liquidityPool,
              user1.address,
            );

            const params = {
              base: {
                chainId: 31337n,
                amountIn: SWAP_AMOUNT,
                tokenIn: await usdt.getAddress(),
                tokenOut: await usdc.getAddress(),
                recipient: user1.address,
                deadline: deadline,
                nonce: nonce,
              },
              user: user1.address,
              permit2: {
                permit2Data: ethers.ZeroHash,
                permit2Signature: ethers.ZeroHash,
                fee: fee,
                userSignature,
              },
            };

            const maintainerSignature = await createSwapSignature(
              params.base,
              maintainer,
              liquidityPool,
              user1,
              nonce,
            );

            await expect(
              (liquidityPool.connect(user1) as any).singleChainSwapWithPermit2(
                params,
                maintainerSignature,
              ),
            )
              .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
              .withArgs(user1.address, CROSS_CHAIN_MANAGER_ROLE);
          });

          it('should not allow non-ROUTING_MODULE_ROLE to call lockSourceWithPermit', async function () {
            const base = {
              secretHash: ethers.keccak256(ethers.toUtf8Bytes('test_secret')),
              amount: ethers.parseUnits('100', 6),
              token: await usdt.getAddress(),
              user: user1.address,
              chainId: 31337n,
            };

            const nonce = await getNextNonce(liquidityPool, user1);
            const untilTs = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const fee = ethers.parseUnits('1', 6);

            // Create user signature for LockSourceWithPermit
            const poolDomain = {
              name: 'LiquidityPool',
              version: '1',
              chainId: 31337n,
              verifyingContract: await liquidityPool.getAddress(),
            };

            const userSigTypes = {
              LockSourceWithPermit: [
                { name: 'nonce', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'sessionAddress', type: 'address' },
              ],
            };

            const userSigMessage = {
              nonce: nonce,
              fee: fee,
              sessionAddress: backend.address,
            };

            const userSignature = await user1.signTypedData(poolDomain, userSigTypes, userSigMessage);

            const permitData = {
              deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
              v: 27,
              r: ethers.ZeroHash,
              s: ethers.ZeroHash,
              fee: fee,
              userSignature,
            };

            await expect(
              liquidityPool.connect(user1).lockSourceWithPermit(base, nonce, untilTs, permitData, backend.address),
            )
              .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
              .withArgs(user1.address, ROUTING_MODULE_ROLE);
          });

          it('should not allow non-ROUTING_MODULE_ROLE to call lockSourceWithPermit2', async function () {
            const base = {
              secretHash: ethers.keccak256(ethers.toUtf8Bytes('test_secret')),
              amount: ethers.parseUnits('100', 6),
              token: await usdt.getAddress(),
              user: user1.address,
              chainId: 31337n,
            };

            const nonce = await getNextNonce(liquidityPool, user1);
            const untilTs = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const fee = ethers.parseUnits('1', 6);

            // Create user signature for LockSourceWithPermit2
            const poolDomain = {
              name: 'LiquidityPool',
              version: '1',
              chainId: 31337n,
              verifyingContract: await liquidityPool.getAddress(),
            };

            const userSigTypes = {
              LockSourceWithPermit2: [
                { name: 'nonce', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'sessionAddress', type: 'address' },
              ],
            };

            const userSigMessage = {
              nonce: nonce,
              fee: fee,
              sessionAddress: backend.address,
            };

            const userSignature = await user1.signTypedData(poolDomain, userSigTypes, userSigMessage);

            const permit2Data = {
              permit2Data: ethers.ZeroHash,
              permit2Signature: ethers.ZeroHash,
              fee: fee,
              userSignature,
            };

            await expect(
              liquidityPool.connect(user1).lockSourceWithPermit2(base, nonce, untilTs, permit2Data, backend.address),
            )
              .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
              .withArgs(user1.address, ROUTING_MODULE_ROLE);
          });
        });
      });

      describe('Native Fee Handling: singleChainSwap()', function () {
        before(async function () {
          // Always approve tokens for user1 with max amount (needed for multiple swaps)
          await usdt.connect(user1).approve(await liquidityPool.getAddress(), ethers.MaxUint256);
          await usdc.connect(user1).approve(await liquidityPool.getAddress(), ethers.MaxUint256);
          await fdusd.connect(user1).approve(await liquidityPool.getAddress(), ethers.MaxUint256);
        });

        it('should execute successful swap with native fee (0.01 ETH)', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const nativeFee = ethers.parseEther('0.01');

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            nativeFee,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await usdc.balanceOf(user1.address);
          const contractBalanceBefore = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, nativeFee, {
              value: nativeFee,
            }),
          )
            .to.emit(liquidityPool, 'SwapLocalExecuted')
            .withArgs(
              user1.address,
              await usdt.getAddress(),
              await usdc.getAddress(),
              SWAP_AMOUNT,
              SWAP_AMOUNT,
              user1.address,
              nativeFee,
            );

          const balanceAfter = await usdc.balanceOf(user1.address);
          const contractBalanceAfter = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );

          expect(balanceAfter - balanceBefore).to.equal(SWAP_AMOUNT);
          expect(contractBalanceAfter - contractBalanceBefore).to.equal(nativeFee);
        });

        it('should execute successful swap with zero native fee', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const nativeFee = 0n;

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            nativeFee,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await usdc.balanceOf(user1.address);
          const contractBalanceBefore = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, nativeFee),
          )
            .to.emit(liquidityPool, 'SwapLocalExecuted')
            .withArgs(
              user1.address,
              await usdt.getAddress(),
              await usdc.getAddress(),
              SWAP_AMOUNT,
              SWAP_AMOUNT,
              user1.address,
              nativeFee,
            );

          const balanceAfter = await usdc.balanceOf(user1.address);
          const contractBalanceAfter = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );

          expect(balanceAfter - balanceBefore).to.equal(SWAP_AMOUNT);
          expect(contractBalanceAfter - contractBalanceBefore).to.equal(0n);
        });

        it('should revert when msg.value > executionFeeNative (FeeMismatch)', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const nativeFee = ethers.parseEther('0.01');
          const higherValue = ethers.parseEther('0.02');

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            nativeFee,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, nativeFee, {
              value: higherValue,
            }),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'FeeMismatch')
            .withArgs(nativeFee, higherValue);
        });

        it('should revert when msg.value < executionFeeNative (FeeMismatch)', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const nativeFee = ethers.parseEther('0.01');
          const lowerValue = ethers.parseEther('0.005');

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            nativeFee,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, nativeFee, {
              value: lowerValue,
            }),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'FeeMismatch')
            .withArgs(nativeFee, lowerValue);
        });

        it('should revert when msg.value = 0 but executionFeeNative > 0 (FeeMismatch)', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const nativeFee = ethers.parseEther('0.01');
          const zeroValue = 0n;

          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params,
            nativeFee,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          await expect(
            liquidityPool.connect(user1).singleChainSwap(params, signature, nativeFee),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'FeeMismatch')
            .withArgs(nativeFee, zeroValue);
        });

        it('should accumulate native tokens from multiple swaps', async function () {
          const nativeFee1 = ethers.parseEther('0.01');
          const nativeFee2 = ethers.parseEther('0.02');
          const nativeFee3 = ethers.parseEther('0.015');

          const contractBalanceBefore = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );

          // First swap
          const deadline1 = await toDeadline(3600);
          const nonce1 = await getNextNonce(liquidityPool, user1);
          const params1 = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline1,
            nonce: nonce1,
          };
          const signature1 = await createSwapSignatureWithFee(
            params1,
            nativeFee1,
            maintainer,
            liquidityPool,
            user1,
            nonce1,
          );
          await liquidityPool
            .connect(user1)
            .singleChainSwap(params1, signature1, nativeFee1, { value: nativeFee1 });

          // Second swap
          const deadline2 = await toDeadline(3600);
          const nonce2 = await getNextNonce(liquidityPool, user1);
          const params2 = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdc.getAddress(),
            tokenOut: await usdt.getAddress(),
            recipient: user1.address,
            deadline: deadline2,
            nonce: nonce2,
          };
          const signature2 = await createSwapSignatureWithFee(
            params2,
            nativeFee2,
            maintainer,
            liquidityPool,
            user1,
            nonce2,
          );
          await liquidityPool
            .connect(user1)
            .singleChainSwap(params2, signature2, nativeFee2, { value: nativeFee2 });

          // Third swap
          const deadline3 = await toDeadline(3600);
          const nonce3 = await getNextNonce(liquidityPool, user1);
          const params3 = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline3,
            nonce: nonce3,
          };
          const signature3 = await createSwapSignatureWithFee(
            params3,
            nativeFee3,
            maintainer,
            liquidityPool,
            user1,
            nonce3,
          );
          await liquidityPool
            .connect(user1)
            .singleChainSwap(params3, signature3, nativeFee3, { value: nativeFee3 });

          const contractBalanceAfter = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );

          const totalFees = nativeFee1 + nativeFee2 + nativeFee3;
          expect(contractBalanceAfter - contractBalanceBefore).to.equal(totalFees);
        });

        it('should allow POOL_MANAGER to withdraw accumulated native tokens', async function () {
          const nativeFee = ethers.parseEther('0.05');

          // First, perform a swap with native fee to accumulate tokens
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const params = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };
          const signature = await createSwapSignatureWithFee(
            params,
            nativeFee,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );
          await liquidityPool
            .connect(user1)
            .singleChainSwap(params, signature, nativeFee, { value: nativeFee });

          const contractBalanceBefore = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );
          const managerBalanceBefore = await ethers.provider.getBalance(manager.address);

          const withdrawAmount = ethers.parseEther('0.03');

          await expect(
            liquidityPool.connect(manager).withdrawNative(manager.address, withdrawAmount),
          )
            .to.emit(liquidityPool, 'NativeWithdrawn')
            .withArgs(manager.address, withdrawAmount, manager.address);

          const contractBalanceAfter = await ethers.provider.getBalance(
            await liquidityPool.getAddress(),
          );
          const managerBalanceAfter = await ethers.provider.getBalance(manager.address);

          expect(contractBalanceBefore - contractBalanceAfter).to.equal(withdrawAmount);
          expect(managerBalanceAfter).to.be.gt(managerBalanceBefore);
        });
      });

      describe('singleChainSwapWithSignature()', function () {
        it('should execute successful swap USDT to USDC with user signature', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = SWAP_AMOUNT + fee;

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);

          const signatureData = { user: user1.address, fee, userSignature };

          const balanceBefore = await usdc.balanceOf(user1.address);
          const usdtBefore = await usdt.balanceOf(user1.address);
          await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
            base,
            signatureData,
            maintainerSignature,
          );
          const balanceAfter = await usdc.balanceOf(user1.address);
          const usdtAfter = await usdt.balanceOf(user1.address);
          expect(balanceAfter - balanceBefore).to.equal(SWAP_AMOUNT);
          expect(usdtBefore - usdtAfter).to.equal(totalAmount);
        });

        it('should execute successful swap USDC to FDUSD with user signature', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = SWAP_AMOUNT + fee;

          await usdc.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdc.getAddress(),
            tokenOut: await fdusd.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);

          const signatureData = { user: user1.address, fee, userSignature };

          const balanceBefore = await fdusd.balanceOf(user1.address);
          await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
            base,
            signatureData,
            maintainerSignature,
          );
          const balanceAfter = await fdusd.balanceOf(user1.address);
          expect(balanceAfter - balanceBefore).to.equal(FDUSD_SWAP_AMOUNT);
        });

        it('should revert if user signature is invalid', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = ethers.parseUnits('1', 6);

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT + fee);

          const base = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          // Sign by wrong user
          const userSignature = await createUserSwapSignature(base, user2, fee, liquidityPool);

          const signatureData = { user: user1.address, fee, userSignature };

          await expect(
            (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
              base,
              signatureData,
              maintainerSignature,
            ),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidSignature');
        });

        it('should not allow non-CROSS_CHAIN_MANAGER_ROLE to call singleChainSwapWithSignature', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = ethers.parseUnits('1', 6);

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT + fee);

          const base = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);

          const signatureData = { user: user1.address, fee, userSignature };

          await expect(
            (liquidityPool.connect(user1) as any).singleChainSwapWithSignature(
              base,
              signatureData,
              maintainerSignature,
            ),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
            .withArgs(user1.address, CROSS_CHAIN_MANAGER_ROLE);
        });

        it('should revert if nonce is invalid (too low)', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = ethers.parseUnits('1', 6);

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT + fee);

          const base = {
            chainId: 31337n,
            amountIn: SWAP_AMOUNT,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);

          const signatureData = { user: user1.address, fee, userSignature };

          // First call succeeds
          await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
            base,
            signatureData,
            maintainerSignature,
          );

          // Second call with same nonce should revert
          await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT + fee);
          await expect(
            (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
              base,
              signatureData,
              maintainerSignature,
            ),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidNonce');
        });
      });
    });

    // ========= 6. CROSS-CHAIN FUNCTIONS TESTS =========
    describe('Cross-chain Functions', function () {
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes('test_secret'));
      const lockAmount = ethers.parseUnits('50', 6);
      const fdusdLockAmount = ethers.parseUnits('50', 18);
      const untilTs = BigInt(Math.floor(Date.now() / 1000) + 3600);

      before(async function () {
        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdt.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdc.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        await liquidityPool
          .connect(manager)
          .setupToken(
            await fdusd.getAddress(),
            true,
            ethers.parseUnits('1000', 18),
            ethers.parseUnits('2000', 18),
            ethers.parseUnits('200', 18),
            0,
          );

        await usdt.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
        await usdc.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
        await fdusd.connect(admin).approve(await liquidityPool.getAddress(), FDUSD_DEPOSIT_AMOUNT);

        await liquidityPool
          .connect(admin)
          .depositLiquidity(await usdt.getAddress(), DEPOSIT_AMOUNT);
        await liquidityPool
          .connect(admin)
          .depositLiquidity(await usdc.getAddress(), DEPOSIT_AMOUNT);
        await liquidityPool
          .connect(admin)
          .depositLiquidity(await fdusd.getAddress(), FDUSD_DEPOSIT_AMOUNT);
      });

      describe('lockDestination()', function () {
        it('should allow ROUTING_MODULE_ROLE to lock USDT tokens', async function () {
          const lockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('lock_usdt_test'));
          const balanceBefore = await usdt.balanceOf(await liquidityPool.getAddress());
          const totalLockedBefore = await liquidityPool.totalLockedByToken(await usdt.getAddress());

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(lockSecretHash, await usdt.getAddress(), lockAmount, untilTs),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(lockSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          const balanceAfter = await usdt.balanceOf(await liquidityPool.getAddress());
          expect(balanceAfter).to.equal(balanceBefore);

          const lockedAmount = await liquidityPool.lockedAmount(lockSecretHash);
          expect(lockedAmount).to.equal(lockAmount);

          const totalLocked = await liquidityPool.totalLockedByToken(await usdt.getAddress());
          expect(totalLocked).to.equal(totalLockedBefore + lockAmount);
        });

        it('should allow ROUTING_MODULE_ROLE to lock USDC tokens', async function () {
          const lockUsdcSecretHash = ethers.keccak256(ethers.toUtf8Bytes('lock_usdc_test'));
          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(lockUsdcSecretHash, await usdc.getAddress(), lockAmount, untilTs),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(lockUsdcSecretHash, await usdc.getAddress(), lockAmount, untilTs);

          const lockedAmount = await liquidityPool.lockedAmount(lockUsdcSecretHash);
          expect(lockedAmount).to.equal(lockAmount);
        });

        it('should allow ROUTING_MODULE_ROLE to lock FDUSD tokens', async function () {
          const lockFdusdSecretHash = ethers.keccak256(ethers.toUtf8Bytes('lock_fdusd_test'));
          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(
                lockFdusdSecretHash,
                await fdusd.getAddress(),
                fdusdLockAmount,
                untilTs,
              ),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(lockFdusdSecretHash, await fdusd.getAddress(), fdusdLockAmount, untilTs);

          const lockedAmount = await liquidityPool.lockedAmount(lockFdusdSecretHash);
          expect(lockedAmount).to.equal(fdusdLockAmount);
        });

        it('should not allow non-ROUTING_MODULE_ROLE to lock tokens', async function () {
          const unauthorizedSecretHash = ethers.keccak256(ethers.toUtf8Bytes('unauthorized_test'));
          await expect(
            liquidityPool
              .connect(user1)
              .lockDestination(
                unauthorizedSecretHash,
                await usdt.getAddress(),
                lockAmount,
                untilTs,
              ),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
            .withArgs(user1.address, ROUTING_MODULE_ROLE);
        });

        it('should revert if token is not whitelisted', async function () {
          const nonWhitelistedSecretHash = ethers.keccak256(
            ethers.toUtf8Bytes('non_whitelisted_test'),
          );
          const MockERC20 = await ethers.getContractFactory('MockERC20');
          const nonWhitelistedToken = await MockERC20.deploy(
            'Non Whitelisted',
            'NWT',
            18,
            ethers.parseUnits('1000000', 18),
          );
          await nonWhitelistedToken.waitForDeployment();

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(
                nonWhitelistedSecretHash,
                await nonWhitelistedToken.getAddress(),
                lockAmount,
                untilTs,
              ),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'NotWhitelisted')
            .withArgs(await nonWhitelistedToken.getAddress());
        });

        it('should revert if insufficient funds to lock', async function () {
          const insufficientSecretHash = ethers.keccak256(ethers.toUtf8Bytes('insufficient_test'));

          // Get current available liquidity and try to lock more than available
          const availableLiquidity = await liquidityPool.getAvailableLiquidity(
            await usdt.getAddress(),
          );
          const excessiveAmount = availableLiquidity + 1n;

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(
                insufficientSecretHash,
                await usdt.getAddress(),
                excessiveAmount,
                untilTs,
              ),
          ).to.be.revertedWithCustomError(liquidityPool, 'InsufficientReserves');
        });

        it('should revert if remaining reserves would be below X threshold', async function () {
          const thresholdSecretHash = ethers.keccak256(ethers.toUtf8Bytes('threshold_test'));

          const availableLiquidity = await liquidityPool.getAvailableLiquidity(
            await usdt.getAddress(),
          );
          const thresholds = await liquidityPool.liquidityThresholds(await usdt.getAddress());

          const amountToLock = availableLiquidity - thresholds.X + 1n;

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(thresholdSecretHash, await usdt.getAddress(), amountToLock, untilTs),
          ).to.be.revertedWithCustomError(liquidityPool, 'InsufficientReserves');
        });

        it('should revert if amount exceeds Y-Z limit when remaining reserves would be below Y threshold', async function () {
          const yzSecretHash = ethers.keccak256(ethers.toUtf8Bytes('yz_test'));

          const availableLiquidity = await liquidityPool.getAvailableLiquidity(
            await usdt.getAddress(),
          );
          const thresholds = await liquidityPool.liquidityThresholds(await usdt.getAddress());

          // Skip test if available liquidity is already below Y
          if (availableLiquidity < thresholds.Y) {
            this.skip();
          }

          // Set up scenario where remaining reserves would be below Y but above X
          const amountToLock = availableLiquidity - (thresholds.Y - thresholds.Z) + 1n;

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(yzSecretHash, await usdt.getAddress(), amountToLock, untilTs),
          ).to.be.revertedWithCustomError(liquidityPool, 'InsufficientReserves');
        });

        it('should allow lock when amount is within Y-Z limit', async function () {
          const yzAllowedSecretHash = ethers.keccak256(ethers.toUtf8Bytes('yz_allowed_test'));

          const availableLiquidity = await liquidityPool.getAvailableLiquidity(
            await usdt.getAddress(),
          );
          const thresholds = await liquidityPool.liquidityThresholds(await usdt.getAddress());

          // Skip test if available liquidity is too low to run this test meaningfully
          if (availableLiquidity <= (thresholds.Y - thresholds.Z) + 1n) {
            this.skip();
          }

          const amountToLock = availableLiquidity - (thresholds.Y - thresholds.Z) - 1n;

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockDestination(yzAllowedSecretHash, await usdt.getAddress(), amountToLock, untilTs),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(yzAllowedSecretHash, await usdt.getAddress(), amountToLock, untilTs);

          // Cleanup: unlock the large amount that was locked during this test
          await liquidityPool
            .connect(crossChainModule)
            .unlock(yzAllowedSecretHash, await usdt.getAddress(), amountToLock);
        });
      });

      describe('lockSource()', function () {
        it('should pull tokens from user and lock them', async function () {
          const pullLockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('pull_lock_test'));
          const userBalanceBefore = await usdt.balanceOf(user1.address);
          const poolBalanceBefore = await usdt.balanceOf(await liquidityPool.getAddress());

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), lockAmount);

          const base = {
            secretHash: pullLockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSource(base, await getNextNonce(liquidityPool, user1), untilTs),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(pullLockSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          const userBalanceAfter = await usdt.balanceOf(user1.address);
          const poolBalanceAfter = await usdt.balanceOf(await liquidityPool.getAddress());

          expect(userBalanceBefore - userBalanceAfter).to.equal(lockAmount);
          expect(poolBalanceAfter - poolBalanceBefore).to.equal(lockAmount);

          const lockedAmount = await liquidityPool.lockedAmount(pullLockSecretHash);
          expect(lockedAmount).to.equal(lockAmount);
        });

        it('should not allow non-ROUTING_MODULE_ROLE to pull and lock tokens', async function () {
          await usdt.connect(user1).approve(await liquidityPool.getAddress(), lockAmount);

          const base = {
            secretHash: secretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          await expect(
            liquidityPool
              .connect(user1)
              .lockSource(base, await getNextNonce(liquidityPool, user1), untilTs),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
            .withArgs(user1.address, ROUTING_MODULE_ROLE);
        });
      });

      describe('lockSourceWithSignature()', function () {
        it('should pull tokens from user with signature and lock them', async function () {
          const secretHashSig = ethers.keccak256(ethers.toUtf8Bytes('lock_sig_test'));
          const fee = ethers.parseUnits('1', 6);
          const amount = lockAmount;
          const totalAmount = amount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            secretHash: secretHashSig,
            amount: amount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const userSignature = await createUserLockSignature(
            base,
            user1,
            fee,
            nonce,
            liquidityPool,
            backend.address,
          );

          const signatureData = { user: user1.address, fee, userSignature };

          const userBalanceBefore = await usdt.balanceOf(user1.address);
          const poolBalanceBefore = await usdt.balanceOf(await liquidityPool.getAddress());

          await expect(
            (liquidityPool.connect(crossChainModule) as any).lockSourceWithSignature(
              base,
              nonce,
              untilTs,
              signatureData,
              backend.address,
            ),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(secretHashSig, await usdt.getAddress(), amount, untilTs);

          const userBalanceAfter = await usdt.balanceOf(user1.address);
          const poolBalanceAfter = await usdt.balanceOf(await liquidityPool.getAddress());

          expect(userBalanceBefore - userBalanceAfter).to.equal(totalAmount);
          expect(poolBalanceAfter - poolBalanceBefore).to.equal(totalAmount);

          const locked = await liquidityPool.lockedAmount(secretHashSig);
          expect(locked).to.equal(amount);
        });

        it('should revert if user signature is invalid', async function () {
          const secretHashSigInvalid = ethers.keccak256(
            ethers.toUtf8Bytes('lock_sig_invalid_test'),
          );
          const fee = ethers.parseUnits('1', 6);
          const amount = lockAmount;
          const totalAmount = amount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            secretHash: secretHashSigInvalid,
            amount: amount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          // Sign with a different user (invalid)
          const userSignature = await createUserLockSignature(
            base,
            user2,
            fee,
            nonce,
            liquidityPool,
            backend.address,
          );

          const signatureData = { user: user1.address, fee, userSignature };

          await expect(
            (liquidityPool.connect(crossChainModule) as any).lockSourceWithSignature(
              base,
              nonce,
              untilTs,
              signatureData,
              backend.address,
            ),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidSignature');
        });
      });

      describe('lockSourceWithPermit()', function () {
        before(async function () {
          await usdt.connect(user1).approve(await liquidityPool.getAddress(), 0);
          await fdusd.connect(user1).approve(await liquidityPool.getAddress(), 0);
        });

        it('should pull tokens from user with permit and lock them', async function () {
          const permitLockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('permit_lock_test'));
          const userBalanceBefore = await usdt.balanceOf(user1.address);
          const poolBalanceBefore = await usdt.balanceOf(await liquidityPool.getAddress());
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = lockAmount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);
          const permitDeadline = await toDeadline(3600);

          const domain = {
            name: await usdt.name(),
            version: '1',
            chainId: 31337n,
            verifyingContract: await usdt.getAddress(),
          };

          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          };

          const values = {
            owner: user1.address,
            spender: await liquidityPool.getAddress(),
            value: totalAmount,
            nonce: await usdt.nonces(user1.address),
            deadline: permitDeadline,
          };

          const permitSignature = await user1.signTypedData(domain, types, values);
          const permitSig = ethers.Signature.from(permitSignature);

          const userSignature = await createLockWithPermitUserSignature(
            user1,
            nonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permitLockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permitData = {
            deadline: permitDeadline,
            v: permitSig.v,
            r: permitSig.r,
            s: permitSig.s,
            fee: fee,
            userSignature,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit(base, nonce, untilTs, permitData, backend.address),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(permitLockSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          const userBalanceAfter = await usdt.balanceOf(user1.address);
          const poolBalanceAfter = await usdt.balanceOf(await liquidityPool.getAddress());

          expect(userBalanceBefore - userBalanceAfter).to.equal(totalAmount);
          expect(poolBalanceAfter - poolBalanceBefore).to.equal(totalAmount);

          const lockedAmount = await liquidityPool.lockedAmount(permitLockSecretHash);
          expect(lockedAmount).to.equal(lockAmount);
        });

        it('should revert if permit deadline expired', async function () {
          const permitLockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('permit_expired_test'));
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = lockAmount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);
          const permitDeadline = await toDeadline(-3600);

          const domain = {
            name: await usdt.name(),
            version: '1',
            chainId: 31337n,
            verifyingContract: await usdt.getAddress(),
          };

          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          };

          const values = {
            owner: user1.address,
            spender: await liquidityPool.getAddress(),
            value: totalAmount,
            nonce: await usdt.nonces(user1.address),
            deadline: permitDeadline,
          };

          const permitSignature = await user1.signTypedData(domain, types, values);
          const permitSig = ethers.Signature.from(permitSignature);

          const userSignature = await createLockWithPermitUserSignature(
            user1,
            nonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permitLockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permitData = {
            deadline: permitDeadline,
            v: permitSig.v,
            r: permitSig.r,
            s: permitSig.s,
            fee: fee,
            userSignature,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit(base, nonce, untilTs, permitData, backend.address),
          ).to.be.revertedWith('SafePermit: permit failed and insufficient allowance');
        });

        it('should revert if permit signature is invalid', async function () {
          const permitLockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('permit_invalid_test'));
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = lockAmount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);
          const permitDeadline = await toDeadline(3600);

          const domain = {
            name: await usdt.name(),
            version: '1',
            chainId: 31337n,
            verifyingContract: await usdt.getAddress(),
          };

          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          };

          const values = {
            owner: user1.address,
            spender: await liquidityPool.getAddress(),
            value: totalAmount,
            nonce: await usdt.nonces(user1.address),
            deadline: permitDeadline,
          };

          const permitSignature = await user2.signTypedData(domain, types, values);
          const permitSig = ethers.Signature.from(permitSignature);

          const userSignature = await createLockWithPermitUserSignature(
            user1,
            nonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permitLockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permitData = {
            deadline: permitDeadline,
            v: permitSig.v,
            r: permitSig.r,
            s: permitSig.s,
            fee: fee,
            userSignature,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit(base, nonce, untilTs, permitData, backend.address),
          ).to.be.revertedWith('SafePermit: permit failed and insufficient allowance');
        });

        it('should revert if invalid nonce', async function () {
          const permitLockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('permit_nonce_test'));
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = lockAmount + fee;
          const currentNonce = await liquidityPool.lastNonce(user1.address);
          const invalidNonce = currentNonce;
          const permitDeadline = await toDeadline(3600);

          const domain = {
            name: await usdt.name(),
            version: '1',
            chainId: 31337n,
            verifyingContract: await usdt.getAddress(),
          };

          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          };

          const values = {
            owner: user1.address,
            spender: await liquidityPool.getAddress(),
            value: totalAmount,
            nonce: await usdt.nonces(user1.address),
            deadline: permitDeadline,
          };

          const permitSignature = await user1.signTypedData(domain, types, values);
          const permitSig = ethers.Signature.from(permitSignature);

          const userSignature = await createLockWithPermitUserSignature(
            user1,
            invalidNonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permitLockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permitData = {
            deadline: permitDeadline,
            v: permitSig.v,
            r: permitSig.r,
            s: permitSig.s,
            fee: fee,
            userSignature,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit(base, invalidNonce, untilTs, permitData, backend.address),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidNonce');
        });

        it('should pull tokens from user with permit and lock them (18 decimals token)', async function () {
          const permitLockSecretHash = ethers.keccak256(
            ethers.toUtf8Bytes('permit_lock_fdusd_test'),
          );
          const userBalanceBefore = await fdusd.balanceOf(user1.address);
          const poolBalanceBefore = await fdusd.balanceOf(await liquidityPool.getAddress());
          const fee = ethers.parseUnits('1', 18);
          const totalAmount = fdusdLockAmount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);
          const permitDeadline = await toDeadline(3600);

          const domain = {
            name: await fdusd.name(),
            version: '1',
            chainId: 31337n,
            verifyingContract: await fdusd.getAddress(),
          };

          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          };

          const values = {
            owner: user1.address,
            spender: await liquidityPool.getAddress(),
            value: totalAmount,
            nonce: await fdusd.nonces(user1.address),
            deadline: permitDeadline,
          };

          const permitSignature = await user1.signTypedData(domain, types, values);
          const permitSig = ethers.Signature.from(permitSignature);

          const userSignature = await createLockWithPermitUserSignature(
            user1,
            nonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permitLockSecretHash,
            amount: fdusdLockAmount,
            token: await fdusd.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permitData = {
            deadline: permitDeadline,
            v: permitSig.v,
            r: permitSig.r,
            s: permitSig.s,
            fee: fee,
            userSignature,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit(base, nonce, untilTs, permitData, backend.address),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(permitLockSecretHash, await fdusd.getAddress(), fdusdLockAmount, untilTs);

          const userBalanceAfter = await fdusd.balanceOf(user1.address);
          const poolBalanceAfter = await fdusd.balanceOf(await liquidityPool.getAddress());

          expect(userBalanceBefore - userBalanceAfter).to.equal(totalAmount);
          expect(poolBalanceAfter - poolBalanceBefore).to.equal(totalAmount);

          const lockedAmount = await liquidityPool.lockedAmount(permitLockSecretHash);
          expect(lockedAmount).to.equal(fdusdLockAmount);
        });
      });

      describe('lockSourceWithPermit2()', function () {
        before(async function () {
          await usdt.connect(user1).approve(await liquidityPool.getAddress(), 0);
          await fdusd.connect(user1).approve(await liquidityPool.getAddress(), 0);
        });

        it('should pull tokens from user with Permit2 and lock them', async function () {
          const permit2LockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('permit2_lock_test'));
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = lockAmount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);

          const currentAllowance = await permit2.allowance(
            user1.address,
            await usdt.getAddress(),
            await liquidityPool.getAddress(),
          );
          const permit2Nonce = BigInt(currentAllowance.nonce);

          const expiration = await toDeadline(3600);
          const sigDeadline = await toDeadline(3600);

          const permitDetails = {
            token: await usdt.getAddress(),
            amount: BigInt(totalAmount),
            expiration: expiration,
            nonce: permit2Nonce,
          };

          const permitSingle = {
            details: permitDetails,
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          };

          const chainId = (await ethers.provider.getNetwork()).chainId;
          const domain = {
            name: 'Permit2',
            version: '1',
            chainId: Number(chainId),
            verifyingContract: permit2Address,
          };

          const types = {
            PermitDetails: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint160' },
              { name: 'expiration', type: 'uint48' },
              { name: 'nonce', type: 'uint48' },
            ],
            PermitSingle: [
              { name: 'details', type: 'PermitDetails' },
              { name: 'spender', type: 'address' },
              { name: 'sigDeadline', type: 'uint256' },
            ],
          };

          const values = {
            details: {
              token: await usdt.getAddress(),
              amount: BigInt(totalAmount),
              expiration: expiration,
              nonce: permit2Nonce,
            },
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          } as const;

          const permit2Signature = await user1.signTypedData(domain, types, values);
          const permit2Data = ethers.AbiCoder.defaultAbiCoder().encode(
            [
              'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
            ],
            [values],
          );

          const userSignature = await createLockWithPermit2UserSignature(
            user1,
            nonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permit2LockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permit2DataStruct = {
            permit2Data: permit2Data,
            permit2Signature: permit2Signature,
            fee: fee,
            userSignature,
          };

          const userBalanceBefore = await usdt.balanceOf(user1.address);
          const poolBalanceBefore = await usdt.balanceOf(await liquidityPool.getAddress());

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit2(base, nonce, untilTs, permit2DataStruct, backend.address),
          )
            .to.emit(liquidityPool, 'Locked')
            .withArgs(permit2LockSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          const userBalanceAfter = await usdt.balanceOf(user1.address);
          const poolBalanceAfter = await usdt.balanceOf(await liquidityPool.getAddress());

          expect(userBalanceBefore - userBalanceAfter).to.equal(totalAmount);
          expect(poolBalanceAfter - poolBalanceBefore).to.equal(totalAmount);

          const lockedAmount = await liquidityPool.lockedAmount(permit2LockSecretHash);
          expect(lockedAmount).to.equal(lockAmount);
        });

        it('should execute successful swap USDC to FDUSD with Permit2', async function () {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = SWAP_AMOUNT + fee;

          const currentAllowance = await permit2.allowance(
            user1.address,
            await usdc.getAddress(),
            await liquidityPool.getAddress(),
          );
          const permit2Nonce = BigInt(currentAllowance.nonce);

          const currentTime = Math.floor(Date.now() / 1000);
          const expiration = await toDeadline(3600);
          const sigDeadline = await toDeadline(3600);

          const permitDetails = {
            token: await usdc.getAddress(),
            amount: BigInt(totalAmount),
            expiration: expiration,
            nonce: permit2Nonce,
          };

          const permitSingle = {
            details: permitDetails,
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          };

          const chainId = (await ethers.provider.getNetwork()).chainId;
          const domain = {
            name: 'Permit2',
            version: '1',
            chainId: Number(chainId),
            verifyingContract: permit2Address,
          };

          const types = {
            PermitDetails: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint160' },
              { name: 'expiration', type: 'uint48' },
              { name: 'nonce', type: 'uint48' },
            ],
            PermitSingle: [
              { name: 'details', type: 'PermitDetails' },
              { name: 'spender', type: 'address' },
              { name: 'sigDeadline', type: 'uint256' },
            ],
          };

          const values = {
            details: {
              token: await usdc.getAddress(),
              amount: BigInt(totalAmount),
              expiration: expiration,
              nonce: permit2Nonce,
            },
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          } as const;

          const permit2Signature = await user1.signTypedData(domain, types, values);
          const permit2Data = ethers.AbiCoder.defaultAbiCoder().encode(
            [
              'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
            ],
            [values],
          );

          const userSignature = await createSwapWithPermit2UserSignature(
            user1,
            nonce,
            fee,
            liquidityPool,
            user1.address,
          );

          const params = {
            base: {
              chainId: 31337n,
              amountIn: SWAP_AMOUNT,
              tokenIn: await usdc.getAddress(),
              tokenOut: await fdusd.getAddress(),
              recipient: user1.address,
              deadline: deadline,
              nonce: nonce,
            },
            user: user1.address,
            permit2: {
              permit2Data: permit2Data,
              permit2Signature: permit2Signature,
              fee: fee,
              userSignature,
            },
          };

          const maintainerSignature = await createSwapSignature(
            params.base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await fdusd.balanceOf(user1.address);
          await (liquidityPool.connect(backend) as any).singleChainSwapWithPermit2(
            params,
            maintainerSignature,
          );
          const balanceAfter = await fdusd.balanceOf(user1.address);
          expect(balanceAfter - balanceBefore).to.equal(FDUSD_SWAP_AMOUNT);
        });

        it('should revert if Permit2 signature deadline expired', async function () {
          const permit2LockSecretHash = ethers.keccak256(
            ethers.toUtf8Bytes('permit2_expired_test'),
          );
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = lockAmount + fee;
          const nonce = await getNextNonce(liquidityPool, user1);

          const currentAllowance = await permit2.allowance(
            user1.address,
            await usdt.getAddress(),
            await liquidityPool.getAddress(),
          );
          const permit2Nonce = BigInt(currentAllowance.nonce);

          const expiration = await toDeadline(3600);
          const sigDeadline = await toDeadline(-3600);

          const permitDetails = {
            token: await usdt.getAddress(),
            amount: BigInt(totalAmount),
            expiration: expiration,
            nonce: permit2Nonce,
          };

          const permitSingle = {
            details: permitDetails,
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          };

          const chainId = (await ethers.provider.getNetwork()).chainId;
          const domain = {
            name: 'Permit2',
            version: '1',
            chainId: Number(chainId),
            verifyingContract: permit2Address,
          };

          const types = {
            PermitDetails: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint160' },
              { name: 'expiration', type: 'uint48' },
              { name: 'nonce', type: 'uint48' },
            ],
            PermitSingle: [
              { name: 'details', type: 'PermitDetails' },
              { name: 'spender', type: 'address' },
              { name: 'sigDeadline', type: 'uint256' },
            ],
          };

          const values = {
            details: {
              token: await usdt.getAddress(),
              amount: BigInt(totalAmount),
              expiration: expiration,
              nonce: permit2Nonce,
            },
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          } as const;

          const permit2Signature = await user1.signTypedData(domain, types, values);
          const permit2Data = ethers.AbiCoder.defaultAbiCoder().encode(
            [
              'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
            ],
            [values],
          );

          const userSignature = await createLockWithPermit2UserSignature(
            user1,
            nonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permit2LockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permit2DataStruct = {
            permit2Data: permit2Data,
            permit2Signature: permit2Signature,
            fee: fee,
            userSignature,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit2(base, nonce, untilTs, permit2DataStruct, backend.address),
          ).to.be.revertedWith('SafePermit: Permit2 failed and insufficient allowance');
        });

        it('should revert if invalid nonce', async function () {
          const permit2LockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('permit2_nonce_test'));
          const fee = ethers.parseUnits('1', 6);
          const totalAmount = lockAmount + fee;
          const currentNonce = await liquidityPool.lastNonce(user1.address);
          const invalidNonce = currentNonce;

          const currentAllowance = await permit2.allowance(
            user1.address,
            await usdt.getAddress(),
            await liquidityPool.getAddress(),
          );
          const permit2Nonce = BigInt(currentAllowance.nonce);

          const expiration = await toDeadline(3600);
          const sigDeadline = await toDeadline(3600);

          const permitDetails = {
            token: await usdt.getAddress(),
            amount: BigInt(totalAmount),
            expiration: expiration,
            nonce: permit2Nonce,
          };

          const permitSingle = {
            details: permitDetails,
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          };

          const chainId = (await ethers.provider.getNetwork()).chainId;
          const domain = {
            name: 'Permit2',
            version: '1',
            chainId: Number(chainId),
            verifyingContract: permit2Address,
          };

          const types = {
            PermitDetails: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint160' },
              { name: 'expiration', type: 'uint48' },
              { name: 'nonce', type: 'uint48' },
            ],
            PermitSingle: [
              { name: 'details', type: 'PermitDetails' },
              { name: 'spender', type: 'address' },
              { name: 'sigDeadline', type: 'uint256' },
            ],
          };

          const values = {
            details: {
              token: await usdt.getAddress(),
              amount: BigInt(totalAmount),
              expiration: expiration,
              nonce: permit2Nonce,
            },
            spender: await liquidityPool.getAddress(),
            sigDeadline: sigDeadline,
          } as const;

          const permit2Signature = await user1.signTypedData(domain, types, values);
          const permit2Data = ethers.AbiCoder.defaultAbiCoder().encode(
            [
              'tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)',
            ],
            [values],
          );

          const userSignature = await createLockWithPermit2UserSignature(
            user1,
            invalidNonce,
            fee,
            liquidityPool,
            backend.address,
          );

          const base = {
            secretHash: permit2LockSecretHash,
            amount: lockAmount,
            token: await usdt.getAddress(),
            user: user1.address,
            chainId: 31337n,
          };

          const permit2DataStruct = {
            permit2Data: permit2Data,
            permit2Signature: permit2Signature,
            fee: fee,
            userSignature,
          };

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .lockSourceWithPermit2(base, invalidNonce, untilTs, permit2DataStruct, backend.address),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidNonce');
        });
      });

      describe('transfer()', function () {
        it('should transfer tokens to recipient', async function () {
          const transferSecretHash = ethers.keccak256(ethers.toUtf8Bytes('transfer_test'));

          const totalLockedBefore = await liquidityPool.totalLockedByToken(await usdt.getAddress());

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(transferSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          const recipientBalanceBefore = await usdt.balanceOf(user2.address);

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .transfer(transferSecretHash, await usdt.getAddress(), user2.address, lockAmount),
          )
            .to.emit(liquidityPool, 'TransferredToRecipient')
            .withArgs(transferSecretHash, await usdt.getAddress(), user2.address, lockAmount);

          const recipientBalanceAfter = await usdt.balanceOf(user2.address);
          expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(lockAmount);

          const lockedAmount = await liquidityPool.lockedAmount(transferSecretHash);
          expect(lockedAmount).to.equal(0);

          const totalLockedAfter = await liquidityPool.totalLockedByToken(await usdt.getAddress());
          expect(totalLockedAfter).to.equal(totalLockedBefore);
        });

        it('should not allow non-ROUTING_MODULE_ROLE to transfer tokens', async function () {
          await expect(
            liquidityPool
              .connect(user1)
              .transfer(secretHash, await usdt.getAddress(), user2.address, lockAmount),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
            .withArgs(user1.address, ROUTING_MODULE_ROLE);
        });

        it('should revert if lock not found', async function () {
          const nonExistentHash = ethers.keccak256(ethers.toUtf8Bytes('non_existent'));

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .transfer(nonExistentHash, await usdt.getAddress(), user2.address, lockAmount),
          ).to.be.revertedWithCustomError(liquidityPool, 'LockNotFound');
        });

        it("should revert if transfer amount doesn't match locked amount", async function () {
          const wrongAmountSecretHash = ethers.keccak256(ethers.toUtf8Bytes('wrong_amount_test'));
          const wrongAmount = ethers.parseUnits('100', 6);

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(wrongAmountSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .transfer(wrongAmountSecretHash, await usdt.getAddress(), user2.address, wrongAmount),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidUnlockAmount');

          // Cleanup: unlock the tokens that were locked during this test
          await liquidityPool
            .connect(crossChainModule)
            .unlock(wrongAmountSecretHash, await usdt.getAddress(), lockAmount);
        });

        it('should apply fee in transfer() function', async function () {
          const feeRate = 20000; // 2% fee rate
          await liquidityPool
            .connect(manager)
            .setupToken(
              await usdc.getAddress(),
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('2000', 6),
              ethers.parseUnits('200', 6),
              feeRate,
            );
          await liquidityPool.connect(manager).setFeeEnabledForToken(await usdc.getAddress(), true);

          const secretHash = ethers.keccak256(ethers.toUtf8Bytes('test-hash-transfer'));
          const amount = ethers.parseUnits('100', 6);
          const expectedFee = (amount * BigInt(feeRate)) / BigInt(1000000);
          const expectedFinalAmount = amount - expectedFee;

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(secretHash, await usdc.getAddress(), amount, await toDeadline(3600));

          const userBalanceBefore = await usdc.balanceOf(user2.address);
          const poolBalanceBefore = await usdc.balanceOf(await liquidityPool.getAddress());

          await liquidityPool
            .connect(crossChainModule)
            .transfer(secretHash, await usdc.getAddress(), user2.address, amount);

          const userBalanceAfter = await usdc.balanceOf(user2.address);
          expect(userBalanceAfter - userBalanceBefore).to.equal(expectedFinalAmount);

          const poolBalanceAfter = await usdc.balanceOf(await liquidityPool.getAddress());
          expect(poolBalanceBefore - poolBalanceAfter).to.equal(expectedFinalAmount);

          await liquidityPool
            .connect(manager)
            .setupToken(
              await usdc.getAddress(),
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('2000', 6),
              ethers.parseUnits('200', 6),
              0,
            );
          await liquidityPool
            .connect(manager)
            .setFeeEnabledForToken(await usdc.getAddress(), false);
        });
      });

      describe('unlock()', function () {
        it('should unlock tokens and return them to pool', async function () {
          const unlockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('unlock_test'));

          const totalLockedBefore = await liquidityPool.totalLockedByToken(await usdt.getAddress());

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(unlockSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          const poolBalanceBefore = await usdt.balanceOf(await liquidityPool.getAddress());

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .unlock(unlockSecretHash, await usdt.getAddress(), lockAmount),
          )
            .to.emit(liquidityPool, 'Unlocked')
            .withArgs(unlockSecretHash, await usdt.getAddress(), lockAmount);

          const poolBalanceAfter = await usdt.balanceOf(await liquidityPool.getAddress());
          expect(poolBalanceAfter - poolBalanceBefore).to.equal(0);

          const lockedAmount = await liquidityPool.lockedAmount(unlockSecretHash);
          expect(lockedAmount).to.equal(0);

          const totalLockedAfter = await liquidityPool.totalLockedByToken(await usdt.getAddress());
          expect(totalLockedAfter).to.equal(totalLockedBefore);
        });

        it('should not allow non-ROUTING_MODULE_ROLE to unlock tokens', async function () {
          await expect(
            liquidityPool.connect(user1).unlock(secretHash, await usdt.getAddress(), lockAmount),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
            .withArgs(user1.address, ROUTING_MODULE_ROLE);
        });

        it('should revert if lock not found during unlock', async function () {
          const nonExistentHash = ethers.keccak256(ethers.toUtf8Bytes('non_existent'));

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .unlock(nonExistentHash, await usdt.getAddress(), lockAmount),
          ).to.be.revertedWithCustomError(liquidityPool, 'LockNotFound');
        });

        it("should revert if unlock amount doesn't match locked amount", async function () {
          const wrongUnlockSecretHash = ethers.keccak256(ethers.toUtf8Bytes('wrong_unlock_test'));
          const wrongAmount = ethers.parseUnits('100', 6);

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(wrongUnlockSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          await expect(
            liquidityPool
              .connect(crossChainModule)
              .unlock(wrongUnlockSecretHash, await usdt.getAddress(), wrongAmount),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidUnlockAmount');

          // Cleanup: unlock the tokens that were locked during this test
          await liquidityPool
            .connect(crossChainModule)
            .unlock(wrongUnlockSecretHash, await usdt.getAddress(), lockAmount);
        });

        it('should not apply fee in unlock() function', async function () {
          const secretHash = ethers.keccak256(ethers.toUtf8Bytes('test-hash-unlock'));
          const amount = ethers.parseUnits('100', 6);

          // Lock tokens for unlock test
          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(secretHash, await usdc.getAddress(), amount, await toDeadline(3600));

          // Get current balance
          const userBalanceBefore = await usdc.balanceOf(user2.address);

          // Execute unlock (should not apply fee)
          await liquidityPool
            .connect(crossChainModule)
            .unlock(secretHash, await usdc.getAddress(), amount);

          // No tokens should be transferred to user in unlock
          const userBalanceAfter = await usdc.balanceOf(user2.address);
          expect(userBalanceAfter - userBalanceBefore).to.equal(0);
        });
      });

      describe('transferForRefund()', function () {
        it('should transfer full amount without protocol fee', async function () {
          const refundSecretHash = ethers.keccak256(ethers.toUtf8Bytes('refund_test_1'));
          const amount = ethers.parseUnits('100', 6);
          const protocolFee = 20000; // 2% fee rate

          // Enable protocol fee
          await liquidityPool
            .connect(manager)
            .setupToken(
              await usdt.getAddress(),
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('2000', 6),
              ethers.parseUnits('200', 6),
              protocolFee,
            );
          await liquidityPool.connect(manager).setFeeEnabledForToken(await usdt.getAddress(), true);

          // Lock tokens
          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(refundSecretHash, await usdt.getAddress(), amount, untilTs);

          const recipientBefore = await usdt.balanceOf(user2.address);

          // Transfer for refund should NOT deduct protocol fee
          await expect(
            (liquidityPool.connect(crossChainModule) as any).transferForRefund(
              refundSecretHash,
              await usdt.getAddress(),
              user2.address,
              amount,
            ),
          )
            .to.emit(liquidityPool, 'TransferredToRecipient')
            .withArgs(refundSecretHash, await usdt.getAddress(), user2.address, amount);

          const recipientAfter = await usdt.balanceOf(user2.address);
          // User should receive full amount (no protocol fee)
          expect(recipientAfter - recipientBefore).to.equal(amount);

          const lockedAmountAfter = await liquidityPool.lockedAmount(refundSecretHash);
          expect(lockedAmountAfter).to.equal(0);

          // Cleanup
          await liquidityPool
            .connect(manager)
            .setupToken(
              await usdt.getAddress(),
              true,
              ethers.parseUnits('1000', 6),
              ethers.parseUnits('2000', 6),
              ethers.parseUnits('200', 6),
              0,
            );
          await liquidityPool
            .connect(manager)
            .setFeeEnabledForToken(await usdt.getAddress(), false);
        });

        it('should not allow non-ROUTING_MODULE_ROLE to call transferForRefund', async function () {
          const refundSecretHash = ethers.keccak256(ethers.toUtf8Bytes('refund_access_test'));
          const amount = ethers.parseUnits('50', 6);

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(refundSecretHash, await usdt.getAddress(), amount, untilTs);

          await expect(
            (liquidityPool.connect(user1) as any).transferForRefund(
              refundSecretHash,
              await usdt.getAddress(),
              user2.address,
              amount,
            ),
          )
            .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
            .withArgs(user1.address, ROUTING_MODULE_ROLE);

          // Cleanup: unlock the tokens that were locked during this test
          await liquidityPool
            .connect(crossChainModule)
            .unlock(refundSecretHash, await usdt.getAddress(), amount);
        });

        it('should revert if lock not found', async function () {
          const nonExistentHash = ethers.keccak256(ethers.toUtf8Bytes('non_existent_refund'));
          const amount = ethers.parseUnits('50', 6);

          await expect(
            (liquidityPool.connect(crossChainModule) as any).transferForRefund(
              nonExistentHash,
              await usdt.getAddress(),
              user2.address,
              amount,
            ),
          ).to.be.revertedWithCustomError(liquidityPool, 'LockNotFound');
        });

        it("should revert if refund amount doesn't match locked amount", async function () {
          const refundSecretHash = ethers.keccak256(ethers.toUtf8Bytes('refund_wrong_amount'));
          const lockAmount = ethers.parseUnits('100', 6);
          const wrongAmount = ethers.parseUnits('50', 6);

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(refundSecretHash, await usdt.getAddress(), lockAmount, untilTs);

          await expect(
            (liquidityPool.connect(crossChainModule) as any).transferForRefund(
              refundSecretHash,
              await usdt.getAddress(),
              user2.address,
              wrongAmount,
            ),
          ).to.be.revertedWithCustomError(liquidityPool, 'InvalidUnlockAmount');

          // Cleanup: unlock the tokens that were locked during this test
          await liquidityPool
            .connect(crossChainModule)
            .unlock(refundSecretHash, await usdt.getAddress(), lockAmount);
        });
      });


      describe('Multiple locks and unlocks', function () {
        it('should handle multiple locks with different secret hashes', async function () {
          const secretHash1 = ethers.keccak256(ethers.toUtf8Bytes('secret1'));
          const secretHash2 = ethers.keccak256(ethers.toUtf8Bytes('secret2'));
          const amount1 = ethers.parseUnits('100', 6);
          const amount2 = ethers.parseUnits('200', 6);

          const totalLockedBefore = await liquidityPool.totalLockedByToken(await usdt.getAddress());

          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(secretHash1, await usdt.getAddress(), amount1, untilTs);
          await liquidityPool
            .connect(crossChainModule)
            .lockDestination(secretHash2, await usdt.getAddress(), amount2, untilTs);

          expect(await liquidityPool.lockedAmount(secretHash1)).to.equal(amount1);
          expect(await liquidityPool.lockedAmount(secretHash2)).to.equal(amount2);
          expect(await liquidityPool.totalLockedByToken(await usdt.getAddress())).to.equal(
            totalLockedBefore + amount1 + amount2,
          );

          await liquidityPool
            .connect(crossChainModule)
            .transfer(secretHash1, await usdt.getAddress(), user1.address, amount1);

          expect(await liquidityPool.lockedAmount(secretHash1)).to.equal(0);
          expect(await liquidityPool.lockedAmount(secretHash2)).to.equal(amount2);
          expect(await liquidityPool.totalLockedByToken(await usdt.getAddress())).to.equal(
            totalLockedBefore + amount2,
          );
        });
      });
    });
  });

  // ========= 7. AMOUNT CONVERSION TESTS =========
  describe('Amount Conversion', function () {
    describe('_convertAmount()', function () {
      before(async function () {
        // Ensure protocol fees are disabled for all tokens before conversion tests
        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdt.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );
        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdc.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );
        await liquidityPool
          .connect(manager)
          .setupToken(
            await fdusd.getAddress(),
            true,
            ethers.parseUnits('1000', 18),
            ethers.parseUnits('2000', 18),
            ethers.parseUnits('200', 18),
            0,
          );
        await liquidityPool.connect(manager).setFeeEnabledForToken(await usdt.getAddress(), false);
        await liquidityPool.connect(manager).setFeeEnabledForToken(await usdc.getAddress(), false);
        await liquidityPool.connect(manager).setFeeEnabledForToken(await fdusd.getAddress(), false);

        const testAmount = ethers.parseUnits('10000', 6);
        const testAmount18 = ethers.parseUnits('10000', 18);

        if ((await usdt.balanceOf(user1.address)) < testAmount) {
          await usdt.transfer(user1.address, testAmount);
        }
        if ((await usdc.balanceOf(user1.address)) < testAmount) {
          await usdc.transfer(user1.address, testAmount);
        }
        if ((await fdusd.balanceOf(user1.address)) < testAmount18) {
          await fdusd.transfer(user1.address, testAmount18);
        }

        await usdt.connect(user1).approve(await liquidityPool.getAddress(), testAmount);
        await usdc.connect(user1).approve(await liquidityPool.getAddress(), testAmount);
        await fdusd.connect(user1).approve(await liquidityPool.getAddress(), testAmount18);
      });

      it('should return same amount when decimals are equal (USDT to USDC)', async function () {
        const amount = ethers.parseUnits('1000', 6);
        const usdtAddress = await usdt.getAddress();
        const usdcAddress = await usdc.getAddress();

        const usdtLiquidity = await liquidityPool.getAvailableLiquidity(usdtAddress);
        const usdcLiquidity = await liquidityPool.getAvailableLiquidity(usdcAddress);

        if (usdtLiquidity >= amount && usdcLiquidity >= amount) {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const params = {
            chainId: 31337n,
            amountIn: amount,
            tokenIn: usdtAddress,
            tokenOut: usdcAddress,
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params, 0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await usdc.balanceOf(user1.address);
          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);
          const balanceAfter = await usdc.balanceOf(user1.address);

          expect(balanceAfter - balanceBefore).to.equal(amount);
        }
      });

      it('should convert from lower to higher decimals (USDT to FDUSD)', async function () {
        const amount = ethers.parseUnits('1000', 6);
        const usdtAddress = await usdt.getAddress();
        const fdusdAddress = await fdusd.getAddress();

        const usdtLiquidity = await liquidityPool.getAvailableLiquidity(usdtAddress);
        const fdusdLiquidity = await liquidityPool.getAvailableLiquidity(fdusdAddress);

        if (usdtLiquidity >= amount && fdusdLiquidity >= ethers.parseUnits('1000', 18)) {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const params = {
            chainId: 31337n,
            amountIn: amount,
            tokenIn: usdtAddress,
            tokenOut: fdusdAddress,
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params, 0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await fdusd.balanceOf(user1.address);
          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);
          const balanceAfter = await fdusd.balanceOf(user1.address);

          const expectedAmount = amount * 10n ** 12n;
          expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
        }
      });

      it('should convert from higher to lower decimals (FDUSD to USDT)', async function () {
        const amount = ethers.parseUnits('1000', 18);
        const fdusdAddress = await fdusd.getAddress();
        const usdtAddress = await usdt.getAddress();

        const fdusdLiquidity = await liquidityPool.getAvailableLiquidity(fdusdAddress);
        const usdtLiquidity = await liquidityPool.getAvailableLiquidity(usdtAddress);

        if (fdusdLiquidity >= amount && usdtLiquidity >= ethers.parseUnits('1000', 6)) {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const params = {
            chainId: 31337n,
            amountIn: amount,
            tokenIn: fdusdAddress,
            tokenOut: usdtAddress,
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params, 0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await usdt.balanceOf(user1.address);
          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);
          const balanceAfter = await usdt.balanceOf(user1.address);

          const expectedAmount = amount / 10n ** 12n;
          expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
        }
      });

      it('should handle conversion with standard decimals (18) as intermediate', async function () {
        const originalAmount = ethers.parseUnits('1000', 6);

        const to18Decimals = originalAmount * 10n ** 12n;
        expect(to18Decimals).to.equal(ethers.parseUnits('1000', 18));

        const backTo6Decimals = to18Decimals / 10n ** 12n;
        expect(backTo6Decimals).to.equal(originalAmount);
      });

      it('should handle edge case with zero amount', async function () {
        const zeroAmount = 0n;

        const convertedTo18 = zeroAmount * 10n ** 12n;
        expect(convertedTo18).to.equal(0n);

        const convertedTo6 = zeroAmount / 10n ** 12n;
        expect(convertedTo6).to.equal(0n);
      });

      it('should handle large amounts correctly', async function () {
        const largeAmount = ethers.parseUnits('1000000', 6);

        const to18Decimals = largeAmount * 10n ** 12n;
        expect(to18Decimals).to.equal(ethers.parseUnits('1000000', 18));

        const backTo6Decimals = to18Decimals / 10n ** 12n;
        expect(backTo6Decimals).to.equal(largeAmount);
      });

      it('should maintain precision during conversions', async function () {
        const preciseAmount = ethers.parseUnits('1.123456', 6);

        const to18Decimals = preciseAmount * 10n ** 12n;
        expect(to18Decimals).to.equal(ethers.parseUnits('1.123456', 18));

        const backTo6Decimals = to18Decimals / 10n ** 12n;
        expect(backTo6Decimals).to.equal(preciseAmount);
      });

      it('should handle token with 24 decimals correctly', async function () {
        const MockERC20 = await ethers.getContractFactory('MockERC20');
        const token24Decimals = (await MockERC20.deploy(
          '24 Decimal Token',
          '24DT',
          24,
          ethers.parseUnits('1000000', 24),
        )) as unknown as MockERC20;
        await token24Decimals.waitForDeployment();

        await liquidityPool
          .connect(manager)
          .setupToken(
            await token24Decimals.getAddress(),
            true,
            ethers.parseUnits('1000', 24),
            ethers.parseUnits('2000', 24),
            ethers.parseUnits('200', 24),
            0,
          );

        await token24Decimals.transfer(admin.address, ethers.parseUnits('10000', 24));
        await token24Decimals
          .connect(admin)
          .approve(await liquidityPool.getAddress(), ethers.parseUnits('4000', 24));
        await liquidityPool
          .connect(admin)
          .depositLiquidity(await token24Decimals.getAddress(), ethers.parseUnits('4000', 24));

        const amount24Decimals = ethers.parseUnits('100', 24);
        const usdtAddress = await usdt.getAddress();
        const token24Address = await token24Decimals.getAddress();

        const token24Liquidity = await liquidityPool.getAvailableLiquidity(token24Address);
        const usdtLiquidity = await liquidityPool.getAvailableLiquidity(usdtAddress);

        if (token24Liquidity >= amount24Decimals && usdtLiquidity >= ethers.parseUnits('1000', 6)) {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          await token24Decimals.transfer(user1.address, amount24Decimals);
          await token24Decimals
            .connect(user1)
            .approve(await liquidityPool.getAddress(), amount24Decimals);

          const params = {
            chainId: 31337n,
            amountIn: amount24Decimals,
            tokenIn: token24Address,
            tokenOut: usdtAddress,
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params, 0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await usdt.balanceOf(user1.address);
          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);
          const balanceAfter = await usdt.balanceOf(user1.address);

          const expectedAmount = amount24Decimals / 10n ** 18n;
          expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
        }

        const amount6Decimals = ethers.parseUnits('1000', 6);

        if (usdtLiquidity >= amount6Decimals && token24Liquidity >= ethers.parseUnits('1000', 24)) {
          const deadline = await toDeadline(3600);
          const nonce = await getNextNonce(liquidityPool, user1);

          const params = {
            chainId: 31337n,
            amountIn: amount6Decimals,
            tokenIn: usdtAddress,
            tokenOut: token24Address,
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const signature = await createSwapSignatureWithFee(
            params, 0n,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );

          const balanceBefore = await token24Decimals.balanceOf(user1.address);
          await liquidityPool.connect(user1).singleChainSwap(params, signature, 0n);
          const balanceAfter = await token24Decimals.balanceOf(user1.address);

          const expectedAmount = amount6Decimals * 10n ** 18n;
          expect(balanceAfter - balanceBefore).to.equal(expectedAmount);
        }
      });
    });
  });

  // ========= 8. UPGRADE AUTHORIZATION TESTS =========
  describe('Upgrade Authorization', function () {
    describe('_authorizeUpgrade()', function () {
      it('should successfully upgrade implementation when called by UPGRADER_ROLE', async function () {
        const LiquidityPool = await ethers.getContractFactory('LiquidityPool');
        const newImplementation = await LiquidityPool.deploy();
        await newImplementation.waitForDeployment();
        expect(await liquidityPool.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.true;

        const proxyContract = liquidityPool;
        await expect(
          proxyContract
            .connect(upgrader)
            .upgradeToAndCall(await newImplementation.getAddress(), '0x'),
        ).to.not.be.reverted;

        expect(await proxyContract.permit2()).to.equal(permit2Address);
        expect(await proxyContract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
        expect(await proxyContract.maintainer()).to.equal(maintainer.address);
      });

      it('should reject upgrade when called by non-UPGRADER_ROLE', async function () {
        const newImplementation = ethers.Wallet.createRandom().address;

        expect(await liquidityPool.hasRole(UPGRADER_ROLE, user1.address)).to.be.false;

        await expect(liquidityPool.connect(user1).upgradeToAndCall(newImplementation, '0x'))
          .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
          .withArgs(user1.address, UPGRADER_ROLE);
      });
    });
  });

  // ========= FEE COLLECTION AND WITHDRAWAL TESTS =========
  describe('Fee Collection and Withdrawal', function () {
    const FEE_AMOUNT_6 = ethers.parseUnits('10', 6);

    describe('withdrawFees()', function () {
      before(async function () {
        // Setup tokens first
        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdt.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdc.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        // Deposit liquidity for swaps
        const liquidityAmount = ethers.parseUnits('10000', 6);
        await usdt.connect(admin).approve(await liquidityPool.getAddress(), liquidityAmount);
        await liquidityPool.connect(admin).depositLiquidity(await usdt.getAddress(), liquidityAmount);

        await usdc.connect(admin).approve(await liquidityPool.getAddress(), liquidityAmount);
        await liquidityPool.connect(admin).depositLiquidity(await usdc.getAddress(), liquidityAmount);

        // Properly collect fees through swap operations
        const deadline = await toDeadline(3600);

        // Collect fees for USDT (3 times)
        for (let i = 0; i < 3; i++) {
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = FEE_AMOUNT_6;
          const swapAmount = ethers.parseUnits('100', 6);
          const totalAmount = swapAmount + fee;

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            chainId: 31337n,
            amountIn: swapAmount,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );
          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);
          const signatureData = { user: user1.address, fee, userSignature };

          await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
            base,
            signatureData,
            maintainerSignature,
          );
        }

        // Collect fees for USDC (2 times)
        for (let i = 0; i < 2; i++) {
          const nonce = await getNextNonce(liquidityPool, user1);
          const fee = FEE_AMOUNT_6;
          const swapAmount = ethers.parseUnits('100', 6);
          const totalAmount = swapAmount + fee;

          await usdc.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            chainId: 31337n,
            amountIn: swapAmount,
            tokenIn: await usdc.getAddress(),
            tokenOut: await usdt.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );
          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);
          const signatureData = { user: user1.address, fee, userSignature };

          await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
            base,
            signatureData,
            maintainerSignature,
          );
        }
      });

      it('should emit FeesWithdrawn event for single token withdrawal', async function () {
        const usdtAddress = await usdt.getAddress();
        const recipient = user2.address;

        // Get collected fees to verify the withdrawn amount
        const collectedFees = await liquidityPool.collectedFeesByToken(usdtAddress);

        await expect(
          liquidityPool.connect(manager).withdrawFees([usdtAddress], recipient),
        )
          .to.emit(liquidityPool, 'FeesWithdrawn')
          .withArgs([usdtAddress], [collectedFees], recipient);
      });

      it('should emit FeesWithdrawn event for multiple tokens withdrawal', async function () {
        const usdtAddress = await usdt.getAddress();
        const usdcAddress = await usdc.getAddress();
        const recipient = user2.address;

        // Get collected fees to verify the withdrawn amounts
        const collectedFeesUsdt = await liquidityPool.collectedFeesByToken(usdtAddress);
        const collectedFeesUsdc = await liquidityPool.collectedFeesByToken(usdcAddress);

        await expect(
          liquidityPool
            .connect(manager)
            .withdrawFees(
              [usdtAddress, usdcAddress],
              recipient,
            ),
        )
          .to.emit(liquidityPool, 'FeesWithdrawn')
          .withArgs(
            [usdtAddress, usdcAddress],
            [collectedFeesUsdt, collectedFeesUsdc],
            recipient,
          );
      });

      it('should reject withdrawal by non-POOL_MANAGER_ROLE', async function () {
        const usdtAddress = await usdt.getAddress();

        await expect(
          liquidityPool.connect(user1).withdrawFees([usdtAddress], user2.address),
        )
          .to.be.revertedWithCustomError(liquidityPool, 'AccessControlUnauthorizedAccount')
          .withArgs(user1.address, POOL_MANAGER_ROLE);
      });

      it('should reject withdrawal to zero address', async function () {
        const usdtAddress = await usdt.getAddress();

        await expect(
          liquidityPool
            .connect(manager)
            .withdrawFees([usdtAddress], ethers.ZeroAddress),
        ).to.be.revertedWith('Invalid recipient');
      });

      it('should reject withdrawal with empty arrays', async function () {
        await expect(
          liquidityPool.connect(manager).withdrawFees([], user2.address),
        ).to.be.revertedWith('Empty arrays');
      });

      it('should skip tokens with zero collected fees', async function () {
        const usdtAddress = await usdt.getAddress();
        const usdcAddress = await usdc.getAddress();
        const recipient = admin.address;

        // First, collect fresh fees by doing swaps
        const deadline = await toDeadline(3600);
        const fee = FEE_AMOUNT_6;
        const swapAmount = ethers.parseUnits('100', 6);

        // Collect fees for USDC (1 swap)
        const nonce = await getNextNonce(liquidityPool, user1);
        const totalAmount = swapAmount + fee;

        await usdc.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

        const base = {
          chainId: 31337n,
          amountIn: swapAmount,
          tokenIn: usdcAddress,
          tokenOut: usdtAddress,
          recipient: user1.address,
          deadline: deadline,
          nonce: nonce,
        };

        const maintainerSignature = await createSwapSignature(
          base,
          maintainer,
          liquidityPool,
          user1,
          nonce,
        );
        const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);
        const signatureData = { user: user1.address, fee, userSignature };

        await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
          base,
          signatureData,
          maintainerSignature,
        );

        // Withdraw all USDT fees to make it zero (keep USDC with fees)
        const usdtFees = await liquidityPool.collectedFeesByToken(usdtAddress);
        if (usdtFees > 0n) {
          await liquidityPool.connect(manager).withdrawFees([usdtAddress], user2.address);
        }

        // Verify USDT has zero fees
        expect(await liquidityPool.collectedFeesByToken(usdtAddress)).to.equal(0);

        // Get USDC fees (should be > 0)
        const usdcFees = await liquidityPool.collectedFeesByToken(usdcAddress);
        expect(usdcFees).to.be.gt(0);

        const recipientBalanceBefore = await usdc.balanceOf(recipient);

        // Withdraw both tokens - USDT should be skipped (0), USDC should be withdrawn
        await expect(
          liquidityPool.connect(manager).withdrawFees([usdtAddress, usdcAddress], recipient),
        )
          .to.emit(liquidityPool, 'FeesWithdrawn')
          .withArgs([usdtAddress, usdcAddress], [0n, usdcFees], recipient);

        // Verify only USDC was transferred
        const recipientBalanceAfter = await usdc.balanceOf(recipient);
        expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(usdcFees);

        // Verify both tokens now have zero fees
        expect(await liquidityPool.collectedFeesByToken(usdtAddress)).to.equal(0);
        expect(await liquidityPool.collectedFeesByToken(usdcAddress)).to.equal(0);
      });
    });

    describe('getCollectedFees()', function () {
      before(async function () {
        // Setup tokens first
        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdt.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        await liquidityPool
          .connect(manager)
          .setupToken(
            await usdc.getAddress(),
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        // Deposit liquidity for swaps
        const liquidityAmount = ethers.parseUnits('10000', 6);
        await usdt.connect(admin).approve(await liquidityPool.getAddress(), liquidityAmount);
        await liquidityPool.connect(admin).depositLiquidity(await usdt.getAddress(), liquidityAmount);

        await usdc.connect(admin).approve(await liquidityPool.getAddress(), liquidityAmount);
        await liquidityPool.connect(admin).depositLiquidity(await usdc.getAddress(), liquidityAmount);

        // Collect fees through swap operations
        const deadline = await toDeadline(3600);
        const fee = ethers.parseUnits('10', 6);

        // Collect fees for USDT (2 swaps)
        for (let i = 0; i < 2; i++) {
          const nonce = await getNextNonce(liquidityPool, user1);
          const swapAmount = ethers.parseUnits('100', 6);
          const totalAmount = swapAmount + fee;

          await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            chainId: 31337n,
            amountIn: swapAmount,
            tokenIn: await usdt.getAddress(),
            tokenOut: await usdc.getAddress(),
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );
          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);
          const signatureData = { user: user1.address, fee, userSignature };

          await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
            base,
            signatureData,
            maintainerSignature,
          );
        }

        // Collect fees for USDC (1 swap)
        const nonce = await getNextNonce(liquidityPool, user1);
        const swapAmount = ethers.parseUnits('100', 6);
        const totalAmount = swapAmount + fee;

        await usdc.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

        const base = {
          chainId: 31337n,
          amountIn: swapAmount,
          tokenIn: await usdc.getAddress(),
          tokenOut: await usdt.getAddress(),
          recipient: user1.address,
          deadline: deadline,
          nonce: nonce,
        };

        const maintainerSignature = await createSwapSignature(
          base,
          maintainer,
          liquidityPool,
          user1,
          nonce,
        );
        const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);
        const signatureData = { user: user1.address, fee, userSignature };

        await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
          base,
          signatureData,
          maintainerSignature,
        );
      });

      it('should return collected fees for single token', async function () {
        const usdtAddress = await usdt.getAddress();
        const expectedFees = await liquidityPool.collectedFeesByToken(usdtAddress);

        const fees = await liquidityPool.getCollectedFees([usdtAddress]);

        expect(fees.length).to.equal(1);
        expect(fees[0]).to.equal(expectedFees);
      });

      it('should return collected fees for multiple tokens', async function () {
        const usdtAddress = await usdt.getAddress();
        const usdcAddress = await usdc.getAddress();

        const expectedUsdtFees = await liquidityPool.collectedFeesByToken(usdtAddress);
        const expectedUsdcFees = await liquidityPool.collectedFeesByToken(usdcAddress);

        const fees = await liquidityPool.getCollectedFees([usdtAddress, usdcAddress]);

        expect(fees.length).to.equal(2);
        expect(fees[0]).to.equal(expectedUsdtFees);
        expect(fees[1]).to.equal(expectedUsdcFees);
      });

      it('should return empty array for empty input', async function () {
        const fees = await liquidityPool.getCollectedFees([]);

        expect(fees.length).to.equal(0);
      });

      it('should return zero for tokens with no collected fees', async function () {
        const usdtAddress = await usdt.getAddress();
        const randomTokenAddress = ethers.Wallet.createRandom().address;

        const fees = await liquidityPool.getCollectedFees([usdtAddress, randomTokenAddress]);

        expect(fees.length).to.equal(2);
        expect(fees[0]).to.be.gt(0); // USDT has fees
        expect(fees[1]).to.equal(0); // Random token has no fees
      });

      it('should return updated fees after withdrawal', async function () {
        const usdtAddress = await usdt.getAddress();
        const usdcAddress = await usdc.getAddress();

        // Get fees before withdrawal
        const feesBefore = await liquidityPool.getCollectedFees([usdtAddress, usdcAddress]);
        expect(feesBefore[0]).to.be.gt(0);
        expect(feesBefore[1]).to.be.gt(0);

        // Withdraw all fees
        await liquidityPool.connect(manager).withdrawFees([usdtAddress, usdcAddress], user2.address);

        // Get fees after withdrawal
        const feesAfter = await liquidityPool.getCollectedFees([usdtAddress, usdcAddress]);
        expect(feesAfter[0]).to.equal(0);
        expect(feesAfter[1]).to.equal(0);
      });
    });

    describe('getAvailableLiquidity with fees', function () {
      let usdtAddress: string;
      let usdcAddress: string;

      before(async function () {
        usdtAddress = await usdt.getAddress();
        usdcAddress = await usdc.getAddress();

        // Setup tokens
        await liquidityPool
          .connect(manager)
          .setupToken(
            usdtAddress,
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        await liquidityPool
          .connect(manager)
          .setupToken(
            usdcAddress,
            true,
            ethers.parseUnits('1000', 6),
            ethers.parseUnits('2000', 6),
            ethers.parseUnits('200', 6),
            0,
          );

        // Deposit liquidity
        const liquidityAmount = ethers.parseUnits('10000', 6);
        await usdt.connect(admin).approve(await liquidityPool.getAddress(), liquidityAmount);
        await liquidityPool.connect(admin).depositLiquidity(usdtAddress, liquidityAmount);

        await usdc.connect(admin).approve(await liquidityPool.getAddress(), liquidityAmount);
        await liquidityPool.connect(admin).depositLiquidity(usdcAddress, liquidityAmount);
      });

      it('should exclude collected fees from available liquidity', async function () {
        // Get initial state before fees
        const initialBalance = await usdt.balanceOf(await liquidityPool.getAddress());
        const initialLocked = await liquidityPool.totalLockedByToken(usdtAddress);
        const initialFees = await liquidityPool.collectedFeesByToken(usdtAddress);
        const initialAvailable = await liquidityPool.getAvailableLiquidity(usdtAddress);

        // Verify initial calculation: available = balance - locked - fees
        expect(initialAvailable).to.equal(initialBalance - initialLocked - initialFees);

        // Collect fees through swap operation
        const deadline = await toDeadline(3600);
        const nonce = await getNextNonce(liquidityPool, user1);
        const fee = ethers.parseUnits('10', 6);
        const swapAmount = ethers.parseUnits('100', 6);
        const totalAmount = swapAmount + fee;

        await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

        const base = {
          chainId: 31337n,
          amountIn: swapAmount,
          tokenIn: usdtAddress,
          tokenOut: usdcAddress,
          recipient: user1.address,
          deadline: deadline,
          nonce: nonce,
        };

        const maintainerSignature = await createSwapSignature(
          base,
          maintainer,
          liquidityPool,
          user1,
          nonce,
        );
        const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);
        const signatureData = { user: user1.address, fee, userSignature };

        await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
          base,
          signatureData,
          maintainerSignature,
        );

        // Check state after fee collection
        const afterBalance = await usdt.balanceOf(await liquidityPool.getAddress());
        const afterLocked = await liquidityPool.totalLockedByToken(usdtAddress);
        const afterFees = await liquidityPool.collectedFeesByToken(usdtAddress);
        const afterAvailable = await liquidityPool.getAvailableLiquidity(usdtAddress);

        // Verify fees increased
        expect(afterFees).to.equal(initialFees + fee);

        // Verify available liquidity increased by swapAmount
        // (balance increased by swapAmount + fee, fees increased by fee)
        expect(afterAvailable).to.equal(initialAvailable + swapAmount);

        // Verify formula: available = balance - locked - fees (fees are correctly excluded)
        expect(afterAvailable).to.equal(afterBalance - afterLocked - afterFees);
      });

      it('should keep available liquidity unchanged after fee withdrawal', async function () {
        // Collect some fees first
        const deadline = await toDeadline(3600);
        const fee = ethers.parseUnits('15', 6);
        const swapAmount = ethers.parseUnits('100', 6);

        for (let i = 0; i < 2; i++) {
          const nonce = await getNextNonce(liquidityPool, user1);
          const totalAmount = swapAmount + fee;

          await usdc.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

          const base = {
            chainId: 31337n,
            amountIn: swapAmount,
            tokenIn: usdcAddress,
            tokenOut: usdtAddress,
            recipient: user1.address,
            deadline: deadline,
            nonce: nonce,
          };

          const maintainerSignature = await createSwapSignature(
            base,
            maintainer,
            liquidityPool,
            user1,
            nonce,
          );
          const userSignature = await createUserSwapSignature(base, user1, fee, liquidityPool);
          const signatureData = { user: user1.address, fee, userSignature };

          await (liquidityPool.connect(backend) as any).singleChainSwapWithSignature(
            base,
            signatureData,
            maintainerSignature,
          );
        }

        // Get state before withdrawal
        const beforeBalance = await usdc.balanceOf(await liquidityPool.getAddress());
        const beforeLocked = await liquidityPool.totalLockedByToken(usdcAddress);
        const beforeFees = await liquidityPool.collectedFeesByToken(usdcAddress);
        const beforeAvailable = await liquidityPool.getAvailableLiquidity(usdcAddress);

        expect(beforeFees).to.be.gt(0);
        expect(beforeAvailable).to.equal(beforeBalance - beforeLocked - beforeFees);

        // Withdraw all fees
        await liquidityPool.connect(manager).withdrawFees([usdcAddress], user2.address);

        // Get state after withdrawal
        const afterBalance = await usdc.balanceOf(await liquidityPool.getAddress());
        const afterLocked = await liquidityPool.totalLockedByToken(usdcAddress);
        const afterFees = await liquidityPool.collectedFeesByToken(usdcAddress);
        const afterAvailable = await liquidityPool.getAvailableLiquidity(usdcAddress);

        // Verify both balance and fees decreased by the same amount (all fees withdrawn)
        expect(beforeBalance - afterBalance).to.equal(beforeFees);
        expect(afterFees).to.equal(0);

        // Verify available liquidity remained unchanged
        expect(afterAvailable).to.equal(beforeAvailable);

        // Verify formula still holds: available = balance - locked - fees
        expect(afterAvailable).to.equal(afterBalance - afterLocked - afterFees);
      });
    });
  });
});

// ========= HELPER FUNCTIONS =========
async function createSwapSignature(
  params: any,
  signer: SignerWithAddress,
  liquidityPool: LiquidityPool,
  user?: SignerWithAddress,
  nonce?: bigint,
) {
  const domain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const types = {
    SwapLocal: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint64' },
      { name: 'user', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
  };

  const enhancedParams = {
    ...params,
    user: user ? user.address : params.user,
    nonce: params.nonce !== undefined ? params.nonce : nonce || 1n,
  };

  return await signer.signTypedData(domain, types, enhancedParams);
}

async function createSwapSignatureWithFee(
  params: any,
  executionFeeNative: bigint,
  signer: SignerWithAddress,
  liquidityPool: LiquidityPool,
  user?: SignerWithAddress,
  nonce?: bigint,
) {
  const domain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const types = {
    SwapLocalWithFee: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint64' },
      { name: 'user', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'executionFeeNative', type: 'uint256' },
    ],
  };

  const enhancedParams = {
    ...params,
    user: user ? user.address : params.user,
    nonce: params.nonce !== undefined ? params.nonce : nonce || 1n,
    executionFeeNative: executionFeeNative,
  };

  return await signer.signTypedData(domain, types, enhancedParams);
}

function addressToBytes32(address: string): string {
  return ethers.zeroPadValue(address, 32);
}

async function createUserSwapSignature(
  base: any,
  user: SignerWithAddress,
  fee: bigint,
  liquidityPool: LiquidityPool,
) {
  const domain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const types = {
    SwapLocalWithSignature: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint64' },
      { name: 'user', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  };

  const value = {
    amountIn: base.amountIn,
    tokenIn: base.tokenIn,
    tokenOut: base.tokenOut,
    recipient: base.recipient,
    deadline: base.deadline,
    user: user.address,
    nonce: base.nonce,
    fee: fee,
  };

  return await user.signTypedData(domain, types, value);
}

async function createUserLockSignature(
  base: any,
  user: SignerWithAddress,
  fee: bigint,
  nonce: bigint,
  liquidityPool: LiquidityPool,
  sessionAddress: string,
) {
  const domain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const types = {
    LockSourceWithSignature: [
      { name: 'amount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'secretHash', type: 'bytes32' },
      { name: 'user', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'sessionAddress', type: 'address' },
    ],
  };

  const value = {
    amount: base.amount,
    token: base.token,
    secretHash: base.secretHash,
    user: user.address,
    nonce: nonce,
    fee: fee,
    sessionAddress,
  };

  return await user.signTypedData(domain, types, value);
}

async function createSwapWithPermitUserSignature(
  user: SignerWithAddress,
  nonce: bigint,
  fee: bigint,
  liquidityPool: LiquidityPool,
  recipient: string,
) {
  const poolDomain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const userSigTypes = {
    SwapWithPermit: [
      { name: 'nonce', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
  };

  const userSigMessage = {
    nonce: nonce,
    fee: fee,
    recipient: recipient,
  };

  return await user.signTypedData(poolDomain, userSigTypes, userSigMessage);
}

async function createSwapWithPermit2UserSignature(
  user: SignerWithAddress,
  nonce: bigint,
  fee: bigint,
  liquidityPool: LiquidityPool,
  recipient: string,
) {
  const poolDomain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const userSigTypes = {
    SwapWithPermit2: [
      { name: 'nonce', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
  };

  const userSigMessage = {
    nonce: nonce,
    fee: fee,
    recipient: recipient,
  };

  return await user.signTypedData(poolDomain, userSigTypes, userSigMessage);
}

async function createLockWithPermitUserSignature(
  user: SignerWithAddress,
  nonce: bigint,
  fee: bigint,
  liquidityPool: LiquidityPool,
  sessionAddress: string,
) {
  const poolDomain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const userSigTypes = {
    LockSourceWithPermit: [
      { name: 'nonce', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'sessionAddress', type: 'address' },
    ],
  };

  const userSigMessage = {
    nonce: nonce,
    fee: fee,
    sessionAddress: sessionAddress,
  };

  return await user.signTypedData(poolDomain, userSigTypes, userSigMessage);
}

async function createLockWithPermit2UserSignature(
  user: SignerWithAddress,
  nonce: bigint,
  fee: bigint,
  liquidityPool: LiquidityPool,
  sessionAddress: string,
) {
  const poolDomain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: 31337n,
    verifyingContract: await liquidityPool.getAddress(),
  };

  const userSigTypes = {
    LockSourceWithPermit2: [
      { name: 'nonce', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'sessionAddress', type: 'address' },
    ],
  };

  const userSigMessage = {
    nonce: nonce,
    fee: fee,
    sessionAddress: sessionAddress,
  };

  return await user.signTypedData(poolDomain, userSigTypes, userSigMessage);
}
