import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { Asset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { CurrencyService } from 'src/app/_services/currency.service';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';
import { MidgardService } from 'src/app/_services/midgard.service';
import { environment } from 'src/environments/environment';
import { Currency } from '../account-settings/currency-converter/currency-converter.component';

@Component({
  selector: 'app-assets-list',
  templateUrl: './assets-list.component.html',
  styleUrls: ['./assets-list.component.scss'],
})
export class AssetsListComponent {
  @Input() loading: boolean;
  @Input() assetListItems: AssetAndBalance[];
  @Input() disabledAssetSymbol: string;
  @Input() displayAddTokenButton: boolean;
  @Output() selectAsset: EventEmitter<Asset>;
  @Output() addToken: EventEmitter<null>;
  @Input() noAssets: string = 'pool.noAsset';
  @Input() showApy: boolean = false;
  @Input() showPrice: boolean = false;

  // Wheter show the icon or not
  @Input() showIcons: boolean = true;
  @Input() expandable: 'full' | 'semi' = 'full';
  safariExpand: boolean;
  isTestnet: boolean;
  apys;
  currency: Currency;
  isMobile: boolean;
  subs: Subscription[] = [];
  itemsInView: number = 5;

  constructor(
    private midgardService: MidgardService,
    private currencyService: CurrencyService,
    private layout: LayoutObserverService
  ) {
    this.selectAsset = new EventEmitter<Asset>();
    this.addToken = new EventEmitter<null>();

    const cur$ = this.currencyService.cur$.subscribe((cur) => {
      this.currency = cur;
    });

    const layout$ = this.layout.isMobile.subscribe((res) => {
      this.isMobile = res;
    });

    this.isTestnet = environment.network === 'testnet' ? true : false;

    this.subs.push(layout$, cur$);
  }

  hasAPY(item: AssetAndBalance) {
    if (!this.apys) {
      return false;
    }
    return this.apys.find((el) => {
      return (
        item.asset.chain + '.' + item.asset.symbol === el.asset.toUpperCase()
      );
    });
  }

  addApy() {
    this.midgardService.getPools().subscribe((res) => {
      this.apys = res.map((el) => {
        return {
          asset: el.asset,
          apy: +el.poolAPY,
        };
      });
    });
  }

  ngOnInit(): void {
    if (this.disabledAssetSymbol) {
      this.assetListItems = this.assetListItems.filter((asset) => {
        return asset.asset.symbol != this.disabledAssetSymbol;
      });
    }
    this.safariExpand = /^((?!chrome|android).)*safari/i.test(
      navigator.userAgent
    )
      ? true
      : false;

    if (this.showApy) this.addApy();

    let container = document.querySelector('.asset-list-container');
    this.itemsInView = Math.floor((container.clientHeight - 20) / 49);
    console.log(this.itemsInView);
  }

  ngOnDestroy() {
    this.subs.forEach((sub) => sub.unsubscribe());
  }
}
