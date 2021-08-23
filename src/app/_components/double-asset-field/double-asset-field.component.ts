import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { Asset } from 'src/app/_classes/asset';
import { MarketsModalComponent } from '../markets-modal/markets-modal.component';
import { MatDialog } from '@angular/material/dialog';
import { UserService } from 'src/app/_services/user.service';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { userInfo } from 'os';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { EthUtilsService } from 'src/app/_services/eth-utils.service';
import { User } from 'src/app/_classes/user';
import { Subscription } from 'rxjs';
import { Balance } from '@xchainjs/xchain-client';
import { assetToString, baseToAsset } from '@xchainjs/xchain-util';
import { MidgardService } from 'src/app/_services/midgard.service';
import { ThorchainPricesService } from 'src/app/_services/thorchain-prices.service';
import { CurrencyService } from 'src/app/_services/currency.service';
import { Currency } from '../account-settings/currency-converter/currency-converter.component';
import {
  AnalyticsService,
  assetString as assetStringFunc,
} from 'src/app/_services/analytics.service';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';

@Component({
  selector: 'app-double-asset-field',
  templateUrl: './double-asset-field.component.html',
  styleUrls: ['./double-asset-field.component.scss'],
})
export class DoubleAssetFieldComponent {
  /**
   * Selected Asset
   */
  @Input() selectedAssets: Asset[];

  /**
   * Asset Unit
   */
  @Input() assetUnits: number[];

  @Input() label: string;
  @Input() processing?: boolean;
  @Input() disableInput?: boolean;
  @Input() disableUser?: boolean;
  @Input() disabledAssetSymbol: string;
  @Input() isWallet: boolean = false;
  @Input() bottomLabel: string;
  @Input() disabledAsset: Asset;

  /**
   * Wallet balance
   */
  @Input() set balance(bal: number) {
    this._balance = bal;
  }
  get balance() {
    return this._balance;
  }
  _balance: number;

  @Input() hideMax: boolean;
  @Input() showBalance: boolean = true;
  @Input() showPrice: boolean = true;

  @Input() loading: boolean;
  @Input() error: boolean;

  @Input() priceInputs: number[];
  @Input() assetEvents;
  assetPriceUSD: number;
  usdValue: number;
  user: User;
  subs: Subscription[];
  inputUsdValue: number;
  currency: Currency;
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
    const curs$ = this.currencyService.cur$.subscribe((cur) => {
      this.currency = cur;
    });
    const layout$ = this.layout.isMobile.subscribe((res) => {
      this.isMobile = res;
    });
    this.subs = [user$, curs$, layout$];
  }

  async gotoWallet(inputAsset: Asset) {
    const userBalance$ = this.userService.userBalances$.subscribe(
      (balances) => {
        if (balances) {
          const balance = balances.filter(
            (balance) =>
              balance.asset.chain === inputAsset.chain &&
              balance.asset.ticker === inputAsset.ticker
          )[0];

          const assetString = `${balance.asset.chain}.${balance.asset.symbol}`;
          const asset = new Asset(
            `${balance.asset.chain}.${balance.asset.symbol}`
          );
          this.analytics.event(
            this.assetEvents.event_category,
            this.assetEvents.event_tag_wallet,
            undefined,
            assetStringFunc(inputAsset)
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
              inputAsset.chain
            );
            this.overlayService.setCurrentUserView({
              userView: 'Asset',
              address,
              chain: inputAsset.chain,
              asset: assetBalance,
            });
            this.overlayService.setCurrentView(MainViewsEnum.UserSetting);
          });
        }
      }
    );

    this.subs.push(userBalance$);
  }

  getCumulativeVal(): number {
    return (
      this.priceInputs[0] ??
      0 * this.assetUnits[0] ??
      0 + this.priceInputs[1] ??
      0 * this.assetUnits[1] ??
      0
    );
  }

  assetToString(asset: Asset) {
    return assetToString(asset);
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
