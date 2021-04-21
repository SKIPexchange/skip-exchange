import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { getValueOfAssetInRune, getValueOfRuneInAsset, PoolData } from '@thorchain/asgardex-util';
import {
  baseAmount,
  assetToBase,
  assetAmount,
  baseToAsset,
} from '@xchainjs/xchain-util';
import { combineLatest, Subscription } from 'rxjs';
import { Asset, isNonNativeRuneToken } from '../_classes/asset';
import { MidgardService } from '../_services/midgard.service';
import { UserService } from '../_services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDepositData } from './confirm-deposit-modal/confirm-deposit-modal.component';
import { User } from '../_classes/user';
import { Balances } from '@xchainjs/xchain-client';
import { AssetAndBalance } from '../_classes/asset-and-balance';
import { EthUtilsService } from '../_services/eth-utils.service';
import { DepositViews, OverlaysService } from '../_services/overlays.service';
import { ThorchainPricesService } from '../_services/thorchain-prices.service';
import { TransactionUtilsService } from '../_services/transaction-utils.service';

@Component({
  selector: 'app-deposit',
  templateUrl: './deposit.component.html',
  styleUrls: ['./deposit.component.scss']
})
export class DepositComponent implements OnInit, OnDestroy {


  /**
   * Rune
   */
  rune: Asset;

  get runeAmount() {
    return this._runeAmount;
  }
  set runeAmount(val: number) {
    this._runeAmount = val;
  }
  _runeAmount: number;

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
          this.assetBalance = this.userService.findBalance(this.balances, this.asset);
          this.assetAmount = 0;
        }

      }

    }

  }
  get asset() {
    return this._asset;
  }
  _asset: Asset;
  get assetAmount() {
    return this._assetAmount;
  }
  set assetAmount(val: number) {

    this._assetAmount = val;

    if (val) {
      this.updateRuneAmount();
    } else {
      this.runeAmount = null;
    }

  }
  private _assetAmount: number;
  assetPoolData: PoolData;

  /**
   * Balances
   */
  balances: Balances;
  runeBalance: number;
  assetBalance: number;

  user: User;
  insufficientBnb: boolean;
  subs: Subscription[];
  selectableMarkets: AssetAndBalance[];

  ethRouter: string;
  ethContractApprovalRequired: boolean;

  maximumSpendable: number;
  poolNotFoundErr: boolean;

  networkFee: number;
  depositsDisabled: boolean;

  view: DepositViews;
  // saving data of confirm in variable to pass it to the confirm
  depositData: ConfirmDepositData;
  //adding rune price for the input
  runePrice: number;

  constructor(
    private userService: UserService,
    private router: Router,
    private route: ActivatedRoute,
    private midgardService: MidgardService,
    private ethUtilsService: EthUtilsService,
    private thorchainPricesService : ThorchainPricesService,
    public overlaysService: OverlaysService,
    private txUtilsService: TransactionUtilsService
  ) {
    this.poolNotFoundErr = false;
    this.ethContractApprovalRequired = false;
    this.rune = new Asset('THOR.RUNE');
    this.overlaysService.setCurrentDepositView('Deposit');
    this.subs = [];
    this.depositsDisabled = false;
  }

  ngOnInit(): void {

    const params$ = this.route.paramMap;
    const balances$ = this.userService.userBalances$;
    const user$ = this.userService.user$;

    const combined = combineLatest([params$, user$, balances$]);
    const sub = combined.subscribe( ([params, user, balances]) => {

      // User
      this.user = user;
      if (this.asset && this.asset.chain === 'ETH' && this.asset.ticker !== 'ETH') {
        this.checkContractApproved(this.asset);
      }
      if (!this.user) {
        this.router.navigate(['/', 'swap']);
      }

      // Balance
      this.balances = balances;
      this.runeBalance = this.userService.findBalance(this.balances, this.rune);
      this.assetBalance = this.userService.findBalance(this.balances, this.asset);

      // allows us to ensure enough bnb balance
      const bnbBalance = this.userService.findBalance(this.balances, new Asset('BNB.BNB'));
      this.insufficientBnb = bnbBalance < 0.000375;

      // Asset
      this.ethContractApprovalRequired = false;
      const asset = params.get('asset');

      if (asset) {
        this.asset = new Asset(asset);

        if (isNonNativeRuneToken(this.asset)) {
          this.back();
          return;
        }

        this.getPoolDetail(asset);
        this.assetBalance = this.userService.findBalance(this.balances, this.asset);

        if (this.asset.chain === 'ETH') {
          this.getMaximumSpendableEth();
        }

        if (this.asset.chain === 'ETH' && this.asset.ticker !== 'ETH') {
          this.checkContractApproved(this.asset);
        }
      }

    });

    const depositView$ = this.overlaysService.depositView.subscribe(
      (view) => {
        this.view = view;
      }
    )

    this.getPools();
    this.getEthRouter();
    this.getPoolCap();
    this.subs.push(sub, depositView$);
  }

  getPoolCap() {
    const mimir$ = this.midgardService.getMimir();
    const network$ = this.midgardService.getNetwork();
    const combined = combineLatest([mimir$, network$]);
    const sub = combined.subscribe( ([mimir, network]) => {

      const totalPooledRune = +network.totalPooledRune / (10 ** 8);

      if (mimir && mimir['mimir//MAXLIQUIDITYRUNE']) {
        const maxLiquidityRune = mimir['mimir//MAXLIQUIDITYRUNE'] / (10 ** 8);
        this.depositsDisabled = (totalPooledRune / maxLiquidityRune >= .9);
      }

    });

    this.subs.push(sub);
  }

  getEthRouter() {
    this.midgardService.getInboundAddresses().subscribe(
      (addresses) => {
        const ethInbound = addresses.find( (inbound) => inbound.chain === 'ETH' );
        if (ethInbound) {
          this.ethRouter = ethInbound.router;
        }
      }
    );
  }

  contractApproved() {
    this.ethContractApprovalRequired = false;
  }

  async checkContractApproved(asset: Asset) {

    if (this.ethRouter && this.user) {
      const assetAddress = asset.symbol.slice(asset.ticker.length + 1);
      const strip0x = assetAddress.substr(2);
      const isApproved = await this.user.clients.ethereum.isApproved(this.ethRouter, strip0x, baseAmount(1));
      this.ethContractApprovalRequired = !isApproved;
    }

  }

  updateRuneAmount() {
    const runeAmount = getValueOfAssetInRune(assetToBase(assetAmount(this.assetAmount)), this.assetPoolData);
    this.runeAmount = runeAmount.amount().isLessThan(0) ? 0 : runeAmount.amount().div(10 ** 8 ).toNumber();
  }

  getPoolDetail(asset: string) {

    this.midgardService.getPool(asset).subscribe(
      (res) => {
        if (res) {
          this.assetPoolData = {
            assetBalance: baseAmount(res.assetDepth),
            runeBalance: baseAmount(res.runeDepth),
          };

          this.networkFee = this.txUtilsService.calculateNetworkFee(this.asset, res);

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
        this.selectableMarkets = res.sort( (a, b) => a.asset.localeCompare(b.asset) ).map((pool) => ({
          asset: new Asset(pool.asset),
          assetPriceUSD: +pool.assetPriceUSD
        }))
        // filter out until we can add support
        .filter( (pool) => pool.asset.chain === 'BNB'
          || pool.asset.chain === 'BTC'
          || pool.asset.chain === 'ETH'
          || pool.asset.chain === 'LTC'
          || pool.asset.chain === 'BCH')

        // filter out non-native RUNE tokens
        .filter( (pool) => !isNonNativeRuneToken(pool.asset));

        //add rune price
        const availablePools = res.filter( (pool) => pool.status === 'available' );
        this.runePrice = this.thorchainPricesService.estimateRunePrice(availablePools);
      },
      (err) => console.error('error fetching pools:', err)
    );
  }

  formDisabled(): boolean {

    return !this.balances || !this.runeAmount || !this.assetAmount || (this.asset.chain === 'BNB' && this.insufficientBnb)
    || this.ethContractApprovalRequired
    || this.depositsDisabled
    || (this.assetAmount <= this.userService.minimumSpendable(this.asset))
    || (this.balances
      && (this.runeAmount > this.runeBalance || this.assetAmount > this.userService.maximumSpendableBalance(this.asset, this.assetBalance))
    );
  }

  async getMaximumSpendableEth() {
    if (this.asset && this.user) {
      this.maximumSpendable = await this.ethUtilsService.maximumSpendableBalance({
        asset: this.asset,
        client: this.user.clients.ethereum,
        balance: this.assetBalance ?? 0
      });
    }
  }

  mainButtonText(): string {

    /** Wallet not connected */
    if (!this.balances) {
      return 'Please connect wallet';
    }

    if (this.balances && (!this.runeAmount || !this.assetAmount)) {
      return 'Prepare';
    }

    if (this.depositsDisabled) {
      return 'Pool Cap > 90%';
    }

    if (!this.asset) {
      return 'There is no asset here!'
    }

    /** User either lacks asset balance or RUNE balance */
    if (this.balances && (!this.runeAmount || !this.assetAmount)) {
      return 'Enter an amount';
    }

    /** RUNE amount exceeds RUNE balance */
    if (this.runeAmount > this.runeBalance) {
      return 'Insufficient balance';
    }

    /** ETH tx amount is higher than spendable amount */
    if ( (this.asset.chain === 'ETH') && this.assetAmount > this.maximumSpendable) {
      return 'Insufficient balance';
    }

    /** Non-ETH chain tx amount is higher than spendable amount */
    if ((this.asset.chain !== 'ETH')
      && ( this.assetAmount > this.userService.maximumSpendableBalance(this.asset, this.assetBalance))) {
      return 'Insufficient balance';
    }

    /** BNB tx and and insufficient BNB to cover costs */
    if (this.asset.chain === 'BNB' && this.insufficientBnb) {
      return 'Insufficient BNB for Fee';
    }

    /** Amount is too low, considered "dusting" */
    if ( (this.assetAmount <= this.userService.minimumSpendable(this.asset))) {
      return 'Amount too low';
    }

    /** Good to go */
    if (this.runeAmount && this.assetAmount
      && (this.runeAmount <= this.runeBalance) && (this.assetAmount <= this.assetBalance)) {
      return 'Ready';
    } else {
      console.warn('mismatch case for main button text');
      return;
    }
  }

  openConfirmationDialog() {

    const runeBasePrice = getValueOfAssetInRune(assetToBase(assetAmount(1)), this.assetPoolData).amount().div(10 ** 8).toNumber();
    const assetBasePrice = getValueOfRuneInAsset(assetToBase(assetAmount(1)), this.assetPoolData).amount().div(10 ** 8).toNumber();
    const assetPrice = this.selectableMarkets.find( (asset) => this.asset.symbol === asset.asset.symbol).assetPriceUSD;
    const assetData: AssetAndBalance = { asset: this.asset, balance: assetAmount(this.assetBalance, 8), assetPriceUSD: assetPrice };
    const runeData: AssetAndBalance = { asset: this.rune, balance: assetAmount(this.runeBalance, 8), assetPriceUSD: this.runePrice };

    this.depositData = {
      asset: assetData,
      rune: runeData,
      assetAmount: this.assetAmount,
      runeAmount: this.runeAmount,
      user: this.user,
      runeBasePrice: runeBasePrice,
      assetBasePrice: assetBasePrice,
      assetBalance: this.assetBalance,
      runeBalance: this.runeBalance,
      runePrice: this.runePrice,
      estimatedFee: this.networkFee,
      assetPrice
    }

    if (this.depositData)
      this.overlaysService.setCurrentDepositView('Confirm');
  }

  closeSuccess(transactionSuccess: boolean): void {
    if (transactionSuccess) {
      this.assetAmount = 0;
    }

    this.overlaysService.setCurrentDepositView('Deposit');
  }

  back(): void {
    this.router.navigate(['/', 'pool']);
  }

  goToNav(nav: string) {
    if (nav === 'pool') {
      this.router.navigate(['/', 'pool']);
    }
    else if (nav === 'swap') {
      this.router.navigate(['/', 'swap']);
    }
    else if (nav === 'deposit') {
      this.router.navigate(['/', 'deposit', `${this.asset.chain}.${this.asset.symbol}`])
    }
    else if (nav === 'deposit-back') {
      this.overlaysService.setCurrentDepositView('Deposit');
    }
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }

}
