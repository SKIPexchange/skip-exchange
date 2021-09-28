import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Asset } from 'src/app/_classes/asset';
import { UserService } from 'src/app/_services/user.service';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { EthUtilsService } from 'src/app/_services/eth-utils.service';
import { User } from 'src/app/_classes/user';
import { Subscription } from 'rxjs';
import { assetToString, baseToAsset } from '@xchainjs/xchain-util';
import { MidgardService } from 'src/app/_services/midgard.service';
import { ThorchainPricesService } from 'src/app/_services/thorchain-prices.service';
import { CurrencyService } from 'src/app/_services/currency.service';
import { Currency } from '../account-settings/currency-converter/currency-converter.component';
import { PoolAddressDTO } from 'src/app/_classes/pool-address';
import { TxType } from 'src/app/_const/tx-type';
import { take } from 'rxjs/operators';
import {
  AnalyticsService,
  assetString,
} from 'src/app/_services/analytics.service';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';
import { TranslateService } from '@ngx-translate/core';

export type assetInputEventTags = {
  event_category: string;
  event_label_max?: string;
  event_label_wallet?: string;
};
@Component({
  selector: 'app-asset-input',
  templateUrl: './asset-input.component.html',
  styleUrls: ['./asset-input.component.scss'],
})
export class AssetInputComponent implements OnInit, OnDestroy {
  /**
   * Selected Asset
   */
  @Input() set selectedAsset(asset: Asset) {
    this._selectedAsset = asset;
    this.checkUsdBalance();
    this.setInputUsdValue();
  }
  get selectedAsset() {
    return this._selectedAsset;
  }
  @Output() selectedAssetChange = new EventEmitter<Asset>();
  private _selectedAsset: Asset;

  /**
   * Asset Unit
   */
  @Input() set assetUnit(amount: number) {
    this._assetUnit = amount;
    this.setInputUsdValue();
  }
  get assetUnit() {
    return this._assetUnit;
  }
  @Output() assetUnitChange = new EventEmitter<number>();
  @Output() maxError = new EventEmitter<boolean>();
  _assetUnit: number;

  @Input() label: string;
  @Input() disableInput?: boolean;
  @Input() disableUser?: boolean;
  @Input() disabledAssetSymbol: string;
  @Input() isWallet: boolean = false;
  @Input() eventTags: assetInputEventTags;

  /**
   * Wallet balance
   */
  @Input() set balance(bal: number) {
    this._balance = bal;
    this.checkUsdBalance();
  }
  get balance() {
    return this._balance;
  }
  _balance: number;

  // TODO: clean asset-input structare
  @Input() hideMax: boolean;
  @Input() extraLabel: string;
  @Input() showBalance: boolean = true;
  @Input() showPrice: boolean = true;
  @Input() isDeposit: boolean = false;
  @Output() lunchMarket = new EventEmitter<null>();

  @Input() disabledMarketSelect: boolean;
  @Input() loading: boolean;
  @Input() processing: boolean;
  @Input() error: boolean;
  @Input() set selectableMarkets(markets: AssetAndBalance[]) {
    this._selectableMarkets = markets;
    this.checkUsdBalance();
    this.setInputUsdValue();
  }
  get selectableMarkets() {
    return this._selectableMarkets;
  }
  _selectableMarkets: AssetAndBalance[];

  @Input() hasAddress: boolean = false;
  @Input() priceInput: number;
  @Input() inputColor: string;
  @Input() txType?: TxType;
  @Input() type: string;
  @Input() isError: boolean;
  @Input() targetAddress?: string;
  @Input() targetLabel: string = 'Receive at';
  @Output() launchEditTargetAsset = new EventEmitter<null>();

  usdValue: number;
  user: User;
  subs: Subscription[];
  inputUsdValue: number;
  currency: Currency;
  inboundAddresses: PoolAddressDTO[];
  hasWallet: boolean;
  isMobile: boolean = false;

  constructor(
    private userService: UserService,
    public overlayService: OverlaysService,
    private midgardService: MidgardService,
    private thorchainPricesService: ThorchainPricesService,
    private currencyService: CurrencyService,
    private analytics: AnalyticsService,
    private layout: LayoutObserverService
  ) {
    const user$ = this.userService.user$.subscribe(
      (user) => (this.user = user)
    );

    const curs$ = this.currencyService.cur$.subscribe((currency) => {
      this.currency = currency;
    });

    const layout$ = this.layout.isMobile.subscribe((isMobile) => {
      this.isMobile = isMobile;
    });

    this.subs = [user$, curs$, layout$];
  }

  ngOnInit() {
    this.setPoolAddresses();

    /** Check if the wallet have any asset of the asset-input to show */
    if (this.isWallet) {
      this.userService.userBalances$.pipe(take(1)).subscribe((balances) => {
        this.hasWallet = balances.filter(
          (balance) =>
            assetToString(balance.asset) === assetToString(this.selectedAsset)
        )[0]
          ? true
          : false;
      });
    }
  }

  setPoolAddresses() {
    this.midgardService
      .getInboundAddresses()
      .subscribe((res) => (this.inboundAddresses = res));
  }

  checkUsdBalance(): void {
    if (!this.balance || !this.selectableMarkets) {
      return;
    }

    const targetPool = this.selectableMarkets.find(
      (market) =>
        assetToString(market.asset) === assetToString(this.selectedAsset)
    );
    if (!targetPool || !targetPool.assetPriceUSD) {
      return;
    }

    this.usdValue = targetPool.assetPriceUSD * this.balance;
  }

  setInputUsdValue(): void {
    if (!this.selectedAsset || !this.selectableMarkets) {
      return;
    }

    const targetPool = this.selectableMarkets.find(
      (market) =>
        assetToString(market.asset) === assetToString(this.selectedAsset)
    );
    if (!targetPool || !targetPool.assetPriceUSD) {
      return;
    }
    this.inputUsdValue = targetPool.assetPriceUSD * this.assetUnit;
  }

  updateAssetUnits(val): void {
    this.assetUnitChange.emit(val);
    this.setInputUsdValue();
  }

  getMax() {
    if (this.balance && this.selectedAsset && this.inboundAddresses) {
      return this.userService.maximumSpendableBalance(
        this.selectedAsset,
        this.balance,
        this.inboundAddresses,
        this.txType ?? 'INBOUND'
      );
    }
  }

  openTargetAddress() {
    if (!this.disabledMarketSelect) {
      this.launchEditTargetAsset.emit();
    }
  }

  async setMax(): Promise<void> {
    this.loading = true;

    if (this.balance && this.inboundAddresses) {
      const max = this.userService.maximumSpendableBalance(
        this.selectedAsset,
        this.balance,
        this.inboundAddresses,
        this.txType ?? 'INBOUND'
      );

      if (max) {
        this.assetUnitChange.emit(max);
        if (this.eventTags) {
          this.analytics.event(
            this.eventTags.event_category,
            this.eventTags.event_label_max,
            undefined,
            assetString(this.selectedAsset)
          );
        }
      } else {
        if (max === 0 && this.balance > 0) {
          this.maxError.emit(true);
        }
        console.error('max undefined');
      }
    }

    this.loading = false;
  }

  launchMarketsModal(): void {
    this.lunchMarket.emit();
  }

  async gotoWallet() {
    const userBalance$ = this.userService.userBalances$.subscribe(
      (balances) => {
        if (balances) {
          const balance = balances.filter(
            (balance) =>
              assetToString(balance.asset) === assetToString(this.selectedAsset)
          )[0];

          if (!balance) {
            return;
          }

          const assetString = `${balance.asset.chain}.${balance.asset.symbol}`;
          const asset = new Asset(
            `${balance.asset.chain}.${balance.asset.symbol}`
          );
          let assetBalance: AssetAndBalance;
          this.midgardService.getPools().subscribe(async (pools) => {
            if (asset.ticker === 'RUNE') {
              assetBalance = {
                asset,
                assetPriceUSD:
                  this.thorchainPricesService.estimateRunePrice(pools) ?? 0,
                balance: baseToAsset(balance.amount),
              };
            } else {
              const matchingPool = pools.find((pool) => {
                return pool.asset === assetString;
              });

              assetBalance = {
                asset,
                assetPriceUSD: matchingPool ? +matchingPool.assetPriceUSD : 0,
                balance: baseToAsset(balance.amount),
              };
            }
            const address = await this.userService.getAdrressChain(
              this.selectedAsset.chain
            );
            this.analytics.event(
              this.eventTags.event_category,
              this.eventTags.event_label_wallet,
              undefined,
              assetString
            );
            this.overlayService.setCurrentUserView({
              userView: 'Asset',
              address,
              chain: this.selectedAsset.chain,
              asset: assetBalance,
            });
            this.overlayService.setCurrentView(MainViewsEnum.UserSetting);
          });
        }
      }
    );

    this.subs.push(userBalance$);
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
