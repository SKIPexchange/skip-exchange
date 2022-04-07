export type WalletType =
  | 'keystore'
  | 'walletconnect'
  | 'ledger'
  | 'XDEFI'
  | 'metamask';
import { Client as BinanceClient } from '@xchainjs/xchain-binance';
import { Client as BitcoinClient } from '@xchainjs/xchain-bitcoin';
import { Client as ThorchainClient } from '@xchainjs/xchain-thorchain';
import { Client as EthereumClient } from '@xchainjs/xchain-ethereum/lib';
import { Client as LitecoinClient } from '@xchainjs/xchain-litecoin';
import { Client as BitcoinCashClient } from '@xchainjs/xchain-bitcoincash';
import { Client as DogeClient } from '@xchainjs/xchain-doge';
import { Balance } from '@xchainjs/xchain-client';

export interface AvailableClients {
  binance?: BinanceClient;
  bitcoin?: BitcoinClient;
  bitcoinCash?: BitcoinCashClient;
  thorchain?: ThorchainClient;
  ethereum?: EthereumClient;
  litecoin?: LitecoinClient;
  doge?: DogeClient;
}

export class User {
  type: WalletType;
  wallet: string; // Address
  keystore?: any;
  clients?: AvailableClients;

  // for Ledger
  ledger?: any;
  hdPath?: number[];
  balances: Balance[];

  constructor(user: {
    type: WalletType;
    wallet: string;
    keystore?: any;
    ledger?: any;
    hdPath?: number[];
    clients?: AvailableClients;
  }) {
    this.type = user.type;
    this.wallet = user.wallet;
    this.keystore = user.keystore ?? null;
    this.ledger = user.ledger ?? null;
    this.hdPath = user.hdPath ?? null;
    this.clients = user.clients;
  }
}
