import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LayoutObserverService {
  private isMobileSource = new BehaviorSubject<boolean>(false);
  isMobile = this.isMobileSource.asObservable();

  displayNameMap = new Map([
    [Breakpoints.XSmall, 'XSmall'],
    [Breakpoints.Small, 'Small'],
    [Breakpoints.Medium, 'Medium'],
    [Breakpoints.Large, 'Large'],
    [Breakpoints.XLarge, 'XLarge'],
  ]);

  constructor(private breakpointObserver: BreakpointObserver) {
    this.breakpointObserver
      // eslint-disable-next-line prettier/prettier
      .observe([Breakpoints.XSmall, Breakpoints.Small, Breakpoints.Medium, Breakpoints.Large, Breakpoints.XLarge])
      .subscribe((result) => {
        for (const query of Object.keys(result.breakpoints)) {
          // eslint-disable-next-line prettier/prettier
          if (result.breakpoints[query] && query === Breakpoints.XSmall && window.screen.availWidth <= 576) {
            this.isMobileSource.next(true);
            let meta = document.head.querySelector('meta[name="viewport"]');
            // eslint-disable-next-line prettier/prettier
            meta.setAttribute('content', 'width=428,maximum-scale=1,user-scalable=0,viewport-fit=cover');
          } else if (result.breakpoints[query]) {
            this.isMobileSource.next(false);
            let meta = document.head.querySelector('meta[name="viewport"]');
            meta.setAttribute('content', 'width=device-width');
          }
        }
      });
  }
}
