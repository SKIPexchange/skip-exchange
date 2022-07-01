import { Component, OnInit } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { Network } from '@xchainjs/xchain-client';
import { filter } from 'rxjs/operators';
import { Asset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { User } from 'src/app/_classes/user';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { UserService } from 'src/app/_services/user.service';
import { environment } from 'src/environments/environment';

type MenuData = {
  text: string;
  click: Function;
  icon: {
    default: string;
    active: string;
    disconnected?: string;
  };
  disconnected: boolean;
};

@Component({
  selector: 'app-footer-menu',
  templateUrl: './footer-menu.component.html',
  styleUrls: ['./footer-menu.component.scss'],
})
export class FooterMenuComponent implements OnInit {
  user: User;
  menus: MenuData[];
  icons: any;
  walletAddress: string = 'thor***...******';
  active: string;
  isTestnet: boolean;
  nonNativeRuneAssets: AssetAndBalance[];
  hasRune: boolean = false;

  constructor(
    private userService: UserService,
    private oveService: OverlaysService,
    private router: Router
  ) {
    this.isTestnet = environment.network === Network.Testnet;
    this.userService.user$.subscribe((res) => {
      this.user = res;
      if (this.user) {
        const walletLen = this.user.wallet.length;
        this.walletAddress =
          this.user.wallet.substr(0, 7) +
          '...' +
          this.user.wallet.substr(walletLen - 6, walletLen);
      }
    });

    this.userService.userBalances$.subscribe((balances) => {
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

        if (this.nonNativeRuneAssets && this.nonNativeRuneAssets.length > 0) {
          this.hasRune = true;
        }
      } else {
        this.nonNativeRuneAssets = [];
        this.hasRune = false;
      }
    });

    this.oveService.currentView.subscribe((mainView) => {
      if (mainView === MainViewsEnum.UserSetting) {
        this.active = 'wallet';
      } else if (mainView === MainViewsEnum.AccountSetting) {
        this.active = 'settings';
      } else if (mainView === MainViewsEnum.Upgrade) {
        this.active = 'upgrade';
      } else if (mainView === MainViewsEnum.Transaction) {
        this.active = 'transactions';
      } else if (mainView === MainViewsEnum.Swap) {
        this.active = this.router.url.split('/')[1];
      }
    });

    this.router.events
      .pipe(filter((event) => event instanceof NavigationStart))
      .subscribe((event: NavigationStart) => {
        this.active = event.url.split('/')[1];
      });

    this.icons = {
      swap: {
        icon: {
          default: '/assets/icons/swap.svg',
          active: this.isTestnet
            ? '/assets/icons/swap-active-testnet.svg'
            : '/assets/icons/swap-active.svg',
        },
      },
      pool: {
        icon: {
          default: '/assets/icons/pool.svg',
          active: this.isTestnet
            ? '/assets/icons/pool-active-testnet.svg'
            : '/assets/icons/pool-active.svg',
        },
      },
      wallet: {
        icon: {
          default: '/assets/icons/wallet.svg',
          active: this.isTestnet
            ? '/assets/icons/wallet-active-testnet.svg'
            : '/assets/icons/wallet-active.svg',
          disconnected: '/assets/icons/wallet-disconnected.svg',
        },
      },
      upgrade: {
        icon: {
          default: '/assets/icons/upgrade.svg',
          active: '/assets/icons/upgrade-active.svg',
          disconnected: '/assets/icons/upgrade-disconnected.svg',
        },
      },
      transactions: {
        icon: {
          default: '/assets/icons/transactions.svg',
          active: this.isTestnet
            ? '/assets/icons/transactions-active-testnet.svg'
            : '/assets/icons/transactions-active.svg',
          disconnected: '/assets/icons/transactions-disconnected.svg',
        },
      },
      settings: {
        icon: {
          default: '/assets/icons/settings.svg',
          active: this.isTestnet
            ? '/assets/icons/settings-active-testnet.svg'
            : '/assets/icons/settings-active.svg',
          disconnected: '/assets/icons/settings-disconnected.svg',
        },
      },
    };
  }

  getIcon(
    iconName: string,
    active: boolean = false,
    available: boolean = true
  ) {
    let icon = this.icons[iconName].icon;

    if (active) {
      return icon.active;
    }

    if (!this.user || !available) {
      return icon.disconnected ?? icon.default;
    }

    return icon.default;
  }

  isPoolPage() {
    return (
      this.active === 'pool' ||
      this.active === 'deposit' ||
      this.active === 'withdraw'
    );
  }

  wallet() {
    if (this.user) {
      this.oveService.setCurrentView(MainViewsEnum.UserSetting);
    }
  }

  tranasactions() {
    if (this.user) {
      this.oveService.setCurrentView(MainViewsEnum.Transaction);
    }
  }

  settings() {
    if (this.user) {
      this.oveService.setCurrentView(MainViewsEnum.AccountSetting);
    }
  }

  swap() {
    this.oveService.setCurrentView(MainViewsEnum.Swap);
    this.oveService.setCurrentSwapView('Swap');
    this.router.navigate(['/', 'swap']);
  }

  pool() {
    this.oveService.setCurrentView(MainViewsEnum.Swap);
    this.oveService.setCurrentPoolView('Pool');
    this.router.navigate(['/', 'pool']);
  }

  upgrade() {
    if (this.hasRune) {
      this.oveService.setCurrentView(MainViewsEnum.Upgrade);
    }
  }

  ngOnInit(): void {}
}
