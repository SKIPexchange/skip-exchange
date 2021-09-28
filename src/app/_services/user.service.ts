import { Injectable } from '@angular/core';
import { AvailableClients, User, WalletType } from '../_classes/user';
import { Client as BinanceClient } from '@thorchain/asgardex-binance';
import { environment } from 'src/environments/environment';
import { Asset, checkSummedAsset } from '../_classes/asset';
import { Balance, Network } from '@xchainjs/xchain-client';
import { BncClient } from '@binance-chain/javascript-sdk/lib/client';
import {
  assetAmount,
  assetToBase,
  assetFromString,
  baseToAsset,
  Chain,
  bn,
  assetToString,
  baseAmount,
} from '@xchainjs/xchain-util';
import { BehaviorSubject, of, Subject, timer } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';
import { AssetAndBalance } from '../_classes/asset-and-balance';
import { MidgardService } from './midgard.service';
import BigNumber from 'bignumber.js';
import { PoolAddressDTO } from '../_classes/pool-address';
import { TransactionUtilsService } from './transaction-utils.service';
import { TxType } from '../_const/tx-type';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ETH_DECIMAL, Client as EthClient } from '@xchainjs/xchain-ethereum';
import { HaskoinService } from './haskoin.service';
import { MainViewsEnum, OverlaysService } from './overlays.service';

export interface MidgardData<T> {
  key: string;
  value: T;
  link: string[];
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private _user: User;
  private userSource = new BehaviorSubject<User>(null);
  user$ = this.userSource.asObservable();

  private userBalancesSource = new BehaviorSubject<Balance[]>(null);
  userBalances$ = this.userBalancesSource.asObservable();
  private _balances: Balance[];

  private chainBalanceErrorsSource = new BehaviorSubject<Chain[]>([]);
  chainBalanceErrors$ = this.chainBalanceErrorsSource.asObservable();
  private _chainBalanceErrors: Chain[];

  private killRunePolling: Subject<void> = new Subject();

  asgardexBncClient: BinanceClient;
  private pendingBalancesSource = new BehaviorSubject<boolean>(true);
  pendingBalances$ = this.pendingBalancesSource.asObservable();
  private _pendingBalances: boolean;

  public ThorAddress = undefined;

  constructor(
    private midgardService: MidgardService,
    private http: HttpClient,
    private haskoinService: HaskoinService,
    private txUtilsService: TransactionUtilsService,
    private overlaysService: OverlaysService
  ) {
    this._balances = [];
    this._chainBalanceErrors = [];

    this.asgardexBncClient = new BinanceClient({
      network: environment.network === 'testnet' ? 'testnet' : 'mainnet',
    });
  }

  setUser(user: User) {
    this._user = user;
    this.userSource.next(user);
    this.setLastLoginType(user?.type);
    if (user) {
      this.ThorAddress =
        this.getTokenAddress(user, Chain.THORChain) ?? undefined;
      this.fetchBalances();
    } else {
      this.ThorAddress = undefined;
      this.userBalancesSource.next(null);
      this.overlaysService.setCurrentView(MainViewsEnum.Swap);
    }
  }

  async getBitcoinBalances() {
    try {
      const client = this._user.clients.bitcoin;
      const address = await client.getAddress();
      const btcBalances = await client.getBalance(address);
      let balances;

      if (environment.network === 'testnet') {
        balances = btcBalances;
      } else {
        const HASKOIN_API_URL = 'https://api.haskoin.com/btc';
        const { confirmed, unconfirmed } = (await this.http
          .get(`${HASKOIN_API_URL}/address/${address}/balance`)
          .toPromise()) as any;
        const baseConfirmed = baseAmount(confirmed);
        const baseUnconfirmed = baseAmount(unconfirmed);

        balances = baseAmount(
          baseConfirmed.amount().plus(baseUnconfirmed.amount())
        );
      }

      this.pushBalances(balances);
    } catch (error) {
      console.error('error fetching binance balances: ', error);
    }
  }

  async fetchBalances(callback?: () => void): Promise<void> {
    this._balances = [];
    this._chainBalanceErrors = [];
    this.chainBalanceErrorsSource.next([]);
    const promises = [];
    this._pendingBalances = true;
    this.pendingBalancesSource.next(this._pendingBalances);

    // Keystore / XDEFI
    if (
      this._user &&
      this._user.clients &&
      (this._user.type === 'XDEFI' ||
        this._user.type === 'keystore' ||
        this._user.type === 'walletconnect')
    ) {
      for (const [key, _value] of Object.entries(this._user.clients)) {
        if (key === 'binance') {
          promises.push(this.getBinanceBalances());
        } else if (key === 'ethereum') {
          const client = this._user.clients.ethereum;
          const address = client.getAddress();
          promises.push(this.getEthereumBalances(client, address));
        } else {
          promises.push(this.getGeneralBalance(key));
        }
      }

      // MetaMask
    } else if (this._user && this._user.type === 'metamask') {
      // mock client to fetch balances
      const network =
        environment.network === 'testnet' ? Network.Testnet : Network.Mainnet;
      const MOCK_PHRASE =
        'image rally need wedding health address purse army antenna leopard sea gain';
      const phrase = MOCK_PHRASE;
      const userEthereumClient = new EthClient({
        network,
        phrase,
        etherscanApiKey: environment.etherscanKey,
        infuraCreds: { projectId: environment.infuraProjectId },
      });
      userEthereumClient.getAddress = () => this._user.wallet;
      this._user.clients = {
        ethereum: userEthereumClient,
      };

      promises.push(
        this.getEthereumBalances(userEthereumClient, this._user.wallet)
      );
    }

    // allSettled is not yet added into ts, need an update for this
    (Promise as any).allSettled(promises).then((_) => {
      this._pendingBalances = false;
      this.pendingBalancesSource.next(this._pendingBalances);
      if (callback) {
        callback();
      }
    });
  }

  // helper function to get the client name by chain name
  getClientByChain(chain: Chain): string {
    let key: string;
    switch (chain) {
      case 'BNB':
        key = 'binance';
        break;
      case 'ETH':
        key = 'ethereum';
        break;
      case 'BTC':
        key = 'bitcoin';
        break;
      case 'BCH':
        key = 'bitcoinCash';
        break;
      case 'LTC':
        key = 'litecoin';
        break;
      case 'THOR':
        key = 'thorchain';
        break;
    }
    return key;
  }

  async fetchBalance(chain: Chain): Promise<void> {
    if (this.clientAvailableChains().includes(chain)) {
      let key = this.getClientByChain(chain);
      if (key === 'binance') {
        await this.getBinanceBalances();
      } else if (key === 'ethereum') {
        if (this._user.wallet !== 'metamask') {
          const client = this._user.clients.ethereum;
          const address = client.getAddress();
          await this.getEthereumBalances(client, address);
        } else {
          const network =
            environment.network === 'testnet'
              ? Network.Testnet
              : Network.Mainnet;
          const MOCK_PHRASE =
            'image rally need wedding health address purse army antenna leopard sea gain';
          const phrase = MOCK_PHRASE;
          const userEthereumClient = new EthClient({
            network,
            phrase,
            etherscanApiKey: environment.etherscanKey,
            infuraCreds: { projectId: environment.infuraProjectId },
          });
          userEthereumClient.getAddress = () => this._user.wallet;
          this._user.clients = {
            ethereum: userEthereumClient,
          };
          await this.getEthereumBalances(userEthereumClient, this._user.wallet);
        }
      } else {
        await this.getGeneralBalance(key);
      }
    }
  }

  setBalances(balances: Balance[]) {
    this._balances = balances;
    this.userBalancesSource.next(balances);
  }

  // it seems updating balances will be better than only pushing to it.
  pushBalances(balances: Balance[]) {
    for (let i = 0; i < balances.length; i++) {
      let _balance = balances[i];
      const index = this._balances.findIndex(
        (balance) =>
          assetToString(balance.asset) === assetToString(_balance.asset)
      );

      if (index === -1) {
        this._balances = [...this._balances, _balance];
        this.userBalancesSource.next(this._balances);
      } else {
        this._balances[index] = _balance;
        this.userBalancesSource.next(this._balances);
      }
    }
  }

  pushChainBalanceErrors(chain: Chain) {
    this._chainBalanceErrors.push(chain);
    this.chainBalanceErrorsSource.next(this._chainBalanceErrors);
  }

  async getGeneralBalance(key: string) {
    try {
      const client = this._user.clients[key];
      const address = client.getAddress();
      const balances = await client.getBalance(address);
      this.pushBalances(balances);
    } catch (error) {
      console.error(error);
      // ethereum and binance are handled in respected functions
      switch (key) {
        case 'bitcoin':
          this.pushChainBalanceErrors(Chain.Bitcoin);
          break;
        case 'bitcoinCash':
          this.pushChainBalanceErrors(Chain.BitcoinCash);
          break;
        case 'litecoin':
          this.pushChainBalanceErrors(Chain.Litecoin);
          break;
        case 'thorchain':
          this.pushChainBalanceErrors(Chain.THORChain);
          break;
      }
    }
  }

  async getBinanceBalances() {
    try {
      const client = this._user.clients.binance;
      const bncClient: BncClient = await client.getBncClient();
      const address = await client.getAddress();
      const bncBalances = await bncClient.getBalance(address);

      const balances = bncBalances.map((balance) => {
        const asset = assetFromString(`BNB.${balance.symbol}`);

        return {
          asset,
          amount: assetToBase(assetAmount(balance.free, 8)),
          frozenAmount: assetToBase(assetAmount(balance.frozen, 8)),
        };
      });

      this.pushBalances(balances);
    } catch (error) {
      console.error('error fetching binance balances: ', error);
    }
  }

  async getEthereumBalances(client: EthClient, address: string) {
    try {
      // ETH
      const provider = client.getProvider();
      const ethBalance = await provider.getBalance(address);
      this.pushBalances([
        {
          asset: new Asset('ETH.ETH'),
          amount: baseAmount(ethBalance.toString(), ETH_DECIMAL),
        },
      ]);

      const assetsToQuery: { chain: Chain; ticker: string; symbol: string }[] =
        [];

      /**
       * Add ETH RUNE
       */
      assetsToQuery.push(
        environment.network === 'testnet'
          ? new Asset(
              `ETH.RUNE-${'0xd601c6A3a36721320573885A8d8420746dA3d7A0'}`
            )
          : new Asset(
              `ETH.RUNE-${'0x3155BA85D5F96b2d030a4966AF206230e46849cb'}`
            )
      );

      /**
       * Check user balance for tokens that have existing THORChain pools
       */
      const pools = await this.midgardService.getPools().toPromise();
      const ethTokenPools = pools
        .filter((pool) => pool.asset.indexOf('ETH') === 0)
        .filter((ethPool) => ethPool.asset.indexOf('-') >= 0);

      for (const token of ethTokenPools) {
        const tokenAsset = checkSummedAsset(token.asset);
        assetsToQuery.push(tokenAsset);
      }

      /**
       * Check localstorage for user-added tokens
       */
      const userAddedTokens: string[] =
        JSON.parse(localStorage.getItem(`${address}_user_added`)) || [];
      for (const token of userAddedTokens) {
        const tokenAsset = checkSummedAsset(token);
        assetsToQuery.push(tokenAsset);
      }

      const tokenBalances = await client.getBalance(address, assetsToQuery);
      this.pushBalances(tokenBalances);
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Midgard has no way to tell when BNB has been successfully upgraded to RUNE
   * so we poll the native RUNE balance to check for a difference
   */
  pollNativeRuneBalance(currentBalance: number) {
    if (this._user && this._user.clients && this._user.clients.thorchain) {
      const address = this._user.clients.thorchain.getAddress();

      timer(5000, 15000)
        .pipe(
          // This kills the request if the user closes the component
          takeUntil(this.killRunePolling),
          // switchMap cancels the last request, if no response have been received since last tick
          // switchMap(() => this.midgardService.getTransaction(tx.hash)),
          switchMap(() => this._user.clients.thorchain.getBalance(address)),
          // catchError handles http throws
          catchError((error) => of(error))
        )
        .subscribe(async (res: Balance[]) => {
          const runeBalance = this.findBalance(res, new Asset('THOR.RUNE'));
          if (runeBalance && currentBalance < runeBalance) {
            console.log('increased!');
            this.fetchBalances();
            this.killRunePolling.next();
          }
        });
    } else {
      console.error('no thorchain client found');
    }
  }

  maximumSpendableBalance(
    asset: Asset,
    balance: number,
    inboundAddresses: PoolAddressDTO[],
    txType?: TxType
  ) {
    let max = balance;
    let fee: number;

    switch (assetToString(asset)) {
      case 'THOR.RUNE':
        fee = this.txUtilsService.calculateNetworkFee(
          asset,
          inboundAddresses,
          txType ?? 'INBOUND'
        );
        max = balance - fee;
        break;

      case 'BTC.BTC':
      case 'LTC.LTC':
      case 'BCH.BCH':
      case 'BNB.BNB':
        fee = this.txUtilsService.calculateNetworkFee(
          asset,
          inboundAddresses,
          txType ?? 'INBOUND'
        );
        max = balance - fee;
        break;

      case 'ETH.ETH':
        fee = this.txUtilsService.calculateNetworkFee(
          asset,
          inboundAddresses,
          txType ?? 'INBOUND'
        );
        max = balance - fee * 1.01;
        break;
    }

    return max >= 0 ? max : 0;
  }

  minimumSpendable(asset: Asset) {
    switch (`${asset.chain}.${asset.symbol}`) {
      case 'BTC.BTC':
      case 'LTC.LTC':
      case 'BCH.BCH':
      case 'THOR.RUNE':
        return 0.0001;

      case 'BNB.BNB':
        return 0.001;

      case 'ETH.ETH':
        return 0.001;

      default:
        return 0.001;
    }
  }

  findBalance(balances: Balance[], asset: Asset) {
    if (balances && asset) {
      const match = balances.find(
        (balance) =>
          `${balance.asset.chain}.${balance.asset.symbol}`.toUpperCase() ===
          `${asset.chain}.${asset.symbol}`.toUpperCase()
      );

      if (match) {
        return baseToAsset(match.amount).amount().toNumber();
      } else {
        return 0.0;
      }
    }
  }

  // TODO -> hacky bandaid for erc20 dusting
  findRawBalance(balances: Balance[], asset: Asset): BigNumber {
    if (balances && asset) {
      const match = balances.find(
        (balance) =>
          `${balance.asset.chain}.${balance.asset.symbol}`.toUpperCase() ===
          `${asset.chain}.${asset.symbol}`.toUpperCase()
      );

      if (match) {
        return match.amount.amount();
      } else {
        return bn(0);
      }
    }
  }

  sortMarketsByUserBalance(
    userBalances: Balance[],
    marketListItems: AssetAndBalance[]
  ): AssetAndBalance[] {
    const balMap: { [key: string]: Balance } = {};
    userBalances.forEach((item) => {
      balMap[`${item.asset.chain}.${item.asset.symbol}`.toUpperCase()] = item;
    });

    marketListItems = marketListItems.map((mItem) => {
      if (balMap[`${mItem.asset.chain}.${mItem.asset.symbol}`.toUpperCase()]) {
        return {
          asset: mItem.asset,
          balance: baseToAsset(
            balMap[`${mItem.asset.chain}.${mItem.asset.symbol}`.toUpperCase()]
              .amount
          ),
          assetPriceUSD: mItem.assetPriceUSD ?? 0,
        };
      } else {
        return {
          asset: mItem.asset,
          balance: assetAmount(0),
          assetPriceUSD: mItem.assetPriceUSD ?? 0,
        };
      }
    });

    marketListItems = marketListItems.sort((a, b) => {
      if (!a.balance && !b.balance) {
        return 0;
      }
      if (!a.balance) {
        return 1;
      }
      if (!b.balance) {
        return -1;
      }
      return b.balance.amount().toNumber() - a.balance.amount().toNumber();
    });

    return marketListItems;
  }

  getAdrressChain(chain: Chain) {
    return this.getTokenAddress(this.userSource.value, chain);
  }

  getTokenAddress(user: User, chain: Chain): string {
    if (user.type === 'metamask') {
      if (chain === 'ETH') {
        return user.wallet ?? '';
      } else {
        return '';
      }
    } else if (user.type === 'walletconnect') {
      const clients: AvailableClients = user.clients;

      switch (chain) {
        case 'BNB':
          const bnbClient = clients.binance;
          return bnbClient?.getAddress() ?? undefined;
        case 'ETH':
          const ethClient = clients.ethereum;
          return ethClient?.getAddress() ?? undefined;
        case 'THOR':
          const thorClient = clients.thorchain;
          return thorClient?.getAddress() ?? undefined;
        default:
          return undefined;
      }
    } else {
      const clients: AvailableClients = user.clients;

      switch (chain) {
        case 'BNB':
          const bnbClient = clients.binance;
          return bnbClient.getAddress();

        case 'BTC':
          const btcClient = clients.bitcoin;
          return btcClient.getAddress();

        case 'BCH':
          const bchClient = clients.bitcoinCash;
          const address = bchClient.getAddress();

          // bch testnet addresses look like bchtest:qpmhkjgp89d8uuyl3je5gw09kgsr5t4ndyj9mzvrcm
          // the colon interferes with the THORChain memo, and needs to be removed
          return address.indexOf(':') > 0 ? address.split(':')[1] : address;

        case 'ETH':
          const ethClient = clients.ethereum;
          return ethClient.getAddress();

        case 'LTC':
          const litcoinClient = clients.litecoin;
          return litcoinClient.getAddress();

        case 'THOR':
          const thorClient = clients.thorchain;
          return thorClient.getAddress();

        default:
          console.error(`${chain} does not match getting token address`);
          return;
      }
    }
  }

  getChainClient(user: User = this._user, chain: Chain) {
    switch (chain) {
      case 'BTC':
        return user.clients.bitcoin;

      case 'ETH':
        return user.clients.ethereum;

      case 'BNB':
        return user.clients.binance;

      case 'BCH':
        return user.clients.bitcoinCash;

      case 'LTC':
        return user.clients.litecoin;

      case 'THOR':
        return user.clients.thorchain;
    }

    throw new Error(`no matching client for chain: ${chain}`);
  }

  setLastLoginType(walletType: WalletType) {
    localStorage.setItem('lastLoginType', walletType ?? '');
  }

  getLastLoginType(): string {
    return localStorage.getItem('lastLoginType');
  }

  clientAvailableChains() {
    if (!this._user) {
      return undefined;
    }
    let availableChains: Chain[] = [];
    for (const [key, _value] of Object.entries(this._user.clients)) {
      if (key === 'binance' && _value) {
        availableChains.push(Chain.Binance);
      } else if (key === 'ethereum' && _value) {
        availableChains.push(Chain.Ethereum);
      } else if (key === 'thorchain' && _value) {
        availableChains.push(Chain.THORChain);
      } else if (key === 'bitcoin' && _value) {
        availableChains.push(Chain.Bitcoin);
      } else if (key === 'bitcoinCash' && _value) {
        availableChains.push(Chain.BitcoinCash);
      } else if (key === 'litecoin' && _value) {
        availableChains.push(Chain.Litecoin);
      }
    }
    return availableChains;
  }

  filterAvailableSourceChains({
    userType,
    assets,
  }: {
    userType?: WalletType;
    assets: AssetAndBalance[];
  }): AssetAndBalance[] {
    switch (userType) {
      case 'metamask':
        return assets.filter((pool) => pool.asset.chain === 'ETH');
      case 'walletconnect':
        return assets.filter((pool) =>
          this.clientAvailableChains().includes(pool.asset.chain)
        );
      case 'XDEFI':
      case 'keystore':
      default:
        return assets.filter(
          (pool) =>
            pool.asset.chain === 'BNB' ||
            pool.asset.chain === 'THOR' ||
            pool.asset.chain === 'BTC' ||
            pool.asset.chain === 'ETH' ||
            pool.asset.chain === 'LTC' ||
            pool.asset.chain === 'BCH'
        );
    }
  }
}
