import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatSliderChange } from '@angular/material/slider';
import { ActivatedRoute, Router } from '@angular/router';
import {
  getPoolShare,
  getValueOfAssetInRune,
  getValueOfRuneInAsset,
  PoolData,
  UnitData,
} from '@thorchain/asgardex-util';
import {
  baseAmount,
  assetToBase,
  assetAmount,
  bn,
  assetToString,
  BaseAmount,
  Chain,
} from '@xchainjs/xchain-util';
import BigNumber from 'bignumber.js';
import { combineLatest, Subscription } from 'rxjs';
import { Asset, assetIsChainAsset } from '../_classes/asset';
import { MemberPool } from '../_classes/member';
import { User } from '../_classes/user';
import { LastBlockService } from '../_services/last-block.service';
import { OverlaysService, WithdrawViews } from '../_services/overlays.service';
import { MidgardService, ThorchainQueue } from '../_services/midgard.service';
import { TransactionUtilsService } from '../_services/transaction-utils.service';
import { UserService } from '../_services/user.service';
import { ConfirmWithdrawData } from './confirm-withdraw-modal/confirm-withdraw-modal.component';
import { Balance } from '@xchainjs/xchain-client';
import { debounceTime } from 'rxjs/operators';
import { MetamaskService } from '../_services/metamask.service';
import { environment } from 'src/environments/environment';
import { CurrencyService } from '../_services/currency.service';
import { Currency } from '../_components/account-settings/currency-converter/currency-converter.component';
import { AnalyticsService } from '../_services/analytics.service';
import {
  AvailablePoolTypeOptions,
  PoolTypeOption,
} from '../_const/pool-type-options';
import { formatNumber } from '@angular/common';
import { PoolDTO } from '../_classes/pool';
import { Liquidity } from '../_classes/liquidiyt';

@Component({
  selector: 'app-withdraw',
  templateUrl: './withdraw.component.html',
  styleUrls: ['./withdraw.component.scss'],
})
export class WithdrawComponent implements OnInit, OnDestroy {
  poolData: PoolDTO;
  userThorValue: any;
  userAssetValue: any;
  userSymValue: any;
  get withdrawPercent() {
    return this._withdrawPercent;
  }
  set withdrawPercent(val: number) {
    this._withdrawPercent = val;
    this.calculate();
  }
  _withdrawPercent: number;

  subs: Subscription[];
  asset: Asset;
  rune = new Asset('THOR.RUNE');
  assetPoolData: PoolData;
  poolUnits: number;
  user: User;
  memberPool: MemberPool;
  assetPrice: number;
  runePrice: number;
  data: ConfirmWithdrawData;
  view: WithdrawViews;
  asymRuneMemberPool: MemberPool;
  asymAssetMemberPool: MemberPool;
  symMemberPool: MemberPool;

  // checking for cooloff for withdraw
  lastBlock: number;
  lockBlocks: number;
  heightLastStaked: number;
  remainingTime: string;

  removeRuneAmount: number;
  removeAssetAmount: number;

  assetPoolShare: number;
  runePoolShare: number;

  runeBasePrice: number;
  assetBasePrice: number;

  insufficientBnb: boolean;
  runeFee: number;

  networkFee: number;
  queue: ThorchainQueue;

  //breadcrumb
  isError: boolean = false;

  withdrawOptions: AvailablePoolTypeOptions = {
    asymAsset: false,
    asymRune: false,
    sym: false,
  };

  withdrawType: PoolTypeOption;
  userSelectedType: boolean;
  assetBalance: number;
  runeBalance: number;
  balances: Balance[];
  currency: Currency;
  sliderDisabled: boolean;
  metaMaskNetwork?: 'testnet' | 'mainnet';
  poolStatus?: string;

  poolShare: number;
  isHalted: boolean;

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private lastBlockService: LastBlockService,
    private midgardService: MidgardService,
    private overlaysService: OverlaysService,
    private router: Router,
    private txUtilsService: TransactionUtilsService,
    private curService: CurrencyService,
    private analytics: AnalyticsService,
    private metaMaskService: MetamaskService
  ) {
    this.withdrawPercent = 0;
    this.removeAssetAmount = 0;
    this.removeRuneAmount = 0;
    this.sliderDisabled = true;
    this.userSelectedType = false;

    const user$ = this.userService.user$.subscribe((user) => {
      this.user = user;
      this.getAccountStaked();
      if (this.assetPoolData) {
        this.getPoolDetail(this.asset.chain + '.' + this.asset.symbol);
      }
    });

    const lastBlock$ = this.lastBlockService.lastBlock$.subscribe((block) => {
      this.lastBlock = block;
      this.checkCooldown();
    });

    const cur$ = this.curService.cur$.subscribe((cur) => {
      this.currency = cur;
    });

    const metaMaskNetwork$ = this.metaMaskService.metaMaskNetwork$.subscribe(
      (network) => (this.metaMaskNetwork = network)
    );

    this.subs = [user$, lastBlock$, metaMaskNetwork$, cur$];
  }

  ngOnInit(): void {
    //first they should pooltype
    this.asset = new Asset('BTC.BTC');

    this.isHalted = true;
    this.getConstants();
    this.getThorchainQueue();

    const params$ = this.route.paramMap;
    const balances$ = this.userService.userBalances$;
    const combined = combineLatest([params$, balances$]).pipe(
      debounceTime(600)
    );

    const sub = combined.subscribe(([params, balances]) => {
      this.balances = balances;
      if (this.balances) {
        const bnbBalance = this.userService.findBalance(
          balances,
          new Asset('BNB.BNB')
        );
        this.insufficientBnb = bnbBalance < 0.000375;
        this.runeBalance = this.userService.findBalance(
          this.balances,
          this.rune
        );
      }

      const asset = params.get('asset');

      if (asset) {
        this.asset = new Asset(asset);

        this.isChainHalted();
        this.getPoolDetail(asset);
        this.getAccountStaked();
        this.getPoolMembership();

        if (this.balances) {
          this.assetBalance = this.userService.findBalance(
            this.balances,
            this.asset
          );
        }
      }

      if (this.asset && this.balances) {
        this.assetBalance = this.userService.findBalance(balances, this.asset);
      }
    });

    const overlayService$ = this.overlaysService.withdrawView.subscribe(
      (view) => {
        this.view = view;
      }
    );

    this.subs.push(sub, overlayService$);
  }

  async getAccountStaked() {
    if (this.user && this.asset) {
      let chainAddress: string;
      let thorAddress: string;

      if (this.user.type === 'XDEFI' || this.user.type === 'keystore') {
        const thorclient = this.user.clients.thorchain;
        const chainClient = this.userService.getChainClient(
          this.user,
          this.asset.chain
        );
        if (!thorclient || !chainClient) {
          console.error('no client found');
          return;
        }
        thorAddress = thorclient.getAddress();
        chainAddress = chainClient.getAddress().toLowerCase();
      } else if (this.user.type === 'metamask') {
        chainAddress = this.user.wallet.toLowerCase();
      } else if (this.user.type === 'walletconnect') {
        const thorclient = this.user.clients.thorchain;
        const chainClient = this.userService.getChainClient(
          this.user,
          this.asset.chain
        );
        thorAddress = thorclient ? thorclient.getAddress() : undefined;
        chainAddress = chainClient.getAddress().toLowerCase();
      }

      /**
       * Clear Member Pools
       */
      this.symMemberPool = null;
      this.asymRuneMemberPool = null;
      this.asymAssetMemberPool = null;

      if (thorAddress && thorAddress.length > 0) {
        /**
         * Check THOR
         */
        try {
          const member = await this.midgardService
            .getMember(thorAddress.toLowerCase())
            .toPromise();
          const thorAssetPools = member.pools.filter(
            (pool) => pool.pool === assetToString(this.asset)
          );

          this.setMemberPools(thorAssetPools);
        } catch (error) {
          console.error('error fetching thor pool member data: ', error);
        }
      }

      if (chainAddress && chainAddress.length > 0) {
        try {
          const member = await this.midgardService
            .getMember(chainAddress.toLowerCase())
            .toPromise();
          const assetPools = member.pools.filter(
            (pool) => pool.pool === assetToString(this.asset)
          );
          this.setMemberPools(assetPools);
        } catch (error) {
          console.error('error fetching asset pool member data: ', error);
        }
      }
      /**
       * Check CHAIN
       */

      this.setWithdrawOptions();
      if (!this.withdrawType && !this.userSelectedType) {
        // after finding the withdraw options then navigate to pool options
        if (Object.values(this.withdrawOptions).filter(Boolean).length > 1) {
          this.overlaysService.setCurrentWithdrawView('PoolType');
        } else if (
          Object.values(this.withdrawOptions).filter(Boolean).length === 1
        ) {
          if (this.withdrawOptions.sym) {
            this.setSelectedWithdrawOption('SYM');
          } else if (this.withdrawOptions.asymRune) {
            this.setSelectedWithdrawOption('ASYM_RUNE');
          } else if (this.withdrawOptions.asymAsset) {
            this.setSelectedWithdrawOption('ASYM_ASSET');
          }
        }
      }
    }
  }

  setMemberPools(memberPools: MemberPool[]) {
    for (const pool of memberPools) {
      if (pool.assetAddress.length > 0 && pool.runeAddress.length > 0) {
        this.symMemberPool = pool;
      }

      if (pool.runeAddress.length > 0 && pool.assetAddress.length <= 0) {
        this.asymRuneMemberPool = pool;
      }

      if (pool.runeAddress.length <= 0 && pool.assetAddress.length > 0) {
        this.asymAssetMemberPool = pool;
      }
    }
  }

  setWithdrawOptions() {
    this.withdrawOptions = {
      sym: false,
      asymAsset: false,
      asymRune: false,
    };

    if (this.symMemberPool) {
      this.withdrawOptions.sym = true;
    }

    if (this.asymAssetMemberPool) {
      this.withdrawOptions.asymAsset = true;
    }

    if (this.asymRuneMemberPool) {
      this.withdrawOptions.asymRune = true;
    }
  }

  setSelectedWithdrawOption(option: PoolTypeOption) {
    this.userSelectedType = true;
    this.withdrawType = option;
    this.calculate();
  }

  setSelectedWithdrawOptionFromEvent(option: PoolTypeOption) {
    this.setSelectedWithdrawOption(option);
    this.overlaysService.setCurrentWithdrawView('Withdraw');
  }

  getThorchainQueue() {
    this.midgardService.getQueue().subscribe((res) => {
      this.queue = res;
    });
  }

  calculatePoolShare(
    memberPoolData: MemberPool,
    poolType: PoolTypeOption,
    assetPoolData: PoolDTO
  ) {
    if (!memberPoolData || !assetPoolData) return [0, 0];

    // calculating the sym deposit
    const unitData: UnitData = {
      stakeUnits: baseAmount(memberPoolData.liquidityUnits),
      totalUnits: baseAmount(assetPoolData.units),
    };

    const poolData: PoolData = {
      assetBalance: baseAmount(assetPoolData.assetDepth),
      runeBalance: baseAmount(assetPoolData.runeDepth),
    };

    // driverded from getPoolshare (asgardex util)
    const units = unitData.stakeUnits.amount();
    const total = unitData.totalUnits.amount();
    const R = poolData.runeBalance.amount();
    const T = poolData.assetBalance.amount();
    let asset: BigNumber;
    let rune: BigNumber;
    if (poolType === 'SYM') {
      asset = T.times(units).div(total);
      rune = R.times(units).div(total);
    } else if (poolType === 'ASYM_ASSET') {
      asset = Liquidity.getAsymAssetShare(units, total, T);
      rune = bn(0);
    } else if (poolType === 'ASYM_RUNE') {
      asset = bn(0);
      rune = Liquidity.getAsymAssetShare(units, total, R);
    }
    const stakeData = {
      asset: baseAmount(asset),
      rune: baseAmount(rune),
    };

    let pooledRune = stakeData.rune
      .amount()
      .div(10 ** 8)
      .toNumber();
    let pooledAsset = stakeData.asset
      .amount()
      .div(10 ** 8)
      .toNumber();

    return [pooledRune, pooledAsset];
  }

  async getPoolMembership() {
    try {
      const thorAddress =
        this.userService?.getAdrressChain(Chain.THORChain) ?? undefined;
      const chainAddress =
        this.userService?.getAdrressChain(this.asset?.chain) ?? undefined;

      let chainAssetPool: MemberPool;
      let thorAssetPool: MemberPool;
      let symPool: MemberPool;

      if (thorAddress) {
        try {
          const memeber = await this.midgardService
            .getMember(thorAddress)
            .toPromise();
          thorAssetPool = memeber.pools.find(
            (pool) =>
              pool.pool === assetToString(this.asset) &&
              pool.runeAddress === thorAddress &&
              pool.assetAddress === ''
          );

          symPool = memeber.pools.find(
            (pool) =>
              pool.pool === assetToString(this.asset) &&
              pool.runeAddress === thorAddress &&
              pool.assetAddress === chainAddress
          );

          console.log(thorAssetPool);
        } catch (error) {
          console.error(error);
        }
      }

      if (chainAddress) {
        try {
          const memeber = await this.midgardService
            .getMember(chainAddress)
            .toPromise();
          chainAssetPool = memeber.pools.find(
            (pool) =>
              pool.pool === assetToString(this.asset) &&
              pool.assetAddress === chainAddress &&
              pool.runeAddress === ''
          );

          symPool = memeber.pools.find(
            (pool) =>
              pool.pool === assetToString(this.asset) &&
              pool.runeAddress === thorAddress &&
              pool.assetAddress === chainAddress
          );

          console.log(chainAssetPool);
        } catch (error) {
          console.error(error);
        }
      }

      let [pooledRune, pooledAsset] = this.calculatePoolShare(
        thorAssetPool,
        'ASYM_RUNE',
        this.poolData
      );
      const userThorValue = pooledRune * this.runePrice;

      [pooledRune, pooledAsset] = this.calculatePoolShare(
        chainAssetPool,
        'ASYM_ASSET',
        this.poolData
      );
      const userAssetValue = pooledAsset * this.assetPrice;

      [pooledRune, pooledAsset] = this.calculatePoolShare(
        symPool,
        'SYM',
        this.poolData
      );
      const userSymValue =
        pooledRune * this.runePrice + pooledAsset * this.assetPrice;

      [this.userThorValue, this.userAssetValue, this.userSymValue] = [
        userThorValue,
        userAssetValue,
        userSymValue,
      ];
    } catch (error) {
      console.error(error);
    }
  }

  calculate() {
    // slider now can get out of being disabled.
    this.sliderDisabled = false;
    switch (this.withdrawType) {
      case 'SYM':
        this.calculateSym();
        break;

      case 'ASYM_ASSET':
        this.calculateAsymAsset();
        break;

      case 'ASYM_RUNE':
        this.calculateAsymRune();
        break;
    }
  }

  calculateSym() {
    if (this.symMemberPool && this.poolUnits) {
      const unitData: UnitData = {
        stakeUnits: baseAmount(this.symMemberPool.liquidityUnits),
        totalUnits: baseAmount(this.poolUnits),
      };

      const poolShare = getPoolShare(unitData, this.assetPoolData);
      this.poolShare = +this.symMemberPool.liquidityUnits / this.poolUnits;

      const runeAmountAfterFee = poolShare.rune
        .amount()
        .div(10 ** 8)
        .multipliedBy(this.withdrawPercent / 100)
        .minus(this.runeFee)
        .toNumber();
      this.removeRuneAmount = runeAmountAfterFee <= 0 ? 0 : runeAmountAfterFee;

      const assetAmountAfterFee = poolShare.asset
        .amount()
        .div(10 ** 8)
        .multipliedBy(this.withdrawPercent / 100)
        .minus(this.networkFee)
        .toNumber();
      this.removeAssetAmount =
        assetAmountAfterFee <= 0 ? 0 : assetAmountAfterFee;
    }
  }

  calculateAsymAsset() {
    if (this.asymAssetMemberPool && this.poolUnits) {
      const poolShare = this.getAsymAssetShare(
        this.asymAssetMemberPool,
        this.assetPoolData.assetBalance
      );
      this.poolShare =
        +this.asymAssetMemberPool.liquidityUnits / +this.poolUnits;

      this.removeRuneAmount = 0;

      const assetAmountAfterFee = poolShare
        .div(10 ** 8)
        .multipliedBy(this.withdrawPercent / 100)
        .minus(this.networkFee)
        .toNumber();

      this.removeAssetAmount =
        assetAmountAfterFee <= 0 ? 0 : assetAmountAfterFee;
    }
  }

  calculateAsymRune() {
    if (this.asymRuneMemberPool && this.poolUnits) {
      const poolShare = this.getAsymAssetShare(
        this.asymRuneMemberPool,
        this.assetPoolData.runeBalance
      );
      this.poolShare = +this.asymRuneMemberPool.liquidityUnits / this.poolUnits;

      const runeAmountAfterFee = poolShare
        .div(10 ** 8)
        .multipliedBy(this.withdrawPercent / 100)
        .minus(this.runeFee)
        .toNumber();
      this.removeRuneAmount = runeAmountAfterFee <= 0 ? 0 : runeAmountAfterFee;
    }
  }

  // pulled from https://gitlab.com/thorchain/thornode/-/issues/657#algorithm
  getAsymAssetShare(pool: MemberPool, A: BaseAmount): BigNumber {
    const s = bn(pool.liquidityUnits);
    const T = bn(this.poolUnits);

    const part1 = s.times(A.amount());
    const part2 = T.times(T).times(2);
    const part3 = T.times(s).times(2);
    const part4 = s.times(s);
    const numerator = part1.times(part2.minus(part3).plus(part4));
    const part5 = T.times(T).times(T);
    return numerator.div(part5).integerValue(1);
  }

  getConstants() {
    this.midgardService.getConstants().subscribe(
      (res) => {
        this.lockBlocks = res.int_64_values.LiquidityLockUpBlocks;
        this.runeFee = bn(res.int_64_values.OutboundTransactionFee)
          .div(10 ** 8)
          .toNumber();
        this.checkCooldown();
      },
      (err) => console.error('error fetching constants: ', err)
    );
  }

  checkCooldown() {
    if (this.heightLastStaked && this.lastBlock && this.lockBlocks) {
      const heightLastStaked = this.heightLastStaked;
      const currentBlockHeight = this.lastBlock;
      const stakeLockUpBlocks = this.lockBlocks;
      const totalBlocksToUnlock = heightLastStaked + stakeLockUpBlocks;
      const remainingBlocks = totalBlocksToUnlock - currentBlockHeight;
      const withdrawDisabled = remainingBlocks > 0;

      if (withdrawDisabled) {
        const remainingSeconds = remainingBlocks * 5;
        const remainingHours =
          (remainingSeconds - (remainingSeconds % 3600)) / 3600;
        const remainingMinutes =
          ((remainingSeconds % 3600) - (remainingSeconds % 60)) / 60;
        this.remainingTime = `${remainingHours} Hours ${remainingMinutes} Minutes`;
      }
    }
  }

  formDisabled(): boolean {
    /** No user connected */
    if (!this.user) {
      return true;
    }

    /** Chain is halted */
    if (this.isHalted) {
      return true;
    }

    /** THORChain is backed up */
    if (this.queue && this.queue.outbound >= 12) {
      return true;
    }

    if (!this.removeAssetAmount && !this.removeRuneAmount) {
      return true;
    }

    if (this.removeAssetAmount <= 0 && this.removeRuneAmount <= 0) {
      return true;
    }

    /**
     * Amount to withdraw is less than gas fees
     */
    // TODO: This seems to be calulated earlier
    // if (
    //   this.withdrawType === 'ASYM_ASSET' &&
    //   this.removeAssetAmount <= this.networkFee
    // ) {
    //   return true;
    // }

    /**
     * Check ASYM ASSET asset balance for tx + network fee
     */
    if (
      this.withdrawType === 'ASYM_ASSET' &&
      assetIsChainAsset(this.asset) &&
      this.assetBalance < this.networkFee
    ) {
      return true;
    }

    /** Still fetching pool details */
    if (!this.poolStatus) {
      return true;
    }

    /** Pool is not Available */
    if (this.poolStatus !== 'available') {
      return true;
    }

    /**
     * Check SYM or ASYM RUNE sufficient RUNE
     */
    if (
      this.withdrawType !== 'ASYM_ASSET' &&
      this.runeBalance - this.runeFee < 3
    ) {
      return true;
    }

    if (this.remainingTime) {
      return true;
    }

    if (
      this.user?.type === 'metamask' &&
      this.metaMaskNetwork !== environment.network
    ) {
      return true;
    }

    return false;
  }

  mainButtonText(): string {
    /** No user connected */
    if (!this.user) {
      this.isError = false;
      return 'Please Connect Wallet';
    }

    if (this.sliderDisabled) {
      this.isError = false;
      return 'Loading';
    }

    if (this.isHalted) {
      this.isError = true;
      return `${this.asset.chain} chain is Halted`;
    }

    /** THORChain is backed up */
    if (this.queue && this.queue.outbound >= 12) {
      this.isError = true;
      return 'THORChain TX QUEUE FILLED.';
    }

    /** When amount is only zero */
    if (!this.removeAssetAmount) {
      this.isError = false;
      return 'PICK PERCENTAGE WITH SLIDER';
    }

    /** No asset amount set */
    if (this.removeAssetAmount && this.removeAssetAmount <= 0) {
      this.isError = true;
      return 'Enter an Amount';
    }

    /** Still fetching pool details */
    if (!this.poolStatus) {
      return 'Loading';
    }

    /** Pool is not Available */
    if (this.poolStatus !== 'available') {
      return `Pool ${this.poolStatus}`;
    }

    /**
     * Amount to withdraw is less than gas fees
     */
    // TODO: this check seems to be calculated earlier
    // if (
    //   this.withdrawType === 'ASYM_ASSET' &&
    //   this.removeAssetAmount <= this.networkFee
    // ) {
    //   return 'Amount less than gas fees';
    // }

    if (this.remainingTime) {
      this.isError = true;
      return `Withdraw enabled in ${this.remainingTime}`;
    }

    if (
      this.withdrawType === 'ASYM_ASSET' &&
      assetIsChainAsset(this.asset) &&
      this.assetBalance < this.networkFee
    ) {
      return 'Insufficient Balance for Fees';
    }

    if (
      this.withdrawType !== 'ASYM_ASSET' &&
      this.runeBalance - this.runeFee < 3
    ) {
      return 'Min 3 RUNE in Wallet Required';
    }

    if (
      this.user?.type === 'metamask' &&
      this.metaMaskNetwork !== environment.network
    ) {
      return 'Change MetaMask Network';
    }

    /** Good to go */
    this.isError = false;
    return 'Ready';
  }

  openConfirmationDialog(): void {
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

    const withdrawalValue = this.totalWithdrawal();

    this.data = {
      asset: this.asset,
      rune: this.rune,
      runeFee: this.runeFee,
      assetAmount: this.removeAssetAmount,
      runeAmount: this.removeRuneAmount,
      user: this.user,
      unstakePercent: this.withdrawPercent,
      runeBasePrice,
      assetBasePrice,
      assetPrice: this.assetPrice,
      runePrice: this.runePrice,
      networkFee: this.networkFee,
      withdrawType: this.withdrawType,
      poolShareMessage: this.poolShareMessage(),
      withdrawalValue,
    };

    let usdValue =
      this.removeAssetAmount * this.assetPrice +
      this.removeRuneAmount * this.runePrice;
    this.analytics.event(
      'pool_withdraw_symmetrical_prepare',
      'button_withdraw_*POOL_ASSET*_usd_*numerical_usd_value*',
      usdValue,
      `${this.asset.chain}.${this.asset.ticker}`,
      usdValue.toString()
    );
    let usdFeeValue =
      this.runePrice * this.runeFee + this.assetPrice * this.networkFee;
    this.analytics.event(
      'pool_withdraw_symmetrical_prepare',
      'button_withdraw_*POOL_ASSET*_fee_usd_*numerical_usd_value*',
      usdFeeValue,
      `${this.asset.chain}.${this.asset.ticker}`,
      usdFeeValue.toString()
    );

    this.overlaysService.setCurrentWithdrawView('Confirm');
  }

  close(transactionSuccess: boolean) {
    if (transactionSuccess) {
      this.withdrawPercent = 0;
    }

    this.overlaysService.setCurrentWithdrawView('Withdraw');
  }

  breadcrumbNav(nav: string) {
    if (nav === 'pool') {
      this.router.navigate(['/', 'pool']);
      this.analytics.event(
        'pool_withdraw_symmetrical_prepare',
        'breadcrumb_pools'
      );
    } else if (nav === 'swap') {
      this.router.navigate(['/', 'swap']);
      this.analytics.event(
        'pool_withdraw_symmetrical_prepare',
        'breadcrumb_skip'
      );
    }
  }

  onInputChange(event: MatSliderChange) {
    this.withdrawPercent = event.value;
  }

  back() {
    this.analytics.event('pool_withdraw_symmetrical_prepare', 'button_cancel');

    this.router.navigate(['/', 'pool']);
  }

  totalWithdrawal() {
    if (
      this.withdrawType !== 'ASYM_RUNE' &&
      (!this.removeAssetAmount || !this.assetPrice)
    )
      return 0;
    if (
      this.withdrawType !== 'ASYM_ASSET' &&
      (!this.removeRuneAmount || !this.runePrice)
    )
      return 0;
    // eslint-disable-next-line prettier/prettier
    const depositAsset = (this.withdrawType === 'ASYM_RUNE' ? 0 : Math.max(0, this.removeAssetAmount)) * this.assetPrice * this.currency.value;
    // eslint-disable-next-line prettier/prettier
    const depositRune = (this.withdrawType === 'ASYM_ASSET' ? 0 : Math.max(0, this.removeRuneAmount)) * this.runePrice * this.currency.value;
    const depositValue = (depositAsset || 0) + (depositRune || 0);
    console.log(depositAsset, depositRune);
    return depositValue > 0 ? depositValue : 0;
  }

  async isChainHalted() {
    const inboundAddresses = await this.midgardService
      .getInboundAddresses()
      .toPromise();

    const matchChain = inboundAddresses.find(
      (address) => address.chain === this.asset.chain
    );

    this.isHalted = matchChain.halted;
  }

  async getPoolDetail(asset: string) {
    const inboundAddresses = await this.midgardService
      .getInboundAddresses()
      .toPromise();

    this.midgardService.getPool(asset).subscribe(
      (res) => {
        if (res) {
          this.assetPoolData = {
            assetBalance: baseAmount(res.assetDepth),
            runeBalance: baseAmount(res.runeDepth),
          };
          this.poolData = res;
          this.poolUnits = +res.units;
          this.assetPrice = parseFloat(res.assetPriceUSD);
          this.runePrice =
            parseFloat(res.assetPriceUSD) / parseFloat(res.assetPrice);
          this.runeBasePrice = getValueOfAssetInRune(
            assetToBase(assetAmount(1)),
            this.assetPoolData
          )
            .amount()
            .div(10 ** 8)
            .toNumber();
          this.assetBasePrice = getValueOfRuneInAsset(
            assetToBase(assetAmount(1)),
            this.assetPoolData
          )
            .amount()
            .div(10 ** 8)
            .toNumber();

          this.networkFee = this.txUtilsService.calculateNetworkFee(
            this.asset,
            inboundAddresses,
            'OUTBOUND',
            res
          );

          this.calculate();
        }
      },
      (err) => console.error('error getting pool detail: ', err)
    );
  }

  disabledAsset() {
    if (this.withdrawType === 'SYM') {
      return undefined;
    } else if (this.withdrawType === 'ASYM_ASSET') {
      return this.rune;
    } else if (this.withdrawType === 'ASYM_RUNE') {
      return this.asset;
    } else {
      return this.rune;
    }
  }

  poolShareMessage() {
    const withdrawPoolShare = formatNumber(
      this.withdrawPercent * this.poolShare,
      'en-US',
      '0.0-6'
    );
    const poolShared = formatNumber(this.poolShare * 100, 'en-US', '0.0-6');

    if (!this.poolShare) {
      return '';
    }

    return `${withdrawPoolShare}% OF ${poolShared}% POOL SHARE`;
  }

  ngOnDestroy() {
    this.overlaysService.setCurrentWithdrawView('Withdraw');
  }
}
