import { Component, OnInit, OnDestroy } from '@angular/core';
import { Asset } from '../_classes/asset';
import { UserService } from '../_services/user.service';
import { combineLatest, Subscription, timer } from 'rxjs';
import {
  getDoubleSwapOutput,
  getSwapSlip,
  getDoubleSwapSlip,
  PoolData,
  getValueOfAssetInRune,
  getValueOfRuneInAsset,
  getSwapOutput
} from '@thorchain/asgardex-util';
import BigNumber from 'bignumber.js';
import {
  bn,
  baseAmount,
  BaseAmount,
  assetToBase,
  assetAmount,
  assetToString,
} from '@xchainjs/xchain-util';
import { PoolDetail } from '../_classes/pool-detail';
import { MidgardService, ThorchainQueue } from '../_services/midgard.service';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmSwapModalComponent, SwapData } from './confirm-swap-modal/confirm-swap-modal.component';
import { User } from '../_classes/user';
import { Balances } from '@xchainjs/xchain-client';
import { AssetAndBalance } from '../_classes/asset-and-balance';
import { PoolDTO } from '../_classes/pool';
import { SlippageToleranceService } from '../_services/slippage-tolerance.service';
import { PoolAddressDTO } from '../_classes/pool-address';
import { MainViewsEnum, OverlaysService } from '../_services/overlays.service';
import { ThorchainPricesService } from '../_services/thorchain-prices.service';
import { TransactionUtilsService } from '../_services/transaction-utils.service';
import { NetworkQueueService } from '../_services/network-queue.service';
import { retry, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment'; 
import { CurrencyService } from '../_services/currency.service';
import { Currency } from '../_components/account-settings/currency-converter/currency-converter.component';

export enum SwapType {
  DOUBLE_SWAP = 'double_swap',
  SINGLE_SWAP = 'single_swap',
}

@Component({
  selector: 'app-swap',
  templateUrl: './swap.component.html',
  styleUrls: ['./swap.component.scss']
})
export class SwapComponent implements OnInit, OnDestroy {

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
    
    if (this._selectedSourceAsset) {
      this.updateSwapDetails();
    }
    this.sourceBalance = this._selectedSourceAsset ? this.userService.findBalance(this.balances, asset) : 0;
    
    this.sourceBalance = this.userService.findBalance(this.balances, asset);
    if (this._selectedSourceAsset && asset.chain === 'ETH' && asset.ticker !== 'ETH') {
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

  /**
   * To
   */
  get targetAssetUnit() {
    return this._targetAssetUnit;
  }
  set targetAssetUnit(val: BigNumber) {
    this._targetAssetUnit = val;
    this.targetAssetUnitDisplay = (val) ? Number(val.div(10 ** 8).toPrecision()) : null;
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
  }
  private _selectedTargetAsset: Asset;
  targetPoolDetail: PoolDetail;
  subs: Subscription[];

  slip: number;
  slippageTolerance: number;
  user: User;
  basePrice: number;

  balances: Balances;
  sourceBalance: number;
  targetBalance: number;

  errorMessage: string;
  calculatingTargetAsset: boolean;
  poolDetailTargetError: boolean;
  poolDetailSourceError: boolean;

  insufficientBnb: boolean;
  selectableMarkets: AssetAndBalance[];
  targetMarketShow: boolean;
  sourceMarketShow: boolean;
  swapData: SwapData;
  confirmShow: boolean;

  runePrice: number;

  inboundFees: {
    [key: string]: number
  } = {};

  outboundFees: {
    [key: string]: number
  } = {};

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

  constructor(
    private dialog: MatDialog,
    private userService: UserService,
    private midgardService: MidgardService,
    private slipLimitService: SlippageToleranceService,
    private thorchainPricesService: ThorchainPricesService,
    public overlaysService: OverlaysService,  
    private txUtilsService: TransactionUtilsService,
    private networkQueueService: NetworkQueueService,
    private currencyService: CurrencyService) {

    this.selectedSourceAsset = new Asset('THOR.RUNE');
    this.ethContractApprovalRequired = false;
    this.selectableMarkets = undefined;
    // Just in case at the begining There is no Source Asset yet.
    // this.selectedSourceAsset = new Asset(`BNB.${this.runeSymbol}`);
    // this.overlaysService.setCurrentSwapView('Swap');
    // this.overlayShow = false;
    // this.targetMarketShow = false;
    // this.sourceMarketShow = false;
    // this.confirmShow = false;

    const balances$ = this.userService.userBalances$.subscribe(
      (balances) => {
        this.balances = balances;
        this.sourceBalance = this.userService.findBalance(this.balances, this.selectedSourceAsset);
        this.targetBalance = this.userService.findBalance(this.balances, this.selectedTargetAsset);

        const bnbBalance = this.userService.findBalance(this.balances, new Asset('BNB.BNB'));
        this.insufficientBnb = bnbBalance < 0.000375;

        if (this.selectedTargetAsset && !this.isRune(this.selectedTargetAsset)) {
          this.updateSwapDetails();
        }

        if (this.selectedSourceAsset && !this.isRune(this.selectedSourceAsset)) {
          this.updateSwapDetails();
        }

      }
    );


    const user$ = this.userService.user$.subscribe(
      async (user) => {
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
      }
    );

    const queue$ = this.networkQueueService.networkQueue$.subscribe(
      (queue) => this.queue = queue
    );

    const slippageTolerange$ = this.slipLimitService.slippageTolerance$.subscribe(
      (limit) => this.slippageTolerance = limit
    );

    const curs$ = this.currencyService.cur$.subscribe(
      (cur) => {
        this.currency = cur;
      }
    )

    this.subs = [balances$, user$, slippageTolerange$, queue$, curs$];

    this.appLocked = environment.appLocked;
  }

  ngOnInit(): void {
    this.getEthRouter();

    const inboundAddresses$ = this.midgardService.getInboundAddresses();
    const pools$ = this.midgardService.getPools();
    const combined = combineLatest([inboundAddresses$, pools$]);
    const sub = timer(0, 30000).pipe(
      // combined
      switchMap(() => combined),
      retry(),
    ).subscribe( ([inboundAddresses, pools]) => {

      this.inboundAddresses = inboundAddresses;

      // set ETH pool if available
      const ethPool = pools.find( (pool) => pool.asset === 'ETH.ETH' );
      if (ethPool) {
        this.ethPool = ethPool;
      }

      this.setAvailablePools(pools);
      this.setSelectableMarkets();

      // on init, set target asset
      if (!this.selectedTargetAsset) {
        const btcMarket = this.selectableMarkets.find( (market) => market.asset.chain === 'BTC' && market.asset.symbol === 'BTC' );
        if (btcMarket) {
          this.selectedTargetAsset = btcMarket.asset;
        }
      }

      // update network fees
      this.setNetworkFees();

      // update swap detail values
      this.updateSwapDetails();

    });

    this.subs.push(sub);

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
      'OUTBOUND',
    );

    this.inboundFees['THOR.RUNE'] = this.txUtilsService.calculateNetworkFee(
      new Asset('THOR.RUNE'),
      this.inboundAddresses,
      'INBOUND',
    );

  }

  goToSettings() {
    this.overlaysService.setSettingViews(MainViewsEnum.AccountSetting, 'SLIP');
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
    this.midgardService.getInboundAddresses().subscribe(
      (addresses) => {
        const ethInbound = addresses.find( (inbound) => inbound.chain === 'ETH' );
        if (ethInbound) {
          this.ethInboundAddress = ethInbound;
        }
      }
    );
  }

  setAvailablePools(pools: PoolDTO[]) {
    this.availablePools = pools.filter( (pool) => pool.status === 'available' );
  }

  setSelectableMarkets() {

    if (!this.availablePools) {
      this.selectableMarkets = [];
    } else {
      this.selectableMarkets = this.availablePools
      .sort( (a, b) => a.asset.localeCompare(b.asset) )
      .map((pool) => ({
        asset: new Asset(pool.asset),
        assetPriceUSD: +pool.assetPriceUSD
      }))
      // filter out until we can add support
      .filter( (pool) => pool.asset.chain === 'BNB'
        || pool.asset.chain === 'THOR'
        || pool.asset.chain === 'BTC'
        || pool.asset.chain === 'ETH'
        || pool.asset.chain === 'LTC'
        || pool.asset.chain === 'BCH'
      );

      // Keeping RUNE at top by default
      this.selectableMarkets.unshift({
        asset: new Asset('THOR.RUNE'),
        assetPriceUSD: this.thorchainPricesService.estimateRunePrice(this.availablePools)
      });
    }

  }

  async checkContractApproved() {

    if (this.ethInboundAddress && this.user) {
      const assetAddress = this.selectedSourceAsset.symbol.slice(this.selectedSourceAsset.ticker.length + 1);
      const strip0x = assetAddress.substr(2);
      const isApproved = await this.user.clients.ethereum.isApproved(this.ethInboundAddress.router, strip0x, baseAmount(1));
      this.ethContractApprovalRequired = !isApproved;
    }

  }

  contractApproved() {
    this.ethContractApprovalRequired = false;
  }

  formInvalid(): boolean {

    return !this.sourceAssetUnit || !this.selectedSourceAsset || !this.selectedTargetAsset || !this.targetAssetUnit
      || (this.sourceAssetUnit > this.userService.maximumSpendableBalance(this.selectedSourceAsset, this.sourceBalance))
      || (this.sourceAssetUnit <= this.userService.minimumSpendable(this.selectedSourceAsset))
      || (this.targetAssetUnitDisplay <= this.userService.minimumSpendable(this.selectedTargetAsset))
      || !this.user || !this.balances
      || this.ethContractApprovalRequired
      || !(this.sourceBalance > 0) // source is BNB and not enough funds to cover fee
      || (this.queue && this.queue.outbound >= 12)
      || (this.slip * 100) > this.slippageTolerance

      // check source asset amount is greater than network fee
      || this.sourceAssetUnit < (1.5 * this.inboundFees[assetToString(this.selectedSourceAsset)])
      // check target asset amount is greater than outbound network fee * 3
      || this.targetAssetUnitDisplay < (this.outboundFees[assetToString(this.selectedTargetAsset)])

      || (this.selectedSourceAsset.chain === 'BNB' && this.insufficientBnb) // source is BNB and not enough funds to cover fee
      || (this.selectedSourceAsset.chain === 'THOR') && (this.sourceBalance - this.sourceAssetUnit < 3)

      /** TEMPORARILY RESTRICT BTC/LTC -> ERC20 DUE TO BYTE SIZE ERROR */
      || ( (this.selectedSourceAsset.chain === 'BTC' || this.selectedSourceAsset.chain === 'LTC')
        && (this.selectedTargetAsset.chain === 'ETH' && this.selectedTargetAsset.symbol !== 'ETH') );
  }

  // getMessage() {
  //   let message = '';
  //   if(this.isError() != '')
  //     message = this.isError();
  //   else if(this.user && this.balances) {
  //     message = 'prepare';
  //     if (!this.formInvalid())
  //       message = 'ready';
  //   }
  //   else if(this.user && !this.balances)
  //     message = "LOADING BALANCE"
  //   else if(!message)
  //     message = 'connect wallet';
  //   return message
  // }

  isError(): boolean {

    if (this.mainButtonText() == 'Select'
      || this.mainButtonText() == 'Connect wallet'
      || this.mainButtonText() == 'Enter an amount'
      || this.mainButtonText() == 'Swap'
      || this.mainButtonText() == 'LOADING BALANCE'
      || this.mainButtonText() == 'Maintenance Enabled'
    ) {
      return false;
    }

    return true;
  }

  mainButtonText(): string {

    /** App Lock situation */
    if (this.appLocked) {
      return 'Maintenance Enabled';
    }

    /** User Not connected */
    if (!this.user || !this.balances) {
      return 'Connect wallet';
    }

    /** Loading balance from the user */
    if (this.user && !this.balances) {
      return 'LOADING BALANCE';
    }

    /** THORChain is backed up */
    if (this.queue && this.queue.outbound >= 12) {
      return 'THORChain Network Latency';
    }

    /** No target asset selected */
    if (!this.selectedTargetAsset || !this.selectedSourceAsset) {
      return 'Select';
    }

    /** TEMPORARILY RESTRICT BTC/LTC -> ERC20 DUE TO BYTE SIZE ERROR */
    if ( (this.selectedSourceAsset.chain === 'BTC' || this.selectedSourceAsset.chain === 'LTC')
      && (this.selectedTargetAsset.chain === 'ETH' && this.selectedTargetAsset.symbol !== 'ETH') ) {
      return `${this.selectedSourceAsset.chain} -> ERC20 Temporarily Suspended`;
    }

    if ( (this.selectedSourceAsset.chain === 'THOR') && (this.sourceBalance - this.sourceAssetUnit < 3) ) {
      return 'Min 3 RUNE in Wallet Required';
    }

    /** No source amount set */
    if (!this.sourceAssetUnit) {
      return 'Enter an amount';
    }

    /** Input Amount is less than network fees */
    if (this.sourceAssetUnit < (1.5 * this.inboundFees[assetToString(this.selectedSourceAsset)])) {
      return 'Input Amount Less Than Fees';
    }

    /** Output Amount is less than network fees */
    if (this.targetAssetUnitDisplay < (this.outboundFees[assetToString(this.selectedTargetAsset)])) {
      return 'Output Amount Less Than Fees';
    }

    /** Source amount is higher than user spendable amount */
    if (this.sourceAssetUnit > this.userService.maximumSpendableBalance(this.selectedSourceAsset, this.sourceBalance)) {
      return `Insufficient ${this.selectedSourceAsset.chain}.${this.selectedSourceAsset.ticker} balance`;
    }

    /** BNB chain tx and user doesn't have enough BNB  */
    if (this.selectedSourceAsset.chain === 'BNB' && this.insufficientBnb) {
      return 'Insufficient BNB for Fee';
    }

    /** Amount is too low, considered "dusting" */
    if ( (this.sourceAssetUnit <= this.userService.minimumSpendable(this.selectedSourceAsset))
      || (this.targetAssetUnitDisplay <= this.userService.minimumSpendable(this.selectedTargetAsset))) {
        return 'Amount too low';
    }

    /** Exceeds slip tolerance set in user settings */
    if ((this.slip * 100) > this.slippageTolerance) {
      return 'Slip Limit Exceeded';
    }

    /** Good to go */
    if (this.user && this.sourceAssetUnit && this.sourceAssetUnit <= this.sourceBalance && this.selectedTargetAsset) {
      return 'Swap';
    } else {
      console.warn('error creating main button text');
    }

  }

  getBalance() {
    return (this.selectedSourceAsset && this.sourceBalance
      && (this.sourceAssetUnit > this.userService.maximumSpendableBalance(this.selectedSourceAsset, this.sourceBalance)))
  }

  openConfirmationDialog() {
    const output = this.targetAssetUnit.div(10 ** 8);

    let sourceAsset = this.selectableMarkets.find( (asset) => `${asset.asset.chain}.${asset.asset.ticker}` === `${this.selectedSourceAsset.chain}.${this.selectedSourceAsset.ticker}`);
    let targetAsset = this.selectableMarkets.find( (asset) => `${asset.asset.chain}.${asset.asset.ticker}` === `${this.selectedTargetAsset.chain}.${this.selectedTargetAsset.ticker}`);

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
      networkFeeInSource: this.networkFeeInSource
    }


    this.overlaysService.setCurrentSwapView('Confirm')
  }

  updateSwapDetails() {

    if (this.selectedSourceAsset && this.selectedTargetAsset) {
      this.calculateTargetUnits();
    } else {
      this.calculatingTargetAsset = false;
    }

    // Getting the source asset price from selected pools
    if (this.selectableMarkets && this.balances && this._selectedSourceAsset) {
      this.sourceAssetPrice = this.selectableMarkets.find( (pool) => `${pool.asset.chain}.${pool.asset.ticker}` === `${this._selectedSourceAsset.chain}.${this._selectedSourceAsset.ticker}`).assetPriceUSD;
    }

    // Getting the source asset price from selected pools
    if (this.selectableMarkets && this.balances && this._selectedTargetAsset) {
      this.targetAssetPrice = this.selectableMarkets.find( (pool) => `${pool.asset.chain}.${pool.asset.ticker}` === `${this._selectedTargetAsset.chain}.${this._selectedTargetAsset.ticker}`).assetPriceUSD;
    }

    if (this.selectableMarkets && this.balances && this._selectedSourceAsset) {
      this.runePrice = this.selectableMarkets.find( (asset) => `${asset.asset.chain}.${asset.asset.ticker}` === `THOR.RUNE`).assetPriceUSD;
    }
  }

  async calculateTargetUnits() {

    if (this._sourceAssetTokenValue) {

      const swapType = this.isRune(this.selectedSourceAsset) || this.isRune(this.selectedTargetAsset)
        ? SwapType.SINGLE_SWAP
        : SwapType.DOUBLE_SWAP;

      if (swapType === SwapType.SINGLE_SWAP) {
        this.calculateSingleSwap();
      } else if (swapType === SwapType.DOUBLE_SWAP
        && this.availablePools.find( (pool) => pool.asset === assetToString(this.selectedTargetAsset) )
        && this.availablePools.find( (pool) => pool.asset === assetToString(this.selectedSourceAsset))) {

        this.calculateDoubleSwap();

      }

    } else {
      this.calculatingTargetAsset = false;
    }

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

        const max = this.userService.maximumSpendableBalance(target, targetBalance);

        this.sourceAssetUnit = (targetBalance < targetInput.div(10 ** 8).toNumber()) // if target balance is less than target input
          ? max // use balance
          : targetInput.div(10 ** 8 ).toNumber(); // otherwise use input value
      } else {
        this.sourceAssetUnit = (targetInput) ? targetInput.div(10 ** 8).toNumber() : 0;
      }

    }

  }

  /**
   * When RUNE is one of the assets being exchanged
   * For example RUNE <==> DAI
   */
  calculateSingleSwap() {

    const toRune = this.isRune(this.selectedTargetAsset)
      ? true
      : false;

    const poolDetail = (toRune)
      ? this.availablePools.find( (pool) => pool.asset === assetToString(this.selectedSourceAsset) )
      : this.availablePools.find( (pool) => pool.asset === assetToString(this.selectedTargetAsset) );

    if (poolDetail) {
      const pool: PoolData = {
        assetBalance: baseAmount(poolDetail.assetDepth),
        runeBalance: baseAmount(poolDetail.runeDepth),
      };

      /**
       * TO SHOW BASE PRICE
       */

      const valueOfRuneInAsset = getValueOfRuneInAsset(assetToBase(assetAmount(1)), pool);
      const valueOfAssetInRune = getValueOfAssetInRune(assetToBase(assetAmount(1)), pool);

      const basePrice = (toRune)
        ? valueOfRuneInAsset
        : valueOfAssetInRune;
      this.basePrice = basePrice.amount().div(10 ** 8).toNumber();

      /**
       * Slip percentage using original input
       */
      const slip = getSwapSlip(this._sourceAssetTokenValue, pool, toRune);
      this.slip = slip.toNumber();

      const inboundFee = this.inboundFees[assetToString(this.selectedSourceAsset)];
      const outboundFee = this.outboundFees[assetToString(this.selectedTargetAsset)];
      const outboundFeeInSourceVal = this.basePrice * outboundFee;

      this.networkFeeInSource = inboundFee + outboundFeeInSourceVal;

      /**
       * Total output amount in target units minus 1 RUNE
       */
      const swapOutput = getSwapOutput(baseAmount(this._sourceAssetTokenValue.amount()
        .minus(assetToBase(assetAmount(inboundFee)).amount())
      ), pool, toRune);

      // sub
      const totalAmount = baseAmount(swapOutput.amount().minus(
        assetToBase(assetAmount(outboundFee)).amount()));

      if (this.sourceAssetUnit) {
        this.targetAssetUnit = (totalAmount.amount().isLessThan(0)) ? bn(0) : totalAmount.amount();
      } else {
        this.targetAssetUnit = (this.sourceAssetUnit) ? (totalAmount.amount().isLessThan(0)) ? bn(0) : totalAmount.amount() : null;
      }

    }

    this.calculatingTargetAsset = false;

  }

  /**
   * Asset <==> Asset
   * RUNE is not being directly exchanged
   * For example DAI <==> BUSD
   */
  calculateDoubleSwap() {

    const sourcePool = this.availablePools.find( (pool) => pool.asset === assetToString(this.selectedSourceAsset) );
    const targetPool = this.availablePools.find( (pool) => pool.asset === assetToString(this.selectedTargetAsset) );

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

      const basePrice = getDoubleSwapOutput(assetToBase(assetAmount(1)), pool2, pool1);
      this.basePrice = basePrice.amount().div(10 ** 8).toNumber();

      const outboundFeeInSourceVal = this.basePrice * this.outputNetworkFee;
      this.networkFeeInSource = this.inputNetworkFee + outboundFeeInSourceVal;

      const slip = getDoubleSwapSlip(this._sourceAssetTokenValue, pool1, pool2);
      this.slip = slip.toNumber();

      const total = getDoubleSwapOutput(baseAmount(this._sourceAssetTokenValue.amount()
        .minus(assetToBase(assetAmount(this.inputNetworkFee)).amount())
      ), pool1, pool2).amount().minus(assetToBase(assetAmount(this.outputNetworkFee)).amount());

      if (this.sourceAssetUnit) {
        this.targetAssetUnit = (total.isLessThan(0)) ? bn(0) : total;
      } else {
        this.targetAssetUnit = null;
      }

    }

    this.calculatingTargetAsset = false;

  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }

}
