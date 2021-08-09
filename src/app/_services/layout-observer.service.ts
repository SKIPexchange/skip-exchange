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
          console.log(result);
          // eslint-disable-next-line prettier/prettier
          if (result.breakpoints[query] && query === Breakpoints.XSmall) {
            this.isMobileSource.next(true);
          } else if (result.breakpoints[query]) {
            this.isMobileSource.next(false);
          }
        }
      });
  }
}
