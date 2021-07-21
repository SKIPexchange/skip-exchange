import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { Asset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import {
  AvailablePoolTypeOptions,
  PoolTypeOption,
} from 'src/app/_const/pool-type-options';
import { CurrencyService } from 'src/app/_services/currency.service';
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
  @Input() poolTypeOptions: AvailablePoolTypeOptions;
  @Output() selectPoolType: EventEmitter<PoolTypeOption>;

  _poolType: PoolTypeOption;
  rune: Asset = new Asset('THOR.RUNE');
  currency: Currency;

  constructor(
    private router: Router,
    private currencyService: CurrencyService
  ) {
    this.selectPoolType = new EventEmitter<PoolTypeOption>();

    this.currencyService.cur$.pipe(take(1)).subscribe((cur) => {
      this.currency = cur;
    });
  }

  ngOnInit() {
    this._poolType = this.selectedPoolType;
    console.log(this.assets);
  }

  choosenPoolType(poolType: PoolTypeOption) {
    this._poolType = poolType;
    this.submitPoolType();
  }

  submitPoolType() {
    this.selectPoolType.emit(this._poolType);
  }

  back() {
    this.router.navigate(['/', 'pool']);
  }
}
