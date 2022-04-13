import { Component, OnDestroy, OnInit } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Subject, timer, of, Subscription, combineLatest } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';
import { LastBlock } from 'src/app/_classes/last-block';
import { LastBlockService } from 'src/app/_services/last-block.service';
import {
  MidgardService,
  MimirResponse,
} from 'src/app/_services/midgard.service';
import { OverlaysService, MainViewsEnum } from './_services/overlays.service';
import { UserService } from './_services/user.service';
import { Chain } from '@xchainjs/xchain-util';
import { AssetAndBalance } from './_classes/asset-and-balance';
import { Asset } from './_classes/asset';
import { environment } from 'src/environments/environment';
import { links } from 'src/app/_const/links';
import { Router } from '@angular/router';
import { NetworkSummary } from './_classes/network';
import { AnalyticsService } from './_services/analytics.service';
import { User } from './_classes/user';
import { MetamaskService } from './_services/metamask.service';
import { HttpErrorResponse } from '@angular/common/http';
import { LayoutObserverService } from './_services/layout-observer.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  killPolling: Subject<void> = new Subject();
  killMidgard: Subject<void> = new Subject();
  subs: Subscription[];
  isTestnet: boolean;
  showSwap: boolean;
  _showUserSetting: boolean;
  _showReconnect: boolean;
  keystore: any;

  currentView: MainViewsEnum;
  currentViewType = MainViewsEnum;

  chainBalanceErrors: Chain[];
  nonNativeRuneAssets: AssetAndBalance[];
  appLocked: boolean;
  mainnetUrl: string;
  user: User;
  isMobile: boolean = false;
  screenHeight: string;

  constructor(
    private midgardService: MidgardService,
    private lastBlockService: LastBlockService,
    private overlaysService: OverlaysService,
    private router: Router,
    private analytics: AnalyticsService,
    private metaMaskService: MetamaskService,
    private userService: UserService,
    private layout: LayoutObserverService,
    translate: TranslateService
  ) {
    this.layout.isMobile.subscribe((res) => (this.isMobile = res));

    this.isTestnet = environment.network === 'testnet';
    this.mainnetUrl = this.isTestnet ? links.mainnetUrl : links.testnetUrl;
    this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    const overlay$ = this.overlaysService.currentView.subscribe((val) => {
      this.currentView = val;
    });

    this.appLocked = environment.appLocked ?? false;

    const chainBalanceErrors$ = this.userService.chainBalanceErrors$.subscribe(
      (chains) => (this.chainBalanceErrors = chains)
    );

    this.nonNativeRuneAssets = [];

    const balances$ = this.userService.userBalances$.subscribe((balances) => {
      if (balances) {
        const nonNativeRuneAssets = balances
          // get ETH.RUNE and BNB.RUNE
          .filter((balance) => {
            return (
              (balance.asset.chain === 'BNB' &&
                balance.asset.ticker === 'RUNE') ||
              (balance.asset.chain === 'ETH' && balance.asset.ticker === 'RUNE')
            );
          })
          // filter out 0 amounts
          .filter((balance) => balance.amount.amount().isGreaterThan(0))
          // create Asset
          .map((balance) => ({
            asset: new Asset(`${balance.asset.chain}.${balance.asset.symbol}`),
          }));

        this.nonNativeRuneAssets = this.userService.sortMarketsByUserBalance(
          balances,
          nonNativeRuneAssets
        );
      } else {
        this.nonNativeRuneAssets = [];
      }
    });

    const user$ = this.userService.user$.subscribe(
      (user) => (this.user = user)
    );

    const metaMaskProvider$ = this.metaMaskService.provider$.subscribe(
      async (_metaMaskProvider) => {
        if (_metaMaskProvider && this.user && this.user.type === 'metamask') {
          const accounts = await _metaMaskProvider.listAccounts();
          if (accounts.length > 0 && this.user) {
            const signer = _metaMaskProvider.getSigner();
            const address = await signer.getAddress();
            const user = new User({
              type: 'metamask',
              wallet: address,
            });
            this.userService.setUser(user);
          }
        } else {
          console.log('metamask provider is null');
        }
      }
    );

    this.subs = [chainBalanceErrors$, balances$, user$, metaMaskProvider$];
  }

  async ngOnInit(): Promise<void> {
    this.pollLastBlock();
    this.pollCap();

    const keystoreString = localStorage.getItem('keystore');
    const XDEFIConnected = localStorage.getItem('XDEFI_CONNECTED');
    const lastLoginType = this.userService.getLastLoginType();

    const keystore = JSON.parse(keystoreString);
    if (keystore && lastLoginType === 'keystore') {
      this.openReconnectDialog(keystore);
    } else if (XDEFIConnected && lastLoginType === 'XDEFI') {
      this.openReconnectXDEFIDialog();
    }

    if (this.isTestnet) {
      document.documentElement.style.setProperty(
        '--primary-default',
        '#F3BA2F'
      );
      document.documentElement.style.setProperty(
        '--primary-graident-bottom-left',
        '#F3BA2F'
      );
      document.documentElement.style.setProperty(
        '--primary-graident-top-right',
        '#F3BA2F'
      );
    }

    if (this.appLocked) {
      this.router.navigate(['/', 'swap']);
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    }

    document.addEventListener('mousedown', (e) => {
      if (
        document.querySelector('.expandable') &&
        (e.target as HTMLTextAreaElement).compareDocumentPosition(
          document.querySelector('.expandable')
        ) !== 10
      ) {
        if (this.overlaysService.getMenu()) {
          this.analytics.event('menu', 'menu_close');
        }
        this.overlaysService.setMenu(false);
      }
    });

    this.setHeight();
    console.log('set height', this.screenHeight);
    window.addEventListener('resize', () => {
      this.setHeight('height-container');
      console.log('resized', this.screenHeight);
    });
  }

  setHeight(id?: string) {
    this.screenHeight = `${window.innerHeight - 2}px`;
    const styles = `.isMobile main .container-wrapper { min-height: ${
      this.screenHeight
    }; } .isMobile main .overlay-container-wrapper { min-height: ${
      this.screenHeight
    }; } .isMobile main .container-wrapper .container .main-content { height: ${
      window.innerHeight - 218.25
    }px; } .isMobile main .container-wrapper .container .long-content { height: ${
      window.innerHeight - 151.25
    }px; } `;
    if (id) {
      let styleSheet = document.getElementById(id);
      styleSheet.innerText = styles;
    } else {
      let styleSheet = document.createElement('style');
      styleSheet.setAttribute('id', 'height-container');
      styleSheet.innerText = styles;
      document.head.appendChild(styleSheet);
    }
  }

  openReconnectDialog(keystore?) {
    this.keystore = keystore;
    this.overlaysService.setCurrentView(MainViewsEnum.Reconnect);
  }

  eventFooterClick(label: string) {
    this.analytics.event('footer', label);
  }

  notificationsExist(): boolean {
    return (
      (this.nonNativeRuneAssets && this.nonNativeRuneAssets.length > 0) ||
      (this.chainBalanceErrors && this.chainBalanceErrors.length > 0)
    );
  }

  openReconnectXDEFIDialog() {
    this.overlaysService.setCurrentView(MainViewsEnum.ReconnectXDEFI);
    // this.dialog.open(
    //   ReconnectXDEFIDialogComponent,
    //   {
    //     maxWidth: '420px',
    //     width: '50vw',
    //     minWidth: '260px',
    //   }
    // );
  }

  pollLastBlock(): void {
    const refreshInterval$ = timer(0, 15000)
      .pipe(
        // This kills the request if the user closes the component
        takeUntil(this.killPolling),
        // switchMap cancels the last request, if no response have been received since last tick
        switchMap(() => this.midgardService.getLastBlock()),
        // catchError handles http throws
        catchError((error) => of(error))
      )
      .subscribe(async (res: LastBlock[]) => {
        if (res.length > 0) {
          this.lastBlockService.setBlock(res[0].thorchain);
        }
      });
    this.subs.push(refreshInterval$);
  }

  pollCap(): void {
    const mimirInterval$ = timer(0, 15000)
      .pipe(
        // This kills the request if the user closes the component
        takeUntil(this.killMidgard)
      )
      .subscribe(async () => {
        this.midgardService
          .updateMimir()
          .toPromise()
          .then(
            (res: MimirResponse) => {
              this.midgardService.setMimir(res);
            },
            (error: HttpErrorResponse) => {
              this.midgardService.setMimir(error);
            }
          );
      });
    const networkInterval$ = timer(0, 15000)
      .pipe(
        // This kills the request if the user closes the component
        takeUntil(this.killMidgard)
      )
      .subscribe(async () => {
        this.midgardService
          .getNetwork()
          .toPromise()
          .then(
            (res: NetworkSummary) => {
              this.midgardService.setNetwork(res);
            },
            (error: HttpErrorResponse) => {
              this.midgardService.setNetwork(error);
            }
          );
      });
    this.subs.push(mimirInterval$, networkInterval$);
  }

  ngOnDestroy(): void {
    this.killPolling.next();
    this.killMidgard.next();
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
