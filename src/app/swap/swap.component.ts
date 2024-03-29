import { Component, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { Asset, assetIsChainAsset, getChainAsset } from '../_classes/asset';
import { UserService } from '../_services/user.service';
import { combineLatest, Subscription, timer } from 'rxjs';
import {
  getDoubleSwapOutput,
  getSwapSlip,
  getDoubleSwapSlip,
  PoolData,
  getValueOfAssetInRune,
  getValueOfRuneInAsset,
  getSwapOutput,
} from '@thorchain/asgardex-util';
import BigNumber from 'bignumber.js';
import {
  bn,
  baseAmount,
  BaseAmount,
  assetToBase,
  assetAmount,
  assetToString,
  Chain,
} from '@xchainjs/xchain-util';
import { PoolDetail } from '../_classes/pool-detail';
import { MidgardService, ThorchainQueue } from '../_services/midgard.service';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmSwapModalComponent,
  SwapData,
} from './confirm-swap-modal/confirm-swap-modal.component';
import { User } from '../_classes/user';
import { Balance } from '@xchainjs/xchain-client';
import { AssetAndBalance } from '../_classes/asset-and-balance';
import { PoolDTO } from '../_classes/pool';
import { SlippageToleranceService } from '../_services/slippage-tolerance.service';
import { PoolAddressDTO } from '../_classes/pool-address';
import { MainViewsEnum, OverlaysService } from '../_services/overlays.service';
import { ThorchainPricesService } from '../_services/thorchain-prices.service';
import { TransactionUtilsService } from '../_services/transaction-utils.service';
import { NetworkQueueService } from '../_services/network-queue.service';
import { CurrencyService } from '../_services/currency.service';
import { Currency } from '../_components/account-settings/currency-converter/currency-converter.component';
import {
  debounceTime,
  delay,
  retryWhen,
  switchMap,
  take,
} from 'rxjs/operators';
import { UpdateTargetAddressModalComponent } from './update-target-address-modal/update-target-address-modal.component';
import { SwapServiceService } from '../_services/swap-service.service';
import { AnalyticsService, assetString } from '../_services/analytics.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MetamaskService } from '../_services/metamask.service';
import { ethers } from 'ethers';
import { EthUtilsService } from '../_services/eth-utils.service';
import { MockClientService } from '../_services/mock-client.service';
import { environment } from 'src/environments/environment';
import { LayoutObserverService } from '../_services/layout-observer.service';
import { TranslateService } from '../_services/translate.service';

export enum SwapType {
  DOUBLE_SWAP = 'double_swap',
  SINGLE_SWAP = 'single_swap',
}

@Component({
  selector: 'app-swap',
  templateUrl: './swap.component.html',
  styleUrls: ['./swap.component.scss'],
})
export class SwapComponent implements OnInit, OnDestroy, OnChanges {
  /**
   * From
   */
  get sourceAssetUnit() {
    return this._sourceAssetUnit;
  }
  set sourceAssetUnit(val: number) {
    this._sourceAssetUnit = val;
    this._sourceAssetTokenValue = assetToBase(assetAmount(val));

    if (val) {
      this.updateSwapDetails();
    } else {
      this.targetAssetUnit = null;
      this.slip = 0;
    }
    this.validate();
  }
  private _sourceAssetUnit: number;
  private _sourceAssetTokenValue: BaseAmount;

  //price of the selected asset
  sourceAssetPrice: number;

  get selectedSourceAsset() {
    return this._selectedSourceAsset;
  }
  set selectedSourceAsset(asset: Asset) {
    this.ethContractApprovalRequired = false;
    if (this.selectedSourceAsset) {
      this.targetAssetUnit = null;
      this.calculatingTargetAsset = true;
    }
    this._selectedSourceAsset = asset;

    if (asset) {
      this.router.navigate([
        '/',
        'swap',
        `${asset.chain}.${asset.symbol}`,
        this.selectedTargetAsset
          ? `${this.selectedTargetAsset.chain}.${this.selectedTargetAsset.symbol}`
          : '',
      ]);
    }

    if (this._selectedSourceAsset) {
      this.updateSwapDetails();
    }
    this.sourceBalance = this._selectedSourceAsset
      ? this.userService.findBalance(this.balances, asset)
      : 0;

    this.sourceBalance = this.userService.findBalance(this.balances, asset);
    if (
      this._selectedSourceAsset &&
      asset.chain === 'ETH' &&
      asset.ticker !== 'ETH'
    ) {
      this.checkContractApproved();
    }

    /**
     * If input value is more than balance of newly selected asset
     * set the input to the max
     */
    if (this.sourceBalance < this.sourceAssetUnit) {
      this.sourceAssetUnit = this.sourceBalance;
    }
  }
  private _selectedSourceAsset: Asset;
  selectedSourceBalance: number;
  sourcePoolDetail: PoolDetail;
  isMaxError: boolean;

  /**
   * To
   */
  get targetAssetUnit() {
    return this._targetAssetUnit;
  }
  set targetAssetUnit(val: BigNumber) {
    this._targetAssetUnit = val;
    this.targetAssetUnitDisplay = val
      ? Number(val.div(10 ** 8).toPrecision())
      : null;
    this.validate();
  }
  private _targetAssetUnit: BigNumber;

  targetAssetUnitDisplay: number;
  targetAssetPrice: number;

  get selectedTargetAsset() {
    return this._selectedTargetAsset;
  }
  set selectedTargetAsset(asset: Asset) {
    this._selectedTargetAsset = asset;
    this.targetAssetUnit = null;
    this.calculatingTargetAsset = true;
    this.updateSwapDetails();
    this.targetBalance = this.userService.findBalance(this.balances, asset);

    if (asset) {
      this.router.navigate([
        '/',
        'swap',
        this.selectedSourceAsset
          ? `${this.selectedSourceAsset.chain}.${this.selectedSourceAsset.symbol}`
          : 'no-asset',
        `${asset.chain}.${asset.symbol}`,
      ]);
    }

    try {
      this.targetClientAddress = this.userService.getAdrressChain(
        this.selectedTargetAsset.chain
      );
    } catch (error) {
      this.targetAddress = undefined;
    }

    this.setTargetAddress();
  }
  private _selectedTargetAsset: Asset;
  targetPoolDetail: PoolDetail;
  subs: Subscription[];

  slip: number;
  slippageTolerance: number;
  user: User;
  basePrice: number;

  balances: Balance[];
  sourceBalance: number;
  targetBalance: number;

  errorMessage: string;
  calculatingTargetAsset: boolean;
  poolDetailTargetError: boolean;
  poolDetailSourceError: boolean;
  selectableMarkets: AssetAndBalance[];
  targetMarketShow: boolean;
  sourceMarketShow: boolean;
  swapData: SwapData;
  confirmShow: boolean;

  runePrice: number;
  selectableSourceMarkets: AssetAndBalance[] = [];
  selectableTargetMarkets: AssetAndBalance[] = [];

  inboundFees: { [key: string]: number } = {};

  outboundFees: { [key: string]: number } = {};
  targetAddress: string;

  /**
   * ETH specific
   */
  ethContractApprovalRequired: boolean;
  ethInboundAddress: PoolAddressDTO;
  availablePools: PoolDTO[];

  inboundAddresses: PoolAddressDTO[];
  ethPool: PoolDTO;
  inputNetworkFee: number;
  outputNetworkFee: number;
  queue: ThorchainQueue;

  appLocked: boolean;
  networkFeeInSource: number;
  currency: Currency;
  sourceChainBalance: number;

  haltedChains: string[];
  targetAddressData: any;
  targetClientAddress: string;
  metaMaskProvider?: ethers.providers.Web3Provider;
  metaMaskNetwork?: 'testnet' | 'mainnet';
  formValidation: {
    message: string;
    isValid: boolean;
    isError: boolean;
  };

  isMobile: boolean = false;
  intel;

  constructor(
    private dialog: MatDialog,
    private userService: UserService,
    private midgardService: MidgardService,
    private slipLimitService: SlippageToleranceService,
    private thorchainPricesService: ThorchainPricesService,
    public overlaysService: OverlaysService,
    private txUtilsService: TransactionUtilsService,
    private networkQueueService: NetworkQueueService,
    private currencyService: CurrencyService,
    private router: Router,
    private route: ActivatedRoute,
    private swapService: SwapServiceService,
    private analytics: AnalyticsService,
    private metaMaskService: MetamaskService,
    private ethUtilService: EthUtilsService,
    private mockClientService: MockClientService,
    private layout: LayoutObserverService,
    public translate: TranslateService
  ) {
    this.ethContractApprovalRequired = false;
    this.selectableMarkets = undefined;
    this.haltedChains = [];
    this.targetAddress = '';
    this.formValidation = {
      message: '',
      isValid: false,
      isError: false,
    };

    console.log(this.translate.intl);

    const layout$ = this.layout.isMobile.subscribe(
      (res) => (this.isMobile = res)
    );

    const balances$ = this.userService.userBalances$
      .pipe(debounceTime(500))
      .subscribe((balances) => {
        this.balances = balances;
        this.sourceBalance = this.userService.findBalance(
          this.balances,
          this.selectedSourceAsset
        );
        this.targetBalance = this.userService.findBalance(
          this.balances,
          this.selectedTargetAsset
        );

        if (
          this.selectedTargetAsset &&
          !this.isRune(this.selectedTargetAsset)
        ) {
          this.updateSwapDetails();
        }

        if (this.selectedSourceAsset) {
          this.setSourceChainBalance();

          if (!this.isRune(this.selectedSourceAsset)) {
            this.updateSwapDetails();
          }
        }
        this.validate();
      });

    const user$ = this.userService.user$.subscribe(async (user) => {
      this.user = user;

      if (!user) {
        this.sourceAssetUnit = null;
        this.selectedTargetAsset = null;
        this.selectedSourceAsset = null;
        this.targetAssetUnit = null;
        this.sourceBalance = undefined;
        this.targetBalance = undefined;
        this.balances = undefined;
      }

      this.setTargetAddress();
      if (this.user && this.user.type === 'metamask') {
        this.router.navigate(['/', 'swap', 'ETH.ETH', 'BTC.BTC']);
      }

      if (
        this.selectedSourceAsset &&
        this.selectedSourceAsset.chain === 'ETH' &&
        this.selectedSourceAsset.ticker !== 'ETH'
      ) {
        this.checkContractApproved();
      }

      // for force changing the selectable markets
      this.setSelectableMarkets();
      this.validate();
    });

    const metaMaskProvider$ = this.metaMaskService.provider$.subscribe(
      (provider) => (this.metaMaskProvider = provider)
    );

    const metaMaskNetwork$ = this.metaMaskService.metaMaskNetwork$.subscribe(
      (network) => {
        this.metaMaskNetwork = network;
        this.validate();
      }
    );

    const queue$ = this.networkQueueService.networkQueue$.subscribe((queue) => {
      this.queue = queue;
      this.validate();
    });

    const slippageTolerange$ =
      this.slipLimitService.slippageTolerance$.subscribe((limit) => {
        this.slippageTolerance = limit;
        this.validate();
      });

    const curs$ = this.currencyService.cur$.subscribe((cur) => {
      this.currency = cur;
    });

    let sourceAmount = this.swapService.getSourceAmount();
    let targetAmount = this.swapService.getTargetAmount();

    if (sourceAmount && targetAmount) {
      this.sourceAssetUnit = sourceAmount;
      this.targetAssetUnit = targetAmount;
      this.swapService.setSource(0);
      this.swapService.setTarget(new BigNumber(0));
    }

    this.subs = [
      balances$,
      user$,
      slippageTolerange$,
      queue$,
      curs$,
      metaMaskProvider$,
      metaMaskNetwork$,
      layout$,
    ];

    this.appLocked = environment.appLocked;
  }

  ngOnInit(): void {
    this.getEthRouter();
    const inboundAddresses$ = this.midgardService.getInboundAddresses();
    const pools$ = this.midgardService.getPools();
    const params$ = this.route.paramMap;
    const combined = combineLatest([inboundAddresses$, pools$, params$]);
    const sub = timer(0, 30000)
      .pipe(
        // combined
        switchMap(() => combined),
        retryWhen((errors) => errors.pipe(delay(10000), take(10)))
      )
      .subscribe(([inboundAddresses, pools, params]) => {
        this.inboundAddresses = inboundAddresses;

        // check for halted chains
        this.setHaltedChains();

        // set ETH pool if available
        const ethPool = pools.find((pool) => pool.asset === 'ETH.ETH');
        if (ethPool) {
          this.ethPool = ethPool;
        }

        this.setAvailablePools(pools);
        this.setSelectableMarkets();

        // update network fees
        this.setNetworkFees();

        // on init, set target asset
        const sourceAssetName = params.get('sourceAsset');
        const targetAssetName = params.get('targetAsset');

        if (
          sourceAssetName &&
          targetAssetName &&
          sourceAssetName == targetAssetName
        ) {
          this.router.navigate(['/', 'swap', 'THOR.RUNE', 'BTC.BTC']);
          return;
        } else if (
          this.selectableTargetMarkets &&
          !this.selectedSourceAsset &&
          !this.selectedTargetAsset
        ) {
          if (sourceAssetName && sourceAssetName !== 'no-asset') {
            this.setSelectedSourceAsset(
              new Asset(sourceAssetName),
              this.selectableTargetMarkets
            );
          }

          if (targetAssetName && targetAssetName !== 'no-asset') {
            this.setSelectedTargetAsset(
              new Asset(targetAssetName),
              this.selectableTargetMarkets
            );
          }
        }
        this.validate();
      });

    this.subs.push(sub);
  }

  ngOnChanges(): void {
    this.validate();
  }

  setSelectedSourceAsset(asset: Asset, selectableMarkets: AssetAndBalance[]) {
    // ensure match exists
    const match = selectableMarkets.find(
      (market) => assetToString(market.asset) === assetToString(asset)
    );

    if (match) {
      this.ethContractApprovalRequired = false;
      if (this.selectedSourceAsset) {
        this.targetAssetUnit = null;
        this.calculatingTargetAsset = true;
      }
      this._selectedSourceAsset = asset;
      this.updateSwapDetails();
      this.sourceBalance = this.userService.findBalance(this.balances, asset);
      if (asset.chain === 'ETH' && asset.ticker !== 'ETH') {
        this.checkContractApproved();
      }

      /**
       * If input value is more than balance of newly selected asset
       * set the input to the max
       */
      if (this.sourceBalance < this.sourceAssetUnit) {
        this.sourceAssetUnit = this.sourceBalance;
      }

      this.setSourceChainBalance();
      this.validate();
    }
  }

  setSelectedTargetAsset(asset: Asset, selectableMarkets: AssetAndBalance[]) {
    // ensure match exists
    const match = selectableMarkets.find(
      (market) => assetToString(market.asset) === assetToString(asset)
    );
    if (match) {
      this._selectedTargetAsset = asset;
      this.targetAssetUnit = null;
      this.calculatingTargetAsset = true;
      this.updateSwapDetails();
      this.targetBalance = this.userService.findBalance(this.balances, asset);
      this.setTargetAddress();
    }
    this.validate();
  }

  setTargetAddress() {
    if (this.selectedTargetAsset && this.user) {
      this.targetAddress = this.userService.getTokenAddress(
        this.user,
        this.selectedTargetAsset.chain
      );
      this.setClientTargetAddress();
    }
    this.validate();
  }

  setSourceChainBalance() {
    if (this.selectedSourceAsset && this.balances) {
      const sourceChainAsset = getChainAsset(this.selectedSourceAsset?.chain);
      const sourceChainBalance = this.userService.findBalance(
        this.balances,
        sourceChainAsset
      );
      this.sourceChainBalance = sourceChainBalance ?? 0;
    } else {
      this.sourceChainBalance = 0;
    }
    this.validate();
  }

  launchEditTargetAddressModal() {
    if (!this.selectedTargetAsset || !this.user) {
      return;
    }

    this.targetAddressData = {
      chain: this.selectedTargetAsset.chain,
      targetAddress: this.targetAddress,
      user: this.user,
    };

    this.analytics.event(
      'swap_prepare',
      'select_receive_container_target_address'
    );
    this.overlaysService.setCurrentSwapView('Update-target');

    // const dialogRef = this.dialog.open(UpdateTargetAddressModalComponent, {
    //   minWidth: '260px',
    //   maxWidth: '420px',
    //   width: '50vw',
    //   data: {
    //     chain: this.selectedTargetAsset.chain,
    //     targetAddress: this.targetAddress,
    //     user: this.user,
    //   },
    // });

    // dialogRef.afterClosed().subscribe((newAddress: string) => {
    // });
  }

  editTargetAddressClose(newAddress: string) {
    if (newAddress && newAddress.length > 0) {
      this.targetAddress = newAddress;
    }
    this.validate();
  }

  breadcrumbNav(val: string) {
    if (val === 'skip') {
      if (!this.user)
        this.analytics.event('swap_disconnected', 'breadcrumb_skip');
      else if (this.user)
        this.analytics.event('swap_prepare', 'breadcrumb_skip');
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    }
  }

  switchNav(val: string) {
    if (val === 'left') {
      this.router.navigate(['/', 'swap']);
    } else if (val === 'right') {
      if (!this.user) this.analytics.event('swap_disconnected', 'switch_pool');
      else if (this.user) {
        this.analytics.event('swap_prepare', 'switch_pool');
      }
      this.router.navigate(['/', 'pool']);
    }
  }

  marketModal(val: 'source' | 'target') {
    if (val === 'source') {
      if (this.user)
        this.analytics.event('swap_prepare', 'select_send_container_asset');
      this.overlaysService.setCurrentSwapView('SourceAsset');
    } else if (val === 'target') {
      console.log(this.overlaysService.getCurrentSwapView());
      if (this.user)
        this.analytics.event('swap_prepare', 'select_receive_container_asset');
      this.overlaysService.setCurrentSwapView('TargetAsset');
    }
  }

  setClientTargetAddress() {
    try {
      this.targetClientAddress = this.userService.getAdrressChain(
        this.selectedTargetAsset.chain
      );
    } catch (error) {
      this.targetAddress = undefined;
    }
  }

  marketNav(val: string) {
    if (val === 'skip') {
      if (this.user)
        this.analytics.event('swap_asset_search', 'breadcrumb_skip');
      this.overlaysService.setCurrentSwapView('Swap');
    } else if (val === 'swap') {
      if (this.user)
        this.analytics.event('swap_asset_search', 'breadcrumb_swap');
      this.overlaysService.setCurrentSwapView('Swap');
    }
  }

  setNetworkFees() {
    if (!this.availablePools || !this.inboundAddresses) {
      return;
    }

    for (const pool of this.availablePools) {
      const asset = new Asset(pool.asset);

      const assetOutboundFee = this.txUtilsService.calculateNetworkFee(
        asset,
        this.inboundAddresses,
        'OUTBOUND',
        pool
      );

      const assetInboundFee = this.txUtilsService.calculateNetworkFee(
        asset,
        this.inboundAddresses,
        'INBOUND',
        pool
      );

      this.outboundFees[pool.asset] = assetOutboundFee;
      this.inboundFees[pool.asset] = assetInboundFee;
    }

    // set THOR.RUNE network fees
    this.outboundFees['THOR.RUNE'] = this.txUtilsService.calculateNetworkFee(
      new Asset('THOR.RUNE'),
      this.inboundAddresses,
      'OUTBOUND'
    );

    this.inboundFees['THOR.RUNE'] = this.txUtilsService.calculateNetworkFee(
      new Asset('THOR.RUNE'),
      this.inboundAddresses,
      'INBOUND'
    );

    this.validate();
  }

  goToSettings() {
    if (this.slip)
      this.analytics.event(
        'swap_prepare',
        'select_slip_tolerance_slip_visible'
      );
    else this.analytics.event('swap_prepare', 'select_slip_tolerance');

    this.overlaysService.setSettingViews(
      MainViewsEnum.AccountSetting,
      'SLIP',
      true
    );

    this.swapService.setSource(this.sourceAssetUnit);
    this.swapService.setTarget(this.targetAssetUnit);
  }

  transactionSuccess() {
    this.targetAssetUnit = null;
    this.sourceAssetUnit = null;
  }

  isRune(asset: Asset): boolean {
    return asset && asset.ticker === 'RUNE'; // covers BNB and native
  }

  isNativeRune(asset: Asset): boolean {
    return assetToString(asset) === 'THOR.RUNE';
  }

  getEthRouter() {
    this.midgardService.getInboundAddresses().subscribe((addresses) => {
      const ethInbound = addresses.find((inbound) => inbound.chain === 'ETH');
      if (ethInbound) {
        this.ethInboundAddress = ethInbound;
      }
    });
  }

  setHaltedChains() {
    this.haltedChains = this.inboundAddresses
      .filter((inboundAddress) => inboundAddress.halted)
      .map((inboundAddress) => inboundAddress.chain);
    this.validate();
  }

  setAvailablePools(pools: PoolDTO[]) {
    this.availablePools = pools
      .filter((pool) => pool.status === 'available')
      .filter(
        (pool) => !this.haltedChains.includes(new Asset(pool.asset).chain)
      );
    this.validate();
  }

  setSelectableMarkets() {
    if (!this.availablePools || this.availablePools.length == 0) {
      this.selectableSourceMarkets = [];
      this.selectableTargetMarkets = [];
    } else {
      const availablePools = this.availablePools
        .sort((a, b) => a.asset.localeCompare(b.asset))
        .map((pool) => ({
          asset: new Asset(pool.asset),
          assetPriceUSD: +pool.assetPriceUSD,
        }));

      this.selectableSourceMarkets =
        this.userService.filterAvailableSourceChains({
          userType: this.user?.type,
          assets: availablePools,
        });

      this.selectableTargetMarkets = availablePools;
      const runeMarket = {
        asset: new Asset('THOR.RUNE'),
        assetPriceUSD: this.thorchainPricesService.estimateRunePrice(
          this.availablePools
        ),
      };

      this.selectableTargetMarkets.unshift(runeMarket);

      if (
        this.userService.clientAvailableChains()?.includes(Chain.THORChain) ||
        !this.user
      ) {
        // Keeping RUNE at top by default
        this.selectableSourceMarkets.unshift(runeMarket);
      }
    }
    this.validate();
  }

  async checkContractApproved() {
    if (this.ethInboundAddress && this.user) {
      const assetAddress = this.selectedSourceAsset.symbol.slice(
        this.selectedSourceAsset.ticker.length + 1
      );
      const strip0x = assetAddress.substr(2);
      const provider =
        this.user.type === 'keystore' ||
        this.user.type === 'XDEFI' ||
        this.user.type === 'walletconnect'
          ? this.user.clients.ethereum.getProvider()
          : this.metaMaskProvider;
      const userAddress =
        this.user.type === 'keystore' ||
        this.user.type === 'XDEFI' ||
        this.user.type === 'walletconnect'
          ? this.user.clients.ethereum.getAddress()
          : await this.metaMaskProvider.getSigner().getAddress();

      const isApproved = await this.ethUtilService.isApproved(
        provider,
        strip0x,
        this.ethInboundAddress.router,
        userAddress
      );
      this.ethContractApprovalRequired = !isApproved;
    }
    this.validate();
  }

  contractApproved() {
    this.ethContractApprovalRequired = false;
  }

  validate() {
    if (this.appLocked) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.maintenance'),
        isValid: true,
        isError: false,
      };
      return;
    }

    /** No user / balances */
    if (!this.user) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.connect'),
        isValid: false,
        isError: false,
      };
      return;
    }

    if (this.user && !this.balances) {
      this.formValidation = {
        // eslint-disable-next-line prettier/prettier
        message: this.translate.format('breadcrumb.loadingBalance'),
        isValid: false,
        isError: false,
      };
      return;
    }

    /** THORChain is backed up */
    if (this.queue && this.queue.outbound >= 20) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.txQueue', {
          queue: this.queue.outbound
        }),
        isValid: false,
        isError: this.queue.outbound>40? true:false,
      };
      return;
    }

    /** asset missing */
    if (!this.selectedSourceAsset || !this.selectedTargetAsset) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.select'),
        isValid: false,
        isError: false,
      };
      return;
    }

    if (
      this.selectedSourceAsset.chain === 'ETH' &&
      this.ethContractApprovalRequired
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.approval'),
        isValid: false,
        isError: false,
      };
      return;
    }

    if (this.haltedChains.includes(this.selectedSourceAsset.chain)) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.halted', {
          chain: this.selectedSourceAsset.chain,
        }),
        isValid: false,
        isError: true,
      };
      return;
    }

    if (this.haltedChains.includes(this.selectedTargetAsset.chain)) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.halted', {
          chain: this.selectedTargetAsset.chain,
        }),
        isValid: false,
        isError: true,
      };
      return;
    }

    if (
      this.selectedSourceAsset.chain === 'THOR' &&
      this.sourceBalance - this.sourceAssetUnit < 3
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.minRune'),
        isValid: false,
        isError: true,
      };
      return;
    }

    /** No source amount set */
    if (!this.sourceAssetUnit || !this.targetAssetUnit) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.prepare'),
        isValid: false,
        isError: false,
      };
      return;
    }

    /** Input Amount is less than network fees */
    if (
      this.sourceChainBalance <
      1.05 *
        this.inboundFees[
          assetToString(getChainAsset(this.selectedSourceAsset.chain))
        ]
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.insufficient', {
          asset: this.selectedSourceAsset.chain,
        }),
        isValid: false,
        isError: true,
      };
      return;
    }

    /** Output Amount is less than network fees */
    if (
      this.targetAssetUnitDisplay <
      this.outboundFees[assetToString(this.selectedTargetAsset)]
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.outputFee'),
        isValid: false,
        isError: true,
      };
      return;
    }

    if (!this.inboundAddresses) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.loading'),
        isValid: false,
        isError: false,
      };
      return;
    }

    /** Source amount is higher than user spendable amount */
    if (
      this.sourceAssetUnit >
      this.userService.maximumSpendableBalance(
        this.selectedSourceAsset,
        this.sourceBalance,
        this.inboundAddresses
      )
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.insufficientBalance'),
        isValid: false,
        isError: true,
      };
      return;
    }

    /** Amount is too low, considered "dusting" */
    if (
      this.sourceAssetUnit <=
        this.userService.minimumSpendable(this.selectedSourceAsset) ||
      this.targetAssetUnitDisplay <=
        this.userService.minimumSpendable(this.selectedTargetAsset)
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.amountTooLow'),
        isValid: false,
        isError: true,
      };
      return;
    }

    /** Exceeds slip tolerance set in user settings */
    if (this.slip * 100 > this.slippageTolerance) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.slipLimit'),
        isValid: false,
        isError: true,
      };
      return;
    }

    /** Validate Address */
    if (
      !this.mockClientService
        .getMockClientByChain(this.selectedTargetAsset.chain)
        .validateAddress(this.targetAddress)
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.validAddress'),
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
        message: this.translate.format('breadcrumb.metamaskNetwork'),
        isValid: false,
        isError: true,
      };
      return;
    }

    /** Good to go */
    if (
      this.user &&
      this.sourceAssetUnit &&
      this.sourceAssetUnit <= this.sourceBalance &&
      this.selectedTargetAsset
    ) {
      this.formValidation = {
        message: this.translate.format('breadcrumb.ready'),
        isValid: true,
        isError: false,
      };
      return;
    } else {
      console.warn('error creating main button text');
      this.formValidation = {
        message: '',
        isValid: false,
        isError: true,
      };
    }
  }

  swapTextButton() {
    /** CHECK that there is non wallet address that the user wants to send */
    if (this.selectedTargetAsset && this.user) {
      if (
        this.targetAddress &&
        this.targetAddress.localeCompare(this.targetClientAddress, undefined, {
          sensitivity: 'accent',
        })
      ) {
        // eslint-disable-next-line prettier/prettier
        let address = `${this.targetAddress.substring( 0, 6 )}...${this.targetAddress.substring( this.targetAddress.length - 6, this.targetAddress.length )}`;
        return this.translate.format('swap.swapReceive', {
          address: address,
        });
      }
    }

    return this.translate.format('common.swap');
  }

  connectWallet() {
    /** Add analytics to the wallet connect */
    this.analytics.event('swap_disconnected', 'button_connect_wallet');
    this.overlaysService.setCurrentSwapView('Connect');
  }

  getBalance() {
    return (
      this.selectedSourceAsset &&
      this.sourceBalance &&
      this.sourceAssetUnit >
        this.userService.maximumSpendableBalance(
          this.selectedSourceAsset,
          this.sourceBalance,
          this.inboundAddresses
        )
    );
  }

  openConfirmationDialog() {
    const output = this.targetAssetUnit.div(10 ** 8);

    let sourceAsset = this.selectableSourceMarkets.find(
      (asset) =>
        assetToString(asset.asset) === assetToString(this.selectedSourceAsset)
    );
    let targetAsset = this.selectableTargetMarkets.find(
      (asset) =>
        assetToString(asset.asset) === assetToString(this.selectedTargetAsset)
    );

    sourceAsset = { ...sourceAsset, balance: assetAmount(this.sourceBalance) };
    targetAsset = { ...targetAsset, balance: assetAmount(this.targetBalance) };

    this.swapData = {
      sourceAsset: sourceAsset,
      targetAsset: targetAsset,
      basePrice: this.basePrice,
      inputValue: this.sourceAssetUnit,
      outputValue: output,
      user: this.user,
      slip: this.slip,
      balance: this.sourceBalance,
      runePrice: this.runePrice,
      networkFeeInSource: this.networkFeeInSource,
      targetAddress: this.targetAddress,
    };

    /** This is button analytics */
    this.analytics.event(
      'swap_prepare',
      `button_swap_*FROM_ASSET*_*TO_ASSET*_usd_*numerical_usd_value*`,
      this.sourceAssetUnit * this.sourceAssetPrice,
      assetString(this.selectedSourceAsset),
      assetString(this.selectedTargetAsset),
      (this.sourceAssetUnit * this.sourceAssetPrice).toString()
    );

    if (
      this.userService.getTokenAddress(
        this.user,
        this.selectedTargetAsset.chain
      ) !== this.targetAddress
    )
      this.analytics.event(
        'swap_prepare',
        `button_swap_*FROM_ASSET*_*TO_ASSET*_target_address`,
        undefined,
        assetString(this.selectedSourceAsset),
        assetString(this.selectedTargetAsset)
      );

    this.analytics.event(
      'swap_prepare',
      `button_swap_*FROM_ASSET*_*TO_ASSET*_slip_%_*numerical_%_value*`,
      this.slip * 100,
      assetString(this.selectedSourceAsset),
      assetString(this.selectedTargetAsset),
      (this.slip * 100).toString()
    );

    let feeAmountUSD = this.sourceAssetPrice * this.networkFeeInSource;
    this.analytics.event(
      'swap_prepare',
      `button_swap_*FROM_ASSET*_*TO_ASSET*_fee_usd_*numerical_usd_value*`,
      feeAmountUSD,
      assetString(this.selectedSourceAsset),
      assetString(this.selectedTargetAsset),
      feeAmountUSD.toString()
    );

    this.overlaysService.setCurrentSwapView('Confirm');
  }

  updateSwapDetails() {
    if (this.selectedSourceAsset && this.selectedTargetAsset) {
      this.calculateTargetUnits();
    } else {
      this.calculatingTargetAsset = false;
    }

    // Getting the source asset price from selected pools
    if (this.selectableSourceMarkets && this._selectedSourceAsset) {
      this.sourceAssetPrice = this.selectableSourceMarkets.find(
        (pool) =>
          assetToString(pool.asset) === assetToString(this.selectedSourceAsset)
      )?.assetPriceUSD;
    }

    // Getting the target asset price from selected pools
    if (
      this.selectableTargetMarkets &&
      this.balances &&
      this._selectedTargetAsset
    ) {
      this.targetAssetPrice = this.selectableTargetMarkets.find(
        (pool) =>
          assetToString(pool.asset) === assetToString(this.selectedTargetAsset)
      )?.assetPriceUSD;
    }

    if (
      this.selectableTargetMarkets &&
      this.balances &&
      this._selectedSourceAsset
    ) {
      this.runePrice = this.selectableTargetMarkets.find(
        (asset) => `${asset.asset.chain}.${asset.asset.ticker}` === `THOR.RUNE`
      )?.assetPriceUSD;
    }

    this.validate();
  }

  async calculateTargetUnits() {
    if (
      this._sourceAssetTokenValue &&
      this.availablePools &&
      this.availablePools.length > 0
    ) {
      const swapType =
        this.isRune(this.selectedSourceAsset) ||
        this.isRune(this.selectedTargetAsset)
          ? SwapType.SINGLE_SWAP
          : SwapType.DOUBLE_SWAP;

      if (swapType === SwapType.SINGLE_SWAP) {
        this.calculateSingleSwap();
      } else if (
        swapType === SwapType.DOUBLE_SWAP &&
        this.availablePools.find(
          (pool) => pool.asset === assetToString(this.selectedTargetAsset)
        ) &&
        this.availablePools.find(
          (pool) => pool.asset === assetToString(this.selectedSourceAsset)
        )
      ) {
        this.calculateDoubleSwap();
      }
    } else {
      this.calculatingTargetAsset = false;
    }
    this.validate();
  }

  setMaxError(val) {
    this.isMaxError = val;

    setTimeout(() => {
      this.isMaxError = false;
    }, 2000);
  }

  reverseTransaction() {
    if (this.selectedSourceAsset && this.selectedTargetAsset) {
      const source = this.selectedSourceAsset;
      const target = this.selectedTargetAsset;
      const targetInput = this.targetAssetUnit;
      const targetBalance = this.targetBalance;

      this.selectedTargetAsset = source;
      this.selectedSourceAsset = target;

      if (targetBalance && targetInput) {
        const max = this.userService.maximumSpendableBalance(
          target,
          targetBalance,
          this.inboundAddresses
        );

        this.sourceAssetUnit =
          targetBalance < targetInput.div(10 ** 8).toNumber() // if target balance is less than target input
            ? max // use balance
            : targetInput.div(10 ** 8).toNumber(); // otherwise use input value
      } else {
        this.sourceAssetUnit = targetInput
          ? targetInput.div(10 ** 8).toNumber()
          : 0;
      }

      this.analytics.event(
        'swap_prepare',
        'switch_arrow_send_receive_containers'
      );
    }
    this.validate();
  }

  reverseTransactionDisabled(): boolean {
    return (
      !this.selectedSourceAsset ||
      !this.selectedTargetAsset ||
      (this.user?.type === 'metamask' &&
        this.selectedTargetAsset?.chain !== 'ETH') ||
      (this.user?.type === 'walletconnect' &&
        !this.userService
          .clientAvailableChains()
          .includes(this.selectedTargetAsset?.chain))
    );
  }

  /**
   * When RUNE is one of the assets being exchanged
   * For example RUNE <==> DAI
   */
  calculateSingleSwap() {
    const toRune = this.isRune(this.selectedTargetAsset) ? true : false;

    const poolDetail = toRune
      ? this.availablePools.find(
          (pool) => pool.asset === assetToString(this.selectedSourceAsset)
        )
      : this.availablePools.find(
          (pool) => pool.asset === assetToString(this.selectedTargetAsset)
        );

    if (poolDetail) {
      const pool: PoolData = {
        assetBalance: baseAmount(poolDetail.assetDepth),
        runeBalance: baseAmount(poolDetail.runeDepth),
      };

      /**
       * TO SHOW BASE PRICE
       */

      const valueOfRuneInAsset = getValueOfRuneInAsset(
        assetToBase(assetAmount(1)),
        pool
      );
      const valueOfAssetInRune = getValueOfAssetInRune(
        assetToBase(assetAmount(1)),
        pool
      );

      const basePrice = toRune ? valueOfRuneInAsset : valueOfAssetInRune;
      this.basePrice = basePrice
        .amount()
        .div(10 ** 8)
        .toNumber();

      /**
       * Slip percentage using original input
       */
      const slip = getSwapSlip(this._sourceAssetTokenValue, pool, toRune);
      this.slip = slip.toNumber();

      const inboundFee =
        this.inboundFees[assetToString(this.selectedSourceAsset)];
      const outboundFee =
        this.outboundFees[assetToString(this.selectedTargetAsset)];
      const outboundFeeInSourceVal = this.basePrice * outboundFee;

      this.networkFeeInSource = inboundFee + outboundFeeInSourceVal;

      /**
       * Total output amount in target units minus RUNE Fee
       */
      let sourceValue = this._sourceAssetTokenValue.amount();
      if (assetIsChainAsset(this.selectedSourceAsset)) {
        sourceValue.minus(assetToBase(assetAmount(inboundFee)).amount())
      }

      const swapOutput = getSwapOutput(
        baseAmount(sourceValue),
        pool,
        toRune
      );

      // sub
      const totalAmount = baseAmount(
        swapOutput
          .amount()
          .minus(assetToBase(assetAmount(outboundFee)).amount())
      );

      if (this.sourceAssetUnit) {
        this.targetAssetUnit = totalAmount.amount().isLessThan(0)
          ? bn(0)
          : totalAmount.amount();
      } else {
        this.targetAssetUnit = this.sourceAssetUnit
          ? totalAmount.amount().isLessThan(0)
            ? bn(0)
            : totalAmount.amount()
          : null;
      }
    }

    this.calculatingTargetAsset = false;
    this.validate();
  }

  /**
   * Asset <==> Asset
   * RUNE is not being directly exchanged
   * For example DAI <==> BUSD
   */
  calculateDoubleSwap() {
    const sourcePool = this.availablePools.find(
      (pool) => pool.asset === assetToString(this.selectedSourceAsset)
    );
    const targetPool = this.availablePools.find(
      (pool) => pool.asset === assetToString(this.selectedTargetAsset)
    );

    if (sourcePool && targetPool) {
      const pool1: PoolData = {
        assetBalance: baseAmount(sourcePool.assetDepth),
        runeBalance: baseAmount(sourcePool.runeDepth),
      };
      const pool2: PoolData = {
        assetBalance: baseAmount(targetPool.assetDepth),
        runeBalance: baseAmount(targetPool.runeDepth),
      };

      this.inputNetworkFee = this.txUtilsService.calculateNetworkFee(
        this.selectedSourceAsset,
        this.inboundAddresses,
        'INBOUND',
        sourcePool
      );
      this.outputNetworkFee = this.txUtilsService.calculateNetworkFee(
        this.selectedTargetAsset,
        this.inboundAddresses,
        'OUTBOUND',
        targetPool
      );

      const basePrice = getDoubleSwapOutput(
        assetToBase(assetAmount(1)),
        pool2,
        pool1
      );
      this.basePrice = basePrice
        .amount()
        .div(10 ** 8)
        .toNumber();

      const outboundFeeInSourceVal = this.basePrice * this.outputNetworkFee;
      this.networkFeeInSource = this.inputNetworkFee + outboundFeeInSourceVal;

      const slip = getDoubleSwapSlip(this._sourceAssetTokenValue, pool1, pool2);
      this.slip = slip.toNumber();

      const total = getDoubleSwapOutput(
        baseAmount(
          this._sourceAssetTokenValue
            .amount()
            .minus(assetToBase(assetAmount(this.inputNetworkFee)).amount())
        ),
        pool1,
        pool2
      )
        .amount()
        .minus(assetToBase(assetAmount(this.outputNetworkFee)).amount());

      if (this.sourceAssetUnit) {
        this.targetAssetUnit = total.isLessThan(0) ? bn(0) : total;
      } else {
        this.targetAssetUnit = null;
      }
    }

    this.calculatingTargetAsset = false;
    this.validate();
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
