import { Injectable } from '@angular/core';
import { Client as binanceClient } from '@xchainjs/xchain-binance';
import { Client as bitcoinClient } from '@xchainjs/xchain-bitcoin';
import { Client as thorchainClient } from '@xchainjs/xchain-thorchain';
import { Client as litecoinClient } from '@xchainjs/xchain-litecoin';
import { Client as bitcoinCashClient } from '@xchainjs/xchain-bitcoincash';
import { Client as ethereumClient } from '@xchainjs/xchain-ethereum/lib';
import { Client as dogeClient } from '@xchainjs/xchain-doge';
import { Client as terraClient } from '@xchainjs/xchain-terra';
import { Chain } from '@xchainjs/xchain-util';
import { environment } from 'src/environments/environment';
import { Network } from '@xchainjs/xchain-client';

/**
 * this is used for convenience methods when user is not using keystore
 */
@Injectable({
  providedIn: 'root',
})
export class MockClientService {
  MOCK_PHRASE =
    'image rally need wedding health address purse army antenna leopard sea gain';
  mockBinanceClient: binanceClient;
  mockBtcClient: bitcoinClient;
  mockThorchainClient: thorchainClient;
  mockEthereumClient: ethereumClient;
  mockLtcClient: litecoinClient;
  mockBchClient: bitcoinCashClient;
  mockDogeClient: dogeClient;
  mockTerraClient: terraClient;

  constructor() {
    const network =
      environment.network === 'testnet' ? Network.Testnet : Network.Mainnet;
    const phrase = this.MOCK_PHRASE;
    const chainIds = {[Network.Mainnet]: 'thorchain-mainnet-v1', [Network.Stagenet]: 'thorchain-stagenet-v1', [Network.Testnet]: 'thorchain-testnet-v1'}

    this.mockBinanceClient = new binanceClient({ network, phrase });
    this.mockBtcClient = new bitcoinClient({
      network,
      phrase,
    });
    this.mockThorchainClient = new thorchainClient({ network, phrase, chainIds });
    this.mockEthereumClient = new ethereumClient({
      network,
      phrase,
      etherscanApiKey: environment.etherscanKey,
      infuraCreds: { projectId: environment.infuraProjectId },
    });
    this.mockLtcClient = new litecoinClient({ network, phrase });
    this.mockBchClient = new bitcoinCashClient({ 
      network, 
      phrase,
      haskoinUrl: {
        [Network.Testnet]: 'https://api.haskoin.com/bchtest',
        [Network.Mainnet]: 'https://haskoin.ninerealms.com/bch',
        [Network.Stagenet]: 'https://haskoin.ninerealms.com/bch',
      }
    });
    this.mockDogeClient = new dogeClient({network, phrase});
    this.mockTerraClient = new terraClient({network, phrase})

    this.mockThorchainClient.getAddress = () => undefined;
    this.mockBinanceClient.getAddress = () => undefined;
    this.mockBtcClient.getAddress = () => undefined;
    this.mockBchClient.getAddress = () => undefined;
    this.mockEthereumClient.getAddress = () => undefined;
    this.mockLtcClient.getAddress = () => undefined;
    this.mockDogeClient.getAddress = () => undefined;
    this.mockTerraClient.getAddress = () => undefined;
  }

  getMockClientByChain(chain: Chain) {
    switch (chain) {
      case 'BTC':
        return this.mockBtcClient;

      case 'ETH':
        return this.mockEthereumClient;

      case 'BNB':
        return this.mockBinanceClient;

      case 'BCH':
        return this.mockBchClient;

      case 'LTC':
        return this.mockLtcClient;

      case 'THOR':
        return this.mockThorchainClient;

      case 'DOGE':
        return this.mockDogeClient;
      
      case 'TERRA':
        return this.mockTerraClient;
    }

    throw new Error(`mock client no matching client for chain: ${chain}`);
  }

  //Helper for explorer tx url
  getTxByChain(tx: string, chain: Chain): string {
    const client = this.getMockClientByChain(chain);
    return client.getExplorerTxUrl(tx);
  }
}
