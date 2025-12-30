import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@openzeppelin/hardhat-upgrades';
import dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.30',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },      
      {
        version: '0.8.20',
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
      {
        version: '0.7.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
      {
        version: '0.6.12',
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
      {
        version: '0.5.16',
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
      {
        version: '0.4.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
    ]
  },
  networks: {
    bsc_mainnet: {
      url: process.env.BSC_MAINNET_RPC as string,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY as string, process.env.ADMIN_PRIVATE_KEY as string],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC as string,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY as string, process.env.ADMIN_PRIVATE_KEY as string],
    },
    bsc_testnet: {
      url: process.env.BSC_TESTNET_RPC as string,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY as string, process.env.ADMIN_PRIVATE_KEY as string],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY as string,
  },
};

export default config;
