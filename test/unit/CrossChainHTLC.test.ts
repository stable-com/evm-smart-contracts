import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { CrossChainHTLC, LiquidityPool, MockERC20 } from '../../typechain-types';

describe('CrossChainHTLC Unit Tests', function () {
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let maintainer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let pauser: SignerWithAddress;
  let sessionSigner: SignerWithAddress;
  let locker: SignerWithAddress;
  let manager: SignerWithAddress;
  let backend: SignerWithAddress;

  let crossChainHTLC: CrossChainHTLC;
  let liquidityPool: LiquidityPool;
  let usdt: MockERC20;
  let usdc: MockERC20;
  let fdusd: MockERC20;
  let permit2: any;

  const INITIAL_SUPPLY_6 = ethers.parseUnits('1000000', 6);
  const INITIAL_SUPPLY_18 = ethers.parseUnits('1000000', 18);
  const DEPOSIT_AMOUNT = ethers.parseUnits('10000', 6);
  const SWAP_AMOUNT = ethers.parseUnits('1000', 6);
  const USDT_DECIMALS = 6;
  const USDC_DECIMALS = 6;
  const FDUSD_DECIMALS = 18;
  const SOURCE_LOCK_SECS = 3600n;
  const DESTINATION_LOCK_SECS = 7200n;

  const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const UPGRADER_ROLE = ethers.id('UPGRADER_ROLE');
  const PAUSER_ROLE = ethers.id('PAUSER_ROLE');
  const HTLC_MANAGER_ROLE = ethers.id('HTLC_MANAGER_ROLE');
  const CROSS_CHAIN_MANAGER_ROLE = ethers.id('CROSS_CHAIN_MANAGER_ROLE');

  async function toDeadline(expirationSecs: number): Promise<bigint> {
    const block = await ethers.provider.getBlock('latest');
    return BigInt(block!.timestamp) + BigInt(expirationSecs);
  }

  before(async function () {
    [
      owner,
      admin,
      maintainer,
      user1,
      user2,
      upgrader,
      pauser,
      sessionSigner,
      locker,
      manager,
      backend,
    ] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');

    usdt = (await MockERC20.deploy(
      'Tether USD',
      'USDT',
      USDT_DECIMALS,
      INITIAL_SUPPLY_6,
    )) as unknown as MockERC20;
    await usdt.waitForDeployment();

    usdc = (await MockERC20.deploy(
      'USD Coin',
      'USDC',
      USDC_DECIMALS,
      INITIAL_SUPPLY_6,
    )) as unknown as MockERC20;
    await usdc.waitForDeployment();

    fdusd = (await MockERC20.deploy(
      'First Digital USD',
      'FDUSD',
      FDUSD_DECIMALS,
      INITIAL_SUPPLY_18,
    )) as unknown as MockERC20;
    await fdusd.waitForDeployment();

    const Permit2 = await ethers.getContractFactory('Permit2');
    permit2 = await Permit2.deploy();
    await permit2.waitForDeployment();

    const LiquidityPoolFactory = await ethers.getContractFactory('LiquidityPool');
    liquidityPool = (await upgrades.deployProxy(
      LiquidityPoolFactory,
      [admin.address, manager.address, maintainer.address, await permit2.getAddress()],
      { initializer: 'initialize' },
    )) as unknown as LiquidityPool;
    await liquidityPool.waitForDeployment();

    const CrossChainHTLCFactory = await ethers.getContractFactory('CrossChainHTLC');
    crossChainHTLC = (await upgrades.deployProxy(
      CrossChainHTLCFactory,
      [
        admin.address,
        maintainer.address,
        await liquidityPool.getAddress(),
        SOURCE_LOCK_SECS,
        DESTINATION_LOCK_SECS,
      ],
      { initializer: 'initialize' },
    )) as unknown as CrossChainHTLC;
    await crossChainHTLC.waitForDeployment();

    await liquidityPool.connect(admin).grantRole(UPGRADER_ROLE, upgrader.address);
    await liquidityPool.connect(admin).grantRole(PAUSER_ROLE, pauser.address);
    await liquidityPool
      .connect(admin)
      .grantRole(await liquidityPool.ROUTING_MODULE_ROLE(), await crossChainHTLC.getAddress());
    await liquidityPool.connect(admin).grantRole(CROSS_CHAIN_MANAGER_ROLE, backend.address);

    await crossChainHTLC.connect(admin).grantRole(UPGRADER_ROLE, upgrader.address);
    await crossChainHTLC.connect(admin).grantRole(PAUSER_ROLE, pauser.address);
    await crossChainHTLC.connect(admin).grantRole(HTLC_MANAGER_ROLE, manager.address);
    await crossChainHTLC.connect(admin).grantRole(CROSS_CHAIN_MANAGER_ROLE, locker.address);
    await crossChainHTLC.connect(admin).grantRole(CROSS_CHAIN_MANAGER_ROLE, backend.address);

    await usdt.transfer(user1.address, INITIAL_SUPPLY_6 / 4n);
    await usdt.transfer(user2.address, INITIAL_SUPPLY_6 / 4n);
    await usdt.transfer(admin.address, INITIAL_SUPPLY_6 / 4n);
    await usdc.transfer(user1.address, INITIAL_SUPPLY_6 / 4n);
    await usdc.transfer(user2.address, INITIAL_SUPPLY_6 / 4n);
    await usdc.transfer(admin.address, INITIAL_SUPPLY_6 / 4n);
    await fdusd.transfer(user1.address, INITIAL_SUPPLY_18 / 4n);
    await fdusd.transfer(user2.address, INITIAL_SUPPLY_18 / 4n);
    await fdusd.transfer(admin.address, INITIAL_SUPPLY_18 / 4n);

    await liquidityPool
      .connect(manager)
      .setupToken(
        await usdt.getAddress(),
        true,
        ethers.parseUnits('100', 6),
        ethers.parseUnits('2000', 6),
        ethers.parseUnits('100', 6),
        0,
      );
    await liquidityPool
      .connect(manager)
      .setupToken(
        await usdc.getAddress(),
        true,
        ethers.parseUnits('100', 6),
        ethers.parseUnits('2000', 6),
        ethers.parseUnits('100', 6),
        0,
      );
    await liquidityPool
      .connect(manager)
      .setupToken(
        await fdusd.getAddress(),
        true,
        ethers.parseUnits('100', 18),
        ethers.parseUnits('2000', 18),
        ethers.parseUnits('100', 18),
        0,
      );
    await usdt.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
    await usdc.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
    await fdusd.connect(admin).approve(await liquidityPool.getAddress(), DEPOSIT_AMOUNT);
    await liquidityPool.connect(admin).depositLiquidity(await usdt.getAddress(), DEPOSIT_AMOUNT);
    await liquidityPool.connect(admin).depositLiquidity(await usdc.getAddress(), DEPOSIT_AMOUNT);
    await liquidityPool.connect(admin).depositLiquidity(await fdusd.getAddress(), DEPOSIT_AMOUNT);
  });

  afterEach(async function () {
    if (await crossChainHTLC.paused()) {
      await crossChainHTLC.connect(pauser).unpause();
    }
  });

  // ========= 1. INITIALIZATION TESTS =========
  describe('Initialization', function () {
    let freshHTLC: CrossChainHTLC;
    let freshPool: LiquidityPool;

    before(async function () {
      const LiquidityPoolFactory = await ethers.getContractFactory('LiquidityPool');
      freshPool = (await upgrades.deployProxy(
        LiquidityPoolFactory,
        [admin.address, manager.address, maintainer.address, await permit2.getAddress()],
        { initializer: 'initialize' },
      )) as unknown as LiquidityPool;
      await freshPool.waitForDeployment();

      const CrossChainHTLCFactory = await ethers.getContractFactory('CrossChainHTLC');
      freshHTLC = (await upgrades.deployProxy(
        CrossChainHTLCFactory,
        [
          admin.address,
          maintainer.address,
          await freshPool.getAddress(),
          SOURCE_LOCK_SECS,
          DESTINATION_LOCK_SECS,
        ],
        { initializer: 'initialize' },
      )) as unknown as CrossChainHTLC;
      await freshHTLC.waitForDeployment();
    });

    describe('initialize()', function () {
      it('should initialize with correct parameters', async function () {
        expect(await freshHTLC.pool()).to.equal(await freshPool.getAddress());
        expect(await freshHTLC.defaultSourceLockSecs()).to.equal(SOURCE_LOCK_SECS);
        expect(await freshHTLC.defaultDestinationLockSecs()).to.equal(DESTINATION_LOCK_SECS);
        expect(await freshHTLC.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
        expect(await freshHTLC.maintainer()).to.equal(maintainer.address);
      });

      it('should not allow re-initialization', async function () {
        await expect(
          freshHTLC.initialize(
            admin.address,
            maintainer.address,
            await freshPool.getAddress(),
            SOURCE_LOCK_SECS,
            DESTINATION_LOCK_SECS,
          ),
        ).to.be.reverted;
      });

      it('should set correct initial roles', async function () {
        expect(await freshHTLC.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
        expect(await freshHTLC.maintainer()).to.equal(maintainer.address);
        expect(await freshHTLC.hasRole(UPGRADER_ROLE, admin.address)).to.be.false;
        expect(await freshHTLC.hasRole(PAUSER_ROLE, admin.address)).to.be.false;
      });
    });
  });

  // ========= 2. ADMIN FUNCTIONS TESTS =========
  describe('Admin Functions', function () {
    describe('pause()', function () {
      it('should allow PAUSER_ROLE to pause the contract', async function () {
        await crossChainHTLC.connect(pauser).pause();
        expect(await crossChainHTLC.paused()).to.be.true;
      });

      it('should not allow non-PAUSER_ROLE to pause', async function () {
        await expect(crossChainHTLC.connect(user1).pause()).to.be.revertedWithCustomError(
          crossChainHTLC,
          'AccessControlUnauthorizedAccount',
        );
      });
    });

    describe('unpause()', function () {
      before(async function () {
        await crossChainHTLC.connect(pauser).pause();
      });

      it('should allow PAUSER_ROLE to unpause the contract', async function () {
        await crossChainHTLC.connect(pauser).unpause();
        expect(await crossChainHTLC.paused()).to.be.false;
      });

      it('should not allow non-PAUSER_ROLE to unpause', async function () {
        await crossChainHTLC.connect(pauser).pause();
        await expect(crossChainHTLC.connect(user1).unpause()).to.be.revertedWithCustomError(
          crossChainHTLC,
          'AccessControlUnauthorizedAccount',
        );
      });
    });

    describe('setPool()', function () {
      it('should allow HTLC_MANAGER_ROLE to set new pool', async function () {
        const newPoolAddress = ethers.Wallet.createRandom().address;
        await crossChainHTLC.connect(manager).setPool(newPoolAddress);
        expect(await crossChainHTLC.pool()).to.equal(newPoolAddress);
        await crossChainHTLC.connect(manager).setPool(await liquidityPool.getAddress());
      });

      it('should not allow non-HTLCMANAGER_ROLE to set pool', async function () {
        const newPoolAddress = ethers.Wallet.createRandom().address;
        await expect(
          crossChainHTLC.connect(user2).setPool(newPoolAddress),
        ).to.be.revertedWithCustomError(crossChainHTLC, 'AccessControlUnauthorizedAccount');
      });
    });

    describe('setDefaultLocks()', function () {
      it('should allow HTLC_MANAGER_ROLE to set default lock durations', async function () {
        const newSourceLock = 1800n;
        const newDestLock = 3600n;
        await crossChainHTLC.connect(manager).setDefaultLocks(newSourceLock, newDestLock);
        expect(await crossChainHTLC.defaultSourceLockSecs()).to.equal(newSourceLock);
        expect(await crossChainHTLC.defaultDestinationLockSecs()).to.equal(newDestLock);
        await crossChainHTLC
          .connect(manager)
          .setDefaultLocks(SOURCE_LOCK_SECS, DESTINATION_LOCK_SECS);
      });

      it('should not allow non-HTLCMANAGER_ROLE to set default locks', async function () {
        await expect(
          crossChainHTLC.connect(user2).setDefaultLocks(1800, 3600),
        ).to.be.revertedWithCustomError(crossChainHTLC, 'AccessControlUnauthorizedAccount');
      });
    });
  });

  // ========= 3. SOURCE CHAIN FUNCTIONS =========
  describe('Source Chain: lockSource()', function () {
    before(async function () {
      await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT * 10n);
    });

    it('should lock source tokens with valid maintainer signature', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, 0n, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      await crossChainHTLC.connect(user1).lockSource(params, 0n);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
      const currentTimestamp = await ethers.provider.getBlock('latest').then((b) => b!.timestamp);
      expect(swap.lockUntil).to.be.greaterThan(currentTimestamp);
    });

    it('should reject lock with invalid maintainer signature', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const wrongSig = await createHtlcLockSignatureWithFee(params, 0n, user1, crossChainHTLC);
      params.maintainerSig = wrongSig;

      await expect(crossChainHTLC.connect(user1).lockSource(params, 0n)).to.be.revertedWithCustomError(
        crossChainHTLC,
        'InvalidSignature',
      );
    });

    it('should reject lock with expired deadline', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: 1n,
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, 0n, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      await expect(crossChainHTLC.connect(user1).lockSource(params, 0n)).to.be.revertedWithCustomError(
        crossChainHTLC,
        'DeadlineExpired',
      );
    });

    it('should validate and update nonce via pool', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, 0n, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      await crossChainHTLC.connect(user1).lockSource(params, 0n);

      const lastNonce = await liquidityPool.lastNonce(user1.address);
      expect(lastNonce).to.be.greaterThan(0n);
    });

    it('should not allow when paused', async function () {
      await crossChainHTLC.connect(pauser).pause();

      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, 0n, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      await expect(crossChainHTLC.connect(user1).lockSource(params, 0n)).to.be.revertedWithCustomError(
        crossChainHTLC,
        'EnforcedPause',
      );
    });

    it('should reject duplicate secretHash (SwapIdAlreadyUsed)', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, 0n, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      await crossChainHTLC.connect(user1).lockSource(params, 0n);

      await expect(crossChainHTLC.connect(user1).lockSource(params, 0n)).to.be.revertedWithCustomError(
        crossChainHTLC,
        'SwapIdAlreadyUsed',
      );
    });
  });

  // ========= 3.5. NATIVE TOKEN HANDLING =========
  describe('Native Token Handling: lockSource() with native fee', function () {
    before(async function () {
      await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT * 10n);
    });

    it('should lock source tokens with native token fee', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const nativeFee = ethers.parseEther('0.1');

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, nativeFee, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const contractBalanceBefore = await ethers.provider.getBalance(
        await crossChainHTLC.getAddress(),
      );

      await expect(crossChainHTLC.connect(user1).lockSource(params, nativeFee, { value: nativeFee }))
        .to.emit(crossChainHTLC, 'FeePaid')
        .withArgs(secretHash, nativeFee);

      const contractBalanceAfter = await ethers.provider.getBalance(
        await crossChainHTLC.getAddress(),
      );
      expect(contractBalanceAfter - contractBalanceBefore).to.equal(nativeFee);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
    });

    it('should lock source tokens without native fee (no FeePaid event)', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, 0n, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const tx = await crossChainHTLC.connect(user1).lockSource(params, 0n);
      const receipt = await tx.wait();

      // Verify no FeePaid event was emitted
      const feePaidEvents = receipt?.logs.filter(
        (log: any) =>
          log.topics[0] === crossChainHTLC.interface.getEvent('FeePaid')?.topicHash,
      );
      expect(feePaidEvents?.length).to.equal(0);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
    });
  });

  // ========= 3.6. WITHDRAW NATIVE =========
  describe('Admin Functions: withdrawNative()', function () {
    it('should allow HTLC_MANAGER_ROLE to withdraw native tokens', async function () {
      // First, send some native tokens to the contract via lockSource
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const nativeFee = ethers.parseEther('0.5');

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(params, nativeFee, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT);
      await crossChainHTLC.connect(user1).lockSource(params, nativeFee, { value: nativeFee });

      const contractBalanceBefore = await ethers.provider.getBalance(
        await crossChainHTLC.getAddress(),
      );
      expect(contractBalanceBefore).to.be.greaterThanOrEqual(nativeFee);

      const recipientBalanceBefore = await ethers.provider.getBalance(user2.address);
      const withdrawAmount = ethers.parseEther('0.2');

      await expect(crossChainHTLC.connect(manager).withdrawNative(user2.address, withdrawAmount))
        .to.emit(crossChainHTLC, 'NativeWithdrawn')
        .withArgs(user2.address, withdrawAmount, manager.address);

      const recipientBalanceAfter = await ethers.provider.getBalance(user2.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(withdrawAmount);

      const contractBalanceAfter = await ethers.provider.getBalance(
        await crossChainHTLC.getAddress(),
      );
      expect(contractBalanceBefore - contractBalanceAfter).to.equal(withdrawAmount);
    });

    it('should reject withdrawal by non-HTLC_MANAGER_ROLE', async function () {
      const withdrawAmount = ethers.parseEther('0.1');

      await expect(
        crossChainHTLC.connect(user1).withdrawNative(user2.address, withdrawAmount),
      )
        .to.be.revertedWithCustomError(crossChainHTLC, 'AccessControlUnauthorizedAccount')
        .withArgs(user1.address, HTLC_MANAGER_ROLE);
    });

    it('should reject withdrawal to zero address', async function () {
      const withdrawAmount = ethers.parseEther('0.1');

      await expect(
        crossChainHTLC.connect(manager).withdrawNative(ethers.ZeroAddress, withdrawAmount),
      ).to.be.revertedWith('Invalid recipient');
    });

    it('should reject withdrawal of zero amount', async function () {
      await expect(
        crossChainHTLC.connect(manager).withdrawNative(user2.address, 0),
      ).to.be.revertedWith('Amount must be greater than 0');
    });

    it('should reject withdrawal amount exceeding balance', async function () {
      const contractBalance = await ethers.provider.getBalance(await crossChainHTLC.getAddress());
      const excessAmount = contractBalance + ethers.parseEther('1.0');

      await expect(
        crossChainHTLC.connect(manager).withdrawNative(user2.address, excessAmount),
      ).to.be.revertedWith('Insufficient balance');
    });
  });

  // ========= 4. DESTINATION CHAIN FUNCTIONS =========
  describe('Destination Chain: lockDestination()', function () {
    it('should lock destination tokens with valid maintainer signature (CROSS_CHAIN_MANAGER_ROLE only)', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        secretHash,
        amount: SWAP_AMOUNT,
        token: await usdt.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await expect(crossChainHTLC.connect(locker).lockDestination(params)).to.emit(
        crossChainHTLC,
        'DestinationLocked',
      );

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(2);
      const currentTimestamp = await ethers.provider.getBlock('latest').then((b) => b!.timestamp);
      expect(swap.lockUntil).to.be.greaterThan(currentTimestamp);
    });

    it('should not allow non-CROSS_CHAIN_MANAGER_ROLE to lock destination tokens', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        secretHash,
        amount: SWAP_AMOUNT,
        token: await usdt.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await expect(
        crossChainHTLC.connect(user2).lockDestination(params),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'AccessControlUnauthorizedAccount');
    });

    it('should respect token decimals conversion via pool', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const fdusdAmount = ethers.parseUnits('1000', 6);
      const params = {
        secretHash,
        amount: fdusdAmount,
        token: await usdt.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await crossChainHTLC.connect(locker).lockDestination(params);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(2);
      const currentTimestamp = await ethers.provider.getBlock('latest').then((b) => b!.timestamp);
      expect(swap.lockUntil).to.be.greaterThan(currentTimestamp);
    });

    it('should not allow when paused', async function () {
      await crossChainHTLC.connect(pauser).pause();

      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const params = {
        secretHash,
        amount: SWAP_AMOUNT,
        token: await usdt.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await expect(
        crossChainHTLC.connect(locker).lockDestination(params),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'EnforcedPause');
    });

    it('should reject duplicate secretHash in destination (SwapIdAlreadyUsed)', async function () {
      const secretHash = ethers.hexlify(ethers.randomBytes(32));
      const nonce = await getNextNonce(liquidityPool, user1);

      const params = {
        secretHash,
        amount: SWAP_AMOUNT,
        token: await usdt.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await crossChainHTLC.connect(locker).lockDestination(params);
      await expect(
        crossChainHTLC.connect(locker).lockDestination(params),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'SwapIdAlreadyUsed');
    });
  });

  // ========= 5. CLAIM FUNCTIONS =========
  describe('Claim Flow: claimSource()', function () {
    let secretHash: string;
    let sessionAddress: string;
    let backendSecret: string;

    before(async function () {
      sessionAddress = sessionSigner.address;
      backendSecret = ethers.hexlify(ethers.randomBytes(32));
      secretHash = ethers.keccak256(ethers.solidityPacked(['bytes32'], [backendSecret]));
      const untilTs = Math.floor(Date.now() / 1000) + Number(SOURCE_LOCK_SECS);

      await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT * 10n);
    });

    it('should claim on source chain with valid session signature', async function () {
      const lockParams = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      const claimParams = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
        secret: backendSecret,
        secretHashSignature: await createClaimSignature(secretHash, sessionSigner, crossChainHTLC),
      };

      await expect(crossChainHTLC.connect(user1).claimSource(claimParams))
        .to.emit(crossChainHTLC, 'Claimed')
        .withArgs(secretHash, user1.address, await usdt.getAddress(), SWAP_AMOUNT);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(3);
    });

    it('should reject claim on source chain with invalid session signature', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      const claimParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
        secret: newBackendSecret,
        secretHashSignature: await createClaimSignature(newSecretHash, user1, crossChainHTLC),
      };

      await expect(
        crossChainHTLC.connect(user1).claimSource(claimParams),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'InvalidSignature');
    });

    it('should claim on destination chain and release to recipient with correct decimals', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        secretHash: newSecretHash,
        amount: SWAP_AMOUNT,
        token: await usdc.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await crossChainHTLC.connect(locker).lockDestination(lockParams);

      const claimParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdc.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        secret: newBackendSecret,
      };

      await expect(crossChainHTLC.connect(user1).claimDestination(claimParams))
        .to.emit(crossChainHTLC, 'Claimed')
        .withArgs(newSecretHash, user1.address, await usdc.getAddress(), SWAP_AMOUNT);

      const swap = await crossChainHTLC.swaps(newSecretHash);
      expect(swap.status).to.equal(3);
    });

    it('should reject claim when secret mismatch', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      const wrongBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const claimParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
        secret: wrongBackendSecret,
        secretHashSignature: await createClaimSignature(
          newSecretHash,
          sessionSigner,
          crossChainHTLC,
        ),
      };

      await expect(
        crossChainHTLC.connect(user1).claimSource(claimParams),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'SecretMismatch');
    });

    it('should reject claim in invalid status', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const claimParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
        secret: newBackendSecret,
        secretHashSignature: await createClaimSignature(
          newSecretHash,
          sessionSigner,
          crossChainHTLC,
        ),
      };

      await expect(
        crossChainHTLC.connect(user1).claimSource(claimParams),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'WrongStatus');
    });

    it('should not allow when paused', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      await crossChainHTLC.connect(pauser).pause();

      const claimParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
        secret: newBackendSecret,
        secretHashSignature: await createClaimSignature(
          newSecretHash,
          sessionSigner,
          crossChainHTLC,
        ),
      };

      await expect(
        crossChainHTLC.connect(user1).claimSource(claimParams),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'EnforcedPause');
    });
  });

  // ========= 6. REFUND FUNCTIONS =========
  describe('Refund Flow: refundSource()', function () {
    let secretHash: string;
    let backendSecret: string;

    before(async function () {
      backendSecret = ethers.hexlify(ethers.randomBytes(32));
      secretHash = ethers.keccak256(ethers.solidityPacked(['bytes32'], [backendSecret]));
      const untilTs = Math.floor(Date.now() / 1000) + Number(SOURCE_LOCK_SECS);

      await usdt.connect(user1).approve(await liquidityPool.getAddress(), SWAP_AMOUNT * 20n);
    });

    it('should refund on source chain to user after expiry', async function () {
      const lockParams = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      await ethers.provider.send('evm_increaseTime', [Number(SOURCE_LOCK_SECS) + 1]);
      await ethers.provider.send('evm_mine', []);

      const refundParams = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
      };

      await expect(crossChainHTLC.connect(user1).refundSource(refundParams))
        .to.emit(crossChainHTLC, 'Refunded')
        .withArgs(secretHash);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(4);
    });

    it('should refund on destination chain to pool after expiry', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        secretHash: newSecretHash,
        amount: SWAP_AMOUNT,
        token: await usdc.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await crossChainHTLC.connect(locker).lockDestination(lockParams);

      await ethers.provider.send('evm_increaseTime', [Number(DESTINATION_LOCK_SECS) + 1]);
      await ethers.provider.send('evm_mine', []);

      const refundParams = {
        secretHash: newSecretHash,
        amount: SWAP_AMOUNT,
        token: await usdc.getAddress(),
        user: user1.address,
        chainId: 31337n,
      };

      await expect(crossChainHTLC.connect(user1).refundDestination(refundParams))
        .to.emit(crossChainHTLC, 'Refunded')
        .withArgs(newSecretHash);

      const swap = await crossChainHTLC.swaps(newSecretHash);
      expect(swap.status).to.equal(4);
    });

    it('should reject refund before expiry', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(10000),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      const refundParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
      };

      await expect(
        crossChainHTLC.connect(user1).refundSource(refundParams),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'LockNotExpired');
    });

    it('should reject refund in invalid status', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(10000),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      await ethers.provider.send('evm_increaseTime', [Number(SOURCE_LOCK_SECS) + 1]);
      await ethers.provider.send('evm_mine', []);

      const refundParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
      };

      await crossChainHTLC.connect(user1).refundSource(refundParams);

      await expect(
        crossChainHTLC.connect(user1).refundSource(refundParams),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'WrongStatus');
    });

    it('should not allow when paused', async function () {
      const newBackendSecret = ethers.hexlify(ethers.randomBytes(32));
      const newSecretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32'], [newBackendSecret]),
      );

      const lockParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: await getNextNonce(liquidityPool, user1),
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(10000),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignatureWithFee(lockParams, 0n, maintainer, crossChainHTLC);
      lockParams.maintainerSig = maintainerSig;
      await crossChainHTLC.connect(user1).lockSource(lockParams, 0n);

      await ethers.provider.send('evm_increaseTime', [Number(SOURCE_LOCK_SECS) + 1]);
      await ethers.provider.send('evm_mine', []);

      await crossChainHTLC.connect(pauser).pause();

      const refundParams = {
        base: {
          secretHash: newSecretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        sessionAddress: sessionSigner.address,
      };

      await expect(
        crossChainHTLC.connect(user1).refundSource(refundParams),
      ).to.be.revertedWithCustomError(crossChainHTLC, 'EnforcedPause');
    });
  });

  // ========= 7. PERMIT FUNCTIONS TESTS =========
  describe('Source Chain: lockSourceWithPermit()', function () {
    let secretHashBase: string;

    before(async function () {
      secretHashBase = ethers.hexlify(ethers.randomBytes(32));
    });

    it('should lock source tokens with permit for 6 decimals token (USDT)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 1]),
      );

      const poolNonce = await getNextNonce(liquidityPool, user1);

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: poolNonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const permitData = await createPermitData(
        usdt,
        user1,
        await liquidityPool.getAddress(),
        SWAP_AMOUNT,
        await toDeadline(3600),
        poolNonce,
        liquidityPool,
        sessionSigner.address,
      );

      await crossChainHTLC.connect(backend).lockSourceWithPermit(params, permitData);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
      const currentTimestamp = await ethers.provider.getBlock('latest').then((b) => b!.timestamp);
      expect(swap.lockUntil).to.be.greaterThan(currentTimestamp);
    });

    it('should lock source tokens with permit for 6 decimals token (USDC)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 2]),
      );

      const poolNonce = await getNextNonce(liquidityPool, user1);

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdc.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: poolNonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const permitData = await createPermitData(
        usdc,
        user1,
        await liquidityPool.getAddress(),
        SWAP_AMOUNT,
        await toDeadline(3600),
        poolNonce,
        liquidityPool,
        sessionSigner.address,
      );

      await crossChainHTLC.connect(backend).lockSourceWithPermit(params, permitData);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
    });

    it('should lock source tokens with permit for 18 decimals token (FDUSD)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 3]),
      );
      const amount18 = ethers.parseUnits('1000', 18);

      const poolNonce = await getNextNonce(liquidityPool, user1);

      const params = {
        base: {
          secretHash,
          amount: amount18,
          token: await fdusd.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: poolNonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const permitData = await createPermitData(
        fdusd,
        user1,
        await liquidityPool.getAddress(),
        amount18,
        await toDeadline(3600),
        poolNonce,
        liquidityPool,
        sessionSigner.address,
      );

      await crossChainHTLC.connect(backend).lockSourceWithPermit(params, permitData);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
    });
  });

  describe('Source Chain: lockSourceWithPermit2()', function () {
    let secretHashBase: string;

    before(async function () {
      secretHashBase = ethers.hexlify(ethers.randomBytes(32));
    });

    it('should lock source tokens with permit2 for 6 decimals token (USDT)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 5]),
      );

      const poolNonce = await getNextNonce(liquidityPool, user1);

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: poolNonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const permit2Data = await createPermit2Data(
        usdt,
        user1,
        await liquidityPool.getAddress(),
        SWAP_AMOUNT,
        await toDeadline(3600),
        poolNonce,
        liquidityPool,
        sessionSigner.address,
      );

      await crossChainHTLC.connect(backend).lockSourceWithPermit2(params, permit2Data);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
    });

    it('should lock source tokens with permit2 for 6 decimals token (USDC)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 6]),
      );

      const poolNonce = await getNextNonce(liquidityPool, user1);

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdc.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: poolNonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const permit2Data = await createPermit2Data(
        usdc,
        user1,
        await liquidityPool.getAddress(),
        SWAP_AMOUNT,
        await toDeadline(3600),
        poolNonce,
        liquidityPool,
        sessionSigner.address,
      );

      await crossChainHTLC.connect(backend).lockSourceWithPermit2(params, permit2Data);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
    });

    it('should lock source tokens with permit2 for 18 decimals token (FDUSD)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 7]),
      );
      const amount18 = ethers.parseUnits('1000', 18);

      const poolNonce = await getNextNonce(liquidityPool, user1);

      const params = {
        base: {
          secretHash,
          amount: amount18,
          token: await fdusd.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce: poolNonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const permit2Data = await createPermit2Data(
        fdusd,
        user1,
        await liquidityPool.getAddress(),
        amount18,
        await toDeadline(3600),
        poolNonce,
        liquidityPool,
        sessionSigner.address,
      );

      await crossChainHTLC.connect(backend).lockSourceWithPermit2(params, permit2Data);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
    });
  });

  describe('Source Chain: lockSourceWithSignature()', function () {
    let secretHashBase: string;

    before(async function () {
      secretHashBase = ethers.hexlify(ethers.randomBytes(32));
    });

    it('should lock source tokens with user signature for 6 decimals token (USDT)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 11]),
      );

      const nonce = await getNextNonce(liquidityPool, user1);
      const fee = ethers.parseUnits('1', 6);
      const totalAmount = SWAP_AMOUNT + fee;

      await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const userSignature = await createLockSourceUserSignature(
        params.base,
        user1,
        fee,
        liquidityPool,
        nonce,
        sessionSigner.address,
      );

      const signatureData = { user: user1.address, fee, userSignature };

      await crossChainHTLC.connect(backend).lockSourceWithSignature(params, signatureData);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
      const currentTimestamp = await ethers.provider.getBlock('latest').then((b) => b!.timestamp);
      expect(swap.lockUntil).to.be.greaterThan(currentTimestamp);
    });

    it('should lock source tokens with user signature for 18 decimals token (FDUSD)', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 12]),
      );
      const amount18 = ethers.parseUnits('1000', 18);
      const nonce = await getNextNonce(liquidityPool, user1);
      const fee = ethers.parseUnits('1', 18);
      const totalAmount = amount18 + fee;

      await fdusd.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

      const params = {
        base: {
          secretHash,
          amount: amount18,
          token: await fdusd.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const userSignature = await createLockSourceUserSignature(
        params.base,
        user1,
        fee,
        liquidityPool,
        nonce,
        sessionSigner.address,
      );

      const signatureData = { user: user1.address, fee, userSignature };

      await crossChainHTLC.connect(backend).lockSourceWithSignature(params, signatureData);

      const swap = await crossChainHTLC.swaps(secretHash);
      expect(swap.status).to.equal(1);
      const currentTimestamp = await ethers.provider.getBlock('latest').then((b) => b!.timestamp);
      expect(swap.lockUntil).to.be.greaterThan(currentTimestamp);
    });

    it('should not allow non-CROSS_CHAIN_MANAGER_ROLE to call lockSourceWithSignature', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 13]),
      );

      const nonce = await getNextNonce(liquidityPool, user1);
      const fee = ethers.parseUnits('1', 6);
      const totalAmount = SWAP_AMOUNT + fee;
      await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      const userSignature = await createLockSourceUserSignature(
        params.base,
        user1,
        fee,
        liquidityPool,
        nonce,
        sessionSigner.address,
      );

      const signatureData = { user: user1.address, fee, userSignature };

      await expect(crossChainHTLC.connect(user1).lockSourceWithSignature(params, signatureData))
        .to.be.revertedWithCustomError(crossChainHTLC, 'AccessControlUnauthorizedAccount')
        .withArgs(user1.address, CROSS_CHAIN_MANAGER_ROLE);
    });

    it('should revert if user signature is invalid', async function () {
      const secretHash = ethers.keccak256(
        ethers.solidityPacked(['bytes32', 'uint8'], [secretHashBase, 14]),
      );

      const nonce = await getNextNonce(liquidityPool, user1);
      const fee = ethers.parseUnits('1', 6);
      const totalAmount = SWAP_AMOUNT + fee;
      await usdt.connect(user1).approve(await liquidityPool.getAddress(), totalAmount);

      const params = {
        base: {
          secretHash,
          amount: SWAP_AMOUNT,
          token: await usdt.getAddress(),
          user: user1.address,
          chainId: 31337n,
        },
        nonce,
        sessionAddress: sessionSigner.address,
        maintainerDeadline: await toDeadline(3600),
        maintainerSig: '0x',
      };

      const maintainerSig = await createHtlcLockSignature(params, maintainer, crossChainHTLC);
      params.maintainerSig = maintainerSig;

      // Sign by wrong user
      const userSignature = await createLockSourceUserSignature(
        params.base,
        user2,
        fee,
        liquidityPool,
        nonce,
        sessionSigner.address,
      );

      const signatureData = { user: user1.address, fee, userSignature };

      await expect(
        crossChainHTLC.connect(backend).lockSourceWithSignature(params, signatureData),
      ).to.be.revertedWithCustomError(liquidityPool, 'InvalidSignature');
    });
  });

  // ========= 8. HELPER FUNCTIONS =========
  async function getNextNonce(
    liquidityPool: LiquidityPool,
    user: SignerWithAddress,
  ): Promise<bigint> {
    const currentNonce = await liquidityPool.lastNonce(user.address);
    return currentNonce + 1n;
  }

  async function createHtlcLockSignature(
    params: any,
    signer: SignerWithAddress,
    contract: CrossChainHTLC,
  ) {
    const domain = {
      name: 'CrossChainHTLC',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await contract.getAddress(),
    };

    const types = {
      HtlcLock: [
        { name: 'secretHash', type: 'bytes32' },
        { name: 'amount', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'user', type: 'address' },
        { name: 'sessionAddress', type: 'address' },
        { name: 'maintainerDeadline', type: 'uint64' },
        { name: 'nonce', type: 'uint256' },
      ],
    };

    const signatureParams = {
      secretHash: params.base.secretHash,
      amount: params.base.amount,
      token: params.base.token,
      user: params.base.user,
      sessionAddress: params.sessionAddress,
      maintainerDeadline: params.maintainerDeadline,
      nonce: params.nonce,
    };

    return await signer.signTypedData(domain, types, signatureParams);
  }

  async function createHtlcLockSignatureWithFee(
    params: any,
    executionFeeNative: bigint,
    signer: SignerWithAddress,
    contract: CrossChainHTLC,
  ) {
    const domain = {
      name: 'CrossChainHTLC',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await contract.getAddress(),
    };

    const types = {
      HtlcLockWithFee: [
        { name: 'secretHash', type: 'bytes32' },
        { name: 'amount', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'user', type: 'address' },
        { name: 'sessionAddress', type: 'address' },
        { name: 'maintainerDeadline', type: 'uint64' },
        { name: 'nonce', type: 'uint256' },
        { name: 'executionFeeNative', type: 'uint256' },
      ],
    };

    const signatureParams = {
      secretHash: params.base.secretHash,
      amount: params.base.amount,
      token: params.base.token,
      user: params.base.user,
      sessionAddress: params.sessionAddress,
      maintainerDeadline: params.maintainerDeadline,
      nonce: params.nonce,
      executionFeeNative: executionFeeNative,
    };

    return await signer.signTypedData(domain, types, signatureParams);
  }

  async function createClaimSignature(
    secretHash: string,
    signer: SignerWithAddress,
    contract: CrossChainHTLC,
  ) {
    const domain = {
      name: 'CrossChainHTLC',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await contract.getAddress(),
    };

    const types = {
      Claim: [{ name: 'secretHash', type: 'bytes32' }],
    };

    const value = { secretHash };
    return await signer.signTypedData(domain, types, value);
  }

  async function createPermitData(
    token: MockERC20,
    signer: SignerWithAddress,
    spender: string,
    value: bigint,
    deadline: bigint,
    poolNonce: bigint,
    pool: LiquidityPool,
    sessionAddress: string,
  ) {
    const name = await token.name();
    const version = '1';
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const verifyingContract = await token.getAddress();
    const nonce = await token.nonces(signer.address);

    const domain = {
      name,
      version,
      chainId: Number(chainId),
      verifyingContract,
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

    const message = {
      owner: signer.address,
      spender: spender,
      value: value,
      nonce: nonce,
      deadline: deadline,
    };

    const signature = await signer.signTypedData(domain, types, message);
    const { r, s, v } = ethers.Signature.from(signature);

    // Create user signature for LockSourceWithPermit
    const poolDomain = {
      name: 'LiquidityPool',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await pool.getAddress(),
    };

    const userSigTypes = {
      LockSourceWithPermit: [
        { name: 'nonce', type: 'uint256' },
        { name: 'fee', type: 'uint256' },
        { name: 'sessionAddress', type: 'address' },
      ],
    };

    const userSigMessage = {
      nonce: poolNonce,
      fee: 0n,
      sessionAddress,
    };

    const userSignature = await signer.signTypedData(poolDomain, userSigTypes, userSigMessage);

    return {
      deadline: deadline,
      v: v,
      r: r,
      s: s,
      fee: 0n,
      userSignature,
    };
  }

  async function createPermit2Data(
    token: MockERC20,
    signer: SignerWithAddress,
    spender: string,
    amount: bigint,
    sigDeadline: bigint,
    poolNonce: bigint,
    pool: LiquidityPool,
    sessionAddress: string,
  ) {
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const tokenAddr = await token.getAddress();
    const permit2Addr = await permit2.getAddress();

    await token.connect(signer).approve(permit2Addr, amount);

    const current = await permit2.allowance(signer.address, tokenAddr, spender);
    const currentBlock = await ethers.provider.getBlock('latest');
    const expiration = BigInt(currentBlock!.timestamp + 7200);

    const domain = {
      name: 'Permit2',
      version: '1',
      chainId,
      verifyingContract: permit2Addr,
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

    const permitData = {
      details: {
        token: tokenAddr,
        amount: amount,
        expiration: expiration,
        nonce: BigInt(current.nonce),
      },
      spender: spender,
      sigDeadline: sigDeadline,
    };

    const signature = await signer.signTypedData(domain, types, permitData);

    const encodedPermitData = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'tuple(address token, uint160 amount, uint48 expiration, uint48 nonce)',
        'address',
        'uint256',
      ],
      [
        [
          permitData.details.token,
          permitData.details.amount,
          permitData.details.expiration,
          permitData.details.nonce,
        ],
        permitData.spender,
        permitData.sigDeadline,
      ],
    );

    // Create user signature for LockSourceWithPermit2
    const poolDomain = {
      name: 'LiquidityPool',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await pool.getAddress(),
    };

    const userSigTypes = {
      LockSourceWithPermit2: [
        { name: 'nonce', type: 'uint256' },
        { name: 'fee', type: 'uint256' },
        { name: 'sessionAddress', type: 'address' },
      ],
    };

    const userSigMessage = {
      nonce: poolNonce,
      fee: 0n,
      sessionAddress,
    };

    const userSignature = await signer.signTypedData(poolDomain, userSigTypes, userSigMessage);

    return {
      permit2Data: encodedPermitData,
      permit2Signature: signature,
      fee: 0n,
      userSignature,
    };
  }

  async function createLockSourceUserSignature(
    base: { secretHash: string; amount: bigint; token: string; user: string; chainId: bigint },
    signer: SignerWithAddress,
    fee: bigint,
    pool: LiquidityPool,
    nonce: bigint,
    sessionAddress: string,
  ) {
    const domain = {
      name: 'LiquidityPool',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await pool.getAddress(),
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
      user: signer.address,
      nonce,
      fee,
      sessionAddress,
    };

    return await signer.signTypedData(domain, types, value);
  }
});
