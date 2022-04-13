import { CoinIconsFromTrustWallet } from 'src/app/_const/icon-list';
import { assetToString, Chain, Asset as XCAsset } from '@xchainjs/xchain-util';
import { ethers } from 'ethers';
import { ethToken } from '../_const/eth-token';
import { environment } from '../../environments/environment';

export class Asset {
  chain: Chain;
  symbol: string;
  ticker: string;
  synth: boolean;
  iconPath: string;

  constructor(poolName: string) {
    const { chain, symbol, ticker } = this._getAssetFromString(
      poolName.toUpperCase()
    );
    this.chain = chain;
    this.symbol = symbol;
    this.ticker = ticker;
    this.synth = false;

    const trustWalletMatch = CoinIconsFromTrustWallet[this.ticker];

    if (ticker == 'RUNE') {
      switch (chain) {
        case 'THOR':
          this.iconPath = '/assets/icons/logo-thor-rune.svg';
          return;

        default:
          this.iconPath = '/assets/icons/non-native-rune.svg';
          return;
      }
    }

    if (trustWalletMatch && chain !== 'THOR') {
      this.iconPath = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/assets/${trustWalletMatch}/logo.png`;
    } else {
      // Override token icons when not found in trustwallet

      switch (chain) {
        case 'BTC':
          this.iconPath =
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/assets/BTCB-1DE/logo.png';
          break;

        case 'LTC':
          this.iconPath =
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/litecoin/info/logo.png';
          break;

        case 'BNB':
          if (ticker === 'BNB') {
            this.iconPath =
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png';
          }
          break;

        case 'ETH':
          if (this.symbol !== 'ETH') {
            // for ETH tokens
            this.iconPath = this._setEthIconPath(symbol, ticker);

            // getter of icons for eth testnet
            if (environment.network === 'testnet') {
              this.iconPath = this.getTestnetTokeIconPath(
                this.symbol,
                this.ticker
              );
            }

            if (this.ticker === 'ALCX') {
              this.iconPath =
                'https://etherscan.io/token/images/Alchemix_32.png';
            } else if (this.ticker === 'XRUNE') {
              this.iconPath = '/assets/icons/xrune-icon.png';
            }
          }
          break;

        case 'THOR':
          this.iconPath = '/assets/icons/logo-thor-rune.svg';
          break;

        case 'BCH':
          this.iconPath =
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoincash/info/logo.png';
          break;

        case 'DOGE':
          this.iconPath =
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/doge/info/logo.png';
          break;

        case 'TERRA':
          if (this.ticker.toUpperCase() === 'LUNA')
            this.iconPath =
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/terra/info/logo.png';
          break;

        default:
          break;
      }
    }
  }

  //get tesnet token
  private getTestnetTokeIconPath(
    assetSymbol: string,
    assetTicker: string
  ): string {
    let token = ethToken.tokens.find((token) => assetTicker === token.symbol);
    if (token) {
      return token.logoURI;
    }
  }

  private _setEthIconPath(assetSymbol: string, assetTicker: string): string {
    const assetAddress = assetSymbol.slice(assetTicker.length + 1);
    const strip0x = assetAddress.substring(2);
    const checkSummedAddress = ethers.utils.getAddress(strip0x);
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${checkSummedAddress}/logo.png`;
  }

  private _getAssetFromString(poolName: string): {
    chain: Chain;
    symbol: string;
    ticker: string;
  } {
    let chain: Chain;
    let symbol: string;
    let ticker: string;

    const data = poolName.split('.');
    if (poolName.includes('.')) {
      chain = data[0] as Chain;
      symbol = data[1];
    } else {
      symbol = data[0];
    }
    if (symbol) {
      ticker = symbol.split('-')[0];
    }

    return { chain, symbol, ticker };
  }
}

export const checkSummedAsset = (
  poolName: string
): { chain: Chain; ticker: string; symbol: string; synth: boolean } => {
  const asset = new Asset(poolName);
  const assetAddress = asset.symbol.slice(asset.ticker.length + 1);
  const strip0x =
    assetAddress.substr(0, 2).toUpperCase() === '0X'
      ? assetAddress.substr(2)
      : assetAddress;
  const checkSummedAddress = ethers.utils.getAddress(strip0x);
  return {
    chain: asset.chain,
    ticker: asset.ticker,
    symbol: `${asset.ticker}-${checkSummedAddress}`,
    synth: false,
  };
};

export const isNonNativeRuneToken = (asset: XCAsset): boolean => {
  const runeTokens = [
    'BNB.RUNE-B1A', // chaosnet
    'BNB.RUNE-67C', // testnet
    'ETH.RUNE-0XD601C6A3A36721320573885A8D8420746DA3D7A0', // testnet
    'ETH.RUNE-0X3155BA85D5F96B2D030A4966AF206230E46849CB', // chaosnet
  ];

  return runeTokens.includes(`${asset.chain}.${asset.symbol}`.toUpperCase());
};

export const getChainAsset = (chain: Chain): Asset => {
  switch (chain) {
    case 'BTC':
      return new Asset('BTC.BTC');

    case 'LTC':
      return new Asset('LTC.LTC');

    case 'BCH':
      return new Asset('BCH.BCH');

    case 'ETH':
      return new Asset('ETH.ETH');

    case 'BNB':
      return new Asset('BNB.BNB');

    case 'THOR':
      return new Asset('THOR.RUNE');

    case 'DOGE':
      return new Asset('DOGE.DOGE');

    case 'TERRA':
      return new Asset('TERRA.LUNA');
        
    default:
      return null;
  }
};

export const assetIsChainAsset = (asset: Asset): boolean => {
  return assetToString(getChainAsset(asset.chain)) === assetToString(asset);
};
