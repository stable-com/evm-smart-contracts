import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';

enum SwapStatus {
  None = 0,
  SourceLocked = 1,
  DestinationLocked = 2,
  Claimed = 3,
  Refunded = 4,
}

async function nowPlus(seconds: number): Promise<bigint> {
  const block = await ethers.provider.getBlock('latest');
  return BigInt(block!.timestamp + seconds);
}

async function increaseTime(seconds: number): Promise<void> {
  await ethers.provider.send('evm_increaseTime', [seconds]);
  await ethers.provider.send('evm_mine', []);
}

function addressToBytes32(address: string): string {
  return ethers.zeroPadValue(address, 32);
}

async function createSwapSignatureE2E(
  params: any,
  signer: any,
  liquidityPool: any,
  user: any,
  nonce: bigint,
) {
  const domain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
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
    user: user.address,
    nonce: nonce,
    executionFeeNative: 0,
  };

  return await signer.signTypedData(domain, types, enhancedParams);
}

async function createSwapSignatureE2EWithoutFee(
  params: any,
  signer: any,
  liquidityPool: any,
  user: any,
  nonce: bigint,
) {
  const domain = {
    name: 'LiquidityPool',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
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
    user: user.address,
    nonce: nonce,
  };

  return await signer.signTypedData(domain, types, enhancedParams);
}

async function getNextNonce(liquidityPool: any, user: any): Promise<bigint> {
  const currentNonce = await liquidityPool.lastNonce(user.address);
  return currentNonce + 1n;
}

function createLiquidityPoolDomain(poolAddress: string, chainId: number) {
  return {
    name: 'LiquidityPool',
    version: '1',
    chainId,
    verifyingContract: poolAddress,
  } as const;
}

function createCrossChainHTLCDomain(htlcAddress: string, chainId: number) {
  return {
    name: 'CrossChainHTLC',
    version: '1',
    chainId,
    verifyingContract: htlcAddress,
  } as const;
}

const LIQUIDITY_POOL_TYPES = {
  SwapLocal: [
    { name: 'amountIn', type: 'uint256' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'deadline', type: 'uint64' },
    { name: 'user', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

const HTLC_LOCK_TYPES = {
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
} as const;

const HTLC_LOCK_TYPES_WITHOUT_FEE = {
  HtlcLock: [
    { name: 'secretHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'user', type: 'address' },
    { name: 'sessionAddress', type: 'address' },
    { name: 'maintainerDeadline', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

const CLAIM_TYPES = {
  Claim: [{ name: 'secretHash', type: 'bytes32' }],
};

async function createHtlcLockSource(
  secretHash: string,
  amount: bigint,
  token: string,
  user: string,
  chainId: number,
  sessionAddress: string,
  maintainerDeadline: bigint,
  nonce: bigint,
) {
  return {
    base: {
      secretHash,
      amount,
      token,
      user,
      chainId: BigInt(chainId),
    },
    nonce,
    sessionAddress,
    maintainerDeadline,
    maintainerSig: '0x',
  } as const;
}

async function createHtlcLockDestinationParams(
  secretHash: string,
  amount: bigint,
  token: string,
  user: string,
  chainId: number,
) {
  return {
    base: {
      secretHash,
      amount,
      token,
      user,
      chainId: BigInt(chainId),
    },
  } as const;
}

async function createClaimSourceParams(
  secretHash: string,
  secret: Uint8Array,
  sessionAddress: string,
  user: string,
  token: string,
  amount: bigint,
  chainId: number,
) {
  return {
    base: {
      secretHash,
      amount,
      token,
      user,
      chainId: BigInt(chainId),
    },
    sessionAddress,
    secret: ethers.hexlify(secret),
    secretHashSignature: '0x',
  } as const;
}

async function createClaimDestinationParams(
  secretHash: string,
  secret: Uint8Array,
  user: string,
  token: string,
  amount: bigint,
  chainId: number,
) {
  return {
    base: {
      secretHash,
      amount,
      token,
      user,
      chainId: BigInt(chainId),
    },
    secret: ethers.hexlify(secret),
  } as const;
}

async function createRefundSourceParams(
  secretHash: string,
  user: string,
  token: string,
  amount: bigint,
  chainId: number,
  sessionAddress: string,
) {
  return {
    base: {
      secretHash,
      amount,
      token,
      user,
      chainId: BigInt(chainId),
    },
    sessionAddress,
  } as const;
}

async function createRefundDestinationParams(
  secretHash: string,
  user: string,
  token: string,
  amount: bigint,
  chainId: number,
) {
  return {
    base: {
      secretHash,
      amount,
      token,
      user,
      chainId: BigInt(chainId),
    },
  } as const;
}

describe('E2E: LiquidityPool & CrossChainHTLC (MVP)', () => {
  const USDC_DECIMALS = 6;
  const USDT_DECIMALS = 6;
  const FDUSD_DECIMALS = 18;

  const SWAP_TIMEOUT = 600;
  const PROTECTION_WINDOW = 1200;
  const TIMEOUT_PLUS_ONE = 601;

  const INITIAL_USDT_SUPPLY = ethers.parseUnits('1000000', USDT_DECIMALS);
  const INITIAL_USDC_SUPPLY = ethers.parseUnits('1000000', USDC_DECIMALS);
  const INITIAL_FDUSD_SUPPLY = ethers.parseUnits('1000000', FDUSD_DECIMALS);
  const ADMIN_USDT_AMOUNT = ethers.parseUnits('500000', USDT_DECIMALS);
  const ADMIN_FDUSD_AMOUNT = ethers.parseUnits('500000', FDUSD_DECIMALS);
  const USER_USDC_AMOUNT = ethers.parseUnits('10000', USDC_DECIMALS);
  const USER_FDUSD_AMOUNT = ethers.parseUnits('10000', FDUSD_DECIMALS);
  const POOL_DEPOSIT_AMOUNT = ethers.parseUnits('100000', USDT_DECIMALS);
  const LARGE_DEPOSIT_USDC = ethers.parseUnits('50000', USDC_DECIMALS);
  const LARGE_DEPOSIT_USDT = ethers.parseUnits('50000', USDT_DECIMALS);
  const LARGE_DEPOSIT_FDUSD = ethers.parseUnits('50000', FDUSD_DECIMALS);
  const SWAP_AMOUNT_1000 = ethers.parseUnits('1000', USDC_DECIMALS);
  const SWAP_AMOUNT_500 = ethers.parseUnits('500', USDC_DECIMALS);
  const SWAP_AMOUNT_1000_FDUSD = ethers.parseUnits('1000', FDUSD_DECIMALS);
  const SWAP_AMOUNT_500_FDUSD = ethers.parseUnits('500', FDUSD_DECIMALS);

  const CHAIN_ID_OFFSET = 1;
  const VERSION = '1';

  const INITIAL_DEPLOYMENT_VALUE = 0;

  let owner: any;
  let admin: any;
  let maintainer: any;
  let user: any;
  let recipient: any;
  let locker: any;
  let manager: any;

  let usdcImpl: any;
  let usdcProxy: any;
  let usdc: any;
  let usdt: any;
  let fdusd: any;
  let permit2: any;
  let sourcePool: any;
  let sourceHTLC: any;

  let destPool: any;
  let destHTLC: any;

  before(async () => {
    [owner, admin, maintainer, user, recipient, locker, manager] = await ethers.getSigners();

    const TetherToken = await ethers.getContractFactory('TetherToken');
    usdt = await TetherToken.deploy(INITIAL_DEPLOYMENT_VALUE, 'Tether USD', 'USDT', USDT_DECIMALS);
    await usdt.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USD Coin', 'USDC', USDC_DECIMALS, INITIAL_USDC_SUPPLY);
    await usdc.waitForDeployment();

    fdusd = await MockERC20.deploy(
      'First Digital USD',
      'FDUSD',
      FDUSD_DECIMALS,
      INITIAL_FDUSD_SUPPLY,
    );
    await fdusd.waitForDeployment();

    const Permit2 = await ethers.getContractFactory('Permit2');
    permit2 = await Permit2.deploy();
    await permit2.waitForDeployment();

    await usdc.transfer(user.address, USER_USDC_AMOUNT);
    await fdusd.transfer(user.address, USER_FDUSD_AMOUNT);
    await fdusd.transfer(admin.address, ADMIN_FDUSD_AMOUNT);
    await usdt.issue(INITIAL_USDT_SUPPLY);
    await usdt.transfer(admin.address, ADMIN_USDT_AMOUNT);
  });

  describe('Local swap 1:1', () => {
    let pool: any;

    before(async () => {
      const LiquidityPool = await ethers.getContractFactory('LiquidityPool');
      pool = await upgrades.deployProxy(
        LiquidityPool,
        [admin.address, manager.address, maintainer.address, await permit2.getAddress()],
        { kind: 'uups', initializer: 'initialize' },
      );
      await pool.waitForDeployment();

      const depositAmount = POOL_DEPOSIT_AMOUNT;
      const thresholdX = depositAmount / 10n;
      const thresholdY = depositAmount / 2n;
      const thresholdZ = depositAmount / 20n;
      const feeAmount = 10000; // 1% fee rate (10000 / 1000000 = 1%)
      const feeAmountFDUSD = 10000; // 1% fee rate

      await pool
        .connect(manager)
        .setupToken(await usdc.getAddress(), true, thresholdX, thresholdY, thresholdZ, feeAmount);
      await pool
        .connect(manager)
        .setupToken(await usdt.getAddress(), true, thresholdX, thresholdY, thresholdZ, feeAmount);
      await pool
        .connect(manager)
        .setupToken(
          await fdusd.getAddress(),
          true,
          thresholdX,
          thresholdY,
          thresholdZ,
          feeAmountFDUSD,
        );

      await usdt.connect(admin).approve(await pool.getAddress(), depositAmount);
      await pool.connect(admin).depositLiquidity(await usdt.getAddress(), depositAmount);

      await pool.connect(manager).setFeeEnabledForToken(await usdc.getAddress(), true);
      await pool.connect(manager).setFeeEnabledForToken(await usdt.getAddress(), true);
      await pool.connect(manager).setFeeEnabledForToken(await fdusd.getAddress(), true);

      await pool.connect(admin).grantRole(ethers.id('CROSS_CHAIN_MANAGER_ROLE'), locker.address);
    });

    it('executes 1:1 swap USDC->USDT with maintainer signature', async () => {
      const amountIn = SWAP_AMOUNT_1000;
      const deadline = await nowPlus(SWAP_TIMEOUT);
      const protocolFeeRate = 10000; // 1% fee rate (10000 / 1000000 = 1%)
      const protocolFee = (amountIn * BigInt(protocolFeeRate)) / BigInt(1000000);

      await usdc.connect(user).approve(await pool.getAddress(), amountIn);

      const beforeUserUSDC = await usdc.balanceOf(user.address);
      const beforeRecipientUSDT = await usdt.balanceOf(recipient.address);

      const swapParams = {
        amountIn,
        tokenIn: await usdc.getAddress(),
        tokenOut: await usdt.getAddress(),
        chainId: (await ethers.provider.getNetwork()).chainId,
        recipient: recipient.address,
        deadline,
        nonce: 1n,
      };

      const maintainerSig = await createSwapSignatureE2E(swapParams, maintainer, pool, user, 1n);
      await pool.connect(user).singleChainSwap(swapParams, maintainerSig, 0);

      const afterUserUSDC = await usdc.balanceOf(user.address);
      const afterRecipientUSDT = await usdt.balanceOf(recipient.address);

      expect(beforeUserUSDC - afterUserUSDC).to.equal(amountIn);
      expect(afterRecipientUSDT - beforeRecipientUSDT).to.equal(amountIn - protocolFee);
    });

    it('executes 1:1 swap USDC->USDT with ERC20 permit', async () => {
      const amountIn = SWAP_AMOUNT_500;
      const fee = ethers.parseUnits('5', USDC_DECIMALS);
      const protocolFeeRate = 10000; // 1% fee rate (10000 / 1000000 = 1%)
      const protocolFee = (amountIn * BigInt(protocolFeeRate)) / BigInt(1000000);
      const totalAmount = amountIn + fee;
      const deadline = await nowPlus(SWAP_TIMEOUT);
      const permitDeadline = await nowPlus(300);

      await usdc.connect(owner).transfer(user.address, totalAmount);

      const beforeUserUSDC = await usdc.balanceOf(user.address);
      const beforeRecipientUSDT = await usdt.balanceOf(recipient.address);

      const swapParams = {
        amountIn,
        tokenIn: await usdc.getAddress(),
        tokenOut: await usdt.getAddress(),
        chainId: (await ethers.provider.getNetwork()).chainId,
        recipient: recipient.address,
        deadline,
        nonce: 2n,
      };

      const permitDomain = {
        name: 'USD Coin',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await usdc.getAddress(),
      };

      const permitTypes = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };

      const nonce = await usdc.nonces(user.address);
      const permitData = {
        owner: user.address,
        spender: await pool.getAddress(),
        value: totalAmount,
        nonce: nonce,
        deadline: permitDeadline,
      };

      const permitSig = await user.signTypedData(permitDomain, permitTypes, permitData);
      const { v, r, s } = ethers.Signature.from(permitSig);

      // Create user signature for SwapWithPermit
      const poolDomain = {
        name: 'LiquidityPool',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pool.getAddress(),
      };

      const userSigTypes = {
        SwapWithPermit: [
          { name: 'nonce', type: 'uint256' },
          { name: 'fee', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      };

      const userSigMessage = {
        nonce: 2n,
        fee,
        recipient: recipient.address,
      };

      const userSignature = await user.signTypedData(poolDomain, userSigTypes, userSigMessage);

      const maintainerSig = await createSwapSignatureE2EWithoutFee(swapParams, maintainer, pool, user, 2n);

      const swapWithPermitParams = {
        base: swapParams,
        user: user.address,
        permit: {
          deadline: permitDeadline,
          v,
          r,
          s,
          fee,
          userSignature,
        },
      };

      await pool.connect(locker).singleChainSwapWithPermit(swapWithPermitParams, maintainerSig);

      const afterUserUSDC = await usdc.balanceOf(user.address);
      const afterRecipientUSDT = await usdt.balanceOf(recipient.address);

      expect(beforeUserUSDC - afterUserUSDC).to.equal(totalAmount);
      expect(afterRecipientUSDT - beforeRecipientUSDT).to.equal(amountIn - protocolFee);
    });

    it('executes 1:1 swap USDC->USDT with Permit2', async () => {
      const amountIn = SWAP_AMOUNT_500;
      const fee = ethers.parseUnits('5', USDC_DECIMALS);
      const totalAmount = amountIn + fee;
      const deadline = await nowPlus(SWAP_TIMEOUT);

      await usdc.connect(owner).transfer(user.address, totalAmount);
      await usdc.connect(user).approve(await permit2.getAddress(), totalAmount);

      const beforeUserUSDC = await usdc.balanceOf(user.address);
      const beforeRecipientUSDT = await usdt.balanceOf(recipient.address);

      const swapParams = {
        amountIn,
        tokenIn: await usdc.getAddress(),
        tokenOut: await usdt.getAddress(),
        chainId: (await ethers.provider.getNetwork()).chainId,
        recipient: recipient.address,
        deadline,
        nonce: 3n,
      };

      const permit2Domain = {
        name: 'Permit2',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await permit2.getAddress(),
      };

      const permit2Types = {
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
      };

      const permit2Nonce = await permit2.nonceBitmap(user.address, 0);
      const permit2Expiration = Math.floor(Date.now() / 1000) + 3600;

      const permit2Data = {
        details: {
          token: await usdc.getAddress(),
          amount: totalAmount,
          expiration: permit2Expiration,
          nonce: permit2Nonce,
        },
        spender: await pool.getAddress(),
        sigDeadline: deadline,
      };

      const permit2Sig = await user.signTypedData(permit2Domain, permit2Types, permit2Data);

      // Create user signature for SwapWithPermit2
      const poolDomain = {
        name: 'LiquidityPool',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pool.getAddress(),
      };

      const userSigTypes = {
        SwapWithPermit2: [
          { name: 'nonce', type: 'uint256' },
          { name: 'fee', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      };

      const userSigMessage = {
        nonce: 3n,
        fee,
        recipient: recipient.address,
      };

      const userSignature = await user.signTypedData(poolDomain, userSigTypes, userSigMessage);

      const maintainerSig = await createSwapSignatureE2EWithoutFee(swapParams, maintainer, pool, user, 3n);

      const swapWithPermit2Params = {
        base: swapParams,
        user: user.address,
        permit2: {
          permit2Data: ethers.AbiCoder.defaultAbiCoder().encode(
            [
              'tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)',
            ],
            [permit2Data],
          ),
          permit2Signature: permit2Sig,
          fee,
          userSignature,
        },
      };

      await pool.connect(locker).singleChainSwapWithPermit2(swapWithPermit2Params, maintainerSig);

      const afterUserUSDC = await usdc.balanceOf(user.address);
      const afterRecipientUSDT = await usdt.balanceOf(recipient.address);

      const protocolFeeRate = 10000; // 1% fee rate (10000 / 1000000 = 1%)
      const protocolFee = (amountIn * BigInt(protocolFeeRate)) / BigInt(1000000);
      expect(beforeUserUSDC - afterUserUSDC).to.equal(totalAmount);
      expect(afterRecipientUSDT - beforeRecipientUSDT).to.equal(amountIn - protocolFee);
    });

    it('executes cross-decimal swap USDC->FDUSD (6->18 decimals)', async () => {
      const amountIn = SWAP_AMOUNT_1000; // 1000 USDC (6 decimals)
      const expectedAmountOut = amountIn * 10n ** 12n; // Convert to 18 decimals
      const protocolFeeRate = 10000; // 1% fee rate (10000 / 1000000 = 1%)
      const protocolFee = (expectedAmountOut * BigInt(protocolFeeRate)) / BigInt(1000000); // Fee in FDUSD
      const deadline = await nowPlus(SWAP_TIMEOUT);

      // Ensure sufficient FDUSD liquidity in pool
      const additionalFDUSD = ethers.parseUnits('10000', FDUSD_DECIMALS);
      await fdusd.connect(admin).approve(await pool.getAddress(), additionalFDUSD);
      await pool.connect(admin).depositLiquidity(await fdusd.getAddress(), additionalFDUSD);

      await usdc.connect(user).approve(await pool.getAddress(), amountIn);

      const beforeUserUSDC = await usdc.balanceOf(user.address);
      const beforeRecipientFDUSD = await fdusd.balanceOf(recipient.address);

      const swapParams = {
        amountIn,
        tokenIn: await usdc.getAddress(),
        tokenOut: await fdusd.getAddress(),
        chainId: (await ethers.provider.getNetwork()).chainId,
        recipient: recipient.address,
        deadline,
        nonce: 4n,
      };

      const maintainerSig = await createSwapSignatureE2E(swapParams, maintainer, pool, user, 4n);
      await pool.connect(user).singleChainSwap(swapParams, maintainerSig, 0);

      const afterUserUSDC = await usdc.balanceOf(user.address);
      const afterRecipientFDUSD = await fdusd.balanceOf(recipient.address);

      expect(beforeUserUSDC - afterUserUSDC).to.equal(amountIn);
      // The actual received amount after protocol fee
      const actualReceivedAmount = afterRecipientFDUSD - beforeRecipientFDUSD;
      expect(actualReceivedAmount).to.equal(expectedAmountOut - protocolFee);
    });

    it('executes reverse cross-decimal swap FDUSD->USDC (18->6 decimals)', async () => {
      const amountIn = SWAP_AMOUNT_1000_FDUSD; // 1000 FDUSD (18 decimals)
      const expectedAmountOut = amountIn / 10n ** 12n; // Convert to 6 decimals
      const protocolFeeRate = 10000; // 1% fee rate (10000 / 1000000 = 1%)
      const protocolFee = (expectedAmountOut * BigInt(protocolFeeRate)) / BigInt(1000000); // Fee in USDC
      const deadline = await nowPlus(SWAP_TIMEOUT);

      // Ensure sufficient USDC liquidity in pool
      const additionalUSDC = ethers.parseUnits('10000', USDC_DECIMALS);
      await usdc.connect(owner).transfer(admin.address, additionalUSDC);
      await usdc.connect(admin).approve(await pool.getAddress(), additionalUSDC);
      await pool.connect(admin).depositLiquidity(await usdc.getAddress(), additionalUSDC);

      await fdusd.connect(user).approve(await pool.getAddress(), amountIn);

      const beforeUserFDUSD = await fdusd.balanceOf(user.address);
      const beforeRecipientUSDC = await usdc.balanceOf(recipient.address);

      const swapParams = {
        amountIn,
        tokenIn: await fdusd.getAddress(),
        tokenOut: await usdc.getAddress(),
        chainId: (await ethers.provider.getNetwork()).chainId,
        recipient: recipient.address,
        deadline,
        nonce: 5n,
      };

      const maintainerSig = await createSwapSignatureE2E(swapParams, maintainer, pool, user, 5n);
      await pool.connect(user).singleChainSwap(swapParams, maintainerSig, 0);

      const afterUserFDUSD = await fdusd.balanceOf(user.address);
      const afterRecipientUSDC = await usdc.balanceOf(recipient.address);

      expect(beforeUserFDUSD - afterUserFDUSD).to.equal(amountIn);
      expect(afterRecipientUSDC - beforeRecipientUSDC).to.equal(expectedAmountOut - protocolFee);
    });

    it('executes large amount swap USDC->USDT', async () => {
      const largeAmount = ethers.parseUnits('5000', USDC_DECIMALS);
      const protocolFeeRate = 10000; // 1% fee rate (10000 / 1000000 = 1%)
      const protocolFee = (largeAmount * BigInt(protocolFeeRate)) / BigInt(1000000);
      const deadline = await nowPlus(SWAP_TIMEOUT);

      await usdc.connect(owner).transfer(user.address, largeAmount);
      await usdc.connect(user).approve(await pool.getAddress(), largeAmount);

      const beforeUserUSDC = await usdc.balanceOf(user.address);
      const beforeRecipientUSDT = await usdt.balanceOf(recipient.address);

      const swapParams = {
        amountIn: largeAmount,
        tokenIn: await usdc.getAddress(),
        tokenOut: await usdt.getAddress(),
        chainId: (await ethers.provider.getNetwork()).chainId,
        recipient: recipient.address,
        deadline,
        nonce: 6n,
      };

      const maintainerSig = await createSwapSignatureE2E(swapParams, maintainer, pool, user, 6n);
      await pool.connect(user).singleChainSwap(swapParams, maintainerSig, 0);

      const afterUserUSDC = await usdc.balanceOf(user.address);
      const afterRecipientUSDT = await usdt.balanceOf(recipient.address);

      expect(beforeUserUSDC - afterUserUSDC).to.equal(largeAmount);
      expect(afterRecipientUSDT - beforeRecipientUSDT).to.equal(largeAmount - protocolFee);
    });
  });

  describe('Cross-chain HTLC', () => {
    before(async () => {
      const LiquidityPool = await ethers.getContractFactory('LiquidityPool');
      const CrossChainHTLC = await ethers.getContractFactory('CrossChainHTLC');

      sourcePool = await upgrades.deployProxy(
        LiquidityPool,
        [admin.address, manager.address, maintainer.address, await permit2.getAddress()],
        { kind: 'uups', initializer: 'initialize' },
      );
      await sourcePool.waitForDeployment();

      await sourcePool
        .connect(manager)
        .setupToken(
          await usdc.getAddress(),
          true,
          ethers.parseUnits('1000', USDC_DECIMALS),
          ethers.parseUnits('10000', USDC_DECIMALS),
          ethers.parseUnits('500', USDC_DECIMALS),
          0,
        );
      await sourcePool
        .connect(manager)
        .setupToken(
          await usdt.getAddress(),
          true,
          ethers.parseUnits('1000', USDT_DECIMALS),
          ethers.parseUnits('10000', USDT_DECIMALS),
          ethers.parseUnits('500', USDT_DECIMALS),
          0,
        );
      await sourcePool
        .connect(manager)
        .setupToken(
          await fdusd.getAddress(),
          true,
          ethers.parseUnits('1000', FDUSD_DECIMALS),
          ethers.parseUnits('10000', FDUSD_DECIMALS),
          ethers.parseUnits('500', FDUSD_DECIMALS),
          0,
        );

      destPool = await upgrades.deployProxy(
        LiquidityPool,
        [admin.address, manager.address, maintainer.address, await permit2.getAddress()],
        { kind: 'uups', initializer: 'initialize' },
      );
      await destPool.waitForDeployment();

      await destPool
        .connect(manager)
        .setupToken(
          await usdc.getAddress(),
          true,
          ethers.parseUnits('1000', USDC_DECIMALS),
          ethers.parseUnits('10000', USDC_DECIMALS),
          ethers.parseUnits('500', USDC_DECIMALS),
          0,
        );
      await destPool
        .connect(manager)
        .setupToken(
          await usdt.getAddress(),
          true,
          ethers.parseUnits('1000', USDT_DECIMALS),
          ethers.parseUnits('10000', USDT_DECIMALS),
          ethers.parseUnits('500', USDT_DECIMALS),
          0,
        );
      await destPool
        .connect(manager)
        .setupToken(
          await fdusd.getAddress(),
          true,
          ethers.parseUnits('1000', FDUSD_DECIMALS),
          ethers.parseUnits('10000', FDUSD_DECIMALS),
          ethers.parseUnits('500', FDUSD_DECIMALS),
          0,
        );

      sourceHTLC = await upgrades.deployProxy(
        CrossChainHTLC,
        [
          admin.address,
          maintainer.address,
          await sourcePool.getAddress(),
          SWAP_TIMEOUT,
          PROTECTION_WINDOW,
        ],
        { kind: 'uups', initializer: 'initialize' },
      );
      await sourceHTLC.waitForDeployment();

      destHTLC = await upgrades.deployProxy(
        CrossChainHTLC,
        [
          admin.address,
          maintainer.address,
          await destPool.getAddress(),
          SWAP_TIMEOUT,
          PROTECTION_WINDOW,
        ],
        { kind: 'uups', initializer: 'initialize' },
      );
      await destHTLC.waitForDeployment();
      const ROUTING_MODULE_ROLE = await sourcePool.ROUTING_MODULE_ROLE();
      await sourcePool.connect(admin).grantRole(ROUTING_MODULE_ROLE, await sourceHTLC.getAddress());
      await destPool.connect(admin).grantRole(ROUTING_MODULE_ROLE, await destHTLC.getAddress());

      const CROSS_CHAIN_MANAGER_ROLE = ethers.id('CROSS_CHAIN_MANAGER_ROLE');
      const HTLC_MANAGER_ROLE = ethers.id('HTLC_MANAGER_ROLE');
      await destHTLC.connect(admin).grantRole(CROSS_CHAIN_MANAGER_ROLE, locker.address);
      await destHTLC.connect(admin).grantRole(HTLC_MANAGER_ROLE, manager.address);

      const depositUSDC = LARGE_DEPOSIT_USDC;
      await usdc.connect(owner).transfer(admin.address, depositUSDC);
      await usdc.connect(admin).approve(await sourcePool.getAddress(), depositUSDC);
      await sourcePool.connect(admin).depositLiquidity(await usdc.getAddress(), depositUSDC);

      const depositUSDT = LARGE_DEPOSIT_USDT;
      await usdt.connect(admin).approve(await destPool.getAddress(), depositUSDT);
      await destPool.connect(admin).depositLiquidity(await usdt.getAddress(), depositUSDT);

      const depositFDUSD = LARGE_DEPOSIT_FDUSD;
      await fdusd.connect(admin).approve(await sourcePool.getAddress(), depositFDUSD);
      await sourcePool.connect(admin).depositLiquidity(await fdusd.getAddress(), depositFDUSD);
      await fdusd.connect(admin).approve(await destPool.getAddress(), depositFDUSD);
      await destPool.connect(admin).depositLiquidity(await fdusd.getAddress(), depositFDUSD);

      const amountIn = SWAP_AMOUNT_1000;
      await usdc.connect(user).approve(await sourcePool.getAddress(), amountIn);
    });

    describe('Positive scenarios', () => {
      it('initiate source -> lock destination -> manager claims source -> user claims destination', async () => {
        const amountIn = SWAP_AMOUNT_1000;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const destDomain = createCrossChainHTLCDomain(await destHTLC.getAddress(), chainId);

        await usdc.connect(user).approve(await sourcePool.getAddress(), amountIn);

        const sourceNonce = await getNextNonce(sourcePool, user);
        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await usdc.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        const destNonce = await getNextNonce(destPool, user);
        const destParams = await createHtlcLockDestinationParams(
          secretHash,
          amountIn,
          await usdt.getAddress(),
          user.address,
          chainId,
        );

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const beforeUserUSDC = await usdc.balanceOf(user.address);
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);
        const afterUserUSDC = await usdc.balanceOf(user.address);
        expect(beforeUserUSDC - afterUserUSDC).to.equal(amountIn);

        await destHTLC.connect(locker).lockDestination(destParams.base);

        const claimData = { secretHash };
        const sessionSig = await sessionWallet.signTypedData(sourceDomain, CLAIM_TYPES, claimData);
        const destSessionSig = await sessionWallet.signTypedData(
          destDomain,
          CLAIM_TYPES,
          claimData,
        );

        const sourceClaimParams = await createClaimSourceParams(
          secretHash,
          backendSecret,
          await sessionWallet.getAddress(),
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
        );
        const sourceClaimParamsWithSig = {
          ...sourceClaimParams,
          secretHashSignature: sessionSig,
        };
        await sourceHTLC.connect(manager).claimSource(sourceClaimParamsWithSig);

        const destClaimParams = await createClaimDestinationParams(
          secretHash,
          backendSecret,
          user.address,
          await usdt.getAddress(),
          amountIn,
          chainId,
        );
        await destHTLC.connect(user).claimDestination(destClaimParams);

        const userUSDT = await usdt.balanceOf(user.address);
        expect(userUSDT).to.be.gte(amountIn);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        const destSwap = await destHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Claimed);
        expect(destSwap.status).to.equal(SwapStatus.Claimed);
      });

      it('Cross-chain FDUSD->USDT: initiate source -> lock destination -> manager claims source -> user claims destination', async () => {
        const amountIn = SWAP_AMOUNT_1000_FDUSD;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const destDomain = createCrossChainHTLCDomain(await destHTLC.getAddress(), chainId);

        await fdusd.connect(user).approve(await sourcePool.getAddress(), amountIn);

        const sourceNonce = await getNextNonce(sourcePool, user);
        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await fdusd.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        const destNonce = await getNextNonce(destPool, user);
        const expectedUSDTAmount = amountIn / 10n ** 12n;
        const destParams = await createHtlcLockDestinationParams(
          secretHash,
          expectedUSDTAmount,
          await usdt.getAddress(),
          user.address,
          chainId,
        );

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const beforeUserFDUSD = await fdusd.balanceOf(user.address);
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);
        const afterUserFDUSD = await fdusd.balanceOf(user.address);
        expect(beforeUserFDUSD - afterUserFDUSD).to.equal(amountIn);

        await destHTLC.connect(locker).lockDestination(destParams.base);

        const claimData = { secretHash };
        const sessionSig = await sessionWallet.signTypedData(sourceDomain, CLAIM_TYPES, claimData);
        const destSessionSig = await sessionWallet.signTypedData(
          destDomain,
          CLAIM_TYPES,
          claimData,
        );

        const sourceClaimParams = await createClaimSourceParams(
          secretHash,
          backendSecret,
          await sessionWallet.getAddress(),
          user.address,
          await fdusd.getAddress(),
          amountIn,
          chainId,
        );
        const sourceClaimParamsWithSig = {
          ...sourceClaimParams,
          secretHashSignature: sessionSig,
        };
        await sourceHTLC.connect(manager).claimSource(sourceClaimParamsWithSig);

        const beforeUserUSDT = await usdt.balanceOf(user.address);
        const destClaimParams = await createClaimDestinationParams(
          secretHash,
          backendSecret,
          user.address,
          await usdt.getAddress(),
          expectedUSDTAmount,
          chainId,
        );
        await destHTLC.connect(user).claimDestination(destClaimParams);
        const afterUserUSDT = await usdt.balanceOf(user.address);

        expect(afterUserUSDT - beforeUserUSDT).to.equal(expectedUSDTAmount);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        const destSwap = await destHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Claimed);
        expect(destSwap.status).to.equal(SwapStatus.Claimed);
      });

      it('Cross-chain USDT->FDUSD: initiate source -> lock destination -> manager claims source -> user claims destination', async () => {
        const amountInUSDT = SWAP_AMOUNT_500;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const destDomain = createCrossChainHTLCDomain(await destHTLC.getAddress(), chainId);

        await usdt.connect(admin).transfer(user.address, amountInUSDT);
        await usdt.connect(user).approve(await sourcePool.getAddress(), amountInUSDT);

        const sourceNonce = await getNextNonce(sourcePool, user);
        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountInUSDT,
          await usdt.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        const destNonce = await getNextNonce(destPool, user);
        const expectedFDUSDAmount = amountInUSDT * 10n ** 12n;
        const destParams = await createHtlcLockDestinationParams(
          secretHash,
          expectedFDUSDAmount,
          await fdusd.getAddress(),
          user.address,
          chainId,
        );

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const beforeUserUSDT = await usdt.balanceOf(user.address);
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);
        const afterUserUSDT = await usdt.balanceOf(user.address);
        expect(beforeUserUSDT - afterUserUSDT).to.equal(amountInUSDT);

        await destHTLC.connect(locker).lockDestination(destParams.base);

        const claimData = { secretHash };
        const sessionSig = await sessionWallet.signTypedData(sourceDomain, CLAIM_TYPES, claimData);
        const destSessionSig = await sessionWallet.signTypedData(
          destDomain,
          CLAIM_TYPES,
          claimData,
        );

        const sourceClaimParams = await createClaimSourceParams(
          secretHash,
          backendSecret,
          await sessionWallet.getAddress(),
          user.address,
          await usdt.getAddress(),
          amountInUSDT,
          chainId,
        );
        const sourceClaimParamsWithSig = {
          ...sourceClaimParams,
          secretHashSignature: sessionSig,
        };
        await sourceHTLC.connect(manager).claimSource(sourceClaimParamsWithSig);

        const beforeUserFDUSD = await fdusd.balanceOf(user.address);
        const destClaimParams = await createClaimDestinationParams(
          secretHash,
          backendSecret,
          user.address,
          await fdusd.getAddress(),
          expectedFDUSDAmount,
          chainId,
        );
        await destHTLC.connect(user).claimDestination(destClaimParams);
        const afterUserFDUSD = await fdusd.balanceOf(user.address);

        expect(afterUserFDUSD - beforeUserFDUSD).to.equal(expectedFDUSDAmount);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        const destSwap = await destHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Claimed);
        expect(destSwap.status).to.equal(SwapStatus.Claimed);
      });

      it('Cross-chain with Permit: USDC->USDT using lockSourceWithPermit', async () => {
        const amountIn = SWAP_AMOUNT_500;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);
        const deadline = await nowPlus(SWAP_TIMEOUT);
        const permitDeadline = await nowPlus(300);
        const fee = ethers.parseUnits('5', USDC_DECIMALS);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const destDomain = createCrossChainHTLCDomain(await destHTLC.getAddress(), chainId);

        await usdc.connect(owner).transfer(user.address, amountIn + fee);

        const sourceNonce = await getNextNonce(sourcePool, user);
        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await usdc.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        const permitDomain = {
          name: 'USD Coin',
          version: '1',
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: await usdc.getAddress(),
        };

        const permitTypes = {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        };

        const nonce = await usdc.nonces(user.address);
        const permitData = {
          owner: user.address,
          spender: await sourcePool.getAddress(),
          value: amountIn + fee,
          nonce: nonce,
          deadline: permitDeadline,
        };

        const permitSig = await user.signTypedData(permitDomain, permitTypes, permitData);
        const { v, r, s } = ethers.Signature.from(permitSig);

        // Create user signature for LockSourceWithPermit
        const poolDomain = {
          name: 'LiquidityPool',
          version: '1',
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: await sourcePool.getAddress(),
        };

        const userSigTypes = {
          LockSourceWithPermit: [
            { name: 'nonce', type: 'uint256' },
            { name: 'fee', type: 'uint256' },
            { name: 'sessionAddress', type: 'address' },
          ],
        };

        const userSigMessage = {
          nonce: sourceNonce,
          fee,
          sessionAddress: await sessionWallet.getAddress(),
        };

        const userSignature = await user.signTypedData(poolDomain, userSigTypes, userSigMessage);

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES_WITHOUT_FEE, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
        });

        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };

        const permitDataStruct = {
          deadline: permitDeadline,
          v,
          r,
          s,
          fee,
          userSignature,
        };

        const CROSS_CHAIN_MANAGER_ROLE = ethers.id('CROSS_CHAIN_MANAGER_ROLE');
        await sourceHTLC.connect(admin).grantRole(CROSS_CHAIN_MANAGER_ROLE, locker.address);

        await sourceHTLC
          .connect(locker)
          .lockSourceWithPermit(sourceParamsWithSig, permitDataStruct);

        const destParams = await createHtlcLockDestinationParams(
          secretHash,
          amountIn,
          await usdt.getAddress(),
          user.address,
          chainId,
        );

        await destHTLC.connect(locker).lockDestination(destParams.base);

        const claimData = { secretHash };
        const sessionSig = await sessionWallet.signTypedData(sourceDomain, CLAIM_TYPES, claimData);

        const sourceClaimParams = await createClaimSourceParams(
          secretHash,
          backendSecret,
          await sessionWallet.getAddress(),
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
        );
        const sourceClaimParamsWithSig = {
          ...sourceClaimParams,
          secretHashSignature: sessionSig,
        };
        await sourceHTLC.connect(manager).claimSource(sourceClaimParamsWithSig);

        const destClaimParams = await createClaimDestinationParams(
          secretHash,
          backendSecret,
          user.address,
          await usdt.getAddress(),
          amountIn,
          chainId,
        );
        await destHTLC.connect(user).claimDestination(destClaimParams);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        const destSwap = await destHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Claimed);
        expect(destSwap.status).to.equal(SwapStatus.Claimed);
      });
    });

    describe('Negative scenarios', () => {
      it('Scenario 1: User locks in source, backend misses, user gets refund - no money lost', async () => {
        const amountIn = SWAP_AMOUNT_500;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const sourceNonce = await getNextNonce(sourcePool, user);

        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await usdc.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        await usdc.connect(user).approve(await sourcePool.getAddress(), amountIn);

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const beforeUserUSDC = await usdc.balanceOf(user.address);
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);
        const afterUserUSDC = await usdc.balanceOf(user.address);
        expect(beforeUserUSDC - afterUserUSDC).to.equal(amountIn);

        await increaseTime(TIMEOUT_PLUS_ONE);
        const refundParams = await createRefundSourceParams(
          secretHash,
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
          await sessionWallet.getAddress(),
        );
        await sourceHTLC.connect(user).refundSource(refundParams);

        const finalUserUSDC = await usdc.balanceOf(user.address);
        expect(finalUserUSDC).to.equal(beforeUserUSDC);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Refunded);
      });

      it('Scenario 2: Backend locks destination and gets lost, user refunds source, manager refunds destination', async () => {
        const amountIn = SWAP_AMOUNT_500;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const destDomain = createCrossChainHTLCDomain(await destHTLC.getAddress(), chainId);

        const sourceNonce = await getNextNonce(sourcePool, user);
        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await usdc.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        const destNonce = await getNextNonce(destPool, user);
        const destParams = await createHtlcLockDestinationParams(
          secretHash,
          amountIn,
          await usdt.getAddress(),
          user.address,
          chainId,
        );

        await usdc.connect(user).approve(await sourcePool.getAddress(), amountIn);

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);

        await destHTLC.connect(locker).lockDestination(destParams.base);

        await increaseTime(TIMEOUT_PLUS_ONE);
        const beforeUserUSDC = await usdc.balanceOf(user.address);
        const sourceRefundParams = await createRefundSourceParams(
          secretHash,
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
          await sessionWallet.getAddress(),
        );
        await sourceHTLC.connect(user).refundSource(sourceRefundParams);
        const afterUserRefund = await usdc.balanceOf(user.address);
        expect(afterUserRefund).to.be.gt(beforeUserUSDC);

        await increaseTime(SWAP_TIMEOUT);
        const destRefundParams = await createRefundDestinationParams(
          secretHash,
          user.address,
          await usdt.getAddress(),
          amountIn,
          chainId,
        );
        await destHTLC.connect(manager).refundDestination(destRefundParams.base);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        const destSwap = await destHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Refunded);
        expect(destSwap.status).to.equal(SwapStatus.Refunded);
      });

      it('Scenario 2.5: Refund does not charge protocol fee even when protocol fee is enabled', async () => {
        const amountIn = SWAP_AMOUNT_500;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);
        const protocolFee = 20000; // 2% fee rate (20000 / 1000000 = 2%)

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        // Enable protocol fee for source pool
        await sourcePool
          .connect(manager)
          .setupToken(
            await usdc.getAddress(),
            true,
            ethers.parseUnits('1000', USDC_DECIMALS),
            ethers.parseUnits('10000', USDC_DECIMALS),
            ethers.parseUnits('500', USDC_DECIMALS),
            protocolFee,
          );
        await sourcePool
          .connect(manager)
          .setFeeEnabledForToken(await usdc.getAddress(), true);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const sourceNonce = await getNextNonce(sourcePool, user);

        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await usdc.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        await usdc.connect(user).approve(await sourcePool.getAddress(), amountIn);

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const beforeUserUSDC = await usdc.balanceOf(user.address);
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);
        const afterLockUSDC = await usdc.balanceOf(user.address);

        // User paid amountIn
        expect(beforeUserUSDC - afterLockUSDC).to.equal(amountIn);

        // Wait for timeout to refund
        await increaseTime(TIMEOUT_PLUS_ONE);
        const refundParams = await createRefundSourceParams(
          secretHash,
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
          await sessionWallet.getAddress(),
        );
        await sourceHTLC.connect(user).refundSource(refundParams);

        const finalUserUSDC = await usdc.balanceOf(user.address);

        // User should get full amount back (no protocol fee applied)
        // If protocol fee was applied, user would get back: amountIn - protocolFee
        // But with our fix, user gets full amount back: amountIn
        expect(finalUserUSDC).to.equal(beforeUserUSDC);

        // Verify that the difference between what user paid and received is 0
        const totalLoss = beforeUserUSDC - finalUserUSDC;
        expect(totalLoss).to.equal(0n);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Refunded);

        // Cleanup - disable protocol fee
        await sourcePool
          .connect(manager)
          .setupToken(
            await usdc.getAddress(),
            true,
            ethers.parseUnits('1000', USDC_DECIMALS),
            ethers.parseUnits('10000', USDC_DECIMALS),
            ethers.parseUnits('500', USDC_DECIMALS),
            0,
          );
        await sourcePool
          .connect(manager)
          .setFeeEnabledForToken(await usdc.getAddress(), false);
      });

      it('Scenario 3: Backend claims source, user can claim destination within protection window', async () => {
        const amountIn = SWAP_AMOUNT_500;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const destDomain = createCrossChainHTLCDomain(await destHTLC.getAddress(), chainId);

        const sourceNonce = await getNextNonce(sourcePool, user);
        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await usdc.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        const destNonce = await getNextNonce(destPool, user);
        const destParams = await createHtlcLockDestinationParams(
          secretHash,
          amountIn,
          await usdt.getAddress(),
          user.address,
          chainId,
        );

        await usdc.connect(user).approve(await sourcePool.getAddress(), amountIn);

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);

        await destHTLC.connect(locker).lockDestination(destParams.base);

        const claimData = { secretHash };
        const sessionSig = await sessionWallet.signTypedData(sourceDomain, CLAIM_TYPES, claimData);
        const destSessionSig = await sessionWallet.signTypedData(
          destDomain,
          CLAIM_TYPES,
          claimData,
        );

        const sourceClaimParams = await createClaimSourceParams(
          secretHash,
          backendSecret,
          await sessionWallet.getAddress(),
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
        );
        const sourceClaimParamsWithSig = {
          ...sourceClaimParams,
          secretHashSignature: sessionSig,
        };
        await sourceHTLC.connect(manager).claimSource(sourceClaimParamsWithSig);

        const beforeUserUSDT = await usdt.balanceOf(user.address);
        const destClaimParams = await createClaimDestinationParams(
          secretHash,
          backendSecret,
          user.address,
          await usdt.getAddress(),
          amountIn,
          chainId,
        );
        await destHTLC.connect(user).claimDestination(destClaimParams);
        const afterUserUSDT = await usdt.balanceOf(user.address);
        expect(afterUserUSDT - beforeUserUSDT).to.equal(amountIn);

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        const destSwap = await destHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.Claimed);
        expect(destSwap.status).to.equal(SwapStatus.Claimed);
      });

      it('Scenario 4: Backend cannot claim without valid session signature', async () => {
        const amountIn = SWAP_AMOUNT_500;
        const backendSecret = ethers.randomBytes(32);
        const secretHash = ethers.keccak256(backendSecret);
        const sessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);
        const wrongSessionWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        const chainId = Number((await ethers.provider.getNetwork()).chainId);
        const deadline = await nowPlus(SWAP_TIMEOUT);

        const sourceDomain = createCrossChainHTLCDomain(await sourceHTLC.getAddress(), chainId);
        const sourceNonce = await getNextNonce(sourcePool, user);

        const sourceParams = await createHtlcLockSource(
          secretHash,
          amountIn,
          await usdc.getAddress(),
          user.address,
          chainId,
          await sessionWallet.getAddress(),
          deadline,
          sourceNonce,
        );

        await usdc.connect(user).approve(await sourcePool.getAddress(), amountIn);

        const sourceMaintainerSig = await maintainer.signTypedData(sourceDomain, HTLC_LOCK_TYPES, {
          secretHash: sourceParams.base.secretHash,
          amount: sourceParams.base.amount,
          token: sourceParams.base.token,
          user: sourceParams.base.user,
          sessionAddress: sourceParams.sessionAddress,
          maintainerDeadline: sourceParams.maintainerDeadline,
          nonce: sourceParams.nonce,
          executionFeeNative: 0,
        });
        const sourceParamsWithSig = {
          ...sourceParams,
          maintainerSig: sourceMaintainerSig,
        };
        await sourceHTLC.connect(user).lockSource(sourceParamsWithSig, 0);

        const claimData = { secretHash };

        const wrongSessionSig = await wrongSessionWallet.signTypedData(
          sourceDomain,
          CLAIM_TYPES,
          claimData,
        );
        const wrongClaimParams = await createClaimSourceParams(
          secretHash,
          backendSecret,
          await wrongSessionWallet.getAddress(),
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
        );
        const wrongClaimParamsWithSig = {
          ...wrongClaimParams,
          secretHashSignature: wrongSessionSig,
        };
        await expect(
          sourceHTLC.connect(manager).claimSource(wrongClaimParamsWithSig),
        ).to.be.revertedWithCustomError(sourceHTLC, 'ParamsMismatch');

        const sourceSwap = await sourceHTLC.swaps(secretHash);
        expect(sourceSwap.status).to.equal(SwapStatus.SourceLocked);

        const correctSessionSig = await sessionWallet.signTypedData(
          sourceDomain,
          CLAIM_TYPES,
          claimData,
        );
        const correctClaimParams = await createClaimSourceParams(
          secretHash,
          backendSecret,
          await sessionWallet.getAddress(),
          user.address,
          await usdc.getAddress(),
          amountIn,
          chainId,
        );
        const correctClaimParamsWithSig = {
          ...correctClaimParams,
          secretHashSignature: correctSessionSig,
        };
        await sourceHTLC.connect(manager).claimSource(correctClaimParamsWithSig);

        const finalSwap = await sourceHTLC.swaps(secretHash);
        expect(finalSwap.status).to.equal(SwapStatus.Claimed);
      });
    });
  });
});
