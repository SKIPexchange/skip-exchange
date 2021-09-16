import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { Asset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import {
  AvailablePoolTypeOptions,
  PoolTypeOption,
} from 'src/app/_const/pool-type-options';
import { AnalyticsService } from 'src/app/_services/analytics.service';
import { CurrencyService } from 'src/app/_services/currency.service';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';
import { OverlaysService } from 'src/app/_services/overlays.service';
import { Currency } from '../account-settings/currency-converter/currency-converter.component';

@Component({
  selector: 'app-pool-type-options',
  templateUrl: './pool-type-options.component.html',
  styleUrls: ['./pool-type-options.component.scss'],
})
export class PoolTypeOptionsComponent implements OnInit {
  @Input() assets: { asset: Asset; balance: number; assetPriceUSD: number }[];
  @Input() selectedPoolType: PoolTypeOption;
  @Input() userValues: { sym: number; asymAsset: number; asymRune: number };
  @Input() poolShares: { sym: any; asymAsset: any; asymRune: any };
  @Input() withdrawAmountAssets: { sym: any; asymAsset: any; asymRune: any };
  @Input() poolTypeOptions: AvailablePoolTypeOptions;
  @Input() optionType: 'withdraw' | 'deposit' | 'disconnect';
  @Output() selectPoolType: EventEmitter<PoolTypeOption>;
  @Output() closeComponent: EventEmitter<null> = new EventEmitter<null>();

  _poolType: PoolTypeOption | undefined;
  rune: Asset = new Asset('THOR.RUNE');
  currency: Currency;
  sub: Subscription;
  isMobile: boolean;

  constructor(
    private router: Router,
    private currencyService: CurrencyService,
    private analytics: AnalyticsService,
    private layout: LayoutObserverService
  ) {
    this.selectPoolType = new EventEmitter<PoolTypeOption>();

    this.currencyService.cur$.pipe(take(1)).subscribe((cur) => {
      this.currency = cur;
    });

    this.sub = this.layout.isMobile.subscribe((res) => {
      this.isMobile = res;
    });
  }

  ngOnInit() {
    this._poolType = this.selectedPoolType;
  }

  choosenPoolType(poolType: PoolTypeOption) {
    this._poolType = poolType;
  }

  linkSwap(asset: Asset) {
    this.router.navigate([
      '/',
      'swap',
      'no-asset',
      `${asset.chain}.${asset.symbol}`,
    ]);
  }

  submitPoolType() {
    this.selectPoolType.emit(this._poolType);
  }

  isDisabled(poolType: PoolTypeOption) {
    if (!poolType) {
      return true;
    }

    if (this.optionType == 'withdraw') {
      return false;
    }

    if (
      poolType == 'SYM' &&
      (!this.assets[0].balance || !this.assets[1].balance)
    ) {
      return true;
    }

    if (poolType == 'ASYM_ASSET' && !this.assets[0].balance) {
      return true;
    }

    if (poolType == 'ASYM_RUNE' && !this.assets[1].balance) {
      return true;
    }

    return false;
  }

  back() {
    this.closeComponent.emit();
    this.router.navigate(['/', 'pool']);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
