import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  getValueOfAssetInRune,
  getValueOfRuneInAsset,
  PoolData,
} from '@thorchain/asgardex-util';
import {
  baseAmount,
  assetToBase,
  assetAmount,
  baseToAsset,
  assetToString,
} from '@xchainjs/xchain-util';
import { combineLatest, Subscription } from 'rxjs';
import {
  Asset,
  getChainAsset,
  isNonNativeRuneToken,
  assetIsChainAsset,
} from '../_classes/asset';
import { MidgardService } from '../_services/midgard.service';
import { UserService } from '../_services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDepositData } from './confirm-deposit-modal/confirm-deposit-modal.component';
import { User } from '../_classes/user';
import { Balances } from '@xchainjs/xchain-client';
import { AssetAndBalance } from '../_classes/asset-and-balance';
import { DepositViews, OverlaysService } from '../_services/overlays.service';
import { ThorchainPricesService } from '../_services/thorchain-prices.service';
import { TransactionUtilsService } from '../_services/transaction-utils.service';
import { debounceTime } from 'rxjs/operators';
import { PoolAddressDTO } from '../_classes/pool-address';
import { toLegacyAddress } from '@xchainjs/xchain-bitcoincash';
import { CurrencyService } from '../_services/currency.service';
import { Currency } from '../_components/account-settings/currency-converter/currency-converter.component';
import { AnalyticsService, assetString } from '../_services/analytics.service';
import {
  AvailablePoolTypeOptions,
  PoolTypeOption,
} from '../_const/pool-type-options';
import { EthUtilsService } from '../_services/eth-utils.service';
import { MetamaskService } from '../_services/metamask.service';
import { ethers } from 'ethers';
import { environment } from 'src/environments/environment';
import { isError } from 'util';

@Component({
  selector: 'app-deposit',
  templateUrl: './deposit.component.html',
  styleUrls: ['./deposit.component.scss'],
})
export class DepositComponent implements OnInit, OnDestroy {
  /**
   * Rune
   */
  rune: Asset;
  runeAmount: number;

  /**
   * Asset
   */
  set asset(val: Asset) {
    if (val) {
      if (!this._asset) {
        this._asset = val;
      } else {
        if (val.symbol !== this._asset.symbol) {
          this.router.navigate(['/', 'deposit', `${val.chain}.${val.symbol}`]);
          this._asset = val;
          this.assetBalance = this.userService.findBalance(
            this.balances,
            this.asset
          );
          this.assetAmount = undefined;
        }
      }
    }
  }
  get asset() {
    return this._asset;
  }
  _asset: Asset;
  assetAmount: number;
  assetPoolData: PoolData;
  assetPrice: number;

  /**
   * Balances
   */
  balances: Balances;
  runeBalance: number;
  assetBalance: number;

  user: User;
  subs: Subscription[];
  selectableMarkets: AssetAndBalance[];

  ethRouter: string;
  ethContractApprovalRequired: boolean;

  poolNotFoundErr: boolean;

  runeFee: number;
  networkFee: number;
  chainNetworkFee: number;
  depositsDisabled: boolean;
  sourceChainBalance: number;
  inboundAddresses: PoolAddressDTO[];

  haltedChains: string[];
  isHalted: boolean;
  isMaxError: boolean;

  view: DepositViews;
  // saving data of confirm in variable to pass it to the confirm
  depositData: ConfirmDepositData;
  //adding rune price for the input
  runePrice: number;
  currency: Currency;

  bchLegacyPooled: boolean;
  loading: boolean;
  poolType: PoolTypeOption;
  poolTypeOptions: AvailablePoolTypeOptions = {
    asymAsset: true,
    asymRune: true,
    sym: true,
  };
  formValidation: {
    message: string;
    isValid: boolean;
    isError: boolean;
  };
  metaMaskProvider?: ethers.providers.Web3Provider;
  metaMaskNetwork?: 'testnet' | 'mainnet';

  constructor(
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private midgardService: MidgardService,
    private thorchainPricesService: ThorchainPricesService,
    public overlaysService: OverlaysService,
    private txUtilsService: TransactionUtilsService,
    private curService: CurrencyService,
    private analytics: AnalyticsService,
    private ethUtilService: EthUtilsService,
    private metaMaskService: MetamaskService
  ) {
    this.poolNotFoundErr = false;
    this.ethContractApprovalRequired = false;
    this.rune = new Asset('THOR.RUNE');
    this.overlaysService.setCurrentDepositView('Deposit');
    this.subs = [];
    this.depositsDisabled = false;
    this.haltedChains = [];
    this.isHalted = false;
    this.bchLegacyPooled = false;
    this.poolType = 'SYM';
    this.formValidation = {
      message: '',
      isValid: false,
      isError: false,
    };
  }

  ngOnInit(): void {
    // should first choose the type
    this.asset = new Asset('BTC.BTC');
    this.overlaysService.setCurrentDepositView('PoolType');

    const params$ = this.route.paramMap;
    const balances$ = this.userService.userBalances$;
    const user$ = this.userService.user$.pipe(debounceTime(500));
    const inboundAddresses$ = this.midgardService.getInboundAddresses();
    const pendingBalances$ = this.userService.pendingBalances$;

    const combinedUser = combineLatest([user$, balances$, pendingBalances$]);

    const combinedPoolData = combineLatest([inboundAddresses$, params$]);

    const combinedPoolSub = combinedPoolData.subscribe(
      ([inboundAddresses, params]) => {
        // Inbound Addresses
        this.inboundAddresses = inboundAddresses;
        this.haltedChains = this.inboundAddresses
          .filter((address) => address.halted)
          .map((address) => address.chain);

        const asset = params.get('asset');
        this.assetAmount = null;
        this.runeAmount = null;
        this.ethContractApprovalRequired = false;

        if (asset) {
          this.asset = new Asset(asset);

          if (
            this.asset &&
            this.asset.chain === 'ETH' &&
            this.asset.ticker !== 'ETH'
          ) {
            this.checkContractApproved(this.asset);
          }

          if (asset === 'BCH.BCH') {
            this.checkLegacyBch();
          }

          this.isHalted = this.haltedChains.includes(this.asset.chain);

          if (isNonNativeRuneToken(this.asset)) {
            this.back();
            return;
          }

          this.getPoolDetail(asset);
          this.assetBalance = this.userService.findBalance(
            this.balances,
            this.asset
          );

          if (this.asset.chain === 'ETH' && this.asset.ticker !== 'ETH') {
            this.checkContractApproved(this.asset);
          }

          if (this.selectableMarkets) {
            this.assetPrice = this.selectableMarkets.find(
              (item) =>
                item.asset.chain === this.asset.chain &&
                item.asset.ticker === this.asset.ticker
            ).assetPriceUSD;
          }
        }

        this.validate();
      }
    );

    const userSub = combinedUser.subscribe(
      ([user, balances, pendingBalances]) => {
        // User
        this.user = user;

        // Balance
        this.balances = balances;
        this.runeBalance = this.userService.findBalance(
          this.balances,
          this.rune
        );
        this.assetBalance = this.userService.findBalance(
          this.balances,
          this.asset
        );

        if (pendingBalances) {
          this.assetBalance = undefined;
        }

        this.setSourceChainBalance();

        // Metamask - restrict to ASYM deposits
        if (this.user && this.user.type === 'metamask') {
          this.poolTypeOptions = {
            asymAsset: true,
            asymRune: false,
            sym: false,
          };
          this.setPoolTypeOption('ASYM_ASSET');
        }

        // Metamask - redirect to ETH if asset chain is not ETH
        if (
          this.user &&
          this.user.type === 'metamask' &&
          this.asset &&
          this.asset.chain !== 'ETH'
        ) {
          this.router.navigate(['/', 'deposit', 'ETH.ETH']);
        }

        if (
          this.asset &&
          this.asset.chain === 'ETH' &&
          this.asset.ticker !== 'ETH'
        ) {
          this.checkContractApproved(this.asset);
        }

        this.validate();
      }
    );

    const metaMaskProvider$ = this.metaMaskService.provider$.subscribe(
      (provider) => (this.metaMaskProvider = provider)
    );

    const metaMaskNetwork$ = this.metaMaskService.metaMaskNetwork$.subscribe(
      (network) => (this.metaMaskNetwork = network)
    );

    const depositView$ = this.overlaysService.depositView.subscribe((view) => {
      this.view = view;
    });

    const cur$ = this.curService.cur$.subscribe((cur) => {
      this.currency = cur;
    });

    this.getPools();
    this.getEthRouter();
    this.getPoolCap();
    this.subs.push(
      userSub,
      combinedPoolSub,
      depositView$,
      cur$,
      metaMaskProvider$,
      metaMaskNetwork$
    );
  }

  /**
   * This prevents user from depositing BCH with their Cash Address
   * if they have a current deposit/pending deposit with a Legacy Address
   * This prevents users from going through with a new deposit, potentially losing funds.
   */
  async checkLegacyBch() {
    if (!this.user) {
      return;
    }

    const client = this.user.clients?.bitcoinCash;
    if (!client) {
      return;
    }

    const cashAddress = client.getAddress();
    const legacyAddress = toLegacyAddress(cashAddress);
    console.log('legacy address is: ', legacyAddress);
    const bchLps = await this.midgardService
      .getThorchainLiquidityProviders('BCH.BCH')
      .toPromise();

    const match = bchLps.find((lp) => lp.asset_address === legacyAddress);
    if (match) {
      this.bchLegacyPooled = true;
    }
  }

  setPoolTypeOption(option: PoolTypeOption) {
    this.poolType = option;
    this.validate();
    this.checkContractApproved(this.asset);
  }

  setPoolTypeOptionFromEvent(option: PoolTypeOption) {
    this.setPoolTypeOption(option);
    this.overlaysService.setCurrentDepositView('Deposit');
  }

  updateValues(source: 'ASSET' | 'RUNE', amount?: number) {
    if (source === 'ASSET') {
      this.assetAmount = amount ?? null;
      if (amount) {
        this.updateRuneAmount();
      } else {
        this.runeAmount = null;
      }
    } else {
      this.runeAmount = amount ?? null;
      if (amount) {
        this.updateAssetAmount();
      } else {
        this.assetAmount = null;
      }
    }

    this.validate();
  }

  setSourceChainBalance() {
    if (this.asset && this.balances) {
      const sourceChainAsset = getChainAsset(this.asset.chain);
      const sourceChainBalance = this.userService.findBalance(
        this.balances,
        sourceChainAsset
      );
      this.sourceChainBalance = sourceChainBalance ?? 0;
    } else {
      this.sourceChainBalance = 0;
    }
  }

  getPoolCap() {
    const mimir$ = this.midgardService.mimir$;
    const network$ = this.midgardService.network$;
    const combined = combineLatest([mimir$, network$]);
    const sub = combined.subscribe(([mimir, network]) => {
      // prettier-ignore
      const totalPooledRune = +network.totalPooledRune / (10 ** 8);

      if (mimir && mimir['mimir//MAXIMUMLIQUIDITYRUNE']) {
        // prettier-ignore
        const maxLiquidityRune = mimir['mimir//MAXIMUMLIQUIDITYRUNE'] / (10 ** 8);
        this.depositsDisabled = totalPooledRune / maxLiquidityRune >= 0.9;
      }
    });

    this.subs.push(sub);
  }

  getEthRouter() {
    this.midgardService.getInboundAddresses().subscribe((addresses) => {
      const ethInbound = addresses.find((inbound) => inbound.chain === 'ETH');
      if (ethInbound) {
        this.ethRouter = ethInbound.router;
      }
    });
  }

  setMaxError(val) {
    this.isMaxError = val;

    setTimeout(() => {
      this.isMaxError = false;
    }, 2000);
  }

  contractApproved() {
    this.ethContractApprovalRequired = false;
  }

  async checkContractApproved(asset: Asset) {
    if (!this.inboundAddresses) {
      return;
    }

    const ethInboundAddress = this.inboundAddresses.find(
      (inbound) => inbound.chain === 'ETH'
    );

    if (!ethInboundAddress) {
      return;
    }

    if (this.poolType === 'ASYM_RUNE') {
      this.contractApproved();
      return;
    }

    if (ethInboundAddress && this.user) {
      const assetAddress = asset.symbol.slice(asset.ticker.length + 1);
      const strip0x = assetAddress.substr(2);
      const provider =
        this.user.type === 'keystore' || this.user.type === 'XDEFI'
          ? this.user.clients.ethereum.getProvider()
          : this.metaMaskProvider;
      const userAddress =
        this.user.type === 'keystore' || this.user.type === 'XDEFI'
          ? this.user.clients.ethereum.getAddress()
          : await this.metaMaskProvider.getSigner().getAddress();

      const isApproved = await this.ethUtilService.isApproved(
        provider,
        strip0x,
        ethInboundAddress.router,
        userAddress
      );
      this.ethContractApprovalRequired = !isApproved;
    }
  }

  updateRuneAmount() {
    const runeAmount = getValueOfAssetInRune(
      assetToBase(assetAmount(this.assetAmount)),
      this.assetPoolData
    );
    this.runeAmount = runeAmount.amount().isLessThan(0)
      ? 0
      : runeAmount
          .amount()
          .div(10 ** 8)
          .toNumber();
  }

  updateAssetAmount() {
    const depositAssetAmount = getValueOfRuneInAsset(
      assetToBase(assetAmount(this.runeAmount)),
      this.assetPoolData
    );
    this.assetAmount = depositAssetAmount.amount().isLessThan(0)
      ? 0
      : depositAssetAmount
          .amount()
          .div(10 ** 8)
          .toNumber();
  }

  async getPoolDetail(asset: string) {
    if (!this.inboundAddresses) {
      console.error('error fetching inbound addresses');
      return;
    }

    this.loading = true;

    this.midgardService.getPool(asset).subscribe(
      (res) => {
        if (res) {
          this.assetPoolData = {
            assetBalance: baseAmount(res.assetDepth),
            runeBalance: baseAmount(res.runeDepth),
          };

          this.networkFee = this.txUtilsService.calculateNetworkFee(
            this.asset,
            this.inboundAddresses,
            'INBOUND',
            res
          );

          this.chainNetworkFee = this.txUtilsService.calculateNetworkFee(
            getChainAsset(this.asset.chain),
            this.inboundAddresses,
            'INBOUND',
            res
          );

          this.runeFee = this.txUtilsService.calculateNetworkFee(
            new Asset('THOR.RUNE'),
            this.inboundAddresses,
            'INBOUND',
            res
          );

          this.loading = false;
        }
      },
      (err) => {
        console.error('error getting pool detail: ', err);
        this.poolNotFoundErr = true;
      }
    );
  }

  getPools() {
    this.midgardService.getPools().subscribe(
      (res) => {
        this.selectableMarkets = res
          .sort((a, b) => a.asset.localeCompare(b.asset))
          .map((pool) => ({
            asset: new Asset(pool.asset),
            assetPriceUSD: +pool.assetPriceUSD,
          }))
          // filter out until we can add support
          .filter(
            (pool) =>
              pool.asset.chain === 'BNB' ||
              pool.asset.chain === 'BTC' ||
              pool.asset.chain === 'ETH' ||
              pool.asset.chain === 'LTC' ||
              pool.asset.chain === 'BCH'
          )

          // filter out non-native RUNE tokens
          .filter((pool) => !isNonNativeRuneToken(pool.asset))

          // filter out halted chains
          .filter((pool) => !this.haltedChains.includes(pool.asset.chain));

        //add rune price
        const availablePools = res.filter(
          (pool) => pool.status === 'available'
        );
        this.runePrice =
          this.thorchainPricesService.estimateRunePrice(availablePools);
      },
      (err) => console.error('error fetching pools:', err)
    );
  }

  validate(): void {
    /** Wallet not connected */
    if (!this.balances) {
      this.formValidation = {
        message: 'connect wallet',
        isValid: false,
        isError: false,
      };
      return;
    }

    if (this.depositsDisabled) {
      this.formValidation = {
        message: 'Cap Reached',
        isValid: false,
        isError: true,
      };
      return;
    }

    if (this.isHalted) {
      this.formValidation = {
        message: 'Pool Halted',
        isValid: false,
        isError: true,
      };
      return;
    }

    /** User either lacks asset balance or RUNE balance */
    if (this.balances && !this.runeAmount && !this.assetAmount) {
      this.formValidation = {
        message: 'Prepare',
        isValid: false,
        isError: false,
      };
      return;
    }

    /** Asset amount is greater than balance */
    if (this.requiresAsset() && this.assetBalance < this.assetAmount) {
      this.formValidation = {
        message: `Insufficient ${this.asset.ticker}`,
        isValid: false,
        isError: true,
      };
      return;
    }

    /** RUNE amount exceeds RUNE balance. Leave 3 RUNE in balance */
    if (
      this.poolType !== 'ASYM_ASSET' &&
      this.runeBalance - this.runeAmount < 3
    ) {
      this.formValidation = {
        message: 'Min 3 RUNE in Wallet',
        isValid: false,
        isError: true,
      };
      return;
    }

    /** Checks sufficient chain balance for fee */
    if (
      this.sourceChainBalance <= this.chainNetworkFee &&
      this.poolType !== 'ASYM_RUNE'
    ) {
      this.formValidation = {
        message: `Insufficient ${this.asset.chain} for fees`,
        isValid: false,
        isError: true,
      };
      return;
    }

    /**
     * Asset matches chain asset
     * check balance + amount < chain_network_fee
     */
    if (
      this.requiresAsset() &&
      assetToString(getChainAsset(this.asset.chain)) ===
        assetToString(this.asset) &&
      this.assetAmount + this.networkFee * 4 >=
        this.userService.maximumSpendableBalance(
          this.asset,
          this.sourceChainBalance,
          this.inboundAddresses
        ) &&
      this.poolType !== 'ASYM_RUNE'
    ) {
      this.formValidation = {
        message: `Insufficient ${this.asset.chain}.${this.asset.ticker} for fees`,
        isValid: false,
        isError: true,
      };
      return;
    }

    /** Rune balance is suffient for fees */
    if (this.runeBalance <= this.runeFee) {
      this.formValidation = {
        message: `Insufficient ${this.rune.chain}.${this.rune.ticker} for fees`,
        isValid: false,
        isError: true,
      };
    }

    /** Amount is too low, considered "dusting" */
    if (this.assetAmount <= this.userService.minimumSpendable(this.asset)) {
      this.formValidation = {
        message: 'Amount too low',
        isValid: false,
        isError: true,
      };
      return;
    }

    /**
     * Deposit amount should be more than outbound fee + inbound fee network fee costs
     * Ensures sufficient amount to withdraw
     */
    if (this.assetAmount <= this.networkFee * 4) {
      this.formValidation = {
        message: 'Amount too low',
        isValid: false,
        isError: true,
      };
      return;
    }

    if (
      this.user?.type === 'metamask' &&
      this.metaMaskNetwork !== environment.network
    ) {
      this.formValidation = {
        message: 'Change MetaMask Network',
        isValid: false,
        isError: true,
      };
      return;
    }

    // SYM good to go
    if (
      this.poolType === 'SYM' &&
      this.runeAmount &&
      this.assetAmount &&
      this.runeAmount <= this.runeBalance &&
      this.assetAmount <= this.assetBalance
    ) {
      this.formValidation = {
        message: 'Prepare',
        isValid: true,
        isError: false,
      };
      return;
    }

    // ASYM_ASSET good to go
    if (
      this.poolType === 'ASYM_ASSET' &&
      this.assetAmount &&
      (assetIsChainAsset(this.asset)
        ? this.assetAmount + this.networkFee * 3 <= this.assetBalance
        : this.assetAmount <= this.assetBalance)
    ) {
      this.formValidation = {
        message: 'Prepare',
        isValid: true,
        isError: false,
      };
      return;
    }

    // ASYM_RUNE good to go
    if (
      this.poolType === 'ASYM_RUNE' &&
      this.runeAmount &&
      this.runeAmount + this.runeFee <= this.runeBalance
    ) {
      this.formValidation = {
        message: 'Prepare',
        isValid: true,
        isError: false,
      };
      return;
    }

    this.formValidation = {
      message: 'Invalid',
      isValid: false,
      isError: true,
    };
  }

  requiresAsset(): boolean {
    return this.poolType === 'SYM' || this.poolType === 'ASYM_ASSET';
  }

  openConfirmationDialog() {
    const runeBasePrice = getValueOfAssetInRune(
      assetToBase(assetAmount(1)),
      this.assetPoolData
    )
      .amount()
      .div(10 ** 8)
      .toNumber();
    const assetBasePrice = getValueOfRuneInAsset(
      assetToBase(assetAmount(1)),
      this.assetPoolData
    )
      .amount()
      .div(10 ** 8)
      .toNumber();
    const assetPrice = this.selectableMarkets.find(
      (asset) => this.asset.symbol === asset.asset.symbol
    ).assetPriceUSD;
    const assetData: AssetAndBalance = {
      asset: this.asset,
      balance: assetAmount(this.assetBalance, 8),
      assetPriceUSD: assetPrice,
    };
    const runeData: AssetAndBalance = {
      asset: this.rune,
      balance: assetAmount(this.runeBalance, 8),
      assetPriceUSD: this.runePrice,
    };

    this.depositData = {
      asset: assetData,
      rune: runeData,
      assetAmount: this.assetAmount,
      runeAmount: this.runeAmount,
      user: this.user,
      runeBasePrice,
      assetBasePrice,
      assetBalance: this.assetBalance,
      runeBalance: this.runeBalance,
      runePrice: this.runePrice,
      runeFee: this.runeFee,
      estimatedFee: this.networkFee,
      poolTypeOption: this.poolType,
      assetPrice,
    };

    let depositAmountUsd =
      assetData.assetPriceUSD * this.assetAmount +
      runeData.assetPriceUSD * this.runeAmount;
    this.analytics.event(
      'pool_deposit_symmetrical_prepare',
      'button_deposit_symmetrical_*POOL_ASSET*_usd_*numerical_usd_value*',
      depositAmountUsd,
      assetString(this.asset),
      depositAmountUsd.toString()
    );
    let depositFeeAmountUSD =
      this.networkFee * assetData.assetPriceUSD +
      runeData.assetPriceUSD * this.runeFee;
    this.analytics.event(
      'pool_deposit_symmetrical_prepare',
      'button_deposit_symmetrical_*POOL_ASSET*_fee_usd_*numerical_usd_value*',
      depositFeeAmountUSD,
      assetString(this.asset),
      depositFeeAmountUSD.toString()
    );

    if (this.depositData) this.overlaysService.setCurrentDepositView('Confirm');
  }

  closeSuccess(transactionSuccess: boolean): void {
    if (transactionSuccess) {
      this.assetAmount = null;
      this.runeAmount = null;
    }

    this.overlaysService.setCurrentDepositView('Deposit');
  }

  back(): void {
    this.overlaysService.setCurrentDepositView('PoolType');
  }

  cancelButton() {
    if (this.user) {
      this.analytics.event('pool_deposit_symmetrical_prepare', 'button_cancel');
      let depositAmountUsd =
        this.assetPrice * this.assetAmount + this.runeFee * this.runeAmount;
      this.analytics.event(
        'pool_deposit_symmetrical_prepare',
        'button_deposit_cancel_symmetrical_*POOL_ASSET*_usd_*numerical_usd_value*',
        depositAmountUsd,
        assetString(this.asset),
        depositAmountUsd.toString()
      );
      let depositFeeAmountUSD =
        this.networkFee * this.assetPrice + this.runeFee * this.runeFee;
      this.analytics.event(
        'pool_deposit_symmetrical_prepare',
        'button_deposit_cancel_symmetrical_*POOL_ASSET*_fee_usd_*numerical_usd_value*',
        depositFeeAmountUSD,
        assetString(this.asset),
        depositFeeAmountUSD.toString()
      );
    } else
      this.analytics.event(
        'pool_disconnected_deposit',
        'button_cancel_*POOL*',
        undefined,
        assetToString(this.asset)
      );
    this.back();
  }

  breadCrumbNav(nav: string, type: 'deposit' | 'market') {
    let label;
    switch (type) {
      case 'deposit':
        if (this.user) label = 'pool_deposit_symmetrical_prepare';
        else label = 'pool_disconnected_deposit';
        break;
      case 'market':
        label = 'pool_deposit_symmetrical_asset_search';
        break;
      default:
        label = 'pool_disconnected_deposit';
        break;
    }

    if (nav === 'pool') {
      this.router.navigate(['/', 'pool']);
      this.analytics.event(label, 'breadcrumb_pools');
    } else if (nav === 'swap') {
      this.router.navigate(['/', 'swap']);
      this.analytics.event(label, 'breadcrumb_skip');
    } else if (nav === 'deposit') {
      this.router.navigate([
        '/',
        'deposit',
        `${this.asset.chain}.${this.asset.symbol}`,
      ]);
    } else if (nav === 'deposit-back') {
      this.analytics.event(label, 'breadcrumb_deposit');
      this.overlaysService.setCurrentDepositView('Deposit');
    }
  }

  lunchMarket() {
    this.analytics.event(
      'pool_deposit_symmetrical_prepare',
      'select_deposit_symmetrical_container_asset'
    );
    this.overlaysService.setCurrentDepositView('Asset');
  }

  connectWallet() {
    this.analytics.event(
      'pool_disconnected_deposit',
      'button_connect_wallet_*POOL*',
      undefined,
      `${this.asset.chain}.${this.asset.ticker}`
    );
    this.overlaysService.setCurrentDepositView('Connect');
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
