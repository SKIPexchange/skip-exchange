import { Injectable } from '@angular/core';
import { TranslateService as NgxTranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})
export class TranslateService {
  public intl;

  constructor(public ngxTranslate: NgxTranslateService) {
    this.ngxTranslate
      .getTranslation(this.ngxTranslate.currentLang)
      .subscribe((res) => {
        this.intl = res;
      });

    this.ngxTranslate.onLangChange.subscribe((event) => {
      this.intl = event.translations;
    });
  }

  format(val: string, params?: Object) {
    let intlString = val
      .split('.')
      .reduce((p, c) => (p && p[c]) || null, this.intl);
    const regex = /{{.*?}}/g;
    intlString.match(regex)?.forEach((match): void => {
      intlString =
        intlString.replace(match, params[match.replace(/[{}]/g, '')]) ??
        intlString;
    });
    return intlString;
  }
}
