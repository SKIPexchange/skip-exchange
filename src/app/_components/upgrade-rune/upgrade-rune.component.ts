import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { Asset, getChainAsset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { PoolAddressDTO } from 'src/app/_classes/pool-address';
import {
  AnalyticsService,
  assetString,
} from 'src/app/_services/analytics.service';
import { CurrencyService } from 'src/app/_services/currency.service';
import { MidgardService } from 'src/app/_services/midgard.service';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { TransactionUtilsService } from 'src/app/_services/transaction-utils.service';
import { TranslateService } from 'src/app/_services/translate.service';
import { UserService } from 'src/app/_services/user.service';
import { Currency } from '../account-settings/currency-converter/currency-converter.component';

@Component({
  selector: 'app-upgrade-rune',
  templateUrl: './upgrade-rune.component.html',
  styleUrls: ['./upgrade-rune.component.scss'],
})
export class UpgradeRuneComponent implements OnInit {
  @Input() asset: AssetAndBalance;
  @Input() nativeRune: AssetAndBalance;
  @Output() back: EventEmitter<null>;
  @Output() confirmUpgrade: EventEmitter<{ amount: number }>;
  get amount() {
    return this._amount;
  }
  set amount(val: number) {
    this._amount = val;
    if (val) {
      this.checkSpendable();
    } else {
      this.amountSpendable = false;
    }
  }
  private _amount: number;
  amountSpendable: boolean;
  subs: Subscription[];
  balance: number;
  inboundAddresses: PoolAddressDTO[];
  networkFee: number;
  currency: Currency;
  insufficientChainBalance: boolean;
  isError: boolean;

  constructor(
    private userService: UserService,
    private midgardService: MidgardService,
    private overlaysService: OverlaysService,
    private analytics: AnalyticsService,
    private txUtilsService: TransactionUtilsService,
    private currencyService: CurrencyService,
    private translate: TranslateService
  ) {
    this.back = new EventEmitter<null>();
    this.confirmUpgrade = new EventEmitter<{ amount: number }>();
    this.amountSpendable = false;
    this.currencyService.cur$
      .pipe(take(1))
      .subscribe((currency) => (this.currency = currency));
  }

  ngOnInit(): void {
    this.setPoolAddresses();

    if (this.asset) {
      const balances$ = this.userService.userBalances$.subscribe((balances) => {
        this.balance = this.userService.findBalance(balances, this.asset.asset);
      });

      this.subs = [balances$];
      this.estimateFees();
    }
  }

  async estimateFees() {
    const inboundAddresses = await this.midgardService
      .getInboundAddresses()
      .toPromise();
    this.networkFee = this.txUtilsService.calculateNetworkFee(
      this.asset.asset,
      inboundAddresses,
      'INBOUND'
    );
  }

  getChainAssetCaller(asset: Asset) {
    return getChainAsset(asset.chain);
  }

  breadcrumbMessage() {
    this.insufficientChainBalance = this.balance < this.networkFee;
    if (this.insufficientChainBalance) {
      this.isError = true;
      return this.translate.format('breadcrumb.insufficient', {
        asset: assetString(this.asset.asset),
      });
    }

    if (this.amountSpendable) {
      return this.translate.format('breadcrumb.ready');
    }

    return this.translate.format('breadcrumb.prepare');
  }

  breadcrumbNav(val: string): void {
    if (val == 'back') {
      this.analytics.event('upgrade_prepare', 'breadcrumb_upgrade');
      this.back.emit();
    } else if (val == 'swap') {
      this.analytics.event('upgrade_prepare', 'breadcrumb_skip');
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    }
  }

  upgradeConfirm() {
    let upgradeAmoundUSD = this.amount * this.asset.assetPriceUSD;
    this.analytics.event(
      'upgrade_prepare',
      'button_upgrade_*FROM_ASSET*_THOR.RUNE_usd_*numerical_usd_value*',
      upgradeAmoundUSD,
      assetString(this.asset.asset),
      upgradeAmoundUSD.toString()
    );
    this.confirmUpgrade.next({ amount: this.amount });
  }

  close() {
    this.analytics.event('upgrade_prepare', 'button_cancel');
    this.back.emit();
  }

  setPoolAddresses() {
    this.midgardService
      .getInboundAddresses()
      .subscribe((res) => (this.inboundAddresses = res));
  }

  checkSpendable(): void {
    if (!this.balance || !this.inboundAddresses || !this.asset?.asset) {
      this.amountSpendable = false;
      return;
    }

    const maximumSpendableBalance = this.userService.maximumSpendableBalance(
      this.asset.asset,
      this.balance,
      this.inboundAddresses
    );
    this.amountSpendable = this.amount <= maximumSpendableBalance;
  }
}
