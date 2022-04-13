import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { currenciesName } from 'src/app/_const/currencies';
import { AnalyticsService } from 'src/app/_services/analytics.service';
import { CurrencyService } from 'src/app/_services/currency.service';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';

export interface Currency {
  symbol: string;
  name: string;
  value: number;
  code?: string;
}

@Component({
  selector: 'app-currency-converter',
  templateUrl: './currency-converter.component.html',
  styleUrls: ['./currency-converter.component.scss'],
})
export class CurrencyConverterComponent implements OnInit {
  subs: Subscription[];
  currencies: Currency[];
  @Output() close: EventEmitter<null> = new EventEmitter<null>();
  activeIndex: number;
  message: string;
  currency: Currency;
  isMobile: boolean;

  /** Search feature for currency list */
  get searchTerm(): string {
    return this._searchTerm;
  }
  set searchTerm(term: string) {
    this._searchTerm = term;

    if (term && term.length > 0) {
      this.filterdCurrencies = this.currencies.filter((item) => {
        const search = term.toUpperCase();
        return (
          item.code.toUpperCase().includes(search) ||
          item.name.toUpperCase().includes(search)
        );
      });
    } else {
      this.filterdCurrencies = this.currencies;
    }
  }
  _searchTerm: string;
  filterdCurrencies: Currency[];

  constructor(
    private currencyService: CurrencyService,
    private overlaysService: OverlaysService,
    private analytics: AnalyticsService,
    private layout: LayoutObserverService
  ) {
    this.currencies = [] as Currency[];

    currencyService.cur$.pipe(take(1)).subscribe((cur) => {
      this.currency = cur;
    });

    const cur$ = currencyService.getDailyCurrencyValue().subscribe((curs) => {
      let usdBased = curs['usd'];
      for (const key in usdBased) {
        if (currenciesName[key.toUpperCase()]) {
          this.currencies.push({
            symbol: currenciesName[key.toUpperCase()]['symbol'],
            name: currenciesName[key.toUpperCase()]['name'],
            code: currenciesName[key.toUpperCase()]['code'],
            value: parseFloat(usdBased[key]),
          });
        }
      }
    });

    const layout$ = layout.isMobile.subscribe((res) => {
      this.isMobile = res;
    });

    this.subs = [cur$, layout$];
  }

  ngOnInit(): void {
    this.message = 'breadcurmb.select';

    this.filterdCurrencies = this.currencies;
  }

  breadcrumbNav(val: string) {
    if (val === 'swap') {
      this.analytics.event('setting_conversion_currency', 'breadcrumb_skip');
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    } else if (val === 'settings') {
      this.analytics.event(
        'setting_conversion_currency',
        'breadcrumb_settings'
      );
      this.close.emit();
    }
  }

  saveCurrency() {
    this.analytics.event(
      'setting_conversion_currency',
      'button_save_*OLD_CURRENCY_CODE*_*NEW_CURRENCY_CODE*',
      undefined,
      this.currency.code,
      this.currencies[this.activeIndex].code
    );
    this.currencyService.setActiveCurrency(
      this.filterdCurrencies[this.activeIndex]
    );
    localStorage.setItem(
      `active_currency`,
      JSON.stringify(this.filterdCurrencies[this.activeIndex])
    );
    this.message = 'breadcrumb.saved';
    this.close.emit();
  }

  closeNav() {
    this.analytics.event('setting_conversion_currency', 'button_close');
    this.close.emit();
  }

  ngOnDestroy(): void {
    this.subs.forEach((sub) => {
      sub.unsubscribe();
    });
  }
}
